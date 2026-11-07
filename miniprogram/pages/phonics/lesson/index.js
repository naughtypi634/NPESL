const data = require('../../../data/phonics')
const sprite = require('../../../utils/sprite')
const { nav } = require('../../../utils/statusbar')
const theme = require('../../../utils/theme')

Page({
  data: {
    lesson: null,
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
    const lesson = data.lessons.filter((item) => item.num === num)[0]
    const found = lesson || null
    this.setData({
      lesson: found,
      voice: wx.getStorageSync('npesl_voice') === 'm' ? 'm' : 'f',
    })
    if (found) {
      sprite.prefetch([
        { app: 'phonics', name: found.sprite.f },
        { app: 'phonics', name: found.sprite.m },
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
    const lesson = this.data.lesson
    return {
      title: lesson ? `${lesson.en} · 自然拼读` : '自然拼读练习',
      path: '/pages/phonics/lesson/index?num=' + (lesson ? lesson.num : 1),
    }
  },

  onShareTimeline() {
    const lesson = this.data.lesson
    return {
      title: lesson ? `${lesson.en} · 自然拼读` : '自然拼读练习',
      query: 'num=' + (lesson ? lesson.num : 1),
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
    if (this.last === undefined) return
    this.startSentence(this.last)
  },

  onToggleAll() {
    if (this.data.allOn) {
      sprite.stop()
      this.setData({ allOn: false, playing: '', paused: false })
    } else {
      sprite.stop()
      this.setData({ allOn: true, paused: false })
      this.playSentenceAt(0)
    }
  },

  playSentence(e) {
    this.startSentence(Number(e.currentTarget.dataset.si))
  },

  startSentence(si) {
    this.setData({ allOn: false })
    this.playSentenceAt(si)
  },

  playSentenceAt(si) {
    const sentences = this.data.lesson.sentences
    if (si >= sentences.length) {
      this.setData({ allOn: false, playing: '', paused: false })
      return
    }
    const sentence = sentences[si]
    const voice = this.data.voice
    this.last = si
    sprite.play('phonics', this.data.lesson.sprite[voice], sentence[voice], {
      done: () => {
        if (this.data.allOn) {
          this.playSentenceAt(si + 1)
        } else {
          this.setData({ playing: '', paused: false })
        }
      },
    })
    this.setData({ hasPlay: true, playing: 's' + si, paused: false })
  },
})
