import { BarChart, HeatmapChart, LineChart, PieChart, SankeyChart, ScatterChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';

import { DV } from '../engine';
import type { View } from '../data/types';

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  HeatmapChart,
  SankeyChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  MarkAreaComponent,
  CanvasRenderer,
]);

export { echarts };

export interface Palette {
  series: string[];
  seq: string[];
  fg: string;
  muted: string;
  rule: string;
  pane: string;
  font: string;
  pos: string;
  neg: string;
  total: string;
}

export interface AxisLock {
  x?: [number, number];
  y?: [number, number];
}

export const PIE_CENTER: [string, string] = ['50%', '44%'];
export const PIE_RADIUS: [string, string] = ['38%', '70%'];

const FALLBACK = ['#1f5fbf', '#b25424', '#0b6b5e', '#8a6500', '#9c3f86', '#2f6b2f', '#5b45c9', '#b23a48'];

export function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    series: Array.from({ length: 8 }, (_, i) => v(`--dv-${i + 1}`, FALLBACK[i])),
    seq: Array.from({ length: 5 }, (_, i) => v(`--dv-seq-${i + 1}`, '#b3cdee')),
    fg: v('--fg', '#111111'),
    muted: v('--muted', '#5b5b5b'),
    rule: v('--rule', 'rgba(59, 66, 83, 0.12)'),
    pane: v('--pane-solid', '#ffffff'),
    font: v('--font', 'system-ui'),
    pos: v('--dv-pos', '#2f6b2f'),
    neg: v('--dv-neg', '#b23a48'),
    total: v('--dv-total', '#6b7280'),
  };
}

