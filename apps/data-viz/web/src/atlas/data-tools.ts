import type { ChartSpec } from 'ztd-charts';
import type { DatasetMeta } from './types';

export type ChartRow = Record<string, unknown>;

export function getChartRows(spec: ChartSpec): ChartRow[] {
  const data = spec.data;
  if (Array.isArray(data)) return data as ChartRow[];
  if (data && typeof data === 'object' && 'values' in data && Array.isArray(data.values)) {
    return data.values as ChartRow[];
  }
  return [];
}

export function specWithRows(spec: ChartSpec, rows: ChartRow[]): ChartSpec {
  return { ...spec, data: rows } as ChartSpec;
}

export function getNumericFields(rows: ChartRow[]): string[] {
  if (!rows.length) return [];
  const fields = new Set<string>();
  for (const row of rows) {
    for (const [field, value] of Object.entries(row)) {
      if (typeof value === 'number' && Number.isFinite(value)) fields.add(field);
    }
  }
  return [...fields];
}

const METRIC_PRIORITIES = [
  'value', 'y', 'close', 'actual', 'score', 'progress', 'sales', 'share', 'users',
  'visits', 'arrivals', 'teu', 'minutes', 'rate', 'change', 'active', 'amount',
  'rank', 'price', 'spend', 'conversions', 'orders', 'start', 'end', 'open', 'high', 'low',
];

export function getPreferredMetric(spec: ChartSpec, rows: ChartRow[]): string {
  const numeric = getNumericFields(rows);
  if (!numeric.length) return '';
  const encoding = spec.encoding ?? {};
  const encodingFields = ['value', 'y', 'close', 'actual', 'rank', 'size', 'volume', 'start', 'end', 'open', 'high', 'low', 'x']
    .flatMap((channel) => {
      const value = encoding[channel];
      return value == null ? [] : Array.isArray(value) ? value : [value];
    })
    .filter((field): field is string => typeof field === 'string');
  const candidates = [...encodingFields, ...METRIC_PRIORITIES, ...numeric];
  return candidates.find((field) => numeric.includes(field)) ?? numeric[0];
}

/** Numeric fields worth offering in the "Describe" selector. */
export function describeMetrics(chart: string, spec: ChartSpec, rows: ChartRow[]): string[] {
  if (chart === 'sparkTable' || chart === 'parallel' || chart === 'barRace') return [];
  if (chart === 'candlestick') return ['close'];
  if (chart === 'scatter' || chart === 'bubble') {
    const y = spec.encoding?.y;
    return typeof y === 'string' ? [y] : [];
  }
  if (chart === 'cohort') {
    const value = spec.encoding?.value;
    return typeof value === 'string' ? [value] : [];
  }
  if (chart === 'heatmap') {
    const value = spec.encoding?.value;
    return typeof value === 'string' ? [value] : [];
  }
  const numeric = getNumericFields(rows);
  const ignored = new Set(['size', 'target', 'volume', 'lon', 'lat', 'start', 'end', 'open', 'high', 'low', 'before', 'after']);
  const useful = numeric.filter((field) => !ignored.has(field));
  return useful.length ? useful : numeric;
}

export function seriesField(spec: ChartSpec): string {
  const series = spec.encoding?.series;
  return typeof series === 'string' ? series : '';
}

export function encodingFieldsOf(spec: ChartSpec): string[] {
  const out = new Set<string>();
  for (const value of Object.values(spec.encoding ?? {})) {
    if (typeof value === 'string') out.add(value);
    else if (Array.isArray(value)) value.filter((item): item is string => typeof item === 'string').forEach((item) => out.add(item));
  }
  return [...out];
}

export function isNumericField(field: string, rows: ChartRow[]): boolean {
  return rows.some((row) => typeof row[field] === 'number' && Number.isFinite(row[field] as number));
}

export function fieldZh(field: string): string {
  const map: Record<string, string> = {
    quarter: '季度', region: '地区', sales: '销售额', month: '月份', channel: '渠道',
    source: '来源', target: '流向', value: '数值', stage: '环节', users: '人数',
    label: '名称', region_name: '地区', country: '国家', state: '州', city: '城市',
    date: '日期', open: '开盘', high: '最高', low: '最低', close: '收盘', volume: '成交量',
    metric: '指标', week: '周', target_value: '目标', actual: '实际', goal: '目标',
    progress: '进度', score: '得分', axis: '维度', product: '产品', cohort: '同期群',
    period: '期数', active: '活跃数', size: '规模', item: '项目', amount: '金额',
    kind: '类型', step: '步骤', start: '开始', end: '结束', state_status: '状态',
    brand: '品牌', before: '之前', after: '之后', mode: '方式', share: '份额',
    visits: '访问量', keyword: '关键词', feature: '功能', app: '应用', rank: '排名',
    model: '型号', price: '价格', weight: '重量', battery: '续航', perf: '性能',
    screen: '屏幕', spend: '花费', conversions: '转化', cpa: '获客成本', roas: '回报率',
    minutes: '时长', order: '订单', day: '星期', hour: '小时', orders: '订单量',
    arrivals: '游客数', teu: '集装箱量', rate: '比例', change: '变化', service: '服务',
    group: '分组', device: '设备', x: '横轴', y: '纵轴',
  };
  return map[field] ?? field;
}

export interface EditColumn {
  field: string;
  label: string;
  labelZh: string;
  numeric: boolean;
  span: 'x' | 'series' | 'group' | 'measure' | 'other';
}

export function editColumns(spec: ChartSpec, rows: ChartRow[]): EditColumn[] {
  const fields = encodingFieldsOf(spec).filter((field) =>
    rows.some((row) => row[field] != null && row[field] !== ''),
  );
  const dimensions = Array.isArray(spec.options?.dimensions)
    ? spec.options.dimensions.filter((item): item is string => typeof item === 'string')
    : [];
  const chosen = fields.length ? [...new Set([...fields, ...dimensions])] : Object.keys(rows[0] ?? {});
  const series = seriesField(spec);
  const rank = (field: string) => (
    field === spec.encoding?.x || field === spec.encoding?.date ? 0
      : field === series ? 1
        : field === spec.encoding?.group ? 2
          : isNumericField(field, rows) ? 3
            : 4
  );
  chosen.sort((a, b) => rank(a) - rank(b));
  return chosen.map((field) => ({
    field,
    label: field.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' '),
    labelZh: fieldZh(field),
    numeric: isNumericField(field, rows),
    span: field === series ? 'series' : field === spec.encoding?.x || field === spec.encoding?.date ? 'x' : field === spec.encoding?.group ? 'group' : isNumericField(field, rows) ? 'measure' : 'other',
  }));
}

export function datasetDecimals(dataset: DatasetMeta): number {
  const raw = dataset as unknown as { decimals?: number };
  return typeof raw.decimals === 'number' ? raw.decimals : 0;
}
