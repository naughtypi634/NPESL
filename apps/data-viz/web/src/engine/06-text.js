/* Live wording: when the reader edits the data, the shipped descriptions no
 * longer match, so whole-chart summaries are rebuilt from the same feature
 * kinds and sentence frames the panel already uses. Nothing here invents a
 * grammar; every sentence is a validated library frame filled with live slots.
 */
(function (DV) {
  'use strict';

  var LEVEL_FALLBACK = {
    a2: ['a2', 'b1', 'b2'],
    b1: ['b1', 'a2', 'b2'],
    b2: ['b2', 'b1', 'a2']
  };

  function featuresOf(features) {
    if (!features) return [];
    var list = Array.isArray(features)
      ? features
      : Object.keys(features).map(function (key) { return features[key]; });
    return list.filter(function (f) { return f && f.kind; });
  }

  function featureAt(features, mark) {
    if (!features) return null;
    if (!Array.isArray(features)) return features[mark] || null;
    return features.filter(function (f) {
      return (f.marks || []).indexOf(mark) >= 0;
    })[0] || null;
  }

  function byKind(features, kind) {
    return features.filter(function (f) { return f.kind === kind; });
  }

  function ordinal(value) {
    var text = String(value == null ? '' : value).trim();
    if (!/^\d+$/.test(text)) return text;
    var n = Number(text);
    var mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13) return text + 'th';
    var mod10 = n % 10;
    if (mod10 === 1) return text + 'st';
    if (mod10 === 2) return text + 'nd';
    if (mod10 === 3) return text + 'rd';
    return text + 'th';
  }

  function numericSlot(feature, key) {
    var raw = feature && feature.slots && feature.slots[key];
    if (raw == null) return NaN;
    return Number(String(raw).replace(/[^0-9.\-]/g, ''));
  }

  function overallTrend(view, series) {
    var values = series.values;
    if (values.length < 2) return null;
    var a = values[0];
    var b = values[values.length - 1];
    var unit = view.unit || {};
    var kind = DV.compute.classifyChange(a, b, unit);
    var subject = (view.series || []).length > 1
      ? (series.name_en || view.subject || '')
      : (view.subject || '');
    var slots = {
      subject: subject,
      series_name: series.name_en || '',
      from: DV.compute.fmtValue(a, unit),
      to: DV.compute.fmtValue(b, unit),
      from_period: DV.compute.label(view, 0),
      to_period: DV.compute.label(view, values.length - 1),
      period: DV.compute.label(view, 0) + ' to ' + DV.compute.label(view, values.length - 1),
      pct: DV.compute.pctText(a, b),
      pp: DV.compute.ppText(b - a, unit),
      delta: DV.compute.fmtDelta(b - a, unit),
      unit: unit.short || ''
    };
    return { kind: kind, marks: ['overview:' + series.id], slots: slots, auto: true };
  }

  function globalExtreme(view, features, kind) {
    var values = view.series || [];
    var best = null;
    var bestValue = null;
    values.forEach(function (series) {
      series.values.forEach(function (value, i) {
        if (bestValue == null || (kind === 'peak' ? value > bestValue : value < bestValue)) {
          bestValue = value;
          best = featureAt(features, 'pt:' + series.id + ':' + i);
        }
      });
    });
    return best;
  }

  function qualify(feature, view) {
    if (!feature || view.type !== 'line' || (view.series || []).length < 2) return feature;
    var mark = (feature.marks || [])[0] || '';
    var parts = mark.split(':');
    var series = (view.series || []).filter(function (s) { return s.id === parts[1]; })[0];
    if (!series) return feature;
    var slots = Object.assign({}, feature.slots);
    slots.subject = series.name_en || slots.subject;
    return { kind: feature.kind, marks: feature.marks, slots: slots, auto: true };
  }

  function topLink(view, features) {
    var best = null;
    var bestValue = -Infinity;
    (view.links || []).forEach(function (link) {
      if (link.value > bestValue) {
        bestValue = link.value;
        best = featureAt(features, 'link:' + link.source + '->' + link.target);
      }
    });
    return best;
  }

  function worstLink(view, features) {
    var order = (view.links || []).slice().sort(function (a, b) { return a.value - b.value; });
    if (!order.length) return null;
    return featureAt(features, 'link:' + order[0].source + '->' + order[0].target);
  }

  function pieCombined(view, features) {
    var parts = (view.parts || []).slice().sort(function (a, b) { return b.value - a.value; });
    if (parts.length < 2) return null;
    var total = parts.reduce(function (s, p) { return s + p.value; }, 0) || 1;
    var share = (parts[0].value + parts[1].value) / total * 100;
    var unit = view.unit || {};
    return {
      kind: 'combined_share',
      marks: ['slice:' + parts[0].id, 'slice:' + parts[1].id],
      auto: true,
      slots: {
        subject: view.subject || '',
        category: (parts[0].name_en || '') + ' and ' + (parts[1].name_en || ''),
        share: DV.compute.fmtValue(share, unit)
      }
    };
  }


  function softSubject(text) {
    text = String(text || '');
    if (/^[A-Z][a-z]/.test(text)) return text.charAt(0).toLowerCase() + text.slice(1);
    return text;
  }

  function chartFrame(view, level, register) {
    if (register && register !== 'general' && register !== 'ielts') return '';
    var subject = softSubject(view.subject || '');
    var first;
    var last;
    if (view.type === 'line' || view.type === 'bar' || view.type === 'stacked') {
      first = ((view.x || {}).values || [])[0] || '';
      last = ((view.x || {}).values || []).slice(-1)[0] || '';
    } else if (view.type === 'slope') {
      first = ((view.periods || [])[0] || {}).label_en || '';
      last = ((view.periods || []).slice(-1)[0] || {}).label_en || '';
    }
    var a2 = '';
    var b1 = '';
    var b2 = '';
    if (view.type === 'line') {
      a2 = 'This chart shows ' + subject + ' from ' + first + ' to ' + last + '.';
      b1 = 'The chart shows how ' + subject + ' changed between ' + first + ' and ' + last + '.';
      b2 = 'The chart tracks ' + subject + ' from ' + first + ' to ' + last + '.';
    } else if (view.type === 'bar') {
      a2 = 'This bar chart compares ' + subject + ' across categories.';
      b1 = a2;
      b2 = 'The bar chart compares ' + subject + ' across categories.';
    } else if (view.type === 'pie') {
      a2 = 'This pie chart shows how ' + subject + ' is divided.';
      b1 = 'The pie chart shows the composition of ' + subject + '.';
      b2 = 'The pie chart breaks ' + subject + ' into its main parts.';
    } else if (view.type === 'scatter') {
      var x = (view.x || {}).label_en || 'x';
      var y = (view.y || {}).label_en || 'y';
      a2 = 'This scatter plot shows the relationship between ' + x + ' and ' + y + '.';
      b1 = 'The scatter plot shows how ' + x + ' and ' + y + ' relate.';
      b2 = 'The scatter plot plots ' + x + ' against ' + y + '.';
    } else if (view.type === 'stacked') {
      a2 = 'This stacked bar chart shows the composition of ' + subject + '.';
      b1 = 'The stacked bar chart shows how ' + subject + ' breaks down over time.';
      b2 = 'The stacked bar chart tracks the composition of ' + subject + ' across periods.';
    } else if (view.type === 'heatmap') {
      a2 = 'This heatmap shows ' + subject + '.';
      b1 = 'The heatmap shows ' + subject + ' across rows and columns.';
      b2 = 'The heatmap maps ' + subject + ' across two dimensions.';
    } else if (view.type === 'sankey') {
      a2 = 'This flow diagram shows how ' + subject + ' moves.';
      b1 = 'The flow diagram shows how ' + subject + ' moves between stages.';
      b2 = 'The flow diagram traces ' + subject + ' through its stages.';
    } else if (view.type === 'slope') {
      a2 = 'This slope chart compares ' + subject + ' in ' + first + ' and ' + last + '.';
      b1 = 'The slope chart shows how ' + subject + ' changed between ' + first + ' and ' + last + '.';
      b2 = 'The slope chart tracks rank changes in ' + subject + ' from ' + first + ' to ' + last + '.';
    } else if (view.type === 'waterfall') {
      var start = ((view.start || {}).name_en) || 'start';
      var end = ((view.end || {}).name_en) || 'end';
      a2 = 'This waterfall chart shows what moved ' + subject + ' from ' + start + ' to ' + end + '.';
      b1 = 'The waterfall chart shows how ' + subject + ' moved from ' + start + ' to ' + end + '.';
      b2 = 'The waterfall chart breaks down the move in ' + subject + ' from ' + start + ' to ' + end + '.';
    }
    if (register === 'ielts') {
      var noun = {
        line: 'line graph', bar: 'bar chart', pie: 'pie chart', scatter: 'scatter plot',
        stacked: 'stacked bar chart', heatmap: 'heatmap', sankey: 'flow diagram',
        slope: 'slope chart', waterfall: 'waterfall chart'
      }[view.type] || 'chart';
      if (view.type === 'line') {
        return 'The ' + noun + ' illustrates ' + subject + ' between ' + first + ' and ' + last + '.';
      }
      return 'The ' + noun + ' shows ' + subject + '.';
    }
    return { a2: a2, b1: b1, b2: b2 }[level] || b1 || a2;
  }

  function pick(view, features) {
    var list = featuresOf(features);
    if (!list.length) return [];
    var picked = [];
    var seen = {};
    var seenMarks = {};
    var seenValues = {};

    function mainValues(feature) {
      var slots = feature.slots || {};
      return [slots.value, slots.share, slots.from, slots.to]
        .filter(function (value) { return value != null && value !== ''; })
        .map(function (value) { return String(value); });
    }

    function add(feature) {
      if (!feature || !feature.kind || seen[feature.kind]) return;
      var marks = (feature.marks || []).join(',');
      if (marks && seenMarks[marks]) return;
      var values = mainValues(feature);
      for (var i = 0; i < values.length; i++) {
        if (seenValues[values[i]]) return;
      }
      seen[feature.kind] = true;
      if (marks) seenMarks[marks] = true;
      values.forEach(function (value) { seenValues[value] = true; });
      picked.push(feature);
    }

    if (view.type === 'line') {
      var trends = (view.series || []).map(function (series) {
        return overallTrend(view, series);
      }).filter(Boolean).sort(function (a, b) {
        return Math.abs(numericSlot(b, 'pct')) - Math.abs(numericSlot(a, 'pct'));
      });
      if (trends.length) add(trends[0]);
      add(qualify(globalExtreme(view, features, 'peak'), view));
      var fluctuates = byKind(list, 'fluctuate');
      if (fluctuates.length) add(qualify(fluctuates[0], view));
      else add(qualify(globalExtreme(view, features, 'trough'), view));
    } else if (view.type === 'bar') {
      ['large_gap', 'highest', 'small_gap'].forEach(function (kind) {
        add(byKind(list, kind)[0]);
      });
      add(byKind(list, 'lowest')[0]);
      add(byKind(list, 'similar_values')[0]);
      add(byKind(list, 'ranking')[0]);
    } else if (view.type === 'pie') {
      ['majority', 'about_half', 'largest_share'].forEach(function (kind) {
        add(byKind(list, kind)[0]);
      });
      add(pieCombined(view, features));
      ['minority', 'smallest_share'].forEach(function (kind) {
        add(byKind(list, kind)[0]);
      });
      add(byKind(list, 'item')[0]);
    } else if (view.type === 'scatter') {
      add(featureAt(features, 'all'));
      add(byKind(list, 'outlier')[0]);
      ['positive_strong', 'negative_strong', 'positive_moderate', 'negative_moderate',
        'weak_or_none'].forEach(function (kind) {
        add(byKind(list, kind)[0]);
      });
    } else if (view.type === 'stacked') {
      var stacks = list.filter(function (f) { return f.kind === 'composition'; });
      add(stacks[0]);
      add(byKind(list, 'largest_component')[0]);
      add(stacks[stacks.length - 1]);
      add(byKind(list, 'share_shift')[0]);
      add(byKind(list, 'item')[0]);
    } else if (view.type === 'heatmap') {
      add(byKind(list, 'peak_cell')[0]);
      add(byKind(list, 'low_cell')[0]);
      add(byKind(list, 'pattern')[0]);
      add(byKind(list, 'compare_periods')[0]);
    } else if (view.type === 'sankey') {
      add(topLink(view, features));
      add(worstLink(view, features));
      add(byKind(list, 'main_path')[0]);
      add(byKind(list, 'merge')[0]);
      add(byKind(list, 'split')[0]);
    } else if (view.type === 'slope') {
      ['overtake', 'rank_up', 'rank_down'].forEach(function (kind) {
        add(byKind(list, kind)[0]);
      });
      add(byKind(list, 'stable_rank')[0]);
      add(byKind(list, 'point')[0]);
    } else if (view.type === 'waterfall') {
      add(byKind(list, 'largest_step')[0]);
      add(byKind(list, 'offset')[0]);
      add(byKind(list, 'decrease_contributor')[0]);
      add(byKind(list, 'increase_contributor')[0]);
      add(featureAt(features, 'total:end') || byKind(list, 'net_change')[0]);
    } else {
      list.forEach(add);
    }
    return picked.slice(0, 3);
  }

  function entryFor(library, kind) {
    return ((library || {}).features || {})[kind] || null;
  }

  function patternFor(entry, level) {
    var order = LEVEL_FALLBACK[level] || LEVEL_FALLBACK.b1;
    for (var i = 0; i < order.length; i++) {
      var found = (entry.patterns || []).filter(function (p) { return p.level === order[i]; })[0];
      if (found) return found;
    }
    return (entry.patterns || [])[0] || null;
  }

  function clean(text, capitalize) {
    text = String(text || '').replace(/\s+/g, ' ').trim();
    if (/\{[a-z_]+\}/.test(text)) return '';
    if (capitalize && /^[a-z]/.test(text)) text = text.charAt(0).toUpperCase() + text.slice(1);
    return text;
  }

  function soften(slots) {
    var copy = Object.assign({}, slots || {});
    if (copy.subject && /^[A-Z][a-z]/.test(copy.subject)) {
      copy.subject = copy.subject.charAt(0).toLowerCase() + copy.subject.slice(1);
    }
    if (copy.rank != null) copy.rank = ordinal(copy.rank);
    if (copy.rank_before != null) copy.rank_before = ordinal(copy.rank_before);
    return copy;
  }

  function sentenceFor(feature, library, register, level) {
    var entry = entryFor(library, feature.kind);
    if (!entry) return '';
    var slots = soften(feature.slots);
    if (register !== 'general' && entry.registers && entry.registers[register]) {
      return clean(DV.fill(entry.registers[register], slots), true);
    }
    var pattern = patternFor(entry, level);
    return pattern ? clean(DV.fill(pattern.frame, slots), true) : '';
  }

  function zhFor(feature, library, level) {
    var entry = entryFor(library, feature.kind);
    if (!entry) return '';
    var pattern = patternFor(entry, level || 'b1');
    return pattern && pattern.zh_frame
      ? clean(DV.fill(pattern.zh_frame, soften(feature.slots)))
      : '';
  }

  DV.gen = {
    pick: pick,
    slots: soften,
    sentence: function (feature, library, register, level) {
      return sentenceFor(feature, library, register || 'general', level || 'b1');
    },
    chinese: zhFor,
    describe: function (view, features, library, register, level) {
      var source = view;
      source.library = library;
      var frame = chartFrame(view, level || 'b1', register || 'general');
      var picks = pick(source, features).slice(0, frame ? 2 : 3);
      var out = [];
      picks.forEach(function (feature) {
        var text = sentenceFor(feature, library, register || 'general', level || 'b1');
        if (text && out.indexOf(text) < 0) out.push(text);
      });
      return (frame ? frame + ' ' : '') + out.join(' ');
    },
    overviewZh: function (view, features, library) {
      var source = view;
      source.library = library;
      var picks = pick(source, features);
      var out = [];
      picks.forEach(function (feature) {
        var text = zhFor(feature, library, 'b1');
        if (text && out.indexOf(text) < 0) out.push(text);
      });
      return out.join('');
    },
    // The same feature, rephrased for the three learner levels, for the
    // whole-chart "describe" tab when the data has been edited.
    levels: function (view, features, library) {
      var source = view;
      source.library = library;
      var picks = pick(source, features);
      var out = { a2: '', b1: '', b2: '' };
      ['a2', 'b1', 'b2'].forEach(function (level) {
        var sentences = [];
        picks.slice(0, 2).forEach(function (feature) {
          var text = sentenceFor(feature, library, 'general', level);
          if (text && sentences.indexOf(text) < 0) sentences.push(text);
        });
        var frame = chartFrame(view, level, 'general');
        out[level] = (frame ? frame + ' ' : '') + sentences.join(' ');
      });
      return out;
    }
  };
})(window.DV);
