/* A left-side reading dock with draggable progress and magnifying jump points. */
(function () {
  if (window.__npeslScrollProgress) return;
  window.__npeslScrollProgress = true;

  var reduce = false;
  try {
    reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {}

  function injectStyle() {
    if (document.getElementById('npesl-scroll-style')) return;
    var style = document.createElement('style');
    style.id = 'npesl-scroll-style';
    style.textContent = [
      '.sp-rail{position:fixed;left:8px;top:14vh;bottom:14vh;width:32px;z-index:60;',
      'touch-action:none;outline:none}',
      '.sp-track{position:absolute;left:15px;top:0;bottom:0;width:2px;',
      'border-radius:999px;background:var(--rule)}',
      '.sp-thumb{position:absolute;left:0;right:0;top:0;height:0;border-radius:999px;',
      'background:var(--accent);pointer-events:none;transition:height .14s ease-out}',
      '.sp-slider{position:absolute;inset:0;z-index:1;cursor:pointer;outline:none}',
      '.sp-slider{left:0;right:0;width:32px}',
      '.sp-slider:focus-visible::after{content:"";position:absolute;left:8px;top:var(--sp-pct,0%);',
      'width:16px;height:16px;border:2px solid var(--accent);border-radius:50%;',
      'background:var(--bg);transform:translateY(-50%)}',
      '.sp-dot{position:absolute;left:16px;top:0;width:16px;height:10px;padding:0;border:0;',
      'background:transparent;transform:translate(-50%,-50%) scaleX(var(--wave-x,1)) scaleY(var(--wave-scale,1));',
      'transform-origin:center;cursor:pointer;z-index:2;border-radius:999px;',
      'transition:transform .24s cubic-bezier(.2,.8,.2,1)}',
      '.sp-dot::before{content:"";position:absolute;left:50%;top:50%;width:4px;height:5px;',
      'transform:translate(-50%,-50%);border-radius:999px;background:var(--muted);',
      'opacity:var(--wave-opacity,.46);transition:background-color .18s ease,opacity .18s ease}',
      '.sp-rail:hover .sp-dot::before,.sp-slider:focus-visible~.sp-dot::before{opacity:.78}',
      '.sp-dot:hover::before,.sp-dot:focus-visible::before{background:var(--accent);opacity:1}',
      '.sp-dot:focus-visible{outline:2px solid var(--accent);outline-offset:1px}',
      '.sp-dot[aria-current="true"]::before{width:7px;height:7px;background:var(--accent);opacity:1}',
      '@media(prefers-reduced-motion:reduce){.sp-thumb,.sp-dot,.sp-dot::before{transition:none}}',
      '.sp-inline{display:inline-flex;align-items:center;gap:6px;margin-left:auto;',
      'max-width:100%;padding:3px 4px;border:0;background:transparent;',
      'color:var(--muted);font:inherit;font-size:12px;',
      'font-variant-numeric:tabular-nums;white-space:nowrap;',
      'overflow:hidden;text-overflow:ellipsis}',
      '.sp-inline b{font-weight:600;color:var(--accent)}',
      '.sp-inline span{overflow:hidden;text-overflow:ellipsis}',
      '.sp-right{display:flex;align-items:center;gap:8px;margin-left:auto}',
      '.sp-right .sp-inline{margin-left:0;padding:3px 4px}',
      '.sp-mobile .page{padding-left:56px!important}',
      '.sp-mobile .sp-rail{left:8px;top:12vh;bottom:12vh}',
      '.sp-mobile .sp-dot{transition:none}',
      '.sp-mobile .sp-dot:active{transform:translate(-50%,-50%) scale(1.2)}',
      '.sp-short .sp-rail,.sp-short .sp-inline{display:none}'
    ].join('');
    document.head.appendChild(style);
  }

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  ready(function () {
    injectStyle();

    var isIndex = !!document.getElementById('view');
    var scope = isIndex ? document.getElementById('view') : document.querySelector('.entries');
    var page = document.querySelector('.page');
    if (!scope || !page) return;

    var rail = document.createElement('div');
    rail.className = 'sp-rail';
    rail.setAttribute('role', 'group');
    rail.setAttribute('aria-label', '页面进度与主题导航');

    var track = document.createElement('div');
    track.className = 'sp-track';
    track.setAttribute('aria-hidden', 'true');
    var thumb = document.createElement('div');
    thumb.className = 'sp-thumb';
    track.appendChild(thumb);
    rail.appendChild(track);

    var slider = document.createElement('div');
    slider.className = 'sp-slider';
    slider.setAttribute('role', 'slider');
    slider.setAttribute('aria-orientation', 'vertical');
    slider.setAttribute('aria-label', '页面阅读进度');
    slider.setAttribute('aria-valuemin', '0');
    slider.setAttribute('aria-valuemax', '100');
    slider.tabIndex = 0;
    rail.appendChild(slider);

    /* Keep the readout in the existing controls, away from the reading column. */
    var inline = document.createElement('span');
    inline.className = 'sp-inline';
    inline.innerHTML = '<b>0%</b><span></span>';
    if (isIndex) {
      var topbar = document.querySelector('.topbar');
      var voice = topbar && topbar.querySelector('.voice-seg');
      if (topbar && voice) {
        var right = document.createElement('div');
        right.className = 'sp-right';
        topbar.insertBefore(right, voice);
        right.appendChild(voice);
        right.appendChild(inline);
      } else if (topbar) {
        topbar.appendChild(inline);
      }
    } else {
      var inlineHost = document.querySelector('.toolbar');
      if (inlineHost) inlineHost.appendChild(inline);
      else page.insertBefore(inline, page.firstChild);
    }

    document.body.appendChild(rail);

    var trackH = 1;
    var inlinePct = inline.querySelector('b');
    var inlinePos = inline.querySelector('span');
    var dots = [];
    var rows = [];
    var themeRows = [];
    var dragging = false;
    var pointerId = null;
    var pointerStartY = 0;
    var pointerDot = null;
    var suppressDotClickUntil = 0;
    var hoveredName = '';
    var focusedName = '';

    function clamp(n, min, max) {
      return Math.max(min, Math.min(max, n));
    }

    function docH() {
      return Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    }

    function viewH() {
      return window.innerHeight;
    }

    function maxScroll() {
      return Math.max(0, docH() - viewH());
    }

    function progress() {
      var max = maxScroll();
      return max ? clamp(window.scrollY / max, 0, 1) : 0;
    }

    function visible(el) {
      return !!el && el.offsetParent !== null && el.style.display !== 'none';
    }

    function themeName(el) {
      var first = el.firstChild;
      var text = first && first.nodeType === 3 ? first.textContent : el.textContent;
      return (text || '').replace(/\s+/g, ' ').trim();
    }

    function lastAtOrAbove(list, y) {
      var lo = 0, hi = list.length - 1, ans = 0;
      while (lo <= hi) {
        var mid = (lo + hi) >> 1;
        if (list[mid].getBoundingClientRect().top <= y) {
          ans = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      return ans;
    }

    function cacheRows() {
      var selector = isIndex ? '.prow' : '.entry';
      rows = Array.prototype.slice.call(scope.querySelectorAll(selector)).filter(visible);
      themeRows = isIndex
        ? Array.prototype.slice.call(scope.querySelectorAll('.theme')).filter(visible)
        : [];
    }

    function currentChapter() {
      if (!rows.length) return { name: '' };
      var index = lastAtOrAbove(rows, 150);
      var head = rows[index].querySelector('.entry-head .w');
      return { index: index, name: head ? head.textContent.trim() : '' };
    }

    function currentTheme() {
      if (!themeRows.length) return { index: 0, name: '短语搭配' };
      var index = lastAtOrAbove(themeRows, 150);
      return { index: index, name: themeName(themeRows[index]) || '短语搭配' };
    }

    function position() {
      var mobile = window.innerWidth < 860;
      document.documentElement.classList.toggle('sp-mobile', mobile);
      var pageRect = page.getBoundingClientRect();
      var left = mobile ? 8 : pageRect.left - 40;
      rail.style.left = Math.max(8, left) + 'px';
    }

    function update() {
      var p = progress();
      thumb.style.height = Math.round(p * trackH) + 'px';
      var pct = Math.round(p * 100);
      var info;
      if (isIndex) {
        var theme = currentTheme();
        info = theme;
      } else {
        info = currentChapter();
      }
      var label = pct + '%' + (info.name ? ' · ' + info.name : '');
      inlinePct.textContent = pct + '%';
      var previewName = focusedName || hoveredName;
      inlinePos.textContent = previewName
        ? '· 将跳到 ' + previewName
        : (info.name ? '· ' + info.name : '');
      inline.title = previewName ? '将跳到 ' + previewName : label;
      slider.setAttribute('aria-valuenow', String(pct));
      slider.setAttribute('aria-valuetext', label);
      slider.style.setProperty('--sp-pct', pct + '%');
      for (var i = 0; i < dots.length; i++) {
        dots[i].setAttribute('aria-current',
          i === info.index ? 'true' : 'false');
      }
    }

    function rebuildDots() {
      for (var i = 0; i < dots.length; i++) {
        if (dots[i].parentNode) dots[i].parentNode.removeChild(dots[i]);
      }
      dots = [];
      var targets = isIndex ? themeRows : rows;
      if (targets.length < 2) return;
      var max = maxScroll();
      if (!max) return;
      targets.forEach(function (target) {
        var top = target.getBoundingClientRect().top + window.scrollY - 74;
        var p = clamp(top / max, 0, 1);
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'sp-dot';
        dot.style.top = Math.round(p * trackH) + 'px';
        var head = isIndex
          ? target
          : target.querySelector('.entry-head .w');
        var name = isIndex ? themeName(target) : (head ? head.textContent.trim() : '');
        dot.setAttribute('aria-label', '跳到 ' + name);
        dot.addEventListener('pointerenter', function () {
          hoveredName = name;
          update();
        });
        dot.addEventListener('pointerleave', function () {
          hoveredName = '';
          update();
        });
        dot.addEventListener('focus', function () {
          focusedName = name;
          update();
        });
        dot.addEventListener('blur', function () {
          focusedName = '';
          update();
        });
        dot.addEventListener('click', function (e) {
          if (Date.now() < suppressDotClickUntil) {
            suppressDotClickUntil = 0;
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          var y = target.getBoundingClientRect().top + window.scrollY - 74;
          window.scrollTo({ top: Math.max(0, y), behavior: reduce ? 'auto' : 'smooth' });
        });
        rail.appendChild(dot);
        dots.push(dot);
      });
    }

    function updateWave(clientY) {
      if (reduce || window.innerWidth < 860) return;
      for (var i = 0; i < dots.length; i++) {
        var center = dots[i].getBoundingClientRect().top + dots[i].offsetHeight / 2;
        var distance = Math.abs(clientY - center);
        var wave = Math.exp(-(distance * distance) / (2 * 30 * 30));
        dots[i].style.setProperty('--wave-scale', String(1 + wave * 2.2));
        dots[i].style.setProperty('--wave-x', String(1 + wave * 0.35));
        dots[i].style.setProperty('--wave-opacity', String(0.46 + wave * 0.54));
      }
    }

    function resetWave() {
      for (var i = 0; i < dots.length; i++) {
        dots[i].style.removeProperty('--wave-scale');
        dots[i].style.removeProperty('--wave-x');
        dots[i].style.removeProperty('--wave-opacity');
      }
    }

    rail.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'touch') updateWave(e.clientY);
      if (pointerId !== e.pointerId) return;
      if (!dragging && Math.abs(e.clientY - pointerStartY) > 6) dragging = true;
      if (dragging) {
        moveTo(e.clientY);
        e.preventDefault();
      }
    });
    rail.addEventListener('pointerleave', resetWave);
    rail.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      pointerId = e.pointerId;
      pointerStartY = e.clientY;
      pointerDot = e.target.closest && e.target.closest('.sp-dot');
      dragging = !pointerDot;
      var capture = pointerDot || slider;
      if (capture.setPointerCapture) {
        try { capture.setPointerCapture(e.pointerId); } catch (err) {}
      }
      if (dragging) {
        moveTo(e.clientY);
        e.preventDefault();
      }
    });
    rail.addEventListener('pointerup', function (e) {
      if (pointerId !== e.pointerId) return;
      if (dragging && pointerDot) suppressDotClickUntil = Date.now() + 400;
      dragging = false;
      pointerDot = null;
      pointerId = null;
    });
    rail.addEventListener('pointercancel', function () {
      dragging = false;
      pointerDot = null;
      pointerId = null;
    });

    function layout() {
      position();
      trackH = Math.max(1, rail.clientHeight);
      document.documentElement.classList.toggle('sp-short', maxScroll() < 40);
      cacheRows();
      rebuildDots();
      update();
    }

    function scrollToProgress(p) {
      window.scrollTo(0, clamp(p, 0, 1) * maxScroll());
      update();
    }

    function moveTo(clientY) {
      var rect = slider.getBoundingClientRect();
      scrollToProgress(rect.height ? (clientY - rect.top) / rect.height : 0);
    }

    slider.addEventListener('keydown', function (e) {
      var step = Math.round(viewH() * 0.8);
      if (e.key === 'ArrowDown') window.scrollBy(0, 80);
      else if (e.key === 'ArrowUp') window.scrollBy(0, -80);
      else if (e.key === 'PageDown') window.scrollBy(0, step);
      else if (e.key === 'PageUp') window.scrollBy(0, -step);
      else if (e.key === 'Home') window.scrollTo(0, 0);
      else if (e.key === 'End') window.scrollTo(0, maxScroll());
      else return;
      e.preventDefault();
    });

    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        update();
      });
    }, { passive: true });

    window.addEventListener('resize', layout);

    if (window.ResizeObserver) {
      try { new ResizeObserver(layout).observe(document.body); } catch (e) {}
    }

    if (window.MutationObserver) {
      var timer = 0;
      var observer = new MutationObserver(function () {
        clearTimeout(timer);
        timer = setTimeout(layout, 80);
      });
      observer.observe(scope, { childList: true, subtree: true, attributes: true });
    }

    if (document.fonts && document.fonts.ready) {
      try { document.fonts.ready.then(layout).catch(function () {}); } catch (e) {}
    }
    layout();
  });
})();
