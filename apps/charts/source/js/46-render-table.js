(function (NC) {
  'use strict';

  function currentSeries(dataset) {
    return dataset.series[dataset.series.length - 1];
  }

  function baselineSeries(dataset) {
    return dataset.series.length > 1 ? dataset.series[0] : null;
  }

  function render(lab) {
    var dataset = lab.dataset;
    var current = currentSeries(dataset);
    var baseline = baselineSeries(dataset);
    var total = current.values.reduce(function (sum, value) { return sum + value; }, 0);
    var max = dataset.max || Math.max.apply(null, current.values);

    NC.svg.clear(lab.plot);
    var wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    var table = document.createElement('table');
    table.className = 'data-table chart-table';
    var thead = document.createElement('thead');
    var headerRow = document.createElement('tr');
    ['Market', baseline ? baseline.name_en : 'Last year', current.name_en, 'YoY', 'Share'].forEach(function (label) {
      var th = document.createElement('th');
      th.textContent = label;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    var rows = [];
    dataset.categories.forEach(function (category, index) {
      var value = current.values[index];
      var previous = baseline ? baseline.values[index] : null;
      var yoy = previous ? (value - previous) / previous * 100 : null;
      var tr = document.createElement('tr');

      var nameCell = document.createElement('th');
      nameCell.scope = 'row';
      nameCell.className = 'row-head';
      nameCell.innerHTML = '<span class="row-en">' + NC.escapeHtml(category.label_en) + '</span><span class="row-zh">' + NC.escapeHtml(category.label_zh) + '</span>';
      tr.appendChild(nameCell);

      var prevCell = document.createElement('td');
      prevCell.className = 'num-cell';
      prevCell.textContent = previous == null ? '—' : NC.fmt.number(previous, 0);
      tr.appendChild(prevCell);

      var editCell = document.createElement('td');
      editCell.className = 'num-cell edit-cell';
      var bar = document.createElement('div');
      bar.className = 'cell-bar';
      bar.style.width = Math.max(4, Math.min(100, value / max * 100)) + '%';
      var input = document.createElement('input');
      input.type = 'number';
      input.inputMode = 'decimal';
      input.min = '0';
      input.max = String(max);
      input.step = '5';
      input.value = value;
      input.setAttribute('aria-label', category.label_en + ' ' + current.name_en);
      input.addEventListener('input', function () {
        var next = Number(input.value);
        if (!isFinite(next)) return;
        next = NC.clamp(next, 0, max);
        current.values[index] = next;
        updateRow(lab, index, next);
        lab.changed(false);
      });
      input.addEventListener('change', function () {
        lab.changed(true);
      });
      editCell.appendChild(bar);
      editCell.appendChild(input);
      tr.appendChild(editCell);

      var yoyCell = document.createElement('td');
      yoyCell.className = 'num-cell yoy-cell';
      yoyCell.textContent = yoy == null ? '—' : (yoy >= 0 ? '+' : '') + NC.fmt.number(yoy, 1) + '%';
      yoyCell.classList.toggle('positive', yoy != null && yoy >= 0);
      yoyCell.classList.toggle('negative', yoy != null && yoy < 0);
      tr.appendChild(yoyCell);

      var shareCell = document.createElement('td');
      shareCell.className = 'num-cell';
      shareCell.textContent = NC.fmt.number(total > 0 ? value / total * 100 : 0, 1) + '%';
      tr.appendChild(shareCell);

      tbody.appendChild(tr);
      rows.push({ input: input, bar: bar, yoy: yoyCell, share: shareCell, index: index });
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    lab.plot.appendChild(wrap);
    lab.tableState = { rows: rows, current: current, baseline: baseline, dataset: dataset, max: max };

    var unitNote = document.createElement('p');
    unitNote.className = 'table-unit';
    unitNote.textContent = 'Values in ' + dataset.unit + '.';
    wrap.appendChild(unitNote);
    var totalRow = document.createElement('p');
    totalRow.className = 'table-total';
    totalRow.textContent = 'Total ' + NC.fmt.number(total, 0) + '.';
    wrap.appendChild(totalRow);
  }

  function updateRow(lab, index, value) {
    var state = lab.tableState;
    if (!state) return;
    var row = state.rows[index];
    if (!row) return;
    row.bar.style.width = Math.max(4, Math.min(100, value / state.max * 100)) + '%';
    var previous = state.baseline ? state.baseline.values[index] : null;
    var yoy = previous ? (value - previous) / previous * 100 : null;
    row.yoy.textContent = yoy == null ? '—' : (yoy >= 0 ? '+' : '') + NC.fmt.number(yoy, 1) + '%';
    row.yoy.classList.toggle('positive', yoy != null && yoy >= 0);
    row.yoy.classList.toggle('negative', yoy != null && yoy < 0);
    var total = state.current.values.reduce(function (sum, v) { return sum + v; }, 0);
    state.rows.forEach(function (item, i) {
      item.share.textContent = NC.fmt.number(total > 0 ? state.current.values[i] / total * 100 : 0, 1) + '%';
    });
    var totalNode = lab.plot.querySelector('.table-total');
    if (totalNode) totalNode.textContent = 'Total ' + NC.fmt.number(total, 0) + ' · ' + state.dataset.unit;
  }

  function update(lab) {
    var state = lab.tableState;
    if (!state) return;
    state.rows.forEach(function (row, index) {
      updateRow(lab, index, state.current.values[index]);
      if (document.activeElement !== row.input) {
        row.input.value = state.current.values[index];
      }
    });
  }

  function describe(lab) {
    return NC.desc.category(lab.dataset, NC.state.level, { showTotal: true, style: 'table' });
  }

  NC.renderers.table = {
    mount: function (lab) { render(lab); },
    render: render,
    update: update,
    describe: describe,
    table: function () { return null; }
  };
})(window.NPESLCharts);
