/* Abertura: a constelação da Zyra, em 3D.
   Analogia: um céu noturno com véus de seda violeta. As estrelas do nome estão espalhadas em
   profundidades diferentes, como numa constelação de verdade (vistas daqui parecem vizinhas, mas
   estão a distâncias muito diferentes). Só de um ponto de vista exato elas se alinham e formam ZYRA:
   a câmera gira até esse ponto e o nome "encaixa". Arrastar desfaz o nome em estrelas soltas no
   espaço; ao soltar, ele volta. Cada arquivo do dia que chega acende uma constelação do céu.
   Canvas 2D com projeção 3D feita à mão, sem biblioteca. */
(function () {
  var root = document.getElementById('bx-intro');
  if (!root) return;
  document.documentElement.classList.add('bx-intro-on');
  var cv = root.querySelector('canvas');
  var ctx = cv.getContext('2d');
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var statusEl = document.getElementById('bx-intro-status');
  var barEl = document.getElementById('bx-intro-bar');
  var goBtn = document.getElementById('bx-intro-go');
  var readBtn = document.getElementById('bx-intro-read');
  var greetEl = document.getElementById('bx-intro-hi');
  var dateEl = document.getElementById('bx-intro-date');

  var h = new Date().getHours();
  greetEl.textContent = (h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite') + ', Dheryck.';
  var dl = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  dateEl.textContent = 'Seu briefing de ' + dl + '.';

  var rnd = (function (s) { return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })(20261107);
  var clamp = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  var mob = window.innerWidth < 760;
  var CAM = 3.4, FOC = 1.9;          // camera distance and lens
  var LINE = '190,182,255';          // the thin constellation thread, lavender

  /* ---------- star glow: a ready-made halo is far cheaper than blurring every frame ---------- */
  var sprite = function (stops) {
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    stops.forEach(function (s) { gr.addColorStop(s[0], s[1]); });
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c;
  };
  var HALO_V = sprite([[0, 'rgba(255,255,255,1)'], [0.09, 'rgba(232,230,255,.92)'], [0.26, 'rgba(168,140,255,.36)'], [0.6, 'rgba(118,86,255,.08)'], [1, 'rgba(96,70,255,0)']]);
  var HALO_B = sprite([[0, 'rgba(255,255,255,1)'], [0.09, 'rgba(224,234,255,.92)'], [0.26, 'rgba(128,160,255,.36)'], [0.6, 'rgba(84,112,255,.08)'], [1, 'rgba(64,92,255,0)']]);

  var nodes = [], edges = [], adj = [];
  var addNode = function (n) { n.flash = 0; nodes.push(n); adj.push([]); return nodes.length - 1; };
  var link = function (a, b, o) { edges.push({ a: a, b: b, name: !!o.name, order: o.order || 0, grp: o.grp }); adj[a].push(edges.length - 1); adj[b].push(edges.length - 1); };

  /* ---------- the name: an anamorphic constellation ---------- */
  // each letter is a few stars joined by threads, like a real constellation drawing
  var L = 0.7, GAP = 0.3, K = 0.78;
  var LETTERS = [
    [[[0, 0], [L, 0], [L / 2, 0.5], [0, 1], [L, 1]]],                                                     // Z
    [[[0, 0], [L / 2, 0.5]], [[L, 0], [L / 2, 0.5], [L / 2, 1]]],                                          // Y
    [[[0, 1], [0, 0.5], [0, 0], [0.45, 0], [L, 0.25], [0.45, 0.5], [0.3, 0.5], [0, 0.5]], [[0.3, 0.5], [L, 1]]], // R
    [[[0, 1], [0.133, 0.62], [L / 2, 0], [L - 0.133, 0.62], [L, 1]], [[0.133, 0.62], [L - 0.133, 0.62]]]      // A
  ];
  var WORD_W = 4 * L + 3 * GAP, key = {}, order = 0;
  var star = function (x, y) {
    var id = Math.round(x * 1000) + ':' + Math.round(y * 1000);
    if (key[id] != null) return key[id];
    var X = (x - WORD_W / 2) * K, Y = (y - 0.5) * K;
    // a hidden depth, pushed out along the line of sight so the front view stays exact
    var d = (rnd() * 2 - 1) * 1.25, f = (CAM + d) / CAM;
    return (key[id] = addNode({ name: true, x: X * f, y: Y * f, z: d, u: x / WORD_W, r: 2.4 + rnd() * 1.3, halo: rnd() < 0.5 ? HALO_V : HALO_B, lit: 1, first: 1e9 }));
  };
  LETTERS.forEach(function (strokes, li) {
    var ox = li * (L + GAP);
    strokes.forEach(function (pts) {
      for (var q = 0; q < pts.length - 1; q++) link(star(ox + pts[q][0], pts[q][1]), star(ox + pts[q + 1][0], pts[q + 1][1]), { name: true, order: order++ });
    });
  });
  var STROKES = order;
  var NOVA = star(3 * (L + GAP) + L / 2, 0); // the apex of the A: the star the entrance dives into
  nodes[NOVA].r = 4.6; nodes[NOVA].halo = HALO_B;
  edges.forEach(function (e) { nodes[e.a].first = Math.min(nodes[e.a].first, e.order); nodes[e.b].first = Math.min(nodes[e.b].first, e.order + 1); });

  /* ---------- the sky: small constellations, one per file of the day ---------- */
  // placed by screen share (0..1) at a depth, kept out of the name's band; turned into space on resize
  var GROUPS = 11, centers = [];
  var free = function (fx, fy) {
    // keep clear of the name, the greeting and the buttons
    if (mob ? (fy > 0.14 && fy < 0.5) || fy > 0.7 : (fy > 0.08 && fy < 0.58 && fx > 0.22 && fx < 0.99) || (fy > 0.5 && fx < 0.42) || (fy > 0.82 && fx > 0.66)) return false;
    for (var c = 0; c < centers.length; c++) if (Math.hypot(centers[c][0] - fx, (centers[c][1] - fy) * 0.8) < 0.2) return false;
    return true;
  };
  for (var g = 0; g < GROUPS; g++) {
    var fx, fy, tries = 0;
    do { fx = 0.06 + rnd() * 0.88; fy = 0.05 + rnd() * 0.9; } while (!free(fx, fy) && ++tries < 80);
    centers.push([fx, fy]);
    var z = 0.8 + rnd() * 1.8, cnt = 4 + Math.floor(rnd() * 4), ang = rnd() * 6.283, ox = 0, oy = 0, ids = [];
    for (var s = 0; s < cnt; s++) {
      ids.push(addNode({ grp: g, fx: fx, fy: fy, z: z + (rnd() - 0.5) * 0.3, ox: ox, oy: oy, r: 1.1 + rnd() * 1.5, halo: rnd() < 0.55 ? HALO_V : HALO_B, lit: 0, delay: 0.2 + rnd() * 0.9 }));
      if (s) link(ids[s - 1], ids[s], { grp: g });
      ang += (rnd() - 0.5) * 2.2; var st = 0.13 + rnd() * 0.15; ox += Math.cos(ang) * st; oy += Math.sin(ang) * st;
    }
    if (cnt > 4 && rnd() < 0.6) link(ids[Math.floor(rnd() * (cnt - 2))], ids[cnt - 1], { grp: g }); // close a loop, like the reference's kites
  }
  // star dust: thousands of tiny points at every depth
  var dust = [];
  for (var di = 0, DN = mob ? 420 : 760; di < DN; di++) dust.push({ fx: rnd() * 1.3 - 0.15, fy: rnd() * 1.3 - 0.15, z: -0.4 + rnd() * 5.5, r: 0.5 + rnd() * rnd() * 1.6, ph: rnd() * 6.283, tw: 0.6 + rnd() * 2.2, blue: rnd() < 0.35, glow: rnd() < 0.05 });
  // veils of light: silk ribbons sweeping up to the right, each a fan of thin threads
  var VEILS = [
    { y0: 0.1, tilt: -0.22, amp: 0.045, k: 5.2, sp: 0.11, ph: 0.4, z: 2.6, n: 14, spread: 0.011, rgb: '126,84,255' },
    { y0: 0.5, tilt: -0.34, amp: 0.06, k: 3.6, sp: 0.08, ph: 2.1, z: 1.9, n: 18, spread: 0.012, rgb: '108,94,255' },
    { y0: 0.8, tilt: -0.3, amp: 0.05, k: 4.3, sp: 0.1, ph: 4.0, z: 1.3, n: 20, spread: 0.010, rgb: '92,112,255' },
    { y0: 0.99, tilt: -0.16, amp: 0.04, k: 3.1, sp: 0.07, ph: 5.3, z: 0.9, n: 12, spread: 0.013, rgb: '146,92,255' }
  ];
  var WRITE_AT = 0.5, WRITE_FOR = 2.6;               // the threads of the name are drawn while the sky turns
  var OPEN_YAW = 1.05, OPEN_PITCH = -0.42, TURN_AT = 0.5, TURN_FOR = 3.1;

  /* ---------- sound: tiny bells made in the browser, no file to download ---------- */
  // audio only starts after a tap (browsers' rule), so the opening itself stays silent
  var actx = null, bus = null;
  var audio = function () {
    try {
      if (!actx) {
        var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
        actx = new AC(); bus = actx.createGain(); bus.gain.value = 0.5;
        // a soft echo makes the bells shimmer like a starry sky
        var dl = actx.createDelay(1), fb = actx.createGain(), lp = actx.createBiquadFilter();
        dl.delayTime.value = 0.23; fb.gain.value = 0.38; lp.type = 'lowpass'; lp.frequency.value = 3200;
        bus.connect(actx.destination); bus.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(actx.destination);
      }
      if (actx.state === 'suspended') actx.resume();
      return actx;
    } catch (e) { return null; }
  };
  // one soft note; pan -1 (left) .. 1 (right); kind 'sine' or 'triangle'
  var tone = function (c, kind, f, t, g, att, dec, pan) {
    var o = c.createOscillator(), v = c.createGain(), dest = bus;
    if (pan && c.createStereoPanner) { var p = c.createStereoPanner(); p.pan.value = pan; p.connect(bus); dest = p; }
    o.type = kind; o.frequency.value = f;
    v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(g, t + att); v.gain.exponentialRampToValueAtTime(0.0001, t + att + dec);
    o.connect(v); v.connect(dest); o.start(t); o.stop(t + att + dec + 0.05);
  };
  // 1. crystal bell (touching a star): like tapping a glass lightly
  var CRYSTAL = [1568, 1760, 2093, 2349, 2637];
  var ping = function () {
    var c = audio(); if (!c) return;
    var t = c.currentTime + 0.01, f = CRYSTAL[Math.floor(rnd() * CRYSTAL.length)], pan = (rnd() - 0.5) * 0.6;
    tone(c, 'sine', f, t, 0.1, 0.004, 1.2, pan);
    tone(c, 'sine', f * 2.76, t, 0.03, 0.003, 0.45, pan);
    tone(c, 'sine', f * 5.4, t, 0.015, 0.002, 0.22, pan);
  };
  // 2. stardust (the golden star bursts on the button tap): rising sparkle cascade
  var stardust = function (c, t) {
    [1047, 1175, 1319, 1568, 1760, 2093, 2349, 2637, 3136].forEach(function (f, i) {
      var s = t + i * 0.055 + rnd() * 0.01, pan = Math.sin(i * 1.7) * 0.7;
      tone(c, 'triangle', f, s, 0.07 - i * 0.004, 0.003, 0.55, pan);
      tone(c, 'sine', f * 2, s, 0.02, 0.002, 0.2, pan);
    });
  };
  // 3. galaxy breath (the dive into the briefing): a soft whoosh with a warm chord
  var breath = function (c, t) {
    var len = Math.floor(c.sampleRate * 2.2), nb = c.createBuffer(1, len, c.sampleRate), d = nb.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var src = c.createBufferSource(), bp = c.createBiquadFilter(), v = c.createGain();
    src.buffer = nb; bp.type = 'bandpass'; bp.Q.value = 6;
    bp.frequency.setValueAtTime(1200, t); bp.frequency.exponentialRampToValueAtTime(6000, t + 1.8);
    v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(0.16, t + 0.5); v.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);
    src.connect(bp); bp.connect(v); v.connect(bus); src.start(t); src.stop(t + 2.1);
    [880, 1319, 2217].forEach(function (f, i) { tone(c, 'sine', f, t + 0.1 + i * 0.06, 0.045, 0.45, 1.4, (i - 1) * 0.4); });
  };
  var chime = function () {
    var c = audio(); if (!c) return;
    var t = c.currentTime + 0.02;
    stardust(c, t);
    breath(c, t + 0.35);
  };

  /* ---------- screen and space ---------- */
  var W = 0, H = 0, dpr = 1, scale = 1, cx = 0, cy = 0, SF = 1, cam = CAM;
  /* the Big Bang comes first: the clock starts BB seconds in the future, so everything below that reads
     "el" (seconds since the sky was born) waits while the bang plays at negative times.
     0..0.75 s: a single point of light gathers matter in the dark; 0.75 s: it explodes in a flash;
     then the stars fly out of it, the plasma cools from white-gold to violet and the sky is born. */
  var BB = reduced ? 0 : 2.5, BANG = 0.85, t0 = performance.now() + BB * 1000, born = reduced, bangLit = reduced;
  var motes = [];
  for (var mi = 0; mi < 46; mi++) motes.push({ a: rnd() * 6.283, r: 0.25 + rnd() * 0.6, s: 0.6 + rnd() * 1.6 });
  // after the bang (after the NASA Goddard animation the owner shared): streaks of matter rushing past,
  // violet nebula clouds and small galaxies that condense and then dissolve into Zyra's sky
  var streaks = [], nebulae = [], galaxies = [];
  for (var si = 0; si < (mob ? 110 : 170); si++) streaks.push({ a: rnd() * 6.283, v: 0.35 + rnd() * 0.75, w: 0.5 + rnd() * 1.4, lag: rnd() * 0.3 });
  ['126,64,236', '176,84,230', '86,64,214', '150,70,250', '110,80,230', '190,100,240'].forEach(function (rgb) { nebulae.push({ fx: rnd(), fy: rnd(), r: 0.22 + rnd() * 0.3, rgb: rgb }); });
  var galaxySprite = function (tint) {
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var g = c.getContext('2d'), core = g.createRadialGradient(32, 32, 0, 32, 32, 12);
    core.addColorStop(0, 'rgba(255,250,245,1)'); core.addColorStop(0.4, 'rgba(' + tint + ',.6)'); core.addColorStop(1, 'rgba(' + tint + ',0)');
    g.fillStyle = core; g.fillRect(0, 0, 64, 64);
    for (var arm = 0; arm < 2; arm++) for (var k = 0; k < 70; k++) {
      var t = k / 70, ang = arm * Math.PI + t * 4.4, rad = 3 + t * 26;
      g.globalAlpha = (1 - t) * 0.75; g.fillStyle = 'rgba(' + tint + ',1)';
      g.beginPath(); g.arc(32 + Math.cos(ang) * rad, 32 + Math.sin(ang) * rad, 1.6 - t, 0, 6.283); g.fill();
    }
    return c;
  };
  var GAL = [galaxySprite('150,220,255'), galaxySprite('255,170,220'), galaxySprite('200,182,255')];
  for (var gi0 = 0; gi0 < (mob ? 9 : 14); gi0++) galaxies.push({ fx: 0.04 + rnd() * 0.92, fy: 0.04 + rnd() * 0.92, s: 7 + rnd() * 18, rot: rnd() * 6.283, tilt: 0.3 + rnd() * 0.55, g: gi0 % 3 });
  if (reduced) { root.classList.remove('is-bang'); root.classList.add('is-born'); }
  // a point at screen share (fx, fy) and depth z, seen from the front
  var toX = function (fx, z) { return (fx * W - cx) * (CAM + z) / (FOC * scale); };
  var toY = function (fy, z) { return (fy * H - cy) * (CAM + z) / (FOC * scale); };
  var resize = function () {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = root.clientWidth; H = root.clientHeight; mob = W < 760;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    // the name fills most of a phone's width, a bit more than half a computer screen
    scale = Math.min(H * (mob ? 0.62 : 0.95), (mob ? W * 0.86 : W * 0.58) / (WORD_W * K * FOC / CAM));
    cx = W * (mob ? 0.5 : 0.6); cy = H * (mob ? 0.31 : 0.32);
    SF = Math.max(1, Math.min(2, scale / 280));
    nodes.forEach(function (n) { if (n.name) return; var f = (CAM + n.z) / CAM * 0.95; n.x = toX(n.fx, n.z) + n.ox * f; n.y = toY(n.fy, n.z) + n.oy * f; });
    dust.forEach(function (d) { d.x = toX(d.fx, d.z); d.y = toY(d.fy, d.z); });
  };
  resize(); window.addEventListener('resize', resize);

  /* ---------- input: spin the name any way you like; once you stop for a moment, it comes back ---------- */
  var drag = null, uy = 0, up = 0, vyaw = 0, vpitch = 0, lastTouch = -9, IDLE = 1.2, tilt = { x: 0, y: 0 }, ptr = { x: -1, y: -1, on: false };
  cv.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, uy: uy, up: up }; vyaw = vpitch = 0; lastTouch = (performance.now() - t0) / 1000; cv.setPointerCapture(e.pointerId); if (fireNear(e.clientX, e.clientY)) ping(); });
  cv.addEventListener('pointermove', function (e) {
    ptr.x = e.clientX; ptr.y = e.clientY; ptr.on = true;
    if (!drag) return;
    var ny = drag.uy + (e.clientX - drag.x) * 0.006, np = Math.max(-1.45, Math.min(1.45, drag.up + (e.clientY - drag.y) * 0.005));
    vyaw = ny - uy; vpitch = np - up; uy = ny; up = np; lastTouch = (performance.now() - t0) / 1000;
  });
  var release = function () { drag = null; };
  cv.addEventListener('pointerup', release); cv.addEventListener('pointercancel', release);
  cv.addEventListener('pointerleave', function () { ptr.on = false; });
  window.addEventListener('deviceorientation', function (e) {
    if (e.gamma == null) return;
    tilt.x = Math.max(-1, Math.min(1, e.gamma / 35)); tilt.y = Math.max(-1, Math.min(1, (e.beta - 45) / 35));
  });

  /* ---------- light running along the threads ---------- */
  var pulses = [], PCOL = ['#ffffff', '#c3ceff', '#ab92ff'];
  var fire = function (from, depth, col) {
    adj[from].forEach(function (ei) {
      if (pulses.length > 120) return;
      if (depth > 0 && rnd() > 0.6) return;
      var e = edges[ei];
      pulses.push({ e: ei, dir: e.a === from ? 1 : -1, t: 0, sp: 0.02 + rnd() * 0.02, depth: depth, col: col || PCOL[Math.floor(rnd() * 3)] });
    });
  };
  var proj = [];
  var fireNear = function (x, y) {
    var best = -1, bd = 60 * 60;
    proj.forEach(function (p, i) { if (!p) return; var dx = p.x - x, dy = p.y - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } });
    if (best >= 0) { nodes[best].flash = 1; fire(best, 0); return true; }
    return false;
  };

  /* ---------- loading lights the sky ---------- */
  var ready = false, leaving = 0, leaveStart = 0, done = false, novaAt = null, locked = false, lockAt = -9;
  var lightGroup = function (gi) {
    var first = -1;
    nodes.forEach(function (nd, i) { if (nd.grp === gi) { nd.target = 1; if (first < 0) first = i; } });
    if (first >= 0) { nodes[first].flash = 1; fire(first, 0, '#ffffff'); }
  };
  window.__intro = {
    step: function (label, n, total) {
      lightGroup((n - 1) % GROUPS);
      statusEl.textContent = 'Conectando ' + label + '…';
      barEl.style.transform = 'scaleX(' + (n / total).toFixed(3) + ')';
    },
    ready: function () {
      ready = true;
      for (var gi = 0; gi < GROUPS; gi++) nodes.forEach(function (nd) { if (nd.grp === gi) nd.target = 1; });
      fire(NOVA, 0, '#ffffff');
      statusEl.textContent = 'Tudo conectado.';
      barEl.style.transform = 'scaleX(1)';
      if (born) ignite(); // otherwise the buttons ignite right after the universe is born
    },
    fail: function (msg) { statusEl.textContent = msg; root.classList.add('is-failed'); }
  };

  /* ---------- the buttons are stars: they tilt toward the finger and burst into a supernova ---------- */
  var novas = [];
  var ignite = function () {
    if (root.classList.contains('is-ready')) return;
    root.classList.add('is-ready');
    goBtn.disabled = false; readBtn.disabled = false;
    // the two stars ignite with a small flash each
    setTimeout(function () { supernova(goBtn, false); }, 120); setTimeout(function () { supernova(readBtn, false); }, 280);
  };
  var supernova = function (btn, big) {
    if (reduced) return;
    var r = btn.getBoundingClientRect(), parts = [], n = big ? 70 : 22;
    for (var i = 0; i < n; i++) {
      var a = rnd() * 6.283, z = rnd();                       // z: how close the shard flies to us (bigger, faster)
      parts.push({ c: Math.cos(a), s: Math.sin(a), v: (big ? 0.35 : 0.12) * (0.4 + rnd() * 0.9) * (0.6 + z), z: z, b: rnd() < 0.5 });
    }
    novas.push({ x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, t0: performance.now(), big: big, parts: parts, life: big ? 1.1 : 0.8 });
  };
  [goBtn, readBtn].forEach(function (btn) {
    btn.addEventListener('pointermove', function (e) {
      if (reduced || btn.disabled) return;
      var r = btn.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      btn.style.setProperty('--ry', ((px - 0.5) * 22).toFixed(1) + 'deg'); btn.style.setProperty('--rx', ((0.5 - py) * 26).toFixed(1) + 'deg');
      btn.style.setProperty('--mx', (px * 100).toFixed(0) + '%'); btn.style.setProperty('--my', (py * 100).toFixed(0) + '%');
    });
    btn.addEventListener('pointerleave', function () { ['--rx', '--ry', '--mx', '--my'].forEach(function (k) { btn.style.removeProperty(k); }); });
  });

  var enter = function (withVoice) {
    if (!ready || leaving) return;
    if (withVoice) { var st = document.getElementById('bx-stage'); if (st) st.click(); } // same tap starts Zyra (audio needs a gesture)
    chime();
    var btn = withVoice ? goBtn : readBtn; btn.classList.add('is-nova'); supernova(btn, true);
    // the button's supernova plays first, then the sky glides and dives into the A's star
    var HOLD = reduced ? 0 : 380;
    leaving = 1; leaveStart = performance.now() + HOLD;
    nodes[NOVA].flash = 1; fire(NOVA, 0, '#ffffff');
    setTimeout(function () { root.classList.add('is-leaving'); document.documentElement.classList.add('bx-entering'); }, HOLD);
    setTimeout(finish, reduced ? 350 : 1400 + HOLD);
  };
  var finish = function () {
    if (done) return; done = true;
    root.remove(); document.documentElement.classList.remove('bx-entering', 'bx-intro-on');
    window.removeEventListener('resize', resize);
    if (actx) setTimeout(function () { try { actx.close(); } catch (e) {} }, 2600); // let the last bells ring out
  };
  goBtn.addEventListener('click', function () { enter(true); });
  readBtn.addEventListener('click', function () { enter(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') enter(false); });

  /* ---------- draw ---------- */
  var ease = function (x) { return 1 - Math.pow(1 - x, 4); };
  var inout = function (x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  var R = { cy: 1, sy: 0, cp: 1, sp: 0 };
  var rot = function (yaw, pitch) { R.cy = Math.cos(yaw); R.sy = Math.sin(yaw); R.cp = Math.cos(pitch); R.sp = Math.sin(pitch); };
  var P = function (x, y, z) {
    var x1 = x * R.cy - z * R.sy, z1 = x * R.sy + z * R.cy;
    var y1 = y * R.cp - z1 * R.sp, z2 = y * R.sp + z1 * R.cp, dz = cam + z2;
    if (dz < 0.08) return null;
    var s = FOC / dz;
    return { x: cx + x1 * s * scale, y: cy + y1 * s * scale, s: s, z: z2 };
  };
  var S0 = FOC / CAM; // size of the name's plane, so sizes can be given "as seen on the name"
  var frame = function (now) {
    if (done) return;
    var el = (now - t0) / 1000;
    // camera: the opening turn, the user's drag (springs back), a slow breath, and the phone's tilt
    var turn = reduced ? 1 : inout(clamp((el - TURN_AT) / TURN_FOR));
    if (!drag) {
      // a flick keeps it spinning and slowing down, like a globe
      uy += vyaw; vyaw *= 0.95; up = Math.max(-1.45, Math.min(1.45, up + vpitch)); vpitch *= 0.95;
      if (Math.abs(vyaw) > 0.003 || Math.abs(vpitch) > 0.003) lastTouch = el;
      // only after it has been still for a moment does it turn back (the short way) and the name reforms
      if (el - lastTouch > IDLE) { uy = Math.atan2(Math.sin(uy), Math.cos(uy)) * 0.93; up *= 0.93; }
    }
    var still = reduced ? 0 : turn;
    var yawN = OPEN_YAW * (1 - turn) + uy + Math.sin(el * 0.4) * 0.03 * still + tilt.x * 0.1;
    var pitchN = OPEN_PITCH * (1 - turn) + up + Math.sin(el * 0.31) * 0.015 * still + tilt.y * 0.05;
    var align = clamp(1 - (Math.abs(yawN) + Math.abs(pitchN)) / 0.4);
    if (align > 0.96 && !locked) { locked = true; lockAt = el; }
    if (align < 0.75 && locked) { locked = false; nodes.forEach(function (n) { n.hit = false; }); }
    var shine = clamp(1 - (el - lockAt) / 1.3);
    var pen = reduced ? STROKES : clamp((el - WRITE_AT) / WRITE_FOR) * STROKES;
    var lt = leaving ? Math.max(0, Math.min(1.4, (now - leaveStart) / 1000)) : 0;
    if (leaving) { cam = CAM - Math.pow(clamp((lt - 0.25) / 0.95), 2.2) * 3.75; nodes[NOVA].flash = Math.max(nodes[NOVA].flash, lt < 0.5 ? 1 : 0); }
    // the bang: bt counts from the moment the app opens; matter flies out after BANG
    var bt = el + BB, since = bt - BANG, BX = W / 2, BY = H / 2, DIAG = Math.hypot(W, H);
    if (!bangLit && since > 0.05) { bangLit = true; root.classList.remove('is-bang'); }
    if (!born && el > -0.25) { born = true; root.classList.add('is-born'); if (ready) ignite(); }
    var fadeIn = reduced ? 1 : clamp((since - 0.05) / 0.3);       // dust and stars are born in the flash
    var veilIn = reduced ? 1 : ease(clamp((el + 0.5) / 1.5));    // the silk veils settle last, as the sky cools
    var expand = function (p, lag) { // matter thrown out from the bang point, slowing as it reaches its place
      if (reduced || !p) return p;
      var k = ease(clamp((since - lag) / 1.6));
      p.x = BX + (p.x - BX) * k; p.y = BY + (p.y - BY) * k; return p;
    };

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!reduced && bt < BB + 0.8) {
      // the dark before the sky: it lifts as the universe cools
      var cool = since < 0 ? 0 : ease(clamp((since - 0.3) / 1.7));
      if (cool < 1) { ctx.globalAlpha = 1 - cool; ctx.fillStyle = '#04030f'; ctx.fillRect(0, 0, W, H); }
      if (since > 0) {
        ctx.globalCompositeOperation = 'lighter';
        // the fireball: white core, pink-magenta rim, violet all around (the reference's colours)
        var pc = clamp(since / 1.7), PR = 30 + ease(clamp(since / 1.0)) * DIAG * 0.8, pa = 1 - pc;
        var gp = ctx.createRadialGradient(BX, BY, 0, BX, BY, PR);
        gp.addColorStop(0, 'rgba(255,255,255,' + 0.95 * pa * pa + ')');
        gp.addColorStop(0.16, 'rgba(255,196,246,' + 0.7 * pa * pa + ')');
        gp.addColorStop(0.32, 'rgba(222,120,255,' + 0.55 * pa + ')');
        gp.addColorStop(0.6, 'rgba(140,80,255,' + 0.5 * pa + ')');
        gp.addColorStop(0.85, 'rgba(80,50,200,' + 0.3 * pa + ')');
        gp.addColorStop(1, 'rgba(40,24,120,0)');
        ctx.globalAlpha = 1; ctx.fillStyle = gp; ctx.fillRect(BX - PR, BY - PR, PR * 2, PR * 2);
        // nebula clouds condense, then thin out into the sky
        var na = Math.sin(Math.PI * clamp((since - 0.25) / 2.1)) * 0.45;
        if (na > 0.005) nebulae.forEach(function (nb) {
          var nx = nb.fx * W, ny = nb.fy * H, nr = nb.r * Math.max(W, H) * (0.8 + 0.35 * clamp(since / 2.2));
          var gn = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
          gn.addColorStop(0, 'rgba(' + nb.rgb + ',' + na + ')'); gn.addColorStop(0.5, 'rgba(' + nb.rgb + ',' + na * 0.45 + ')'); gn.addColorStop(1, 'rgba(' + nb.rgb + ',0)');
          ctx.fillStyle = gn; ctx.fillRect(nx - nr, ny - nr, nr * 2, nr * 2);
        });
        // galaxies drift outward and fade, leaving the stars of the sky
        var ga = Math.sin(Math.PI * clamp((since - 0.45) / 2.0));
        if (ga > 0.005) galaxies.forEach(function (gx) {
          var spread = 0.8 + 0.3 * clamp(since / 2.4);
          ctx.save(); ctx.translate(BX + (gx.fx * W - BX) * spread, BY + (gx.fy * H - BY) * spread);
          ctx.rotate(gx.rot + since * 0.15); ctx.scale(1, gx.tilt);
          ctx.globalAlpha = ga * 0.9; ctx.drawImage(GAL[gx.g], -gx.s, -gx.s, gx.s * 2, gx.s * 2);
          ctx.restore();
        });
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
    }
    // the whole sky glides so the dive star comes to the middle of the screen
    if (leaving && !reduced) {
      var npj = proj[NOVA];
      if (npj) novaAt = { x: npj.x, y: npj.y };
      if (novaAt) { var gk = ease(clamp((lt - 0.12) / 0.75)); ctx.setTransform(dpr, 0, 0, dpr, (W / 2 - novaAt.x) * gk * dpr, (H / 2 - novaAt.y) * gk * dpr); }
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // 1. veils: the far layers turn only a little (parallax), so the backdrop stays framed
    rot(Math.sin(yawN) * 0.3, Math.sin(pitchN) * 0.3); // bounded, so the backdrop never swings away
    var step = mob ? 0.04 : 0.025, tv = reduced ? 0 : el, f0 = leaving ? -0.7 : -0.15, f1 = leaving ? 1.7 : 1.16; // wider while the sky glides
    for (var v = 0; v < VEILS.length; v++) {
      var vl = VEILS[v], rows = [];
      for (var j = 0; j < vl.n; j++) {
        var row = [];
        for (var fx = f0; fx <= f1; fx += step) {
          var fy = vl.y0 + vl.tilt * (fx - 0.5) + vl.amp * Math.sin(vl.k * fx + tv * vl.sp + vl.ph)
            + j * vl.spread * (0.55 + 0.45 * Math.sin(2.3 * fx + j * 0.33 + tv * 0.13 + vl.ph));
          var pz = vl.z + 0.25 * Math.sin(1.7 * fx + vl.ph);
          var pp = P(toX(fx, pz), toY(fy, pz), pz);
          if (pp) row.push(pp);
        }
        rows.push(row);
      }
      var top = rows[0], bot = rows[rows.length - 1];
      ctx.globalAlpha = veilIn;
      ctx.fillStyle = 'rgba(' + vl.rgb + ',0.075)';
      ctx.beginPath();
      top.forEach(function (p, i) { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
      for (var b = bot.length - 1; b >= 0; b--) ctx.lineTo(bot[b].x, bot[b].y);
      ctx.closePath(); ctx.fill();
      for (var r = 0; r < rows.length; r++) {
        var edge = r === rows.length - 1, q = r / (rows.length - 1);
        ctx.strokeStyle = edge ? 'rgba(204,188,255,0.62)' : 'rgba(' + vl.rgb + ',' + (0.05 + 0.2 * q * q) + ')';
        ctx.lineWidth = edge ? 1.1 : 0.8;
        ctx.beginPath();
        rows[r].forEach(function (p, i) { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
        ctx.stroke();
        if (edge) { ctx.strokeStyle = 'rgba(150,120,255,0.07)'; ctx.lineWidth = 7; ctx.stroke(); }
      }
    }

    // 2. star dust, twinkling
    for (var d = 0; d < dust.length; d++) {
      var du = dust[d], dp = expand(P(du.x, du.y, du.z), du.ph * 0.04);
      if (!dp) continue;
      var tw = reduced ? 0.8 : 0.55 + 0.45 * Math.sin(el * du.tw + du.ph);
      var dr = du.r * dp.s / S0;
      ctx.globalAlpha = fadeIn * tw * Math.min(1, 0.35 + dp.s);
      if (du.glow) { var gs = dr * 9; ctx.drawImage(du.blue ? HALO_B : HALO_V, dp.x - gs / 2, dp.y - gs / 2, gs, gs); }
      else { ctx.fillStyle = du.blue ? '#b9c8ff' : '#e6e2ff'; ctx.fillRect(dp.x - dr / 2, dp.y - dr / 2, dr, dr); }
    }

    // 3. project every star: the sky with the backdrop's gentle turn, the name with the full turn
    proj.length = nodes.length;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.name) continue;
      n.lit += ((n.target ? 0.85 : 0.2) - n.lit) * 0.05;
      n.flash *= 0.94;
      var pj = expand(P(n.x, n.y, n.z), n.delay * 0.15);
      if (pj) pj.a = reduced ? 1 : clamp((since - n.delay * 0.15) / 0.35);
      proj[i] = pj;
    }
    rot(yawN, pitchN);
    for (var i2 = 0; i2 < nodes.length; i2++) {
      var nn = nodes[i2];
      if (!nn.name) continue;
      nn.flash *= 0.94;
      // the lock: once the stars line up, a wave of light runs through the name, left to right
      if (locked && !nn.hit && (el - lockAt) / 0.8 >= nn.u) { nn.hit = true; nn.flash = 1; }
      var pa = clamp((pen - nn.first) * 1.6);
      if (pa <= 0) { proj[i2] = null; continue; }
      var pn = P(nn.x, nn.y, nn.z);
      if (pn) pn.a = pa;
      proj[i2] = pn;
    }

    // 4. threads
    for (var k = 0; k < edges.length; k++) {
      var e = edges[k], p = proj[e.a], qq = proj[e.b];
      if (e.name) {
        var part = clamp(pen - e.order);
        if (part <= 0 || !p) continue;
        var B = qq || p, ex = p.x + (B.x - p.x) * part, ey = p.y + (B.y - p.y) * part, sr = Math.min(1.6, p.s / S0);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(132,108,255,' + (0.1 + 0.16 * align + 0.25 * shine) + ')'; ctx.lineWidth = 7 * SF * sr;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = 'rgba(' + LINE + ',' + (0.5 + 0.35 * align + 0.15 * shine) + ')'; ctx.lineWidth = 1.4 * SF * sr;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey); ctx.stroke();
        continue;
      }
      if (!p || !qq) continue;
      var l = (nodes[e.a].lit + nodes[e.b].lit) / 2;
      ctx.globalAlpha = Math.min(p.a, qq.a);
      ctx.strokeStyle = 'rgba(' + LINE + ',' + (0.06 + 0.4 * l) + ')'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(qq.x, qq.y); ctx.stroke();
    }

    // 5. pulses
    if (!reduced && !leaving && rnd() < (ready ? 0.07 : 0.04)) fire(Math.floor(rnd() * nodes.length), 1);
    for (var m = pulses.length - 1; m >= 0; m--) {
      var pu = pulses[m], ed = edges[pu.e];
      pu.t += pu.sp;
      var from = pu.dir > 0 ? ed.a : ed.b, to = pu.dir > 0 ? ed.b : ed.a, PA = proj[from], PB = proj[to];
      if (pu.t >= 1) { pulses.splice(m, 1); nodes[to].flash = Math.max(nodes[to].flash, 0.8); if (pu.depth < 3) fire(to, pu.depth + 1, pu.col); continue; }
      if (!PA || !PB) continue;
      var px = PA.x + (PB.x - PA.x) * pu.t, py = PA.y + (PB.y - PA.y) * pu.t, ps = 16 * Math.min(1.5, PA.s / S0);
      ctx.globalAlpha = 0.9; ctx.drawImage(pu.col === '#ab92ff' ? HALO_V : HALO_B, px - ps / 2, py - ps / 2, ps, ps);
    }

    // 6. stars: a soft halo and a tiny white core, like the reference
    for (var w = 0; w < nodes.length; w++) {
      var pr = proj[w], nd = nodes[w];
      if (!pr) continue;
      var hover = ptr.on ? Math.max(0, 1 - Math.hypot(pr.x - ptr.x, pr.y - ptr.y) / 90) : 0;
      var glow = Math.min(1.6, (nd.name ? 0.75 + 0.25 * align : nd.lit) + nd.flash + hover * 0.7);
      var rr = nd.r * Math.min(1.8, pr.s / S0) * (nd.name ? SF : 1) * (1 + nd.flash * 0.5 + hover * 0.4);
      var hs = rr * (nd.name ? 9 : 7) * (0.7 + 0.3 * glow);
      ctx.globalAlpha = Math.min(1, glow) * pr.a;
      ctx.drawImage(nd.halo, pr.x - hs / 2, pr.y - hs / 2, hs, hs);
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = Math.min(1, 0.35 + 0.65 * glow) * pr.a;
      ctx.beginPath(); ctx.arc(pr.x, pr.y, Math.max(0.6, rr * 0.42), 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 7. the dive: the A's star bursts into a four-point sparkle, a ring, then its light fills the screen
    if (leaving && novaAt) {
      var sx0 = novaAt.x, sy0 = novaAt.y, burst = Math.min(1, lt / 0.45);
      var arm = (30 + 260 * ease(burst)) * SF, fadeArm = Math.max(0, 1 - Math.max(0, lt - 0.35) / 0.5);
      ctx.save(); ctx.translate(sx0, sy0); ctx.rotate(lt * 0.6);
      for (var r4 = 0; r4 < 4; r4++) {
        var len = r4 % 2 ? arm * 0.62 : arm;
        var g4 = ctx.createLinearGradient(0, 0, len, 0);
        g4.addColorStop(0, 'rgba(255,255,255,' + 0.95 * fadeArm + ')'); g4.addColorStop(0.35, 'rgba(160,176,255,' + 0.5 * fadeArm + ')'); g4.addColorStop(1, 'rgba(130,100,255,0)');
        ctx.fillStyle = g4; ctx.beginPath(); ctx.moveTo(0, -3 * SF); ctx.lineTo(len, 0); ctx.lineTo(0, 3 * SF); ctx.closePath(); ctx.fill();
        ctx.rotate(Math.PI / 2);
      }
      ctx.restore();
      var ring = ease(Math.min(1, lt / 0.7));
      ctx.globalAlpha = Math.max(0, 0.6 * (1 - ring)); ctx.strokeStyle = '#c4b4ff'; ctx.lineWidth = 2 * SF;
      ctx.beginPath(); ctx.arc(sx0, sy0, 12 * SF + ring * Math.max(W, H) * 0.45, 0, 6.283); ctx.stroke();
      ctx.globalAlpha = 1;
      var bl = clamp((lt - 0.3) / 0.55), bloomA = Math.sin(Math.PI * Math.min(1, bl * 0.85)) * 0.85;
      if (bl > 0) {
        var RR = 20 + ease(bl) * Math.hypot(W, H);
        var gb = ctx.createRadialGradient(sx0, sy0, 0, sx0, sy0, RR);
        gb.addColorStop(0, 'rgba(244,246,255,' + bloomA + ')'); gb.addColorStop(0.3, 'rgba(150,130,255,' + bloomA * 0.55 + ')'); gb.addColorStop(1, 'rgba(60,40,160,0)');
        ctx.fillStyle = gb; ctx.fillRect(sx0 - RR, sy0 - RR, RR * 2, RR * 2);
      }
    }
    // 8. supernovas from the buttons, drawn on the screen itself (they don't glide with the sky)
    if (novas.length) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (var sn = novas.length - 1; sn >= 0; sn--) {
        var nv = novas[sn], nt = (now - nv.t0) / 1000 / nv.life;
        if (nt >= 1) { novas.splice(sn, 1); continue; }
        var big = nv.big, reach = Math.max(W, H) * (big ? 0.75 : 0.18), et = ease(nt);
        // flash: a white core that swells and fades
        var fl = Math.max(0, 1 - nt * (big ? 2.2 : 3)), fr = nv.h * (big ? 2.2 : 1.2) * (0.6 + et);
        if (fl > 0) { ctx.globalAlpha = fl; ctx.drawImage(HALO_B, nv.x - fr * 2, nv.y - fr * 2, fr * 4, fr * 4); }
        // shockwaves: rings shaped like the button, flattened as they spread
        for (var ri = 0; ri < (big ? 3 : 1); ri++) {
          var rt = clamp(nt * 1.25 - ri * 0.12); if (rt <= 0) continue;
          var re = ease(rt), rx = nv.w / 2 + reach * re, ry = nv.h / 2 + reach * re * 0.62;
          ctx.globalAlpha = (1 - rt) * (big ? 0.7 : 0.55); ctx.strokeStyle = ri ? 'rgba(150,170,255,1)' : 'rgba(214,204,255,1)'; ctx.lineWidth = (big ? 2.4 : 1.4) * (1 - rt * 0.6);
          ctx.beginPath(); ctx.ellipse(nv.x, nv.y, rx, ry, 0, 0, 6.283); ctx.stroke();
        }
        // debris: shards of light thrown out, nearer ones bigger and faster
        for (var pi = 0; pi < nv.parts.length; pi++) {
          var pt = nv.parts[pi], d1 = reach * pt.v * 2.6 * et, d0 = reach * pt.v * 2.6 * ease(Math.max(0, nt - 0.08));
          var ax = nv.x + pt.c * (nv.w / 2 * 0.8 + d1), ay = nv.y + pt.s * (nv.h / 2 + d1 * 0.75), bx = nv.x + pt.c * (nv.w / 2 * 0.8 + d0), by = nv.y + pt.s * (nv.h / 2 + d0 * 0.75);
          ctx.globalAlpha = (1 - nt) * (0.5 + 0.5 * pt.z);
          ctx.strokeStyle = pt.b ? 'rgba(200,214,255,1)' : 'rgba(186,160,255,1)'; ctx.lineWidth = 0.8 + pt.z * 1.6;
          ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ax, ay); ctx.stroke();
          var hz = (4 + pt.z * 10) * (1 - nt * 0.5); ctx.drawImage(pt.b ? HALO_B : HALO_V, ax - hz / 2, ay - hz / 2, hz, hz);
        }
      }
      ctx.globalAlpha = 1;
    }
    // 9. the Big Bang itself, on top of everything
    if (!reduced && since < 2.4) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      if (since < 0) {
        // the singularity: a violet star in the dark, pulling matter in and pulsing faster and brighter
        var g0 = clamp(bt / BANG), pulse = 0.78 + 0.22 * Math.sin(bt * 24 * (0.5 + g0));
        for (var mo = 0; mo < motes.length; mo++) {
          var mt = motes[mo], mr = mt.r * Math.min(W, H) * Math.pow(1 - g0, 1.6), ma = mt.a + g0 * mt.s * 3;
          ctx.globalAlpha = 0.2 + 0.6 * g0; ctx.fillStyle = mo % 3 ? '#cfc4ff' : '#e6b8ff';
          ctx.fillRect(BX + Math.cos(ma) * mr - 1, BY + Math.sin(ma) * mr * 0.8 - 1, 2, 2);
        }
        var hs0 = (24 + 170 * g0 * g0) * pulse;
        ctx.globalAlpha = 0.55 + 0.45 * g0; ctx.drawImage(HALO_V, BX - hs0 / 2, BY - hs0 / 2, hs0, hs0);
        var spk = (8 + 60 * g0 * g0) * pulse;
        ctx.save(); ctx.translate(BX, BY); ctx.rotate(bt * 0.35);
        for (var r6 = 0; r6 < 6; r6++) {
          var sl = r6 % 3 ? spk * 0.55 : spk, gs6 = ctx.createLinearGradient(0, 0, sl, 0);
          gs6.addColorStop(0, 'rgba(255,255,255,.95)'); gs6.addColorStop(1, 'rgba(180,140,255,0)');
          ctx.globalAlpha = 0.6 + 0.4 * g0; ctx.fillStyle = gs6; ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(sl, 0); ctx.lineTo(0, 1); ctx.closePath(); ctx.fill();
          ctx.rotate(Math.PI / 3);
        }
        ctx.restore();
        ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(BX, BY, 1.4 + 2.6 * g0 * pulse, 0, 6.283); ctx.fill();
      } else {
        // matter rushing out toward us: streaks that lengthen as they come closer
        for (var sk = 0; sk < streaks.length; sk++) {
          var sx = streaks[sk], st = clamp((since - sx.lag) / 1.15);
          if (st <= 0 || st >= 1) continue;
          var r1 = 8 + Math.pow(st, 1.7) * DIAG * 0.75 * sx.v, r0 = r1 * (0.8 - 0.25 * st), ca = Math.cos(sx.a), sa = Math.sin(sx.a);
          ctx.globalAlpha = (1 - st) * 0.8; ctx.strokeStyle = sk % 4 ? 'rgba(226,216,255,1)' : 'rgba(255,190,240,1)'; ctx.lineWidth = sx.w * (0.5 + 1.6 * st);
          ctx.beginPath(); ctx.moveTo(BX + ca * r0, BY + sa * r0); ctx.lineTo(BX + ca * r1, BY + sa * r1); ctx.stroke();
        }
        // the shockwave
        var sw = ease(clamp(since / 1.0));
        ctx.globalAlpha = Math.max(0, 0.7 * (1 - sw)); ctx.strokeStyle = '#f0d8ff'; ctx.lineWidth = 2 + 6 * (1 - sw);
        ctx.beginPath(); ctx.arc(BX, BY, 10 + sw * DIAG * 0.62, 0, 6.283); ctx.stroke();
        // the beam: a vertical flare that splits the sky from top to bottom, then fades
        var bm = since < 0.12 ? since / 0.12 : Math.pow(Math.max(0, 1 - (since - 0.12) / 1.7), 1.5);
        if (bm > 0) {
          var bw = 26 + 110 * (1 - clamp(since / 1.4)), gbm = ctx.createLinearGradient(BX - bw, 0, BX + bw, 0);
          gbm.addColorStop(0, 'rgba(170,140,255,0)'); gbm.addColorStop(0.5, 'rgba(236,226,255,' + 0.6 * bm + ')'); gbm.addColorStop(1, 'rgba(170,140,255,0)');
          ctx.globalAlpha = 1; ctx.fillStyle = gbm; ctx.fillRect(BX - bw, 0, bw * 2, H);
          ctx.globalAlpha = bm; ctx.fillStyle = '#fff'; ctx.fillRect(BX - 1, 0, 2, H);
          var cg = 40 + 140 * bm; ctx.globalAlpha = bm; ctx.drawImage(HALO_V, BX - cg / 2, BY - cg / 2, cg, cg);
        }
        // the flash: the whole screen goes white for an instant
        ctx.globalCompositeOperation = 'source-over';
        var fl0 = Math.pow(Math.max(0, 1 - (since - 0.06) / 0.6), 2) * clamp(since / 0.06);
        if (fl0 > 0) { // a violet glow under the white, so the fade passes through lavender instead of grey
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, fl0 * 1.6); ctx.fillStyle = '#7a4dff'; ctx.fillRect(0, 0, W, H);
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.92 * fl0 * fl0; ctx.fillStyle = '#fbf6ff'; ctx.fillRect(0, 0, W, H); }
      }
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})();
