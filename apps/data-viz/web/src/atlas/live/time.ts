import type { Analysis, AnalyzeContext, Narrative, Stat } from './types';
import {
  changePct,
  encodingField,
  encodingFields,
  fieldLabelEn,
  fieldLabelZh,
  formatPercent,
  formatValue,
  mean,
  percentOf,
  sum,
  trendWord,
  capitalize,
} from './util';

interface Point {
  x: string;
  value: number;
}

interface SeriesData {
  name: string;
  points: Point[];
  first: Point;
  last: Point;
  change: number;
  pct: number | null;
}

function xFieldOf(ctx: AnalyzeContext): string {
  return (
    encodingField(ctx.spec, 'x') ||
    encodingField(ctx.spec, 'date') ||
    encodingField(ctx.spec, 'frame') ||
    encodingField(ctx.spec, 'month') ||
    encodingField(ctx.spec, 'week') ||
    'x'
  );
}

function isDateLike(values: string[]): boolean {
  return values.length > 0 && values.every((value) => /^\d{4}-\d{2}(-\d{2})?$/.test(value));
}

function buildSeries(
  rows: AnalyzeContext['rows'],
  xField: string,
  seriesField: string | null,
  yFields: string[],
  valueField = 'value',
): { xOrder: string[]; series: SeriesData[] } {
  const xOrder: string[] = [];
  const seenX = new Set<string>();
  for (const row of rows) {
    const x = row[xField] == null ? '' : String(row[xField]);
    if (!seenX.has(x)) {
      seenX.add(x);
      xOrder.push(x);
    }
  }
  if (isDateLike(xOrder)) xOrder.sort();

  const names: string[] = seriesField
    ? [...new Set(rows.map((row) => String(row[seriesField] ?? 'series')))]
    : yFields;

  const series: SeriesData[] = names.map((name) => {
    const byX = new Map<string, number>();
    for (const row of rows) {
      if (seriesField && String(row[seriesField] ?? 'series') !== name) continue;
      const x = row[xField] == null ? '' : String(row[xField]);
      const raw = seriesField ? row[valueField] : row[name];
      const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
      if (value == null) continue;
      byX.set(x, value);
    }
    const points = xOrder
      .filter((x) => byX.has(x))
      .map((x) => ({ x, value: byX.get(x) as number }));
    const first = points[0];
    const last = points[points.length - 1];
    return {
      name: seriesField ? name : capitalize(fieldLabelEn(name)),
      points,
      first,
      last,
      change: last && first ? last.value - first.value : 0,
      pct: first && last ? changePct(first.value, last.value) : null,
    };
  }).filter((item) => item.points.length > 0);

  return { xOrder, series };
}

function metricFor(ctx: AnalyzeContext): string {
  return (
    ctx.metric ||
    encodingField(ctx.spec, 'y') ||
    encodingField(ctx.spec, 'value') ||
    'value'
  );
}

function base(ctx: AnalyzeContext, kind: string, metric: string): Pick<Analysis, 'kind' | 'metric' | 'metricLabelEn' | 'metricLabelZh' | 'unit' | 'notes'> {
  return {
    kind,
    metric,
    metricLabelEn: fieldLabelEn(metric),
    metricLabelZh: fieldLabelZh(metric),
    unit: ctx.dataset.unit_short,
    notes: [],
  };
}

