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
    this.tableHost = section.querySelector('[data-table]');
    this.dataPanel = section.querySelector('[data-data-panel]');
    this.modelBody = section.querySelector('[data-model-body]');
    this.modelBox = section.querySelector('[data-model]');
    this.renderer = NC.renderers[type.renderer];
    this.mounted = false;
    this.result = null;
    this.comboOverlay = false;
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
    this.buildTable();
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
    var toggle = this.section.querySelector('[data-model-toggle]');
    if (toggle) {
      toggle.addEventListener('click', function () {
        var open = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
        self.modelBox.hidden = open;
        if (!open) self.refreshModel();
      });
    }
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
    var host = this.descLines;
    host.innerHTML = '';
    result.live.forEach(function (sentence, index) {
      var block = document.createElement('div');
      block.className = 'sentence' + (index === 0 ? ' lead' : '');
      block.setAttribute('data-role', sentence.role);
      var en = document.createElement('p');
      en.className = 'sentence-en';
      en.lang = 'en';
      en.textContent = sentence.en;
      var zh = document.createElement('p');
      zh.className = 'sentence-zh';
      zh.lang = 'zh';
      zh.textContent = sentence.zh;
      block.appendChild(en);
      block.appendChild(zh);
      host.appendChild(block);
    });
    if (commit && this.liveNode) {
      this.liveNode.textContent = result.live.map(function (sentence) { return sentence.en; }).join(' ');
    }
    this.refreshModel();
  };

  Lab.prototype.refreshModel = function () {
    if (!this.modelBody || !this.result) return;
    this.modelBody.innerHTML = '';
    this.result.sentences.forEach(function (sentence) {
      var block = document.createElement('div');
      block.className = 'sentence';
      var en = document.createElement('p');
      en.className = 'sentence-en';
      en.lang = 'en';
      en.textContent = sentence.en;
      var zh = document.createElement('p');
      zh.className = 'sentence-zh';
      zh.lang = 'zh';
      zh.textContent = sentence.zh;
      block.appendChild(en);
      block.appendChild(zh);
      this.modelBody.appendChild(block);
    }, this);
  };

  Lab.prototype.changed = function (commit) {
    this.renderer.update(this);
    this.refresh(commit);
    if (commit) {
      this.refreshTable();
      NC.emit(this.key, { source: this.type.id });
    }
  };

  Lab.prototype.onExternalChange = function (payload) {
    if (payload && payload.source === this.type.id) return;
    this.dataset = NC.state.datasets[this.key];
    if (!this.mounted) return;
    this.renderer.render(this);
    this.refresh(false);
    this.refreshTable();
  };

  Lab.prototype.buildTable = function () {
    this.refreshTable();
  };

  Lab.prototype.refreshTable = function () {
    if (!this.tableHost) return;
    var spec = this.renderer.table ? this.renderer.table(this) : null;
    if (!spec) {
      if (this.dataPanel) this.dataPanel.hidden = true;
      return;
    }
    if (this.dataPanel) this.dataPanel.hidden = false;

    var active = document.activeElement;
    var focusKey = active && this.tableHost.contains(active) ? active.getAttribute('data-key') : null;

    this.tableHost.innerHTML = '';
    var table = document.createElement('table');
    table.className = 'data-table';
    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    spec.columns.forEach(function (column) {
      var th = document.createElement('th');
      th.textContent = column.label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    var lab = this;
    spec.rows.forEach(function (row) {
      var tr = document.createElement('tr');
      row.cells.forEach(function (cell, columnIndex) {
        var td = document.createElement('td');
        if (cell.set) {
          td.className = 'edit-cell';
          var input = document.createElement('input');
          input.type = 'number';
          input.inputMode = 'decimal';
          input.step = String(spec.columns[columnIndex].step || 1);
          input.value = cell.value;
          input.setAttribute('data-key', row.key + '-' + columnIndex);
          input.setAttribute('aria-label', spec.columns[columnIndex].label + ' ' + row.key);
          input.addEventListener('input', function () {
            var next = Number(input.value);
            if (!isFinite(next)) return;
            cell.set(next);
            lab.changed(false);
          });
          input.addEventListener('change', function () {
            lab.changed(true);
          });
          td.appendChild(input);
          if (spec.columns[columnIndex].unit) {
            var unit = document.createElement('span');
            unit.className = 'cell-unit';
            unit.textContent = spec.columns[columnIndex].unit === '%' ? '%' : '';
            if (unit.textContent) td.appendChild(unit);
          }
        } else {
          td.textContent = cell.text;
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    this.tableHost.appendChild(table);

    if (focusKey) {
      var target = this.tableHost.querySelector('[data-key="' + focusKey + '"]');
      if (target) target.focus();
    }
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
      lab.refreshTable();
    });
  };
})(window.NPESLCharts);
