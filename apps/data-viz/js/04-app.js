/* App shell: hash routing, gallery wall, workspace, lazy bundles, selection. */
(function (DV) {
  'use strict';

  var G = window.DV_GALLERY || { topics: [], types: [], bundles: { lang: {}, topics: {} } };
  var TOPICS = {};
  var LANGS = {};
  var LOADING = {};
  var BOOT_ID = String(Math.random()).slice(2);
  var loaded = {};

  var S = {
    mode: 'gallery',
    topic: null,
    view: null,
    mark: null,
    tab: ['words', 'patterns', 'compare', 'describe', 'read'].indexOf(
      DV.store.get('npesl-dataviz-tab', 'describe')) >= 0
      ? DV.store.get('npesl-dataviz-tab', 'describe') : 'describe',
    register: ['general', 'ielts', 'business'].indexOf(
      DV.store.get('npesl-dataviz-reg', 'general')) >= 0
      ? DV.store.get('npesl-dataviz-reg', 'general') : 'general',
    level: 'a2',
    revealed: false,
    table: false,
    filter: 'all',
    hidden: {},
    edited: {},
    scratch: {},
    editOpen: false,
    renderer: null,
    featureIndex: {},
    commitValue: null,
    select: null,
    resizeHandler: null,
    observer: null
  };

  var app = null;
  var tooltip = null;

  function byOrder(list) {
    return list.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }

  function topicCard(slug) {
    return G.topics.filter(function (t) { return t.id === slug; })[0];
  }

  function typeMeta(id) {
    return G.types.filter(function (t) { return t.id === id; })[0] || { label_zh: id, label_en: id };
  }

  function currentTopic() { return TOPICS[S.topic]; }
  function currentView() {
    var topic = currentTopic();
    if (!topic) return null;
    return topic.views.filter(function (v) { return v.id === S.view; })[0] || topic.views[0];
  }

  function featureFor(mark) {
    return mark ? S.featureIndex[mark] || null : null;
  }

  // ------------------------------------------------------------ hash router
  function parseRoute() {
    var raw = (location.hash || '#/').slice(1);
    var q = {};
    var qi = raw.indexOf('?');
    if (qi >= 0) {
      raw.slice(qi + 1).split('&').forEach(function (pair) {
        if (!pair) return;
        var bits = pair.split('=');
        q[decodeURIComponent(bits[0])] = decodeURIComponent(bits.slice(1).join('='));
      });
      raw = raw.slice(0, qi);
    }
    var parts = raw.split('/').filter(Boolean).map(decodeURIComponent);
    return { parts: parts, q: q };
  }

  function currentQuery() {
    var q = [];
    if (S.mark) q.push('mark=' + encodeURIComponent(S.mark));
    if (S.tab !== 'describe') q.push('tab=' + S.tab);
    if (S.register !== 'general') q.push('reg=' + S.register);
    return q.length ? '?' + q.join('&') : '';
  }

  function routeHash(parts) {
    return '#/' + parts.join('/') + currentQuery();
  }

  function pushRoute(parts) {
    location.hash = routeHash(parts);
  }

  function replaceRoute(parts) {
    var target = routeHash(parts);
    if (location.hash === target) return;
    try { history.replaceState(null, '', target); } catch (e) { location.hash = target; }
  }

  function applyQuery(q) {
    S.tab = q.tab && ['words', 'patterns', 'compare', 'describe', 'read'].indexOf(q.tab) >= 0 ? q.tab : S.tab;
    S.register = q.reg && ['general', 'ielts', 'business'].indexOf(q.reg) >= 0 ? q.reg : S.register;
    if (q.mark) S.mark = q.mark;
  }

  // ------------------------------------------------------------ loading
  function loadScript(url) {
    if (loaded[url]) return Promise.resolve();
    if (LOADING[url]) return LOADING[url];
    LOADING[url] = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      var timer = setTimeout(function () { cleanup(); reject(new Error('timeout')); }, 10000);
      function cleanup() {
        clearTimeout(timer);
        script.onload = script.onerror = null;
      }
      script.src = url;
      script.async = true;
      script.onload = function () { cleanup(); loaded[url] = true; resolve(); };
      script.onerror = function () { cleanup(); script.remove(); reject(new Error('network')); };
      document.head.appendChild(script);
    }).catch(function (error) {
      delete LOADING[url];
      throw error;
    });
    return LOADING[url];
  }

  function ensureTopic(slug) {
    if (TOPICS[slug]) return Promise.resolve();
    var bundle = (G.bundles.topics || {})[slug];
    if (!bundle) return Promise.reject(new Error('no bundle'));
    return loadScript(bundle).then(function () {
      TOPICS[slug] = (window.DV_TOPICS || {})[slug];
      if (!TOPICS[slug]) throw new Error('missing data');
    });
  }

  function ensureLang(type) {
    if (LANGS[type]) return Promise.resolve();
    var bundle = (G.bundles.lang || {})[type];
    if (!bundle) return Promise.reject(new Error('no lang bundle'));
    return loadScript(bundle).then(function () {
      LANGS[type] = (window.DV_LANG || {})[type];
      if (!LANGS[type]) throw new Error('missing language');
    });
  }

  // ------------------------------------------------------------ gallery
  function miniChart(type, data, unit, subject) {
    var W = 240, H = 132;
    var svg = DV.svg('svg', {
      viewBox: '0 0 ' + W + ' ' + H, class: 'dv-mini',
      'aria-hidden': 'true', focusable: 'false'
    });
    var pad = 12, w = W - pad * 2, h = H - pad * 2;
    function poly(points, cls) {
      return DV.svg('polyline', {
        points: points.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '),
        fill: 'none', class: 'dv-mini-line ' + cls
      }, svg);
    }
    if (type === 'line' && data.series) {
      var s = data.series[0];
      var lo = Math.min.apply(null, s.values), hi = Math.max.apply(null, s.values);
      var span = hi - lo || 1;
      var pts = s.values.map(function (v, i) {
        return [pad + i * w / (s.values.length - 1 || 1), pad + h - (v - lo) / span * h];
      });
      var area = pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' ') + ' ' + (pad + w) + ',' + (pad + h) + ' ' + pad + ',' + (pad + h);
      DV.svg('polygon', { points: area, class: 'dv-mini-area ' + DV.slotClass(s.slot || 1) }, svg);
      poly(pts, DV.slotClass(s.slot || 1));
      var top = pts[s.values.indexOf(hi)];
      DV.svg('circle', { cx: top[0], cy: top[1], r: 4, class: 'dv-mini-dot ' + DV.slotClass(s.slot || 1) }, svg);
    } else if (type === 'bar' && data.series) {
      var vals = data.series[0].values;
      var max = Math.max.apply(null, vals) || 1;
      var bw = Math.min(18, w / vals.length * 0.6);
      vals.forEach(function (v, i) {
        var x = pad + i * w / vals.length + (w / vals.length - bw) / 2;
        var bh = Math.max(2, v / max * h);
        DV.svg('rect', { x: x, y: pad + h - bh, width: bw, height: bh, rx: 3,
          class: 'dv-mini-bar ' + DV.slotClass(data.series[0].slot || 1) }, svg);
      });
    } else if (type === 'pie' && data.parts) {
      var total = data.parts.reduce(function (n, p) { return n + p.value; }, 0) || 1;
      var cx = W / 2, cy = H / 2, r1 = 52, r0 = 28, a = -Math.PI / 2;
      data.parts.forEach(function (part) {
        var a1 = a + part.value / total * Math.PI * 2;
        DV.svg('path', { d: sliceArc(cx, cy, r0, r1, a + 0.02, a1 - 0.02),
          class: 'dv-mini-slice ' + DV.slotClass(part.slot || 1) }, svg);
        a = a1;
      });
    } else if (type === 'scatter' && data.points) {
      var xs = data.points.map(function (p) { return p.x; });
      var ys = data.points.map(function (p) { return p.y; });
      var xmin = Math.min.apply(null, xs), xmax = Math.max.apply(null, xs);
      var ymin = Math.min.apply(null, ys), ymax = Math.max.apply(null, ys);
      data.points.forEach(function (p) {
        var px = pad + (p.x - xmin) / ((xmax - xmin) || 1) * w;
        var py = pad + h - (p.y - ymin) / ((ymax - ymin) || 1) * h;
        DV.svg('circle', { cx: px, cy: py, r: 2.6, class: 'dv-mini-dot dv-s1' }, svg);
      });
    } else if (type === 'stacked' && data.series) {
      var n = data.x.values.length;
      var sums = data.x.values.map(function (_, i) {
        return data.series.reduce(function (n2, s2) { return n2 + s2.values[i]; }, 0);
      });
      var max2 = Math.max.apply(null, sums) || 1;
      var picks = n <= 4 ? data.x.values.map(function (_, i) { return i; }) : [0, Math.floor(n / 3), Math.floor(2 * n / 3), n - 1];
      var colW = Math.min(26, w / picks.length * 0.6);
      picks.forEach(function (ci, k) {
        var x = pad + k * w / picks.length + (w / picks.length - colW) / 2;
        var base = 0;
        data.series.forEach(function (s3) {
          var val = s3.values[ci];
          var bh = val / max2 * h;
          DV.svg('rect', { x: x, y: pad + h - (base + val) / max2 * h, width: colW, height: Math.max(1, bh - 1), rx: 2,
            class: 'dv-mini-bar ' + DV.slotClass(s3.slot || 1) }, svg);
          base += val;
        });
      });
    } else if (type === 'heatmap' && data.cells) {
      var flat = [];
      data.cells.forEach(function (r) { flat = flat.concat(r); });
      var lo2 = Math.min.apply(null, flat), hi2 = Math.max.apply(null, flat);
      var cols = data.cols.length, rows = data.rows.length;
      var cw = w / cols, ch = h / rows;
      data.cells.forEach(function (row, r) {
        row.forEach(function (v, c) {
          var bin = Math.min(4, Math.floor((v - lo2) / ((hi2 - lo2) || 1) * 5));
          DV.svg('rect', { x: pad + c * cw, y: pad + r * ch, width: cw - 1, height: ch - 1, rx: 2,
            class: 'dv-mini-cell dv-heat-' + (bin + 1) }, svg);
        });
      });
    } else if (type === 'sankey' && data.links) {
      var cols = data.columns || [];
      var nodesById = {};
      data.nodes.forEach(function (n) { nodesById[n.id] = n; });
      var inT = {}, outT = {};
      data.links.forEach(function (l) {
        outT[l.source] = (outT[l.source] || 0) + l.value;
        inT[l.target] = (inT[l.target] || 0) + l.value;
      });
      var tot = {};
      data.nodes.forEach(function (n) { tot[n.id] = Math.max(inT[n.id] || 0, outT[n.id] || 0); });
      var colTot = cols.map(function (col) {
        return col.reduce(function (sum, id) { return sum + tot[id]; }, 0);
      });
      var maxCol = Math.max.apply(null, colTot.concat([1]));
      var scale = h / maxCol;
      var pos = {};
      cols.forEach(function (col, ci) {
        var used = col.reduce(function (sum, id) { return sum + tot[id] * scale; }, 0);
        var gap = col.length > 1 ? Math.max(2, Math.min(10, (h - used) / (col.length - 1))) : 0;
        var y = pad;
        col.forEach(function (id) {
          var hh = Math.max(2, tot[id] * scale);
          pos[id] = { x: pad + ci * (w - 6) / Math.max(1, cols.length - 1), y: y, h: hh };
          y += hh + gap;
        });
      });
      var outUsed = {}, inUsed = {};
      data.links.forEach(function (link) {
        var sPos = pos[link.source], tPos = pos[link.target];
        if (!sPos || !tPos) return;
        var y0 = sPos.y + (outUsed[link.source] || 0) * scale;
        var y1 = tPos.y + (inUsed[link.target] || 0) * scale;
        outUsed[link.source] = (outUsed[link.source] || 0) + link.value;
        inUsed[link.target] = (inUsed[link.target] || 0) + link.value;
        var hh = Math.max(1, link.value * scale);
        var mid = (sPos.x + tPos.x) / 2;
        DV.svg('path', {
          d: 'M' + sPos.x + ' ' + y0 + 'C' + mid + ' ' + y0 + ' ' + mid + ' ' + y1 + ' ' + tPos.x + ' ' + y1 +
            'L' + tPos.x + ' ' + (y1 + hh) + 'C' + mid + ' ' + (y1 + hh) + ' ' + mid + ' ' + (y0 + hh) + ' ' + sPos.x + ' ' + (y0 + hh) + 'Z',
          class: 'dv-mini-linkband ' + DV.slotClass((nodesById[link.source] || {}).slot || 1)
        }, svg);
      });
      data.nodes.forEach(function (n) {
        var p2 = pos[n.id];
        if (!p2) return;
        DV.svg('rect', {
          x: p2.x - 2, y: p2.y, width: 5, height: p2.h, rx: 2,
          class: 'dv-mini-node ' + DV.slotClass(n.slot || 1)
        }, svg);
      });
    } else if (type === 'slope' && data.entities) {
      data.entities.slice(0, 5).forEach(function (e, i) {
        var y0 = pad + h * (i / 5) + 8;
        var y1 = pad + h * (((i + 2) % 5) / 5) + 8;
        DV.svg('line', { x1: pad, y1: y0, x2: W - pad, y2: y1,
          class: 'dv-mini-line ' + DV.slotClass(e.slot || (i + 1)) }, svg);
      });
    } else if (type === 'waterfall' && data.steps) {
      var running = Number(data.start_value || 0);
      var pts2 = [running];
      data.steps.forEach(function (s4) { running += s4.value; pts2.push(running); });
      var lo3 = Math.min.apply(null, pts2), hi3 = Math.max.apply(null, pts2);
      var span3 = (hi3 - lo3) || 1;
      var all = data.steps.length + 2;
      var bw2 = Math.min(16, w / all * 0.6);
      function wy(v) { return pad + h - (v - lo3) / span3 * h; }
      DV.svg('rect', { x: pad, y: wy(pts2[0]), width: bw2, height: pad + h - wy(pts2[0]), rx: 2, class: 'dv-mini-bar dv-total' }, svg);
      data.steps.forEach(function (s5, i) {
        var base = pts2[i], value = pts2[i + 1];
        var x = pad + (i + 1) * w / all + (w / all - bw2) / 2;
        DV.svg('rect', {
          x: x, y: Math.min(wy(base), wy(value)), width: bw2,
          height: Math.max(2, Math.abs(wy(base) - wy(value))), rx: 2,
          class: 'dv-mini-bar ' + (s5.value > 0 ? 'dv-pos' : 'dv-neg')
        }, svg);
      });
      var lastX = pad + (all - 1) * w / all;
      DV.svg('rect', { x: lastX, y: wy(pts2[pts2.length - 1]), width: bw2,
        height: pad + h - wy(pts2[pts2.length - 1]), rx: 2, class: 'dv-mini-bar dv-total' }, svg);
    }
    if (!svg.firstChild) {
      DV.svg('rect', { x: pad, y: pad, width: w, height: h, rx: 8, class: 'dv-mini-empty' }, svg);
    }
    return svg;
  }

  function sliceArc(cx, cy, r0, r1, a0, a1) {
    var large = a1 - a0 > Math.PI ? 1 : 0;
    var x0 = cx + r1 * Math.cos(a0), y0 = cy + r1 * Math.sin(a0);
    var x1 = cx + r1 * Math.cos(a1), y1 = cy + r1 * Math.sin(a1);
    var x2 = cx + r0 * Math.cos(a1), y2 = cy + r0 * Math.sin(a1);
    var x3 = cx + r0 * Math.cos(a0), y3 = cy + r0 * Math.sin(a0);
    return 'M' + x0 + ' ' + y0 + 'A' + r1 + ' ' + r1 + ' 0 ' + large + ' 1 ' + x1 + ' ' + y1 +
      'L' + x2 + ' ' + y2 + 'A' + r0 + ' ' + r0 + ' 0 ' + large + ' 0 ' + x3 + ' ' + y3 + 'Z';
  }

  function renderGallery() {
    S.mode = 'gallery';
    S.mark = null;
    if (S.resizeHandler) {
      window.removeEventListener('resize', S.resizeHandler);
      S.resizeHandler = null;
    }
    if (S.observer) {
      S.observer.disconnect();
      S.observer = null;
    }
    DV.clear(app);
    var head = DV.el('header', { class: 'dv-gallery-head' }, app);
    var titles = DV.el('div', {}, head);
    DV.el('h1', { class: 'dv-h1' }, titles).textContent = 'Data Visualization Playground';
    DV.el('p', { class: 'dv-h1-zh' }, titles).textContent = '数据图表英语';
    DV.el('p', { class: 'dv-tagline', lang: 'en' }, titles).textContent =
      'Explore data. Discover patterns. Learn to express.';
    DV.el('span', { class: 'badge dv-demo-badge' }, head).textContent = 'Demo data · 模拟数据';

    var chips = DV.el('nav', { class: 'dv-chips', role: 'group', 'aria-label': '图表类型' }, app);
    function chip(id, label) {
      var btn = DV.el('button', { type: 'button', 'aria-pressed': S.filter === id ? 'true' : 'false' }, chips);
      btn.textContent = label;
      btn.addEventListener('click', function () {
        S.filter = id;
        var params = id === 'all' ? '' : '?type=' + id;
        try { history.replaceState(null, '', '#/' + params); } catch (e) {}
        renderGallery();
      });
    }
    chip('all', '全部');
    G.types.forEach(function (type) { chip(type.id, type.label_zh); });

    var wall = DV.el('div', { class: 'dv-wall' }, app);
    var cards = byOrder(G.topics).filter(function (card) {
      return S.filter === 'all' || card.types.indexOf(S.filter) >= 0;
    });
    cards.forEach(function (card, index) {
      var tile = DV.el('a', {
        class: 'card dv-tile' + (index === 0 ? ' dv-tile-feature' : ''),
        href: '#/' + card.id + '/' + card.default_view,
        'aria-label': card.title_en + '，' + card.title_zh
      }, wall);
      var thumb = DV.el('span', { class: 'dv-tile-chart' }, tile);
      var primary = card.primary;
      thumb.appendChild(miniChart(primary.type, primary.data, primary.unit, card.title_en));
      var copy = DV.el('span', { class: 'dv-tile-copy' }, tile);
      DV.el('span', { class: 'dv-tile-en', lang: 'en' }, copy).textContent = card.title_en;
      DV.el('span', { class: 'dv-tile-zh' }, copy).textContent = card.title_zh;
      DV.el('span', { class: 'dv-tile-blurb' }, copy).textContent = card.blurb_zh || '';
      tile.addEventListener('click', function (event) {
        event.preventDefault();
        pushRoute([card.id, card.default_view]);
      });
    });
    if (!cards.length) DV.el('p', { class: 'dv-empty' }, app).textContent = '这个类型还没有图。';
  }

  // ------------------------------------------------------------ tooltip
  function ensureTooltip() {
    if (!tooltip) {
      tooltip = DV.el('div', { class: 'dv-tooltip', 'aria-hidden': 'true' }, document.body);
    }
    return tooltip;
  }

  function showTip(feature, event) {
    var node = ensureTooltip();
    if (!feature) { node.classList.remove('is-open'); return; }
    DV.clear(node);
    var slots = feature.slots || {};
    var value = slots.value || slots.share || (slots.from && slots.to ? slots.from + ' → ' + slots.to : '');
    DV.el('p', { class: 'dv-tip-value', lang: 'en' }, node).textContent = value || '';
    var entry = (S.library && S.library.features || {})[feature.kind];
    var bits = [];
    [slots.category, slots.period, entry && entry.label_zh].forEach(function (bit) {
      if (bit && bits.indexOf(bit) < 0) bits.push(bit);
    });
    DV.el('p', { class: 'dv-tip-label' }, node).textContent = bits.join(' · ');
    if (entry && entry.words && entry.words[0]) {
      DV.el('p', { class: 'dv-tip-say', lang: 'en' }, node).textContent = '“' + entry.words[0].en + '”';
    }
    var x = 0, y = 0;
    if (event && event.clientX) { x = event.clientX + 16; y = event.clientY + 16; }
    else {
      var rect = event && event.target && event.target.getBoundingClientRect
        ? event.target.getBoundingClientRect() : null;
      x = rect ? rect.right + 8 : 20;
      y = rect ? rect.top : 20;
    }
    node.style.left = Math.max(8, Math.min(x, window.innerWidth - 250)) + 'px';
    node.style.top = Math.max(8, Math.min(y, window.innerHeight - 130)) + 'px';
    node.classList.add('is-open');
  }

  // ------------------------------------------------------------ workspace
  function renderLoading() {
    S.mode = 'workspace';
    DV.clear(app);
    var shell = DV.el('div', { class: 'dv-workspace dv-loading-shell' }, app);
    DV.el('div', { class: 'card dv-chart-card' }, shell).textContent = '载入中…';
    DV.el('div', { class: 'card dv-panel' }, shell).textContent = '载入中…';
  }

  function renderError(message) {
    DV.clear(app);
    var box = DV.el('div', { class: 'card dv-error', role: 'alert' }, app);
    DV.el('h2', {}, box).textContent = '没加载出来。';
    DV.el('p', {}, box).textContent = message || '';
    var retry = DV.el('button', { class: 'pill', type: 'button' }, box);
    retry.textContent = '重试';
    retry.addEventListener('click', function () { route(); });
    var back = DV.el('a', { class: 'pill', href: '#/' }, box);
    back.textContent = '回图表墙';
  }

  function renderWorkspace() {
    if (S.observer) {
      S.observer.disconnect();
      S.observer = null;
    }
    var topic = currentTopic();
    var view = currentView();
    if (!topic || !view) { renderGallery(); return; }
    S.mode = 'workspace';
    DV.clear(app);
    var order = byOrder(G.topics);
    var idx = order.map(function (t) { return t.id; }).indexOf(topic.id);
    var prev = order[(idx - 1 + order.length) % order.length];
    var next = order[(idx + 1) % order.length];

    var top = DV.el('div', { class: 'toolbar dv-topbar' }, app);
    var wallLink = DV.el('a', { class: 'dv-wall-link', href: '#/' }, top);
    wallLink.textContent = '图表墙';
    var nav = DV.el('div', { class: 'dv-topic-nav' }, top);
    function step(target, label, dir) {
      var link = DV.el('a', { class: 'dv-step', href: '#/' + target.id + '/' + target.default_view,
        'aria-label': label }, nav);
      link.textContent = dir;
    }
    step(prev, '上一个主题：' + prev.title_zh, '‹');
    var topicBtn = DV.el('button', { class: 'dv-topic-btn', type: 'button', 'aria-haspopup': 'dialog' }, nav);
    DV.el('span', { class: 'dv-topic-zh' }, topicBtn).textContent = topic.title_zh;
    DV.el('span', { class: 'dv-topic-en', lang: 'en' }, topicBtn).textContent = topic.title_en;
    DV.el('span', { class: 'dv-chev', 'aria-hidden': 'true' }, topicBtn).textContent = '▾';
    step(next, '下一个主题：' + next.title_zh, '›');

    var dialog = DV.el('dialog', { class: 'dv-topic-dialog', 'aria-label': '换主题' }, app);
    var dhead = DV.el('header', { class: 'dv-dialog-head' }, dialog);
    DV.el('h2', {}, dhead).textContent = '换主题';
    var close = DV.el('button', { class: 'dv-dialog-close', type: 'button', 'aria-label': '关闭' }, dhead);
    close.textContent = '关闭';
    var list = DV.el('div', { class: 'dv-topic-list' }, dialog);
    order.forEach(function (item) {
      var link = DV.el('a', {
        class: 'dv-topic-item', href: '#/' + item.id + '/' + item.default_view,
        'aria-current': item.id === topic.id ? 'page' : null
      }, list);
      DV.el('span', { class: 'dv-topic-item-en', lang: 'en' }, link).textContent = item.title_en;
      DV.el('span', { class: 'dv-topic-item-zh' }, link).textContent = item.title_zh;
      link.addEventListener('click', function () { dialog.close(); });
    });
    topicBtn.addEventListener('click', function () { dialog.showModal(); });
    close.addEventListener('click', function () { dialog.close(); });
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) dialog.close();
    });

    var grid = DV.el('div', { class: 'dv-workspace' }, app);
    var chartCard = DV.el('section', {
      class: 'card dv-chart-card' + (S.editOpen ? ' is-editing' : ''),
      'aria-labelledby': 'chart-title'
    }, grid);
    var chead = DV.el('header', { class: 'dv-chart-head' }, chartCard);
    var titles = DV.el('div', { class: 'dv-chart-titles' }, chead);
    DV.el('h2', { id: 'chart-title', lang: 'en' }, titles).textContent = topic.title_en;
    DV.el('p', { class: 'dv-chart-zh' }, titles).textContent = topic.title_zh;
    if (view.subtitle_en) DV.el('p', { class: 'dv-chart-sub', lang: 'en' }, titles).textContent = view.subtitle_en;
    DV.el('span', { class: 'badge' }, chead).textContent = 'Demo data · 模拟数据';

    if (topic.views.length > 1) {
      var views = DV.el('nav', { class: 'seg dv-views', 'aria-label': '切换视图' }, chartCard);
      topic.views.forEach(function (v) {
        var link = DV.el('a', { href: '#/' + topic.id + '/' + v.id,
          'aria-current': v.id === view.id ? 'page' : null }, views);
        link.textContent = v.label_zh || v.id;
      });
    }

    var legendHost = DV.el('div', { class: 'dv-legend', role: 'group', 'aria-label': '数据系列' }, chartCard);
    var figure = DV.el('figure', { class: 'dv-figure' }, chartCard);
    var chartHost = DV.el('div', { class: 'dv-chart-host' }, figure);
    var tableWrap = DV.el('div', { class: 'dv-table', hidden: 'hidden' }, chartCard);
    var editorHost = DV.el('div', { class: 'dv-data-host' }, chartCard);
    editorHost.hidden = true;
    var foot = DV.el('footer', { class: 'dv-chart-foot' }, chartCard);
    var editBtn = DV.el('button', {
      class: 'pill dv-edit-toggle', type: 'button',
      'aria-expanded': S.editOpen ? 'true' : 'false'
    }, foot);
    editBtn.textContent = S.editOpen ? '收起数据' : '编辑数据';
    var tableBtn = DV.el('button', { class: 'pill dv-table-toggle', type: 'button',
      'aria-expanded': S.table ? 'true' : 'false' }, foot);
    tableBtn.textContent = S.table ? '看图' : '看表格';

    var peek = DV.el('div', { class: 'dv-peek', hidden: 'hidden' }, chartCard);
    var peekText = DV.el('span', { class: 'dv-peek-label', lang: 'en' }, peek);
    var peekBtn = DV.el('button', { class: 'pill dv-peek-btn', type: 'button' }, peek);
    peekBtn.textContent = '看说法';

    var panelHost = DV.el('aside', { class: 'card dv-panel' }, grid);
    var live = DV.el('div', { class: 'dv-live', 'aria-live': 'polite', 'aria-atomic': 'true' }, app);

    var key = topic.id + '/' + view.id;

    function entry() { return S.edited[key]; }
    function dataNow() { var e = entry(); return e ? e.data : view.data; }
    function runtimeNow() { return DV.liveView(view, dataNow()); }
    function editedNow() { return !!(entry() && entry().dirty !== false); }

    function visibleRuntime() {
      var runtime = runtimeNow();
      var hidden = S.hidden[key] || {};
      if ((view.type === 'line' || view.type === 'bar') && runtime.data.series) {
        var series = runtime.data.series.filter(function (s) { return !hidden[s.id]; });
        if (!series.length) {
          S.hidden[key] = {};
          return runtime;
        }
        if (series.length !== runtime.data.series.length) {
          return Object.assign({}, runtime, {
            data: Object.assign({}, runtime.data, { series: series })
          });
        }
      }
      return runtime;
    }

    function currentFeatures(runtime) {
      var hidden = S.hidden[key] || {};
      var filtered = Object.keys(hidden).some(function (id) { return hidden[id]; });
      return editedNow() || filtered ? DV.compute.view(runtime) : view.features;
    }

    function selectionMarks() {
      var feature = featureFor(S.mark);
      if (!feature) return null;
      var marks = (feature.marks || []).slice();
      if (view.type === 'scatter' && S.mark) {
        if (S.mark === 'all') {
          ((dataNow().points) || []).forEach(function (point) {
            marks.push('pt:' + point.id);
          });
        } else if (S.mark.indexOf('grp:') === 0) {
          var gid = S.mark.slice(4);
          ((dataNow().points) || []).forEach(function (point) {
            if (point.group === gid) marks.push('pt:' + point.id);
          });
        }
      }
      return marks;
    }

    function paintLegend() {
      DV.clear(legendHost);
      var runtime = runtimeNow();
      var data = runtime.data || {};
      var hidden = S.hidden[key] || {};
      var items = [];
      if (data.series && data.series.length > 1
          && (view.type === 'line' || view.type === 'bar' || view.type === 'stacked')) {
        var stacked = view.type === 'stacked';
        data.series.forEach(function (s) {
          items.push({ id: s.id, name: s.name_en, slot: s.slot,
            kind: stacked ? 'component' : 'series',
            shape: view.type === 'line' ? 'line' : 'rect' });
        });
      } else if (view.type === 'pie' && data.parts) {
        data.parts.forEach(function (p) {
          items.push({ id: p.id, name: p.name_en, slot: p.slot, kind: 'slice', shape: 'rect' });
        });
      } else if (view.type === 'scatter' && data.groups && data.groups.length > 1) {
        data.groups.forEach(function (g) {
          items.push({ id: g.id, name: g.name_en, slot: g.slot, kind: 'group', shape: 'dot' });
        });
      }
      legendHost.hidden = !items.length;
      items.forEach(function (item) {
        var btn = DV.el('button', { class: 'dv-legend-item', type: 'button',
          'aria-pressed': item.kind === 'series' ? (hidden[item.id] ? 'false' : 'true') : 'false' }, legendHost);
        DV.el('span', { class: 'dv-key dv-key-' + (item.shape || 'line') + ' ' + DV.slotClass(item.slot || 1) }, btn);
        DV.el('span', { lang: 'en' }, btn).textContent = item.name;
        btn.addEventListener('click', function () {
          if (item.kind === 'series') {
            var visible = data.series.filter(function (s) {
              return !hidden[s.id] || s.id === item.id;
            });
            if (hidden[item.id] !== true && visible.length <= 1) return;
            hidden[item.id] = !hidden[item.id];
            S.hidden[key] = hidden;
            if (S.mark && S.mark.indexOf(':' + item.id + ':') >= 0) S.mark = null;
            paintLegend();
            renderChart();
            paintPanel();
          } else if (item.kind === 'component') {
            var series = data.series.filter(function (s) { return s.id === item.id; })[0];
            if (!series) return;
            var best = 0;
            var bestValue = -Infinity;
            (data.x.values || []).forEach(function (_, i) {
              if (series.values[i] > bestValue) {
                bestValue = series.values[i];
                best = i;
              }
            });
            select('seg:' + best + ':' + item.id);
          } else if (item.kind === 'slice') {
            select('slice:' + item.id);
          } else {
            select('grp:' + item.id);
          }
        });
      });
    }

    function renderChart() {
      var runtime = visibleRuntime();
      S.featureIndex = DV.featureIndex(currentFeatures(runtime));
      if (S.mark && !S.featureIndex[S.mark]) S.mark = null;
      DV.clear(chartHost);
      chartHost.classList.remove('dv-scroll');
      var renderer = DV.renderers[view.type](chartHost, runtime, {
        select: select,
        hover: function (mark, event) { showTip(S.featureIndex[mark], event); },
        editMode: S.editOpen,
        commitValue: commitValue
      });
      S.renderer = renderer;
      var svgNode = chartHost.querySelector('svg');
      if (svgNode) svgNode.classList.toggle('is-editing', !!S.editOpen);
      renderer.setSelected(S.mark, selectionMarks());
      if (S.table) paintTable();
    }

    function commitValue(mark, value) {
      var parts = String(mark).split(':');
      if (view.type === 'bar' && parts[0] === 'bar') {
        applyEdit(function (next) {
          var series = next.series.filter(function (s) { return s.id === parts[1]; })[0];
          if (series) series.values[Number(parts[2])] = value;
        }, false);
      } else if (view.type === 'line' && parts[0] === 'pt') {
        applyEdit(function (next) {
          var series = next.series.filter(function (s) { return s.id === parts[1]; })[0];
          if (series) series.values[Number(parts[2])] = value;
        }, false);
      } else if (view.type === 'scatter' && parts[0] === 'pt') {
        applyEdit(function (next) {
          var point = next.points.filter(function (p) { return p.id === parts[1]; })[0];
          if (point) { point.x = value.x; point.y = value.y; }
        }, false);
      } else {
        return;
      }
      paintEditor();
      if (S.mark !== mark) select(mark);
    }

    function paintPanel() {
      var runtime = visibleRuntime();
      DV.panel.render(panelHost, {
        view: runtime,
        features: currentFeatures(runtime),
        feature: featureFor(S.mark),
        library: S.library,
        edited: editedNow(),
        scratch: S.scratch[key] || '',
        register: S.register,
        tab: S.tab,
        level: S.level,
        revealed: S.revealed,
        onScratch: function (value) { S.scratch[key] = value; },
        onRegister: function (reg) {
          S.register = reg;
          DV.store.set('npesl-dataviz-reg', reg);
          replaceRoute([topic.id, view.id]);
          paintPanel();
        },
        onTab: function (tab) {
          S.tab = tab;
          DV.store.set('npesl-dataviz-tab', tab);
          replaceRoute([topic.id, view.id]);
          paintPanel();
        },
        onLevel: function (level) { S.level = level; paintPanel(); },
        onReveal: function (open) { S.revealed = open; paintPanel(); },
        onClear: function () { select(null); }
      });
      if (S.mark) {
        var f = featureFor(S.mark);
        peekText.textContent = f ? (f.slots.value || f.slots.share
          || (f.slots.from && f.slots.to ? f.slots.from + ' → ' + f.slots.to : '')) : '';
        peek.hidden = false;
      } else {
        peek.hidden = true;
      }
    }

    function select(mark) {
      S.mark = mark && S.featureIndex[mark] ? mark : null;
      S.revealed = false;
      if (S.renderer) S.renderer.setSelected(S.mark, selectionMarks());
      replaceRoute([topic.id, view.id]);
      paintPanel();
      if (S.mark) {
        var f = featureFor(S.mark);
        live.textContent = '已选：' + (f && (f.slots.value || f.slots.share || f.slots.period) || '');
      } else {
        live.textContent = '已回到整张图';
      }
    }

    function paintTable() {
      var data = S.renderer && S.renderer.table ? S.renderer.table() : null;
      DV.clear(tableWrap);
      if (!data) return;
      var table = DV.el('table', {}, tableWrap);
      DV.el('caption', {}, table).textContent = topic.title_en;
      var thead = DV.el('thead', {}, table);
      var tr = DV.el('tr', {}, thead);
      data.head.forEach(function (h) { DV.el('th', { scope: 'col' }, tr).textContent = h; });
      var tbody = DV.el('tbody', {}, table);
      data.rows.forEach(function (row) {
        var r = DV.el('tr', {}, tbody);
        row.forEach(function (cell, i) {
          var td = i === 0 ? DV.el('th', { scope: 'row' }, r) : DV.el('td', {}, r);
          td.textContent = cell;
        });
      });
    }

    function applyTable() {
      figure.hidden = S.table;
      tableWrap.hidden = !S.table;
      tableBtn.setAttribute('aria-expanded', S.table ? 'true' : 'false');
      tableBtn.textContent = S.table ? '看图' : '看表格';
      if (S.table) paintTable();
    }

    function syncEditorTools() {
      var undo = editorHost.querySelector('.dv-data-undo');
      var reset = editorHost.querySelector('.dv-data-reset');
      var canUndo = !!(entry() && entry().history.length);
      var canRedo = !!(entry() && entry().future && entry().future.length);
      if (undo) {
        undo.disabled = !canUndo;
        undo.setAttribute('aria-disabled', canUndo ? 'false' : 'true');
      }
      var redo = editorHost.querySelector('.dv-data-redo');
      if (redo) {
        redo.disabled = !canRedo;
        redo.setAttribute('aria-disabled', canRedo ? 'false' : 'true');
      }
      if (reset) {
        reset.disabled = !editedNow();
        reset.setAttribute('aria-disabled', editedNow() ? 'false' : 'true');
      }
    }

    function paintEditor() {
      if (!S.editOpen) {
        editorHost.hidden = true;
        return;
      }
      editorHost.hidden = false;
      var runtime = runtimeNow();
      DV.editor.render(editorHost, {
        data: dataNow(),
        type: view.type,
        unit: runtime.unit,
        subject: runtime.subject,
        edited: editedNow(),
        canUndo: !!(entry() && entry().history.length),
        canRedo: !!(entry() && entry().future && entry().future.length),
        onChange: applyEdit,
        onUndo: undoEdit,
        onRedo: redoEdit,
        onReset: resetEdit
      });
    }

    var lastEditAt = 0;

    function applyEdit(mutator, structural) {
      var before = dataNow();
      var next = DV.clone(before);
      mutator(next);
      var current = entry();
      var history = current ? current.history.slice() : [];
      var now = Date.now();
      // A typing burst is one undo step; structural edits always get their own.
      if (structural || !current || now - lastEditAt > 700) {
        history.push(DV.clone(before));
        if (history.length > 40) history.shift();
      }
      lastEditAt = now;
      S.edited[key] = { data: next, history: history, future: [], dirty: true };
      S.revealed = false;
      if (structural) {
        S.mark = null;
        showTip(null);
      }
      paintLegend();
      renderChart();
      paintPanel();
      syncEditorTools();
      if (structural) paintEditor();
    }

    function undoEdit() {
      var current = entry();
      if (!current || !current.history.length) return;
      lastEditAt = 0;
      var history = current.history.slice();
      var previous = history.pop();
      var future = (current.future || []).slice();
      future.push(DV.clone(current.data));
      if (history.length) {
        S.edited[key] = { data: previous, history: history, future: future, dirty: true };
      } else {
        S.edited[key] = { data: DV.clone(view.data), history: [], future: future, dirty: false };
      }
      S.revealed = false;
      paintLegend();
      renderChart();
      paintPanel();
      paintEditor();
    }

    function redoEdit() {
      var current = entry();
      if (!current || !current.future || !current.future.length) return;
      lastEditAt = 0;
      var future = current.future.slice();
      var next = future.pop();
      var history = current.history.slice();
      history.push(DV.clone(current.data));
      if (history.length > 40) history.shift();
      S.edited[key] = { data: next, history: history, future: future, dirty: true };
      S.revealed = false;
      paintLegend();
      renderChart();
      paintPanel();
      paintEditor();
    }

    function resetEdit() {
      if (!editedNow()) return;
      lastEditAt = 0;
      var current = entry();
      var history = ((current && current.history) || []).slice();
      history.push(DV.clone(dataNow()));
      if (history.length > 40) history.shift();
      S.edited[key] = {
        data: DV.clone(view.data),
        history: history,
        future: [],
        dirty: false
      };
      S.revealed = false;
      paintLegend();
      renderChart();
      paintPanel();
      paintEditor();
    }

    function toggleEditor() {
      S.editOpen = !S.editOpen;
      editBtn.textContent = S.editOpen ? '收起数据' : '编辑数据';
      editBtn.setAttribute('aria-expanded', S.editOpen ? 'true' : 'false');
      chartCard.classList.toggle('is-editing', S.editOpen);
      paintEditor();
      renderChart();
    }

    editBtn.addEventListener('click', toggleEditor);
    tableBtn.addEventListener('click', function () { S.table = !S.table; applyTable(); });
    peekBtn.addEventListener('click', function () {
      panelHost.scrollIntoView({ behavior: DV.prefersReduced() ? 'auto' : 'smooth', block: 'start' });
      var tab = panelHost.querySelector('[role="tab"][aria-selected="true"]');
      if (tab) tab.focus({ preventScroll: true });
    });

    paintLegend();
    renderChart();
    applyTable();
    paintPanel();
    paintEditor();
    S.commitValue = commitValue;
    S.select = select;
    if (!S.mark) live.textContent = '已打开：' + topic.title_zh;
  }

  function buildFeatureIndex(view) {
    var index = {};
    (view.features || []).forEach(function (f) {
      (f.marks || []).forEach(function (mark) { index[mark] = f; });
    });
    return index;
  }

  // ------------------------------------------------------------ routing
  function route() {
    var r = parseRoute();
    if (!r.parts.length) {
      if (r.q.type) S.filter = r.q.type;
      renderGallery();
      return;
    }
    var slug = r.parts[0];
    var card = topicCard(slug);
    if (!card) {
      S.filter = 'all';
      renderGallery();
      DV.el('p', { class: 'dv-notice' }, app).textContent = '没找到这个主题。';
      return;
    }
    S.topic = slug;
    S.view = r.parts[1] || null;
    S.mark = null;
    applyQuery(r.q);
    renderLoading();
    ensureTopic(slug).then(function () {
      var topic = TOPICS[slug];
      if (!S.view) S.view = topic.views[0].id;
      var view = topic.views.filter(function (v) { return v.id === S.view; })[0];
      if (!view) S.view = topic.views[0].id;
      view = topic.views.filter(function (v) { return v.id === S.view; })[0];
      return ensureLang(view.type).then(function () {
        S.library = LANGS[view.type];
      });
    }).then(function () {
      renderWorkspace();
    }).catch(function (error) {
      if (window.console && console.error) console.error(error && error.stack || error);
      renderError(String(error && (error.stack || error.message) || error));
    });
  }

  // ------------------------------------------------------------ boot
  function boot() {
    app = document.getElementById('app');
    if (!app) return;
    if (!G.topics || !G.topics.length) {
      app.textContent = '没有内容。';
      return;
    }
    document.addEventListener('click', function (event) {
      if (!tooltip || !tooltip.classList.contains('is-open')) return;
      if (!event.target.closest || !event.target.closest('[data-mark]')) {
        tooltip.classList.remove('is-open');
      }
    });
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || S.mode !== 'workspace') return;
      if (tooltip) tooltip.classList.remove('is-open');
      var clear = app.querySelector('.dv-clear');
      if (S.mark && clear) { clear.click(); return; }
      if (S.editOpen) {
        var edit = app.querySelector('.dv-edit-toggle');
        if (edit) edit.click();
      }
    });
    window.addEventListener('hashchange', route);
    window.__dv = {
      bootId: BOOT_ID,
      snapshot: function () {
        return {
          mode: S.mode, topic: S.topic, view: S.view, mark: S.mark,
          kind: featureFor(S.mark) ? featureFor(S.mark).kind : null,
          tab: S.tab, register: S.register, level: S.level,
          revealed: S.revealed, table: S.table, editOpen: S.editOpen,
          edited: !!((S.edited[(S.topic || '') + '/' + (S.view || '')] || {}).dirty !== false
            && S.edited[(S.topic || '') + '/' + (S.view || '')]),
          topics: G.topics.length
        };
      },
      data: function () {
        if (!S.topic || !S.view) return null;
        var entry = S.edited[S.topic + '/' + S.view];
        return entry ? JSON.parse(JSON.stringify(entry.data)) : null;
      },
      select: function (mark) {
        if (S.select && S.featureIndex[mark]) { S.select(mark); return; }
        var node = app.querySelector('[data-mark="' + String(mark).replace(/"/g, '\\"') + '"]');
        if (node) node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      },
      clear: function () {
        var btn = app.querySelector('.dv-clear');
        if (btn) btn.click();
      },
      setRegister: function (reg) {
        var btns = app.querySelectorAll('.dv-register button');
        for (var i = 0; i < btns.length; i++) {
          if (btns[i].textContent === ({ general: '通用', ielts: '雅思', business: '商务' }[reg])) btns[i].click();
        }
      },
      reveal: function () {
        var btn = app.querySelector('.dv-reveal');
        if (btn) btn.click();
      },
      table: function () {
        var btn = app.querySelector('.dv-table-toggle');
        if (btn) btn.click();
      },
      edit: function (open) {
        var want = open == null ? !S.editOpen : !!open;
        if (want === S.editOpen) return;
        var btn = app.querySelector('.dv-edit-toggle');
        if (btn) btn.click();
      },
      resetData: function () {
        var btn = app.querySelector('.dv-data-reset');
        if (btn && !btn.disabled) btn.click();
      },
      undoData: function () {
        var btn = app.querySelector('.dv-data-undo');
        if (btn && !btn.disabled) btn.click();
      },
      redoData: function () {
        var btn = app.querySelector('.dv-data-redo');
        if (btn && !btn.disabled) btn.click();
      },
      setMark: function (mark, value) {
        if (S.commitValue) S.commitValue(mark, value);
      }
    };
    route();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.DV);
