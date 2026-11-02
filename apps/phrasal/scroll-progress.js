/* A left-side section rail + progress readout for the long collocation pages.
 *
 * Desktop: the rail sits just left of the content column, with a dot per
 * section and a hover label naming the section. Mobile: a slim rail in the
 * page gutter, no floating overlay; the progress text lives inside the
 * toolbar instead.
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
      ':root{--sp-left:14px}',
      '.sp-rail{position:fixed;left:var(--sp-left);right:auto;top:18vh;bottom:18vh;',
      'width:8px;border-radius:999px;background:var(--rule);z-index:60;',
      'touch-action:none;cursor:pointer;outline:none;',
      'transition:width .16s ease,background-color .16s ease}',
      '.sp-rail:hover,.sp-rail:focus-visible{width:10px;background:var(--surface-strong,var(--surface))}',
      '.sp-rail:focus-visible{outline:2px solid var(--accent);outline-offset:4px}',
      '.sp-thumb{position:absolute;left:0;right:0;top:0;min-height:44px;border-radius:999px;',
      'background:var(--accent);opacity:.98;cursor:grab;',
      'box-shadow:0 0 0 2px var(--bg),0 4px 12px rgba(0,0,0,.25);',
      'transition:opacity .16s ease}',
      '.sp-rail:hover .sp-thumb,.sp-rail:focus-visible .sp-thumb{opacity:1}',
      '.sp-thumb:active{cursor:grabbing}',
      '.sp-dot{position:absolute;left:50%;width:16px;height:16px;padding:0;border:0;',
      'background:transparent;transform:translateX(-50%);cursor:pointer;z-index:2;border-radius:50%}',
      '.sp-dot::before{content:"";position:absolute;left:50%;top:50%;width:7px;height:7px;',
      'transform:translate(-50%,-50%);border-radius:50%;background:var(--bg);',
      'border:1px solid var(--muted);transition:background-color .12s ease,width .12s ease,height .12s ease}',
      '.sp-dot:hover::before,.sp-dot:focus-visible::before{background:var(--accent);border-color:var(--accent)}',
      '.sp-dot:focus-visible{outline:none}',
      '.sp-dot[aria-current="true"]::before{width:10px;height:10px;background:var(--accent);',
      'border-color:var(--accent);box-shadow:0 0 0 2px var(--bg)}',
      '.sp-tip{position:fixed;z-index:61;max-width:240px;padding:6px 10px;border:1px solid var(--rule);',
      'border-radius:9px;background:var(--surface-strong,var(--surface));color:var(--fg);',
      'font:inherit;font-size:12px;line-height:1.35;white-space:nowrap;overflow:hidden;',
      'text-overflow:ellipsis;pointer-events:none;opacity:0;transform:translateY(3px);',
      'transition:opacity .12s ease,transform .12s ease;box-shadow:0 10px 28px rgba(0,0,0,.22)}',
      '.sp-tip[data-show="true"]{opacity:1;transform:translateY(0)}',
      '.sp-pill{position:fixed;left:var(--sp-left);bottom:max(14px,env(safe-area-inset-bottom,0px));',
      'z-index:60;max-width:min(56vw,360px);padding:7px 11px;border:1px solid var(--rule);',
      'border-radius:999px;background:var(--surface);color:var(--fg);font:inherit;',
      'font-size:12px;line-height:1.25;font-variant-numeric:tabular-nums;white-space:nowrap;',
      'overflow:hidden;text-overflow:ellipsis;pointer-events:none;backdrop-filter:blur(12px);',
      '-webkit-backdrop-filter:blur(12px);opacity:.94}',
      '.sp-pill b{font-weight:700;color:var(--accent);margin-right:6px}',
      '.sp-pill .sp-pos{color:var(--muted);margin-right:5px}',
      '.sp-inline{display:none;align-items:center;gap:5px;max-width:100%;padding:5px 9px;',
      'border:1px solid var(--rule);border-radius:999px;color:var(--muted);font:inherit;',
      'font-size:12px;line-height:1.2;font-variant-numeric:tabular-nums;white-space:nowrap;',
      'overflow:hidden;text-overflow:ellipsis}',
      '.sp-inline b{font-weight:700;color:var(--accent)}',
      '.sp-top{display:none;align-items:center;gap:5px;position:fixed;z-index:60;',
      'top:max(12px,env(safe-area-inset-top,0px));',
      'padding:6px 10px;border:1px solid var(--rule);border-radius:999px;',
      'background:var(--surface);color:var(--fg);font:inherit;font-size:12px;line-height:1.2;',
      'font-variant-numeric:tabular-nums;white-space:nowrap;backdrop-filter:blur(12px);',
      '-webkit-backdrop-filter:blur(12px);opacity:.94}',
      '.sp-top b{font-weight:700;color:var(--accent)}',
      '.sp-mobile .sp-pill,.sp-mobile .sp-dot,.sp-mobile .sp-tip{display:none}',
      '.sp-mobile .sp-rail{width:5px;top:14vh;bottom:14vh}',
      '.sp-mobile .sp-inline{display:inline-flex}',
      '.sp-mobile .sp-top{display:inline-flex}',
      '.sp-short .sp-rail,.sp-short .sp-pill,.sp-short .sp-inline{display:none}'
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

    var tip = document.createElement('div');
    tip.className = 'sp-tip';

    var inline = document.createElement('span');
    inline.className = 'sp-inline';
    inline.innerHTML = '<b>0%</b><span></span>';
    if (!isIndex) {
      var inlineHost = document.querySelector('.toolbar');
      if (inlineHost) inlineHost.appendChild(inline);
      else page.insertBefore(inline, page.firstChild);
    }

    var topChip = null;
    var topPct = null;
    var topPos = null;
    if (isIndex) {
      topChip = document.createElement('span');
      topChip.className = 'sp-top';
      topChip.innerHTML = '<b>0%</b><span></span>';
      topPct = topChip.querySelector('b');
      topPos = topChip.querySelector('span');
      document.body.appendChild(topChip);
    }

    document.body.appendChild(rail);
    document.body.appendChild(pill);
    document.body.appendChild(tip);

    var trackH = 1;
    var thumbH = 44;
    var pctEl = pill.querySelector('b');
    var posEl = pill.querySelector('.sp-pos');
    var nameEl = pill.querySelector('.sp-name');
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
      if (!rows.length) return { pos: '', name: '' };
      var index = lastAtOrAbove(rows, 150);
      var head = rows[index].querySelector('.entry-head .w');
      return {
        pos: (index + 1) + '/' + rows.length,
        name: head ? head.textContent.trim() : ''
      };
    }

    function currentEntry() {
      if (!rows.length) return { pos: '' };
      var index = lastAtOrAbove(rows, 150);
      return { pos: (index + 1) + '/' + rows.length };
    }

    function currentTheme() {
      if (!themeRows.length) return { index: 0, name: '短语搭配' };
      var index = lastAtOrAbove(themeRows, 150);
      return { index: index, name: themeName(themeRows[index]) || '短语搭配' };
    }

    function position() {
      var pageRect = page.getBoundingClientRect();
      var left = pageRect.left - 24;
      if (left < 8) left = Math.max(2, pageRect.left - 12);
      if (pageRect.left < 36) left = 2;
      document.documentElement.style.setProperty('--sp-left', left + 'px');
      document.documentElement.classList.toggle('sp-mobile', window.innerWidth < 860);
      if (topChip) {
        var back = document.querySelector('.npesl-back');
        topChip.style.left = back
          ? (back.getBoundingClientRect().right + 8) + 'px'
          : '14px';
      }
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
        info = { pos: entry.pos, name: theme.name, themeIndex: theme.index };
      } else {
        info = currentChapter();
      }
      pctEl.textContent = pct + '%';
      posEl.textContent = info.pos ? '第 ' + info.pos + ' 条' : '';
      nameEl.textContent = info.name ? ' · ' + info.name : '';
      pill.title = pct + '%' + (info.pos ? ' · 第 ' + info.pos + ' 条' : '')
        + (info.name ? ' · ' + info.name : '');
      inlinePct.textContent = pct + '%';
      inlinePos.textContent = info.pos ? ' · ' + info.pos : '';
      inline.title = pill.title;
      if (topChip) {
        topPct.textContent = pct + '%';
        topPos.textContent = info.pos ? ' · ' + info.pos : '';
        topChip.title = pill.title;
      }
      rail.setAttribute('aria-valuenow', String(pct));
      rail.setAttribute('aria-valuetext', pill.title);
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
      var left = railRect.right + 10;
      var top = dotRect.top + dotRect.height / 2 - tip.offsetHeight / 2;
      if (left + tip.offsetWidth > window.innerWidth - 8) {
        left = railRect.left - tip.offsetWidth - 10;
      }
      tip.style.left = Math.max(8, left) + 'px';
      tip.style.top = Math.max(8, Math.min(window.innerHeight - tip.offsetHeight - 8, top)) + 'px';
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
        dot.style.top = Math.round(clamp(p * trackH - 8, 0, Math.max(0, trackH - 16))) + 'px';
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
      var rect = rail.getBoundingClientRect();
      trackH = Math.max(1, rect.height);
      var ratio = viewH() / Math.max(1, docH());
      thumbH = Math.max(44, Math.round(trackH * ratio));
      thumb.style.height = thumbH + 'px';
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
      var rect = rail.getBoundingClientRect();
      var maxTop = Math.max(0, rect.height - thumbH);
      var y = clientY - rect.top - thumbH / 2;
      scrollToProgress(maxTop ? y / maxTop : 0);
    }

    rail.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target.closest && e.target.closest('.sp-dot')) return;
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
