/*
 * Visual Vocabulary 共用行为：听音找图（主题页）、场景视图（场景页）。
 *
 * 主题页自身的“点卡片出声”逻辑仍然写在各自页面里，这里只在进入听音找图
 * 时接管点击，离开后原样还回去。
 */

(function () {
  'use strict';

  var VOICE_KEY = 'vv-voice';

  function pressedVoice() {
    var btn = document.querySelector('[data-voice][aria-pressed="true"]');
    return btn ? btn.dataset.voice : 'h2';
  }

  function storedVoice() {
    try {
      var v = localStorage.getItem(VOICE_KEY);
      if (v === 'h2' || v === 'c') return v;
    } catch (e) {}
    return null;
  }

  /* 路径规则和主题页一致：有分音色的用 audio/<voice>/<slug>.mp3，
     只有单音源的用 audio/<slug>.mp3。 */
  function audioUrl(card, voice) {
    var slug = card.getAttribute('data-audio-' + voice);
    if (slug) return 'audio/' + voice + '/' + slug + '.mp3';
    slug = card.getAttribute('data-audio');
    if (slug) return 'audio/' + slug + '.mp3';
    return null;
  }

  /* ---- 听音找图 ------------------------------------------------------ */

  function initQuiz(btn) {
    var QUIZ_LEN = 10;
    var status = document.querySelector('[data-vv-status]');
    var label = btn.querySelector('.vv-label');
    var cards = [].slice.call(document.querySelectorAll('.card'));
    var queue = [];
    var index = 0;
    var target = null;
    var on = false;
    var locked = false;
    var timer = 0;
    var audio = null;

    function play(card, delay) {
      var url = audioUrl(card, pressedVoice());
      if (!url) return;
      window.setTimeout(function () {
        if (!on) return;
        if (audio) audio.pause();
        audio = new Audio(url);
        audio.play().catch(function () {});
      }, delay || 0);
    }

    function setLabel(text) {
      if (label) label.textContent = text;
    }

    function ask() {
      target = queue[index];
      locked = false;
      if (status) status.textContent = (index + 1) + ' / ' + queue.length;
      play(target, 320);
    }

    function answer(card) {
      if (!on || locked) return;
      if (card === target) {
        locked = true;
        card.classList.add('vv-ok');
        timer = window.setTimeout(function () {
          card.classList.remove('vv-ok');
          index += 1;
          if (index >= queue.length) {
            stop();
            setLabel('再来一局');
          } else {
            ask();
          }
        }, 620);
        return;
      }
      card.classList.add('vv-bad');
      window.setTimeout(function () { card.classList.remove('vv-bad'); }, 420);
      play(target, 420);
    }

    function start() {
      var pool = cards.filter(function (card) {
        return audioUrl(card, pressedVoice()) !== null;
      });
      for (var i = pool.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
      }
      queue = pool.slice(0, QUIZ_LEN);
      if (!queue.length) return;
      index = 0;
      on = true;
      document.body.classList.add('vv-quizzing');
      btn.setAttribute('aria-pressed', 'true');
      if (status) status.hidden = false;
      setLabel('结束');
      ask();
    }

    function stop() {
      on = false;
      locked = false;
      target = null;
      window.clearTimeout(timer);
      if (audio) { audio.pause(); audio = null; }
      document.body.classList.remove('vv-quizzing');
      btn.setAttribute('aria-pressed', 'false');
      if (status) {
        status.hidden = true;
        status.textContent = '';
      }
      setLabel('听音找图');
    }

    btn.addEventListener('click', function () {
      if (on) stop(); else start();
    });

    /* 捕获阶段接管，主题页自己的“点卡片出声”不会跟着一起触发。 */
    document.addEventListener('click', function (e) {
      if (!on) return;
      var card = e.target.closest('.card');
      if (!card) return;
      e.preventDefault();
      e.stopPropagation();
      answer(card);
    }, true);

    document.addEventListener('keydown', function (e) {
      if (!on) return;
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var card = e.target.closest('.card');
      if (!card) return;
      e.preventDefault();
      e.stopPropagation();
      answer(card);
    }, true);
  }

  /* ---- 场景视图 ------------------------------------------------------ */

  /* 场景页：每个词在图上有一个人工标好的中心点（data-x / data-y，百分比）。
     点图任意位置时取最近的点，距离太远就当没点中，墙面、窗子这些空白处不会乱出词。 */
  function initScene(root) {
    var stage = root.querySelector('.vv-stage');
    var mark = root.querySelector('[data-vv-mark]');
    var en = document.querySelector('[data-vv-en]');
    var zh = document.querySelector('[data-vv-zh]');
    var hint = document.querySelector('[data-vv-hint]');
    var replay = document.querySelector('[data-vv-replay]');
    var chips = [].slice.call(document.querySelectorAll('[data-vv-word]'));
    var voiceBtns = [].slice.call(document.querySelectorAll('[data-voice]'));
    var voice = pressedVoice();
    var stored = storedVoice();
    if (stored) voice = stored;
    var audio = null;
    var current = null;
    var REACH = 14; /* 命中半径，按画面宽度的百分比算 */

    function paintVoice() {
      voiceBtns.forEach(function (b) {
        b.setAttribute('aria-pressed', b.dataset.voice === voice ? 'true' : 'false');
      });
    }

    function speak(chip) {
      var url = audioUrl(chip, voice);
      if (audio) audio.pause();
      if (!url) return;
      audio = new Audio(url);
      audio.play().catch(function () {});
    }

    function point(chip) {
      return { x: parseFloat(chip.dataset.x), y: parseFloat(chip.dataset.y) };
    }

    function select(chip) {
      current = chip;
      chips.forEach(function (c) {
        c.setAttribute('aria-pressed', c === chip ? 'true' : 'false');
      });
      var p = point(chip);
      if (mark && isFinite(p.x) && isFinite(p.y)) {
        mark.style.left = p.x + '%';
        mark.style.top = p.y + '%';
        mark.classList.add('on');
      }
      if (en) { en.textContent = chip.dataset.en || chip.textContent; en.hidden = false; }
      if (zh) { zh.textContent = chip.dataset.zh || ''; zh.hidden = false; }
      if (hint) hint.hidden = true;
      if (replay) replay.hidden = false;
      speak(chip);
    }

    voiceBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        voice = b.dataset.voice;
        try { localStorage.setItem(VOICE_KEY, voice); } catch (e) {}
        paintVoice();
      });
    });
    paintVoice();

    chips.forEach(function (chip) {
      chip.addEventListener('click', function () { select(chip); });
    });

    if (stage) {
      stage.addEventListener('click', function (e) {
        var r = stage.getBoundingClientRect();
        if (!r.width) return;
        var px = (e.clientX - r.left) / r.width * 100;
        var py = (e.clientY - r.top) / r.height * 100;
        var aspect = r.height / r.width;
        var best = null;
        var bestD = Infinity;
        chips.forEach(function (chip) {
          var p = point(chip);
          if (!isFinite(p.x) || !isFinite(p.y)) return;
          var dx = p.x - px;
          var dy = (p.y - py) * aspect;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < bestD) { bestD = d; best = chip; }
        });
        if (best && bestD <= REACH) select(best);
      });
    }

    if (replay) {
      replay.addEventListener('click', function () {
        if (current) speak(current);
      });
    }
  }

  function ready() {
    var quizBtn = document.querySelector('[data-vv-quiz]');
    if (quizBtn) initQuiz(quizBtn);
    var scene = document.querySelector('[data-vv-scene]');
    if (scene) initScene(scene);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }
})();
