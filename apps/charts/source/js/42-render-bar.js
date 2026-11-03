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

  function tipText(dataset, current, baseline, index) {
    var category = dataset.categories[index];
    var text = category.label_en + ' · ' + current.name_en + ': ' + NC.fmt.value(current.values[index], dataset.unit, 0);
    if (baseline) text += ' · ' + baseline.name_en + ': ' + NC.fmt.value(baseline.values[index], dataset.unit, 0);
    return text;
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

  function bindBarDrag(target, lab, categoryIndex, handle, showTip) {
    var dataset = lab.dataset;
    var current = currentSeries(dataset);
    var baseline = baselineSeries(dataset);
    var opts = {
      axis: 'y',
      min: 0,
      max: dataset.max || 600,
      step: 5,
      pixelSpan: lab.barState ? lab.barState.plot.height : 520,
      get: function () { return current.values[categoryIndex]; },
      set: function (value) { current.values[categoryIndex] = value; },
      onStart: showTip,
      onUpdate: function () {
        lab.changed(false);
        showTip();
      },
      onCommit: function () { lab.changed(true); },
      onEnd: showTip,
      valueText: function (value) {
        return dataset.categories[categoryIndex].label_en + ', ' + NC.fmt.value(value, dataset.unit, 0);
      }
    };
    NC.drag.bind(target, opts);
  }

  function renderVertical(lab) {
    var dataset = lab.dataset;
    var current = currentSeries(dataset);
    var baseline = baselineSeries(dataset);
    var width = 720;
    var height = 400;
    var root = svg.create(lab.plot, width, height, 'Column chart of revenue by market. Drag a bar to change the value.');
    lab.svg = root;
    var compact = common.fit(root);
    lab.compact = compact;
    var plot = common.plot(width, height, compact);
    plot.bottom = height - 64;
    plot.height = plot.bottom - plot.top;
    var max = dataset.max || 600;
    var y = NC.scale.linear(0, max, plot.bottom, plot.top);
    var band = NC.scale.band(dataset.categories.length, plot.left, plot.right, 0.24);
    var barWidth = Math.min(34, band.width * 0.34);

    lab.legendHost = lab.legendHost || document.createElement('div');
    lab.legendHost.className = 'legend-host';
    if (!lab.legendHost.parentNode) lab.plot.appendChild(lab.legendHost);
    var legend = common.legend(lab.legendHost, [
      { label: baseline ? baseline.name_en : 'Last year', color: 'var(--series-2)', outline: true, key: 'baseline' },
      { label: current.name_en, color: 'var(--series-1)', key: 'current' }
    ]);

    common.drawYAxis(root, {
      left: plot.left, right: plot.right, top: plot.top, bottom: plot.bottom,
      min: 0, max: max, scale: y,
      format: function (value) { return NC.fmt.axis(value); }
    });

    var bars = [];
    var ghosts = [];
    var labels = [];
    var ghostLabels = [];
    dataset.categories.forEach(function (category, index) {
      var center = band.center(index);
      var currentValue = current.values[index];
      var previous = baseline ? baseline.values[index] : null;
      if (previous != null) {
        var ghost = svg.rect(root, {
          x: center - barWidth - 2,
          y: y(previous),
          width: barWidth,
          height: Math.max(0, plot.bottom - y(previous)),
          rx: 3,
          class: 'bar-ghost'
        });
        ghosts.push(ghost);
        if (!compact) {
          ghostLabels.push(common.placeValueLabel(root, center - barWidth / 2 - 2, y(previous) - 8, NC.fmt.number(previous, 0), {
            class: 'value-label ghost',
            top: plot.top + 12
          }));
        }
      }
      var bar = svg.rect(root, {
        x: center + 2,
        y: y(currentValue),
        width: barWidth,
        height: Math.max(0, plot.bottom - y(currentValue)),
        rx: 3,
        class: 'bar-current'
      });
      bars.push(bar);
      svg.text(root, {
        x: center, y: plot.bottom + 20,
        'text-anchor': 'middle',
        class: 'axis-label category-label'
      }, category.label_en);
      labels.push(common.placeValueLabel(root, center, y(currentValue) - 10, NC.fmt.number(currentValue, 0), {
        top: plot.top + 12
      }));
    });

    var handleLayer = svg.group(root, { class: 'handles' });
    var handles = [];
    dataset.categories.forEach(function (category, index) {
      var center = band.center(index) + 2 + barWidth / 2;
      var currentValue = current.values[index];
      var handle = svg.mkHandle(handleLayer, center, y(currentValue), {
        min: 0,
        max: max,
        now: currentValue,
        radius: common.screenPx(root, 6),
        hitRadius: common.screenPx(root, 20),
        label: category.label_en + ' ' + current.name_en,
        valueText: tipText(dataset, current, baseline, index)
      });
      handle.group.setAttribute('data-index', index);
      handles.push(handle);
    });

    function showTip(index) {
      var py = y(current.values[index]);
      common.showTip(lab.plot, tipText(dataset, current, baseline, index), root, band.center(index), py);
      lab.barState.tipIndex = index;
    }

    function hideTip() {
      common.hideTip(lab.plot);
      if (lab.barState) lab.barState.tipIndex = null;
      common.clearEmphasis(lab.plot);
    }

    lab.barState = {
      layout: 'vertical',
      plot: plot,
      y: y,
      band: band,
      barWidth: barWidth,
      current: current,
      baseline: baseline,
      bars: bars,
      ghosts: ghosts,
      labels: labels,
      ghostLabels: ghostLabels,
      handles: handles,
      max: max,
      root: root,
      tipIndex: null
    };

    dataset.categories.forEach(function (category, index) {
      var handle = handles[index];
      bindBarDrag(handle.group, lab, index, handle, function () { showTip(index); });
      bindBarDrag(bars[index], lab, index, handle, function () { showTip(index); });
      [handle.group, bars[index]].forEach(function (target) {
        target.addEventListener('pointerenter', function () {
          common.emphasize(lab.plot, 'current');
          showTip(index);
        });
        target.addEventListener('pointerleave', hideTip);
      });
      handle.group.addEventListener('focus', function () { showTip(index); });
      handle.group.addEventListener('blur', hideTip);
    });
    legend.items.forEach(function (item) {
      item.addEventListener('pointerenter', function () { common.emphasize(lab.plot, item.getAttribute('data-legend')); });
      item.addEventListener('pointerleave', function () { common.clearEmphasis(lab.plot); });
    });

    lab.motion = { bars: bars, ghosts: ghosts, handles: handles, labels: labels };
  }

  function updateVertical(lab) {
    var state = lab.barState;
    if (!state || state.layout !== 'vertical') return;
    lab.dataset.categories.forEach(function (category, index) {
      var value = state.current.values[index];
      var previous = state.baseline ? state.baseline.values[index] : null;
      var center = state.band.center(index);
      if (state.bars[index]) {
        state.bars[index].setAttribute('y', state.y(value));
        state.bars[index].setAttribute('height', Math.max(0, state.plot.bottom - state.y(value)));
      }
      if (previous != null && state.ghosts[index]) {
        state.ghosts[index].setAttribute('y', state.y(previous));
        state.ghosts[index].setAttribute('height', Math.max(0, state.plot.bottom - state.y(previous)));
      }
      svg.move(state.handles[index], center + 2 + state.barWidth / 2, state.y(value));
      svg.setSlider(state.handles[index], value, category.label_en + ', ' + NC.fmt.value(value, lab.dataset.unit, 0));
      if (state.labels[index]) {
        state.labels[index].setAttribute('y', Math.max(state.plot.top + 12, state.y(value) - 10));
        state.labels[index].textContent = NC.fmt.number(value, 0);
      }
      if (state.ghostLabels[index] && previous != null) {
        state.ghostLabels[index].setAttribute('y', Math.max(state.plot.top + 12, state.y(previous) - 8));
        state.ghostLabels[index].textContent = NC.fmt.number(previous, 0);
      }
    });
    if (typeof state.tipIndex === 'number') {
      common.showTip(lab.plot, tipText(lab.dataset, state.current, state.baseline, state.tipIndex), state.root, state.band.center(state.tipIndex), state.y(state.current.values[state.tipIndex]));
    }
  }

  function renderHorizontal(lab) {
    var dataset = lab.dataset;
    var current = currentSeries(dataset);
    var baseline = baselineSeries(dataset);
    var width = 720;
    var height = 420;
    var root = svg.create(lab.plot, width, height, 'Horizontal bar chart ranking markets by revenue. Drag a bar to change the value.');
    lab.svg = root;
    var compact = common.fit(root);
    lab.compact = compact;
    var plot = common.plot(width, height, compact);
    plot.left = compact ? 96 : 126;
    plot.top = 24;
    plot.bottom = height - 40;
    plot.width = plot.right - plot.left;
    plot.height = plot.bottom - plot.top;
    var max = dataset.max || 600;
    var x = NC.scale.linear(0, max, plot.left, plot.right);
    var order = dataset.categories.map(function (category, index) { return index; })
      .sort(function (a, b) { return current.values[b] - current.values[a]; });
    var band = NC.scale.band(order.length, plot.top, plot.bottom, 0.26);
    var barHeight = Math.min(28, band.width * 0.58);

    lab.legendHost = lab.legendHost || document.createElement('div');
    lab.legendHost.className = 'legend-host';
    if (!lab.legendHost.parentNode) lab.plot.appendChild(lab.legendHost);
    var legend = common.legend(lab.legendHost, [
      { label: baseline ? baseline.name_en : 'Last year', color: 'var(--series-2)', outline: true, key: 'baseline' },
      { label: current.name_en, color: 'var(--series-1)', key: 'current' }
    ]);

    var ticks = NC.scale.ticks(0, max, 5);
    ticks.forEach(function (tick) {
      var px = x(tick);
      svg.line(root, { x1: px, x2: px, y1: plot.top, y2: plot.bottom, class: tick === 0 ? 'axis-line' : 'grid-line' });
      svg.text(root, { x: px, y: plot.bottom + 20, 'text-anchor': 'middle', class: 'axis-label' }, NC.fmt.axis(tick));
    });

    var handleLayer = svg.group(root, { class: 'handles' });
    var bars = [];
    var rules = [];
    var labels = [];
    var handles = [];
    order.forEach(function (categoryIndex, row) {
      var category = dataset.categories[categoryIndex];
      var value = current.values[categoryIndex];
      var previous = baseline ? baseline.values[categoryIndex] : null;
      var cy = band.center(row);
      var label = svg.text(root, {
        x: plot.left - 12,
        y: cy,
        'text-anchor': 'end',
        'dominant-baseline': 'middle',
        class: 'axis-label category-label'
      }, category.label_en);
      common.fitText(label, plot.left - 24);
      if (previous != null) {
        rules.push(svg.rect(root, {
          x: plot.left,
          y: cy + barHeight / 2 - 5,
          width: Math.max(0, x(previous) - plot.left),
          height: 3,
          rx: 1.5,
          class: 'bar-ghost-rule'
        }));
      } else {
        rules.push(null);
      }
      var bar = svg.rect(root, {
        x: plot.left,
        y: cy - barHeight / 2,
        width: Math.max(0, x(value) - plot.left),
        height: barHeight,
        rx: Math.min(4, barHeight / 2),
        class: 'bar-current'
      });
      bars.push(bar);
      var nearEnd = x(value) > plot.right - 50;
      labels.push(common.placeValueLabel(root, nearEnd ? x(value) - 8 : x(value) + 8, cy, NC.fmt.number(value, 0), {
        anchor: nearEnd ? 'end' : 'start',
        class: nearEnd ? 'value-label inside' : 'value-label end'
      }));
      var handle = svg.mkHandle(handleLayer, x(value), cy, {
        min: 0,
        max: max,
        now: value,
        radius: common.screenPx(root, 6),
        hitRadius: common.screenPx(root, compact ? 22 : 18),
        orientation: 'horizontal',
        label: category.label_en + ' ' + current.name_en,
        valueText: tipText(dataset, current, baseline, categoryIndex)
      });
      handle.group.setAttribute('data-index', categoryIndex);
      handle.group.setAttribute('data-category', category.id);
      handles.push({ handle: handle, categoryIndex: categoryIndex, row: row });
    });

    function showTip(categoryIndex, row) {
      var cy = band.center(row);
      common.showTip(lab.plot, tipText(dataset, current, baseline, categoryIndex), root, x(current.values[categoryIndex]), cy);
      lab.barState.tipIndex = categoryIndex;
      lab.barState.tipRow = row;
    }

    function hideTip() {
      common.hideTip(lab.plot);
      if (lab.barState) {
        lab.barState.tipIndex = null;
        lab.barState.tipRow = null;
      }
      common.clearEmphasis(lab.plot);
    }

    lab.barState = {
      layout: 'horizontal',
      plot: plot,
      x: x,
      band: band,
      barHeight: barHeight,
      order: order,
      current: current,
      baseline: baseline,
      bars: bars,
      rules: rules,
      labels: labels,
      handles: handles,
      max: max,
      root: root,
      tipIndex: null,
      tipRow: null
    };

    order.forEach(function (categoryIndex, row) {
      var item = handles[row];
      var category = dataset.categories[categoryIndex];
      var show = function () { showTip(categoryIndex, row); };
      var optsHandle = {
        axis: 'x',
        min: 0,
        max: max,
        step: 5,
        pixelSpan: plot.width,
        get: function () { return current.values[categoryIndex]; },
        set: function (next) { current.values[categoryIndex] = next; },
        onStart: show,
        onUpdate: function () { lab.changed(false); show(); },
        onCommit: function () {
          lab.changed(true);
          var categoryId = category.id;
          renderHorizontal(lab);
          var next = lab.svg.querySelector('.handle[data-category="' + categoryId + '"]');
          if (next) {
            try { next.focus({ preventScroll: true }); } catch (err) { next.focus(); }
          }
        },
        onEnd: show,
        valueText: function (next) {
          return category.label_en + ', ' + NC.fmt.value(next, dataset.unit, 0);
        }
      };
      NC.drag.bind(item.handle.group, optsHandle);
      NC.drag.bind(bars[row], optsHandle);
      [item.handle.group, bars[row]].forEach(function (target) {
        target.addEventListener('pointerenter', function () {
          common.emphasize(lab.plot, 'current');
          show();
        });
        target.addEventListener('pointerleave', hideTip);
      });
      item.handle.group.addEventListener('focus', show);
      item.handle.group.addEventListener('blur', hideTip);
    });
    legend.items.forEach(function (item) {
      item.addEventListener('pointerenter', function () { common.emphasize(lab.plot, item.getAttribute('data-legend')); });
      item.addEventListener('pointerleave', function () { common.clearEmphasis(lab.plot); });
    });

    lab.motion = { bars: bars, rules: rules, handles: handles.map(function (item) { return item.handle; }), labels: labels };
  }

  function updateHorizontal(lab) {
    var state = lab.barState;
    if (!state || state.layout !== 'horizontal') return;
    state.order.forEach(function (categoryIndex, row) {
      var value = state.current.values[categoryIndex];
      var previous = state.baseline ? state.baseline.values[categoryIndex] : null;
      var nearEnd = state.x(value) > state.plot.right - 50;
      if (state.bars[row]) state.bars[row].setAttribute('width', Math.max(0, state.x(value) - state.plot.left));
      if (previous != null && state.rules[row]) state.rules[row].setAttribute('width', Math.max(0, state.x(previous) - state.plot.left));
      var item = state.handles[row];
      if (item) {
        svg.move(item.handle, state.x(value), state.band.center(item.row));
        svg.setSlider(item.handle, value, lab.dataset.categories[categoryIndex].label_en + ', ' + NC.fmt.value(value, lab.dataset.unit, 0));
      }
      var label = state.labels[row];
      if (label) {
        label.setAttribute('x', nearEnd ? state.x(value) - 8 : state.x(value) + 8);
        label.setAttribute('text-anchor', nearEnd ? 'end' : 'start');
        label.setAttribute('class', nearEnd ? 'value-label inside' : 'value-label end');
        label.textContent = NC.fmt.number(value, 0);
      }
    });
    if (typeof state.tipIndex === 'number' && state.tipRow != null) {
      common.showTip(lab.plot, tipText(lab.dataset, state.current, state.baseline, state.tipIndex), state.root, state.x(state.current.values[state.tipIndex]), state.band.center(state.tipRow));
    }
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
