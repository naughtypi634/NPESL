const data = require('../../data/phonics')
const { nav } = require('../../utils/statusbar')
const theme = require('../../utils/theme')

const sections = data.groups.map((group) => ({
  title: group.title,
  lessons: data.lessons.filter((lesson) => lesson.group === group.title),
}))

Page({
  data: {
    sections,
    nav: nav(),
    topPad: nav().bottom + 12,
    theme: theme.current(),
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
    return { title: '自然拼读练习', path: '/pages/phonics/index' }
  },

  onShareTimeline() {
    return { title: '自然拼读练习' }
  },

  goBack() {
    wx.navigateBack()
  },

  open(e) {
    const num = e.currentTarget.dataset.num
    wx.navigateTo({ url: `/pages/phonics/lesson/index?num=${num}` })
  },
})
