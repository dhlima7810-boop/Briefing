/* Abertura: a rede neural do ícone em 3D.
   Analogia: o briefing é um cérebro que acorda. Cada arquivo do dia que chega acende uma região;
   quando tudo acende, a pessoa entra mergulhando no centro (o ponto açafrão do ícone).
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

  /* ---------- the brain ---------- */
  var REGIONS = 11;
  var rnd = (function (s) { return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })(20261105);
  var nodes = [], edges = [], adj = [];
  // the six nodes and seven links of the app icon, at the front of the brain
  var ICON = [[146, 300], [214, 196], [256, 340], [300, 236], [366, 330], [366, 150]];
  var ICON_LINKS = [[0, 1], [1, 3], [3, 5], [1, 2], [2, 3], [2, 4], [4, 5]];
  ICON.forEach(function (p, i) {
    nodes.push({ x: (p[0] - 256) / 150, y: (p[1] - 256) / 150, z: -0.55 + (i % 2) * 0.12, core: true, r: i === 3 ? 7 : i === 5 ? 5.5 : 4.5,
      col: i === 3 ? '#ffb829' : i === 5 ? '#34c9a3' : '#ffffff', reg: -1, lit: 1 });
  });
  var N = window.innerWidth < 600 ? 150 : 210;
  while (nodes.length < N + ICON.length) {
    var x = rnd() * 2 - 1, y = rnd() * 2 - 1, z = rnd() * 2 - 1;
    var d = x * x / 1.0 + y * y / 0.62 + z * z / 0.8;
    if (d > 1 || d < 0.35) continue;            // a shell, like the cortex
    if (Math.abs(x) < 0.05) continue;           // the fissure between hemispheres
    var sx = x * 1.35, sy = y * 1.05 - 0.05 + (x * x) * 0.12, sz = z * 1.1;
    var ang = Math.atan2(sz, sx);
    nodes.push({ x: sx, y: sy, z: sz, core: false, r: 1.2 + rnd() * 1.6,
      col: rnd() < 0.12 ? '#a98bff' : rnd() < 0.08 ? '#5fb8ff' : '#e4e4e6',
      reg: Math.floor(((ang + Math.PI) / (2 * Math.PI)) * REGIONS) % REGIONS, lit: 0 });
  }
  nodes.forEach(function () { adj.push([]); });
  var link = function (a, b, core) { edges.push({ a: a, b: b, core: !!core }); adj[a].push(edges.length - 1); adj[b].push(edges.length - 1); };
  ICON_LINKS.forEach(function (l) { link(l[0], l[1], true); });
  for (var i = 0; i < nodes.length; i++) {
    var near = [];
    for (var j = 0; j < nodes.length; j++) if (j !== i) {
      var dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y, dz = nodes[i].z - nodes[j].z;
      near.push([dx * dx + dy * dy + dz * dz, j]);
    }
    near.sort(function (p, q) { return p[0] - q[0]; });
    for (var k = 0; k < (nodes[i].core ? 2 : 3); k++) {
      var jj = near[k][1];
      if (!edges.some(function (e) { return (e.a === i && e.b === jj) || (e.a === jj && e.b === i); })) link(i, jj, false);
    }
  }
  // every node starts scattered far away and flies into place
  nodes.forEach(function (n) { n.sx = (rnd() * 2 - 1) * 6; n.sy = (rnd() * 2 - 1) * 6; n.sz = 4 + rnd() * 8; n.delay = rnd() * 0.5; });

  /* ---------- camera and input ---------- */
  var W = 0, H = 0, dpr = 1;
  var yaw = -0.35, pitch = 0.12, vyaw = reduced ? 0 : 0.0016, vpitch = 0, cam = 3.4, t0 = performance.now();
  var drag = null, tilt = { x: 0, y: 0 }, ptr = { x: -1, y: -1, on: false };
  var resize = function () {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = root.clientWidth; H = root.clientHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize(); window.addEventListener('resize', resize);
  cv.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, yaw: yaw, pitch: pitch, t: performance.now() }; cv.setPointerCapture(e.pointerId); fireNear(e.clientX, e.clientY); });
  cv.addEventListener('pointermove', function (e) {
    ptr.x = e.clientX; ptr.y = e.clientY; ptr.on = true;
    if (!drag) return;
    var ny = drag.yaw + (e.clientX - drag.x) * 0.006, np = Math.max(-1, Math.min(1, drag.pitch + (e.clientY - drag.y) * 0.004));
    vyaw = ny - yaw; vpitch = np - pitch; yaw = ny; pitch = np;
  });
  var up = function () { drag = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', function () { ptr.on = false; });
  window.addEventListener('deviceorientation', function (e) {
    if (e.gamma == null) return;
    tilt.x = Math.max(-1, Math.min(1, e.gamma / 35)); tilt.y = Math.max(-1, Math.min(1, (e.beta - 45) / 35));
  });

  /* ---------- synapses: light that runs along the links ---------- */
  var pulses = [];
  var fire = function (from, depth, col) {
    adj[from].forEach(function (ei) {
      if (pulses.length > 160) return;
      if (depth > 0 && rnd() > 0.55) return;
      var e = edges[ei];
      pulses.push({ e: ei, dir: e.a === from ? 1 : -1, t: 0, sp: 0.022 + rnd() * 0.02, depth: depth, col: col || (rnd() < 0.5 ? '#ffb829' : '#34c9a3') });
    });
  };
  var proj = [];
  var fireNear = function (cx, cy) {
    var best = -1, bd = 70 * 70;
    proj.forEach(function (p, i) { if (!p) return; var dx = p.x - cx, dy = p.y - cy, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } });
    if (best >= 0) { nodes[best].flash = 1; fire(best, 0); }
  };

  /* ---------- loading drives the light ---------- */
  var lit = 0, ready = false, leaving = 0, leaveStart = 0, done = false;
  window.__intro = {
    step: function (label, n, total) {
      lit = Math.max(lit, n);
      var reg = (n - 1) % REGIONS;
      nodes.forEach(function (nd, i) { if (nd.reg === reg) { nd.target = 1; if (rnd() < 0.08) fire(i, 1); } });
      statusEl.textContent = 'Conectando ' + label + '…';
      barEl.style.transform = 'scaleX(' + (n / total).toFixed(3) + ')';
    },
    ready: function () {
      ready = true;
      nodes.forEach(function (nd) { nd.target = 1; });
      fire(3, 0, '#ffb829');
      statusEl.textContent = 'Tudo conectado.';
      barEl.style.transform = 'scaleX(1)';
      root.classList.add('is-ready');
      goBtn.disabled = false; readBtn.disabled = false;
    },
    fail: function (msg) { statusEl.textContent = msg; root.classList.add('is-failed'); }
  };

  var enter = function (withVoice) {
    if (!ready || leaving) return;
    if (withVoice) { var st = document.getElementById('bx-stage'); if (st) st.click(); } // same tap starts Zyra (audio needs a gesture)
    leaving = 1; leaveStart = performance.now();
    root.classList.add('is-leaving');
    document.documentElement.classList.add('bx-entering');
    setTimeout(finish, reduced ? 350 : 1150);
  };
  var finish = function () {
    if (done) return; done = true;
    root.remove(); document.documentElement.classList.remove('bx-entering', 'bx-intro-on');
    window.removeEventListener('resize', resize);
  };
  goBtn.addEventListener('click', function () { enter(true); });
  readBtn.addEventListener('click', function () { enter(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') enter(false); });

  /* ---------- draw ---------- */
  var ease = function (x) { return 1 - Math.pow(1 - x, 4); };
  var frame = function (now) {
    if (done) return;
    var el = (now - t0) / 1000;
    if (!drag) { yaw += vyaw; pitch += vpitch; vyaw += ((reduced ? 0 : 0.0016) - vyaw) * 0.03; vpitch *= 0.92; pitch += (0.12 + tilt.y * 0.35 - pitch) * 0.02; }
    var yw = yaw + tilt.x * 0.5;
    if (leaving) { var lt = Math.min(1, (now - leaveStart) / 1000); cam = 3.4 - Math.pow(lt, 2.2) * 3.75; }
    var scale = Math.min(W, H) * (W < 600 ? 0.62 : 0.66);
    var cx = W * (W < 760 ? 0.5 : 0.62), cy = H * (W < 760 ? 0.36 : 0.46);
    var cyw = Math.cos(yw), syw = Math.sin(yw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    ctx.clearRect(0, 0, W, H);
    proj.length = nodes.length;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var a = reduced ? 1 : ease(Math.max(0, Math.min(1, (el - n.delay) / 1.6)));
      var x = n.sx + (n.x - n.sx) * a, y = n.sy + (n.y - n.sy) * a, z = n.sz + (n.z - n.sz) * a;
      var x1 = x * cyw - z * syw, z1 = x * syw + z * cyw;
      var y1 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      var dz = cam + z2;
      if (dz < 0.08) { proj[i] = null; continue; }
      var s = 1.9 / dz;
      n.lit += ((n.target || (n.core ? 1 : 0.18)) - n.lit) * 0.05;
      if (n.flash) n.flash *= 0.94;
      proj[i] = { x: cx + x1 * s * scale, y: cy + y1 * s * scale, s: s, z: z2, a: a };
    }
    // links
    ctx.lineCap = 'round';
    for (var k = 0; k < edges.length; k++) {
      var e = edges[k], p = proj[e.a], q = proj[e.b];
      if (!p || !q) continue;
      var depth = Math.max(0, Math.min(1, 1 - ((p.z + q.z) / 2 + 1.4) / 2.8));
      var l = (nodes[e.a].lit + nodes[e.b].lit) / 2;
      ctx.strokeStyle = e.core ? 'rgba(128,82,255,' + (0.35 + 0.5 * depth) * Math.min(p.a, q.a) + ')' : 'rgba(128,82,255,' + (0.05 + 0.32 * l * depth) * Math.min(p.a, q.a) + ')';
      ctx.lineWidth = e.core ? 2.2 * Math.min(p.s, 1.6) : 1;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    }
    // pulses
    if (!reduced && !leaving && rnd() < (ready ? 0.12 : 0.06)) fire(Math.floor(rnd() * nodes.length), 1);
    for (var m = pulses.length - 1; m >= 0; m--) {
      var pu = pulses[m], ed = edges[pu.e];
      pu.t += pu.sp;
      var from = pu.dir > 0 ? ed.a : ed.b, to = pu.dir > 0 ? ed.b : ed.a, P = proj[from], Q = proj[to];
      if (pu.t >= 1) { pulses.splice(m, 1); nodes[to].flash = Math.max(nodes[to].flash || 0, 0.8); if (pu.depth < 4) fire(to, pu.depth + 1, pu.col); continue; }
      if (!P || !Q) continue;
      var px = P.x + (Q.x - P.x) * pu.t, py = P.y + (Q.y - P.y) * pu.t;
      ctx.globalAlpha = 0.25; ctx.fillStyle = pu.col; ctx.beginPath(); ctx.arc(px, py, 6 * Math.min(P.s, 1.5), 0, 6.283); ctx.fill();
      ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(px, py, 1.8 * Math.min(P.s, 1.5), 0, 6.283); ctx.fill();
    }
    // nodes, far to near
    var order = [];
    for (var o = 0; o < proj.length; o++) if (proj[o]) order.push(o);
    order.sort(function (u, v) { return proj[v].z - proj[u].z; });
    for (var w = 0; w < order.length; w++) {
      var id = order[w], pr = proj[id], nd = nodes[id];
      var dep = Math.max(0.15, Math.min(1, 1 - (pr.z + 1.4) / 2.8));
      var hover = ptr.on ? Math.max(0, 1 - Math.hypot(pr.x - ptr.x, pr.y - ptr.y) / 90) : 0;
      var glow = Math.min(1, nd.lit + (nd.flash || 0) + hover * 0.8);
      var rr = nd.r * pr.s * (1 + (nd.flash || 0) * 0.6 + hover * 0.5);
      ctx.fillStyle = nd.col;
      ctx.globalAlpha = 0.14 * glow * pr.a; ctx.beginPath(); ctx.arc(pr.x, pr.y, rr * 3.4, 0, 6.283); ctx.fill();
      ctx.globalAlpha = (0.25 + 0.75 * glow) * dep * pr.a; ctx.beginPath(); ctx.arc(pr.x, pr.y, rr, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})();
