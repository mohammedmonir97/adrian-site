/* Adrian sales site — every interactive scene on the page.
   Each scene only runs while it is on screen; nothing loops in a hidden tab. */
(function () {
  'use strict';
  const AC = window.AdrianChart;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const money = v => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(2) + '$';
  const usd = v => Math.abs(v).toFixed(2) + '$';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* run cb(true/false) when el enters / leaves the screen */
  function watch(el, cb, margin) {
    const io = new IntersectionObserver(es => es.forEach(e => cb(e.isIntersecting)), { rootMargin: margin || '0px' });
    io.observe(el); return io;
  }
  /* a ticker that only ticks while its scene is visible and the tab is shown */
  function ticker(ms, fn) {
    let id = 0, live = false;
    const on = () => { if (!id && live && !document.hidden) id = setInterval(fn, ms); };
    const off = () => { clearInterval(id); id = 0; };
    document.addEventListener('visibilitychange', () => (document.hidden ? off() : on()));
    return { set(v) { live = v; v ? on() : off(); }, get live() { return live; } };
  }

  /* candles in "R units" (entry = 0, stop distance = 1) that follow way-points,
     never going below floor(i, state). Returns [{o,h,l,c}] in units. */
  function walk(seed, ways, noise, floor) {
    const r = AC.rng(seed), out = []; let p = 0, base = 0;
    const st = { hi: -Infinity };
    for (const [to, n] of ways) {
      const from = base;
      for (let j = 1; j <= n; j++) {
        const i = out.length, f = floor ? floor(i, st) : -Infinity;
        const o = p;
        let c = from + (to - from) * (j / n) + (r() - 0.5) * noise;
        let h = Math.max(o, c) + r() * noise * 0.6, l = Math.min(o, c) - r() * noise * 0.6;
        c = Math.max(c, f + noise * 0.15); l = Math.max(l, f); h = Math.max(h, o, c);
        l = Math.min(l, o, c);
        out.push({ o, h, l, c }); p = c; st.hi = Math.max(st.hi, h);
      }
      base = to;
    }
    return out;
  }
  const toPrice = (u, entry, d, side) => {
    const m = x => entry + side * x * d;
    return u.map(k => side > 0 ? { o: m(k.o), h: m(k.h), l: m(k.l), c: m(k.c) } : { o: m(k.o), h: m(k.l), l: m(k.h), c: m(k.c) });
  };

  /* ================================================== header + hero reveal */
  const top = $('#top');
  const onScroll = () => top.classList.toggle('solid', scrollY > 20);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  const hero = $('#hero');
  const reveal = () => { if (hero.classList.contains('in')) return; void hero.offsetWidth; hero.classList.add('in'); };
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(reveal);
  setTimeout(reveal, 700);

  /* ================================================== hero: create a trade */
  (function heroDemo() {
    const cv = $('#heroCv'), host = $('#heroHost'), tk = $('#ticket');
    const chart = new AC.Chart(cv, { digits: 2, axisW: 74 });
    const LOT_USD = 100, STEP = 0.01, HIST = 120;
    const S = { side: 1, R: 20, k: 3, d: 3, live: false, be: false, seed: 7 };
    let hist, ei, lot, dEff, entry;

    const els = {
      risk: $('#risk'), loss: $('#rLoss'), win: $('#rWin'), lot: $('#rLot'), snap: $('#snap'), exec: $('#exec'),
      px: $('#hPx'), pl: $('#plNow'), stRisk: $('#stRisk'), st: [$('#st1'), $('#st2'), $('#st3')], st3t: $('#st3t'), hint: $('#hint'),
    };

    function fresh() {
      hist = AC.genCandles(HIST, S.seed, 2384.6, 1.15);
      chart.setData(hist.slice());
      ei = HIST - 1;
      fit();
    }
    /* how many candles fit: fewer on a phone so the trade area stays readable */
    function fit() {
      const n = clamp(Math.round(chart.plotW / 8), 34, 96), fut = Math.round(n * 0.32);
      const last = chart.data.length - 1;
      chart.view(last - n + 1, last + 1 + fut);
    }
    let fitT = 0;
    new ResizeObserver(() => { clearTimeout(fitT); fitT = setTimeout(() => { if (!S.live) fit(); }, 120); }).observe(host);

    /* the Adrian rule: lot from the money, then the stop re-solved so the loss is exact */
    function solve() {
      lot = Math.max(STEP, Math.round(S.R / (LOT_USD * S.d) / STEP) * STEP);
      lot = Math.round(lot * 100) / 100;
      dEff = S.R / (LOT_USD * lot);
      entry = chart.data[ei].c;
    }

    const shade = { from: 0, to: null, p1: 0, p2: 0, fill: 'rgba(198,40,40,.16)' };
    const shadeW = { from: 0, to: null, p1: 0, p2: 0, fill: 'rgba(27,138,60,.16)' };
    const lE = { p: 0, color: '#5a8dee', dash: [6, 4], text: '', tag: true };
    const lS = { p: 0, color: '#c62828', width: 2, text: '', tag: true };
    const lT = { p: 0, color: '#1b8a3c', width: 2, text: '', tag: true };
    for (const L of [lE, lS, lT]) Object.defineProperty(L, 'x0', { get: () => chart.x(ei) - chart.slot() / 2 });

    function paint() {
      solve();
      const sl = S.be ? entry : entry - S.side * dEff, tp = entry + S.side * dEff * S.k;
      shade.from = shadeW.from = ei;
      shade.p1 = entry; shade.p2 = sl; shadeW.p1 = entry; shadeW.p2 = tp;
      lE.p = entry; lE.text = '';
      lS.p = sl; lS.color = S.be ? '#2e9d5a' : '#c62828'; lS.text = S.be ? 'الوقف عند الدخول  0.00$' : 'وقف  ' + money(-S.R);
      lT.p = tp; lT.text = 'هدف  ' + money(S.R * S.k);
      chart.lines = [lE, lS, lT];
      chart.zones = S.be ? [shadeW] : [shade, shadeW];
      if (!drag) chart.keep = [sl, tp];
      chart.req();
      els.loss.textContent = money(-S.R); els.win.textContent = money(S.R * S.k);
      els.lot.textContent = lot.toFixed(2) + ' لوت';
      els.exec.textContent = S.side > 0 ? 'نفّذ صفقة الشراء' : 'نفّذ صفقة البيع';
      els.exec.className = 'exec ' + (S.side > 0 ? 'buy' : 'sell');
      els.px.textContent = AC.fmt(chart.data[chart.data.length - 1].c, 2);
    }

    function press(group, val) {
      $$('button', group).forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.v === val)));
    }

    /* ---- ticket controls ---- */
    $$('.side button', tk).forEach(b => b.addEventListener('click', () => {
      S.side = +b.dataset.side;
      $$('.side button', tk).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      els.snap.textContent = S.side > 0 ? 'شراء: الوقف تحت سعر الدخول، والهدف فوقه.' : 'بيع: الوقف فوق سعر الدخول، والهدف تحته.';
      paint();
    }));
    els.risk.addEventListener('input', () => {
      const v = parseFloat(els.risk.value.replace(/[^\d.]/g, ''));
      if (!isFinite(v) || v <= 0) return;
      S.R = clamp(v, 1, 5000); press($('#riskChips'), S.R); paint();
      els.snap.innerHTML = 'كتبت <b>' + usd(S.R) + '</b>. أدريان حسب الحجم <b>' + lot.toFixed(2) + ' لوت</b> وضبط الوقف حتى تكون الخسارة ' + usd(S.R) + ' بالضبط.';
    });
    els.risk.addEventListener('blur', () => { els.risk.value = String(+S.R.toFixed(2)); });
    $$('#riskChips button').forEach(b => b.addEventListener('click', () => {
      S.R = +b.dataset.v; els.risk.value = b.dataset.v; press($('#riskChips'), S.R); paint();
      els.snap.innerHTML = 'الخسارة عند الوقف <b>' + usd(S.R) + '</b> بالضبط، والحجم <b>' + lot.toFixed(2) + ' لوت</b>.';
    }));
    $$('#rrChips button').forEach(b => b.addEventListener('click', () => {
      S.k = +b.dataset.v; press($('#rrChips'), S.k); paint();
      els.snap.innerHTML = 'الهدف الآن <b>' + S.k + ' أضعاف</b> مخاطرتك: <b>' + money(S.R * S.k) + '</b>.';
    }));

    /* ---- drag the stop or the target on the chart ---- */
    let drag = null;
    const near = y => {
      if (S.live) return null;
      const ys = chart.y(lS.p), yt = chart.y(lT.p);
      if (Math.abs(y - ys) < 12) return 'sl';
      if (Math.abs(y - yt) < 12) return 'tp';
      return null;
    };
    const localY = e => e.clientY - cv.getBoundingClientRect().top;
    cv.addEventListener('pointermove', e => {
      const y = localY(e);
      if (!drag) { cv.style.cursor = near(y) ? 'ns-resize' : 'default'; return; }
      const p = chart.p(y);
      if (drag === 'sl') {
        const raw = clamp(S.side * (entry - p), 0.6, 30);
        S.d = raw; paint();
        els.snap.innerHTML = 'سحبت الوقف إلى <b class="num">' + AC.fmt(entry - S.side * raw, 2) + '</b>. الحجم <b>' + lot.toFixed(2) +
          ' لوت</b>، فضبط أدريان الوقف إلى <b class="num">' + AC.fmt(entry - S.side * dEff, 2) + '</b> لتبقى الخسارة <b>' + usd(S.R) + '</b> بالضبط.';
      } else {
        S.k = clamp(Math.round(S.side * (p - entry) / dEff * 10) / 10, 0.5, 8);
        press($('#rrChips'), S.k); paint();
        els.snap.innerHTML = 'الهدف <b>' + S.k.toFixed(1) + ' أضعاف</b> المخاطرة: <b>' + money(S.R * S.k) + '</b> عند الوصول إليه.';
      }
    });
    cv.addEventListener('pointerdown', e => {
      const w = near(localY(e)); if (!w) return;
      drag = w; cv.setPointerCapture(e.pointerId); e.preventDefault();
      chart.fixed = [chart.lo, chart.hi];
      els.hint.classList.add('gone');
    });
    const endDrag = () => { if (!drag) return; drag = null; chart.fixed = null; paint(); };
    cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);

    /* ---- the market breathes before you click ---- */
    const breathe = ticker(650, () => {
      if (S.live || drag) return;
      const r = Math.random, c = chart.data[ei];
      const nc = c.c + (r() - 0.5) * 0.5;
      c.c = nc; c.h = Math.max(c.h, nc); c.l = Math.min(c.l, nc);
      paint();
    });
    watch(host, v => breathe.set(v && !calm));

    /* ---- execute: the scripted market that shows the guardian ---- */
    let play = null;
    function plan() {
      const k = S.k, sub = 4;
      const ways = [[-0.42, 5], [0.55, 4], [1.12, 4], [0.5, 4], [k + 0.3, Math.max(6, Math.round(k * 4))]];
      const r = AC.rng(S.seed * 31 + 5);
      const pts = []; let p = 0, base = 0, beHit = false;
      for (const [to, n] of ways) {
        for (let j = 1; j <= n * sub; j++) {
          let q = base + (to - base) * (j / (n * sub)) + (r() - 0.5) * 0.16;
          const floor = beHit ? 0.14 : -0.82;
          q = Math.max(q, floor);
          if (q >= 1) beHit = true;
          pts.push(Math.min(q, k)); p = q;
          if (q >= k) return pts;
        }
        base = to;
      }
      pts.push(k); return pts;
    }
    function execute() {
      if (S.live) return;
      solve();
      S.live = true; S.be = false; tk.classList.add('live'); els.hint.classList.add('gone');
      els.stRisk.textContent = usd(S.R);
      els.st.forEach(x => x.classList.remove('on', 'done'));
      els.st[0].classList.add('done');
      els.pl.textContent = '0.00$'; els.pl.style.color = '';
      els.st3t.textContent = 'وصل السعر إلى الهدف وأُغلقت الصفقة.';
      const pts = plan(), sub = 4, ent = entry, d = dEff, side = S.side, tpU = S.k;
      let i = 0, cur = null;
      paint();
      const step = () => {
        if (i >= pts.length) return finish();
        const u = pts[i], p = ent + side * u * d;
        if (i % sub === 0) {
          cur = { o: chart.data[chart.data.length - 1].c, h: 0, l: 0, c: p };
          cur.h = Math.max(cur.o, p) + Math.random() * 0.25; cur.l = Math.min(cur.o, p) - Math.random() * 0.25;
          if (side > 0) cur.l = Math.max(cur.l, S.be ? ent + 0.05 : ent - side * d * 0.9);
          else cur.h = Math.min(cur.h, S.be ? ent - 0.05 : ent + d * 0.9);
          chart.data.push(cur);
          const len = chart.data.length;
          if (len + 6 > chart.to) chart.view(chart.from + 1, chart.to + 1);
        } else {
          cur.c = p; cur.h = Math.max(cur.h, p); cur.l = Math.min(cur.l, p);
        }
        if (!S.be && u >= 1) {
          S.be = true; els.st[1].classList.add('done');
        }
        const pl = u >= tpU ? S.R * S.k : side * (p - ent) * LOT_USD * lot;
        els.pl.textContent = money(pl);
        els.pl.style.color = pl >= 0 ? '#6fd08f' : '#ff8a80';
        paint();
        i++;
        if (u >= tpU) return finish();
      };
      play = setInterval(step, calm ? 40 : 95);
      function finish() {
        clearInterval(play); play = null;
        els.st[2].classList.add('done');
        els.st3t.innerHTML = 'وصل السعر إلى الهدف وأُغلقت الصفقة: <b class="num">' + money(S.R * S.k) + '</b> بالضبط، كما ظهر قبل أن تضغط.';
        els.pl.textContent = money(S.R * S.k);
      }
    }
    els.exec.addEventListener('click', execute);
    $('#again').addEventListener('click', () => {
      clearInterval(play); play = null;
      S.live = false; S.be = false; S.seed++; tk.classList.remove('live');
      fresh(); paint();
      els.snap.textContent = 'صفقة جديدة. اسحب الوقف أو غيّر المبلغ، ثم نفّذ.';
    });
    $('#tryBtn').addEventListener('click', () => setTimeout(() => els.risk.focus({ preventScroll: true }), 500));

    fresh(); paint();
  })();

  /* ================================================== pillars (after the click) */
  (function pillars() {
    const tabs = $$('.p-tab'), panels = $$('.p-panel');
    panels.forEach(p => p.removeAttribute('hidden'));
    let cur = 0, auto = !calm, t0 = 0, raf = 0, seen = false;
    const DUR = 11000;
    const scenes = {};

    function select(n, user) {
      if (user) auto = false;
      cur = n;
      tabs.forEach((t, i) => {
        const on = i === n;
        t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
        panels[i].classList.toggle('on', on); panels[i].inert = !on;
        if (!on) t.querySelector('.bar i').style.width = '0';
      });
      Object.values(scenes).forEach(s => s.stop && s.stop());
      const s = scenes[panels[n].id]; if (s && seen) s.start();
      t0 = performance.now();
    }
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(i, true));
      t.addEventListener('keydown', e => {
        const d = e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowRight' ? -1 : 0;
        if (!d) return; e.preventDefault();
        const n = (cur + d + tabs.length) % tabs.length; select(n, true); tabs[n].focus();
      });
    });
    function loop(now) {
      raf = 0;
      if (!seen) return;
      if (auto) {
        const f = (now - t0) / DUR;
        tabs[cur].querySelector('.bar i').style.width = Math.min(100, f * 100) + '%';
        if (f >= 1) select((cur + 1) % tabs.length);
      } else tabs[cur].querySelector('.bar i').style.width = '100%';
      raf = requestAnimationFrame(loop);
    }
    watch($('.p-stage'), v => {
      seen = v;
      const s = scenes[panels[cur].id];
      if (v) { t0 = performance.now(); if (s) s.start(); if (!raf) raf = requestAnimationFrame(loop); }
      else if (s) s.stop();
    });

    /* --- Telegram --- */
    scenes['pp-tg'] = (function () {
      const msgs = $$('#tgChat .msg'); let id = 0;
      return {
        start() {
          clearTimeout(id); msgs.forEach(m => m.classList.remove('show'));
          let i = 0; const nx = () => { if (i < msgs.length) { msgs[i++].classList.add('show'); id = setTimeout(nx, calm ? 0 : 1500); } };
          id = setTimeout(nx, 250);
        },
        stop() { clearTimeout(id); },
      };
    })();

    /* --- the assistant types --- */
    scenes['pp-ai'] = (function () {
      const A1 = 'الصفقة رابحة، لكن السعر قريب من قمة أمس عند 2,396، وآخر ثلاث شموع أبطأ من قبل. لا أرى سبباً قوياً للإغلاق الكامل الآن. الأفضل أن تنقل الوقف إلى سعر دخولك حتى لا تخسر، وتترك الهدف كما هو.';
      const A2 = 'تم. سأراقب اليورو مقابل الدولار، وأرسل لك تنبيهاً هنا وعلى تيليجرام عندما يلمس السعر 1.0950.';
      const t1 = $('#aiText'), t2 = $('#aiText2'), acts = $('#aiActs'); let id = 0;
      const type = (el, s, done) => {
        let i = 0; el.classList.add('caret');
        const nx = () => {
          i = Math.min(s.length, i + 2); el.textContent = s.slice(0, i);
          if (i < s.length) id = setTimeout(nx, 22); else { el.classList.remove('caret'); done && (id = setTimeout(done, 700)); }
        };
        nx();
      };
      return {
        start() {
          clearTimeout(id); t1.textContent = ''; t2.textContent = ''; acts.classList.remove('show');
          if (calm) { t1.textContent = A1; t2.textContent = A2; acts.classList.add('show'); return; }
          id = setTimeout(() => type(t1, A1, () => { acts.classList.add('show'); id = setTimeout(() => type(t2, A2), 900); }), 500);
        },
        stop() { clearTimeout(id); t1.classList.remove('caret'); t2.classList.remove('caret'); },
      };
    })();

    /* --- small chart scenes share one recipe: reveal candles one by one --- */
    function scene(cv, build) {
      const ch = new AC.Chart(cv, { digits: 2, axisW: 64, lastTag: true });
      let sc, i = 0, hold = 0;
      const tk = ticker(calm ? 60 : 300, () => {
        if (i >= sc.data.length) { if (++hold > 10) { reset(); } return; }
        i++; ch.data = sc.data.slice(0, i); sc.at && sc.at(i - 1, ch); ch.req();
      });
      function reset() { hold = 0; sc = build(ch); i = sc.start; ch.data = sc.data.slice(0, i); sc.at && sc.at(i - 1, ch); ch.req(); }
      reset();
      return { start() { reset(); tk.set(true); }, stop() { tk.set(false); } };
    }
    const lbl = (g, ch, text, p, col, x) => {
      g.font = '600 13px "IBM Plex Sans Arabic", sans-serif';
      const w = g.measureText(text).width + 16, yy = ch.y(p);
      const xx = x == null ? 12 : x;
      g.fillStyle = 'rgba(23,26,32,.94)'; g.strokeStyle = col; g.lineWidth = 1;
      g.beginPath(); g.roundRect ? g.roundRect(xx, yy - 14, w, 28, 6) : g.rect(xx, yy - 14, w, 28); g.fill(); g.stroke();
      g.fillStyle = '#e6e8ec'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, xx + w / 2, yy + 1);
    };

    /* protect: stop jumps to entry at +1R */
    scenes['pp-pr'] = scene($('#cvPr'), ch => {
      const E = 14, d = 3, entry = 2390;
      const pre = toPrice(walk(11, [[0.9, 7], [0, 7]], 0.18), entry, d, 1);
      let be = false;
      const post = toPrice(walk(12, [[-0.5, 4], [1.15, 8], [0.5, 4], [2.4, 9]], 0.2, (i, st) => (st.hi >= 1 ? 0.12 : -0.85)), entry, d, 1);
      const data = pre.concat(post);
      ch.view(0, data.length + 6); ch.fixed = [entry - 1.6 * d, entry + 3 * d];
      const sl = { p: entry - d, color: '#c62828', width: 2, text: 'وقف  −30.00$', x0: 0 };
      const en = { p: entry, color: '#5a8dee', dash: [6, 4] };
      ch.lines = []; ch.zones = [];
      ch.overlay = (g, c) => { if (be) lbl(g, c, 'صفقتك الآن لا تخسر', entry + 0.55 * d, '#3fae7c'); };
      return {
        data, start: E,
        at(i, c) {
          if (i < E) { c.lines = []; return; }
          sl.x0 = c.x(E) - c.slot() / 2; en.x0 = sl.x0;
          if (!be && data.slice(E, i + 1).some(k => k.h >= entry + d)) be = true;
          if (be) { sl.p = entry; sl.text = 'الوقف عند الدخول  0.00$'; sl.color = '#3fae7c'; }
          c.lines = [en, sl];
        },
      };
    });

    /* smart stop: watch → warn → exit */
    scenes['pp-ss'] = (function () {
      const meter = $$('.meter span');
      const setM = n => meter.forEach((m, i) => m.classList.toggle('on', i === n));
      return scene($('#cvSs'), ch => {
        const d = 2.4, entry = 2371;
        const pre = toPrice(walk(21, [[2.2, 6], [-0.2, 8], [0.3, 3], [0, 3]], 0.2), entry, d, 1);
        const U = [[0, .35, -.1, .3], [.3, .7, .2, .6], [.6, .78, .35, .45], [.45, .5, -.3, .15], [.15, .42, 0, .3], [.3, .36, -.38, -.27], [-.27, -.1, -.95, -.86]];
        const post = toPrice(U.map(([o, h, l, c]) => ({ o, h, l, c })), entry, d, 1);
        const data = pre.concat(post), E = pre.length;
        ch.view(0, data.length + 4); ch.fixed = [entry - 1.9 * d, entry + 2.6 * d];
        const zone = { from: E - 9, to: null, p1: entry, p2: entry - 0.5 * d, fill: 'rgba(90,141,238,.12)', edge: 'rgba(90,141,238,.45)', label: 'منطقة الدخول', labelCol: '#9cc3ef' };
        const sl = { p: entry - 1.5 * d, color: '#c62828', width: 2, text: 'الوقف الأصلي', x0: 0 };
        let note = null;
        ch.overlay = (g, c) => { if (note) lbl(g, c, note[0], c.p(26), note[2]); };
        return {
          data, start: E,
          at(i, c) {
            sl.x0 = c.x(E) - c.slot() / 2; c.lines = [sl]; c.zones = [zone];
            const k = i - E; note = null; setM(0);
            if (k >= 3 && k < 5) note = ['رجوع طبيعي للمنطقة: لا يتحرك', entry + 1.3 * d, '#5a8dee'];
            if (k === 5) { setM(1); note = ['إغلاق داخل المنطقة: يحذّرك ويقترح إغلاق النصف', entry + 1.3 * d, '#d6a650']; }
            if (k >= 6) { setM(2); note = ['إغلاق خلف المنطقة: فكرة الصفقة انتهت، فخرج', entry + 1.3 * d, '#d65c5c']; }
          },
        };
      });
    })();

    /* trailing: the stop climbs behind the lows */
    scenes['pp-tr'] = scene($('#cvTr'), ch => {
      const d = 2, entry = 2380;
      const pre = toPrice(walk(31, [[-0.6, 6], [0, 6]], 0.18), entry, d, 1);
      const post = toPrice(walk(32, [[1.2, 6], [0.8, 3], [2.4, 6], [2, 3], [3.6, 6], [3.1, 3], [4.4, 5], [2.6, 4]], 0.22), entry, d, 1);
      const E = pre.length, trend = post.length - 4;
      const trail = [];
      let tr = entry - d;
      for (let j = 0; j < post.length; j++) {
        const k = post[j];
        if (j < trend && k.l < tr + 0.12) { k.l = tr + 0.12 + Math.random() * 0.2; k.o = Math.max(k.o, k.l); k.c = Math.max(k.c, k.l); }
        trail.push(tr);
        if (j >= 2) tr = Math.max(tr, Math.min(post[j].l, post[j - 1].l, post[j - 2].l) - 0.35);
      }
      let exitAt = post.length;
      for (let j = trend; j < post.length; j++) if (post[j].l <= trail[j]) { exitAt = j; post[j].l = Math.min(post[j].l, trail[j] - 0.1); break; }
      const data = pre.concat(post.slice(0, exitAt + 1));
      ch.view(0, data.length + 6); ch.fixed = [entry - 1.6 * d, entry + 5 * d];
      let done = false;
      ch.overlay = (g, c) => {
        const n = c.data.length - E; if (n <= 0) return;
        g.strokeStyle = '#d6a650'; g.lineWidth = 2; g.beginPath();
        for (let j = 0; j < n && j < trail.length; j++) {
          const x1 = c.x(E + j) - c.slot() / 2, x2 = x1 + c.slot(), y = c.y(trail[j]);
          j ? g.lineTo(x1, y) : g.moveTo(x1, y); g.lineTo(x2, y);
        }
        g.stroke();
        const last = trail[Math.min(n, trail.length) - 1];
        if (done) lbl(g, c, 'خرجت بربح محفوظ  ' + money((last - entry) * 10), last + 1.1 * d, '#3fae7c');
        else lbl(g, c, 'الوقف يلحق السعر', last - 0.55 * d, '#d6a650', c.x(E + n - 1) - 150);
      };
      return { data, start: E, at(i) { done = i >= data.length - 1; } };
    });

    select(0);
  })();

  /* ================================================== problem rows */
  (function pain() {
    const box = $('#pain'), rows = window.ADRIAN_PAIN || [];
    box.innerHTML = rows.map((r, i) =>
      '<div class="pain-row' + (i >= 6 ? ' extra' : '') + '"><div><h4>' + r[0] + '</h4><p>' + r[1] + '</p></div>' +
      '<p class="fix"><strong>في أدريان</strong>' + r[2] + '</p></div>').join('');
    const more = $('#painMore');
    more.addEventListener('click', () => {
      const all = box.classList.toggle('all');
      more.textContent = all ? 'اعرض أهم ست فقط' : 'اعرض كل المشاكل الثماني عشرة';
      if (!all) box.scrollIntoView({ block: 'start', behavior: calm ? 'auto' : 'smooth' });
    });
  })();

  /* ================================================== journey (sticky chart) */
  (function journey() {
    const cv = $('#cvJ'), pop = $('#jPop'), steps = $$('.j-step');
    const ch = new AC.Chart(cv, { digits: 2, axisW: 66 });
    const ways = [{ to: -8, n: 40 }, { to: 2, n: 12 }, { to: -5.2, n: 18 }, { to: -4, n: 4 }, { to: 9, n: 28 }];
    let base = AC.pathCandles(2372, ways, 0.9, 41);
    let z1 = Infinity; for (let i = 34; i < 46; i++) z1 = Math.min(z1, base[i].l);
    const z2 = z1 + 2.4, E = 72;
    const SL = z1 - 1.2;
    base = AC.pathCandles(2372, ways, 0.9, 41, (k, c) => k > E ? { l: Math.max(c.l, SL + 0.9), c: Math.max(c.c, SL + 1.2) } : null);
    const entry = base[E].c, TP = entry + 2 * (entry - SL);
    let tpI = base.findIndex((k, i) => i > E && k.h >= TP);
    if (tpI < 0) tpI = base.length - 1;
    const data = base.slice(0, tpI + 1);
    ch.setData(data); ch.view(10, data.length + 4);
    ch.fixed = null; ch.keep = [TP, SL];

    const zone = { from: 38, to: null, p1: z1, p2: z2, fill: 'rgba(90,141,238,.12)', edge: 'rgba(90,141,238,.45)', label: 'منطقة طلب', labelCol: '#9cc3ef' };
    const gap = { from: 46, to: 58, p1: z2 + 1.4, p2: z2 + 2.6, fill: 'rgba(214,166,80,.10)', edge: 'rgba(214,166,80,.4)', label: 'فجوة', labelCol: '#e7bd6b' };
    const x0 = () => ch.x(E) - ch.slot() / 2;
    const mk = (p, color, text, extra) => { const L = Object.assign({ p, color, text, width: 2 }, extra); Object.defineProperty(L, 'x0', { get: x0 }); return L; };
    const lE = mk(entry, '#5a8dee', '', { dash: [6, 4], width: 1 });
    const lS = mk(SL, '#c62828', 'وقف  −25.00$'), lT = mk(TP, '#1b8a3c', 'هدف  +50.00$');
    const bell = { p: z2, color: '#d6a650', dash: [3, 5], text: 'جرس عند المنطقة', tag: false };
    const sh = [{ from: E, to: tpI, p1: entry, p2: SL, fill: 'rgba(198,40,40,.15)' }, { from: E, to: tpI, p1: entry, p2: TP, fill: 'rgba(27,138,60,.15)' }];

    const POPS = [
      ['', '<b>بوصلة اليوم: يميل للصعود</b>خبر قوي على الدولار بعد ساعة. أدريان يذكّرك قبله بخمس دقائق.'],
      ['', '<b>منطقة طلب · لم تُلمس بعد</b>بدأ منها اندفاع قوي، وتركت فجوة خلفها. اضغط «لماذا؟» لترى الأسباب.'],
      ['', '<b>السعر يقترب من المنطقة</b>بعيد ← يقترب ← يختبر المنطقة. الجرس سيرنّ عند اللمس.'],
      ['warn', '<b>الدستور: انتبه</b>هذه صفقتك الرابعة اليوم، وقاعدتك تقول ثلاثاً. تريد المتابعة؟'],
      ['', '<b>تذكرة الصفقة</b>الخسارة عند الوقف 25.00$ بالضبط، والهدف 50.00$. الحجم محسوب وحده.'],
      ['ok', '<b>تيليجرام: تم تأمين صفقة الذهب</b>الوقف الآن عند سعر دخولك، والحارس يلاحق الربح.'],
      ['ok', '<b>الدرس المحفوظ</b>دخلت بعد إغلاق شمعة التأكيد داخل المنطقة. كرّر هذا.'],
    ];
    let step = -1, rep = 0, repId = 0;
    function show(n) {
      if (n === step) return; step = n;
      steps.forEach((s, i) => s.classList.toggle('on', i === n));
      clearInterval(repId); ch.cut = null;
      const upto = n <= 3 ? E - (n === 3 ? 0 : n === 2 ? 4 : 12) : data.length;
      ch.data = data.slice(0, n >= 4 ? (n === 4 ? E + 1 : data.length) : upto + 1);
      ch.view(10, n < 4 ? upto + 26 : n === 4 ? E + 30 : data.length + 6);
      ch.zones = n >= 1 ? [zone, gap] : [];
      ch.lines = n === 2 || n === 3 ? [bell] : [];
      if (n >= 4) {
        ch.zones = [zone].concat(sh);
        const be = n >= 5;
        lS.p = be ? entry + 1 : SL; lS.text = be ? 'وقف يلاحق الربح' : 'وقف  −25.00$'; lS.color = be ? '#d6a650' : '#c62828';
        ch.lines = [lE, lS, lT];
      }
      if (n === 6) {
        ch.data = data; rep = E;
        repId = setInterval(() => { rep++; ch.cut = rep; ch.req(); if (rep >= data.length - 1) clearInterval(repId); }, calm ? 10 : 70);
      }
      ch.overlay = n === 0 ? (g, c) => {
        const x = c.x(c.data.length + 1);
        g.strokeStyle = 'rgba(214,166,80,.6)'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.h); g.stroke(); g.setLineDash([]);
        g.font = '600 12px "IBM Plex Sans Arabic", sans-serif'; g.fillStyle = '#e7bd6b'; g.textAlign = 'center'; g.fillText('خبر بعد ساعة', x, 18);
      } : null;
      ch.req();
      pop.className = 'j-pop ' + POPS[n][0];
      pop.innerHTML = POPS[n][1];
      requestAnimationFrame(() => pop.classList.add('show'));
    }
    const io = new IntersectionObserver(es => {
      es.forEach(e => { if (e.isIntersecting) show(+e.target.dataset.step); });
    }, { rootMargin: '-45% 0px -45% 0px' });
    steps.forEach(s => io.observe(s));
    show(0);
  })();

  /* ================================================== time machine */
  (function timeMachine() {
    const cv = $('#cvTm'), cut = $('#tmCut'), res = $('#tmRes'), bPlay = $('#tmPlay'), bTrade = $('#tmTrade');
    const ch = new AC.Chart(cv, { digits: 5, axisW: 70 });
    const data = AC.genCandles(170, 19, 1.0842, 0.00055);
    ch.setData(data);
    let tr = null, id = 0;
    const atr = i => { let s = 0; for (let j = i - 13; j <= i; j++) s += data[j].h - data[j].l; return s / 14; };
    function view() { const c = +ch.cut; ch.view(Math.max(0, c - 70), c + 26); }
    function setCut(v) { ch.cut = clamp(v, 40, data.length - 1); cut.value = ch.cut; view(); draw(); }
    function draw() {
      ch.lines = []; ch.zones = [];
      if (tr) {
        const x0 = ch.x(tr.i) - ch.slot() / 2;
        ch.zones = [{ from: tr.i, to: tr.end == null ? null : tr.end, p1: tr.e, p2: tr.sl, fill: 'rgba(198,40,40,.16)' }, { from: tr.i, to: tr.end == null ? null : tr.end, p1: tr.e, p2: tr.tp, fill: 'rgba(27,138,60,.16)' }];
        ch.lines = [{ p: tr.sl, color: '#c62828', width: 2, x0, text: 'وقف' }, { p: tr.tp, color: '#1b8a3c', width: 2, x0, text: 'هدف' }, { p: tr.e, color: '#5a8dee', dash: [6, 4], x0 }];
      }
      ch.req();
    }
    function stop() { clearInterval(id); id = 0; bPlay.textContent = 'شغّل الشموع'; }
    cut.addEventListener('input', () => {
      stop(); tr = null; setCut(+cut.value);
      res.textContent = 'أنت الآن في الماضي. ما بعد الخط الأزرق مخفي عنك.';
    });
    bTrade.addEventListener('click', () => {
      stop();
      const i = +ch.cut, e = data[i].c, side = data[i].c >= data[i - 10].c ? 1 : -1, d = atr(i) * 1.6;
      tr = { i, e, side, sl: e - side * d, tp: e + side * d * 2, end: null };
      res.innerHTML = 'صفقة تدريب <b>' + (side > 0 ? 'شراء' : 'بيع') + '</b> مع اتجاه آخر عشر شموع. الهدف ضعفا المخاطرة. اضغط «شغّل الشموع».';
      draw();
    });
    bPlay.addEventListener('click', () => {
      if (id) return stop();
      bPlay.textContent = 'إيقاف';
      const startCut = +ch.cut;
      id = setInterval(() => {
        const n = +ch.cut + 1;
        if (n >= data.length) { stop(); res.innerHTML = tr && tr.end == null ? 'انتهت الشموع والصفقة ما زالت مفتوحة.' : res.innerHTML; return; }
        setCut(n);
        if (tr && tr.end == null) {
          const k = data[n], hitS = tr.side > 0 ? k.l <= tr.sl : k.h >= tr.sl, hitT = tr.side > 0 ? k.h >= tr.tp : k.l <= tr.tp;
          if (hitS || hitT) {
            tr.end = n; stop(); draw();
            res.innerHTML = hitS
              ? 'ضربت الصفقة الوقف بعد <b>' + (n - tr.i) + '</b> من الشموع: −1 من المخاطرة. خسارة تدريب، لا دولار واحد.'
              : 'وصلت الصفقة إلى الهدف بعد <b>' + (n - tr.i) + '</b> من الشموع: +2 من المخاطرة.';
          }
        } else if (!tr && n - startCut >= 24) stop();
      }, calm ? 30 : 110);
    });
    setCut(96);
  })();

  /* ================================================== four screens, one crosshair */
  (function screens() {
    const cells = $$('#grid4 .cell'), K = [1, 3, 12, 48], SHOW = [64, 64, 48, 30];
    const m5 = AC.genCandles(48 * 34, 53, 2376, 0.62);
    const charts = cells.map((c, j) => {
      const ch = new AC.Chart($('canvas', c), { axis: false, lastTag: false, pad: 0.08 });
      const d = K[j] === 1 ? m5 : AC.aggregate(m5, K[j]);
      ch.setData(d); ch.view(d.length - SHOW[j], d.length + 2);
      return ch;
    });
    cells.forEach((c, j) => {
      const cv = $('canvas', c);
      cv.addEventListener('pointermove', e => {
        const r = cv.getBoundingClientRect(), i = charts[j].iAt(e.clientX - r.left);
        const T = i * K[j] + K[j] / 2;
        charts.forEach((ch, n) => { ch.cross = { i: Math.floor(T / K[n]), y: n === j ? e.clientY - r.top : null }; ch.req(); });
      });
      cv.addEventListener('pointerleave', () => charts.forEach(ch => { ch.cross = null; ch.req(); }));
    });
  })();

  /* ================================================== feature explorer */
  (function explorer() {
    const G = window.ADRIAN_FEATURES || [];
    const map = $('#fxMap'), list = $('#fxList'), q = $('#fxQ'), tip = $('#fxTip'), count = $('#fxCount'), empty = $('#fxEmpty');
    const HUES = [212, 262, 38, 190, 292, 228, 46, 276, 200, 244, 30, 306, 218, 252, 182];
    const hue = gi => HUES[gi % HUES.length];
    const norm = s => s.replace(/<[^>]+>/g, '').replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase();
    const items = [];
    let mapHtml = '', listHtml = '';
    G.forEach((g, gi) => {
      listHtml += '<section class="fx-group" style="--h:' + hue(gi) + '" data-g="' + gi + '"><h3><i></i>' + g.t + '<small>' + g.items.length + ' ميزة</small></h3><ol>';
      g.items.forEach(([n, html]) => {
        items.push({ n, html, g: gi, text: norm(html), plain: html.replace(/<[^>]+>/g, '') });
        mapHtml += '<button type="button" style="--h:' + hue(gi) + '" data-n="' + n + '" aria-label="الميزة ' + n + '">' + n + '</button>';
        listHtml += '<li id="f' + n + '"><span class="n">' + n + '</span><span class="t">' + html + '</span></li>';
      });
      listHtml += '</ol></section>';
    });
    map.innerHTML = mapHtml; list.innerHTML = listHtml;
    const btns = $$('button', map), lis = $$('li', list), secs = $$('.fx-group', list);
    let intent = '';

    function markHtml(html, raw) {
      if (!raw) return html;
      const esc = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(esc, 'g');
      return html.split(/(<[^>]+>)/).map(s => s.startsWith('<') ? s : s.replace(re, '<mark>$&</mark>')).join('');
    }
    function apply() {
      const raw = q.value.trim(), nq = norm(raw);
      let n = 0; const vis = new Set();
      items.forEach((it, k) => {
        const okI = !intent || (G[it.g].i || []).includes(intent);
        const okQ = !nq || it.text.includes(nq);
        const ok = okI && okQ;
        btns[k].classList.toggle('dim', !ok);
        btns[k].classList.toggle('hit', ok && !!nq);
        lis[k].hidden = !ok;
        $('.t', lis[k]).innerHTML = ok && raw ? markHtml(it.html, raw) : it.html;
        if (ok) { n++; vis.add(it.g); }
      });
      secs.forEach((s, gi) => (s.hidden = !vis.has(gi)));
      count.innerHTML = n === items.length ? 'كل المميزات: <b>' + n + '</b>. مرّر فوق أي مربع لتقرأه، واضغط لتذهب إليه.' : '<b>' + n + '</b> ميزة من ' + items.length;
      empty.style.display = n ? 'none' : 'block';
    }
    let t = 0;
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(apply, 120); });
    $$('#fxI button').forEach(b => b.addEventListener('click', () => {
      intent = b.dataset.i; $$('#fxI button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); apply();
    }));
    const showTip = (b, x, y) => {
      const it = items[btns.indexOf(b)];
      tip.innerHTML = '<small>' + G[it.g].t + ' · ' + it.n + '</small>' + (it.plain.length > 160 ? it.plain.slice(0, 157) + '…' : it.plain);
      tip.classList.add('show');
      const w = tip.offsetWidth, h = tip.offsetHeight;
      tip.style.left = clamp(x - w / 2, 8, innerWidth - w - 8) + 'px';
      tip.style.top = (y - h - 14 < 8 ? y + 22 : y - h - 14) + 'px';
    };
    map.addEventListener('pointerover', e => { const b = e.target.closest('button'); if (b) showTip(b, e.clientX, e.clientY); });
    map.addEventListener('pointermove', e => { const b = e.target.closest('button'); if (b) showTip(b, e.clientX, e.clientY); });
    map.addEventListener('pointerleave', () => tip.classList.remove('show'));
    addEventListener('scroll', () => tip.classList.remove('show'), { passive: true });
    map.addEventListener('focusin', e => { const b = e.target.closest('button'); if (b) { const r = b.getBoundingClientRect(); showTip(b, r.left + r.width / 2, r.top); } });
    map.addEventListener('focusout', () => tip.classList.remove('show'));
    map.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const li = $('#f' + b.dataset.n); if (!li || li.hidden) return;
      tip.classList.remove('show');
      li.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
      lis.forEach(x => x.classList.remove('flash')); li.classList.add('flash');
      setTimeout(() => li.classList.remove('flash'), 2600);
    });
    apply();
  })();

  /* ================================================== comparison */
  (function compare() {
    const Y = '<svg class="y" aria-label="نعم"><use href="#i-check"/></svg>', N = '<svg class="n" aria-label="لا"><use href="#i-x"/></svg>';
    const P = s => '<span class="part">' + s + '</span>';
    const rows = [
      ['شارت متقدم بأدوات رسم كاملة', Y, Y, P('أساسي')],
      ['ينفّذ الصفقة من الشارت نفسه', Y, P('عبر وسطاء محددين'), Y],
      ['الخسارة عند الوقف بالمبلغ الذي تكتبه بالضبط', Y, N, N],
      ['تأمين وإيقاف ذكي وملاحقة بعد الدخول', Y, N, P('ملاحقة بسيطة')],
      ['تحكم كامل من الهاتف عبر تيليجرام', Y, N, P('تطبيق الهاتف')],
      ['مساعد تسأله عن صفقتك وينفّذ بالكلام', Y, N, N],
      ['آلة زمن بصفقات تدريب حقيقية', Y, P('إعادة للمشاهدة'), P('مختبر الاستراتيجيات')],
      ['بوتات جاهزة بلا برمجة', Y, N, P('تحتاج برمجة')],
      ['قواعد تمنعك من الصفقة الخاطئة', Y, N, N],
      ['عربي من اليمين أصلاً', Y, P('ترجمة'), P('ترجمة')],
      ['دفعة واحدة بلا اشتراك', Y, N, Y],
    ];
    $('#cmpBody').innerHTML = rows.map(r => '<tr><th scope="row">' + r[0] + '</th><td class="us">' + r[1] + '</td><td>' + r[2] + '</td><td>' + r[3] + '</td></tr>').join('');
  })();

  /* ================================================== download: newest installer that runs on every PC */
  (function download() {
    const btn = $('#dlBtn'), meta = $('#dlMeta');
    const ver = s => (String(s).match(/\d+/g) || []).map(Number);
    const atLeast = (a, b) => { for (let i = 0; i < 3; i++) { if ((a[i] || 0) !== b[i]) return (a[i] || 0) > b[i]; } return true; };
    fetch('https://api.github.com/repos/mohammedmonir97/adrian-releases/releases?per_page=10', { headers: { Accept: 'application/vnd.github+json' } })
      .then(r => (r.ok ? r.json() : []))
      .then(list => {
        for (const rel of list) {
          if (rel.draft || rel.prerelease) continue;
          const v = ver(rel.tag_name);
          if (!atLeast(v, [1, 0, 5])) continue; // older builds don't run on every processor
          const exe = (rel.assets || []).find(a => /\.exe$/i.test(a.name));
          if (!exe) continue;
          btn.href = exe.browser_download_url;
          btn.setAttribute('download', '');
          meta.textContent = 'الإصدار ' + v.join('.') + ' · ' + Math.round(exe.size / 1048576) + ' ميجابايت · ويندوز 10 أو أحدث · يحتاج حساباً على MetaTrader 5';
          return;
        }
      })
      .catch(() => {});
  })();
})();
