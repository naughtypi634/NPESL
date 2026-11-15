/* Sentence engine: turns the current data into English and Chinese
 * descriptions. Phrasing lives in content/charts/describe.json; this file only
 * works out the numbers, the winners, and which marks each sentence points at.
 *
 * Every sentence returns { en, zh, marks }. `marks` are the keys the renderers
 * stamp on their elements (data-mark): p:i (line point), b:c:s (bar or table
 * cell), s:i (pie slice), st:i (process step), bar:i / ln:i (combo).
 */
(function (NC) {
  'use strict';

  function pair(en, zh) {
    return { en: en, zh: zh };
  }

  function unitOf(source) {
    return pair(source.unit_en, source.unit_zh);
  }

  function nameOf(item) {
    return pair(item.name_en, item.name_zh);
  }

  function labelOf(item) {
    return pair(item.label_en, item.label_zh);
  }

  function argmax(values) {
    var best = 0;
    values.forEach(function (value, index) {
      if (value > values[best]) best = index;
    });
    return best;
  }

  function argmin(values) {
    var best = 0;
    values.forEach(function (value, index) {
      if (value < values[best]) best = index;
    });
    return best;
  }

  function sum(values) {
    return values.reduce(function (total, value) { return total + value; }, 0);
  }

  function mean(values) {
    return values.length ? sum(values) / values.length : 0;
  }

  // Overall movement between the first and last value, as a verb key.
  function trendKey(first, last) {
    var pct = (last - first) / Math.abs(first || 1);
    if (Math.abs(pct) < 0.05) return 'flat';
    if (pct >= 0.5) return 'surge';
    if (pct > 0) return 'up';
    if (pct <= -0.5) return 'drop';
    return 'down';
  }

  function verb(key, level) {
    var entry = NC.content.describe.verbs[key];
    return pair(entry[level], entry.zh);
  }

  function seriesIndexMarks(categories, series, check) {
    var out = [];
    categories.forEach(function (_, c) {
      series.forEach(function (_s, s) {
        if (check(c, s)) out.push('b:' + c + ':' + s);
      });
    });
    return out;
  }

  // ---- one builder per sentence id ---------------------------------------
  // Each returns { slots, marks } or null when the data cannot support it.

  var BUILDERS = {
    trend: function (d, level) {
      var v = d.values;
      var last = v.length - 1;
      return {
        slots: {
          verb: verb(trendKey(v[0], v[last]), level),
          first: NC.fmt(v[0], d.decimals),
          last: NC.fmt(v[last], d.decimals),
          unit: unitOf(d)
        },
        marks: []
      };
    },

    peak: function (d) {
      var i = argmax(d.values);
      return {
        slots: { period: labelOf(d.periods[i]), value: NC.fmt(d.values[i], d.decimals), unit: unitOf(d) },
        marks: ['p:' + i]
      };
    },

    change: function (d, level) {
      var v = d.values;
      if (v.length < 2) return null;
      var best = 1;
      for (var i = 2; i < v.length; i += 1) {
        if (Math.abs(v[i] - v[i - 1]) > Math.abs(v[best] - v[best - 1])) best = i;
      }
      var rose = v[best] >= v[best - 1];
      return {
        slots: {
          period: labelOf(d.periods[best]),
          verb: verb(rose ? 'rise' : 'fall', level),
          from: NC.fmt(v[best - 1], d.decimals),
          to: NC.fmt(v[best], d.decimals),
          unit: unitOf(d)
        },
        marks: ['p:' + (best - 1), 'p:' + best]
      };
    },

    pace: function (d) {
      var v = d.values;
      var half = Math.floor(v.length / 2);
      if (half < 1) return null;
      var marks = [];
      for (var i = half; i < v.length; i += 1) marks.push('p:' + i);
      return {
        slots: {
          avgSecond: NC.fmt(mean(v.slice(half)), 1),
          avgFirst: NC.fmt(mean(v.slice(0, half)), 1),
          unit: unitOf(d)
        },
        marks: marks
      };
    },

    top: function (d) {
      var totals = d.categories.map(function (_, c) {
        return sum(d.series.map(function (s) { return s.values[c]; }));
      });
      var c = argmax(totals);
      return {
        slots: { category: labelOf(d.categories[c]), value: NC.fmt(totals[c]), unit: unitOf(d) },
        marks: seriesIndexMarks(d.categories, d.series, function (cat) { return cat === c; })
      };
    },

    low: function (d) {
      var totals = d.categories.map(function (_, c) {
        return sum(d.series.map(function (s) { return s.values[c]; }));
      });
      var c = argmin(totals);
      return {
        slots: { category: labelOf(d.categories[c]), value: NC.fmt(totals[c]), unit: unitOf(d) },
        marks: seriesIndexMarks(d.categories, d.series, function (cat) { return cat === c; })
      };
    },

    product: function (d) {
      var totals = d.series.map(function (s) { return sum(s.values); });
      var grand = sum(totals);
      var s = argmax(totals);
      return {
        slots: {
          series: nameOf(d.series[s]),
          value: NC.fmt(totals[s]),
          unit: unitOf(d),
          share: String(Math.round(totals[s] / grand * 100))
        },
        marks: seriesIndexMarks(d.categories, d.series, function (_c, series) { return series === s; })
      };
    },

    gap: function (d) {
      var totals = d.categories.map(function (_, c) {
        return sum(d.series.map(function (s) { return s.values[c]; }));
      });
      var top = argmax(totals);
      var low = argmin(totals);
      if (top === low) return null;
      return {
        slots: {
          top: labelOf(d.categories[top]),
          low: labelOf(d.categories[low]),
          gap: NC.fmt(totals[top] - totals[low]),
          ratio: (totals[top] / totals[low]).toFixed(1),
          unit: unitOf(d)
        },
        marks: seriesIndexMarks(d.categories, d.series, function (c) { return c === top || c === low; })
      };
    },

    best: function (d) {
      var bestC = 0;
      var bestS = 0;
      d.series.forEach(function (s, si) {
        d.categories.forEach(function (_, c) {
          if (s.values[c] > d.series[bestS].values[bestC]) {
            bestS = si;
            bestC = c;
          }
        });
      });
      var value = d.series[bestS].values[bestC];
      return {
        slots: {
          series: nameOf(d.series[bestS]),
          category: labelOf(d.categories[bestC]),
          value: NC.fmt(value),
          unit: unitOf(d)
        },
        marks: ['b:' + bestC + ':' + bestS]
      };
    },

    lead: function (d) {
      var order = d.parts.map(function (_, i) { return i; }).sort(function (a, b) {
        return d.parts[b].value - d.parts[a].value;
      });
      var i = order[0];
      return {
        slots: { name: nameOf(d.parts[i]), value: String(d.parts[i].value) },
        marks: ['s:' + i]
      };
    },

    second: function (d) {
      var order = d.parts.map(function (_, i) { return i; }).sort(function (a, b) {
        return d.parts[b].value - d.parts[a].value;
      });
      var i = order[1];
      return {
        slots: { name: nameOf(d.parts[i]), value: String(d.parts[i].value) },
        marks: ['s:' + i]
      };
    },

    shift: function (d, level) {
      var moves = d.parts.map(function (p) { return p.value - p.baseline; });
      var i = 0;
      moves.forEach(function (move, index) {
        if (Math.abs(move) > Math.abs(moves[i])) i = index;
      });
      return {
        slots: {
          name: nameOf(d.parts[i]),
          verb: verb(moves[i] >= 0 ? 'gain' : 'lose', level),
          delta: String(Math.abs(moves[i]))
        },
        marks: ['s:' + i]
      };
    },

    starts: function (d) {
      var last = d.steps.length - 1;
      return {
        slots: {
          first: labelOf(d.steps[0]),
          last: labelOf(d.steps[last]),
          count: String(d.steps.length)
        },
        marks: ['st:0', 'st:' + last]
      };
    },

    longest: function (d) {
      var minutes = d.steps.map(function (s) { return s.minutes; });
      var i = argmax(minutes);
      return {
        slots: { label: labelOf(d.steps[i]), minutes: String(minutes[i]) },
        marks: ['st:' + i]
      };
    },

    total: function (d) {
      return {
        slots: { total: String(sum(d.steps.map(function (s) { return s.minutes; }))) },
        marks: d.steps.map(function (_, i) { return 'st:' + i; })
      };
    },

    bars: function (d, level) {
      var b = d.bars;
      var v = b.values;
      var last = v.length - 1;
      return {
        slots: {
          verb: verb(trendKey(v[0], v[last]), level),
          first: NC.fmt(v[0], b.decimals),
          last: NC.fmt(v[last], b.decimals),
          unit: unitOf(b)
        },
        marks: v.map(function (_, i) { return 'bar:' + i; })
      };
    },

    margin: function (d, level) {
      var l = d.line;
      var v = l.values;
      var last = v.length - 1;
      return {
        slots: {
          verb: verb(trendKey(v[0], v[last]), level),
          first: NC.fmt(v[0], l.decimals),
          last: NC.fmt(v[last], l.decimals)
        },
        marks: v.map(function (_, i) { return 'ln:' + i; })
      };
    },

    peakMargin: function (d) {
      var v = d.line.values;
      var i = argmax(v);
      return {
        slots: { period: labelOf(d.periods[i]), value: NC.fmt(v[i], d.line.decimals) },
        marks: ['ln:' + i]
      };
    },

    mismatch: function (d) {
      var iRev = argmax(d.bars.values);
      var iMar = argmax(d.line.values);
      if (iRev === iMar) return null;
      return {
        slots: {
          periodRevenue: labelOf(d.periods[iRev]),
          periodMargin: labelOf(d.periods[iMar])
        },
        marks: ['bar:' + iRev, 'ln:' + iMar]
      };
    }
  };

  // Which dataset object a builder should read, by chart kind.
  function sourceFor(type, datasets) {
    return datasets[type.dataset];
  }

  function fill(template, slots, lang) {
    var text = template.replace(/\{(\w+)\}/g, function (token, name) {
      var slot = slots[name];
      if (slot == null) return token;
      if (typeof slot === 'object') return slot[lang];
      return String(slot);
    });
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  // Returns the sentences for one chart, in the order the content asks for.
  NC.describe = function (type, datasets, level) {
    var source = sourceFor(type, datasets);
    var phrases = NC.content.describe.sentences;
    var out = [];
    type.sentences.forEach(function (id) {
      var build = BUILDERS[id];
      var built = build ? build(source, level) : null;
      if (!built) return;
      var phrase = phrases[id][level];
      out.push({
        en: fill(phrase.en, built.slots, 'en'),
        zh: fill(phrase.zh, built.slots, 'zh'),
        marks: built.marks
      });
    });
    return out;
  };
})(window.NPESLCharts);
