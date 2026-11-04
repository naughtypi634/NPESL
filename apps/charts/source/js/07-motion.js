(function (NC) {
  'use strict';

  var motion = NC.motion = {};

  motion.reduced = function () {
    return !!(NC.state && NC.state.reducedMotion);
  };

  function cancel(lab) {
    if (!lab.motionAnimations) return;
    lab.motionAnimations.forEach(function (animation) {
      try { animation.cancel(); } catch (err) {}
    });
    lab.motionAnimations = [];
  }

  function labelNodes(labels) {
    if (!labels) return [];
    if (Array.isArray(labels)) return labels;
    return Object.keys(labels).map(function (key) { return labels[key]; });
  }

  function reset(lab) {
    if (!lab || !lab.motion) return;
    var m = lab.motion;
    if (m.line) {
      m.line.style.strokeDasharray = '';
      m.line.style.strokeDashoffset = '';
    }
    (m.bars || []).forEach(function (bar) {
      bar.style.transform = '';
      bar.style.transformBox = '';
      bar.style.transformOrigin = '';
    });
    (m.ghosts || []).forEach(function (node) { node.style.opacity = ''; });
    (m.rules || []).forEach(function (node) { node.style.opacity = ''; });
    (m.slices || []).forEach(function (node) { node.style.opacity = ''; });
    (m.dots || []).forEach(function (node) { node.style.opacity = ''; });
    labelNodes(m.labels).forEach(function (node) { if (node) node.style.opacity = ''; });
  }

  function keep(lab, animation) {
    lab.motionAnimations = lab.motionAnimations || [];
    lab.motionAnimations.push(animation);
  }

  motion.play = function (lab) {
    if (!lab || !lab.motion || !lab.svg) return;
    cancel(lab);
    reset(lab);
    if (motion.reduced()) return;
    var m = lab.motion;
    var kind = lab.type.renderer;
    var ease = 'cubic-bezier(.25, 1, .5, 1)';

    if (m.line) {
      var length = 0;
      try { length = m.line.getTotalLength(); } catch (err) { length = 0; }
      if (length) {
        m.line.style.strokeDasharray = String(length);
        m.line.style.strokeDashoffset = String(length);
        var draw = m.line.animate(
          [{ strokeDashoffset: length }, { strokeDashoffset: 0 }],
          { duration: 900, easing: ease, fill: 'both' }
        );
        keep(lab, draw);
        draw.finished.then(function () {
          m.line.style.strokeDasharray = '';
          m.line.style.strokeDashoffset = '';
        }).catch(function () {});
      }
    }

    (m.dots || []).forEach(function (node, index) {
      node.style.opacity = '0';
      var anim = node.animate(
        [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)' }],
        { duration: 320, delay: 260 + index * 12, easing: ease, fill: 'both' }
      );
      keep(lab, anim);
      anim.finished.then(function () { node.style.opacity = ''; }).catch(function () {});
    });

    (m.bars || []).forEach(function (bar, index) {
      var horizontal = !!(lab.barState && lab.barState.direction === 'horizontal');
      bar.style.transformBox = 'fill-box';
      bar.style.transformOrigin = horizontal ? 'left center' : 'center bottom';
      var anim = bar.animate(
        [{ transform: horizontal ? 'scaleX(0)' : 'scaleY(0)' }, { transform: 'scale(1)' }],
        { duration: 620, delay: index * 55, easing: ease, fill: 'both' }
      );
      keep(lab, anim);
      anim.finished.then(function () {
        bar.style.transform = '';
        bar.style.transformBox = '';
        bar.style.transformOrigin = '';
      }).catch(function () {});
    });

    [].concat(m.ghosts || [], m.rules || []).forEach(function (node, index) {
      node.style.opacity = '0';
      var anim = node.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        { duration: 420, delay: index * 40, easing: 'ease-out', fill: 'both' }
      );
      keep(lab, anim);
      anim.finished.then(function () { node.style.opacity = ''; }).catch(function () {});
    });

    (m.slices || []).forEach(function (node, index) {
      node.style.opacity = '0';
      var anim = node.animate(
        [{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'scale(1)' }],
        { duration: 520, delay: index * 60, easing: ease, fill: 'both' }
      );
      keep(lab, anim);
      anim.finished.then(function () { node.style.opacity = ''; }).catch(function () {});
    });

    labelNodes(m.labels).forEach(function (node, index) {
      if (!node) return;
      node.style.opacity = '0';
      var anim = node.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        { duration: 320, delay: 260 + index * 25, easing: 'ease-out', fill: 'both' }
      );
      keep(lab, anim);
      anim.finished.then(function () { node.style.opacity = ''; }).catch(function () {});
    });
  };

  motion.revealPanel = function () {};
})(window.NPESLCharts);
