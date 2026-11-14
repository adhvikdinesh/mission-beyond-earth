/* Mission: Beyond Earth — Operations: one day in orbit.
 * A sun-synchronous polar orbit (crosses the equator at 10:30 local time going south)
 * flown for 24 hours over real NASA FIRMS fire detections. Power, battery, storage and
 * downlink are simulated from the player's design.
 */
(function () {
  "use strict";
  const O = {};
  const R = 6371, MU = 398600.4418, WE = 7.2921159e-5, D2R = Math.PI / 180;
  const MAP = { lonMin: -30, lonMax: 40, latMin: 24, latMax: 81 };
  const STATIONS = [
    { name: "Svalbard", lat: 78.23, lon: 15.39 },
    { name: "Kiruna", lat: 67.86, lon: 20.96 },
    { name: "Maspalomas", lat: 27.76, lon: -15.63 },
  ];
  const CONTACT_KM = 2300;
  const STORAGE = 4000;            // MB of onboard memory          // ground-station range at ~500 km altitude, 5° above the horizon
  const SUN_RA = 229.5 * D2R, SUN_DEC = -18.3 * D2R;   // mid-November
  const GMST0 = 53.2 * D2R;                            // Earth's rotation angle at 00:00 UTC
  const SUN = [Math.cos(SUN_DEC) * Math.cos(SUN_RA), Math.cos(SUN_DEC) * Math.sin(SUN_RA), Math.sin(SUN_DEC)];

  function gcKm(lat1, lon1, lat2, lon2) {
    const a = Math.sin((lat2 - lat1) * D2R / 2) ** 2 + Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin((lon2 - lon1) * D2R / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  function wrapLon(l) { return ((l + 540) % 360) - 180; }

  /* Fire data. Real detections come from NASA FIRMS (data/fires.json, built by tools/firms_to_json.py).
   * If that file is missing the game uses clearly labelled PRACTICE fires so it still runs. */
  let fireData = null;
  O.loadFires = function () {
    if (fireData) return Promise.resolve(fireData);
    return fetch("data/fires.json").then((r) => { if (!r.ok) throw 0; return r.json(); })
      .then((j) => (fireData = { fires: j.fires, label: j.source, demo: false }))
      .catch(() => (fireData = { fires: practiceFires(), label: "PRACTICE FIRES: made-up positions, not real data. Real NASA FIRMS data not loaded.", demo: true }));
  };
  function practiceFires() {
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const spots = [[40.2, -7.6], [42.4, -8.1], [37.4, -5.9], [39.4, -0.9], [41.6, 1.6], [38.2, 23.6], [40.9, 15.2], [43.6, 4.9], [36.8, 10.2], [35.2, -4.8]];
    const out = [];
    for (const [la, lo] of spots) { const n = 2 + Math.floor(rnd() * 4); for (let i = 0; i < n; i++) out.push({ lat: la + (rnd() - 0.5) * 1.2, lon: lo + (rnd() - 0.5) * 1.6, frp: 5 + rnd() * 60, day: rnd() > 0.35 }); }
    return out;
  }

  let st = null, ctx, canvas, dayImg, nightImg, raf = 0, onDone = null, nightCanvas, nightLayer;

  O.start = function (opts) {
    const e = opts.design, alt = opts.altKm;
    const a = R + alt, n = Math.sqrt(MU / (a * a * a));
    st = {
      e, alt, a, n, inc: 97.4 * D2R, raan: SUN_RA + 157.5 * D2R, u0: 1.2,
      t: 0, end: 24 * 3600, speed: 1800, paused: false,
      batt: e.bat.wh * 0.9, battMin: e.bat.wh, safe: false, safeMin: 0,
      storageMB: 0, queue: [], seg: null, sent: 0, lostFull: 0, lostMB: 0, safeCount: 0,
      fires: (opts.fires || []).map((f) => ({ lat: f.lat, lon: f.lon, frp: f.frp, day: f.day, seen: false, sent: false, missedNight: false })),
      track: [], log: [], contact: null, sunlit: true, camOn: false, nightMisses: 0, smokeMisses: 0,
    };
    onDone = opts.onDone;
    canvas = document.getElementById("opsMap"); ctx = canvas.getContext("2d");
    dayImg = new Image(); dayImg.src = "assets/textures/earth_day_4k.jpg";
    nightImg = new Image(); nightImg.src = "assets/textures/earth_night.png";
    document.getElementById("ops").hidden = false;
    const od = document.getElementById("opsData"); od.textContent = opts.label || ""; od.className = "opsData" + (opts.demo ? " demo" : "");
    logEv("Satellite released. Ground control has contact. Starting day 1.");
    resize(); window.addEventListener("resize", resize);
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (!st.paused && st.t < st.end) { const q = satState(st.t), onMap = q.lat > MAP.latMin - 5 && q.lat < MAP.latMax && q.lon > MAP.lonMin - 10 && q.lon < MAP.lonMax + 10;
        const target = st.t + dt * st.speed * (onMap ? 1 : 5); while (st.t < target && st.t < st.end) step(20); }
      draw(); panel();
      if (st.t >= st.end) { finish(); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  };

  O.setSpeed = (v) => { if (st) st.speed = v; };
  O.togglePause = () => { if (st) st.paused = !st.paused; return st && st.paused; };
  O.skip = () => { if (st) { while (st.t < st.end) step(20); } };

  function resize() {
    const box = canvas.parentElement.getBoundingClientRect();
    const ratio = (MAP.lonMax - MAP.lonMin) / (MAP.latMax - MAP.latMin);
    let w = box.width, h = w / ratio; if (h > box.height) { h = box.height; w = h * ratio; }
    const pr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * pr); canvas.height = Math.round(h * pr);
    canvas.style.width = w + "px"; canvas.style.height = h + "px";
    nightCanvas = null;
  }

  function satState(t) {
    const u = st.u0 + st.n * t, ci = Math.cos(st.inc), si = Math.sin(st.inc), cO = Math.cos(st.raan), sO = Math.sin(st.raan);
    const x = cO * Math.cos(u) - sO * Math.sin(u) * ci, y = sO * Math.cos(u) + cO * Math.sin(u) * ci, z = Math.sin(u) * si;
    const lat = Math.asin(z) / D2R, ra = Math.atan2(y, x);
    const lon = wrapLon((ra - GMST0 - WE * t) / D2R);
    // shadow: behind Earth, inside the cylinder of Earth's shadow
    const dot = x * SUN[0] + y * SUN[1] + z * SUN[2];
    const px = x - dot * SUN[0], py = y - dot * SUN[1], pz = z - dot * SUN[2];
    const shadow = dot < 0 && Math.sqrt(px * px + py * py + pz * pz) * st.a < R;
    return { lat, lon, sunlit: !shadow };
  }
  function sunElevationSin(lat, lon, t) {
    const th = lon * D2R + GMST0 + WE * t;
    const x = Math.cos(lat * D2R) * Math.cos(th), y = Math.cos(lat * D2R) * Math.sin(th), z = Math.sin(lat * D2R);
    return x * SUN[0] + y * SUN[1] + z * SUN[2];
  }

  function logEv(text) {
    const h = Math.floor(st.t / 3600), m = Math.floor(st.t / 60) % 60;
    st.log.unshift(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} ${text}`);
    if (st.log.length > 40) st.log.pop();
  }

  function step(dt) {
    const e = st.e, p = satState(st.t);
    if (p.sunlit !== st.sunlit) { logEv(p.sunlit ? "Back in sunlight: charging." : "Entering Earth's shadow: running on battery."); st.sunlit = p.sunlit; }
    // the camera works over Europe and North Africa
    const overTarget = p.lat > 15 && p.lat < 62 && p.lon > -25 && p.lon < 35;
    const wantCam = overTarget && (e.cam.night || p.sunlit);
    st.camOn = wantCam && !st.safe;
    if (wantCam && st.safe) st.safeMin += dt / 60;
    // ground contact and downlink (oldest pictures first)
    let contact = null;
    for (const g of STATIONS) if (gcKm(p.lat, p.lon, g.lat, g.lon) < CONTACT_KM) { contact = g; break; }
    if (contact && !st.contact) logEv(`Contact with ${contact.name}: sending pictures down.`);
    if (!contact && st.contact && st.queue.length) logEv(`Lost contact. ${Math.round(st.storageMB)} MB still waiting on board.`);
    st.contact = contact;
    let radioW = 0;
    if (contact && st.queue.length) {
      radioW = e.ant.power;
      let budgetMB = e.ant.mbps / 8 * dt;
      while (st.queue.length && budgetMB > 0) {
        const seg = st.queue[0];
        if (seg === st.seg && st.camOn) break;          // still recording this strip
        const take = Math.min(budgetMB, seg.mb);
        seg.mb -= take; budgetMB -= take; st.storageMB -= take;
        if (seg.mb <= 1e-6) { st.queue.shift(); if (seg === st.seg) st.seg = null; for (const f of seg.fires) { f.sent = true; st.sent++; } }
      }
    }
    // power: the thermal imager's detector cooler runs all the time unless in safe mode
    const gen = p.sunlit ? e.sol.watts : 0;
    const camW = st.safe ? 0 : e.cam.night ? e.cam.power : st.camOn ? e.cam.power : 0;
    const load = 30 + camW + radioW;
    st.batt = Math.max(0, Math.min(e.bat.wh, st.batt + (gen - load) * dt / 3600));
    st.battMin = Math.min(st.battMin, st.batt);
    if (!st.safe && st.batt < e.bat.wh * 0.15) { st.safe = true; st.safeCount++; logEv("Battery low! Safe mode: camera switched off."); }
    if (st.safe && st.batt > e.bat.wh * 0.5) { st.safe = false; logEv("Battery recovered: camera back on."); }
    // recording: the camera films a continuous strip over the target area
    if (st.camOn) {
      const mb = e.cam.imageMB / 60 * dt;
      if (st.storageMB + mb > STORAGE) { if (!st.fullWarned) { logEv("Storage full! New pictures are being lost."); st.fullWarned = true; } st.lostMB += mb; st.recording = false; }
      else {
        if (!st.seg) { st.seg = { mb: 0, fires: [] }; st.queue.push(st.seg); }
        st.seg.mb += mb; st.storageMB += mb; st.recording = true; st.fullWarned = false;
      }
    } else st.seg = null;
    // fire detection inside the camera swath
    const half = e.cam.swathKm / 2;
    for (const f of st.fires) {
      if (f.seen) continue;
      if (Math.abs(f.lat - p.lat) > 4) continue;
      if (gcKm(p.lat, p.lon, f.lat, f.lon) > half) continue;
      const daylight = sunElevationSin(f.lat, f.lon, st.t) > 0;
      if (!e.cam.night && !daylight) { f.missedNight = true; continue; }
      if (!st.camOn) { f.missedSafe = st.safe; continue; }
      if (f.tried) continue;
      f.tried = true;
      if (Math.random() > e.cam.detect) { st.smokeMisses++; continue; }
      if (!st.recording) { st.lostFull++; continue; }
      f.seen = true; f.pingAt = st.t; st.seg.fires.push(f);
    }
    const nowSeen = st.fires.filter((f) => f.seen).length;
    if (nowSeen > (st._lastSeen || 0)) { if (nowSeen - (st._lastSeen || 0) >= 1) logEv(`Spotted ${nowSeen - (st._lastSeen || 0)} fire${nowSeen - (st._lastSeen || 0) > 1 ? "s" : ""}.`); st._lastSeen = nowSeen; }
    st.track.push([p.lat, p.lon]); if (st.track.length > 900) st.track.shift();
    st.t += dt;
  }

  function xy(lat, lon) {
    return [(lon - MAP.lonMin) / (MAP.lonMax - MAP.lonMin) * canvas.width, (MAP.latMax - lat) / (MAP.latMax - MAP.latMin) * canvas.height];
  }

  function draw() {
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = "#06101c"; ctx.fillRect(0, 0, W, H);
    if (dayImg.complete && dayImg.naturalWidth) {
      const iw = dayImg.naturalWidth, ih = dayImg.naturalHeight;
      const sx = (MAP.lonMin + 180) / 360 * iw, sy = (90 - MAP.latMax) / 180 * ih;
      const sw = (MAP.lonMax - MAP.lonMin) / 360 * iw, sh = (MAP.latMax - MAP.latMin) / 180 * ih;
      ctx.drawImage(dayImg, sx, sy, sw, sh, 0, 0, W, H);
      // night side: a smooth shadow mask with city lights showing through
      const MW = 160, MH = Math.round(MW * H / W);
      if (!nightCanvas) { nightCanvas = document.createElement("canvas"); nightCanvas.width = MW; nightCanvas.height = MH; nightLayer = document.createElement("canvas"); nightLayer.width = W; nightLayer.height = H; }
      const mctx = nightCanvas.getContext("2d"), img = mctx.createImageData(MW, MH);
      for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
        const lon = MAP.lonMin + (x + 0.5) / MW * (MAP.lonMax - MAP.lonMin), lat = MAP.latMax - (y + 0.5) / MH * (MAP.latMax - MAP.latMin);
        const el = sunElevationSin(lat, lon, st.t), a = Math.max(0, Math.min(1, (0.06 - el) * 8));
        img.data[(y * MW + x) * 4 + 3] = Math.round(a * 255);
      }
      mctx.putImageData(img, 0, 0);
      const nl = nightLayer.getContext("2d");
      nl.globalCompositeOperation = "source-over"; nl.clearRect(0, 0, W, H);
      nl.fillStyle = "rgba(2,6,18,0.82)"; nl.fillRect(0, 0, W, H);
      if (nightImg.complete && nightImg.naturalWidth) {
        const nw = nightImg.naturalWidth, nh = nightImg.naturalHeight;
        nl.globalCompositeOperation = "lighter"; nl.globalAlpha = 0.9;
        nl.drawImage(nightImg, (MAP.lonMin + 180) / 360 * nw, (90 - MAP.latMax) / 180 * nh, (MAP.lonMax - MAP.lonMin) / 360 * nw, (MAP.latMax - MAP.latMin) / 180 * nh, 0, 0, W, H);
        nl.globalAlpha = 1;
      }
      nl.globalCompositeOperation = "destination-in"; nl.imageSmoothingEnabled = true; nl.drawImage(nightCanvas, 0, 0, W, H);
      nl.globalCompositeOperation = "source-over";
      ctx.drawImage(nightLayer, 0, 0);
    }
    // grid
    ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 1;
    for (let lo = -30; lo <= 40; lo += 10) { const [x] = xy(0, lo); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let la = 30; la <= 80; la += 10) { const [, y] = xy(la, 0); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    // ground stations
    for (const g of STATIONS) {
      const [x, y] = xy(g.lat, g.lon), on = st.contact === g;
      ctx.fillStyle = on ? "#00d4ff" : "rgba(0,212,255,0.6)";
      ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x - 7, y + 6); ctx.lineTo(x + 7, y + 6); ctx.closePath(); ctx.fill();
      ctx.font = `${Math.round(H / 55)}px JetBrains Mono, monospace`; ctx.fillText(g.name, x + 10, y + 4);
    }
    // fires
    for (const f of st.fires) {
      const [x, y] = xy(f.lat, f.lon); if (x < 0 || y < 0 || x > W || y > H) continue;
      const r = Math.max(2.5, H / 260);
      if (f.pingAt != null && st.t - f.pingAt < 900) { const k = (st.t - f.pingAt) / 900; ctx.strokeStyle = `rgba(255,209,102,${1 - k})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + k * H / 25, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = f.sent ? "#00ff88" : f.seen ? "#ffd166" : "#ff4d4d";
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    // ground track
    ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = Math.max(1, H / 500); ctx.beginPath();
    let prev = null;
    for (const [la, lo] of st.track) { const [x, y] = xy(la, lo); if (prev && Math.abs(lo - prev) > 90) ctx.moveTo(x, y); else if (prev === null) ctx.moveTo(x, y); else ctx.lineTo(x, y); prev = lo; }
    ctx.stroke();
    // satellite and camera swath
    const p = satState(st.t), [sx, sy] = xy(p.lat, p.lon);
    const swPx = st.e.cam.swathKm / 2 / 111 / (MAP.latMax - MAP.latMin) * H;
    ctx.strokeStyle = st.camOn ? "rgba(255,179,0,0.9)" : "rgba(255,255,255,0.3)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(sx, sy, swPx / Math.cos(p.lat * D2R) * 0.62, swPx, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#ffffff"; ctx.shadowColor = "#00d4ff"; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(sx, sy, Math.max(4, H / 120), 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    if (sx < 0 || sx > W || sy < 0 || sy > H) {
      ctx.font = `${Math.round(H / 40)}px JetBrains Mono, monospace`; ctx.textAlign = "center"; ctx.fillStyle = "rgba(230,241,251,0.85)";
      ctx.fillText("Satellite is over the other side of Earth: fast-forwarding", W / 2, H * 0.12); ctx.textAlign = "left";
    }
    if (st.contact) { const [gx, gy] = xy(st.contact.lat, st.contact.lon); ctx.strokeStyle = "rgba(0,212,255,0.7)"; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(gx, gy); ctx.stroke(); ctx.setLineDash([]); }
  }

  function panel() {
    const $ = (id) => document.getElementById(id), e = st.e;
    const h = Math.floor(st.t / 3600), m = Math.floor(st.t / 60) % 60;
    $("oClock").textContent = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} UTC`;
    $("oDay").style.width = (st.t / st.end * 100) + "%";
    $("oSun").textContent = st.sunlit ? "Sunlight" : "Earth's shadow"; $("oSun").className = st.sunlit ? "good" : "dim";
    const bp = st.batt / e.bat.wh; $("oBatt").textContent = Math.round(bp * 100) + "%"; $("oBattBar").style.width = bp * 100 + "%"; $("oBattBar").className = bp < 0.2 ? "hot" : bp < 0.45 ? "amber" : "";
    $("oCam").textContent = st.safe ? "OFF · safe mode" : st.camOn ? (st.recording ? "ON · recording" : "ON · storage full") : "standby"; $("oCam").className = st.safe ? "bad" : st.camOn ? "good" : "dim";
    $("oStore").textContent = `${Math.round(st.storageMB)} / ${STORAGE} MB waiting`;
    $("oLink").textContent = st.contact ? `${st.contact.name} · ${e.ant.mbps} Mbit/s` : "no station in view"; $("oLink").className = st.contact ? "good" : "dim";
    const seen = st.fires.filter((f) => f.seen).length, sent = st.sent, total = st.fires.length;
    $("oSeen").textContent = `${seen} / ${total}`; $("oSent").textContent = String(sent);
    $("oLog").innerHTML = st.log.slice(0, 7).map((l) => `<li>${l}</li>`).join("");
  }

  function finish() {
    cancelAnimationFrame(raf); window.removeEventListener("resize", resize);
    const total = st.fires.length, seen = st.fires.filter((f) => f.seen).length;
    const res = {
      total, seen, sent: st.sent, waiting: st.fires.filter((f) => f.seen && !f.sent).length, leftMB: Math.round(st.storageMB), lostMB: Math.round(st.lostMB), safeCount: st.safeCount, safeMissed: st.fires.filter((f) => !f.seen && f.missedSafe).length, nightMissed: st.fires.filter((f) => !f.seen && f.missedNight).length,
      smokeMisses: st.smokeMisses, lostFull: st.lostFull, safeMin: Math.round(st.safeMin), battMinPct: Math.round(st.battMin / st.e.bat.wh * 100),
    };
    setTimeout(() => { document.getElementById("ops").hidden = true; onDone && onDone(res); }, 900);
  }

  window.Ops = O;
})();
