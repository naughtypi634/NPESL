(function (NC) {
  'use strict';

  var svg = NC.svg;
  var common = NC.renderCommon;

  function currentSeries(dataset) {
    return dataset.series[dataset.series.length - 1];
  }

  function baselineSeries(dataset) {
    return dataset.series.length > 1 ? dataset.series[0] : null;
  }

  function valueZhUnit(dataset) {
    return dataset.unit_zh || dataset.unit;
  }

  function tableSpec(lab) {
    var dataset = lab.dataset;
    var current = currentSeries(dataset);
    var baseline = baselineSeries(dataset);
    return {
      columns: [
        { label: 'Market' },
        { label: (baseline ? baseline.name_en : 'Last year') + ' · ' + dataset.unit },
        { label: current.name_en + ' · ' + dataset.unit, editable: true, step: 5, decimals: 0, unit: '' },
        { label: 'YoY' }
      ],
      rows: dataset.categories.map(function (category, index) {
        var previous = baseline ? baseline.values[index] : null;
        var value = current.values[index];
        var yoy = previous ? (value - previous) / previous * 100 : null;
        return {
          key: category.id,
          cells: [
            { text: category.label_en + ' · ' + category.label_zh },
            { text: previous == null ? '—' : NC.fmt.number(previous, 0) },
            {
              value: value,
              unit: dataset.unit,
              set: function (next) {
                current.values[index] = next;
              }
            },
            { text: yoy == null ? '—' : (yoy >= 0 ? '+' : '') + NC.fmt.number(yoy, 1) + '%' }
          ]
        };
      })
    };
  }

  function renderVertical(lab) {
    var dataset = lab.dataset;
    var current = currentSeries(dataset);
    var baseline = baselineSeries(dataset);
    var width = 720;
    var height = 400;
    var plot = common.plot(width, height);
    plot.bottom = height - 64;
    plot.height = plot.bottom - plot.top;
    var max = dataset.max || 600;
    var y = NC.scale.linear(0, max, plot.bottom, plot.top);
    var band = NC.scale.band(dataset.categories.length, plot.left, plot.right, 0.24);
    var barWidth = Math.min(34, band.width * 0.34);

    var root = svg.create(lab.plot, width, height, 'Column chart of revenue by market. Drag a bar to change the value.');
    lab.svg = root;
    lab.legendHost = lab.legendHost || document.createElement('div');
    lab.legendHost.className = 'legend-host';
    if (!lab.legendHost.parentNode) lab.plot.appendChild(lab.legendHost);
    common.legend(lab.legendHost, [
      { label: baseline ? baseline.name_en : 'Last year', color: 'var(--series-2)', outline: true },
      { label: current.name_en, color: 'var(--series-1)' }
    ]);

    common.caption(root, current.name_en + ' · ' + dataset.unit, { x: 0, y: 14 });
    common.drawYAxis(root, {
      left: plot.left, right: plot.right, top: plot.top, bottom: plot.bottom,
      min: 0, max: max, scale: y,
      format: function (value) { return NC.fmt.axis(value); }
    });

    dataset.categories.forEach(function (category, index) {
      var center = band.center(index);
      var currentValue = current.values[index];
      var previous = baseline ? baseline.values[index] : null;
      if (previous != null) {
        var ghostHeight = Math.max(0, plot.bottom - y(previous));
        svg.rect(root, {
          x: center - barWidth - 2,
          y: y(previous),
          width: barWidth,
          height: ghostHeight,
          rx: 3,
          class: 'bar-ghost'
        });
      }
      var barHeight = Math.max(0, plot.bottom - y(currentValue));
      svg.rect(root, {
        x: center + 2,
        y: y(currentValue),
        width: barWidth,
        height: barHeight,
        rx: 3,
        class: 'bar-current'
      });
      svg.text(root, {
        x: center, y: plot.bottom + 20,
        'text-anchor': 'middle',
        class: 'axis-label'
      }, category.label_en);
    });

    var handleLayer = svg.group(root, { class: 'handles' });
    var handles = [];
    var labels = [];
    dataset.categories.forEach(function (category, index) {
      var center = band.center(index) + 2 + barWidth / 2;
      var currentValue = current.values[index];
      var handle = svg.mkHandle(handleLayer, center, y(currentValue), {
        min: 0,
        max: max,
        now: currentValue,
        radius: 6,
        hitRadius: 20,
        label: category.label_en + ' ' + current.name_en,
        valueText: category.label_en + ', ' + NC.fmt.value(currentValue, dataset.unit, 0)
      });
      NC.drag.bind(handle.group, {
        axis: 'y',
        min: 0,
        max: max,
        step: 5,
        pixelSpan: plot.height,
        get: function () { return current.values[index]; },
        set: function (value) { current.values[index] = value; },
        onUpdate: function () { lab.changed(false); },
        onCommit: function () { lab.changed(true); },
        valueText: function (value) {
          return category.label_en + ', ' + NC.fmt.value(value, dataset.unit, 0);
        }
      });
      handle.group.setAttribute('data-index', index);
      handles.push(handle);
      labels.push(common.valueLabel(root, center, y(currentValue) - 12, NC.fmt.number(currentValue, 0)));
    });

    lab.barState = {
      layout: 'vertical',
      plot: plot,
      y: y,
      band: band,
      barWidth: barWidth,
      current: current,
      baseline: baseline,
      handles: handles,
      labels: labels,
      max: max
    };
  }

  function updateVertical(lab) {
    var state = lab.barState;
    if (!state || state.layout !== 'vertical') return;
    var bars = lab.svg.querySelectorAll('.bar-current');
    var ghosts = lab.svg.querySelectorAll('.bar-ghost');
    lab.dataset.categories.forEach(function (category, index) {
      var value = state.current.values[index];
      var previous = state.baseline ? state.baseline.values[index] : null;
      var x = state.band.center(index) + 2;
      var bar = bars[index];
      if (bar) {
        bar.setAttribute('y', state.y(value));
        bar.setAttribute('height', Math.max(0, state.plot.bottom - state.y(value)));
      }
      if (previous != null && ghosts[index]) {
        ghosts[index].setAttribute('y', state.y(previous));
        ghosts[index].setAttribute('height', Math.max(0, state.plot.bottom - state.y(previous)));
      }
      svg.move(state.handles[index], x + state.barWidth / 2, state.y(value));
      svg.setSlider(state.handles[index], value, category.label_en + ', ' + NC.fmt.value(value, lab.dataset.unit, 0));
      state.labels[index].setAttribute('y', state.y(value) - 12);
      state.labels[index].textContent = NC.fmt.number(value, 0);
    });
  }

  function renderHorizontal(lab) {
    var dataset = lab.dataset;
    var current = currentSeries(dataset);
    var baseline = baselineSeries(dataset);
    var width = 720;
    var height = 420;
    var plot = common.plot(width, height);
    plot.left = 126;
    plot.top = 30;
    plot.bottom = height - 40;
    plot.width = plot.right - plot.left;
    plot.height = plot.bottom - plot.top;
    var max = dataset.max || 600;
    var x = NC.scale.linear(0, max, plot.left, plot.right);
    var order = dataset.categories.map(function (category, index) { return index; })
      .sort(function (a, b) { return current.values[b] - current.values[a]; });
    var band = NC.scale.band(order.length, plot.top, plot.bottom, 0.26);
    var barHeight = Math.min(28, band.width * 0.58);

    var root = svg.create(lab.plot, width, height, 'Horizontal bar chart ranking markets by revenue. Drag a bar to change the value.');
    lab.svg = root;
    lab.legendHost = lab.legendHost || document.createElement('div');
    lab.legendHost.className = 'legend-host';
    if (!lab.legendHost.parentNode) lab.plot.appendChild(lab.legendHost);
    common.legend(lab.legendHost, [
      { label: baseline ? baseline.name_en : 'Last year', color: 'var(--series-2)', outline: true },
      { label: current.name_en, color: 'var(--series-1)' }
    ]);

    common.caption(root, current.name_en + ' · ' + dataset.unit + ' · ranked high to low', { x: 0, y: 14 });
    var ticks = NC.scale.ticks(0, max, 5);
    ticks.forEach(function (tick) {
      var px = x(tick);
      svg.line(root, { x1: px, x2: px, y1: plot.top, y2: plot.bottom, class: tick === 0 ? 'axis-line' : 'grid-line' });
      svg.text(root, { x: px, y: plot.bottom + 20, 'text-anchor': 'middle', class: 'axis-label' }, NC.fmt.axis(tick));
    });

    var handleLayer = svg.group(root, { class: 'handles' });
    var handles = [];
    var labels = [];
    order.forEach(function (categoryIndex, row) {
      var category = dataset.categories[categoryIndex];
      var value = current.values[categoryIndex];
      var previous = baseline ? baseline.values[categoryIndex] : null;
      var cy = band.center(row);
      svg.text(root, {
        x: plot.left - 12,
        y: cy,
        'text-anchor': 'end',
        'dominant-baseline': 'middle',
        class: 'axis-label category-label'
      }, category.label_en);
      if (previous != null) {
        svg.rect(root, {
          x: plot.left,
          y: cy - barHeight / 2 - 2,
          width: Math.max(0, x(previous) - plot.left),
          height: barHeight,
          rx: 3,
          class: 'bar-ghost'
        });
      }
      svg.rect(root, {
        x: plot.left,
        y: cy - barHeight / 2 + 2,
        width: Math.max(0, x(value) - plot.left),
        height: barHeight - 4,
        rx: 3,
        class: 'bar-current'
      });
      var handle = svg.mkHandle(handleLayer, x(value), cy, {
        min: 0,
        max: max,
        now: value,
        radius: 6,
        hitRadius: 20,
        orientation: 'horizontal',
        label: category.label_en + ' ' + current.name_en,
        valueText: category.label_en + ', ' + NC.fmt.value(value, dataset.unit, 0)
      });
      NC.drag.bind(handle.group, {
        axis: 'x',
        min: 0,
        max: max,
        step: 5,
        pixelSpan: plot.width,
        get: function () { return current.values[categoryIndex]; },
        set: function (next) { current.values[categoryIndex] = next; },
        onUpdate: function () { lab.changed(false); },
        onCommit: function () {
          lab.changed(true);
          renderHorizontal(lab);
        },
        valueText: function (next) {
          return category.label_en + ', ' + NC.fmt.value(next, dataset.unit, 0);
        }
      });
      handle.group.setAttribute('data-index', categoryIndex);
      handles.push({ handle: handle, categoryIndex: categoryIndex, row: row });
      labels.push(common.valueLabel(root, x(value) + 10, cy, NC.fmt.number(value, 0), 'value-label end'));
    });

    lab.barState = {
      layout: 'horizontal',
      plot: plot,
      x: x,
      band: band,
      barHeight: barHeight,
      order: order,
      current: current,
      baseline: baseline,
      handles: handles,
      labels: labels,
      max: max
    };
  }

  function updateHorizontal(lab) {
    var state = lab.barState;
    if (!state || state.layout !== 'horizontal') return;
    var bars = lab.svg.querySelectorAll('.bar-current');
    var ghosts = lab.svg.querySelectorAll('.bar-ghost');
    state.order.forEach(function (categoryIndex, row) {
      var value = state.current.values[categoryIndex];
      var previous = state.baseline ? state.baseline.values[categoryIndex] : null;
      if (bars[row]) {
        bars[row].setAttribute('width', Math.max(0, state.x(value) - state.plot.left));
      }
      if (previous != null && ghosts[row]) {
        ghosts[row].setAttribute('width', Math.max(0, state.x(previous) - state.plot.left));
      }
    });
    state.handles.forEach(function (item) {
      var value = state.current.values[item.categoryIndex];
      svg.move(item.handle, state.x(value), state.band.center(item.row));
      svg.setSlider(item.handle, value, lab.dataset.categories[item.categoryIndex].label_en + ', ' + NC.fmt.value(value, lab.dataset.unit, 0));
      var label = state.labels[item.row];
      label.setAttribute('x', state.x(value) + 10);
      label.textContent = NC.fmt.number(value, 0);
    });
  }

  function describe(lab) {
    return NC.desc.category(lab.dataset, NC.state.level, { style: lab.type.renderer === 'hbar' ? 'ranking' : 'bar' });
  }

  NC.renderers.bar = {
    mount: function (lab) { renderVertical(lab); },
    render: renderVertical,
    update: updateVertical,
    describe: describe,
    table: tableSpec
  };

  NC.renderers.hbar = {
    mount: function (lab) { renderHorizontal(lab); },
    render: renderHorizontal,
    update: updateHorizontal,
    describe: describe,
    table: tableSpec
  };
})(window.NPESLCharts);
