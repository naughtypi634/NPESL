(function (NC) {
  'use strict';

  var scale = NC.scale = {};

  scale.linear = function (domainMin, domainMax, rangeMin, rangeMax) {
    var d = domainMax - domainMin || 1;
    var fn = function (value) {
      return rangeMin + (value - domainMin) / d * (rangeMax - rangeMin);
    };
    fn.invert = function (pixel) {
      return domainMin + (pixel - rangeMin) / (rangeMax - rangeMin) * d;
    };
    fn.domain = [domainMin, domainMax];
    fn.range = [rangeMin, rangeMax];
    return fn;
  };

  scale.ticks = function (min, max, count) {
    var target = count || 5;
    var span = max - min;
    if (!isFinite(span) || span <= 0) return [min];
    var raw = span / target;
    var step = Math.pow(10, Math.floor(Math.log10(raw)));
    var err = raw / step;
    if (err >= 7.5) step *= 10;
    else if (err >= 3.5) step *= 5;
    else if (err >= 1.5) step *= 2;
    var start = Math.ceil(min / step) * step;
    var ticks = [];
    for (var value = start; value <= max + step * 1e-6; value += step) {
      ticks.push(Number(value.toFixed(10)));
      if (ticks.length > 100) break;
    }
    return ticks;
  };

  scale.band = function (count, start, end, padding) {
    var pad = padding == null ? 0.22 : padding;
    var step = (end - start) / Math.max(count, 1);
    var width = step * (1 - pad);
    return {
      step: step,
      width: width,
      left: function (index) {
        return start + index * step + (step - width) / 2;
      },
      center: function (index) {
        return start + index * step + step / 2;
      }
    };
  };

  scale.polar = function (cx, cy, radius, angle) {
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle)
    };
  };

  scale.arc = function (cx, cy, radius, start, end) {
    var p1 = scale.polar(cx, cy, radius, start);
    var p2 = scale.polar(cx, cy, radius, end);
    var large = end - start > Math.PI ? 1 : 0;
    return 'M ' + cx + ' ' + cy +
      ' L ' + p1.x + ' ' + p1.y +
      ' A ' + radius + ' ' + radius + ' 0 ' + large + ' 1 ' + p2.x + ' ' + p2.y +
      ' Z';
  };

  scale.angleOf = function (cx, cy, x, y) {
    var angle = Math.atan2(y - cy, x - cx) + Math.PI / 2;
    if (angle < 0) angle += Math.PI * 2;
    return angle;
  };

  scale.nearestIndex = function (values, target) {
    var best = 0;
    var bestDistance = Infinity;
    for (var i = 0; i < values.length; i += 1) {
      var d = Math.abs(values[i] - target);
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    }
    return best;
  };

  scale.snap = function (value, step) {
    if (!step) return value;
    var decimals = (String(step).split('.')[1] || '').length;
    return Number((Math.round(value / step) * step).toFixed(decimals));
  };
})(window.NPESLCharts);
