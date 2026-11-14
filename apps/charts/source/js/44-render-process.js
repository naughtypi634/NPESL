(function (NC) {
  'use strict';

  var ICONS = {
    phone: '<path d="M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M11 18h2"/>',
    chef: '<path d="M7 13h10v6H7z"/><path d="M7 13a3 3 0 1 1 .8-5.9A4 4 0 0 1 16 6a4 4 0 0 1 1.2 7.7"/>',
    scooter: '<circle cx="6" cy="17" r="2.5"/><circle cx="18" cy="17" r="2.5"/><path d="M8.5 17h7M9 6h3l3 11M12 9h5"/>',
    bag: '<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    route: '<circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M8 6h5a3 3 0 0 1 3 3v6"/>',
    check: '<path d="m5 12 4 4L19 6"/>'
  };

  function icon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.check) + '</svg>';
  }

  function buildControls(lab) {
    var host = lab.modesHost;
    if (!host) return;
    host.innerHTML = '';
    var group = document.createElement('div');
    group.className = 'mode-group';
    var label = document.createElement('span');
    label.className = 'mode-label';
    label.textContent = '语态';
    group.appendChild(label);
    var segmentHost = document.createElement('div');
    group.appendChild(segmentHost);
    NC.segment(segmentHost, {
      label: '语态',
      value: lab.mode.voice || 'active',
      options: [{ value: 'active', zh: '主动' }, { value: 'passive', zh: '被动' }]
    }, function (value) {
      lab.setMode({ voice: value });
    });
    host.appendChild(group);
  }

  // The selected step is data, not just a class: it survives a voice change
  // re-render and is exposed on the wrap for tests and agents.
  function highlight(lab, stepId) {
    var active = stepId || '';
    if (lab.processState) {
      lab.processState.activeStep = active || null;
      if (lab.processState.wrap) lab.processState.wrap.setAttribute('data-active-step', active);
      var detail = lab.processState.detail;
      if (detail) {
        var step = stepId ? lab.dataset.steps.filter(function (item) { return item.id === stepId; })[0] : null;
        detail.classList.toggle('is-empty', !step);
        detail.hidden = false;
        if (step) {
          var passive = lab.mode && lab.mode.voice === 'passive';
          detail.querySelector('.process-detail-icon').innerHTML = icon(step.icon);
          detail.querySelector('.process-detail-title').textContent = step.title_en;
          detail.querySelector('.process-detail-caption').textContent = step.title_zh;
          detail.querySelector('.process-detail-en').textContent = passive ? step.passive_en : step.detail_en;
          detail.querySelector('.process-detail-zh').textContent = passive ? step.passive_zh : step.detail_zh;
        }
      }
    }
    var stepNodes = lab.plot.querySelectorAll('.process-step');
    Array.prototype.forEach.call(stepNodes, function (node) {
      var on = node.getAttribute('data-step') === active;
      node.classList.toggle('is-active', on);
      node.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var blocks = lab.section.querySelectorAll('[data-desc-lines] .sentence');
    Array.prototype.forEach.call(blocks, function (block) {
      var focus = (block.getAttribute('data-focus') || '').split(' ');
      block.classList.toggle('is-linked', active !== '' && focus.indexOf(active) !== -1);
    });
  }

  function render(lab) {
    if (!lab.mode.voice) lab.mode.voice = 'active';
    buildControls(lab);
    NC.svg.clear(lab.plot);
    lab.svg = null;

    var dataset = lab.dataset;
    var previousStep = lab.processState ? lab.processState.activeStep : null;
    if (!previousStep && dataset.steps.length) previousStep = dataset.steps[0].id;
    var wrap = document.createElement('div');
    wrap.className = 'process-flow';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', '流程步骤');
    wrap.setAttribute('data-active-step', previousStep || '');

    dataset.steps.forEach(function (step, index) {
      if (index > 0) {
        var arrow = document.createElement('span');
        arrow.className = 'process-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
        wrap.appendChild(arrow);
      }
      var node = document.createElement('button');
      node.type = 'button';
      node.className = 'process-step';
      node.setAttribute('data-step', step.id);
      node.setAttribute('aria-pressed', 'false');
      node.innerHTML =
        '<span class="process-icon">' + icon(step.icon) + '</span>' +
        '<span class="process-title" lang="en">' + NC.escapeHtml(step.title_en) + '</span>' +
        '<span class="process-zh">' + NC.escapeHtml(step.title_zh) + '</span>';
      node.addEventListener('click', function () {
        if (NC.dismissHint) NC.dismissHint();
        highlight(lab, step.id);
      });
      wrap.appendChild(node);
    });

    var detail = document.createElement('div');
    detail.className = 'process-detail process-detail-card is-empty';
    detail.setAttribute('aria-live', 'polite');
    detail.innerHTML =
      '<span class="process-detail-empty">点击左侧步骤查看说明</span>' +
      '<span class="process-detail-icon" aria-hidden="true"></span>' +
      '<p class="process-detail-title" lang="en"></p>' +
      '<p class="process-detail-caption"></p>' +
      '<p class="process-detail-en" lang="en"></p>' +
      '<p class="process-detail-zh"></p>';

    var layout = document.createElement('div');
    layout.className = 'process-layout';
    layout.appendChild(wrap);
    layout.appendChild(detail);
    lab.plot.appendChild(layout);
    lab.processState = { wrap: wrap, detail: detail, activeStep: previousStep || null };
    highlight(lab, previousStep);
    lab.motion = null;
  }

  function focusHighlight(lab, focus) {
    if (focus && focus.kind === 'steps' && focus.steps && focus.steps.length) {
      highlight(lab, focus.steps[0]);
    }
  }

  function describe(lab) {
    return NC.desc.process(lab.dataset, NC.state.level, lab.mode);
  }

  NC.renderers.process = {
    mount: function (lab) { render(lab); },
    render: render,
    update: function () {},
    highlight: focusHighlight,
    sync: function (lab) {
      if (!lab.processState) return;
      highlight(lab, lab.processState.activeStep);
    },
    describe: describe,
    table: function () { return null; }
  };
})(window.NPESLCharts);
