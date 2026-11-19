import type { Analysis, AnalyzeContext, Narrative, Stat } from './types';
import {
  changePct,
  encodingField,
  fieldLabelEn,
  fieldLabelZh,
  finiteValues,
  formatNumber,
  formatPercent,
  formatValue,
  mean,
  percentOf,
  sum,
} from './util';

export function analyzeWaterfall(ctx: AnalyzeContext): Analysis | null {
  const labelField = encodingField(ctx.spec, 'label') || 'item';
  const metric = ctx.metric || encodingField(ctx.spec, 'value') || 'value';
  const typeField = encodingField(ctx.spec, 'type');
  const rows = ctx.rows
    .map((row) => ({
      label: String(row[labelField] ?? 'item'),
      value: typeof row[metric] === 'number' ? (row[metric] as number) : 0,
      kind: typeField ? String(row[typeField] ?? '') : '',
    }))
    .filter((row) => Number.isFinite(row.value));
  if (rows.length < 2) return null;
  const start = rows[0];
  const end = rows[rows.length - 1];
  const drivers = rows.slice(1, -1);
  const positive = drivers.filter((row) => row.value >= 0);
  const negative = drivers.filter((row) => row.value < 0);
  const positiveTotal = sum(positive.map((row) => row.value));
  const negativeTotal = sum(negative.map((row) => row.value));
  const largestDrag = [...negative].sort((a, b) => a.value - b.value)[0];
  const largestLift = [...positive].sort((a, b) => b.value - a.value)[0];
  const net = end.value - start.value;
  const unit = ctx.dataset.unit_short;
  const stats: Stat[] = [
    { labelEn: 'Start', labelZh: '起点', value: formatValue(start.value, ctx.dataset, metric), noteEn: start.label, noteZh: start.label },
    { labelEn: 'End', labelZh: '终点', value: formatValue(end.value, ctx.dataset, metric), noteEn: end.label, noteZh: end.label },
    { labelEn: 'Net change', labelZh: '净变化', value: `${net >= 0 ? '+' : '−'}${formatValue(Math.abs(net), ctx.dataset, metric)}`, noteEn: net >= 0 ? 'increase' : 'decrease', noteZh: net >= 0 ? '增加' : '减少' },
    { labelEn: 'Largest drag', labelZh: '最大拖累', value: largestDrag ? formatValue(largestDrag.value, ctx.dataset, metric) : '—', noteEn: largestDrag?.label ?? 'none', noteZh: largestDrag?.label ?? '没有' },
  ];
  const observations: Narrative[] = [
    { en: `The bridge moves from ${formatValue(start.value, ctx.dataset, metric)} (${start.label}) to ${formatValue(end.value, ctx.dataset, metric)} (${end.label}).`, zh: `瀑布图从 ${start.label} 的 ${formatValue(start.value, ctx.dataset, metric)} 变化到 ${end.label} 的 ${formatValue(end.value, ctx.dataset, metric)}。` },
    { en: `Positive drivers add ${formatValue(positiveTotal, ctx.dataset, metric)}${largestLift ? `, led by ${largestLift.label} (+${formatValue(largestLift.value, ctx.dataset, metric)})` : ''}.`, zh: `正向驱动合计增加 ${formatValue(positiveTotal, ctx.dataset, metric)}${largestLift ? `，其中 ${largestLift.label} 最大（+${formatValue(largestLift.value, ctx.dataset, metric)}）` : ''}。` },
    { en: largestDrag ? `Negative drivers remove ${formatValue(Math.abs(negativeTotal), ctx.dataset, metric)}, with ${largestDrag.label} the largest drag (${formatValue(largestDrag.value, ctx.dataset, metric)}).` : 'There are no negative drivers.', zh: largestDrag ? `负向驱动合计减少 ${formatValue(Math.abs(negativeTotal), ctx.dataset, metric)}，其中 ${largestDrag.label} 拖累最大（${formatValue(largestDrag.value, ctx.dataset, metric)}）。` : '没有负向驱动。' },
  ];
  return {
    kind: 'waterfall',
    metric,
    metricLabelEn: fieldLabelEn(metric),
    metricLabelZh: fieldLabelZh(metric),
    unit,
    stats,
    observations,
    academic: {
      en: `The waterfall explains the change from ${formatValue(start.value, ctx.dataset, metric)} (${start.label}) to ${formatValue(end.value, ctx.dataset, metric)} (${end.label}). Positive drivers add ${formatValue(positiveTotal, ctx.dataset, metric)}, while negative drivers remove ${formatValue(Math.abs(negativeTotal), ctx.dataset, metric)}. ${largestDrag ? `${largestDrag.label} is the largest negative contributor at ${formatValue(largestDrag.value, ctx.dataset, metric)}.` : ''} The net change is ${net >= 0 ? '+' : '−'}${formatValue(Math.abs(net), ctx.dataset, metric)}.`,
      zh: `瀑布图解释了从 ${start.label} 的 ${formatValue(start.value, ctx.dataset, metric)} 到 ${end.label} 的 ${formatValue(end.value, ctx.dataset, metric)} 的变化。正向驱动合计增加 ${formatValue(positiveTotal, ctx.dataset, metric)}，负向驱动合计减少 ${formatValue(Math.abs(negativeTotal), ctx.dataset, metric)}。${largestDrag ? `${largestDrag.label}是最大的负向项，为 ${formatValue(largestDrag.value, ctx.dataset, metric)}。` : ''}净变化为 ${net >= 0 ? '+' : '−'}${formatValue(Math.abs(net), ctx.dataset, metric)}。`,
    },
    business: {
      en: `We went from ${formatValue(start.value, ctx.dataset, metric)} to ${formatValue(end.value, ctx.dataset, metric)}. ${largestLift ? `${largestLift.label} added ${formatValue(largestLift.value, ctx.dataset, metric)}` : ''}${largestLift && largestDrag ? ', but ' : ''}${largestDrag ? `${largestDrag.label} took out ${formatValue(Math.abs(largestDrag.value), ctx.dataset, metric)}` : ''}.`,
      zh: `数值从 ${formatValue(start.value, ctx.dataset, metric)} 变为 ${formatValue(end.value, ctx.dataset, metric)}。${largestLift ? `${largestLift.label}带来 ${formatValue(largestLift.value, ctx.dataset, metric)}` : ''}${largestLift && largestDrag ? '，但' : ''}${largestDrag ? `${largestDrag.label}带走 ${formatValue(Math.abs(largestDrag.value), ctx.dataset, metric)}` : ''}。`,
    },
    everyday: {
      en: `It started at ${formatValue(start.value, ctx.dataset, metric)} and ended at ${formatValue(end.value, ctx.dataset, metric)}. ${largestDrag ? `${largestDrag.label} pulled it down the most.` : ''}`,
      zh: `从 ${formatValue(start.value, ctx.dataset, metric)} 开始，最后到 ${formatValue(end.value, ctx.dataset, metric)}。${largestDrag ? `${largestDrag.label}把它拉低最多。` : ''}`,
    },
    highlight: largestDrag?.label ?? largestLift?.label ?? 'max',
    notes: [{ en: 'Bars between the totals are changes, not levels; only the first and last bars are totals.', zh: '中间条形是变化量，不是水平值；只有首尾两根是总数。' }],
  };
}

