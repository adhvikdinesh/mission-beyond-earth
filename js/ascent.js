/* AI-assisted: written with the help of Claude (Anthropic) under the project author's direction. */
/* Mission: Beyond Earth — the low-altitude view from the cockpit (pad to ~26 km).
 * Units are metres. East (downrange, over the Atlantic) is +x, north is -z, up is +y.
 * The pad sits at the origin, a few kilometres inland from the coast at Kourou.
 */
(function () {
  "use strict";
  const A = {};
  const COAST_X = 3500;          // metres east of the pad
  let scene, camera, skyMat, fog, smoke = [], puffTex, smokeTime = 0, rocket, plume;
  const CAM_POS = new THREE.Vector3(-260, 5, 190);

  function rnd(a, b) { return a + Math.random() * (b - a); }

  /* A soft puff as an alpha mask over a single solid colour (no colour data in the
   * transparent pixels, so it filters cleanly on every GPU). */
  function puffTexture(tint) {
    const N = 128, alpha = new Float32Array(N * N);
    for (let i = 0; i < 18; i++) {
      const px = rnd(30, 98), py = rnd(38, 90), r = rnd(18, 36);
      for (let y = Math.max(0, Math.floor(py - r)); y < Math.min(N, Math.ceil(py + r)); y++)
        for (let x = Math.max(0, Math.floor(px - r)); x < Math.min(N, Math.ceil(px + r)); x++) {
          const d = Math.hypot(x - px, y - py) / r; if (d >= 1) continue;
          const a = 0.55 * (1 - d), o = y * N + x; alpha[o] = alpha[o] + a * (1 - alpha[o]);
        }
    }
    const rgb = tint.match(/\d+/g).map(Number), data = new Uint8Array(N * N * 4);
    for (let o = 0; o < N * N; o++) { data[o * 4] = rgb[0]; data[o * 4 + 1] = rgb[1]; data[o * 4 + 2] = rgb[2]; data[o * 4 + 3] = Math.round(Math.min(1, alpha[o]) * 255); }
    const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.flipY = true; t.needsUpdate = true;
    return t;
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
    const blobs = (detail ? 9000 : 6000) * (size / 2048) * (size / 2048);
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
    const t = new THREE.CanvasTexture(c); t.anisotropy = MAXANISO; return t;
  }

  let MAXANISO = 8;
  A.init = function (renderer) {
    MAXANISO = renderer.capabilities.getMaxAnisotropy();
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, 1, 0.5, 2.5e6);
    fog = new THREE.Fog(0xa9c8e6, 8000, 60000); scene.fog = fog;

    // sky dome
    skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      uniforms: { alt: { value: 0 }, sunDir: { value: new THREE.Vector3(0.55, 0.62, 0.56).normalize() } },
      vertexShader: "varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
      fragmentShader: `precision highp float; uniform float alt; uniform vec3 sunDir; varying vec3 vDir;
        float h(vec2 p){ p=fract(p*vec2(0.1031,0.1030)); p+=dot(p,p.yx+33.33); return fract((p.x+p.y)*p.x); }
        float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(h(i),h(i+vec2(1.0,0.0)),f.x),mix(h(i+vec2(0.0,1.0)),h(i+vec2(1.0,1.0)),f.x),f.y); }
        float fbm(vec2 p){ float a=0.5, r=0.0; for(int i=0;i<5;i++){ r+=a*vn(p); p*=2.03; a*=0.5; } return r; }
        void main(){
          float e=vDir.y; float k=clamp(alt/26000.0,0.0,1.0);
          vec3 zen=mix(vec3(0.17,0.42,0.80),vec3(0.0,0.02,0.09),pow(k,0.7));
          vec3 hor=mix(vec3(0.78,0.87,0.96),vec3(0.38,0.62,0.92),k);
          vec3 c=mix(hor,zen,pow(clamp(e,0.0,1.0),0.45));
          c=mix(c,hor*0.9,smoothstep(0.0,-0.25,e));
          float sd=max(dot(vDir,sunDir),0.0);
          c+=vec3(1.0,0.92,0.78)*(pow(sd,600.0)*3.0+pow(sd,12.0)*0.25*(1.0-k*0.6));
          // white clouds, drawn in the sky itself (no textures: same look on every GPU)
          if(e>0.0){
            vec2 q=vDir.xz/(e+0.12)*1.6;
            float n=fbm(q)+0.5*fbm(q*2.3+7.0);
            float cl=smoothstep(0.62,0.95,n)*smoothstep(0.0,0.08,e)*(1.0-smoothstep(0.35,0.8,e))*(1.0-k);
            c=mix(c,vec3(0.97,0.97,0.98),clamp(cl,0.0,0.9));
          }
          gl_FragColor=vec4(c,1.0);
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(2e6, 48, 32), skyMat);
    sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);
    A.sky = sky;

    // ground: a wide regional plane and a detailed plane around the pad
    const wide = new THREE.Mesh(new THREE.PlaneGeometry(900000, 900000), new THREE.MeshBasicMaterial({ map: groundTexture(2048, 900000, false) }));
    wide.rotation.x = -Math.PI / 2; wide.position.y = -2; scene.add(wide);
    const mid = new THREE.Mesh(new THREE.PlaneGeometry(140000, 140000), new THREE.MeshBasicMaterial({ map: groundTexture(4096, 140000, false) }));
    mid.rotation.x = -Math.PI / 2; mid.position.y = -1; scene.add(mid);
    const near = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), new THREE.MeshBasicMaterial({ map: groundTexture(4096, 12000, true), transparent: false }));
    near.rotation.x = -Math.PI / 2; scene.add(near);

    // launch tower beside the rocket (north side)
    const tower = new THREE.Group();
    const red = new THREE.MeshBasicMaterial({ color: 0xa8392c }), white = new THREE.MeshBasicMaterial({ color: 0xd9dde2 }), grey = new THREE.MeshBasicMaterial({ color: 0x4b525c });
    for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(2.6, 4, 2.6), i % 2 ? white : red); b.position.y = 2 + i * 4; tower.add(b); }
    for (let i = 0; i < 3; i++) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 2.4), grey); arm.position.set(0, 7 + i * 6.5, 2.2); tower.add(arm); }
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 5, 6), grey); top.position.y = 26.5; tower.add(top);
    tower.position.set(0, 0, -4.2); scene.add(tower);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(40, 2, 40), grey); pad.position.y = -0.9; scene.add(pad);

    puffTex = puffTexture("rgba(225,222,215,");

    // the launcher itself (seen from the launch camera)
    rocket = new THREE.Group();
    scene.add(new THREE.HemisphereLight(0xdfeeff, 0x3a4a2a, 0.75));
    const sunL = new THREE.DirectionalLight(0xfff3e0, 0.95); sunL.position.set(-400, 600, 500); scene.add(sunL);
    const rWhite = new THREE.MeshStandardMaterial({ color: 0xf0f2f5, roughness: 0.45, metalness: 0.1 }), rBlack = new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.6, metalness: 0.3 }), rShade = new THREE.MeshStandardMaterial({ color: 0xd8dce2, roughness: 0.5 });
    const s1 = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 13, 24), rWhite); s1.position.y = 7.5; rocket.add(s1);
    const s1s = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.76, 13, 24, 1, true, Math.PI * 0.55, Math.PI * 0.6), rShade); s1s.position.y = 7.5; rocket.add(s1s);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.77, 0.77, 1.1, 24), rBlack); band.position.y = 14.4; rocket.add(band);
    const s2 = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 3.5, 24), rWhite); s2.position.y = 16.7; rocket.add(s2);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.75, 3.4, 24), rWhite); cap.position.y = 20.1; rocket.add(cap);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.1), rBlack); win.position.set(0.55, 19.2, 0.45); win.rotation.y = 0.6; rocket.add(win);
    for (let i = 0; i < 9; i++) {
      const a2 = i / 9 * Math.PI * 2, r = i === 8 ? 0 : 0.45;
      const bell = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 12, 1, true), rBlack);
      bell.position.set(Math.cos(a2) * r, 0.7, Math.sin(a2) * r); rocket.add(bell);
    }
    for (let i = 0; i < 4; i++) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 0.5), rBlack);
      leg.position.set(Math.cos(i * Math.PI / 2) * 0.8, 1.6, Math.sin(i * Math.PI / 2) * 0.8); leg.rotation.y = -i * Math.PI / 2; rocket.add(leg);
    }
    // exhaust plume
    plume = new THREE.Group(); rocket.add(plume);
    const outer = new THREE.Mesh(new THREE.ConeGeometry(1.1, 14, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    outer.rotation.x = Math.PI; outer.position.y = -7; plume.add(outer);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.55, 7, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff4d6, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    inner.rotation.x = Math.PI; inner.position.y = -3.4; plume.add(inner);
    const gc = document.createElement("canvas"); gc.width = gc.height = 64; const gx = gc.getContext("2d"), gr = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,240,200,1)"); gr.addColorStop(0.3, "rgba(255,170,80,0.6)"); gr.addColorStop(1, "rgba(255,120,40,0)"); gx.fillStyle = gr; gx.fillRect(0, 0, 64, 64);
    const glowS = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glowS.scale.setScalar(6); glowS.position.y = -2; plume.add(glowS);
    scene.add(rocket);
  };

  function updateSmoke(dt, flame, alt) {
    smokeTime += dt;
    if (flame > 0.2 && alt < 250 && smokeTime > 0.08) {
      smokeTime = 0;
      for (let k = 0; k < 3; k++) {
        const m = new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0.9 });
        const sp = new THREE.Sprite(m); const s0 = rnd(15, 30); sp.scale.setScalar(s0);
        const a = Math.random() * Math.PI * 2; sp.position.set(0, rnd(2, 8), 0);
        sp.userData = { s0, v: new THREE.Vector3(Math.cos(a) * rnd(15, 45), rnd(2, 8), Math.sin(a) * rnd(15, 45)), age: 0 };
        scene.add(sp); smoke.push(sp);
      }
    }
    for (let i = smoke.length - 1; i >= 0; i--) {
      const sp = smoke[i], u = sp.userData; u.age += dt;
      sp.position.addScaledVector(u.v, dt); u.v.multiplyScalar(0.985);
      sp.scale.setScalar(Math.min(140, u.s0 * (1 + u.age * 0.45))); sp.material.opacity = Math.max(0, 0.75 * (1 - u.age / 12));
      if (u.age > 12) { scene.remove(sp); sp.material.dispose(); smoke.splice(i, 1); }
    }
  }

  A.reset = function () { smoke.forEach((s) => scene.remove(s)); smoke = []; };

  /* st: { alt, ground (downrange metres), shake, flame, pitch }, dt seconds, mode: "cockpit" | "launchcam" */
  A.render = function (renderer, st, aspect, dt, mode) {
    const alt = Math.max(0, st.alt);
    camera.aspect = aspect; camera.updateProjectionMatrix();
    skyMat.uniforms.alt.value = alt;
    const k = Math.min(1, alt / 26000);
    fog.color.setRGB(0.66 - 0.3 * k, 0.78 - 0.25 * k, 0.9 - 0.15 * k);
    fog.near = 6000 + alt * 2; fog.far = 60000 + alt * 22;
    updateSmoke(dt, st.flame, alt);
    // the rocket
    rocket.position.set(st.ground, alt, 0);
    rocket.rotation.z = -(st.pitch || 0) * Math.PI / 180;
    const f = st.flame || 0;
    plume.visible = f > 0.02;
    plume.scale.set(0.8 + f * 0.4 + Math.random() * 0.06, (0.6 + f * 0.8) * (1 + alt / 15000) + Math.random() * 0.08, 0.8 + f * 0.4);
    if (mode === "launchcam") {
      rocket.visible = true;
      const tgt = new THREE.Vector3(st.ground, alt + 10, 0);
      const dist = CAM_POS.distanceTo(tgt);
      camera.fov = Math.max(1.2, Math.min(40, 2 * Math.atan(38 / dist) * 180 / Math.PI));
      camera.position.copy(CAM_POS);
      if (st.shake > 0) camera.position.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, 0).multiplyScalar(st.shake * 0.12));
      camera.updateProjectionMatrix();
      A.sky.position.copy(camera.position);
      camera.lookAt(tgt);
    } else {
      rocket.visible = false;
      camera.fov = 60; camera.updateProjectionMatrix();
      const cx = st.ground, cy = alt + 19;
      camera.position.set(cx, cy, 0);
      A.sky.position.copy(camera.position);
      // look downrange, tipped down so the horizon sits in the cockpit windows
      const down = 0.2 + 0.4 * Math.min(1, alt / 20000);
      camera.lookAt(cx + Math.cos(down) * 1000, cy - Math.sin(down) * 1000, 0);
    }
    renderer.render(scene, camera);
  };

  window.Ascent = A;
})();
