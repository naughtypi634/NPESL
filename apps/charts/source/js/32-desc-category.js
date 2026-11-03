(function (NC) {
  'use strict';

  var desc = NC.desc;

  function valueText(dataset, value) {
    return NC.fmt.value(value, dataset.unit, dataset.decimals);
  }

  function valueZh(dataset, value) {
    return NC.fmt.valueZh(value, dataset.unit, dataset.unit_zh, dataset.decimals);
  }

  desc.category = function (dataset, level, options) {
    var opts = options || {};
    var current = dataset.series[dataset.series.length - 1];
    var baseline = dataset.series.length > 1 ? dataset.series[0] : null;
    var items = dataset.categories.map(function (category, index) {
      return {
        id: category.id,
        name_en: category.label_en,
        name_zh: category.label_zh,
        value: current.values[index],
        baseline: baseline ? baseline.values[index] : null
      };
    });
    var rank = NC.stats.rank(items, 'value', 'baseline');
    var top = rank.top;
    var second = rank.second;
    var bottom = rank.bottom;
    var sentences = [];
    var topValue = valueText(dataset, top.value);
    var topValueZh = valueZh(dataset, top.value);
    var secondValue = valueText(dataset, second.value);
    var secondValueZh = valueZh(dataset, second.value);
    var bottomValue = valueText(dataset, bottom.value);
    var bottomValueZh = valueZh(dataset, bottom.value);
    var gapValue = valueText(dataset, rank.gap);
    var pctTop = Math.abs(top.pctChange || 0);
    var pctBottom = Math.abs(bottom.pctChange || 0);

    if (level === 'A2') {
      var a2Lead;
      var a2Zh;
      if (opts.style === 'ranking') {
        a2Lead = top.name_en + ' was first, and ' + bottom.name_en + ' was last.';
        a2Zh = top.name_zh + '排第一，' + bottom.name_zh + '排最后。';
      } else if (opts.style === 'table') {
        a2Lead = top.name_en + ' had the most ' + (opts.metric || 'revenue') + '. ' + bottom.name_en + ' had the least.';
        a2Zh = top.name_zh + '收入最多，' + bottom.name_zh + '最少。';
      } else {
        a2Lead = top.name_en + ' had the highest ' + (opts.metric || 'revenue') + ' at ' + topValue + '. ' + bottom.name_en + ' had the lowest at ' + bottomValue + '.';
        a2Zh = top.name_zh + '收入最高，为 ' + topValueZh + '；' + bottom.name_zh + '最低，为 ' + bottomValueZh + '。';
      }
      sentences.push(desc.sentence('overview', a2Lead, a2Zh));
    } else if (level === 'B1') {
      var b1Lead = opts.style === 'ranking'
        ? top.name_en + ' topped the ranking at ' + topValue + ', followed by ' + second.name_en + ' at ' + secondValue + '.'
        : opts.style === 'table'
          ? top.name_en + ' had the highest ' + (opts.metric || 'revenue') + ' at ' + topValue + ', followed by ' + second.name_en + ' at ' + secondValue + '.'
          : top.name_en + ' led with ' + topValue + ', followed by ' + second.name_en + ' at ' + secondValue + '.';
      sentences.push(desc.sentence(
        'overview',
        b1Lead,
        top.name_zh + '以 ' + topValueZh + (opts.style === 'ranking' ? ' 排名第一，' : ' 领先，') + second.name_zh + '以 ' + secondValueZh + ' 紧随其后。'
      ));
      sentences.push(desc.sentence(
        'bottom',
        bottom.name_en + ' was the lowest, at ' + bottomValue + '.',
        bottom.name_zh + '最低，为 ' + bottomValueZh + '。'
      ));
      if (opts.style === 'ranking') {
        sentences.push(desc.sentence(
          'gap',
          'The top two markets were clearly ahead of the rest.',
          '前两个市场明显领先于其余市场。'
        ));
      } else if (opts.style !== 'table') {
        sentences.push(desc.sentence(
          'gap',
          top.name_en + ' was ' + gapValue + ' ahead of ' + second.name_en + '.',
          top.name_zh + '领先' + second.name_zh + ' ' + valueZh(dataset, rank.gap) + '。'
        ));
      }
    } else if (level === 'B2') {
      var b2Lead = opts.style === 'table'
        ? top.name_en + ' was the highest-performing market at ' + topValue + ', ' + gapValue + ' ahead of ' + second.name_en + '.'
        : top.name_en + ' topped the ranking at ' + topValue + ', ' + gapValue + ' ahead of ' + second.name_en + '.';
      sentences.push(desc.sentence(
        'overview',
        b2Lead,
        top.name_zh + '以 ' + topValueZh + ' 排名第一，领先' + second.name_zh + ' ' + valueZh(dataset, rank.gap) + '。'
      ));
      var bottomChange = bottom.pctChange || 0;
      sentences.push(desc.sentence(
        'bottom',
        bottom.name_en + ' was the smallest market at ' + bottomValue + ', ' +
          (bottomChange < 0
            ? NC.fmt.number(Math.abs(bottomChange), 1) + '% below last year.'
            : 'up ' + NC.fmt.number(bottomChange, 1) + '% on last year.'),
        bottom.name_zh + '是最小的市场，为 ' + bottomValueZh + '，' +
          (bottomChange < 0
            ? '比去年低 ' + NC.fmt.number(Math.abs(bottomChange), 1) + '%。'
            : '比去年高 ' + NC.fmt.number(bottomChange, 1) + '%。')
      ));
      if (rank.fastest && rank.fastest.pctChange > 0) {
        sentences.push(desc.sentence(
          'growth',
          rank.fastest.name_en + ' grew fastest, up ' + NC.fmt.number(Math.abs(rank.fastest.pctChange), 1) + '% year on year.',
          rank.fastest.name_zh + '增长最快，同比上升 ' + NC.fmt.number(Math.abs(rank.fastest.pctChange), 1) + '%。'
        ));
      }
    } else {
      var c1Tail = opts.style === 'table' ? 'further down the table' : 'in the middle of the ranking';
      var c1Verb = opts.style === 'ranking' ? ' topped the ranking at ' : ' retained the lead at ';
      sentences.push(desc.sentence(
        'overview',
        top.name_en + c1Verb + topValue + ', although the more notable shift came ' + c1Tail + '.',
        top.name_zh + '以 ' + topValueZh + (opts.style === 'ranking' ? ' 排名第一' : ' 保持领先') + '，但更值得注意的是排名靠后的变化。'
      ));
      if (rank.overtook.length) {
        var mover = rank.overtook[0];
        var displaced = rank.items.filter(function (item) { return item.rank === mover.rank + 1; })[0];
        if (displaced) {
          sentences.push(desc.sentence(
            'rank-change',
            mover.name_en + ' overtook ' + displaced.name_en + ' to take ' + NC.fmt.ordinalWord(mover.rank) + ' place.',
            mover.name_zh + '超过' + displaced.name_zh + '，升至第 ' + mover.rank + ' 位。'
          ));
        }
      }
      if (rank.decliners.length) {
        var decliner = rank.decliners[0];
        sentences.push(desc.sentence(
          'decline',
          decliner.name_en + ' was the only market to decline, falling ' + NC.fmt.number(Math.abs(decliner.pctChange), 1) + '% to ' + valueText(dataset, decliner.value) + '.',
          decliner.name_zh + '是唯一收缩的市场，下降 ' + NC.fmt.number(Math.abs(decliner.pctChange), 1) + '% 至 ' + valueZh(dataset, decliner.value) + '。'
        ));
      }
      var topTwoShare = (top.value + second.value) / rank.total * 100;
      sentences.push(desc.sentence(
        'structure',
        'The top two markets accounted for ' + NC.fmt.number(topTwoShare, 0) + '% of total revenue.',
        '前两个市场合计占总收入的 ' + NC.fmt.number(topTwoShare, 0) + '%。'
      ));
    }

    if ((level !== 'A2' && opts.style === 'table') || level === 'B2' || level === 'C1') {
      if (opts.showTotal !== false) {
      sentences.push(desc.sentence(
        'total',
        'Total ' + (opts.metric || 'revenue') + ' came to ' + valueText(dataset, rank.total) + '.',
        '总收入为 ' + valueZh(dataset, rank.total) + '。'
      ));
      }
    }

    return { sentences: sentences, stats: rank };
  };
})(window.NPESLCharts);
