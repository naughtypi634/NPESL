(function (NC) {
  'use strict';

  function columnTotals(dataset) {
    return dataset.series.map(function (series) {
      return series.values.reduce(function (sum, value) { return sum + value; }, 0);
    });
  }

  function rowTotal(dataset, index) {
    return dataset.series.reduce(function (sum, series) { return sum + series.values[index]; }, 0);
  }

  function grandTotal(dataset) {
    return dataset.series.reduce(function (sum, series) {
      return sum + series.values.reduce(function (acc, value) { return acc + value; }, 0);
    }, 0);
  }

  function headerCell(label, unit, numeric, cls) {
    var th = document.createElement('th');
    if (numeric) th.className = 'num-cell';
    if (cls) th.className += ' ' + cls;
    th.textContent = label;
    if (unit) {
      var span = document.createElement('span');
      span.className = 'th-unit';
      span.textContent = unit;
      th.appendChild(span);
    }
    return th;
  }

  function render(lab) {
    var dataset = lab.dataset;
    lab.modesHost.innerHTML = '';
    NC.svg.clear(lab.plot);

    var shell = document.createElement('div');
    shell.className = 'table-scroll-shell';
    var scroll = document.createElement('div');
    scroll.className = 'table-scroll';
    var table = document.createElement('table');
    table.className = 'data-table chart-table';

    var caption = document.createElement('caption');
    caption.className = 'sr-only';
    caption.textContent = 'Revenue by region and product line, with editable values.';
    table.appendChild(caption);

    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    headRow.appendChild(headerCell('Region'));
    dataset.series.forEach(function (series) {
      var th = headerCell(series.name_en, '', true);
      th.setAttribute('data-series', series.id);
      headRow.appendChild(th);
    });
    headRow.appendChild(headerCell('Total', '', true));
    headRow.appendChild(headerCell('Share', '', true));
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    var rows = [];
    dataset.categories.forEach(function (category, categoryIndex) {
      var tr = document.createElement('tr');
      tr.setAttribute('data-index', categoryIndex);

      var nameCell = document.createElement('th');
      nameCell.scope = 'row';
      nameCell.className = 'row-head';
      nameCell.innerHTML = '<span class="row-en">' + NC.escapeHtml(category.label_en) + '</span><span class="row-zh">' + NC.escapeHtml(category.label_zh) + '</span>';
      tr.appendChild(nameCell);

      var inputs = [];
      dataset.series.forEach(function (series, seriesIndex) {
        var td = document.createElement('td');
        td.className = 'num-cell edit-cell';
        td.setAttribute('data-series', series.id);
        var input = document.createElement('input');
        input.type = 'number';
        input.inputMode = 'decimal';
        input.min = '0';
        input.step = '5';
        input.value = series.values[categoryIndex];
        input.setAttribute('aria-label', category.label_en + ' ' + series.name_en);
        input.addEventListener('input', function () {
          var next = Number(input.value);
          if (!isFinite(next)) return;
          series.values[categoryIndex] = Math.max(0, next);
          lab.changed(false);
        });
        input.addEventListener('change', function () {
          lab.changed(true);
        });
        td.appendChild(input);
        tr.appendChild(td);
        inputs.push(input);
      });

      var totalCell = document.createElement('td');
      totalCell.className = 'num-cell total-cell';
      totalCell.textContent = NC.fmt.number(rowTotal(dataset, categoryIndex), 0);
      tr.appendChild(totalCell);

      var shareCell = document.createElement('td');
      shareCell.className = 'num-cell share-cell';
      shareCell.textContent = NC.fmt.number(grandTotal(dataset) > 0 ? rowTotal(dataset, categoryIndex) / grandTotal(dataset) * 100 : 0, 1) + '%';
      tr.appendChild(shareCell);

      tbody.appendChild(tr);
      rows.push({ tr: tr, inputs: inputs, total: totalCell, share: shareCell, index: categoryIndex });
    });
    table.appendChild(tbody);

    var tfoot = document.createElement('tfoot');
    var footRow = document.createElement('tr');
    footRow.appendChild(headerCell('Total'));
    dataset.series.forEach(function (series, seriesIndex) {
      footRow.appendChild(headerCell(NC.fmt.number(columnTotals(dataset)[seriesIndex], 0), '', true));
    });
    footRow.appendChild(headerCell(NC.fmt.number(grandTotal(dataset), 0), '', true));
    footRow.appendChild(headerCell('100%', '', true));
    tfoot.appendChild(footRow);
    table.appendChild(tfoot);

    scroll.appendChild(table);
    shell.appendChild(scroll);
    var cue = document.createElement('p');
    cue.className = 'table-scroll-cue';
    cue.textContent = '左右滑动查看完整表格';
    shell.appendChild(cue);
    lab.plot.appendChild(shell);

    if (lab.tableObserver) {
      lab.tableObserver.disconnect();
      lab.tableObserver = null;
    }
    lab.tableState = { rows: rows, dataset: dataset, shell: shell, scroll: scroll };
    // Overflow is a state of the viewport, not of the data: it changes on
    // scroll and when the container resizes, not only on re-render.
    scroll.addEventListener('scroll', function () { updateCue(lab); }, { passive: true });
    if ('ResizeObserver' in window) {
      lab.tableObserver = new ResizeObserver(function () { updateCue(lab); });
      lab.tableObserver.observe(scroll);
    }
    updateCue(lab);
    lab.motion = null;
  }

  function updateCue(lab) {
    var state = lab.tableState;
    if (!state || !state.scroll) return;
    var max = state.scroll.scrollWidth - state.scroll.clientWidth;
    var x = state.scroll.scrollLeft;
    var overflow = max > 1;
    var start = overflow && x > 2;
    var end = overflow && x < max - 2;
    var mode = !overflow ? 'none' : start && end ? 'both' : start ? 'start' : 'end';
    state.shell.setAttribute('data-overflow', overflow ? 'true' : 'false');
    state.shell.setAttribute('data-scroll', mode);
  }

  function updateTotals(lab) {
    var state = lab.tableState;
    if (!state) return;
    var dataset = state.dataset;
    var total = grandTotal(dataset);
    state.rows.forEach(function (row) {
      row.total.textContent = NC.fmt.number(rowTotal(dataset, row.index), 0);
      row.share.textContent = NC.fmt.number(total > 0 ? rowTotal(dataset, row.index) / total * 100 : 0, 1) + '%';
    });
    var foot = state.shell.querySelector('tfoot tr');
    if (!foot) return;
    var cells = foot.querySelectorAll('th.num-cell');
    columnTotals(dataset).forEach(function (value, index) {
      if (cells[index]) cells[index].textContent = NC.fmt.number(value, 0);
    });
    if (cells[cells.length - 2]) cells[cells.length - 2].textContent = NC.fmt.number(total, 0);
  }

  function update(lab) {
    var state = lab.tableState;
    if (!state) return;
    var dataset = state.dataset;
    state.rows.forEach(function (row) {
      row.inputs.forEach(function (input, seriesIndex) {
        if (document.activeElement !== input) {
          input.value = dataset.series[seriesIndex].values[row.index];
        }
      });
    });
    updateTotals(lab);
    updateCue(lab);
  }

  function highlight(lab, focus) {
    var state = lab.tableState;
    if (!state) return;
    var shell = state.shell;
    Array.prototype.forEach.call(shell.querySelectorAll('.is-focus, .is-dim'), function (node) {
      node.classList.remove('is-focus', 'is-dim');
    });
    if (!focus || focus.kind === 'all') return;
    if (focus.kind === 'row') {
      state.rows.forEach(function (row) {
        row.tr.classList.toggle('is-focus', row.index === focus.index);
      });
      return;
    }
    if (focus.kind === 'series') {
      var series = lab.dataset.series[focus.index];
      var id = series ? series.id : null;
      Array.prototype.forEach.call(shell.querySelectorAll('[data-series]'), function (cell) {
        cell.classList.toggle('is-dim', cell.getAttribute('data-series') !== id);
      });
    }
  }

  function describe(lab) {
    return NC.desc.table(lab.dataset, NC.state.level);
  }

  NC.renderers.table = {
    mount: function (lab) { render(lab); },
    render: render,
    update: update,
    highlight: highlight,
    describe: describe,
    table: function () { return null; }
  };
})(window.NPESLCharts);
