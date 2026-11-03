(function (NC) {
  'use strict';

  var svg = NC.svg;
  var common = NC.renderCommon;

  function ensureToggle(lab) {
    var host = lab.section.querySelector('[data-chart-controls]');
    if (!host) return;
    if (host.querySelector('[data-combo-view]')) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'pill compact';
    button.setAttribute('data-combo-view', '');
    button.textContent = lab.comboOverlay ? '改为上下双面板' : '叠加为双轴';
    button.addEventListener('click', function () {
      lab.comboOverlay = !lab.comboOverlay;
      button.textContent = lab.comboOverlay ? '改为上下双面板' : '叠加为双轴';
      render(lab);
      lab.refresh(false);
    });
    host.appendChild(button);
  }

  function render(lab) {
    ensureToggle(lab);
    if (lab.comboOverlay) renderOverlay(lab);
    else renderPanels(lab);
  }

  function commonSetup(lab, width, height, overlay) {
    var dataset = lab.dataset;
    var bars = dataset.series[0];
    var line = dataset.series[1];
    var periods = dataset.periods;
    var n = periods.length;
    var plot = common.plot(width, height);
    plot.top = 36;
    plot.bottom = height - 64;
    plot.left = 70;
    plot.right = width - (overlay ? 74 : 26);
    plot.width = plot.right - plot.left;
    plot.height = plot.bottom - plot.top;
    var band = NC.scale.band(n, plot.left, plot.right, 0.30);
    var root = svg.create(lab.plot, width, height, 'Combo chart of revenue and year-on-year growth. Drag a bar or a point to change the value.');
    lab.svg = root;
    lab.legendHost = lab.legendHost || document.createElement('div');
    lab.legendHost.className = 'legend-host';
    if (!lab.legendHost.parentNode) lab.plot.appendChild(lab.legendHost);
    common.legend(lab.legendHost, [
      { label: bars.name_en + ' (left axis)', color: 'var(--series-1)' },
      { label: line.name_en + ' (right axis)', color: 'var(--series-2)' }
    ]);
    return { dataset: dataset, bars: bars, line: line, periods: periods, n: n, plot: plot, band: band, root: root };
  }

  function drawBars(ctx, y, barWidth, handles, labels, baselineBottom, labelInside) {
    var base = baselineBottom == null ? ctx.plot.bottom : baselineBottom;
    ctx.dataset.periods.forEach(function (period, index) {
      var center = ctx.band.center(index);
      var value = ctx.bars.values[index];
      var top = y(value);
      svg.rect(ctx.root, {
        x: center - barWidth / 2,
        y: top,
        width: barWidth,
        height: Math.max(0, base - top),
        rx: 3,
        class: 'bar-current'
      });
      if (handles) {
        var handle = svg.mkHandle(ctx.root, center, top, {
          min: 0,
          max: ctx.bars.max || 100,
          now: value,
          radius: 6,
          hitRadius: 20,
          label: ctx.bars.name_en + ' in ' + period.label_en,
          valueText: period.label_en + ', ' + NC.fmt.value(value, ctx.bars.unit, ctx.bars.decimals)
        });
        handle.group.setAttribute('data-kind', 'bar');
        handle.group.setAttribute('data-index', ctx.dataset.periods.indexOf(period));
        handles.push(handle);
        labels.push(common.valueLabel(ctx.root, center, labelInside ? top + 16 : top - 12, NC.fmt.number(value, 0), labelInside ? 'value-label inside' : 'value-label'));
      }
    });
  }

  function drawLine(ctx, y, handles, labels) {
    var points = ctx.line.values.map(function (value, index) {
      return [ctx.band.center(index), y(value)];
    });
    var d = points.map(function (point, index) {
      return (index === 0 ? 'M ' : 'L ') + point[0] + ' ' + point[1];
    }).join(' ');
    var path = svg.path(ctx.root, { d: d, class: 'line-path line-path-alt' });
    points.forEach(function (point, index) {
      var handle = svg.mkHandle(ctx.root, point[0], point[1], {
        min: ctx.line.min,
        max: ctx.line.max,
        now: ctx.line.values[index],
        radius: 5,
        hitRadius: 20,
        label: ctx.line.name_en + ' in ' + ctx.periods[index].label_en,
        valueText: ctx.periods[index].label_en + ', ' + NC.fmt.value(ctx.line.values[index], ctx.line.unit, ctx.line.decimals)
      });
      handle.group.setAttribute('data-kind', 'line');
      handle.group.setAttribute('data-index', index);
      handles.push(handle);
      labels.push(common.valueLabel(ctx.root, point[0], point[1] - 12, NC.fmt.number(ctx.line.values[index], 0) + '%', 'value-label alt'));
    });
    return path;
  }

  function renderPanels(lab) {
    var width = 720;
    var height = 460;
    var ctx = commonSetup(lab, width, height, false);
    var topBottom = 262;
    var bottomTop = 312;
    var bottomBottom = height - 64;
    var barsY = NC.scale.linear(0, ctx.bars.max || 100, topBottom, ctx.plot.top);
    var lineY = NC.scale.linear(ctx.line.min, ctx.line.max, bottomBottom, bottomTop);
    var barWidth = Math.min(38, ctx.band.width * 0.58);

    common.caption(ctx.root, ctx.bars.name_en + ' · ' + ctx.bars.unit, { x: 0, y: 14 });
    common.drawYAxis(ctx.root, {
      left: ctx.plot.left, right: ctx.plot.right, top: ctx.plot.top, bottom: topBottom,
      min: 0, max: ctx.bars.max || 100, scale: barsY,
      format: function (value) { return NC.fmt.axis(value); }
    });
    common.drawYAxis(ctx.root, {
      left: ctx.plot.left, right: ctx.plot.right, top: bottomTop, bottom: bottomBottom,
      min: ctx.line.min, max: ctx.line.max, scale: lineY,
      format: function (value) { return NC.fmt.number(value, 0) + '%'; }
    });
    common.drawXAxis(ctx.root, {
      left: ctx.plot.left, right: ctx.plot.right, bottom: bottomBottom,
      labels: ctx.periods.map(function (period) { return period.label_en; }),
      x: function (index) { return ctx.band.center(index); }
    });

    var barHandles = [];
    var barLabels = [];
    drawBars(ctx, barsY, barWidth, barHandles, barLabels, topBottom);
    var lineHandles = [];
    var lineLabels = [];
    var linePath = drawLine(ctx, lineY, lineHandles, lineLabels);

    barHandles.forEach(function (handle, index) {
      NC.drag.bind(handle.group, {
        axis: 'y', min: 0, max: ctx.bars.max || 100, step: 1,
        pixelSpan: topBottom - ctx.plot.top,
        get: function () { return ctx.bars.values[index]; },
        set: function (value) { ctx.bars.values[index] = value; },
        onUpdate: function () { lab.changed(false); },
        onCommit: function () { lab.changed(true); },
        valueText: function (value) {
          return ctx.periods[index].label_en + ', ' + NC.fmt.value(value, ctx.bars.unit, ctx.bars.decimals);
        }
      });
    });
    lineHandles.forEach(function (handle, index) {
      NC.drag.bind(handle.group, {
        axis: 'y', min: ctx.line.min, max: ctx.line.max, step: 1,
        pixelSpan: bottomBottom - bottomTop,
        get: function () { return ctx.line.values[index]; },
        set: function (value) { ctx.line.values[index] = value; },
        onUpdate: function () { lab.changed(false); },
        onCommit: function () { lab.changed(true); },
        valueText: function (value) {
          return ctx.periods[index].label_en + ', ' + NC.fmt.value(value, ctx.line.unit, ctx.line.decimals);
        }
      });
    });

    lab.comboState = {
      view: 'panels', ctx: ctx, barsY: barsY, lineY: lineY,
      barHandles: barHandles, barLabels: barLabels,
      lineHandles: lineHandles, lineLabels: lineLabels,
      linePath: linePath, barWidth: barWidth, topBottom: topBottom,
      bottomTop: bottomTop, bottomBottom: bottomBottom
    };
  }

  function renderOverlay(lab) {
    var width = 720;
    var height = 430;
    var ctx = commonSetup(lab, width, height, true);
    var barsY = NC.scale.linear(0, ctx.bars.max || 100, ctx.plot.bottom, ctx.plot.top);
    var lineY = NC.scale.linear(ctx.line.min, ctx.line.max, ctx.plot.bottom, ctx.plot.top);
    var barWidth = Math.min(30, ctx.band.width * 0.46);

    common.caption(ctx.root, ctx.bars.name_en + ' (bars, left) vs ' + ctx.line.name_en + ' (line, right)', { x: 0, y: 14 });
    common.drawYAxis(ctx.root, {
      left: ctx.plot.left, right: ctx.plot.right, top: ctx.plot.top, bottom: ctx.plot.bottom,
      min: 0, max: ctx.bars.max || 100, scale: barsY,
      format: function (value) { return NC.fmt.axis(value); },
      label: ctx.bars.unit
    });
    var ticks = NC.scale.ticks(ctx.line.min, ctx.line.max, 5);
    ticks.forEach(function (tick) {
      var py = lineY(tick);
      svg.text(ctx.root, {
        x: ctx.plot.right + 10, y: py,
        'text-anchor': 'start',
        'dominant-baseline': 'middle',
        class: 'axis-label'
      }, NC.fmt.number(tick, 0) + '%');
    });
    common.drawXAxis(ctx.root, {
      left: ctx.plot.left, right: ctx.plot.right, bottom: ctx.plot.bottom,
      labels: ctx.periods.map(function (period) { return period.label_en; }),
      x: function (index) { return ctx.band.center(index); }
    });
    svg.text(ctx.root, {
      x: (ctx.plot.left + ctx.plot.right) / 2,
      y: ctx.plot.bottom + 40,
      'text-anchor': 'middle',
      class: 'axis-note'
    }, 'Different units: do not compare the heights directly.');

    var barHandles = [];
    var barLabels = [];
    drawBars(ctx, barsY, barWidth, barHandles, barLabels, ctx.plot.bottom, true);
    var lineHandles = [];
    var lineLabels = [];
    var linePath = drawLine(ctx, lineY, lineHandles, lineLabels);

    barHandles.forEach(function (handle, index) {
      NC.drag.bind(handle.group, {
        axis: 'y', min: 0, max: ctx.bars.max || 100, step: 1,
        pixelSpan: ctx.plot.height,
        get: function () { return ctx.bars.values[index]; },
        set: function (value) { ctx.bars.values[index] = value; },
        onUpdate: function () { lab.changed(false); },
        onCommit: function () { lab.changed(true); },
        valueText: function (value) {
          return ctx.periods[index].label_en + ', ' + NC.fmt.value(value, ctx.bars.unit, ctx.bars.decimals);
        }
      });
    });
    lineHandles.forEach(function (handle, index) {
      NC.drag.bind(handle.group, {
        axis: 'y', min: ctx.line.min, max: ctx.line.max, step: 1,
        pixelSpan: ctx.plot.height,
        get: function () { return ctx.line.values[index]; },
        set: function (value) { ctx.line.values[index] = value; },
        onUpdate: function () { lab.changed(false); },
        onCommit: function () { lab.changed(true); },
        valueText: function (value) {
          return ctx.periods[index].label_en + ', ' + NC.fmt.value(value, ctx.line.unit, ctx.line.decimals);
        }
      });
    });

    lab.comboState = {
      view: 'overlay', ctx: ctx, barsY: barsY, lineY: lineY,
      barHandles: barHandles, barLabels: barLabels, barLabelInside: true,
      lineHandles: lineHandles, lineLabels: lineLabels,
      linePath: linePath, barWidth: barWidth
    };
  }

  function update(lab) {
    var state = lab.comboState;
    if (!state) return;
    var ctx = state.ctx;
    var bars = ctx.bars;
    var line = ctx.line;
    var barsNodes = lab.svg.querySelectorAll('.bar-current');
    barsNodes.forEach(function (node, index) {
      var value = bars.values[index];
      var top = state.barsY(value);
      node.setAttribute('y', top);
      node.setAttribute('height', Math.max(0, (state.view === 'panels' ? state.topBottom : ctx.plot.bottom) - top));
    });
    state.barHandles.forEach(function (handle, index) {
      var value = bars.values[index];
      var center = ctx.band.center(index);
      svg.move(handle, center, state.barsY(value));
      svg.setSlider(handle, value, ctx.periods[index].label_en + ', ' + NC.fmt.value(value, bars.unit, bars.decimals));
      state.barLabels[index].setAttribute('x', center);
      state.barLabels[index].setAttribute('y', state.barsY(value) + (state.barLabelInside ? 16 : -12));
      state.barLabels[index].textContent = NC.fmt.number(value, 0);
    });

    var points = line.values.map(function (value, index) {
      return [ctx.band.center(index), state.lineY(value)];
    });
    var d = points.map(function (point, index) {
      return (index === 0 ? 'M ' : 'L ') + point[0] + ' ' + point[1];
    }).join(' ');
    state.linePath.setAttribute('d', d);
    state.lineHandles.forEach(function (handle, index) {
      var value = line.values[index];
      svg.move(handle, points[index][0], points[index][1]);
      svg.setSlider(handle, value, ctx.periods[index].label_en + ', ' + NC.fmt.value(value, line.unit, line.decimals));
      state.lineLabels[index].setAttribute('x', points[index][0]);
      state.lineLabels[index].setAttribute('y', points[index][1] - 12);
      state.lineLabels[index].textContent = NC.fmt.number(value, 0) + '%';
    });
  }

  function describe(lab) {
    return NC.desc.combo(lab.dataset, NC.state.level);
  }

  function tableSpec(lab) {
    var dataset = lab.dataset;
    var bars = dataset.series[0];
    var line = dataset.series[1];
    return {
      columns: [
        { label: 'Period' },
        { label: bars.name_en + ' · ' + bars.unit, editable: true, step: 1, decimals: 0, unit: bars.unit },
        { label: line.name_en + ' · ' + line.unit, editable: true, step: 1, decimals: 0, unit: line.unit }
      ],
      rows: dataset.periods.map(function (period, index) {
        return {
          key: period.id,
          cells: [
            { text: period.label_en },
            {
              value: bars.values[index],
              unit: bars.unit,
              set: function (value) {
                bars.values[index] = value;
              }
            },
            {
              value: line.values[index],
              unit: line.unit,
              set: function (value) {
                line.values[index] = value;
              }
            }
          ]
        };
      })
    };
  }

  NC.renderers.combo = {
    mount: function (lab) { render(lab); },
    render: render,
    update: update,
    describe: describe,
    table: tableSpec
  };
})(window.NPESLCharts);
