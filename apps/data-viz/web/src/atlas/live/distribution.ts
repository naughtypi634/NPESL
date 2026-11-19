import type { Analysis, AnalyzeContext, Narrative, Stat } from './types';
import {
  encodingField,
  fieldLabelEn,
  fieldLabelZh,
  finiteValues,
  formatPercent,
  formatValue,
  mean,
  median,
  percentOf,
  quantile,
} from './util';

interface GroupStats {
  name: string;
  values: number[];
  median: number;
  q1: number;
  q3: number;
}

function groupStats(rows: AnalyzeContext['rows'], metric: string, groupField: string | null): GroupStats[] {
  const groups = new Map<string, number[]>();
  for (const { row, value } of finiteValues(rows, metric)) {
    const name = groupField ? String(row[groupField] ?? 'group') : 'All values';
    const list = groups.get(name) ?? [];
    list.push(value);
    groups.set(name, list);
  }
  return [...groups.entries()].map(([name, values]) => ({
    name,
    values,
    median: median(values),
    q1: quantile(values, 0.25),
    q3: quantile(values, 0.75),
  }));
}

export function analyzeDistribution(ctx: AnalyzeContext): Analysis | null {
  const metric =
    ctx.metric ||
    encodingField(ctx.spec, 'value') ||
    encodingField(ctx.spec, 'y') ||
    'value';
  const groupField = encodingField(ctx.spec, 'group');
  const values = finiteValues(ctx.rows, metric).map((item) => item.value);
  if (values.length < 2) return null;

  const groups = groupStats(ctx.rows, metric, groupField).sort((a, b) => b.median - a.median);
  const all = values;
  const med = median(all);
  const avg = mean(all);
  const q1 = quantile(all, 0.25);
  const q3 = quantile(all, 0.75);
  const iqr = q3 - q1;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const p95 = quantile(all, 0.95);
  const outliers = all.filter((value) => value < q1 - 1.5 * iqr || value > q3 + 1.5 * iqr);
  const sorted = [...all].sort((a, b) => a - b);
  const highest = sorted[sorted.length - 1];
  const lowest = sorted[0];
  const skew = iqr > 0 ? (avg - med) / (iqr || 1) : 0;
  const shape = Math.abs(skew) < 0.15 ? 'roughly symmetrical' : skew > 0 ? 'right-skewed' : 'left-skewed';
  const shapeZh = Math.abs(skew) < 0.15 ? '大致对称' : skew > 0 ? '右偏（长尾在高端）' : '左偏（长尾在低端）';
  const spreadPct = med !== 0 ? ((q3 - q1) / Math.abs(med)) * 100 : null;
  const unit = ctx.dataset.unit_short;

  const stats: Stat[] = [
    { labelEn: 'Median', labelZh: '中位数', value: formatValue(med, ctx.dataset, metric), noteEn: `${all.length} observations`, noteZh: `${all.length} 个观测值` },
    { labelEn: 'Middle half', labelZh: '中间一半', value: `${formatValue(q1, ctx.dataset, metric)} – ${formatValue(q3, ctx.dataset, metric)}`, noteEn: '25th to 75th percentile', noteZh: '第 25 到第 75 百分位' },
    { labelEn: 'Range', labelZh: '范围', value: `${formatValue(min, ctx.dataset, metric)} – ${formatValue(max, ctx.dataset, metric)}`, noteEn: `${formatValue(max - min, ctx.dataset, metric)} wide`, noteZh: `跨度为 ${formatValue(max - min, ctx.dataset, metric)}` },
    { labelEn: 'Outliers', labelZh: '离群值', value: String(outliers.length), noteEn: outliers.length ? `${formatPercent(percentOf(outliers.length, all.length) ?? 0)} of values` : 'none by the 1.5 IQR rule', noteZh: outliers.length ? `占 ${formatPercent(percentOf(outliers.length, all.length) ?? 0)}` : '按 1.5 倍四分位距判断，没有' },
  ];

  const observations: Narrative[] = [];
  if (ctx.chart === 'histogram') {
    observations.push({
      en: `The histogram peaks in the middle and leaves a long tail to the right: 95% of observations are at or below ${formatValue(p95, ctx.dataset, metric)}, while the maximum is ${formatValue(max, ctx.dataset, metric)}.`,
      zh: `直方图在中间形成峰值，右侧留出长尾：95% 的观测值不超过 ${formatValue(p95, ctx.dataset, metric)}，最高值是 ${formatValue(max, ctx.dataset, metric)}。`,
    });
  } else if (ctx.chart === 'beeswarm') {
    observations.push({
      en: `Each dot is one observation. Values cluster around the median of ${formatValue(med, ctx.dataset, metric)}, and the spread runs from ${formatValue(min, ctx.dataset, metric)} to ${formatValue(max, ctx.dataset, metric)}.`,
      zh: `每个点是一个观测值。数值围绕中位数 ${formatValue(med, ctx.dataset, metric)} 聚集，整体从 ${formatValue(min, ctx.dataset, metric)} 到 ${formatValue(max, ctx.dataset, metric)}。`,
    });
  } else if (ctx.chart === 'ridgeline' && groups.length > 1) {
    observations.push({
      en: `Each ridge is one group. The highest group median is ${groups[0].name} at ${formatValue(groups[0].median, ctx.dataset, metric)}; the lowest is ${groups[groups.length - 1].name} at ${formatValue(groups[groups.length - 1].median, ctx.dataset, metric)}.`,
      zh: `每条山脊是一个分组。中位数最高的是 ${groups[0].name}（${formatValue(groups[0].median, ctx.dataset, metric)}），最低的是 ${groups[groups.length - 1].name}（${formatValue(groups[groups.length - 1].median, ctx.dataset, metric)}）。`,
    });
  } else {
    observations.push({
      en: `The median is ${formatValue(med, ctx.dataset, metric)}: half of the observations sit below this value and half above it. The middle half runs from ${formatValue(q1, ctx.dataset, metric)} to ${formatValue(q3, ctx.dataset, metric)}.`,
      zh: `中位数是 ${formatValue(med, ctx.dataset, metric)}：一半观测值低于它，另一半高于它。中间一半落在 ${formatValue(q1, ctx.dataset, metric)} 到 ${formatValue(q3, ctx.dataset, metric)} 之间。`,
    });
  }
  observations.push(
    ...(groups.length > 1
      ? [{
          en: `${groups[0].name} has the highest median at ${formatValue(groups[0].median, ctx.dataset, metric)}; ${groups[groups.length - 1].name} has the lowest at ${formatValue(groups[groups.length - 1].median, ctx.dataset, metric)}.`,
          zh: `${groups[0].name}的中位数最高，为 ${formatValue(groups[0].median, ctx.dataset, metric)}；${groups[groups.length - 1].name}最低，为 ${formatValue(groups[groups.length - 1].median, ctx.dataset, metric)}。`,
        }]
      : [{
          en: `The average is ${formatValue(avg, ctx.dataset, metric)}, ${avg > med ? 'above' : avg < med ? 'below' : 'equal to'} the median.`,
          zh: `平均值是 ${formatValue(avg, ctx.dataset, metric)}，${avg > med ? '高于' : avg < med ? '低于' : '等于'}中位数。`,
        }]),
    {
      en: outliers.length
        ? `${outliers.length} ${outliers.length === 1 ? 'value is' : 'values are'} outside the middle range by the 1.5 IQR rule; the most extreme is ${formatValue(highest, ctx.dataset, metric)}.`
        : `No value falls far outside the middle range: the full spread runs from ${formatValue(lowest, ctx.dataset, metric)} to ${formatValue(highest, ctx.dataset, metric)}.`,
      zh: outliers.length
        ? `按 1.5 倍四分位距判断，有 ${outliers.length} 个值落在中间范围之外；最极端的是 ${formatValue(highest, ctx.dataset, metric)}。`
        : `没有值远远偏离中间范围：整体从 ${formatValue(lowest, ctx.dataset, metric)} 到 ${formatValue(highest, ctx.dataset, metric)}。`,
    },
  );

  return {
    kind: 'distribution',
    metric,
    metricLabelEn: fieldLabelEn(metric),
    metricLabelZh: fieldLabelZh(metric),
    unit,
    stats,
    observations,
    academic: {
      en: `The distribution of ${fieldLabelEn(metric)} across ${all.length} observations is ${shape}. The median is ${formatValue(med, ctx.dataset, metric)} and the mean is ${formatValue(avg, ctx.dataset, metric)}; the middle 50% lies between ${formatValue(q1, ctx.dataset, metric)} and ${formatValue(q3, ctx.dataset, metric)}. The values range from ${formatValue(min, ctx.dataset, metric)} to ${formatValue(max, ctx.dataset, metric)}${outliers.length ? `, with ${outliers.length} outlier${outliers.length === 1 ? '' : 's'}` : ''}. 95% of observations are at or below ${formatValue(p95, ctx.dataset, metric)}.`,
      zh: `${all.length} 个观测值的${fieldLabelZh(metric)}分布${shapeZh}。中位数为 ${formatValue(med, ctx.dataset, metric)}，平均数为 ${formatValue(avg, ctx.dataset, metric)}；中间 50% 位于 ${formatValue(q1, ctx.dataset, metric)} 到 ${formatValue(q3, ctx.dataset, metric)} 之间。整体范围从 ${formatValue(min, ctx.dataset, metric)} 到 ${formatValue(max, ctx.dataset, metric)}${outliers.length ? `，有 ${outliers.length} 个离群值` : ''}。95% 的观测值不超过 ${formatValue(p95, ctx.dataset, metric)}。`,
    },
    business: {
      en: `The typical value is ${formatValue(med, ctx.dataset, metric)}; the middle half runs from ${formatValue(q1, ctx.dataset, metric)} to ${formatValue(q3, ctx.dataset, metric)}${groups.length > 1 ? `. ${groups[0].name} is the highest group by median (${formatValue(groups[0].median, ctx.dataset, metric)}), while ${groups[groups.length - 1].name} is the lowest (${formatValue(groups[groups.length - 1].median, ctx.dataset, metric)})` : ''}. The most extreme value is ${formatValue(max, ctx.dataset, metric)}.`,
      zh: `典型值为 ${formatValue(med, ctx.dataset, metric)}；中间一半在 ${formatValue(q1, ctx.dataset, metric)} 到 ${formatValue(q3, ctx.dataset, metric)} 之间${groups.length > 1 ? `。按中位数看，${groups[0].name}最高（${formatValue(groups[0].median, ctx.dataset, metric)}），${groups[groups.length - 1].name}最低（${formatValue(groups[groups.length - 1].median, ctx.dataset, metric)}）` : ''}。最极端的值是 ${formatValue(max, ctx.dataset, metric)}。`,
    },
    everyday: {
      en: `A typical value is about ${formatValue(med, ctx.dataset, metric)}. Most values fall between ${formatValue(q1, ctx.dataset, metric)} and ${formatValue(q3, ctx.dataset, metric)}. The highest is ${formatValue(max, ctx.dataset, metric)}.`,
      zh: `典型值大约是 ${formatValue(med, ctx.dataset, metric)}。大多数值落在 ${formatValue(q1, ctx.dataset, metric)} 到 ${formatValue(q3, ctx.dataset, metric)} 之间，最高是 ${formatValue(max, ctx.dataset, metric)}。`,
    },
    highlight: groups.length > 1 ? groups[0].name : 'max',
    notes: [
      { en: 'The median is less affected by extreme values than the mean.', zh: '中位数比平均数更不容易被极端值拉偏。' },
      ...(spreadPct != null
        ? [{ en: `The middle half is about ${formatPercent(spreadPct)} of the median in width.`, zh: `中间一半的宽度约为中位数的 ${formatPercent(spreadPct)}。` }]
        : []),
    ],
  };
}
