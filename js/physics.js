/* AI-assisted: written with the help of Claude (Anthropic) under the project author's direction. */
/* Mission: Beyond Earth — launch physics.
 * 2D flight in the launch plane, real SI units. Earth-centred, the pad starts at (0, R).
 * Gravity (inverse square), exponential atmosphere, drag, two stages with
 * pressure-dependent thrust/Isp, a fairing and a payload.
 * Rocket numbers are modelled on a small launcher of the Electron class (approximate public figures).
 */
(function (root) {
  "use strict";
  const GM = 3.986004418e14;      // m^3/s^2
  const R = 6371000;              // m
  const G0 = 9.80665;             // m/s^2
  const OMEGA = 7.2921159e-5;     // Earth rotation, rad/s
  const RHO0 = 1.225, HSCALE = 8500; // sea-level density kg/m^3, scale height m
  const SITE_LAT = 5.24;          // Guiana Space Centre, Kourou (deg)

  const ROCKET = {
    name: "Lynx-2 (small launcher, Electron-class)",
    diameter: 1.2, cd: 0.32,
    s1: { dry: 950, prop: 9250, thrustSL: 192e3, thrustVac: 224e3, ispSL: 303, ispVac: 311 },
    s2: { dry: 250, prop: 2050, thrustVac: 25.8e3, ispVac: 343 },
    fairing: 50,
    maxQ: 32000,        // Pa: structural limit used by the game
    fairingSafeQ: 50,   // Pa: below this the air is thin enough to drop the fairing
  };

  function create(opts) {
    opts = opts || {};
    const payload = opts.payload != null ? opts.payload : 150;
    // launch heading: 90 = due east (Earth's spin helps most), 0 = due north (polar orbit, no help)
    const az = opts.azimuth != null ? opts.azimuth : 90;
    const spin = Math.sin(az * Math.PI / 180);
    const vPad = OMEGA * R * Math.cos(SITE_LAT * Math.PI / 180) * spin;
    return {
      t: 0, x: 0, y: R, vx: vPad, vy: 0, spin: spin,
      stage: 1, prop1: ROCKET.s1.prop, prop2: ROCKET.s2.prop,
      fairing: true, payload: payload, released: false,
      throttle: 0, pitchCmd: 0, pitch: 0,   // pitch: degrees from straight up, toward downrange
      q: 0, maxQSeen: 0, g: 0, lifted: false,
      status: "pad", reason: null,
    };
  }

  function mass(s) {
    let m = ROCKET.s2.dry + s.prop2 + s.payload * (s.released ? 0 : 1) + (s.fairing ? ROCKET.fairing : 0);
    if (s.stage === 1) m += ROCKET.s1.dry + s.prop1;
    return m;
  }

  function radius(s) { return Math.hypot(s.x, s.y); }
  function altitude(s) { return radius(s) - R; }
  function speed(s) { return Math.hypot(s.vx, s.vy); }

  function airVel(s) { const k = OMEGA * Math.cos(SITE_LAT * Math.PI / 180) * (s.spin == null ? 1 : s.spin); return [k * s.y, -k * s.x]; }

  function engine(s) {
    if (s.throttle <= 0) return { T: 0, mdot: 0 };
    const h = Math.max(0, altitude(s));
    const pr = Math.exp(-h / HSCALE);
    if (s.stage === 1) {
      if (s.prop1 <= 0) return { T: 0, mdot: 0 };
      const st = ROCKET.s1;
      const T = (st.thrustVac - (st.thrustVac - st.thrustSL) * pr) * s.throttle;
      const isp = st.ispVac - (st.ispVac - st.ispSL) * pr;
      return { T: T, mdot: T / (isp * G0) };
    }
    if (s.prop2 <= 0) return { T: 0, mdot: 0 };
    const T = ROCKET.s2.thrustVac * s.throttle;
    return { T: T, mdot: T / (ROCKET.s2.ispVac * G0) };
  }

  /* Orbit from the current state: apoapsis/periapsis altitude (m), eccentricity, period (s). */
  function orbit(s) {
    const r = radius(s), v2 = s.vx * s.vx + s.vy * s.vy;
    const E = v2 / 2 - GM / r;
    const h = s.x * s.vy - s.y * s.vx;
    if (E >= 0) return { escape: true, apo: Infinity, peri: null, e: 1 };
    const a = -GM / (2 * E);
    const e = Math.sqrt(Math.max(0, 1 + 2 * E * h * h / (GM * GM)));
    return { escape: false, a: a, e: e, apo: a * (1 + e) - R, peri: a * (1 - e) - R, period: 2 * Math.PI * Math.sqrt(a * a * a / GM) };
  }

  function circularSpeed(alt) { return Math.sqrt(GM / (R + alt)); }

  /* Advance dt seconds. Returns the state (mutated). */
  function step(s, dt) {
    if (s.status === "crashed" || s.status === "broken") return s;
    const n = Math.max(1, Math.ceil(dt / 0.05));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      // pitch follows command at a limited turn rate (deg/s)
      const rate = 6 * h;
      s.pitch += Math.max(-rate, Math.min(rate, s.pitchCmd - s.pitch));

      const r = radius(s), ux = s.x / r, uy = s.y / r;   // up
      const ex = uy, ey = -ux;                            // downrange (east)
      const alt = r - R;
      const m = mass(s);
      const eng = engine(s);

      // thrust
      const p = s.pitch * Math.PI / 180;
      const dx = Math.cos(p) * ux + Math.sin(p) * ex, dy = Math.cos(p) * uy + Math.sin(p) * ey;
      let ax = eng.T / m * dx, ay = eng.T / m * dy;
      // gravity
      const gk = -GM / (r * r * r);
      ax += gk * s.x; ay += gk * s.y;
      // drag (relative to the rotating air)
      const air = airVel(s);
      const rvx = s.vx - air[0], rvy = s.vy - air[1], rv = Math.hypot(rvx, rvy);
      const rho = alt < 150000 ? RHO0 * Math.exp(-Math.max(0, alt) / HSCALE) : 0;
      const area = Math.PI * Math.pow(ROCKET.diameter / 2, 2);
      const dk = -0.5 * rho * rv * ROCKET.cd * area / m;
      ax += dk * rvx; ay += dk * rvy;
      s.q = 0.5 * rho * rv * rv;

      // pad hold-down: no motion until thrust beats weight
      if (!s.lifted) {
        if (eng.T > m * G0) s.lifted = true; else { ax = 0; ay = 0; }
      }

      s.vx += ax * h; s.vy += ay * h;
      s.x += s.vx * h; s.y += s.vy * h;
      s.t += h;
      if (s.stage === 1) s.prop1 = Math.max(0, s.prop1 - eng.mdot * h); else s.prop2 = Math.max(0, s.prop2 - eng.mdot * h);
      s.g = (eng.T + 0.5 * rho * rv * rv * ROCKET.cd * area) / m / G0;
      if (s.lifted && s.status === "pad") s.status = "flying";

      if (s.q > s.maxQSeen) s.maxQSeen = s.q;
      if (s.q > ROCKET.maxQ) { s.status = "broken"; const falling = (s.x * s.vx + s.y * s.vy) < 0;
        s.reason = falling ? "reentry" : (s.stage === 2 && speed(s) > 3000) ? "reentry" : "maxq"; return s; }
      if (s.fairing === false && s._fairingDroppedQ == null) s._fairingDroppedQ = s.q;
      if (s.lifted && altitude(s) < 0) { s.status = "crashed"; s.reason = "ground"; return s; }
    }
    return s;
  }

  function stageSep(s) {
    if (s.stage !== 1) return false;
    s.stage = 2; s.prop1 = 0; return true;
  }
  function dropFairing(s) {
    if (!s.fairing) return null;
    s.fairing = false;
    return s.q <= ROCKET.fairingSafeQ ? "ok" : "too-early";
  }

  /* A guidance cue: the pitch a good flight holds at this altitude (deg from vertical). */
  function guidancePitch(altM) {
    const h = Math.max(0, altM) / 1000;
    if (h < 0.5) return 0;
    return Math.min(90, 90 * Math.pow((h - 0.5) / 180, 0.5));
  }

  /* Full guidance: stage 1 follows the altitude profile; stage 2 steers so the climb rate
   * shrinks smoothly as the rocket nears the target height, like a real upper stage. */
  function vertSpeed(s) { return (s.x * s.vx + s.y * s.vy) / radius(s); }
  function guidance(s, targetM) {
    if (s.stage === 1) return guidancePitch(altitude(s));
    const vrTarget = Math.max(0, ((targetM || 500000) - 10000 - altitude(s)) / 200);
    return Math.max(20, Math.min(90, 90 - 0.05 * (vrTarget - vertSpeed(s))));
  }
  /* Circularization burn: point along the horizon, nudged down if still climbing. */
  function circPitch(s) { return Math.max(75, Math.min(95, 90 + 0.1 * vertSpeed(s))); }

  const api = { GM, R, G0, ROCKET, create, step, mass, altitude, speed, orbit, circularSpeed, stageSep, dropFairing, guidancePitch, guidance, circPitch, vertSpeed, engine };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.LaunchPhysics = api;
})(typeof window !== "undefined" ? window : globalThis);
