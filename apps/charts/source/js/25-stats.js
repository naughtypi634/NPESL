(function (NC) {
  'use strict';

  var stats = NC.stats = {};

  function directionOf(a, b) {
    if (Math.abs(b - a) < 1e-9) return 'flat';
    return b > a ? 'up' : 'down';
  }

  function classify(pct, norm) {
    var p = Math.abs(pct == null ? 0 : pct);
    var n = Math.abs(norm || 0);
    if (p < 2.5 && n < 0.04) return 'flat';
    if (p < 10 && n < 0.15) return 'slight';
    if (p < 25 && n < 0.35) return 'moderate';
    if (p < 50 && n < 0.60) return 'sharp';
    return 'dramatic';
  }

  stats.classify = classify;
  stats.directionOf = directionOf;

  stats.trend = function (values) {
    var n = values.length;
    var minIndex = 0;
    var maxIndex = 0;
    var sum = 0;
    values.forEach(function (v, i) {
      if (v < values[minIndex]) minIndex = i;
      if (v > values[maxIndex]) maxIndex = i;
      sum += v;
    });
    var min = values[minIndex];
    var max = values[maxIndex];
    var range = max - min;
    var mean = sum / n;
    var first = values[0];
    var last = values[n - 1];
    var abs = last - first;
    var pct = first !== 0 ? abs / Math.abs(first) * 100 : null;
    var norm = range > 0 ? Math.abs(abs) / range : 0;
    var segments = [];
    for (var i = 1; i < n; i += 1) {
      var a = values[i - 1];
      var b = values[i];
      var segAbs = b - a;
      var segPct = a !== 0 ? segAbs / Math.abs(a) * 100 : null;
      var segNorm = range > 0 ? Math.abs(segAbs) / range : 0;
      segments.push({
        index: i,
        fromIndex: i - 1,
        toIndex: i,
        a: a,
        b: b,
        abs: segAbs,
        pct: segPct,
        norm: segNorm,
        direction: directionOf(a, b),
        cls: classify(segPct, segNorm)
      });
    }

    var direction = directionOf(first, last);
    if (range > 0 && range / Math.abs(mean || 1) < 0.05) direction = 'flat';

    var localMaxima = [];
    var localMinima = [];
    for (var j = 1; j < n - 1; j += 1) {
      var tolerance = range * 0.01;
      if (values[j] >= values[j - 1] - tolerance && values[j] >= values[j + 1] - tolerance) {
        if (values[j] > values[j - 1] + tolerance || values[j] > values[j + 1] + tolerance) {
          localMaxima.push(j);
        }
      }
      if (values[j] <= values[j - 1] + tolerance && values[j] <= values[j + 1] + tolerance) {
        if (values[j] < values[j - 1] - tolerance || values[j] < values[j + 1] - tolerance) {
          localMinima.push(j);
        }
      }
    }

    var flatRun = 0;
    var plateaus = [];
    segments.forEach(function (seg) {
      if (seg.cls === 'flat') {
        flatRun += 1;
      } else {
        if (flatRun >= 2) {
          plateaus.push({
            fromIndex: seg.fromIndex - flatRun,
            toIndex: seg.fromIndex,
            value: values[seg.fromIndex]
          });
        }
        flatRun = 0;
      }
    });
    if (flatRun >= 2) {
      plateaus.push({
        fromIndex: n - 1 - flatRun,
        toIndex: n - 1,
        value: values[n - 1 - flatRun]
      });
    }

    var firstThirdEnd = Math.max(1, Math.floor((n - 1) / 3));
    var lastThirdStart = Math.min(n - 2, Math.ceil((n - 1) * 2 / 3));
    var firstLeg = values[firstThirdEnd] - values[0];
    var lastLeg = values[n - 1] - values[lastThirdStart];
    var reversal = false;
    if (firstLeg !== 0 && lastLeg !== 0 && firstLeg * lastLeg < 0) {
      if (Math.abs(firstLeg) > range * 0.05 && Math.abs(lastLeg) > range * 0.05) {
        reversal = true;
      }
    }

    var deltaSum = 0;
    segments.forEach(function (seg) { deltaSum += Math.abs(seg.abs); });
    var volatility = range > 0 ? (deltaSum / Math.max(segments.length, 1)) / range : 0;

    var nonFlat = segments.filter(function (seg) { return seg.direction !== 'flat'; });
    var monotonic = nonFlat.every(function (seg) { return seg.direction === nonFlat[0].direction; });

    var half = Math.floor(n / 2);
    var firstHalf = values.slice(0, half);
    var secondHalf = values.slice(half);
    var firstHalfGain = firstHalf[firstHalf.length - 1] - firstHalf[0];
    var secondHalfGain = secondHalf[secondHalf.length - 1] - secondHalf[0];
    var backLoaded = secondHalfGain > firstHalfGain;
    var frontLoaded = firstHalfGain > secondHalfGain;

    var biggest = segments.slice().sort(function (a, b) { return b.norm - a.norm; })[0] || null;
    var biggestRise = segments.filter(function (s) { return s.direction === 'up'; })
      .sort(function (a, b) { return b.norm - a.norm; })[0] || null;
    var biggestFall = segments.filter(function (s) { return s.direction === 'down'; })
      .sort(function (a, b) { return b.norm - a.norm; })[0] || null;

    return {
      values: values,
      n: n,
      first: first,
      last: last,
      min: min,
      max: max,
      minIndex: minIndex,
      maxIndex: maxIndex,
      range: range,
      mean: mean,
      abs: abs,
      pct: pct,
      norm: norm,
      direction: direction,
      cls: classify(pct, norm),
      segments: segments,
      localMaxima: localMaxima,
      localMinima: localMinima,
      plateaus: plateaus,
      reversal: reversal,
      volatility: volatility,
      volatile: volatility > 0.25,
      highlyVolatile: volatility > 0.40,
      monotonic: monotonic,
      backLoaded: backLoaded,
      frontLoaded: frontLoaded,
      biggest: biggest,
      biggestRise: biggestRise,
      biggestFall: biggestFall
    };
  };

  stats.rank = function (items, valueKey, baselineKey) {
    var vk = valueKey || 'value';
    var bk = baselineKey || 'baseline';
    var sorted = items.slice().sort(function (a, b) { return b[vk] - a[vk]; });
    var total = 0;
    sorted.forEach(function (item) { total += item[vk]; });
    sorted.forEach(function (item, index) {
      item.rank = index + 1;
      item.share = total > 0 ? item[vk] / total * 100 : 0;
    });

    var withBaseline = items.filter(function (item) { return typeof item[bk] === 'number'; });
    withBaseline.slice().sort(function (a, b) { return b[bk] - a[bk]; })
      .forEach(function (item, index) { item.baselineRank = index + 1; });

    sorted.forEach(function (item) {
      if (typeof item[bk] === 'number' && item[bk] !== 0) {
        item.delta = item[vk] - item[bk];
        item.pctChange = item.delta / Math.abs(item[bk]) * 100;
        item.rankChange = item.baselineRank ? item.baselineRank - item.rank : 0;
      }
    });

    var top = sorted[0] || null;
    var second = sorted[1] || null;
    var bottom = sorted[sorted.length - 1] || null;
    var gap = top && second ? top[vk] - second[vk] : 0;
    var ratio = top && second && second[vk] !== 0 ? top[vk] / second[vk] : Infinity;

    var changes = sorted.filter(function (item) { return typeof item.pctChange === 'number'; });
    var fastest = changes.slice().sort(function (a, b) { return b.pctChange - a.pctChange; })[0] || null;
    var slowest = changes.slice().sort(function (a, b) { return a.pctChange - b.pctChange; })[0] || null;
    var decliners = changes.filter(function (item) { return item.pctChange < 0; });
    var rankChanges = sorted.filter(function (item) { return Math.abs(item.rankChange || 0) > 0; });
    var overtook = rankChanges.filter(function (item) { return item.rankChange > 0; });

    return {
      items: sorted,
      original: items,
      total: total,
      top: top,
      second: second,
      bottom: bottom,
      gap: gap,
      ratio: ratio,
      fastest: fastest,
      slowest: slowest,
      decliners: decliners,
      rankChanges: rankChanges,
      overtook: overtook
    };
  };

  stats.shares = function (parts) {
    var total = 0;
    var baselineTotal = 0;
    parts.forEach(function (part) {
      total += part.value;
      baselineTotal += part.baseline || 0;
    });
    var items = parts.map(function (part) {
      var share = total > 0 ? part.value / total * 100 : 0;
      var baselineShare = baselineTotal > 0 && typeof part.baseline === 'number'
        ? part.baseline / baselineTotal * 100 : null;
      return {
        id: part.id,
        name_en: part.name_en,
        name_zh: part.name_zh,
        value: part.value,
        baseline: part.baseline,
        color: part.color,
        share: share,
        baselineShare: baselineShare,
        deltaPP: baselineShare == null ? null : share - baselineShare
      };
    });
    items.sort(function (a, b) { return b.share - a.share; });
    items.forEach(function (item, index) { item.rank = index + 1; });

    var top = items[0];
    var second = items[1];
    var bottom = items[items.length - 1];
    var gap = top && second ? top.share - second.share : 0;
    var ratio = top && second && second.value > 0 ? top.value / second.value : Infinity;
    var hhi = items.reduce(function (sum, item) { return sum + item.share * item.share; }, 0) / 10000;
    var top3 = items.slice(0, 3).reduce(function (sum, item) { return sum + item.share; }, 0);
    var fragmented = (top.share < 25 && top3 < 50) || hhi < 0.15;
    var consolidated = top3 >= 75 || hhi >= 0.25;

    return {
      items: items,
      total: total,
      top: top,
      second: second,
      bottom: bottom,
      gap: gap,
      ratio: ratio,
      hhi: hhi,
      top3: top3,
      dominant: top.share >= 50,
      lionsShare: top.share >= 40 && top.value >= (second ? second.value * 1.5 : Infinity),
      neckAndNeck: gap <= 2,
      narrowLead: gap <= 5,
      distantSecond: gap >= 15 || (second && top.value >= second.value * 2),
      fragmented: fragmented,
      consolidated: consolidated,
      changes: items.filter(function (item) {
        return item.deltaPP != null && Math.abs(item.deltaPP) >= 1;
      }).sort(function (a, b) { return Math.abs(b.deltaPP) - Math.abs(a.deltaPP); })
    };
  };
})(window.NPESLCharts);
