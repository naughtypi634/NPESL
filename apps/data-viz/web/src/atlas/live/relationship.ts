import type { Analysis, AnalyzeContext, Narrative, Stat } from './types';
import {
  correlationWord,
  encodingField,
  fieldLabelEn,
  fieldLabelZh,
  formatNumber,
  formatPercent,
  formatValue,
  labelField,
  pearson,
  percentOf,
  sum,
} from './util';

export function analyzeScatter(ctx: AnalyzeContext): Analysis | null {
  const xField = encodingField(ctx.spec, 'x') || 'x';
  const yField = encodingField(ctx.spec, 'y') || ctx.metric || 'y';
  const label = labelField(ctx.spec);
  const sizeField = encodingField(ctx.spec, 'size');
  const paired = ctx.rows.filter(
    (row) =>
      typeof row[xField] === 'number' &&
      Number.isFinite(row[xField] as number) &&
      typeof row[yField] === 'number' &&
      Number.isFinite(row[yField] as number),
  );
  if (paired.length < 3) return null;
  const xs = paired.map((row) => row[xField] as number);
  const ys = paired.map((row) => row[yField] as number);
  const r = pearson(xs, ys);
  const word = r == null ? null : correlationWord(r);
  const withLabel = paired.map((row) => ({
    row,
    label: label && row[label] != null ? String(row[label]) : 'item',
    x: row[xField] as number,
    y: row[yField] as number,
    size: sizeField && typeof row[sizeField] === 'number' ? (row[sizeField] as number) : null,
  }));
  const highestY = [...withLabel].sort((a, b) => b.y - a.y)[0];
  const lowestY = [...withLabel].sort((a, b) => a.y - b.y)[0];
  const widest = [...withLabel].sort((a, b) => (b.size ?? 0) - (a.size ?? 0))[0];
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const strengthText = word ? word.en : 'no clear linear association';
  const strengthZh = word ? word.zh : '没有明显的线性关系';
  const rText = r == null ? 'not computable' : formatNumber(r, 2);

  const stats: Stat[] = [
    { labelEn: 'Correlation', labelZh: '相关系数', value: r == null ? '—' : formatNumber(r, 2), noteEn: word?.en ?? 'no clear linear association', noteZh: word?.zh ?? '没有明显线性关系' },
    { labelEn: fieldLabelEn(yField), labelZh: fieldLabelZh(yField), value: `${formatValue(yMin, ctx.dataset, yField)} – ${formatValue(yMax, ctx.dataset, yField)}`, noteEn: 'range', noteZh: '范围' },
    { labelEn: fieldLabelEn(xField), labelZh: fieldLabelZh(xField), value: `${formatValue(xMin, ctx.dataset, xField)} – ${formatValue(xMax, ctx.dataset, xField)}`, noteEn: 'range', noteZh: '范围' },
    { labelEn: 'Observations', labelZh: '数据点', value: String(paired.length), noteEn: sizeField ? `size: ${fieldLabelEn(sizeField)}` : 'one dot per row', noteZh: sizeField ? `气泡大小：${fieldLabelZh(sizeField)}` : '每一行一个点' },
  ];

  const observations: Narrative[] = [
    {
      en: r == null
        ? `The chart plots ${fieldLabelEn(yField)} against ${fieldLabelEn(xField)} for ${paired.length} items, but there is no clear linear pattern.`
        : `There is a ${strengthText} association between ${fieldLabelEn(xField)} and ${fieldLabelEn(yField)} (r = ${rText}).`,
      zh: r == null
        ? `图表把 ${paired.length} 个项目的${fieldLabelZh(yField)}和${fieldLabelZh(xField)}放在一起，但没有明显的线性关系。`
        : `${fieldLabelZh(xField)}与${fieldLabelZh(yField)}之间呈${strengthZh}（r = ${rText}）。`,
    },
    {
      en: `${highestY.label} has the highest ${fieldLabelEn(yField)} at ${formatValue(highestY.y, ctx.dataset, yField)}, while ${lowestY.label} has the lowest at ${formatValue(lowestY.y, ctx.dataset, yField)}.`,
      zh: `${highestY.label}的${fieldLabelZh(yField)}最高，为 ${formatValue(highestY.y, ctx.dataset, yField)}；${lowestY.label}最低，为 ${formatValue(lowestY.y, ctx.dataset, yField)}。`,
    },
    sizeField
      ? {
          en: `${widest.label} has the largest ${fieldLabelEn(sizeField)} at ${formatValue(widest.size ?? 0, ctx.dataset, sizeField)}. Bubble size is the weakest visual channel, so read exact amounts from the table.`,
          zh: `${widest.label}的${fieldLabelZh(sizeField)}最大，为 ${formatValue(widest.size ?? 0, ctx.dataset, sizeField)}。气泡大小是最难精确比较的视觉通道，具体数额应看表格。`,
        }
      : {
          en: `${fieldLabelEn(xField)} runs from ${formatValue(xMin, ctx.dataset, xField)} to ${formatValue(xMax, ctx.dataset, xField)}.`,
          zh: `${fieldLabelZh(xField)}从 ${formatValue(xMin, ctx.dataset, xField)} 到 ${formatValue(xMax, ctx.dataset, xField)}。`,
        },
  ];

  const caution = {
    en: 'A scatter plot shows association, not causation: a third factor may explain both measures.',
    zh: '散点图只说明相关，不说明因果：可能有第三个因素同时影响两个指标。',
  };
  observations.push(caution);

  return {
    kind: 'relationship',
    metric: yField,
    metricLabelEn: fieldLabelEn(yField),
    metricLabelZh: fieldLabelZh(yField),
    unit: ctx.dataset.unit_short,
    stats,
    observations,
    academic: {
      en: `The chart plots ${fieldLabelEn(yField)} against ${fieldLabelEn(xField)} for ${paired.length} items. ${r == null ? 'No clear linear association can be computed.' : `The Pearson correlation is ${rText}, a ${strengthText} association.`} ${highestY.label} has the highest ${fieldLabelEn(yField)} (${formatValue(highestY.y, ctx.dataset, yField)}), while ${lowestY.label} has the lowest (${formatValue(lowestY.y, ctx.dataset, yField)}). This is an association only; the chart does not show that one measure causes the other.`,
      zh: `图表把 ${paired.length} 个项目的${fieldLabelZh(yField)}和${fieldLabelZh(xField)}放在一起。${r == null ? '无法算出明显的线性关系。' : `皮尔逊相关系数为 ${rText}，属于${strengthZh}。`}${highestY.label}的${fieldLabelZh(yField)}最高（${formatValue(highestY.y, ctx.dataset, yField)}），${lowestY.label}最低（${formatValue(lowestY.y, ctx.dataset, yField)}）。这只是相关关系，图表不能说明一个指标导致另一个指标。`,
    },
    business: {
      en: `${highestY.label} leads on ${fieldLabelEn(yField)} at ${formatValue(highestY.y, ctx.dataset, yField)}${r == null ? '' : `, and the overall association is ${strengthText}`}. ${lowestY.label} is lowest at ${formatValue(lowestY.y, ctx.dataset, yField)}. Treat this as a pattern to investigate, not proof of cause.`,
      zh: `${highestY.label}的${fieldLabelZh(yField)}最高，为 ${formatValue(highestY.y, ctx.dataset, yField)}${r == null ? '' : `，整体呈${strengthZh}`}；${lowestY.label}最低，为 ${formatValue(lowestY.y, ctx.dataset, yField)}。这只能作为值得进一步调查的模式，不能当作因果证据。`,
    },
    everyday: {
      en: `${highestY.label} has the highest ${fieldLabelEn(yField)}, at ${formatValue(highestY.y, ctx.dataset, yField)}. ${lowestY.label} has the lowest, at ${formatValue(lowestY.y, ctx.dataset, yField)}. The two measures seem loosely related, but that does not prove one causes the other.`,
      zh: `${highestY.label}的${fieldLabelZh(yField)}最高，为 ${formatValue(highestY.y, ctx.dataset, yField)}；${lowestY.label}最低，为 ${formatValue(lowestY.y, ctx.dataset, yField)}。两个指标看起来有一点关系，但不能证明谁导致谁。`,
    },
    highlight: highestY.label,
    notes: [caution],
  };
}

