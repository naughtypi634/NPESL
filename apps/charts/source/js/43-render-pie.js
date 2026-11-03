(function (NC) {
  'use strict';

  var svg = NC.svg;
  var common = NC.renderCommon;

  function total(values) {
    return values.reduce(function (sum, value) { return sum + value; }, 0);
  }

  function shares(values, sum) {
    return values.map(function (value) { return sum > 0 ? value / sum * 100 : 0; });
  }

  function setShare(dataset, index, next) {
    var values = dataset.parts.map(function (part) { return part.value; });
    var min = 3;
    var max = 100 - min * (values.length - 1);
    next = NC.clamp(next, min, max);
    var diff = next - values[index];
    if (Math.abs(diff) < 0.001) return;
    values[index] = next;
    var others = values.map(function (value, i) { return i; }).filter(function (i) { return i !== index; });
    if (diff > 0) {
      var need = diff;
      others.sort(function (a, b) { return values[b] - values[a]; });
      others.forEach(function (i) {
        if (need <= 0) return;
        var room = values[i] - min;
        var take = Math.min(room, need);
        values[i] -= take;
        need -= take;
      });
    } else {
      var add = -diff;
      others.sort(function (a, b) { return values[b] - values[a]; });
      others.forEach(function (i) {
        var room = max - values[i];
        if (room <= 0) return;
        var give = Math.min(room, add / others.length);
        values[i] += give;
        add -= give;
      });
    }
    var sum = total(values);
    dataset.parts.forEach(function (part, i) {
      part.value = sum > 0 ? values[i] / sum * 100 : values[i];
    });
  }

  function legendHost(lab) {
    if (!lab.legendHost) {
      lab.legendHost = document.createElement('div');
      lab.legendHost.className = 'pie-legend';
    }
    if (!lab.legendHost.parentNode) lab.plot.appendChild(lab.legendHost);
    return lab.legendHost;
  }

  function renderLegend(lab, items) {
    var host = legendHost(lab);
    host.innerHTML = '';
    items.forEach(function (item) {
      var row = document.createElement('span');
      row.className = 'legend-item';
      var dot = document.createElement('span');
      dot.className = 'legend-dot';
      dot.style.background = item.color;
      var name = document.createElement('span');
      name.className = 'legend-name';
      name.textContent = item.name;
      var value = document.createElement('span');
      value.className = 'legend-value';
      value.textContent = item.share;
      row.appendChild(dot);
      row.appendChild(name);
      row.appendChild(value);
      host.appendChild(row);
    });
  }

  function render(lab) {
    var dataset = lab.dataset;
    var values = dataset.parts.map(function (part) { return part.value; });
    var sum = total(values);
    var perc = shares(values, sum);
    var width = 720;
    var height = 360;
    var cx = 360;
    var cy = 176;
    var radius = 132;
    var start = -Math.PI / 2;
    var cumulative = start;

    var root = svg.create(lab.plot, width, height, 'Pie chart of market share by channel. Drag a boundary to change the split.');
    lab.svg = root;
    renderLegend(lab, dataset.parts.map(function (part, index) {
      return { name: part.name_en, color: 'var(--' + part.color + ')', share: NC.fmt.number(perc[index], 0) + '%' };
    }));

    var sliceLayer = svg.group(root, { class: 'pie-slices' });
    var labelLayer = svg.group(root, { class: 'pie-labels' });
    var handleLayer = svg.group(root, { class: 'handles' });
    var slices = [];
    var labels = [];
    var handles = [];
    var boundaries = [];

    dataset.parts.forEach(function (part, index) {
      var share = perc[index];
      var angle = share / 100 * Math.PI * 2;
      var end = cumulative + angle;
      var path = svg.path(sliceLayer, {
        d: NC.scale.arc(cx, cy, radius, cumulative, end),
        fill: 'var(--' + part.color + ')',
        class: 'pie-slice',
        'data-id': part.id
      });
      var mid = cumulative + angle / 2;
      var labelPoint = NC.scale.polar(cx, cy, radius * 0.62, mid);
      var label = svg.text(labelLayer, {
        x: labelPoint.x,
        y: labelPoint.y,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        class: 'pie-label' + (part.color === 'series-4' ? ' on-light' : '')
      }, share >= 6 ? NC.fmt.number(share, 0) + '%' : '');
      slices.push(path);
      labels.push(label);
      cumulative = end;
    });

    dataset.parts.forEach(function (part, index) {
      var boundaryAngle = start;
      for (var i = 0; i <= index; i += 1) boundaryAngle += perc[i] / 100 * Math.PI * 2;
      var point = NC.scale.polar(cx, cy, radius, boundaryAngle);
      var nextIndex = (index + 1) % dataset.parts.length;
      var handle = svg.mkHandle(handleLayer, point.x, point.y, {
        min: 3,
        max: 97,
        now: perc[index],
        radius: 5,
        hitRadius: 20,
        orientation: 'horizontal',
        label: 'Boundary between ' + part.name_en + ' and ' + dataset.parts[nextIndex].name_en,
        valueText: part.name_en + ' ' + NC.fmt.number(perc[index], 0) + '%, ' + dataset.parts[nextIndex].name_en + ' ' + NC.fmt.number(perc[nextIndex], 0) + '%'
      });
      handle.group.classList.add('pie-handle');
      handle.group.setAttribute('data-index', index);
      handles.push({ index: index, handle: handle });
    });

    lab.pieState = {
      cx: cx, cy: cy, radius: radius, start: start,
      slices: slices, labels: labels, handles: handles,
      parts: dataset.parts, root: root
    };

    handles.forEach(function (item) {
      var index = item.index;
      var nextIndex = (index + 1) % dataset.parts.length;
      var dragging = false;
      var startValues = null;
      var lastValues = null;
      var moved = false;
      var lastAngle = 0;
      var turn = 0;

      function pointAngle(event) {
        var root = lab.pieState.root;
        var rect = root.getBoundingClientRect();
        var box = root.viewBox.baseVal;
        var scaleX = box.width ? box.width / rect.width : 1;
        var scaleY = box.height ? box.height / rect.height : 1;
        var x = (event.clientX - rect.left) * scaleX;
        var y = (event.clientY - rect.top) * scaleY;
        return NC.scale.angleOf(cx, cy, x, y);
      }

      function apply(deltaPP) {
        var values2 = dataset.parts.map(function (part) { return part.value; });
        var a0 = startValues[index];
        var b0 = startValues[nextIndex];
        var pair = a0 + b0;
        var a = NC.clamp(a0 + deltaPP, 3, pair - 3);
        var b = pair - a;
        values2[index] = a;
        values2[nextIndex] = b;
        var sum = total(values2);
        dataset.parts.forEach(function (part, i) {
          part.value = sum > 0 ? values2[i] / sum * 100 : values2[i];
        });
      }

      function down(event) {
        if (event.button != null && event.button !== 0) return;
        dragging = true;
        moved = false;
        turn = 0;
        lastAngle = pointAngle(event);
        startValues = dataset.parts.map(function (part) { return part.value; });
        lastValues = startValues.slice();
        try { item.handle.group.setPointerCapture(event.pointerId); } catch (err) {}
        item.handle.group.classList.add('dragging');
        event.preventDefault();
      }

      function move(event) {
        if (!dragging) return;
        var angle = pointAngle(event);
        var step = angle - lastAngle;
        if (step > Math.PI) step -= Math.PI * 2;
        if (step < -Math.PI) step += Math.PI * 2;
        turn += step;
        lastAngle = angle;
        if (!moved && Math.abs(turn) < 0.01) return;
        moved = true;
        var pair = startValues[index] + startValues[nextIndex];
        var minTurn = (3 - startValues[index]) / 100 * Math.PI * 2;
        var maxTurn = (pair - 3 - startValues[index]) / 100 * Math.PI * 2;
        turn = NC.clamp(turn, minTurn, maxTurn);
        var deltaPP = turn / (Math.PI * 2) * 100;
        apply(deltaPP);
        lastValues = dataset.parts.map(function (part) { return part.value; });
        lab.changed(false);
        event.preventDefault();
      }

      function up(event, canceled) {
        if (!dragging) return;
        dragging = false;
        try { item.handle.group.releasePointerCapture(event.pointerId); } catch (err) {}
        item.handle.group.classList.remove('dragging');
        if (!moved || canceled) {
          dataset.parts.forEach(function (part, i) { part.value = startValues[i]; });
          lab.changed(false);
        } else {
          lab.changed(true);
        }
      }

      item.handle.group.addEventListener('pointerdown', down);
      item.handle.group.addEventListener('pointermove', move);
      item.handle.group.addEventListener('pointerup', function (event) { up(event, false); });
      item.handle.group.addEventListener('pointercancel', function (event) { up(event, true); });
      item.handle.group.addEventListener('keydown', function (event) {
        var delta = 0;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') delta = event.shiftKey ? -5 : -1;
        else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') delta = event.shiftKey ? 5 : 1;
        else return;
        startValues = dataset.parts.map(function (part) { return part.value; });
        apply(delta);
        lab.changed(true);
        event.preventDefault();
      });
    });
  }

  function update(lab) {
    var state = lab.pieState;
    if (!state) return;
    var values = state.parts.map(function (part) { return part.value; });
    var sum = total(values);
    var perc = shares(values, sum);
    var cumulative = state.start;
    state.parts.forEach(function (part, index) {
      var angle = perc[index] / 100 * Math.PI * 2;
      var end = cumulative + angle;
      state.slices[index].setAttribute('d', NC.scale.arc(state.cx, state.cy, state.radius, cumulative, end));
      var mid = cumulative + angle / 2;
      var labelPoint = NC.scale.polar(state.cx, state.cy, state.radius * 0.62, mid);
      state.labels[index].setAttribute('x', labelPoint.x);
      state.labels[index].setAttribute('y', labelPoint.y);
      state.labels[index].textContent = perc[index] >= 6 ? NC.fmt.number(perc[index], 0) + '%' : '';
      cumulative = end;
    });

    state.handles.forEach(function (item) {
      var boundaryAngle = state.start;
      for (var i = 0; i <= item.index; i += 1) boundaryAngle += perc[i] / 100 * Math.PI * 2;
      var point = NC.scale.polar(state.cx, state.cy, state.radius, boundaryAngle);
      svg.move(item.handle, point.x, point.y);
      var nextIndex = (item.index + 1) % state.parts.length;
      svg.setSlider(
        item.handle,
        perc[item.index],
        state.parts[item.index].name_en + ' ' + NC.fmt.number(perc[item.index], 0) + '%, ' +
          state.parts[nextIndex].name_en + ' ' + NC.fmt.number(perc[nextIndex], 0) + '%'
      );
    });

    var host = legendHost(lab);
    var rows = host.querySelectorAll('.legend-value');
    rows.forEach(function (row, index) {
      row.textContent = NC.fmt.number(perc[index], 0) + '%';
    });
  }

  function describe(lab) {
    return NC.desc.pie(lab.dataset, NC.state.level);
  }

  function tableSpec(lab) {
    var dataset = lab.dataset;
    return {
      columns: [
        { label: 'Channel' },
        { label: 'Share', editable: true, step: 1, decimals: 1, unit: '%' },
        { label: 'Baseline' }
      ],
      rows: dataset.parts.map(function (part, index) {
        return {
          key: part.id,
          cells: [
            { text: part.name_en + ' · ' + part.name_zh },
            {
              value: part.value,
              unit: '%',
              set: function (next) {
                setShare(dataset, index, next);
              }
            },
            { text: NC.fmt.number(part.baseline, 0) + '%' }
          ]
        };
      })
    };
  }

  NC.renderers.pie = {
    mount: function (lab) { render(lab); },
    render: render,
    update: update,
    describe: describe,
    table: tableSpec
  };
})(window.NPESLCharts);
