/* Chart renderers. Each renderer builds its DOM once in mount(), then update()
 * redraws it from the live dataset. Edits mutate the dataset and call
 * ctx.changed(); the app then re-describes every chart that shares it.
 *
 * Renderer contract:
 *   NC.renderers[kind](host, ctx) -> { update() }
 *   ctx.data()    the live dataset object for this chart
 *   ctx.changed() a value was edited
 *
 * Marks: every element that a sentence can point at carries data-mark.
 */
(function (NC) {
  'use strict';

  var W = 480;
  var H = 300;
  var TOP = 18;
  var BOTTOM = H - 42;
  var LEFT = 44;
  var RIGHT = W - 14;

  function svgRoot(host, label, width, height) {
    var svg = NC.svg('svg', {
      viewBox: '0 0 ' + width + ' ' + height,
      class: 'chart',
      role: 'group',
      'aria-label': label,
      lang: 'en'
    }, host);
    return svg;
  }

  // Y axis with gridlines (left side) or labels only (right side).
  function yAxis(svg, scale, opts) {
    var o = opts || {};
    var ticks = NC.ticks(o.min, o.max, 4);
    var decimals = ticks.every(Number.isInteger) ? 0 : 1;
    var grid = NC.svg('g', { class: 'grid' }, svg);
    var labels = NC.svg('g', { class: 'ticks' }, svg);
    ticks.forEach(function (tick) {
      var y = scale(tick);
      if (!o.right) {
        NC.svg('line', { x1: LEFT, x2: RIGHT, y1: y, y2: y }, grid);
      }
      NC.svgText(labels, {
        x: o.right ? RIGHT + 8 : LEFT - 8,
        y: y,
        'text-anchor': o.right ? 'start' : 'end',
        'dominant-baseline': 'middle',
        class: 'tick'
      }, NC.fmt(tick, decimals) + (o.suffix || ''));
    });
  }

  function xLabels(svg, periods, xOf) {
    var group = NC.svg('g', { class: 'ticks' }, svg);
    periods.forEach(function (period, i) {
      NC.svgText(group, {
        x: xOf(i),
        y: BOTTOM + 22,
        'text-anchor': 'middle',
        class: 'tick tick-x'
      }, period.short_en || period.label_en);
    });
  }

  function legend(host, items) {
    var list = NC.el('ul', { class: 'legend' });
    items.forEach(function (item) {
      var li = NC.el('li', { class: 'legend-item' });
      var swatch = NC.el('span', { class: 'swatch ' + (item.color || '') });
      if (item.line) swatch.className += ' swatch-line';
      li.appendChild(swatch);
      li.appendChild(NC.el('span', { class: 'legend-name', lang: 'en' }, NC.escape(item.en)));
      li.appendChild(NC.el('span', { class: 'legend-zh' }, NC.escape(item.zh)));
      list.appendChild(li);
    });
    host.appendChild(list);
  }

  // A point is "grabbed" on pointerdown and follows the pointer; the same
  // handler also serves the keyboard through nudgeKeys.
  function markAria(node, label, min, max, now, text) {
    node.setAttribute('tabindex', '0');
    node.setAttribute('role', 'slider');
    node.setAttribute('aria-label', label);
    node.setAttribute('aria-valuemin', String(min));
    node.setAttribute('aria-valuemax', String(max));
    node.setAttribute('aria-valuenow', String(now));
    node.setAttribute('aria-valuetext', text);
  }

  // ---- line ------------------------------------------------------------

  NC.renderers.line = function (host, ctx) {
    var first = ctx.data();
    var n = first.values.length;
    var svg = svgRoot(host, 'Line graph', W, H);
    var scaleY = NC.linear([first.min, first.max], [BOTTOM, TOP]);
    var xOf = function (i) { return LEFT + (i + 0.5) * (RIGHT - LEFT) / n; };
    yAxis(svg, scaleY, { min: first.min, max: first.max });
    xLabels(svg, first.periods, xOf);

    var path = NC.svg('path', { class: 'series-line series-1', fill: 'none' }, svg);
    var points = NC.svg('g', { class: 'points series-1' }, svg);
    var nodes = [];
    for (var i = 0; i < n; i += 1) {
      var g = NC.svg('g', { class: 'point', 'data-mark': 'p:' + i }, points);
      var hit = NC.svg('circle', { class: 'hit', r: 18, fill: 'transparent' }, g);
      var dot = NC.svg('circle', { class: 'dot', r: 5.5 }, g);
      var val = NC.svgText(g, { class: 'val', 'text-anchor': 'middle' }, '');
      nodes.push({ g: g, hit: hit, dot: dot, val: val, index: i });
    }

    function update() {
      var d = ctx.data();
      var dec = d.decimals || 0;
      var coords = d.values.map(function (v, i) { return [xOf(i), scaleY(v)]; });
      path.setAttribute('d', coords.map(function (c, i) {
        return (i ? 'L' : 'M') + c[0].toFixed(2) + ' ' + c[1].toFixed(2);
      }).join(' '));
      nodes.forEach(function (node, i) {
        var x = coords[i][0];
        var y = coords[i][1];
        node.hit.setAttribute('cx', x);
        node.hit.setAttribute('cy', y);
        node.dot.setAttribute('cx', x);
        node.dot.setAttribute('cy', y);
        node.val.setAttribute('x', x);
        node.val.setAttribute('y', y - 12);
        node.val.textContent = NC.fmt(d.values[i], dec);
        markAria(node.g, d.periods[i].label_en, d.min, d.max, d.values[i],
          NC.fmt(d.values[i], dec) + ' ' + d.unit_en);
      });
    }

    nodes.forEach(function (node) {
      var set = function (value) {
        var d = ctx.data();
        var next = NC.snap(value, d.step, d.min, d.max);
        if (d.values[node.index] === next) return;
        d.values[node.index] = next;
        update();
        ctx.changed();
      };
      NC.drag(node.g, svg, function (pt) { set(scaleY.invert(pt.y)); });
      NC.nudgeKeys(node.g, function (delta) {
        var d = ctx.data();
        set(d.values[node.index] + delta * d.step);
      });
    });

    update();
    return { update: update };
  };

  // ---- bar (grouped) -------------------------------------------------------

  NC.renderers.bar = function (host, ctx) {
    var first = ctx.data();
    var cats = first.categories.length;
    var series = first.series.length;
    var svg = svgRoot(host, 'Bar chart', W, H);
    var scaleY = NC.linear([first.min, first.max], [BOTTOM, TOP]);
    var group = (RIGHT - LEFT) / cats;
    var pad = group * 0.16;
    var colW = (group - pad * 2) / series;
    var columns = [];

    yAxis(svg, scaleY, { min: first.min, max: first.max });
    xLabels(svg, first.categories, function (c) { return LEFT + (c + 0.5) * group; });

    var bars = NC.svg('g', { class: 'bars' }, svg);
    for (var c = 0; c < cats; c += 1) {
      columns[c] = [];
      for (var s = 0; s < series; s += 1) {
        var x = LEFT + c * group + pad + s * colW;
        var g = NC.svg('g', { class: 'col', 'data-mark': 'b:' + c + ':' + s }, bars);
        var hit = NC.svg('rect', {
          class: 'hit', x: x, y: TOP, width: colW, height: BOTTOM - TOP, fill: 'transparent'
        }, g);
        var rect = NC.svg('rect', {
          class: 'bar ' + first.series[s].color, x: x + colW * 0.12, width: colW * 0.76
        }, g);
        var val = NC.svgText(g, { class: 'val', 'text-anchor': 'middle' }, '');
        columns[c][s] = { g: g, hit: hit, rect: rect, val: val, c: c, s: s };
      }
    }

    function update() {
      var d = ctx.data();
      d.categories.forEach(function (cat, ci) {
        d.series.forEach(function (ser, si) {
          var node = columns[ci][si];
          var v = ser.values[ci];
          var top = scaleY(v);
          node.rect.setAttribute('y', top);
          node.rect.setAttribute('height', Math.max(0, BOTTOM - top));
          node.val.setAttribute('x', LEFT + ci * group + pad + si * colW + colW / 2);
          node.val.setAttribute('y', top - 6);
          node.val.textContent = NC.fmt(v, d.decimals || 0);
          markAria(node.g, cat.label_en + ', ' + ser.name_en, d.min, d.max, v,
            NC.fmt(v) + ' ' + d.unit_en);
        });
      });
    }

    columns.forEach(function (row) {
      row.forEach(function (node) {
        var set = function (value) {
          var d = ctx.data();
          var next = NC.snap(value, d.step, d.min, d.max);
          var ser = d.series[node.s];
          if (ser.values[node.c] === next) return;
          ser.values[node.c] = next;
          update();
          ctx.changed();
        };
        NC.drag(node.g, svg, function (pt) { set(scaleY.invert(pt.y)); });
        NC.nudgeKeys(node.g, function (delta) {
          var d = ctx.data();
          set(d.series[node.s].values[node.c] + delta * d.step);
        });
      });
    });

    legend(host, first.series.map(function (ser) {
      return { en: ser.name_en, zh: ser.name_zh, color: 'chip ' + ser.color };
    }));
    update();
    return { update: update };
  };

  // ---- pie ----------------------------------------------------------------

  NC.renderers.pie = function (host, ctx) {
    var first = ctx.data();
    var n = first.parts.length;
    var CX = 160;
    var CY = 160;
    var R = 128;
    var svg = svgRoot(host, 'Pie chart', 320, 320);
    svg.setAttribute('class', 'chart chart-pie');
    var slices = NC.svg('g', { class: 'slices' }, svg);
    var handles = NC.svg('g', { class: 'handles' }, svg);
    var listHost = NC.el('ul', { class: 'legend' });
    var items = [];

    function pointAt(percent) {
      var angle = percent * 3.6 * Math.PI / 180;
      return { x: CX + R * Math.sin(angle), y: CY - R * Math.cos(angle) };
    }

    function arcPath(startPct, endPct) {
      var a = pointAt(startPct);
      var b = pointAt(endPct);
      var large = endPct - startPct > 50 ? 1 : 0;
      return 'M ' + CX + ' ' + CY + ' L ' + a.x.toFixed(2) + ' ' + a.y.toFixed(2) +
        ' A ' + R + ' ' + R + ' 0 ' + large + ' 1 ' + b.x.toFixed(2) + ' ' + b.y.toFixed(2) + ' Z';
    }

    var paths = [];
    for (var i = 0; i < n; i += 1) {
      paths[i] = NC.svg('path', {
        class: 'slice ' + first.parts[i].color,
        'data-mark': 's:' + i
      }, slices);
    }

    var grabs = [];
    for (var b = 0; b < n - 1; b += 1) {
      var g = NC.svg('g', {
        class: 'handle',
        'data-mark': 's:' + b,
        tabindex: 0,
        role: 'slider',
        'aria-label': first.parts[b].name_en + ' and ' + first.parts[b + 1].name_en
      }, handles);
      var hit = NC.svg('circle', { class: 'hit', r: 22, fill: 'transparent' }, g);
      var dot = NC.svg('circle', { class: 'dot', r: 7 }, g);
      grabs[b] = { g: g, hit: hit, dot: dot, index: b };
    }

    for (var k = 0; k < n; k += 1) {
      var li = NC.el('li', { class: 'legend-item', 'data-mark': 's:' + k });
      li.appendChild(NC.el('span', { class: 'swatch chip ' + first.parts[k].color }));
      li.appendChild(NC.el('span', { class: 'legend-name', lang: 'en' }, NC.escape(first.parts[k].name_en)));
      li.appendChild(NC.el('span', { class: 'legend-zh' }, NC.escape(first.parts[k].name_zh)));
      var value = NC.el('span', { class: 'legend-value' });
      li.appendChild(value);
      listHost.appendChild(li);
      items[k] = value;
    }
    host.appendChild(listHost);

    function cumulative(parts) {
      var total = 0;
      return parts.map(function (p) {
        total += p.value;
        return total;
      });
    }

    function update() {
      var d = ctx.data();
      var cum = cumulative(d.parts);
      var start = 0;
      d.parts.forEach(function (part, idx) {
        paths[idx].setAttribute('d', arcPath(start, cum[idx]));
        start = cum[idx];
        items[idx].textContent = part.value + '%';
      });
      grabs.forEach(function (node) {
        var p = pointAt(cum[node.index]);
        node.hit.setAttribute('cx', p.x);
        node.hit.setAttribute('cy', p.y);
        node.dot.setAttribute('cx', p.x);
        node.dot.setAttribute('cy', p.y);
        markAria(node.g, d.parts[node.index].name_en + ' and ' + d.parts[node.index + 1].name_en,
          d.min_share, 100, cum[node.index], cum[node.index] + '%');
      });
    }

    // Move the boundary after part `index` to `target` (a percent), keeping
    // every part at or above min_share and the total at 100.
    function setBoundary(index, target) {
      var d = ctx.data();
      var cum = cumulative(d.parts);
      var before = index > 0 ? cum[index - 1] : 0;
      var after = cum[index + 1];
      var lo = before + d.min_share;
      var hi = after - d.min_share;
      var next = NC.clamp(Math.round(target), lo, hi);
      if (next === cum[index]) return;
      d.parts[index].value = next - before;
      d.parts[index + 1].value = after - next;
      update();
      ctx.changed();
    }

    grabs.forEach(function (node) {
      NC.drag(node.g, svg, function (pt) {
        var angle = Math.atan2(pt.x - CX, -(pt.y - CY)) * 180 / Math.PI;
        if (angle < 0) angle += 360;
        setBoundary(node.index, angle / 3.6);
      });
      NC.nudgeKeys(node.g, function (delta) {
        var cum = cumulative(ctx.data().parts);
        setBoundary(node.index, cum[node.index] + delta);
      });
    });

    update();
    return { update: update };
  };

  // ---- table ------------------------------------------------------------

  NC.renderers.table = function (host, ctx) {
    var first = ctx.data();
    var wrap = NC.el('div', { class: 'table-wrap' });
    var table = NC.el('table', { class: 'data-table' });
    var inputs = [];

    var head = '<tr><th scope="col"><span class="sr-only">Region</span></th>';
    first.series.forEach(function (ser) {
      head += '<th scope="col"><span lang="en">' + NC.escape(ser.name_en) + '</span>' +
        '<span class="zh">' + NC.escape(ser.name_zh) + '</span></th>';
    });
    head += '<th scope="col" class="total-col"><span lang="en">Total</span><span class="zh">合计</span></th></tr>';
    var body = '';
    first.categories.forEach(function (cat, c) {
      body += '<tr><th scope="row"><span lang="en">' + NC.escape(cat.label_en) + '</span>' +
        '<span class="zh">' + NC.escape(cat.label_zh) + '</span></th>';
      first.series.forEach(function (ser, s) {
        body += '<td data-mark="b:' + c + ':' + s + '"><input type="number" inputmode="decimal"' +
          ' min="' + first.min + '" max="' + first.max + '" step="' + first.step + '"' +
          ' aria-label="' + NC.escape(cat.label_en + ', ' + ser.name_en) + '"></td>';
      });
      body += '<td class="total-col" data-row="' + c + '"></td></tr>';
    });
    var foot = '<tr class="total-row"><th scope="row"><span lang="en">Total</span><span class="zh">合计</span></th>';
    first.series.forEach(function (_ser, s) {
      foot += '<td class="total-col" data-col="' + s + '"></td>';
    });
    foot += '<td class="total-col" data-grand></td></tr>';
    table.innerHTML = '<thead>' + head + '</thead><tbody>' + body + '</tbody><tfoot>' + foot + '</tfoot>';
    wrap.appendChild(table);
    host.appendChild(wrap);

    table.querySelectorAll('td[data-mark] input').forEach(function (input) {
      var td = input.parentNode;
      var parts = td.getAttribute('data-mark').split(':');
      var c = Number(parts[1]);
      var s = Number(parts[2]);
      inputs.push({ input: input, c: c, s: s });
      input.addEventListener('change', function () {
        var d = ctx.data();
        var raw = parseFloat(input.value);
        var next = isFinite(raw) ? NC.snap(raw, d.step, d.min, d.max) : d.series[s].values[c];
        d.series[s].values[c] = next;
        update();
        ctx.changed();
      });
    });

    function update() {
      var d = ctx.data();
      var colSums = d.series.map(function () { return 0; });
      var grand = 0;
      inputs.forEach(function (item) {
        var v = d.series[item.s].values[item.c];
        if (document.activeElement !== item.input) {
          item.input.value = NC.fmt(v, d.decimals || 0).replace(/,/g, '');
        }
        colSums[item.s] += v;
        grand += v;
      });
      d.categories.forEach(function (_cat, c) {
        var rowSum = d.series.reduce(function (t, ser) { return t + ser.values[c]; }, 0);
        var cell = table.querySelector('td[data-row="' + c + '"]');
        if (cell) cell.textContent = NC.fmt(rowSum);
      });
      colSums.forEach(function (value, s) {
        var cell = table.querySelector('td[data-col="' + s + '"]');
        if (cell) cell.textContent = NC.fmt(value);
      });
      var grandCell = table.querySelector('td[data-grand]');
      if (grandCell) grandCell.textContent = NC.fmt(grand);
    }

    update();
    return { update: update };
  };

  // ---- process ----------------------------------------------------------

  NC.renderers.process = function (host, ctx) {
    var first = ctx.data();
    var list = NC.el('ol', { class: 'flow' });
    var rows = [];
    first.steps.forEach(function (step, i) {
      var li = NC.el('li', { class: 'step', 'data-mark': 'st:' + i });
      var text = NC.el('div', { class: 'step-text' });
      text.appendChild(NC.el('p', { class: 'step-en', lang: 'en' }, NC.escape(step.label_en)));
      text.appendChild(NC.el('p', { class: 'step-zh' }, NC.escape(step.label_zh)));
      var time = NC.el('label', { class: 'step-time' });
      var input = NC.el('input', {
        type: 'number', inputmode: 'numeric', min: first.min, max: first.max, step: first.step,
        'aria-label': step.label_en + ' minutes'
      });
      time.appendChild(input);
      time.appendChild(NC.el('span', { class: 'step-unit' }, 'min'));
      var track = NC.el('span', { class: 'step-track' });
      var fill = NC.el('i', { class: 'step-fill' });
      track.appendChild(fill);
      li.appendChild(text);
      li.appendChild(time);
      li.appendChild(track);
      list.appendChild(li);
      rows.push({ input: input, fill: fill, index: i });
    });
    host.appendChild(list);

    function update() {
      var d = ctx.data();
      rows.forEach(function (row) {
        var minutes = d.steps[row.index].minutes;
        if (document.activeElement !== row.input) row.input.value = String(minutes);
        row.fill.style.width = (minutes / d.max * 100).toFixed(2) + '%';
      });
    }

    rows.forEach(function (row) {
      row.input.addEventListener('change', function () {
        var d = ctx.data();
        var raw = parseFloat(row.input.value);
        if (isFinite(raw)) d.steps[row.index].minutes = NC.snap(raw, d.step, d.min, d.max);
        update();
        ctx.changed();
      });
    });

    update();
    return { update: update };
  };

  // ---- combo (bars + line on two axes) ------------------------------------

  NC.renderers.combo = function (host, ctx) {
    var first = ctx.data();
    var n = first.periods.length;
    var svg = svgRoot(host, 'Combo chart', W, H);
    var scaleBar = NC.linear([first.bars.min, first.bars.max], [BOTTOM, TOP]);
    var scaleLine = NC.linear([first.line.min, first.line.max], [BOTTOM, TOP]);
    var xOf = function (i) { return LEFT + (i + 0.5) * (RIGHT - LEFT) / n; };
    var colW = (RIGHT - LEFT) / n * 0.5;

    yAxis(svg, scaleBar, { min: first.bars.min, max: first.bars.max });
    yAxis(svg, scaleLine, { min: first.line.min, max: first.line.max, right: true, suffix: '%' });
    xLabels(svg, first.periods, xOf);

    var bars = NC.svg('g', { class: 'bars' }, svg);
    var cols = [];
    for (var i = 0; i < n; i += 1) {
      var g = NC.svg('g', { class: 'col', 'data-mark': 'bar:' + i }, bars);
      var hit = NC.svg('rect', {
        class: 'hit', x: xOf(i) - colW / 2 - 4, y: TOP, width: colW + 8, height: BOTTOM - TOP, fill: 'transparent'
      }, g);
      var rect = NC.svg('rect', { class: 'bar series-1', x: xOf(i) - colW / 2, width: colW }, g);
      var val = NC.svgText(g, { class: 'val', 'text-anchor': 'middle' }, '');
      cols[i] = { g: g, hit: hit, rect: rect, val: val, index: i };
    }

    var path = NC.svg('path', { class: 'series-line series-2', fill: 'none' }, svg);
    var points = NC.svg('g', { class: 'points series-2' }, svg);
    var nodes = [];
    for (var k = 0; k < n; k += 1) {
      var pg = NC.svg('g', { class: 'point', 'data-mark': 'ln:' + k }, points);
      var phit = NC.svg('circle', { class: 'hit', r: 18, fill: 'transparent' }, pg);
      var pdot = NC.svg('circle', { class: 'dot', r: 5.5 }, pg);
      var pval = NC.svgText(pg, { class: 'val', 'text-anchor': 'middle' }, '');
      nodes[k] = { g: pg, hit: phit, dot: pdot, val: pval, index: k };
    }

    function update() {
      var d = ctx.data();
      cols.forEach(function (col) {
        var v = d.bars.values[col.index];
        var top = scaleBar(v);
        col.rect.setAttribute('y', top);
        col.rect.setAttribute('height', Math.max(0, BOTTOM - top));
        col.val.setAttribute('x', xOf(col.index));
        col.val.setAttribute('y', top - 6);
        col.val.textContent = NC.fmt(v, d.bars.decimals || 0);
        markAria(col.g, d.periods[col.index].label_en + ' ' + d.bars.name_en, d.bars.min, d.bars.max, v,
          NC.fmt(v) + ' ' + d.bars.unit_en);
      });
      var coords = d.line.values.map(function (v, idx) { return [xOf(idx), scaleLine(v)]; });
      path.setAttribute('d', coords.map(function (c, idx) {
        return (idx ? 'L' : 'M') + c[0].toFixed(2) + ' ' + c[1].toFixed(2);
      }).join(' '));
      nodes.forEach(function (node) {
        var c = coords[node.index];
        node.hit.setAttribute('cx', c[0]);
        node.hit.setAttribute('cy', c[1]);
        node.dot.setAttribute('cx', c[0]);
        node.dot.setAttribute('cy', c[1]);
        node.val.setAttribute('x', c[0]);
        node.val.setAttribute('y', c[1] - 12);
        var v = d.line.values[node.index];
        node.val.textContent = NC.fmt(v, d.line.decimals || 0) + '%';
        markAria(node.g, d.periods[node.index].label_en + ' ' + d.line.name_en, d.line.min, d.line.max, v,
          NC.fmt(v, d.line.decimals || 0) + '%');
      });
    }

    cols.forEach(function (col) {
      var set = function (value) {
        var d = ctx.data();
        var next = NC.snap(value, d.bars.step, d.bars.min, d.bars.max);
        if (d.bars.values[col.index] === next) return;
        d.bars.values[col.index] = next;
        update();
        ctx.changed();
      };
      NC.drag(col.g, svg, function (pt) { set(scaleBar.invert(pt.y)); });
      NC.nudgeKeys(col.g, function (delta) {
        var d = ctx.data();
        set(d.bars.values[col.index] + delta * d.bars.step);
      });
    });

    nodes.forEach(function (node) {
      var set = function (value) {
        var d = ctx.data();
        var next = NC.snap(value, d.line.step, d.line.min, d.line.max);
        if (d.line.values[node.index] === next) return;
        d.line.values[node.index] = next;
        update();
        ctx.changed();
      };
      NC.drag(node.g, svg, function (pt) { set(scaleLine.invert(pt.y)); });
      NC.nudgeKeys(node.g, function (delta) {
        var d = ctx.data();
        set(d.line.values[node.index] + delta * d.line.step);
      });
    });

    legend(host, [
      { en: first.bars.name_en, zh: first.bars.name_zh, color: 'chip series-1' },
      { en: first.line.name_en, zh: first.line.name_zh, color: 'series-2', line: true }
    ]);
    update();
    return { update: update };
  };
})(window.NPESLCharts);
