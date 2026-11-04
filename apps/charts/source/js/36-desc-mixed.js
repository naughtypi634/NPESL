(function (NC) {
  'use strict';

  var desc = NC.desc;

  function value(series, index) {
    return NC.fmt.value(series.values[index], series.unit, series.decimals);
  }

  function valueZh(series, index) {
    return NC.fmt.valueZh(series.values[index], series.unit, series.unit_zh, series.decimals);
  }

  function pct(value, decimals) {
    return NC.fmt.number(value, decimals == null ? 1 : decimals) + '%';
  }

  function pp(value) {
    var abs = Math.round(Math.abs(value) * 10) / 10;
    return NC.fmt.number(abs, abs % 1 === 0 ? 0 : 1) + (abs === 1 ? ' percentage point' : ' percentage points');
  }

  function ppZh(value) {
    var abs = Math.round(Math.abs(value) * 10) / 10;
    return NC.fmt.number(abs, abs % 1 === 0 ? 0 : 1) + ' 个百分点';
  }

  function dipIndex(values) {
    for (var i = 1; i < values.length - 1; i += 1) {
      if (values[i] < values[i - 1] && values[i] < values[i + 1]) return i;
    }
    return -1;
  }

  desc.mixed = function (dataset, level) {
    var bars = dataset.bars;
    var line = dataset.line;
    var periods = dataset.periods;
    var first = 0;
    var last = periods.length - 1;
    var revenueGrowth = (bars.values[last] - bars.values[first]) / Math.abs(bars.values[first]) * 100;
    var marginChange = line.values[last] - line.values[first];
    var dip = dipIndex(bars.values) >= 0 ? dipIndex(bars.values) : dipIndex(line.values);
    var sentences = [];
    var dipRevenue = dip >= 0 && bars.values[dip] < bars.values[dip - 1] && bars.values[dip] < bars.values[dip + 1];
    var dipMargin = dip >= 0 && line.values[dip] < line.values[dip - 1] && line.values[dip] < line.values[dip + 1];

    if (level === 'A2') {
      sentences.push(desc.sentence(
        'overview',
        bars.name_en + ' went up from ' + value(bars, first) + ' to ' + value(bars, last) + '. ' + line.name_en + ' went up from ' + value(line, first) + ' to ' + value(line, last) + '.',
        bars.name_zh + '从 ' + valueZh(bars, first) + ' 上升到 ' + valueZh(bars, last) + '；' + line.name_zh + '从 ' + valueZh(line, first) + ' 上升到 ' + valueZh(line, last) + '。'
      ));
      sentences.push(desc.sentence(
        'relation',
        'Both numbers were higher at the end than at the start.',
        '两项数字期末都高于期初。'
      ));
      return { sentences: sentences, stats: { revenueGrowth: revenueGrowth, marginChange: marginChange } };
    }

    if (level === 'B1') {
      sentences.push(desc.sentence(
        'overview',
        'The bars show revenue, while the line shows margin. Revenue rose from ' + value(bars, first) + ' to ' + value(bars, last) + '.',
        '柱形表示收入，折线表示利润率。收入从 ' + valueZh(bars, first) + ' 上升到 ' + valueZh(bars, last) + '。'
      ));
      sentences.push(desc.sentence(
        'overview',
        'Margin increased from ' + value(line, first) + ' to ' + value(line, last) + ', an increase of ' + pp(marginChange) + '.',
        '利润率从 ' + valueZh(line, first) + ' 上升到 ' + valueZh(line, last) + '，提高了 ' + ppZh(marginChange) + '。'
      ));
      if (dip >= 0) {
        sentences.push(desc.sentence(
          'turning-point',
          'Both figures dipped in ' + periods[dip].label_en + ' before recovering.',
          '两项数字都在' + periods[dip].label_zh + '出现回落，随后恢复。'
        ));
      }
      sentences.push(desc.sentence(
        'relation',
        'For most of the period, revenue and margin moved in the same direction.',
        '大部分时间里，收入和利润率朝同一方向变化。'
      ));
      return { sentences: sentences, stats: { revenueGrowth: revenueGrowth, marginChange: marginChange } };
    }

    if (level === 'B2') {
      sentences.push(desc.sentence(
        'overview',
        'Revenue more than doubled over the period, rising from ' + value(bars, first) + ' to ' + value(bars, last) + ', while margin widened from ' + value(line, first) + ' to ' + value(line, last) + '.',
        '收入在此期间翻了一倍多，从 ' + valueZh(bars, first) + ' 升到 ' + valueZh(bars, last) + '；利润率则从 ' + valueZh(line, first) + ' 扩大到 ' + valueZh(line, last) + '。'
      ));
      if (dipRevenue && dipMargin) {
        sentences.push(desc.sentence(
          'turning-point',
          'Both series dipped in ' + periods[dip].label_en + ', when revenue fell to ' + value(bars, dip) + ' and margin slipped to ' + value(line, dip) + '.',
          '两组数据都在' + periods[dip].label_zh + '回落，收入降到 ' + valueZh(bars, dip) + '，利润率降到 ' + valueZh(line, dip) + '。'
        ));
      }
      sentences.push(desc.sentence(
        'relation',
        'After that, they recovered in tandem, suggesting that growth was not bought at the expense of profitability.',
        '此后两者同步回升，说明增长并不是以牺牲盈利能力为代价换来的。'
      ));
      sentences.push(desc.sentence(
        'comparison',
        'The line uses a separate scale on the right, so the two heights should not be compared directly.',
        '折线使用右侧独立刻度，因此不能直接比较两条线的高度。'
      ));
      return { sentences: sentences, stats: { revenueGrowth: revenueGrowth, marginChange: marginChange } };
    }

    sentences.push(desc.sentence(
      'overview',
      'The chart pairs revenue, shown as bars, with margin, shown as a line on a separate axis. Revenue grew ' + pct(revenueGrowth, 0) + ' over the period, while margin expanded by ' + pp(marginChange) + '.',
      '这张图把收入（柱形）和利润率（右轴折线）放在一起。收入在此期间增长 ' + pct(revenueGrowth, 0) + '，利润率提高 ' + ppZh(marginChange) + '。'
    ));
    if (dipRevenue && dipMargin) {
      sentences.push(desc.sentence(
        'turning-point',
        'The only clear break comes in ' + periods[dip].label_en + ', when revenue and margin both fell, before resuming their upward path.',
        '唯一明显的转折出现在' + periods[dip].label_zh + '：收入和利润率同时下滑，随后又恢复上行。'
      ));
    }
    sentences.push(desc.sentence(
      'relation',
      'The two series are broadly aligned: faster revenue growth coincides with a wider margin rather than a thinner one.',
      '两组数据大体同向：收入增长较快的阶段，利润率也在扩大，而不是被压缩。'
    ));
    sentences.push(desc.sentence(
      'takeaway',
      'That pattern suggests the business was gaining scale without giving away profitability, although the shared dip shows that both remain exposed to the same operating pressure.',
      '这种走势说明业务在扩大规模的同时没有牺牲盈利能力，不过同步回落也表明两者仍受同一经营压力影响。'
    ));
    return { sentences: sentences, stats: { revenueGrowth: revenueGrowth, marginChange: marginChange } };
  };
})(window.NPESLCharts);