export function analyzeRadar(ctx: AnalyzeContext): Analysis | null {
  const axisField = encodingField(ctx.spec, 'axis') || 'metric';
  const seriesField = encodingField(ctx.spec, 'series');
  const metric = ctx.metric || encodingField(ctx.spec, 'value') || 'value';
  if (!seriesField) return null;
  const seriesNames = [...new Set(ctx.rows.map((row) => String(row[seriesField] ?? '')))];
  const dimensions = [...new Set(ctx.rows.map((row) => String(row[axisField] ?? '')))];
  const bySeries = seriesNames.map((name) => {
    const rows = ctx.rows.filter((row) => String(row[seriesField]) === name && typeof row[metric] === 'number');
    return {
      name,
      average: mean(rows.map((row) => row[metric] as number)),
      values: new Map(rows.map((row) => [String(row[axisField]), row[metric] as number])),
    };
  }).filter((item) => Number.isFinite(item.average));
  const ranked = [...bySeries].sort((a, b) => b.average - a.average);
  const leader = ranked[0];
  const axisWins = dimensions.map((dimension) => {
    const values = bySeries
      .map((item) => ({ name: item.name, value: item.values.get(dimension) }))
      .filter((item): item is { name: string; value: number } => item.value != null)
      .sort((a, b) => b.value - a.value);
    return { dimension, ...values[0] };
  });
  const strongestAxis = [...axisWins].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
  return {
    kind: 'comparison',
    metric,
    metricLabelEn: fieldLabelEn(metric),
    metricLabelZh: fieldLabelZh(metric),
    unit: ctx.dataset.unit_short,
    stats: [
      ...ranked.slice(0, 2).map((item) => ({ labelEn: item.name, labelZh: item.name, value: formatValue(item.average, ctx.dataset, metric), noteEn: 'average across dimensions', noteZh: '各维度平均' })),
      { labelEn: 'Strongest dimension', labelZh: '最强维度', value: strongestAxis ? `${strongestAxis.dimension}: ${formatValue(strongestAxis.value ?? 0, ctx.dataset, metric)}` : '—', noteEn: strongestAxis?.name ?? '', noteZh: strongestAxis?.name ?? '' },
      { labelEn: 'Dimensions', labelZh: '维度数', value: String(dimensions.length), noteEn: `${seriesNames.length} series`, noteZh: `${seriesNames.length} 个系列` },
    ],
    observations: [
      { en: `${leader.name} has the highest average across dimensions at ${formatValue(leader.average, ctx.dataset, metric)}.`, zh: `${leader.name}在各维度的平均值最高，为 ${formatValue(leader.average, ctx.dataset, metric)}。` },
      { en: `${strongestAxis?.dimension} is led by ${strongestAxis?.name} at ${formatValue(strongestAxis?.value ?? 0, ctx.dataset, metric)}.`, zh: `${strongestAxis?.dimension}由 ${strongestAxis?.name} 领先，为 ${formatValue(strongestAxis?.value ?? 0, ctx.dataset, metric)}。` },
      { en: `The chart compares ${seriesNames.length} series across ${dimensions.length} dimensions; shape matters more than area.`, zh: `图表比较 ${seriesNames.length} 个系列在 ${dimensions.length} 个维度上的表现；看形状比看面积更有意义。` },
    ],
    academic: {
      en: `The radar chart compares ${seriesNames.length} series across ${dimensions.length} dimensions. ${leader.name} records the highest average at ${formatValue(leader.average, ctx.dataset, metric)}. ${strongestAxis ? `${strongestAxis.name} leads ${strongestAxis.dimension} at ${formatValue(strongestAxis.value ?? 0, ctx.dataset, metric)}.` : ''} The enclosed area is not a reliable measure, so compare each spoke separately.`,
      zh: `雷达图比较 ${seriesNames.length} 个系列在 ${dimensions.length} 个维度上的表现。${leader.name}的平均值最高，为 ${formatValue(leader.average, ctx.dataset, metric)}。${strongestAxis ? `${strongestAxis.name}在${strongestAxis.dimension}上领先，为 ${formatValue(strongestAxis.value ?? 0, ctx.dataset, metric)}。` : ''}围成的面积不可靠，应该逐条轴比较。`,
    },
    business: {
      en: `${leader.name} leads overall at an average of ${formatValue(leader.average, ctx.dataset, metric)}. ${strongestAxis ? `${strongestAxis.name} wins on ${strongestAxis.dimension}.` : ''}`,
      zh: `${leader.name}整体领先，平均为 ${formatValue(leader.average, ctx.dataset, metric)}。${strongestAxis ? `${strongestAxis.name}在${strongestAxis.dimension}上占优。` : ''}`,
    },
    everyday: {
      en: `${leader.name} scores highest on average. Each spoke is a different measure.`,
      zh: `${leader.name}平均得分最高。每一条轴代表一个不同的指标。`,
    },
    highlight: leader.name,
    notes: [{ en: 'With more than three series, radar lines overlap and become hard to read.', zh: '超过三个系列时，雷达线会互相重叠，越来越难读。' }],
  };
}

