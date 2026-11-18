import type { Gallery, Library, Topic } from './types';

const BASE = import.meta.env.BASE_URL || '/data-viz/';
const cache = new Map<string, Promise<unknown>>();

function getJson<T>(path: string): Promise<T> {
  const url = `${BASE}data/${path}`;
  let pending = cache.get(url) as Promise<T> | undefined;
  if (!pending) {
    pending = fetch(url, { cache: 'no-cache' }).then((response) => {
      if (!response.ok) throw new Error(`数据加载失败（${response.status}）：${path}`);
      return response.json() as Promise<T>;
    });
    cache.set(url, pending);
    pending.catch(() => cache.delete(url));
  }
  return pending;
}

export function loadGallery(): Promise<Gallery> {
  return getJson<Gallery>('index.json');
}

export function loadTopic(gallery: Gallery, slug: string): Promise<Topic> {
  const path = gallery.bundles.topics[slug];
  if (!path) return Promise.reject(new Error(`没有这个主题：${slug}`));
  return getJson<Topic>(path);
}

export function loadLibrary(gallery: Gallery, type: string): Promise<Library> {
  const path = gallery.bundles.lang[type];
  if (!path) return Promise.reject(new Error(`没有这个图表类型：${type}`));
  return getJson<Library>(path);
}