export function analyzeTime(ctx: AnalyzeContext): Analysis | null {
  const metric = metricFor(ctx);
  const xField = xFieldOf(ctx);
  const seriesField = encodingField(ctx.spec, 'series');
  const yFields = encodingFields(ctx.spec, 'y');
  const wide = !seriesField && yFields.length > 1;
  const fields = wide ? yFields : [metric];
  const { series } = buildSeries(ctx.rows, xField, seriesField, fields, metric);
  if (!series.length) return null;

  const multi = series.length > 1;
  const lastX = series[0].last?.x ?? '';
  const firstX = series[0].first?.x ?? '';
  const ranked = [...series]
    .filter((item) => item.last)
    .sort((a, b) => b.last.value - a.last.value);
  const leader = ranked[0];
  const laggard = ranked[ranked.length - 1];
  const withPct = series.filter((item) => item.pct != null && Number.isFinite(item.pct));
  const fastest = [...withPct].sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0] ?? null;
  const slowest = [...withPct].sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0))[0] ?? null;
  const allUp = series.every((item) => item.change > 0);
  const allDown = series.every((item) => item.change < 0);
  const leaderChange = leader?.change ?? 0;
  const leaderTrend = leader ? trendWord(leader.first.value, leader.last.value) : { en: 'moved', zh: '变化' };
  const totalFirst = multi
    ? sum(series.map((item) => item.first?.value ?? 0))
    : leader?.first.value ?? 0;
  const totalLast = multi
    ? sum(series.map((item) => item.last?.value ?? 0))
    : leader?.last.value ?? 0;
  const totalChange = totalLast - totalFirst;
  const totalPct = changePct(totalFirst, totalLast);
  const peak = leader ? [...leader.points].sort((a, b) => b.value - a.value)[0] : null;
  const trough = leader ? [...leader.points].sort((a, b) => a.value - b.value)[0] : null;

  const stats: Stat[] = [
    {
      labelEn: 'Leader at the end',
      labelZh: '期末最高',
      value: leader ? formatValue(leader.last.value, ctx.dataset, metric) : '—',
      noteEn: leader ? `${leader.name} · ${lastX}` : '',
      noteZh: leader ? `${leader.name} · ${lastX}` : '',
    },
    {
      labelEn: 'Change',
      labelZh: '变化',
      value: leader ? `${leaderChange >= 0 ? '+' : '−'}${formatValue(Math.abs(leaderChange), ctx.dataset, metric)}` : '—',
      noteEn: leader ? `${leader.name}: ${leader.first.x} → ${leader.last.x}` : '',
      noteZh: leader ? `${leader.name}：${leader.first.x} → ${leader.last.x}` : '',
    },
    {
      labelEn: multi && fastest ? 'Fastest growth' : 'Peak',
      labelZh: multi && fastest ? '增长最快' : '峰值',
      value: multi && fastest && fastest.pct != null ? formatPercent(fastest.pct) : peak ? formatValue(peak.value, ctx.dataset, metric) : '—',
      noteEn: multi && fastest ? fastest.name : peak?.x ?? '',
      noteZh: multi && fastest ? fastest.name : peak?.x ?? '',
    },
    {
      labelEn: multi ? 'Total change' : 'Range',
      labelZh: multi ? '总量变化' : '极差',
      value: multi
        ? `${totalChange >= 0 ? '+' : '−'}${formatValue(Math.abs(totalChange), ctx.dataset, metric)}${totalPct != null ? ` (${formatPercent(totalPct)})` : ''}`
        : peak && trough
          ? formatValue(peak.value - trough.value, ctx.dataset, metric)
          : '—',
      noteEn: multi ? 'all series combined' : peak && trough ? `${trough.x} → ${peak.x}` : '',
      noteZh: multi ? '各系列合计' : peak && trough ? `${trough.x} → ${peak.x}` : '',
    },
  ];

  const observations: Narrative[] = [];
  if (leader) {
    observations.push({
      en: `${leader.name} ${leaderTrend.en} from ${formatValue(leader.first.value, ctx.dataset, metric)} in ${leader.first.x} to ${formatValue(leader.last.value, ctx.dataset, metric)} in ${leader.last.x}.`,
      zh: `${leader.name}从 ${leader.first.x} 的 ${formatValue(leader.first.value, ctx.dataset, metric)} ${leaderTrend.zh}到 ${leader.last.x} 的 ${formatValue(leader.last.value, ctx.dataset, metric)}。`,
    });
  }
  if (fastest && fastest.pct != null && multi) {
    observations.push({
      en: `${fastest.name} grew fastest in percentage terms, from ${formatValue(fastest.first.value, ctx.dataset, metric)} to ${formatValue(fastest.last.value, ctx.dataset, metric)} (${formatPercent(fastest.pct)}).`,
      zh: `按百分比看，${fastest.name}增长最快，从 ${formatValue(fastest.first.value, ctx.dataset, metric)} 到 ${formatValue(fastest.last.value, ctx.dataset, metric)}（${formatPercent(fastest.pct)}）。`,
    });
  } else if (slowest && slowest.pct != null && multi) {
    observations.push({
      en: `${slowest.name} changed least in percentage terms (${formatPercent(slowest.pct)}), from ${formatValue(slowest.first.value, ctx.dataset, metric)} to ${formatValue(slowest.last.value, ctx.dataset, metric)}.`,
      zh: `按百分比看，${slowest.name}变化最小（${formatPercent(slowest.pct)}），从 ${formatValue(slowest.first.value, ctx.dataset, metric)} 到 ${formatValue(slowest.last.value, ctx.dataset, metric)}。`,
    });
  }
  if (multi) {
    observations.push({
      en: `Across all series, the total went from ${formatValue(totalFirst, ctx.dataset, metric)} in ${firstX} to ${formatValue(totalLast, ctx.dataset, metric)} in ${lastX}${totalPct != null ? `, a change of ${formatPercent(totalPct)}` : ''}.`,
      zh: `各系列合计从 ${firstX} 的 ${formatValue(totalFirst, ctx.dataset, metric)} 变为 ${lastX} 的 ${formatValue(totalLast, ctx.dataset, metric)}${totalPct != null ? `，变化 ${formatPercent(totalPct)}` : ''}。`,
    });
  } else if (peak && trough) {
    observations.push({
      en: `The highest point is ${formatValue(peak.value, ctx.dataset, metric)} in ${peak.x}; the lowest is ${formatValue(trough.value, ctx.dataset, metric)} in ${trough.x}.`,
      zh: `最高点出现在 ${peak.x}，为 ${formatValue(peak.value, ctx.dataset, metric)}；最低点在 ${trough.x}，为 ${formatValue(trough.value, ctx.dataset, metric)}。`,
    });
    observations.push({
      en: `The series ${allUp ? 'rises throughout' : allDown ? 'falls throughout' : peak.x === leader?.last.x ? 'ends at its peak' : 'moves unevenly over the period'}.`,
      zh: `这条线${allUp ? '整体一路上升' : allDown ? '整体一路下降' : peak.x === leader?.last.x ? '在末尾达到最高' : '在这段时间里上下变化'}。`,
    });
  }

  const changeWord = leaderChange > 0 ? 'rose' : leaderChange < 0 ? 'fell' : 'stayed flat';
  const changeWordZh = leaderChange > 0 ? '上升' : leaderChange < 0 ? '下降' : '持平';
  const rangeText = peak && trough ? ` The series ranges from ${formatValue(trough.value, ctx.dataset, metric)} to ${formatValue(peak.value, ctx.dataset, metric)}.` : '';
  const rangeZh = peak && trough ? `数值在 ${formatValue(trough.value, ctx.dataset, metric)} 到 ${formatValue(peak.value, ctx.dataset, metric)} 之间。` : '';
  const mixText = multi
    ? ` At the final period, ${leader.name} accounts for ${formatPercent(percentOf(leader.last.value, totalLast) ?? 0)} of the combined total.`
    : '';
  const mixZh = multi
    ? `在最后一个时期，${leader.name}占各系列合计的 ${formatPercent(percentOf(leader.last.value, totalLast) ?? 0)}。`
    : '';

  return {
    ...base(ctx, 'time', metric),
    stats,
    observations,
    academic: {
      en: `The chart tracks ${fieldLabelEn(metric)} across ${series[0].points.length} periods${multi ? ` for ${series.length} series` : ''}. ${leader ? `${leader.name} ends highest at ${formatValue(leader.last.value, ctx.dataset, metric)} in ${lastX}, ${changeWord} from ${formatValue(leader.first.value, ctx.dataset, metric)} in ${firstX}.` : ''}${fastest && fastest.pct != null && multi ? ` ${fastest.name} records the fastest percentage growth, from ${formatValue(fastest.first.value, ctx.dataset, metric)} to ${formatValue(fastest.last.value, ctx.dataset, metric)} (${formatPercent(fastest.pct)}).` : ''}${multi ? ` The combined total moves from ${formatValue(totalFirst, ctx.dataset, metric)} to ${formatValue(totalLast, ctx.dataset, metric)}.` : rangeText}`,
      zh: `图表追踪 ${series[0].points.length} 个时期的${fieldLabelZh(metric)}${multi ? `，共 ${series.length} 个系列` : ''}。${leader ? `${leader.name}在 ${lastX} 以 ${formatValue(leader.last.value, ctx.dataset, metric)} 居首，相比 ${firstX} 的 ${formatValue(leader.first.value, ctx.dataset, metric)} ${changeWordZh}。` : ''}${fastest && fastest.pct != null && multi ? `${fastest.name}的百分比增长最快，从 ${formatValue(fastest.first.value, ctx.dataset, metric)} 到 ${formatValue(fastest.last.value, ctx.dataset, metric)}（${formatPercent(fastest.pct)}）。` : ''}${multi ? `各系列合计从 ${formatValue(totalFirst, ctx.dataset, metric)} 变为 ${formatValue(totalLast, ctx.dataset, metric)}。` : rangeZh}`,
    },
    business: {
      en: `${leader ? `${leader.name} is the leader at ${formatValue(leader.last.value, ctx.dataset, metric)} in ${lastX}` : 'The series ends the period'}${leader ? `, ${changeWord} ${formatValue(Math.abs(leaderChange), ctx.dataset, metric)} from ${firstX}.` : '.'}${fastest && fastest.pct != null && multi ? ` ${fastest.name} is the fastest grower at ${formatPercent(fastest.pct)}.` : ''}${multi ? ` The combined total is ${formatValue(totalLast, ctx.dataset, metric)}, ${totalChange >= 0 ? 'up' : 'down'} ${formatValue(Math.abs(totalChange), ctx.dataset, metric)}.` : ''}${mixText}`,
      zh: `${leader ? `${leader.name}在 ${lastX} 以 ${formatValue(leader.last.value, ctx.dataset, metric)} 领先` : '该系列在期末'}${leader ? `，比 ${firstX} ${changeWordZh} ${formatValue(Math.abs(leaderChange), ctx.dataset, metric)}。` : '。'}${fastest && fastest.pct != null && multi ? `${fastest.name}增长最快，为 ${formatPercent(fastest.pct)}。` : ''}${multi ? `各系列合计为 ${formatValue(totalLast, ctx.dataset, metric)}，比期初${totalChange >= 0 ? '增加' : '减少'} ${formatValue(Math.abs(totalChange), ctx.dataset, metric)}。` : ''}${mixZh}`,
    },
    everyday: {
      en: `${leader ? `${leader.name} ends the highest at ${formatValue(leader.last.value, ctx.dataset, metric)}` : 'The line ends'}${leader ? `, ${leaderChange >= 0 ? 'up' : 'down'} from ${formatValue(leader.first.value, ctx.dataset, metric)} at the start.` : '.'}${multi && laggard ? ` ${laggard.name} is the lowest at the end.` : ''}`,
      zh: `${leader ? `${leader.name}期末最高，为 ${formatValue(leader.last.value, ctx.dataset, metric)}，比期初的 ${formatValue(leader.first.value, ctx.dataset, metric)}${leaderChange >= 0 ? '增加' : '减少'}。` : '这条线走到期末。'}${multi && laggard ? `${laggard.name}期末最低。` : ''}`,
    },
    highlight: leader?.name ?? 'max',
    notes: multi
      ? [{ en: 'Different series can have different starting levels; compare percentage growth as well as absolute change.', zh: '各系列起点不同，既要看绝对变化，也要看百分比增长。' }]
      : [],
  };
}