export function analyzeMarimekko(ctx: AnalyzeContext): Analysis | null {
  const xField = encodingField(ctx.spec, 'x') || 'x';
  const seriesField = encodingField(ctx.spec, 'series') || 'series';
  const metric = ctx.metric || encodingField(ctx.spec, 'value') || 'value';
  const rows = finiteValues(ctx.rows, metric).map(({ row, value }) => ({
    x: String(row[xField] ?? ''),
    series: String(row[seriesField] ?? ''),
    value,
  }));
  if (!rows.length) return null;
  const channels = new Map<string, number>();
  for (const row of rows) channels.set(row.x, (channels.get(row.x) ?? 0) + row.value);
  const totals = [...channels.entries()].sort((a, b) => b[1] - a[1]);
  const total = sum([...channels.values()]);
  const topChannel = totals[0];
  const topRows = rows.filter((row) => row.x === topChannel[0]);
  const topDevice = [...topRows].sort((a, b) => b.value - a.value)[0];
  const topDeviceShare = percentOf(topDevice?.value ?? 0, topChannel[1]);
  const mobile = rows.filter((row) => /mobile/i.test(row.series));
  const mobileTotal = sum(mobile.map((row) => row.value));
  const mobileShare = percentOf(mobileTotal, total);
  return {
    kind: 'proportion',
    metric,
    metricLabelEn: fieldLabelEn(metric),
    metricLabelZh: fieldLabelZh(metric),
    unit: ctx.dataset.unit_short,
    stats: [
      { labelEn: 'Largest channel', labelZh: '最大渠道', value: formatPercent(percentOf(topChannel[1], total) ?? 0), noteEn: topChannel[0], noteZh: topChannel[0] },
      { labelEn: 'Top device inside it', labelZh: '其内部最大设备', value: formatPercent(topDeviceShare ?? 0), noteEn: topDevice?.series ?? '', noteZh: topDevice?.series ?? '' },
      { labelEn: 'Mobile share', labelZh: '移动端占比', value: formatPercent(mobileShare ?? 0), noteEn: 'all channels', noteZh: '全部渠道' },
      { labelEn: 'Total', labelZh: '合计', value: formatValue(total, ctx.dataset, metric), noteEn: `${totals.length} channels`, noteZh: `${totals.length} 个渠道` },
    ],
    observations: [
      { en: `${topChannel[0]} is the widest column, taking ${formatPercent(percentOf(topChannel[1], total) ?? 0)} of the total.`, zh: `${topChannel[0]}是最宽的一列，占总量的 ${formatPercent(percentOf(topChannel[1], total) ?? 0)}。` },
      { en: `Inside ${topChannel[0]}, ${topDevice?.series} is the largest device at ${formatPercent(topDeviceShare ?? 0)}.`, zh: `在 ${topChannel[0]} 内部，${topDevice?.series}是最大设备，占 ${formatPercent(topDeviceShare ?? 0)}。` },
      { en: `Mobile accounts for ${formatPercent(mobileShare ?? 0)} of all sales.`, zh: `移动端占全部销售额的 ${formatPercent(mobileShare ?? 0)}。` },
    ],
    academic: {
      en: `The marimekko chart shows two shares at once: column width is each channel's share of total ${fieldLabelEn(metric)}, and height is the device mix within that channel. ${topChannel[0]} is the widest column at ${formatPercent(percentOf(topChannel[1], total) ?? 0)} of the total, and ${topDevice?.series} takes ${formatPercent(topDeviceShare ?? 0)} within it. Across all channels, mobile is ${formatPercent(mobileShare ?? 0)}.`,
      zh: `马赛克图同时展示两层比例：列宽是各渠道占总${fieldLabelZh(metric)}的份额，列内高度是该渠道的设备构成。${topChannel[0]}最宽，占总量的 ${formatPercent(percentOf(topChannel[1], total) ?? 0)}，其中 ${topDevice?.series}占 ${formatPercent(topDeviceShare ?? 0)}。全部渠道中，移动端占 ${formatPercent(mobileShare ?? 0)}。`,
    },
    business: {
      en: `${topChannel[0]} is the biggest channel at ${formatPercent(percentOf(topChannel[1], total) ?? 0)}, and ${topDevice?.series} dominates inside it. Mobile is ${formatPercent(mobileShare ?? 0)} of the total.`,
      zh: `${topChannel[0]}是最大渠道，占 ${formatPercent(percentOf(topChannel[1], total) ?? 0)}，其内部以${topDevice?.series}为主。移动端占总量的 ${formatPercent(mobileShare ?? 0)}。`,
    },
    everyday: {
      en: `${topChannel[0]} is the widest block, and most of it is ${topDevice?.series}.`,
      zh: `${topChannel[0]}是最宽的一块，其中大部分是${topDevice?.series}。`,
    },
    highlight: topChannel[0],
    notes: [{ en: 'Read widths first, then the shares inside each column.', zh: '先读列宽，再读每一列内部的比例。' }],
  };
}

