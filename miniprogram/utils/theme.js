/* 主题：浅色 / 深色。材质是 coss ui（平、单色、细边）。
   颜色写在 app.wxss 的 theme-* 类里，这里只管「选哪个、记住、通知窗口」。 */

const THEMES = [
  { id: 'light', label: '浅色', bg: '#ffffff' },
  { id: 'dark', label: '深色', bg: '#141414' },
]

const DEFAULT = 'light'

/* 已下线的主题：老的 glass 是深色底，按深色处理，别让人莫名其妙变回浅色。 */
const LEGACY = { glass: 'dark', bright: 'light', brutal: 'light', editorial: 'light' }

function normalize(id) {
  return LEGACY[id] || id
}

function current() {
  const saved = normalize(wx.getStorageSync('npesl_theme'))
  return THEMES.some((t) => t.id === saved) ? saved : DEFAULT
}

function background(id) {
  const hit = THEMES.filter((t) => t.id === normalize(id))[0]
  // 没有 THEMES[2] 了：两项时那个下标是 undefined，会写出空背景。
  return (hit || THEMES[0]).bg
}

function set(id) {
  const next = normalize(id)
  if (!THEMES.some((t) => t.id === next)) return
  wx.setStorageSync('npesl_theme', next)
  syncWindow(next)
}

/** 窗口背景（下拉回弹露出的一块）跟着主题走。 */
function syncWindow(id) {
  if (!wx.setBackgroundColor) return
  wx.setBackgroundColor({
    backgroundColor: background(id),
    backgroundColorTop: background(id),
    backgroundColorBottom: background(id),
  })
  // 深色底要配浅色状态栏文字，否则胶囊和时间看不清。
  if (wx.setBackgroundTextStyle) {
    wx.setBackgroundTextStyle({
      textStyle: normalize(id) === 'dark' ? 'light' : 'dark',
    })
  }
}

module.exports = { THEMES, current, set, background, syncWindow }
