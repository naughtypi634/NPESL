(function (NC) {
  'use strict';

  var svg = NC.svg;
  var common = NC.renderCommon;

  var PANEL_W = 330;
  var PANEL_H = 330;
  var MAP_Y = 34;

  function featureRect(feature, x0, y0, w, h) {
    return {
      x: x0 + feature.x / 100 * w,
      y: y0 + feature.y / 100 * h,
      w: feature.w / 100 * w,
      h: feature.h / 100 * h
    };
  }

  function wrapLabel(label, maxChars) {
    var words = String(label).split(' ');
    var lines = [];
    var line = '';
    words.forEach(function (word) {
      if (!line) {
        line = word;
      } else if ((line + ' ' + word).length <= maxChars) {
        line += ' ' + word;
      } else {
        lines.push(line);
        line = word;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  function drawPanel(root, x0, y0, w, h, yearKey, dataset) {
    var after = yearKey === 'after';
    var group = svg.group(root, { class: 'map-panel', 'data-year': yearKey });
    svg.rect(group, {
      x: x0, y: y0, width: w, height: h, class: 'map-land'
    });

    var riverY = y0 + 0.83 * h;
    svg.rect(group, { x: x0, y: riverY, width: w, height: y0 + h - riverY, class: 'map-river' });
    svg.text(group, {
      x: x0 + w / 2, y: riverY + (y0 + h - riverY) / 2 + 4,
      'text-anchor': 'middle', class: 'map-water-label'
    }, 'Riverside');

    [0.40, 0.68].forEach(function (rx) {
      svg.rect(group, { x: x0 + rx * w - 1.4, y: y0, width: 2.8, height: h, class: 'map-road' });
    });
    svg.rect(group, { x: x0, y: y0 + 0.40 * h - 1.6, width: w, height: 3.2, class: 'map-road' });

    dataset.features.forEach(function (feature) {
      var rect = featureRect(feature, x0 + 0.04 * w, y0 + 0.06 * h, 0.92 * w, 0.92 * h);
      var data = after ? feature.after : feature.before;
      var changed = feature.change === 'replaced' || feature.change === 'added';
      var empty = after ? false : (feature.change === 'added');
      svg.rect(group, {
        x: rect.x,
        y: rect.y,
        width: rect.w,
        height: rect.h,
        rx: Math.min(6, rect.w * 0.06),
        class: 'map-block' +
          (changed && after ? ' is-new' : '') +
          (empty ? ' is-empty' : '') +
          (feature.change === 'unchanged' ? ' is-stable' : ''),
        'data-feature': feature.id,
        tabindex: '0',
        role: 'button',
        'aria-label': data.label_en + ' in ' + (after ? '2026' : '2015')
      });

      var lines = wrapLabel(data.label_en, rect.w > 120 ? 16 : 12);
      var startY = rect.y + rect.h / 2 - (lines.length - 1) * 6 + 3;
      lines.forEach(function (line, index) {
        svg.text(group, {
          x: rect.x + rect.w / 2,
          y: startY + index * 12,
          'text-anchor': 'middle',
          class: 'map-label' + (empty ? ' is-muted' : '')
        }, line);
      });

      if (changed) {
        svg.circle(group, {
          cx: rect.x + rect.w - 8,
          cy: rect.y + 8,
          r: 3.2,
          class: 'map-pin'
        });
      }
    });

    svg.text(group, {
      x: x0,
      y: y0 - 12,
      class: 'map-year'
    }, after ? '2026' : '2015');
    svg.text(group, {
      x: x0 + w,
      y: y0 - 12,
      'text-anchor': 'end',
      class: 'map-year-note'
    }, after ? 'After' : 'Before');
  }

  function highlight(lab, featureId) {
    var nodes = lab.plot.querySelectorAll('[data-feature]');
    Array.prototype.forEach.call(nodes, function (node) {
      node.classList.toggle('is-active', node.getAttribute('data-feature') === featureId);
    });
    var blocks = lab.section.querySelectorAll('[data-desc-lines] .sentence');
    Array.prototype.forEach.call(blocks, function (block) {
      var focus = (block.getAttribute('data-focus') || '').split(' ');
      block.classList.toggle('is-linked', focus.indexOf(featureId) !== -1);
    });
  }

  function bindFeatures(lab) {
    var nodes = lab.plot.querySelectorAll('[data-feature]');
    Array.prototype.forEach.call(nodes, function (node) {
      function select() {
        var id = node.getAttribute('data-feature');
        var active = node.classList.contains('is-active');
        highlight(lab, active ? '' : id);
      }
      node.addEventListener('click', select);
      node.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          select();
        }
      });
      node.addEventListener('pointerenter', function () {
        node.classList.add('is-hover');
      });
      node.addEventListener('pointerleave', function () {
        node.classList.remove('is-hover');
      });
    });
  }

  function render(lab) {
    if (lab.modesHost) lab.modesHost.innerHTML = '';
    NC.svg.clear(lab.plot);
    var compact = (lab.plot.getBoundingClientRect().width || 720) < 560;

    if (compact) {
      var stack = document.createElement('div');
      stack.className = 'map-stack';
      ['before', 'after'].forEach(function (yearKey) {
        var svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgNode.setAttribute('viewBox', '0 0 720 380');
        svgNode.setAttribute('role', 'img');
        svgNode.setAttribute('aria-label', 'Map of Riverside in ' + (yearKey === 'before' ? '2015' : '2026'));
        svgNode.setAttribute('class', 'chart-svg');
        stack.appendChild(svgNode);
        drawPanel(svgNode, 32, 46, 656, 292, yearKey, lab.dataset);
      });
      lab.plot.appendChild(stack);
      lab.svg = lab.plot.querySelector('svg');
    } else {
      var root = svg.create(lab.plot, 720, 400, 'Two maps comparing Riverside in 2015 and 2026. Select a building to read its change.');
      drawPanel(root, 24, MAP_Y, PANEL_W, PANEL_H, 'before', lab.dataset);
      drawPanel(root, 366, MAP_Y, PANEL_W, PANEL_H, 'after', lab.dataset);
      lab.svg = root;
    }

    bindFeatures(lab);
    lab.motion = null;
  }

  function describe(lab) {
    return NC.desc.map(lab.dataset, NC.state.level);
  }

  NC.renderers.map = {
    mount: function (lab) { render(lab); },
    render: render,
    update: function () {},
    describe: describe,
    table: function () { return null; }
  };
})(window.NPESLCharts);