export function analyzeCalendar(ctx: AnalyzeContext): Analysis | null {
  const metric = metricFor(ctx);
  const dateField = encodingField(ctx.spec, 'date') || 'date';
  const rows = ctx.rows.filter((row) => typeof row[metric] === 'number' && Number.isFinite(row[metric] as number));
  if (!rows.length) return null;
  const items = rows.map((row) => {
    const raw = String(row[dateField] ?? '');
    const date = new Date(`${raw}T00:00:00Z`);
    const valid = !Number.isNaN(date.getTime());
    return {
      raw,
      date,
      weekday: valid ? date.getUTCDay() : -1,
      month: valid ? date.getUTCMonth() : -1,
      value: Number(row[metric]),
    };
  });
  const weekday = items.filter((item) => item.weekday >= 1 && item.weekday <= 5).map((item) => item.value);
  const weekend = items.filter((item) => item.weekday === 0 || item.weekday === 6).map((item) => item.value);
  const weekdayAvg = mean(weekday);
  const weekendAvg = mean(weekend);
  const peak = [...items].sort((a, b) => b.value - a.value)[0];
  const low = [...items].sort((a, b) => a.value - b.value)[0];
  const months = new Map<number, number[]>();
  for (const item of items) {
    if (item.month < 0) continue;
    const list = months.get(item.month) ?? [];
    list.push(item.value);
    months.set(item.month, list);
  }
  const monthEntries = [...months.entries()].sort((a, b) => a[0] - b[0]);
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const firstMonth = monthEntries[0];
  const lastMonth = monthEntries[monthEntries.length - 1];
  const monthChange = firstMonth && lastMonth ? mean(lastMonth[1]) - mean(firstMonth[1]) : 0;
  const diff = weekendAvg - weekdayAvg;
  const diffPct = weekdayAvg ? (diff / weekdayAvg) * 100 : null;
  const peakText = formatValue(peak.value, ctx.dataset, metric);
  const lowText = formatValue(low.value, ctx.dataset, metric);
  const weekdayText = formatValue(weekdayAvg, ctx.dataset, metric);
  const weekendText = formatValue(weekendAvg, ctx.dataset, metric);

  return {
    ...base(ctx, 'calendar', metric),
    stats: [
      { labelEn: 'Weekday average', labelZh: '工作日平均', value: weekdayText, noteEn: `${weekday.length} weekdays`, noteZh: `${weekday.length} 个工作日` },
      { labelEn: 'Weekend average', labelZh: '周末平均', value: weekendText, noteEn: `${weekend.length} weekend days`, noteZh: `${weekend.length} 个周末日` },
      { labelEn: 'Peak day', labelZh: '最高日', value: peakText, noteEn: peak.raw, noteZh: peak.raw },
      { labelEn: 'Lowest day', labelZh: '最低日', value: lowText, noteEn: low.raw, noteZh: low.raw },
    ],
    observations: [
      {
        en: `Weekend days average ${weekendText}, compared with ${weekdayText} on weekdays.`,
        zh: `周末平均为 ${weekendText}，工作日平均为 ${weekdayText}。`,
      },
      {
        en: `The highest day is ${peak.raw} at ${peakText}; the lowest is ${low.raw} at ${lowText}.`,
        zh: `最高的一天是 ${peak.raw}，为 ${peakText}；最低的是 ${low.raw}，为 ${lowText}。`,
      },
      {
        en: firstMonth && lastMonth
          ? `Monthly averages move from ${formatValue(mean(firstMonth[1]), ctx.dataset, metric)} in ${monthNames[firstMonth[0]]} to ${formatValue(mean(lastMonth[1]), ctx.dataset, metric)} in ${monthNames[lastMonth[0]]}.`
          : 'The daily pattern is shown across the calendar.',
        zh: firstMonth && lastMonth
          ? `月度平均值从 ${monthNames[firstMonth[0]]} 的 ${formatValue(mean(firstMonth[1]), ctx.dataset, metric)} 变为 ${monthNames[lastMonth[0]]} 的 ${formatValue(mean(lastMonth[1]), ctx.dataset, metric)}。`
          : '日历展示了每日的分布。',
      },
    ],
    academic: {
      en: `The calendar plots daily ${fieldLabelEn(metric)} across ${items.length} days. The weekday average is ${weekdayText}, while weekends average ${weekendText}, ${diff >= 0 ? 'above' : 'below'} the weekday level${diffPct != null ? ` (${formatPercent(Math.abs(diffPct))})` : ''}. The highest value is ${peakText} on ${peak.raw}. Monthly averages ${monthChange >= 0 ? 'rise' : 'fall'} from ${firstMonth ? monthNames[firstMonth[0]] : 'the first month'} to ${lastMonth ? monthNames[lastMonth[0]] : 'the last month'}.`,
      zh: `日历展示了 ${items.length} 天的每日${fieldLabelZh(metric)}。工作日平均为 ${weekdayText}，周末平均为 ${weekendText}，比工作日${diff >= 0 ? '高' : '低'}${diffPct != null ? `（${formatPercent(Math.abs(diffPct))}）` : ''}。最高值是 ${peak.raw} 的 ${peakText}。月度平均值从${firstMonth ? monthNames[firstMonth[0]] : '第一个月'}到${lastMonth ? monthNames[lastMonth[0]] : '最后一个月'}${monthChange >= 0 ? '上升' : '下降'}。`,
    },
    business: {
      en: `Weekends run ${weekendText} on average against ${weekdayText} on weekdays. The busiest day is ${peak.raw} (${peakText}); the quietest is ${low.raw} (${lowText}).`,
      zh: `周末平均为 ${weekendText}，工作日为 ${weekdayText}。最忙的一天是 ${peak.raw}（${peakText}），最闲的是 ${low.raw}（${lowText}）。`,
    },
    everyday: {
      en: `Weekends are ${diff >= 0 ? 'higher' : 'lower'}: about ${weekendText}, versus ${weekdayText} on weekdays.`,
      zh: `周末${diff >= 0 ? '更高' : '更低'}：大约 ${weekendText}，工作日是 ${weekdayText}。`,
    },
    highlight: peak.raw,
    notes: [{ en: 'A calendar shows rhythm and gaps better than exact values.', zh: '日历更适合看节奏和空档，不适合读精确值。' }],
  };
}

