/* Travel 场景页交互：白点、流程筛选、词与对话卡片。无音频、无进度标记。 */
(function () {
  'use strict';

  var data = JSON.parse(document.getElementById('tv-data').textContent);
  var stage = document.getElementById('stage');
  var box = document.getElementById('tv-box');
  var readout = document.getElementById('readout');
  var detail = document.getElementById('detail');
  var dEn = document.getElementById('d-en');
  var dZh = document.getElementById('d-zh');
  var dExample = document.getElementById('d-example');
  var dDialog = document.getElementById('d-dialog');
  var steps = document.getElementById('steps');
  var terms = document.getElementById('terms');

  var items = data.items.slice();
  var byId = {};
  items.forEach(function (item) { byId[item.id] = item; });
  var dots = Array.prototype.slice.call(stage.querySelectorAll('.tv-dot'));
  var activeStep = '';
  var activeId = '';

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderSteps() {
    var all = el('button', 'tv-step', '全部');
    all.type = 'button';
    all.dataset.step = '';
    all.addEventListener('click', function () { filterStep(''); });
    steps.appendChild(all);

    data.steps.forEach(function (step) {
      var button = el('button', 'tv-step');
      button.type = 'button';
      button.dataset.step = step.id;
      button.appendChild(el('span', '', step.zh));
      button.appendChild(el('em', '', step.en));
      button.addEventListener('click', function () { filterStep(step.id); });
      steps.appendChild(button);
    });
  }

  function renderTerms() {
    data.steps.forEach(function (step) {
      var group = el('div', 'tv-group');
      group.dataset.step = step.id;
      group.appendChild(el('h3', '', step.zh));
      var list = el('div', 'tv-term-list');
      items.filter(function (item) { return item.step === step.id; }).forEach(function (item) {
        var button = el('button', 'tv-term');
        button.type = 'button';
        button.dataset.item = item.id;
        button.appendChild(el('span', '', item.en));
        button.appendChild(el('small', '', item.zh));
        button.addEventListener('click', function () { select(item.id); });
        list.appendChild(button);
      });
      group.appendChild(list);
      terms.appendChild(group);
    });
  }

  function filterStep(stepId) {
    activeStep = stepId;
    Array.prototype.forEach.call(steps.children, function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.step === stepId));
    });
    Array.prototype.forEach.call(terms.children, function (group) {
      group.hidden = Boolean(stepId) && group.dataset.step !== stepId;
    });
    dots.forEach(function (dot) {
      var item = byId[dot.dataset.item];
      dot.classList.toggle('dim', Boolean(stepId) && item.step !== stepId);
    });
  }

  function select(id) {
    var item = byId[id];
    if (!item) return;
    activeId = id;

    dots.forEach(function (dot) {
      dot.setAttribute('aria-pressed', String(dot.dataset.item === id));
    });
    Array.prototype.forEach.call(terms.querySelectorAll('.tv-term'), function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.item === id));
    });

    readout.replaceChildren(
      el('span', 'tv-word', item.en),
      el('span', 'tv-zh', item.zh)
    );

    box.hidden = false;
    box.style.left = item.box[0] + '%';
    box.style.top = item.box[1] + '%';
    box.style.width = (item.box[2] - item.box[0]) + '%';
    box.style.height = (item.box[3] - item.box[1]) + '%';

    dEn.textContent = item.en;
    dZh.textContent = item.zh;
    dExample.textContent = item.example;
    dDialog.replaceChildren();
    (item.dialog || []).forEach(function (line) {
      var row = el('p', 'tv-line');
      row.appendChild(el('span', 'tv-who', line.who));
      row.appendChild(el('span', 'tv-say', line.en));
      dDialog.appendChild(row);
    });
    detail.hidden = false;
  }

  function hit(x, y) {
    var found = null;
    var area = Infinity;
    items.forEach(function (item) {
      var b = item.box;
      if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]) {
        var size = (b[2] - b[0]) * (b[3] - b[1]);
        if (size < area) { area = size; found = item; }
      }
    });
    if (found) return found;

    var nearest = null;
    var distance = 15;
    items.forEach(function (item) {
      var d = Math.hypot(item.pt[0] - x, item.pt[1] - y);
      if (d < distance) { distance = d; nearest = item; }
    });
    return nearest;
  }

  dots.forEach(function (dot) {
    dot.setAttribute('aria-pressed', 'false');
    dot.addEventListener('click', function (event) {
      event.stopPropagation();
      select(dot.dataset.item);
    });
  });

  stage.addEventListener('click', function (event) {
    if (event.target.closest('.tv-dot')) return;
    var rect = stage.getBoundingClientRect();
    var x = (event.clientX - rect.left) / rect.width * 100;
    var y = (event.clientY - rect.top) / rect.height * 100;
    var item = hit(x, y);
    if (item) {
      if (activeStep && item.step !== activeStep) filterStep(item.step);
      select(item.id);
    }
  });

  renderSteps();
  renderTerms();
  filterStep('');
})();
