import type { ChartSpec } from 'ztd-charts';
import type { DatasetMeta } from '../types';

export type ChartRow = Record<string, unknown>;

export interface Narrative {
  en: string;
  zh: string;
}

export interface Stat {
  labelEn: string;
  labelZh: string;
  value: string;
  noteEn?: string;
  noteZh?: string;
}

export interface Analysis {
  kind: string;
  metric: string;
  metricLabelEn: string;
  metricLabelZh: string;
  unit: string;
  stats: Stat[];
  observations: Narrative[];
  academic: Narrative;
  business: Narrative;
  everyday: Narrative;
  notes: Narrative[];
  highlight?: string | number | 'max' | 'min' | 'none';
}

export interface AnalyzeContext {
  chart: string;
  spec: ChartSpec;
  rows: ChartRow[];
  dataset: DatasetMeta;
  metric: string;
}

export type Analyzer = (ctx: AnalyzeContext) => Analysis | null;
