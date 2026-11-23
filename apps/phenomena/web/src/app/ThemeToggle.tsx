import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

import { applyTheme, readTheme, type Theme } from '../lib/theme';

/** 右下角一个圆钮，位置和各应用的浮动主题开关一致，材质换成 coss。 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => readTheme());

  // 首屏脚本已经写好 data-theme；这里只在真的不一致时才落盘，
  // 免得把用户存的 glass 一进来就改写成 light。
  useEffect(() => {
    if (document.documentElement.getAttribute('data-theme') !== theme) {
      applyTheme(theme);
    }
  }, [theme]);

  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="theme-fab"
      aria-label={next === 'dark' ? '切到深色' : '切到浅色'}
      onClick={() => setTheme(next)}
    >
      {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </button>
  );
}
