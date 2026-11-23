export type Theme = 'light' | 'dark';

const KEY = 'npesl-theme';

/** 站点全局偏好：浅色/深色。老的 glass 是深色底，归到深色。 */
export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === 'dark' || saved === 'glass' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* 存不下也不影响当前页面 */
  }
}
