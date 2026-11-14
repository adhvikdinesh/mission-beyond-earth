/* Mission: Beyond Earth — launch game logic: phases, controls, Flight Director, debrief. */
(function () {
  "use strict";
  const P = window.LaunchPhysics, L = window.LINES, $ = (s) => document.querySelector(s);
  const MISSION = { name: "EarthWatch-1", payload: 150, target: 500000 };
  let mode = "cadet";
  const ORBIT_MIN = 160000;

  Scene.init($("#stage"));
  Scene.setTargetOrbit(MISSION.target);

  /* ---------- audio ---------- */
  const audio = {
    ctx: null, rumble: null, gain: null,
    init() {
      if (this.ctx) return;
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        const len = this.ctx.sampleRate * 2, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
        const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 160;
        this.gain = this.ctx.createGain(); this.gain.gain.value = 0;
        src.connect(f).connect(this.gain).connect(this.ctx.destination); src.start();
      } catch (e) { this.ctx = null; }
    },
    engine(level) { if (this.gain) this.gain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.15); },
    beep(f, d) {
      if (!this.ctx) return; const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = "square"; o.frequency.value = f || 880; g.gain.value = 0.04;
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + (d || 0.15));
      o.connect(g).connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime + (d || 0.15) + 0.05);
    },
    bang() {
      if (!this.ctx) return; const len = this.ctx.sampleRate, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      const s = this.ctx.createBufferSource(); s.buffer = buf; const g = this.ctx.createGain(); g.gain.value = 0.5;
      s.connect(g).connect(this.ctx.destination); s.start();
    },
  };

  /* ---------- Flight Director ---------- */
  let voiceOn = true, voice = null;
  function pickVoice() { try { const v = speechSynthesis.getVoices(); voice = v.find((x) => /en-GB/i.test(x.lang)) || v.find((x) => /^en/i.test(x.lang)) || null; } catch (e) {} }
  try { speechSynthesis.onvoiceschanged = pickVoice; pickVoice(); } catch (e) {}
  function say(text) {
    $("#dirLine").textContent = text;
    const d = $("#director"); d.classList.remove("flash"); void d.offsetWidth; d.classList.add("flash");
    if (!voiceOn) return;
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); if (voice) u.voice = voice; u.rate = 1.05; speechSynthesis.speak(u); } catch (e) {}
  }

  /* ---------- state ---------- */
  let s, game;
  function reset() {
    s = P.create({ payload: MISSION.payload });
    game = {
      phase: "pad", said: {}, warp: 1, armed: false, events: [], stagedAt: null, emptyAt: null,
      fairing: null, seco1: null, orbitAt: null, releasedAt: null, failed: null, maxqThrottled: false, lowestThrottleAtQ: 1, peakQ: 0,
    };
    Scene.resetTrail(); Cockpit.resetSwitches(); game.userView = false; game.lastThr = null; setView("launchcam");
    $("#throttle").value = 0; $("#pitch").value = 0;
    setWarp(1);
    $("#debrief").hidden = true; $("#countdown").hidden = true; pit.disabled = false;
    pollReset();
    $("#poll").hidden = false;
    say(L.prelaunch);
    updateButtons(); updatePhases();
  }

  /* ---------- Go/No-Go poll ---------- */
  const poll = {};
  function pollReset() {
    const wind = 8 + Math.round(Math.random() * 14);
    $("#wxText").textContent = `Ground wind ${wind} km/h, no lightning within 20 km`;
    document.querySelectorAll("[data-poll]").forEach((b) => { b.textContent = "Poll"; b.className = ""; poll[b.dataset.poll] = false; });
    $("#btnLaunch").disabled = true;
    $("#cargoName").textContent = MISSION.name; $("#cargoMass").textContent = MISSION.payload + " kg"; $("#cargoOrbit").textContent = MISSION.target / 1000 + " km";
  }
  document.querySelectorAll("[data-poll]").forEach((b) => b.addEventListener("click", () => {
    audio.init(); audio.beep(660);
    poll[b.dataset.poll] = true; b.textContent = "GO"; b.className = "go";
    if (poll.wx && poll.range && poll.veh) { $("#btnLaunch").disabled = false; say(L.pollDone); }
  }));
  document.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
    mode = b.dataset.mode;
    document.querySelectorAll("[data-mode]").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", x === b); });
  }));
  $("#btnLaunch").addEventListener("click", () => {
    audio.init(); $("#poll").hidden = true; game.phase = "countdown"; game.count = 10; game.countAt = performance.now();
    pit.disabled = mode === "cadet";
    say(L.countdown);
    updatePhases();
  });
  function countdown(now) {
    const left = 10 - Math.floor((now - game.countAt) / 1000);
    const el = $("#countdown");
    if (left !== game.count) {
      game.count = left;
      if (left > 0) { el.hidden = false; el.innerHTML = left + (left <= 3 ? "<small>IGNITION SEQUENCE</small>" : ""); audio.beep(left <= 3 ? 990 : 660, 0.12); }
      if (left === 3 && mode === "cadet") thr.value = 100;
      if (left <= 0) {
        el.innerHTML = "<small>LIFTOFF</small>"; setTimeout(() => { el.hidden = true; }, 1200);
        game.phase = "ignition"; game.ignitionAt = now;
        if (+thr.value === 0) say(L.liftoffWeak);
      }
    }
  }

  /* ---------- controls ---------- */
  const thr = $("#throttle"), pit = $("#pitch");
  function setWarp(w) {
    game && (game.warp = w);
    document.querySelectorAll(".warp button").forEach((b) => b.classList.toggle("on", +b.dataset.w === w));
  }
  document.querySelectorAll(".warp button").forEach((b) => b.addEventListener("click", () => setWarp(+b.dataset.w)));
  $("#btnView").addEventListener("click", toggleView);
  const VIEWS = ["cockpit", "launchcam", "tracking"], VIEW_NAMES = { cockpit: "Cockpit", launchcam: "Launch camera", tracking: "Tracking" };
  function setView(v) {
    Scene.setView(v);
    document.body.classList.remove("view-cockpit", "view-launchcam", "view-tracking", "tracking");
    document.body.classList.add("view-" + v); if (v === "tracking") document.body.classList.add("tracking");
    const next = VIEWS[(VIEWS.indexOf(v) + 1) % VIEWS.length];
    $("#btnView").firstChild.textContent = VIEW_NAMES[next] + " ";
  }
  function toggleView() { game.userView = true; setView(VIEWS[(VIEWS.indexOf(Scene.getView()) + 1) % VIEWS.length]); }
  // click the switches in the 3D cockpit
  $("#stage").addEventListener("click", (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const hit = Scene.pick(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    if (hit === "stage") doStage(); else if (hit === "fairing") doFairing(); else if (hit === "arm") doArm(); else if (hit === "release") doRelease();
    else if (hit === "throttle") Cockpit.reach("throttle", 1);
  });
  function doArm() { if (game.phase !== "orbit" || game.armed || s.fairing) return; game.armed = true; audio.beep(520); Cockpit.reach("arm", 0.9); Cockpit.flip("arm"); updateButtons(); }
  $("#btnVoice").addEventListener("click", (e) => {
    voiceOn = !voiceOn; e.currentTarget.setAttribute("aria-pressed", voiceOn); e.currentTarget.textContent = voiceOn ? "Voice on" : "Voice off";
    if (!voiceOn) try { speechSynthesis.cancel(); } catch (x) {}
  });
  $("#btnStage").addEventListener("click", doStage);
  $("#btnFairing").addEventListener("click", doFairing);
  $("#btnArm").addEventListener("click", doArm);
  $("#btnRelease").addEventListener("click", doRelease);
  $("#btnRetry").addEventListener("click", reset);
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" && (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown")) return;
    const k = e.key.toLowerCase();
    if (k === "w" || k === "arrowup") { thr.value = Math.min(100, +thr.value + 5); }
    else if (k === "s" || k === "arrowdown") { thr.value = Math.max(0, +thr.value - 5); }
    else if (k === "d" || k === "arrowright") { pit.value = Math.min(95, +pit.value + 2); }
    else if (k === "a" || k === "arrowleft") { pit.value = Math.max(0, +pit.value - 2); }
    else if (k === "x") { thr.value = 0; }
    else if (k === "z") { thr.value = 100; }
    else if (k === " ") { e.preventDefault(); doStage(); }
    else if (k === "f") doFairing();
    else if (k === "r") { if (game.phase === "orbit" && !game.armed) doArm(); else doRelease(); }
    else if (k === "v") toggleView();
    else return;
  });

  function doStage() {
    if (s.stage !== 1 || game.phase === "pad" || game.phase === "ignition" && !s.lifted) return;
    P.stageSep(s); game.stagedAt = s.t; audio.bang(); audio.beep(440, 0.3); Cockpit.reach("stage", 0.9); Cockpit.flip("stage");
    log(`Stage separation at T+${fmtT(s.t)}`);
    say(L.staged); updateButtons();
  }
  function doFairing() {
    if (!s.fairing || !s.lifted) return;
    const r = P.dropFairing(s); game.fairing = { t: s.t, alt: P.altitude(s), result: r }; Cockpit.reach("fairing", 0.9); Cockpit.flip("fairing");
    audio.beep(990, 0.2);
    if (r !== "ok") { fail("fairing"); return; }
    say(L.fairingDone); updateButtons();
  }
  function doRelease() {
    if (game.phase !== "orbit" || !game.armed || s.fairing) return;
    s.released = true; game.releasedAt = s.t; game.phase = "released"; audio.beep(1200, 0.4); Cockpit.reach("release", 1.2); Cockpit.flip("release");
    say(L.release); updatePhases(); updateButtons();
    setTimeout(debrief, 2600);
  }

  function updateButtons() {
    const b = (id, en, ready) => { const el = $(id); el.disabled = !en; el.classList.toggle("ready", !!ready); };
    const flying = s.lifted && !game.failed;
    b("#btnStage", flying && s.stage === 1, flying && s.stage === 1 && s.prop1 <= 0);
    const fairOK = flying && s.fairing;
    b("#btnFairing", fairOK, fairOK && P.altitude(s) > 110000 && s.q < P.ROCKET.fairingSafeQ);
    b("#btnArm", game.phase === "orbit" && !game.armed && !s.fairing, game.phase === "orbit" && !game.armed && !s.fairing);
    b("#btnRelease", game.phase === "orbit" && game.armed, game.phase === "orbit" && game.armed);
    Cockpit.setSwitch("stage", flying && s.stage === 1 && s.prop1 <= 0 ? "ready" : "off");
    Cockpit.setSwitch("fairing", fairOK && P.altitude(s) > 110000 && s.q < P.ROCKET.fairingSafeQ ? "ready" : "off");
    Cockpit.setSwitch("arm", game.phase === "orbit" && !game.armed && !s.fairing ? "ready" : "off");
    Cockpit.setSwitch("release", game.phase === "orbit" && game.armed ? "ready" : "off");
  }

  /* ---------- phases ---------- */
  const ORDER = ["pad", "liftoff", "maxq", "turn", "stage", "fairing", "insert", "circ", "release"];
  function currentChip() {
    if (game.phase === "pad" || game.phase === "countdown" || game.phase === "ignition" && !s.lifted) return "pad";
    if (game.phase === "released") return "done";
    if (game.phase === "orbit") return "release";
    if (game.phase === "coast" || game.phase === "circ") return "circ";
    const alt = P.altitude(s);
    if (s.stage === 1) { if (alt < 1500) return "liftoff"; if (!game.said.maxqPassed) return "maxq"; if (s.prop1 > 0) return "turn"; return "stage"; }
    if (s.fairing) return "fairing";
    return "insert";
  }
  function updatePhases() {
    const c = currentChip(), idx = c === "done" ? ORDER.length : ORDER.indexOf(c);
    document.querySelectorAll("#phases li").forEach((li) => {
      const i = ORDER.indexOf(li.dataset.p);
      li.classList.toggle("done", i < idx); li.classList.toggle("now", i === idx);
    });
  }
  function once(key, text, slow) { if (game.said[key]) return false; game.said[key] = true; say(text); if (slow && game.warp > 4) setWarp(1); audio.beep(760); return true; }
  function log(t) { game.events.push(t); }

  function fail(reason) {
    if (game.failed) return;
    game.failed = reason; game.phase = "failed"; s.throttle = 0; thr.value = 0;
    audio.bang(); say(L.fail[reason] || "Mission lost.");
    updateButtons();
    setTimeout(debrief, 3200);
  }

  function rules() {
    const alt = P.altitude(s), o = P.orbit(s);
    if (s.status === "broken") return fail(s.reason);
    if (s.status === "crashed") return fail("ground");
    if (game.phase === "ignition") {
      if (!s.lifted && s.throttle > 0 && !game.said.weak && performance.now() - game.ignitionAt > 2500 && s.throttle < 0.66) once("weak", L.liftoffWeak);
      if (s.lifted) { game.phase = "ascent"; log("Liftoff"); once("liftoff", L.liftoff); }
      return;
    }
    if (game.phase === "ascent") {
      if (s.stage === 1 && s.q > 14000 && !game.said.maxqWarn) once("maxqWarn", L.maxqWarn, true);
      if (s.q > game.peakQ) game.peakQ = s.q;
      if (game.said.maxqWarn && s.q > 14000) game.lowestThrottleAtQ = Math.min(game.lowestThrottleAtQ, s.throttle);
      if (game.said.maxqWarn && !game.said.maxqPassed && game.peakQ > 15000 && s.q < game.peakQ * 0.6) once("maxqPassed", L.maxqPassed);
      if (alt > 3000 && game.said.maxqPassed && !game.said.turn) once("turn", mode === "cadet" ? L.turnAuto : L.turn);
      if (alt > 1500 && !game.said.turnEarly && !game.said.maxqWarn) { game.said.turnEarly = true; $("#dirLine").textContent = mode === "cadet" ? L.turnAuto : L.turn; }
      if (s.stage === 1 && s.prop1 <= 0) { if (game.emptyAt == null) game.emptyAt = s.t; once("stageReady", L.stageReady, true); }
      if (s.fairing && alt > 110000 && s.q < P.ROCKET.fairingSafeQ) once("fairingReady", L.fairingReady, true);
      if (s.stage === 2 && s.throttle > 0 && o.apo >= MISSION.target - 5000 && o.peri < ORBIT_MIN) once("apoReady", L.apoReady, true);
      if (s.stage === 2 && s.throttle === 0 && game.said.apoReady && alt > 100000) {
        game.phase = "coast"; game.seco1 = { t: s.t, apo: o.apo, peri: o.peri }; log(`Engine cut-off, apoapsis ${Math.round(o.apo / 1000)} km`);
        say(L.coast);
      }
      if (s.stage === 2 && s.prop2 <= 0) noFuelCheck(o, alt);
      if (o.peri >= ORBIT_MIN && (s.throttle === 0 || s.prop2 <= 0) && !game.said.orbit) toOrbit(o);
      const vUp = (s.x * s.vx + s.y * s.vy) / Math.hypot(s.x, s.y);
      if (s.stage === 2 && alt < 70000 && vUp < 0 && o.peri < ORBIT_MIN) fail("suborbital");
      return;
    }
    if (game.phase === "coast" || game.phase === "circ") {
      const vr = (s.x * s.vx + s.y * s.vy) / Math.hypot(s.x, s.y);
      if (game.phase === "coast" && vr < 120 && alt > 100000) { game.phase = "circ"; once("circReady", L.circReady, true); setWarp(1); }
      if (o.peri >= ORBIT_MIN && s.throttle === 0 && (o.peri > MISSION.target - 80000 || s.prop2 <= 0 || vr < -150)) toOrbit(o);
      if (o.peri >= MISSION.target - 40000 && s.throttle > 0) { /* nearly round: let the player cut */ }
      if (s.prop2 <= 0 && o.peri < ORBIT_MIN && alt < 100000) fail("suborbital");
      if (alt < 80000 && o.peri < ORBIT_MIN) fail("reentry");
      return;
    }
  }
  function noFuelCheck(o, alt) { if (o.peri >= ORBIT_MIN && !game.said.orbit) toOrbit(o); }
  function toOrbit(o) {
    game.phase = "orbit"; game.orbitAt = s.t; game.said.orbit = true; s.throttle = 0; thr.value = 0;
    log(`Orbit: ${Math.round(o.peri / 1000)} × ${Math.round(o.apo / 1000)} km`);
    say(L.orbit); audio.beep(1040, 0.35); setWarp(1); updateButtons(); updatePhases();
  }

  /* ---------- debrief ---------- */
  const star = (on) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" fill="${on ? "#ffb300" : "none"}" stroke="${on ? "#ffb300" : "#4a5870"}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  function debrief() {
    const o = P.orbit(s), good = [], bad = [];
    const success = game.phase === "released";
    let stars = 0;
    const tgt = MISSION.target / 1000, apo = o.escape ? Infinity : o.apo / 1000, peri = o.peri / 1000;
    const fuel2 = Math.round(s.prop2), qPeak = Math.min(s.maxQSeen, P.ROCKET.maxQ) / 1000, lim = P.ROCKET.maxQ / 1000;
    if (success) {
      stars = 1;
      const roundness = Math.abs(apo - peri), err = Math.max(Math.abs(apo - tgt), Math.abs(peri - tgt));
      if (peri > tgt - 100) stars = 2;
      if (err < 30 && fuel2 >= 20) stars = 3;
      good.push(`You reached orbit (${Math.round(peri)} × ${Math.round(apo)} km), so the satellite will stay up without falling back.`);
      if (roundness < 60) good.push("Your orbit is almost round, because you burned sideways at the highest point.");
      else bad.push(`Your orbit is stretched (${Math.round(roundness)} km between high and low point). Burning longer at the top would make it rounder.`);
      if (err >= 30) bad.push(`The target was ${tgt} km. Cut the engine when the high point reaches it, then circularize there.`);
    } else {
      const why = { maxq: "full throttle through Max Q put too much air pressure on the rocket", ground: "the rocket turned sideways too early and lost height", reentry: "the orbit's low point was inside the atmosphere, so the satellite fell back", suborbital: "the rocket ran out of fuel before reaching orbital speed (about 7.6 km/s)", fairing: "the fairing came off while the air was still thick" };
      bad.push(`The mission failed because ${why[game.failed] || "something went wrong"}.`);
    }
    if (qPeak > 0) {
      if (game.failed !== "maxq" && qPeak < lim) good.push(`Peak air pressure was ${qPeak.toFixed(1)} kPa, under the ${lim} kPa limit${game.lowestThrottleAtQ < 0.9 ? ", because you throttled down at Max Q" : ""}.`);
    }
    if (game.stagedAt != null && game.emptyAt != null) {
      const late = game.stagedAt - game.emptyAt;
      if (late > 8) bad.push(`You staged ${Math.round(late)} s after stage 1 ran out. Gravity pulled you back the whole time.`);
      else good.push("You staged right when stage 1 ran out, so no time was wasted.");
    }
    if (game.fairing && game.fairing.result === "ok") good.push(`Fairing dropped at ${Math.round(game.fairing.alt / 1000)} km, above the thick air.`);
    if (success && fuel2 > 0) good.push(`${fuel2} kg of fuel left in stage 2: spare fuel for later orbit corrections.`);
    if (success && fuel2 <= 0) bad.push("Stage 2 ran completely dry. Following the green pitch marker saves fuel.");

    $("#dbEyebrow").textContent = success ? "Mission success" : "Mission lost";
    $("#dbTitle").textContent = success ? (stars === 3 ? "Perfect orbit" : "Satellite in orbit") : "Mission failed";
    $("#dbStars").innerHTML = star(stars > 0) + star(stars > 1) + star(stars > 2);
    $("#dbStars").setAttribute("aria-label", `${stars} of 3 stars`);
    $("#dbStats").innerHTML = [
      ["Orbit", success ? `${Math.round(peri)}×${Math.round(apo)} km` : "—"],
      ["Flight time", fmtT(s.t)],
      ["Peak Q", qPeak.toFixed(1) + " kPa"],
      ["Fuel left", Math.max(0, fuel2) + " kg"],
    ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("");
    $("#dbGood").innerHTML = good.map((x) => `<li>${x}</li>`).join("") || "<li>Try again: every flight teaches something.</li>";
    $("#dbBad").innerHTML = bad.map((x) => `<li>${x}</li>`).join("") || "<li>Nothing. That was a textbook flight.</li>";
    $("#debrief").hidden = false;
  }

  /* ---------- HUD ---------- */
  const fmtT = (t) => { const m = Math.floor(Math.abs(t) / 60), sec = Math.floor(Math.abs(t) % 60); return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`; };
  function hud() {
    const alt = P.altitude(s), o = P.orbit(s), v = P.speed(s);
    $("#gAlt").textContent = (Math.max(0, alt) / 1000).toFixed(1);
    $("#gSpd").textContent = (v / 1000).toFixed(2);
    $("#gSpdNeed").textContent = `orbit needs ${(P.circularSpeed(Math.max(alt, 150000)) / 1000).toFixed(2)}`;
    $("#gQ").textContent = (s.q / 1000).toFixed(1);
    const qf = s.q / P.ROCKET.maxQ;
    const qb = $("#gQbar"); qb.style.width = Math.min(100, qf * 100) + "%"; qb.className = qf > 0.85 ? "hot" : qf > 0.6 ? "amber" : "";
    $("#gQ").closest(".g").classList.toggle("alert", qf > 0.85);
    $("#gG").textContent = s.lifted ? s.g.toFixed(1) : "1.0";
    const f1 = s.stage === 1 ? s.prop1 / P.ROCKET.s1.prop * 100 : 0, f2 = s.prop2 / P.ROCKET.s2.prop * 100;
    $("#gF1").textContent = s.stage === 1 ? Math.round(f1) : "SEP"; $("#gF1bar").style.width = f1 + "%";
    $("#gF2").textContent = Math.round(f2); $("#gF2bar").style.width = f2 + "%";
    $("#gApo").textContent = o.escape ? "escape" : o.apo > 0 ? Math.round(o.apo / 1000) : "—";
    $("#gPeri").textContent = !o.escape && o.peri > -R_DISPLAY ? (o.peri > 0 ? Math.round(o.peri / 1000) : "below ground") : "—";
    $("#thrVal").textContent = Math.round(s.throttle * 100) + "%";
    $("#pitchVal").textContent = Math.round(s.pitch) + "°" + (mode === "cadet" ? " AUTO" : "");
    let gp = P.guidancePitch(alt);
    if (game.phase === "coast" || game.phase === "circ" || game.phase === "orbit") gp = 90;
    $("#pitchTarget").textContent = Math.round(gp) + "°";
    $("#pitchMark").style.left = `calc(${gp / 95 * 100}% )`;
    const clock = game.phase === "pad" ? "T−00:10" : game.phase === "countdown" ? "T−00:" + String(Math.max(0, game.count)).padStart(2, "0") : game.phase === "ignition" && !s.lifted ? "T−00:00" : "T+" + fmtT(s.t);
    $("#clock").textContent = clock;
    // time warp allowed only in safe moments
    const canFast = s.throttle === 0 && alt > 100000;
    document.querySelectorAll(".warp button").forEach((b) => { const w = +b.dataset.w; b.disabled = w > 4 && !canFast; });
    if (game.warp > 4 && !canFast) setWarp(4);
    setPrompt(nextAction(alt, o, gp));
    Cockpit.setData({
      alt: Math.max(0, alt) / 1000, speed: v / 1000, q: s.q / 1000, qLimit: P.ROCKET.maxQ / 1000,
      pitch: s.pitch, target: gp, clock: clock, phase: ({ pad: "Go/No-Go", countdown: "Countdown", ignition: "Ignition", ascent: "Ascent", coast: "Coast", circ: "Circularize", orbit: "In orbit", released: "Released", failed: "Mission lost" })[game.phase] || "",
      f1: s.stage === 1 ? s.prop1 / P.ROCKET.s1.prop : 0, f2: s.prop2 / P.ROCKET.s2.prop,
      orbit: (o.apo > 0 && !o.escape ? Math.round(o.apo / 1000) : "—") + " / " + (o.peri > 0 && !o.escape ? Math.round(o.peri / 1000) : "—") + " km",
      throttle: s.throttle,
    });
  }
  const R_DISPLAY = 6000000;

  /* The single most important thing to do right now. Returns [text, style]. */
  function nextAction(alt, o, gp) {
    const ph = game.phase, thrPct = +thr.value;
    if (ph === "pad") return ["Run the Go/No-Go poll, then LAUNCH", "calm"];
    if (ph === "countdown") return mode === "cadet" ? ["Stand by: the engines throttle up at T−3", "calm"] : ["Push the throttle to 100% at T−0: press Z", "calm"];
    if (ph === "ignition" && !s.lifted) return ["Throttle up to lift off: press Z (or W)", "urgent"];
    if (ph === "ascent") {
      if (s.stage === 1 && s.prop1 <= 0) return ["STAGE now: press Space", "urgent"];
      if (s.stage === 1 && game.said.maxqWarn && !game.said.maxqPassed) return thrPct > 75 ? ["MAX Q: throttle down to 70% (press S)", "urgent"] : ["Hold the throttle near 70% through Max Q", "calm"];
      if (s.stage === 1 && game.said.maxqPassed && thrPct < 95) return ["Max Q passed: full throttle again (press Z)", ""];
      if (s.fairing && alt > 110000 && s.q < P.ROCKET.fairingSafeQ) return ["Drop the FAIRING: press F", ""];
      if (mode === "commander" && Math.abs(s.pitch - gp) > 6) return [`Steer to the green target ${Math.round(gp)}° (A / D)`, ""];
      if (s.stage === 2 && game.said.apoReady && thrPct > 0) return ["CUT THE ENGINE: press X", "urgent"];
      return ["", ""];
    }
    if (ph === "coast") return ["Coasting up to the high point: speed up time with 10× or 50×", "calm"];
    if (ph === "circ") {
      if (o.peri >= MISSION.target - 60000 && thrPct > 0) return ["Orbit is round: CUT THE ENGINE (press X)", "urgent"];
      if (thrPct === 0) return ["BURN at the top: full throttle (press Z)", "urgent"];
      return ["Burning: watch ORBIT LOW climb toward 500 km", "calm"];
    }
    if (ph === "orbit") return game.armed ? ["RELEASE the satellite: press R", ""] : ["ARM the separation system: press R", ""];
    return ["", ""];
  }
  function setPrompt(a) {
    const el = $("#prompt");
    if (!a[0]) { el.hidden = true; return; }
    el.hidden = false; el.className = "prompt " + a[1]; $("#promptText").textContent = a[0];
  }

  /* ---------- loop ---------- */
  let last = performance.now(), frame = 0;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (game.phase === "countdown") countdown(now);
    if (mode === "cadet" && game.phase !== "pad" && game.phase !== "countdown") {
      const auto = (game.phase === "coast" || game.phase === "circ" || game.phase === "orbit" || game.phase === "released") ? 90 : P.guidancePitch(P.altitude(s));
      pit.value = Math.round(auto);
    }
    // the gloved hand follows the controls you touch
    if (+thr.value !== game.lastThr) { if (game.lastThr != null) Cockpit.reach("throttle", 1.2); game.lastThr = +thr.value; }
    // launch camera for the countdown and liftoff, then into the cockpit before leaving the thick air
    if (!game.userView) {
      const want = (game.phase === "countdown" || game.phase === "ignition" || (game.phase === "ascent" && P.altitude(s) < 2500)) ? "launchcam" : "cockpit";
      if (Scene.getView() !== want && Scene.getView() !== "tracking") setView(want);
    }
    const flying = game.phase !== "pad" && game.phase !== "countdown" && game.phase !== "failed" && game.phase !== "released";
    if (flying) {
      s.throttle = +thr.value / 100;
      if (s.stage === 1 && s.prop1 <= 0) s.throttle = Math.min(s.throttle, 1);
      s.pitchCmd = +pit.value;
      P.step(s, dt * game.warp);
      rules();
    } else if (game.phase === "released" || game.phase === "orbit") {
      P.step(s, dt * game.warp);
    }
    const eng = P.engine(s);
    const flame = game.phase === "failed" ? 0 : Math.min(1, eng.T / 224e3 * (s.stage === 1 ? 1 : 3));
    audio.engine(game.phase === "failed" ? 0 : Math.min(0.6, eng.T / 224e3 * 0.6 * (P.altitude(s) < 60000 ? 1 : 0.3)));
    Scene.update(s, { trail: s.lifted, flame: flame, shake: s.lifted && P.altitude(s) < 40000 ? flame * (1 + s.q / 10000) : 0 });
    Scene.render(dt);
    if (++frame % 3 === 0) { hud(); updateButtons(); updatePhases(); }
    requestAnimationFrame(loop);
  }
  window.__mbe = { get s() { return s; }, get game() { return game; } }; // debug hook for testing
  reset();
  requestAnimationFrame(loop);
})();
