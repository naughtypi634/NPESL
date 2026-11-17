/* Expression panel: header, register lens, five tabs, Describe It reveal. */
(function (DV) {
  'use strict';

  var TABS = [
    { id: 'words', label: '词汇' },
    { id: 'patterns', label: '句型' },
    { id: 'compare', label: '辨析' },
    { id: 'describe', label: '描述' },
    { id: 'read', label: '解读' }
  ];
  var REGISTERS = [
    { id: 'general', label: '通用' },
    { id: 'ielts', label: '雅思' },
    { id: 'business', label: '商务' }
  ];
  var REG_ZH = { spoken: '口语', neutral: '通用', written: '书面' };
  var REG_ORDER = { spoken: 0, neutral: 1, written: 2 };

  function entryFor(state) {
    if (!state.feature || !state.library) return null;
    return (state.library.features || {})[state.feature.kind] || null;
  }

  function focusText(state) {
    if (!state.feature) return state.view.subject || '整张图';
    var slots = state.feature.slots || {};
    var bits = [];
    if (slots.source && slots.target && slots.source !== slots.target) {
      bits.push(slots.source + ' → ' + slots.target);
    } else if (slots.category) {
      bits.push(slots.category);
    } else if (slots.entity) {
      bits.push(slots.entity);
    }
    if (slots.x_value && slots.y_value) bits.push(slots.x_value + ', ' + slots.y_value);
    if (slots.period && bits.indexOf(slots.period) < 0) bits.push(slots.period);
    if (slots.from && slots.to) bits.push(slots.from + ' → ' + slots.to);
    else if (slots.value) bits.push(slots.value);
    else if (slots.share) bits.push(slots.share);
    if (!bits.length) bits.push(slots.subject || '');
    return bits.filter(Boolean).join(' · ');
  }

  function registerBadge(reg) {
    return DV.el('span', { class: 'dv-reg-badge' }, REG_ZH[reg] || reg);
  }

  function cap(text) {
    text = String(text == null ? '' : text);
    return /^[a-z]/.test(text) ? text.charAt(0).toUpperCase() + text.slice(1) : text;
  }

  function wordCard(word) {
    var card = DV.el('div', { class: 'dv-word' });
    var head = DV.el('div', { class: 'dv-word-head' }, card);
    DV.el('b', { class: 'dv-word-en', lang: 'en' }, head).textContent = word.en;
    DV.el('span', { class: 'dv-word-zh' }, head).textContent = word.zh || '';
    DV.el('span', { class: 'dv-reg-badge' }, head).textContent = REG_ZH[word.register] || '';
    DV.el('p', { class: 'dv-word-note' }, card).textContent = word.note_zh || '';
    var meta = [word.grammar, (word.collocations || []).slice(0, 2).join(' · ')].filter(Boolean).join(' · ');
    if (meta) DV.el('p', { class: 'dv-word-meta' }, card).textContent = meta;
    return card;
  }

  function patternCard(pattern, slots) {
    slots = DV.gen.slots(slots);
    var card = DV.el('div', { class: 'dv-pattern' });
    DV.el('span', { class: 'dv-level-badge' }, card).textContent = (pattern.level || '').toUpperCase();
    DV.el('p', { class: 'dv-pattern-en', lang: 'en' }, card).textContent = cap(DV.fill(pattern.frame, slots));
    if (pattern.zh_frame) DV.el('p', { class: 'dv-pattern-zh' }, card).textContent = DV.fill(pattern.zh_frame, slots);
    if (pattern.note_zh) DV.el('p', { class: 'dv-pattern-note' }, card).textContent = pattern.note_zh;
    return card;
  }

  function compareCard(comp) {
    var card = DV.el('div', { class: 'dv-compare' });
    DV.el('h4', { class: 'dv-compare-title' }, card).textContent = comp.a + ' vs ' + comp.b;
    DV.el('p', { class: 'dv-compare-line' }, card).textContent = comp.meaning_zh || '';
    DV.el('p', { class: 'dv-compare-line' }, card).textContent = '语法：' + (comp.grammar_zh || '');
    DV.el('p', { class: 'dv-compare-line' }, card).textContent = '搭配：' + (comp.collocations_zh || '');
    DV.el('p', { class: 'dv-compare-line' }, card).textContent = '用法：' + (comp.usage_zh || '');
    (comp.examples || []).slice(0, 1).forEach(function (ex) {
      DV.el('p', { class: 'dv-compare-ex', lang: 'en' }, card).textContent = ex.en;
    });
    return card;
  }

  function trapCard(trap, slots) {
    var card = DV.el('div', { class: 'dv-trap' });
    DV.el('p', { class: 'dv-trap-wrong', lang: 'en' }, card).textContent = '✗ ' + trap.wrong_en;
    DV.el('p', { class: 'dv-trap-right', lang: 'en' }, card).textContent = '✓ ' + trap.right_en;
    DV.el('p', { class: 'dv-trap-why' }, card).textContent = trap.why_zh || '';
    return card;
  }

  function wholeWords(state) {
    var seen = {};
    var out = [];
    var view = state.view;
    (view.features || []).forEach(function (feature) {
      var entry = (state.library.features || {})[feature.kind];
      if (!entry) return;
      (entry.words || []).forEach(function (word) {
        if (seen[word.en] || out.length >= 8) return;
        seen[word.en] = true;
        out.push(word);
      });
    });
    return out;
  }

  function firstEntry(state) {
    var view = state.view;
    for (var i = 0; i < (view.features || []).length; i++) {
      var entry = (state.library.features || {})[view.features[i].kind];
      if (entry) return entry;
    }
    return null;
  }

  function tabWords(host, state) {
    var entry = entryFor(state);
    var words = entry ? (entry.words || []).slice() : wholeWords(state);
    words.sort(function (a, b) {
      return (REG_ORDER[a.register] || 1) - (REG_ORDER[b.register] || 1);
    });
    words.slice(0, 8).forEach(function (word) { host.appendChild(wordCard(word)); });
    if (!words.length) DV.el('p', { class: 'dv-empty' }, host).textContent = '这个点还没有词汇条目。';
  }

  function tabPatterns(host, state) {
    var entry = entryFor(state) || firstEntry(state);
    if (!entry) {
      DV.el('p', { class: 'dv-empty' }, host).textContent = '这个点还没有句型。';
      return;
    }
    var slots = state.feature ? state.feature.slots : firstSlots(state);
    (entry.patterns || []).slice(0, 3).forEach(function (pattern) {
      host.appendChild(patternCard(pattern, slots));
    });
  }

  function firstSlots(state) {
    var view = state.view;
    for (var i = 0; i < (view.features || []).length; i++) {
      if (view.features[i].slots) return view.features[i].slots;
    }
    return {};
  }

  function tabCompare(host, state) {
    var entry = entryFor(state) || firstEntry(state);
    if (!entry) {
      DV.el('p', { class: 'dv-empty' }, host).textContent = '这个点还没有辨析。';
      return;
    }
    var ids = (entry.compare || []).slice(0, 2);
    var comps = (state.library.comparisons || []).filter(function (c) {
      return ids.indexOf(c.id) >= 0;
    });
    comps.forEach(function (comp) { host.appendChild(compareCard(comp)); });
    var trapSlots = state.feature ? state.feature.slots : firstSlots(state);
    (entry.traps || []).slice(0, 2).forEach(function (trap) { host.appendChild(trapCard(trap, trapSlots)); });
    if (!comps.length && !(entry.traps || []).length) {
      DV.el('p', { class: 'dv-empty' }, host).textContent = '这一项暂时没有容易混淆的表达。';
    }
  }

  function promptFor(state) {
    var kind = state.feature ? state.feature.kind : '';
    if (/rise|fall|flat|fluctuate|peak|trough|turning|compare|contributor|net_change|offset|share_shift|growth/.test(kind)) {
      return '用一句话描述这个变化。';
    }
    if (/largest|smallest|majority|minority|half|share|composition|component/.test(kind)) {
      return '用一句话描述这个占比。';
    }
    if (/correlat|cluster|outlier|positive|negative|weak|point/.test(kind)) {
      return '用一句话描述这个关系。';
    }
    if (/main_path|secondary|drop_off|merge|split|rank|overtake|converge|diverge/.test(kind)) {
      return '用一句话描述这个走向。';
    }
    return '用一句话描述这个数据。';
  }

  function modelTexts(state) {
    var entry = entryFor(state);
    if (!entry) return null;
    var slots = DV.gen.slots(state.feature.slots);
    var out = { a2: '', b1: '', b2: '' };
    (entry.patterns || []).forEach(function (pattern) {
      var key = pattern.level || 'b1';
      if (!out[key]) out[key] = cap(DV.fill(pattern.frame, slots));
    });
    out.a2 = out.a2 || out.b1 || out.b2;
    out.b1 = out.b1 || out.a2 || out.b2;
    out.b2 = out.b2 || out.b1 || out.a2;
    var examples = state.feature.examples || [];
    if (examples.length >= 2) out.b2 = examples[1].en;
    else if (examples.length === 1 && !out.b1) out.b1 = examples[0].en;
    return out;
  }

  function modelCard(text, zh, level) {
    var card = DV.el('div', { class: 'dv-model' });
    DV.el('span', { class: 'dv-level-badge' }, card).textContent = level;
    DV.el('p', { class: 'dv-model-en', lang: 'en' }, card).textContent = text;
    if (zh) DV.el('p', { class: 'dv-model-zh' }, card).textContent = zh;
    return card;
  }

  function tabDescribe(host, state) {
    var entry = entryFor(state);
    var prompt = promptFor(state);
    DV.el('p', { class: 'dv-prompt' }, host).textContent = prompt;

    if (state.feature) {
      var words = (entry && entry.words || []).slice(0, 4);
      if (words.length) {
        var keys = DV.el('div', { class: 'dv-keywords' }, host);
        words.forEach(function (word) {
          var chip = DV.el('span', { class: 'dv-keyword' }, keys);
          chip.textContent = word.en;
          DV.el('span', { class: 'dv-keyword-zh' }, chip).textContent = word.zh || '';
        });
      }
      var hint = (entry && entry.patterns || []).filter(function (p) { return p.level === 'b1'; })[0]
        || (entry && entry.patterns || []).filter(function (p) { return p.level === 'a2'; })[0];
      if (hint) {
        DV.el('div', { class: 'dv-frame' }, host).textContent = cap(DV.fill(hint.frame, DV.gen.slots(state.feature.slots)));
      }
    } else {
      DV.el('p', { class: 'dv-prompt-hint' }, host).textContent = '先把整张图的趋势、极值和结构说清楚，再补一个具体数字。';
    }

    if (state.feature) {
      var scratch = DV.el('details', { class: 'dv-scratch' }, host);
      DV.el('summary', {}, scratch).textContent = '自己写一句（不保存）';
      var ta = DV.el('textarea', { class: 'dv-scratch-input', rows: '2', lang: 'en' }, scratch);
      ta.setAttribute('placeholder', 'Type your sentence here…');
      ta.value = state.scratch || '';
      ta.addEventListener('input', function () {
        if (state.onScratch) state.onScratch(ta.value);
      });
    }

    var reveal = DV.el('button', {
      class: 'pill dv-reveal', type: 'button',
      'aria-expanded': state.revealed ? 'true' : 'false'
    }, host);
    reveal.textContent = state.revealed ? '收起参考' : '看参考';
    reveal.addEventListener('click', function () { state.onReveal(!state.revealed); });

    if (!state.revealed) return;
    var box = DV.el('div', { class: 'dv-models' }, host);

    if (state.register === 'general') {
      var levels = DV.el('div', { class: 'dv-levels', role: 'radiogroup', 'aria-label': '参考说法' }, box);
      [['a2', 'A2 简单'], ['b1', 'B1 自然'], ['b2', 'B2 具体']].forEach(function (item) {
        var btn = DV.el('button', {
          type: 'button', role: 'radio', 'aria-checked': state.level === item[0] ? 'true' : 'false'
        }, levels);
        btn.textContent = item[1];
        btn.addEventListener('click', function () { state.onLevel(item[0]); });
      });
    }

    if (!state.feature) {
      var model = '';
      if (state.edited) {
        if (state.register === 'general') {
          var generated = DV.gen.levels(state.view, state.features, state.library);
          model = generated[state.level] || generated.b1 || generated.a2 || '';
        } else {
          model = DV.gen.describe(state.view, state.features, state.library, state.register, 'b1');
        }
      } else {
        var desc = (state.view.descriptions || {});
        var general = desc.general || {};
        model = desc[state.register] || general[state.level] || general.a2 || '';
      }
      if (model) {
        modelCard(model, '', state.register === 'general'
          ? state.level.toUpperCase()
          : state.register === 'ielts' ? 'IELTS' : 'Business');
      } else {
        DV.el('p', { class: 'dv-empty' }, box).textContent = '这组数据还没有可用的参考句。';
      }
      return;
    }

    if (state.register === 'general') {
      var levels = modelTexts(state);
      if (levels) {
        DV.el('p', { class: 'dv-model-en', lang: 'en' }, box).textContent = levels[state.level] || levels.a2;
        var ex = (state.feature.examples || [])[0];
        if (state.level === 'a2' && ex && ex.zh) {
          DV.el('p', { class: 'dv-model-zh' }, box).textContent = ex.zh;
        }
        DV.el('p', { class: 'dv-model-note' }, box).textContent =
          'A2 直接、B1 自然、B2 更具体；三种都可以，按场合选。';
      }
    } else {
      var text = (entry && entry.registers || {})[state.register] || '';
      if (text) {
        DV.el('p', { class: 'dv-model-en', lang: 'en' }, box).textContent = cap(DV.fill(text, DV.gen.slots(state.feature.slots)));
        DV.el('p', { class: 'dv-model-note' }, box).textContent =
          state.register === 'ielts' ? '雅思：客观、先总后分。' : '商务：说完数据，顺手给一句判断。';
      }
    }
  }

  function tabRead(host, state) {
    if (state.feature) {
      var lead = state.feature.interpret_zh;
      if (!lead && state.edited) {
        lead = DV.gen.chinese(state.feature, state.library, 'b1');
      }
      if (lead) DV.el('p', { class: 'dv-read-lead' }, host).textContent = lead;
    }
    var overview = state.edited
      ? DV.gen.overviewZh(state.view, state.features, state.library)
      : state.view.overview_zh;
    if (overview) DV.el('p', { class: 'dv-overview' }, host).textContent = overview;
    if (state.view.type === 'scatter') {
      DV.el('p', { class: 'dv-causal' }, host).textContent =
        '相关不等于因果：散点图只能说明两个变量一起变化，不能说明谁导致谁。';
    }
  }

  DV.panel = {
    render: function (host, state) {
      DV.clear(host);
      host.className = 'card dv-panel';
      var head = DV.el('header', { class: 'dv-panel-head' }, host);
      var left = DV.el('div', {}, head);
      DV.el('p', { class: 'dv-focus-label' }, left).textContent = state.feature ? '已选' : '整张图';
      var focus = DV.el('p', { class: 'dv-focus', id: 'panel-focus' }, left);
      focus.textContent = focusText(state);
      if (state.feature) {
        var clear = DV.el('button', { class: 'pill dv-clear', type: 'button', 'aria-label': '清除选择' }, head);
        clear.textContent = '清除';
        clear.addEventListener('click', function () { state.onClear(); });
      }

      var regs = DV.el('div', { class: 'dv-register', role: 'radiogroup', 'aria-label': '说法场合' }, host);
      REGISTERS.forEach(function (reg) {
        var btn = DV.el('button', {
          type: 'button', role: 'radio', 'aria-checked': reg.id === state.register ? 'true' : 'false'
        }, regs);
        btn.textContent = reg.label;
        btn.addEventListener('click', function () { state.onRegister(reg.id); });
      });

      var tabs = DV.el('div', { class: 'dv-tabs', role: 'tablist', 'aria-label': '表达内容' }, host);
      TABS.forEach(function (tab) {
        var btn = DV.el('button', {
          type: 'button', role: 'tab', id: 'tab-' + tab.id,
          'aria-controls': 'panel-' + tab.id,
          'aria-selected': tab.id === state.tab ? 'true' : 'false',
          tabindex: tab.id === state.tab ? '0' : '-1'
        }, tabs);
        btn.textContent = tab.label;
        btn.addEventListener('click', function () { state.onTab(tab.id); });
        btn.addEventListener('keydown', function (event) {
          var idx = TABS.indexOf(tab);
          var next = null;
          if (event.key === 'ArrowRight') next = (idx + 1) % TABS.length;
          if (event.key === 'ArrowLeft') next = (idx - 1 + TABS.length) % TABS.length;
          if (event.key === 'Home') next = 0;
          if (event.key === 'End') next = TABS.length - 1;
          if (next == null) return;
          event.preventDefault();
          state.onTab(TABS[next].id);
        });
      });

      var body = DV.el('div', {
        class: 'dv-panel-body', role: 'tabpanel', id: 'panel-' + state.tab,
        'aria-labelledby': 'tab-' + state.tab, tabindex: '0'
      }, host);
      if (state.tab === 'words') tabWords(body, state);
      else if (state.tab === 'patterns') tabPatterns(body, state);
      else if (state.tab === 'compare') tabCompare(body, state);
      else if (state.tab === 'describe') tabDescribe(body, state);
      else tabRead(body, state);

      if (state.loading) {
        DV.el('p', { class: 'dv-loading' }, host).textContent = '载入中…';
      }
      return host;
    }
  };
})(window.DV);
