import type { Dataset, Series } from '../data/content-types';
import { formatGap, formatValue } from './format';

export interface CategoryChange {
  category: string;
  from: number;
  to: number;
  delta: number;
  pct: number;
}

export interface CategoryPair {
  a: string;
  b: string;
  aValue: number;
  bValue: number;
  gap: number;
  ratio: number;
}

export interface CategoryValueFacts {
  dataset: Dataset;
  focus: Series;
  compare: Series;
  top: { category: string; value: number; index: number };
  bottom: { category: string; value: number; index: number };
  gap: number;
  ratio: number;
  changes: CategoryChange[];
  biggestIncrease: CategoryChange;
  smallestChange: CategoryChange;
  slightPair: CategoryPair | null;
  ratioPair: CategoryPair | null;
  allUp: boolean;
  takeaway: string;
  rows: Array<{ team: string; period: string; value: number }>;
}

export function seriesById(dataset: Dataset, id: string): Series {
  const series = dataset.series.find((item) => item.id === id);
  if (!series) throw new Error(`Unknown series "${id}" in dataset "${dataset.id}"`);
  return series;
}

export function withFocusValues(dataset: Dataset, focusId: string, values: number[]): Dataset {
  return withSeriesValues(dataset, { [focusId]: values });
}

export function withSeriesValues(
  dataset: Dataset,
  valuesBySeries: Record<string, number[]>,
): Dataset {
  return {
    ...dataset,
    series: dataset.series.map((series) => {
      const values = valuesBySeries[series.id];
      return values && values.length === dataset.categories.length
        ? { ...series, values: values.slice() }
        : series;
    }),
  };
}

export function buildRows(dataset: Dataset): Array<{ team: string; period: string; value: number }> {
  return dataset.categories.flatMap((category, index) =>
    dataset.series.map((series) => ({
      team: category,
      period: series.label_en,
      value: series.values[index] ?? 0,
    })),
  );
}

export function buildCategoryValueFacts(
  dataset: Dataset,
  focusId: string,
  compareId: string,
): CategoryValueFacts {
  const focus = seriesById(dataset, focusId);
  const compare = seriesById(dataset, compareId);
  const categories = dataset.categories;

  let topIndex = 0;
  let bottomIndex = 0;
  focus.values.forEach((value, index) => {
    if (value > focus.values[topIndex]) topIndex = index;
    if (value < focus.values[bottomIndex]) bottomIndex = index;
  });

  const top = {
    category: categories[topIndex],
    value: focus.values[topIndex],
    index: topIndex,
  };
  const bottom = {
    category: categories[bottomIndex],
    value: focus.values[bottomIndex],
    index: bottomIndex,
  };
  const gap = top.value - bottom.value;
  const ratio = bottom.value === 0 ? Number.POSITIVE_INFINITY : top.value / bottom.value;

  const changes: CategoryChange[] = categories.map((category, index) => {
    const from = compare.values[index];
    const to = focus.values[index];
    return {
      category,
      from,
      to,
      delta: to - from,
      pct: from === 0 ? 0 : (to - from) / from,
    };
  });

  const biggestIncrease = changes.reduce((best, item) => (item.delta > best.delta ? item : best), changes[0]);
  const smallestChange = changes.reduce(
    (best, item) => (Math.abs(item.delta) < Math.abs(best.delta) ? item : best),
    changes[0],
  );

  let slightPair: CategoryPair | null = null;
  let ratioPair: CategoryPair | null = null;
  let closestRatio = Number.POSITIVE_INFINITY;
  for (let i = 0; i < focus.values.length; i += 1) {
    for (let j = i + 1; j < focus.values.length; j += 1) {
      const left = focus.values[i];
      const right = focus.values[j];
      const high = Math.max(left, right);
      const low = Math.min(left, right);
      if (low <= 0) continue;
      const pairGap = high - low;
      const pairRatio = high / low;
      if (!slightPair || pairGap < slightPair.gap) {
        slightPair = {
          a: left >= right ? categories[i] : categories[j],
          b: left >= right ? categories[j] : categories[i],
          aValue: high,
          bValue: low,
          gap: pairGap,
          ratio: pairRatio,
        };
      }
      const distance = Math.abs(pairRatio - 2);
      if (distance < closestRatio) {
        closestRatio = distance;
        ratioPair = {
          a: left >= right ? categories[i] : categories[j],
          b: left >= right ? categories[j] : categories[i],
          aValue: high,
          bValue: low,
          gap: pairGap,
          ratio: pairRatio,
        };
      }
    }
  }

  const allUp = changes.every((item) => item.delta > 0);
  const takeaway =
    `${top.category} leads in ${focus.label_en} at ${formatValue(top.value, dataset.unit)}, ` +
    `while ${bottom.category} trails at ${formatValue(bottom.value, dataset.unit)}.`;

  return {
    dataset,
    focus,
    compare,
    top,
    bottom,
    gap,
    ratio,
    changes,
    biggestIncrease,
    smallestChange,
    slightPair,
    ratioPair,
    allUp,
    takeaway,
    rows: buildRows(dataset),
  };
}

export function gapText(value: number, dataset: Dataset): string {
  return formatGap(value, dataset.unit);
}
