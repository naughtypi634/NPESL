/* 云存储里的 sprite 播放器。

   三个应用都是「一条 mp3 装一整页/一整课」的 sprite，播放时按起止秒数截一段。
   InnerAudioContext 的 startTime 只在新建实例时可靠生效——同一个实例换片段播放
   会从上一次的位置接着走（点到第二句还是第一句的声音），所以每次播放都新建
   一个实例，播完销毁。

   取音频走 wx.cloud.downloadFile 下载到本地临时文件再播：临时 HTTPS 地址在真机上
   要过 downloadFile 合法域名校验（开发者工具默认不校验，所以模拟器有声、手机没声）；
   cloud:// 直接当 src 又依赖基础库版本。

   收尾同时看两路信号：播放器实际进度（iOS 的 currentTime 跟着 timeupdate 走，
   约 250ms 一跳，只靠它会拖出尾巴）和从 onPlay（真正出声）起算的时长。 */

const { CLOUD_ENV, CLOUD_BUCKET } = require('../config')

let audio = null
let timer = null
let run = 0
let session = null

const local = {} // fileID -> 本地临时路径
const pending = {} // fileID -> 等下载完成的回调

function fileId(app, name) {
  return `cloud://${CLOUD_ENV}.${CLOUD_BUCKET}/audio/${app}/${name}`
}

function kill(player) {
  try {
    player.stop()
  } catch (e) {
    /* 没加载过就 stop 会报错，忽略 */
  }
  try {
    player.destroy()
  } catch (e) {
    /* 忽略 */
  }
  if (audio === player) audio = null
}

function clearTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function stop() {
  run += 1
  clearTimer()
  session = null
  if (audio) kill(audio)
}

/** 下载一次、缓存本地路径；同一文件并发点击只下载一次。 */
function ensure(id, cb, onFail) {
  if (local[id]) {
    cb(local[id])
    return
  }
  if (pending[id]) {
    pending[id].push(cb)
    return
  }
  pending[id] = [cb]
  wx.cloud.downloadFile({
    fileID: id,
    success(res) {
      const queue = pending[id] || []
      delete pending[id]
      local[id] = res.tempFilePath
      queue.forEach((fn) => fn(res.tempFilePath))
    },
    fail(err) {
      delete pending[id]
      console.error('[audio] download', id, err && err.errMsg)
      if (onFail) onFail(err)
    },
  })
}

/** 页面进入时预热（只传这一页会用到的 sprite）。 */
function prefetch(items) {
  items.forEach((item) => ensure(fileId(item.app, item.name), () => {}))
}

function watch(s) {
  const spanMs = ((s.end - s.begin) / s.rate) * 1000
  clearTimer()
  timer = setInterval(() => {
    if (session !== s || s.run !== run) return
    const byPos = s.player.currentTime >= s.end - 0.02
    const byClock = s.startedAt && Date.now() - s.startedAt >= spanMs + 80
    if (byPos || byClock || Date.now() - s.createdAt > spanMs + 1500) {
      clearTimer()
      const done = s.done
      session = null
      kill(s.player)
      if (done) done()
    }
  }, 20)
}

/**
 * 播放 sprite 的一段。
 * @param {string} app    ipa | phonics | phenomena
 * @param {string} name   sprite 文件名
 * @param {number[]} span [start, end] 秒
 * @param {{rate?:number, done?:Function}} opts
 */
function play(app, name, span, opts) {
  const options = opts || {}
  const rate = options.rate || 1
  // 起播比时间轴早 120ms：seek 是异步的，设完位置立刻 play 时跳转可能还没落地，
  // 句子开头会被吃掉一个字。网页端拼读课就是这么做的（LEAD = 0.12）。
  // 音标是单词行，前后紧挨着，提前起播会把上一个词的尾声带出来，所以不提前。
  const lead = app === 'ipa' ? 0 : 0.12
  const begin = Math.max(0, span[0] - lead)
  const end = Math.max(span[1], span[0] + 0.05)

  stop()
  const mine = run

  ensure(
    fileId(app, name),
    (path) => {
      if (mine !== run) return

      const player = wx.createInnerAudioContext()
      audio = player
      const s = {
        player,
        run: mine,
        begin,
        end,
        rate,
        done: options.done,
        createdAt: Date.now(),
        startedAt: 0,
        elapsed: 0,
        paused: false,
      }
      session = s

      player.obeyMuteSwitch = false
      player.startTime = begin
      player.playbackRate = rate
      player.src = path
      player.play()
      player.onPlay(() => {
        if (session === s && !s.startedAt) s.startedAt = Date.now() - s.elapsed
      })
      watch(s)
    },
    () => wx.showToast({ title: '音频加载失败', icon: 'none' })
  )
}

/** 暂停当前播放，保留位置。 */
function pause() {
  if (!session || session.paused) return false
  if (session.startedAt) session.elapsed = Date.now() - session.startedAt
  session.player.pause()
  session.paused = true
  clearTimer()
  return true
}

/** 从暂停处继续。 */
function resume() {
  if (!session || !session.paused) return false
  session.player.play()
  session.paused = false
  session.startedAt = Date.now() - session.elapsed
  watch(session)
  return true
}

function isPaused() {
  return !!(session && session.paused)
}

module.exports = { play, stop, pause, resume, isPaused, prefetch }
