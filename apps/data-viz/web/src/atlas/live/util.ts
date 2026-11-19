import type { ChartSpec } from 'ztd-charts';
import type { DatasetMeta } from '../types';
import type { ChartRow } from './types';

export type { ChartRow };

export type NumberRow = { row: ChartRow; index: number; value: number };

export const FIELD_ZH: Record<string, string> = {
  sales: '销售额',
  share: '份额',
  users: '用户数',
  visits: '访问量',
  minutes: '时长',
  arrivals: '游客人数',
  teu: '集装箱量',
  rate: '比例',
  change: '变化率',
  active: '活跃用户',
  amount: '金额',
  rank: '排名',
  price: '价格',
  spend: '花费',
  conversions: '转化数',
  orders: '订单量',
  progress: '目标进度',
  score: '得分',
  target: '目标值',
  actual: '实际值',
  value: '数值',
  hours: '小时数',
  cups: '杯数',
  size: '规模',
  close: '收盘价',
  open: '开盘价',
  high: '最高价',
  low: '最低价',
  volume: '成交量',
  cpa: '获客成本',
  roas: '广告回报率',
  perf: '性能分',
  battery: '续航',
  weight: '重量',
  screen: '屏幕尺寸',
  month: '月份',
  week: '周',
  day: '日期',
  quarter: '季度',
  year: '年份',
  city: '城市',
  country: '国家',
  region: '地区',
  state: '州',
  source: '来源',
  stage: '环节',
  metric: '指标',
  goal: '目标',
  app: '应用',
  model: '型号',
  product: '产品',
  category: '类别',
  service: '服务',
  channel: '渠道',
  device: '设备',
  group: '分组',
  label: '名称',
  cohort: '同期群',
  period: '期数',
  status: '状态',
  step: '步骤',
  item: '项目',
  keyword: '关键词',
  mode: '方式',
  brand: '品牌',
};

const FIELD_EN: Record<string, string> = {
  cpa: 'cost per acquisition',
  roas: 'return on ad spend',
  teu: 'TEU',
  progress: 'progress',
  rate: 'rate',
  minutes: 'minutes',
  active: 'active users',
  change: 'change',
  users: 'users',
  visits: 'visits',
  sales: 'sales',
  share: 'share',
  amount: 'amount',
  score: 'score',
  value: 'value',
  rank: 'rank',
  size: 'size',
};

export function fieldLabelEn(field: string): string {
  return FIELD_EN[field] ?? field.replace(/[_-]+/g, ' ');
}

export function fieldLabelZh(field: string): string {
  return FIELD_ZH[field] ?? field;
}

export function decimalsOf(dataset: DatasetMeta, field = ''): number {
  if (field === 'weight') return 2;
  if (field === 'screen') return 1;
  if (field === 'share' || field === 'progress' || field === 'rate') return 1;
  const raw = dataset as unknown as { decimals?: number };
  if (typeof raw.decimals === 'number') return Math.max(0, Math.min(4, raw.decimals));
  return 0;
}

export function formatNumber(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  }).format(value);
}

export function unitSuffix(dataset: DatasetMeta): string {
  const short = dataset.unit_short?.trim();
  if (!short) return '';
  if (short === '%') return '%';
  if (/^[kKmMbB]$/.test(short)) return short;
  return ` ${short}`;
}

export function formatValue(value: number, dataset: DatasetMeta, field = ''): string {
  return `${formatNumber(value, decimalsOf(dataset, field))}${unitSuffix(dataset)}`;
}

export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '0%';
  const rounded = Number(value.toFixed(digits));
  return `${formatNumber(rounded, rounded % 1 === 0 ? 0 : digits)}%`;
}