export function analyzeHeatmap(ctx: AnalyzeContext): Analysis | null {
  const xField = encodingField(ctx.spec, 'x') || 'x';
  const yField = encodingField(ctx.spec, 'y') || 'y';
  const valueField = encodingField(ctx.spec, 'value') || ctx.metric || 'value';
  const rows = ctx.rows.filter((row) => typeof row[valueField] === 'number' && Number.isFinite(row[valueField] as number));
  if (!rows.length) return null;
  const cells = rows.map((row) => ({
    x: String(row[xField] ?? ''),
    y: String(row[yField] ?? ''),
    value: Number(row[valueField]),
  }));
  const max = [...cells].sort((a, b) => b.value - a.value)[0];
  const min = [...cells].sort((a, b) => a.value - b.value)[0];
  const rowTotals = new Map<string, number>();
  const colTotals = new Map<string, number>();
  for (const cell of cells) {
    rowTotals.set(cell.y, (rowTotals.get(cell.y) ?? 0) + cell.value);
    colTotals.set(cell.x, (colTotals.get(cell.x) ?? 0) + cell.value);
  }
  const topRow = [...rowTotals.entries()].sort((a, b) => b[1] - a[1])[0];
  const topCol = [...colTotals.entries()].sort((a, b) => b[1] - a[1])[0];
  const total = sum(cells.map((cell) => cell.value));
  const topShare = percentOf(max.value, total);
  const topThree = [...cells].sort((a, b) => b.value - a.value).slice(0, 3);
  const topThreeSum = sum(topThree.map((cell) => cell.value));
  const unit = ctx.dataset.unit_short;

  return {
    kind: 'relationship',
    metric: valueField,
    metricLabelEn: fieldLabelEn(valueField),
    metricLabelZh: fieldLabelZh(valueField),
    unit,
    stats: [
      { labelEn: 'Busiest cell', labelZh: '最高单元格', value: formatValue(max.value, ctx.dataset, valueField), noteEn: `${max.y} · ${max.x}`, noteZh: `${max.y} · ${max.x}` },
      { labelEn: 'Busiest row', labelZh: '最高行', value: formatValue(topRow[1], ctx.dataset, valueField), noteEn: topRow[0], noteZh: topRow[0] },
      { labelEn: 'Busiest column', labelZh: '最高列', value: formatValue(topCol[1], ctx.dataset, valueField), noteEn: topCol[0], noteZh: topCol[0] },
      { labelEn: 'Top cell share', labelZh: '最高格占比', value: formatPercent(topShare ?? 0), noteEn: `${formatValue(min.value, ctx.dataset, valueField)} is the lowest cell`, noteZh: `最低格为 ${formatValue(min.value, ctx.dataset, valueField)}` },
    ],
    observations: [
      { en: `The highest value is ${formatValue(max.value, ctx.dataset, valueField)} at ${max.y} · ${max.x}.`, zh: `最高值是 ${max.y} · ${max.x} 的 ${formatValue(max.value, ctx.dataset, valueField)}。` },
      { en: `${topRow[0]} has the highest row total (${formatValue(topRow[1], ctx.dataset, valueField)}), and ${topCol[0]} has the highest column total (${formatValue(topCol[1], ctx.dataset, valueField)}).`, zh: `${topRow[0]}所在行合计最高（${formatValue(topRow[1], ctx.dataset, valueField)}），${topCol[0]}所在列合计最高（${formatValue(topCol[1], ctx.dataset, valueField)}）。` },
      { en: `The three highest cells account for ${formatPercent(percentOf(topThreeSum, total) ?? 0)} of all activity.`, zh: `最高的三个格子占全部活动的 ${formatPercent(percentOf(topThreeSum, total) ?? 0)}。` },
    ],
    academic: {
      en: `The heatmap shows ${fieldLabelEn(valueField)} for each combination of ${fieldLabelEn(yField)} and ${fieldLabelEn(xField)}. The highest cell is ${max.y} at ${max.x}, with ${formatValue(max.value, ctx.dataset, valueField)}; the lowest is ${min.y} at ${min.x}, with ${formatValue(min.value, ctx.dataset, valueField)}. ${topRow[0]} has the highest row total and ${topCol[0]} the highest column total. Color shows the pattern; exact values should be read from the cells or a table.`,
      zh: `热力图展示 ${fieldLabelZh(yField)}与${fieldLabelZh(xField)}每种组合的${fieldLabelZh(valueField)}。最高格是 ${max.y} 的 ${max.x}，为 ${formatValue(max.value, ctx.dataset, valueField)}；最低格是 ${min.y} 的 ${min.x}，为 ${formatValue(min.value, ctx.dataset, valueField)}。${topRow[0]}所在行合计最高，${topCol[0]}所在列合计最高。颜色用于看模式，精确值应看格子或表格。`,
    },
    business: {
      en: `Activity peaks at ${max.y} · ${max.x} (${formatValue(max.value, ctx.dataset, valueField)}). ${topRow[0]} is the busiest row and ${topCol[0]} the busiest column.`,
      zh: `活动峰值出现在 ${max.y} · ${max.x}（${formatValue(max.value, ctx.dataset, valueField)}）。${topRow[0]}是最忙的一行，${topCol[0]}是最忙的一列。`,
    },
    everyday: {
      en: `The darkest cell is ${max.y} at ${max.x}, with ${formatValue(max.value, ctx.dataset, valueField)}. The lightest is ${min.y} at ${min.x}.`,
      zh: `颜色最深的格子是 ${max.y} 的 ${max.x}，为 ${formatValue(max.value, ctx.dataset, valueField)}；最浅的是 ${min.y} 的 ${min.x}。`,
    },
    highlight: 'max',
    notes: [{ en: 'Use the cell values, not color alone, when numbers matter.', zh: '需要精确数字时看格子数值，不要只凭颜色深浅。' }],
  };
}

