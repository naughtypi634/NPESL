(function (NC) {
  'use strict';

  var svg = NC.svg;
  var common = NC.renderCommon;

  function shortPeriod(label) {
    return String(label).replace(/\s+20(\d{2})/, ' $1');
  }

  function makeLineRenderer(variant) {
    function render(lab) {
      var box = common.size(lab.plot);
      var width = box.width;
      var height = box.height;
      var series = lab.dataset.series[0];
      var values = series.values;
      var periods = lab.dataset.periods;
      var n = values.length;
      var max = series.max || 100;

      var root = svg.create(lab.plot, width, height, series.name_en + ' line chart. Drag a point to change the value.');
      lab.svg = root;
      lab.lineState = null;
      var compact = common.fit(root);
      lab.compact = compact;
      var plot = common.plot(width, height, compact);
      var y = NC.scale.linear(0, max, plot.bottom, plot.top);
      var x = function (index) {
        if (n <= 1) return plot.left + plot.width / 2;
        return plot.left + index / (n - 1) * plot.width;
      };

      common.drawYAxis(root, {
        left: plot.left, right: plot.right, top: plot.top, bottom: plot.bottom,
        min: 0, max: max, scale: y,
        format: function (value) { return NC.fmt.axis(value); }
      });
      common.drawXAxis(root, {
        left: plot.left, right: plot.right, bottom: plot.bottom,
        labels: periods.map(function (p) { return shortPeriod(p.label_en); }),
        x: x,
        labelEvery: compact ? 2 : 1
      });

      var pathPoints = values.map(function (value, index) {
        return [x(index), y(value)];
      });
      var lineD = pathPoints.map(function (point, index) {
        return (index === 0 ? 'M ' : 'L ') + point[0] + ' ' + point[1];
      }).join(' ');

      var defs = svg.el('defs', null, root);
      var gradientId = 'areaGrad-' + lab.type.id;
      var gradient = svg.el('linearGradient', {
        id: gradientId, x1: '0', y1: '0', x2: '0', y2: '1'
      }, defs);
      svg.el('stop', { offset: '0%', 'stop-color': 'var(--series-1)', 'stop-opacity': '0.12' }, gradient);
      svg.el('stop', { offset: '100%', 'stop-color': 'var(--series-1)', 'stop-opacity': '0.01' }, gradient);

      var hit = svg.rect(root, {
        x: plot.left, y: plot.top, width: plot.width, height: plot.height,
        fill: 'transparent', class: 'plot-hit'
      });
      var crosshair = svg.line(root, {
        x1: plot.left, x2: plot.left, y1: plot.top, y2: plot.bottom,
        class: 'crosshair'
      });
      crosshair.setAttribute('opacity', '0');

      var areaD = 'M ' + pathPoints[0][0] + ' ' + plot.bottom +
        ' L ' + pathPoints.map(function (point) { return point[0] + ' ' + point[1]; }).join(' L ') +
        ' L ' + pathPoints[pathPoints.length - 1][0] + ' ' + plot.bottom + ' Z';
      var area = svg.path(root, { d: areaD, fill: 'url(#' + gradientId + ')', class: 'area-fill' });
      var edge = null;

      var line = svg.path(root, { d: lineD, class: 'line-path' });
      var hoverDot = svg.circle(root, { cx: 0, cy: 0, r: 4.5, class: 'hover-dot' });
      hoverDot.setAttribute('opacity', '0');
      var handleLayer = svg.group(root, { class: 'handles' });
      var handles = [];
      var labels = {};
      var labelIndices = {};

      var first = 0;
      var last = n - 1;
      var minIndex = 1;
      var maxIndex = 1;
      for (var i = 2; i < n - 1; i += 1) {
        if (values[i] < values[minIndex]) minIndex = i;
        if (values[i] > values[maxIndex]) maxIndex = i;
      }
      labelIndices[last] = true;
      if (compact) {
        labelIndices[first] = true;
      } else {
        labelIndices[first] = true;
        labelIndices[minIndex] = true;
        labelIndices[maxIndex] = true;
      }
      Object.keys(labelIndices).forEach(function (key) {
        var index = Number(key);
        var anchor = index === first ? 'start' : index === last ? 'end' : 'middle';
        var lx = index === first ? x(index) + 6 : index === last ? x(index) - 6 : x(index);
        labels[index] = common.placeValueLabel(root, lx, y(values[index]) - 12, NC.fmt.number(values[index], series.decimals), {
          top: plot.top + 12,
          anchor: anchor,
          class: 'value-label editable-value'
        });
        NC.bindValueClick(labels[index], lab, function () {
          var i = index;
          return {
            root: root,
            x: x(i),
            y: y(series.values[i]),
            value: series.values[i],
            min: 0,
            max: max,
            step: series.step || 1,
            label: periods[i].label_en,
            unit: series.unit,
            set: function (value) { series.values[i] = value; },
            onCommit: function () { lab.changed(true); showPoint(i); }
          };
        });
      });

      function tipText(index) {
        return periods[index].label_en + ' · ' + NC.fmt.value(values[index], series.unit, series.decimals);
      }

      function showPoint(index) {
        if (lab.lineState) lab.lineState.activeIndex = index;
        var px = x(index);
        var py = y(series.values[index]);
        crosshair.setAttribute('x1', px);
        crosshair.setAttribute('x2', px);
        crosshair.setAttribute('opacity', '1');
        hoverDot.setAttribute('cx', px);
        hoverDot.setAttribute('cy', py);
        hoverDot.setAttribute('opacity', '1');
        handles.forEach(function (item, i) {
          if (!item) return;
          item.group.classList.toggle('is-visible', i === index);
        });
        common.showTip(lab.plot, tipText(index), root, px, py);
      }

      function hidePoint() {
        if (lab.lineState) lab.lineState.activeIndex = null;
        crosshair.setAttribute('opacity', '0');
        hoverDot.setAttribute('opacity', '0');
        handles.forEach(function (item) {
          if (item) item.group.classList.remove('is-visible');
        });
        common.hideTip(lab.plot);
      }

      function localX(event) {
        var rect = root.getBoundingClientRect();
        return rect.width ? (event.clientX - rect.left) * width / rect.width : 0;
      }

      hit.addEventListener('pointermove', function (event) {
        var index = NC.scale.nearestIndex(pathPoints.map(function (point) { return point[0]; }), localX(event));
        showPoint(index);
      });
      hit.addEventListener('pointerleave', hidePoint);

      values.forEach(function (value, index) {
        var handleRadius = common.screenPx(root, 6);
        var hitRadius = common.screenPx(root, 20);
        var handle = svg.mkHandle(handleLayer, x(index), y(value), {
          min: 0,
          max: max,
          now: value,
          radius: handleRadius,
          hitRadius: hitRadius,
          stroke: 'var(--' + series.color + ')',
          label: series.name_en + ' in ' + periods[index].label_en,
          valueText: tipText(index)
        });
        handle.group.setAttribute('data-index', index);
        NC.drag.bind(handle.group, {
          axis: 'y',
          min: 0,
          max: max,
          step: series.step || 1,
          pixelSpan: plot.height,
          get: function () { return series.values[index]; },
          set: function (v) { series.values[index] = v; },
          onStart: function () { showPoint(index); },
          onUpdate: function () {
            lab.changed(false);
            showPoint(index);
          },
          onCommit: function () {
            lab.changed(true);
            showPoint(index);
          },
          onEnd: function () { showPoint(index); },
          focusOnCommit: true,
          valueText: function (v) {
            return periods[index].label_en + ', ' + NC.fmt.value(v, series.unit, series.decimals);
          }
        });
        NC.bindValueClick(handle.group, lab, function () {
          return {
            root: root,
            x: x(index),
            y: y(series.values[index]),
            value: series.values[index],
            min: 0,
            max: max,
            step: series.step || 1,
            label: periods[index].label_en,
            unit: series.unit,
            set: function (value) { series.values[index] = value; },
            onCommit: function () { lab.changed(true); showPoint(index); }
          };
        });
        handle.group.addEventListener('focus', function () { showPoint(index); });
        handle.group.addEventListener('blur', hidePoint);
        handle.group.addEventListener('pointerenter', function () { showPoint(index); });
        handle.group.addEventListener('pointerleave', hidePoint);
        handles.push(handle);
      });

      lab.lineState = {
        x: x,
        y: y,
        handles: handles,
        labels: labels,
        line: line,
        area: area,
        edge: edge,
        plot: plot,
        series: series,
        periods: periods,
        max: max,
        root: root,
        crosshair: crosshair,
        hoverDot: hoverDot,
        tipText: tipText,
        showPoint: showPoint,
        hidePoint: hidePoint
      };
      lab.motion = { line: line, labels: labels };
    }

    function update(lab) {
      var state = lab.lineState;
      if (!state) return;
      var values = state.series.values;
      var points = values.map(function (value, index) {
        return [state.x(index), state.y(value)];
      });
      var lineD = points.map(function (point, index) {
        return (index === 0 ? 'M ' : 'L ') + point[0] + ' ' + point[1];
      }).join(' ');
      state.line.setAttribute('d', lineD);
      if (state.area) {
        var areaD = 'M ' + points[0][0] + ' ' + state.plot.bottom +
          ' L ' + points.map(function (point) { return point[0] + ' ' + point[1]; }).join(' L ') +
          ' L ' + points[points.length - 1][0] + ' ' + state.plot.bottom + ' Z';
        state.area.setAttribute('d', areaD);
      }
      if (state.edge) state.edge.setAttribute('d', lineD);
      values.forEach(function (value, index) {
        svg.move(state.handles[index], points[index][0], points[index][1]);
        svg.setSlider(
          state.handles[index],
          value,
          state.periods[index].label_en + ', ' + NC.fmt.value(value, state.series.unit, state.series.decimals)
        );
      });
      Object.keys(state.labels).forEach(function (key) {
        var index = Number(key);
        var node = state.labels[key];
        if (!node) return;
        var anchor = index === 0 ? 'start' : index === values.length - 1 ? 'end' : 'middle';
        var lx = index === 0 ? points[index][0] + 6 : index === values.length - 1 ? points[index][0] - 6 : points[index][0];
        node.setAttribute('x', lx);
        node.setAttribute('text-anchor', anchor);
        node.setAttribute('y', Math.max(state.plot.top + 12, points[index][1] - 12));
        node.textContent = NC.fmt.number(values[index], state.series.decimals);
      });
      if (typeof state.activeIndex === 'number') state.showPoint(state.activeIndex);
    }

    function highlight(lab, focus) {
      var state = lab.lineState;
      if (!state) return;
      common.clearFocus(state.root);
      common.clearDim(state.root);
      if (!focus || focus.kind === 'all') return;
      if (focus.kind === 'range') {
        var from = Math.max(0, Math.min(state.periods.length - 1, focus.from));
        var to = Math.max(from, Math.min(state.periods.length - 1, focus.to));
        var x1 = state.x(from) - 10;
        var x2 = state.x(to) + 10;
        common.focusBand(state.root, Math.max(state.plot.left, x1), state.plot.top, Math.max(24, x2 - x1), state.plot.height);
        common.focusRing(state.root, state.x(to), state.y(state.series.values[to]), 7);
      } else if (focus.kind === 'point') {
        var index = Math.max(0, Math.min(state.periods.length - 1, focus.index));
        var px = state.x(index);
        common.focusBand(state.root, Math.max(state.plot.left, px - 13), state.plot.top, 26, state.plot.height);
        common.focusRing(state.root, px, state.y(state.series.values[index]), 8);
      }
    }

    function describe(lab) {
      return NC.desc.time(lab.dataset, lab.dataset.series[0], NC.state.level, { area: variant === 'area' });
    }

    function tableSpec(lab) {
      var series = lab.dataset.series[0];
      return {
        columns: [
          { label: 'Period' },
          { label: series.name_en + ' · ' + series.unit, editable: true, step: series.step || 1, decimals: series.decimals || 0, unit: series.unit }
        ],
        rows: lab.dataset.periods.map(function (period, index) {
          return {
            key: period.id,
            cells: [
              { text: period.label_en },
              {
                value: series.values[index],
                unit: series.unit,
                set: function (value) {
                  series.values[index] = value;
                }
              }
            ]
          };
        })
      };
    }

    return {
      mount: function (lab) {
        render(lab);
      },
      render: render,
      update: update,
      highlight: highlight,
      describe: describe,
      table: tableSpec
    };
  }

  NC.renderers.line = makeLineRenderer('line');
  NC.renderers.area = makeLineRenderer('area');
})(window.NPESLCharts);