export function analyzeHorizon(ctx: AnalyzeContext): Analysis | null {
  const baseAnalysis = analyzeTime(ctx);
  if (!baseAnalysis) return null;
  const metric = metricFor(ctx);
  const xField = xFieldOf(ctx);
  const seriesField = encodingField(ctx.spec, 'series');
  const { series } = buildSeries(ctx.rows, xField, seriesField, [metric], metric);
  const ranked = [...series].sort((a, b) => b.last.value - a.last.value);
  const top = ranked[0];
  const bottom = ranked[ranked.length - 1];
  const positive = ranked.filter((item) => item.last.value > 0).length;
  const negative = ranked.filter((item) => item.last.value < 0).length;
  const topText = formatValue(top.last.value, ctx.dataset, metric);
  const bottomText = formatValue(bottom.last.value, ctx.dataset, metric);
  return {
    ...baseAnalysis,
    stats: [
      { labelEn: 'Highest change', labelZh: '最高变化', value: topText, noteEn: top.name, noteZh: top.name },
      { labelEn: 'Lowest change', labelZh: '最低变化', value: bottomText, noteEn: bottom.name, noteZh: bottom.name },
      { labelEn: 'Growing', labelZh: '正增长', value: String(positive), noteEn: `${series.length} services`, noteZh: `共 ${series.length} 项` },
      { labelEn: 'Falling', labelZh: '负增长', value: String(negative), noteEn: 'below zero', noteZh: '低于零' },
    ],
    observations: [
      { en: `${top.name} has the highest latest change at ${topText}.`, zh: `${top.name}的最新变化最高，为 ${topText}。` },
      { en: `${bottom.name} has the lowest latest change at ${bottomText}.`, zh: `${bottom.name}的最新变化最低，为 ${bottomText}。` },
      { en: `${positive} of ${series.length} services are still growing; ${negative} are below zero.`, zh: `${series.length} 项服务中有 ${positive} 项仍在增长，${negative} 项低于零。` },
    ],
    academic: {
      en: `The horizon chart shows the latest year-over-year change for ${series.length} services. ${top.name} has the highest change at ${topText}, while ${bottom.name} has the lowest at ${bottomText}. ${positive} services remain above zero and ${negative} are below it; a negative value means slower growth than last year, not necessarily a fall in absolute requests.`,
      zh: `地平线图展示 ${series.length} 项服务最新的同比变化。${top.name}最高，为 ${topText}；${bottom.name}最低，为 ${bottomText}。${positive} 项仍高于零，${negative} 项低于零；负值表示比去年同期增长更慢，不一定代表请求量绝对下降。`,
    },
    business: {
      en: `${top.name} is growing fastest at ${topText}, while ${bottom.name} is at ${bottomText}. ${positive} of ${series.length} services are still positive.`,
      zh: `${top.name}增长最快，为 ${topText}；${bottom.name}为 ${bottomText}。${series.length} 项服务中有 ${positive} 项仍为正增长。`,
    },
    everyday: {
      en: `${top.name} is up the most (${topText}). ${bottom.name} is the weakest (${bottomText}).`,
      zh: `${top.name}涨得最多（${topText}），${bottom.name}最弱（${bottomText}）。`,
    },
    highlight: top.name,
    notes: [{ en: 'Rows below zero show slower growth than last year, not a negative number of requests.', zh: '低于零的行表示同比增速为负，不是请求量变成负数。' }],
  };
}

