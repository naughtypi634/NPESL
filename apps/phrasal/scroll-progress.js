/* A slim scroll rail + progress pill for the long collocation pages.
 *
 * Chapter pages: shows percent, current entry number/name.
 * Index page: shows percent, current theme, and a tick per theme for quick jump.
 * The rail is draggable and click-to-jump; ticks jump straight to a theme.
 */
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
      '.sp-rail{position:fixed;right:max(6px,env(safe-area-inset-right,0px));top:18vh;bottom:18vh;',
      'width:7px;border-radius:999px;background:var(--rule);z-index:60;touch-action:none;',
      'cursor:pointer;outline:none;transition:width .16s ease,background-color .16s ease}',
      '.sp-rail:hover,.sp-rail:focus-visible{width:10px;background:var(--surface-strong,var(--surface))}',
      '.sp-rail:focus-visible{outline:2px solid var(--accent);outline-offset:3px}',
      '.sp-thumb{position:absolute;left:0;right:0;top:0;min-height:36px;border-radius:999px;',
      'background:var(--accent);opacity:.95;cursor:grab;transition:opacity .16s ease}',
      '.sp-rail:hover .sp-thumb,.sp-rail:focus-visible .sp-thumb{opacity:1}',
      '.sp-thumb:active{cursor:grabbing}',
      '.sp-tick{position:absolute;left:-1px;right:-1px;height:1px;padding:0;border:0;',
      'background:var(--muted);opacity:.55;cursor:pointer;border-radius:1px}',
      '.sp-tick:hover,.sp-tick:focus-visible{height:2px;background:var(--accent);opacity:1;outline:none}',
      '.sp-pill{position:fixed;left:max(14px,env(safe-area-inset-left,0px));',
      'bottom:max(14px,env(safe-area-inset-bottom,0px));z-index:60;',
      'max-width:min(62vw,360px);padding:6px 11px;border:1px solid var(--rule);',
      'border-radius:999px;background:var(--surface);color:var(--fg);',
      'font:inherit;font-size:12px;line-height:1.25;font-variant-numeric:tabular-nums;',
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;',
      'backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);opacity:.92}',
      '.sp-pill b{font-weight:700;color:var(--accent);margin-right:5px}',
      '.sp-pill .sp-pos{color:var(--muted);margin-right:5px}',
      '.sp-short .sp-rail,.sp-short .sp-pill{display:none}',
      '@media (max-width:560px){.sp-rail{top:14vh;bottom:14vh;right:max(2px,env(safe-area-inset-right,0px))}',
      '.sp-pill{font-size:11px;max-width:72vw}}'
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
    if (!scope) return;

    var rail = document.createElement('div');
    rail.className = 'sp-rail';
    rail.setAttribute('role', 'scrollbar');
    rail.setAttribute('aria-orientation', 'vertical');
    rail.setAttribute('aria-label', '页面滚动进度');
    rail.setAttribute('aria-valuemin', '0');
    rail.setAttribute('aria-valuemax', '100');
    rail.tabIndex = 0;

    var thumb = document.createElement('div');
    thumb.className = 'sp-thumb';
    rail.appendChild(thumb);

    var pill = document.createElement('div');
    pill.className = 'sp-pill';
    pill.innerHTML = '<b>0%</b><span class="sp-pos"></span><span class="sp-name"></span>';

    document.body.appendChild(rail);
    document.body.appendChild(pill);

    var trackH = 1;
    var thumbH = 28;
    var pctEl = pill.querySelector('b');
    var posEl = pill.querySelector('.sp-pos');
    var nameEl = pill.querySelector('.sp-name');
    var ticks = [];
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
      if (!rows.length) return { pos: '', name: '' };
      var index = lastAtOrAbove(rows, 150);
      var head = rows[index].querySelector('.entry-head .w');
      return {
        pos: (index + 1) + '/' + rows.length,
        name: head ? head.textContent.trim() : ''
      };
    }

    function currentEntry() {
      if (!rows.length) return { pos: '', name: '' };
      var index = lastAtOrAbove(rows, 150);
      return { pos: (index + 1) + '/' + rows.length, name: '' };
    }

    function currentTheme() {
      if (!themeRows.length) return { pos: '', name: '短语搭配' };
      var index = lastAtOrAbove(themeRows, 150);
      return {
        pos: (index + 1) + '/' + themeRows.length,
        name: themeName(themeRows[index]) || '短语搭配'
      };
    }

    function update() {
      var p = progress();
      var maxTop = Math.max(0, trackH - thumbH);
      thumb.style.transform = 'translateY(' + Math.round(p * maxTop) + 'px)';
      var pct = Math.round(p * 100);
      var info;
      if (isIndex) {
        var entry = currentEntry();
        var theme = currentTheme();
        info = { pos: entry.pos, name: theme.name };
      } else {
        info = currentChapter();
      }
      pctEl.textContent = pct + '%';
      posEl.textContent = info.pos ? '第 ' + info.pos + ' 条' : '';
      nameEl.textContent = info.name ? ' · ' + info.name : '';
      pill.title = pct + '%' + (info.pos ? ' · 第 ' + info.pos + ' 条' : '')
        + (info.name ? ' · ' + info.name : '');
      rail.setAttribute('aria-valuenow', String(pct));
      rail.setAttribute('aria-valuetext', pill.title);
    }

    function rebuildTicks() {
      for (var i = 0; i < ticks.length; i++) {
        if (ticks[i].parentNode) ticks[i].parentNode.removeChild(ticks[i]);
      }
      ticks = [];
      if (!isIndex || themeRows.length < 2) return;
      var maxTop = Math.max(0, trackH - thumbH);
      var max = maxScroll();
      themeRows.forEach(function (heading) {
        if (!max) return;
        var top = heading.getBoundingClientRect().top + window.scrollY;
        var p = clamp(top / max, 0, 1);
        var tick = document.createElement('button');
        tick.type = 'button';
        tick.className = 'sp-tick';
        tick.style.top = Math.round(p * maxTop) + 'px';
        var name = themeName(heading);
        tick.title = '跳到 ' + name;
        tick.setAttribute('aria-label', '跳到 ' + name);
        tick.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        tick.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var y = heading.getBoundingClientRect().top + window.scrollY - 74;
          window.scrollTo({ top: Math.max(0, y), behavior: reduce ? 'auto' : 'smooth' });
        });
        rail.appendChild(tick);
        ticks.push(tick);
      });
    }

    function layout() {
      var rect = rail.getBoundingClientRect();
      trackH = Math.max(1, rect.height);
      var ratio = viewH() / Math.max(1, docH());
      thumbH = Math.max(28, Math.round(trackH * ratio));
      thumb.style.height = thumbH + 'px';
      document.documentElement.classList.toggle('sp-short', maxScroll() < 40);
      cacheRows();
      rebuildTicks();
      update();
    }

    function scrollToProgress(p) {
      window.scrollTo(0, clamp(p, 0, 1) * maxScroll());
      update();
    }

    function moveTo(clientY) {
      var rect = rail.getBoundingClientRect();
      var maxTop = Math.max(0, rect.height - thumbH);
      var y = clientY - rect.top - thumbH / 2;
      scrollToProgress(maxTop ? y / maxTop : 0);
    }

    rail.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target.closest && e.target.closest('.sp-tick')) return;
      dragging = true;
      if (rail.setPointerCapture) {
        try { rail.setPointerCapture(e.pointerId); } catch (err) {}
      }
      moveTo(e.clientY);
      e.preventDefault();
    });

    rail.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      moveTo(e.clientY);
    });

    function endDrag() { dragging = false; }
    rail.addEventListener('pointerup', endDrag);
    rail.addEventListener('pointercancel', endDrag);

    rail.addEventListener('keydown', function (e) {
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

    layout();
  });
})();
