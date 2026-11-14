(function (NC) {
  'use strict';

  var desc = NC.desc;

  function pct(value) {
    var rounded = Math.round(value * 10) / 10;
    var decimals = Math.abs(rounded - Math.round(rounded)) < 0.01 ? 0 : 1;
    return NC.fmt.number(rounded, decimals) + '%';
  }

  function pp(value) {
    var abs = Math.round(Math.abs(value) * 10) / 10;
    var decimals = Math.abs(abs - Math.round(abs)) < 0.01 ? 0 : 1;
    return NC.fmt.number(abs, decimals) + (abs === 1 ? ' percentage point' : ' percentage points');
  }

  function ppZh(value) {
    var abs = Math.round(Math.abs(value) * 10) / 10;
    var decimals = Math.abs(abs - Math.round(abs)) < 0.01 ? 0 : 1;
    return NC.fmt.number(abs, decimals) + ' 个百分点';
  }

  desc.pie = function (dataset, level) {
    var stats = NC.stats.shares(dataset.parts);
    var top = stats.top;
    var second = stats.second;
    var bottom = stats.bottom;
    var sentences = [];
    var topShare = pct(top.share);
    var secondShare = pct(second.share);
    var bottomShare = pct(bottom.share);
    var gap = pp(stats.gap);
    var gapZh = ppZh(stats.gap);

    if (level === 'A2') {
      sentences.push(desc.sentence(
        'overview',
        top.name_en + ' is the biggest slice at ' + topShare + '. ' + bottom.name_en + ' is the smallest at ' + bottomShare + '.',
        top.name_zh + '是最大的一块，占 ' + topShare + '；' + bottom.name_zh + '最小，占 ' + bottomShare + '。'
      ));
    } else if (level === 'B1') {
      sentences.push(desc.sentence(
        'overview',
        top.name_en + ' accounts for the largest share at ' + topShare + ', followed by ' + second.name_en + ' at ' + secondShare + '.',
        top.name_zh + '占比最大，为 ' + topShare + '，' + second.name_zh + '以 ' + secondShare + ' 紧随其后。'
      ));
      sentences.push(desc.sentence(
        'smallest',
        bottom.name_en + ' accounts for just ' + bottomShare + '.',
        bottom.name_zh + '只占 ' + bottomShare + '。',
        desc.focusPart(bottom.index)
      ));
      if (stats.consolidated) {
        sentences.push(desc.sentence(
          'structure',
          'The top three channels hold ' + pct(stats.top3) + ' between them.',
          '前三个渠道合计占 ' + pct(stats.top3) + '。'
        ));
      } else if (stats.fragmented) {
        sentences.push(desc.sentence(
          'structure',
          'The market is split across several channels, with no clear leader.',
          '市场分散在多个渠道，没有明显的领先者。'
        ));
      }
      var b1Change = stats.changes.filter(function (item) { return item.id === top.id; })[0] || stats.changes[0];
      if (b1Change) {
        var b1Shrank = b1Change.deltaPP < 0 && b1Change.id === top.id;
        sentences.push(desc.sentence(
          'change',
          b1Change.name_en + ' ' + (b1Shrank ? 'lost ' : b1Change.deltaPP > 0 ? 'gained ' : 'lost ') + pp(b1Change.deltaPP) + ', from ' + pct(b1Change.baselineShare) + ' to ' + pct(b1Change.share) + '.',
          b1Change.name_zh + (b1Shrank ? '份额下降 ' : b1Change.deltaPP > 0 ? '上升 ' : '下降 ') + ppZh(b1Change.deltaPP) + '，从 ' + pct(b1Change.baselineShare) + ' 变为 ' + pct(b1Change.share) + '。',
          desc.focusPart(b1Change.index)
        ));
      }
    } else if (level === 'B2') {
      if (stats.neckAndNeck) {
        sentences.push(desc.sentence(
          'overview',
          top.name_en + ' and ' + second.name_en + ' are neck and neck, at ' + topShare + ' and ' + secondShare + '.',
          top.name_zh + '和' + second.name_zh + '并驾齐驱，分别为 ' + topShare + ' 和 ' + secondShare + '。'
        ));
      } else if (stats.dominant) {
        sentences.push(desc.sentence(
          'overview',
          top.name_en + ' dominates the market with ' + topShare + ', well ahead of ' + second.name_en + ' at ' + secondShare + '.',
          top.name_zh + '以 ' + topShare + ' 主导市场，明显领先于占 ' + secondShare + ' 的' + second.name_zh + '。'
        ));
      } else if (stats.lionsShare) {
        sentences.push(desc.sentence(
          'overview',
          top.name_en + ' takes the lion\'s share at ' + topShare + ', followed by ' + second.name_en + ' at ' + secondShare + '.',
          top.name_zh + '拿走了最大的一份，占 ' + topShare + '，' + second.name_zh + '以 ' + secondShare + ' 位居第二。'
        ));
      } else {
        sentences.push(desc.sentence(
          'overview',
          top.name_en + ' has the largest share at ' + topShare + ', but no channel dominates.',
          top.name_zh + '份额最大，为 ' + topShare + '，但没有哪个渠道占据主导。'
        ));
      }
      if (stats.distantSecond) {
        sentences.push(desc.sentence(
          'distance',
          second.name_en + ' is a distant second, ' + gap + ' behind.',
          second.name_zh + '远远排在第二，落后 ' + gapZh + '。',
          desc.focusPart(second.index)
        ));
      }
      var mainChange = stats.changes.filter(function (item) { return item.id === top.id; })[0] || stats.changes[0];
      if (mainChange) {
        var leaderShrank = mainChange.deltaPP < 0 && mainChange.id === top.id;
        sentences.push(desc.sentence(
          'change',
          mainChange.name_en + ' ' + (leaderShrank ? 'shrank by ' : mainChange.deltaPP > 0 ? 'gained ' : 'lost ') + pp(mainChange.deltaPP) + ', from ' + pct(mainChange.baselineShare) + ' to ' + pct(mainChange.share) + '.',
          mainChange.name_zh + (leaderShrank ? '份额缩水 ' : mainChange.deltaPP > 0 ? '上升 ' : '下降 ') + ppZh(mainChange.deltaPP) + '，从 ' + pct(mainChange.baselineShare) + ' 变为 ' + pct(mainChange.share) + '。',
          desc.focusPart(mainChange.index)
        ));
      }
    } else {
      if (stats.neckAndNeck) {
        sentences.push(desc.sentence(
          'overview',
          top.name_en + ' and ' + second.name_en + ' are now neck and neck, separated by just ' + gap + '.',
          top.name_zh + '和' + second.name_zh + '如今并驾齐驱，只差 ' + gap + '。'
        ));
      } else if (stats.dominant) {
        sentences.push(desc.sentence(
          'overview',
          top.name_en + ' still dominates with ' + topShare + ', but the mix below the leader is shifting.',
          top.name_zh + '仍以 ' + topShare + ' 占据主导，但领先者身后的格局正在变化。'
        ));
      } else {
        sentences.push(desc.sentence(
          'overview',
          'No single channel controls the market: ' + top.name_en + ' leads with just ' + topShare + '.',
          '没有单一渠道控制市场：' + top.name_zh + '以 ' + topShare + ' 领先。'
        ));
      }
      if (stats.consolidated) {
        sentences.push(desc.sentence(
          'structure',
          'The market is consolidated: the top three channels hold ' + pct(stats.top3) + '.',
          '市场高度集中：前三个渠道合计占 ' + pct(stats.top3) + '。'
        ));
      } else if (stats.fragmented) {
        sentences.push(desc.sentence(
          'structure',
          'The market remains fragmented, with no channel above ' + topShare + '.',
          '市场仍然分散，没有渠道超过 ' + topShare + '。'
        ));
      }
      var mover = stats.changes.filter(function (item) { return item.id === top.id; })[0] || stats.changes[0];
      if (mover) {
        var moverShrank = mover.deltaPP < 0 && mover.id === top.id;
        sentences.push(desc.sentence(
          'change',
          mover.name_en + ' ' + (moverShrank ? 'shrank by ' : mover.deltaPP > 0 ? 'gained ' : 'lost ') + pp(mover.deltaPP) + ' over the period.',
          mover.name_zh + '在此期间' + (moverShrank ? '份额缩水 ' : mover.deltaPP > 0 ? '上升 ' : '下降 ') + ppZh(mover.deltaPP) + '。',
          desc.focusPart(mover.index)
        ));
      }
      if (bottom.share <= 5) {
        sentences.push(desc.sentence(
          'tail',
          bottom.name_en + ' accounts for only ' + bottomShare + ', a small slice of the total.',
          bottom.name_zh + '只占 ' + bottomShare + '，是总量中很小的一块。',
          desc.focusPart(bottom.index)
        ));
      }
    }

    return { sentences: sentences, stats: stats };
  };
})(window.NPESLCharts);
