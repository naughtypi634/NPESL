import type { Analysis, AnalyzeContext, Narrative, Stat } from './types';
import {
  directionBetterDown,
  encodingField,
  fieldLabelEn,
  fieldLabelZh,
  formatPercent,
  formatValue,
  percentOf,
  sum,
} from './util';

function valueField(ctx: AnalyzeContext): string {
  return ctx.metric || encodingField(ctx.spec, 'value') || encodingField(ctx.spec, 'actual') || 'value';
}

function targetField(ctx: AnalyzeContext): string {
  return encodingField(ctx.spec, 'target') || 'target';
}

function metricMap(ctx: AnalyzeContext): Record<string, unknown> | undefined {
  return ctx.spec.options?.metrics as Record<string, unknown> | undefined;
}

export function analyzeGauge(ctx: AnalyzeContext): Analysis | null {
  const valueKey = valueField(ctx);
  const targetKey = targetField(ctx);
  const row = ctx.rows[0];
  if (!row) return null;
  const value = typeof row[valueKey] === 'number' ? (row[valueKey] as number) : null;
  const target = typeof row[targetKey] === 'number' ? (row[targetKey] as number) : null;
  if (value == null) return null;
  const gap = target == null ? null : value - target;
  const pct = target == null ? null : percentOf(value, target);
  const down = directionBetterDown(valueKey, metricMap(ctx));
  const good = gap == null ? null : down ? gap <= 0 : gap >= 0;
  const gapText = gap == null ? 'no target' : `${gap >= 0 ? '+' : '−'}${formatValue(Math.abs(gap), ctx.dataset, valueKey)}`;
  const unit = ctx.dataset.unit_short;
  const stats: Stat[] = [
    { labelEn: 'Actual', labelZh: '实际值', value: formatValue(value, ctx.dataset, valueKey), noteEn: fieldLabelEn(valueKey), noteZh: fieldLabelZh(valueKey) },
    { labelEn: 'Target', labelZh: '目标', value: target == null ? '—' : formatValue(target, ctx.dataset, valueKey), noteEn: target == null ? 'not set' : 'target', noteZh: target == null ? '未设置' : '目标值' },
    { labelEn: 'Gap', labelZh: '差距', value: gapText, noteEn: good == null ? '' : good ? 'meeting the target' : 'missing the target', noteZh: good == null ? '' : good ? '达到目标' : '未达目标' },
    { labelEn: 'Target reached', labelZh: '目标达成', value: pct == null ? '—' : formatPercent(pct), noteEn: down ? 'lower is better' : 'higher is better', noteZh: down ? '越低越好' : '越高越好' },
  ];
  return {
    kind: 'kpi',
    metric: valueKey,
    metricLabelEn: fieldLabelEn(valueKey),
    metricLabelZh: fieldLabelZh(valueKey),
    unit,
    stats,
    observations: [
      { en: `The current value is ${formatValue(value, ctx.dataset, valueKey)}${target == null ? '' : ` against a target of ${formatValue(target, ctx.dataset, valueKey)}`}.`, zh: `当前值为 ${formatValue(value, ctx.dataset, valueKey)}${target == null ? '' : `，目标是 ${formatValue(target, ctx.dataset, valueKey)}`}。` },
      { en: gap == null ? 'No target is set, so the gauge shows the level only.' : `The gap is ${gapText}: the gauge is ${good ? 'meeting' : 'missing'} its target${pct == null ? '' : ` and has reached ${formatPercent(pct)} of it`}.`, zh: gap == null ? '没有设置目标，仪表盘只显示当前水平。' : `差距为 ${gapText}：仪表盘${good ? '达到' : '未达到'}目标${pct == null ? '' : `，已完成目标的 ${formatPercent(pct)}`}。` },
    ],
    academic: {
      en: target == null
        ? `The gauge reports ${fieldLabelEn(valueKey)} at ${formatValue(value, ctx.dataset, valueKey)}. No target is shown, so the chart describes the current level only.`
        : `The gauge reports ${fieldLabelEn(valueKey)} at ${formatValue(value, ctx.dataset, valueKey)} against a target of ${formatValue(target, ctx.dataset, valueKey)}. The value is ${gapText} relative to the target, or ${formatPercent(pct ?? 0)} of it; ${good ? 'the target has been met' : 'the target has not been met'}.`,
      zh: target == null
        ? `仪表盘显示${fieldLabelZh(valueKey)}为 ${formatValue(value, ctx.dataset, valueKey)}。没有目标值，因此只描述当前水平。`
        : `仪表盘显示${fieldLabelZh(valueKey)}为 ${formatValue(value, ctx.dataset, valueKey)}，目标是 ${formatValue(target, ctx.dataset, valueKey)}。当前值相对目标为 ${gapText}，即目标的 ${formatPercent(pct ?? 0)}；${good ? '已达到目标' : '尚未达到目标'}。`,
    },
    business: {
      en: `${fieldLabelEn(valueKey)} is at ${formatValue(value, ctx.dataset, valueKey)}${target == null ? '' : `, ${good ? 'ahead of' : 'behind'} the ${formatValue(target, ctx.dataset, valueKey)} target`}.`,
      zh: `${fieldLabelZh(valueKey)}为 ${formatValue(value, ctx.dataset, valueKey)}${target == null ? '' : `，${good ? '高于' : '低于'} ${formatValue(target, ctx.dataset, valueKey)} 的目标`}。`,
    },
    everyday: {
      en: target == null
        ? `The value is ${formatValue(value, ctx.dataset, valueKey)}.`
        : `The value is ${formatValue(value, ctx.dataset, valueKey)}; the goal is ${formatValue(target, ctx.dataset, valueKey)}.`,
      zh: target == null ? `当前值是 ${formatValue(value, ctx.dataset, valueKey)}。` : `当前值是 ${formatValue(value, ctx.dataset, valueKey)}，目标是 ${formatValue(target, ctx.dataset, valueKey)}。`,
    },
    highlight: 'none',
    notes: [{ en: 'Check the direction: for costs, response time and churn, a lower value is better.', zh: '先看方向：成本、响应时间、流失率这类指标越低越好。' }],
  };
}

