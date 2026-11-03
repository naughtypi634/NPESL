(function (NC) {
  'use strict';

  var desc = NC.desc;

  function fmtValue(series, value) {
    return NC.fmt.value(value, series.unit, series.decimals);
  }

  function fmtValueZh(series, value) {
    return NC.fmt.valueZh(value, series.unit, series.unit_zh, series.decimals);
  }

  function relationshipSentence(relationship, level) {
    if (relationship === 'both-up') {
      return level === 'C1'
        ? desc.sentence('relationship', 'Both series moved up, with revenue and growth reinforcing each other.', '两组数据同时上行，收入和增长相互印证。')
        : desc.sentence('relationship', 'Both revenue and growth moved up.', '收入和增长率同时上升。');
    }
    if (relationship === 'volume-up-rate-down') {
      return level === 'C1'
        ? desc.sentence('relationship', 'The divergence is clear: revenue kept growing while growth lost momentum.', '分化很明显：收入继续增长，但增长动能减弱。')
        : desc.sentence('relationship', 'Revenue continued to rise, while growth slowed.', '收入继续上升，但增长率放缓。');
    }
    if (relationship === 'volume-down-rate-up') {
      return desc.sentence('relationship', 'Revenue fell even as the growth rate recovered.', '收入下降，但增长率回升。');
    }
    if (relationship === 'both-down') {
      return desc.sentence('relationship', 'Both revenue and growth weakened.', '收入和增长率同时走弱。');
    }
    return desc.sentence('relationship', 'The two series moved unevenly.', '两组数据的走势并不一致。');
  }

  desc.combo = function (dataset, level) {
    var bars = dataset.series[0];
    var line = dataset.series[1];
    var stats = NC.stats.combo(bars.values, line.values);
    var sentences = [];
    var revenueFirst = fmtValue(bars, bars.values[0]);
    var revenueLast = fmtValue(bars, bars.values[bars.values.length - 1]);
    var revenueFirstZh = fmtValueZh(bars, bars.values[0]);
    var revenueLastZh = fmtValueZh(bars, bars.values[bars.values.length - 1]);
    var growthFirst = fmtValue(line, line.values[0]);
    var growthLast = fmtValue(line, line.values[line.values.length - 1]);
    var growthFirstZh = fmtValueZh(line, line.values[0]);
    var growthLastZh = fmtValueZh(line, line.values[line.values.length - 1]);
    var growthChange = line.values[line.values.length - 1] - line.values[0];
    var revenueUp = bars.values[bars.values.length - 1] >= bars.values[0];
    var growthUp = growthChange >= 0;
    var growthPP = NC.fmt.number(Math.abs(growthChange), Math.abs(growthChange) % 1 === 0 ? 0 : 1) + ' percentage points';
    var growthPPZh = NC.fmt.number(Math.abs(growthChange), Math.abs(growthChange) % 1 === 0 ? 0 : 1) + ' 个百分点';
    var pct = stats.bars.pct == null ? 0 : Math.abs(stats.bars.pct);
    var revenuePct = NC.fmt.number(pct, pct < 10 ? 1 : 0) + '%';
    var revenueVerb = revenueUp ? 'rose' : 'fell';
    var revenueVerbPast = revenueUp ? 'climbed' : 'declined';

    if (level === 'A2') {
      sentences.push(desc.sentence(
        'axes',
        'The bars show revenue. The line shows growth.',
        '柱子表示收入，折线表示增长率。'
      ));
      sentences.push(desc.sentence(
        'overview',
        'Revenue ' + (revenueUp ? 'went up' : 'went down') + ', and growth ' + (growthUp ? 'went up' : 'went down') + '.',
        '收入' + (revenueUp ? '上升' : '下降') + '，增长率' + (growthUp ? '上升' : '下降') + '。'
      ));
      return { sentences: sentences, stats: stats };
    }

    if (level === 'B1') {
      sentences.push(desc.sentence(
        'axes',
        'The bars show revenue on the left axis, and the line shows year-on-year growth on the right axis.',
        '柱子表示收入，对应左轴；折线表示同比增长率，对应右轴。'
      ));
      sentences.push(desc.sentence(
        'revenue',
        'Revenue ' + revenueVerb + ' from ' + revenueFirst + ' to ' + revenueLast + ' over the period.',
        '收入在此期间从 ' + revenueFirstZh + (revenueUp ? ' 上升到 ' : ' 下降到 ') + revenueLastZh + '。'
      ));
      sentences.push(desc.sentence(
        'growth',
        'Growth moved from ' + growthFirst + ' to ' + growthLast + ', a ' + (growthUp ? 'rise' : 'fall') + ' of ' + growthPP + '.',
        '增长率从 ' + growthFirstZh + ' 变为 ' + growthLastZh + '，' + (growthUp ? '上升 ' : '下降 ') + growthPPZh + '。'
      ));
      sentences.push(relationshipSentence(stats.relationship, level));
      return { sentences: sentences, stats: stats };
    }

    if (level === 'B2') {
      sentences.push(desc.sentence(
        'axes',
        'The bars show revenue on the left axis and the line shows year-on-year growth on the right; the two use different units.',
        '柱子表示收入，对应左轴；折线表示同比增长率，对应右轴；两者单位不同。'
      ));
      sentences.push(desc.sentence(
        'revenue',
        'Revenue ' + revenueVerbPast + ' from ' + revenueFirst + ' to ' + revenueLast + ', ' + NC.fmt.article(revenuePct) + ' ' + revenuePct + (revenueUp ? ' increase.' : ' decrease.'),
        '收入从 ' + revenueFirstZh + (revenueUp ? ' 上升到 ' : ' 下降到 ') + revenueLastZh + '，' + (revenueUp ? '涨幅 ' : '降幅 ') + revenuePct + '。'
      ));
      sentences.push(desc.sentence(
        'growth',
        'Growth moved from ' + growthFirst + ' to ' + growthLast + ', a ' + (growthUp ? 'rise' : 'drop') + ' of ' + growthPP + '.',
        '增长率从 ' + growthFirstZh + ' 变为 ' + growthLastZh + '，' + (growthUp ? '上升 ' : '下降 ') + growthPPZh + '。'
      ));
      sentences.push(relationshipSentence(stats.relationship, level));
      sentences.push(desc.sentence(
        'caution',
        'Because the two series use different axes, their heights should not be compared directly.',
        '由于两组数据使用不同坐标轴，不能直接比较它们的高度。'
      ));
      return { sentences: sentences, stats: stats };
    }

    sentences.push(desc.sentence(
      'axes',
      'Revenue is plotted on the left axis and year-on-year growth on the right, so each series should be read against its own scale.',
      '收入对应左轴，同比增长率对应右轴，因此每条线都要对照自己的刻度来读。'
    ));
    sentences.push(desc.sentence(
      'revenue',
      'Revenue ' + (revenueUp ? 'maintained its upward trajectory' : 'lost ground') + ', moving from ' + revenueFirst + ' to ' + revenueLast + '.',
      '收入' + (revenueUp ? '保持上行轨迹' : '走弱') + '，从 ' + revenueFirstZh + ' 变为 ' + revenueLastZh + '。'
    ));
    sentences.push(desc.sentence(
      'growth',
      'Growth ' + (growthUp ? 'picked up' : 'cooled') + ' over the period, moving from ' + growthFirst + ' to ' + growthLast + ', a ' + (growthUp ? 'rise' : 'fall') + ' of ' + growthPP + '.',
      '增长率在此期间' + (growthUp ? '回升' : '降温') + '，从 ' + growthFirstZh + ' 变为 ' + growthLastZh + '，' + (growthUp ? '上升 ' : '下降 ') + growthPPZh + '。'
    ));
    sentences.push(relationshipSentence(stats.relationship, level));
    if (stats.diverging) {
      sentences.push(desc.sentence(
        'takeaway',
        'In short, volume is still expanding, but the growth engine is slowing.',
        '简而言之，体量仍在扩张，但增长引擎正在放缓。'
      ));
    }
    sentences.push(desc.sentence(
      'caution',
      'The two axes use different units, so the relative height of the bars and the line carries no meaning.',
      '两条轴的单位不同，柱子和折线的相对高低没有意义。'
    ));

    return { sentences: sentences, stats: stats };
  };
})(window.NPESLCharts);
