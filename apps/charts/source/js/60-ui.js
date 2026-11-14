(function (NC) {
  'use strict';

  var ui = NC.ui = {};

  var RESET_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>';

  var GLYPHS = {
    line: '<svg viewBox="0 0 34 17" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 13l7-6 7 3 9-7 7 2"/></svg>',
    bar: '<svg viewBox="0 0 34 17" fill="currentColor" aria-hidden="true"><rect x="2" y="8" width="5" height="7"/><rect x="11" y="4" width="5" height="11"/><rect x="20" y="10" width="5" height="5"/><rect x="29" y="6" width="3" height="9"/></svg>',
    pie: '<svg viewBox="0 0 34 17" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><circle cx="17" cy="8.5" r="6.5"/><path d="M17 8.5V2a6.5 6.5 0 0 1 6.5 6.5Z" fill="currentColor" stroke="none"/></svg>',
    table: '<svg viewBox="0 0 34 17" fill="none" stroke="currentColor" stroke-width="1.1" aria-hidden="true"><rect x="2" y="2.5" width="30" height="12"/><path d="M2 6.5h30M2 10.5h30M11 2.5v12M22 2.5v12"/></svg>',
    process: '<svg viewBox="0 0 34 17" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><circle cx="5" cy="8.5" r="2.2"/><circle cx="17" cy="8.5" r="2.2"/><circle cx="29" cy="8.5" r="2.2"/><path d="M8.2 8.5h6.4M20.2 8.5h6.4"/></svg>',
    mixed: '<svg viewBox="0 0 34 17" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true"><path d="M2 7h4v8H2zM13 4h4v11h-4zM24 9h4v6h-4z" fill="currentColor" stroke="none"/><path d="M2 12l6-4 7 2 7-5 8 2" stroke-linecap="round"/></svg>'
  };

  // Timed one-shot classes (panel entrance, description fade). One owner per
  // node, so a rapid re-trigger cannot leave the class stuck or have an older
  // timer strip it from a newer animation.
  function pulse(node, cls, ms) {
    if (!node) return;
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
    if (node.__pulseTimer) window.clearTimeout(node.__pulseTimer);
    node.__pulseTimer = window.setTimeout(function () {
      node.__pulseTimer = null;
      node.classList.remove(cls);
    }, ms);
  }

  function sceneFor(type) {
    var dataset = NC.state.datasets && type.dataset ? NC.state.datasets[type.dataset] : null;
    return {
      en: dataset && dataset.scene_en ? dataset.scene_en : '',
      zh: dataset && dataset.scene_zh ? dataset.scene_zh : ''
    };
  }

  function hintAllowed() {
    try { return !localStorage.getItem('npesl-charts-hint'); } catch (err) { return true; }
  }

  NC.dismissHint = function () {
    try { localStorage.setItem('npesl-charts-hint', '1'); } catch (err) {}
    Array.prototype.forEach.call(document.querySelectorAll('[data-hint]'), function (node) {
      node.hidden = true;
    });
  };

  function sortedTypes() {
    return NC.state.data.types.sections.slice().sort(function (a, b) {
      return a.order - b.order;
    });
  }

  function registerLabel(register) {
    if (!register || register === 'neutral') return '';
    var map = { spoken: '口语', formal: '正式', business: '商务', journalism: '新闻', informal: '非正式' };
    return '<span class="vocab-register">' + (map[register] || register) + '</span>';
  }

  function panelHtml(type) {
    var scene = sceneFor(type);
    var hints = {
      line: '拖动数据点改数值，点击可输入',
      bar: '拖动柱子改数值，点击可输入',
      pie: '拖动分界点改占比，点击可输入',
      mixed: '拖动柱子或折线点改数值，点击可输入'
    };
    var hintText = hints[type.renderer] || '';
    var reset = type.renderer === 'process' ? '' :
      '<button class="tool-btn tool-icon" type="button" data-reset aria-label="还原数据" title="还原数据" hidden>' + RESET_ICON + '</button>';
    var hint = hintText && hintAllowed() ? '<p class="figure-hint" data-hint>' + hintText + '</p>' : '';
    return '<div class="panel-layout">' +
        '<section class="stage">' +
          '<header class="stage-head">' +
            '<div class="stage-title">' +
              '<span class="stage-kicker">' + NC.escapeHtml(type.label_en) + '</span>' +
              '<h2 class="figure-title">' + NC.escapeHtml(scene.en) + '</h2>' +
              (scene.zh ? '<p class="figure-title-zh">' + NC.escapeHtml(scene.zh) + '</p>' : '') +
            '</div>' +
            '<div class="stage-stat" data-stat hidden></div>' +
          '</header>' +
          '<div class="stage-tools">' +
            '<div class="stage-modes" data-modes></div>' +
            '<span class="figure-actions">' + reset + '</span>' +
          '</div>' +
          '<div class="plot" data-plot></div>' +
          '<footer class="stage-foot">' +
            '<div class="legend-host" data-legend></div>' +
            hint +
          '</footer>' +
        '</section>' +
        '<aside class="rail">' +
          '<div class="desc-head">' +
            '<span class="desc-label">图表描述</span>' +
            '<span data-level-host></span>' +
          '</div>' +
          '<section class="desc" data-desc>' +
            '<ol class="desc-lines" data-desc-lines></ol>' +
            '<p class="sr-only" data-live aria-live="polite"></p>' +
          '</section>' +
          '<div class="rail-nav">' +
            '<button class="rail-btn" type="button" data-step-prev aria-label="上一句">← 上一句</button>' +
            '<span class="rail-count" data-step-count></span>' +
            '<button class="rail-btn" type="button" data-step-next aria-label="下一句">下一句 →</button>' +
          '</div>' +
        '</aside>' +
        '<div class="panel-reference" hidden>' +
          '<section class="learning-block" data-patterns-section>' +
            '<h3>常用句型</h3>' +
            '<ul class="pattern-list" data-patterns></ul>' +
          '</section>' +
          '<section class="learning-block" data-vocab-section>' +
            '<h3>词汇</h3>' +
            '<div class="vocab-groups" data-vocab></div>' +
          '</section>' +
        '</div>' +
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

  var LEVEL_ORDER = { A2: 0, B1: 1, B2: 2, C1: 3 };

  function vocabCard(entry) {
    return '<article class="vocab-card">' +
      '<div class="vocab-head">' +
        '<span class="vocab-en" lang="en">' + NC.escapeHtml(entry.en) + '</span>' +
        '<span class="vocab-zh">' + NC.escapeHtml(entry.zh) + '</span>' +
        registerLabel(entry.register) +
      '</div>' +
      (entry.pattern ? '<p class="vocab-pattern" lang="en">' + NC.escapeHtml(entry.pattern) + '</p>' : '') +
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
    var html = allowed.map(function (groupId) {
      return NC.state.data.vocab.groups.filter(function (group) { return group.id === groupId; })[0];
    }).filter(Boolean).map(function (group) {
      var items = entries.filter(function (entry) { return entry.group === group.id; })
        .sort(function (a, b) {
          return (LEVEL_ORDER[a.level] || 0) - (LEVEL_ORDER[b.level] || 0);
        });
      if (!items.length) return '';
      return '<div class="vocab-group">' +
        '<h4>' + NC.escapeHtml(group.title_zh) + '</h4>' +
        '<div class="vocab-list">' + items.map(vocabCard).join('') + '</div>' +
      '</div>';
    }).join('');
    host.innerHTML = html || '<p class="empty">暂无词汇。</p>';
  }

  function renderPatterns(type) {
    var section = NC.byId('chart-' + type.id);
    var list = section && section.querySelector('[data-patterns]');
    if (!list) return;
    list.innerHTML = (type.patterns || []).map(function (pattern) {
      return '<li>' +
        '<span class="pattern-en" lang="en">' + NC.escapeHtml(pattern.en) + '</span>' +
        '<span class="pattern-zh">' + NC.escapeHtml(pattern.zh) + '</span>' +
      '</li>';
    }).join('');
  }

  function renderLearning(type) {
    renderPatterns(type);
    renderVocab(type);
  }

  function renderAllLearning() {
    sortedTypes().forEach(renderLearning);
  }

  function renderErrors() {
    var host = NC.byId('errors-list');
    if (!host) return;
    var data = NC.state.data.errors;
    var errors = data.errors || [];
    var categories = data.categories || [];
    host.innerHTML = categories.map(function (category) {
      var items = errors.filter(function (item) { return item.category === category.id; });
      if (!items.length) return '';
      return '<section class="error-group" data-category="' + NC.escapeHtml(category.id) + '">' +
        '<header class="error-group-head">' +
          '<h3>' + NC.escapeHtml(category.title_zh) + '</h3>' +
          '<span>' + NC.escapeHtml(category.title_en) + '</span>' +
        '</header>' +
        '<div class="errors-grid">' + items.map(function (item) {
          return '<article class="error-card">' +
            '<div class="example wrong"><span class="mark">✕</span><p lang="en">' + NC.escapeHtml(item.wrong_en) + '</p></div>' +
            '<div class="example correct"><span class="mark">✓</span><p lang="en">' + NC.escapeHtml(item.right_en) + '</p></div>' +
            '<p class="error-why">' + NC.escapeHtml(item.why_zh) + '</p>' +
          '</article>';
        }).join('') + '</div>' +
      '</section>';
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
      button.title = type.label_en;
      button.innerHTML =
        '<span class="deck-glyph">' + (GLYPHS[type.renderer] || GLYPHS.line) + '</span>' +
        '<span class="deck-label">' + NC.escapeHtml(type.label_zh) + '</span>';
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
    var current = types.map(function (type) { return type.id; }).indexOf(NC.state.activeType);
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

  function scrollToPanel(panel) {
    if (!panel) return;
    var top = panel.getBoundingClientRect().top + window.scrollY;
    if (Math.abs(window.scrollY - top) > 8) {
      window.scrollTo({ top: top, behavior: NC.state.reducedMotion ? 'auto' : 'smooth' });
    }
  }

  function activate(id) {
    var types = sortedTypes();
    var known = types.some(function (type) { return type.id === id; });
    if (!known) id = types[0].id;
    var first = NC.state.activeType == null;
    var lab = NC.state.labs[id];
    var panel = NC.byId('chart-' + id);

    if (!first && id === NC.state.activeType) {
      if (lab && !lab.isMounted()) lab.mount();
      return;
    }

    var wasScrolled = window.scrollY > 80;
    NC.state.activeType = id;
    document.documentElement.setAttribute('data-charts-type', id);
    types.forEach(function (type) {
      var node = NC.byId('chart-' + type.id);
      var tab = NC.byId('tab-' + type.id);
      var selected = type.id === id;
      if (node) node.hidden = !selected;
      if (tab) {
        tab.setAttribute('aria-selected', selected ? 'true' : 'false');
        tab.tabIndex = selected ? 0 : -1;
      }
    });

    var scroller = NC.byId('type-buttons');
    var tab = NC.byId('tab-' + id);
    if (scroller && tab && scroller.scrollWidth > scroller.clientWidth) {
      var left = tab.offsetLeft - (scroller.clientWidth - tab.offsetWidth) / 2;
      left = Math.max(0, Math.min(left, scroller.scrollWidth - scroller.clientWidth));
      scroller.scrollTo({ left: left, behavior: NC.state.reducedMotion ? 'auto' : 'smooth' });
    }

    // The level control belongs to the description it changes, so it travels
    // with the visible panel.
    var levelHost = panel && panel.querySelector('[data-level-host]');
    if (levelHost && NC.state.levelControl && NC.state.levelControl.parentNode !== levelHost) {
      levelHost.appendChild(NC.state.levelControl);
    }

    if (lab) {
      lab.mount();
      if (lab.isMounted() && lab.renderer.render) {
        lab.renderer.render(lab);
        lab.refresh(false);
      }
    }
    if (panel && !NC.state.reducedMotion) pulse(panel, 'is-entering', 420);
    if (NC.syncDirty) NC.syncDirty();
    if (!first && wasScrolled && panel) scrollToPanel(panel);
    if (NC.motion && lab) NC.motion.play(lab);
    if (NC.referenceIsOpen && NC.referenceIsOpen()) NC.closeReference();
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
      if (known && id !== NC.state.activeType) activate(id);
    });
  }

  function setupHeader() {
    var head = NC.byId('site-head');
    if (!head) return;
    function measure() {
      document.documentElement.style.setProperty('--header-h', head.getBoundingClientRect().height + 'px');
    }
    measure();
    if ('ResizeObserver' in window) {
      new ResizeObserver(measure).observe(head);
    } else {
      window.addEventListener('resize', measure);
    }
  }

  function setupResize() {
    var timer = null;
    function fit() {
      if (document.querySelector('.handle.dragging, .handle[data-phase="pressed"], .value-editor')) return;
      Object.keys(NC.state.labs).forEach(function (id) {
        var lab = NC.state.labs[id];
        if (!lab.isMounted() || !lab.renderer.render) return;
        var rect = lab.plot.getBoundingClientRect();
        var last = lab.plot.__chartSize;
        if (last && Math.abs(rect.width - last.width) < 2 && Math.abs(rect.height - last.height) < 2) return;
        lab.renderer.render(lab);
        lab.refresh(false);
      });
    }
    function schedule() {
      window.clearTimeout(timer);
      timer = window.setTimeout(fit, 140);
    }
    window.addEventListener('resize', schedule);
    if ('ResizeObserver' in window) {
      var host = NC.byId('panels');
      if (host) new ResizeObserver(schedule).observe(host);
    }
  }

  function setupLevel() {
    var control = document.createElement('div');
    control.className = 'level-switch';
    control.id = 'level-switch';
    control.setAttribute('role', 'group');
    control.setAttribute('aria-label', '难度');
    var buttons = [
      { level: 'B1', label: '基础' },
      { level: 'C1', label: '进阶' }
    ].map(function (item) {
      var button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('data-level', item.level);
      button.textContent = item.label;
      control.appendChild(button);
      return button;
    });
    NC.state.levelControl = control;

    try {
      var saved = localStorage.getItem('npesl-charts-level');
      if (saved && NC.LEVELS.indexOf(saved) !== -1) NC.state.level = saved;
    } catch (err) {}
    var applied = false;
    function apply(level, animate) {
      if (NC.LEVELS.indexOf(level) === -1) level = 'B1';
      var changed = !applied || NC.state.level !== level;
      NC.state.level = level;
      document.documentElement.setAttribute('data-charts-level', level);
      buttons.forEach(function (button) {
        button.setAttribute('aria-pressed', button.getAttribute('data-level') === level ? 'true' : 'false');
      });
      try { localStorage.setItem('npesl-charts-level', level); } catch (err) {}
      if (!changed) return;
      applied = true;
      Object.keys(NC.state.labs).forEach(function (id) {
        var lab = NC.state.labs[id];
        if (!lab.isMounted()) return;
        if (animate) pulse(lab.section.querySelector('[data-desc]'), 'is-level-switching', 240);
        lab.activeStep = Math.min(lab.activeStep, 99);
        lab.refresh(false);
      });
    }
    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        apply(button.getAttribute('data-level'), true);
      });
    });
    apply(NC.state.level, false);
  }

  function setupReference() {
    var sheet = document.querySelector('[data-sheet]');
    var body = document.querySelector('[data-sheet-body]');
    var openButton = document.querySelector('[data-reference]');
    var closeButton = document.querySelector('[data-sheet] .sheet-close');
    var tabs = Array.prototype.slice.call(document.querySelectorAll('[data-sheet-tab]'));
    if (!sheet || !body || !openButton) return;

    var FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    var BACKGROUND = ['.studio-head', '.studio', '.deck'];

    // While the dialog is up the page behind it is not tabbable and not
    // reachable by a screen reader.
    function setBackgroundInert(on) {
      BACKGROUND.forEach(function (selector) {
        var node = document.querySelector(selector);
        if (!node) return;
        if (on) node.setAttribute('inert', '');
        else node.removeAttribute('inert');
      });
    }

    function focusables() {
      return Array.prototype.filter.call(sheet.querySelectorAll(FOCUSABLE), function (node) {
        return node.offsetParent !== null || node === document.activeElement;
      });
    }

    function trapTab(event) {
      if (event.key !== 'Tab' || sheet.hidden) return;
      var list = focusables();
      if (!list.length) return;
      var first = list[0];
      var last = list[list.length - 1];
      var inside = sheet.contains(document.activeElement);
      if (event.shiftKey && (!inside || document.activeElement === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || document.activeElement === last)) {
        event.preventDefault();
        first.focus();
      }
    }

    function selectTab(name) {
      tabs.forEach(function (tab) {
        tab.setAttribute('aria-selected', tab.getAttribute('data-sheet-tab') === name ? 'true' : 'false');
      });
      Array.prototype.forEach.call(body.querySelectorAll('[data-sheet-section]'), function (section) {
        section.hidden = section.getAttribute('data-sheet-section') !== name;
      });
    }

    function open() {
      var panel = NC.byId('chart-' + NC.state.activeType);
      body.innerHTML = '';
      function add(name, content) {
        if (!content) return;
        var section = document.createElement('div');
        section.setAttribute('data-sheet-section', name);
        section.appendChild(content);
        body.appendChild(section);
      }
      if (panel) {
        var patterns = panel.querySelector('[data-patterns-section]');
        var vocab = panel.querySelector('[data-vocab-section]');
        if (patterns) add('patterns', patterns.cloneNode(true));
        if (vocab) add('vocab', vocab.cloneNode(true));
      }
      var errorsSource = NC.byId('errors-list');
      if (errorsSource) {
        var errors = document.createElement('div');
        errors.className = 'library';
        errors.innerHTML = errorsSource.innerHTML;
        add('errors', errors);
      }
      selectTab('patterns');
      sheet.hidden = false;
      document.documentElement.setAttribute('data-sheet-open', 'true');
      setBackgroundInert(true);
      if (closeButton) {
        try { closeButton.focus({ preventScroll: true }); } catch (err) { closeButton.focus(); }
      }
    }

    function close() {
      if (sheet.hidden) return;
      sheet.hidden = true;
      document.documentElement.removeAttribute('data-sheet-open');
      setBackgroundInert(false);
      try { openButton.focus({ preventScroll: true }); } catch (err) { openButton.focus(); }
    }

    NC.referenceIsOpen = function () { return !sheet.hidden; };
    NC.closeReference = close;

    openButton.addEventListener('click', function () {
      if (sheet.hidden) open();
      else close();
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-sheet-close]'), function (node) {
      node.addEventListener('click', close);
    });
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () { selectTab(tab.getAttribute('data-sheet-tab')); });
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !sheet.hidden) {
        event.preventDefault();
        close();
      }
    });
    document.addEventListener('keydown', trapTab);
  }

  function setupReducedMotion() {
    var query = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    function apply(matches) {
      var reduced = !!matches;
      if (NC.state.reducedMotion === reduced) {
        document.documentElement.setAttribute('data-reduced-motion', reduced ? 'true' : 'false');
        return;
      }
      NC.state.reducedMotion = reduced;
      document.documentElement.setAttribute('data-reduced-motion', reduced ? 'true' : 'false');
      if (reduced && NC.motion) {
        Object.keys(NC.state.labs).forEach(function (id) {
          var lab = NC.state.labs[id];
          if (lab.isMounted()) NC.motion.play(lab);
        });
      }
    }
    apply(query && query.matches);
    if (!query) return;
    if (query.addEventListener) query.addEventListener('change', function (event) { apply(event.matches); });
    else if (query.addListener) query.addListener(function (event) { apply(event.matches); });
  }

  ui.pulse = pulse;

  ui.build = function () {
    setupReducedMotion();
    buildPanels();
    buildTypeSwitch();
    renderAllLearning();
    renderErrors();
    setupHeader();
    setupResize();
    setupLevel();
    setupReference();
    setupHash();
    activate(initialTypeId());
  };

  ui.mountAll = function () {
    Object.keys(NC.state.labs).forEach(function (id) {
      if (NC.state.labs[id]) NC.state.labs[id].mount();
    });
  };
})(window.NPESLCharts);
