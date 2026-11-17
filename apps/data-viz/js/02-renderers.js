/* SVG renderers. Each returns { marks, setSelected, table }.
 * Every clickable mark carries data-mark and calls api.select(id). */
(function (DV) {
  'use strict';

  var W = 720;
  var H = 360;

  function frame(host, height, roleLabel) {
    var h = height || H;
    var svg = DV.svg('svg', {
      class: 'dv-chart',
      viewBox: '0 0 ' + W + ' ' + h,
      role: 'group',
      'aria-roledescription': '图表',
      'aria-label': roleLabel || ''
    }, host);
    return { svg: svg, H: h, pad: { top: 22, right: 26, bottom: 46, left: 58 } };
  }

  function plot(box) {
    return {
      x: box.pad.left,
      y: box.pad.top,
      w: W - box.pad.left - box.pad.right,
      h: box.H - box.pad.top - box.pad.bottom
    };
  }

  function makeMark(node, id, label, api, cls) {
    node.setAttribute('data-mark', id);
    node.setAttribute('tabindex', '-1');
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', label);
    var base = node.getAttribute('class') || '';
    node.setAttribute('class', (base + ' ' + (cls || '') + ' dv-mark').trim());
    node.addEventListener('click', function (event) {
      event.stopPropagation();
      api.select(id);
    });
    node.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        api.select(id);
      }
    });
    node.addEventListener('pointerenter', function (event) { api.hover(id, event); });
    node.addEventListener('pointerleave', function () { api.hover(null); });
    node.addEventListener('focus', function (event) { api.hover(id, event); });
    node.addEventListener('blur', function () { api.hover(null); });
    return node;
  }

  function roving(nodes) {
    if (!nodes.length) return;
    nodes[0].setAttribute('tabindex', '0');
    nodes.forEach(function (node, index) {
      node.addEventListener('keydown', function (event) {
        var next = null;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = index + 1;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = index - 1;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = nodes.length - 1;
        if (next == null) return;
        event.preventDefault();
        next = Math.max(0, Math.min(nodes.length - 1, next));
        nodes.forEach(function (n) { n.setAttribute('tabindex', '-1'); });
        nodes[next].setAttribute('tabindex', '0');
        nodes[next].focus();
      });
    });
  }

  function axes(box, values, unit, xLabels, opts) {
    var p = plot(box);
    var domain = opts || {};
    var min = domain.min != null ? domain.min : 0;
    var max = domain.max != null ? domain.max : 1;
    var y = DV.linear([min, max], [p.y + p.h, p.y]);
    var g = DV.svg('g', { class: 'dv-grid' }, box.svg);
    DV.ticks(min, max, 4).forEach(function (tick) {
      var ty = y(tick);
      DV.svg('line', { x1: p.x, x2: p.x + p.w, y1: ty, y2: ty, class: 'dv-gridline' }, g);
      DV.text(box.svg, {
        x: p.x - 10, y: ty + 4, 'text-anchor': 'end', class: 'dv-tick'
      }, DV.fmtAxis(tick, unit));
    });
    if (xLabels) {
      var step = Math.max(1, Math.ceil(xLabels.length / 8));
      xLabels.forEach(function (label, i) {
        if (i % step) return;
        DV.text(box.svg, {
          x: p.x + (i + 0.5) * p.w / xLabels.length,
          y: p.y + p.h + 22,
          'text-anchor': 'middle',
          class: 'dv-tick'
        }, label);
      });
    }
    if (unit && unit.short) {
      DV.text(box.svg, {
        x: p.x - 10, y: p.y - 8, 'text-anchor': 'end', class: 'dv-unit'
      }, unit.short);
    }
    return y;
  }

  function roundedTop(x, y, w, h, r) {
    r = Math.min(r, w / 2, Math.abs(h));
    if (h <= 0) return '';
    return 'M' + x + ',' + (y + h) + 'L' + x + ',' + (y + r) +
      'Q' + x + ',' + y + ' ' + (x + r) + ',' + y +
      'L' + (x + w - r) + ',' + y + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) +
      'L' + (x + w) + ',' + (y + h) + 'Z';
  }

  function roundedBottom(x, y, w, h, r) {
    r = Math.min(r, w / 2, Math.abs(h));
    if (h >= 0) return '';
    h = -h;
    return 'M' + x + ',' + y + 'L' + x + ',' + (y + h - r) +
      'Q' + x + ',' + (y + h) + ' ' + (x + r) + ',' + (y + h) +
      'L' + (x + w - r) + ',' + (y + h) + 'Q' + (x + w) + ',' + (y + h) + ' ' + (x + w) + ',' + (y + h - r) +
      'L' + (x + w) + ',' + y + 'Z';
  }

  function arcPath(cx, cy, r0, r1, a0, a1) {
    var large = a1 - a0 > Math.PI ? 1 : 0;
    var x0 = cx + r1 * Math.cos(a0), y0 = cy + r1 * Math.sin(a0);
    var x1 = cx + r1 * Math.cos(a1), y1 = cy + r1 * Math.sin(a1);
    var x2 = cx + r0 * Math.cos(a1), y2 = cy + r0 * Math.sin(a1);
    var x3 = cx + r0 * Math.cos(a0), y3 = cy + r0 * Math.sin(a0);
    return 'M' + x0 + ' ' + y0 + 'A' + r1 + ' ' + r1 + ' 0 ' + large + ' 1 ' + x1 + ' ' + y1 +
      'L' + x2 + ' ' + y2 + 'A' + r0 + ' ' + r0 + ' 0 ' + large + ' 0 ' + x3 + ' ' + y3 + 'Z';
  }

  function finish(box, nodes) {
    var seen = {};
    var focusable = nodes.filter(function (node) {
      var id = node.getAttribute('data-mark');
      if (seen[id]) return false;
      seen[id] = true;
      return true;
    });
    roving(focusable);
    return {
      setSelected: function (mark) {
        box.svg.classList.toggle('has-selection', !!mark);
        nodes.forEach(function (node) {
          node.classList.toggle('is-selected', node.getAttribute('data-mark') === mark);
        });
      }
    };
  }

  function seriesClass(slot) { return DV.slotClass(slot); }

  // ---------------------------------------------------------------- line
  DV.renderers.line = function (host, view, api) {
    var box = frame(host, H, view.subject);
    var p = plot(box);
    var d = view.data;
    var n = d.x.values.length;
    var all = [];
    d.series.forEach(function (s) { all = all.concat(s.values); });
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    var span = hi - lo || 1;
    var min = Math.max(0, lo - span * 0.15);
    var max = hi + span * 0.15;
    var y = axes(box, d.series[0].values, view.unit, d.x.values, { min: min, max: max });
    var nodes = [];
    var xOf = function (i) { return p.x + (i + 0.5) * p.w / n; };

    d.series.forEach(function (s) {
      var slot = s.slot || 1;
      for (var i = 0; i < n - 1; i++) {
        var hit = DV.svg('line', {
          x1: xOf(i), y1: y(s.values[i]), x2: xOf(i + 1), y2: y(s.values[i + 1]),
          stroke: 'transparent', 'stroke-width': 26, 'stroke-linecap': 'round',
          class: 'dv-seg-hit ' + seriesClass(slot)
        }, box.svg);
        makeMark(hit, 'seg:' + s.id + ':' + i,
          s.name_en + ', ' + d.x.values[i] + ' to ' + d.x.values[i + 1], api);
        nodes.push(hit);
      }
      var path = DV.svg('path', {
        d: s.values.map(function (v, i) {
          return (i ? 'L' : 'M') + xOf(i).toFixed(2) + ' ' + y(v).toFixed(2);
        }).join(' '),
        fill: 'none',
        class: 'dv-line ' + seriesClass(slot)
      }, box.svg);
      s.values.forEach(function (v, i) {
        var dot = DV.svg('circle', {
          cx: xOf(i), cy: y(v), r: 4.5,
          class: 'dv-dot ' + seriesClass(slot)
        }, box.svg);
        makeMark(dot, 'pt:' + s.id + ':' + i,
          s.name_en + ', ' + d.x.values[i] + ': ' + DV.fmtValue(v, view.unit), api);
        nodes.push(dot);
      });
      var last = s.values.length - 1;
      DV.text(box.svg, {
        x: xOf(last) + 10, y: y(s.values[last]) - 8, class: 'dv-label'
      }, DV.fmtAxis(s.values[last], view.unit) + (view.unit.short === '%' ? '%' : ''));
    });
    var out = finish(box, nodes);
    out.table = function () {
      return {
        head: [d.x.label_en || 'Period'].concat(d.series.map(function (s) { return s.name_en; })),
        rows: d.x.values.map(function (label, i) {
          return [label].concat(d.series.map(function (s) { return DV.fmtValue(s.values[i], view.unit); }));
        })
      };
    };
    return out;
  };

  // ---------------------------------------------------------------- bar
  DV.renderers.bar = function (host, view, api) {
    var box = frame(host, H, view.subject);
    var p = plot(box);
    var d = view.data;
    var n = d.x.values.length;
    var all = [];
    d.series.forEach(function (s) { all = all.concat(s.values); });
    var lo = Math.min(0, Math.min.apply(null, all));
    var hi = Math.max(0, Math.max.apply(null, all));
    var pad = (hi - lo) * 0.12 || 1;
    var y = axes(box, d.series[0].values, view.unit, d.x.values, { min: lo - pad, max: hi + pad });
    if (lo < 0) {
      DV.svg('line', { x1: p.x, x2: p.x + p.w, y1: y(0), y2: y(0), class: 'dv-baseline' }, box.svg);
    }
    var nodes = [];
    var band = p.w / n;
    var count = d.series.length;
    var bw = Math.min(24, (band * 0.68) / count);
    d.series.forEach(function (s, si) {
      s.values.forEach(function (v, i) {
        var x = p.x + i * band + band / 2 - (count * bw) / 2 + si * bw;
        var zero = y(0);
        var top = y(v);
        var h = top - zero;
        var path = DV.svg('path', {
          d: h >= 0 ? roundedTop(x, top, bw - 2, h, 4) : roundedBottom(x, zero, bw - 2, h, 4),
          class: 'dv-bar ' + seriesClass(s.slot || 1)
        }, box.svg);
        makeMark(path, 'bar:' + s.id + ':' + i,
          s.name_en + ', ' + d.x.values[i] + ': ' + DV.fmtValue(v, view.unit), api);
        nodes.push(path);
        var hit = DV.svg('rect', {
          x: x - 2, y: Math.min(top, zero) - 12, width: bw + 2,
          height: Math.max(24, Math.abs(h) + 24), fill: 'transparent',
          class: 'dv-mark'
        }, box.svg);
        makeMark(hit, 'bar:' + s.id + ':' + i,
          s.name_en + ', ' + d.x.values[i] + ': ' + DV.fmtValue(v, view.unit), api);
        nodes.push(hit);
      });
    });
    var out = finish(box, nodes);
    out.table = function () {
      return {
        head: [d.x.label_en || 'Category'].concat(d.series.map(function (s) { return s.name_en; })),
        rows: d.x.values.map(function (label, i) {
          return [label].concat(d.series.map(function (s) { return DV.fmtValue(s.values[i], view.unit); }));
        })
      };
    };
    return out;
  };

  // ---------------------------------------------------------------- pie
  DV.renderers.pie = function (host, view, api) {
    var box = frame(host, 340, view.subject);
    var cx = W / 2, cy = 172, r1 = 128, r0 = 68;
    var parts = view.data.parts;
    var total = parts.reduce(function (sum, part) { return sum + part.value; }, 0) || 1;
    var nodes = [];
    var angle = -Math.PI / 2;
    parts.forEach(function (part) {
      var a0 = angle;
      var a1 = angle + part.value / total * Math.PI * 2;
      angle = a1;
      var path = DV.svg('path', {
        d: arcPath(cx, cy, r0, r1, a0 + 0.012, a1 - 0.012),
        class: 'dv-slice ' + seriesClass(part.slot || 1)
      }, box.svg);
      makeMark(path, 'slice:' + part.id,
        part.name_en + ': ' + DV.fmtValue(part.value, view.unit), api);
      nodes.push(path);
      var mid = (a0 + a1) / 2;
      if (part.value / total >= 0.08) {
        DV.text(box.svg, {
          x: cx + (r0 + r1) / 2 * Math.cos(mid),
          y: cy + (r0 + r1) / 2 * Math.sin(mid) + 4,
          'text-anchor': 'middle',
          class: 'dv-slice-label'
        }, Math.round(part.value / total * 100) + '%');
      }
    });
    var out = finish(box, nodes);
    out.table = function () {
      return {
        head: ['Category', 'Share'],
        rows: parts.map(function (part) {
          return [part.name_en, DV.fmtValue(part.value / total * 100, view.unit)];
        })
      };
    };
    return out;
  };

  // ---------------------------------------------------------------- scatter
  DV.renderers.scatter = function (host, view, api) {
    var box = frame(host, H, view.subject);
    var p = plot(box);
    var d = view.data;
    var xs = d.points.map(function (pt) { return pt.x; });
    var ys = d.points.map(function (pt) { return pt.y; });
    var xmin = Math.min.apply(null, xs), xmax = Math.max.apply(null, xs);
    var ymin = Math.min.apply(null, ys), ymax = Math.max.apply(null, ys);
    var xpad = (xmax - xmin) * 0.06 || 1, ypad = (ymax - ymin) * 0.08 || 1;
    var sx = DV.linear([xmin - xpad, xmax + xpad], [p.x, p.x + p.w]);
    var sy = DV.linear([ymin - ypad, ymax + ypad], [p.y + p.h, p.y]);
    var g = DV.svg('g', { class: 'dv-grid' }, box.svg);
    DV.ticks(xmin, xmax, 5).forEach(function (t) {
      DV.text(box.svg, { x: sx(t), y: p.y + p.h + 22, 'text-anchor': 'middle', class: 'dv-tick' },
        DV.fmtAxis(t, { decimals: 0 }));
    });
    DV.ticks(ymin, ymax, 4).forEach(function (t) {
      DV.svg('line', { x1: p.x, x2: p.x + p.w, y1: sy(t), y2: sy(t), class: 'dv-gridline' }, g);
      DV.text(box.svg, { x: p.x - 10, y: sy(t) + 4, 'text-anchor': 'end', class: 'dv-tick' },
        DV.fmtAxis(t, { decimals: 0 }));
    });
    DV.text(box.svg, { x: p.x + p.w, y: p.y + p.h + 40, 'text-anchor': 'end', class: 'dv-unit' },
      d.x.label_en || '');
    DV.text(box.svg, { x: p.x, y: p.y - 8, class: 'dv-unit' }, d.y.label_en || '');
    var groups = {};
    (d.groups || []).forEach(function (grp) { groups[grp.id] = grp; });
    var nodes = [];
    d.points.forEach(function (pt) {
      var grp = groups[pt.group] || {};
      var dot = DV.svg('circle', {
        cx: sx(pt.x), cy: sy(pt.y), r: 5,
        class: 'dv-dot ' + seriesClass(grp.slot || 1)
      }, box.svg);
      makeMark(dot, 'pt:' + pt.id,
        (grp.name_en ? grp.name_en + ', ' : '') + pt.x + ', ' + pt.y, api);
      nodes.push(dot);
      var hit = DV.svg('circle', {
        cx: sx(pt.x), cy: sy(pt.y), r: 13, fill: 'transparent', class: 'dv-mark'
      }, box.svg);
      makeMark(hit, 'pt:' + pt.id,
        (grp.name_en ? grp.name_en + ', ' : '') + pt.x + ', ' + pt.y, api);
      nodes.push(hit);
    });
    var out = finish(box, nodes);
    out.table = function () {
      return {
        head: ['Group', d.x.label_en || 'X', d.y.label_en || 'Y'],
        rows: d.points.map(function (pt) {
          return [(groups[pt.group] || {}).name_en || pt.group || '—',
            String(pt.x), String(pt.y)];
        })
      };
    };
    return out;
  };

  // ---------------------------------------------------------------- stacked
  DV.renderers.stacked = function (host, view, api) {
    var box = frame(host, H, view.subject);
    var p = plot(box);
    var d = view.data;
    var n = d.x.values.length;
    var totals = d.x.values.map(function (_, i) {
      return d.series.reduce(function (sum, s) { return sum + s.values[i]; }, 0);
    });
    var max = d.mode === 'percent' ? 100 : Math.max.apply(null, totals) * 1.1;
    var y = axes(box, totals, view.unit,
      d.x.values, { min: 0, max: max || 1 });
    var nodes = [];
    var band = p.w / n;
    var bw = Math.min(56, band * 0.62);
    d.x.values.forEach(function (label, i) {
      var x = p.x + i * band + (band - bw) / 2;
      var base = 0;
      var stack = DV.svg('rect', {
        x: x, y: p.y, width: bw, height: p.h, fill: 'transparent', class: 'dv-mark'
      }, box.svg);
      makeMark(stack, 'stack:' + i, label + ', total', api);
      nodes.push(stack);
      d.series.forEach(function (s) {
        var value = s.values[i];
        var h = (value / (max || 1)) * p.h;
        var yy = p.y + p.h - (base + value) / (max || 1) * p.h;
        var seg = DV.svg('rect', {
          x: x, y: yy + 1, width: bw, height: Math.max(0, h - 2),
          class: 'dv-bar ' + seriesClass(s.slot || 1)
        }, box.svg);
        makeMark(seg, 'seg:' + i + ':' + s.id,
          s.name_en + ', ' + label + ': ' + DV.fmtValue(value, view.unit), api);
        nodes.push(seg);
        base += value;
      });
    });
    var out = finish(box, nodes);
    out.table = function () {
      return {
        head: [d.x.label_en || 'Category'].concat(d.series.map(function (s) { return s.name_en; })),
        rows: d.x.values.map(function (label, i) {
          return [label].concat(d.series.map(function (s) { return DV.fmtValue(s.values[i], view.unit); }));
        })
      };
    };
    return out;
  };

  // ---------------------------------------------------------------- heatmap
  DV.renderers.heatmap = function (host, view, api) {
    var d = view.data;
    var rows = d.rows.length, cols = d.cols.length;
    var left = 108, top = 30, cell = Math.max(34, Math.min(54, 640 / cols));
    var width = left + cols * cell + 24;
    var height = top + rows * cell + 54;
    var svg = DV.svg('svg', {
      class: 'dv-chart dv-chart-wide', viewBox: '0 0 ' + width + ' ' + height,
      role: 'group', 'aria-roledescription': '图表', 'aria-label': view.subject || ''
    }, host);
    host.classList.add('dv-scroll');
    var flat = [];
    d.cells.forEach(function (row) { flat = flat.concat(row); });
    var lo = Math.min.apply(null, flat), hi = Math.max.apply(null, flat);
    var ramp = ['dv-heat-1', 'dv-heat-2', 'dv-heat-3', 'dv-heat-4', 'dv-heat-5'];
    var nodes = [];
    d.rows.forEach(function (row, r) {
      DV.text(svg, { x: left - 10, y: top + r * cell + cell / 2 + 4, 'text-anchor': 'end', class: 'dv-tick' },
        row.name_en);
      var rowHit = DV.svg('rect', { x: 4, y: top + r * cell, width: left - 8, height: cell, fill: 'transparent', class: 'dv-mark' }, svg);
      makeMark(rowHit, 'row:' + row.id, row.name_en + ', row average', api);
      nodes.push(rowHit);
    });
    d.cols.forEach(function (col, c) {
      DV.text(svg, { x: left + c * cell + cell / 2, y: top - 10, 'text-anchor': 'middle', class: 'dv-tick' },
        col.name_en);
      var colHit = DV.svg('rect', { x: left + c * cell, y: 4, width: cell, height: top - 8, fill: 'transparent', class: 'dv-mark' }, svg);
      makeMark(colHit, 'col:' + col.id, col.name_en + ', column average', api);
      nodes.push(colHit);
    });
    d.rows.forEach(function (row, r) {
      d.cols.forEach(function (col, c) {
        var value = d.cells[r][c];
        var t = (value - lo) / ((hi - lo) || 1);
        var bin = Math.min(4, Math.floor(t * 5));
        var rect = DV.svg('rect', {
          x: left + c * cell + 1, y: top + r * cell + 1,
          width: cell - 2, height: cell - 2, rx: 3,
          class: 'dv-cell ' + ramp[bin]
        }, svg);
        makeMark(rect, 'cell:' + row.id + ':' + col.id,
          row.name_en + ', ' + col.name_en + ': ' + DV.fmtValue(value, view.unit), api);
        nodes.push(rect);
      });
    });
    var legendY = top + rows * cell + 22;
    DV.text(svg, { x: left, y: legendY + 4, class: 'dv-unit' }, '低');
    ramp.forEach(function (cls, i) {
      DV.svg('rect', { x: left + 26 + i * 22, y: legendY - 8, width: 20, height: 12, rx: 2, class: 'dv-cell ' + cls }, svg);
    });
    DV.text(svg, { x: left + 26 + 5 * 22 + 4, y: legendY + 4, class: 'dv-unit' }, '高');
    var out = finish({ svg: svg }, nodes);
    out.table = function () {
      var rows2 = [];
      d.rows.forEach(function (row, r) {
        d.cols.forEach(function (col, c) {
          rows2.push([row.name_en, col.name_en, DV.fmtValue(d.cells[r][c], view.unit)]);
        });
      });
      return { head: ['Row', 'Column', 'Value'], rows: rows2 };
    };
    return out;
  };

  // ---------------------------------------------------------------- sankey
  DV.renderers.sankey = function (host, view, api) {
    var d = view.data;
    var W2 = 760, H2 = 380;
    var svg = DV.svg('svg', {
      class: 'dv-chart', viewBox: '0 0 ' + W2 + ' ' + H2,
      role: 'group', 'aria-roledescription': '图表', 'aria-label': view.subject || ''
    }, host);
    var margin = { top: 28, bottom: 28, left: 16, right: 16 };
    var columns = d.columns;
    var ncols = columns.length;
    var colW = (W2 - margin.left - margin.right) / ncols;
    var nodeW = 14;
    var nodesById = {};
    d.nodes.forEach(function (n) { nodesById[n.id] = n; });
    var inTotals = {}, outTotals = {};
    d.links.forEach(function (l) {
      outTotals[l.source] = (outTotals[l.source] || 0) + l.value;
      inTotals[l.target] = (inTotals[l.target] || 0) + l.value;
    });
    var totals = {};
    d.nodes.forEach(function (n) {
      totals[n.id] = Math.max(inTotals[n.id] || 0, outTotals[n.id] || 0);
    });
    var avail = H2 - margin.top - margin.bottom;
    var columnTotals = columns.map(function (col) {
      return col.reduce(function (sum, id) { return sum + totals[id]; }, 0);
    });
    var maxColumn = Math.max.apply(null, columnTotals.concat([1]));
    var scale = avail / maxColumn;
    var positions = {};
    columns.forEach(function (col, ci) {
      var used = col.reduce(function (sum, id) { return sum + totals[id] * scale; }, 0);
      var gap = col.length > 1 ? (avail - used) / (col.length - 1) : 0;
      gap = Math.max(4, Math.min(30, gap));
      var y = margin.top;
      col.forEach(function (id) {
        var h = Math.max(8, totals[id] * scale);
        positions[id] = { x: margin.left + ci * colW + (ci === ncols - 1 ? colW - nodeW : 0),
          y: y, h: h, col: ci };
        y += h + gap;
      });
    });
    function colIndex(id) { return nodesById[id] ? nodesById[id].column : 0; }
    var outNodes = {};
    var nodes = [];
    d.links.forEach(function (link) {
      var s = positions[link.source], t = positions[link.target];
      if (!s || !t) return;
      // Allocate link bands proportionally down each node.
      var taken = outNodes[link.source] || 0;
      var linkH = Math.max(2, link.value * scale);
      var y0 = s.y + taken * scale;
      outNodes[link.source] = taken + link.value;
      var inTaken = outNodes['in:' + link.target] || 0;
      var y1 = t.y + inTaken * scale;
      outNodes['in:' + link.target] = inTaken + link.value;
      var x0 = s.x + nodeW, x1 = t.x;
      var mid = (x0 + x1) / 2;
      var path = DV.svg('path', {
        d: 'M' + x0 + ' ' + y0 + 'C' + mid + ' ' + y0 + ' ' + mid + ' ' + y1 + ' ' + x1 + ' ' + y1 +
          'L' + x1 + ' ' + (y1 + linkH) + 'C' + mid + ' ' + (y1 + linkH) + ' ' + mid + ' ' + (y0 + linkH) + ' ' + x0 + ' ' + (y0 + linkH) + 'Z',
        class: 'dv-link ' + seriesClass((nodesById[link.source] || {}).slot || 1)
      }, svg);
      makeMark(path, 'link:' + link.source + '->' + link.target,
        (nodesById[link.source] || {}).name_en + ' → ' + (nodesById[link.target] || {}).name_en +
        ': ' + DV.fmtValue(link.value, view.unit), api);
      nodes.push(path);
    });
    d.nodes.forEach(function (n) {
      var pos = positions[n.id];
      if (!pos) return;
      var rect = DV.svg('rect', {
        x: pos.x, y: pos.y, width: nodeW, height: pos.h, rx: 3,
        class: 'dv-node ' + seriesClass(n.slot || 1)
      }, svg);
      makeMark(rect, 'node:' + n.id, n.name_en + ', ' + DV.fmtValue(totals[n.id] || 0, view.unit), api);
      nodes.push(rect);
      var labelX = pos.col === ncols - 1 ? pos.x - 8 : pos.x + nodeW + 8;
      DV.text(svg, {
        x: labelX, y: pos.y + Math.min(pos.h / 2 + 4, 20),
        'text-anchor': pos.col === ncols - 1 ? 'end' : 'start', class: 'dv-label'
      }, n.name_en);
    });
    var out = finish({ svg: svg }, nodes);
    out.table = function () {
      return {
        head: ['From', 'To', 'Value'],
        rows: d.links.map(function (l) {
          return [(nodesById[l.source] || {}).name_en, (nodesById[l.target] || {}).name_en,
            DV.fmtValue(l.value, view.unit)];
        })
      };
    };
    return out;
  };

  // ---------------------------------------------------------------- slope
  DV.renderers.slope = function (host, view, api) {
    var box = frame(host, H, view.subject);
    var p = plot(box);
    var d = view.data;
    var n = d.entities.length;
    var nPeriods = d.periods.length;
    var xAt = function (i) {
      if (nPeriods <= 1) return p.x + p.w / 2;
      return p.x + 76 + i * (p.w - 152) / (nPeriods - 1);
    };
    var ranks = d.periods.map(function (_, pi) {
      return d.entities.map(function (_, ei) { return ei; })
        .sort(function (a, b) { return d.entities[b].values[pi] - d.entities[a].values[pi]; });
    });
    var rankOf = function (pi, ei) { return ranks[pi].indexOf(ei); };
    var yAt = function (pi, ei) { return p.y + (rankOf(pi, ei) + 0.5) * p.h / n; };
    var nodes = [];
    d.entities.forEach(function (entity, ei) {
      var last = nPeriods - 1;
      var path = DV.svg('line', {
        x1: xAt(0), y1: yAt(0, ei),
        x2: xAt(last), y2: yAt(last, ei),
        class: 'dv-line dv-slope-line ' + seriesClass(entity.slot || 1)
      }, box.svg);
      makeMark(path, 'line:' + entity.id,
        entity.name_en + ': ' + DV.fmtValue(entity.values[0], view.unit) + ' → ' +
        DV.fmtValue(entity.values[last], view.unit), api);
      nodes.push(path);
      entity.values.forEach(function (value, pi) {
        var dot = DV.svg('circle', {
          cx: xAt(pi), cy: yAt(pi, ei), r: 5,
          class: 'dv-dot ' + seriesClass(entity.slot || 1)
        }, box.svg);
        makeMark(dot, 'pt:' + entity.id + ':' + pi,
          entity.name_en + ', ' + d.periods[pi].label_en + ': ' + DV.fmtValue(value, view.unit), api);
        nodes.push(dot);
      });
      DV.text(box.svg, {
        x: xAt(0) - 14, y: yAt(0, ei) + 4, 'text-anchor': 'end', class: 'dv-label'
      }, entity.name_en);
      DV.text(box.svg, {
        x: xAt(last) + 14, y: yAt(last, ei) + 4, class: 'dv-label'
      }, entity.name_en);
    });
    d.periods.forEach(function (period, pi) {
      DV.text(box.svg, { x: xAt(pi), y: p.y + p.h + 26, 'text-anchor': 'middle', class: 'dv-tick' }, period.label_en);
    });
    var out = finish(box, nodes);
    out.table = function () {
      return {
        head: ['Item'].concat(d.periods.map(function (per) { return per.label_en; })),
        rows: d.entities.map(function (e) {
          return [e.name_en].concat(e.values.map(function (v) { return DV.fmtValue(v, view.unit); }));
        })
      };
    };
    return out;
  };

  // ---------------------------------------------------------------- waterfall
  DV.renderers.waterfall = function (host, view, api) {
    var box = frame(host, H, view.subject);
    var p = plot(box);
    var d = view.data;
    var start = Number(d.start_value || 0);
    var running = start;
    var points = [start];
    d.steps.forEach(function (step) { running += step.value; points.push(running); });
    var lo = Math.min(0, Math.min.apply(null, points));
    var hi = Math.max(0, Math.max.apply(null, points));
    var pad = (hi - lo) * 0.15 || 1;
    var y = axes(box, points, view.unit, null, { min: lo - pad, max: hi + pad });
    var nodes = [];
    var count = d.steps.length + 2;
    var band = p.w / count;
    var bw = Math.min(46, band * 0.62);
    function bar(i, label, value, base, kind, markId) {
      var x = p.x + i * band + (band - bw) / 2;
      var top = y(value), bottom = y(base);
      var path = DV.svg('path', {
        d: top <= bottom ? roundedTop(x, top, bw, bottom - top, 4) : roundedBottom(x, bottom, bw, bottom - top, 4),
        class: 'dv-bar ' + (kind === 'up' ? 'dv-pos' : kind === 'down' ? 'dv-neg' : 'dv-total')
      }, box.svg);
      makeMark(path, markId, label + ': ' + DV.fmtValue(value, view.unit), api);
      nodes.push(path);
      DV.text(box.svg, {
        x: x + bw / 2, y: Math.min(top, bottom) - 7, 'text-anchor': 'middle', class: 'dv-label'
      }, label);
      return { x: x, y: Math.min(top, bottom), w: bw };
    }
    var startBar = bar(0, d.start ? d.start.name_en : 'Start', start, 0, 'total', 'total:start');
    var prev = startBar;
    d.steps.forEach(function (step, si) {
      var base = running;
      running += step.value;
      var b = bar(si + 1, (step.value > 0 ? '+' : '−') + DV.fmtAxis(Math.abs(step.value), { decimals: 0 }),
        running, base, step.value > 0 ? 'up' : 'down', 'step:' + step.id);
      DV.svg('line', {
        x1: prev.x + prev.w, x2: b.x, y1: y(base), y2: y(base), class: 'dv-connector'
      }, box.svg);
      prev = b;
    });
    var endBar = bar(count - 1, d.end ? d.end.name_en : 'End', running, 0, 'total', 'total:end');
    DV.svg('line', { x1: prev.x + prev.w, x2: endBar.x, y1: y(running), y2: y(running), class: 'dv-connector' }, box.svg);
    var out = finish(box, nodes);
    out.table = function () {
      var rows = [[d.start ? d.start.name_en : 'Start', DV.fmtValue(start, view.unit), DV.fmtValue(start, view.unit)]];
      var total = start;
      d.steps.forEach(function (step) {
        total += step.value;
        rows.push([step.name_en, (step.value > 0 ? '+' : '−') + DV.fmtValue(Math.abs(step.value), view.unit),
          DV.fmtValue(total, view.unit)]);
      });
      rows.push([d.end ? d.end.name_en : 'End', '', DV.fmtValue(total, view.unit)]);
      return { head: ['Step', 'Change', 'Running total'], rows: rows };
    };
    return out;
  };
})(window.DV);
