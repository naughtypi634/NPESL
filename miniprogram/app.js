const { CLOUD_ENV } = require('./config')

App({
  globalData: {
    audioUrls: {},
  },

  onLaunch() {
    if (wx.cloud && CLOUD_ENV) {
      wx.cloud.init({ env: CLOUD_ENV, traceUser: false })
    }
    // 静音键不影响点读；iPhone 强制走外放而不是听筒。
    if (wx.setInnerAudioOption) {
      wx.setInnerAudioOption({
        obeyMuteSwitch: false,
        mixWithOther: true,
        speakerOn: true,
      })
    }
  },
})