export function analyzeParallel(ctx: AnalyzeContext): Analysis | null {
  const label = labelField(ctx.spec);
  if (!label) return null;
  const configured = ctx.spec.options?.dimensions;
  const dimensions = Array.isArray(configured)
    ? configured.filter((item): item is string => typeof item === 'string')
    : Object.keys(ctx.rows[0] ?? {}).filter((field) => field !== label && typeof ctx.rows[0][field] === 'number');
  if (!dimensions.length) return null;
  const invertRaw = ctx.spec.options?.invert;
  const inverted = Array.isArray(invertRaw) ? invertRaw.filter((item): item is string => typeof item === 'string') : [];
  const items = ctx.rows.map((row) => ({
    label: String(row[label] ?? 'item'),
    row,
  }));
  const bestCounts = new Map<string, number>();
  const dimensionBest: { field: string; label: string; value: number }[] = [];
  for (const field of dimensions) {
    const values = items
      .map((item) => ({ label: item.label, value: item.row[field] }))
      .filter((item): item is { label: string; value: number } => typeof item.value === 'number' && Number.isFinite(item.value));
    if (!values.length) continue;
    const sorted = [...values].sort((a, b) => a.value - b.value);
    const best = inverted.includes(field) ? sorted[0] : sorted[sorted.length - 1];
    dimensionBest.push({ field, label: best.label, value: best.value });
    bestCounts.set(best.label, (bestCounts.get(best.label) ?? 0) + 1);
  }
  const ranked = [...bestCounts.entries()].sort((a, b) => b[1] - a[1]);
  const overall = ranked[0]?.[0] ?? items[0]?.label ?? '';
  const overallWins = ranked[0]?.[1] ?? 0;
  const widest = dimensionBest
    .map((item) => {
      const values = items.map((row) => row.row[item.field]).filter((value): value is number => typeof value === 'number');
      return { ...item, spread: Math.max(...values) - Math.min(...values) };
    })
    .sort((a, b) => b.spread - a.spread)[0];
  const stats: Stat[] = [
    { labelEn: 'Most first places', labelZh: '最多项领先', value: overall, noteEn: `${overallWins} of ${dimensionBest.length} dimensions`, noteZh: `${dimensionBest.length} 项中领先 ${overallWins} 项` },
    ...dimensionBest.slice(0, 3).map((item) => ({
      labelEn: fieldLabelEn(item.field),
      labelZh: fieldLabelZh(item.field),
      value: formatValue(item.value, ctx.dataset, item.field),
      noteEn: item.label,
      noteZh: item.label,
    })),
  ];
  const observations: Narrative[] = [
    { en: `${overall} leads on ${overallWins} of ${dimensionBest.length} dimensions.`, zh: `${overall}在 ${dimensionBest.length} 个指标中领先 ${overallWins} 个。` },
    { en: `${widest ? `${widest.label} leads on ${fieldLabelEn(widest.field)} at ${formatValue(widest.value, ctx.dataset, widest.field)}.` : ''}`, zh: widest ? `${widest.label}的${fieldLabelZh(widest.field)}最高，为 ${formatValue(widest.value, ctx.dataset, widest.field)}。` : '' },
    { en: `${dimensionBest.slice(0, 3).map((item) => `${item.label} for ${fieldLabelEn(item.field)}`).join(' · ')}.`, zh: `${dimensionBest.slice(0, 3).map((item) => `${fieldLabelZh(item.field)}：${item.label}`).join(' · ')}。` },
  ];
  return {
    kind: 'relationship',
    metric: dimensions[0],
    metricLabelEn: fieldLabelEn(dimensions[0]),
    metricLabelZh: fieldLabelZh(dimensions[0]),
    unit: ctx.dataset.unit_short,
    stats,
    observations,
    academic: {
      en: `The parallel coordinates plot compares ${items.length} items across ${dimensions.length} dimensions. ${overall} leads on ${overallWins} of them${overallWins > 1 ? '' : ''}. ${widest ? `${fieldLabelEn(widest.field)} is led by ${widest.label} at ${formatValue(widest.value, ctx.dataset, widest.field)}.` : ''} Crossing lines show trade-offs: an item that is strong on one axis may be weaker on another.`,
      zh: `平行坐标图比较了 ${items.length} 个项目的 ${dimensions.length} 项指标。${overall}在其中 ${overallWins} 项领先。${widest ? `${fieldLabelZh(widest.field)}由 ${widest.label} 领先，为 ${formatValue(widest.value, ctx.dataset, widest.field)}。` : ''}线条交叉体现了取舍：一项指标强的项目，另一项可能较弱。`,
    },
    business: {
      en: `${overall} takes first place on ${overallWins} of ${dimensionBest.length} measures. ${widest ? `${widest.label} leads ${fieldLabelEn(widest.field)} at ${formatValue(widest.value, ctx.dataset, widest.field)}.` : ''} No single option dominates every dimension.`,
      zh: `${overall}在 ${dimensionBest.length} 项指标中拿下 ${overallWins} 项第一。${widest ? `${widest.label}的${fieldLabelZh(widest.field)}最高，为 ${formatValue(widest.value, ctx.dataset, widest.field)}。` : ''}没有任何一个选项在所有指标上都占优。`,
    },
    everyday: {
      en: `${overall} wins the most categories (${overallWins}). Different models are better at different things.`,
      zh: `${overall}拿下的第一最多（${overallWins} 项）。不同型号各有强项。`,
    },
    highlight: overall,
    notes: [{ en: 'Inverted axes (such as price and weight) are read in the opposite direction.', zh: '价格、重量这类反向轴要反着读：越低越好。' }],
  };
}