export function analyzeBullet(ctx: AnalyzeContext): Analysis | null {
  const valueKey = valueField(ctx);
  const targetKey = targetField(ctx);
  const labelKey = encodingField(ctx.spec, 'label') || 'label';
  const items = ctx.rows
    .map((row) => {
      const label = String(row[labelKey] ?? 'metric');
      const value = typeof row[valueKey] === 'number' ? (row[valueKey] as number) : null;
      const target = typeof row[targetKey] === 'number' ? (row[targetKey] as number) : null;
      const down = directionBetterDown(label, metricMap(ctx));
      const gap = value != null && target != null ? value - target : null;
      const good = gap == null ? null : down ? gap <= 0 : gap >= 0;
      return { label, value, target, gap, good, down };
    })
    .filter((item): item is { label: string; value: number; target: number | null; gap: number | null; good: boolean | null; down: boolean } => item.value != null);
  if (!items.length) return null;
  const misses = items.filter((item) => item.good === false);
  const worst = [...items]
    .filter((item) => item.target != null && item.gap != null)
    .sort((a, b) => {
      const aRel = a.target ? Math.abs(a.gap ?? 0) / Math.abs(a.target) : Math.abs(a.gap ?? 0);
      const bRel = b.target ? Math.abs(b.gap ?? 0) / Math.abs(b.target) : Math.abs(b.gap ?? 0);
      return bRel - aRel;
    })[0];
  const stats: Stat[] = [
    { labelEn: 'Metrics', labelZh: '指标数', value: String(items.length), noteEn: `${items.filter((item) => item.good).length} on target`, noteZh: `${items.filter((item) => item.good).length} 项达标` },
    { labelEn: 'Worst gap', labelZh: '最大差距', value: worst && worst.gap != null ? `${worst.gap >= 0 ? '+' : '−'}${formatValue(Math.abs(worst.gap), ctx.dataset, valueKey)}` : '—', noteEn: worst?.label ?? '', noteZh: worst?.label ?? '' },
    { labelEn: 'On target', labelZh: '达标项', value: String(items.filter((item) => item.good).length), noteEn: misses.length ? `${misses.map((item) => item.label).join(', ')} missing` : 'all met', noteZh: misses.length ? `${misses.map((item) => item.label).join('、')} 未达标` : '全部达标' },
    { labelEn: 'Missed', labelZh: '未达标项', value: String(misses.length), noteEn: misses.length ? 'needs attention' : 'none', noteZh: misses.length ? '需要关注' : '没有' },
  ];
  const observations: Narrative[] = [
    { en: `${items.filter((item) => item.good).length} of ${items.length} metrics ${items.filter((item) => item.good).length === 1 ? 'meets its target' : 'meet their targets'}.`, zh: `${items.length} 个指标中有 ${items.filter((item) => item.good).length} 个达标。` },
    { en: worst ? `${worst.label} has the largest relative gap: ${worst.gap != null ? `${worst.gap >= 0 ? '+' : '−'}${formatValue(Math.abs(worst.gap), ctx.dataset, valueKey)}` : ''} against ${worst.target != null ? formatValue(worst.target, ctx.dataset, valueKey) : 'no target'}.` : 'All metrics are on target.', zh: worst ? `${worst.label}的相对差距最大：${worst.gap != null ? `${worst.gap >= 0 ? '+' : '−'}${formatValue(Math.abs(worst.gap), ctx.dataset, valueKey)}` : ''}，目标为 ${worst.target != null ? formatValue(worst.target, ctx.dataset, valueKey) : '未设置'}。` : '所有指标都达标。' },
    { en: 'For costs, churn and response time, a value below target is a good result; for revenue and profit, above target is good.', zh: '成本、流失率和响应时间低于目标是好结果；收入和利润高于目标才是好结果。' },
  ];
  return {
    kind: 'kpi',
    metric: valueKey,
    metricLabelEn: fieldLabelEn(valueKey),
    metricLabelZh: fieldLabelZh(valueKey),
    unit: ctx.dataset.unit_short,
    stats,
    observations,
    academic: {
      en: `The bullet chart compares ${items.length} metrics with their targets. ${items.filter((item) => item.good).length} meet their targets and ${misses.length} do not. ${worst ? `${worst.label} shows the largest relative gap, at ${worst.gap != null ? `${worst.gap >= 0 ? '+' : '−'}${formatValue(Math.abs(worst.gap), ctx.dataset, valueKey)}` : ''} against a target of ${worst.target != null ? formatValue(worst.target, ctx.dataset, valueKey) : 'not set'}.` : ''} Direction matters: for costs and response time, a lower value counts as success.`,
      zh: `子弹图把 ${items.length} 个指标与各自目标放在一起。${items.filter((item) => item.good).length} 个达标，${misses.length} 个未达标。${worst ? `${worst.label}的相对差距最大，为 ${worst.gap != null ? `${worst.gap >= 0 ? '+' : '−'}${formatValue(Math.abs(worst.gap), ctx.dataset, valueKey)}` : ''}，目标是 ${worst.target != null ? formatValue(worst.target, ctx.dataset, valueKey) : '未设置'}。` : ''}方向很重要：成本和响应时间越低越好。`,
    },
    business: {
      en: `${items.filter((item) => item.good).length} of ${items.length} metrics are on target.${worst ? ` ${worst.label} is the biggest gap, at ${worst.gap != null ? `${worst.gap >= 0 ? '+' : '−'}${formatValue(Math.abs(worst.gap), ctx.dataset, valueKey)}` : ''}.` : ''}`,
      zh: `${items.length} 个指标中有 ${items.filter((item) => item.good).length} 个达标。${worst ? `${worst.label}的差距最大，为 ${worst.gap != null ? `${worst.gap >= 0 ? '+' : '−'}${formatValue(Math.abs(worst.gap), ctx.dataset, valueKey)}` : ''}。` : ''}`,
    },
    everyday: {
      en: `${items.filter((item) => item.good).length} of ${items.length} numbers are where they should be.${worst ? ` ${worst.label} is the one to watch.` : ''}`,
      zh: `${items.length} 个数字里有 ${items.filter((item) => item.good).length} 个达标。${worst ? `${worst.label}最需要注意。` : ''}`,
    },
    highlight: worst?.label ?? 'max',
    notes: [{ en: 'A target tick on the left of a bar means the value is above target; the opposite direction is not automatically good.', zh: '目标线在条形左边表示实际值高于目标；但高于目标不一定就是好事，要看指标方向。' }],
  };
}

