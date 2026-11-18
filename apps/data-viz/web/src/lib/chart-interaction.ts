import type { EChartsType } from 'echarts/core';

import type { AxisLock } from './chart';
import { PIE_CENTER, PIE_RADIUS } from './chart';
import type { View } from '../data/types';
import type { EditTarget, EditValue } from './edit';

interface PixelPoint {
  x: number;
  y: number;
}

function pixel(chart: EChartsType, seriesIndex: number, x: string | number, y: number): PixelPoint | null {
  const value = chart.convertToPixel({ seriesIndex }, [x, y]) as number[] | null;
  if (!value || value.length < 2) return null;
  return { x: value[0], y: value[1] };
}

function distance(a: PixelPoint, b: PixelPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceToSegment(point: PixelPoint, a: PixelPoint, b: PixelPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  if (!length) return distance(point, a);
  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / length;
  t = Math.max(0, Math.min(1, t));
  return distance(point, { x: a.x + t * dx, y: a.y + t * dy });
}

function bands(xs: string[], chart: EChartsType, seriesIndex: number): number {
  if (xs.length < 2) return 40;
  const first = pixel(chart, seriesIndex, xs[0], 0);
  const second = pixel(chart, seriesIndex, xs[1], 0);
  if (!first || !second) return 40;
  return Math.max(14, Math.abs(second.x - first.x) * 0.5);
}

function pieGeometry(chart: EChartsType): { cx: number; cy: number; inner: number; outer: number } {
  const width = chart.getWidth();
  const height = chart.getHeight();
  const size = Math.min(width, height);
  const half = size / 2;
  const centerX = Number.parseFloat(PIE_CENTER[0]) / 100;
  const centerY = Number.parseFloat(PIE_CENTER[1]) / 100;
  return {
    cx: width * centerX,
    cy: height * centerY,
    inner: (half * Number.parseFloat(PIE_RADIUS[0])) / 100,
    outer: (half * Number.parseFloat(PIE_RADIUS[1])) / 100,
  };
}

function angleAt(point: PixelPoint, cx: number, cy: number): number {
  // Degrees clockwise from the top, matching ECharts' default pie start.
  return (Math.atan2(point.y - cy, point.x - cx) * 180) / Math.PI + 90;
}

function normalized(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

function pieSlice(view: View, angle: number): { id: string; start: number; size: number } | null {
  const parts = view.data?.parts ?? [];
  const total = parts.reduce((sum, part) => sum + (Number(part.value) || 0), 0);
  if (!parts.length || total <= 0) return null;
  let cursor = 0;
  for (const part of parts) {
    const size = ((Number(part.value) || 0) / total) * 360;
    if (angle >= cursor && angle < cursor + size) {
      return { id: part.id, start: cursor, size };
    }
    cursor += size;
  }
  const last = parts[parts.length - 1];
  return { id: last.id, start: 360 - (((Number(last.value) || 0) / total) * 360), size: 0 };
}

export function pieShareFromPointer(view: View, chart: EChartsType, pointer: PixelPoint): { id: string; share: number } | null {
  const geometry = pieGeometry(chart);
  const radius = Math.hypot(pointer.x - geometry.cx, pointer.y - geometry.cy);
  if (radius < geometry.inner || radius > geometry.outer) return null;
  const angle = normalized(angleAt(pointer, geometry.cx, geometry.cy));
  const slice = pieSlice(view, angle);
  if (!slice) return null;
  const share = Math.max(0, Math.min(100, (angle - slice.start) / 3.6));
  return { id: slice.id, share };
}

function scatterGroupIndex(view: View, groupId: string | undefined): number {
  const groups = view.data?.groups ?? [];
  if (!groups.length) return 0;
  const index = groups.findIndex((group) => group.id === groupId);
  return index < 0 ? 0 : index;
}

export function hitTestTarget(view: View, chart: EChartsType, pointer: PixelPoint): EditTarget | null {
  const data = view.data ?? {};

  if (view.type === 'line' || view.type === 'slope') {
    const series = data.series ?? [];
    if (view.type === 'slope') {
      const entities = data.entities ?? [];
      const periods = (data.periods ?? []).map((period) => period.label_en ?? '');
      for (let entityIndex = 0; entityIndex < entities.length; entityIndex += 1) {
        const entity = entities[entityIndex];
        for (let periodIndex = 0; periodIndex < entity.values.length; periodIndex += 1) {
          const at = pixel(chart, entityIndex, periods[periodIndex], entity.values[periodIndex]);
          if (at && distance(pointer, at) <= 16) {
            return { kind: 'slope', entityId: entity.id, period: periodIndex };
          }
        }
      }
      return null;
    }
    const xs = (data.x?.values ?? []).map(String);
    for (let seriesIndex = 0; seriesIndex < series.length; seriesIndex += 1) {
      const item = series[seriesIndex];
      for (let i = 0; i < item.values.length; i += 1) {
        const at = pixel(chart, seriesIndex, xs[i], item.values[i]);
        if (at && distance(pointer, at) <= 16) {
          return { kind: 'line', seriesId: item.id, index: i };
        }
      }
    }
    return null;
  }

  if (view.type === 'bar') {
    const series = data.series ?? [];
    const xs = (data.x?.values ?? []).map(String);
    for (let seriesIndex = 0; seriesIndex < series.length; seriesIndex += 1) {
      const item = series[seriesIndex];
      const band = bands(xs, chart, seriesIndex);
      for (let i = 0; i < item.values.length; i += 1) {
        const top = pixel(chart, seriesIndex, xs[i], item.values[i]);
        const zero = pixel(chart, seriesIndex, xs[i], 0);
        if (!top || !zero) continue;
        if (Math.abs(pointer.x - top.x) <= band) {
          const low = Math.min(top.y, zero.y) - 12;
          const high = Math.max(top.y, zero.y) + 12;
          if (pointer.y >= low && pointer.y <= high) {
            return { kind: 'bar', seriesId: item.id, index: i };
          }
        }
      }
    }
    return null;
  }

  if (view.type === 'scatter') {
    const groups = data.groups ?? [];
    const groupIds = groups.length ? groups.map((group) => group.id) : [''];
    for (const groupId of groupIds) {
      const seriesIndex = scatterGroupIndex(view, groupId);
      for (const point of (data.points ?? []).filter((item) => (item.group ?? '') === groupId)) {
        const at = pixel(chart, seriesIndex, point.x, point.y);
        if (at && distance(pointer, at) <= 14) {
          return { kind: 'scatter', pointId: point.id };
        }
      }
    }
    return null;
  }

  if (view.type === 'waterfall') {
    const steps = data.steps ?? [];
    const start = Number(data.start_value) || 0;
    const categories = [data.start?.name_en ?? 'Start', ...steps.map((step) => step.name_en), data.end?.name_en ?? 'End'];
    let running = start;
    for (let i = 0; i < steps.length; i += 1) {
      const value = Number(steps[i].value) || 0;
      const next = running + value;
      const base = Math.min(running, next);
      const top = Math.max(running, next);
      const category = categories[i + 1];
      const topPixel = pixel(chart, 1, category, top);
      const basePixel = pixel(chart, 1, category, base);
      if (topPixel && basePixel && Math.abs(pointer.x - topPixel.x) <= bands(categories, chart, 1)) {
        if (pointer.y >= topPixel.y - 12 && pointer.y <= basePixel.y + 12) {
          return { kind: 'waterfall', stepId: steps[i].id };
        }
      }
      running = next;
    }
    return null;
  }

  if (view.type === 'pie') {
    const share = pieShareFromPointer(view, chart, pointer);
    return share ? { kind: 'pie', partId: share.id } : null;
  }

  return null;
}

export function valueFromPointer(
  view: View,
  chart: EChartsType,
  target: EditTarget,
  pointer: PixelPoint,
): EditValue | null {
  if (target.kind === 'scatter') {
    const value = chart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [pointer.x, pointer.y]) as number[] | null;
    if (!value || value.length < 2) return null;
    return { x: value[0], y: value[1] };
  }

  if (target.kind === 'pie') {
    const share = pieShareFromPointer(view, chart, pointer);
    return share ? share.share : null;
  }

  if (target.kind === 'waterfall') {
    const steps = view.data?.steps ?? [];
    const start = Number(view.data?.start_value) || 0;
    let base = start;
    for (const step of steps) {
      if (step.id === target.stepId) break;
      base += Number(step.value) || 0;
    }
    const value = chart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [pointer.x, pointer.y]) as number[] | null;
    if (!value || value.length < 2) return null;
    return value[1] - base;
  }

  const value = chart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [pointer.x, pointer.y]) as number[] | null;
  if (!value || value.length < 2) return null;
  return value[1];
}

