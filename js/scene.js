/* Mission: Beyond Earth — 3D scene (three.js r128).
 * Scene units: 1 = Earth's radius. The launch plane passes through Kourou, heading east.
 */
(function () {
  "use strict";
  const R_M = 6371000;
  const SITE = { lat: 5.24, lon: -52.77 }; // Guiana Space Centre, Kourou

  function latLonToVec(lat, lon) {
    const la = lat * Math.PI / 180, lo = (lon + 180) * Math.PI / 180;
    return new THREE.Vector3(-Math.cos(lo) * Math.cos(la), Math.sin(la), Math.sin(lo) * Math.cos(la));
  }
  function eastAt(lon) {
    const lo = (lon + 180) * Math.PI / 180;
    return new THREE.Vector3(Math.sin(lo), 0, Math.cos(lo)).normalize();
  }

  const UP0 = latLonToVec(SITE.lat, SITE.lon).normalize();
  const EAST0 = eastAt(SITE.lon);
  // make EAST0 exactly perpendicular to UP0
  EAST0.sub(UP0.clone().multiplyScalar(EAST0.dot(UP0))).normalize();
  const SUN = UP0.clone().multiplyScalar(0.55).add(EAST0.clone().multiplyScalar(0.8)).add(new THREE.Vector3(0, 0.25, 0)).normalize();

  /** 2D flight-plane coordinates (metres) to a scene position. */
  function planeToWorld(x, y, out) {
    out = out || new THREE.Vector3();
    return out.copy(EAST0).multiplyScalar(x / R_M).addScaledVector(UP0, y / R_M);
  }

  const S = {};

  S.init = function (container) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    if (window.Ascent) Ascent.init(renderer);
    if (window.Cockpit) Cockpit.init();
    const haze = document.createElement("div");
    haze.style.cssText = "position:absolute;inset:0;pointer-events:none;background:#6f95c4;opacity:0";
    container.appendChild(haze);
    const SWITCH = 26000;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 1e-7, 2000);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 1.05; controls.maxDistance = 30;
    controls.enabled = false;

    const loader = new THREE.TextureLoader();
    const tex = (f) => { const t = loader.load("assets/textures/" + f); t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t; };
    const day = tex("earth_day_4k.jpg"), night = tex("earth_night.png"), spec = tex("earth_specular.jpg"), cloudsTex = tex("earth_clouds.png");

    const LOGV = "#include <common>\n#include <logdepthbuf_pars_vertex>\n";
    const LOGF = "#include <logdepthbuf_pars_fragment>\n";

    // Earth
    const earthMat = new THREE.ShaderMaterial({
      uniforms: { dayMap: { value: day }, nightMap: { value: night }, specMap: { value: spec }, sunDir: { value: SUN } },
      vertexShader: LOGV + `varying vec2 vUv; varying vec3 vN; varying vec3 vW;
        void main(){ vUv=uv; vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz;
        gl_Position=projectionMatrix*viewMatrix*w;
        #include <logdepthbuf_vertex>
        }`,
      fragmentShader: LOGF + `uniform sampler2D dayMap; uniform sampler2D nightMap; uniform sampler2D specMap; uniform vec3 sunDir;
        varying vec2 vUv; varying vec3 vN; varying vec3 vW;
        void main(){
          #include <logdepthbuf_fragment>
          vec3 n=normalize(vN); float d=dot(n,sunDir); vec3 v=normalize(cameraPosition-vW);
          vec3 dayC=pow(texture2D(dayMap,vUv).rgb,vec3(2.2));
          vec3 nightC=pow(texture2D(nightMap,vUv).rgb,vec3(2.2));
          float water=texture2D(specMap,vUv).r;
          float dayAmt=smoothstep(-0.12,0.2,d);
          vec3 c=dayC*(0.04+1.35*max(d,0.0));
          vec3 hv=normalize(sunDir+v); c+=vec3(1.0,0.9,0.75)*pow(max(dot(n,hv),0.0),140.0)*water*0.45*max(d,0.0);
          c=mix(nightC*vec3(1.0,0.72,0.42)*2.2,c,dayAmt);
          c+=vec3(1.0,0.4,0.15)*exp(-pow(d*5.0,2.0))*0.05;
          c+=vec3(0.3,0.55,1.0)*pow(1.0-max(dot(n,v),0.0),3.0)*0.6*smoothstep(-0.2,0.4,d);
          gl_FragColor=vec4(pow(c,vec3(1.0/2.2)),1.0);
        }`,
    });
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 128), earthMat);
    scene.add(earth);

    const cloudMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { map: { value: cloudsTex }, sunDir: { value: SUN } },
      vertexShader: LOGV + `varying vec2 vUv; varying vec3 vN; void main(){ vUv=uv; vN=normalize(mat3(modelMatrix)*normal);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
        #include <logdepthbuf_vertex>
        }`,
      fragmentShader: LOGF + `uniform sampler2D map; uniform vec3 sunDir; varying vec2 vUv; varying vec3 vN;
        void main(){
          #include <logdepthbuf_fragment>
          vec4 t=texture2D(map,vUv); float a=t.a<0.99?t.a:dot(t.rgb,vec3(0.333));
          float d=dot(normalize(vN),sunDir);
          gl_FragColor=vec4(vec3(0.06+1.0*max(d,0.0)),a*0.85*mix(0.08,1.0,smoothstep(-0.15,0.3,d)));
        }`,
    });
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.0016, 160, 100), cloudMat);
    scene.add(clouds);

    const atmoMat = new THREE.ShaderMaterial({
      transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
      uniforms: { sunDir: { value: SUN }, fade: { value: 1 } },
      vertexShader: LOGV + `varying vec3 vN; varying vec3 vW; void main(){ vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz;
        gl_Position=projectionMatrix*viewMatrix*w;
        #include <logdepthbuf_vertex>
        }`,
      fragmentShader: LOGF + `uniform vec3 sunDir; uniform float fade; varying vec3 vN; varying vec3 vW;
        void main(){
          #include <logdepthbuf_fragment>
          vec3 v=normalize(cameraPosition-vW); vec3 n=normalize(vN);
          float i=pow(clamp(0.75+dot(v,n),0.0,1.0),5.0);
          float s=smoothstep(-0.4,0.5,dot(n,sunDir));
          gl_FragColor=vec4(mix(vec3(0.25,0.5,1.0),vec3(0.55,0.8,1.0),s)*i*(0.1+1.5*s)*fade,1.0);
        }`,
    });
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.025, 128, 96), atmoMat);
    scene.add(atmo);

    // stars
    const N = 7000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(900);
      pos.set([v.x, v.y, v.z], i * 3);
      const b = 0.4 + Math.pow(Math.random(), 4) * 1.2, t = Math.random();
      const c = t < 0.15 ? [1, 0.82, 0.65] : t < 0.35 ? [0.75, 0.85, 1] : [1, 1, 1];
      col.set([c[0] * b, c[1] * b, c[2] * b], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    sg.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const starMat = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false });
    const stars = new THREE.Points(sg, starMat);
    scene.add(stars);

    // sun glow
    const glowCanvas = document.createElement("canvas"); glowCanvas.width = glowCanvas.height = 128;
    const gx = glowCanvas.getContext("2d"), gr = gx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.15, "rgba(255,245,220,0.9)"); gr.addColorStop(0.4, "rgba(255,200,120,0.25)"); gr.addColorStop(1, "rgba(255,160,60,0)");
    gx.fillStyle = gr; gx.fillRect(0, 0, 128, 128);
    const glowTex = new THREE.CanvasTexture(glowCanvas);
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    sun.position.copy(SUN).multiplyScalar(800); sun.scale.setScalar(90); scene.add(sun);

    // rocket marker for the tracking view
    const rocket = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 16), new THREE.MeshBasicMaterial({ color: 0xe9edf2 }));
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 16), new THREE.MeshBasicMaterial({ color: 0xffb300 }));
    nose.position.y = 0.675; rocket.add(body, nose);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    flame.position.y = -0.75; flame.scale.set(0.7, 1.2, 1); rocket.add(flame);
    const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x00d4ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    rocket.add(marker); marker.scale.setScalar(1.6);
    scene.add(rocket);

    // trail
    const TMAX = 6000, tpos = new Float32Array(TMAX * 3);
    const tg = new THREE.BufferGeometry(); tg.setAttribute("position", new THREE.BufferAttribute(tpos, 3)); tg.setDrawRange(0, 0);
    const trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.9 }));
    trail.frustumCulled = false; scene.add(trail);
    let tn = 0, lastTrail = null;

    // target orbit ring (shown in tracking view)
    let ring = null;
    function setTargetOrbit(altM) {
      if (ring) scene.remove(ring);
      const r = 1 + altM / R_M, pts = [];
      for (let i = 0; i <= 256; i++) { const a = i / 256 * Math.PI * 2; pts.push(EAST0.clone().multiplyScalar(Math.sin(a) * r).addScaledVector(UP0, Math.cos(a) * r)); }
      ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0xffb300, dashSize: 0.02, gapSize: 0.02, transparent: true, opacity: 0.6 }));
      ring.computeLineDistances(); scene.add(ring);
    }

    const sky = new THREE.Color();
    const SKY_LOW = new THREE.Color(0x5d9fe0), SKY_MID = new THREE.Color(0x0a2552), SKY_SPACE = new THREE.Color(0x000000);
    let view = "cockpit";

    const st = { pos: new THREE.Vector3(), up: new THREE.Vector3(), east: new THREE.Vector3(), alt: 0, ground: 0, pitch: 0, flame: 0, shake: 0 };

    S.setView = function (v) {
      view = v; controls.enabled = v === "tracking"; rocket.visible = v === "tracking";
      if (v === "tracking") {
        camera.up.set(0, 1, 0);
        const d = Math.max(0.35, (1 + st.alt / R_M) * 0.9);
        camera.position.copy(st.pos).addScaledVector(st.up, d * 0.8).addScaledVector(st.east, -d * 1.4).addScaledVector(new THREE.Vector3().crossVectors(st.up, st.east), d * 0.9);
        controls.target.set(0, 0, 0); controls.update();
      }
    };
    S.getView = () => view;
    S.setTargetOrbit = setTargetOrbit;

    S.update = function (s, info) {
      planeToWorld(s.x, s.y, st.pos);
      st.up.copy(st.pos).normalize();
      // local downrange direction in the launch plane
      const r = Math.hypot(s.x, s.y), ex = s.y / r, ey = -s.x / r;
      st.east.copy(EAST0).multiplyScalar(ex).addScaledVector(UP0, ey).normalize();
      st.alt = r - R_M; st.ground = R_M * Math.atan2(s.x, s.y); st.pitch = s.pitch; st.flame = info.flame; st.shake = info.shake || 0;
      if (info.trail) {
        if (!lastTrail || lastTrail.distanceTo(st.pos) > 0.0004) {
          if (tn >= TMAX) { tpos.copyWithin(0, 3); tn = TMAX - 1; }
          tpos.set([st.pos.x, st.pos.y, st.pos.z], tn * 3); tn++;
          tg.attributes.position.needsUpdate = true; tg.setDrawRange(0, tn);
          lastTrail = st.pos.clone();
        }
      }
    };
    S.resetTrail = function () { tn = 0; lastTrail = null; tg.setDrawRange(0, 0); if (window.Ascent) Ascent.reset(); };

    S.pick = function (ndcX, ndcY) { return view === "cockpit" && window.Cockpit ? Cockpit.pick(ndcX, ndcY) : null; };

    S.render = function (dt) {
      const alt = st.alt, aspect = container.clientWidth / container.clientHeight;
      dt = dt || 0.016;
      const outside = view !== "tracking";
      haze.style.opacity = outside ? Math.max(0, 1 - Math.abs(alt - SWITCH) / 1800) * 0.9 : 0;
      if (outside && alt < SWITCH && window.Ascent) {
        Ascent.render(renderer, st, aspect, dt, view);
      } else {
        renderEarth(outside);
      }
      if (view === "cockpit" && window.Cockpit) Cockpit.render(renderer, aspect, dt, st.shake);
    };

    function renderEarth(outside) {
      const alt = st.alt;
      // sky colour by altitude
      const k1 = Math.min(1, Math.max(0, alt / 25000)), k2 = Math.min(1, Math.max(0, (alt - 25000) / 50000));
      sky.copy(SKY_LOW).lerp(SKY_MID, k1).lerp(SKY_SPACE, k2);
      if (outside) {
        scene.background = sky;
        if (ring) ring.visible = false;
        starMat.opacity = Math.min(1, Math.max(0, (alt - 30000) / 40000));
        atmoMat.uniforms.fade.value = Math.min(1, Math.max(0, (alt - 70000) / 60000));
        // camera at the rocket, looking downrange and down toward the horizon
        const dip = Math.acos(Math.min(1, 1 / (1 + Math.max(0, alt) / R_M)));
        const look = 0.14 + dip * 0.9 + 0.26 * Math.min(1, Math.max(0, alt) / 40000);
        const dir = st.east.clone().multiplyScalar(Math.cos(look)).addScaledVector(st.up, -Math.sin(look)).normalize();
        camera.position.copy(st.pos).addScaledVector(st.up, 30 / R_M);
        if (st.shake > 0) camera.position.add(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(st.shake * 4e-7));
        camera.up.copy(st.up);
        camera.lookAt(camera.position.clone().add(dir));
        camera.near = 1e-7;
      } else {
        scene.background = SKY_SPACE;
        if (ring) ring.visible = true;
        starMat.opacity = 1; atmoMat.uniforms.fade.value = 1;
        controls.update();
        camera.near = 1e-4;
        // rocket marker
        rocket.position.copy(st.pos);
        const p = st.pitch * Math.PI / 180;
        const nose = st.up.clone().multiplyScalar(Math.cos(p)).addScaledVector(st.east, Math.sin(p));
        rocket.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), nose);
        const sc = camera.position.distanceTo(st.pos) * 0.03;
        rocket.scale.setScalar(sc);
        flame.visible = st.flame > 0.02; flame.scale.set(0.7, 0.6 + 1.2 * st.flame, 1);
      }
      camera.updateProjectionMatrix();
      clouds.rotation.y += 0.00002;
      renderer.render(scene, camera);
    }

    function resize() {
      camera.aspect = container.clientWidth / container.clientHeight; camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    }
    window.addEventListener("resize", resize);
    S.setView("cockpit");
  };

  window.Scene = S;
})();
