(function (NC) {
  'use strict';

  var desc = NC.desc;

  var UP_VERB = {
    A2: { slight: 'went up', moderate: 'went up', sharp: 'went up a lot', dramatic: 'went up a lot' },
    B1: { slight: 'edged up', moderate: 'rose steadily', sharp: 'surged', dramatic: 'soared' },
    B2: { slight: 'edged up', moderate: 'climbed', sharp: 'surged', dramatic: 'soared' },
    C1: { slight: 'edged up', moderate: 'climbed', sharp: 'surged', dramatic: 'soared' }
  };

  var DOWN_VERB = {
    A2: { slight: 'went down', moderate: 'went down', sharp: 'went down a lot', dramatic: 'went down a lot' },
    B1: { slight: 'dipped', moderate: 'fell', sharp: 'plunged', dramatic: 'collapsed' },
    B2: { slight: 'edged down', moderate: 'declined', sharp: 'plunged', dramatic: 'plummeted' },
    C1: { slight: 'slipped', moderate: 'eased', sharp: 'tumbled', dramatic: 'plummeted' }
  };

  var ADJ = {
    slight: 'slight',
    moderate: 'steady',
    sharp: 'sharp',
    dramatic: 'dramatic',
    flat: 'minimal'
  };

  var UP_NOUN = {
    slight: 'rise',
    moderate: 'rise',
    sharp: 'rise',
    dramatic: 'surge'
  };

  var DOWN_NOUN = {
    slight: 'dip',
    moderate: 'decline',
    sharp: 'fall',
    dramatic: 'drop'
  };

  var ZH_UP = {
    slight: '小幅上升',
    moderate: '稳步上升',
    sharp: '大幅上升',
    dramatic: '激增'
  };

  var ZH_DOWN = {
    slight: '小幅下降',
    moderate: '下降',
    sharp: '大幅下降',
    dramatic: '暴跌'
  };

  function articleNumber(value) {
    return NC.fmt.article(String(Math.round(Math.abs(value))) + '%');
  }

  function pctText(value) {
    var abs = Math.abs(value);
    return NC.fmt.number(abs, abs < 10 ? 1 : 0) + '%';
  }

  function seriesLower(series) {
    return NC.fmt.lowerFirst(series.name_en);
  }

  function makeContext(dataset, series) {
    return {
      dataset: dataset,
      series: series,
      name: series.name_en,
      lower: seriesLower(series),
      zh: series.name_zh,
      value: function (v) { return NC.fmt.value(v, series.unit, series.decimals); },
      valueZh: function (v) { return NC.fmt.valueZh(v, series.unit, series.unit_zh, series.decimals); },
      period: function (i) { return NC.fmt.period(dataset, i); },
      periodZh: function (i) { return NC.fmt.periodZh(dataset, i); }
    };
  }

  function segmentSentence(ctx, seg, level, variant) {
    var from = ctx.value(seg.a);
    var to = ctx.value(seg.b);
    var fromZh = ctx.valueZh(seg.a);
    var toZh = ctx.valueZh(seg.b);
    var p = ctx.period(seg.toIndex);
    var pZh = ctx.periodZh(seg.toIndex);
    var pct = pctText(seg.pct);
    var adj = ADJ[seg.cls] || 'steady';
    var up = seg.direction === 'up';
    var flat = seg.direction === 'flat';

    if (flat) {
      if (level === 'A2') return desc.sentence('segment', ctx.name + ' stayed about the same at ' + to + ' in ' + p + '.', ctx.zh + '在 ' + pZh + '保持在 ' + toZh + ' 左右。');
      if (level === 'B1') return desc.sentence('segment', ctx.name + ' held steady at ' + to + ' in ' + p + '.', ctx.zh + '在 ' + pZh + '稳定在 ' + toZh + '。');
      if (level === 'B2') return desc.sentence('segment', p + ' saw little change in ' + ctx.lower + ', which held at ' + to + '.', pZh + ctx.zh + '基本持平，维持在 ' + toZh + '。');
      return desc.sentence('segment', ctx.name + ' plateaued at ' + to + ' in ' + p + '.', ctx.zh + '在 ' + pZh + '进入 ' + toZh + ' 的平台期。');
    }

    var verbMap = up ? UP_VERB[level] : DOWN_VERB[level];
    var verb = verbMap[seg.cls] || verbMap.moderate;
    var noun = up ? (UP_NOUN[seg.cls] || 'rise') : (DOWN_NOUN[seg.cls] || 'fall');
    var zhMovement = up ? (ZH_UP[seg.cls] || '上升') : (ZH_DOWN[seg.cls] || '下降');
    var signed = up ? '+' : '-';

    if (level === 'A2') {
      return desc.sentence(
        'segment',
        ctx.name + ' ' + verb + ' from ' + from + ' to ' + to + ' in ' + p + '.',
        ctx.zh + '在 ' + pZh + '从 ' + fromZh + ' ' + zhMovement + '到 ' + toZh + '。'
      );
    }

    if (level === 'B1') {
      return desc.sentence(
        'segment',
        ctx.name + ' ' + verb + ' from ' + from + ' to ' + to + ' in ' + p + '.',
        ctx.zh + '在 ' + pZh + '从 ' + fromZh + ' ' + zhMovement + '到 ' + toZh + '。'
      );
    }

    if (level === 'B2') {
      if (variant % 2 === 0) {
        return desc.sentence(
          'segment',
          ctx.name + ' ' + verb + ' from ' + from + ' to ' + to + ' in ' + p + ', ' + articleNumber(seg.pct) + ' ' + pct + ' ' + (up ? 'increase' : 'decline') + '.',
          ctx.zh + '在 ' + pZh + '从 ' + fromZh + ' ' + zhMovement + '到 ' + toZh + '，' + (up ? '涨幅' : '降幅') + ' ' + pct + '。'
        );
      }
      return desc.sentence(
        'segment',
        p + ' saw ' + NC.fmt.article(adj) + ' ' + adj + ' ' + noun + ' in ' + ctx.lower + ', from ' + from + ' to ' + to + '.',
        pZh + '，' + ctx.zh + '从 ' + fromZh + ' ' + zhMovement + '到 ' + toZh + '，' + (up ? '涨幅' : '降幅') + ' ' + pct + '。'
      );
    }

    if (up) {
      if (variant % 3 === 0) {
        if (seg.cls === 'slight') {
          return desc.sentence(
            'segment',
            ctx.name + ' edged up in ' + p + ', from ' + from + ' to ' + to + '.',
            ctx.zh + '在 ' + pZh + '小幅上行，从 ' + fromZh + ' 升到 ' + toZh + '。'
          );
        }
        var c1Verb = seg.cls === 'dramatic' ? 'soared' : seg.cls === 'sharp' ? 'surged' : 'gathered pace';
        return desc.sentence(
          'segment',
          ctx.name + ' ' + c1Verb + ' in ' + p + ', rising from ' + from + ' to ' + to + '.',
          ctx.zh + '在 ' + pZh + (seg.cls === 'dramatic' ? '急剧上行' : '加速上行') + '，从 ' + fromZh + ' 升到 ' + toZh + '。'
        );
      }
      if (variant % 3 === 1) {
        return desc.sentence(
          'segment',
          p + ' marked a ' + adj + ' pickup, with ' + ctx.lower + ' up from ' + from + ' to ' + to + '.',
          pZh + (seg.cls === 'slight' ? '小幅回升，' : seg.cls === 'dramatic' ? '强劲回升，' : '明显回升，') + ctx.zh + '从 ' + fromZh + ' 升到 ' + toZh + '。'
        );
      }
      return desc.sentence(
        'segment',
        ctx.name + ' climbed ' + pct + ' to ' + to + ' in ' + p + ', extending the upward trend.',
        ctx.zh + '在 ' + pZh + '上升 ' + pct + '，达到 ' + toZh + '，延续上行趋势。'
      );
    }

    if (variant % 2 === 0) {
      if (seg.cls === 'slight') {
        return desc.sentence(
          'segment',
          ctx.name + ' slipped in ' + p + ', from ' + from + ' to ' + to + '.',
          ctx.zh + '在 ' + pZh + '小幅回落，从 ' + fromZh + ' 回落到 ' + toZh + '。'
        );
      }
      if (seg.cls === 'moderate') {
        return desc.sentence(
          'segment',
          ctx.name + ' lost momentum in ' + p + ', easing from ' + from + ' to ' + to + '.',
          ctx.zh + '在 ' + pZh + '动能减弱，从 ' + fromZh + ' 回落到 ' + toZh + '。'
        );
      }
      return desc.sentence(
        'segment',
        ctx.name + ' fell sharply in ' + p + ', from ' + from + ' to ' + to + '.',
        ctx.zh + '在 ' + pZh + '大幅回落，从 ' + fromZh + ' 回落到 ' + toZh + '。'
      );
    }
    return desc.sentence(
      'segment',
      ctx.name + ' fell ' + pct + ' to ' + to + ' in ' + p + ', a marked drop.',
      ctx.zh + '在 ' + pZh + '下降 ' + pct + '，降至 ' + toZh + '，跌幅明显。'
    );
  }

  desc.time = function (dataset, series, level, options) {
    var opts = options || {};
    var ctx = makeContext(dataset, series);
    var stats = NC.stats.trend(series.values);
    var sentences = [];
    var pStart = ctx.period(0);
    var pEnd = ctx.period(stats.n - 1);
    var pStartZh = ctx.periodZh(0);
    var pEndZh = ctx.periodZh(stats.n - 1);
    var first = ctx.value(stats.first);
    var last = ctx.value(stats.last);
    var firstZh = ctx.valueZh(stats.first);
    var lastZh = ctx.valueZh(stats.last);
    var pctAbs = pctText(stats.pct == null ? 0 : stats.pct);
    var ratio = stats.first !== 0 ? stats.last / stats.first : 1;

    if (stats.direction === 'flat') {
      sentences.push(desc.sentence(
        'overview',
        'Overall, ' + ctx.lower + ' remained broadly stable at around ' + last + ' over the period.',
        '总体来看，' + ctx.zh + '在整个期间基本稳定在 ' + lastZh + ' 左右。'
      ));
    } else if (stats.direction === 'up') {
      if (level === 'A2') {
        sentences.push(desc.sentence('overview', 'Overall, ' + ctx.lower + ' went up from ' + first + ' to ' + last + '.', '总体来看，' + ctx.zh + '从 ' + firstZh + ' 上升到 ' + lastZh + '。'));
      } else if (level === 'B1') {
        sentences.push(desc.sentence('overview', 'Overall, ' + ctx.lower + ' rose from ' + first + ' in ' + pStart + ' to ' + last + ' in ' + pEnd + '.', '总体来看，' + ctx.zh + '从 ' + pStartZh + '的 ' + firstZh + ' 上升到 ' + pEndZh + '的 ' + lastZh + '。'));
      } else if (level === 'B2') {
        sentences.push(desc.sentence('overview', 'Overall, ' + ctx.lower + ' grew from ' + first + ' to ' + last + ', ' + articleNumber(stats.pct) + ' ' + pctAbs + ' increase.', '总体来看，' + ctx.zh + '从 ' + firstZh + ' 增长到 ' + lastZh + '，涨幅 ' + pctAbs + '。'));
      } else {
        sentences.push(desc.sentence('overview', 'Overall, ' + ctx.lower + ' climbed from ' + first + ' to ' + last + ', although the path was uneven.', '总体来看，' + ctx.zh + '从 ' + firstZh + ' 升到 ' + lastZh + '，但过程并不平稳。'));
      }
    } else {
      if (level === 'A2') {
        sentences.push(desc.sentence('overview', 'Overall, ' + ctx.lower + ' went down from ' + first + ' to ' + last + '.', '总体来看，' + ctx.zh + '从 ' + firstZh + ' 下降到 ' + lastZh + '。'));
      } else if (level === 'B1') {
        sentences.push(desc.sentence('overview', 'Overall, ' + ctx.lower + ' fell from ' + first + ' in ' + pStart + ' to ' + last + ' in ' + pEnd + '.', '总体来看，' + ctx.zh + '从 ' + pStartZh + '的 ' + firstZh + ' 下降到 ' + pEndZh + '的 ' + lastZh + '。'));
      } else if (level === 'B2') {
        sentences.push(desc.sentence('overview', 'Overall, ' + ctx.lower + ' declined from ' + first + ' to ' + last + ', ' + articleNumber(stats.pct) + ' ' + pctAbs + ' decrease.', '总体来看，' + ctx.zh + '从 ' + firstZh + ' 下降到 ' + lastZh + '，降幅 ' + pctAbs + '。'));
      } else {
        sentences.push(desc.sentence('overview', 'Overall, ' + ctx.lower + ' fell from ' + first + ' to ' + last + ', with the sharpest loss coming in ' + ctx.period(stats.biggestFall ? stats.biggestFall.toIndex : stats.n - 1) + '.', '总体来看，' + ctx.zh + '从 ' + firstZh + ' 跌到 ' + lastZh + '，其中' + ctx.periodZh(stats.biggestFall ? stats.biggestFall.toIndex : stats.n - 1) + '跌幅最大。'));
      }
    }

    if (opts.area) {
      if (level === 'A2') {
        sentences.push(desc.sentence('area', 'The shaded area shows the total revenue.', '填色区域表示总收入。'));
      } else if (level === 'B1') {
        sentences.push(desc.sentence('area', 'The filled area shows how total revenue built up over the period.', '填色区域显示总收入在这段时间里如何积累。'));
      } else {
        sentences.push(desc.sentence('area', 'The filled area emphasizes overall volume, not just the direction of the line.', '填色区域强调的是总体规模，而不只是线的方向。'));
      }
    }

    if (stats.reversal) {
      var turnIndex = stats.direction === 'up' ? stats.maxIndex : stats.minIndex;
      if (turnIndex > 0 && turnIndex < stats.n - 1) {
        sentences.push(desc.sentence('turning-point', 'The trend reversed after ' + ctx.period(turnIndex) + '.', '趋势在' + ctx.periodZh(turnIndex) + '之后发生反转。'));
      }
    }

    var candidates = [];
    [stats.biggestRise, stats.biggestFall, stats.biggest].forEach(function (seg) {
      if (!seg) return;
      if (!candidates.some(function (item) { return item.toIndex === seg.toIndex; })) {
        candidates.push(seg);
      }
    });
    var lastSeg = stats.segments[stats.segments.length - 1];
    if (lastSeg && !candidates.some(function (item) { return item.toIndex === lastSeg.toIndex; })) {
      candidates.push(lastSeg);
    }

    var segmentLimit = 3;
    var picks;
    if (level === 'A2') {
      picks = [stats.biggestRise || stats.biggest || lastSeg];
    } else {
      picks = candidates.slice().sort(function (a, b) { return b.norm - a.norm; }).slice(0, segmentLimit);
      picks.sort(function (a, b) { return a.toIndex - b.toIndex; });
    }
    picks.filter(Boolean).forEach(function (seg, index) {
      sentences.push(segmentSentence(ctx, seg, level, index));
    });

    if (stats.cls === 'dramatic' || stats.cls === 'sharp') {
      var dramaticSeg = stats.biggest;
      if (dramaticSeg && picks.indexOf(dramaticSeg) === -1) {
        sentences.push(segmentSentence(ctx, dramaticSeg, level, 1));
      }
    }

    if (level !== 'A2') {
      if (stats.maxIndex > 0 && stats.maxIndex < stats.n - 1) {
        sentences.push(desc.sentence(
          'peak',
          ctx.name + ' peaked at ' + ctx.value(stats.max) + ' in ' + ctx.period(stats.maxIndex) + '.',
          ctx.zh + '在 ' + ctx.periodZh(stats.maxIndex) + '达到 ' + ctx.valueZh(stats.max) + ' 的峰值。'
        ));
      } else if (stats.minIndex > 0 && stats.minIndex < stats.n - 1) {
        sentences.push(desc.sentence(
          'trough',
          ctx.name + ' reached its lowest point at ' + ctx.value(stats.min) + ' in ' + ctx.period(stats.minIndex) + '.',
          ctx.zh + '在 ' + ctx.periodZh(stats.minIndex) + '跌到 ' + ctx.valueZh(stats.min) + ' 的低点。'
        ));
      }

      if (stats.plateaus.length) {
        var plateau = stats.plateaus[0];
        sentences.push(desc.sentence(
          'plateau',
          ctx.name + ' leveled off at around ' + ctx.value(plateau.value) + ' between ' + ctx.period(plateau.fromIndex) + ' and ' + ctx.period(plateau.toIndex) + '.',
          ctx.zh + '在 ' + ctx.periodZh(plateau.fromIndex) + '到 ' + ctx.periodZh(plateau.toIndex) + '之间稳定在 ' + ctx.valueZh(plateau.value) + ' 左右。'
        ));
      }
    }

    if (level !== 'A2' && stats.direction !== 'flat' && isFinite(ratio) && ratio > 1.35) {
      if (stats.direction === 'up') {
        if (level === 'B1') {
          sentences.push(desc.sentence('comparison', ctx.name + ' ended the period at ' + last + ', ' + pctAbs + ' higher than at the start.', ctx.zh + '期末为 ' + lastZh + '，比期初高 ' + pctAbs + '。'));
        } else {
          sentences.push(desc.sentence('comparison', ctx.name + ' in ' + pEnd + ' was ' + NC.fmt.ratio(ratio) + ' the ' + pStart + ' figure.', pEndZh + '的' + ctx.zh + '是 ' + pStartZh + '的 ' + NC.fmt.ratioValue(ratio) + ' 倍左右。'));
        }
      } else if (ratio < 0.74) {
        sentences.push(desc.sentence('comparison', ctx.name + ' in ' + pEnd + ' was ' + pctAbs + ' lower than in ' + pStart + '.', ctx.zh + pEndZh + '的' + ctx.zh + '比' + pStartZh + '低 ' + pctAbs + '。'));
      }
    }

    if (level === 'C1') {
      var takeaway;
      if (stats.reversal) {
        takeaway = desc.sentence('takeaway', 'The data describes a change of direction rather than a single trend.', '这组数据更像是一次方向转变，而不是单一趋势。');
      } else if (stats.volatile) {
        takeaway = desc.sentence('takeaway', 'The path was volatile rather than a smooth trend.', '走势波动较大，并不是一条平滑的趋势线。');
      } else if (stats.backLoaded) {
        takeaway = desc.sentence('takeaway', 'Growth was back-loaded, with most of the gain coming in the second half.', '增长集中在后半段，大部分增量来自下半年。');
      } else if (stats.frontLoaded) {
        takeaway = desc.sentence('takeaway', 'Growth was front-loaded, with momentum fading later in the period.', '增长集中在前半段，后半段动能减弱。');
      } else {
        takeaway = desc.sentence('takeaway', 'The overall direction is clear, even though individual quarters moved at different speeds.', '整体方向清楚，只是各季度的变化速度不同。');
      }
      sentences.push(takeaway);
    } else {
      var plainTakeaway;
      if (stats.reversal) {
        plainTakeaway = desc.sentence('takeaway', 'The direction changed during the period rather than following one trend.', '这段时间里方向发生了变化，而不是单一趋势。');
      } else if (stats.volatile) {
        plainTakeaway = desc.sentence('takeaway', 'The figures moved up and down rather than in one direction.', '这些数字上下波动，并没有朝一个方向走。');
      } else if (stats.backLoaded) {
        plainTakeaway = desc.sentence('takeaway', 'Most of the growth came later in the period.', '大部分增长出现在后半段。');
      } else if (stats.frontLoaded) {
        plainTakeaway = desc.sentence('takeaway', 'Most of the growth came earlier in the period.', '大部分增长出现在前半段。');
      } else {
        plainTakeaway = desc.sentence('takeaway', 'The overall direction is clear, although the pace changed during the period.', '整体方向清楚，只是这段时间里速度有变化。');
      }
      sentences.push(plainTakeaway);
    }

    return { sentences: sentences, stats: stats };
  };
})(window.NPESLCharts);
