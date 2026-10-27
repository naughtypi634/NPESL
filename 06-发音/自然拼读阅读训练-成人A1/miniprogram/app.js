const config = require('./config');

App({
  onLaunch() {
    if (!wx.cloud) return;
    const options = { traceUser: false };
    if (config.cloudEnv) options.env = config.cloudEnv;
    try {
      wx.cloud.init(options);
    } catch (err) {
      // 云开发没开通时忽略：Question Drill 仍可用，只是不显示发音按钮。
    }
  }
});
