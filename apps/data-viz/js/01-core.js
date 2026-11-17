/* Core helpers: DOM, SVG, number formatting, template filling, storage. */
(function (global) {
  'use strict';

  var DV = global.DV = global.DV || {};
  DV.renderers = {};
  DV.SVG_NS = 'http://www.w3.org/2000/svg';

  DV.el = function (tag, attrs, parent) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (attrs[key] == null) return;
      if (key === 'text') node.textContent = String(attrs[key]);
      else if (key === 'class') node.className = attrs[key];
      else node.setAttribute(key, String(attrs[key]));
    });
    if (parent) parent.appendChild(node);
    return node;
  };

  DV.svg = function (tag, attrs, parent) {
    var node = document.createElementNS(DV.SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (attrs[key] == null) return;
      node.setAttribute(key, String(attrs[key]));
    });
    if (parent) parent.appendChild(node);
    return node;
  };

  DV.text = function (parent, attrs, value) {
    var node = DV.svg('text', attrs, parent);
    node.textContent = value == null ? '' : String(value);
    return node;
  };

  DV.clear = function (node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  };

  // Round half to even, the way Python's format() does, so a value that the
  // build formatted as "52.5 -> 52" does not flip to "53" once the browser
  // recalculates it.
  DV.roundFixed = function (value, decimals) {
    var dec = decimals == null ? 0 : Number(decimals);
    var x = Number(value);
    if (!isFinite(x)) return String(x);
    var neg = x < 0;
    var abs = Math.abs(x);
    var raw = abs.toFixed(20);
    if (raw.indexOf('e') >= 0) return abs.toFixed(dec);
    var parts = raw.split('.');
    var intPart = parts[0] || '0';
    var frac = parts[1] || '';
    while (frac.length < dec) frac += '0';
    var kept = frac.slice(0, dec);
    var rest = frac.slice(dec);
    var digits = intPart + kept;
    var roundUp = false;
    if (rest) {
      var first = rest.charCodeAt(0) - 48;
      if (first > 5) roundUp = true;
      else if (first === 5) {
        if (/[1-9]/.test(rest.slice(1))) roundUp = true;
        else {
          var last = digits.charCodeAt(digits.length - 1) - 48;
          roundUp = last % 2 === 1;
        }
      }
    }
    if (roundUp) {
      var arr = digits.split('');
      var i = arr.length - 1;
      while (i >= 0 && arr[i] === '9') { arr[i] = '0'; i -= 1; }
      if (i < 0) arr.unshift('1');
      else arr[i] = String.fromCharCode(arr[i].charCodeAt(0) + 1);
      digits = arr.join('');
    }
    var split = digits.length - dec;
    var intOut = digits.slice(0, split) || '0';
    var fracOut = dec ? digits.slice(split) : '';
    return (neg ? '-' : '') + intOut + (dec ? '.' + fracOut : '');
  };

  DV.num = function (value, decimals) {
    var fixed = DV.roundFixed(value, decimals);
    if (fixed.indexOf('.') >= 0) {
      fixed = fixed.replace(/0+$/, '').replace(/\.$/, '');
    }
    if (fixed === '-0' || fixed === '') fixed = '0';
    var neg = fixed.charAt(0) === '-';
    if (neg) fixed = fixed.slice(1);
    var parts = fixed.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + parts.join('.');
  };

  DV.fmtValue = function (value, unit) {
    unit = unit || {};
    var scale = unit.scale ? Number(unit.scale) : 1;
    var x = Number(value) * scale;
    var dec = unit.decimals == null ? 0 : Number(unit.decimals);
    if (unit.kind === 'percent') return DV.num(x, dec) + ' percent';
    if (unit.million && Math.abs(x) >= 1e6) {
      return DV.num(x / 1e6, 1) + ' million ' + (unit.en || '');
    }
    return (DV.num(x, dec) + ' ' + (unit.en || '')).trim();
  };

  DV.fmtAxis = function (value, unit) {
    return DV.num(value, unit && unit.decimals != null ? unit.decimals : 0);
  };

  DV.fill = function (template, slots) {
    return String(template || '').replace(/\{([a-z_]+)\}/g, function (match, key) {
      return slots && slots[key] != null ? String(slots[key]) : match;
    });
  };

  DV.slotClass = function (slot) {
    return 'dv-s' + (Number(slot) >= 1 && Number(slot) <= 8 ? Number(slot) : 1);
  };

  DV.ticks = function (min, max, count) {
    var span = max - min;
    if (!(span > 0)) return [min];
    var raw = span / (count || 4);
    var power = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var step = power;
    var rel = raw / power;
    if (rel >= 5) step = power * 5;
    else if (rel >= 2) step = power * 2;
    var out = [];
    for (var v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) {
      out.push(Number(v.toFixed(10)));
    }
    return out;
  };

  DV.linear = function (domain, range) {
    var d0 = domain[0], d1 = domain[1], r0 = range[0], r1 = range[1];
    var span = d1 - d0 || 1;
    var scale = function (v) { return r0 + (v - d0) / span * (r1 - r0); };
    scale.invert = function (p) { return d0 + (p - r0) / (r1 - r0 || 1) * span; };
    return scale;
  };

  DV.store = {
    get: function (key, fallback) {
      try {
        var value = localStorage.getItem(key);
        return value == null ? fallback : value;
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { localStorage.setItem(key, value); } catch (e) {}
    },
    session: function (key, fallback) {
      try {
        var value = sessionStorage.getItem(key);
        return value == null ? fallback : value;
      } catch (e) { return fallback; }
    },
    setSession: function (key, value) {
      try { sessionStorage.setItem(key, value); } catch (e) {}
    }
  };

  DV.prefersReduced = function () {
    return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };

  DV.esc = function (text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
})(window);
