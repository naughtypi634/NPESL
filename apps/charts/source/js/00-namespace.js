(function (global) {
  'use strict';

  var NC = global.NPESLCharts = global.NPESLCharts || {};
  NC.version = '2.0.0';
  NC.LEVELS = ['B1', 'C1'];
  NC.renderers = {};
  NC.desc = NC.desc || {};
  NC.stats = NC.stats || {};
  NC.svg = NC.svg || {};
  NC.scale = NC.scale || {};
  NC.renderCommon = NC.renderCommon || {};

  NC.state = {
    level: 'B1',
    reducedMotion: false,
    data: null,
    datasets: null,
    labs: {},
    lastTemplate: {}
  };

  NC.byId = function (id) {
    return document.getElementById(id);
  };

  NC.clamp = function (value, min, max) {
    return Math.max(min, Math.min(max, value));
  };

  NC.roundTo = function (value, step) {
    if (!step) return value;
    var decimals = (String(step).split('.')[1] || '').length;
    return Number((Math.round(value / step) * step).toFixed(decimals));
  };

  NC.deepClone = function (value) {
    return JSON.parse(JSON.stringify(value));
  };

  NC.hash = function (text) {
    var hash = 2166136261;
    for (var i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };

  NC.debounce = function (fn, wait) {
    var timer = null;
    return function () {
      var args = arguments;
      var self = this;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(self, args);
      }, wait);
    };
  };

  NC.createElement = function (tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (key === 'text') node.textContent = attrs[key];
        else if (key === 'html') node.innerHTML = attrs[key];
        else if (key === 'class') node.className = attrs[key];
        else if (key.indexOf('data-') === 0 || key === 'role' || key === 'aria-live') {
          node.setAttribute(key, attrs[key]);
        } else {
          node.setAttribute(key, attrs[key]);
        }
      });
    }
    (children || []).forEach(function (child) {
      if (child == null) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  };

  NC.escapeHtml = function (text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  NC.emit = function (name, payload) {
    var listeners = NC.bus && NC.bus[name];
    if (!listeners) return;
    listeners.slice().forEach(function (fn) {
      fn(payload);
    });
  };

  // A quiet segmented control: one row of text buttons, no boxes.
  NC.segment = function (host, spec, onPick) {
    if (!host) return;
    host.innerHTML = '';
    var group = document.createElement('div');
    group.className = 'segment';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', spec.label || '');
    spec.options.forEach(function (option) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'segment-btn';
      button.textContent = option.zh || option.label;
      button.setAttribute('data-value', option.value);
      button.setAttribute('aria-pressed', option.value === spec.value ? 'true' : 'false');
      button.addEventListener('click', function () {
        onPick(option.value);
      });
      group.appendChild(button);
    });
    host.appendChild(group);
  };

  NC.bus = {};
  NC.on = function (name, fn) {
    (NC.bus[name] = NC.bus[name] || []).push(fn);
  };
})(window);
