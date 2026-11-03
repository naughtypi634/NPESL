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

  function shareText(share) {
    if (share > 0 && share < 1) return '<1%';
    return NC.fmt.number(share, 0) + '%';
  }

  function layoutLabels(items, height, gap, pad) {
    if (!items.length) return;
    items.sort(function (a, b) { return a.y - b.y; });
    for (var i = 1; i < items.length; i += 1) {
      if (items[i].y < items[i - 1].y + gap) items[i].y = items[i - 1].y + gap;
    }
    var overflow = items[items.length - 1].y - (height - pad);
    if (overflow > 0) items.forEach(function (item) { item.y -= overflow; });
    if (items[0].y < pad) {
      var push = pad - items[0].y;
      items.forEach(function (item) { item.y += push; });
    }
  }

  function labelPath(item) {
    return 'M ' + item.p0x + ' ' + item.p0y + ' L ' + item.p1x + ' ' + item.y + ' L ' + item.p2x + ' ' + item.y;
  }

  function render(lab) {
    var dataset = lab.dataset;
    var values = dataset.parts.map(function (part) { return part.value; });
    var sum = total(values);
    var perc = shares(values, sum);
    var width = 720;
    var height = 360;
    var root = svg.create(lab.plot, width, height, 'Pie chart of market share by channel. Drag a boundary to change the split.');
    lab.svg = root;
    var compact = common.fit(root);
    lab.compact = compact;
    var cx = 360;
    var cy = compact ? 168 : 176;
    var radius = compact ? 110 : 132;
    var start = -Math.PI / 2;
    var cumulative = start;

    if (sum <= 0) {
      var ringLayer = svg.group(root, { class: 'pie-empty' });
      svg.circle(ringLayer, { cx: cx, cy: cy, r: radius, class: 'pie-empty-ring' });
      common.empty(lab.plot, 'No data · 份额为 0');
      lab.pieState = { empty: true, root: root, parts: dataset.parts };
      lab.motion = null;
      return;
    }

    var sliceLayer = svg.group(root, { class: 'pie-slices' });
    var leaderLayer = svg.group(root, { class: 'pie-leaders' });
    var labelLayer = svg.group(root, { class: 'pie-labels' });
    var handleLayer = svg.group(root, { class: 'handles' });
    var slices = [];
    var labels = [];
    var leaders = [];
    var handles = [];

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
      var side = Math.cos(mid) >= 0 ? 1 : -1;
      var p0 = NC.scale.polar(cx, cy, radius + 6, mid);
      var p1 = { x: cx + side * (radius + 34), y: cy + Math.sin(mid) * (radius + 34) };
      var p2 = { x: cx + side * (radius + 48), y: p1.y };
      var leader = svg.path(leaderLayer, {
        d: 'M ' + p0.x + ' ' + p0.y + ' L ' + p1.x + ' ' + p1.y + ' L ' + p2.x + ' ' + p2.y,
        class: 'pie-leader'
      });
      var label = svg.text(labelLayer, {
        x: p2.x + side * 4,
        y: p2.y,
        'text-anchor': side > 0 ? 'start' : 'end',
        'dominant-baseline': 'middle',
        class: 'pie-label'
      }, part.name_en + ' ' + shareText(share));
      slices.push(path);
      leaders.push(leader);
      labels.push({ node: label, leader: leader, side: side, y: p2.y, p0x: p0.x, p0y: p0.y, p1x: p1.x, p2x: p2.x + side * 4 });
      cumulative = end;
    });

    var labelGap = common.screenPx(root, 18);
    var labelPad = common.screenPx(root, 24);
    ['left', 'right'].forEach(function (key) {
      var side = key === 'left' ? -1 : 1;
      layoutLabels(labels.filter(function (item) { return item.side === side; }), height, labelGap, labelPad);
    });
    labels.forEach(function (item) {
      item.node.setAttribute('y', item.y);
      item.leader.setAttribute('d', labelPath(item));
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
        radius: common.screenPx(root, 5),
        hitRadius: common.screenPx(root, compact ? 22 : 18),
        label: 'Boundary between ' + part.name_en + ' and ' + dataset.parts[nextIndex].name_en,
        valueText: part.name_en + ' ' + NC.fmt.number(perc[index], 0) + '%, ' + dataset.parts[nextIndex].name_en + ' ' + NC.fmt.number(perc[nextIndex], 0) + '%'
      });
      handle.group.classList.add('pie-handle');
      handle.group.setAttribute('data-index', index);
      handles.push({ index: index, handle: handle });
    });

    function partTip(index) {
      var part = dataset.parts[index];
      var current = perc[index];
      var text = part.name_en + ' · ' + shareText(current);
      if (typeof part.baseline === 'number') {
        var delta = current - part.baseline;
        var sign = delta >= 0 ? '+' : '−';
        text += ' · ' + sign + NC.fmt.number(Math.abs(delta), 1) + ' pp';
      }
      return text;
    }

    function showTip(index) {
      var midAngle = start;
      for (var i = 0; i < index; i += 1) midAngle += perc[i] / 100 * Math.PI * 2;
      midAngle += (perc[index] / 100 * Math.PI * 2) / 2;
      var point = NC.scale.polar(cx, cy, radius * 0.75, midAngle);
      common.showTip(lab.plot, partTip(index), root, point.x, point.y);
      common.emphasize(lab.plot, dataset.parts[index].id);
      slices.forEach(function (slice, i) { slice.classList.toggle('is-active', i === index); });
      lab.pieState.tipIndex = index;
    }

    function hideTip() {
      common.hideTip(lab.plot);
      common.clearEmphasis(lab.plot);
      slices.forEach(function (slice) { slice.classList.remove('is-active'); });
      if (lab.pieState) lab.pieState.tipIndex = null;
    }

    lab.pieState = {
      cx: cx, cy: cy, radius: radius, start: start, height: height,
      slices: slices, labels: labels, leaders: leaders, handles: handles,
      parts: dataset.parts, root: root, perc: perc,
      tipIndex: null, layoutLabels: layoutLabels, showTip: showTip
    };

    handles.forEach(function (item) {
      var index = item.index;
      var nextIndex = (index + 1) % dataset.parts.length;
      var dragging = false;
      var startValues = null;
      var moved = false;
      var lastAngle = 0;
      var turn = 0;
      var pointerId = null;

      function pointAngle(event) {
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
        var sum2 = total(values2);
        dataset.parts.forEach(function (part, i) {
          part.value = sum2 > 0 ? values2[i] / sum2 * 100 : values2[i];
        });
      }

      function down(event) {
        if (event.button != null && event.button !== 0) return;
        dragging = true;
        moved = false;
        turn = 0;
        pointerId = event.pointerId;
        lastAngle = pointAngle(event);
        startValues = dataset.parts.map(function (part) { return part.value; });
        try { item.handle.group.setPointerCapture(pointerId); } catch (err) {}
        item.handle.group.classList.add('dragging');
        showTip(index);
        event.preventDefault();
      }

      function move(event) {
        if (!dragging || event.pointerId !== pointerId) return;
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
        apply(turn / (Math.PI * 2) * 100);
        lab.changed(false);
        showTip(index);
        event.preventDefault();
      }

      function up(event, canceled) {
        if (!dragging) return;
        dragging = false;
        try { item.handle.group.releasePointerCapture(pointerId); } catch (err) {}
        item.handle.group.classList.remove('dragging');
        if (!moved || canceled) {
          dataset.parts.forEach(function (part, i) { part.value = startValues[i]; });
          lab.changed(false);
        } else {
          lab.changed(true);
        }
        pointerId = null;
        showTip(index);
      }

      item.handle.group.addEventListener('pointerdown', down);
      item.handle.group.addEventListener('pointermove', move);
      item.handle.group.addEventListener('pointerup', function (event) { up(event, false); });
      item.handle.group.addEventListener('pointercancel', function (event) { up(event, true); });
      item.handle.group.addEventListener('focus', function () { showTip(index); });
      item.handle.group.addEventListener('blur', hideTip);
      item.handle.group.addEventListener('keydown', function (event) {
        var delta = 0;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') delta = event.shiftKey ? -5 : -1;
        else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') delta = event.shiftKey ? 5 : 1;
        else return;
        startValues = dataset.parts.map(function (part) { return part.value; });
        apply(delta);
        lab.changed(true);
        showTip(index);
        event.preventDefault();
      });

      item.begin = down;
      item.handle.group.addEventListener('pointerenter', function () {
        common.emphasize(lab.plot, dataset.parts[index].id);
        showTip(index);
      });
      item.handle.group.addEventListener('pointerleave', hideTip);

      slices[index].addEventListener('pointerenter', function () {
        common.emphasize(lab.plot, dataset.parts[index].id);
        showTip(index);
      });
      slices[index].addEventListener('pointerleave', hideTip);
      slices[index].addEventListener('pointerdown', function (event) {
        if (event.button != null && event.button !== 0) return;
        var angle = pointAngle(event);
        var best = 0;
        var bestDistance = Infinity;
        for (var i = 0; i < dataset.parts.length; i += 1) {
          var boundary = start;
          for (var j = 0; j <= i; j += 1) boundary += perc[j] / 100 * Math.PI * 2;
          var diff = Math.abs(angle - boundary);
          diff = Math.min(diff, Math.PI * 2 - diff);
          if (diff < bestDistance) {
            bestDistance = diff;
            best = i;
          }
        }
        if (handles[best]) handles[best].begin(event);
      });
    });

    lab.motion = { slices: slices, labels: labels.map(function (item) { return item.node; }), leaders: leaders, handles: handles.map(function (item) { return item.handle; }) };
  }

  function update(lab) {
    var state = lab.pieState;
    if (!state) return;
    var values = state.parts.map(function (part) { return part.value; });
    var sum = total(values);
    if (state.empty) {
      if (sum > 0) render(lab);
      return;
    }
    if (sum <= 0) {
      render(lab);
      return;
    }
    var perc = shares(values, sum);
    state.perc = perc;
    var cumulative = state.start;
    state.parts.forEach(function (part, index) {
      var angle = perc[index] / 100 * Math.PI * 2;
      var end = cumulative + angle;
      state.slices[index].setAttribute('d', NC.scale.arc(state.cx, state.cy, state.radius, cumulative, end));
      var mid = cumulative + angle / 2;
      var side = Math.cos(mid) >= 0 ? 1 : -1;
      var p0 = NC.scale.polar(state.cx, state.cy, state.radius + 6, mid);
      var p1 = { x: state.cx + side * (state.radius + 34), y: state.cy + Math.sin(mid) * (state.radius + 34) };
      var p2 = { x: state.cx + side * (state.radius + 48), y: p1.y };
      var label = state.labels[index];
      label.side = side;
      label.y = p2.y;
      label.p0x = p0.x;
      label.p0y = p0.y;
      label.p1x = p1.x;
      label.p2x = p2.x + side * 4;
      label.node.setAttribute('x', label.p2x);
      label.node.setAttribute('y', p2.y);
      label.node.setAttribute('text-anchor', side > 0 ? 'start' : 'end');
      label.node.textContent = part.name_en + ' ' + shareText(perc[index]);
      cumulative = end;
    });
    var labelGap = common.screenPx(state.root, 18);
    var labelPad = common.screenPx(state.root, 24);
    ['left', 'right'].forEach(function (key) {
      var side = key === 'left' ? -1 : 1;
      state.layoutLabels(state.labels.filter(function (item) { return item.side === side; }), state.height, labelGap, labelPad);
    });
    state.labels.forEach(function (item) {
      item.node.setAttribute('y', item.y);
      item.leader.setAttribute('d', labelPath(item));
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

    if (typeof state.tipIndex === 'number') state.showTip(state.tipIndex);
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
