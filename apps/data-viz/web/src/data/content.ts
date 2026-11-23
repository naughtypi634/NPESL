import type { ContentBundle } from './content-types';

let cache: Promise<ContentBundle> | null = null;

export function loadContent(): Promise<ContentBundle> {
  if (!cache) {
    const url = `${import.meta.env.BASE_URL}data/index.json`;
    cache = fetch(url).then((response) => {
      if (!response.ok) throw new Error(`Could not load ${url}`);
      return response.json() as Promise<ContentBundle>;
    });
  }
  return cache;
}
