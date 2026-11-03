(function (NC) {
  'use strict';

  var svg = NC.svg;
  var common = NC.renderCommon;

  function shortPeriod(label) {
    return String(label).replace(/\s+20(\d{2})/, ' $1');
  }

  function makeLineRenderer(variant) {
    function render(lab) {
      var width = 720;
      var height = 380;
      var plot = common.plot(width, height);
      var series = lab.dataset.series[0];
      var values = series.values;
      var periods = lab.dataset.periods;
      var n = values.length;
      var max = series.max || 100;
      var y = NC.scale.linear(0, max, plot.bottom, plot.top);
      var x = function (index) {
        if (n <= 1) return plot.left + plot.width / 2;
        return plot.left + index / (n - 1) * plot.width;
      };

      var root = svg.create(lab.plot, width, height, series.name_en + ' line chart. Drag a point to change the value.');
      lab.svg = root;
      lab.lineState = null;

      common.caption(root, series.name_en + ' · ' + series.unit, { x: 0, y: 14 });
      common.drawYAxis(root, {
        left: plot.left, right: plot.right, top: plot.top, bottom: plot.bottom,
        min: 0, max: max, scale: y,
        format: function (value) { return NC.fmt.axis(value); }
      });
      common.drawXAxis(root, {
        left: plot.left, right: plot.right, bottom: plot.bottom,
        labels: periods.map(function (p) { return shortPeriod(p.label_en); }),
        x: x
      });

      var pathPoints = values.map(function (value, index) {
        return [x(index), y(value)];
      });
      var lineD = pathPoints.map(function (point, index) {
        return (index === 0 ? 'M ' : 'L ') + point[0] + ' ' + point[1];
      }).join(' ');

      var area = null;
      if (variant === 'area') {
        var areaD = 'M ' + pathPoints[0][0] + ' ' + plot.bottom +
          ' L ' + pathPoints.map(function (point) { return point[0] + ' ' + point[1]; }).join(' L ') +
          ' L ' + pathPoints[pathPoints.length - 1][0] + ' ' + plot.bottom + ' Z';
        area = svg.path(root, { d: areaD, class: 'area-fill' });
      }

      var line = svg.path(root, { d: lineD, class: 'line-path' });
      var handleLayer = svg.group(root, { class: 'handles' });
      var handles = [];
      var labels = [];

      values.forEach(function (value, index) {
        var handle = svg.mkHandle(handleLayer, x(index), y(value), {
          min: 0,
          max: max,
          now: value,
          radius: 6,
          hitRadius: 20,
          label: series.name_en + ' in ' + periods[index].label_en,
          valueText: periods[index].label_en + ', ' + NC.fmt.value(value, series.unit, series.decimals)
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
          onUpdate: function () { lab.changed(false); },
          onCommit: function () { lab.changed(true); },
          valueText: function (v) {
            return periods[index].label_en + ', ' + NC.fmt.value(v, series.unit, series.decimals);
          }
        });
        handles.push(handle);
        labels.push(common.valueLabel(root, x(index), y(value) - 14, NC.fmt.number(value, series.decimals)));
      });

      lab.lineState = {
        x: x,
        y: y,
        handles: handles,
        labels: labels,
        line: line,
        area: area,
        plot: plot,
        series: series,
        periods: periods,
        max: max
      };
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
      values.forEach(function (value, index) {
        svg.move(state.handles[index], points[index][0], points[index][1]);
        svg.setSlider(
          state.handles[index],
          value,
          state.periods[index].label_en + ', ' + NC.fmt.value(value, state.series.unit, state.series.decimals)
        );
        state.labels[index].setAttribute('x', points[index][0]);
        state.labels[index].setAttribute('y', points[index][1] - 14);
        state.labels[index].textContent = NC.fmt.number(value, state.series.decimals);
      });
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
      describe: describe,
      table: tableSpec
    };
  }

  NC.renderers.line = makeLineRenderer('line');
  NC.renderers.area = makeLineRenderer('area');
})(window.NPESLCharts);
