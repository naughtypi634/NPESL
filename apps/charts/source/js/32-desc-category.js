(function (NC) {
  'use strict';

  var desc = NC.desc;

  function valueText(dataset, value) {
    return NC.fmt.value(value, dataset.unit, 0);
  }

  function valueZh(dataset, value) {
    return NC.fmt.valueZh(value, dataset.unit, dataset.unit_zh, 0);
  }

  function pct(part, total) {
    return total > 0 ? part / total * 100 : 0;
  }

  function pctText(value) {
    return NC.fmt.number(value, Math.abs(value - Math.round(value)) < 0.05 ? 0 : 1) + '%';
  }

  function agenda(dataset) {
    var totals = dataset.categories.map(function (category, index) {
      return dataset.series.reduce(function (sum, series) { return sum + series.values[index]; }, 0);
    });
    var items = dataset.categories.map(function (category, index) {
      return {
        id: category.id,
        name_en: category.label_en,
        name_zh: category.label_zh,
        value: totals[index],
        index: index
      };
    }).sort(function (a, b) { return b.value - a.value; });
    items.forEach(function (item, index) { item.rank = index + 1; });
    var total = totals.reduce(function (sum, value) { return sum + value; }, 0);
    var series = dataset.series.map(function (item, index) {
      var sum = item.values.reduce(function (acc, value) { return acc + value; }, 0);
      return {
        id: item.id,
        name_en: item.name_en,
        name_zh: item.name_zh,
        value: sum,
        share: pct(sum, total),
        values: item.values,
        index: index
      };
    }).sort(function (a, b) { return b.value - a.value; });
    return {
      totals: totals,
      total: total,
      items: items,
      top: items[0],
      second: items[1],
      bottom: items[items.length - 1],
      gap: items.length > 1 ? items[0].value - items[1].value : 0,
      series: series,
      topSeries: series[0],
      secondSeries: series[1],
      bottomSeries: series[series.length - 1]
    };
  }

  function compositionSentence(dataset, level, mode) {
    var data = agenda(dataset);
    var top = data.topSeries;
    var second = data.secondSeries;
    var topShare = pctText(top.share);
    var secondShare = pctText(second.share);
    if (level === 'A2') {
      if (mode.layout === 'stacked') {
        return desc.sentence('structure', top.name_en + ' is the biggest part of every region\'s revenue.', top.name_zh + '是每个地区收入中最大的一块。');
      }
      return desc.sentence('structure', top.name_en + ' is the biggest product line, and ' + second.name_en + ' is the second.', top.name_zh + '是最大的产品线，' + second.name_zh + '排第二。');
    }
    if (level === 'B1') {
      return desc.sentence('structure', top.name_en + ' makes up ' + topShare + ' of total revenue, followed by ' + second.name_en + ' at ' + secondShare + '.', top.name_zh + '占总收入的 ' + topShare + '，' + second.name_zh + '以 ' + secondShare + ' 位居第二。');
    }
    if (level === 'B2') {
      if (mode.layout === 'stacked') {
        return desc.sentence('structure', 'Stacked by product line, the bars show that ' + top.name_en.toLowerCase() + ' accounts for about ' + topShare + ' of each region\'s revenue.', '按产品线堆叠后可以看出，' + top.name_zh + '在每个地区的收入中都占约 ' + topShare + '。');
      }
      return desc.sentence('structure', top.name_en + ' accounts for ' + topShare + ' of revenue, well ahead of ' + second.name_en + ' at ' + secondShare + '.', top.name_zh + '占收入的 ' + topShare + '，明显领先于占 ' + secondShare + ' 的' + second.name_zh + '。');
    }
    var northEast = dataset.categories.filter(function (category) { return category.id === 'northeast'; })[0];
    if (northEast && mode.layout === 'stacked') {
      return desc.sentence('structure', 'Coffee remains the core product line across the network, and the mix barely shifts from one region to the next.', '咖啡仍是整个网络的核心产品线，各地区之间的构成几乎没有变化。');
    }
    return desc.sentence('structure', 'Coffee remains the core product line, contributing ' + topShare + ' of group revenue, while bakery and retail add breadth rather than scale.', '咖啡仍是核心产品线，贡献集团收入的 ' + topShare + '；烘焙和零售更多是补充品类，而非规模来源。');
  }

  desc.bar = function (dataset, level, mode) {
    var options = mode || {};
    var data = agenda(dataset);
    var top = data.top;
    var second = data.second;
    var bottom = data.bottom;
    var topValue = valueText(dataset, top.value);
    var topValueZh = valueZh(dataset, top.value);
    var secondValue = valueText(dataset, second.value);
    var secondValueZh = valueZh(dataset, second.value);
    var bottomValue = valueText(dataset, bottom.value);
    var bottomValueZh = valueZh(dataset, bottom.value);
    var gapValue = valueText(dataset, data.gap);
    var gapValueZh = valueZh(dataset, data.gap);
    var topTwoShare = pctText(pct(top.value + second.value, data.total));
    var sentences = [];

    if (level === 'A2') {
      sentences.push(desc.sentence(
        'overview',
        top.name_en + ' had the highest revenue, at ' + topValue + '. ' + bottom.name_en + ' had the lowest, at ' + bottomValue + '.',
        top.name_zh + '收入最高，为 ' + topValueZh + '；' + bottom.name_zh + '最低，为 ' + bottomValueZh + '。'
      ));
    } else if (level === 'B1') {
      sentences.push(desc.sentence(
        'overview',
        top.name_en + ' led with ' + topValue + ', followed by ' + second.name_en + ' at ' + secondValue + '.',
        top.name_zh + '以 ' + topValueZh + '领先，' + second.name_zh + '以 ' + secondValueZh + '紧随其后。'
      ));
      sentences.push(desc.sentence(
        'bottom',
        bottom.name_en + ' was the lowest, at ' + bottomValue + '.',
        bottom.name_zh + '最低，为 ' + bottomValueZh + '。'
      ));
    } else if (level === 'B2') {
      sentences.push(desc.sentence(
        'overview',
        top.name_en + ' topped the ranking at ' + topValue + ', ' + gapValue + ' ahead of ' + second.name_en + '.',
        top.name_zh + '以 ' + topValueZh + '排名第一，领先' + second.name_zh + ' ' + gapValueZh + '。'
      ));
      sentences.push(desc.sentence(
        'bottom',
        bottom.name_en + ' was the smallest market at ' + bottomValue + '.',
        bottom.name_zh + '是最小的市场，为 ' + bottomValueZh + '。'
      ));
    } else {
      sentences.push(desc.sentence(
        'overview',
        top.name_en + ' retained the lead at ' + topValue + ', but the more interesting story is the mix below the top two.',
        top.name_zh + '以 ' + topValueZh + '保持领先，但更值得注意的是前两名之后的构成。'
      ));
      sentences.push(desc.sentence(
        'structure',
        'The top two regions generated ' + topTwoShare + ' of total revenue.',
        '前两个地区合计贡献了总收入的 ' + topTwoShare + '。'
      ));
    }

    sentences.push(compositionSentence(dataset, level, options));

    if (level !== 'A2') {
      sentences.push(desc.sentence(
        'total',
        'Total revenue across the six regions came to ' + valueText(dataset, data.total) + '.',
        '六个地区的总收入为 ' + valueZh(dataset, data.total) + '。'
      ));
    }

    if (level === 'C1') {
      sentences.push(desc.sentence(
        'nuance',
        'The product mix is almost identical in every region, so the differences in revenue come from market size rather than category strength.',
        '各地区的产品结构几乎一致，因此收入差异主要来自市场规模，而不是品类强弱。'
      ));
    }

    return { sentences: sentences, stats: data };
  };

  desc.table = function (dataset, level) {
    var data = agenda(dataset);
    var sentences = [];
    var top = data.top;
    var bottom = data.bottom;
    if (level === 'A2') {
      sentences.push(desc.sentence(
        'overview',
        'The table shows revenue by region and product line. ' + top.name_en + ' has the most revenue.',
        '表格显示各地区和各产品线的收入。' + top.name_zh + '收入最多。'
      ));
      sentences.push(desc.sentence(
        'total',
        'Total revenue is ' + valueText(dataset, data.total) + '.',
        '总收入为 ' + valueZh(dataset, data.total) + '。'
      ));
    } else if (level === 'B1') {
      sentences.push(desc.sentence(
        'overview',
        'The table compares revenue across six regions and three product lines. ' + top.name_en + ' had the highest total at ' + valueText(dataset, top.value) + ', while ' + bottom.name_en + ' had the lowest at ' + valueText(dataset, bottom.value) + '.',
        '表格比较了六个地区、三条产品线的收入。' + top.name_zh + '合计最高，为 ' + valueZh(dataset, top.value) + '；' + bottom.name_zh + '最低，为 ' + valueZh(dataset, bottom.value) + '。'
      ));
      sentences.push(desc.sentence(
        'structure',
        data.topSeries.name_en + ' accounted for ' + pctText(data.topSeries.share) + ' of total revenue.',
        data.topSeries.name_zh + '占总收入的 ' + pctText(data.topSeries.share) + '。'
      ));
    } else if (level === 'B2') {
      sentences.push(desc.sentence(
        'overview',
        top.name_en + ' recorded the highest total at ' + valueText(dataset, top.value) + ', ' + valueText(dataset, data.gap) + ' ahead of ' + data.second.name_en + '.',
        top.name_zh + '合计最高，为 ' + valueZh(dataset, top.value) + '，领先' + data.second.name_zh + ' ' + valueZh(dataset, data.gap) + '。'
      ));
      sentences.push(desc.sentence(
        'structure',
        'Coffee generated ' + pctText(data.topSeries.share) + ' of revenue, more than bakery and retail combined.',
        '咖啡贡献了 ' + pctText(data.topSeries.share) + ' 的收入，超过烘焙和零售之和。'
      ));
      sentences.push(desc.sentence(
        'total',
        'The column totals add up to ' + valueText(dataset, data.total) + '.',
        '各列合计为 ' + valueZh(dataset, data.total) + '。'
      ));
    } else {
      sentences.push(desc.sentence(
        'overview',
        'The table points to a clear concentration of revenue in the east and south, which together account for ' + pctText(pct(top.value + data.second.value, data.total)) + ' of the total.',
        '表格显示收入明显集中在华东和华南，两地合计占总收入的 ' + pctText(pct(top.value + data.second.value, data.total)) + '。'
      ));
      sentences.push(desc.sentence(
        'structure',
        'The product mix is remarkably consistent: coffee contributes roughly ' + pctText(data.topSeries.share) + ' of revenue in every region.',
        '产品结构相当一致：咖啡在每个地区都贡献约 ' + pctText(data.topSeries.share) + ' 的收入。'
      ));
      sentences.push(desc.sentence(
        'nuance',
        'The mix barely changes from region to region, which points to a standardized product line rather than local variation.',
        '各地区之间的产品结构几乎没有差别，说明产品线高度标准化，而不是因地制宜。'
      ));
    }
    return { sentences: sentences, stats: data };
  };

  // Kept for older callers; the bar and table renderers use the functions above.
  desc.category = function (dataset, level, options) {
    var opts = options || {};
    if (opts.style === 'table') return desc.table(dataset, level);
    return desc.bar(dataset, level, opts);
  };
})(window.NPESLCharts);
