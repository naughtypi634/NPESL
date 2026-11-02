/* A top-edge reading progress line with section jump points for collocation pages. */
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
      '.sp-rail{position:fixed;left:0;right:0;top:0;height:26px;z-index:60;',
      'touch-action:none;outline:none}',
      '.sp-track{position:absolute;left:0;right:0;top:0;height:2px;background:var(--rule)}',
      '.sp-thumb{position:absolute;left:0;top:0;width:0;height:2px;border-radius:0 999px 999px 0;',
      'background:var(--accent);z-index:2;pointer-events:none;transition:width .1s linear}',
      '@media(prefers-reduced-motion:reduce){.sp-thumb{transition:none}}',
      '.sp-slider{position:absolute;inset:0;z-index:1;cursor:pointer;outline:none}',
      '.sp-slider:focus-visible::after{content:"";position:absolute;left:0;right:0;top:0;height:2px;',
      'box-shadow:0 0 0 2px var(--bg),0 0 0 4px var(--accent)}',
      '.sp-dot{position:absolute;left:0;top:0;width:24px;height:24px;padding:0;border:0;',
      'background:transparent;transform:translateX(-50%);cursor:pointer;z-index:2;border-radius:50%}',
      '.sp-dot::before{content:"";position:absolute;left:50%;top:2px;width:4px;height:4px;',
      'transform:translateX(-50%);border-radius:999px;background:var(--muted);opacity:.4;',
      'transition:background-color .12s ease,opacity .12s ease,width .12s ease,height .12s ease}',
      '.sp-rail:hover .sp-dot::before,.sp-slider:focus-visible~.sp-dot::before{opacity:.75}',
      '.sp-dot:hover::before,.sp-dot:focus-visible::before{background:var(--accent);opacity:1}',
      '.sp-dot:focus-visible{outline:none}',
      '.sp-dot[aria-current="true"]::before{width:7px;height:7px;top:1px;background:var(--accent);opacity:1}',
      '.sp-tip{position:fixed;z-index:61;max-width:240px;padding:6px 12px;border:1px solid var(--rule);',
      'border-radius:999px;background:var(--surface-strong,var(--surface));color:var(--fg);',
      'font:inherit;font-size:13px;line-height:1.3;white-space:nowrap;overflow:hidden;',
      'text-overflow:ellipsis;pointer-events:none;opacity:0;transform:translateY(3px);',
      'transition:opacity .12s ease,transform .12s ease;box-shadow:0 8px 24px rgba(0,0,0,.14);',
      'backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}',
      '.sp-tip[data-show="true"]{opacity:1;transform:translateY(0)}',
      '.sp-inline{display:inline-flex;align-items:center;gap:6px;margin-left:auto;',
      'max-width:100%;padding:3px 4px;border:0;background:transparent;',
      'color:var(--muted);font:inherit;font-size:12px;',
      'font-variant-numeric:tabular-nums;white-space:nowrap;',
      'overflow:hidden;text-overflow:ellipsis}',
      '.sp-inline b{font-weight:600;color:var(--accent)}',
      '.sp-inline span{overflow:hidden;text-overflow:ellipsis}',
      '.sp-right{display:flex;align-items:center;gap:8px;margin-left:auto}',
      '.sp-right .sp-inline{margin-left:0;padding:3px 4px}',
      '.sp-mobile .sp-dot,.sp-mobile .sp-tip{display:none}',
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
    slider.setAttribute('aria-orientation', 'horizontal');
    slider.setAttribute('aria-label', '页面阅读进度');
    slider.setAttribute('aria-valuemin', '0');
    slider.setAttribute('aria-valuemax', '100');
    slider.tabIndex = 0;
    rail.appendChild(slider);

    var tip = document.createElement('div');
    tip.className = 'sp-tip';

    /* 读数就放在页面上已有的工具栏里（章节页）或索引页右上那组控件里，
       和筛选、音色一样是一枚胶囊，不再悬浮压住正文。 */
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
    document.body.appendChild(tip);

    var trackW = 1;
    var inlinePct = inline.querySelector('b');
    var inlinePos = inline.querySelector('span');
    var dots = [];
    var rows = [];
    var themeRows = [];
    var dragging = false;

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
      return { name: head ? head.textContent.trim() : '' };
    }

    function currentTheme() {
      if (!themeRows.length) return { index: 0, name: '短语搭配' };
      var index = lastAtOrAbove(themeRows, 150);
      return { index: index, name: themeName(themeRows[index]) || '短语搭配' };
    }

    function position() {
      document.documentElement.classList.toggle('sp-mobile', window.innerWidth < 860);
    }

    function update() {
      var p = progress();
      thumb.style.width = Math.round(p * trackW) + 'px';
      var pct = Math.round(p * 100);
      var info;
      if (isIndex) {
        var theme = currentTheme();
        info = { name: theme.name, themeIndex: theme.index };
      } else {
        info = currentChapter();
      }
      var label = pct + '%' + (info.name ? ' · ' + info.name : '');
      inlinePct.textContent = pct + '%';
      inlinePos.textContent = info.name ? '· ' + info.name : '';
      inline.title = label;
      slider.setAttribute('aria-valuenow', String(pct));
      slider.setAttribute('aria-valuetext', label);
      if (isIndex && dots.length) {
        for (var i = 0; i < dots.length; i++) {
          dots[i].setAttribute('aria-current',
            i === info.themeIndex ? 'true' : 'false');
        }
      }
    }

    function hideTip() {
      tip.setAttribute('data-show', 'false');
    }

    function showTip(dot, name) {
      if (window.innerWidth < 860) return;
      tip.textContent = name;
      tip.style.left = '0px';
      tip.style.top = '0px';
      tip.setAttribute('data-show', 'true');
      var railRect = rail.getBoundingClientRect();
      var dotRect = dot.getBoundingClientRect();
      var left = dotRect.left + dotRect.width / 2 - tip.offsetWidth / 2;
      var top = railRect.bottom + 6;
      tip.style.left = Math.max(8, left) + 'px';
      tip.style.top = Math.min(window.innerHeight - tip.offsetHeight - 8, top) + 'px';
    }

    function rebuildDots() {
      for (var i = 0; i < dots.length; i++) {
        if (dots[i].parentNode) dots[i].parentNode.removeChild(dots[i]);
      }
      dots = [];
      if (!isIndex || themeRows.length < 2) return;
      var max = maxScroll();
      if (!max) return;
      themeRows.forEach(function (heading) {
        var top = heading.getBoundingClientRect().top + window.scrollY;
        var p = clamp(top / max, 0, 1);
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'sp-dot';
        dot.style.left = Math.round(p * trackW) + 'px';
        var name = themeName(heading);
        dot.title = name;
        dot.setAttribute('aria-label', '跳到 ' + name);
        dot.addEventListener('mouseenter', function () { showTip(dot, name); });
        dot.addEventListener('focus', function () { showTip(dot, name); });
        dot.addEventListener('mouseleave', hideTip);
        dot.addEventListener('blur', hideTip);
        dot.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        dot.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          hideTip();
          var y = heading.getBoundingClientRect().top + window.scrollY - 74;
          window.scrollTo({ top: Math.max(0, y), behavior: reduce ? 'auto' : 'smooth' });
        });
        rail.appendChild(dot);
        dots.push(dot);
      });
    }

    function layout() {
      position();
      trackW = Math.max(1, rail.clientWidth);
      document.documentElement.classList.toggle('sp-short', maxScroll() < 40);
      cacheRows();
      rebuildDots();
      update();
    }

    function scrollToProgress(p) {
      window.scrollTo(0, clamp(p, 0, 1) * maxScroll());
      update();
    }

    function moveTo(clientX) {
      var rect = slider.getBoundingClientRect();
      scrollToProgress(rect.width ? (clientX - rect.left) / rect.width : 0);
    }

    slider.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      dragging = true;
      if (slider.setPointerCapture) {
        try { slider.setPointerCapture(e.pointerId); } catch (err) {}
      }
      moveTo(e.clientX);
      e.preventDefault();
    });

    slider.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      moveTo(e.clientX);
    });

    function endDrag() { dragging = false; }
    slider.addEventListener('pointerup', endDrag);
    slider.addEventListener('pointercancel', endDrag);

    slider.addEventListener('keydown', function (e) {
      var step = Math.round(viewH() * 0.8);
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') window.scrollBy(0, 80);
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') window.scrollBy(0, -80);
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
    window.addEventListener('blur', hideTip);

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