export function formatChange(value: number, dataset: DatasetMeta, field = ''): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${formatValue(Math.abs(value), dataset, field)}`;
}

export function formatPointGap(value: number, dataset: DatasetMeta): string {
  const amount = formatNumber(Math.abs(value), decimalsOf(dataset));
  return dataset.unit_short === '%' ? `${amount} percentage points` : formatValue(Math.abs(value), dataset);
}

export function finiteValues(rows: ChartRow[], field: string): NumberRow[] {
  return rows.flatMap((row, index) => {
    const value = row[field];
    return typeof value === 'number' && Number.isFinite(value) ? [{ row, index, value }] : [];
  });
}

export function numericFields(rows: ChartRow[]): string[] {
  if (!rows.length) return [];
  const fields = new Set<string>();
  for (const row of rows) {
    for (const [field, value] of Object.entries(row)) {
      if (typeof value === 'number' && Number.isFinite(value)) fields.add(field);
    }
  }
  return [...fields];
}

export function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function quantile(values: number[], q: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  return sorted[base + 1] !== undefined
    ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
    : sorted[base];
}

export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

export function correlationWord(r: number): { en: string; zh: string; strength: string } {
  const abs = Math.abs(r);
  const strength = abs < 0.2 ? 'very weak' : abs < 0.4 ? 'weak' : abs < 0.6 ? 'moderate' : abs < 0.8 ? 'strong' : 'very strong';
  const direction = r > 0 ? 'positive' : 'negative';
  return {
    en: `${strength} ${direction}`,
    zh: `${strength === 'very weak' ? '极弱' : strength === 'weak' ? '弱' : strength === 'moderate' ? '中等' : strength === 'strong' ? '强' : '极强'}${r > 0 ? '正' : '负'}相关`,
    strength,
  };
}

export function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

export function prettyField(field: string): string {
  return field
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase();
}

export function encodingField(spec: ChartSpec, channel: string): string | null {
  const value = spec.encoding?.[channel];
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return null;
}

export function encodingFields(spec: ChartSpec, channel: string): string[] {
  const value = spec.encoding?.[channel];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return [];
}

const LABEL_CHANNELS = [
  'label', 'region', 'stage', 'country', 'city', 'brand', 'mode', 'keyword', 'feature',
  'goal', 'metric', 'item', 'date', 'month', 'quarter', 'week', 'year', 'day', 'cohort',
  'app', 'model', 'product', 'category', 'service', 'state', 'channel', 'device',
  'x', 'group', 'source', 'step', 'kpi',
];

export function labelField(spec: ChartSpec): string | null {
  for (const channel of LABEL_CHANNELS) {
    const field = encodingField(spec, channel);
    if (field) return field;
  }
  return null;
}

export function rowLabel(row: ChartRow, spec: ChartSpec, metric = ''): string {
  const field = labelField(spec);
  if (field && row[field] != null && String(row[field]).trim()) {
    return String(row[field]);
  }
  const text = Object.entries(row)
    .filter(([key, value]) => key !== metric && typeof value === 'string' && String(value).trim())
    .slice(0, 2)
    .map(([, value]) => String(value));
  return text.join(' · ') || 'item';
}

export function rowKey(row: ChartRow): string {
  return Object.entries(row)
    .filter(([, value]) => typeof value === 'string' || typeof value === 'number')
    .map(([key, value]) => `${key}:${String(value)}`)
    .join('|');
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function percentOf(part: number, total: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total === 0) return null;
  return (part / total) * 100;
}

export function changePct(from: number, to: number): number | null {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return null;
  return ((to - from) / Math.abs(from)) * 100;
}

export function trendWord(from: number, to: number, tolerance = 0.005): { en: string; zh: string } {
  const scale = Math.max(Math.abs(from), Math.abs(to), 1);
  const diff = to - from;
  if (Math.abs(diff) / scale < tolerance) return { en: 'stayed almost flat', zh: '基本持平' };
  return diff > 0 ? { en: 'rose', zh: '上升' } : { en: 'fell', zh: '下降' };
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}

export function joinEn(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

export function directionBetterDown(field: string, metrics?: Record<string, unknown>): boolean {
  if (metrics && metrics[field] && typeof metrics[field] === 'object') {
    const better = (metrics[field] as { better?: string }).better;
    if (better === 'down') return true;
    if (better === 'up') return false;
  }
  return /churn|cost|cpa|time|latency|rank|drop|risk|expense|debt|wait/i.test(field);
}
