import type { ChartSpec } from 'ztd-charts';
import type { Analysis, AnalyzeContext } from './types';
import { analyzeCategory } from './category';
import { analyzeCalendar, analyzeHorizon, analyzeSkyline, analyzeTime } from './time';
import { analyzeDistribution } from './distribution';
import { analyzeHeatmap, analyzeParallel, analyzeScatter } from './relationship';
import { analyzeConnections, analyzeFunnel, analyzeSankey } from './flow';
import { analyzeFlowMap, analyzeRegionMap, analyzeSymbolMap } from './map';
import { analyzeBullet, analyzeGauge, analyzeRadialBar, analyzeSparkTable } from './kpi';
import {
  analyzeBump,
  analyzeCandlestick,
  analyzeCohort,
  analyzeDumbbell,
  analyzeMarimekko,
  analyzeRadar,
  analyzeSlope,
  analyzeTimeline,
  analyzeWaterfall,
} from './special';

const CATEGORY = new Set(['pie', 'donut', 'waffle', 'segmented', 'lollipop', 'pareto']);
const HIERARCHY = new Set(['treemap', 'sunburst']);
const TIME = new Set(['line', 'area', 'stream', 'sparkline', 'horizon', 'skyline', 'barRace']);
const DISTRIBUTION = new Set(['beeswarm', 'ridgeline', 'box', 'histogram']);
const RELATIONSHIP = new Set(['scatter', 'bubble', 'heatmap', 'parallel']);
const REGION_MAP = new Set(['tileMap', 'choropleth']);
const KPI = new Set(['gauge', 'bullet', 'radialBar', 'sparkTable']);
const SPECIAL: Record<string, (ctx: AnalyzeContext) => Analysis | null> = {
  waterfall: analyzeWaterfall,
  radar: analyzeRadar,
  marimekko: analyzeMarimekko,
  candlestick: analyzeCandlestick,
  timeline: analyzeTimeline,
  bump: analyzeBump,
  slope: analyzeSlope,
  dumbbell: analyzeDumbbell,
  cohort: analyzeCohort,
};

function withEncoding(ctx: AnalyzeContext, encoding: Record<string, string>): AnalyzeContext {
  return {
    ...ctx,
    spec: { ...ctx.spec, encoding: { ...(ctx.spec.encoding ?? {}), ...encoding } },
  };
}

export function analyzeChart(ctx: AnalyzeContext): Analysis | null {
  try {
    if (CATEGORY.has(ctx.chart)) {
      return analyzeCategory(ctx, ctx.chart === 'pareto' || ctx.chart === 'lollipop' ? 'ranking' : 'proportion');
    }
    if (HIERARCHY.has(ctx.chart)) return analyzeCategory(ctx, 'hierarchy');
    if (ctx.chart === 'tree') return analyzeCategory(ctx, 'hierarchy');
    if (ctx.chart === 'bar') {
      const hasSeries = Boolean(ctx.spec.encoding?.series);
      const hasTime = Boolean(ctx.spec.encoding?.x);
      return hasSeries && hasTime ? analyzeTime(ctx) : analyzeCategory(ctx, 'ranking');
    }
    if (ctx.chart === 'barRace') {
      return analyzeTime(withEncoding(ctx, {
        x: String(ctx.spec.encoding?.frame ?? 'frame'),
        series: String(ctx.spec.encoding?.label ?? 'label'),
        y: String(ctx.spec.encoding?.value ?? 'value'),
      }));
    }
    if (ctx.chart === 'calendar') return analyzeCalendar(ctx);
    if (ctx.chart === 'horizon') return analyzeHorizon(ctx);
    if (ctx.chart === 'skyline') return analyzeSkyline(ctx);
    if (TIME.has(ctx.chart)) return analyzeTime(ctx);
    if (DISTRIBUTION.has(ctx.chart)) return analyzeDistribution(ctx);
    if (RELATIONSHIP.has(ctx.chart)) {
      if (ctx.chart === 'heatmap') return analyzeHeatmap(ctx);
      if (ctx.chart === 'parallel') return analyzeParallel(ctx);
      return analyzeScatter(ctx);
    }
    if (ctx.chart === 'funnel') return analyzeFunnel(ctx);
    if (ctx.chart === 'sankey') return analyzeSankey(ctx);
    if (ctx.chart === 'chord' || ctx.chart === 'network') return analyzeConnections(ctx);
    if (REGION_MAP.has(ctx.chart)) return analyzeRegionMap(ctx);
    if (ctx.chart === 'symbolMap') return analyzeSymbolMap(ctx);
    if (ctx.chart === 'flowMap') return analyzeFlowMap(ctx);
    if (KPI.has(ctx.chart)) {
      if (ctx.chart === 'gauge') return analyzeGauge(ctx);
      if (ctx.chart === 'bullet') return analyzeBullet(ctx);
      if (ctx.chart === 'radialBar') return analyzeRadialBar(ctx);
      return analyzeSparkTable(ctx);
    }
    const special = SPECIAL[ctx.chart];
    if (special) return special(ctx);
    return null;
  } catch (error) {
    if (import.meta.env.DEV) console.warn(`Could not analyze chart ${ctx.chart}`, error);
    return null;
  }
}

export function specWithAnalysis(spec: ChartSpec, rows: AnalyzeContext['rows'], analysis: Analysis | null): ChartSpec {
  const options = { ...(spec.options ?? {}) };
  if (analysis?.highlight != null) options.highlight = analysis.highlight;
  return { ...spec, data: rows, options } as ChartSpec;
}

export type { Analysis, AnalyzeContext, ChartRow, Narrative, Stat } from './types';