export function analyzeCandlestick(ctx: AnalyzeContext): Analysis | null {
  const xField = encodingField(ctx.spec, 'x') || 'date';
  const openField = encodingField(ctx.spec, 'open') || 'open';
  const highField = encodingField(ctx.spec, 'high') || 'high';
  const lowField = encodingField(ctx.spec, 'low') || 'low';
  const closeField = encodingField(ctx.spec, 'close') || 'close';
  const rows = ctx.rows.filter(
    (row) =>
      typeof row[openField] === 'number' &&
      typeof row[closeField] === 'number' &&
      typeof row[highField] === 'number' &&
      typeof row[lowField] === 'number',
  );
  if (rows.length < 2) return null;
  const first = rows[0];
  const last = rows[rows.length - 1];
  const openFirst = first[openField] as number;
  const closeLast = last[closeField] as number;
  const change = closeLast - openFirst;
  const pct = changePct(openFirst, closeLast);
  const high = Math.max(...rows.map((row) => row[highField] as number));
  const low = Math.min(...rows.map((row) => row[lowField] as number));
  const upDays = rows.filter((row) => (row[closeField] as number) >= (row[openField] as number)).length;
  const downDays = rows.length - upDays;
  const moves = rows.map((row) => ({
    date: String(row[xField] ?? ''),
    move: (row[closeField] as number) - (row[openField] as number),
    range: (row[highField] as number) - (row[lowField] as number),
  }));
  const biggestMove = [...moves].sort((a, b) => Math.abs(b.move) - Math.abs(a.move))[0];
  const avgRange = mean(moves.map((move) => move.range));
  return {
    kind: 'time',
    metric: closeField,
    metricLabelEn: 'closing price',
    metricLabelZh: '收盘价',
    unit: ctx.dataset.unit_short,
    stats: [
      { labelEn: 'Latest close', labelZh: '最新收盘', value: formatValue(closeLast, ctx.dataset, closeField), noteEn: String(last[xField] ?? ''), noteZh: String(last[xField] ?? '') },
      { labelEn: 'Change', labelZh: '变化', value: `${change >= 0 ? '+' : '−'}${formatValue(Math.abs(change), ctx.dataset, closeField)}${pct != null ? ` (${formatPercent(pct)})` : ''}`, noteEn: `${String(first[xField] ?? '')} → ${String(last[xField] ?? '')}`, noteZh: `${String(first[xField] ?? '')} → ${String(last[xField] ?? '')}` },
      { labelEn: 'Range', labelZh: '区间', value: `${formatValue(low, ctx.dataset, lowField)} – ${formatValue(high, ctx.dataset, highField)}`, noteEn: `average daily range ${formatValue(avgRange, ctx.dataset, highField)}`, noteZh: `日均振幅 ${formatValue(avgRange, ctx.dataset, highField)}` },
      { labelEn: 'Up / down days', labelZh: '上涨 / 下跌', value: `${upDays} / ${downDays}`, noteEn: `${rows.length} trading days`, noteZh: `${rows.length} 个交易日` },
    ],
    observations: [
      { en: `The price moved from ${formatValue(openFirst, ctx.dataset, closeField)} to ${formatValue(closeLast, ctx.dataset, closeField)}, ${change >= 0 ? 'an increase' : 'a decrease'} of ${formatValue(Math.abs(change), ctx.dataset, closeField)}${pct != null ? ` (${formatPercent(Math.abs(pct))})` : ''}.`, zh: `价格从 ${formatValue(openFirst, ctx.dataset, closeField)} 变为 ${formatValue(closeLast, ctx.dataset, closeField)}，${change >= 0 ? '上涨' : '下跌'} ${formatValue(Math.abs(change), ctx.dataset, closeField)}${pct != null ? `（${formatPercent(Math.abs(pct))}）` : ''}。` },
      { en: `The range was ${formatValue(low, ctx.dataset, lowField)} to ${formatValue(high, ctx.dataset, highField)}.`, zh: `区间为 ${formatValue(low, ctx.dataset, lowField)} 到 ${formatValue(high, ctx.dataset, highField)}。` },
      { en: `There were ${upDays} up days and ${downDays} down days; the largest single-day move was ${formatValue(biggestMove.move, ctx.dataset, closeField)} on ${biggestMove.date}.`, zh: `有 ${upDays} 个上涨日、${downDays} 个下跌日；单日最大变动是 ${biggestMove.date} 的 ${formatValue(biggestMove.move, ctx.dataset, closeField)}。` },
    ],
    academic: {
      en: `The candlestick chart covers ${rows.length} trading days. The close moved from ${formatValue(openFirst, ctx.dataset, closeField)} to ${formatValue(closeLast, ctx.dataset, closeField)}, a change of ${change >= 0 ? '+' : '−'}${formatValue(Math.abs(change), ctx.dataset, closeField)}${pct != null ? ` (${formatPercent(pct)})` : ''}. Prices ranged from ${formatValue(low, ctx.dataset, lowField)} to ${formatValue(high, ctx.dataset, highField)}. ${upDays} days closed at or above the open and ${downDays} below. The body shows the open-to-close move; the wick shows the high and low.`,
      zh: `K 线图覆盖 ${rows.length} 个交易日。收盘价从 ${formatValue(openFirst, ctx.dataset, closeField)} 变为 ${formatValue(closeLast, ctx.dataset, closeField)}，变化 ${change >= 0 ? '+' : '−'}${formatValue(Math.abs(change), ctx.dataset, closeField)}${pct != null ? `（${formatPercent(pct)}）` : ''}。价格区间为 ${formatValue(low, ctx.dataset, lowField)} 到 ${formatValue(high, ctx.dataset, highField)}。${upDays} 天收盘不低于开盘，${downDays} 天低于开盘。实体表示开收盘差，影线表示最高最低。`,
    },
    business: {
      en: `The price finished at ${formatValue(closeLast, ctx.dataset, closeField)}, ${change >= 0 ? 'up' : 'down'} ${formatValue(Math.abs(change), ctx.dataset, closeField)} over ${rows.length} days. The largest one-day move was on ${biggestMove.date}.`,
      zh: `价格最后收于 ${formatValue(closeLast, ctx.dataset, closeField)}，${rows.length} 天里${change >= 0 ? '上涨' : '下跌'} ${formatValue(Math.abs(change), ctx.dataset, closeField)}。单日最大变动出现在 ${biggestMove.date}。`,
    },
    everyday: {
      en: `It started around ${formatValue(openFirst, ctx.dataset, closeField)} and ended at ${formatValue(closeLast, ctx.dataset, closeField)}. It went as low as ${formatValue(low, ctx.dataset, lowField)} and as high as ${formatValue(high, ctx.dataset, highField)}.`,
      zh: `从大约 ${formatValue(openFirst, ctx.dataset, closeField)} 开始，最后到 ${formatValue(closeLast, ctx.dataset, closeField)}；最低到过 ${formatValue(low, ctx.dataset, lowField)}，最高到过 ${formatValue(high, ctx.dataset, highField)}。`,
    },
    highlight: biggestMove.date,
    notes: [{ en: 'This is simulated data, not an investment record; one candle covers one trading day.', zh: '这是模拟数据，不是投资记录；一根蜡烛代表一个交易日。' }],
  };
}

