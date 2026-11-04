(function (NC) {
  'use strict';

  function hostRect(lab) {
    return lab.plot.getBoundingClientRect();
  }

  function toPixels(root, plot, x, y) {
    var rect = root.getBoundingClientRect();
    var host = plot.getBoundingClientRect();
    var box = root.viewBox && root.viewBox.baseVal;
    if (!box || !box.width || !box.height) {
      return { x: host.width / 2, y: 40 };
    }
    return {
      x: (rect.left - host.left) + (x / box.width) * rect.width,
      y: (rect.top - host.top) + (y / box.height) * rect.height
    };
  }

  function close(lab) {
    if (!lab) return;
    if (lab.editorOutside) {
      document.removeEventListener('pointerdown', lab.editorOutside);
      lab.editorOutside = null;
    }
    if (lab.editor) {
      if (lab.editor.parentNode) lab.editor.parentNode.removeChild(lab.editor);
      lab.editor = null;
    }
  }

  NC.editValue = function (lab, opts) {
    if (!lab || !lab.plot || !opts) return;
    close(lab);

    var point = toPixels(opts.root, lab.plot, opts.x, opts.y);
    var width = lab.plot.getBoundingClientRect().width;
    var editor = document.createElement('div');
    editor.className = 'value-editor';
    editor.setAttribute('role', 'dialog');
    editor.setAttribute('aria-label', opts.label || '输入数值');

    var label = document.createElement('span');
    label.className = 'value-editor-label';
    label.textContent = opts.label || '';

    var row = document.createElement('div');
    row.className = 'value-editor-row';

    var input = document.createElement('input');
    input.type = 'number';
    input.inputMode = 'decimal';
    input.className = 'value-editor-input';
    input.value = String(opts.value);
    if (opts.min != null) input.min = String(opts.min);
    if (opts.max != null) input.max = String(opts.max);
    input.step = String(opts.step || 1);
    input.setAttribute('aria-label', opts.label || '数值');

    var unit = document.createElement('span');
    unit.className = 'value-editor-unit';
    unit.textContent = opts.unit === '%' ? '%' : '';

    var ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'value-editor-ok';
    ok.textContent = '确定';

    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'value-editor-cancel';
    cancel.textContent = '取消';

    row.appendChild(input);
    if (unit.textContent) row.appendChild(unit);
    row.appendChild(ok);
    row.appendChild(cancel);
    editor.appendChild(label);
    editor.appendChild(row);
    lab.plot.appendChild(editor);

    var left = Math.max(96, Math.min(width - 96, point.x));
    var above = point.y > 110;
    editor.style.left = left + 'px';
    editor.style.top = point.y + 'px';
    editor.style.transform = above ? 'translate(-50%, calc(-100% - 12px))' : 'translate(-50%, 16px)';
    lab.editor = editor;

    function commit() {
      var raw = Number(input.value);
      if (!isFinite(raw)) {
        input.focus();
        return;
      }
      var min = opts.min == null ? -Infinity : opts.min;
      var max = opts.max == null ? Infinity : opts.max;
      var value = Math.max(min, Math.min(max, raw));
      if (opts.step) value = NC.scale.snap(value, opts.step);
      value = Math.max(min, Math.min(max, value));
      opts.set(value);
      close(lab);
      if (opts.onCommit) opts.onCommit(value);
    }

    ok.addEventListener('click', commit);
    cancel.addEventListener('click', function () { close(lab); });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        close(lab);
      }
    });

    setTimeout(function () {
      input.focus();
      input.select();
      var outside = function (event) {
        if (!lab.editor || lab.editor.contains(event.target)) return;
        close(lab);
      };
      lab.editorOutside = outside;
      document.addEventListener('pointerdown', outside);
    }, 0);
  };

  // A click on a draggable mark opens the numeric editor; a drag does not.
  NC.bindValueClick = function (target, lab, makeOptions) {
    if (!target) return;
    var startX = 0;
    var startY = 0;
    var down = false;
    target.addEventListener('pointerdown', function (event) {
      if (event.button != null && event.button !== 0) return;
      startX = event.clientX;
      startY = event.clientY;
      down = true;
    });
    target.addEventListener('pointerup', function (event) {
      if (!down) return;
      down = false;
      if (Math.abs(event.clientX - startX) > 4 || Math.abs(event.clientY - startY) > 4) return;
      NC.editValue(lab, makeOptions());
    });
    target.addEventListener('pointercancel', function () { down = false; });
    target.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        NC.editValue(lab, makeOptions());
      }
    });
  };
})(window.NPESLCharts);
