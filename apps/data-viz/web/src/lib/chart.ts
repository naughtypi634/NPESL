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
import type { ChartOptions, Unit, View, ViewData } from '../data/types';

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

interface BuildOptions extends ChartOptions {
  selected?: string | null;
  compact?: boolean;
  units?: Unit;
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

function tooltipOf(palette: Palette, compact = false): Record<string, unknown> {
  if (compact) return { show: false };
  return {
    trigger: 'item',
    backgroundColor: palette.pane,
    borderColor: palette.rule,
    borderWidth: 1,
    padding: [8, 10],
    textStyle: { color: palette.fg, fontFamily: palette.font, fontSize: 12 },
    extraCssText: 'border-radius: 12px; box-shadow: 0 12px 32px -14px rgba(0,0,0,.35);',
  };
}

function base(palette: Palette, compact = false): Record<string, unknown> {
  return {
    animation: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    animationDuration: compact ? 250 : 420,
    animationEasing: 'cubicOut',
    textStyle: { fontFamily: palette.font, color: palette.muted },
    grid: gridOf(compact),
    tooltip: tooltipOf(palette, compact),
  };
}

function selectedStyle(mark: string, selected: string | null | undefined, palette: Palette): Record<string, unknown> | undefined {
  if (selected !== mark) return undefined;
  return { borderColor: palette.fg, borderWidth: 2 };
}

function lineOption(view: View, palette: Palette, opts: BuildOptions): EChartsOption {
  const data = view.data ?? {};
  const xs = (data.x?.values ?? []).map(String);
  const selected = opts.selected ?? null;
  const compact = !!opts.compact;
  const series = (data.series ?? []).map((s, index) => {
    const color = palette.series[index % palette.series.length];
    const items = s.values.map((value, i) => {
      const mark = `pt:${s.id}:${i}`;
      const highlight = mark === selected;
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
      smooth: opts.smooth,
      symbol: 'circle',
      symbolSize: compact ? 3 : 7,
      lineStyle: { width: compact ? 1.8 : 2.6, color },
      itemStyle: { color, borderColor: palette.pane, borderWidth: 1 },
      emphasis: { focus: 'series' },
    };
    if (selected && selected.startsWith('seg:')) {
      const [, seriesId, indexText] = selected.split(':');
      const i = Number(indexText);
      if (seriesId === s.id && xs[i] != null && xs[i + 1] != null) {
        item.markArea = {
          silent: true,
          itemStyle: { color: alpha(color, 0.14) },
          data: [[{ xAxis: xs[i] }, { xAxis: xs[i + 1] }]],
        };
      }
    }
    return item;
  });
  return {
    ...base(palette, compact),
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

function orderedBarIndices(data: ViewData, sort: ChartOptions['sort']): number[] | null {
  if (sort === 'none' || !data.x?.values) return null;
  const values = (data.series ?? []).map((s) => s.values);
  const totals = data.x.values.map((_, i) => values.reduce((sum, list) => sum + (Number(list[i]) || 0), 0));
  const indices = data.x.values.map((_, i) => i);
  indices.sort((a, b) => (sort === 'asc' ? totals[a] - totals[b] : totals[b] - totals[a]));
  return indices;
}

function barOption(view: View, palette: Palette, opts: BuildOptions, stacked = false): EChartsOption {
  const data = view.data ?? {};
  const compact = !!opts.compact;
  const selected = opts.selected ?? null;
  const percent = stacked && (opts.percent || data.mode === 'percent');
  const indices = orderedBarIndices(data, opts.sort);
  const pick = <T,>(list: T[], i: number): T => (indices ? list[indices[i]] : list[i]);
  const count = data.x?.values?.length ?? 0;
  const xs = Array.from({ length: count }, (_, i) => String(pick(data.x?.values ?? [], i)));
  const totals = Array.from({ length: count }, (_, i) =>
    (data.series ?? []).reduce((sum, s) => sum + (Number(pick(s.values, i)) || 0), 0),
  );
  const series = (data.series ?? []).map((s, index) => {
    const color = palette.series[index % palette.series.length];
    const items = Array.from({ length: count }, (_, i) => {
      const xIndex = indices ? indices[i] : i;
      const raw = Number(s.values[xIndex]) || 0;
      const value = percent ? (totals[i] ? (raw / totals[i]) * 100 : 0) : raw;
      const mark = stacked ? `seg:${xIndex}:${s.id}` : `bar:${s.id}:${xIndex}`;
      const stackHighlight = selected === `stack:${xIndex}`;
      return {
        value,
        mark,
        itemStyle: selectedStyle(mark, selected, palette) ?? (stackHighlight ? { borderColor: palette.fg, borderWidth: 2 } : undefined),
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
        show: !stacked && opts.labels && !compact,
        position: 'top',
        color: palette.muted,
        fontFamily: palette.font,
        fontSize: 10,
        formatter: (p: { value: number }) => DV.compute.fmtAxis(Number(p.value), view.unit ?? {}),
      },
    };
  });
  return {
    ...base(palette, compact),
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
      max: percent ? 100 : undefined,
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
  const selected = opts.selected ?? null;
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
        ...(selectedStyle(mark, selected, palette) ?? {}),
      },
    };
  });
  return {
    ...base(palette, compact),
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
        radius: compact ? ['10%', '78%'] : ['38%', '70%'],
        center: ['50%', compact ? '50%' : '44%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: palette.pane, borderWidth: 2 },
        label: {
          show: !compact && opts.labels,
          color: palette.muted,
          fontFamily: palette.font,
          fontSize: 11,
          formatter: '{b} {d}%',
        },
        labelLine: { show: !compact && opts.labels, lineStyle: { color: palette.rule } },
        emphasis: { scale: true, scaleSize: 6, label: { show: true, color: palette.fg } },
        data: items,
      },
    ],
  } as EChartsOption;
}

function scatterOption(view: View, palette: Palette, opts: BuildOptions): EChartsOption {
  const data = view.data ?? {};
  const compact = !!opts.compact;
  const selected = opts.selected ?? null;
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
        const highlight = selected === mark || selected === `grp:${groupId}` || selected === 'all';
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
    ...base(palette, compact),
    xAxis: {
      type: 'value',
      name: compact ? '' : data.x?.label_en ?? '',
      nameTextStyle: { color: palette.muted, fontFamily: palette.font, fontSize: 11 },
      axisLine: { lineStyle: { color: palette.rule } },
      axisTick: { show: false },
      axisLabel: { ...axisText(palette, compact), show: !compact },
      splitLine: { lineStyle: { color: palette.rule, type: 'dashed' } },
    },
    yAxis: {
      type: 'value',
      name: compact ? '' : data.y?.label_en ?? '',
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
  const selected = opts.selected ?? null;
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
        selected === mark || selected === `row:${row.id}` || selected === `col:${col.id}`;
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
    ...base(palette, compact),
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
          show: !compact && opts.labels,
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
  const selected = opts.selected ?? null;
  const nodes = data.nodes ?? [];
  const links = data.links ?? [];
  return {
    ...base(palette, compact),
    series: [
      {
        type: 'sankey',
        left: compact ? 2 : 8,
        right: compact ? 2 : 96,
        top: compact ? 6 : 18,
        bottom: compact ? 6 : 18,
        nodeWidth: compact ? 6 : 10,
        nodeGap: compact ? 6 : 10,
        draggable: false,
        emphasis: { focus: 'adjacency' },
        label: {
          show: !compact,
          color: palette.fg,
          fontFamily: palette.font,
          fontSize: 11,
          position: 'right',
        },
        lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.32 },
        itemStyle: { borderWidth: 0, borderRadius: 4 },
        data: nodes.map((node, index) => {
          const mark = `node:${node.id}`;
          return {
            name: node.name_en,
            mark,
            itemStyle: {
              color: palette.series[index % palette.series.length],
              borderColor: selected === mark ? palette.fg : 'transparent',
              borderWidth: selected === mark ? 2 : 0,
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
            lineStyle: selected === mark ? { opacity: 0.9, width: 3 } : undefined,
          };
        }),
      },
    ],
  } as EChartsOption;
}

function slopeOption(view: View, palette: Palette, opts: BuildOptions): EChartsOption {
  const data = view.data ?? {};
  const compact = !!opts.compact;
  const selected = opts.selected ?? null;
  const periods = (data.periods ?? []).map((period) => period.label_en ?? '');
  const entities = data.entities ?? [];
  const series = entities.map((entity, index) => {
    const color = palette.series[index % palette.series.length];
    const dim = selected?.startsWith('line:') && selected !== `line:${entity.id}`;
    return {
      type: 'line',
      name: entity.name_en,
      data: entity.values.map((value, periodIndex) => {
        const mark = `pt:${entity.id}:${periodIndex}`;
        const highlight = selected === mark || selected === `line:${entity.id}`;
        return {
          value,
          mark,
          symbolSize: highlight ? (compact ? 6 : 11) : compact ? 3 : 6,
          itemStyle: highlight ? { borderColor: palette.fg, borderWidth: 2 } : undefined,
        };
      }),
      symbol: 'circle',
      lineStyle: { width: selected === `line:${entity.id}` ? 4 : 2.4, color, opacity: dim ? 0.3 : 1 },
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
    ...base(palette, compact),
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
  const selected = opts.selected ?? null;
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
      ...(selected === 'total:start' ? { borderColor: palette.fg, borderWidth: 2 } : {}),
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
        ...(selected === mark ? { borderColor: palette.fg, borderWidth: 2 } : {}),
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
      ...(selected === 'total:end' ? { borderColor: palette.fg, borderWidth: 2 } : {}),
    },
  });
  return {
    ...base(palette, compact),
    xAxis: {
      type: 'category',
      data: categories,
      axisLine: { lineStyle: { color: palette.rule } },
      axisTick: { show: false },
      axisLabel: { ...axisText(palette, compact), show: !compact, interval: 0, rotate: compact ? 0 : 18 },
    },
    yAxis: {
      type: 'value',
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
          show: opts.labels && !compact,
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