export function analyzeTimeline(ctx: AnalyzeContext): Analysis | null {
  const labelField = encodingField(ctx.spec, 'label') || 'step';
  const startField = encodingField(ctx.spec, 'start') || 'start';
  const endField = encodingField(ctx.spec, 'end') || 'end';
  const statusField = encodingField(ctx.spec, 'status');
  const rows = ctx.rows
    .map((row) => ({
      label: String(row[labelField] ?? 'step'),
      start: typeof row[startField] === 'number' ? (row[startField] as number) : 0,
      end: typeof row[endField] === 'number' ? (row[endField] as number) : 0,
      status: statusField ? String(row[statusField] ?? '') : '',
    }))
    .map((row) => ({ ...row, end: Math.max(row.start, row.end) }));
  if (!rows.length) return null;
  const first = Math.min(...rows.map((row) => row.start));
  const last = Math.max(...rows.map((row) => row.end));
  const total = last - first;
  const durations = rows.map((row) => ({ ...row, duration: row.end - row.start }));
  const longest = [...durations].sort((a, b) => b.duration - a.duration)[0];
  const waiting = durations.filter((row) => /wait|idle|block|pending/i.test(row.status));
  const waitingTotal = sum(waiting.map((row) => row.duration));
  const waitingShare = percentOf(waitingTotal, total);
  return {
    kind: 'flow',
    metric: 'duration',
    metricLabelEn: 'duration',
    metricLabelZh: '时长',
    unit: ctx.dataset.unit_short,
    stats: [
      { labelEn: 'Total span', labelZh: '总跨度', value: formatValue(total, ctx.dataset, 'start'), noteEn: `${rows.length} steps`, noteZh: `${rows.length} 个步骤` },
      { labelEn: 'Longest step', labelZh: '最长步骤', value: formatValue(longest.duration, ctx.dataset, 'start'), noteEn: longest.label, noteZh: longest.label },
      { labelEn: 'Waiting time', labelZh: '等待时间', value: formatValue(waitingTotal, ctx.dataset, 'start'), noteEn: waiting.length ? `${formatPercent(waitingShare ?? 0)} of the span` : 'no waiting status', noteZh: waiting.length ? `占总跨度 ${formatPercent(waitingShare ?? 0)}` : '没有等待状态' },
      { labelEn: 'Steps', labelZh: '步骤数', value: String(rows.length), noteEn: 'start to end', noteZh: '从开始到结束' },
    ],
    observations: [
      { en: `The timeline runs ${formatValue(total, ctx.dataset, 'start')} from start to finish.`, zh: `时间线从头到尾共 ${formatValue(total, ctx.dataset, 'start')}。` },
      { en: `${longest.label} is the longest step at ${formatValue(longest.duration, ctx.dataset, 'start')}.`, zh: `${longest.label}是最长的步骤，为 ${formatValue(longest.duration, ctx.dataset, 'start')}。` },
      { en: waiting.length ? `Waiting accounts for ${formatValue(waitingTotal, ctx.dataset, 'start')}, or ${formatPercent(waitingShare ?? 0)} of the total.` : 'No step is marked as waiting.', zh: waiting.length ? `等待时间共 ${formatValue(waitingTotal, ctx.dataset, 'start')}，占总时长的 ${formatPercent(waitingShare ?? 0)}。` : '没有标记为等待的步骤。' },
    ],
    academic: {
      en: `The timeline covers ${formatValue(total, ctx.dataset, 'start')} across ${rows.length} steps. ${longest.label} is the longest at ${formatValue(longest.duration, ctx.dataset, 'start')}. ${waiting.length ? `Waiting time totals ${formatValue(waitingTotal, ctx.dataset, 'start')}, ${formatPercent(waitingShare ?? 0)} of the whole span.` : ''}`,
      zh: `时间线共 ${formatValue(total, ctx.dataset, 'start')}，包含 ${rows.length} 个步骤。${longest.label}最长，为 ${formatValue(longest.duration, ctx.dataset, 'start')}。${waiting.length ? `等待时间合计 ${formatValue(waitingTotal, ctx.dataset, 'start')}，占总跨度的 ${formatPercent(waitingShare ?? 0)}。` : ''}`,
    },
    business: {
      en: `The run takes ${formatValue(total, ctx.dataset, 'start')} in total. ${longest.label} takes ${formatValue(longest.duration, ctx.dataset, 'start')}, the longest single step${waiting.length ? `; waiting is ${formatPercent(waitingShare ?? 0)} of the time` : ''}.`,
      zh: `整个流程共 ${formatValue(total, ctx.dataset, 'start')}。${longest.label}耗时 ${formatValue(longest.duration, ctx.dataset, 'start')}，是最长的一步${waiting.length ? `；等待占 ${formatPercent(waitingShare ?? 0)}` : ''}。`,
    },
    everyday: {
      en: `The whole thing takes ${formatValue(total, ctx.dataset, 'start')}. The longest part is ${longest.label}.`,
      zh: `整个过程用了 ${formatValue(total, ctx.dataset, 'start')}，最长的一部分是 ${longest.label}。`,
    },
    highlight: longest.label,
    notes: [{ en: 'A timeline shows overlap; bars stacked on one row happen at the same time.', zh: '时间线能显示重叠；同一行上的条形表示同时进行。' }],
  };
}

