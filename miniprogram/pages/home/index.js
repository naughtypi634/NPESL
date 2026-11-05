const { nav } = require('../../utils/statusbar')
const theme = require('../../utils/theme')

Page({
  onShow() {
    const t = theme.current()
    if (t !== this.data.theme) this.setData({ theme: t })
    theme.syncWindow(t)
  },

  onTheme(e) {
    this.setData({ theme: e.detail.theme })
  },

  onShareAppMessage() {
    return { title: 'NPESL 发音练习', path: '/pages/home/index' }
  },

  onShareTimeline() {
    return { title: 'NPESL 发音练习' }
  },

  data: {
    nav: nav(),
    topPad: nav().bottom + 12,
    theme: theme.current(),
  },
})
