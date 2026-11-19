import { useEffect, useState } from 'react';

/** Re-render charts when the site theme changes (theme.js owns the switch). */
export function useTheme(): string {
  const [theme, setTheme] = useState(
    () => document.documentElement.getAttribute('data-theme') || 'light',
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.getAttribute('data-theme') || 'light');
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);
  return theme;
}