export function analyzeBump(ctx: AnalyzeContext): Analysis | null {
  const xField = encodingField(ctx.spec, 'x') || 'x';
  const seriesField = encodingField(ctx.spec, 'series') || 'series';
  const rankField = encodingField(ctx.spec, 'rank') || 'rank';
  if (!seriesField) return null;
  const seriesNames = [...new Set(ctx.rows.map((row) => String(row[seriesField] ?? '')))];
  const xOrder = [...new Set(ctx.rows.map((row) => String(row[xField] ?? '')))];
  const tracks = seriesNames.map((name) => {
    const points = xOrder
      .map((x) => {
        const row = ctx.rows.find((item) => String(item[seriesField]) === name && String(item[xField]) === x);
        return row && typeof row[rankField] === 'number' ? { x, rank: row[rankField] as number } : null;
      })
      .filter((point): point is { x: string; rank: number } => point != null);
    return { name, first: points[0], last: points[points.length - 1] };
  }).filter((track) => track.first && track.last);
  if (!tracks.length) return null;
  const leader = [...tracks].sort((a, b) => a.last.rank - b.last.rank)[0];
  const climber = [...tracks].sort((a, b) => (b.first.rank - b.last.rank) - (a.first.rank - a.last.rank))[0];
  const faller = [...tracks].sort((a, b) => (b.last.rank - b.first.rank) - (a.last.rank - a.first.rank))[0];
  const rankText = (rank: number) => `#${formatNumber(rank, 0)}`;
  return {
    kind: 'comparison',
    metric: rankField,
    metricLabelEn: 'rank',
    metricLabelZh: '排名',
    unit: '',
    stats: [
      { labelEn: 'Leader at the end', labelZh: '期末第一', value: rankText(leader.last.rank), noteEn: leader.name, noteZh: leader.name },
      { labelEn: 'Biggest climber', labelZh: '上升最多', value: `${rankText(climber.first.rank)} → ${rankText(climber.last.rank)}`, noteEn: climber.name, noteZh: climber.name },
      { labelEn: 'Biggest faller', labelZh: '下降最多', value: `${rankText(faller.first.rank)} → ${rankText(faller.last.rank)}`, noteEn: faller.name, noteZh: faller.name },
      { labelEn: 'Series', labelZh: '系列数', value: String(tracks.length), noteEn: `${xOrder.length} periods`, noteZh: `${xOrder.length} 个时期` },
    ],
    observations: [
      { en: `${leader.name} finishes first at ${rankText(leader.last.rank)}.`, zh: `${leader.name}最终排第一（${rankText(leader.last.rank)}）。` },
      { en: `${climber.name} climbs from ${rankText(climber.first.rank)} to ${rankText(climber.last.rank)}.`, zh: `${climber.name}从 ${rankText(climber.first.rank)} 升到 ${rankText(climber.last.rank)}。` },
      { en: `${faller.name} falls from ${rankText(faller.first.rank)} to ${rankText(faller.last.rank)}.`, zh: `${faller.name}从 ${rankText(faller.first.rank)} 降到 ${rankText(faller.last.rank)}。` },
    ],
    academic: {
      en: `The bump chart follows rank changes across ${xOrder.length} periods. ${leader.name} ends in first place (${rankText(leader.last.rank)}). ${climber.name} makes the largest climb, from ${rankText(climber.first.rank)} to ${rankText(climber.last.rank)}, while ${faller.name} drops from ${rankText(faller.first.rank)} to ${rankText(faller.last.rank)}. Crossing lines show rank swaps; the height of a line is a rank, not a value.`,
      zh: `排名图追踪 ${xOrder.length} 个时期的排名变化。${leader.name}最终第一（${rankText(leader.last.rank)}）。${climber.name}上升最多，从 ${rankText(climber.first.rank)} 升到 ${rankText(climber.last.rank)}；${faller.name}下降最多，从 ${rankText(faller.first.rank)} 降到 ${rankText(faller.last.rank)}。线条交叉表示名次互换；线的位置是名次，不是数值。`,
    },
    business: {
      en: `${leader.name} takes first place. ${climber.name} is the biggest mover upward; ${faller.name} slips the most.`,
      zh: `${leader.name}拿下第一。${climber.name}上升最多，${faller.name}下滑最多。`,
    },
    everyday: {
      en: `${leader.name} ends up first. ${climber.name} moves up the most.`,
      zh: `${leader.name}最后排第一，${climber.name}上升最多。`,
    },
    highlight: climber.name,
    notes: [{ en: 'A rank chart ignores the size of the gap between ranks.', zh: '排名图不显示名次之间的差距大小。' }],
  };
}

export function analyzeSlope(ctx: AnalyzeContext): Analysis | null {
  const labelField = encodingField(ctx.spec, 'label') || 'label';
  const xField = encodingField(ctx.spec, 'x') || 'x';
  const metric = ctx.metric || encodingField(ctx.spec, 'value') || 'value';
  const rows = finiteValues(ctx.rows, metric);
  if (rows.length < 2) return null;
  const periods = [...new Set(ctx.rows.map((row) => String(row[xField] ?? '')))];
  if (periods.length < 2) return null;
  const items = [...new Set(ctx.rows.map((row) => String(row[labelField] ?? '')))].map((label) => {
    const find = (period: string) => {
      const row = ctx.rows.find((item) => String(item[labelField]) === label && String(item[xField]) === period);
      return row && typeof row[metric] === 'number' ? (row[metric] as number) : null;
    };
    const from = find(periods[0]);
    const to = find(periods[periods.length - 1]);
    return from != null && to != null ? { label, from, to, change: to - from } : null;
  }).filter((item): item is { label: string; from: number; to: number; change: number } => item != null);
  if (!items.length) return null;
  const top = [...items].sort((a, b) => b.to - a.to)[0];
  const riser = [...items].sort((a, b) => b.change - a.change)[0];
  const faller = [...items].sort((a, b) => a.change - b.change)[0];
  return {
    kind: 'comparison',
    metric,
    metricLabelEn: fieldLabelEn(metric),
    metricLabelZh: fieldLabelZh(metric),
    unit: ctx.dataset.unit_short,
    stats: [
      { labelEn: `Leader in ${periods[periods.length - 1]}`, labelZh: `${periods[periods.length - 1]} 领先`, value: formatValue(top.to, ctx.dataset, metric), noteEn: top.label, noteZh: top.label },
      { labelEn: 'Biggest rise', labelZh: '上升最多', value: `+${formatValue(riser.change, ctx.dataset, metric)}`, noteEn: `${riser.label} · ${formatValue(riser.from, ctx.dataset, metric)} → ${formatValue(riser.to, ctx.dataset, metric)}`, noteZh: `${riser.label} · ${formatValue(riser.from, ctx.dataset, metric)} → ${formatValue(riser.to, ctx.dataset, metric)}` },
      { labelEn: 'Biggest fall', labelZh: '下降最多', value: `−${formatValue(Math.abs(faller.change), ctx.dataset, metric)}`, noteEn: `${faller.label} · ${formatValue(faller.from, ctx.dataset, metric)} → ${formatValue(faller.to, ctx.dataset, metric)}`, noteZh: `${faller.label} · ${formatValue(faller.from, ctx.dataset, metric)} → ${formatValue(faller.to, ctx.dataset, metric)}` },
      { labelEn: 'Items', labelZh: '项目数', value: String(items.length), noteEn: periods.join(' → '), noteZh: periods.join(' → ') },
    ],
    observations: [
      { en: `${top.label} leads in ${periods[periods.length - 1]} at ${formatValue(top.to, ctx.dataset, metric)}.`, zh: `${top.label}在 ${periods[periods.length - 1]} 领先，为 ${formatValue(top.to, ctx.dataset, metric)}。` },
      { en: `${riser.label} rises the most, from ${formatValue(riser.from, ctx.dataset, metric)} to ${formatValue(riser.to, ctx.dataset, metric)}.`, zh: `${riser.label}上升最多，从 ${formatValue(riser.from, ctx.dataset, metric)} 到 ${formatValue(riser.to, ctx.dataset, metric)}。` },
      { en: `${faller.label} falls the most, from ${formatValue(faller.from, ctx.dataset, metric)} to ${formatValue(faller.to, ctx.dataset, metric)}.`, zh: `${faller.label}下降最多，从 ${formatValue(faller.from, ctx.dataset, metric)} 到 ${formatValue(faller.to, ctx.dataset, metric)}。` },
    ],
    academic: {
      en: `The slope chart compares ${items.length} items between ${periods[0]} and ${periods[periods.length - 1]}. ${top.label} finishes highest at ${formatValue(top.to, ctx.dataset, metric)}. ${riser.label} shows the largest rise (${formatValue(riser.from, ctx.dataset, metric)} to ${formatValue(riser.to, ctx.dataset, metric)}), while ${faller.label} falls the most (${formatValue(faller.from, ctx.dataset, metric)} to ${formatValue(faller.to, ctx.dataset, metric)}).`,
      zh: `斜率图比较 ${items.length} 个项目在 ${periods[0]} 与 ${periods[periods.length - 1]} 之间的变化。${top.label}最终最高，为 ${formatValue(top.to, ctx.dataset, metric)}。${riser.label}上升最多（从 ${formatValue(riser.from, ctx.dataset, metric)} 到 ${formatValue(riser.to, ctx.dataset, metric)}），${faller.label}下降最多（从 ${formatValue(faller.from, ctx.dataset, metric)} 到 ${formatValue(faller.to, ctx.dataset, metric)}）。`,
    },
    business: {
      en: `${top.label} leads at ${formatValue(top.to, ctx.dataset, metric)}. ${riser.label} is the biggest winner, ${faller.label} the biggest loser.`,
      zh: `${top.label}以 ${formatValue(top.to, ctx.dataset, metric)} 领先。${riser.label}上升最多，${faller.label}下降最多。`,
    },
    everyday: {
      en: `${top.label} is the biggest at the end. ${riser.label} went up the most.`,
      zh: `${top.label}期末最大，${riser.label}上升最多。`,
    },
    highlight: riser.label,
    notes: [{ en: 'A slope chart is for two periods; a line chart is better for three or more.', zh: '斜率图只适合两个时间点；三个以上时间点用折线图。' }],
  };
}

