(function (NC) {
  'use strict';

  var ui = NC.ui = {};
  var SCENES = {
    line: 'Nova Delivery · quarterly revenue',
    area: 'Nova Delivery · quarterly revenue',
    combo: 'Nova Delivery · revenue and growth',
    bar: 'Peak Coffee · revenue by region',
    hbar: 'Peak Coffee · revenue by region',
    table: 'Peak Coffee · revenue by region',
    pie: 'Harbor Cloud · market share by channel',
    scatter: 'Nova Delivery · ad spend and orders'
  };

  var state = {
    vocabGroup: 'all',
    vocabQuery: ''
  };

  function levelBadge(level) {
    return '<span class="badge level-badge" data-level="' + NC.escapeHtml(level) + '">' + NC.escapeHtml(level) + '</span>';
  }

  function registerBadge(register) {
    if (!register || register === 'neutral') return '';
    var map = { spoken: '口语', formal: '正式', business: '商务', journalism: '新闻', informal: '非正式' };
    return '<span class="badge register-badge">' + (map[register] || register) + '</span>';
  }

  function buildSections() {
    var host = NC.byId('sections');
    var sections = NC.state.data.types.sections.slice().sort(function (a, b) { return a.order - b.order; });
    sections.forEach(function (type) {
      var section = document.createElement('section');
      section.className = 'chart-section';
      section.id = 'chart-' + type.id;
      section.setAttribute('data-type', type.id);
      section.setAttribute('data-lab', type.id);
      section.setAttribute('data-mounted', 'false');
      section.innerHTML =
        '<header class="section-head">' +
          '<p class="eyebrow">' + String(type.order).padStart(2, '0') + ' · ' + NC.escapeHtml(type.label_en) + '</p>' +
          '<h2>' + NC.escapeHtml(type.label_zh) + ' <span class="h2-en">' + NC.escapeHtml(type.label_en) + '</span></h2>' +
          '<p class="definition">' + NC.escapeHtml(type.definition_zh) + '</p>' +
        '</header>' +
        '<div class="chart-card">' +
          '<div class="chart-toolbar">' +
            '<span class="chart-scene">' + NC.escapeHtml(SCENES[type.id] || '') + '</span>' +
            '<span class="chart-actions">' +
              '<span class="chart-controls" data-chart-controls></span>' +
              '<button class="pill compact" type="button" data-reset>重置</button>' +
            '</span>' +
          '</div>' +
          '<div class="plot" data-plot></div>' +
          '<div class="desc" data-desc>' +
            '<div class="desc-lines" data-desc-lines></div>' +
            '<p class="sr-only" data-live aria-live="polite"></p>' +
          '</div>' +
          '<details class="data-panel" data-data-panel>' +
            '<summary>数据</summary>' +
            '<div class="data-table-host" data-table></div>' +
          '</details>' +
        '</div>' +
        '<div class="section-notes">' +
          '<div class="note"><h3>适合说明什么</h3><p>' + NC.escapeHtml(type.best_for_zh) + '</p></div>' +
          '<div class="note"><h3>小心</h3><p>' + NC.escapeHtml(type.watch_out_zh) + '</p></div>' +
          '<div class="note"><h3>雅思提示</h3><p>' + NC.escapeHtml(type.ielts_tip_zh) + '</p></div>' +
        '</div>' +
        '<div class="focus-row">' + (type.focus || []).map(function (item) {
          return '<span class="chip focus-chip"><span lang="en">' + NC.escapeHtml(item.en) + '</span><span class="chip-zh">' + NC.escapeHtml(item.zh) + '</span></span>';
        }).join('') + '</div>' +
        '<div class="patterns">' +
          '<h3>常用句型</h3>' +
          '<ul class="pattern-list" data-patterns></ul>' +
        '</div>' +
        '<div class="model">' +
          '<button class="pill" type="button" data-model-toggle aria-expanded="false">看一段范文</button>' +
          '<div class="model-box" data-model hidden><div class="model-body" data-model-body></div></div>' +
        '</div>';
      host.appendChild(section);
      NC.state.labs[type.id] = new NC.Lab(section, type);
      renderPatterns(type.id);
    });
  }

  function renderPatterns(typeId) {
    var type = NC.state.data.types.sections.filter(function (item) { return item.id === typeId; })[0];
    var section = NC.byId('chart-' + typeId);
    if (!type || !section) return;
    var list = section.querySelector('[data-patterns]');
    if (!list) return;
    var visible = (type.patterns || []).filter(function (pattern) {
      return NC.showLevel(pattern.level, NC.state.level);
    });
    if (!visible.length && type.patterns && type.patterns.length) visible = [type.patterns[0]];
    list.innerHTML = visible.map(function (pattern) {
      return '<li>' + levelBadge(pattern.level) +
        '<span class="pattern-en" lang="en">' + NC.escapeHtml(pattern.en) + '</span>' +
        '<span class="pattern-zh">' + NC.escapeHtml(pattern.zh) + '</span></li>';
    }).join('');
  }

  function renderAllPatterns() {
    NC.state.data.types.sections.forEach(function (type) { renderPatterns(type.id); });
  }

  function buildToc() {
    var host = NC.byId('toc-links');
    if (!host) return;
    host.innerHTML = '';
    NC.state.data.types.sections.slice().sort(function (a, b) { return a.order - b.order; })
      .forEach(function (type) {
        var link = document.createElement('a');
        link.href = '#chart-' + type.id;
        link.textContent = String(type.order).padStart(2, '0') + ' ' + type.label_zh;
        link.setAttribute('data-toc', 'chart-' + type.id);
        host.appendChild(link);
      });
    [
      ['vocab', '词汇'],
      ['grammar', '句型'],
      ['errors', '常见错误']
    ].forEach(function (item) {
      var link = document.createElement('a');
      link.href = '#' + item[0];
      link.textContent = item[1];
      link.setAttribute('data-toc', item[0]);
      host.appendChild(link);
    });
  }

  function setupScrollSpy() {
    if (!('IntersectionObserver' in window)) return;
    var links = Array.prototype.slice.call(document.querySelectorAll('[data-toc]'));
    var targets = links.map(function (link) {
      return document.getElementById(link.getAttribute('data-toc'));
    }).filter(Boolean);
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (link) {
          var active = link.getAttribute('data-toc') === entry.target.id;
          if (active) link.setAttribute('aria-current', 'true');
          else link.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-35% 0px -55% 0px', threshold: [0, 0.1] });
    targets.forEach(function (target) { observer.observe(target); });
  }

  function setupLevel() {
    var buttons = Array.prototype.slice.call(document.querySelectorAll('#level-switch [data-level]'));
    try {
      var saved = localStorage.getItem('npesl-charts-level');
      if (saved && NC.LEVELS.indexOf(saved) !== -1) NC.state.level = saved;
    } catch (err) {}
    function apply(level) {
      NC.state.level = level;
      document.documentElement.setAttribute('data-charts-level', level);
      buttons.forEach(function (button) {
        button.setAttribute('aria-pressed', button.getAttribute('data-level') === level ? 'true' : 'false');
      });
      try { localStorage.setItem('npesl-charts-level', level); } catch (err) {}
      Object.keys(NC.state.labs).forEach(function (id) {
        var lab = NC.state.labs[id];
        if (lab.mounted) {
          lab.refresh(false);
        }
      });
      renderAllPatterns();
      renderVocabulary();
      renderConverter();
    }
    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        apply(button.getAttribute('data-level'));
      });
    });
    apply(NC.state.level);
  }

  function renderVocabulary() {
    var chips = NC.byId('vocab-chips');
    var list = NC.byId('vocab-list');
    if (!chips || !list) return;
    var vocab = NC.state.data.vocab;
    chips.innerHTML = '';
    var all = document.createElement('button');
    all.type = 'button';
    all.className = 'chip';
    all.textContent = '全部';
    all.setAttribute('aria-pressed', state.vocabGroup === 'all' ? 'true' : 'false');
    all.addEventListener('click', function () {
      state.vocabGroup = 'all';
      renderVocabulary();
    });
    chips.appendChild(all);
    vocab.groups.forEach(function (group) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'chip';
      button.textContent = group.title_zh;
      button.setAttribute('aria-pressed', state.vocabGroup === group.id ? 'true' : 'false');
      button.addEventListener('click', function () {
        state.vocabGroup = group.id;
        renderVocabulary();
      });
      chips.appendChild(button);
    });

    var query = state.vocabQuery.toLowerCase();
    var entries = vocab.entries.filter(function (entry) {
      if (!NC.showLevel(entry.level, NC.state.level)) return false;
      if (state.vocabGroup !== 'all' && entry.group !== state.vocabGroup) return false;
      if (!query) return true;
      return (entry.en + ' ' + entry.zh + ' ' + entry.example_en).toLowerCase().indexOf(query) !== -1;
    });

    list.innerHTML = entries.map(function (entry) {
      return '<article class="vocab-card" data-level="' + NC.escapeHtml(entry.level) + '">' +
        '<div class="vocab-head">' +
          '<span class="vocab-en" lang="en">' + NC.escapeHtml(entry.en) + '</span>' +
          '<span class="vocab-zh">' + NC.escapeHtml(entry.zh) + '</span>' +
          levelBadge(entry.level) +
          registerBadge(entry.register) +
        '</div>' +
        '<p class="vocab-ex"><span lang="en">' + NC.escapeHtml(entry.example_en) + '</span></p>' +
        '<p class="vocab-ex-zh">' + NC.escapeHtml(entry.example_zh) + '</p>' +
        (entry.note_zh ? '<p class="vocab-note">' + NC.escapeHtml(entry.note_zh) + '</p>' : '') +
      '</article>';
    }).join('');
    if (!entries.length) {
      list.innerHTML = '<p class="empty">没有匹配的表达，换个关键词或把难度调高。</p>';
    }
  }

  function setupVocabSearch() {
    var input = NC.byId('vocab-search');
    if (!input) return;
    input.addEventListener('input', function () {
      state.vocabQuery = input.value.trim();
      renderVocabulary();
    });
  }

  function renderGrammarPatterns() {
    var host = NC.byId('grammar-patterns');
    if (!host) return;
    var patterns = NC.state.data.grammar.patterns;
    host.innerHTML = patterns.map(function (pattern) {
      return '<article class="grammar-card">' +
        '<div class="grammar-head"><h3 lang="en">' + NC.escapeHtml(pattern.title_en) + '</h3>' +
        '<span class="grammar-zh">' + NC.escapeHtml(pattern.title_zh) + '</span>' +
        levelBadge(pattern.level) + '</div>' +
        '<p class="grammar-explain">' + NC.escapeHtml(pattern.explain_zh) + '</p>' +
        '<div class="examples">' +
          (pattern.correct || []).map(function (item) {
            return '<div class="example correct"><span class="mark">✓</span><div><p lang="en">' + NC.escapeHtml(item.en) + '</p><p class="zh">' + NC.escapeHtml(item.zh) + '</p></div></div>';
          }).join('') +
          (pattern.wrong || []).map(function (item) {
            return '<div class="example wrong"><span class="mark">✕</span><div><p lang="en">' + NC.escapeHtml(item.en) + '</p><p class="zh">' + NC.escapeHtml(item.why_zh) + '</p></div></div>';
          }).join('') +
        '</div>' +
      '</article>';
    }).join('');
  }

  function renderConverter() {
    var verbSelect = NC.byId('converter-verb');
    var adverbSelect = NC.byId('converter-adverb');
    var output = NC.byId('converter-output');
    if (!verbSelect || !adverbSelect || !output) return;
    var grammar = NC.state.data.grammar.converter;
    var verbs = grammar.verbs.filter(function (verb) { return NC.showLevel(verb.level, NC.state.level); });
    var adverbs = grammar.adverbs.filter(function (adverb) { return NC.showLevel(adverb.level, NC.state.level); });
    if (!verbs.length) verbs = grammar.verbs;
    if (!adverbs.length) adverbs = grammar.adverbs;

    var verbValue = verbSelect.value;
    var adverbValue = adverbSelect.value;
    verbSelect.innerHTML = verbs.map(function (verb) {
      return '<option value="' + verb.id + '">' + NC.escapeHtml(verb.base) + ' · ' + NC.escapeHtml(verb.zh) + '</option>';
    }).join('');
    adverbSelect.innerHTML = adverbs.map(function (adverb) {
      return '<option value="' + adverb.id + '">' + NC.escapeHtml(adverb.adverb) + ' · ' + NC.escapeHtml(adverb.zh) + '</option>';
    }).join('');
    if (verbs.some(function (verb) { return verb.id === verbValue; })) verbSelect.value = verbValue;
    if (adverbs.some(function (adverb) { return adverb.id === adverbValue; })) adverbSelect.value = adverbValue;

    var verb = verbs.filter(function (item) { return item.id === verbSelect.value; })[0] || verbs[0];
    var adverb = adverbs.filter(function (item) { return item.id === adverbSelect.value; })[0] || adverbs[0];
    var nounPhrase = NC.fmt.withArticle(adverb.adjective + ' ' + verb.noun);
    output.innerHTML =
      '<p class="converter-line" lang="en">Revenue ' + NC.escapeHtml(verb.past) + ' ' + NC.escapeHtml(adverb.adverb) + '.</p>' +
      '<p class="converter-line" lang="en">There was ' + NC.escapeHtml(nounPhrase) + ' in revenue.</p>' +
      '<p class="converter-line" lang="en">Revenue saw ' + NC.escapeHtml(nounPhrase) + '.</p>' +
      '<p class="converter-zh">收入' + NC.escapeHtml(adverb.zh) + NC.escapeHtml(verb.zh) + '。</p>';

    function update() {
      var currentVerb = verbs.filter(function (item) { return item.id === verbSelect.value; })[0] || verbs[0];
      var currentAdverb = adverbs.filter(function (item) { return item.id === adverbSelect.value; })[0] || adverbs[0];
      var phrase = NC.fmt.withArticle(currentAdverb.adjective + ' ' + currentVerb.noun);
      output.innerHTML =
        '<p class="converter-line" lang="en">Revenue ' + NC.escapeHtml(currentVerb.past) + ' ' + NC.escapeHtml(currentAdverb.adverb) + '.</p>' +
        '<p class="converter-line" lang="en">There was ' + NC.escapeHtml(phrase) + ' in revenue.</p>' +
        '<p class="converter-line" lang="en">Revenue saw ' + NC.escapeHtml(phrase) + '.</p>' +
        '<p class="converter-zh">收入' + NC.escapeHtml(currentAdverb.zh) + NC.escapeHtml(currentVerb.zh) + '。</p>';
    }
    verbSelect.onchange = update;
    adverbSelect.onchange = update;
  }

  function renderErrors() {
    var host = NC.byId('errors-list');
    if (!host) return;
    var errors = NC.state.data.errors.errors;
    host.innerHTML = errors.map(function (item) {
      return '<article class="error-card">' +
        '<div class="error-head">' + levelBadge(item.level) + '</div>' +
        '<div class="example wrong"><span class="mark">✕</span><p lang="en">' + NC.escapeHtml(item.wrong_en) + '</p></div>' +
        '<div class="example correct"><span class="mark">✓</span><p lang="en">' + NC.escapeHtml(item.right_en) + '</p></div>' +
        '<p class="error-why">' + NC.escapeHtml(item.why_zh) + '</p>' +
      '</article>';
    }).join('');
  }

  function setupLazyMount() {
    var labs = NC.state.labs;
    var ids = Object.keys(labs);
    var firstId = NC.state.data.types.sections.slice().sort(function (a, b) { return a.order - b.order; })[0].id;
    if (labs[firstId]) labs[firstId].mount();

    if (!('IntersectionObserver' in window)) {
      ids.forEach(function (id) { labs[id].mount(); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = entry.target.getAttribute('data-type');
        if (labs[id]) labs[id].mount();
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '500px 0px' });
    ids.forEach(function (id) {
      if (id === firstId) return;
      observer.observe(labs[id].section);
    });
  }

  function setupReducedMotion() {
    var query = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    NC.state.reducedMotion = !!(query && query.matches);
    document.documentElement.setAttribute('data-reduced-motion', NC.state.reducedMotion ? 'true' : 'false');
  }

  ui.build = function () {
    setupReducedMotion();
    buildSections();
    buildToc();
    setupScrollSpy();
    setupLevel();
    renderVocabulary();
    setupVocabSearch();
    renderGrammarPatterns();
    renderConverter();
    renderErrors();
    setupLazyMount();
  };

  ui.mountAll = function () {
    Object.keys(NC.state.labs).forEach(function (id) {
      NC.state.labs[id].mount();
    });
  };
})(window.NPESLCharts);
