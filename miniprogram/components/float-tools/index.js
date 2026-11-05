/* 右下角：男女声、主题。左下角：重播、暂停。
   两类都跟着页面滚动常驻。 */

const theme = require('../../utils/theme')

Component({
  properties: {
    voice: { type: String, value: '' },
    playing: { type: Boolean, value: false },
    active: { type: Boolean, value: false },
    paused: { type: Boolean, value: false },
    all: { type: Boolean, value: false },
    allOn: { type: Boolean, value: false },
  },

  data: {
    themes: theme.THEMES,
    theme: theme.current(),
    open: false,
  },

  methods: {
    sync() {
      this.setData({ theme: theme.current() })
    },

    setVoice(e) {
      this.triggerEvent('voice', { voice: e.currentTarget.dataset.v })
    },

    toggleAll() {
      this.triggerEvent('toggleall')
    },

    replay() {
      this.triggerEvent('replay')
    },

    pause() {
      this.triggerEvent('pause')
    },

    togglePanel() {
      this.setData({ open: !this.data.open })
    },

    pick(e) {
      const id = e.currentTarget.dataset.id
      theme.set(id)
      this.setData({ theme: id, open: false })
      this.triggerEvent('theme', { theme: id })
    },
  },
})
