(function (NC) {
  'use strict';

  var ui = NC.ui = {};

  var REPLAY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.34 5.66"/><path d="M20 4v6h-6"/></svg>';

  // Timed one-shot classes (panel entrance, level-switch fade). One owner per
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
    return dataset && dataset.scene_en ? dataset.scene_en : '';
  }

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
    var replay = ['line', 'bar', 'pie', 'mixed'].indexOf(type.renderer) === -1 ? '' :
      '<button class="action-btn action-btn-icon" type="button" data-replay aria-label="重播动画" title="重播动画">' + REPLAY_ICON + '<span>重播</span></button>';
    var reset = type.renderer === 'process' ? '' :
      '<button class="action-btn" type="button" data-reset>重置</button>';
    return '<header class="section-head">' +
        '<h2>' + NC.escapeHtml(type.label_zh) + ' <span class="h2-en">' + NC.escapeHtml(type.label_en) + '</span></h2>' +
      '</header>' +
      '<div class="panel-grid">' +
        '<div class="panel-figure">' +
          '<figure class="chart-card">' +
            '<header class="figure-head">' +
              '<div class="figure-top">' +
                '<span class="chart-scene">' + NC.escapeHtml(sceneFor(type)) + '</span>' +
                '<span class="figure-actions">' +
                  replay +
                  reset +
                '</span>' +
              '</div>' +
              '<div class="figure-modes" data-modes></div>' +
            '</header>' +
            '<div class="plot" data-plot></div>' +
          '</figure>' +
        '</div>' +
        '<aside class="panel-reading">' +
          '<section class="desc" data-desc>' +
            '<div class="desc-lines" data-desc-lines></div>' +
            '<p class="sr-only" data-live aria-live="polite"></p>' +
          '</section>' +
        '</aside>' +
      '</div>' +
      '<section class="learning-block" data-patterns-section>' +
        '<h3>常用句型</h3>' +
        '<ul class="pattern-list" data-patterns></ul>' +
      '</section>' +
      '<section class="learning-block" data-vocab-section>' +
        '<h3>词汇</h3>' +
        '<div class="vocab-groups" data-vocab></div>' +
      '</section>';
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

  function headerOffset() {
    var head = NC.byId('site-head');
    return (head ? head.getBoundingClientRect().height : 0) + 16;
  }

  function scrollToPanel(panel) {
    if (!panel) return;
    var top = panel.getBoundingClientRect().top + window.scrollY - headerOffset();
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

    // Re-clicking the active tab brings the chart back into view; it does not
    // rebuild it or replay the entrance animation. A half-finished mount is
    // retried.
    if (!first && id === NC.state.activeType) {
      if (lab && !lab.isMounted()) lab.mount();
      if (panel && window.scrollY > 80) scrollToPanel(panel);
      return;
    }

    var wasScrolled = window.scrollY > 80;
    var wasMounted = lab ? lab.isMounted() : false;
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

    if (lab) {
      lab.mount();
      // A lab that was mounted before was hidden while the viewport may have
      // changed; re-fit it. A fresh mount has already rendered and refreshed.
      if (wasMounted && lab.renderer.render) {
        lab.renderer.render(lab);
        lab.refresh(false);
      }
    }
    if (panel && !NC.state.reducedMotion) pulse(panel, 'is-entering', 800);
    if (!first && wasScrolled && panel) scrollToPanel(panel);
    if (NC.motion && lab) NC.motion.play(lab);
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
    var ticking = false;
    function update() {
      head.classList.toggle('is-scrolled', window.scrollY > 8);
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        ticking = false;
        update();
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
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

  function setupTypeOverflow() {
    var nav = document.querySelector('.type-switch');
    var scroller = NC.byId('type-buttons');
    if (!nav || !scroller) return;
    var prev = nav.querySelector('[data-scroll="-1"]');
    var next = nav.querySelector('[data-scroll="1"]');
    var hover = !window.matchMedia || window.matchMedia('(hover: hover)').matches;
    function update() {
      var max = scroller.scrollWidth - scroller.clientWidth;
      var x = scroller.scrollLeft;
      var start = x > 2;
      var end = max > 2 && x < max - 2;
      var mode = !start && !end ? 'none' : start && end ? 'both' : start ? 'start' : 'end';
      nav.setAttribute('data-overflow', mode);
      if (prev) prev.hidden = !(hover && start);
      if (next) next.hidden = !(hover && end);
    }
    scroller.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    if (prev) {
      prev.addEventListener('click', function () {
        scroller.scrollBy({ left: -180, behavior: NC.state.reducedMotion ? 'auto' : 'smooth' });
      });
    }
    if (next) {
      next.addEventListener('click', function () {
        scroller.scrollBy({ left: 180, behavior: NC.state.reducedMotion ? 'auto' : 'smooth' });
      });
    }
    update();
  }

  function setupLevel() {
    var buttons = Array.prototype.slice.call(document.querySelectorAll('#level-switch [data-level]'));
    var switchEl = NC.byId('level-switch');
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
      if (switchEl) switchEl.setAttribute('data-active', level);
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

  function setupResize() {
    var timer = null;
    function fit() {
      Object.keys(NC.state.labs).forEach(function (id) {
        var lab = NC.state.labs[id];
        if (!lab.isMounted() || !lab.svg || !NC.renderCommon || !NC.renderCommon.fit) return;
        var compact = NC.renderCommon.fit(lab.svg);
        if (lab.compact !== compact) {
          lab.compact = compact;
          lab.renderer.render(lab);
          lab.refresh(false);
          if (NC.motion) NC.motion.play(lab);
        }
      });
    }
    window.addEventListener('resize', function () {
      window.clearTimeout(timer);
      timer = window.setTimeout(fit, 150);
    });
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

  ui.build = function () {
    setupReducedMotion();
    buildPanels();
    buildTypeSwitch();
    renderAllLearning();
    renderErrors();
    setupHeader();
    setupTypeOverflow();
    setupResize();
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