/** The nearest line segment, for charts that have no native segment event. */
export function hoverSegment(view: View, chart: EChartsType, pointer: PixelPoint): string | null {
  const data = view.data ?? {};
  if (view.type === 'line') {
    const xs = (data.x?.values ?? []).map(String);
    let best: { distance: number; mark: string } | null = null;
    for (let seriesIndex = 0; seriesIndex < (data.series ?? []).length; seriesIndex += 1) {
      const item = data.series![seriesIndex];
      for (let i = 0; i < item.values.length - 1; i += 1) {
        const a = pixel(chart, seriesIndex, xs[i], item.values[i]);
        const b = pixel(chart, seriesIndex, xs[i + 1], item.values[i + 1]);
        if (!a || !b) continue;
        const d = distanceToSegment(pointer, a, b);
        if (d <= 10 && (!best || d < best.distance)) {
          best = { distance: d, mark: `seg:${item.id}:${i}` };
        }
      }
    }
    return best?.mark ?? null;
  }

  if (view.type === 'slope') {
    const periods = (data.periods ?? []).map((period) => period.label_en ?? '');
    let best: { distance: number; mark: string } | null = null;
    for (let entityIndex = 0; entityIndex < (data.entities ?? []).length; entityIndex += 1) {
      const entity = data.entities![entityIndex];
      for (let i = 0; i < entity.values.length - 1; i += 1) {
        const a = pixel(chart, entityIndex, periods[i], entity.values[i]);
        const b = pixel(chart, entityIndex, periods[i + 1], entity.values[i + 1]);
        if (!a || !b) continue;
        const d = distanceToSegment(pointer, a, b);
        if (d <= 10 && (!best || d < best.distance)) {
          best = { distance: d, mark: `line:${entity.id}` };
        }
      }
    }
    return best?.mark ?? null;
  }

  return null;
}

