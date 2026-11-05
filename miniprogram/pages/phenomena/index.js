const data = require('../../data/phenomena')
const { nav } = require('../../utils/statusbar')
const theme = require('../../utils/theme')

const chips = [{ id: 'all', label: '全部' }].concat(
  data.groups.map((group) => ({ id: group.title, label: group.title }))
)

Page({
  data: {
    groups: data.groups,
    chips,
    filter: 'all',
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
    return { title: '常见发音现象', path: '/pages/phenomena/index' }
  },

  onShareTimeline() {
    return { title: '常见发音现象' }
  },

  goBack() {
    wx.navigateBack()
  },

  setFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.id })
  },

  open(e) {
    const num = e.currentTarget.dataset.num
    wx.navigateTo({ url: `/pages/phenomena/chapter/index?num=${num}` })
  },
})
