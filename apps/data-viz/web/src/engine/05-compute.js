/* Runtime feature engine — a browser port of source/engine/src/features.rs.
 *
 * The build precomputes features for the shipped data. Once the reader edits
 * the data, that precomputed text is stale, so the same classification has to
 * run in the browser: every mark is re-kinded, every slot refilled, and the
 * language panel follows the numbers the reader sees.
 *
 * Keep this file in lockstep with source/engine/src/features.rs. tests/dataviz-parity.mjs
 * compares both engines across every shipped view.
 */
(function (DV) {
  'use strict';

  var FLAT = 0.03;
  var SLIGHT = 0.10;
  var STEADY = 0.25;

  var PP_FLAT = 0.5;
  var PP_SLIGHT = 1.5;
  var PP_STEADY = 3.0;

  function num(value, decimals) {
    return DV.num(value, decimals);
  }

  function fmtValue(value, unit) {
    unit = unit || {};
    var scale = Number(unit.scale || 1) || 1;
    var x = Number(value) * scale;
    var dec = unit.decimals == null ? 0 : Number(unit.decimals);
    if (unit.kind === 'percent') return num(x, dec) + ' percent';
    if (unit.million && Math.abs(x) >= 1e6) {
      return (num(x / 1e6, 1) + ' million ' + (unit.en || '')).trim();
    }
    return (num(x, dec) + ' ' + (unit.en || '')).trim();
  }

  function fmtAxis(value, unit) {
    return num(value, unit && unit.decimals != null ? Number(unit.decimals) : 0);
  }

  function fmtDelta(delta, unit) {
    if (unit && unit.points) {
      var dec = unit.decimals == null ? 0 : Number(unit.decimals);
      return num(Math.abs(delta), dec) + ' percentage points';
    }
    return fmtValue(Math.abs(delta), unit);
  }

  function relPct(a, b) {
    if (Number(a) === 0) return null;
    return (Number(b) - Number(a)) / Math.abs(Number(a)) * 100;
  }

  function pctText(a, b) {
    var value = relPct(a, b);
    if (value == null) return '';
    if (Math.abs(value) < 10) return num(Math.abs(value), 1);
    return num(Math.abs(value), 0);
  }

  function ppText(delta, unit) {
    var dec = unit && unit.decimals != null ? Number(unit.decimals) : 0;
    return num(Math.abs(delta), dec);
  }

  function classifyChange(a, b, unit) {
    var delta = Number(b) - Number(a);
    if (unit && unit.points) {
      var step = Math.abs(delta);
      if (step < PP_FLAT) return 'flat';
      if (step < PP_SLIGHT) return delta > 0 ? 'rise_slight' : 'fall_slight';
      if (step < PP_STEADY) return delta > 0 ? 'rise_steady' : 'fall_steady';
      return delta > 0 ? 'rise_sharp' : 'fall_sharp';
    }
    var pct = relPct(a, b);
    if (pct == null || Math.abs(pct) < FLAT * 100) return 'flat';
    step = Math.abs(pct) / 100;
    if (step < SLIGHT) return pct > 0 ? 'rise_slight' : 'fall_slight';
    if (step < STEADY) return pct > 0 ? 'rise_steady' : 'fall_steady';
    return pct > 0 ? 'rise_sharp' : 'fall_sharp';
  }

  function label(view, index) {
    return String(view.x.values[index]);
  }

  function baseSlots(view, series) {
    var slots = {
      subject: view.subject || '',
      unit: (view.unit || {}).short || '',
      category: '',
      period: ''
    };
    if (series) slots.series_name = series.name_en || '';
    return slots;
  }

  function changeSlots(view, series, i, unit) {
    var a = series.values[i];
    var b = series.values[i + 1];
    var slots = baseSlots(view, series);
    slots.from = fmtValue(a, unit);
    slots.to = fmtValue(b, unit);
    slots.from_period = label(view, i);
    slots.to_period = label(view, i + 1);
    slots.period = label(view, i) + ' to ' + label(view, i + 1);
    slots.pct = pctText(a, b);
    slots.pp = ppText(b - a, unit);
    slots.delta = fmtDelta(b - a, unit);
    return slots;
  }

  function make(kind, mark, slots) {
    return { kind: kind, marks: [mark], slots: slots, auto: true };
  }

  function maxIndex(values) {
    var best = 0;
    for (var i = 1; i < values.length; i++) if (values[i] > values[best]) best = i;
    return best;
  }

  function minIndex(values) {
    var best = 0;
    for (var i = 1; i < values.length; i++) if (values[i] < values[best]) best = i;
    return best;
  }

  // ---------------------------------------------------------------- line
  function computeLine(view) {
    var unit = view.unit || {};
    var out = {};
    var n = view.x.values.length;
    view.series.forEach(function (series) {
      var values = series.values;
      var kinds = [];
      var i;
      for (i = 0; i < n - 1; i++) kinds.push(classifyChange(values[i], values[i + 1], unit));

      i = 0;
      while (i < kinds.length) {
        if (kinds[i] !== 'flat') { i += 1; continue; }
        var j = i;
        while (j < kinds.length && kinds[j] === 'flat') j += 1;
        for (var k = i; k < j; k++) kinds[k] = j - i >= 2 ? 'plateau' : 'flat';
        i = j;
      }

      function dirOf(kind) {
        if (kind.indexOf('rise') >= 0) return 1;
        if (kind.indexOf('fall') >= 0) return -1;
        return 0;
      }

      i = 0;
      while (i < kinds.length - 1) {
        if (dirOf(kinds[i]) && dirOf(kinds[i]) !== dirOf(kinds[i + 1])) {
          var end = i + 1;
          while (end + 1 < kinds.length && dirOf(kinds[end + 1])
                 && dirOf(kinds[end + 1]) !== dirOf(kinds[end])) {
            end += 1;
          }
          if (end - i + 1 >= 3) {
            for (var m = i; m <= end; m++) kinds[m] = 'fluctuate';
          }
          i = end + 1;
        } else {
          i += 1;
        }
      }

      for (i = 0; i < n - 1; i++) {
        var seg = 'seg:' + series.id + ':' + i;
        out[seg] = make(kinds[i], seg, changeSlots(view, series, i, unit));
      }
      var peakIdx = maxIndex(values);
      for (i = 0; i < n; i++) {
        var mark = 'pt:' + series.id + ':' + i;
        var value = values[i];
        var neighbors = [];
        if (i > 0) neighbors.push(values[i - 1]);
        if (i < n - 1) neighbors.push(values[i + 1]);
        var kind = 'point';
        var above = neighbors.every(function (v) { return value > v; });
        var below = neighbors.every(function (v) { return value < v; });
        if (neighbors.length && above) kind = 'peak';
        else if (neighbors.length && below) kind = 'trough';
        var slots = baseSlots(view, series);
        slots.value = fmtValue(value, unit);
        slots.period = label(view, i);
        slots.peak = fmtValue(values[peakIdx], unit);
        slots.peak_period = label(view, peakIdx);
        out[mark] = make(kind, mark, slots);
      }
    });
    return out;
  }

  // ---------------------------------------------------------------- bar
  function computeBar(view) {
    var unit = view.unit || {};
    var out = {};
    var count = view.x.values.length;
    view.series.forEach(function (series) {
      var values = series.values;
      var order = values.map(function (_, i) { return i; }).sort(function (a, b) {
        return values[b] - values[a];
      });
      var rank = {};
      order.forEach(function (idx, r) { rank[idx] = r + 1; });
      var top = values[order[0]];
      var second = count > 1 ? values[order[1]] : values[order[0]];
      var spread = (Math.max.apply(null, values) - Math.min.apply(null, values))
        / Math.abs(Math.max.apply(null, values) || 1);
      for (var i = 0; i < count; i++) {
        var mark = 'bar:' + series.id + ':' + i;
        var kind = 'ranking';
        if (rank[i] === 1) {
          kind = 'highest';
        } else if (rank[i] === 2 && second
                   && Math.abs(top - second) / Math.abs(top || 1) <= 0.10) {
          kind = 'small_gap';
        } else if (rank[i] === count) {
          kind = 'lowest';
        } else if (spread <= 0.10) {
          kind = 'similar_values';
        }
        var slots = baseSlots(view, series);
        slots.category = label(view, i);
        slots.value = fmtValue(values[i], unit);
        slots.unit = unit.short || '';
        slots.rank = String(rank[i]);
        slots.gap = fmtDelta(Math.abs(top - values[i]), unit);
        slots.top_category = label(view, order[0]);
        slots.top_value = fmtValue(top, unit);
        out[mark] = make(kind, mark, slots);
      }
    });
    return out;
  }

  // ---------------------------------------------------------------- pie
  function computePie(view) {
    var unit = view.unit || {};
    var parts = view.parts;
    var total = parts.reduce(function (sum, p) { return sum + p.value; }, 0) || 1;
    var order = parts.map(function (_, i) { return i; }).sort(function (a, b) {
      return parts[b].value - parts[a].value;
    });
    var rank = {};
    order.forEach(function (idx, r) { rank[idx] = r + 1; });
    var out = {};
    parts.forEach(function (part, i) {
      var share = part.value / total * 100;
      var mark = 'slice:' + part.id;
      var kind = 'item';
      if (rank[i] === 1) {
        kind = share > 55 ? 'majority' : share >= 45 && share <= 55 ? 'about_half' : 'largest_share';
      } else if (rank[i] === parts.length) {
        kind = share < 10 ? 'minority' : 'smallest_share';
      }
      out[mark] = make(kind, mark, {
        subject: view.subject || '',
        category: part.name_en || '',
        share: fmtValue(share, unit),
        share_number: num(share, unit.decimals == null ? 0 : Number(unit.decimals)),
        value: fmtValue(part.value, unit),
        rank: String(rank[i])
      });
    });
    return out;
  }

  // ---------------------------------------------------------------- scatter
  function pearson(points) {
    var n = points.length;
    if (n < 3) return 0;
    var mx = points.reduce(function (s, p) { return s + p.x; }, 0) / n;
    var my = points.reduce(function (s, p) { return s + p.y; }, 0) / n;
    var sx = Math.sqrt(points.reduce(function (s, p) { return s + (p.x - mx) * (p.x - mx); }, 0));
    var sy = Math.sqrt(points.reduce(function (s, p) { return s + (p.y - my) * (p.y - my); }, 0));
    if (sx === 0 || sy === 0) return 0;
    return points.reduce(function (s, p) { return s + (p.x - mx) * (p.y - my); }, 0) / (sx * sy);
  }

  function scatterKind(r) {
    if (Math.abs(r) >= 0.7) return r > 0 ? 'positive_strong' : 'negative_strong';
    if (Math.abs(r) >= 0.4) return r > 0 ? 'positive_moderate' : 'negative_moderate';
    return 'weak_or_none';
  }

  function computeScatter(view) {
    var unit = view.unit || {};
    var points = view.points;
    var out = {};
    var xs = points.map(function (p) { return p.x; });
    var ys = points.map(function (p) { return p.y; });
    var n = points.length;
    var mx = xs.reduce(function (a, b) { return a + b; }, 0) / n;
    var my = ys.reduce(function (a, b) { return a + b; }, 0) / n;
    var denom = xs.reduce(function (s, x) { return s + (x - mx) * (x - mx); }, 0) || 1;
    var slope = points.reduce(function (s, p) { return s + (p.x - mx) * (p.y - my); }, 0) / denom;
    var intercept = my - slope * mx;
    var residuals = points.map(function (p) { return p.y - (slope * p.x + intercept); });
    var sd = Math.sqrt(residuals.reduce(function (s, r) { return s + r * r; }, 0) / n) || 1e-9;
    var groups = {};
    (view.groups || []).forEach(function (g) { groups[g.id] = g; });
    var byGroup = {};
    points.forEach(function (p) {
      var key = p.group == null ? '' : p.group;
      if (!byGroup[key]) byGroup[key] = [];
      byGroup[key].push(p);
    });

    function slotsFor(group, r) {
      return {
        subject: view.subject || '',
        x: (view.x || {}).label_en || 'x',
        y: (view.y || {}).label_en || 'y',
        r: DV.roundFixed(Math.abs(r), 2),
        direction: r > 0 ? 'positive' : 'negative',
        group: (groups[group] || {}).name_en || '',
        unit: unit.short || ''
      };
    }

    var overall = pearson(points);
    out.all = make(scatterKind(overall), 'all', slotsFor('', overall));
    Object.keys(byGroup).forEach(function (group) {
      var r = pearson(byGroup[group]);
      var mark = 'grp:' + group;
      out[mark] = make(scatterKind(r), mark, slotsFor(group, r));
    });
    points.forEach(function (p) {
      var mark = 'pt:' + p.id;
      var res = p.y - (slope * p.x + intercept);
      var isOutlier = Math.abs(res) > 2 * sd;
      var group = p.group == null ? '' : p.group;
      var r = pearson(byGroup[group] || points);
      var kind = isOutlier ? 'outlier' : scatterKind(r);
      var slots = slotsFor(group, r);
      slots.x_value = num(p.x, 1).replace(/\.0$/, '');
      slots.y_value = num(p.y, 1).replace(/\.0$/, '');
      slots.category = p.name_en || p.id;
      out[mark] = make(kind, mark, slots);
    });
    return out;
  }

  // ---------------------------------------------------------------- stacked
  function computeStacked(view) {
    var unit = view.unit || {};
    var out = {};
    var n = view.x.values.length;
    var series = view.series;
    var totals = [];
    for (var i = 0; i < n; i++) {
      totals.push(series.reduce(function (sum, s) { return sum + s.values[i]; }, 0));
    }
    for (i = 0; i < n; i++) {
      var total = totals[i] || 1;
      var largest = series[0];
      series.forEach(function (s) { if (s.values[i] > largest.values[i]) largest = s; });
      var stackMark = 'stack:' + i;
      var stackSlots = baseSlots(view, null);
      stackSlots.category = label(view, i);
      stackSlots.period = label(view, i);
      stackSlots.value = fmtValue(totals[i], unit);
      stackSlots.share = view.mode === 'percent' ? '100 percent' : '';
      out[stackMark] = make('composition', stackMark, stackSlots);
      series.forEach(function (s) {
        var mark = 'seg:' + i + ':' + s.id;
        var value = s.values[i];
        var share = value / total * 100;
        var slots = baseSlots(view, s);
        slots.category = label(view, i);
        slots.period = label(view, i);
        slots.value = fmtValue(value, unit);
        slots.share = fmtValue(share, unit);
        slots.share_number = num(share, unit.decimals == null ? 0 : Number(unit.decimals));
        slots.total = fmtValue(totals[i], unit);
        out[mark] = make(s === largest ? 'largest_component' : 'item', mark, slots);
      });
    }
    return out;
  }

  // ---------------------------------------------------------------- heatmap
  function computeHeatmap(view) {
    var unit = view.unit || {};
    var rows = view.rows;
    var cols = view.cols;
    var cells = view.cells;
    var best = { r: 0, c: 0, v: cells[0][0] };
    var low = { r: 0, c: 0, v: cells[0][0] };
    rows.forEach(function (_, r) {
      cols.forEach(function (__, c) {
        if (cells[r][c] > best.v) best = { r: r, c: c, v: cells[r][c] };
        if (cells[r][c] < low.v) low = { r: r, c: c, v: cells[r][c] };
      });
    });
    var out = {};
    rows.forEach(function (row, r) {
      cols.forEach(function (col, c) {
        var value = cells[r][c];
        var mark = 'cell:' + row.id + ':' + col.id;
        var kind = 'cell';
        if (r === best.r && c === best.c) kind = 'peak_cell';
        else if (r === low.r && c === low.c) kind = 'low_cell';
        out[mark] = make(kind, mark, {
          subject: view.subject || '',
          row: row.name_en || '',
          col: col.name_en || '',
          category: (row.name_en || '') + ' · ' + (col.name_en || ''),
          period: col.name_en || '',
          value: fmtValue(value, unit),
          unit: unit.short || ''
        });
      });
      var rowAvg = cells[r].reduce(function (s, v) { return s + v; }, 0) / cols.length;
      var rowBusiest = 0;
      cols.forEach(function (__, c) { if (cells[r][c] > cells[r][rowBusiest]) rowBusiest = c; });
      var rowMark = 'row:' + row.id;
      out[rowMark] = make('pattern', rowMark, {
        subject: view.subject || '',
        row: row.name_en || '',
        col: (cols[rowBusiest] || {}).name_en || '',
        category: row.name_en || '',
        period: 'the week',
        value: fmtValue(rowAvg, unit),
        unit: unit.short || ''
      });
    });
    cols.forEach(function (col, c) {
      var avg = rows.reduce(function (s, __, r) { return s + cells[r][c]; }, 0) / rows.length;
      var colBusiest = 0;
      rows.forEach(function (__, r) { if (cells[r][c] > cells[colBusiest][c]) colBusiest = r; });
      var colMark = 'col:' + col.id;
      out[colMark] = make('compare_periods', colMark, {
        subject: view.subject || '',
        row: (rows[colBusiest] || {}).name_en || '',
        col: col.name_en || '',
        category: col.name_en || '',
        period: col.name_en || '',
        value: fmtValue(avg, unit),
        unit: unit.short || ''
      });
    });
    return out;
  }

  // ---------------------------------------------------------------- sankey
  function computeSankey(view) {
    var unit = view.unit || {};
    var nodes = {};
    view.nodes.forEach(function (n) { nodes[n.id] = n; });
    var links = view.links;
    var out = {};
    var outTotal = {};
    var inTotal = {};
    links.forEach(function (link) {
      outTotal[link.source] = (outTotal[link.source] || 0) + link.value;
      inTotal[link.target] = (inTotal[link.target] || 0) + link.value;
    });
    var firstColumn = {};
    ((view.columns || [[]])[0] || []).forEach(function (id) { firstColumn[id] = true; });
    var rootTotal = links.reduce(function (sum, link) {
      return sum + (firstColumn[link.source] ? link.value : 0);
    }, 0) || 1;
    links.forEach(function (link) {
      var src = link.source;
      var dst = link.target;
      var mark = 'link:' + src + '->' + dst;
      var top = 1;
      var hasTop = false;
      links.forEach(function (l) {
        if (l.source === src && (!hasTop || l.value > top)) { top = l.value; hasTop = true; }
      });
      if (!hasTop) top = 1;
      var kind = link.value === top ? 'main_path'
        : link.value < top * 0.5 ? 'drop_off' : 'secondary_path';
      var share = link.value / (outTotal[src] || 1) * 100;
      out[mark] = make(kind, mark, {
        subject: view.subject || '',
        source: (nodes[src] || {}).name_en || src,
        target: (nodes[dst] || {}).name_en || dst,
        value: fmtValue(link.value, unit),
        share: fmtValue(share, { kind: 'percent', decimals: 0 }),
        pct: DV.roundFixed(share, 0),
        period: view.period_label || '',
        unit: unit.short || ''
      });
    });
    Object.keys(nodes).forEach(function (id) {
      var node = nodes[id];
      var mark = 'node:' + id;
      var ins = inTotal[id] || 0;
      var outs = outTotal[id] || 0;
      var nodeKind = ins > outs && ins ? 'merge' : 'split';
      var incoming = links.filter(function (l) { return l.target === id; });
      var outgoing = links.filter(function (l) { return l.source === id; });
      var source = node.name_en || '';
      var target = node.name_en || '';
      var share = 0;
      if (nodeKind === 'merge' && incoming.length) {
        var mainIn = incoming.reduce(function (a, b) { return b.value > a.value ? b : a; });
        source = (nodes[mainIn.source] || {}).name_en || mainIn.source;
        target = node.name_en || '';
        share = Math.max(ins, outs) / rootTotal * 100;
      } else if (outgoing.length) {
        var mainOut = outgoing.reduce(function (a, b) { return b.value > a.value ? b : a; });
        source = node.name_en || '';
        target = (nodes[mainOut.target] || {}).name_en || mainOut.target;
        share = mainOut.value / (outs || 1) * 100;
      }
      out[mark] = make(nodeKind, mark, {
        subject: view.subject || '',
        source: source,
        target: target,
        category: node.name_en || '',
        value: fmtValue(Math.max(ins, outs), unit),
        share: fmtValue(share, { kind: 'percent', decimals: 0 }),
        pct: DV.roundFixed(share, 0),
        period: view.period_label || '',
        unit: unit.short || ''
      });
    });
    return out;
  }

  // ---------------------------------------------------------------- slope
  function computeSlope(view) {
    var unit = view.unit || {};
    var entities = view.entities;
    var periods = view.periods;
    var out = {};
    var ranks = periods.map(function (_, pi) {
      var order = entities.map(function (_, ei) { return ei; }).sort(function (a, b) {
        return entities[b].values[pi] - entities[a].values[pi];
      });
      var rank = {};
      order.forEach(function (ei, r) { rank[ei] = r + 1; });
      return rank;
    });
    entities.forEach(function (entity, ei) {
      var a = entity.values[0];
      var b = entity.values[entity.values.length - 1];
      var mark = 'line:' + entity.id;
      var kind = ranks[0][ei] === ranks[ranks.length - 1][ei] ? 'stable_rank'
        : ranks[ranks.length - 1][ei] < ranks[0][ei] ? 'rank_up' : 'rank_down';
      if (kind === 'rank_up' && ranks[0][ei] - ranks[ranks.length - 1][ei] >= 2) kind = 'overtake';
      var slots = {
        subject: view.subject || '',
        entity: entity.name_en || '',
        category: entity.name_en || '',
        from: fmtValue(a, unit),
        to: fmtValue(b, unit),
        from_period: (periods[0] || {}).label_en || '',
        to_period: (periods[periods.length - 1] || {}).label_en || '',
        period: ((periods[0] || {}).label_en || '') + ' to '
          + ((periods[periods.length - 1] || {}).label_en || ''),
        pct: pctText(a, b),
        pp: ppText(b - a, unit),
        delta: fmtDelta(b - a, unit),
        rank: String(ranks[ranks.length - 1][ei]),
        rank_before: String(ranks[0][ei]),
        gap: String(Math.abs(ranks[0][ei] - ranks[ranks.length - 1][ei]))
      };
      out[mark] = make(kind, mark, slots);
      periods.forEach(function (period, pi) {
        var pm = 'pt:' + entity.id + ':' + pi;
        var ps = Object.assign({}, slots);
        ps.value = fmtValue(entity.values[pi], unit);
        ps.period = period.label_en || '';
        ps.rank = String(ranks[pi][ei]);
        out[pm] = make('point', pm, ps);
      });
    });
    return out;
  }

  // ---------------------------------------------------------------- waterfall
  function computeWaterfall(view) {
    var unit = view.unit || {};
    var steps = view.steps;
    var start = Number(view.start_value || 0);
    var end = start + steps.reduce(function (s, step) { return s + step.value; }, 0);
    var largest = 0;
    steps.forEach(function (step, i) {
      if (Math.abs(step.value) > Math.abs(steps[largest].value)) largest = i;
    });
    var pos = steps.reduce(function (s, step) { return s + (step.value > 0 ? step.value : 0); }, 0);
    var neg = steps.reduce(function (s, step) { return s + (step.value < 0 ? -step.value : 0); }, 0);
    var out = {};
    steps.forEach(function (step, i) {
      var mark = 'step:' + step.id;
      var kind = i === largest ? 'largest_step'
        : step.value > 0 ? 'increase_contributor' : 'decrease_contributor';
      if (i === largest && neg && pos && neg / pos >= 0.5 && step.value > 0) kind = 'offset';
      out[mark] = make(kind, mark, {
        subject: view.subject || '',
        category: step.name_en || '',
        value: fmtValue(Math.abs(step.value), unit),
        signed: (step.value > 0 ? '+' : '-') + fmtValue(Math.abs(step.value), unit),
        start: fmtValue(start, unit),
        end: fmtValue(end, unit),
        pct: pctText(start, end),
        pp: ppText(end - start, unit),
        period: view.period_label || '',
        unit: unit.short || ''
      });
    });
    [
      ['total:start', start, (view.start || {}).name_en || 'Start'],
      ['total:end', end, (view.end || {}).name_en || 'End']
    ].forEach(function (item) {
      out[item[0]] = make('net_change', item[0], {
        subject: view.subject || '',
        category: item[2],
        value: fmtValue(item[1], unit),
        start: fmtValue(start, unit),
        end: fmtValue(end, unit),
        pct: pctText(start, end),
        pp: ppText(end - start, unit),
        period: view.period_label || '',
        unit: unit.short || ''
      });
    });
    return out;
  }

  var COMPUTERS = {
    line: computeLine,
    bar: computeBar,
    pie: computePie,
    scatter: computeScatter,
    stacked: computeStacked,
    heatmap: computeHeatmap,
    sankey: computeSankey,
    slope: computeSlope,
    waterfall: computeWaterfall
  };

  DV.compute = {
    view: function (view) {
      var fn = COMPUTERS[view && view.type];
      return fn ? fn(view) : {};
    },
    fmtValue: fmtValue,
    fmtAxis: fmtAxis,
    fmtDelta: fmtDelta,
    pctText: pctText,
    ppText: ppText,
    classifyChange: classifyChange,
    changeSlots: changeSlots,
    label: label
  };

  // Flatten a shipped view + its (possibly edited) data into the shape the
  // feature engine and renderers read.
  DV.liveView = function (shipped, data) {
    var view = {};
    Object.keys(shipped).forEach(function (key) { view[key] = shipped[key]; });
    view.data = data;
    Object.keys(data || {}).forEach(function (key) { view[key] = data[key]; });
    return view;
  };

  DV.clone = function (value) {
    return JSON.parse(JSON.stringify(value));
  };

  DV.featureIndex = function (features) {
    var index = {};
    var list = Array.isArray(features)
      ? features
      : Object.keys(features || {}).map(function (key) { return features[key]; });
    list.forEach(function (feature) {
      (feature.marks || []).forEach(function (mark) { index[mark] = feature; });
    });
    return index;
  };
})(window.DV);
