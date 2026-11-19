import type {
  AtlasIndex,
  ChartLesson,
  ContextDetail,
  ExpressionGroup,
} from './types';

const base = import.meta.env.BASE_URL;
const cache = new Map<string, unknown>();

async function read<T>(path: string): Promise<T> {
  const cached = cache.get(path);
  if (cached) return cached as T;
  const response = await fetch(`${base}${path}`);
  if (!response.ok) {
    throw new Error(`Could not load ${path} (${response.status})`);
  }
  const data = (await response.json()) as T;
  cache.set(path, data);
  return data;
}

export function loadIndex(): Promise<AtlasIndex> {
  return read<AtlasIndex>('data/index.json');
}

export function loadChart(id: string): Promise<ChartLesson> {
  return read<ChartLesson>(`data/charts/${encodeURIComponent(id)}.json`);
}

export function loadGroup(id: string): Promise<ExpressionGroup> {
  return read<ExpressionGroup>(`data/expressions/${encodeURIComponent(id)}.json`);
}

export function loadContext(id: string): Promise<ContextDetail> {
  return read<ContextDetail>(`data/contexts/${encodeURIComponent(id)}.json`);
}
