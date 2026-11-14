/* AI-assisted: written with the help of Claude (Anthropic) under the project author's direction. */
/* Mission: Beyond Earth — the 3D cockpit, drawn on top of the outside world.
 * Units are metres; the pilot's eye is at the origin looking down -z.
 * Live instrument screens, a throttle lever, guarded switches and a gloved hand
 * that reaches for each control when it is used.
 */
(function () {
  "use strict";
  const C = {};
  let scene, camera, hand, lever, sw = {}, screens = [], data = {}, lastDraw = 0, raycaster, pickables = [];
  const REST = new THREE.Vector3(0.58, -0.47, -0.4);
  let handTarget = REST.clone(), handHold = 0, pressT = 0, handMode = "rest";
  const tmp = new THREE.Vector3();
  const SHOULDER = new THREE.Vector3(0.42, -0.62, 0.15);

  /* Procedural panel texture: subtle grain, seams, screws and printed markings. */
  function panelTexture(base, seams, marks) {
    const c = document.createElement("canvas"); c.width = c.height = 512; const x = c.getContext("2d");
    x.fillStyle = base; x.fillRect(0, 0, 512, 512);
    const img = x.getImageData(0, 0, 512, 512), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    x.putImageData(img, 0, 0);
    if (seams) {
      x.strokeStyle = "rgba(0,0,0,0.55)"; x.lineWidth = 2;
      for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(i * 128, 0); x.lineTo(i * 128, 512); x.stroke(); x.beginPath(); x.moveTo(0, i * 170); x.lineTo(512, i * 170); x.stroke(); }
      x.strokeStyle = "rgba(255,255,255,0.06)"; x.lineWidth = 1;
      for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(i * 128 + 2, 0); x.lineTo(i * 128 + 2, 512); x.stroke(); }
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) for (const [ox, oy] of [[10, 10], [118, 10], [10, 160], [118, 160]]) {
        const sx = i * 128 + ox, sy = j * 170 + oy;
        x.fillStyle = "#6a717b"; x.beginPath(); x.arc(sx, sy, 4, 0, Math.PI * 2); x.fill();
        x.strokeStyle = "#2a2e34"; x.beginPath(); x.moveTo(sx - 3, sy); x.lineTo(sx + 3, sy); x.stroke();
      }
    }
    if (marks) {
      x.fillStyle = "rgba(220,228,236,0.55)"; x.font = "bold 13px JetBrains Mono, monospace";
      ["PWR BUS A", "AVIONICS", "CABIN PRESS", "O2 FLOW", "COMM 1", "GNC"].forEach((t, i) => x.fillText(t, 20 + (i % 3) * 165, 60 + Math.floor(i / 3) * 210));
      x.strokeStyle = "rgba(255,179,0,0.5)"; x.lineWidth = 2; x.strokeRect(14, 470, 484, 30);
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
  }
  let TEX = null;
  function texMat(kind, repeat) {
    const t = TEX[kind].clone(); t.needsUpdate = true; t.repeat.set(repeat[0], repeat[1]);
    return new THREE.MeshStandardMaterial({ map: t, roughness: kind === "foam" ? 0.98 : 0.75, metalness: kind === "foam" ? 0 : 0.25 });
  }
  function std(color, rough, metal, emissive) {
    return new THREE.MeshStandardMaterial({ color: color, roughness: rough == null ? 0.7 : rough, metalness: metal || 0.1, emissive: emissive || 0x000000 });
  }
  function box(w, h, d, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); (parent || scene).add(m); return m;
  }

  function labelTexture(text, color) {
    const c = document.createElement("canvas"); c.width = 256; c.height = 64; const x = c.getContext("2d");
    x.fillStyle = "#15191f"; x.fillRect(0, 0, 256, 64);
    x.fillStyle = color || "#d8dee6"; x.font = "bold 30px JetBrains Mono, monospace"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(text, 128, 34); return new THREE.CanvasTexture(c);
  }

  /* A guarded toggle switch with a status light and label. */
  function makeSwitch(name, label, x, y, z) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.x = 0.75; scene.add(g);
    const base = box(0.09, 0.012, 0.11, std(0x1b1f25, 0.6, 0.3), 0, 0, 0, g);
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.022), new THREE.MeshBasicMaterial({ map: labelTexture(label) }));
    lab.rotation.x = -Math.PI / 2; lab.position.set(0, 0.007, 0.042); g.add(lab);
    const light = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.006, 16), new THREE.MeshBasicMaterial({ color: 0x2a3038 }));
    light.position.set(0.032, 0.009, -0.035); g.add(light);
    const toggle = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.04, 10), std(0xc9ced6, 0.3, 0.8));
    toggle.position.set(0, 0.02, -0.005); toggle.rotation.x = 0.5; g.add(toggle);
    const guardPivot = new THREE.Group(); guardPivot.position.set(0, 0.008, -0.03); g.add(guardPivot);
    const guard = box(0.05, 0.004, 0.06, std(0xb3261e, 0.5, 0.2), 0, 0.025, 0.03, guardPivot);
    base.userData.sw = name; guard.userData.sw = name; toggle.userData.sw = name; lab.userData.sw = name;
    pickables.push(base, guard, toggle, lab);
    sw[name] = { g, light, toggle, guardPivot, state: "off", flipped: false };
  }

  function makeScreen(x, y, z, w, h) {
    const c = document.createElement("canvas"); c.width = 512; c.height = Math.round(512 * h / w);
    const tex = new THREE.CanvasTexture(c);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    m.position.set(x, y, z); m.rotation.x = -0.32; scene.add(m);
    box(w + 0.03, h + 0.03, 0.02, std(0x0d1014, 0.5, 0.4), x, y - 0.002, z - 0.012).rotation.x = -0.32;
    screens.push({ c, x: c.getContext("2d"), tex });
  }

  function makeHand() {
    hand = new THREE.Group();
    const glove = std(0xd5dbe2, 0.85, 0.05), dark = std(0x8d96a3, 0.8, 0.05), ring = std(0x2b5ea8, 0.4, 0.5);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), glove); palm.scale.set(0.045, 0.02, 0.055); hand.add(palm);
    const knuckle = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), dark); knuckle.scale.set(0.044, 0.012, 0.012); knuckle.position.set(0, 0.008, -0.046); hand.add(knuckle);
    const fingers = new THREE.Group(); fingers.position.z = -0.05; hand.add(fingers);
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Group(); f.position.x = -0.03 + i * 0.02; f.rotation.x = -0.35 - (i === 1 ? 0.25 : 0); fingers.add(f);
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.009, 0.05, 10), glove); seg.rotation.x = Math.PI / 2; seg.position.z = -0.025; f.add(seg);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.0088, 10, 8), glove); tip.position.z = -0.05; f.add(tip);
      const joint = new THREE.Mesh(new THREE.TorusGeometry(0.0092, 0.0018, 6, 14), dark); joint.position.z = -0.026; f.add(joint);
    }
    hand.userData.fingers = fingers;
    const thumb = new THREE.Group(); thumb.position.set(-0.042, -0.004, -0.012); thumb.rotation.set(0.1, 0.7, 0.2); hand.add(thumb);
    const ts = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.01, 0.045, 10), glove); ts.rotation.x = Math.PI / 2; ts.position.z = -0.022; thumb.add(ts);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.05, 20), glove); cuff.rotation.x = Math.PI / 2; cuff.position.z = 0.07; hand.add(cuff);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.007, 8, 24), ring); band.position.z = 0.096; hand.add(band);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.6, 20), std(0xe4e7ea, 0.9, 0.02)); sleeve.rotation.x = Math.PI / 2; sleeve.position.z = 0.4; hand.add(sleeve);
    hand.position.copy(REST); scene.add(hand);
  }

  C.init = function () {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, 1, 0.01, 50);
    raycaster = new THREE.Raycaster();
    scene.add(new THREE.HemisphereLight(0xc9dcff, 0x2a2622, 0.55));
    const sun = new THREE.DirectionalLight(0xfff1dc, 0.9); sun.position.set(1.5, 2, -2); scene.add(sun);
    const glow = new THREE.PointLight(0x7fd8ff, 0.35, 2.2); glow.position.set(0, -0.2, -0.6); scene.add(glow);
    C.sunLight = sun;

    TEX = { hull: panelTexture("#3a4049", true, false), dark: panelTexture("#1b1f25", true, true), foam: panelTexture("#2e3238", false, false) };
    const hull = texMat("hull", [2, 1]), trim = std(0x4a525d, 0.45, 0.6), dark = texMat("dark", [2, 1]), foam = texMat("foam", [4, 1]);
    // window frame: top beam, sill, centre pillar, side pillars
    box(3.2, 0.6, 0.12, hull, 0, 0.82, -1.0);
    box(0.05, 0.6, 0.08, trim, 0, 0.24, -1.0);
    box(0.7, 1.4, 0.12, hull, -1.32, 0.1, -1.0); box(0.7, 1.4, 0.12, hull, 1.32, 0.1, -1.0);
    box(0.05, 0.62, 0.06, trim, -0.95, 0.21, -0.97); box(0.05, 0.62, 0.06, trim, 0.95, 0.21, -0.97);
    box(1.95, 0.04, 0.06, trim, 0, 0.53, -0.97); box(1.95, 0.03, 0.06, trim, 0, -0.03, -0.97);
    // window glass: a faint reflection so it reads as glass
    const gc = document.createElement("canvas"); gc.width = 256; gc.height = 128; const gx = gc.getContext("2d");
    const gg = gx.createLinearGradient(0, 0, 256, 128); gg.addColorStop(0, "rgba(255,255,255,0.10)"); gg.addColorStop(0.35, "rgba(255,255,255,0.0)"); gg.addColorStop(0.7, "rgba(180,210,255,0.05)"); gg.addColorStop(1, "rgba(255,255,255,0)");
    gx.fillStyle = gg; gx.fillRect(0, 0, 256, 128);
    const glassMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, depthWrite: false });
    [-0.475, 0.475].forEach((gx2) => { const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.56), glassMat); gl.position.set(gx2, 0.25, -0.99); scene.add(gl); });
    // bolts around the windows
    const boltM = std(0x6d747e, 0.4, 0.8);
    for (let i = 0; i < 22; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), boltM); b.position.set(-0.92 + i * 0.0876, 0.52, -0.935); scene.add(b); }
    // glareshield and main instrument panel
    const glare = box(2.4, 0.035, 0.14, foam, 0, -0.05, -0.95); glare.rotation.x = 0.05;
    const panel = box(2.4, 0.42, 0.1, dark, 0, -0.27, -0.93); panel.rotation.x = -0.32;
    makeScreen(-0.37, -0.175, -0.85, 0.32, 0.2);
    makeScreen(0, -0.175, -0.85, 0.32, 0.2);
    makeScreen(0.37, -0.175, -0.85, 0.32, 0.2);
    // side walls and overhead lights
    box(0.08, 1.6, 1.4, hull, -1.0, 0.1, -0.3); box(0.08, 1.6, 1.4, hull, 1.0, 0.1, -0.3);
    for (let i = 0; i < 10; i++) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.01, 12), new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0x00ff88 : 0x2a3038 }));
      l.rotation.x = Math.PI / 2; l.position.set(-0.45 + i * 0.1, 0.56, -0.93); scene.add(l);
    }
    // centre pedestal with guarded switches
    const ped = box(0.56, 0.04, 0.2, dark, 0, -0.235, -0.61); ped.rotation.x = 0.75;
    makeSwitch("stage", "STAGE", -0.195, -0.215, -0.6);
    makeSwitch("fairing", "FAIRING", -0.065, -0.215, -0.6);
    makeSwitch("arm", "ARM", 0.065, -0.215, -0.6);
    makeSwitch("release", "RELEASE", 0.195, -0.215, -0.6);
    // throttle quadrant on the right
    const quad = box(0.12, 0.06, 0.22, dark, 0.42, -0.29, -0.58); quad.rotation.x = -0.4;
    const slot = box(0.02, 0.01, 0.18, std(0x050608, 0.9), 0.42, -0.255, -0.58); slot.rotation.x = -0.4;
    lever = new THREE.Group(); lever.position.set(0.42, -0.27, -0.58); scene.add(lever);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.1, 10), std(0x9aa3ad, 0.35, 0.8)); shaft.position.y = 0.05; lever.add(shaft);
    const grip = box(0.06, 0.03, 0.035, std(0x1c1f24, 0.55, 0.2), 0, 0.105, 0, lever);
    const gripCap = box(0.062, 0.007, 0.037, std(0xffb300, 0.5, 0.2), 0, 0.123, 0, lever);
    grip.userData.sw = "throttle"; pickables.push(grip, gripCap);
    lever.userData.grip = grip;
    makeHand();
  };

  /* Ask the hand to go to a control. name: throttle | stage | fairing | arm | release */
  C.reach = function (name, holdSeconds) {
    if (!hand) return;
    handMode = name; handHold = holdSeconds || 1.2;
    if (sw[name]) pressT = 0.6;
  };

  C.setData = function (d) { data = d; };

  C.setSwitch = function (name, state) { if (sw[name]) sw[name].state = state; };
  C.flip = function (name) { if (sw[name]) sw[name].flipped = true; };
  C.resetSwitches = function () { Object.keys(sw).forEach((k) => { sw[k].flipped = false; sw[k].state = "off"; }); };

  C.pick = function (ndcX, ndcY) {
    raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    return hit ? hit.object.userData.sw : null;
  };

  function drawScreens(now) {
    if (now - lastDraw < 120) return; lastDraw = now;
    const d = data;
    const sc = (i, fn) => { const s = screens[i]; const x = s.x, W = s.c.width, H = s.c.height; x.fillStyle = "#04080d"; x.fillRect(0, 0, W, H); fn(x, W, H); s.tex.needsUpdate = true; };
    const mono = (x, size, col) => { x.font = `${size}px JetBrains Mono, monospace`; x.fillStyle = col; };
    const bar = (x, X, Y, W, f, col) => { x.fillStyle = "#16202c"; x.fillRect(X, Y, W, 12); x.fillStyle = col; x.fillRect(X, Y, W * Math.max(0, Math.min(1, f)), 12); };
    // left: flight data
    sc(0, (x, W, H) => {
      mono(x, 20, "#5f7a94"); x.fillText("ALTITUDE", 24, 40); x.fillText("SPEED", 24, 128); x.fillText("AIR PRESSURE Q", 24, 216);
      mono(x, 54, "#e8eef6"); x.fillText((d.alt || 0).toFixed(1) + " km", 24, 96); x.fillText((d.speed || 0).toFixed(2) + " km/s", 24, 184);
      const qf = (d.q || 0) / (d.qLimit || 32);
      mono(x, 30, qf > 0.85 ? "#ff4d4d" : "#e8eef6"); x.fillText((d.q || 0).toFixed(1) + " / " + (d.qLimit || 32) + " kPa", 24, 254);
      bar(x, 24, 270, W - 48, qf, qf > 0.85 ? "#ff4d4d" : qf > 0.6 ? "#ffb300" : "#00ff88");
    });
    // centre: attitude and phase
    sc(1, (x, W, H) => {
      const cx = W / 2, cy = H / 2 + 6, r = 108;
      x.save(); x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.clip();
      const pitch = (d.pitch || 0) * Math.PI / 180;
      x.translate(cx, cy); x.rotate(pitch);
      x.fillStyle = "#1e4f86"; x.fillRect(-r, -r, 2 * r, r); x.fillStyle = "#6b4a2b"; x.fillRect(-r, 0, 2 * r, r);
      x.strokeStyle = "#ffffff"; x.lineWidth = 2; x.beginPath(); x.moveTo(-r, 0); x.lineTo(r, 0); x.stroke();
      x.restore();
      x.strokeStyle = "#ffb300"; x.lineWidth = 4; x.beginPath(); x.moveTo(cx - 50, cy); x.lineTo(cx - 14, cy); x.moveTo(cx + 14, cy); x.lineTo(cx + 50, cy); x.stroke();
      // target marker
      const tp = ((d.target || 0) - (d.pitch || 0)) * Math.PI / 180;
      x.strokeStyle = "#00ff88"; x.lineWidth = 3; x.beginPath(); x.arc(cx, cy, r + 6, -Math.PI / 2 + tp - 0.08, -Math.PI / 2 + tp + 0.08); x.stroke();
      mono(x, 20, "#5f7a94"); x.fillText("PITCH", 18, 34); mono(x, 34, "#e8eef6"); x.fillText(Math.round(d.pitch || 0) + "°", 18, 72);
      mono(x, 18, "#00ff88"); x.fillText("TGT " + Math.round(d.target || 0) + "°", 18, 100);
      mono(x, 20, "#ffb300"); x.textAlign = "right"; x.fillText(d.clock || "", W - 18, 34); mono(x, 18, "#e8eef6"); x.fillText((d.phase || "").toUpperCase(), W - 18, H - 18); x.textAlign = "left";
    });
    // right: vehicle and orbit
    sc(2, (x, W, H) => {
      mono(x, 20, "#5f7a94"); x.fillText("STAGE 1 FUEL", 24, 40); x.fillText("STAGE 2 FUEL", 24, 100); x.fillText("ORBIT HIGH / LOW", 24, 168); x.fillText("THROTTLE", 24, 252);
      bar(x, 24, 54, W - 48, d.f1 || 0, "#ffb300"); bar(x, 24, 114, W - 48, d.f2 || 0, "#ffb300");
      mono(x, 34, "#e8eef6"); x.fillText(d.orbit || "— / —", 24, 210);
      mono(x, 30, "#00d4ff"); x.fillText(Math.round((d.throttle || 0) * 100) + "%", 24, 292);
    });
  }

  C.render = function (renderer, aspect, dt, shake) {
    camera.aspect = aspect; camera.updateProjectionMatrix();
    const now = performance.now();
    drawScreens(now);
    // throttle lever angle
    const ang = -0.55 + (data.throttle || 0) * 1.1;
    lever.rotation.x += (ang - lever.rotation.x) * Math.min(1, dt * 12);
    // switch lights and guards
    const blink = Math.floor(now / 350) % 2 === 0;
    Object.keys(sw).forEach((k) => {
      const s = sw[k];
      s.light.material.color.setHex(s.flipped ? 0x00ff88 : s.state === "ready" ? (blink ? 0xffb300 : 0x3a2a05) : 0x2a3038);
      const target = s.flipped || (handMode === k && pressT > 0) ? -1.9 : 0;
      s.guardPivot.rotation.x += (target - s.guardPivot.rotation.x) * Math.min(1, dt * 10);
      s.toggle.rotation.x += ((s.flipped ? -0.5 : 0.5) - s.toggle.rotation.x) * Math.min(1, dt * 10);
    });
    // hand target
    if (handHold > 0) handHold -= dt; else handMode = "rest";
    if (pressT > 0) pressT -= dt;
    if (handMode === "throttle") { lever.userData.grip.getWorldPosition(tmp); handTarget.copy(tmp).add(new THREE.Vector3(0.005, 0.035, 0.06)); }
    else if (sw[handMode]) { sw[handMode].g.getWorldPosition(tmp); handTarget.copy(tmp).add(new THREE.Vector3(0, 0.05 - (pressT > 0 && pressT < 0.35 ? 0.025 : 0), 0.05)); }
    else handTarget.copy(REST);
    hand.position.lerp(handTarget, Math.min(1, dt * 7));
    // point the forearm back toward the pilot's right shoulder, like a real arm
    hand.lookAt(SHOULDER); hand.rotateZ(Math.PI);
    hand.userData.fingers.rotation.x = handMode === "throttle" ? -0.9 : 0;
    // cockpit shake
    camera.position.set(0, 0, 0);
    if (shake > 0) camera.position.set((Math.random() - 0.5) * shake * 0.004, (Math.random() - 0.5) * shake * 0.004, 0);
    renderer.autoClear = false; renderer.clearDepth();
    renderer.render(scene, camera);
    renderer.autoClear = true;
  };

  window.Cockpit = C;
})();
