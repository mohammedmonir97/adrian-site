/* Adrian site — tiny canvas candle chart used by every demo on the page.
   Paints only when something changed and only while its canvas is on screen. */
(function () {
  'use strict';

  const COL = {
    bg: '#0f1115', grid: 'rgba(255,255,255,.045)', axis: '#7f8898', axisBg: '#13161b',
    up: '#3fae7c', down: '#d65c5c', wick: 'rgba(230,232,236,.38)',
  };

  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* A believable random walk: momentum that fades, wicks on both sides. */
  function genCandles(n, seed, start, vol) {
    const r = rng(seed), out = [];
    let p = start, drift = 0;
    for (let i = 0; i < n; i++) {
      drift = drift * 0.9 + (r() - 0.5) * vol * 0.55;
      const o = p, c = o + drift + (r() - 0.5) * vol;
      const h = Math.max(o, c) + r() * vol * 0.55, l = Math.min(o, c) - r() * vol * 0.55;
      out.push({ o, h, l, c });
      p = c;
    }
    return out;
  }

  /* Candles that follow way-points (price offsets from start), with small noise.
     floor(i, price) / ceil(i, price) may clamp the low / high of each candle. */
  function pathCandles(start, points, noise, seed, clamp) {
    const r = rng(seed), out = [];
    let p = start, base = start, k = 0;
    for (const w of points) {
      const from = base, to = start + w.to;
      for (let j = 1; j <= w.n; j++, k++) {
        const tgt = from + (to - from) * (j / w.n);
        const o = p;
        let c = tgt + (r() - 0.5) * noise;
        let h = Math.max(o, c) + r() * noise * 0.7, l = Math.min(o, c) - r() * noise * 0.7;
        if (clamp) { const q = clamp(k, { o, h, l, c }); if (q) ({ h, l, c } = Object.assign({ h, l, c }, q)); }
        out.push({ o, h: Math.max(h, o, c), l: Math.min(l, o, c), c });
        p = c;
      }
      base = to;
    }
    return out;
  }

  function aggregate(src, k) {
    const out = [];
    for (let i = 0; i + k <= src.length; i += k) {
      const s = src.slice(i, i + k);
      out.push({ o: s[0].o, c: s[k - 1].c, h: Math.max(...s.map(x => x.h)), l: Math.min(...s.map(x => x.l)) });
    }
    return out;
  }

  function niceStep(span) {
    const raw = span / 5, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
  }

  const fmt = (p, d) => p.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

  class Chart {
    constructor(canvas, opt) {
      opt = opt || {};
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.data = [];
      this.from = 0; this.to = 0;
      this.axisW = opt.axis === false ? 0 : (opt.axisW || 66);
      this.digits = opt.digits == null ? 2 : opt.digits;
      this.pad = opt.pad == null ? 0.14 : opt.pad;
      this.lines = []; this.zones = []; this.keep = [];
      this.overlay = null; this.hidden = null; this.lastTag = opt.lastTag !== false;
      this.cut = null;               // index after which candles are hidden (time machine)
      this.cross = null;             // {i} synced crosshair
      this.onScreen = true;
      this.w = 0; this.h = 0; this.raf = 0;
      const host = canvas.parentElement;
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(host);
      this.io = new IntersectionObserver(es => { this.onScreen = es[0].isIntersecting; if (this.onScreen) this.req(); });
      this.io.observe(host);
      this.resize();
    }
    resize() {
      const r = this.cv.parentElement.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
      this.cv.width = Math.round(this.w * dpr); this.cv.height = Math.round(this.h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.req(true);
    }
    req(force) {
      if (this.raf) return;
      if (!force && (!this.onScreen || document.hidden)) return;
      this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); });
    }
    setData(d) { this.data = d; this.req(); return this; }
    view(from, to) { this.from = from; this.to = to; this.req(); return this; }
    get plotW() { return this.w - this.axisW; }
    slot() { return this.plotW / Math.max(1, this.to - this.from); }
    x(i) { return (i - this.from + 0.5) * this.slot(); }
    iAt(x) { return Math.floor(x / this.slot() + this.from); }
    range() {
      let lo = Infinity, hi = -Infinity;
      const end = Math.min(this.to, this.cut == null ? this.data.length : this.cut + 1);
      for (let i = Math.max(0, Math.floor(this.from)); i < end; i++) {
        const c = this.data[i]; if (!c) continue;
        if (c.l < lo) lo = c.l; if (c.h > hi) hi = c.h;
      }
      for (const p of this.keep) { if (p < lo) lo = p; if (p > hi) hi = p; }
      if (!isFinite(lo)) { lo = 0; hi = 1; }
      const m = (hi - lo) * this.pad || 1;
      this.lo = lo - m; this.hi = hi + m;
      if (this.fixed) { this.lo = this.fixed[0]; this.hi = this.fixed[1]; }
    }
    y(p) { return (this.hi - p) / (this.hi - this.lo) * this.h; }
    p(y) { return this.hi - y / this.h * (this.hi - this.lo); }
    draw() {
      const g = this.ctx, W = this.w, H = this.h, PW = this.plotW;
      this.range();
      g.clearRect(0, 0, W, H);
      g.fillStyle = COL.bg; g.fillRect(0, 0, W, H);
      // grid
      const st = niceStep(this.hi - this.lo);
      g.strokeStyle = COL.grid; g.lineWidth = 1; g.beginPath();
      const ticks = [];
      for (let v = Math.ceil(this.lo / st) * st; v < this.hi; v += st) { const yy = Math.round(this.y(v)) + 0.5; g.moveTo(0, yy); g.lineTo(PW, yy); ticks.push([v, yy]); }
      g.stroke();
      // shading under candles
      for (const z of this.zones) {
        const x1 = z.from == null ? 0 : this.x(z.from) - this.slot() / 2;
        const x2 = z.to == null ? PW : this.x(z.to) + this.slot() / 2;
        const y1 = this.y(Math.max(z.p1, z.p2)), y2 = this.y(Math.min(z.p1, z.p2));
        g.fillStyle = z.fill; g.fillRect(x1, y1, Math.min(PW, x2) - x1, y2 - y1);
        if (z.edge) { g.strokeStyle = z.edge; g.lineWidth = 1; g.strokeRect(Math.round(x1) + .5, Math.round(y1) + .5, Math.min(PW, x2) - x1, y2 - y1); }
        if (z.label) {
          g.font = '600 12px "IBM Plex Sans Arabic", sans-serif'; g.fillStyle = z.labelCol || '#e6e8ec';
          g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(z.label, x1 + 6, y1 + 4);
        }
      }
      // candles
      const sw = this.slot(), bw = Math.max(1, Math.min(14, sw * 0.62));
      const end = Math.min(Math.ceil(this.to), this.data.length);
      for (let i = Math.max(0, Math.floor(this.from)); i < end; i++) {
        const c = this.data[i]; if (!c) continue;
        if (this.cut != null && i > this.cut) break;
        const xx = this.x(i), up = c.c >= c.o, col = up ? COL.up : COL.down;
        g.strokeStyle = col; g.lineWidth = 1; g.beginPath();
        g.moveTo(Math.round(xx) + .5, this.y(c.h)); g.lineTo(Math.round(xx) + .5, this.y(c.l)); g.stroke();
        const y1 = this.y(Math.max(c.o, c.c)), y2 = this.y(Math.min(c.o, c.c));
        g.fillStyle = col; g.fillRect(Math.round(xx - bw / 2), Math.round(y1), Math.round(bw), Math.max(1, Math.round(y2 - y1)));
      }
      if (this.cut != null) {
        const xc = this.x(this.cut) + sw / 2;
        g.fillStyle = 'rgba(90,141,238,.06)'; g.fillRect(xc, 0, PW - xc, H);
        g.strokeStyle = 'rgba(90,141,238,.55)'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(Math.round(xc) + .5, 0); g.lineTo(Math.round(xc) + .5, H); g.stroke(); g.setLineDash([]);
      }
      // price lines
      for (const L of this.lines) {
        const yy = Math.round(this.y(L.p)) + .5;
        g.strokeStyle = L.color; g.lineWidth = L.width || 1; g.setLineDash(L.dash || []);
        g.beginPath(); g.moveTo(L.x0 == null ? 0 : L.x0, yy); g.lineTo(PW, yy); g.stroke(); g.setLineDash([]);
        if (L.text) {
          g.font = '600 12px "IBM Plex Sans Arabic", sans-serif';
          const tw = g.measureText(L.text).width + 14, tx = (L.textX == null ? PW - tw - 8 : L.textX);
          g.fillStyle = L.color; g.fillRect(tx, yy - 11, tw, 22);
          g.fillStyle = L.ink || '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(L.text, tx + tw / 2, yy + 1);
        }
      }
      if (this.overlay) this.overlay(g, this);
      // crosshair
      if (this.cross && this.cross.i != null) {
        const xx = Math.round(this.x(this.cross.i)) + .5;
        g.strokeStyle = 'rgba(230,232,236,.35)'; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(xx, 0); g.lineTo(xx, H);
        if (this.cross.y != null) { g.moveTo(0, this.cross.y + .5); g.lineTo(PW, this.cross.y + .5); }
        g.stroke(); g.setLineDash([]);
      }
      // axis
      if (this.axisW) {
        g.fillStyle = COL.axisBg; g.fillRect(PW, 0, this.axisW, H);
        g.strokeStyle = 'rgba(255,255,255,.06)'; g.beginPath(); g.moveTo(PW + .5, 0); g.lineTo(PW + .5, H); g.stroke();
        g.font = '12px "IBM Plex Sans Arabic", sans-serif'; g.fillStyle = COL.axis; g.textAlign = 'left'; g.textBaseline = 'middle';
        for (const [v, yy] of ticks) if (yy > 10 && yy < H - 10) g.fillText(fmt(v, this.digits), PW + 8, yy);
        const tags = this.lines.filter(L => L.tag !== false);
        const lastI = Math.min(this.data.length - 1, this.cut == null ? Infinity : this.cut);
        if (this.lastTag && this.data[lastI]) {
          const c = this.data[lastI]; tags.push({ p: c.c, color: c.c >= c.o ? COL.up : COL.down });
        }
        for (const L of tags) {
          const yy = this.y(L.p); if (yy < -10 || yy > H + 10) continue;
          g.fillStyle = L.color; g.fillRect(PW + 1, yy - 10, this.axisW - 1, 20);
          g.fillStyle = L.ink || '#fff'; g.font = '600 12px "IBM Plex Sans Arabic", sans-serif'; g.fillText(fmt(L.p, this.digits), PW + 8, yy + 1);
        }
      }
    }
  }

  window.AdrianChart = { Chart, genCandles, pathCandles, aggregate, rng, fmt };
})();
