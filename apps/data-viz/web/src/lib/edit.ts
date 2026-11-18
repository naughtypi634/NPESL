import type { Series, Unit, View, ViewData } from '../data/types';

export type EditTarget =
  | { kind: 'line'; seriesId: string; index: number }
  | { kind: 'bar'; seriesId: string; index: number }
  | { kind: 'stacked'; seriesId: string; index: number }
  | { kind: 'pie'; partId: string }
  | { kind: 'scatter'; pointId: string }
  | { kind: 'heatmap'; row: number; col: number }
  | { kind: 'sankey'; source: string; target: string }
  | { kind: 'slope'; entityId: string; period: number }
  | { kind: 'waterfall'; stepId: string }
  | { kind: 'waterfall-start' };

export type EditValue = number | { x: number; y: number };

function clone(data: ViewData): ViewData {
  return JSON.parse(JSON.stringify(data)) as ViewData;
}

function seriesOf(data: ViewData, seriesId: string): Series | undefined {
  return data.series?.find((series) => series.id === seriesId);
}

export function targetForMark(view: View, mark: string | null | undefined): EditTarget | null {
  if (!mark) return null;
  const data = view.data ?? {};

  if (mark.startsWith('pt:')) {
    const [, id, indexText] = mark.split(':');
    if (view.type === 'line' && indexText != null) {
      return { kind: 'line', seriesId: id, index: Number(indexText) };
    }
    if (view.type === 'scatter') return { kind: 'scatter', pointId: id };
    if (view.type === 'slope' && indexText != null) {
      return { kind: 'slope', entityId: id, period: Number(indexText) };
    }
  }

  if (mark.startsWith('seg:')) {
    const [, first, second] = mark.split(':');
    if (view.type === 'line') {
      return { kind: 'line', seriesId: first, index: Number(second) + 1 };
    }
    if (view.type === 'stacked') {
      return { kind: 'stacked', seriesId: second, index: Number(first) };
    }
  }

  if (mark.startsWith('bar:')) {
    const [, seriesId, indexText] = mark.split(':');
    return { kind: 'bar', seriesId, index: Number(indexText) };
  }

  if (mark.startsWith('slice:')) {
    return { kind: 'pie', partId: mark.slice('slice:'.length) };
  }

  if (mark.startsWith('cell:')) {
    const [, rowId, colId] = mark.split(':');
    const row = data.rows?.findIndex((item) => item.id === rowId) ?? -1;
    const col = data.cols?.findIndex((item) => item.id === colId) ?? -1;
    if (row < 0 || col < 0) return null;
    return { kind: 'heatmap', row, col };
  }

  if (mark.startsWith('link:')) {
    const rest = mark.slice('link:'.length);
    const split = rest.indexOf('->');
    if (split < 0) return null;
    return { kind: 'sankey', source: rest.slice(0, split), target: rest.slice(split + 2) };
  }

  if (mark.startsWith('step:')) {
    return { kind: 'waterfall', stepId: mark.slice('step:'.length) };
  }

  if (mark === 'total:start') return { kind: 'waterfall-start' };
  return null;
}

export function isDraggable(target: EditTarget | null): boolean {
  if (!target) return false;
  return (
    target.kind === 'line' ||
    target.kind === 'bar' ||
    target.kind === 'scatter' ||
    target.kind === 'slope' ||
    target.kind === 'waterfall' ||
    target.kind === 'pie'
  );
}

export function markForTarget(view: View, target: EditTarget): string {
  const data = view.data ?? {};
  switch (target.kind) {
    case 'line':
      return `pt:${target.seriesId}:${target.index}`;
    case 'bar':
      return `bar:${target.seriesId}:${target.index}`;
    case 'stacked':
      return `seg:${target.index}:${target.seriesId}`;
    case 'pie':
      return `slice:${target.partId}`;
    case 'scatter':
      return `pt:${target.pointId}`;
    case 'heatmap': {
      const row = data.rows?.[target.row]?.id ?? '';
      const col = data.cols?.[target.col]?.id ?? '';
      return `cell:${row}:${col}`;
    }
    case 'sankey':
      return `link:${target.source}->${target.target}`;
    case 'slope':
      return `pt:${target.entityId}:${target.period}`;
    case 'waterfall':
      return `step:${target.stepId}`;
    case 'waterfall-start':
      return 'total:start';
  }
}

