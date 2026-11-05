/* 主题：明亮 / 暗黑 / Glass / Brutalist / Editorial。
   颜色写在 app.wxss 的 theme-* 类里，这里只管「选哪个、记住、通知窗口」。 */

const THEMES = [
  { id: 'bright', label: '明亮', bg: '#ffffff' },
  { id: 'dark', label: '暗黑', bg: '#000000' },
  { id: 'glass', label: 'Glass', bg: '#0e1418' },
  { id: 'brutal', label: 'Brutalist', bg: '#f2ecdf' },
  { id: 'editorial', label: 'Editorial', bg: '#f6f5f1' },
]

const DEFAULT = 'glass'

function current() {
  const saved = wx.getStorageSync('npesl_theme')
  return THEMES.some((t) => t.id === saved) ? saved : DEFAULT
}

function background(id) {
  const hit = THEMES.filter((t) => t.id === id)[0]
  return (hit || THEMES[2]).bg
}

function set(id) {
  if (!THEMES.some((t) => t.id === id)) return
  wx.setStorageSync('npesl_theme', id)
  syncWindow(id)
}

/** 窗口背景（下拉回弹露出的一块）跟着主题走。 */
function syncWindow(id) {
  if (!wx.setBackgroundColor) return
  wx.setBackgroundColor({
    backgroundColor: background(id),
    backgroundColorTop: background(id),
    backgroundColorBottom: background(id),
  })
}

module.exports = { THEMES, current, set, background, syncWindow }
