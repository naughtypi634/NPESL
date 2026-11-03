(function (NC) {
  'use strict';

  var fmt = NC.fmt = {};

  function decimalsOf(value, fallback) {
    if (value == null) return fallback == null ? 0 : fallback;
    return value;
  }

  fmt.number = function (value, decimals) {
    var d = decimalsOf(decimals, 0);
    if (!isFinite(value)) return '—';
    return Number(value).toLocaleString('en-US', {
      minimumFractionDigits: d,
      maximumFractionDigits: d
    });
  };

  fmt.int = function (value) {
    return fmt.number(value, 0);
  };

  fmt.percent = function (value, decimals) {
    return fmt.number(value, decimalsOf(decimals, 0)) + '%';
  };

  fmt.signed = function (value, decimals) {
    var d = decimalsOf(decimals, 0);
    var sign = value > 0 ? '+' : '';
    return sign + fmt.number(value, d);
  };

  fmt.pp = function (value) {
    return fmt.number(Math.abs(value), value % 1 === 0 ? 0 : 1) + (Math.abs(value) === 1 ? ' percentage point' : ' percentage points');
  };

  fmt.value = function (value, unit, decimals) {
    var d = decimalsOf(decimals, 0);
    if (unit === '%') return fmt.number(value, d) + '%';
    if (unit === 'RMB million') return 'RMB ' + fmt.number(value, d) + ' million';
    if (unit === 'RMB thousand') return 'RMB ' + fmt.number(value * 1000, 0);
    if (unit === 'orders') return fmt.number(value, d) + ' orders';
    if (unit === 'users') return fmt.number(value, d) + ' users';
    if (!unit) return fmt.number(value, d);
    return fmt.number(value, d) + ' ' + unit;
  };

  fmt.valueZh = function (value, unit, unitZh, decimals) {
    var d = decimalsOf(decimals, 0);
    if (unit === '%') return fmt.number(value, d) + '%';
    if (unit === 'RMB million') return fmt.number(value * 100, d) + ' 万元';
    if (unit === 'RMB thousand') {
      var wan = value / 10;
      return fmt.number(wan, wan % 1 === 0 ? 0 : 1) + ' 万元';
    }
    if (unit === 'orders') return fmt.number(value, d) + ' 单';
    if (unit === 'users') return fmt.number(value, d) + ' 名用户';
    if (!unit) return fmt.number(value, d);
    return fmt.number(value, d) + ' ' + (unitZh || unit);
  };

  fmt.axis = function (value) {
    var abs = Math.abs(value);
    if (abs >= 1000000) return (value / 1000000).toFixed(abs % 1000000 === 0 ? 0 : 1) + 'm';
    if (abs >= 1000) return (value / 1000).toFixed(abs % 1000 === 0 ? 0 : 1) + 'k';
    return fmt.number(value, abs % 1 === 0 ? 0 : 1);
  };

  fmt.article = function (word) {
    var w = String(word).trim().toLowerCase();
    if (/^(8|11|18|80|800|1800)\b/.test(w)) return 'an';
    if (/^[aeiou]/.test(w)) return 'an';
    return 'a';
  };

  fmt.withArticle = function (word) {
    return fmt.article(word) + ' ' + word;
  };

  fmt.capitalize = function (text) {
    if (!text) return text;
    return text.charAt(0).toUpperCase() + text.slice(1);
  };

  fmt.lowerFirst = function (text) {
    if (!text) return text;
    return text.charAt(0).toLowerCase() + text.slice(1);
  };

  fmt.plural = function (n, one, many) {
    return Math.abs(n) === 1 ? one : many;
  };

  fmt.ordinal = function (n) {
    var value = Math.abs(Math.round(n));
    var suffix = 'th';
    if (value % 100 < 11 || value % 100 > 13) {
      if (value % 10 === 1) suffix = 'st';
      else if (value % 10 === 2) suffix = 'nd';
      else if (value % 10 === 3) suffix = 'rd';
    }
    return value + suffix;
  };

  fmt.ordinalWord = function (n) {
    var words = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
    return words[Math.round(n)] || fmt.ordinal(n);
  };

  fmt.ratio = function (ratio) {
    if (!isFinite(ratio) || ratio <= 0) return '';
    if (ratio < 1.35) return 'about the same as';
    if (ratio < 1.7) return 'about 1.5 times';
    if (ratio < 2.15) return 'twice';
    if (ratio < 2.55) return 'more than twice';
    if (ratio < 2.9) return 'almost three times';
    if (ratio < 3.35) return 'three times';
    if (ratio < 4.2) return 'more than three times';
    return fmt.number(ratio, 1) + ' times';
  };

  fmt.ratioValue = function (ratio) {
    if (!isFinite(ratio) || ratio <= 0) return 1;
    if (ratio < 1.7) return 1.5;
    if (ratio < 2.55) return 2;
    if (ratio < 3.35) return 3;
    if (ratio < 4.2) return 4;
    return Math.round(ratio);
  };

  fmt.human = function (value) {
    if (!value) return 0;
    var abs = Math.abs(value);
    var magnitude = Math.pow(10, Math.floor(Math.log10(abs)));
    return Math.round(value / magnitude) * magnitude;
  };

  fmt.period = function (dataset, index) {
    return dataset.periods && dataset.periods[index] ? dataset.periods[index].label_en : '';
  };

  fmt.periodZh = function (dataset, index) {
    return dataset.periods && dataset.periods[index] ? dataset.periods[index].label_zh : '';
  };

  fmt.range = function (values) {
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    return max - min;
  };

  fmt.clampText = function (text) {
    return String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  };
})(window.NPESLCharts);