function alpha(color: string, value: number): string {
  const hex = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r}, ${g}, ${b}, ${value})`;
  }
  return color;
}

interface BuildOptions {
  selectedMarks?: string[];
  compact?: boolean;
  axisLock?: AxisLock;
  tooltip?: (params: { data?: { mark?: string } }) => string;
}

function axisText(palette: Palette, compact = false): Record<string, unknown> {
  return {
    color: palette.muted,
    fontFamily: palette.font,
    fontSize: compact ? 9 : 11,
  };
}

function gridOf(compact = false): Record<string, unknown> {
  return {
    left: compact ? 4 : 46,
    right: compact ? 4 : 18,
    top: compact ? 6 : 34,
    bottom: compact ? 6 : 26,
    containLabel: !compact,
  };
}

function tooltipOf(
  palette: Palette,
  compact = false,
  formatter?: BuildOptions['tooltip'],
): Record<string, unknown> {
  if (compact) return { show: false };
  const base = {
    trigger: 'item',
    backgroundColor: palette.pane,
    borderColor: palette.rule,
    borderWidth: 1,
    padding: [8, 10],
    textStyle: { color: palette.fg, fontFamily: palette.font, fontSize: 12 },
    extraCssText: 'border-radius: 12px; box-shadow: 0 12px 32px -14px rgba(0,0,0,.35);',
  };
  return formatter ? { ...base, formatter } : base;
}

function base(
  palette: Palette,
  compact = false,
  tooltip?: BuildOptions['tooltip'],
): Record<string, unknown> {
  return {
    animation: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    animationDuration: compact ? 250 : 420,
    animationEasing: 'cubicOut',
    textStyle: { fontFamily: palette.font, color: palette.muted },
    grid: gridOf(compact),
    tooltip: tooltipOf(palette, compact, tooltip),
  };
}

function isSelected(mark: string, selectedMarks: string[] | undefined): boolean {
  return !!selectedMarks?.includes(mark);
}

function selectedStyle(
  mark: string,
  selectedMarks: string[] | undefined,
  palette: Palette,
): Record<string, unknown> | undefined {
  if (!isSelected(mark, selectedMarks)) return undefined;
  return { borderColor: palette.fg, borderWidth: 2 };
}

function lineOption(view: View, palette: Palette, opts: BuildOptions): EChartsOption {
  const data = view.data ?? {};
  const xs = (data.x?.values ?? []).map(String);
  const selectedMarks = opts.selectedMarks ?? [];
  const compact = !!opts.compact;
  const series = (data.series ?? []).map((s, index) => {
    const color = palette.series[index % palette.series.length];
    const items = s.values.map((value, i) => {
      const mark = `pt:${s.id}:${i}`;
      const highlight = isSelected(mark, selectedMarks);
      return {
        value,
        mark,
        symbolSize: highlight ? (compact ? 7 : 12) : undefined,
        itemStyle: highlight
          ? { color, borderColor: palette.fg, borderWidth: 2 }
          : undefined,
      };
    });
    const item: Record<string, unknown> = {
      type: 'line',
      name: s.name_en,
      data: items,
      smooth: false,
      symbol: 'circle',
      symbolSize: compact ? 3 : 7,
      lineStyle: { width: compact ? 1.8 : 2.6, color },
      itemStyle: { color, borderColor: palette.pane, borderWidth: 1 },
      emphasis: { focus: 'series' },
    };
    const areas: unknown[] = [];
    for (const selected of selectedMarks) {
      if (!selected.startsWith('seg:')) continue;
      const [, seriesId, indexText] = selected.split(':');
      const i = Number(indexText);
      if (seriesId === s.id && xs[i] != null && xs[i + 1] != null) {
        areas.push([{ xAxis: xs[i] }, { xAxis: xs[i + 1] }]);
      }
    }
    if (areas.length) {
      item.markArea = {
        silent: true,
        itemStyle: { color: alpha(color, 0.14) },
        data: areas,
      };
    }
    return item;
  });
  return {
    ...base(palette, compact, opts.tooltip),
    xAxis: {
      type: 'category',
      data: xs,
      boundaryGap: false,
      axisLine: { lineStyle: { color: palette.rule } },
      axisTick: { show: false },
      axisLabel: { ...axisText(palette, compact), show: !compact },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      min: opts.axisLock?.y?.[0],
      max: opts.axisLock?.y?.[1],
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        ...axisText(palette, compact),
        show: !compact,
        formatter: (value: number) => DV.compute.fmtAxis(value, view.unit ?? {}),
      },
      splitLine: { lineStyle: { color: palette.rule, type: 'dashed' } },
    },
    legend: {
      show: !compact && series.length > 1,
      bottom: 0,
      textStyle: axisText(palette),
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 10,
    },
    series,
  } as EChartsOption;
}

function barOption(view: View, palette: Palette, opts: BuildOptions, stacked = false): EChartsOption {
  const data = view.data ?? {};
  const compact = !!opts.compact;
  const selectedMarks = opts.selectedMarks ?? [];
  const percent = stacked && data.mode === 'percent';
  const count = data.x?.values?.length ?? 0;
  const xs = Array.from({ length: count }, (_, i) => String(data.x?.values?.[i] ?? ''));
  const totals = Array.from({ length: count }, (_, i) =>
    (data.series ?? []).reduce((sum, s) => sum + (Number(s.values[i]) || 0), 0),
  );
  const series = (data.series ?? []).map((s, index) => {
    const color = palette.series[index % palette.series.length];
    const items = Array.from({ length: count }, (_, i) => {
      const raw = Number(s.values[i]) || 0;
      const value = percent ? (totals[i] ? (raw / totals[i]) * 100 : 0) : raw;
      const mark = stacked ? `seg:${i}:${s.id}` : `bar:${s.id}:${i}`;
      const stackHighlight = isSelected(`stack:${i}`, selectedMarks);
      return {
        value,
        mark,
        itemStyle:
          selectedStyle(mark, selectedMarks, palette) ??
          (stackHighlight ? { borderColor: palette.fg, borderWidth: 2 } : undefined),
      };
    });
    return {
      type: 'bar',
      name: s.name_en,
      data: items,
      stack: stacked ? 'stack' : undefined,
      barMaxWidth: compact ? 18 : 46,
      itemStyle: {
        color,
        borderRadius: stacked ? 4 : [6, 6, 0, 0],
      },
      emphasis: { focus: 'series' },
      label: {
        show: !stacked && !compact,
        position: 'top',
        color: palette.muted,
        fontFamily: palette.font,
        fontSize: 10,
        formatter: (p: { value: number }) => DV.compute.fmtAxis(Number(p.value), view.unit ?? {}),
      },
    };
  });
  return {
    ...base(palette, compact, opts.tooltip),
    xAxis: {
      type: 'category',
      data: xs,
      axisLine: { lineStyle: { color: palette.rule } },
      axisTick: { show: false },
      axisLabel: {
        ...axisText(palette, compact),
        show: !compact,
        interval: 0,
        rotate: compact ? 0 : xs.some((x) => x.length > 8) ? 24 : 0,
      },
    },
    yAxis: {
      type: 'value',
      min: opts.axisLock?.y?.[0],
      max: percent ? 100 : opts.axisLock?.y?.[1],
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        ...axisText(palette, compact),
        show: !compact,
        formatter: (value: number) => (percent ? `${value}%` : DV.compute.fmtAxis(value, view.unit ?? {})),
      },
      splitLine: { lineStyle: { color: palette.rule, type: 'dashed' } },
    },
    legend: {
      show: !compact && series.length > 1,
      bottom: 0,
      textStyle: axisText(palette),
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 10,
    },
    series,
  } as EChartsOption;
}

function pieOption(view: View, palette: Palette, opts: BuildOptions): EChartsOption {
  const data = view.data ?? {};
  const compact = !!opts.compact;
  const selectedMarks = opts.selectedMarks ?? [];
  const items = (data.parts ?? []).map((part, index) => {
    const mark = `slice:${part.id}`;
    return {
      name: part.name_en,
      value: part.value,
      mark,
      itemStyle: {
        color: palette.series[index % palette.series.length],
        borderColor: palette.pane,
        borderWidth: 2,
        borderRadius: 6,
        ...(selectedStyle(mark, selectedMarks, palette) ?? {}),
      },
    };
  });
  return {
    ...base(palette, compact, opts.tooltip),
    legend: {
      show: !compact,
      bottom: 0,
      textStyle: axisText(palette),
      icon: 'circle',
      itemWidth: 8,
      itemHeight: 8,
    },
    series: [
      {
        type: 'pie',
        radius: compact ? ['10%', '78%'] : [...PIE_RADIUS],
        center: compact ? ['50%', '50%'] : [...PIE_CENTER],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: palette.pane, borderWidth: 2 },
        label: {
          show: !compact,
          color: palette.muted,
          fontFamily: palette.font,
          fontSize: 11,
          formatter: '{b} {d}%',
        },
        labelLine: { show: !compact, lineStyle: { color: palette.rule } },
        emphasis: { scale: true, scaleSize: 6, label: { show: true, color: palette.fg } },
        data: items,
      },
    ],
  } as EChartsOption;
}

function scatterOption(view: View, palette: Palette, opts: BuildOptions): EChartsOption {
  const data = view.data ?? {};
  const compact = !!opts.compact;
  const selectedMarks = opts.selectedMarks ?? [];
  const groups = data.groups ?? [];
  const groupIds = groups.length ? groups.map((group) => group.id) : [''];
  const series = groupIds.map((groupId, index) => {
    const color = palette.series[index % palette.series.length];
    const points = (data.points ?? []).filter((point) => (point.group ?? '') === groupId);
    return {
      type: 'scatter',
      name: groups.find((group) => group.id === groupId)?.name_en || view.label_en || 'Points',
      data: points.map((point) => {
        const mark = `pt:${point.id}`;
        const highlight =
          isSelected(mark, selectedMarks) ||
          isSelected(`grp:${groupId}`, selectedMarks) ||
          isSelected('all', selectedMarks);
        return {
          value: [point.x, point.y],
          name: point.name_en,
          mark,
          symbolSize: highlight ? (compact ? 8 : 14) : compact ? 5 : 9,
          itemStyle: highlight
            ? { color, borderColor: palette.fg, borderWidth: 2 }
            : { color, borderColor: palette.pane, borderWidth: 1 },
        };
      }),
      emphasis: { focus: 'series' },
    };
  });
  return {
    ...base(palette, compact, opts.tooltip),
    xAxis: {
      type: 'value',
      name: compact ? '' : data.x?.label_en ?? '',
      min: opts.axisLock?.x?.[0],
      max: opts.axisLock?.x?.[1],
      nameTextStyle: { color: palette.muted, fontFamily: palette.font, fontSize: 11 },
      axisLine: { lineStyle: { color: palette.rule } },
      axisTick: { show: false },
      axisLabel: { ...axisText(palette, compact), show: !compact },
      splitLine: { lineStyle: { color: palette.rule, type: 'dashed' } },
    },
    yAxis: {
      type: 'value',
      name: compact ? '' : data.y?.label_en ?? '',
      min: opts.axisLock?.y?.[0],
      max: opts.axisLock?.y?.[1],
      nameTextStyle: { color: palette.muted, fontFamily: palette.font, fontSize: 11 },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { ...axisText(palette, compact), show: !compact },
      splitLine: { lineStyle: { color: palette.rule, type: 'dashed' } },
    },
    legend: {
      show: !compact && groups.length > 1,
      bottom: 0,
      textStyle: axisText(palette),
      icon: 'circle',
      itemWidth: 8,
      itemHeight: 8,
    },
    series,
  } as EChartsOption;
}

function heatmapOption(view: View, palette: Palette, opts: BuildOptions): EChartsOption {
  const data = view.data ?? {};
  const compact = !!opts.compact;
  const selectedMarks = opts.selectedMarks ?? [];
  const rows = data.rows ?? [];
  const cols = data.cols ?? [];
  const cells = data.cells ?? [];
  const values: number[] = cells.flat().map(Number);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const items: unknown[] = [];
  rows.forEach((row, r) => {
    cols.forEach((col, c) => {
      const mark = `cell:${row.id}:${col.id}`;
      const highlight =
        isSelected(mark, selectedMarks) ||
        isSelected(`row:${row.id}`, selectedMarks) ||
        isSelected(`col:${col.id}`, selectedMarks);
      items.push({
        value: [c, r, Number(cells[r]?.[c]) || 0],
        mark,
        itemStyle: highlight
          ? { borderColor: palette.fg, borderWidth: 2 }
          : { borderColor: palette.pane, borderWidth: 2, borderRadius: 4 },
      });
    });
  });
  return {
    ...base(palette, compact, opts.tooltip),
    xAxis: {
      type: 'category',
      data: cols.map((col) => col.name_en),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { ...axisText(palette, compact), show: !compact, interval: 0 },
      splitArea: { show: false },
    },
    yAxis: {
      type: 'category',
      data: rows.map((row) => row.name_en),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { ...axisText(palette, compact), show: !compact },
      splitArea: { show: false },
    },
    visualMap: {
      show: !compact,
      min,
      max,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      itemWidth: 10,
      itemHeight: 80,
      textStyle: axisText(palette),
      inRange: { color: palette.seq },
    },
    series: [
      {
        type: 'heatmap',
        data: items,
        label: {
          show: !compact,
          color: palette.fg,
          fontFamily: palette.font,
          fontSize: 10,
          formatter: (p: { value: number[] }) => String(p.value[2]),
        },
        emphasis: { itemStyle: { borderColor: palette.fg, borderWidth: 2 } },
      },
    ],
  } as EChartsOption;
}

function sankeyOption(view: View, palette: Palette, opts: BuildOptions): EChartsOption {
  const data = view.data ?? {};
  const compact = !!opts.compact;
  const selectedMarks = opts.selectedMarks ?? [];
  const nodes = data.nodes ?? [];
  const links = data.links ?? [];
  return {
    ...base(palette, compact, opts.tooltip),
    series: [
      {
        type: 'sankey',
        left: compact ? 2 : 8,
        right: compact ? 2 : 8,
        top: compact ? 6 : 18,
        bottom: compact ? 6 : 18,
        nodeWidth: compact ? 6 : 10,
        nodeGap: compact ? 6 : 10,
        draggable: false,
        emphasis: { focus: 'adjacency' },
        // Node names are shown in the legend below the chart. ECharts clips
        // labels at the series edge, which loses the last column on phones.
        label: { show: false },
        lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.32 },
        itemStyle: { borderWidth: 0, borderRadius: 4 },
        data: nodes.map((node, index) => {
          const mark = `node:${node.id}`;
          const highlight = isSelected(mark, selectedMarks);
          return {
            name: node.name_en,
            mark,
            itemStyle: {
              color: palette.series[index % palette.series.length],
              borderColor: highlight ? palette.fg : 'transparent',
              borderWidth: highlight ? 2 : 0,
            },
          };
        }),
        links: links.map((link) => {
          const source = nodes.find((node) => node.id === link.source);
          const target = nodes.find((node) => node.id === link.target);
          const mark = `link:${link.source}->${link.target}`;
          return {
            source: source?.name_en ?? link.source,
            target: target?.name_en ?? link.target,
            value: link.value,
            mark,
            lineStyle: isSelected(mark, selectedMarks) ? { opacity: 0.9, width: 3 } : undefined,
          };
        }),
      },
    ],
  } as EChartsOption;
}

function slopeOption(view: View, palette: Palette, opts: BuildOptions): EChartsOption {
  const data = view.data ?? {};
  const compact = !!opts.compact;
  const selectedMarks = opts.selectedMarks ?? [];
  const periods = (data.periods ?? []).map((period) => period.label_en ?? '');
  const entities = data.entities ?? [];
  const series = entities.map((entity, index) => {
    const color = palette.series[index % palette.series.length];
    const lineSelected = isSelected(`line:${entity.id}`, selectedMarks);
    const dim = selectedMarks.some((mark) => mark.startsWith('line:')) && !lineSelected;
    return {
      type: 'line',
      name: entity.name_en,
      data: entity.values.map((value, periodIndex) => {
        const mark = `pt:${entity.id}:${periodIndex}`;
        const highlight = isSelected(mark, selectedMarks) || lineSelected;
        return {
          value,
          mark,
          symbolSize: highlight ? (compact ? 6 : 11) : compact ? 3 : 6,
          itemStyle: highlight ? { borderColor: palette.fg, borderWidth: 2 } : undefined,
        };
      }),
      symbol: 'circle',
      lineStyle: { width: lineSelected ? 4 : 2.4, color, opacity: dim ? 0.3 : 1 },
      itemStyle: { color },
      endLabel: {
        show: !compact,
        formatter: entity.name_en,
        color: dim ? alpha(palette.muted, 0.4) : palette.muted,
        fontFamily: palette.font,
        fontSize: 10,
      },
      emphasis: { focus: 'series' },
    };
  });
  return {
    ...base(palette, compact, opts.tooltip),
    grid: { left: compact ? 4 : 46, right: compact ? 34 : 118, top: compact ? 6 : 34, bottom: compact ? 6 : 26, containLabel: !compact },
    xAxis: {
      type: 'category',
      data: periods,
      boundaryGap: false,
      axisLine: { lineStyle: { color: palette.rule } },
      axisTick: { show: false },
      axisLabel: { ...axisText(palette, compact), show: !compact },
    },
    yAxis: {
      type: 'value',
      min: opts.axisLock?.y?.[0],
      max: opts.axisLock?.y?.[1],
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        ...axisText(palette, compact),
        show: !compact,
        formatter: (value: number) => DV.compute.fmtAxis(value, view.unit ?? {}),
      },
      splitLine: { lineStyle: { color: palette.rule, type: 'dashed' } },
    },
    series,
  } as EChartsOption;
}

function waterfallOption(view: View, palette: Palette, opts: BuildOptions): EChartsOption {
  const data = view.data ?? {};
  const compact = !!opts.compact;
  const selectedMarks = opts.selectedMarks ?? [];
  const steps = data.steps ?? [];
  const start = Number(data.start_value) || 0;
  const startLabel = data.start?.name_en ?? 'Start';
  const endLabel = data.end?.name_en ?? 'End';
  const categories = [startLabel, ...steps.map((step) => step.name_en), endLabel];
  const baseData: number[] = [];
  const valueData: { value: number; mark: string; itemStyle: Record<string, unknown> }[] = [];
  let running = start;
  baseData.push(0);
  valueData.push({
    value: start,
    mark: 'total:start',
    itemStyle: {
      color: palette.total,
      borderRadius: [6, 6, 0, 0],
      ...(isSelected('total:start', selectedMarks) ? { borderColor: palette.fg, borderWidth: 2 } : {}),
    },
  });
  for (const step of steps) {
    const value = Number(step.value) || 0;
    const next = running + value;
    baseData.push(Math.min(running, next));
    const mark = `step:${step.id}`;
    valueData.push({
      value: Math.abs(value),
      mark,
      itemStyle: {
        color: value >= 0 ? palette.pos : palette.neg,
        borderRadius: 4,
        ...(isSelected(mark, selectedMarks) ? { borderColor: palette.fg, borderWidth: 2 } : {}),
      },
    });
    running = next;
  }
  baseData.push(0);
  valueData.push({
    value: running,
    mark: 'total:end',
    itemStyle: {
      color: palette.total,
      borderRadius: [6, 6, 0, 0],
      ...(isSelected('total:end', selectedMarks) ? { borderColor: palette.fg, borderWidth: 2 } : {}),
    },
  });
  return {
    ...base(palette, compact, opts.tooltip),
    xAxis: {
      type: 'category',
      data: categories,
      axisLine: { lineStyle: { color: palette.rule } },
      axisTick: { show: false },
      axisLabel: { ...axisText(palette, compact), show: !compact, interval: 0, rotate: compact ? 0 : 18 },
    },
    yAxis: {
      type: 'value',
      min: opts.axisLock?.y?.[0],
      max: opts.axisLock?.y?.[1],
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        ...axisText(palette, compact),
        show: !compact,
        formatter: (value: number) => DV.compute.fmtAxis(value, view.unit ?? {}),
      },
      splitLine: { lineStyle: { color: palette.rule, type: 'dashed' } },
    },
    series: [
      {
        type: 'bar',
        stack: 'waterfall',
        silent: true,
        itemStyle: { color: 'transparent' },
        emphasis: { itemStyle: { color: 'transparent' } },
        data: baseData,
      },
      {
        type: 'bar',
        stack: 'waterfall',
        barMaxWidth: compact ? 20 : 48,
        data: valueData,
        label: {
          show: !compact,
          position: 'top',
          color: palette.muted,
          fontFamily: palette.font,
          fontSize: 10,
          formatter: (p: { value: number }) => DV.compute.fmtAxis(Number(p.value), view.unit ?? {}),
        },
        emphasis: { focus: 'self' },
      },
    ],
  } as EChartsOption;
}

export function chartOption(view: View, palette: Palette, options: BuildOptions): EChartsOption {
  const data = view.data ?? {};
  switch (view.type) {
    case 'line':
      return lineOption(view, palette, options);
    case 'bar':
      return barOption(view, palette, options);
    case 'pie':
      return pieOption(view, palette, options);
    case 'scatter':
      return scatterOption(view, palette, options);
    case 'stacked':
      return barOption(view, palette, options, true);
    case 'heatmap':
      return heatmapOption(view, palette, options);
    case 'sankey':
      return sankeyOption(view, palette, options);
    case 'slope':
      return slopeOption(view, palette, options);
    case 'waterfall':
      return waterfallOption(view, palette, options);
    default:
      return { ...base(palette, !!options.compact), xAxis: { show: false }, yAxis: { show: false }, series: [{ type: 'line', data: data.series?.[0]?.values ?? [] }] } as EChartsOption;
  }
}
