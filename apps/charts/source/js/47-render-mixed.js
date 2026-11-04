(function (NC) {
  'use strict';

  var svg = NC.svg;
  var common = NC.renderCommon;

  function niceMax(value) {
    if (!isFinite(value) || value <= 0) return 100;
    var step = Math.pow(10, Math.floor(Math.log10(value)));
    var scaled = value / step;
    var nice = scaled <= 1.2 ? 1.2 : scaled <= 2 ? 2 : scaled <= 2.5 ? 2.5 : scaled <= 3 ? 3 : scaled <= 5 ? 5 : 10;
    return Math.ceil(nice * step);
  }

  function scaleRange(series) {
    var min = series.min == null ? Math.min.apply(null, series.values) : series.min;
    var max = series.max == null ? Math.max.apply(null, series.values) : series.max;
    if (max <= min) max = min + 1;
    return { min: min, max: max };
  }

  function shortPeriod(label) {
    return String(label).replace(/\s+20(\d{2})/, ' $1');
  }

  function tipText(dataset, index) {
    return dataset.periods[index].label_en + ' · ' + dataset.bars.name_en + ': ' +
      NC.fmt.value(dataset.bars.values[index], dataset.bars.unit, dataset.bars.decimals) + ' · ' +
      dataset.line.name_en + ': ' + NC.fmt.value(dataset.line.values[index], dataset.line.unit, dataset.line.decimals);
  }

  function render(lab) {
    if (lab.modesHost) lab.modesHost.innerHTML = '';
    var dataset = lab.dataset;
    var bars = dataset.bars;
    var line = dataset.line;
    var periods = dataset.periods;
    var width = 720;
    var height = 410;
    var root = svg.create(lab.plot, width, height, 'Combined chart: revenue as bars and margin as a line. Drag a bar or point to change a value.');
    lab.svg = root;
    var compact = common.fit(root);
    lab.compact = compact;
    var plot = common.plot(width, height, compact);
    plot.bottom = height - 60;
    plot.height = plot.bottom - plot.top;

    var barRange = scaleRange(bars);
    barRange.max = niceMax(barRange.max * 1.1);
    var lineRange = scaleRange(line);
    var yBar = NC.scale.linear(barRange.min, barRange.max, plot.bottom, plot.top);
    var yLine = NC.scale.linear(lineRange.min, lineRange.max, plot.bottom, plot.top);
    var band = NC.scale.band(periods.length, plot.left, plot.right, 0.32);
    var barWidth = Math.min(26, band.width * 0.48);

    common.drawYAxis(root, {
      left: plot.left, right: plot.right, top: plot.top, bottom: plot.bottom,
      min: barRange.min, max: barRange.max, scale: yBar,
      format: function (value) { return NC.fmt.axis(value); }
    });
    common.drawXAxis(root, {
      left: plot.left, right: plot.right, bottom: plot.bottom,
      labels: periods.map(function (period) { return shortPeriod(period.label_en); }),
      x: function (index) { return band.center(index); },
      labelEvery: compact ? 2 : 1
    });

    var lineTicks = NC.scale.ticks(lineRange.min, lineRange.max, 5);
    lineTicks.forEach(function (tick) {
      var py = yLine(tick);
      svg.text(root, {
        x: plot.right + 10,
        y: py,
        'text-anchor': 'start',
        'dominant-baseline': 'middle',
        class: 'axis-label axis-label-right'
      }, NC.fmt.number(tick, 0) + '%');
    });

    var barRects = [];
    periods.forEach(function (period, index) {
      var value = bars.values[index];
      var rect = svg.rect(root, {
        x: band.center(index) - barWidth / 2,
        y: yBar(value),
        width: barWidth,
        height: Math.max(0, plot.bottom - yBar(value)),
        rx: 3,
        class: 'bar-current',
        fill: 'var(--' + bars.color + ')',
        'data-index': index
      });
      barRects.push(rect);
      rect.addEventListener('pointerenter', function () {
        common.showTip(lab.plot, tipText(dataset, index), root, band.center(index), yBar(value));
      });
      rect.addEventListener('pointerleave', function () { common.hideTip(lab.plot); });
    });

    var points = line.values.map(function (value, index) {
      return [band.center(index), yLine(value)];
    });
    var lineD = points.map(function (point, index) {
      return (index === 0 ? 'M ' : 'L ') + point[0] + ' ' + point[1];
    }).join(' ');
    var linePath = svg.path(root, { d: lineD, class: 'mixed-line' });
    var lineDots = points.map(function (point) {
      return svg.circle(root, { cx: point[0], cy: point[1], r: 3.5, class: 'mixed-dot' });
    });

    var handleLayer = svg.group(root, { class: 'handles' });
    var barHandles = [];
    var lineHandles = [];
    var last = periods.length - 1;
    var labels = [];

    labels.push(common.placeValueLabel(root, band.center(last) + 9, yLine(line.values[last]) - 10, NC.fmt.value(line.values[last], line.unit, line.decimals), {
      anchor: 'start', class: 'value-label line-value-label', top: plot.top + 12
    }));

    periods.forEach(function (period, index) {
      var value = bars.values[index];
      var barHandle = svg.mkHandle(handleLayer, band.center(index), yBar(value), {
        min: barRange.min,
        max: barRange.max,
        now: value,
        radius: common.screenPx(root, 4),
        hitRadius: common.screenPx(root, 16),
        label: period.label_en + ' ' + bars.name_en,
        valueText: tipText(dataset, index),
        data: { series: 'bar', index: index }
      });
      barHandle.group.addEventListener('pointerenter', function () {
        common.showTip(lab.plot, tipText(dataset, index), root, band.center(index), yBar(bars.values[index]));
      });
      barHandle.group.addEventListener('pointerleave', function () { common.hideTip(lab.plot); });
      barHandles.push(barHandle);

      var lineHandle = svg.mkHandle(handleLayer, band.center(index), yLine(line.values[index]), {
        min: lineRange.min,
        max: lineRange.max,
        now: line.values[index],
        radius: common.screenPx(root, 4.5),
        hitRadius: common.screenPx(root, 18),
        label: period.label_en + ' ' + line.name_en,
        valueText: tipText(dataset, index),
        data: { series: 'line', index: index }
      });
      lineHandle.group.addEventListener('pointerenter', function () {
        common.showTip(lab.plot, tipText(dataset, index), root, band.center(index), yLine(line.values[index]));
      });
      lineHandle.group.addEventListener('pointerleave', function () { common.hideTip(lab.plot); });
      lineHandles.push(lineHandle);
    });

    barHandles.forEach(function (handle, index) {
      NC.drag.bind(handle.group, {
        axis: 'y',
        min: barRange.min,
        max: barRange.max,
        step: bars.step || 1,
        pixelSpan: plot.height,
        get: function () { return bars.values[index]; },
        set: function (value) { bars.values[index] = value; },
        onUpdate: function () { lab.changed(false); },
        onCommit: function () { lab.changed(true); },
        valueText: function (value) { return dataset.periods[index].label_en + ', ' + NC.fmt.value(value, bars.unit, bars.decimals); }
      });
    });

    lineHandles.forEach(function (handle, index) {
      NC.drag.bind(handle.group, {
        axis: 'y',
        min: lineRange.min,
        max: lineRange.max,
        step: line.step || 0.1,
        pixelSpan: plot.height,
        get: function () { return line.values[index]; },
        set: function (value) { line.values[index] = value; },
        onUpdate: function () { lab.changed(false); },
        onCommit: function () { lab.changed(true); },
        valueText: function (value) { return dataset.periods[index].label_en + ', ' + NC.fmt.value(value, line.unit, line.decimals); }
      });
    });

    var legendHost = document.createElement('div');
    legendHost.className = 'legend-host';
    lab.plot.appendChild(legendHost);
    common.legend(legendHost, [
      { label: bars.name_en, color: 'var(--' + bars.color + ')', key: 'bar' },
      { label: line.name_en, color: 'var(--' + line.color + ')', key: 'line', outline: true }
    ]);

    lab.mixedState = {
      root: root,
      plot: plot,
      band: band,
      barWidth: barWidth,
      yBar: yBar,
      yLine: yLine,
      bars: barRects,
      line: linePath,
      dots: lineDots,
      barHandles: barHandles,
      lineHandles: lineHandles,
      labels: labels,
      barRange: barRange,
      lineRange: lineRange,
      lineValues: line.values,
      barValues: bars.values
    };
    lab.motion = {
      bars: barRects,
      line: linePath,
      dots: lineDots,
      handles: barHandles.concat(lineHandles),
      labels: labels
    };
  }

  function update(lab) {
    var state = lab.mixedState;
    if (!state) return;
    var dataset = lab.dataset;
    var bars = dataset.bars;
    var line = dataset.line;
    bars.values.forEach(function (value, index) {
      if (state.bars[index]) {
        state.bars[index].setAttribute('y', state.yBar(value));
        state.bars[index].setAttribute('height', Math.max(0, state.plot.bottom - state.yBar(value)));
      }
      svg.move(state.barHandles[index], state.band.center(index), state.yBar(value));
      svg.setSlider(state.barHandles[index], value, tipText(dataset, index));
    });
    line.values.forEach(function (value, index) {
      var x = state.band.center(index);
      var y = state.yLine(value);
      if (state.dots[index]) {
        state.dots[index].setAttribute('cx', x);
        state.dots[index].setAttribute('cy', y);
      }
      svg.move(state.lineHandles[index], x, y);
      svg.setSlider(state.lineHandles[index], value, tipText(dataset, index));
    });
    var points = line.values.map(function (value, index) {
      return [state.band.center(index), state.yLine(value)];
    });
    state.line.setAttribute('d', points.map(function (point, index) {
      return (index === 0 ? 'M ' : 'L ') + point[0] + ' ' + point[1];
    }).join(' '));
    var last = line.values.length - 1;
    if (state.labels[0]) {
      state.labels[0].setAttribute('x', state.band.center(last) + 9);
      state.labels[0].setAttribute('y', Math.max(state.plot.top + 12, state.yLine(line.values[last]) - 10));
      state.labels[0].textContent = NC.fmt.value(line.values[last], line.unit, line.decimals);
    }
  }

  function describe(lab) {
    return NC.desc.mixed(lab.dataset, NC.state.level);
  }

  function tableSpec(lab) {
    var dataset = lab.dataset;
    return {
      columns: [
        { label: 'Period' },
        { label: dataset.bars.name_en + ' · ' + dataset.bars.unit, editable: true, step: 1, decimals: 0, unit: '' },
        { label: dataset.line.name_en + ' · ' + dataset.line.unit, editable: true, step: 0.1, decimals: 1, unit: '%' }
      ],
      rows: dataset.periods.map(function (period, index) {
        return {
          key: period.id,
          cells: [
            { text: period.label_en },
            {
              value: dataset.bars.values[index],
              unit: dataset.bars.unit,
              set: function (value) { dataset.bars.values[index] = value; }
            },
            {
              value: dataset.line.values[index],
              unit: '%',
              set: function (value) { dataset.line.values[index] = value; }
            }
          ]
        };
      })
    };
  }

  NC.renderers.mixed = {
    mount: function (lab) { render(lab); },
    render: render,
    update: update,
    describe: describe,
    table: tableSpec
  };
})(window.NPESLCharts);
