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
      '.sp-rail{position:fixed;left:8px;top:14vh;bottom:14vh;width:32px;z-index:60;outline:none}',
      '.sp-track{position:absolute;left:15px;top:0;bottom:0;width:2px;border-radius:999px;background:var(--rule)}',
      '.sp-dot{position:absolute;left:16px;top:0;width:16px;height:12px;padding:0;border:0;',
      'background:transparent;transform:translate(-50%,-50%) scaleX(var(--wave-x,1)) scaleY(var(--wave-scale,1));',
      'transform-origin:center;cursor:pointer;z-index:2;border-radius:999px;',
      'transition:transform .24s cubic-bezier(.2,.8,.2,1)}',
      '.sp-dot::before{content:"";position:absolute;left:50%;top:50%;width:4px;height:4px;',
      'transform:translate(-50%,-50%);border-radius:50%;background:var(--muted);',
      'opacity:var(--wave-opacity,.46);transition:background-color .18s ease,opacity .18s ease}',
      '.sp-dot[data-level="1"]::before{width:7px;height:7px;opacity:.76}',
      '.sp-rail:hover .sp-dot::before{opacity:.82}',
      '.sp-dot:hover::before,.sp-dot:focus-visible::before{background:var(--accent);opacity:1}',
      '.sp-dot:focus-visible{outline:2px solid var(--accent);outline-offset:1px}',
      '.sp-dot[aria-current="true"]::before{background:var(--accent);opacity:1}',
      '.sp-dot[data-level="2"][aria-current="true"]::before{width:6px;height:6px}',
      '@media(prefers-reduced-motion:reduce){.sp-dot,.sp-dot::before{transition:none}}',
      '.sp-context{position:sticky;top:env(safe-area-inset-top,0px);z-index:30;padding-top:7px;',
      'background:var(--bg)}',
      '.sp-context-row{display:flex;align-items:center;gap:12px;min-height:36px;padding:4px 0}',
      '.sp-context-chips{display:none;margin:5px 0 7px;padding-top:5px;border-top:1px solid var(--rule)}',
      'html.sp-chips-open .sp-context-chips{display:block}',
      '.sp-context-chips .chips{margin:0;padding:5px 0;gap:6px;max-height:30vh;',
      'overflow-y:auto;overscroll-behavior:contain;align-content:flex-start}',
      '.sp-context-chips .chips button{padding:5px 10px;font-size:12px}',
      '.sp-context-path{display:flex;align-items:center;gap:7px;flex:1;min-width:0;',
      'font-size:14px;line-height:1.3}',
      '.sp-context-root{color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.sp-context-sep{color:var(--muted);flex:none}',
      '.sp-context-leaf{color:var(--fg);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.sp-context-pct{flex:none;min-width:3.1em;text-align:right;color:var(--muted);',
      'font-size:12px;font-variant-numeric:tabular-nums}',
      '.sp-context-track{height:2px;overflow:hidden;background:var(--rule);border-radius:999px}',
      '.sp-context-fill{height:100%;width:0;background:var(--accent);transition:width .14s linear}',
      '.sp-context-mode{flex:none}',
      '.sp-context-mode .level1{margin:0;gap:3px}',
      '.sp-context-mode .level1 button{padding:6px 10px;font-size:12px}',
      '.sp-inline{display:inline-flex;align-items:center;gap:6px;margin-left:auto;max-width:100%;',
      'padding:3px 4px;border:0;background:transparent;color:var(--muted);font:inherit;',
      'font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.sp-inline b{font-weight:600;color:var(--accent)}',
      '.sp-inline span{overflow:hidden;text-overflow:ellipsis}',
      '.sp-right{display:flex;align-items:center;gap:8px;margin-left:auto}',
      '.sp-right .sp-inline{margin-left:0;padding:3px 4px}',
      '.sp-mobile .page{padding-left:56px!important}',
      '.sp-mobile.sp-single .page,.sp-mobile.sp-short .page{padding-left:24px!important}',
      '.sp-mobile .sp-rail{left:8px;top:12vh;bottom:12vh}',
      '.sp-mobile .sp-dot{transition:none}',
      '.sp-mobile .sp-dot:active{transform:translate(-50%,-50%) scale(1.2)}',
      '.sp-short .sp-rail{display:none}',
      '.sp-single .sp-rail{display:none}',
      '@media(max-width:560px){.sp-context-row{flex-wrap:wrap;gap:5px 10px}',
      '.sp-context-path{flex-basis:100%;font-size:13px}',
      '.sp-context-mode{order:2}.sp-context-pct{order:3;margin-left:auto}}',
      '@media(prefers-reduced-motion:reduce){.sp-context-fill{transition:none}}'
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

    var context = null;
    var contextRoot = null;
    var contextSep = null;
    var contextLeaf = null;
    var contextPct = null;
    var contextFill = null;
    var inline = null;
    var inlinePct = null;
    var inlinePos = null;
    var modeHost = null;

    if (isIndex) {
      context = document.createElement('header');
      context.className = 'sp-context';
      context.innerHTML = '<div class="sp-context-row"><div class="sp-context-path">' +
        '<span class="sp-context-root"></span><span class="sp-context-sep" aria-hidden="true">›</span>' +
        '<span class="sp-context-leaf"></span></div><div class="sp-context-mode"></div>' +
        '<span class="sp-context-pct">0%</span></div>' +
        '<div class="sp-context-chips" id="sp-context-chips"></div>' +
        '<div class="sp-context-track" role="progressbar" aria-label="当前主题阅读进度" ' +
        'aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="sp-context-fill"></div></div>';
      var heading = page.querySelector('h1');
      if (heading) heading.insertAdjacentElement('afterend', context);
      modeHost = context.querySelector('.sp-context-mode');
      var modeGroup = document.querySelector('.level1');
      if (modeGroup && modeHost) {
        modeHost.appendChild(modeGroup);
        var modeButtons = modeGroup.querySelectorAll('[data-mode]');
        for (var m = 0; m < modeButtons.length; m++) {
          modeButtons[m].setAttribute('aria-controls', 'sp-context-chips');
        }
      }
      var chipHost = context.querySelector('.sp-context-chips');
      var sceneChips = document.querySelector('[data-chips="scene"]');
      var particleChips = document.querySelector('[data-chips="particle"]');
      if (chipHost && sceneChips) chipHost.appendChild(sceneChips);
      if (chipHost && particleChips) chipHost.appendChild(particleChips);
      var topbar = document.querySelector('.topbar');
      var voice = topbar && topbar.querySelector('.voice-seg');
      if (topbar && voice) {
        var right = document.createElement('div');
        right.className = 'sp-right';
        topbar.insertBefore(right, voice);
        right.appendChild(voice);
      }
      contextRoot = context.querySelector('.sp-context-root');
      contextSep = context.querySelector('.sp-context-sep');
      contextLeaf = context.querySelector('.sp-context-leaf');
      contextPct = context.querySelector('.sp-context-pct');
      contextFill = context.querySelector('.sp-context-fill');
    } else {
      inline = document.createElement('span');
      inline.className = 'sp-inline';
      inline.innerHTML = '<b>0%</b><span></span>';
      var inlineHost = document.querySelector('.toolbar');
      if (inlineHost) inlineHost.appendChild(inline);
      else page.insertBefore(inline, page.firstChild);
      inlinePct = inline.querySelector('b');
      inlinePos = inline.querySelector('span');
    }

    var rail = document.createElement('nav');
    rail.className = 'sp-rail';
    rail.setAttribute('aria-label', '主题快速导航');
    var track = document.createElement('div');
    track.className = 'sp-track';
    track.setAttribute('aria-hidden', 'true');
    rail.appendChild(track);
    document.body.appendChild(rail);

    var dots = [];
    var groups = [];
    var themes = [];
    var rows = [];
    var trackH = 1;
    var hovered = null;
    var focused = null;

    function clamp(n, min, max) {
      return Math.max(min, Math.min(max, n));
    }

    function docH() {
      return Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    }

    function maxScroll() {
      return Math.max(0, docH() - window.innerHeight);
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

    function mode() {
      var button = document.querySelector('[data-mode][aria-pressed="true"]');
      return button ? button.getAttribute('data-mode') : 'scene';
    }

    function categoryName(group, particleMode) {
      var data = window.PHRASAL_INDEX || {};
      if (particleMode) {
        var particle = group.getAttribute('data-particle');
        var parts = data.particle || [];
        for (var i = 0; i < parts.length; i++) {
          if (parts[i].p === particle) return parts[i].label || parts[i].p;
        }
        return particle || '介词';
      }
      var cat = group.getAttribute('data-cat');
      var scenes = data.scene || [];
      for (var j = 0; j < scenes.length; j++) {
        if (scenes[j].id === cat) return scenes[j].zh;
      }
      return cat || '场景话题';
    }

    function cacheRows() {
      if (isIndex) {
        groups = Array.prototype.slice.call(scope.querySelectorAll('.group')).filter(visible);
        themes = [];
        for (var i = 0; i < groups.length; i++) {
          var children = groups[i].querySelectorAll('.theme');
          for (var j = 0; j < children.length; j++) {
            if (visible(children[j])) themes.push(children[j]);
          }
        }
        rows = [];
      } else {
        rows = Array.prototype.slice.call(scope.querySelectorAll('.entry')).filter(visible);
        groups = [];
        themes = [];
      }
    }

    function currentIndex() {
      var particleMode = mode() === 'particle';
      if (!groups.length) return null;
      var anchorY = context ? context.getBoundingClientRect().bottom + 8 : 100;
      var group = groups[lastAtOrAbove(groups, anchorY)];
      if (particleMode) {
        var groupIndex = groups.indexOf(group);
        var nextGroup = groups[groupIndex + 1];
        return {
          group: group,
          theme: null,
          root: '介词',
          leaf: categoryName(group, true),
          target: group,
          start: group.getBoundingClientRect().top + window.scrollY,
          end: nextGroup
            ? nextGroup.getBoundingClientRect().top + window.scrollY
            : group.getBoundingClientRect().bottom + window.scrollY
        };
      }
      var groupThemes = Array.prototype.slice.call(group.querySelectorAll('.theme')).filter(visible);
      var theme = groupThemes.length ? groupThemes[lastAtOrAbove(groupThemes, anchorY)] : null;
      if (!theme) {
        return {
          group: group, theme: null, root: categoryName(group, false), leaf: '',
          target: group, start: group.getBoundingClientRect().top + window.scrollY,
          end: group.getBoundingClientRect().bottom + window.scrollY
        };
      }
      var themeIndex = groupThemes.indexOf(theme);
      var nextTheme = groupThemes[themeIndex + 1];
      return {
        group: group,
        theme: theme,
        root: categoryName(group, false),
        leaf: themeName(theme),
        target: theme,
        start: theme.getBoundingClientRect().top + window.scrollY,
        end: nextTheme
          ? nextTheme.getBoundingClientRect().top + window.scrollY
          : group.getBoundingClientRect().bottom + window.scrollY
      };
    }

    function currentDetail() {
      if (!rows.length) return { index: 0, name: '' };
      var toolbar = document.querySelector('.toolbar');
      var anchorY = toolbar ? toolbar.getBoundingClientRect().bottom + 8 : 100;
      var index = lastAtOrAbove(rows, anchorY);
      var head = rows[index].querySelector('.entry-head .w');
      return { index: index, name: head ? head.textContent.trim() : '' };
    }

    function positionRail() {
      var mobile = window.innerWidth < 860;
      document.documentElement.classList.toggle('sp-mobile', mobile);
      var pageRect = page.getBoundingClientRect();
      rail.style.left = Math.max(8, mobile ? 8 : pageRect.left - 40) + 'px';
    }

    function setContext(root, leaf, pct) {
      var preview = focused || hovered;
      if (preview) {
        root = preview.root;
        leaf = preview.leaf;
      }
      contextRoot.textContent = root || '';
      contextLeaf.textContent = leaf || '';
      contextSep.hidden = !leaf;
      contextLeaf.hidden = !leaf;
      var value = Math.round(clamp(pct, 0, 1) * 100);
      contextPct.textContent = value + '%';
      contextFill.style.width = value + '%';
      var progress = context.querySelector('.sp-context-track');
      progress.setAttribute('aria-valuenow', String(value));
      progress.setAttribute('aria-valuetext', (leaf ? root + ' › ' + leaf : root) + '：' + value + '%');
    }

    function update() {
      if (isIndex) {
        var current = currentIndex();
        if (!current) {
          setContext('场景话题', '全部', 0);
          return;
        }
        var refY = window.scrollY + context.getBoundingClientRect().height + 8;
        var span = Math.max(1, current.end - current.start);
        setContext(current.root, current.leaf, (refY - current.start) / span);
        for (var i = 0; i < dots.length; i++) {
          var dot = dots[i];
          var active = dot._spTarget === current.group ||
            (current.theme && dot._spTarget === current.theme);
          dot.setAttribute('aria-current', active ? 'true' : 'false');
        }
        return;
      }
      var max = maxScroll();
      var pct = max ? Math.round(clamp(window.scrollY / max, 0, 1) * 100) : 0;
      var info = currentDetail();
      var preview = focused || hovered;
      inlinePct.textContent = pct + '%';
      inlinePos.textContent = preview
        ? '· 将跳到 ' + preview.leaf
        : (info.name ? '· ' + info.name : '');
      inline.title = preview ? '将跳到 ' + preview.leaf : pct + '%' + (info.name ? ' · ' + info.name : '');
      for (var j = 0; j < dots.length; j++) {
        dots[j].setAttribute('aria-current', j === info.index ? 'true' : 'false');
      }
    }

    function addDot(target, level, root, leaf, offset) {
      var max = maxScroll();
      var targetY = target.getBoundingClientRect().top + window.scrollY - 92 + (offset || 0);
      var pct = max ? clamp(targetY / max, 0, 1) : 0;
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'sp-dot';
      dot.setAttribute('data-level', String(level));
      dot.style.top = Math.round(pct * trackH) + 'px';
      dot.setAttribute('aria-label', '跳到 ' + root + (leaf ? ' › ' + leaf : ''));
      dot._spTarget = target;
      dot._spPath = { root: root, leaf: leaf };
      dot.addEventListener('pointerenter', function (e) {
        if (e.pointerType === 'touch') return;
        hovered = dot._spPath;
        update();
      });
      dot.addEventListener('pointerleave', function () {
        hovered = null;
        update();
      });
      dot.addEventListener('focus', function () {
        focused = dot._spPath;
        update();
      });
      dot.addEventListener('blur', function () {
        focused = null;
        update();
      });
      dot.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var sticky = context
          ? context.getBoundingClientRect().height + 12
          : (document.querySelector('.toolbar') || {}).offsetHeight + 12;
        if (!Number.isFinite(sticky)) sticky = 92;
        var y = target.getBoundingClientRect().top + window.scrollY - sticky;
        window.scrollTo({ top: Math.max(0, y), behavior: reduce ? 'auto' : 'smooth' });
      });
      rail.appendChild(dot);
      dots.push(dot);
    }

    function rebuildDots() {
      for (var i = 0; i < dots.length; i++) {
        if (dots[i].parentNode) dots[i].parentNode.removeChild(dots[i]);
      }
      dots = [];
      if (isIndex) {
        var particleMode = mode() === 'particle';
        for (var g = 0; g < groups.length; g++) {
          var group = groups[g];
          var root = categoryName(group, particleMode);
          if (particleMode) {
            addDot(group, 1, '介词', root, 0);
          } else {
            addDot(group, 1, root, '', -4);
            var groupThemes = group.querySelectorAll('.theme');
            for (var t = 0; t < groupThemes.length; t++) {
              if (visible(groupThemes[t])) addDot(groupThemes[t], 2, root, themeName(groupThemes[t]), 3);
            }
          }
        }
      } else {
        var crumbs = document.querySelector('.crumbs');
        var rootName = crumbs ? crumbs.textContent.replace(/\s+/g, ' ').trim() : '短语搭配';
        for (var r = 0; r < rows.length; r++) {
          var head = rows[r].querySelector('.entry-head .w');
          addDot(rows[r], 1, rootName, head ? head.textContent.trim() : '', 0);
        }
      }
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
    });
    rail.addEventListener('pointerleave', resetWave);

    function layout() {
      document.documentElement.classList.remove('sp-single');
      positionRail();
      trackH = Math.max(1, rail.clientHeight);
      document.documentElement.classList.toggle('sp-short', maxScroll() < 40);
      cacheRows();
      rebuildDots();
      document.documentElement.classList.toggle('sp-single', dots.length <= 1);
      update();
    }

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