export function analyzeRadialBar(ctx: AnalyzeContext): Analysis | null {
  const valueKey = valueField(ctx);
  const labelKey = encodingField(ctx.spec, 'label') || 'label';
  const items = ctx.rows
    .map((row) => ({ label: String(row[labelKey] ?? 'goal'), value: typeof row[valueKey] === 'number' ? (row[valueKey] as number) : null }))
    .filter((item): item is { label: string; value: number } => item.value != null)
    .sort((a, b) => b.value - a.value);
  if (!items.length) return null;
  const top = items[0];
  const bottom = items[items.length - 1];
  const average = sum(items.map((item) => item.value)) / items.length;
  const behind = items.filter((item) => item.value < 100).length;
  return {
    kind: 'kpi',
    metric: valueKey,
    metricLabelEn: fieldLabelEn(valueKey),
    metricLabelZh: fieldLabelZh(valueKey),
    unit: ctx.dataset.unit_short,
    stats: [
      { labelEn: 'Closest to goal', labelZh: '最接近目标', value: `${formatValue(top.value, ctx.dataset, valueKey)}`, noteEn: top.label, noteZh: top.label },
      { labelEn: 'Furthest from goal', labelZh: '离目标最远', value: `${formatValue(bottom.value, ctx.dataset, valueKey)}`, noteEn: bottom.label, noteZh: bottom.label },
      { labelEn: 'Average progress', labelZh: '平均进度', value: formatPercent(average, 0), noteEn: `${items.length} goals`, noteZh: `${items.length} 个目标` },
      { labelEn: 'Below 100%', labelZh: '未满 100%', value: String(behind), noteEn: `${items.length - behind} at or above`, noteZh: `${items.length - behind} 项达到或超过` },
    ],
    observations: [
      { en: `${top.label} is closest to its goal at ${formatValue(top.value, ctx.dataset, valueKey)}.`, zh: `${top.label}最接近目标，为 ${formatValue(top.value, ctx.dataset, valueKey)}。` },
      { en: `${bottom.label} is furthest behind at ${formatValue(bottom.value, ctx.dataset, valueKey)}.`, zh: `${bottom.label}落后最多，为 ${formatValue(bottom.value, ctx.dataset, valueKey)}。` },
      { en: `Average progress is ${formatPercent(average, 0)}; ${behind} of ${items.length} goals are below 100%.`, zh: `平均进度为 ${formatPercent(average, 0)}；${items.length} 个目标中有 ${behind} 个低于 100%。` },
    ],
    academic: {
      en: `The radial bars show progress towards ${items.length} goals. ${top.label} is the closest to target at ${formatValue(top.value, ctx.dataset, valueKey)}, and ${bottom.label} is the furthest behind at ${formatValue(bottom.value, ctx.dataset, valueKey)}. Average progress is ${formatPercent(average, 0)}, and ${behind} goals remain below 100%.`,
      zh: `径向条形图展示 ${items.length} 个目标的进度。${top.label}最接近目标，为 ${formatValue(top.value, ctx.dataset, valueKey)}；${bottom.label}落后最多，为 ${formatValue(bottom.value, ctx.dataset, valueKey)}。平均进度为 ${formatPercent(average, 0)}，还有 ${behind} 个目标低于 100%。`,
    },
    business: {
      en: `${top.label} is nearest to target at ${formatValue(top.value, ctx.dataset, valueKey)}; ${bottom.label} is furthest behind at ${formatValue(bottom.value, ctx.dataset, valueKey)}. Average progress is ${formatPercent(average, 0)}.`,
      zh: `${top.label}最接近目标，为 ${formatValue(top.value, ctx.dataset, valueKey)}；${bottom.label}落后最多，为 ${formatValue(bottom.value, ctx.dataset, valueKey)}。平均进度为 ${formatPercent(average, 0)}。`,
    },
    everyday: {
      en: `${top.label} is closest to its goal. ${bottom.label} is the furthest behind.`,
      zh: `${top.label}最接近目标，${bottom.label}落后最多。`,
    },
    highlight: bottom.label,
    notes: [{ en: 'Outer rings look longer, so compare the printed percentages rather than arc length.', zh: '外圈的弧看起来更长，比较时看标注的百分比，不要只凭弧长。' }],
  };
}

