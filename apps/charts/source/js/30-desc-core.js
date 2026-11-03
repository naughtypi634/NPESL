(function (NC) {
  'use strict';

  var desc = NC.desc = {};

  var BANNED = [
    { id: 'multiple', re: /\b(twice|three times|four times) higher than\b/i },
    { id: 'multiple-more', re: /\btwice more than\b/i },
    { id: 'rise-of', re: /\b(rose|fell|increased|decreased|dropped|grew) of\b/i },
    { id: 'adverb-adjective', re: /\ba (sharply|steadily|slightly|dramatically|significantly|gradually|marginally|modestly)\b/i },
    { id: 'double-superlative', re: /\bthe most highest\b/i },
    { id: 'amount-count', re: /\bamount of (users|customers|orders|stores|people)\b/i },
    { id: 'less-count', re: /\bless (users|customers|orders|stores|people)\b/i },
    { id: 'reach-to', re: /\breach(ed)? to\b/i },
    { id: 'double-direction', re: /\b(decreased|fell|dropped) down\b|\brose up\b/i },
    { id: 'remain-stably', re: /\bremain(ed)? stably\b/i },
    { id: 'fluctuate-redundant', re: /\bfluctuated up and down\b/i },
    { id: 'occupy-share', re: /\boccup(y|ies) \d/i },
    { id: 'percent-points', re: /\bpercent points\b/i },
    { id: 'double-double', re: /\bdouble(d)? by double\b/i },
    { id: 'spacing', re: /\s{2,}/ }
  ];

  desc.check = function (text) {
    var issues = [];
    BANNED.forEach(function (rule) {
      if (rule.re.test(text)) issues.push(rule.id);
    });
    if (/\s$/.test(text) || /^\s/.test(text)) issues.push('edge-space');
    return issues;
  };

  desc.clean = function (text) {
    return NC.fmt.clampText(text);
  };

  desc.sentence = function (role, en, zh) {
    var english = desc.clean(en);
    var chinese = desc.clean(zh);
    var issues = desc.check(english);
    if (issues.length && NC.state.debugGrammar) {
      console.warn('Grammar guard:', issues.join(', '), english);
    }
    return {
      role: role,
      en: english,
      zh: chinese,
      issues: issues
    };
  };

  desc.seed = function (parts) {
    return NC.hash(parts.join('|'));
  };

  desc.pick = function (variants, seed) {
    if (!variants.length) return '';
    return variants[seed % variants.length];
  };

  desc.pickStable = function (key, variants, seed) {
    if (!variants.length) return '';
    var index = seed % variants.length;
    var last = NC.state.lastTemplate[key];
    if (variants.length > 1 && variants[index] === last) {
      index = (index + 1) % variants.length;
    }
    NC.state.lastTemplate[key] = variants[index];
    return variants[index];
  };

  desc.output = function (level, sentences, stats, extra) {
    var list = sentences.filter(function (sentence) {
      return sentence && sentence.en;
    });
    return {
      level: level,
      sentences: list,
      live: list,
      stats: stats || null,
      watch: extra && extra.watch ? extra.watch : null
    };
  };

  desc.focusSentence = function (level, en, zh, role) {
    return desc.sentence(role || 'focus', en, zh);
  };

  desc.join = function (items, connector) {
    if (!items.length) return '';
    if (items.length === 1) return items[0];
    if (items.length === 2) return items[0] + (connector || ' and ') + items[1];
    return items.slice(0, -1).join(', ') + (connector || ', and ') + items[items.length - 1];
  };

  desc.vocab = function (id, entries) {
    for (var i = 0; i < entries.length; i += 1) {
      if (entries[i].id === id) return entries[i];
    }
    return null;
  };
})(window.NPESLCharts);
