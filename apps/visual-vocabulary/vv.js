/*
 * Visual Vocabulary 共用行为：听音找图（主题页）、场景视图（场景页）。
 *
 * 主题页自身的“点卡片出声”逻辑仍然写在各自页面里，这里只在进入听音找图
 * 时接管点击，离开后原样还回去。
 */

(function () {
  'use strict';

  var VOICE_KEY = 'vv-voice';
  var STYLE_KEY = 'vv-style';

  function storedStyle() {
    try {
      var v = localStorage.getItem(STYLE_KEY);
      if (v) return v;
    } catch (e) {}
    return null;
  }

  /* 画风：同一场景可能有 1–3 种画法，共用一套热点坐标。
     切换时换大图、换每件物件的轮廓遮罩、换主题页缩略图。 */
  function initStyles() {
    var btns = [].slice.call(document.querySelectorAll('[data-vv-style]'));
    if (!btns.length) return;
    var available = btns.map(function (b) { return b.dataset.vvStyle; });
    var stored = storedStyle();
    var style = available.indexOf(stored) >= 0 ? stored : available[0];

    function paint(s) {
      btns.forEach(function (b) {
        b.setAttribute('aria-pressed', b.dataset.vvStyle === s ? 'true' : 'false');
      });
    }

    function apply(s) {
      style = s;
      document.querySelectorAll('[data-src-' + s + ']').forEach(function (img) {
        var url = img.getAttribute('data-src-' + s);
        if (url && img.getAttribute('src') !== url) img.setAttribute('src', url);
      });
      document.querySelectorAll('[data-mask-' + s + ']').forEach(function (chip) {
        var mask = chip.getAttribute('data-mask-' + s);
        if (mask) chip.setAttribute('data-mask', mask);
      });
      document.querySelectorAll('[data-box-' + s + ']').forEach(function (chip) {
        chip.setAttribute('data-box', chip.getAttribute('data-box-' + s));
      });
      document.querySelectorAll('[data-xy-' + s + ']').forEach(function (chip) {
        var xy = chip.getAttribute('data-xy-' + s).split(',');
        chip.setAttribute('data-x', xy[0]);
        chip.setAttribute('data-y', xy[1]);
      });
      document.querySelectorAll('[data-pos-' + s + ']').forEach(function (dot) {
        var xy = dot.getAttribute('data-pos-' + s).split(',');
        dot.style.left = xy[0] + '%';
        dot.style.top = xy[1] + '%';
      });
      paint(s);
      try { localStorage.setItem(STYLE_KEY, s); } catch (e) {}
      document.dispatchEvent(new CustomEvent('vv-style', { detail: s }));
    }

    btns.forEach(function (b) {
      b.addEventListener('click', function () { apply(b.dataset.vvStyle); });
    });
    apply(style);
  }

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
    /* 借用别的词库（冰箱区借超市的食物词）：给一个音频根目录，按同样的
       <root>/<voice>/<slug>.mp3 规则拼。 */
    var root = card.getAttribute('data-audio-root');
    if (root) return root + '/' + voice + '/' + card.getAttribute('data-vv-word') + '.mp3';
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
    var dots = [].slice.call(root.querySelectorAll('.vv-dot'));
    var en = document.querySelector('[data-vv-en]');
    var zh = document.querySelector('[data-vv-zh]');
    var hint = document.querySelector('[data-vv-hint]');
    var replay = document.querySelector('[data-vv-replay]');
    var chips = [].slice.call(document.querySelectorAll('.vv-words [data-vv-word]'));
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

    /* 每个物件在页面上带一个范围框（data-box，百分比四边）。
       点进框里就算点中这件；框套框时取面积最小的那件，
       所以台面上的碗优先于台面本身。 */
    function boxOf(chip) {
      var raw = chip.getAttribute('data-box');
      if (!raw) return null;
      var v = raw.split(',').map(parseFloat);
      if (v.length !== 4 || !isFinite(v[0]) || !isFinite(v[1])
          || !isFinite(v[2]) || !isFinite(v[3])) return null;
      if (v[0] >= v[2] || v[1] >= v[3]) return null;
      return v;
    }

    /* state: '' 收起、'on' 悬停预览、'sel' 选中后常亮。
       每个物件自己的点放大，其余保持原样。 */
    /* 选中或悬停时只放大对应的白点，不再画范围框。 */
    function light(chip, state) {
      var live = !!chip && (state === 'on' || state === 'sel');
      dots.forEach(function (d) {
        d.classList.toggle('on', live && d.dataset.vvDot === chip.dataset.vvWord);
      });
    }

    /* 音频：空闲时把本页所有词先取回来，点的时候不再等网络。 */
    function warmAudio() {
      chips.forEach(function (c) {
        var url = audioUrl(c, voice);
        if (!url) return;
        var a = new Audio();
        a.preload = 'auto';
        a.src = url;
      });
    }
    if ('requestIdleCallback' in window) {
      requestIdleCallback(warmAudio, { timeout: 2500 });
    } else {
      window.setTimeout(warmAudio, 1200);
    }

    function select(chip) {
      current = chip;
      chips.forEach(function (c) {
        c.setAttribute('aria-pressed', c === chip ? 'true' : 'false');
      });
      light(chip, 'sel');
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

    /* 取点中的物件：先看落在哪个范围框里（取最小的），
       都不在框里再退回「最近点 + 14%」；空白处不响应。 */
    function pick(e) {
      var r = stage.getBoundingClientRect();
      if (!r.width) return null;
      var px = (e.clientX - r.left) / r.width * 100;
      var py = (e.clientY - r.top) / r.height * 100;

      var inBox = null;
      var inBoxArea = Infinity;
      chips.forEach(function (chip) {
        var b = boxOf(chip);
        if (!b) return;
        if (px < b[0] || px > b[2] || py < b[1] || py > b[3]) return;
        var area = (b[2] - b[0]) * (b[3] - b[1]);
        if (area < inBoxArea) { inBoxArea = area; inBox = chip; }
      });
      if (inBox) return inBox;

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
      return best && bestD <= REACH ? best : null;
    }

    if (stage) {
      stage.addEventListener('click', function (e) {
        var hit = pick(e);
        if (hit) select(hit);
      });

      /* 有鼠标的设备才做悬停预览：靠近哪件，哪件就亮。 */
      if (window.matchMedia && window.matchMedia('(hover: hover)').matches) {
        stage.addEventListener('pointermove', function (e) {
          var hit = pick(e);
          if (hit) light(hit, 'on');
          else light(current, current ? 'sel' : '');
        });
        stage.addEventListener('pointerleave', function () {
          light(current, current ? 'sel' : '');
        });
      }
    }

    if (replay) {
      replay.addEventListener('click', function () {
        if (current) speak(current);
      });
    }
  }

  /* 主题页的词卡：点一下出声，同时把这一张标出来。
     听音找图开启时由上面的捕获阶段接管，这里不会重复触发。 */
  function initCards() {
    var cards = [].slice.call(document.querySelectorAll('.card[data-slug]'));
    if (!cards.length) return;
    function play(card) {
      var voice = pressedVoice();
      var url = audioUrl(card, voice);
      if (url) {
        var audio = new Audio(url);
        audio.play().catch(function () {});
      }
      cards.forEach(function (c) { c.classList.toggle('playing', c === card); });
    }
    cards.forEach(function (card) {
      card.addEventListener('click', function () { play(card); });
      card.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        play(card);
      });
    });
    var btns = [].slice.call(document.querySelectorAll('[data-voice]'));
    if (btns.length) {
      function paint(v) {
        btns.forEach(function (b) {
          b.setAttribute('aria-pressed', b.dataset.voice === v ? 'true' : 'false');
        });
      }
      btns.forEach(function (b) {
        b.addEventListener('click', function () {
          var v = b.dataset.voice;
          try { localStorage.setItem(VOICE_KEY, v); } catch (e) {}
          paint(v);
        });
      });
      var saved = storedVoice();
      paint(saved || pressedVoice());
    }
  }

  /* 场景页和主题页的卡片视图：点一张放大看，再点一次出声。 */
  function initSceneCards() {
    var cards = [].slice.call(document.querySelectorAll('.vv-card'));
    if (!cards.length) return;
    cards.forEach(function (card) {
      card.addEventListener('click', function () {
        var url = audioUrl(card, pressedVoice());
        if (url) new Audio(url).play().catch(function () {});
        cards.forEach(function (c) { c.classList.toggle('on', c === card); });
      });
    });
  }

  function ready() {
    initStyles();
    var quizBtn = document.querySelector('[data-vv-quiz]');
    if (quizBtn) initQuiz(quizBtn);
    var scene = document.querySelector('[data-vv-scene]');
    if (scene) initScene(scene);
    initCards();
    initSceneCards();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }
})();
