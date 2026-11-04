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
    this.renderer = NC.renderers[type.renderer];
    this.mounted = false;
    this.compact = false;
    this.result = null;
    this.mode = {};
    NC.state.labs[type.id] = this;

    var self = this;
    NC.on(this.key, function (payload) {
      self.onExternalChange(payload);
    });
  }

  Lab.prototype.mount = function () {
    if (this.mounted) return;
    this.mounted = true;
    this.section.setAttribute('data-mounted', 'true');
    this.renderer.mount(this);
    this.bindControls();
    this.refresh(true);
  };

  Lab.prototype.bindControls = function () {
    var self = this;
    var reset = this.section.querySelector('[data-reset]');
    if (reset) {
      reset.addEventListener('click', function () {
        NC.resetKey(self.key);
      });
    }
    var replay = this.section.querySelector('[data-replay]');
    if (replay) {
      replay.addEventListener('click', function () {
        if (self.renderer.render) self.renderer.render(self);
        self.refresh(false);
        if (NC.motion) NC.motion.play(self);
      });
    }
  };

  Lab.prototype.setMode = function (patch) {
    var next = patch || {};
    Object.keys(next).forEach(function (key) {
      this.mode[key] = next[key];
    }, this);
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
        block = document.createElement('div');
        var en = document.createElement('p');
        en.className = 'sentence-en';
        en.lang = 'en';
        var zh = document.createElement('p');
        zh.className = 'sentence-zh';
        zh.lang = 'zh';
        block.appendChild(en);
        block.appendChild(zh);
        host.appendChild(block);
      }
      block.className = 'sentence' + (lead && index === 0 ? ' lead' : '');
      block.setAttribute('data-role', sentence.role);
      if (sentence.focus && sentence.focus.length) {
        block.setAttribute('data-focus', sentence.focus.join(' '));
      } else {
        block.removeAttribute('data-focus');
      }
      var enNode = block.querySelector('.sentence-en');
      var zhNode = block.querySelector('.sentence-zh');
      if (enNode.textContent !== sentence.en) enNode.textContent = sentence.en;
      if (zhNode.textContent !== sentence.zh) zhNode.textContent = sentence.zh;
    });
  };

  Lab.prototype.changed = function (commit) {
    this.renderer.update(this);
    this.refresh(commit);
    if (commit) {
      NC.emit(this.key, { source: this.type.id });
    }
  };

  Lab.prototype.onExternalChange = function (payload) {
    if (payload && payload.source === this.type.id) return;
    this.dataset = NC.state.datasets[this.key];
    if (!this.mounted) return;
    this.renderer.render(this);
    this.refresh(false);
  };

  NC.Lab = Lab;

  NC.resetKey = function (key) {
    NC.state.datasets[key] = NC.deepClone(NC.state.initial[key]);
    Object.keys(NC.state.labs).forEach(function (id) {
      var lab = NC.state.labs[id];
      if (lab.key !== key) return;
      lab.dataset = NC.state.datasets[key];
      if (!lab.mounted) return;
      lab.renderer.render(lab);
      lab.refresh(true);
    });
  };
})(window.NPESLCharts);
