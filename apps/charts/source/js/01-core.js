/* Core helpers: namespace, DOM and SVG builders, number formatting, scales. */
(function (global) {
  'use strict';

  var NC = global.NPESLCharts = {};
  NC.renderers = {};
  var SVG_NS = 'http://www.w3.org/2000/svg';

  NC.clamp = function (value, min, max) {
    return Math.min(max, Math.max(min, value));
  };

  NC.decimalsOf = function (step) {
    return (String(step).split('.')[1] || '').length;
  };

  // Snap to the dataset's step grid, then clamp into its range.
  NC.snap = function (value, step, min, max) {
    var stepped = Math.round(value / step) * step;
    return Number(NC.clamp(stepped, min, max).toFixed(NC.decimalsOf(step)));
  };

  // 1234.5 -> "1,234.5" (American grouping; the same in both languages).
  NC.fmt = function (value, decimals) {
    var fixed = Number(value).toFixed(decimals || 0);
    var parts = fixed.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  };

  NC.escape = function (text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  NC.clone = function (value) {
    return JSON.parse(JSON.stringify(value));
  };

  // Nice axis ticks: about `count` steps of 1, 2 or 5 times a power of ten.
  NC.ticks = function (min, max, count) {
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

  NC.linear = function (domain, range) {
    var d0 = domain[0];
    var d1 = domain[1];
    var r0 = range[0];
    var r1 = range[1];
    var span = d1 - d0 || 1;
    var scale = function (v) { return r0 + (v - d0) / span * (r1 - r0); };
    scale.invert = function (p) { return d0 + (p - r0) / (r1 - r0 || 1) * span; };
    return scale;
  };

  // ---- DOM ---------------------------------------------------------------

  NC.el = function (tag, attrs, html) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (attrs[key] == null || attrs[key] === false) return;
      node.setAttribute(key, attrs[key] === true ? '' : String(attrs[key]));
    });
    if (html != null) node.innerHTML = html;
    return node;
  };

  NC.svg = function (tag, attrs, parent) {
    var node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (attrs[key] == null) return;
      node.setAttribute(key, String(attrs[key]));
    });
    if (parent) parent.appendChild(node);
    return node;
  };

  NC.svgText = function (parent, attrs, text) {
    var node = NC.svg('text', attrs, parent);
    node.textContent = text == null ? '' : String(text);
    return node;
  };

  // Pointer position in the SVG's own coordinate system, so drags stay
  // correct however the chart is scaled on screen.
  NC.svgPoint = function (svg, event) {
    var point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(svg.getScreenCTM().inverse());
  };

  // Pointer drag with capture. `move` gets the SVG-space point; the drag ends
  // on pointerup or cancel. Returns nothing; attach to the grabbed node.
  NC.drag = function (node, svg, move, onEnd) {
    node.addEventListener('pointerdown', function (event) {
      if (event.button !== undefined && event.button !== 0) return;
      event.preventDefault();
      try { node.setPointerCapture(event.pointerId); } catch (err) {}
      move(NC.svgPoint(svg, event), true);
      var stop = function () {
        node.removeEventListener('pointermove', onMove);
        node.removeEventListener('pointerup', stop);
        node.removeEventListener('pointercancel', stop);
        if (onEnd) onEnd();
      };
      var onMove = function (ev) { move(NC.svgPoint(svg, ev), false); };
      node.addEventListener('pointermove', onMove);
      node.addEventListener('pointerup', stop);
      node.addEventListener('pointercancel', stop);
    });
  };

  // Keyboard nudge shared by every draggable mark: arrows move one step,
  // Shift moves ten. `nudge(delta)` does the actual change.
  NC.nudgeKeys = function (node, nudge) {
    node.addEventListener('keydown', function (event) {
      var up = event.key === 'ArrowUp' || event.key === 'ArrowRight';
      var down = event.key === 'ArrowDown' || event.key === 'ArrowLeft';
      if (!up && !down) return;
      event.preventDefault();
      nudge((up ? 1 : -1) * (event.shiftKey ? 10 : 1));
    });
  };

  // Persist a small preference; storage can be blocked, so never throw.
  NC.store = {
    get: function (key, fallback) {
      try {
        var value = global.localStorage.getItem(key);
        return value == null ? fallback : value;
      } catch (err) {
        return fallback;
      }
    },
    set: function (key, value) {
      try { global.localStorage.setItem(key, value); } catch (err) {}
    }
  };
})(window);