export function analyzeDumbbell(ctx: AnalyzeContext): Analysis | null {
  const labelField = encodingField(ctx.spec, 'label') || 'label';
  const startField = encodingField(ctx.spec, 'start') || 'start';
  const endField = encodingField(ctx.spec, 'end') || 'end';
  const items = ctx.rows
    .map((row) => {
      const start = row[startField];
      const end = row[endField];
      return typeof start === 'number' && typeof end === 'number'
        ? { label: String(row[labelField] ?? 'item'), start, end, change: end - start }
        : null;
    })
    .filter((item): item is { label: string; start: number; end: number; change: number } => item != null);
  if (!items.length) return null;
  const widest = [...items].sort((a, b) => Math.abs(b.change) - Math.abs(a.change))[0];
  const highest = [...items].sort((a, b) => b.end - a.end)[0];
  return {
    kind: 'comparison',
    metric: endField,
    metricLabelEn: fieldLabelEn(endField),
    metricLabelZh: fieldLabelZh(endField),
    unit: ctx.dataset.unit_short,
    stats: [
      { labelEn: 'Highest end value', labelZh: '期末最高', value: formatValue(highest.end, ctx.dataset, endField), noteEn: highest.label, noteZh: highest.label },
      { labelEn: 'Largest gap', labelZh: '最大差距', value: `${widest.change >= 0 ? '+' : '−'}${formatValue(Math.abs(widest.change), ctx.dataset, endField)}`, noteEn: widest.label, noteZh: widest.label },
      { labelEn: 'Items', labelZh: '项目数', value: String(items.length), noteEn: 'one connector each', noteZh: '每项一条连线' },
    ],
    observations: [
      { en: `${highest.label} has the highest end value at ${formatValue(highest.end, ctx.dataset, endField)}.`, zh: `${highest.label}期末值最高，为 ${formatValue(highest.end, ctx.dataset, endField)}。` },
      { en: `${widest.label} shows the largest change, from ${formatValue(widest.start, ctx.dataset, startField)} to ${formatValue(widest.end, ctx.dataset, endField)}.`, zh: `${widest.label}变化最大，从 ${formatValue(widest.start, ctx.dataset, startField)} 到 ${formatValue(widest.end, ctx.dataset, endField)}。` },
      { en: `The connector length is the story: ${items.filter((item) => item.change === 0).length} items are unchanged.`, zh: `连线的长度就是重点：${items.filter((item) => item.change === 0).length} 项没有变化。` },
    ],
    academic: {
      en: `The dumbbell chart compares two values per item. ${highest.label} ends highest at ${formatValue(highest.end, ctx.dataset, endField)}. ${widest.label} has the widest gap, moving from ${formatValue(widest.start, ctx.dataset, startField)} to ${formatValue(widest.end, ctx.dataset, endField)}. The length of each connector shows the size of the change.`,
      zh: `哑铃图比较每个项目的两个值。${highest.label}期末最高，为 ${formatValue(highest.end, ctx.dataset, endField)}。${widest.label}差距最大，从 ${formatValue(widest.start, ctx.dataset, startField)} 变到 ${formatValue(widest.end, ctx.dataset, endField)}。每条连线的长度表示变化大小。`,
    },
    business: {
      en: `${highest.label} ends highest at ${formatValue(highest.end, ctx.dataset, endField)}. The biggest move is ${widest.label}, ${widest.change >= 0 ? 'up' : 'down'} ${formatValue(Math.abs(widest.change), ctx.dataset, endField)}.`,
      zh: `${highest.label}期末最高，为 ${formatValue(highest.end, ctx.dataset, endField)}。变化最大的是${widest.label}，${widest.change >= 0 ? '上升' : '下降'} ${formatValue(Math.abs(widest.change), ctx.dataset, endField)}。`,
    },
    everyday: {
      en: `${widest.label} changed the most. ${highest.label} is the highest at the end.`,
      zh: `${widest.label}变化最大，${highest.label}期末最高。`,
    },
    highlight: widest.label,
    notes: [{ en: 'The dot pair is two points in time; the connector is the change, not a trend.', zh: '两个点代表两个时间点；连线是变化量，不是趋势。' }],
  };
}