export function analyzeSparkTable(ctx: AnalyzeContext): Analysis | null {
  const labelKey = encodingField(ctx.spec, 'label') || 'metric';
  const xKey = encodingField(ctx.spec, 'x') || 'week';
  const valueKey = encodingField(ctx.spec, 'value') || 'value';
  const targetKey = targetField(ctx);
  const groups = new Map<string, { x: string; value: number; target: number | null }[]>();
  for (const row of ctx.rows) {
    const label = String(row[labelKey] ?? 'metric');
    const x = String(row[xKey] ?? '');
    const value = row[valueKey];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const target = typeof row[targetKey] === 'number' ? (row[targetKey] as number) : null;
    const list = groups.get(label) ?? [];
    list.push({ x, value, target });
    groups.set(label, list);
  }
  if (!groups.size) return null;
  const metrics = [...groups.entries()].map(([label, points]) => {
    const sorted = [...points].sort((a, b) => a.x.localeCompare(b.x));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const target = last.target;
    const down = directionBetterDown(label, metricMap(ctx));
    const gap = target == null ? null : last.value - target;
    const good = gap == null ? null : down ? gap <= 0 : gap >= 0;
    const pct = target == null ? null : percentOf(last.value, target);
    return { label, first, last, gap, good, down, pct, change: last.value - first.value, target };
  });
  const worst = [...metrics]
    .filter((item) => item.gap != null && item.target)
    .sort((a, b) => (b.target ? Math.abs(b.gap ?? 0) / Math.abs(b.target) : 0) - (a.target ? Math.abs(a.gap ?? 0) / Math.abs(a.target) : 0))[0];
  const onTarget = metrics.filter((item) => item.good).length;
  const stats: Stat[] = metrics.slice(0, 4).map((item) => ({
    labelEn: item.label,
    labelZh: item.label,
    value: formatValue(item.last.value, ctx.dataset, valueKey),
    noteEn: item.target == null ? 'no target' : `${item.gap != null && item.gap >= 0 ? '+' : '−'}${formatValue(Math.abs(item.gap ?? 0), ctx.dataset, valueKey)} vs target`,
    noteZh: item.target == null ? '无目标' : `相对目标 ${item.gap != null && item.gap >= 0 ? '+' : '−'}${formatValue(Math.abs(item.gap ?? 0), ctx.dataset, valueKey)}`,
  }));
  return {
    kind: 'kpi',
    metric: valueKey,
    metricLabelEn: 'latest values',
    metricLabelZh: '最新值',
    unit: ctx.dataset.unit_short,
    stats,
    observations: [
      { en: `${onTarget} of ${metrics.length} metrics ${onTarget === 1 ? 'is' : 'are'} on target.`, zh: `${metrics.length} 个指标中有 ${onTarget} 个达标。` },
      { en: worst ? `${worst.label} has the largest relative gap: ${formatValue(worst.last.value, ctx.dataset, valueKey)} against ${worst.target != null ? formatValue(worst.target, ctx.dataset, valueKey) : 'no target'}.` : 'Every metric is on target.', zh: worst ? `${worst.label}的相对差距最大：${formatValue(worst.last.value, ctx.dataset, valueKey)}，目标为 ${worst.target != null ? formatValue(worst.target, ctx.dataset, valueKey) : '未设置'}。` : '所有指标都达标。' },
      { en: metrics.map((item) => `${item.label} ${item.last.value >= item.first.value ? 'rose' : 'fell'} from ${formatValue(item.first.value, ctx.dataset, valueKey)} to ${formatValue(item.last.value, ctx.dataset, valueKey)}`).join('; ') + '.', zh: metrics.map((item) => `${item.label}从 ${formatValue(item.first.value, ctx.dataset, valueKey)} ${item.last.value >= item.first.value ? '上升' : '下降'}到 ${formatValue(item.last.value, ctx.dataset, valueKey)}`).join('；') + '。' },
    ],
    academic: {
      en: `The KPI table follows ${metrics.length} metrics week by week and compares the latest value with its target. ${onTarget} of ${metrics.length} are on target. ${worst ? `${worst.label} shows the largest relative gap, at ${formatValue(worst.last.value, ctx.dataset, valueKey)} against ${worst.target != null ? formatValue(worst.target, ctx.dataset, valueKey) : 'no target'}.` : ''} Direction is metric-specific: churn and response time are better when lower, while revenue and customer counts are better when higher.`,
      zh: `指标表按周追踪 ${metrics.length} 个指标，并把最新值与目标比较。${metrics.length} 个指标中有 ${onTarget} 个达标。${worst ? `${worst.label}的相对差距最大，为 ${formatValue(worst.last.value, ctx.dataset, valueKey)}，目标是 ${worst.target != null ? formatValue(worst.target, ctx.dataset, valueKey) : '未设置'}。` : ''}方向因指标而异：流失率和响应时间越低越好，收入和客户数越高越好。`,
    },
    business: {
      en: `${onTarget} of ${metrics.length} metrics are on target.${worst ? ` ${worst.label} is the biggest miss.` : ''} Watch the change column as well as the target gap.`,
      zh: `${metrics.length} 个指标中有 ${onTarget} 个达标。${worst ? `${worst.label}差距最大。` : ''}除了目标差距，也要看变化列。`,
    },
    everyday: {
      en: `${onTarget} of ${metrics.length} numbers are where they should be.${worst ? ` ${worst.label} needs the most attention.` : ''}`,
      zh: `${metrics.length} 个数字里有 ${onTarget} 个达标。${worst ? `${worst.label}最需要注意。` : ''}`,
    },
    highlight: worst?.label ?? 'none',
    notes: [{ en: 'YoY compares with the same period last year; QoQ compares with the previous quarter.', zh: '同比是和去年同期比，环比是和上一个季度比。' }],
  };
}
