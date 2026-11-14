(function (NC) {
  'use strict';

  var common = NC.renderCommon = {};
  var svg = NC.svg;

  common.width = 720;
  common.height = 380;
  common.margin = { top: 18, right: 26, bottom: 52, left: 66 };
  common.compactMargin = { top: 16, right: 18, bottom: 46, left: 56 };

  // The chart uses the real pixel size of its host instead of a fixed viewBox,
  // so it fills the studio stage at any viewport and text never scales away.
  common.size = function (host, fallbackWidth, fallbackHeight) {
    var rect = host && host.getBoundingClientRect ? host.getBoundingClientRect() : null;
    var width = rect && rect.width ? Math.round(rect.width) : (fallbackWidth || common.width);
    var height = rect && rect.height ? Math.round(rect.height) : (fallbackHeight || common.height);
    var size = {
      width: Math.max(320, width),
      height: Math.max(220, height)
    };
    if (host) host.__chartSize = { width: size.width, height: size.height };
    return size;
  };

  common.plot = function (width, height, compact) {
    var m = compact ? common.compactMargin : common.margin;
    return {
      left: m.left,
      right: width - m.right,
      top: m.top,
      bottom: height - m.bottom,
      width: width - m.left - m.right,
      height: height - m.top - m.bottom
    };
  };

  common.fit = function (root) {
    if (!root || !root.getBoundingClientRect) return false;
    var compact = false;
    if (root.getBoundingClientRect) {
      var rect = root.getBoundingClientRect();
      compact = rect.width > 0 && rect.width < 520;
    }
    root.style.fontSize = compact ? '13.5px' : '15px';
    root.setAttribute('data-compact', compact ? 'true' : 'false');
    return compact;
  };

  common.screenPx = function (root, px) {
    return px;
  };

  common.tip = function (plotHost) {
    if (plotHost.__tip && plotHost.__tip.parentNode === plotHost) return plotHost.__tip;
    var node = document.createElement('div');
    node.className = 'chart-tip';
    node.setAttribute('aria-hidden', 'true');
    plotHost.appendChild(node);
    plotHost.__tip = node;
    return node;
  };

  common.showTip = function (plotHost, text, root, x, y) {
    if (!plotHost || !root) return;
    var node = common.tip(plotHost);
    node.textContent = text;
    var rect = root.getBoundingClientRect();
    var hostRect = plotHost.getBoundingClientRect();
    var box = root.viewBox && root.viewBox.baseVal;
    if (!box || !box.width || !box.height) return;
    var left = (rect.left - hostRect.left) + (x / box.width) * rect.width;
    var top = (rect.top - hostRect.top) + (y / box.height) * rect.height;
    node.dataset.visible = 'true';
    // Keep the whole bubble inside the plot, and flip it below the mark when
    // there is no room above.
    var half = node.offsetWidth / 2;
    var height = node.offsetHeight;
    left = Math.max(half + 8, Math.min(hostRect.width - half - 8, left));
    var below = top < height + 16;
    node.style.left = left + 'px';
    node.style.top = (below ? top + 14 : top) + 'px';
    node.style.transform = below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)';
  };

  common.hideTip = function (plotHost) {
    if (!plotHost || !plotHost.__tip) return;
    plotHost.__tip.dataset.visible = 'false';
  };

  // Handles stay invisible until the mark they belong to is hovered. This
  // keeps a dense chart reading as a chart rather than an editor, while the
  // affordance still appears exactly where the pointer is.
  common.linkHandle = function (mark, handle) {
    if (!mark || !handle) return;
    function show() { handle.group.classList.add('is-visible'); }
    function hide() { handle.group.classList.remove('is-visible'); }
    mark.addEventListener('pointerenter', show);
    mark.addEventListener('pointerleave', hide);
    handle.group.addEventListener('pointerenter', show);
    handle.group.addEventListener('pointerleave', hide);
  };

  // ---- focus: the window on the chart that the active sentence describes ----

  common.focusLayer = function (root) {
    if (!root.__focusLayer) {
      var layer = svg.group(root, { class: 'focus-layer' });
      root.appendChild(layer);
      root.__focusLayer = layer;
    }
    return root.__focusLayer;
  };

  common.clearFocus = function (root) {
    if (!root || !root.__focusLayer) return;
    while (root.__focusLayer.firstChild) root.__focusLayer.removeChild(root.__focusLayer.firstChild);
  };

  common.focusBand = function (root, x, y, width, height) {
    var layer = common.focusLayer(root);
    svg.rect(layer, {
      x: x, y: y, width: Math.max(1, width), height: Math.max(1, height),
      class: 'focus-band'
    });
    svg.rect(layer, {
      x: x, y: y, width: Math.max(1, width), height: Math.max(1, height),
      class: 'focus-edge'
    });
    return layer;
  };

  common.focusRing = function (root, x, y, radius) {
    var layer = common.focusLayer(root);
    svg.circle(layer, { cx: x, cy: y, r: radius, class: 'focus-ring' });
    return layer;
  };

  common.clearDim = function (root) {
    if (!root) return;
    Array.prototype.forEach.call(root.querySelectorAll('.is-dim'), function (node) {
      node.classList.remove('is-dim');
    });
  };

  common.dimExcept = function (root, selector, keep) {
    if (!root) return;
    Array.prototype.forEach.call(root.querySelectorAll(selector), function (node) {
      var on = keep ? keep(node) : false;
      node.classList.toggle('is-dim', !on);
    });
  };

  common.fitText = function (node, maxWidth) {
    if (!node || !node.getComputedTextLength) return;
    var full = node.textContent;
    if (!full) return;
    var old = node.querySelector('title');
    if (old) old.remove();
    if (node.getComputedTextLength() <= maxWidth) return;
    var chars = full;
    while (chars.length > 1 && node.getComputedTextLength() > maxWidth) {
      chars = chars.slice(0, -1);
      node.textContent = chars + '…';
    }
    var title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = full;
    node.appendChild(title);
  };

  common.empty = function (plotHost, message) {
    var node = document.createElement('p');
    node.className = 'chart-empty';
    node.textContent = message;
    plotHost.appendChild(node);
    return node;
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
    var labels = opts.labels || [];
    var every = opts.labelEvery || 1;
    labels.forEach(function (label, index) {
      var x = opts.x(index);
      if (opts.ticks !== false) {
        svg.line(root, {
          x1: x, x2: x, y1: opts.bottom, y2: opts.bottom + 4,
          class: 'tick-line'
        });
      }
      var lastIndex = labels.length - 1;
      var show = index === 0 || index === lastIndex ||
        (index % every === 0 && lastIndex - index >= 2);
      if (every === 1 && labels.length <= 8) show = true;
      if (!show) return;
      var anchor = index === 0 ? 'start' : index === lastIndex ? 'end' : 'middle';
      var labelNode = svg.text(root, {
        x: x, y: opts.bottom + 20,
        'text-anchor': anchor,
        class: 'axis-label'
      }, label);
      if (opts.labelLang) labelNode.setAttribute('lang', opts.labelLang);
    });
  };

  common.caption = function (root, text, opts) {
    var o = opts || {};
    return svg.text(root, {
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
    var nodes = [];
    items.forEach(function (item) {
      var row = document.createElement('span');
      row.className = 'legend-item';
      if (item.key) row.setAttribute('data-legend', item.key);
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
      nodes.push(row);
    });
    container.appendChild(box);
    return { box: box, items: nodes };
  };

  common.emphasize = function (plotHost, key) {
    if (plotHost) plotHost.setAttribute('data-emphasis', key || '');
  };

  common.clearEmphasis = function (plotHost) {
    if (plotHost) plotHost.removeAttribute('data-emphasis');
  };

  common.placeValueLabel = function (root, x, y, text, opts) {
    var o = opts || {};
    return svg.text(root, {
      x: x,
      y: Math.max(o.top == null ? 0 : o.top, y),
      'text-anchor': o.anchor || 'middle',
      class: o.class || 'value-label'
    }, text);
  };

  common.valueLabel = function (root, x, y, text, cls) {
    return common.placeValueLabel(root, x, y, text, { class: cls });
  };

  common.describeValue = function (value, unit) {
    return NC.fmt.value(value, unit, 0);
  };
})(window.NPESLCharts);
