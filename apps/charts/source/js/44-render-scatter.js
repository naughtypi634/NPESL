(function (NC) {
  'use strict';

  var svg = NC.svg;
  var common = NC.renderCommon;

  function render(lab) {
    var dataset = lab.dataset;
    var width = 720;
    var height = 430;
    var plot = common.plot(width, height);
    plot.top = 34;
    plot.bottom = height - 58;
    plot.left = 74;
    plot.width = plot.right - plot.left;
    plot.height = plot.bottom - plot.top;
    var x = NC.scale.linear(dataset.x_min, dataset.x_max, plot.left, plot.right);
    var y = NC.scale.linear(dataset.y_min, dataset.y_max, plot.bottom, plot.top);
    var stats = NC.stats.correlation(dataset.points);
    var outlierIds = stats.outliers.map(function (point) { return point.id; });

    var root = svg.create(lab.plot, width, height, 'Scatter plot of ad spend against orders. Drag a point to change its position.');
    lab.svg = root;
    common.caption(root, 'Each dot is a city', { x: 0, y: 14 });

    common.drawYAxis(root, {
      left: plot.left, right: plot.right, top: plot.top, bottom: plot.bottom,
      min: dataset.y_min, max: dataset.y_max, scale: y,
      format: function (value) { return NC.fmt.axis(value); },
      label: dataset.y_label_en
    });
    var xTicks = NC.scale.ticks(dataset.x_min, dataset.x_max, 5);
    svg.line(root, { x1: plot.left, x2: plot.right, y1: plot.bottom, y2: plot.bottom, class: 'axis-line' });
    xTicks.forEach(function (tick) {
      var px = x(tick);
      svg.line(root, { x1: px, x2: px, y1: plot.top, y2: plot.bottom, class: tick === dataset.x_min ? 'axis-line' : 'grid-line' });
      svg.text(root, { x: px, y: plot.bottom + 20, 'text-anchor': 'middle', class: 'axis-label' }, NC.fmt.axis(tick));
    });
    svg.text(root, {
      x: (plot.left + plot.right) / 2,
      y: plot.bottom + 42,
      'text-anchor': 'middle',
      class: 'axis-title'
    }, dataset.x_label_en);

    var trend = svg.line(root, {
      x1: plot.left, x2: plot.right, y1: 0, y2: 0,
      class: 'trend-line'
    });

    var pointLayer = svg.group(root, { class: 'scatter-points' });
    var state = {
      x: x, y: y, plot: plot, trend: trend, points: [], stats: stats
    };

    dataset.points.forEach(function (point) {
      var g = svg.group(pointLayer, {
        'data-id': point.id,
        class: 'scatter-point' + (outlierIds.indexOf(point.id) !== -1 ? ' outlier' : ''),
        tabindex: '0',
        role: 'slider',
        'aria-label': point.name_en + ': ' + dataset.x_label_en + ' ' + point.x + ', ' + dataset.y_label_en + ' ' + point.y,
        'aria-valuemin': dataset.y_min,
        'aria-valuemax': dataset.y_max,
        'aria-valuenow': point.y,
        'aria-valuetext': point.name_en + ': ' + dataset.x_label_en + ' ' + point.x + ', ' + dataset.y_label_en + ' ' + point.y
      });
      svg.circle(g, { cx: x(point.x), cy: y(point.y), r: 22, fill: 'transparent', class: 'hit' });
      svg.circle(g, { cx: x(point.x), cy: y(point.y), r: 8, class: 'dot outlier-ring' });
      svg.circle(g, { cx: x(point.x), cy: y(point.y), r: 5.5, class: 'dot' });
      var label = svg.text(g, {
        x: x(point.x) + 11,
        y: y(point.y) - 10,
        class: 'point-label',
        'text-anchor': 'start'
      }, '');
      state.points.push({ point: point, group: g, label: label, hit: g.firstChild });

      NC.drag.bind(g, {
        axis: 'xy',
        xMin: dataset.x_min,
        xMax: dataset.x_max,
        yMin: dataset.y_min,
        yMax: dataset.y_max,
        step: 1,
        pixelWidth: plot.width,
        pixelHeight: plot.height,
        get: function () { return { x: point.x, y: point.y }; },
        set: function (value) {
          point.x = value.x;
          point.y = value.y;
        },
        onUpdate: function () { lab.changed(false); },
        onCommit: function () { lab.changed(true); },
        valueText: function (value) {
          return point.name_en + ': ' + dataset.x_label_en + ' ' + Math.round(value.x) + ', ' + dataset.y_label_en + ' ' + Math.round(value.y);
        }
      });

      g.addEventListener('focus', function () {
        label.textContent = point.name_en + ' · ' + Math.round(point.x) + ', ' + Math.round(point.y);
      });
      g.addEventListener('blur', function () {
        label.textContent = '';
      });
      g.addEventListener('pointerenter', function () {
        label.textContent = point.name_en + ' · ' + Math.round(point.x) + ', ' + Math.round(point.y);
      });
      g.addEventListener('pointerleave', function () {
        if (document.activeElement !== g) label.textContent = '';
      });
    });

    lab.scatterState = state;
    update(lab);
  }

  function trendPoints(state) {
    var stats = NC.stats.correlation(state.points.map(function (item) { return item.point; }));
    var xMin = state.x.domain[0];
    var xMax = state.x.domain[1];
    var y1 = stats.intercept + stats.slope * xMin;
    var y2 = stats.intercept + stats.slope * xMax;
    return { stats: stats, y1: y1, y2: y2, xMin: xMin, xMax: xMax };
  }

  function update(lab) {
    var state = lab.scatterState;
    if (!state) return;
    state.points.forEach(function (item) {
      var point = item.point;
      var cx = state.x(point.x);
      var cy = state.y(point.y);
      item.hit.setAttribute('cx', cx);
      item.hit.setAttribute('cy', cy);
      item.group.querySelectorAll('circle.dot').forEach(function (dot) {
        dot.setAttribute('cx', cx);
        dot.setAttribute('cy', cy);
      });
      item.label.setAttribute('x', cx + 11);
      item.label.setAttribute('y', cy - 10);
      if (document.activeElement === item.group) {
        item.label.textContent = point.name_en + ' · ' + Math.round(point.x) + ', ' + Math.round(point.y);
      }
      item.group.setAttribute('aria-valuenow', Math.round(point.y));
      item.group.setAttribute('aria-valuetext', point.name_en + ': ' + lab.dataset.x_label_en + ' ' + Math.round(point.x) + ', ' + lab.dataset.y_label_en + ' ' + Math.round(point.y));
    });

    var trend = trendPoints(state);
    var outlierIds = trend.stats.outliers.map(function (point) { return point.id; });
    state.points.forEach(function (item) {
      item.group.classList.toggle('outlier', outlierIds.indexOf(item.point.id) !== -1);
    });
    state.stats = trend.stats;
    var yClamped1 = NC.clamp(trend.y1, lab.dataset.y_min, lab.dataset.y_max);
    var yClamped2 = NC.clamp(trend.y2, lab.dataset.y_min, lab.dataset.y_max);
    state.trend.setAttribute('x1', state.x(trend.xMin));
    state.trend.setAttribute('y1', state.y(yClamped1));
    state.trend.setAttribute('x2', state.x(trend.xMax));
    state.trend.setAttribute('y2', state.y(yClamped2));
  }

  function describe(lab) {
    return NC.desc.scatter(lab.dataset, NC.state.level);
  }

  function tableSpec(lab) {
    var dataset = lab.dataset;
    return {
      columns: [
        { label: 'City' },
        { label: dataset.x_label_en, editable: true, step: 1, decimals: 0, unit: '' },
        { label: dataset.y_label_en, editable: true, step: 1, decimals: 0, unit: '' }
      ],
      rows: dataset.points.map(function (point) {
        return {
          key: point.id,
          cells: [
            { text: point.name_en + ' · ' + point.name_zh },
            {
              value: point.x,
              unit: '',
              set: function (next) {
                point.x = NC.clamp(next, dataset.x_min, dataset.x_max);
              }
            },
            {
              value: point.y,
              unit: '',
              set: function (next) {
                point.y = NC.clamp(next, dataset.y_min, dataset.y_max);
              }
            }
          ]
        };
      })
    };
  }

  NC.renderers.scatter = {
    mount: function (lab) { render(lab); },
    render: render,
    update: update,
    describe: describe,
    table: tableSpec
  };
})(window.NPESLCharts);
