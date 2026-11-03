(function () {
  if (window.__npeslScrollProgress) return;
  window.__npeslScrollProgress = true;

  function injectStyle() {
    if (document.getElementById('npesl-scroll-style')) return;
    var style = document.createElement('style');
    style.id = 'npesl-scroll-style';
    style.textContent = [
      '.sp-context{position:sticky;top:env(safe-area-inset-top,0px);z-index:30;padding-top:7px;',
      'background:var(--bg)}',
      '.sp-context-row{display:flex;align-items:center;gap:12px;min-height:36px;padding:4px 0}',
      '.sp-context-row .npesl-back{position:static;top:auto;margin:0;padding:5px 11px;',
      'font-size:13px;line-height:1.2;flex:none}',
      '.sp-context-chips{display:none;margin:5px 0 7px;padding-top:5px;border-top:1px solid var(--rule)}',
      'html.sp-chips-open .sp-context-chips{display:block}',
      '.sp-context-chips .chips{margin:0;padding:5px 0;gap:6px;max-height:30vh;',
      'overflow-y:auto;overscroll-behavior:contain;align-content:flex-start}',
      '.sp-context-chips .chips button{padding:5px 10px;font-size:12px}',
      '.sp-context-chips .chips button.sp-chip-back{color:var(--muted)}',
      '.sp-context-chips .chips button[aria-current="true"]{border-color:var(--accent);',
      'color:var(--accent)}',
      '.sp-context-path{display:flex;align-items:center;gap:7px;flex:1;min-width:0;',
      'font-size:14px;line-height:1.3}',
      '.sp-context-root{appearance:none;border:0;background:transparent;padding:0;',
      'font:inherit;color:var(--muted);cursor:pointer;text-align:left;min-width:0;',
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.sp-context-root:hover{color:var(--accent)}',
      '.sp-context-sep{color:var(--muted);flex:none}',
      '.sp-context-leaf{appearance:none;border:0;background:transparent;padding:0;',
      'font:inherit;font-weight:600;color:var(--fg);cursor:pointer;text-align:left;',
      'min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.sp-context-leaf:hover{color:var(--accent)}',
      '.sp-context-root:focus-visible,.sp-context-leaf:focus-visible{outline:2px solid var(--accent);',
      'outline-offset:2px;border-radius:6px}',
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
      '@media(max-width:560px){.sp-context-row{flex-wrap:wrap;gap:5px 10px}',
      '.sp-context-path{flex-basis:100%;font-size:13px}',
      '.sp-context-mode{order:2}.sp-context-pct{order:3;margin-left:auto}',
      '.sp-context-row.sp-has-back .sp-context-path{flex:1 1 130px}}',
      // 章节页没有横幅，返回胶囊不 sticky，免得压住粘性工具栏。
      '.sp-detail-back .npesl-back{position:static;top:auto;z-index:auto}',
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
    var chipHost = null;
    var inline = null;
    var inlinePct = null;
    var inlinePos = null;
    var modeHost = null;

    if (isIndex) {
      context = document.createElement('header');
      context.className = 'sp-context';
      context.innerHTML = '<div class="sp-context-row"><div class="sp-context-path">' +
        '<button type="button" class="sp-context-root"></button>' +
        '<span class="sp-context-sep" aria-hidden="true">›</span>' +
        '<button type="button" class="sp-context-leaf"></button></div><div class="sp-context-mode"></div>' +
        '<span class="sp-context-pct">0%</span></div>' +
        '<div class="sp-context-chips" id="sp-context-chips"></div>' +
        '<div class="sp-context-track" role="progressbar" aria-label="当前主题阅读进度" ' +
        'aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="sp-context-fill"></div></div>';
      var heading = page.querySelector('h1');
      if (heading) heading.insertAdjacentElement('afterend', context);
      // 部署时注入的返回胶囊也是 sticky，会压在横幅上：收进横幅首行，
      // 滚动时两者不再重叠，返回入口还一直在。
      var back = page.querySelector('.npesl-back');
      if (back) {
        var contextRow = context.querySelector('.sp-context-row');
        contextRow.classList.add('sp-has-back');
        contextRow.insertBefore(back, contextRow.firstChild);
      }
      modeHost = context.querySelector('.sp-context-mode');
      var modeGroup = document.querySelector('.level1');
      if (modeGroup && modeHost) {
        modeHost.appendChild(modeGroup);
        var modeButtons = modeGroup.querySelectorAll('[data-mode]');
        for (var m = 0; m < modeButtons.length; m++) {
          modeButtons[m].setAttribute('aria-controls', 'sp-context-chips');
        }
      }
      chipHost = context.querySelector('.sp-context-chips');
      var sceneChips = document.querySelector('[data-chips="scene"]');
      var particleChips = document.querySelector('[data-chips="particle"]');
      var themeChips = document.querySelector('[data-chips="theme"]');
      if (chipHost && sceneChips) chipHost.appendChild(sceneChips);
      if (chipHost && particleChips) chipHost.appendChild(particleChips);
      if (chipHost && themeChips) chipHost.appendChild(themeChips);
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
      // 面包屑两段都是按钮：点分类回到上级，点主题跳到本节开头。
      // 页面自己的状态在 index.html 的 IIFE 里，这里只发事件，由它去跳。
      function navContext(kind) {
        var current = currentIndex();
        if (!current) return;
        var particleMode = mode() === 'particle';
        var detail = { kind: kind, particle: particleMode };
        if (particleMode) {
          detail.group = current.group.getAttribute('data-particle');
        } else {
          detail.cat = current.group.getAttribute('data-cat');
          detail.theme = current.theme ? current.theme.getAttribute('data-theme') : null;
          if (kind === 'leaf' && !detail.theme) return;
        }
        try {
          document.dispatchEvent(new CustomEvent('npesl:context', { detail: detail }));
        } catch (e) {}
      }
      contextRoot.addEventListener('click', function () {
        if (contextRoot.textContent) navContext('root');
      });
      contextLeaf.addEventListener('click', function () {
        if (contextLeaf.textContent) navContext('leaf');
      });
    } else {
      if (page.querySelector('.npesl-back')) {
        document.documentElement.classList.add('sp-detail-back');
      }
      inline = document.createElement('span');
      inline.className = 'sp-inline';
      inline.innerHTML = '<b>0%</b><span></span>';
      var inlineHost = document.querySelector('.toolbar');
      if (inlineHost) inlineHost.appendChild(inline);
      else page.insertBefore(inline, page.firstChild);
      inlinePct = inline.querySelector('b');
      inlinePos = inline.querySelector('span');
    }

    var groups = [];
    var rows = [];

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
        rows = [];
      } else {
        rows = Array.prototype.slice.call(scope.querySelectorAll('.entry')).filter(visible);
        groups = [];
      }
    }

    function currentIndex() {
      var particleMode = mode() === 'particle';
      if (!groups.length) return null;
      // 跳转落点停在横幅下 12px，判定阈值放宽到 14px，点完 chip 立刻算作当前主题。
      var anchorY = context ? context.getBoundingClientRect().bottom + 14 : 100;
      var group = groups[lastAtOrAbove(groups, anchorY)];
      if (particleMode) {
        var groupIndex = groups.indexOf(group);
        var nextGroup = groups[groupIndex + 1];
        return {
          group: group,
          theme: null,
          root: '介词',
          leaf: categoryName(group, true),
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
          start: group.getBoundingClientRect().top + window.scrollY,
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

    function setContext(root, leaf, pct) {
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

    // 第三级 chip（分类下的主题）跟着滚动高亮当前主题。
    function markThemeChip(theme) {
      if (!chipHost) return;
      var id = theme ? theme.getAttribute('data-theme') : '';
      var buttons = chipHost.querySelectorAll('[data-theme]');
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].setAttribute('aria-current',
          buttons[i].getAttribute('data-theme') === id ? 'true' : 'false');
      }
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
        markThemeChip(current.theme);
        return;
      }
      var max = maxScroll();
      var pct = max ? Math.round(clamp(window.scrollY / max, 0, 1) * 100) : 0;
      var info = currentDetail();
      inlinePct.textContent = pct + '%';
      inlinePos.textContent = info.name ? '· ' + info.name : '';
      inline.title = pct + '%' + (info.name ? ' · ' + info.name : '');
    }

    function layout() {
      cacheRows();
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