export function analyzeCohort(ctx: AnalyzeContext): Analysis | null {
  const cohortField = encodingField(ctx.spec, 'cohort') || 'cohort';
  const periodField = encodingField(ctx.spec, 'period') || 'period';
  const valueField = encodingField(ctx.spec, 'value') || ctx.metric || 'value';
  const sizeField = encodingField(ctx.spec, 'size') || 'size';
  const rows = ctx.rows.filter((row) => typeof row[valueField] === 'number' && typeof row[periodField] === 'number');
  if (!rows.length) return null;
  const cohorts = [...new Set(rows.map((row) => String(row[cohortField] ?? '')))];
  const periods = [...new Set(rows.map((row) => Number(row[periodField])))].sort((a, b) => a - b);
  const rateFor = (row: (typeof rows)[number]) => {
    const size = typeof row[sizeField] === 'number' ? (row[sizeField] as number) : null;
    return size ? percentOf(Number(row[valueField]), size) : null;
  };
  const averageByPeriod = periods.map((period) => {
    const rates = rows.filter((row) => Number(row[periodField]) === period).map(rateFor).filter((rate): rate is number => rate != null);
    return { period, rate: mean(rates) };
  });
  const periodOne = averageByPeriod.find((item) => item.period === 1) ?? averageByPeriod[1];
  const minCohorts = Math.min(3, cohorts.length);
  const comparablePeriod = [...periods]
    .reverse()
    .find((period) => rows.filter((row) => Number(row[periodField]) === period).length >= minCohorts)
    ?? periods[0];
  const common = averageByPeriod.find((item) => item.period === comparablePeriod);
  const cohortScores = cohorts.map((cohort) => {
    const row = rows.find(
      (item) => String(item[cohortField]) === cohort && Number(item[periodField]) === comparablePeriod,
    );
    return { cohort, rate: row ? rateFor(row) ?? 0 : 0 };
  }).sort((a, b) => b.rate - a.rate);
  const best = cohortScores[0];
  return {
    kind: 'time',
    metric: valueField,
    metricLabelEn: 'retention rate',
    metricLabelZh: '留存率',
    unit: '%',
    stats: [
      { labelEn: 'Month 1 retention', labelZh: '第 1 期留存', value: formatPercent(periodOne?.rate ?? 0), noteEn: 'average across cohorts', noteZh: '各同期群平均' },
      { labelEn: `Period ${comparablePeriod} (comparable)`, labelZh: `第 ${comparablePeriod} 期（可比较）`, value: formatPercent(common?.rate ?? 0), noteEn: `${minCohorts}+ cohorts have data`, noteZh: `${minCohorts} 个以上批次有数据` },
      { labelEn: 'Best cohort', labelZh: '最佳同期群', value: formatPercent(best?.rate ?? 0), noteEn: `${best?.cohort ?? ''} · period ${comparablePeriod}`, noteZh: `${best?.cohort ?? ''} · 第 ${comparablePeriod} 期` },
      { labelEn: 'Cohorts', labelZh: '同期群数', value: String(cohorts.length), noteEn: `${rows.length} cells`, noteZh: `${rows.length} 个格子` },
    ],
    observations: [
      { en: `Average month 1 retention is ${formatPercent(periodOne?.rate ?? 0)}.`, zh: `第 1 期平均留存率为 ${formatPercent(periodOne?.rate ?? 0)}。` },
      { en: `At period ${comparablePeriod}, the average is ${formatPercent(common?.rate ?? 0)}; ${best?.cohort} has the strongest retention at ${formatPercent(best?.rate ?? 0)}.`, zh: `在第 ${comparablePeriod} 期，平均留存为 ${formatPercent(common?.rate ?? 0)}；${best?.cohort}最高，为 ${formatPercent(best?.rate ?? 0)}。` },
      { en: `Retention is measured within each cohort's own size, not against a shared total.`, zh: `留存率按每个同期群自身规模计算，不是对同一个总数取比例。` },
    ],
    academic: {
      en: `The cohort chart follows ${cohorts.length} signup cohorts over ${periods.length} periods. Average retention is ${formatPercent(periodOne?.rate ?? 0)} after one period and ${formatPercent(common?.rate ?? 0)} at period ${comparablePeriod}, the latest period with enough cohorts to compare. ${best?.cohort} has the strongest retention at ${formatPercent(best?.rate ?? 0)}. Rates are calculated against each cohort's own starting size; later cohorts have fewer columns because they have had less time to age.`,
      zh: `同期群图追踪 ${cohorts.length} 个注册批次、共 ${periods.length} 期。第 1 期平均留存为 ${formatPercent(periodOne?.rate ?? 0)}，第 ${comparablePeriod} 期为 ${formatPercent(common?.rate ?? 0)}；这是仍有足够批次可比较的最新一期。${best?.cohort}留存最高，为 ${formatPercent(best?.rate ?? 0)}。留存率按每个批次自身规模计算；越新的批次列越少，因为它们经历的时间更短。`,
    },
    business: {
      en: `After one period, ${formatPercent(periodOne?.rate ?? 0)} of users remain on average; at period ${comparablePeriod}, the figure is ${formatPercent(common?.rate ?? 0)}. ${best?.cohort} retains best.`,
      zh: `第 1 期平均留下 ${formatPercent(periodOne?.rate ?? 0)} 的用户；第 ${comparablePeriod} 期为 ${formatPercent(common?.rate ?? 0)}。${best?.cohort}留存最好。`,
    },
    everyday: {
      en: `About ${formatPercent(periodOne?.rate ?? 0)} come back after one period. ${best?.cohort} holds on to the most people.`,
      zh: `大约 ${formatPercent(periodOne?.rate ?? 0)} 的用户在第 1 期后还在，${best?.cohort}留下的人最多。`,
    },
    highlight: best?.cohort ?? 'max',
    notes: [{ en: 'Compare a cohort down its own row; do not compare a filled cell with an empty one.', zh: '沿着同一行比较批次；不要把有数据的格子和空白格子直接比较。' }],
  };
}