export function readTarget(data: ViewData, target: EditTarget): EditValue | null {
  switch (target.kind) {
    case 'line':
    case 'bar':
    case 'stacked': {
      const value = seriesOf(data, target.seriesId)?.values[target.index];
      return value ?? null;
    }
    case 'pie':
      return data.parts?.find((part) => part.id === target.partId)?.value ?? null;
    case 'scatter': {
      const point = data.points?.find((item) => item.id === target.pointId);
      return point ? { x: point.x, y: point.y } : null;
    }
    case 'heatmap':
      return data.cells?.[target.row]?.[target.col] ?? null;
    case 'sankey':
      return (
        data.links?.find((link) => link.source === target.source && link.target === target.target)
          ?.value ?? null
      );
    case 'slope':
      return data.entities?.find((entity) => entity.id === target.entityId)?.values[target.period] ?? null;
    case 'waterfall':
      return data.steps?.find((step) => step.id === target.stepId)?.value ?? null;
    case 'waterfall-start':
      return data.start_value ?? null;
  }
}

export function writeTarget(data: ViewData, target: EditTarget, value: EditValue): ViewData {
  const next = clone(data);
  switch (target.kind) {
    case 'line':
    case 'bar':
    case 'stacked': {
      const series = seriesOf(next, target.seriesId);
      if (series && typeof value === 'number') series.values[target.index] = value;
      break;
    }
    case 'pie': {
      const part = next.parts?.find((item) => item.id === target.partId);
      if (part && typeof value === 'number') part.value = value;
      break;
    }
    case 'scatter': {
      const point = next.points?.find((item) => item.id === target.pointId);
      if (point && typeof value === 'object') {
        point.x = value.x;
        point.y = value.y;
      }
      break;
    }
    case 'heatmap':
      if (typeof value === 'number' && next.cells?.[target.row]) {
        next.cells[target.row][target.col] = value;
      }
      break;
    case 'sankey': {
      const link = next.links?.find(
        (item) => item.source === target.source && item.target === target.target,
      );
      if (link && typeof value === 'number') link.value = value;
      break;
    }
    case 'slope': {
      const entity = next.entities?.find((item) => item.id === target.entityId);
      if (entity && typeof value === 'number') entity.values[target.period] = value;
      break;
    }
    case 'waterfall': {
      const step = next.steps?.find((item) => item.id === target.stepId);
      if (step && typeof value === 'number') step.value = value;
      break;
    }
    case 'waterfall-start':
      if (typeof value === 'number') next.start_value = value;
      break;
  }
  return next;
}

/** Pie drag: one share grows, the other slices keep their proportions. */
export function writePieShare(data: ViewData, partId: string, share: number): ViewData {
  const next = clone(data);
  const parts = next.parts ?? [];
  const total = parts.reduce((sum, part) => sum + (Number(part.value) || 0), 0);
  if (!parts.length || total <= 0) return next;
  const dragged = parts.find((part) => part.id === partId);
  if (!dragged) return next;
  const bounded = Math.min(100, Math.max(0, share));
  const oldRemaining = total - (Number(dragged.value) || 0);
  const newRemaining = total * (1 - bounded / 100);
  const others = parts.filter((part) => part.id !== partId);
  if (oldRemaining > 0) {
    const factor = newRemaining / oldRemaining;
    for (const part of others) part.value = (Number(part.value) || 0) * factor;
  } else {
    for (const part of others) part.value = newRemaining / others.length;
  }
  dragged.value = total - newRemaining;
  return next;
}

