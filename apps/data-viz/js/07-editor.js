/* Data editor — the playground half of the app.
 *
 * Every control hands the app a mutator over a cloned data object. Text and
 * number fields commit while typing; structural changes (+/−) rebuild this
 * editor only, so the chart and the language panel update without stealing
 * focus from the field the reader is in.
 */
(function (DV) {
  'use strict';

  function el(tag, attrs, parent) {
    return DV.el(tag, attrs, parent);
  }

  function text(value) {
    return value == null ? '' : String(value);
  }

  function uniqueId(prefix, used) {
    var n = 1;
    while (used[prefix + n]) n += 1;
    used[prefix + n] = true;
    return prefix + n;
  }

  function usedSlots(list) {
    var used = {};
    (list || []).forEach(function (item) {
      if (item && item.slot) used[item.slot] = true;
    });
    return used;
  }

  function nextSlot(used) {
    for (var i = 1; i <= 8; i++) if (!used[i]) return i;
    return 1;
  }

  function field(value, onInput, label, kind) {
    var node = el('input', {
      type: 'text',
      class: 'dv-data-input' + (kind === 'num' ? ' dv-data-num' : ''),
      value: text(value),
      'aria-label': label || '',
      spellcheck: 'false',
      autocomplete: 'off'
    });
    if (kind === 'num') {
      node.setAttribute('inputmode', 'decimal');
    }
    var initial = text(value);
    node.addEventListener('input', function () {
      onInput(node.value, node);
    });
    node.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') node.blur();
      if (event.key === 'Escape') {
        node.value = initial;
        node.dispatchEvent(new Event('input', { bubbles: true }));
        node.blur();
      }
    });
    return node;
  }

  function numberField(value, onInput, label) {
    var lastValid = Number(value);
    var node = field(value, function (raw, input) {
      var trimmed = String(raw).trim();
      if (!trimmed || !isFinite(Number(trimmed))) {
        input.setAttribute('aria-invalid', 'true');
        input.classList.add('is-invalid');
        return;
      }
      input.removeAttribute('aria-invalid');
      input.classList.remove('is-invalid');
      lastValid = Number(trimmed);
      onInput(lastValid);
    }, label, 'num');
    node.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      var current = Number(node.value);
      if (!isFinite(current)) current = lastValid;
      var step = event.shiftKey ? 10 : 1;
      var next = current + (event.key === 'ArrowUp' ? step : -step);
      node.value = String(next);
      node.dispatchEvent(new Event('input', { bubbles: true }));
    });
    node.addEventListener('blur', function () {
      if (node.getAttribute('aria-invalid') !== 'true') return;
      node.value = String(lastValid);
      node.removeAttribute('aria-invalid');
      node.classList.remove('is-invalid');
    });
    return node;
  }

  function textField(value, onInput, label) {
    return field(value, function (raw) { onInput(raw); }, label);
  }

  function button(label, title, onClick, cls) {
    var node = el('button', {
      type: 'button',
      class: 'dv-data-btn' + (cls ? ' ' + cls : ''),
      'aria-label': title || label,
      title: title || label
    });
    node.textContent = label;
    node.addEventListener('click', onClick);
    return node;
  }

  function colorChip(slot, onCycle, label) {
    var node = el('button', {
      type: 'button',
      class: 'dv-data-chip ' + DV.slotClass(slot || 1),
      'aria-label': label || '更换颜色',
      title: label || '更换颜色'
    });
    node.addEventListener('click', onCycle);
    return node;
  }

  function deleteButton(label, onClick, disabled) {
    var node = button('×', label, onClick, 'dv-data-del');
    if (disabled) {
      node.disabled = true;
      node.setAttribute('aria-disabled', 'true');
    }
    return node;
  }

  function table(host) {
    var scroll = el('div', { class: 'dv-data-scroll' }, host);
    return el('table', { class: 'dv-data-table' }, scroll);
  }

  function headerRow(thead, firstLabel) {
    var tr = el('tr', {}, thead);
    var th = el('th', { scope: 'col', class: 'dv-data-corner' }, tr);
    th.textContent = firstLabel || '';
    return tr;
  }

  function tools(host, state) {
    var bar = el('div', { class: 'dv-data-tools' }, host);
    var undo = button('撤销', '撤销上一步数据修改', state.onUndo, 'dv-data-undo');
    undo.disabled = !state.canUndo;
    if (!state.canUndo) undo.setAttribute('aria-disabled', 'true');
    var redo = button('重做', '重做刚撤销的数据修改', state.onRedo, 'dv-data-redo');
    redo.disabled = !state.canRedo;
    if (!state.canRedo) redo.setAttribute('aria-disabled', 'true');
    var reset = button('恢复原数据', '回到这个主题原来的模拟数据', state.onReset, 'dv-data-reset');
    reset.disabled = !state.edited;
    if (!state.edited) reset.setAttribute('aria-disabled', 'true');
    bar.appendChild(undo);
    bar.appendChild(redo);
    bar.appendChild(reset);
    return bar;
  }

  // ------------------------------------------------------------ matrix charts
  function matrixEditor(host, state, opts) {
    var d = state.data;
    var minX = 2;
    var minSeries = 1;
    var tbl = table(host);
    var thead = el('thead', {}, tbl);
    var hr = headerRow(thead, '系列 / 类别');
    var colCount = d.x.values.length;

    d.x.values.forEach(function (label, ci) {
      var th = el('th', { scope: 'col', class: 'dv-data-colhead' }, hr);
      var top = el('div', { class: 'dv-data-coltop' }, th);
      top.appendChild(textField(label, function (value) {
        state.onChange(function (next) { next.x.values[ci] = value; }, false);
      }, '类别 ' + (ci + 1) + ' 名称'));
      top.appendChild(deleteButton('删除类别 ' + (ci + 1), function () {
        if (d.x.values.length <= minX) return;
        state.onChange(function (next) {
          next.x.values.splice(ci, 1);
          next.series.forEach(function (series) { series.values.splice(ci, 1); });
        }, true);
      }, colCount <= minX));
    });

    var addTh = el('th', { scope: 'col', class: 'dv-data-addcol' }, hr);
    addTh.appendChild(button('+', '添加类别', function () {
      state.onChange(function (next) {
        next.x.values.push('Item ' + (next.x.values.length + 1));
        next.series.forEach(function (series) { series.values.push(0); });
      }, true);
    }, 'dv-data-plus'));

    var tbody = el('tbody', {}, tbl);
    d.series.forEach(function (series, si) {
      var tr = el('tr', {}, tbody);
      var th = el('th', { scope: 'row', class: 'dv-data-rowhead' }, tr);
      var used = usedSlots(d.series);
      th.appendChild(colorChip(series.slot, function () {
        var slots = usedSlots(d.series);
        var current = series.slot || 1;
        var pick = ((current % 8) + 1);
        var guard = 0;
        while (slots[pick] && guard < 8) { pick = (pick % 8) + 1; guard += 1; }
        state.onChange(function (next) { next.series[si].slot = pick; }, false);
      }, '换 ' + (series.name_en || '系列') + ' 的颜色'));
      th.appendChild(textField(series.name_en, function (value) {
        state.onChange(function (next) { next.series[si].name_en = value; }, false);
      }, '系列 ' + (si + 1) + ' 名称'));
      th.appendChild(deleteButton('删除系列 ' + (si + 1), function () {
        if (d.series.length <= minSeries) return;
        state.onChange(function (next) {
          next.series.splice(si, 1);
        }, true);
      }, d.series.length <= minSeries));

      series.values.forEach(function (value, ci) {
        var td = el('td', {}, tr);
        td.appendChild(numberField(value, function (number) {
          state.onChange(function (next) {
            next.series[si].values[ci] = state.type === 'stacked'
              ? Math.max(0, number)
              : number;
          }, false);
        }, (series.name_en || 'Series') + ', ' + (d.x.values[ci] || '') + ' 数值'));
      });
    });

    var tfoot = el('tfoot', {}, tbl);
    var tr = el('tr', {}, tfoot);
    var td = el('td', { colspan: String(d.x.values.length + 2) }, tr);
    td.appendChild(button('+ 系列', '添加一个数据系列', function () {
      state.onChange(function (next) {
        var ids = {};
        next.series.forEach(function (s) { ids[s.id] = true; });
        next.series.push({
          id: uniqueId('s', ids),
          name_en: 'Series ' + (next.series.length + 1),
          slot: nextSlot(usedSlots(next.series)),
          values: next.x.values.map(function () { return 0; })
        });
      }, true);
    }, 'dv-data-addrow'));
    if (opts && opts.note) {
      el('p', { class: 'dv-data-note' }, host).textContent = opts.note;
    }
  }

  // ---------------------------------------------------------------- pie
  function pieEditor(host, state) {
    var d = state.data;
    var tbl = table(host);
    var thead = el('thead', {}, tbl);
    var hr = headerRow(thead, '分类');
    hr.appendChild(el('th', { scope: 'col' }, hr)).textContent = '数值';
    hr.appendChild(el('th', { scope: 'col', class: 'dv-data-narrow' }, hr)).textContent = '';

    var tbody = el('tbody', {}, tbl);
    d.parts.forEach(function (part, i) {
      var tr = el('tr', {}, tbody);
      var th = el('th', { scope: 'row', class: 'dv-data-rowhead' }, tr);
      th.appendChild(colorChip(part.slot, function () {
        var slots = usedSlots(d.parts);
        var pick = ((part.slot || 1) % 8) + 1;
        var guard = 0;
        while (slots[pick] && guard < 8) { pick = (pick % 8) + 1; guard += 1; }
        state.onChange(function (next) { next.parts[i].slot = pick; }, false);
      }, '换 ' + (part.name_en || '分类') + ' 的颜色'));
      th.appendChild(textField(part.name_en, function (value) {
        state.onChange(function (next) { next.parts[i].name_en = value; }, false);
      }, '分类 ' + (i + 1) + ' 名称'));

      var td = el('td', {}, tr);
      td.appendChild(numberField(part.value, function (number) {
        state.onChange(function (next) { next.parts[i].value = Math.max(0, number); }, false);
      }, (part.name_en || '分类') + ' 数值'));

      var del = el('td', { class: 'dv-data-narrow' }, tr);
      del.appendChild(deleteButton('删除分类 ' + (i + 1), function () {
        if (d.parts.length <= 2) return;
        state.onChange(function (next) { next.parts.splice(i, 1); }, true);
      }, d.parts.length <= 2));
    });

    var tfoot = el('tfoot', {}, tbl);
    var tr = el('tr', {}, tfoot);
    var td = el('td', { colspan: '3' }, tr);
    td.appendChild(button('+ 分类', '添加一个分类', function () {
      state.onChange(function (next) {
        var ids = {};
        next.parts.forEach(function (part) { ids[part.id] = true; });
        next.parts.push({
          id: uniqueId('p', ids),
          name_en: 'Item ' + (next.parts.length + 1),
          slot: nextSlot(usedSlots(next.parts)),
          value: 10
        });
      }, true);
    }, 'dv-data-addrow'));
  }

  // ---------------------------------------------------------------- scatter
  function scatterEditor(host, state) {
    var d = state.data;
    var groups = el('div', { class: 'dv-data-groups' }, host);
    var used = usedSlots(d.groups);
    d.groups.forEach(function (group, gi) {
      var chipWrap = el('span', { class: 'dv-data-group' }, groups);
      chipWrap.appendChild(colorChip(group.slot, function () {
        var slots = usedSlots(d.groups);
        var pick = ((group.slot || 1) % 8) + 1;
        var guard = 0;
        while (slots[pick] && guard < 8) { pick = (pick % 8) + 1; guard += 1; }
        state.onChange(function (next) { next.groups[gi].slot = pick; }, false);
      }, '换 ' + (group.name_en || '分组') + ' 的颜色'));
      chipWrap.appendChild(textField(group.name_en, function (value) {
        state.onChange(function (next) { next.groups[gi].name_en = value; }, false);
      }, '分组 ' + (gi + 1) + ' 名称'));
      chipWrap.appendChild(deleteButton('删除分组 ' + (gi + 1), function () {
        if (d.groups.length <= 1) return;
        state.onChange(function (next) {
          var fallback = next.groups.filter(function (_, i2) { return i2 !== gi; })[0].id;
          next.points.forEach(function (point) {
            if (point.group === group.id) point.group = fallback;
          });
          next.groups.splice(gi, 1);
        }, true);
      }, d.groups.length <= 1));
    });
    groups.appendChild(button('+ 分组', '添加一个分组', function () {
      state.onChange(function (next) {
        var ids = {};
        next.groups.forEach(function (group) { ids[group.id] = true; });
        next.groups.push({
          id: uniqueId('g', ids),
          name_en: 'Group ' + (next.groups.length + 1),
          slot: nextSlot(usedSlots(next.groups))
        });
      }, true);
    }, 'dv-data-addrow'));

    var tbl = table(host);
    var thead = el('thead', {}, tbl);
    var hr = headerRow(thead, '点名');
    ['X', 'Y', '分组'].forEach(function (label) {
      el('th', { scope: 'col' }, hr).textContent = label;
    });
    el('th', { scope: 'col', class: 'dv-data-narrow' }, hr).textContent = '';

    var tbody = el('tbody', {}, tbl);
    d.points.forEach(function (point, pi) {
      var tr = el('tr', {}, tbody);
      var th = el('th', { scope: 'row', class: 'dv-data-rowhead' }, tr);
      th.appendChild(textField(point.name_en || '', function (value) {
        state.onChange(function (next) { next.points[pi].name_en = value; }, false);
      }, '点 ' + (pi + 1) + ' 名称'));

      var xTd = el('td', {}, tr);
      xTd.appendChild(numberField(point.x, function (number) {
        state.onChange(function (next) { next.points[pi].x = number; }, false);
      }, '点 ' + (pi + 1) + ' X'));
      var yTd = el('td', {}, tr);
      yTd.appendChild(numberField(point.y, function (number) {
        state.onChange(function (next) { next.points[pi].y = number; }, false);
      }, '点 ' + (pi + 1) + ' Y'));

      var gTd = el('td', {}, tr);
      var select = el('select', {
        class: 'dv-data-select',
        'aria-label': '点 ' + (pi + 1) + ' 分组'
      }, gTd);
      d.groups.forEach(function (group) {
        var option = el('option', { value: group.id }, select);
        option.textContent = group.name_en || group.id;
        if (group.id === point.group) option.selected = true;
      });
      select.addEventListener('change', function () {
        state.onChange(function (next) { next.points[pi].group = select.value; }, false);
      });

      var del = el('td', { class: 'dv-data-narrow' }, tr);
      del.appendChild(deleteButton('删除点 ' + (pi + 1), function () {
        if (d.points.length <= 3) return;
        state.onChange(function (next) { next.points.splice(pi, 1); }, true);
      }, d.points.length <= 3));
    });

    var tfoot = el('tfoot', {}, tbl);
    var tr = el('tr', {}, tfoot);
    var td = el('td', { colspan: '5' }, tr);
    td.appendChild(button('+ 点', '添加一个数据点', function () {
      state.onChange(function (next) {
        var ids = {};
        next.points.forEach(function (point) { ids[point.id] = true; });
        var xs = next.points.map(function (p) { return p.x; });
        var ys = next.points.map(function (p) { return p.y; });
        next.points.push({
          id: uniqueId('p', ids),
          name_en: 'Point ' + (next.points.length + 1),
          x: xs.reduce(function (a, b) { return a + b; }, 0) / (xs.length || 1),
          y: ys.reduce(function (a, b) { return a + b; }, 0) / (ys.length || 1),
          group: (next.groups[0] || {}).id || ''
        });
      }, true);
    }, 'dv-data-addrow'));
  }

  // ---------------------------------------------------------------- heatmap
  function heatmapEditor(host, state) {
    var d = state.data;
    var tbl = table(host);
    var thead = el('thead', {}, tbl);
    var hr = headerRow(thead, '');
    d.cols.forEach(function (col, ci) {
      var th = el('th', { scope: 'col', class: 'dv-data-colhead' }, hr);
      var top = el('div', { class: 'dv-data-coltop' }, th);
      top.appendChild(textField(col.name_en, function (value) {
        state.onChange(function (next) { next.cols[ci].name_en = value; }, false);
      }, '列 ' + (ci + 1) + ' 名称'));
      top.appendChild(deleteButton('删除列 ' + (ci + 1), function () {
        if (d.cols.length <= 2) return;
        state.onChange(function (next) {
          next.cols.splice(ci, 1);
          next.cells.forEach(function (row) { row.splice(ci, 1); });
        }, true);
      }, d.cols.length <= 2));
    });
    var addTh = el('th', { scope: 'col', class: 'dv-data-addcol' }, hr);
    addTh.appendChild(button('+', '添加一列', function () {
      state.onChange(function (next) {
        var ids = {};
        next.cols.forEach(function (col) { ids[col.id] = true; });
        next.cols.push({ id: uniqueId('c', ids), name_en: 'Col ' + (next.cols.length + 1) });
        next.cells.forEach(function (row) { row.push(0); });
      }, true);
    }, 'dv-data-plus'));

    var tbody = el('tbody', {}, tbl);
    d.rows.forEach(function (row, ri) {
      var tr = el('tr', {}, tbody);
      var th = el('th', { scope: 'row', class: 'dv-data-rowhead' }, tr);
      th.appendChild(textField(row.name_en, function (value) {
        state.onChange(function (next) { next.rows[ri].name_en = value; }, false);
      }, '行 ' + (ri + 1) + ' 名称'));
      th.appendChild(deleteButton('删除行 ' + (ri + 1), function () {
        if (d.rows.length <= 2) return;
        state.onChange(function (next) {
          next.rows.splice(ri, 1);
          next.cells.splice(ri, 1);
        }, true);
      }, d.rows.length <= 2));
      d.cols.forEach(function (col, ci) {
        var td = el('td', {}, tr);
        td.appendChild(numberField(d.cells[ri][ci], function (number) {
          state.onChange(function (next) { next.cells[ri][ci] = number; }, false);
        }, (row.name_en || '') + ', ' + (col.name_en || '') + ' 数值'));
      });
    });
    var tfoot = el('tfoot', {}, tbl);
    var tr = el('tr', {}, tfoot);
    var td = el('td', { colspan: String(d.cols.length + 2) }, tr);
    td.appendChild(button('+ 行', '添加一行', function () {
      state.onChange(function (next) {
        var ids = {};
        next.rows.forEach(function (row) { ids[row.id] = true; });
        next.rows.push({ id: uniqueId('r', ids), name_en: 'Row ' + (next.rows.length + 1) });
        next.cells.push(next.cols.map(function () { return 0; }));
      }, true);
    }, 'dv-data-addrow'));
  }

  // ---------------------------------------------------------------- sankey
  function sankeyEditor(host, state) {
    var d = state.data;
    var nodesWrap = el('div', { class: 'dv-data-nodes' }, host);
    (d.columns || []).forEach(function (column, ci) {
      var box = el('div', { class: 'dv-data-column' }, nodesWrap);
      var head = el('div', { class: 'dv-data-columnhead' }, box);
      head.appendChild(button('+', '第 ' + (ci + 1) + ' 列添加节点', function () {
        state.onChange(function (next) {
          var ids = {};
          next.nodes.forEach(function (node) { ids[node.id] = true; });
          var node = {
            id: uniqueId('n', ids),
            name_en: 'Node ' + (next.nodes.length + 1),
            column: ci,
            slot: nextSlot(usedSlots(next.nodes))
          };
          next.nodes.push(node);
          next.columns[ci].push(node.id);
        }, true);
      }, 'dv-data-plus'));
      column.forEach(function (id, ni) {
        var node = d.nodes.filter(function (n) { return n.id === id; })[0];
        if (!node) return;
        var row = el('div', { class: 'dv-data-node' }, box);
        row.appendChild(colorChip(node.slot, function () {
          var slots = usedSlots(d.nodes);
          var pick = ((node.slot || 1) % 8) + 1;
          var guard = 0;
          while (slots[pick] && guard < 8) { pick = (pick % 8) + 1; guard += 1; }
          state.onChange(function (next) {
            var target = next.nodes.filter(function (n) { return n.id === id; })[0];
            if (target) target.slot = pick;
          }, false);
        }, '换 ' + (node.name_en || '节点') + ' 的颜色'));
        row.appendChild(textField(node.name_en, function (value) {
          state.onChange(function (next) {
            var target = next.nodes.filter(function (n) { return n.id === id; })[0];
            if (target) target.name_en = value;
          }, false);
        }, '节点 ' + (ni + 1) + ' 名称'));
        var referenced = d.links.some(function (link) {
          return link.source === id || link.target === id;
        });
        row.appendChild(deleteButton('删除节点 ' + (ni + 1), function () {
          state.onChange(function (next) {
            next.nodes = next.nodes.filter(function (n) { return n.id !== id; });
            next.columns[ci] = next.columns[ci].filter(function (nid) { return nid !== id; });
          }, true);
        }, referenced || column.length <= 1));
      });
    });

    var tbl = table(host);
    var thead = el('thead', {}, tbl);
    var hr = headerRow(thead, '流向');
    ['从', '到', '数值'].forEach(function (label) {
      el('th', { scope: 'col' }, hr).textContent = label;
    });
    el('th', { scope: 'col', class: 'dv-data-narrow' }, hr).textContent = '';

    var tbody = el('tbody', {}, tbl);
    d.links.forEach(function (link, li) {
      var tr = el('tr', {}, tbody);
      var sourceCol = columnOf(d, link.source);
      var th = el('th', { scope: 'row', class: 'dv-data-rowhead' }, tr);
      var sourceSelect = el('select', {
        class: 'dv-data-select',
        'aria-label': '第 ' + (li + 1) + ' 条流向的来源'
      }, th);
      d.nodes.forEach(function (node) {
        if (node.column >= d.columns.length - 1) return;
        var option = el('option', { value: node.id }, sourceSelect);
        option.textContent = node.name_en || node.id;
        if (node.id === link.source) option.selected = true;
      });

      var targetTd = el('td', {}, tr);
      var targetSelect = el('select', {
        class: 'dv-data-select',
        'aria-label': '第 ' + (li + 1) + ' 条流向的目标'
      }, targetTd);
      function fillTargets(sourceId) {
        DV.clear(targetSelect);
        var from = columnOf(d, sourceId);
        d.nodes.forEach(function (node) {
          if (node.column <= from) return;
          var option = el('option', { value: node.id }, targetSelect);
          option.textContent = node.name_en || node.id;
          if (node.id === link.target) option.selected = true;
        });
        if (!targetSelect.value && targetSelect.options.length) {
          targetSelect.selectedIndex = 0;
        }
      }
      fillTargets(link.source);

      sourceSelect.addEventListener('change', function () {
        var sourceId = sourceSelect.value;
        var targetId = targetSelect.value;
        var from = columnOf(d, sourceId);
        if (!targetId || columnOf(d, targetId) <= from) {
          targetId = (d.nodes.filter(function (n) { return n.column > from; })[0] || {}).id || '';
        }
        state.onChange(function (next) {
          next.links[li].source = sourceId;
          next.links[li].target = targetId;
        }, false);
        fillTargets(sourceId);
      });
      targetSelect.addEventListener('change', function () {
        state.onChange(function (next) { next.links[li].target = targetSelect.value; }, false);
      });

      var valueTd = el('td', {}, tr);
      valueTd.appendChild(numberField(link.value, function (number) {
        state.onChange(function (next) { next.links[li].value = Math.max(0, number); }, false);
      }, '第 ' + (li + 1) + ' 条流向数值'));

      var del = el('td', { class: 'dv-data-narrow' }, tr);
      del.appendChild(deleteButton('删除流向 ' + (li + 1), function () {
        if (d.links.length <= 1) return;
        state.onChange(function (next) { next.links.splice(li, 1); }, true);
      }, d.links.length <= 1));
    });

    var tfoot = el('tfoot', {}, tbl);
    var tr = el('tr', {}, tfoot);
    var td = el('td', { colspan: '4' }, tr);
    td.appendChild(button('+ 流向', '添加一条流向', function () {
      state.onChange(function (next) {
        var source = next.nodes.filter(function (n) { return n.column === 0; })[0];
        var from = source ? source.column : 0;
        var target = next.nodes.filter(function (n) { return n.column > from; })[0];
        if (!source || !target) return;
        next.links.push({
          source: source.id,
          target: target.id,
          value: 100
        });
      }, true);
    }, 'dv-data-addrow'));
  }

  function columnOf(data, id) {
    var node = data.nodes.filter(function (n) { return n.id === id; })[0];
    if (node) return node.column;
    for (var ci = 0; ci < (data.columns || []).length; ci++) {
      if (data.columns[ci].indexOf(id) >= 0) return ci;
    }
    return 0;
  }

  // ---------------------------------------------------------------- slope
  function slopeEditor(host, state) {
    var d = state.data;
    var tbl = table(host);
    var thead = el('thead', {}, tbl);
    var hr = headerRow(thead, '对象');
    d.periods.forEach(function (period, pi) {
      var th = el('th', { scope: 'col', class: 'dv-data-colhead' }, hr);
      var top = el('div', { class: 'dv-data-coltop' }, th);
      top.appendChild(textField(period.label_en, function (value) {
        state.onChange(function (next) { next.periods[pi].label_en = value; }, false);
      }, '第 ' + (pi + 1) + ' 期名称'));
      top.appendChild(deleteButton('删除第 ' + (pi + 1) + ' 期', function () {
        if (d.periods.length <= 2) return;
        state.onChange(function (next) {
          next.periods.splice(pi, 1);
          next.entities.forEach(function (entity) { entity.values.splice(pi, 1); });
        }, true);
      }, d.periods.length <= 2));
    });
    var addTh = el('th', { scope: 'col', class: 'dv-data-addcol' }, hr);
    addTh.appendChild(button('+', '添加一期', function () {
      state.onChange(function (next) {
        next.periods.push({ label_en: 'Period ' + (next.periods.length + 1) });
        next.entities.forEach(function (entity) { entity.values.push(0); });
      }, true);
    }, 'dv-data-plus'));

    var tbody = el('tbody', {}, tbl);
    d.entities.forEach(function (entity, ei) {
      var tr = el('tr', {}, tbody);
      var th = el('th', { scope: 'row', class: 'dv-data-rowhead' }, tr);
      th.appendChild(colorChip(entity.slot, function () {
        var slots = usedSlots(d.entities);
        var pick = ((entity.slot || 1) % 8) + 1;
        var guard = 0;
        while (slots[pick] && guard < 8) { pick = (pick % 8) + 1; guard += 1; }
        state.onChange(function (next) { next.entities[ei].slot = pick; }, false);
      }, '换 ' + (entity.name_en || '对象') + ' 的颜色'));
      th.appendChild(textField(entity.name_en, function (value) {
        state.onChange(function (next) { next.entities[ei].name_en = value; }, false);
      }, '对象 ' + (ei + 1) + ' 名称'));
      th.appendChild(deleteButton('删除对象 ' + (ei + 1), function () {
        if (d.entities.length <= 2) return;
        state.onChange(function (next) { next.entities.splice(ei, 1); }, true);
      }, d.entities.length <= 2));
      entity.values.forEach(function (value, pi) {
        var td = el('td', {}, tr);
        td.appendChild(numberField(value, function (number) {
          state.onChange(function (next) { next.entities[ei].values[pi] = number; }, false);
        }, (entity.name_en || '') + ', ' + (d.periods[pi].label_en || '')));
      });
    });
    var tfoot = el('tfoot', {}, tbl);
    var tr = el('tr', {}, tfoot);
    var td = el('td', { colspan: String(d.periods.length + 2) }, tr);
    td.appendChild(button('+ 对象', '添加一个对象', function () {
      state.onChange(function (next) {
        var ids = {};
        next.entities.forEach(function (entity) { ids[entity.id] = true; });
        next.entities.push({
          id: uniqueId('e', ids),
          name_en: 'Entity ' + (next.entities.length + 1),
          slot: nextSlot(usedSlots(next.entities)),
          values: next.periods.map(function () { return 0; })
        });
      }, true);
    }, 'dv-data-addrow'));
  }

  // ---------------------------------------------------------------- waterfall
  function waterfallEditor(host, state) {
    var d = state.data;
    var top = el('div', { class: 'dv-data-start' }, host);
    top.appendChild(textField((d.start || {}).name_en || 'Start', function (value) {
      state.onChange(function (next) {
        next.start = next.start || {};
        next.start.name_en = value;
      }, false);
    }, '起始项名称'));
    top.appendChild(numberField(Number(d.start_value || 0), function (number) {
      state.onChange(function (next) { next.start_value = number; }, false);
    }, '起始值'));
    top.appendChild(textField((d.end || {}).name_en || 'End', function (value) {
      state.onChange(function (next) {
        next.end = next.end || {};
        next.end.name_en = value;
      }, false);
    }, '结束项名称'));

    var tbl = table(host);
    var thead = el('thead', {}, tbl);
    var hr = headerRow(thead, '步骤');
    el('th', { scope: 'col' }, hr).textContent = '增减';
    el('th', { scope: 'col', class: 'dv-data-narrow' }, hr).textContent = '';

    var tbody = el('tbody', {}, tbl);
    d.steps.forEach(function (step, si) {
      var tr = el('tr', {}, tbody);
      var th = el('th', { scope: 'row', class: 'dv-data-rowhead' }, tr);
      th.appendChild(textField(step.name_en, function (value) {
        state.onChange(function (next) { next.steps[si].name_en = value; }, false);
      }, '步骤 ' + (si + 1) + ' 名称'));
      var td = el('td', {}, tr);
      td.appendChild(numberField(step.value, function (number) {
        state.onChange(function (next) { next.steps[si].value = number; }, false);
      }, '步骤 ' + (si + 1) + ' 增减'));
      var del = el('td', { class: 'dv-data-narrow' }, tr);
      del.appendChild(deleteButton('删除步骤 ' + (si + 1), function () {
        if (d.steps.length <= 1) return;
        state.onChange(function (next) { next.steps.splice(si, 1); }, true);
      }, d.steps.length <= 1));
    });
    var tfoot = el('tfoot', {}, tbl);
    var tr = el('tr', {}, tfoot);
    var td = el('td', { colspan: '3' }, tr);
    td.appendChild(button('+ 步骤', '添加一个步骤', function () {
      state.onChange(function (next) {
        var ids = {};
        next.steps.forEach(function (step) { ids[step.id] = true; });
        next.steps.push({
          id: uniqueId('w', ids),
          name_en: 'Step ' + (next.steps.length + 1),
          value: 0
        });
      }, true);
    }, 'dv-data-addrow'));
  }

  DV.editor = {
    render: function (host, state) {
      DV.clear(host);
      host.className = 'dv-data';
      tools(host, state);
      if (state.type === 'line' || state.type === 'bar' || state.type === 'stacked') {
        matrixEditor(host, state);
      } else if (state.type === 'pie') {
        pieEditor(host, state);
      } else if (state.type === 'scatter') {
        scatterEditor(host, state);
      } else if (state.type === 'heatmap') {
        heatmapEditor(host, state);
      } else if (state.type === 'sankey') {
        sankeyEditor(host, state);
      } else if (state.type === 'slope') {
        slopeEditor(host, state);
      } else if (state.type === 'waterfall') {
        waterfallEditor(host, state);
      }
      return host;
    }
  };
})(window.DV);
