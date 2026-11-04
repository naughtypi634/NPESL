(function (NC) {
  'use strict';

  var svg = NC.svg;
  var common = NC.renderCommon;

  function ensureMode(lab) {
    if (!lab.mode.direction) lab.mode.direction = 'vertical';
    if (!lab.mode.layout) lab.mode.layout = 'grouped';
  }

  function totals(dataset) {
    return dataset.categories.map(function (category, index) {
      return dataset.series.reduce(function (sum, series) {
        return sum + series.values[index];
      }, 0);
    });
  }

  function maxIndividual(dataset) {
    var max = 0;
    dataset.series.forEach(function (series) {
      series.values.forEach(function (value) {
        if (value > max) max = value;
      });
    });
    return max;
  }

  function niceMax(value) {
    if (!isFinite(value) || value <= 0) return 100;
    var step = Math.pow(10, Math.floor(Math.log10(value)));
    var scaled = value / step;
    var nice = scaled <= 1.2 ? 1.2 : scaled <= 2 ? 2 : scaled <= 2.5 ? 2.5 : scaled <= 3 ? 3 : scaled <= 5 ? 5 : 10;
    return Math.ceil(nice * step);
  }

  function buildControls(lab) {
    var host = lab.modesHost;
    if (!host) return;
    host.innerHTML = '';

    var direction = document.createElement('div');
    direction.className = 'mode-group';
    var directionLabel = document.createElement('span');
    directionLabel.className = 'mode-label';
    directionLabel.textContent = '方向';
    direction.appendChild(directionLabel);
    var directionHost = document.createElement('div');
    direction.appendChild(directionHost);
    NC.segment(directionHost, {
      label: '方向',
      value: lab.mode.direction,
      options: [{ value: 'vertical', zh: '竖向' }, { value: 'horizontal', zh: '横向' }]
    }, function (value) {
      lab.setMode({ direction: value });
    });
    host.appendChild(direction);

    var layout = document.createElement('div');
    layout.className = 'mode-group';
    var layoutLabel = document.createElement('span');
    layoutLabel.className = 'mode-label';
    layoutLabel.textContent = '排列';
    layout.appendChild(layoutLabel);
    var layoutHost = document.createElement('div');
    layout.appendChild(layoutHost);
    NC.segment(layoutHost, {
      label: '排列',
      value: lab.mode.layout,
      options: [{ value: 'grouped', zh: '分组' }, { value: 'stacked', zh: '堆叠' }]
    }, function (value) {
      lab.setMode({ layout: value });
    });
    host.appendChild(layout);
  }

  function legend(lab, dataset) {
    var host = document.createElement('div');
    host.className = 'legend-host';
    lab.plot.appendChild(host);
    return common.legend(host, dataset.series.map(function (series) {
      return { label: series.name_en, color: 'var(--' + series.color + ')', key: series.id };
    }));
  }

  function tipText(dataset, seriesIndex, categoryIndex) {
    var series = dataset.series[seriesIndex];
    var category = dataset.categories[categoryIndex];
    return category.label_en + ' · ' + series.name_en + ': ' + NC.fmt.value(series.values[categoryIndex], dataset.unit, 0);
  }

  function hasSeries(dataset) {
    return dataset.series && dataset.series.length > 0;
  }

  function bindBar(target, lab, seriesIndex, categoryIndex, handle, showTip) {
    var dataset = lab.dataset;
    var state = lab.barState;
    var series = dataset.series[seriesIndex];
    NC.drag.bind(target, {
      axis: state.direction === 'horizontal' ? 'x' : 'y',
      min: 0,
      max: state.max,
      step: dataset.step || 5,
      pixelSpan: state.direction === 'horizontal' ? state.plot.width : state.plot.height,
      get: function () { return series.values[categoryIndex]; },
      set: function (value) { series.values[categoryIndex] = value; },
      onStart: showTip,
      onUpdate: function () {
        if (lab.renderer && lab.renderer.update) lab.renderer.update(lab);
        lab.refresh(false);
        showTip();
      },
      onCommit: function () {
        lab.changed(true);
        if (state.direction === 'horizontal' && state.layout === 'grouped') {
          var categoryId = dataset.categories[categoryIndex].id;
          lab.renderer.render(lab);
          var next = lab.plot.querySelector('.handle[data-category="' + categoryId + '"]');
          if (next) {
            try { next.focus({ preventScroll: true }); } catch (err) { next.focus(); }
          }
        }
        showTip();
      },
      onEnd: showTip,
      valueText: function (value) {
        return dataset.categories[categoryIndex].label_en + ', ' + NC.fmt.value(value, dataset.unit, 0);
      }
    });
  }

  function showTipFactory(lab) {
    return function (seriesIndex, categoryIndex, x, y, text) {
      common.showTip(lab.plot, text || tipText(lab.dataset, seriesIndex, categoryIndex), lab.svg, x, y);
    };
  }

  function drawVertical(lab) {
    var dataset = lab.dataset;
    var state = lab.barState;
    var width = 720;
    var height = 400;
    var root = svg.create(lab.plot, width, height, 'Bar chart of revenue by region and product line. Drag a bar to change a value.');
    lab.svg = root;
    var compact = common.fit(root);
    lab.compact = compact;
    var plot = common.plot(width, height, compact);
    plot.bottom = height - 64;
    plot.height = plot.bottom - plot.top;
    var layout = lab.mode.layout;
    var max = layout === 'stacked' ? dataset.max : niceMax(Math.max(maxIndividual(dataset), 1) * 1.12);
    var y = NC.scale.linear(0, max, plot.bottom, plot.top);
    var band = NC.scale.band(dataset.categories.length, plot.left, plot.right, 0.32);

    state.direction = 'vertical';
    state.layout = layout;
    state.plot = plot;
    state.y = y;
    state.band = band;
    state.max = max;

    common.drawYAxis(root, {
      left: plot.left, right: plot.right, top: plot.top, bottom: plot.bottom,
      min: 0, max: max, scale: y,
      format: function (value) { return NC.fmt.axis(value); }
    });
    common.drawXAxis(root, {
      left: plot.left, right: plot.right, bottom: plot.bottom,
      labels: dataset.categories.map(function (category) { return category.label_en; }),
      x: function (index) { return band.center(index); }
    });

    var seriesCount = dataset.series.length;
    var barWidth = layout === 'stacked'
      ? Math.min(46, band.width * 0.48)
      : Math.min(18, band.width * 0.72 / seriesCount);
    var barGap = 2;
    var groupWidth = barWidth * seriesCount + barGap * (seriesCount - 1);
    var groupTotals = totals(dataset);
    var bars = [];
    var handles = [];
    var segments = [];
    var labels = [];
    var handleLayer = svg.group(root, { class: 'handles' });
    var showTip = showTipFactory(lab);

    dataset.categories.forEach(function (category, categoryIndex) {
      var center = band.center(categoryIndex);
      if (layout === 'stacked') {
        var base = 0;
        dataset.series.forEach(function (series, seriesIndex) {
          var value = series.values[categoryIndex];
          var bottom = y(base);
          var top = y(base + value);
          var rect = svg.rect(root, {
            x: center - barWidth / 2,
            y: top,
            width: barWidth,
            height: Math.max(0, bottom - top),
            class: 'bar-segment',
            fill: 'var(--' + series.color + ')',
            'data-series': series.id,
            'data-index': categoryIndex
          });
          rect.addEventListener('pointerenter', function () {
            common.emphasize(lab.plot, series.id);
            showTip(seriesIndex, categoryIndex, center, top);
          });
          rect.addEventListener('pointerleave', function () {
            common.clearEmphasis(lab.plot);
            common.hideTip(lab.plot);
          });
          bars.push(rect);
          NC.bindValueClick(rect, lab, (function (si, ci, node) {
            return function () {
              return {
                root: root,
                x: center,
                y: node.getAttribute('y'),
                value: dataset.series[si].values[ci],
                min: 0,
                max: max,
                step: dataset.step || 5,
                label: category.label_en + ' ' + dataset.series[si].name_en,
                unit: dataset.unit,
                set: function (value) { dataset.series[si].values[ci] = value; },
                onCommit: function () {
                  lab.changed(true);
                  lab.renderer.render(lab);
                  lab.refresh(false);
                }
              };
            };
          })(seriesIndex, categoryIndex, rect));

          var stackHandle = svg.mkHandle(handleLayer, center, top, {
            min: 0,
            max: max,
            now: value,
            radius: common.screenPx(root, 4),
            hitRadius: common.screenPx(root, 14),
            label: category.label_en + ' ' + series.name_en,
            valueText: tipText(dataset, seriesIndex, categoryIndex),
            data: { series: seriesIndex, index: categoryIndex, category: category.id }
          });
          NC.drag.bind(stackHandle.group, {
            axis: 'y',
            min: 0,
            max: max,
            step: dataset.step || 5,
            pixelSpan: plot.height,
            get: function () { return dataset.series[seriesIndex].values[categoryIndex]; },
            set: function (next) {
              var total = dataset.series.reduce(function (sum, item) { return sum + item.values[categoryIndex]; }, 0);
              var room = max - (total - dataset.series[seriesIndex].values[categoryIndex]);
              dataset.series[seriesIndex].values[categoryIndex] = Math.max(0, Math.min(room, next));
            },
            onStart: function () { showTip(seriesIndex, categoryIndex, center, top); },
            onUpdate: function () { lab.changed(false); showTip(seriesIndex, categoryIndex, center, y(dataset.series[seriesIndex].values[categoryIndex])); },
            onCommit: function () { lab.changed(true); },
            onEnd: function () { showTip(seriesIndex, categoryIndex, center, y(dataset.series[seriesIndex].values[categoryIndex])); },
            valueText: function (next) { return category.label_en + ', ' + NC.fmt.value(next, dataset.unit, 0); }
          });
          NC.bindValueClick(stackHandle.group, lab, (function (si, ci, px) {
            return function () {
              return {
                root: root,
                x: px,
                y: y(dataset.series[si].values[ci]),
                value: dataset.series[si].values[ci],
                min: 0,
                max: max,
                step: dataset.step || 5,
                label: category.label_en + ' ' + dataset.series[si].name_en,
                unit: dataset.unit,
                set: function (next) { dataset.series[si].values[ci] = next; },
                onCommit: function () { lab.changed(true); }
              };
            };
          })(seriesIndex, categoryIndex, center));
          handles.push({ handle: stackHandle, seriesIndex: seriesIndex, categoryIndex: categoryIndex });
          segments.push({ rect: rect, seriesIndex: seriesIndex, categoryIndex: categoryIndex });
          base += value;
        });
      } else {
        var start = center - groupWidth / 2;
        dataset.series.forEach(function (series, seriesIndex) {
          var value = series.values[categoryIndex];
          var x = start + seriesIndex * (barWidth + barGap);
          var rect = svg.rect(root, {
            x: x,
            y: y(value),
            width: barWidth,
            height: Math.max(0, plot.bottom - y(value)),
            class: 'bar-current',
            fill: 'var(--' + series.color + ')',
            'data-series': series.id,
            'data-index': categoryIndex
          });
          rect.addEventListener('pointerenter', function () {
            common.emphasize(lab.plot, series.id);
            showTip(seriesIndex, categoryIndex, x + barWidth / 2, y(value));
          });
          rect.addEventListener('pointerleave', function () {
            common.clearEmphasis(lab.plot);
            common.hideTip(lab.plot);
          });
          bars.push(rect);
          NC.bindValueClick(rect, lab, (function (si, ci, px) {
            return function () {
              return {
                root: root,
                x: px,
                y: y(dataset.series[si].values[ci]),
                value: dataset.series[si].values[ci],
                min: 0,
                max: max,
                step: dataset.step || 5,
                label: category.label_en + ' ' + dataset.series[si].name_en,
                unit: dataset.unit,
                set: function (value) { dataset.series[si].values[ci] = value; },
                onCommit: function () { lab.changed(true); }
              };
            };
          })(seriesIndex, categoryIndex, x + barWidth / 2));

          var handle = svg.mkHandle(handleLayer, x + barWidth / 2, y(value), {
            min: 0,
            max: max,
            now: value,
            radius: common.screenPx(root, 4.5),
            hitRadius: common.screenPx(root, 15),
            label: category.label_en + ' ' + series.name_en,
            valueText: tipText(dataset, seriesIndex, categoryIndex),
            data: { series: seriesIndex, index: categoryIndex, category: category.id }
          });
          bindBar(handle.group, lab, seriesIndex, categoryIndex, handle, function () {
            showTip(seriesIndex, categoryIndex, x + barWidth / 2, y(series.values[categoryIndex]));
          });
          NC.bindValueClick(handle.group, lab, (function (si, ci, px) {
            return function () {
              return {
                root: root,
                x: px,
                y: y(dataset.series[si].values[ci]),
                value: dataset.series[si].values[ci],
                min: 0,
                max: max,
                step: dataset.step || 5,
                label: category.label_en + ' ' + dataset.series[si].name_en,
                unit: dataset.unit,
                set: function (value) { dataset.series[si].values[ci] = value; },
                onCommit: function () { lab.changed(true); }
              };
            };
          })(seriesIndex, categoryIndex, x + barWidth / 2));
          handle.group.addEventListener('pointerenter', function () {
            showTip(seriesIndex, categoryIndex, x + barWidth / 2, y(series.values[categoryIndex]));
          });
          handle.group.addEventListener('pointerleave', function () { common.hideTip(lab.plot); });
          handles.push({ handle: handle, seriesIndex: seriesIndex, categoryIndex: categoryIndex });
        });
      }

      if (layout === 'stacked') {
        labels.push({
          node: common.placeValueLabel(root, center, y(groupTotals[categoryIndex]) - 10, NC.fmt.number(groupTotals[categoryIndex], 0), {
            top: plot.top + 12
          })
        });
      } else {
        dataset.series.forEach(function (series, seriesIndex) {
          if (compact && seriesIndex !== 0) return;
          var start = center - groupWidth / 2;
          var x = start + seriesIndex * (barWidth + barGap);
          labels.push({
            node: common.placeValueLabel(root, x + barWidth / 2, y(series.values[categoryIndex]) - 8, NC.fmt.number(series.values[categoryIndex], 0), {
              top: plot.top + 12,
              class: 'value-label'
            }),
            seriesIndex: seriesIndex,
            categoryIndex: categoryIndex
          });
        });
      }
    });

    legend(lab, dataset);
    state.bars = bars;
    state.handles = handles;
    state.segments = segments;
    state.labels = labels;
    state.barWidth = barWidth;
    state.barGap = barGap;
    state.groupWidth = groupWidth;
    state.groupTotals = groupTotals;
    state.root = root;
    lab.motion = { bars: bars, handles: handles.map(function (item) { return item.handle; }), labels: labels.map(function (item) { return item.node || item; }) };

    handles.forEach(function (item) {
      item.handle.group.addEventListener('focus', function () {
        var center = state.band.center(item.categoryIndex);
        var start = center - state.groupWidth / 2;
        var x = start + item.seriesIndex * (state.barWidth + state.barGap) + state.barWidth / 2;
        showTip(item.seriesIndex, item.categoryIndex, x, state.y(dataset.series[item.seriesIndex].values[item.categoryIndex]));
      });
      item.handle.group.addEventListener('blur', function () { common.hideTip(lab.plot); });
    });
  }

  function updateVertical(lab) {
    var state = lab.barState;
    if (!state || state.direction !== 'vertical') return;
    var dataset = lab.dataset;
    var y = state.y;
    var band = state.band;
    if (state.layout === 'stacked') {
      dataset.categories.forEach(function (category, categoryIndex) {
        var cumulative = 0;
        dataset.series.forEach(function (series, seriesIndex) {
          var value = series.values[categoryIndex];
          var segment = state.segments.filter(function (item) {
            return item.seriesIndex === seriesIndex && item.categoryIndex === categoryIndex;
          })[0];
          if (segment) {
            segment.rect.setAttribute('y', y(cumulative + value));
            segment.rect.setAttribute('height', Math.max(0, y(cumulative) - y(cumulative + value)));
          }
          var handle = state.handles.filter(function (item) {
            return item.seriesIndex === seriesIndex && item.categoryIndex === categoryIndex;
          })[0];
          cumulative += value;
          if (handle) {
            svg.move(handle.handle, band.center(categoryIndex), y(cumulative));
            svg.setSlider(handle.handle, value, tipText(dataset, seriesIndex, categoryIndex));
          }
        });
        var label = state.labels[categoryIndex];
        if (label && label.node) {
          label.node.setAttribute('y', Math.max(state.plot.top + 12, y(cumulative) - 10));
          label.node.textContent = NC.fmt.number(cumulative, 0);
        }
      });
      return;
    }
    var barWidth = state.barWidth;
    var barGap = state.barGap;
    var groupWidth = state.groupWidth;
    dataset.series.forEach(function (series, seriesIndex) {
      series.values.forEach(function (value, categoryIndex) {
        var center = band.center(categoryIndex);
        var start = center - groupWidth / 2;
        var x = start + seriesIndex * (barWidth + barGap);
        var bar = state.bars[categoryIndex * dataset.series.length + seriesIndex];
        if (bar) {
          bar.setAttribute('y', y(value));
          bar.setAttribute('height', Math.max(0, state.plot.bottom - y(value)));
        }
        var item = state.handles.filter(function (handle) {
          return handle.seriesIndex === seriesIndex && handle.categoryIndex === categoryIndex;
        })[0];
        if (item) {
          svg.move(item.handle, x + barWidth / 2, y(value));
          svg.setSlider(item.handle, value, tipText(dataset, seriesIndex, categoryIndex));
        }
      });
    });
    state.labels.forEach(function (item) {
      if (!item.node || item.seriesIndex == null) return;
      var value = dataset.series[item.seriesIndex].values[item.categoryIndex];
      var center = band.center(item.categoryIndex);
      var start = center - groupWidth / 2;
      var x = start + item.seriesIndex * (barWidth + barGap);
      item.node.setAttribute('x', x + barWidth / 2);
      item.node.setAttribute('y', Math.max(state.plot.top + 12, y(value) - 8));
      item.node.textContent = NC.fmt.number(value, 0);
    });
  }

  function drawHorizontal(lab) {
    var dataset = lab.dataset;
    var state = lab.barState;
    var width = 720;
    var height = 420;
    var root = svg.create(lab.plot, width, height, 'Horizontal bar chart ranking regions by revenue. Drag a bar to change a value.');
    lab.svg = root;
    var compact = common.fit(root);
    lab.compact = compact;
    var plot = common.plot(width, height, compact);
    plot.left = compact ? 100 : 132;
    plot.top = 24;
    plot.bottom = height - 46;
    plot.width = plot.right - plot.left;
    plot.height = plot.bottom - plot.top;
    var layout = lab.mode.layout;
    var max = layout === 'stacked' ? dataset.max : niceMax(Math.max(maxIndividual(dataset), 1) * 1.18);
    var x = NC.scale.linear(0, max, plot.left, plot.right);
    var groupTotals = totals(dataset);
    var order = dataset.categories.map(function (category, index) { return index; })
      .sort(function (a, b) { return groupTotals[b] - groupTotals[a]; });
    var band = NC.scale.band(order.length, plot.top, plot.bottom, 0.28);
    var seriesCount = dataset.series.length;
    var barHeight = layout === 'stacked'
      ? Math.min(30, band.width * 0.56)
      : Math.min(13, band.width * 0.7 / seriesCount);
    var barGap = 2;
    var groupHeight = barHeight * seriesCount + barGap * (seriesCount - 1);

    state.direction = 'horizontal';
    state.layout = layout;
    state.plot = plot;
    state.x = x;
    state.band = band;
    state.order = order;
    state.max = max;

    var ticks = NC.scale.ticks(0, max, 5);
    ticks.forEach(function (tick) {
      var px = x(tick);
      svg.line(root, { x1: px, x2: px, y1: plot.top, y2: plot.bottom, class: tick === 0 ? 'axis-line' : 'grid-line' });
      svg.text(root, { x: px, y: plot.bottom + 20, 'text-anchor': 'middle', class: 'axis-label' }, NC.fmt.axis(tick));
    });

    var bars = [];
    var handles = [];
    var segments = [];
    var labels = [];
    var handleLayer = svg.group(root, { class: 'handles' });
    var showTip = showTipFactory(lab);

    order.forEach(function (categoryIndex, row) {
      var category = dataset.categories[categoryIndex];
      var cy = band.center(row);
      var name = svg.text(root, {
        x: plot.left - 12,
        y: cy,
        'text-anchor': 'end',
        'dominant-baseline': 'middle',
        class: 'axis-label category-label'
      }, category.label_en);
      common.fitText(name, plot.left - 22);

      if (layout === 'stacked') {
        var cumulative = 0;
        dataset.series.forEach(function (series, seriesIndex) {
          var value = series.values[categoryIndex];
          var rect = svg.rect(root, {
            x: x(cumulative),
            y: cy - barHeight / 2,
            width: Math.max(0, x(cumulative + value) - x(cumulative)),
            height: barHeight,
            class: 'bar-segment',
            fill: 'var(--' + series.color + ')',
            'data-series': series.id,
            'data-index': categoryIndex
          });
          rect.addEventListener('pointerenter', function () {
            common.emphasize(lab.plot, series.id);
            showTip(seriesIndex, categoryIndex, x(cumulative + value / 2), cy);
          });
          rect.addEventListener('pointerleave', function () {
            common.clearEmphasis(lab.plot);
            common.hideTip(lab.plot);
          });
          bars.push(rect);
          NC.bindValueClick(rect, lab, (function (si, ci, px) {
            return function () {
              return {
                root: root,
                x: px,
                y: cy,
                value: dataset.series[si].values[ci],
                min: 0,
                max: max,
                step: dataset.step || 5,
                label: category.label_en + ' ' + dataset.series[si].name_en,
                unit: dataset.unit,
                set: function (value) { dataset.series[si].values[ci] = value; },
                onCommit: function () {
                  lab.changed(true);
                  lab.renderer.render(lab);
                  lab.refresh(false);
                }
              };
            };
          })(seriesIndex, categoryIndex, x(cumulative + value)));

          var stackHandle = svg.mkHandle(handleLayer, x(cumulative + value), cy, {
            min: 0,
            max: max,
            now: value,
            radius: common.screenPx(root, 4),
            hitRadius: common.screenPx(root, compact ? 16 : 13),
            orientation: 'horizontal',
            label: category.label_en + ' ' + series.name_en,
            valueText: tipText(dataset, seriesIndex, categoryIndex),
            data: { series: seriesIndex, index: categoryIndex, category: category.id }
          });
          NC.drag.bind(stackHandle.group, {
            axis: 'x',
            min: 0,
            max: max,
            step: dataset.step || 5,
            pixelSpan: plot.width,
            get: function () { return dataset.series[seriesIndex].values[categoryIndex]; },
            set: function (next) {
              var total = dataset.series.reduce(function (sum, item) { return sum + item.values[categoryIndex]; }, 0);
              var room = max - (total - dataset.series[seriesIndex].values[categoryIndex]);
              dataset.series[seriesIndex].values[categoryIndex] = Math.max(0, Math.min(room, next));
            },
            onStart: function () { showTip(seriesIndex, categoryIndex, x(cumulative + value), cy); },
            onUpdate: function () { lab.changed(false); showTip(seriesIndex, categoryIndex, x(cumulative), cy); },
            onCommit: function () { lab.changed(true); },
            onEnd: function () { showTip(seriesIndex, categoryIndex, x(cumulative), cy); },
            valueText: function (next) { return category.label_en + ', ' + NC.fmt.value(next, dataset.unit, 0); }
          });
          NC.bindValueClick(stackHandle.group, lab, (function (si, ci, py) {
            return function () {
              return {
                root: root,
                x: x(dataset.series[si].values[ci]),
                y: py,
                value: dataset.series[si].values[ci],
                min: 0,
                max: max,
                step: dataset.step || 5,
                label: category.label_en + ' ' + dataset.series[si].name_en,
                unit: dataset.unit,
                set: function (next) { dataset.series[si].values[ci] = next; },
                onCommit: function () { lab.changed(true); }
              };
            };
          })(seriesIndex, categoryIndex, cy));
          handles.push({ handle: stackHandle, seriesIndex: seriesIndex, categoryIndex: categoryIndex, row: row });
          segments.push({ rect: rect, seriesIndex: seriesIndex, categoryIndex: categoryIndex, row: row });
          cumulative += value;
        });
      } else {
        var top = cy - groupHeight / 2;
        dataset.series.forEach(function (series, seriesIndex) {
          var value = series.values[categoryIndex];
          var by = top + seriesIndex * (barHeight + barGap);
          var rect = svg.rect(root, {
            x: plot.left,
            y: by,
            width: Math.max(0, x(value) - plot.left),
            height: barHeight,
            rx: Math.min(3, barHeight / 2),
            class: 'bar-current',
            fill: 'var(--' + series.color + ')',
            'data-series': series.id,
            'data-index': categoryIndex
          });
          rect.addEventListener('pointerenter', function () {
            common.emphasize(lab.plot, series.id);
            showTip(seriesIndex, categoryIndex, x(value), by + barHeight / 2);
          });
          rect.addEventListener('pointerleave', function () {
            common.clearEmphasis(lab.plot);
            common.hideTip(lab.plot);
          });
          bars.push(rect);
          if (compact && seriesIndex !== 0) {
            // Keep the compact chart quiet: only the leading series is labeled.
          } else {
          var nearEndBar = x(value) > plot.right - 44;
          labels.push({
            node: common.placeValueLabel(root, nearEndBar ? x(value) - 6 : x(value) + 8, by + barHeight / 2, NC.fmt.number(value, 0), {
              anchor: nearEndBar ? 'end' : 'start',
              class: nearEndBar ? 'value-label inside' : 'value-label end'
            }),
            seriesIndex: seriesIndex,
            categoryIndex: categoryIndex,
            row: row
          });
          }

          NC.bindValueClick(rect, lab, (function (si, ci, px, py) {
            return function () {
              return {
                root: root,
                x: px,
                y: py,
                value: dataset.series[si].values[ci],
                min: 0,
                max: max,
                step: dataset.step || 5,
                label: category.label_en + ' ' + dataset.series[si].name_en,
                unit: dataset.unit,
                set: function (value) { dataset.series[si].values[ci] = value; },
                onCommit: function () { lab.changed(true); }
              };
            };
          })(seriesIndex, categoryIndex, x(value), by + barHeight / 2));

          var handle = svg.mkHandle(handleLayer, x(value), by + barHeight / 2, {
            min: 0,
            max: max,
            now: value,
            radius: common.screenPx(root, 4),
            hitRadius: common.screenPx(root, compact ? 16 : 13),
            orientation: 'horizontal',
            label: category.label_en + ' ' + series.name_en,
            valueText: tipText(dataset, seriesIndex, categoryIndex),
            data: { series: seriesIndex, index: categoryIndex, category: category.id }
          });
          bindBar(handle.group, lab, seriesIndex, categoryIndex, handle, function () {
            showTip(seriesIndex, categoryIndex, x(series.values[categoryIndex]), by + barHeight / 2);
          });
          NC.bindValueClick(handle.group, lab, (function (si, ci, py) {
            return function () {
              return {
                root: root,
                x: x(dataset.series[si].values[ci]),
                y: py,
                value: dataset.series[si].values[ci],
                min: 0,
                max: max,
                step: dataset.step || 5,
                label: category.label_en + ' ' + dataset.series[si].name_en,
                unit: dataset.unit,
                set: function (value) { dataset.series[si].values[ci] = value; },
                onCommit: function () { lab.changed(true); }
              };
            };
          })(seriesIndex, categoryIndex, by + barHeight / 2));
          handle.group.addEventListener('pointerenter', function () {
            showTip(seriesIndex, categoryIndex, x(series.values[categoryIndex]), by + barHeight / 2);
          });
          handle.group.addEventListener('pointerleave', function () { common.hideTip(lab.plot); });
          handles.push({ handle: handle, seriesIndex: seriesIndex, categoryIndex: categoryIndex, row: row });
        });
      }

      if (layout === 'stacked') {
        var total = groupTotals[categoryIndex];
        var nearEnd = x(total) > plot.right - 48;
        labels.push({
          node: common.placeValueLabel(root, nearEnd ? x(total) - 8 : x(total) + 8, cy, NC.fmt.number(total, 0), {
            anchor: nearEnd ? 'end' : 'start',
            class: nearEnd ? 'value-label inside' : 'value-label end'
          }),
          categoryIndex: categoryIndex,
          row: row
        });
      }
    });

    legend(lab, dataset);
    state.bars = bars;
    state.handles = handles;
    state.segments = segments;
    state.labels = labels;
    state.barHeight = barHeight;
    state.barGap = barGap;
    state.groupHeight = groupHeight;
    state.groupTotals = groupTotals;
    state.root = root;
    lab.motion = { bars: bars, handles: handles.map(function (item) { return item.handle; }), labels: labels.map(function (item) { return item.node || item; }) };

    handles.forEach(function (item) {
      item.handle.group.addEventListener('focus', function () {
        showTip(item.seriesIndex, item.categoryIndex, x(dataset.series[item.seriesIndex].values[item.categoryIndex]), band.center(item.row));
      });
      item.handle.group.addEventListener('blur', function () { common.hideTip(lab.plot); });
    });
  }

  function updateHorizontal(lab) {
    var state = lab.barState;
    if (!state || state.direction !== 'horizontal') return;
    var dataset = lab.dataset;
    var x = state.x;
    var band = state.band;
    if (state.layout === 'stacked') {
      state.order.forEach(function (categoryIndex, row) {
        var cy = band.center(row);
        var cumulative = 0;
        dataset.series.forEach(function (series, seriesIndex) {
          var value = series.values[categoryIndex];
          var segment = state.segments.filter(function (item) {
            return item.seriesIndex === seriesIndex && item.categoryIndex === categoryIndex;
          })[0];
          if (segment) {
            segment.rect.setAttribute('x', x(cumulative));
            segment.rect.setAttribute('width', Math.max(0, x(cumulative + value) - x(cumulative)));
          }
          cumulative += value;
          var handle = state.handles.filter(function (item) {
            return item.seriesIndex === seriesIndex && item.categoryIndex === categoryIndex;
          })[0];
          if (handle) {
            svg.move(handle.handle, x(cumulative), cy);
            svg.setSlider(handle.handle, value, tipText(dataset, seriesIndex, categoryIndex));
          }
        });
        var label = state.labels.filter(function (item) {
          return item.categoryIndex === categoryIndex;
        })[0];
        if (label && label.node) {
          var nearEnd = x(cumulative) > state.plot.right - 48;
          label.node.setAttribute('x', nearEnd ? x(cumulative) - 8 : x(cumulative) + 8);
          label.node.setAttribute('text-anchor', nearEnd ? 'end' : 'start');
          label.node.setAttribute('class', nearEnd ? 'value-label inside' : 'value-label end');
          label.node.textContent = NC.fmt.number(cumulative, 0);
        }
      });
      return;
    }
    dataset.series.forEach(function (series, seriesIndex) {
      series.values.forEach(function (value, categoryIndex) {
        var item = state.handles.filter(function (handle) {
          return handle.seriesIndex === seriesIndex && handle.categoryIndex === categoryIndex;
        })[0];
        if (!item) return;
        var cy = band.center(item.row);
        var top = cy - state.groupHeight / 2;
        var by = top + seriesIndex * (state.barHeight + state.barGap);
        var bar = state.bars.filter(function (node) {
          return node.getAttribute('data-series') === series.id && Number(node.getAttribute('data-index')) === categoryIndex;
        })[0];
        if (bar) bar.setAttribute('width', Math.max(0, x(value) - state.plot.left));
        svg.move(item.handle, x(value), by + state.barHeight / 2);
        svg.setSlider(item.handle, value, tipText(dataset, seriesIndex, categoryIndex));
      });
    });
    state.labels.forEach(function (item) {
      if (!item.node || item.seriesIndex == null) return;
      var value = dataset.series[item.seriesIndex].values[item.categoryIndex];
      var nearEnd = x(value) > state.plot.right - 44;
      item.node.setAttribute('x', nearEnd ? x(value) - 6 : x(value) + 8);
      item.node.setAttribute('text-anchor', nearEnd ? 'end' : 'start');
      item.node.setAttribute('class', nearEnd ? 'value-label inside' : 'value-label end');
      item.node.textContent = NC.fmt.number(value, 0);
    });
  }

  function render(lab) {
    ensureMode(lab);
    buildControls(lab);
    lab.barState = {};
    if (lab.mode.direction === 'horizontal') {
      drawHorizontal(lab);
    } else {
      drawVertical(lab);
    }
  }

  function update(lab) {
    if (lab.mode.direction === 'horizontal') {
      updateHorizontal(lab);
    } else {
      updateVertical(lab);
    }
  }

  function describe(lab) {
    return NC.desc.bar(lab.dataset, NC.state.level, lab.mode);
  }

  function tableSpec(lab) {
    var dataset = lab.dataset;
    var groupTotals = totals(dataset);
    return {
      columns: [
        { label: 'Region' }
      ].concat(dataset.series.map(function (series) {
        return { label: series.name_en + ' · ' + dataset.unit, editable: true, step: 5, decimals: 0, unit: '' };
      })).concat([
        { label: 'Total · ' + dataset.unit },
        { label: 'Share' }
      ]),
      rows: dataset.categories.map(function (category, index) {
        var cells = [{ text: category.label_en + ' · ' + category.label_zh }];
        dataset.series.forEach(function (series, seriesIndex) {
          cells.push({
            value: series.values[index],
            unit: dataset.unit,
            set: function (value) {
              dataset.series[seriesIndex].values[index] = value;
            }
          });
        });
        cells.push({ text: NC.fmt.number(groupTotals[index], 0) });
        var share = groupTotals.reduce(function (sum, value) { return sum + value; }, 0);
        cells.push({ text: NC.fmt.number(share > 0 ? groupTotals[index] / share * 100 : 0, 1) + '%' });
        return { key: category.id, cells: cells };
      })
    };
  }

  NC.renderers.bar = {
    mount: function (lab) { render(lab); },
    render: render,
    update: update,
    describe: describe,
    table: tableSpec
  };
})(window.NPESLCharts);
