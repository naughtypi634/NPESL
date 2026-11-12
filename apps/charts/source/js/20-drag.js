(function (NC) {
  'use strict';

  var drag = NC.drag = {};

  function clampAxis(value, min, max) {
    return NC.clamp(value, min, max);
  }

  function snapAxis(value, step) {
    return NC.scale.snap(value, step);
  }

  function updateAria(handle, opts, value) {
    var text = opts.valueText ? opts.valueText(value) : String(value);
    if (opts.axis === 'xy') {
      handle.setAttribute('aria-valuetext', text);
    } else {
      handle.setAttribute('aria-valuenow', value);
      handle.setAttribute('aria-valuetext', text);
    }
  }

  drag.bind = function (handle, opts) {
    var axis = opts.axis || 'y';
    // idle -> pressed (pointer down) -> dragging (past the 4px threshold).
    // A tap goes pressed -> idle without committing; cancel restores the
    // snapshot. The phase is mirrored to data-phase for tests and agents.
    var phase = NC.phase({
      name: 'drag',
      initial: 'idle',
      transitions: {
        idle: ['pressed'],
        pressed: ['dragging', 'idle'],
        dragging: ['idle']
      },
      onChange: function (next) { handle.setAttribute('data-phase', next); }
    });
    handle.setAttribute('data-phase', 'idle');
    var active = null;
    var snapshot = null;
    var startX = 0;
    var startY = 0;
    var pointerId = null;
    var frame = null;
    var pending = null;

    function valueNow() {
      return opts.get();
    }

    function normalize(raw) {
      if (axis === 'xy') {
        return {
          x: snapAxis(clampAxis(raw.x, opts.xMin, opts.xMax), opts.step),
          y: snapAxis(clampAxis(raw.y, opts.yMin, opts.yMax), opts.step)
        };
      }
      return snapAxis(clampAxis(raw, opts.min, opts.max), opts.step);
    }

    function schedule(value) {
      pending = value;
      if (frame != null) return;
      frame = requestAnimationFrame(function () {
        frame = null;
        if (pending == null) return;
        var v = pending;
        pending = null;
        opts.set(v);
        updateAria(handle, opts, v);
        if (opts.onUpdate) opts.onUpdate(v);
      });
    }

    function cancelFrame() {
      if (frame != null) cancelAnimationFrame(frame);
      frame = null;
      pending = null;
    }

    function onPointerUp(event) { finish(event, false); }
    function onPointerCancel(event) { finish(event, true); }

    // While a gesture is in flight the window owns pointermove / up / cancel.
    // This is the same listener set whether pointer capture is available or
    // not, so a lost capture cannot strand the machine in dragging.
    function listen() {
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerCancel);
    }

    function unlisten() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
    }

    function start(event) {
      if (!phase.is('idle')) return;
      if (event.button != null && event.button !== 0) return;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      active = valueNow();
      snapshot = axis === 'xy' ? { x: active.x, y: active.y } : active;
      if (!phase.set('pressed')) return;
      try { handle.setPointerCapture(pointerId); } catch (err) {}
      listen();
      handle.classList.add('dragging');
      if (opts.onStart) opts.onStart(event);
      event.preventDefault();
    }

    function move(event) {
      if (phase.is('idle') || event.pointerId !== pointerId) return;
      var dx = event.clientX - startX;
      var dy = event.clientY - startY;
      if (phase.is('pressed') && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      phase.set('dragging');
      if (axis === 'xy') {
        var unitsX = (opts.xMax - opts.xMin) / (opts.pixelWidth || 560);
        var unitsY = (opts.yMax - opts.yMin) / (opts.pixelHeight || 260);
        schedule(normalize({
          x: active.x + dx * unitsX,
          y: active.y - dy * unitsY
        }));
      } else if (axis === 'x') {
        var units = (opts.max - opts.min) / (opts.pixelSpan || 520);
        schedule(normalize(active + dx * units));
      } else {
        var unitsYOnly = (opts.max - opts.min) / (opts.pixelSpan || 260);
        schedule(normalize(active - dy * unitsYOnly));
      }
      event.preventDefault();
    }

    function finish(event, canceled) {
      if (phase.is('idle') || (event && event.pointerId !== pointerId)) return;
      unlisten();
      var didMove = phase.is('dragging');
      if (pending != null) {
        var last = pending;
        pending = null;
        if (!canceled) {
          opts.set(last);
          updateAria(handle, opts, last);
        }
      }
      cancelFrame();
      if (canceled) {
        opts.set(snapshot);
        updateAria(handle, opts, snapshot);
        if (opts.onUpdate) opts.onUpdate(snapshot);
      } else if (didMove) {
        updateAria(handle, opts, valueNow());
        if (opts.onCommit) opts.onCommit(valueNow());
        if (opts.focusOnCommit) {
          try { handle.focus({ preventScroll: true }); } catch (err) { handle.focus(); }
        }
      } else {
        opts.set(snapshot);
        updateAria(handle, opts, snapshot);
        if (opts.onUpdate) opts.onUpdate(snapshot);
      }
      if (opts.onEnd) opts.onEnd(canceled);
      try { handle.releasePointerCapture(pointerId); } catch (err) {}
      pointerId = null;
      active = null;
      phase.set('idle');
      handle.classList.remove('dragging');
    }

    handle.addEventListener('pointerdown', start);
    handle.addEventListener('lostpointercapture', function (event) {
      if (pointerId != null) finish(event, true);
    });

    handle.addEventListener('focus', function () {
      snapshot = axis === 'xy' ? { x: opts.get().x, y: opts.get().y } : opts.get();
      if (axis === 'xy') {
        handle.setAttribute('aria-valuetext', opts.valueText ? opts.valueText(opts.get()) : '');
      }
    });

    handle.addEventListener('keydown', function (event) {
      var step = opts.step || 1;
      var big = event.shiftKey ? step * 5 : step;
      var current = opts.get();
      var changed = false;

      if (event.key === 'Escape') {
        if (snapshot != null) {
          opts.set(snapshot);
          updateAria(handle, opts, snapshot);
          if (opts.onUpdate) opts.onUpdate(snapshot);
          if (opts.onCommit) opts.onCommit(snapshot);
        }
        event.preventDefault();
        return;
      }

      if (axis === 'xy') {
        var x = current.x;
        var y = current.y;
        if (event.key === 'ArrowLeft') { x -= big; changed = true; }
        else if (event.key === 'ArrowRight') { x += big; changed = true; }
        else if (event.key === 'ArrowUp') { y += big; changed = true; }
        else if (event.key === 'ArrowDown') { y -= big; changed = true; }
        else if (event.key === 'Home') { x = opts.xMin; changed = true; }
        else if (event.key === 'End') { x = opts.xMax; changed = true; }
        if (!changed) return;
        var nextXY = normalize({ x: x, y: y });
        opts.set(nextXY);
        updateAria(handle, opts, nextXY);
        if (opts.onUpdate) opts.onUpdate(nextXY);
        if (opts.onCommit) opts.onCommit(nextXY);
        event.preventDefault();
        return;
      }

      var next = current;
      if (event.key === 'ArrowUp' || event.key === 'ArrowRight') next += big;
      else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') next -= big;
      else if (event.key === 'PageUp') next += step * 10;
      else if (event.key === 'PageDown') next -= step * 10;
      else if (event.key === 'Home') next = opts.min;
      else if (event.key === 'End') next = opts.max;
      else return;

      next = normalize(next);
      opts.set(next);
      updateAria(handle, opts, next);
      if (opts.onUpdate) opts.onUpdate(next);
      if (opts.onCommit) opts.onCommit(next);
      event.preventDefault();
    });

    updateAria(handle, opts, valueNow());
    return {
      update: function () {
        updateAria(handle, opts, valueNow());
      }
    };
  };
})(window.NPESLCharts);
