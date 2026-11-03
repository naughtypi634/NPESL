(function (NC) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var svg = NC.svg = {};

  svg.el = function (tag, attrs, parent) {
    var node = document.createElementNS(NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (attrs[key] == null) return;
        node.setAttribute(key, attrs[key]);
      });
    }
    if (parent) parent.appendChild(node);
    return node;
  };

  svg.group = function (parent, attrs) {
    return svg.el('g', attrs, parent);
  };

  svg.rect = function (parent, attrs) {
    return svg.el('rect', attrs, parent);
  };

  svg.line = function (parent, attrs) {
    return svg.el('line', attrs, parent);
  };

  svg.circle = function (parent, attrs) {
    return svg.el('circle', attrs, parent);
  };

  svg.path = function (parent, attrs) {
    return svg.el('path', attrs, parent);
  };

  svg.text = function (parent, attrs, text) {
    var node = svg.el('text', attrs, parent);
    node.textContent = text == null ? '' : String(text);
    return node;
  };

  svg.create = function (container, width, height, label) {
    svg.clear(container);
    var node = svg.el('svg', {
      viewBox: '0 0 ' + width + ' ' + height,
      role: 'img',
      'aria-label': label || 'chart',
      class: 'chart-svg',
      preserveAspectRatio: 'xMidYMid meet'
    });
    container.appendChild(node);
    return node;
  };

  svg.clear = function (node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  };

  svg.point = function (node, x, y, radius, className, label) {
    var g = svg.group(node, { class: className || 'point' });
    var hit = svg.circle(g, {
      cx: x, cy: y, r: Math.max(radius + 10, 22),
      fill: 'transparent', class: 'hit'
    });
    var dot = svg.circle(g, { cx: x, cy: y, r: radius, class: 'dot' });
    if (label) {
      var t = svg.text(g, { x: x, y: y - radius - 7, 'text-anchor': 'middle', class: 'point-label' }, label);
      t.setAttribute('aria-hidden', 'true');
    }
    return { group: g, hit: hit, dot: dot };
  };

  svg.mkHandle = function (node, x, y, opts) {
    var o = opts || {};
    var g = svg.group(node, {
      class: 'handle',
      tabindex: '0',
      role: 'slider',
      'aria-label': o.label || 'value',
      'aria-orientation': o.orientation || 'vertical',
      'aria-valuemin': o.min,
      'aria-valuemax': o.max,
      'aria-valuenow': o.now,
      'aria-valuetext': o.valueText || String(o.now)
    });
    var hit = svg.circle(g, {
      cx: x, cy: y, r: o.hitRadius || 22, fill: 'transparent', class: 'hit'
    });
    var halo = svg.circle(g, { cx: x, cy: y, r: (o.radius || 7) + 4, class: 'halo' });
    var dot = svg.circle(g, { cx: x, cy: y, r: o.radius || 7, class: 'dot' });
    g.setAttribute('data-x', x);
    g.setAttribute('data-y', y);
    return { group: g, hit: hit, halo: halo, dot: dot };
  };

  svg.move = function (handle, x, y) {
    handle.hit.setAttribute('cx', x);
    handle.hit.setAttribute('cy', y);
    handle.halo.setAttribute('cx', x);
    handle.halo.setAttribute('cy', y);
    handle.dot.setAttribute('cx', x);
    handle.dot.setAttribute('cy', y);
    handle.group.setAttribute('data-x', x);
    handle.group.setAttribute('data-y', y);
  };

  svg.setSlider = function (handle, value, text) {
    handle.group.setAttribute('aria-valuenow', value);
    if (text) handle.group.setAttribute('aria-valuetext', text);
  };

  svg.label = function (parent, x, y, text, opts) {
    var o = opts || {};
    return svg.text(parent, {
      x: x, y: y,
      'text-anchor': o.anchor || 'middle',
      class: o.class || 'axis-label',
      'dominant-baseline': o.baseline || 'middle'
    }, text);
  };
})(window.NPESLCharts);
