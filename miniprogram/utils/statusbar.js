/* 顶部安全区。自定义导航栏要自己让出状态栏，并且让「返回」和微信右上角胶囊
   在同一条水平线上——胶囊的实际位置用 wx.getMenuButtonBoundingClientRect 拿，
   比按 44px 猜准确，iOS 和 Android 都对得上。 */

function statusBar() {
  const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
  return (info && info.statusBarHeight) || 20
}

function nav() {
  const sb = statusBar()
  try {
    const rect = wx.getMenuButtonBoundingClientRect()
    if (rect && rect.height) {
      return { top: rect.top, height: rect.height, bottom: rect.bottom }
    }
  } catch (e) {
    /* 拿不到就退回估算值 */
  }
  const top = sb + 6
  return { top, height: 32, bottom: top + 32 }
}

module.exports = { statusBar, nav }
