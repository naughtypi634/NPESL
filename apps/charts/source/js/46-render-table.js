(function (NC) {
  'use strict';

  function currentSeries(dataset) {
    return dataset.series[dataset.series.length - 1];
  }

  function baselineSeries(dataset) {
    return dataset.series.length > 1 ? dataset.series[0] : null;
  }

  function makeCell(text, cls) {
    var td = document.createElement(cls === 'th' ? 'th' : 'td');
    if (cls) td.className = cls;
    td.textContent = text;
    return td;
  }

  function render(lab) {
    var dataset = lab.dataset;
    var current = currentSeries(dataset);
    var baseline = baselineSeries(dataset);
    var total = current.values.reduce(function (sum, value) { return sum + value; }, 0);
    var max = dataset.max || Math.max(1, Math.max.apply(null, current.values));

    NC.svg.clear(lab.plot);
    var shell = document.createElement('div');
    shell.className = 'table-scroll-shell';
    var scroll = document.createElement('div');
    scroll.className = 'table-scroll';
    var table = document.createElement('table');
    table.className = 'data-table chart-table';

    var caption = document.createElement('caption');
    caption.className = 'sr-only';
    caption.textContent = 'Revenue by market, with editable values.';
    table.appendChild(caption);

    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    var heads = [
      { label: 'Market' },
      { label: baseline ? baseline.name_en : 'Last year', unit: dataset.unit, numeric: true },
      { label: current.name_en, unit: dataset.unit, numeric: true },
      { label: 'YoY', numeric: true },
      { label: 'Share', numeric: true }
    ];
    heads.forEach(function (head) {
      var th = document.createElement('th');
      th.textContent = head.label;
      if (head.numeric) th.className = 'num-cell';
      if (head.unit) {
        var unit = document.createElement('span');
        unit.className = 'th-unit';
        unit.textContent = head.unit;
        th.appendChild(unit);
      }
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
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

      tr.appendChild(makeCell(previous == null ? '—' : NC.fmt.number(previous, 0), 'num-cell'));

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

      var yoyCell = makeCell(yoy == null ? '—' : (yoy >= 0 ? '+' : '') + NC.fmt.number(yoy, 1) + '%', 'num-cell yoy-cell');
      if (yoy != null) yoyCell.classList.add(yoy >= 0 ? 'positive' : 'negative');
      tr.appendChild(yoyCell);

      var shareCell = makeCell(NC.fmt.number(total > 0 ? value / total * 100 : 0, 1) + '%', 'num-cell');
      tr.appendChild(shareCell);

      tbody.appendChild(tr);
      rows.push({ input: input, bar: bar, yoy: yoyCell, share: shareCell, index: index });
    });
    table.appendChild(tbody);

    var tfoot = document.createElement('tfoot');
    var footRow = document.createElement('tr');
    footRow.appendChild(makeCell('Total', 'row-head'));
    var prevTotal = baseline ? baseline.values.reduce(function (sum, value) { return sum + value; }, 0) : null;
    footRow.appendChild(makeCell(prevTotal == null ? '—' : NC.fmt.number(prevTotal, 0), 'num-cell'));
    footRow.appendChild(makeCell(NC.fmt.number(total, 0), 'num-cell'));
    var totalYoy = prevTotal ? (total - prevTotal) / prevTotal * 100 : null;
    var totalYoyCell = makeCell(totalYoy == null ? '—' : (totalYoy >= 0 ? '+' : '') + NC.fmt.number(totalYoy, 1) + '%', 'num-cell yoy-cell');
    if (totalYoy != null) totalYoyCell.classList.add(totalYoy >= 0 ? 'positive' : 'negative');
    footRow.appendChild(totalYoyCell);
    footRow.appendChild(makeCell('100%', 'num-cell'));
    tfoot.appendChild(footRow);
    table.appendChild(tfoot);

    scroll.appendChild(table);
    shell.appendChild(scroll);
    var cue = document.createElement('p');
    cue.className = 'table-scroll-cue';
    cue.textContent = '左右滑动查看完整表格';
    shell.appendChild(cue);
    lab.plot.appendChild(shell);
    lab.tableState = { rows: rows, current: current, baseline: baseline, dataset: dataset, max: max, shell: shell, scroll: scroll };
    updateCue(lab);
  }

  function updateCue(lab) {
    var state = lab.tableState;
    if (!state) return;
    var overflow = state.scroll.scrollWidth > state.scroll.clientWidth + 1;
    state.shell.setAttribute('data-overflow', overflow ? 'true' : 'false');
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
    updateTotals(lab, total);
  }

  function updateTotals(lab, total) {
    var state = lab.tableState;
    if (!state) return;
    var foot = state.scroll.querySelector('tfoot tr');
    if (!foot) return;
    var cells = foot.querySelectorAll('td');
    if (cells[1]) cells[1].textContent = NC.fmt.number(total, 0);
    var prevTotal = state.baseline ? state.baseline.values.reduce(function (sum, value) { return sum + value; }, 0) : null;
    var yoy = prevTotal ? (total - prevTotal) / prevTotal * 100 : null;
    var yoyCell = foot.querySelector('.yoy-cell');
    if (yoyCell) {
      yoyCell.textContent = yoy == null ? '—' : (yoy >= 0 ? '+' : '') + NC.fmt.number(yoy, 1) + '%';
      yoyCell.classList.toggle('positive', yoy != null && yoy >= 0);
      yoyCell.classList.toggle('negative', yoy != null && yoy < 0);
    }
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
    updateCue(lab);
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