export function targetLabel(view: View, target: EditTarget): string {
  const data = view.data ?? {};
  switch (target.kind) {
    case 'line':
    case 'bar':
    case 'stacked': {
      const series = seriesOf(data, target.seriesId);
      const label = data.x?.values?.[target.index] ?? '';
      return [series?.name_en, label].filter(Boolean).join(' · ');
    }
    case 'pie':
      return data.parts?.find((part) => part.id === target.partId)?.name_en ?? target.partId;
    case 'scatter':
      return data.points?.find((point) => point.id === target.pointId)?.id ?? target.pointId;
    case 'heatmap': {
      const row = data.rows?.[target.row]?.name_en ?? '';
      const col = data.cols?.[target.col]?.name_en ?? '';
      return [row, col].filter(Boolean).join(' · ');
    }
    case 'sankey': {
      const source = data.nodes?.find((node) => node.id === target.source)?.name_en ?? target.source;
      const targetName = data.nodes?.find((node) => node.id === target.target)?.name_en ?? target.target;
      return `${source} → ${targetName}`;
    }
    case 'slope': {
      const entity = data.entities?.find((item) => item.id === target.entityId)?.name_en ?? target.entityId;
      const period = data.periods?.[target.period]?.label_en ?? '';
      return [entity, period].filter(Boolean).join(' · ');
    }
    case 'waterfall':
      return data.steps?.find((step) => step.id === target.stepId)?.name_en ?? target.stepId;
    case 'waterfall-start':
      return data.start?.name_en ?? 'Start';
  }
}

export function decimalsOf(unit: Unit | undefined): number {
  return Math.max(0, Math.min(4, unit?.decimals ?? 0));
}

export function inputStep(unit: Unit | undefined): number {
  const decimals = decimalsOf(unit);
  return decimals > 0 ? Number((1 / 10 ** decimals).toFixed(decimals)) : 1;
}

export function formatInput(value: number, unit: Unit | undefined): string {
  const decimals = decimalsOf(unit);
  return decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));
}

export interface NumericRange {
  min: number;
  max: number;
}

function maxOf(values: number[]): number {
  return values.reduce((best, value) => (Number.isFinite(value) ? Math.max(best, value) : best), 0);
}

/** The original data range, padded a little; used to keep drags and inputs sane. */
export function valueRange(view: View, target: EditTarget): NumericRange | null {
  const data = view.data ?? {};
  switch (target.kind) {
    case 'line':
    case 'bar':
    case 'stacked': {
      const max = Math.max(
        0,
        ...(data.series ?? []).flatMap((series) => series.values.map(Number)),
      );
      if (max <= 0) return null;
      return { min: 0, max: max * 1.15 };
    }
    case 'slope': {
      const max = Math.max(0, ...(data.entities ?? []).flatMap((entity) => entity.values.map(Number)));
      if (max <= 0) return null;
      return { min: 0, max: max * 1.15 };
    }
    case 'heatmap': {
      const values = (data.cells ?? []).flat().map(Number);
      if (!values.length) return null;
      const min = Math.min(...values);
      const max = Math.max(...values);
      const pad = Math.max(1, (max - min) * 0.15);
      return { min: min - pad, max: max + pad };
    }
    case 'scatter': {
      return null; // x and y are clamped separately
    }
    case 'pie': {
      const total = (data.parts ?? []).reduce((sum, part) => sum + (Number(part.value) || 0), 0);
      return { min: 0, max: Math.max(total * 1.5, 1) };
    }
    case 'sankey': {
      const max = maxOf((data.links ?? []).map((link) => Number(link.value)));
      return max > 0 ? { min: 0, max: max * 1.5 } : null;
    }
    case 'waterfall':
    case 'waterfall-start':
      return null;
  }
}

export function scatterRanges(view: View): { x: NumericRange; y: NumericRange } | null {
  const points = view.data?.points ?? [];
  if (!points.length) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const pad = (min: number, max: number): NumericRange => {
    const span = Math.max(1, max - min);
    return { min: min - span * 0.1, max: max + span * 0.1 };
  };
  return { x: pad(Math.min(...xs), Math.max(...xs)), y: pad(Math.min(...ys), Math.max(...ys)) };
}

export function clampNumber(value: number, range: NumericRange | null): number {
  if (!range) return value;
  if (!Number.isFinite(value)) return range.min;
  return Math.min(range.max, Math.max(range.min, value));
}

export function clampTargetValue(view: View, target: EditTarget, value: EditValue): EditValue {
  if (typeof value === 'number') {
    return clampNumber(value, valueRange(view, target));
  }
  const ranges = scatterRanges(view);
  if (!ranges) return value;
  return {
    x: clampNumber(value.x, ranges.x),
    y: clampNumber(value.y, ranges.y),
  };
}

