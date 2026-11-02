/* =============================================================
   Roue de Noël — Galzin
   ============================================================= */
(() => {
  "use strict";
  const CFG = window.ROUE_CONFIG;
  const DEMO = !CFG.supabaseUrl || !CFG.supabaseKey;
  const $ = (s) => document.querySelector(s);
  const TAU = Math.PI * 2;
  const STORE_KEY = "galzin-roue-noel";

  const state = { lots: [], player: null, rot: 0, spinning: false, done: false };

  /* ---------------- Navigation ---------------- */
  function go(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("is-active", s.id === id));
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    if (id === "s-wheel") drawWheel();
  }
  document.querySelectorAll("[data-go]").forEach((b) =>
    b.addEventListener("click", () => { sfx.click(); go(b.dataset.go); })
  );

  /* ---------------- Son (WebAudio, sans fichier) ---------------- */
  const sfx = (() => {
    let ctx = null, on = true;
    const ac = () => (ctx ||= new (window.AudioContext || window.webkitAudioContext)());
    function tone(freq, dur, type = "sine", vol = 0.15, when = 0) {
      if (!on) return;
      try {
        const c = ac(), t = c.currentTime + when;
        const o = c.createOscillator(), g = c.createGain();
        o.type = type; o.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur);
      } catch (_) {}
    }
    return {
      toggle() { on = !on; return on; },
      click() { tone(660, 0.08, "triangle", 0.12); },
      tick() { tone(1400, 0.035, "square", 0.05); },
      // Jingle bells (mi mi mi, mi mi mi, mi sol do ré mi)
      win() {
        const n = [659, 659, 659, 0, 659, 659, 659, 0, 659, 784, 523, 587, 659];
        n.forEach((f, i) => f && tone(f, 0.22, "triangle", 0.16, i * 0.14));
        [1568, 2093, 2637].forEach((f, i) => tone(f, 0.5, "sine", 0.05, 1.9 + i * 0.08));
      },
    };
  })();
  $("#sound").addEventListener("click", (e) => {
    const on = sfx.toggle();
    e.currentTarget.textContent = on ? "🔊" : "🔇";
    e.currentTarget.setAttribute("aria-label", on ? "Couper le son" : "Activer le son");
  });

  /* ---------------- API ---------------- */
  async function rpc(fn, body) {
    const r = await fetch(`${CFG.supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: Object.assign(
        { "Content-Type": "application/json", apikey: CFG.supabaseKey },
        // Les anciennes clés "anon" (JWT) vont aussi dans Authorization ; pas les nouvelles sb_publishable_
        CFG.supabaseKey.startsWith("sb_") ? {} : { Authorization: `Bearer ${CFG.supabaseKey}` }
      ),
      body: JSON.stringify(body || {}),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.message || "ERREUR_RESEAU");
    return data;
  }

  const ERRORS = {
    NOM_INVALIDE: "Merci de renseigner votre prénom et votre nom.",
    CARTE_INVALIDE: "Ce numéro de carte de fidélité ne semble pas valide.",
    PLUS_DE_LOTS: "Tous les cadeaux ont été distribués, merci pour votre participation !",
  };
  const errorText = (e) => ERRORS[e.message] || "Oups, la connexion a échoué. Réessayez dans un instant.";

  async function loadLots() {
    if (DEMO) { state.lots = CFG.lotsDemo; return; }
    try { state.lots = await rpc("lots_publics"); }
    catch (_) { state.lots = CFG.lotsDemo; }
  }

  async function draw(player) {
    if (!DEMO) return rpc("tourner_roue", { p_nom: player.nom, p_prenom: player.prenom, p_carte: player.carte });
    // Mode démo : tirage local pondéré
    await new Promise((r) => setTimeout(r, 700));
    const pool = CFG.lotsDemo;
    let r = Math.random() * pool.reduce((s, l) => s + l.poids, 0);
    const lot = pool.find((l) => (r -= l.poids) < 0) || pool[0];
    const rand = () => Array.from({ length: 4 }, () => "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 32)]).join("");
    return { deja_joue: false, lot_id: lot.id, titre: lot.titre, sous_titre: lot.sous_titre, description: lot.description,
             code: `NOEL-${rand()}-${rand()}`, prenom: player.prenom, created_at: new Date().toISOString() };
  }

  /* ---------------- Formulaire ---------------- */
  $("#reglement").href = CFG.reglementUrl;
  $("#form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.currentTarget, err = $("#form-error");
    let ok = true;
    ["prenom", "nom", "carte"].forEach((n) => {
      const el = f.elements[n];
      const v = el.value.trim();
      const bad = n === "carte" ? v.replace(/[^0-9a-z]/gi, "").length < 4 : v.length < 1;
      el.classList.toggle("bad", bad);
      if (bad) ok = false;
    });
    const consent = f.elements.consent;
    consent.parentElement.classList.toggle("bad", !consent.checked);
    if (!ok || !consent.checked) {
      err.textContent = !ok ? "Merci de remplir tous les champs." : "Merci d'accepter le règlement du jeu.";
      err.hidden = false; vibrate(80);
      return;
    }
    err.hidden = true;
    state.player = { prenom: f.elements.prenom.value.trim(), nom: f.elements.nom.value.trim(), carte: f.elements.carte.value.trim() };

    // Déjà joué aujourd'hui sur cet appareil avec cette carte → on remontre le ticket
    const saved = loadSaved();
    if (saved && saved.carte === normCard(state.player.carte)) { showWin(saved.result, true); return; }

    sfx.click();
    $("#hello").textContent = `À vous de jouer, ${state.player.prenom} !`;
    go("s-wheel");
  });
  const normCard = (c) => c.replace(/[^0-9a-z]/gi, "").toUpperCase();

  /* ---------------- Roue ---------------- */
  const cv = $("#wheel"), cx = cv.getContext("2d");
  const W = cv.width, R = W / 2;
  let bulbPhase = 0;

  function textColor(bg) {
    const n = parseInt(bg.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#2a1d14" : "#fdf0e2";
  }

  function drawWheel() {
    const lots = state.lots, n = lots.length;
    if (!n) return;
    const seg = TAU / n;
    cx.clearRect(0, 0, W, W);
    cx.save(); cx.translate(R, R);

    // Couronne
    cx.beginPath(); cx.arc(0, 0, R - 2, 0, TAU); cx.fillStyle = "#3c1f0e"; cx.fill();
    cx.beginPath(); cx.arc(0, 0, R - 14, 0, TAU); cx.fillStyle = "#c99a4a"; cx.fill();

    const rIn = R - 40;
    cx.rotate(state.rot);
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 + i * seg, a1 = a0 + seg;
      cx.beginPath(); cx.moveTo(0, 0); cx.arc(0, 0, rIn, a0, a1); cx.closePath();
      cx.fillStyle = lots[i].couleur; cx.fill();
      cx.lineWidth = 4; cx.strokeStyle = "#ffcc4d"; cx.stroke();

      // Textes
      cx.save();
      cx.rotate(a0 + seg / 2);
      cx.textAlign = "right"; cx.textBaseline = "middle";
      const col = textColor(lots[i].couleur);
      cx.fillStyle = col;
      const big = lots[i].titre.length > 5 ? 50 : 64;
      cx.font = `${big}px "Bebas Neue", sans-serif`;
      cx.fillText(lots[i].titre, rIn - 26, -12);
      cx.font = `600 italic 26px "Crimson Pro", serif`;
      cx.fillStyle = col === "#2a1d14" ? "#3c1f0e" : "#ffcc4d";
      cx.fillText(lots[i].sous_titre, rIn - 26, 26);
      cx.restore();
    }
    cx.rotate(-state.rot);

    // Ampoules de la couronne
    const bulbs = 24;
    for (let i = 0; i < bulbs; i++) {
      const a = (i / bulbs) * TAU, lit = (i + bulbPhase) % 2 === 0;
      const x = Math.cos(a) * (R - 22), y = Math.sin(a) * (R - 22);
      cx.beginPath(); cx.arc(x, y, 8, 0, TAU);
      cx.fillStyle = lit ? "#fff6d8" : "#e2132b";
      cx.shadowColor = lit ? "#ffcc4d" : "transparent"; cx.shadowBlur = lit ? 18 : 0;
      cx.fill();
    }
    cx.shadowBlur = 0;
    cx.restore();
  }
  setInterval(() => { bulbPhase = (bulbPhase + 1) % 2; if (!state.spinning) drawWheel(); }, state.spinning ? 120 : 450);

  const pointer = $("#pointer");
  let lastSeg = -1;
  function tickCheck() {
    const n = state.lots.length, seg = TAU / n;
    const idx = Math.floor((((-state.rot) % TAU) + TAU) % TAU / seg);
    if (idx !== lastSeg) {
      lastSeg = idx;
      sfx.tick();
      pointer.classList.remove("tick"); void pointer.offsetWidth; pointer.classList.add("tick");
    }
  }

  async function spin() {
    if (state.spinning || state.done) return;
    state.spinning = true;
    $("#spin-btn").disabled = true; $("#wheel-error").hidden = true;
    sfx.click(); vibrate(30);

    const OMEGA = 14; // rad/s vitesse de croisière
    let v = 0, last = performance.now(), result = null, failure = null;
    draw(state.player).then((r) => (result = r)).catch((e) => (failure = e));

    // Phase 1 : accélération + rotation tant que le serveur n'a pas répondu
    await new Promise((resolve) => {
      const loop = (t) => {
        const dt = Math.min(0.05, (t - last) / 1000); last = t;
        v = Math.min(OMEGA, v + OMEGA * dt * 2.2);
        state.rot += v * dt; tickCheck(); bulbPhase = Math.floor(t / 90) % 2; drawWheel();
        if ((result || failure) && v >= OMEGA) return resolve();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });

    if (failure) {
      // Décélération douce puis message d'erreur
      await decelerateTo(state.rot + 2 * TAU, OMEGA);
      state.spinning = false; $("#spin-btn").disabled = false;
      const err = $("#wheel-error"); err.textContent = errorText(failure); err.hidden = false;
      return;
    }

    // Phase 2 : décélération pour s'arrêter pile sur le lot tiré
    const n = state.lots.length, seg = TAU / n;
    let i = state.lots.findIndex((l) => l.id === result.lot_id);
    if (i < 0) i = 0;
    const jitter = (Math.random() - 0.5) * seg * 0.6;
    const wantNorm = (((-(i + 0.5) * seg - jitter) % TAU) + TAU) % TAU; // angle cible modulo un tour
    const curNorm = ((state.rot % TAU) + TAU) % TAU;
    let delta = wantNorm - curNorm; if (delta < 0) delta += TAU;
    delta += 4 * TAU;
    await decelerateTo(state.rot + delta, OMEGA);

    state.spinning = false; state.done = true;
    vibrate([60, 40, 120]);
    save(result);
    setTimeout(() => showWin(result, result.deja_joue), 450);
  }

  function decelerateTo(target, omega) {
    const start = state.rot, dist = target - start;
    const D = (3 * dist) / omega; // ease-out cubique dont la vitesse initiale = omega
    const t0 = performance.now();
    return new Promise((resolve) => {
      const loop = (t) => {
        const p = Math.min(1, (t - t0) / 1000 / D);
        state.rot = start + dist * (1 - Math.pow(1 - p, 3));
        tickCheck(); bulbPhase = Math.floor(t / (90 + p * 300)) % 2; drawWheel();
        p < 1 ? requestAnimationFrame(loop) : resolve();
      };
      requestAnimationFrame(loop);
    });
  }

  $("#spin").addEventListener("click", spin);
  $("#spin-btn").addEventListener("click", spin);

  /* ---------------- Écran gagnant ---------------- */
  let clockTimer = null;
  function showWin(r, already) {
    $("#win-hello").textContent = `Bravo ${r.prenom || ""} !`.replace(" !", " !");
    $("#prize-big").textContent = r.titre;
    $("#prize-sub").textContent = r.sous_titre;
    $("#prize-desc").textContent = r.description;
    $("#code").textContent = r.code;
    $("#qr").src = CFG.qrCaisse;
    $("#validite").textContent = CFG.validite;
    $("#already").hidden = !already;
    const d = new Date(r.created_at);
    $("#live-date").textContent = d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" });
    clearInterval(clockTimer);
    const tick = () => ($("#live-clock").textContent = new Date().toLocaleTimeString("fr-FR"));
    tick(); clockTimer = setInterval(tick, 1000);
    go("s-win");
    sfx.win(); confetti();
  }

  /* ---------------- Sauvegarde locale (réafficher le ticket) ---------------- */
  const today = () => new Date().toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
  function save(result) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ jour: today(), carte: normCard(state.player.carte), result })); } catch (_) {}
  }
  function loadSaved() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      return s && s.jour === today() ? s : null;
    } catch (_) { return null; }
  }

  /* ---------------- Neige ---------------- */
  (() => {
    const c = $("#snow"), x = c.getContext("2d");
    let flakes = [], w, h;
    const resize = () => {
      w = c.width = innerWidth * devicePixelRatio; h = c.height = innerHeight * devicePixelRatio;
      flakes = Array.from({ length: Math.min(120, Math.round(innerWidth / 5)) }, () => ({
        x: Math.random() * w, y: Math.random() * h, r: (Math.random() * 2.6 + 0.8) * devicePixelRatio,
        s: (Math.random() * 0.6 + 0.3) * devicePixelRatio, d: Math.random() * TAU,
      }));
    };
    resize(); addEventListener("resize", resize);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    (function loop() {
      x.clearRect(0, 0, w, h); x.fillStyle = "rgba(253,240,226,.85)";
      for (const f of flakes) {
        f.d += 0.01; f.y += f.s; f.x += Math.sin(f.d) * 0.4;
        if (f.y > h + 5) { f.y = -5; f.x = Math.random() * w; }
        x.beginPath(); x.arc(f.x, f.y, f.r, 0, TAU); x.fill();
      }
      requestAnimationFrame(loop);
    })();
  })();

  /* ---------------- Confettis ---------------- */
  function confetti() {
    const c = $("#confetti"), x = c.getContext("2d");
    const w = (c.width = innerWidth * devicePixelRatio), h = (c.height = innerHeight * devicePixelRatio);
    const cols = ["#ffcc4d", "#e2132b", "#c99a4a", "#fdf0e2", "#1f6b3a", "#f08a1c"];
    const parts = Array.from({ length: 180 }, (_, i) => ({
      x: w / 2, y: h * 0.42,
      vx: (Math.random() - 0.5) * 22 * devicePixelRatio, vy: (-Math.random() * 20 - 6) * devicePixelRatio,
      s: (Math.random() * 8 + 5) * devicePixelRatio, a: Math.random() * TAU, va: (Math.random() - 0.5) * 0.4,
      c: cols[i % cols.length], star: i % 7 === 0,
    }));
    const t0 = performance.now();
    (function loop(t) {
      x.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.vy += 0.45 * devicePixelRatio; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.a += p.va;
        x.save(); x.translate(p.x, p.y); x.rotate(p.a); x.fillStyle = p.c;
        if (p.star) { x.font = `${p.s * 2.4}px serif`; x.fillText("❄", -p.s, p.s); }
        else x.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        x.restore();
      }
      if (t - t0 < 4500) requestAnimationFrame(loop); else x.clearRect(0, 0, w, h);
    })(t0);
  }

  function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (_) {} }

  /* ---------------- Démarrage ---------------- */
  if (DEMO) { $("#demo").hidden = false; document.body.classList.add("is-demo"); }
  loadLots().then(() => document.fonts.ready.then(drawWheel));
})();
