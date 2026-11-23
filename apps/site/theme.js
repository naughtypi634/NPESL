(function () {
  var KEY = 'npesl-theme';
  var THEMES = [
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' }
  ];
  var VALID = THEMES.map(function (theme) { return theme.id; });

  // 已下线的主题：老的 glass 是深色底，直接当深色用，别让人莫名其妙变回浅色。
  var LEGACY = { glass: 'dark' };

  function read() {
    try {
      var value = localStorage.getItem(KEY);
      if (LEGACY[value]) value = LEGACY[value];
      if (value && VALID.indexOf(value) !== -1) return value;
    } catch (err) {
      // localStorage 不可用时用浅色。
    }
    return 'light';
  }

  function current() {
    var value = document.documentElement.getAttribute('data-theme');
    return value && VALID.indexOf(value) !== -1 ? value : read();
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch (err) {
      // 存不下也不影响当前页面。
    }
  }

  // 页面自己的内联脚本已经在首屏前设过一次，这里兜底。
  apply(current());

  function build() {
    if (document.getElementById('npesl-theme')) return;

    var root = document.createElement('div');
    root.className = 'npesl-theme';
    root.id = 'npesl-theme';

    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'npesl-theme-fab';
    button.setAttribute('aria-label', 'Theme');
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    button.title = 'Theme';
    button.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.6"/>' +
      '<path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor"/>' +
      '</svg>';

    var menu = document.createElement('div');
    menu.className = 'npesl-theme-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Theme');
    menu.dataset.open = 'false';

    THEMES.forEach(function (theme) {
      var option = document.createElement('button');
      option.type = 'button';
      option.className = 'npesl-theme-option';
      option.setAttribute('role', 'menuitemradio');
      option.setAttribute('aria-checked', 'false');
      option.dataset.theme = theme.id;

      var swatch = document.createElement('span');
      swatch.className = 'npesl-theme-swatch';
      swatch.dataset.swatch = theme.id;

      var label = document.createElement('span');
      label.textContent = theme.label;

      var check = document.createElement('span');
      check.className = 'npesl-theme-check';
      check.textContent = '✓';
      check.setAttribute('aria-hidden', 'true');

      option.appendChild(swatch);
      option.appendChild(label);
      option.appendChild(check);
      option.addEventListener('click', function () {
        apply(theme.id);
        sync();
        close();
      });
      menu.appendChild(option);
    });

    function sync() {
      var active = current();
      Array.prototype.forEach.call(
        menu.querySelectorAll('.npesl-theme-option'),
        function (option) {
          option.setAttribute('aria-checked', String(option.dataset.theme === active));
        }
      );
    }

    function open() {
      sync();
      menu.dataset.open = 'true';
      button.setAttribute('aria-expanded', 'true');
      var active = menu.querySelector('.npesl-theme-option[aria-checked="true"]');
      if (active) active.focus();
    }

    function close() {
      menu.dataset.open = 'false';
      button.setAttribute('aria-expanded', 'false');
    }

    button.addEventListener('click', function (event) {
      event.stopPropagation();
      if (menu.dataset.open === 'true') close();
      else open();
    });

    menu.addEventListener('click', function (event) {
      event.stopPropagation();
    });

    document.addEventListener('click', function () {
      if (menu.dataset.open === 'true') close();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && menu.dataset.open === 'true') {
        close();
        button.focus();
      }
    });

    window.addEventListener('storage', function (event) {
      if (event.key === KEY) {
        document.documentElement.setAttribute('data-theme', read());
        if (menu.dataset.open === 'true') sync();
      }
    });

    root.appendChild(button);
    root.appendChild(menu);
    document.body.appendChild(root);
    sync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }

  // 站内锚点平滑滚动。只接管真正有对应元素的锚点：数据图表的 #/topic/view、
  // 对话的 #a1 级别切换、单文件拼读的 #/01 都由各应用自己处理，不在这里拦。
  // 程序化的 window.scrollTo 也不受影响，各应用定位和测试仍然即时。
  var reduceMotion = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduceMotion) {
    document.addEventListener('click', function (event) {
      if (event.defaultPrevented || event.button !== 0
          || event.metaKey || event.ctrlKey || event.shiftKey
          || event.altKey) return;
      var node = event.target;
      var link = node && node.closest ? node.closest('a[href^="#"]') : null;
      if (!link || link.hasAttribute('download') || link.target) return;
      if (link.hasAttribute('data-level') || link.hasAttribute('data-lesson')) return;
      var href = link.getAttribute('href') || '';
      if (href.length < 2 || href.indexOf('#/') === 0) return;
      var id = href.slice(1);
      try {
        id = decodeURIComponent(id);
      } catch (err) {
        return;
      }
      var target = document.getElementById(id)
        || document.getElementsByName(id)[0];
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      try {
        history.pushState(null, '', href);
      } catch (err) {
        // 不能改地址也不影响滚动。
      }
    });
  }
})();
