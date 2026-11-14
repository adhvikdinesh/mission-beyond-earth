/* Mission: Beyond Earth — the low-altitude view from the cockpit (pad to ~26 km).
 * Units are metres. East (downrange, over the Atlantic) is +x, north is -z, up is +y.
 * The pad sits at the origin, a few kilometres inland from the coast at Kourou.
 */
(function () {
  "use strict";
  const A = {};
  const COAST_X = 3500;          // metres east of the pad
  let scene, camera, skyMat, fog, smoke = [], puffTex, smokeTime = 0;

  function rnd(a, b) { return a + Math.random() * (b - a); }

  function puffTexture(tint) {
    const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d");
    for (let i = 0; i < 18; i++) {
      const px = rnd(30, 98), py = rnd(38, 90), r = rnd(18, 36);
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, tint + "0.55)"); g.addColorStop(1, tint + "0)");
      x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
    }
    return new THREE.CanvasTexture(c);
  }

  /* Ground texture: jungle to the west, a sandy coast, the Atlantic to the east. */
  function groundTexture(size, metres, detail) {
    const c = document.createElement("canvas"); c.width = c.height = size; const x = c.getContext("2d");
    const m2p = size / metres, cx = size / 2;
    const coastAt = (zPx) => cx + COAST_X * m2p + Math.sin(zPx / size * 9) * 900 * m2p + (zPx - cx) * 0.35;
    // ocean
    const og = x.createLinearGradient(0, 0, size, 0);
    og.addColorStop(0, "#1d4d6b"); og.addColorStop(1, "#0f2f4c");
    x.fillStyle = og; x.fillRect(0, 0, size, size);
    // land
    x.fillStyle = "#24401f";
    x.beginPath(); x.moveTo(0, 0);
    for (let z = 0; z <= size; z += 4) x.lineTo(coastAt(z), z);
    x.lineTo(0, size); x.closePath(); x.fill();
    // forest texture
    const blobs = detail ? 9000 : 6000;
    for (let i = 0; i < blobs; i++) {
      const z = Math.random() * size, lim = coastAt(z), px = Math.random() * lim;
      const r = (detail ? rnd(2, 9) : rnd(1, 5));
      const g = 45 + Math.random() * 45;
      x.fillStyle = `rgba(${Math.round(g * 0.45)},${Math.round(g)},${Math.round(g * 0.35)},0.55)`;
      x.beginPath(); x.arc(px, z, r, 0, Math.PI * 2); x.fill();
    }
    // beach and surf
    x.strokeStyle = "rgba(214,196,150,0.9)"; x.lineWidth = Math.max(2, 120 * m2p);
    x.beginPath(); for (let z = 0; z <= size; z += 4) { const px = coastAt(z); z ? x.lineTo(px, z) : x.moveTo(px, z); } x.stroke();
    x.strokeStyle = "rgba(255,255,255,0.35)"; x.lineWidth = Math.max(1, 60 * m2p);
    x.beginPath(); for (let z = 0; z <= size; z += 4) { const px = coastAt(z) + Math.max(2, 140 * m2p); z ? x.lineTo(px, z) : x.moveTo(px, z); } x.stroke();
    // a river
    x.strokeStyle = "rgba(60,90,80,0.9)"; x.lineWidth = Math.max(2, 180 * m2p);
    x.beginPath(); x.moveTo(coastAt(cx - 3000 * m2p), cx - 3000 * m2p);
    for (let t = 0; t < 1; t += 0.02) x.lineTo(coastAt(cx - 3000 * m2p) - t * size * 0.6, cx - 3000 * m2p - t * size * 0.25 + Math.sin(t * 20) * 40 * (detail ? 1 : 0.2));
    x.stroke();
    if (detail) {
      // launch complex: clearing, roads, pad and flame trench
      x.fillStyle = "#6e6a5c"; x.fillRect(cx - 250 * m2p, cx - 250 * m2p, 500 * m2p, 500 * m2p);
      x.fillStyle = "#9b978b"; x.fillRect(cx - 60 * m2p, cx - 60 * m2p, 120 * m2p, 120 * m2p);
      x.fillStyle = "#2c2a26"; x.fillRect(cx - 12 * m2p, cx, 24 * m2p, 140 * m2p);
      x.strokeStyle = "#8d8a80"; x.lineWidth = 14 * m2p;
      x.beginPath(); x.moveTo(cx, cx + 250 * m2p); x.lineTo(cx - 2500 * m2p, cx + 3200 * m2p); x.stroke();
      x.beginPath(); x.moveTo(cx - 250 * m2p, cx); x.lineTo(cx - 4000 * m2p, cx - 900 * m2p); x.stroke();
    }
    const t = new THREE.CanvasTexture(c); t.anisotropy = 8; return t;
  }

  A.init = function (renderer) {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, 1, 0.5, 2.5e6);
    fog = new THREE.Fog(0xa9c8e6, 8000, 60000); scene.fog = fog;

    // sky dome
    skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      uniforms: { alt: { value: 0 }, sunDir: { value: new THREE.Vector3(0.55, 0.62, 0.56).normalize() } },
      vertexShader: "varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
      fragmentShader: `uniform float alt; uniform vec3 sunDir; varying vec3 vDir;
        void main(){
          float e=vDir.y; float k=clamp(alt/26000.0,0.0,1.0);
          vec3 zen=mix(vec3(0.17,0.42,0.80),vec3(0.0,0.02,0.09),pow(k,0.7));
          vec3 hor=mix(vec3(0.78,0.87,0.96),vec3(0.38,0.62,0.92),k);
          vec3 c=mix(hor,zen,pow(clamp(e,0.0,1.0),0.45));
          c=mix(c,hor*0.9,smoothstep(0.0,-0.25,e));
          float sd=max(dot(vDir,sunDir),0.0);
          c+=vec3(1.0,0.92,0.78)*(pow(sd,600.0)*3.0+pow(sd,12.0)*0.25*(1.0-k*0.6));
          gl_FragColor=vec4(c,1.0);
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(2e6, 48, 32), skyMat);
    sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);
    A.sky = sky;

    // ground: a wide regional plane and a detailed plane around the pad
    const wide = new THREE.Mesh(new THREE.PlaneGeometry(900000, 900000), new THREE.MeshBasicMaterial({ map: groundTexture(2048, 900000, false) }));
    wide.rotation.x = -Math.PI / 2; wide.position.y = -2; scene.add(wide);
    const near = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000), new THREE.MeshBasicMaterial({ map: groundTexture(2048, 20000, true), transparent: false }));
    near.rotation.x = -Math.PI / 2; scene.add(near);

    // launch tower beside the rocket (north side)
    const tower = new THREE.Group();
    const red = new THREE.MeshBasicMaterial({ color: 0xa8392c }), white = new THREE.MeshBasicMaterial({ color: 0xd9dde2 }), grey = new THREE.MeshBasicMaterial({ color: 0x4b525c });
    for (let i = 0; i < 10; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 5), i % 2 ? white : red); b.position.y = 2.5 + i * 5; tower.add(b); }
    for (let i = 0; i < 4; i++) { const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 9), grey); arm.position.set(0, 10 + i * 11, 6); tower.add(arm); }
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 8, 6), grey); top.position.y = 54; tower.add(top);
    tower.position.set(26, 0, -20); scene.add(tower);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(40, 2, 40), grey); pad.position.y = -0.9; scene.add(pad);

    // cloud deck
    const cloudTex = puffTexture("rgba(255,255,255,");
    for (let i = 0; i < 260; i++) {
      const m = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: rnd(0.55, 0.95) });
      const sp = new THREE.Sprite(m); const s = rnd(500, 1600);
      sp.scale.set(s * 1.6, s, 1);
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * 45000;
      sp.position.set(Math.cos(a) * d + 8000, rnd(1700, 3200), Math.sin(a) * d);
      scene.add(sp);
    }
    puffTex = puffTexture("rgba(225,222,215,");
  };

  function updateSmoke(dt, flame, alt) {
    smokeTime += dt;
    if (flame > 0.2 && alt < 400 && smokeTime > 0.05) {
      smokeTime = 0;
      for (let k = 0; k < 3; k++) {
        const m = new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0.9 });
        const sp = new THREE.Sprite(m); sp.scale.setScalar(rnd(15, 30));
        const a = Math.random() * Math.PI * 2; sp.position.set(0, rnd(2, 8), 0);
        sp.userData = { v: new THREE.Vector3(Math.cos(a) * rnd(15, 45), rnd(2, 8), Math.sin(a) * rnd(15, 45)), age: 0 };
        scene.add(sp); smoke.push(sp);
      }
    }
    for (let i = smoke.length - 1; i >= 0; i--) {
      const sp = smoke[i], u = sp.userData; u.age += dt;
      sp.position.addScaledVector(u.v, dt); u.v.multiplyScalar(0.985);
      sp.scale.multiplyScalar(1 + dt * 0.35); sp.material.opacity = Math.max(0, 0.9 - u.age / 14);
      if (u.age > 14) { scene.remove(sp); sp.material.dispose(); smoke.splice(i, 1); }
    }
  }

  A.reset = function () { smoke.forEach((s) => scene.remove(s)); smoke = []; };

  /* st: { alt, ground (downrange metres), shake, flame }, dt seconds */
  A.render = function (renderer, st, aspect, dt) {
    const alt = Math.max(0, st.alt);
    camera.aspect = aspect; camera.updateProjectionMatrix();
    skyMat.uniforms.alt.value = alt;
    const k = Math.min(1, alt / 26000);
    fog.color.setRGB(0.66 - 0.3 * k, 0.78 - 0.25 * k, 0.9 - 0.15 * k);
    fog.near = 6000 + alt * 2; fog.far = 60000 + alt * 22;
    updateSmoke(dt, st.flame, alt);
    const cx = st.ground, cy = alt + 17;
    camera.position.set(cx, cy, 0);
    if (st.shake > 0) camera.position.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(st.shake * 0.35));
    A.sky.position.copy(camera.position);
    // look downrange; tip the view down as we climb so the ground stays in sight
    const down = -0.04 + 0.42 * Math.min(1, alt / 20000);
    camera.lookAt(cx + Math.cos(down) * 1000, cy - Math.sin(down) * 1000, 0);
    renderer.render(scene, camera);
  };

  window.Ascent = A;
})();