export function analyzeSkyline(ctx: AnalyzeContext): Analysis | null {
  const xField = xFieldOf(ctx);
  const yFields = encodingFields(ctx.spec, 'y');
  const frontFields = encodingFields(ctx.spec, 'front');
  if (!yFields.length) return analyzeTime(ctx);
  const metric = ctx.metric && yFields.includes(ctx.metric) ? ctx.metric : yFields[0];
  const { series, xOrder } = buildSeries(ctx.rows, xField, null, yFields);
  if (!series.length) return null;
  const lastX = xOrder[xOrder.length - 1] ?? '';
  const ranked = [...series].sort((a, b) => b.last.value - a.last.value);
  const leader = ranked[0];
  const lastRows = ctx.rows.filter((row) => String(row[xField]) === lastX);
  const frontTotal = frontFields.length
    ? sum(lastRows.flatMap((row) => frontFields.map((field) => (typeof row[field] === 'number' ? row[field] : 0))))
    : 0;
  const stackTotal = sum(series.map((item) => item.last.value));
  const frontShare = percentOf(frontTotal, stackTotal);
  const frontLabel = frontFields.join(' + ') || 'front row';
  return {
    ...base(ctx, 'time', metric),
    stats: [
      { labelEn: 'Largest series', labelZh: '最大系列', value: formatValue(leader.last.value, ctx.dataset, metric), noteEn: leader.name, noteZh: leader.name },
      { labelEn: 'Stack total', labelZh: '堆叠合计', value: formatValue(stackTotal, ctx.dataset, metric), noteEn: lastX, noteZh: lastX },
      { labelEn: 'Front row', labelZh: '前排', value: formatValue(frontTotal, ctx.dataset, metric), noteEn: frontLabel, noteZh: frontLabel },
      { labelEn: 'Front share', labelZh: '前排占比', value: formatPercent(frontShare ?? 0), noteEn: 'of the stack', noteZh: '占堆叠总量' },
    ],
    observations: [
      { en: `${leader.name} is the largest series at ${formatValue(leader.last.value, ctx.dataset, metric)} in ${lastX}.`, zh: `${leader.name}是最大的系列，在 ${lastX} 为 ${formatValue(leader.last.value, ctx.dataset, metric)}。` },
      { en: `The stacked total is ${formatValue(stackTotal, ctx.dataset, metric)}.`, zh: `堆叠合计为 ${formatValue(stackTotal, ctx.dataset, metric)}。` },
      { en: `${frontLabel} adds ${formatValue(frontTotal, ctx.dataset, metric)}, or ${formatPercent(frontShare ?? 0)} of the stack.`, zh: `${frontLabel}为 ${formatValue(frontTotal, ctx.dataset, metric)}，占堆叠总量的 ${formatPercent(frontShare ?? 0)}。` },
    ],
    academic: {
      en: `The skyline stacks ${yFields.length} series and places ${frontLabel} in front in the same unit. At the final period, ${leader.name} is the largest component at ${formatValue(leader.last.value, ctx.dataset, metric)}, the stack totals ${formatValue(stackTotal, ctx.dataset, metric)}, and ${frontLabel} accounts for ${formatPercent(frontShare ?? 0)}.`,
      zh: `天际线图堆叠了 ${yFields.length} 个系列，并在前排用同一单位显示${frontLabel}。在最后一个时期，${leader.name}最大，为 ${formatValue(leader.last.value, ctx.dataset, metric)}；堆叠合计 ${formatValue(stackTotal, ctx.dataset, metric)}，${frontLabel}占 ${formatPercent(frontShare ?? 0)}。`,
    },
    business: {
      en: `${leader.name} leads the stack at ${formatValue(leader.last.value, ctx.dataset, metric)}. Total volume is ${formatValue(stackTotal, ctx.dataset, metric)}, with ${frontLabel} at ${formatValue(frontTotal, ctx.dataset, metric)}.`,
      zh: `${leader.name}在堆叠中领先，为 ${formatValue(leader.last.value, ctx.dataset, metric)}。总量为 ${formatValue(stackTotal, ctx.dataset, metric)}，${frontLabel}为 ${formatValue(frontTotal, ctx.dataset, metric)}。`,
    },
    everyday: {
      en: `${leader.name} is the biggest block. The whole stack is ${formatValue(stackTotal, ctx.dataset, metric)}.`,
      zh: `${leader.name}是最大的一块，整个堆叠为 ${formatValue(stackTotal, ctx.dataset, metric)}。`,
    },
    highlight: leader.name,
  };
}
