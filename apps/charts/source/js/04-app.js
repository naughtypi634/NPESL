/* App shell: chart tabs, description list, sentence <-> mark linking, level,
 * reset, and the reference dialog. Charts mount lazily on first view.
 */
(function (NC) {
  'use strict';

  var GLYPH = {
    line: '<path d="M3 17l5-6 4 3 4-7 5 2"/>',
    bar: '<rect x="4" y="11" width="3" height="7"/><rect x="10" y="6" width="3" height="12"/><rect x="16" y="9" width="3" height="9"/>',
    pie: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M14 3.2A9 9 0 0 1 20.8 10H14z"/>',
    table: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M10 4.5v15"/>',
    process: '<circle cx="5" cy="12" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="19" cy="12" r="2.2"/><path d="M7.4 12h2.4M14.4 12h2.4"/>',
    combo: '<rect x="4" y="12" width="3" height="7"/><rect x="10.5" y="8" width="3" height="11"/><path d="M4 9l6.5-4 4 2.5 5.5-3"/>'
  };

  var RESET_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>';

  var state = {
    types: [],
    datasets: {},
    initial: {},
    level: 'basic',
    active: null,
    mounted: {},
    sentences: {},
    activeSentence: {},
    refTab: 'patterns'
  };

  var panels = {};
  var tabs = {};

  function typeById(id) {
    for (var i = 0; i < state.types.length; i += 1) {
      if (state.types[i].id === id) return state.types[i];
    }
    return null;
  }

  function isDirty(key) {
    return JSON.stringify(state.datasets[key]) !== JSON.stringify(state.initial[key]);
  }

  function levelLabel(id) {
    var found = NC.content.levels.filter(function (level) { return level.id === id; })[0];
    return found ? found.zh : id;
  }

  // ---- building ----------------------------------------------------------

  function buildTabs(host) {
    state.types.forEach(function (type) {
      var tab = NC.el('button', {
        type: 'button',
        class: 'type-tab',
        role: 'tab',
        id: 'tab-' + type.id,
        'aria-controls': 'panel-' + type.id,
        'aria-selected': 'false',
        tabindex: '-1',
        title: type.label_en
      }, '<span class="glyph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        (GLYPH[type.renderer] || GLYPH.line) + '</svg></span><span class="type-label">' + NC.escape(type.label_zh) + '</span>');
      tab.addEventListener('click', function () { activate(type.id, true); });
      tab.addEventListener('keydown', onTabKey);
      host.appendChild(tab);
      tabs[type.id] = tab;
    });
  }

  function buildLevels(host) {
    host.innerHTML = '';
    NC.content.levels.forEach(function (level) {
      var button = NC.el('button', {
        type: 'button',
        class: 'seg-btn',
        'data-level': level.id,
        'aria-pressed': 'false'
      }, NC.escape(level.zh));
      button.addEventListener('click', function () { setLevel(level.id); });
      host.appendChild(button);
    });
  }

  function buildPanel(type, host) {
    var scene = state.datasets[type.dataset];
    var section = NC.el('section', {
      class: 'panel',
      id: 'panel-' + type.id,
      role: 'tabpanel',
      'aria-labelledby': 'tab-' + type.id,
      'data-type': type.id,
      hidden: true
    });
    section.innerHTML =
      '<div class="card figure">' +
        '<header class="figure-head">' +
          '<div class="figure-title">' +
            '<h2 lang="en">' + NC.escape(scene.scene_en) + '</h2>' +
            '<p class="scene-zh">' + NC.escape(scene.scene_zh) + '</p>' +
          '</div>' +
          '<button class="icon-btn" type="button" data-reset aria-label="还原数据" title="还原数据" hidden>' + RESET_ICON + '</button>' +
        '</header>' +
        '<div class="plot" data-plot></div>' +
      '</div>' +
      '<aside class="card notes">' +
        '<header class="notes-head"><div class="seg" role="group" aria-label="描述难度" data-levels></div></header>' +
        '<ol class="sentences" data-sentences></ol>' +
        '<p class="note">' + NC.escape(type.note_zh) + '</p>' +
        '<p class="sr-only" aria-live="polite" data-live></p>' +
      '</aside>';
    host.appendChild(section);
    buildLevels(section.querySelector('[data-levels]'));

    section.querySelector('[data-reset]').addEventListener('click', function () {
      reset(type.dataset);
    });
    section.addEventListener('pointerover', function (event) { onMarkEnter(type, event); });
    section.addEventListener('focusin', function (event) { onMarkEnter(type, event); });
    section.addEventListener('click', function (event) {
      var button = event.target.closest ? event.target.closest('.sentence') : null;
      if (button && section.contains(button)) {
        setActive(type.id, Number(button.getAttribute('data-index')));
        return;
      }
      onMarkEnter(type, event);
    });
    panels[type.id] = section;
  }

  function onMarkEnter(type, event) {
    var node = event.target && event.target.closest ? event.target.closest('[data-mark]') : null;
    if (!node) return;
    var index = indexForMark(type.id, node.getAttribute('data-mark'));
    if (index >= 0) setActive(type.id, index);
  }

  // ---- mounting and refreshing ----------------------------------------

  function ctxFor(type) {
    return {
      data: function () { return state.datasets[type.dataset]; },
      changed: function () { changed(type.dataset); }
    };
  }

  function ensureMounted(type) {
    if (state.mounted[type.id]) return state.mounted[type.id];
    var plot = panels[type.id].querySelector('[data-plot]');
    var renderer = NC.renderers[type.renderer];
    state.mounted[type.id] = renderer(plot, ctxFor(type));
    return state.mounted[type.id];
  }

  function describe(type) {
    state.sentences[type.id] = NC.describe(type, state.datasets, state.level);
    var list = panels[type.id].querySelector('[data-sentences]');
    list.innerHTML = '';
    state.sentences[type.id].forEach(function (sentence, index) {
      var li = NC.el('li');
      var button = NC.el('button', {
        type: 'button',
        class: 'sentence',
        'data-index': index,
        'aria-pressed': 'false'
      }, '<span class="en" lang="en">' + NC.escape(sentence.en) + '</span>' +
         '<span class="zh" lang="zh">' + NC.escape(sentence.zh) + '</span>');
      li.appendChild(button);
      list.appendChild(li);
    });
    var active = Math.min(state.activeSentence[type.id] || 0, state.sentences[type.id].length - 1);
    state.activeSentence[type.id] = Math.max(0, active);
    paintActive(type.id);
    updateReset(type);
  }

  function paintActive(typeId) {
    var type = typeById(typeId);
    var panel = panels[typeId];
    var index = state.activeSentence[typeId] || 0;
    var list = panel.querySelector('[data-sentences]');
    Array.prototype.forEach.call(list.querySelectorAll('.sentence'), function (button, i) {
      var on = i === index;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var sentence = (state.sentences[typeId] || [])[index];
    applyHighlight(panel, sentence ? sentence.marks : []);
    var live = panel.querySelector('[data-live]');
    if (live && sentence) live.textContent = sentence.en;
    return type;
  }

  function applyHighlight(panel, marks) {
    Array.prototype.forEach.call(panel.querySelectorAll('[data-mark]'), function (node) {
      var mark = node.getAttribute('data-mark');
      node.classList.toggle('is-dim', marks.length > 0 && marks.indexOf(mark) === -1);
    });
  }

  function indexForMark(typeId, mark) {
    var list = state.sentences[typeId] || [];
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].marks.indexOf(mark) !== -1) return i;
    }
    return -1;
  }

  function setActive(typeId, index) {
    var list = state.sentences[typeId] || [];
    if (!list.length || index < 0 || index >= list.length) return;
    if (state.activeSentence[typeId] === index && panels[typeId].querySelector('.sentence.is-active')) return;
    state.activeSentence[typeId] = index;
    paintActive(typeId);
  }

  function updateReset(type) {
    var button = panels[type.id].querySelector('[data-reset]');
    if (button) button.hidden = !isDirty(type.dataset);
  }

  function refresh(type) {
    describe(type);
  }

  // Called after any edit. Every mounted chart on the same dataset redraws,
  // so the bar chart and the table stay in agreement.
  function changed(datasetKey) {
    state.types.forEach(function (type) {
      if (type.dataset !== datasetKey) return;
      var instance = state.mounted[type.id];
      if (!instance) return;
      instance.update();
      refresh(type);
    });
  }

  function reset(datasetKey) {
    state.datasets[datasetKey] = NC.clone(state.initial[datasetKey]);
    state.types.forEach(function (type) {
      if (type.dataset !== datasetKey) return;
      var instance = state.mounted[type.id];
      if (!instance) return;
      instance.update();
      refresh(type);
    });
  }

  function setLevel(level) {
    if (state.level === level) return;
    state.level = level;
    NC.store.set('npesl-charts-level', level);
    syncLevels();
    state.types.forEach(function (type) {
      if (state.mounted[type.id]) refresh(type);
    });
  }

  function syncLevels() {
    Object.keys(panels).forEach(function (id) {
      Array.prototype.forEach.call(panels[id].querySelectorAll('[data-level]'), function (button) {
        button.setAttribute('aria-pressed', button.getAttribute('data-level') === state.level ? 'true' : 'false');
        button.classList.toggle('is-on', button.getAttribute('data-level') === state.level);
      });
    });
  }

  // ---- tabs --------------------------------------------------------------

  function activate(id, userAction) {
    var type = typeById(id) || state.types[0];
    state.active = type.id;
    state.types.forEach(function (item) {
      var on = item.id === type.id;
      panels[item.id].hidden = !on;
      tabs[item.id].setAttribute('aria-selected', on ? 'true' : 'false');
      tabs[item.id].tabIndex = on ? 0 : -1;
      tabs[item.id].classList.toggle('is-on', on);
    });
    ensureMounted(type);
    refresh(type);
    if (userAction) {
      try { history.replaceState(null, '', '#' + type.id); } catch (err) {}
      try {
        tabs[type.id].scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
      } catch (err) {}
    }
  }

  function onTabKey(event) {
    var keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
    if (keys.indexOf(event.key) === -1) return;
    event.preventDefault();
    var ids = state.types.map(function (t) { return t.id; });
    var at = ids.indexOf(state.active);
    var next = at;
    if (event.key === 'ArrowRight') next = (at + 1) % ids.length;
    if (event.key === 'ArrowLeft') next = (at - 1 + ids.length) % ids.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = ids.length - 1;
    activate(ids[next], true);
    tabs[ids[next]].focus();
  }

  // ---- reference dialog -----------------------------------------------------

  var refDialog;
  var refTabs;
  var refBody;

  function renderReference() {
    var type = typeById(state.active);
    var html = '';
    if (state.refTab === 'patterns') {
      html = '<ul class="patterns">' + type.patterns.map(function (pattern) {
        return '<li><p class="en" lang="en">' + NC.escape(pattern.en) + '</p>' +
          '<p class="zh">' + NC.escape(pattern.zh) + '</p>' +
          (pattern.level === 'advanced' ? '<span class="tag">' + levelLabel('advanced') + '</span>' : '') + '</li>';
      }).join('') + '</ul>';
    } else if (state.refTab === 'vocab') {
      var entries = NC.content.vocabulary.entries;
      html = type.vocab_groups.map(function (groupId) {
        var group = NC.content.vocabulary.groups.filter(function (g) { return g.id === groupId; })[0];
        if (!group) return '';
        var items = entries.filter(function (e) { return e.group === groupId; });
        return '<section class="vocab-group"><h3>' + NC.escape(group.title_zh) + '</h3>' +
          items.map(function (item) {
            return '<article class="vocab">' +
              '<p class="en" lang="en">' + NC.escape(item.en) + (item.level === 'advanced' ? '<span class="tag">' + levelLabel('advanced') + '</span>' : '') + '</p>' +
              '<p class="zh">' + NC.escape(item.zh) + '</p>' +
              '<p class="example" lang="en">' + NC.escape(item.example_en) + '</p>' +
              '<p class="zh">' + NC.escape(item.example_zh) + '</p>' +
            '</article>';
          }).join('') + '</section>';
      }).join('');
    } else {
      var data = NC.content.errors;
      html = data.categories.map(function (category) {
        var items = data.errors.filter(function (e) { return e.category === category.id; });
        return '<section class="error-group"><h3>' + NC.escape(category.title_zh) +
          ' <span lang="en">' + NC.escape(category.title_en) + '</span></h3>' +
          items.map(function (item) {
            return '<article class="error">' +
              '<p class="wrong" lang="en"><span class="mark">✕</span>' + NC.escape(item.wrong_en) + '</p>' +
              '<p class="right" lang="en"><span class="mark">✓</span>' + NC.escape(item.right_en) + '</p>' +
              '<p class="zh">' + NC.escape(item.why_zh) + '</p>' +
            '</article>';
          }).join('') + '</section>';
      }).join('');
    }
    refBody.innerHTML = html;
    Array.prototype.forEach.call(refTabs.querySelectorAll('[role="tab"]'), function (tab) {
      var on = tab.getAttribute('data-ref-tab') === state.refTab;
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
    });
  }

  function openReference() {
    renderReference();
    if (refDialog.showModal) refDialog.showModal();
    else refDialog.setAttribute('open', '');
  }

  function closeReference() {
    if (refDialog.close) refDialog.close();
    else refDialog.removeAttribute('open');
  }

  function bindReference() {
    refDialog = document.getElementById('ref');
    refTabs = document.getElementById('ref-tabs');
    refBody = document.getElementById('ref-body');
    document.querySelector('[data-open-ref]').addEventListener('click', openReference);
    document.querySelector('[data-ref-close]').addEventListener('click', closeReference);
    refDialog.addEventListener('click', function (event) {
      if (event.target === refDialog) closeReference();
    });
    Array.prototype.forEach.call(refTabs.querySelectorAll('[role="tab"]'), function (tab) {
      tab.addEventListener('click', function () {
        state.refTab = tab.getAttribute('data-ref-tab');
        renderReference();
      });
    });
  }

  // ---- boot ---------------------------------------------------------------

  function boot() {
    var payload = JSON.parse(document.getElementById('charts-data').textContent);
    NC.content = {
      levels: payload.levels,
      describe: payload.describe,
      vocabulary: payload.vocabulary,
      errors: payload.errors
    };
    state.types = payload.types.slice().sort(function (a, b) { return a.order - b.order; });
    state.datasets = payload.datasets;
    state.initial = NC.clone(payload.datasets);

    var saved = NC.store.get('npesl-charts-level', 'basic');
    state.level = payload.levels.some(function (l) { return l.id === saved; }) ? saved : 'basic';

    buildTabs(document.getElementById('type-tabs'));
    var studio = document.getElementById('studio');
    state.types.forEach(function (type) { buildPanel(type, studio); });
    syncLevels();
    bindReference();

    // Level buttons live in each panel; one handler on the studio serves all.
    studio.addEventListener('click', function (event) {
      var button = event.target.closest ? event.target.closest('[data-level]') : null;
      if (button) setLevel(button.getAttribute('data-level'));
    });

    var hash = String(window.location.hash || '').replace(/^#/, '');
    var first = typeById(hash) ? hash : state.types[0].id;
    activate(first, false);
    document.documentElement.setAttribute('data-charts-ready', 'true');
  }

  // Read-only handle for the browser check (tests/charts.mjs).
  NC.app = { state: state, activate: activate, setLevel: setLevel, reset: reset };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.NPESLCharts);
