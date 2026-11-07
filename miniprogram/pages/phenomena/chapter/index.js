const data = require('../../../data/phenomena')
const sprite = require('../../../utils/sprite')
const { nav } = require('../../../utils/statusbar')
const theme = require('../../../utils/theme')

Page({
  data: {
    chapter: null,
    voice: 'f',
    playing: '',
    paused: false,
    hasPlay: false,
    all: true,
    allOn: false,
    nav: nav(),
    topPad: nav().bottom + 12,
    theme: theme.current(),
  },

  onLoad(query) {
    const num = Number(query.num)
    const chapter = data.chapters.filter((item) => item.num === num)[0]
    const found = chapter || null
    this.setData({
      chapter: found,
      voice: wx.getStorageSync('npesl_voice') === 'm' ? 'm' : 'f',
    })
    if (found) {
      sprite.prefetch([
        { app: 'phenomena', name: found.sprite.f },
        { app: 'phenomena', name: found.sprite.m },
      ])
    }
  },

  onUnload() {
    sprite.stop()
  },

  onShow() {
    const t = theme.current()
    if (t !== this.data.theme) this.setData({ theme: t })
    theme.syncWindow(t)
  },

  onTheme(e) {
    this.setData({ theme: e.detail.theme })
  },

  onShareAppMessage() {
    const chapter = this.data.chapter
    return {
      title: chapter ? `${chapter.en} · 常见发音现象` : '常见发音现象',
      path: '/pages/phenomena/chapter/index?num=' + (chapter ? chapter.num : 1),
    }
  },

  onShareTimeline() {
    const chapter = this.data.chapter
    return {
      title: chapter ? `${chapter.en} · 常见发音现象` : '常见发音现象',
      query: 'num=' + (chapter ? chapter.num : 1),
    }
  },

  goBack() {
    wx.navigateBack()
  },

  onVoice(e) {
    const voice = e.detail.voice
    wx.setStorageSync('npesl_voice', voice)
    sprite.stop()
    this.setData({ voice, playing: '', paused: false, allOn: false })
  },


  onPause() {
    if (!this.data.playing) return
    if (this.data.paused) {
      sprite.resume()
      this.setData({ paused: false })
    } else if (sprite.pause()) {
      this.setData({ paused: true })
    }
  },

  onReplay() {
    if (!this.last) return
    this.start(this.last.kind, this.last.i)
  },

  onToggleAll() {
    if (this.data.allOn) {
      sprite.stop()
      this.setData({ allOn: false, playing: '', paused: false })
    } else {
      sprite.stop()
      this.setData({ allOn: true, paused: false })
      this.playLineAt(0)
    }
  },

  play(e) {
    this.start(e.currentTarget.dataset.kind, Number(e.currentTarget.dataset.i))
  },

  start(kind, i) {
    this.setData({ allOn: false })
    this.playItem(kind, i)
  },

  playLineAt(i) {
    this.playItem('line', i)
  },

  playItem(kind, i) {
    const chapter = this.data.chapter
    const list = kind === 'target' ? chapter.targets : chapter.lines
    if (i >= list.length) {
      this.setData({ allOn: false, playing: '', paused: false })
      return
    }
    const item = list[i]
    const voice = this.data.voice
    const key = kind + i
    this.last = { kind, i }

    sprite.play('phenomena', chapter.sprite[voice], item[voice], {
      done: () => {
        if (this.data.allOn && kind === 'line') {
          this.playItem('line', i + 1)
        } else {
          this.setData({ playing: '', paused: false, allOn: false })
        }
      },
    })
    this.setData({ hasPlay: true, playing: key, paused: false })
  },
})
