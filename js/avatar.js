/* 3D 角色：主角（可換裝）、領航員小星、九種蟲；也負責產生蟲的小圖示 */
(function () {
  'use strict';
  const G = window.G;
  const T = window.THREE;
  const mats = new Map();
  function mat(color, extra) {
    const k = color + (extra ? JSON.stringify(extra) : '');
    let m = mats.get(k);
    if (!m) { m = new T.MeshStandardMaterial(Object.assign({ color, flatShading: true, roughness: 0.8, metalness: 0 }, extra || {})); mats.set(k, m); }
    return m;
  }
  const GEO = {
    box: new T.BoxGeometry(1, 1, 1),
    ball: new T.IcosahedronGeometry(1, 1),
    ball2: new T.IcosahedronGeometry(1, 2),
    cyl: new T.CylinderGeometry(1, 1, 1, 10),
    cone: new T.ConeGeometry(1, 1, 8),
    dome: new T.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    torus: new T.TorusGeometry(1, 0.18, 6, 14),
    rbox: new T.CylinderGeometry(1, 1, 1, 6),
  };
  function add(parent, geo, color, s, p, extra, r) {
    const m = new T.Mesh(geo, typeof color === 'string' ? mat(color, extra) : color);
    m.scale.set(s[0], s[1], s[2]);
    m.position.set(p[0], p[1], p[2]);
    if (r) m.rotation.set(r[0] || 0, r[1] || 0, r[2] || 0);
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  const W = () => G.store.WARDROBE;
  const shade = (c, k) => '#' + new T.Color(c).multiplyScalar(k).getHexString();

  /* ---------- 主角 ---------- */
  function makePlayer(cfg, headS) {
    const root = new T.Group();
    const body = new T.Group();
    root.add(body);
    const rig = {};
    function build(a) {
      while (body.children.length) body.remove(body.children[0]);
      const skin = W().skin[a.skin] || W().skin[1];
      const hairC = W().hairColor[a.hairColor] || W().hairColor[1];
      const oc = a.outfitColor || '#e8735a';
      const pants = a.outfit === 'suit' ? '#2f3542' : '#3d4a66';
      // 腿（以臀部為軸心擺動）
      rig.legs = [-1, 1].map((sx) => {
        const hip = new T.Group(); hip.position.set(sx * 0.1, 0.36, 0); body.add(hip);
        add(hip, GEO.box, pants, [0.15, 0.3, 0.17], [0, -0.15, 0]);
        add(hip, GEO.box, '#3b2f2a', [0.16, 0.07, 0.22], [0, -0.32, 0.025]);
        return hip;
      });
      // 身體
      const torsoC = a.outfit === 'lab' ? '#f7f7f2' : a.outfit === 'suit' ? '#2f3542' : oc;
      add(body, GEO.box, torsoC, [0.44, 0.4, 0.27], [0, 0.55, 0]);
      if (a.outfit === 'stripe') [0.46, 0.58, 0.7].forEach((y) => add(body, GEO.box, '#ffffff', [0.452, 0.04, 0.28], [0, y, 0]));
      if (a.outfit === 'hoodie') { add(body, GEO.box, shade(oc, 0.85), [0.36, 0.14, 0.08], [0, 0.72, -0.16]); add(body, GEO.box, shade(oc, 0.85), [0.18, 0.08, 0.02], [0, 0.48, 0.14]); }
      if (a.outfit === 'vest') { add(body, GEO.box, '#f4f1ea', [0.2, 0.4, 0.276], [0, 0.55, 0.002]); add(body, GEO.box, oc, [0.1, 0.06, 0.02], [0.13, 0.62, 0.14]); }
      if (a.outfit === 'lab') { add(body, GEO.box, '#f7f7f2', [0.46, 0.18, 0.29], [0, 0.32, 0]); add(body, GEO.box, oc, [0.12, 0.2, 0.02], [0, 0.6, 0.14]); }
      if (a.outfit === 'suit') { add(body, GEO.box, '#ffffff', [0.1, 0.3, 0.02], [0, 0.6, 0.137]); add(body, GEO.box, oc, [0.05, 0.22, 0.02], [0, 0.58, 0.148]); }
      // 手臂（以肩膀為軸心）
      const armC = a.outfit === 'lab' ? '#f7f7f2' : torsoC;
      rig.arms = [-1, 1].map((sx) => {
        const sh = new T.Group(); sh.position.set(sx * 0.28, 0.72, 0); body.add(sh);
        add(sh, GEO.box, armC, [0.12, 0.3, 0.13], [0, -0.15, 0]);
        add(sh, GEO.ball, skin, [0.07, 0.07, 0.07], [0, -0.33, 0]);
        return sh;
      });
      // 頭
      const head = new T.Group(); head.position.set(0, 1.02, 0); body.add(head); rig.head = head;
      add(head, GEO.ball2, skin, [0.31, 0.29, 0.29], [0, 0, 0]);
      add(head, GEO.ball, '#2b2522', [0.035, 0.045, 0.02], [-0.1, 0.0, 0.27]);
      add(head, GEO.ball, '#2b2522', [0.035, 0.045, 0.02], [0.1, 0.0, 0.27]);
      add(head, GEO.ball, '#f2a3a3', [0.05, 0.025, 0.02], [-0.17, -0.07, 0.24], { roughness: 1 });
      add(head, GEO.ball, '#f2a3a3', [0.05, 0.025, 0.02], [0.17, -0.07, 0.24], { roughness: 1 });
      add(head, GEO.box, '#b5655b', [0.06, 0.015, 0.01], [0, -0.1, 0.285]);
      // 頭髮
      const hs = a.hair;
      if (hs !== 'bald') add(head, GEO.dome, hairC, [0.33, 0.3, 0.32], [0, 0.03, -0.01]);
      if (hs === 'short' || hs === 'side') add(head, GEO.box, hairC, [0.5, 0.1, 0.12], [hs === 'side' ? 0.06 : 0, 0.17, 0.22], null, [0.35, 0, hs === 'side' ? -0.25 : 0]);
      if (hs === 'bob') { add(head, GEO.box, hairC, [0.14, 0.32, 0.3], [-0.27, -0.03, -0.02]); add(head, GEO.box, hairC, [0.14, 0.32, 0.3], [0.27, -0.03, -0.02]); add(head, GEO.box, hairC, [0.56, 0.1, 0.1], [0, 0.17, 0.23], null, [0.3, 0, 0]); }
      if (hs === 'long') { add(head, GEO.box, hairC, [0.6, 0.62, 0.16], [0, -0.17, -0.2]); add(head, GEO.box, hairC, [0.12, 0.42, 0.24], [-0.28, -0.1, 0]); add(head, GEO.box, hairC, [0.12, 0.42, 0.24], [0.28, -0.1, 0]); }
      if (hs === 'bun') { add(head, GEO.ball, hairC, [0.13, 0.13, 0.13], [0, 0.33, -0.08]); add(head, GEO.box, hairC, [0.5, 0.08, 0.1], [0, 0.18, 0.23], null, [0.3, 0, 0]); }
      if (hs === 'pony') { add(head, GEO.ball, hairC, [0.1, 0.1, 0.1], [0, 0.12, -0.3]); add(head, GEO.box, hairC, [0.1, 0.34, 0.1], [0, -0.1, -0.36], null, [-0.25, 0, 0]); }
      if (hs === 'spiky') for (let i = 0; i < 7; i++) { const ang = (i / 7) * Math.PI * 2; add(head, GEO.cone, hairC, [0.08, 0.2, 0.08], [Math.cos(ang) * 0.18, 0.27, Math.sin(ang) * 0.16], null, [Math.sin(ang) * 0.5, 0, -Math.cos(ang) * 0.5]); }
      // 帽子
      if (a.hat === 'beanie') { add(head, GEO.dome, oc, [0.34, 0.3, 0.34], [0, 0.07, 0]); add(head, GEO.cyl, '#f4f1ea', [0.345, 0.07, 0.345], [0, 0.08, 0]); add(head, GEO.ball, '#f4f1ea', [0.07, 0.07, 0.07], [0, 0.4, 0]); }
      if (a.hat === 'cap') { add(head, GEO.dome, oc, [0.335, 0.27, 0.335], [0, 0.07, 0]); add(head, GEO.cyl, oc, [0.2, 0.025, 0.2], [0, 0.08, 0.28]); }
      if (a.hat === 'straw') { add(head, GEO.cyl, '#e8c766', [0.55, 0.03, 0.55], [0, 0.13, 0]); add(head, GEO.cyl, '#e8c766', [0.27, 0.16, 0.27], [0, 0.22, 0]); add(head, GEO.cyl, '#c0392b', [0.275, 0.04, 0.275], [0, 0.17, 0]); }
      if (a.hat === 'grad') { add(head, GEO.cyl, '#2f3542', [0.27, 0.12, 0.27], [0, 0.22, 0]); add(head, GEO.box, '#2f3542', [0.6, 0.03, 0.6], [0, 0.29, 0], null, [0, Math.PI / 4, 0]); add(head, GEO.box, '#f2c94c', [0.02, 0.18, 0.02], [0.24, 0.2, 0.1]); }
      if (a.hat === 'crown') { add(head, GEO.cyl, '#f2c94c', [0.24, 0.12, 0.24], [0, 0.32, 0], { metalness: 0.3, roughness: 0.4 }); for (let i = 0; i < 5; i++) { const ang = (i / 5) * Math.PI * 2; add(head, GEO.cone, '#f2c94c', [0.05, 0.1, 0.05], [Math.cos(ang) * 0.22, 0.42, Math.sin(ang) * 0.22], { metalness: 0.3, roughness: 0.4 }); } add(head, GEO.ball, '#e74c3c', [0.04, 0.04, 0.04], [0, 0.33, 0.24]); }
      // 配件
      if (a.acc === 'glasses') { [-0.1, 0.1].forEach((x) => add(head, GEO.torus, '#2b2522', [0.07, 0.07, 0.07], [x, 0.0, 0.29])); add(head, GEO.box, '#2b2522', [0.06, 0.012, 0.012], [0, 0.0, 0.29]); }
      if (a.acc === 'headphones') { add(head, GEO.torus, '#2b2b2b', [0.33, 0.33, 0.33], [0, 0.05, 0], null, [0, Math.PI / 2, 0]); [-1, 1].forEach((s) => add(head, GEO.cyl, '#e74c3c', [0.08, 0.06, 0.08], [s * 0.31, 0.0, 0], null, [0, 0, Math.PI / 2])); }
      if (a.acc === 'scarf') { add(body, GEO.torus, '#c0392b', [0.2, 0.2, 0.32], [0, 0.78, 0], null, [Math.PI / 2, 0, 0]); add(body, GEO.box, '#c0392b', [0.09, 0.22, 0.04], [0.1, 0.66, 0.15]); }
      if (a.acc === 'backpack') { add(body, GEO.box, '#e67e22', [0.34, 0.36, 0.16], [0, 0.56, -0.2]); add(body, GEO.box, '#d35400', [0.26, 0.12, 0.05], [0, 0.48, -0.29]); }
      if (a.acc === 'badge') { add(body, GEO.box, '#ffffff', [0.11, 0.08, 0.02], [0.12, 0.62, 0.145]); add(body, GEO.box, '#4fa6e0', [0.11, 0.025, 0.021], [0.12, 0.65, 0.146]); }
      applyHead();
    }
    // 頭的大小：學越多頭越大（由 store.headScale() 決定）。往上墊高，讓下巴停在脖子上、不會陷進身體
    let headScale = headS || 1;
    function applyHead() {
      if (!rig.head) return;
      rig.head.scale.setScalar(headScale);
      rig.head.position.y = 1.02 + 0.27 * (headScale - 1);
    }
    build(Object.assign({}, G.store.DEFAULT_AVATAR, cfg || {}));
    // 腳下的影子圈（陰影貼圖之外，讓位置更清楚）
    const shadow = new T.Mesh(new T.CircleGeometry(0.32, 16).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.18, depthWrite: false }));
    shadow.position.y = 0.02; root.add(shadow);
    let ph = 0;
    return {
      group: root,
      setLook(a) { build(Object.assign({}, G.store.DEFAULT_AVATAR, a || {})); },
      setHead(s) { headScale = s || 1; applyHead(); },
      headScale() { return headScale; },
      animate(dt, speed) {
        const moving = speed > 0.2;
        ph += dt * (moving ? 6 + speed * 1.2 : 2);
        const sw = moving ? Math.sin(ph) * Math.min(0.75, 0.25 + speed * 0.08) : 0;
        if (rig.legs) { rig.legs[0].rotation.x = sw; rig.legs[1].rotation.x = -sw; }
        if (rig.arms) { rig.arms[0].rotation.x = -sw * 0.8; rig.arms[1].rotation.x = sw * 0.8; rig.arms[0].rotation.z = 0.08; rig.arms[1].rotation.z = -0.08; }
        body.position.y = moving ? Math.abs(Math.sin(ph)) * 0.05 : Math.sin(ph) * 0.012;
      },
      wave(t) { if (rig.arms) { rig.arms[1].rotation.z = -2.4 + Math.sin(t * 10) * 0.35; rig.arms[1].rotation.x = 0; } },
    };
  }

  /* ---------- 領航員小星（原創的小機器人） ---------- */
  function makeGuide() {
    const root = new T.Group();
    const body = new T.Group(); root.add(body);
    add(body, GEO.cyl, '#5bc0be', [0.22, 0.08, 0.22], [0, 0.05, 0], { emissive: '#5bc0be', emissiveIntensity: 0.35 });
    add(body, GEO.ball2, '#f4f1ea', [0.36, 0.4, 0.34], [0, 0.55, 0]);
    add(body, GEO.cyl, '#3a86ff', [0.365, 0.07, 0.345], [0, 0.42, 0]);
    add(body, GEO.box, '#24324a', [0.42, 0.26, 0.05], [0, 0.66, 0.3], { roughness: 0.4 });
    const eyeM = mat('#7cf5ff', { emissive: '#7cf5ff', emissiveIntensity: 1.2 });
    const eyes = [-0.09, 0.09].map((x) => add(body, GEO.ball, eyeM, [0.04, 0.055, 0.02], [x, 0.69, 0.33]));
    add(body, GEO.box, mat('#7cf5ff', { emissive: '#7cf5ff', emissiveIntensity: 1.0 }), [0.08, 0.015, 0.01], [0, 0.6, 0.33]);
    [-1, 1].forEach((s) => add(body, GEO.ball, '#3a86ff', [0.09, 0.09, 0.09], [s * 0.37, 0.52, 0]));
    add(body, GEO.cyl, '#5b6474', [0.015, 0.2, 0.015], [0, 1.02, 0]);
    const star = add(body, new T.OctahedronGeometry(1), '#ffd54a', [0.08, 0.08, 0.08], [0, 1.16, 0], { emissive: '#ffb300', emissiveIntensity: 0.9, roughness: 0.3 });
    let t = Math.random() * 6;
    return {
      group: root,
      animate(dt, talking) {
        t += dt;
        body.position.y = 0.12 + Math.sin(t * 2.2) * 0.06;
        star.rotation.y += dt * 2;
        const blink = (t % 3.4) < 0.12 ? 0.15 : 1;
        eyes.forEach((e) => { e.scale.y = 0.055 * blink; });
        body.rotation.z = talking ? Math.sin(t * 9) * 0.05 : 0;
      },
    };
  }

  /* ---------- 蟲 ---------- */
  function makeBug(type) {
    const def = G.store.bug(type) || G.store.BUGS[0];
    const c = def.color;
    const g = new T.Group();
    const dark = shade(c, 0.55);
    const legs = (n, len, y, spread) => {
      for (let i = 0; i < n; i++) {
        const z = ((i / Math.max(1, n - 1)) - 0.5) * spread;
        [-1, 1].forEach((s) => add(g, GEO.box, '#2b2522', [len, 0.012, 0.012], [s * len * 0.5, y, z], null, [0, 0, s * 0.35]));
      }
    };
    switch (type) {
      case 'hopper':
        add(g, GEO.ball, c, [0.07, 0.06, 0.16], [0, 0.07, 0]); add(g, GEO.ball, c, [0.055, 0.055, 0.055], [0, 0.09, 0.15]);
        [-1, 1].forEach((s) => add(g, GEO.box, dark, [0.015, 0.1, 0.015], [s * 0.07, 0.1, -0.06], null, [0.9, 0, 0])); legs(2, 0.12, 0.04, 0.12); break;
      case 'beetle':
        add(g, GEO.dome, c, [0.12, 0.1, 0.14], [0, 0.03, 0]); add(g, GEO.box, '#2b2522', [0.005, 0.1, 0.27], [0, 0.07, 0]);
        add(g, GEO.ball, '#2b2522', [0.06, 0.05, 0.05], [0, 0.05, 0.15]); [[-0.05, 0.04], [0.05, -0.03], [-0.04, -0.07]].forEach(([x, z]) => add(g, GEO.ball, '#2b2522', [0.02, 0.01, 0.02], [x, 0.12, z])); legs(3, 0.11, 0.03, 0.16); break;
      case 'firefly':
        add(g, GEO.ball, '#3b3b3b', [0.05, 0.05, 0.1], [0, 0.08, 0.04]); add(g, GEO.ball, c, [0.06, 0.06, 0.08], [0, 0.07, -0.09], { emissive: c, emissiveIntensity: 1.4 });
        [-1, 1].forEach((s) => add(g, GEO.ball, '#ffffff', [0.08, 0.008, 0.04], [s * 0.07, 0.13, 0.02], { transparent: true, opacity: 0.6 })); break;
      case 'spider':
        add(g, GEO.ball, c, [0.09, 0.08, 0.1], [0, 0.08, -0.05]); add(g, GEO.ball, c, [0.055, 0.05, 0.055], [0, 0.07, 0.07]);
        add(g, GEO.ball, '#e74c3c', [0.012, 0.012, 0.012], [-0.02, 0.09, 0.12]); add(g, GEO.ball, '#e74c3c', [0.012, 0.012, 0.012], [0.02, 0.09, 0.12]); legs(4, 0.16, 0.06, 0.16); break;
      case 'ant':
        [[-0.09, 0.045], [0, 0.035], [0.08, 0.045]].forEach(([z, s]) => add(g, GEO.ball, c, [s, s, s * 1.2], [0, 0.06, z]));
        [-1, 1].forEach((s) => add(g, GEO.box, dark, [0.01, 0.07, 0.01], [s * 0.025, 0.11, 0.11], null, [0.6, 0, s * 0.4])); legs(3, 0.1, 0.04, 0.08); break;
      case 'centipede':
        for (let i = 0; i < 7; i++) { add(g, GEO.ball, i ? c : dark, [0.04, 0.035, 0.04], [Math.sin(i * 0.9) * 0.02, 0.045, 0.12 - i * 0.045]); [-1, 1].forEach((s) => add(g, GEO.box, '#2b2522', [0.05, 0.008, 0.008], [s * 0.04, 0.02, 0.12 - i * 0.045])); } break;
      case 'cicada':
        add(g, GEO.ball, c, [0.06, 0.055, 0.12], [0, 0.07, 0]); add(g, GEO.ball, dark, [0.06, 0.045, 0.045], [0, 0.08, 0.11]);
        [-1, 1].forEach((s) => add(g, GEO.box, '#dff6ff', [0.08, 0.006, 0.17], [s * 0.05, 0.12, -0.03], { transparent: true, opacity: 0.55 }, [0, s * 0.15, s * 0.1])); legs(2, 0.09, 0.03, 0.1); break;
      case 'snail':
        add(g, GEO.box, '#e6d3b3', [0.06, 0.035, 0.22], [0, 0.02, 0.02]); add(g, GEO.torus, c, [0.075, 0.075, 0.1], [0, 0.11, -0.02], null, [0, Math.PI / 2, 0]); add(g, GEO.ball, shade(c, 0.8), [0.06, 0.06, 0.06], [0, 0.11, -0.02]);
        [-1, 1].forEach((s) => add(g, GEO.box, '#e6d3b3', [0.008, 0.07, 0.008], [s * 0.02, 0.06, 0.12], null, [0.3, 0, s * 0.3])); break;
      default: // mosquito
        add(g, GEO.ball, c, [0.025, 0.025, 0.11], [0, 0.1, 0]); add(g, GEO.ball, dark, [0.03, 0.03, 0.03], [0, 0.11, 0.08]); add(g, GEO.box, '#2b2522', [0.006, 0.006, 0.07], [0, 0.1, 0.13]);
        [-1, 1].forEach((s) => add(g, GEO.box, '#eef7ff', [0.11, 0.004, 0.035], [s * 0.06, 0.13, 0.01], { transparent: true, opacity: 0.6 })); legs(3, 0.12, 0.08, 0.06);
    }
    return g;
  }

  /* ---------- 小圖示（用一個共用的小 renderer 拍照） ---------- */
  let snapR = null, snapS = null, snapC = null;
  const iconCache = {};
  function snap(obj, camPos, look, size) {
    try {
      if (!snapR) {
        snapR = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        snapR.setPixelRatio(1);
        snapS = new T.Scene();
        snapS.add(new T.HemisphereLight('#ffffff', '#b9a98f', 1.0));
        const d = new T.DirectionalLight('#ffffff', 0.9); d.position.set(2, 4, 3); snapS.add(d);
        snapC = new T.PerspectiveCamera(30, 1, 0.01, 50);
      }
      snapR.setSize(size, size, false);
      snapS.add(obj);
      snapC.position.set(camPos[0], camPos[1], camPos[2]); snapC.lookAt(look[0], look[1], look[2]);
      snapR.setClearColor(0x000000, 0);
      snapR.render(snapS, snapC);
      const url = snapR.domElement.toDataURL('image/png');
      snapS.remove(obj);
      return url;
    } catch (e) { return ''; }
  }
  function bugIcon(type) {
    if (iconCache[type] == null) iconCache[type] = snap(makeBug(type), [0.32, 0.36, 0.42], [0, 0.06, 0], 128);
    return iconCache[type];
  }
  function playerIcon(a, headS) {
    const s = headS || 1, up = 0.3 * (s - 1);          // 頭變大時，鏡頭跟著往上、往後一點，才拍得到整顆頭
    return snap(makePlayer(a, s).group, [0, 1.15 + up, 1.6 * (0.75 + 0.25 * s)], [0, 0.95 + up, 0], 128);
  }
  function guideIcon() { if (iconCache._guide == null) iconCache._guide = snap(makeGuide().group, [0.15, 0.9, 1.55], [0, 0.66, 0], 128); return iconCache._guide; }

  G.avatar = { makePlayer, makeGuide, makeBug, bugIcon, playerIcon, guideIcon, mat, GEO };
})();
