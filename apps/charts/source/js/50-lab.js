(function (NC) {
  'use strict';

  function Lab(section, type) {
    this.section = section;
    this.type = type;
    this.key = type.dataset;
    this.dataset = NC.state.datasets[this.key];
    this.plot = section.querySelector('[data-plot]');
    this.descLines = section.querySelector('[data-desc-lines]');
    this.liveNode = section.querySelector('[data-live]');
    this.modesHost = section.querySelector('[data-modes]');
    this.statHost = section.querySelector('[data-stat]');
    this.countNode = section.querySelector('[data-step-count]');
    this.prevButton = section.querySelector('[data-step-prev]');
    this.nextButton = section.querySelector('[data-step-next]');
    this.renderer = NC.renderers[type.renderer];
    this.mountState = 'unmounted';
    this.activeStep = 0;
    section.setAttribute('data-mount-state', this.mountState);
    this.controlsBound = false;
    this.compact = false;
    this.result = null;
    this.mode = {};
    NC.state.labs[type.id] = this;

    var self = this;
    NC.on(this.key, function (payload) {
      self.onExternalChange(payload);
    });
    if (this.descLines) {
      this.descLines.addEventListener('click', function (event) {
        var row = event.target.closest ? event.target.closest('.sentence') : null;
        if (!row || !self.descLines.contains(row)) return;
        self.setStep(Number(row.getAttribute('data-index')), { scroll: true });
      });
    }
    this.markKey = '';
    this.bindMarkLink();
  }

  // Lifecycle: unmounted -> mounting -> mounted. A failed mount returns to
  // unmounted so the next activation can retry.
  Lab.prototype.mount = function () {
    if (this.mountState !== 'unmounted') return;
    this.mountState = 'mounting';
    this.section.setAttribute('data-mount-state', this.mountState);
    try {
      this.renderer.mount(this);
      this.bindControls();
      this.refresh(true);
      this.mountState = 'mounted';
      this.section.setAttribute('data-mount-state', this.mountState);
      this.section.setAttribute('data-mounted', 'true');
    } catch (error) {
      this.mountState = 'unmounted';
      this.section.setAttribute('data-mount-state', this.mountState);
      this.section.setAttribute('data-mounted', 'false');
      throw error;
    }
  };

  Lab.prototype.isMounted = function () {
    return this.mountState === 'mounted';
  };

  Lab.prototype.bindControls = function () {
    if (this.controlsBound) return;
    this.controlsBound = true;
    var self = this;
    var reset = this.section.querySelector('[data-reset]');
    if (reset) {
      reset.addEventListener('click', function () {
        NC.resetKey(self.key);
      });
    }
    if (this.prevButton) {
      this.prevButton.addEventListener('click', function () { self.step(-1); });
    }
    if (this.nextButton) {
      this.nextButton.addEventListener('click', function () { self.step(1); });
    }
  };

  Lab.prototype.setMode = function (patch) {
    var next = patch || {};
    var changed = false;
    Object.keys(next).forEach(function (key) {
      if (this.mode[key] === next[key]) return;
      this.mode[key] = next[key];
      changed = true;
    }, this);
    // Re-selecting the active mode must not throw away the rendered chart,
    // focus, or the process-step selection.
    if (!changed) return;
    if (this.renderer.render) this.renderer.render(this);
    this.refresh(false);
  };

  Lab.prototype.refresh = function (commit) {
    var result = this.renderer.describe(this);
    if (!result.live) {
      result = NC.desc.output(NC.state.level, result.sentences, result.stats, result);
    }
    this.result = result;
    this.setDescription(result, commit);
    this.renderStat();
    // Optional renderer hook for decorations that depend on both the chart
    // and the freshly written description (process step linking).
    if (this.renderer.sync) this.renderer.sync(this);
    this.applyStep({ scroll: false });
  };

  Lab.prototype.setDescription = function (result, commit) {
    this.reconcile(this.descLines, result.live, true);
    if (commit && this.liveNode) {
      this.liveNode.textContent = result.live.map(function (sentence) { return sentence.en; }).join(' ');
    }
  };

  Lab.prototype.reconcile = function (host, sentences, lead) {
    if (!host) return;
    while (host.children.length > sentences.length) host.removeChild(host.lastChild);
    sentences.forEach(function (sentence, index) {
      var block = host.children[index];
      if (!block) {
        block = document.createElement('li');
        block.className = 'sentence';
        block.setAttribute('data-index', String(index));
        var num = document.createElement('span');
        num.className = 'step-num';
        var body = document.createElement('div');
        body.className = 'step-body';
        var en = document.createElement('p');
        en.className = 'sentence-en';
        en.lang = 'en';
        var zh = document.createElement('p');
        zh.className = 'sentence-zh';
        zh.lang = 'zh';
        body.appendChild(en);
        body.appendChild(zh);
        block.appendChild(num);
        block.appendChild(body);
        host.appendChild(block);
      }
      block.setAttribute('data-index', String(index));
      block.setAttribute('data-role', sentence.role);
      if (sentence.focus && sentence.focus.kind) {
        block.setAttribute('data-focus-kind', sentence.focus.kind);
      } else {
        block.removeAttribute('data-focus-kind');
      }
      if (sentence.focus && sentence.focus.kind === 'steps' && sentence.focus.steps && sentence.focus.steps.length) {
        block.setAttribute('data-focus', sentence.focus.steps.join(' '));
      } else {
        block.removeAttribute('data-focus');
      }
      block.querySelector('.step-num').textContent = String(index + 1).padStart(2, '0');
      var enNode = block.querySelector('.sentence-en');
      var zhNode = block.querySelector('.sentence-zh');
      if (enNode.textContent !== sentence.en) enNode.textContent = sentence.en;
      if (zhNode.textContent !== sentence.zh) zhNode.textContent = sentence.zh;
    });
  };

  Lab.prototype.renderStat = function () {
    if (!this.statHost) return;
    var head = NC.headline(this);
    if (!head) {
      this.statHost.hidden = true;
      this.statHost.innerHTML = '';
      return;
    }
    this.statHost.hidden = false;
    this.statHost.innerHTML =
      '<span class="stat-value">' + NC.escapeHtml(head.value) + '</span>' +
      '<span class="stat-label">' + NC.escapeHtml(head.label) + '</span>' +
      (head.delta ? '<span class="stat-delta">' + NC.escapeHtml(head.delta) + '</span>' : '');
  };

  Lab.prototype.applyStep = function (opts) {
    var options = opts || {};
    var rows = this.descLines ? this.descLines.children : [];
    if (!rows.length) {
      if (this.countNode) this.countNode.textContent = '';
      if (this.prevButton) this.prevButton.disabled = true;
      if (this.nextButton) this.nextButton.disabled = true;
      if (this.renderer.highlight) this.renderer.highlight(this, { kind: 'all' });
      return;
    }
    var index = Math.max(0, Math.min(this.activeStep, rows.length - 1));
    this.activeStep = index;
    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i];
      row.classList.toggle('is-active', i === index);
      if (i === index) row.setAttribute('aria-current', 'true');
      else row.removeAttribute('aria-current');
    }
    if (this.countNode) {
      this.countNode.textContent = String(index + 1).padStart(2, '0') + ' / ' + String(rows.length).padStart(2, '0');
    }
    if (this.prevButton) this.prevButton.disabled = index === 0;
    if (this.nextButton) this.nextButton.disabled = index === rows.length - 1;
    var sentence = this.result && this.result.live[index];
    if (this.renderer.highlight) {
      this.renderer.highlight(this, sentence ? sentence.focus : { kind: 'all' });
    }
    if (options.scroll && rows[index] && rows[index].scrollIntoView) {
      try {
        rows[index].scrollIntoView({ block: 'nearest', behavior: NC.state.reducedMotion ? 'auto' : 'smooth' });
      } catch (err) {
        rows[index].scrollIntoView(false);
      }
    }
  };

  Lab.prototype.setStep = function (index, opts) {
    this.activeStep = index;
    this.applyStep(opts);
  };

  Lab.prototype.step = function (delta) {
    this.setStep(this.activeStep + delta, { scroll: true });
  };

  // ---- chart -> sentence -------------------------------------------------
  // Sentence -> chart runs through renderer.highlight(focus): the active
  // sentence dims everything outside its focus window. This is the other
  // direction: pointing at a mark names the sentence that talks about it,
  // and clicking the mark makes that sentence the active one. One state, so
  // the two sides can never disagree.

  function focusScore(focus, mark) {
    if (!focus || focus.kind === 'all') return 0;
    var kind = focus.kind;
    if (mark.kind === 'category') {
      if (kind === 'category') {
        if (focus.index !== mark.index) return 0;
        return focus.series == null || focus.series < 0 || focus.series === mark.series ? 4 : 3;
      }
      if (kind === 'row') return focus.index === mark.index ? 4 : 0;
      if (kind === 'series') return mark.series >= 0 && focus.index === mark.series ? 2 : 0;
      if (kind === 'range') return mark.index >= focus.from && mark.index <= focus.to ? 1 : 0;
      return 0;
    }
    if (mark.kind === 'point') {
      if (kind === 'point') return focus.index === mark.index ? 4 : 0;
      if (kind === 'range') return mark.index >= focus.from && mark.index <= focus.to ? 2 : 0;
      return 0;
    }
    if (mark.kind === 'part') {
      if (kind === 'part') return focus.index === mark.index ? 4 : 0;
      return 0;
    }
    if (mark.kind === 'row') {
      if (kind === 'row') return focus.index === mark.index ? 4 : 0;
      if (kind === 'category') return focus.index === mark.index ? 3 : 0;
      return 0;
    }
    if (mark.kind === 'period') {
      if (kind === 'period') return focus.index === mark.index ? 4 : 0;
      if (kind === 'point') return focus.index === mark.index ? 3 : 0;
      if (kind === 'range') return mark.index >= focus.from && mark.index <= focus.to ? 2 : 0;
      return 0;
    }
    return 0;
  }

  Lab.prototype.markDescriptor = function (node) {
    if (!node || !node.closest || !this.plot) return null;
    var renderer = this.type.renderer;
    if (renderer === 'process') return null;
    var holder = node.closest('[data-index]');
    if (!holder || !this.plot.contains(holder)) return null;
    var index = Number(holder.getAttribute('data-index'));
    if (!isFinite(index)) return null;
    if (renderer === 'line') return { kind: 'point', index: index };
    if (renderer === 'pie') return { kind: 'part', index: index };
    if (renderer === 'table') return { kind: 'row', index: index };
    if (renderer === 'mixed') return { kind: 'period', index: index };
    if (renderer === 'bar') {
      var id = holder.getAttribute('data-series');
      var series = -1;
      (this.dataset.series || []).forEach(function (item, itemIndex) {
        if (item.id === id) series = itemIndex;
      });
      return { kind: 'category', index: index, series: series };
    }
    return null;
  };

  // The mark's own English label, used as a last-resort match when no
  // sentence carries an explicit focus on it.
  Lab.prototype.markLabel = function (mark) {
    var set = this.dataset;
    if (mark.kind === 'part') {
      return set.parts && set.parts[mark.index] ? set.parts[mark.index].name_en : '';
    }
    if (mark.kind === 'row' || mark.kind === 'category') {
      return set.categories && set.categories[mark.index] ? set.categories[mark.index].label_en : '';
    }
    return set.periods && set.periods[mark.index] ? set.periods[mark.index].label_en : '';
  };

  // Returns the index of the sentence that answers to the mark, -1 when no
  // sentence covers it. Passing null clears the mark.
  Lab.prototype.markLink = function (mark) {
    var rows = this.descLines ? this.descLines.children : [];
    var sentences = (this.result && this.result.live) || [];
    var best = -1;
    if (mark && rows.length && sentences.length) {
      var bestScore = 0;
      for (var i = 0; i < sentences.length && i < rows.length; i += 1) {
        var score = focusScore(sentences[i].focus, mark);
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      }
      // No sentence claims this mark: fall back to the one that names it.
      var label = this.markLabel(mark);
      if (best < 0 && label && label.length >= 3) {
        var re = new RegExp('\\b' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
        for (var k = 0; k < sentences.length && k < rows.length; k += 1) {
          if (re.test(sentences[k].en)) {
            best = k;
            break;
          }
        }
      }
    }
    for (var j = 0; j < rows.length; j += 1) {
      rows[j].classList.toggle('is-linked', j === best);
    }
    return best;
  };

  Lab.prototype.bindMarkLink = function () {
    var self = this;
    var plot = this.plot;
    if (!plot || plot.__markLinkBound) return;
    plot.__markLinkBound = true;
    function keyOf(mark) {
      if (!mark) return '';
      return mark.kind + ':' + mark.index + ':' + (mark.series == null ? '' : mark.series);
    }
    function over(event) {
      var mark = self.markDescriptor(event.target);
      var key = keyOf(mark);
      if (key === self.markKey) return;
      self.markKey = key;
      self.markLink(mark);
    }
    function clear() {
      if (self.markKey === '') return;
      self.markKey = '';
      self.markLink(null);
    }
    plot.addEventListener('pointerover', over);
    plot.addEventListener('focusin', over);
    plot.addEventListener('pointerleave', clear);
    plot.addEventListener('focusout', function (event) {
      if (event.relatedTarget && plot.contains(event.relatedTarget)) return;
      clear();
    });
    plot.addEventListener('click', function (event) {
      var mark = self.markDescriptor(event.target);
      if (!mark) return;
      var index = self.markLink(mark);
      if (index >= 0 && index !== self.activeStep) self.setStep(index);
    });
  };

  Lab.prototype.changed = function (commit) {
    this.renderer.update(this);
    this.refresh(commit);
    if (commit) {
      NC.emit(this.key, { source: this.type.id });
      if (NC.dismissHint) NC.dismissHint();
      if (NC.ui && NC.ui.pulse) NC.ui.pulse(this.section.querySelector('[data-desc]'), 'is-updating', 220);
      if (NC.syncDirty) NC.syncDirty();
    }
  };

  Lab.prototype.onExternalChange = function (payload) {
    if (payload && payload.source === this.type.id) return;
    this.dataset = NC.state.datasets[this.key];
    if (!this.isMounted()) return;
    this.renderer.render(this);
    this.refresh(false);
  };

  NC.Lab = Lab;

  // The restore button only exists while a dataset differs from its original,
  // so it never reads as a permanent, mysterious control.
  NC.syncDirty = function () {
    Object.keys(NC.state.labs).forEach(function (id) {
      var lab = NC.state.labs[id];
      var button = lab.section.querySelector('[data-reset]');
      if (!button) return;
      var dirty = JSON.stringify(NC.state.datasets[lab.key]) !== JSON.stringify(NC.state.initial[lab.key]);
      button.hidden = !dirty;
    });
  };

  NC.resetKey = function (key) {
    NC.state.datasets[key] = NC.deepClone(NC.state.initial[key]);
    Object.keys(NC.state.labs).forEach(function (id) {
      var lab = NC.state.labs[id];
      if (lab.key !== key) return;
      lab.dataset = NC.state.datasets[key];
      if (!lab.isMounted()) return;
      lab.renderer.render(lab);
      lab.refresh(true);
    });
    if (NC.syncDirty) NC.syncDirty();
  };

  // The one number worth putting at the top of the stage.
  NC.headline = function (lab) {
    var d = lab.dataset;
    var renderer = lab.type.renderer;
    if (renderer === 'line' || renderer === 'area') {
      var series = d.series[0];
      var stats = NC.stats.trend(series.values);
      var pct = stats.pct == null ? null : stats.pct;
      return {
        value: NC.fmt.number(stats.last, series.decimals || 0),
        label: (series.name_zh || series.name_en) + ' · ' + series.unit,
        delta: pct == null ? '' : (pct >= 0 ? '+' : '−') + NC.fmt.number(Math.abs(pct), Math.abs(pct) < 10 ? 1 : 0) + '%'
      };
    }
    if (renderer === 'bar' || renderer === 'table') {
      var totals = d.categories.map(function (category, index) {
        return d.series.reduce(function (sum, item) { return sum + item.values[index]; }, 0);
      });
      var total = totals.reduce(function (sum, value) { return sum + value; }, 0);
      var topIndex = 0;
      totals.forEach(function (value, index) { if (value > totals[topIndex]) topIndex = index; });
      return {
        value: NC.fmt.number(totals[topIndex], 0),
        label: d.categories[topIndex].label_zh + ' · ' + d.unit,
        delta: total > 0 ? '占总收入 ' + NC.fmt.number(totals[topIndex] / total * 100, 1) + '%' : ''
      };
    }
    if (renderer === 'pie') {
      var shares = NC.stats.shares(d.parts);
      return {
        value: NC.fmt.number(shares.top.share, 0) + '%',
        label: shares.top.name_zh,
        delta: '领先 ' + NC.fmt.number(shares.gap, 1) + ' pp'
      };
    }
    if (renderer === 'mixed') {
      var last = d.periods.length - 1;
      return {
        value: NC.fmt.number(d.bars.values[last], d.bars.decimals || 0),
        label: (d.bars.name_zh || d.bars.name_en) + ' · ' + d.bars.unit,
        delta: (d.line.name_zh || d.line.name_en) + ' ' + NC.fmt.number(d.line.values[last], d.line.decimals || 0) + '%'
      };
    }
    if (renderer === 'process') {
      return { value: String(d.steps.length), label: '流程步骤', delta: '' };
    }
    return null;
  };
})(window.NPESLCharts);
