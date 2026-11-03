(function (NC) {
  'use strict';

  var ui = NC.ui = {};
  var SCENES = {
    line: 'Nova Delivery · quarterly revenue',
    area: 'Nova Delivery · quarterly revenue',
    bar: 'Peak Coffee · revenue by region',
    hbar: 'Peak Coffee · revenue by region',
    table: 'Peak Coffee · revenue by region',
    pie: 'Harbor Cloud · market share by channel'
  };

  var state = {
    typeId: null
  };

  function sortedTypes() {
    return NC.state.data.types.sections.slice().sort(function (a, b) {
      return a.order - b.order;
    });
  }

  function levelBadge(level) {
    return '<span class="badge level-badge" data-level="' + NC.escapeHtml(level) + '">' + NC.escapeHtml(level) + '</span>';
  }

  function registerBadge(register) {
    if (!register || register === 'neutral') return '';
    var map = { spoken: '口语', formal: '正式', business: '商务', journalism: '新闻', informal: '非正式' };
    return '<span class="badge register-badge">' + (map[register] || register) + '</span>';
  }

  function converterHtml() {
    return '<div class="converter" data-converter>' +
      '<h3>动词 + 副词 ↔ 形容词 + 名词</h3>' +
      '<div class="converter-controls">' +
        '<label>动词 <select data-converter-verb></select></label>' +
        '<label>副词 <select data-converter-adverb></select></label>' +
      '</div>' +
      '<div class="converter-output" data-converter-output></div>' +
    '</div>';
  }

  function panelHtml(type) {
    return '<header class="section-head">' +
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
      '<details class="learning" data-vocab-section>' +
        '<summary>词汇</summary>' +
        '<div class="learning-body"><div class="vocab-groups" data-vocab></div></div>' +
      '</details>' +
      '<details class="learning" data-grammar-section>' +
        '<summary>句型与语法</summary>' +
        '<div class="learning-body">' +
          (type.converter ? converterHtml() : '') +
          '<div class="grammar-list" data-grammar></div>' +
        '</div>' +
      '</details>' +
      '<div class="model">' +
        '<button class="pill" type="button" data-model-toggle aria-expanded="false">看一段范文</button>' +
        '<div class="model-box" data-model hidden><div class="model-body" data-model-body></div></div>' +
      '</div>';
  }

  function buildPanels() {
    var host = NC.byId('panels');
    sortedTypes().forEach(function (type, index) {
      var panel = document.createElement('section');
      panel.className = 'chart-section chart-panel';
      panel.id = 'chart-' + type.id;
      panel.setAttribute('data-type', type.id);
      panel.setAttribute('data-mounted', 'false');
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', 'tab-' + type.id);
      panel.hidden = index !== 0;
      panel.innerHTML = panelHtml(type);
      host.appendChild(panel);
      NC.state.labs[type.id] = new NC.Lab(panel, type);
    });
  }

  function vocabCard(entry) {
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
  }

  function renderVocab(type) {
    var section = NC.byId('chart-' + type.id);
    var host = section && section.querySelector('[data-vocab]');
    if (!host) return;
    var allowed = type.vocab_groups || [];
    var entries = NC.state.data.vocab.entries.filter(function (entry) {
      return allowed.indexOf(entry.group) !== -1;
    });
    var html = NC.state.data.vocab.groups.filter(function (group) {
      return allowed.indexOf(group.id) !== -1;
    }).map(function (group) {
      var items = entries.filter(function (entry) { return entry.group === group.id; });
      if (!items.length) return '';
      return '<div class="vocab-group">' +
        '<h4>' + NC.escapeHtml(group.title_zh) + '</h4>' +
        '<div class="vocab-list">' + items.map(vocabCard).join('') + '</div>' +
      '</div>';
    }).join('');
    host.innerHTML = html || '<p class="empty">当前难度下没有词条，把难度调高试试。</p>';
  }

  function renderPatterns(type) {
    var section = NC.byId('chart-' + type.id);
    var list = section && section.querySelector('[data-patterns]');
    if (!list) return;
    var visible = (type.patterns || []).slice();
    list.innerHTML = visible.map(function (pattern) {
      return '<li>' + levelBadge(pattern.level) +
        '<span class="pattern-en" lang="en">' + NC.escapeHtml(pattern.en) + '</span>' +
        '<span class="pattern-zh">' + NC.escapeHtml(pattern.zh) + '</span></li>';
    }).join('');
  }

  function grammarCard(pattern) {
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
  }

  function renderGrammar(type) {
    var section = NC.byId('chart-' + type.id);
    var host = section && section.querySelector('[data-grammar]');
    if (!host) return;
    var allowed = type.grammar_patterns || [];
    var patterns = NC.state.data.grammar.patterns.filter(function (pattern) {
      return allowed.indexOf(pattern.id) !== -1;
    });
    host.innerHTML = patterns.map(grammarCard).join('');
  }

  function renderConverter(type) {
    var section = NC.byId('chart-' + type.id);
    var host = section && section.querySelector('[data-converter]');
    if (!host) return;
    var verbSelect = host.querySelector('[data-converter-verb]');
    var adverbSelect = host.querySelector('[data-converter-adverb]');
    var output = host.querySelector('[data-converter-output]');
    if (!verbSelect || !adverbSelect || !output) return;

    var grammar = NC.state.data.grammar.converter;
    var verbs = grammar.verbs.slice();
    var adverbs = grammar.adverbs.slice();

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
    update();
  }

  function renderLearning(type) {
    renderPatterns(type);
    renderVocab(type);
    renderGrammar(type);
    renderConverter(type);
  }

  function renderAllLearning() {
    sortedTypes().forEach(renderLearning);
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

  function buildTypeSwitch() {
    var host = NC.byId('type-buttons');
    if (!host) return;
    host.innerHTML = '';
    sortedTypes().forEach(function (type) {
      var button = document.createElement('button');
      button.type = 'button';
      button.id = 'tab-' + type.id;
      button.className = 'type-tab';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', 'chart-' + type.id);
      button.setAttribute('aria-selected', 'false');
      button.tabIndex = -1;
      button.textContent = type.label_zh;
      button.addEventListener('click', function () {
        activate(type.id);
      });
      button.addEventListener('keydown', onTabKey);
      host.appendChild(button);
    });
  }

  function onTabKey(event) {
    var keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
    if (keys.indexOf(event.key) === -1) return;
    event.preventDefault();
    var types = sortedTypes();
    var current = types.map(function (type) { return type.id; }).indexOf(state.typeId);
    var next = current;
    if (event.key === 'ArrowRight') next = (current + 1) % types.length;
    if (event.key === 'ArrowLeft') next = (current - 1 + types.length) % types.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = types.length - 1;
    activate(types[next].id);
    var tab = NC.byId('tab-' + types[next].id);
    if (tab) tab.focus();
  }

  function typeFromHash() {
    var hash = String((window.location && window.location.hash) || '').replace(/^#/, '');
    if (hash.indexOf('chart-') === 0) hash = hash.slice(6);
    return hash;
  }

  function activate(id) {
    var types = sortedTypes();
    var known = types.some(function (type) { return type.id === id; });
    if (!known) id = types[0].id;
    state.typeId = id;
    types.forEach(function (type) {
      var panel = NC.byId('chart-' + type.id);
      var tab = NC.byId('tab-' + type.id);
      var selected = type.id === id;
      if (panel) panel.hidden = !selected;
      if (tab) {
        tab.setAttribute('aria-selected', selected ? 'true' : 'false');
        tab.tabIndex = selected ? 0 : -1;
      }
    });
    var lab = NC.state.labs[id];
    if (lab) lab.mount();
    try {
      window.history.replaceState(null, '', '#chart-' + id);
    } catch (err) {}
  }

  function initialTypeId() {
    var id = typeFromHash();
    var types = sortedTypes();
    var known = types.some(function (type) { return type.id === id; });
    return known ? id : types[0].id;
  }

  function setupHash() {
    window.addEventListener('hashchange', function () {
      var id = typeFromHash();
      var types = sortedTypes();
      var known = types.some(function (type) { return type.id === id; });
      if (known && id !== state.typeId) activate(id);
    });
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
        if (lab.mounted) lab.refresh(false);
      });
      renderAllLearning();
    }
    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        apply(button.getAttribute('data-level'));
      });
    });
    apply(NC.state.level);
  }

  function setupReducedMotion() {
    var query = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    NC.state.reducedMotion = !!(query && query.matches);
    document.documentElement.setAttribute('data-reduced-motion', NC.state.reducedMotion ? 'true' : 'false');
  }

  ui.build = function () {
    setupReducedMotion();
    buildPanels();
    buildTypeSwitch();
    renderErrors();
    setupLevel();
    setupHash();
    activate(initialTypeId());
  };

  ui.mountAll = function () {
    Object.keys(NC.state.labs).forEach(function (id) {
      if (NC.state.labs[id]) NC.state.labs[id].mount();
    });
  };
})(window.NPESLCharts);
