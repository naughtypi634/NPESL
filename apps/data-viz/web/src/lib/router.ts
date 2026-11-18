import type { Route, Section, Tab } from '../data/types';

const TABS: Tab[] = ['observe', 'words', 'patterns', 'describe', 'table', 'edit'];

function sectionOf(value: string): Section {
  return value === 'play' || value === 'lab' || value === 'data' ? value : 'gallery';
}

export function parseHash(hash: string = window.location.hash): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(query);
  const section = sectionOf(parts[0] || 'gallery');
  const route: Route = { section };
  if (section === 'play') {
    route.slug = parts[1] ? decodeURIComponent(parts[1]) : undefined;
    route.view = parts[2] ? decodeURIComponent(parts[2]) : undefined;
    const mark = params.get('mark');
    const tab = params.get('tab') as Tab | null;
    route.mark = mark ? decodeURIComponent(mark) : undefined;
    route.tab = tab && TABS.includes(tab) ? tab : 'observe';
  } else if (section === 'lab') {
    route.family = params.get('family') || undefined;
    route.sample = params.get('sample') || undefined;
  } else if (section === 'data') {
    route.domain = params.get('domain') || undefined;
  }
  return route;
}

export function routeHash(route: Route): string {
  if (route.section === 'play') {
    const parts = ['#/play', route.slug || '', route.view || ''].filter(Boolean);
    const params = new URLSearchParams();
    if (route.mark) params.set('mark', route.mark);
    if (route.tab) params.set('tab', route.tab);
    const query = params.toString();
    return parts.join('/') + (query ? `?${query}` : '');
  }
  if (route.section === 'lab') {
    const params = new URLSearchParams();
    if (route.family) params.set('family', route.family);
    if (route.sample) params.set('sample', route.sample);
    const query = params.toString();
    return `#/lab${query ? `?${query}` : ''}`;
  }
  if (route.section === 'data') {
    return route.domain ? `#/data?domain=${encodeURIComponent(route.domain)}` : '#/data';
  }
  return '#/gallery';
}

export function navigate(route: Route): void {
  const hash = routeHash(route);
  if (window.location.hash === hash) return;
  window.location.hash = hash;
}
