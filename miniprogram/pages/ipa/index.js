const data = require('../../data/ipa')
const sprite = require('../../utils/sprite')
const { nav } = require('../../utils/statusbar')
const theme = require('../../utils/theme')

Page({
  data: {
    groups: data.groups,
    voice: 'f',
    playing: '',
    paused: false,
    hasPlay: false,
    nav: nav(),
    topPad: nav().bottom + 12,
    jumpTop: nav().bottom + 8,
    theme: theme.current(),
  },

  onShow() {
    const t = theme.current()
    if (t !== this.data.theme) this.setData({ theme: t })
    theme.syncWindow(t)
  },

  onLoad() {
    this.setData({ voice: wx.getStorageSync('npesl_voice') === 'm' ? 'm' : 'f' })
  },

  onUnload() {
    sprite.stop()
  },

  goBack() {
    wx.navigateBack()
  },

  onVoice(e) {
    const voice = e.detail.voice
    wx.setStorageSync('npesl_voice', voice)
    sprite.stop()
    this.setData({ voice, playing: '', paused: false })
  },

  onTheme(e) {
    this.setData({ theme: e.detail.theme })
  },

  onShareAppMessage() {
    return { title: '美式英语音标表', path: '/pages/ipa/index' }
  },

  onShareTimeline() {
    return { title: '美式英语音标表' }
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
    this.startWord(this.last)
  },

  jump(e) {
    const id = e.currentTarget.dataset.id
    const query = wx.createSelectorQuery()
    query.select('#g-' + id).boundingClientRect()
    query.selectViewport().scrollOffset()
    query.exec((res) => {
      const rect = res[0]
      const view = res[1]
      if (!rect || !view) return
      wx.pageScrollTo({
        scrollTop: rect.top + view.scrollTop - this.data.jumpTop - 44,
        duration: 200,
      })
    })
  },

  onWord(e) {
    const { gi, pi, ci, wi } = e.currentTarget.dataset
    this.startWord({ gi: Number(gi), pi: Number(pi), ci: Number(ci), wi: Number(wi) })
  },

  startWord(pos) {
    const card = this.data.groups[pos.gi].pairs[pos.pi].cards[pos.ci]
    const word = card.words[pos.wi]
    const key = `${pos.gi}-${pos.pi}-${pos.ci}-${pos.wi}`
    const voice = this.data.voice
    this.last = pos

    sprite.play('ipa', card.sprite[voice], word[voice], {
      done: () => {
        if (this.data.playing === key) this.setData({ playing: '', paused: false })
      },
    })
    this.setData({ hasPlay: true, playing: key, paused: false })
  },
})
