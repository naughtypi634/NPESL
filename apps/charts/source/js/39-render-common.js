(function (NC) {
  'use strict';

  var common = NC.renderCommon = {};
  var svg = NC.svg;

  common.width = 720;
  common.height = 380;
  common.margin = { top: 30, right: 26, bottom: 52, left: 66 };

  common.plot = function (width, height) {
    var m = common.margin;
    return {
      left: m.left,
      right: width - m.right,
      top: m.top,
      bottom: height - m.bottom,
      width: width - m.left - m.right,
      height: height - m.top - m.bottom
    };
  };

  common.drawYAxis = function (root, opts) {
    var ticks = opts.ticks || NC.scale.ticks(opts.min, opts.max, 5);
    var y = opts.scale;
    ticks.forEach(function (tick) {
      var py = y(tick);
      if (py < opts.top - 0.5 || py > opts.bottom + 0.5) return;
      svg.line(root, {
        x1: opts.left, x2: opts.right, y1: py, y2: py,
        class: tick === 0 ? 'axis-line' : 'grid-line'
      });
      svg.text(root, {
        x: opts.left - 10, y: py,
        'text-anchor': 'end',
        'dominant-baseline': 'middle',
        class: 'axis-label'
      }, opts.format ? opts.format(tick) : tick);
    });
    if (opts.label) {
      svg.text(root, {
        x: opts.left - 46, y: (opts.top + opts.bottom) / 2,
        'text-anchor': 'middle',
        transform: 'rotate(-90 ' + (opts.left - 46) + ' ' + ((opts.top + opts.bottom) / 2) + ')',
        class: 'axis-title'
      }, opts.label);
    }
  };

  common.drawXAxis = function (root, opts) {
    svg.line(root, {
      x1: opts.left, x2: opts.right, y1: opts.bottom, y2: opts.bottom,
      class: 'axis-line'
    });
    (opts.labels || []).forEach(function (label, index) {
      var x = opts.x(index);
      svg.text(root, {
        x: x, y: opts.bottom + 20,
        'text-anchor': opts.anchor || 'middle',
        class: 'axis-label'
      }, label);
    });
  };

  common.caption = function (root, text, opts) {
    var o = opts || {};
    svg.text(root, {
      x: o.x == null ? 0 : o.x,
      y: o.y == null ? 14 : o.y,
      'text-anchor': o.anchor || 'start',
      class: 'chart-caption'
    }, text);
  };

  common.legend = function (container, items) {
    container.innerHTML = '';
    var box = document.createElement('div');
    box.className = 'legend';
    items.forEach(function (item) {
      var row = document.createElement('span');
      row.className = 'legend-item';
      var dot = document.createElement('span');
      dot.className = 'legend-dot';
      dot.style.background = item.color;
      if (item.outline) {
        dot.style.background = 'transparent';
        dot.style.border = '1.5px solid ' + item.color;
      }
      var label = document.createElement('span');
      label.textContent = item.label;
      row.appendChild(dot);
      row.appendChild(label);
      box.appendChild(row);
    });
    container.appendChild(box);
  };

  common.valueLabel = function (root, x, y, text, cls) {
    return svg.text(root, {
      x: x, y: y,
      'text-anchor': 'middle',
      class: cls || 'value-label'
    }, text);
  };

  common.describeValue = function (value, unit) {
    return NC.fmt.value(value, unit, 0);
  };
})(window.NPESLCharts);