/** Keep the axes steady while a drag is in progress. */
export function axisLockFor(view: View): AxisLock | undefined {
  const data = view.data ?? {};
  const pad = (values: number[]): [number, number] | undefined => {
    if (!values.length) return undefined;
    const min = Math.min(0, ...values);
    const max = Math.max(...values);
    const span = Math.max(1, max - min);
    return [min - span * 0.08, max + span * 0.08];
  };

  if (view.type === 'line' || view.type === 'bar' || view.type === 'stacked') {
    const values = (data.series ?? []).flatMap((series) => series.values.map(Number));
    const y = pad(values);
    return y ? { y } : undefined;
  }
  if (view.type === 'slope') {
    const y = pad((data.entities ?? []).flatMap((entity) => entity.values.map(Number)));
    return y ? { y } : undefined;
  }
  if (view.type === 'scatter') {
    const xs = (data.points ?? []).map((point) => point.x);
    const ys = (data.points ?? []).map((point) => point.y);
    const padValue = (values: number[]): [number, number] => {
      const min = Math.min(...values);
      const max = Math.max(...values);
      const span = Math.max(1, max - min);
      return [min - span * 0.1, max + span * 0.1];
    };
    return xs.length && ys.length ? { x: padValue(xs), y: padValue(ys) } : undefined;
  }
  if (view.type === 'waterfall') {
    const steps = data.steps ?? [];
    let running = Number(data.start_value) || 0;
    const values = [running];
    for (const step of steps) {
      running += Number(step.value) || 0;
      values.push(running);
    }
    const y = pad(values);
    return y ? { y } : undefined;
  }
  return undefined;
}
