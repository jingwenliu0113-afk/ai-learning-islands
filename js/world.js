/* 3D 世界：十座島（我的小島加九座領域島）、地點、主角移動與碰撞、跟隨鏡頭、渡船、晝夜、雜草、蟲、場景標籤 */
(function () {
  'use strict';
  const G = window.G;
  const T = window.THREE;
  const store = G.store;
  const RING = 100;          // 領域島中心到世界中心的距離
  const BS = 3.2;            // 概念建築的放大倍率
  const PLAZA = 2.1;         // 每個地點廣場的半徑

  let renderer, scene, camera, raycaster, canvas, stage, labelLayer, fadeEl;
  let hemi, sun, water, waterBase, lampMat, glowRing;
  const islands = [];
  const islandById = {};
  const clouds = [], spinners = [], anims = [], particles = [];
  let player, guide, boat;
  let W = 1, H = 1;
  let night = 0, nightGoal = 0, dusk = 0;
  let showLabels = true;

  // 鏡頭：跟隨目標的球座標（pol 是和垂直線的夾角）
  const cam = { tx: 0, tz: 0, ty: 0, dist: 14, az: 0, pol: 0.86 };
  let camFocus = null;       // 上課時鏡頭暫時看別的地方
  let camExtra = 0;          // 坐船時額外拉遠的距離（平滑變化）
  let dragging = false;      // 玩家正在拖曳轉鏡頭（這時坐船不自動轉向）
  let azGoal = null;         // 靠岸後鏡頭要平滑轉到的角度
  const P = { x: 0, z: 0, facing: 0, speed: 0, island: null, target: null, path: [], onArrive: null, stuck: 0, mode: 'walk' };
  const keys = new Set();
  const joy = { on: false, x: 0, y: 0 };   // 觸控搖桿：x 往右為正、y 往下（往後退）為正，長度 0–1
  let sail = null;           // 正在搭船
  let guideState = { lesson: null, talking: 0 };
  let bubbleTimer = null;
  let lastSave = 0;

  /* ---------- 小工具 ---------- */
  const mats = new Map();
  function mat(color, extra) {
    const k = color + (extra ? JSON.stringify(extra) : '');
    let m = mats.get(k);
    if (!m) { m = new T.MeshStandardMaterial(Object.assign({ color, flatShading: true, roughness: 0.88, metalness: 0 }, extra || {})); mats.set(k, m); }
    return m;
  }
  function tint(a, b, t) { return '#' + new T.Color(a).lerp(new T.Color(b), t).getHexString(); }
  function rng(seed) { let s = (seed * 9301 + 49297) % 233280; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }
  const GEO = {};
  function makeGeos() {
    GEO.box = new T.BoxGeometry(1, 1, 1);
    GEO.cone4 = new T.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4);
    GEO.cone6 = new T.ConeGeometry(1, 1, 6);
    GEO.cone8 = new T.ConeGeometry(1, 1, 8);
    GEO.cyl = new T.CylinderGeometry(1, 1, 1, 8);
    GEO.cyl16 = new T.CylinderGeometry(1, 1, 1, 24);
    GEO.ball = new T.IcosahedronGeometry(1, 1);
    GEO.rock = new T.IcosahedronGeometry(1, 0);
    GEO.dome = new T.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    GEO.octa = new T.OctahedronGeometry(1);
    GEO.stone = new T.CylinderGeometry(0.42, 0.46, 0.06, 6);
    GEO.blade = new T.ConeGeometry(0.05, 0.36, 3);
  }
  function part(g, geo, color, sx, sy, sz, x, y, z, extra) {
    const m = new T.Mesh(geo, typeof color === 'string' ? mat(color, extra) : color);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  }
  function lamp(g, x, y, z, s) { const m = new T.Mesh(GEO.ball, lampMat); m.scale.setScalar(s || 0.035); m.position.set(x, y, z); g.add(m); return m; }

  /* ---------- 建築（沿用 1.0：木牌 → 鷹架 → 小屋 → 領域地標） ---------- */
  function makeBuilding(style, level, color) {
    const g = new T.Group();
    const Pp = (geo, col, sx, sy, sz, x, y, z, extra) => part(g, geo, col, sx, sy, sz, x, y, z, extra);
    if (level === 0) {
      Pp(GEO.box, '#8a6a45', 0.03, 0.2, 0.03, 0, 0.1, 0);
      Pp(GEO.box, '#eadbb8', 0.18, 0.1, 0.025, 0, 0.2, 0.005);
      return g;
    }
    if (level === 1) {
      Pp(GEO.box, '#cbc4b8', 0.3, 0.05, 0.3, 0, 0.025, 0);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => Pp(GEO.box, '#a98b62', 0.025, 0.24, 0.025, a * 0.125, 0.17, b * 0.125));
      Pp(GEO.box, '#a98b62', 0.28, 0.022, 0.025, 0, 0.28, -0.125);
      Pp(GEO.box, '#a98b62', 0.025, 0.022, 0.28, 0.125, 0.28, 0);
      Pp(GEO.box, color, 0.11, 0.1, 0.11, -0.03, 0.1, 0.02);
      return g;
    }
    if (level === 2) {
      Pp(GEO.box, '#f6efe2', 0.26, 0.18, 0.26, 0, 0.09, 0);
      Pp(GEO.cone4, color, 0.215, 0.14, 0.215, 0, 0.25, 0);
      Pp(GEO.box, '#7a5b3d', 0.06, 0.1, 0.02, 0, 0.05, 0.131);
      const w = new T.Mesh(GEO.box, lampMat); w.scale.set(0.05, 0.05, 0.02); w.position.set(0.08, 0.11, 0.131); g.add(w);
      return g;
    }
    switch (style) {
      case 'forest':
        Pp(GEO.cyl, '#8a6a45', 0.045, 0.2, 0.045, 0, 0.1, 0);
        Pp(GEO.cone6, tint(color, '#1f5d33', 0.45), 0.21, 0.24, 0.21, 0, 0.3, 0);
        Pp(GEO.cone6, color, 0.165, 0.2, 0.165, 0, 0.45, 0);
        Pp(GEO.cone6, tint(color, '#ffffff', 0.3), 0.115, 0.18, 0.115, 0, 0.59, 0);
        Pp(GEO.box, '#f6efe2', 0.12, 0.1, 0.12, 0.15, 0.05, 0.1);
        Pp(GEO.cone4, '#c8553d', 0.105, 0.07, 0.105, 0.15, 0.135, 0.1);
        lamp(g, 0.15, 0.06, 0.165, 0.025);
        break;
      case 'layers':
        for (let k = 0; k < 4; k++) { const w = 0.31 - 0.058 * k; Pp(GEO.box, k % 2 ? '#fff3e0' : color, w, 0.11, w, 0, 0.055 + 0.125 * k, 0); }
        lamp(g, 0, 0.56, 0, 0.05);
        break;
      case 'lens':
        Pp(GEO.cyl, '#f1f4f8', 0.15, 0.22, 0.15, 0, 0.11, 0);
        Pp(GEO.dome, color, 0.165, 0.165, 0.165, 0, 0.22, 0);
        Pp(GEO.cyl, '#44546a', 0.032, 0.2, 0.032, 0.07, 0.36, 0).rotation.z = -0.7;
        lamp(g, 0, 0.1, 0.152, 0.03);
        break;
      case 'library':
        Pp(GEO.box, '#d9d2c4', 0.36, 0.03, 0.3, 0, 0.015, 0.02);
        Pp(GEO.box, '#f6efe2', 0.32, 0.2, 0.22, 0, 0.13, 0);
        Pp(GEO.cone4, color, 0.27, 0.14, 0.19, 0, 0.3, 0);
        [-0.11, 0, 0.11].forEach((x) => Pp(GEO.cyl, '#ffffff', 0.02, 0.2, 0.02, x, 0.13, 0.13));
        lamp(g, 0, 0.33, 0.1, 0.03);
        break;
      case 'crystal':
        Pp(GEO.box, '#3b3f58', 0.3, 0.05, 0.3, 0, 0.025, 0);
        Pp(GEO.octa, color, 0.09, 0.27, 0.09, 0, 0.31, 0, { roughness: 0.3, emissive: color, emissiveIntensity: 0.25 });
        Pp(GEO.octa, tint(color, '#ffffff', 0.45), 0.06, 0.17, 0.06, 0.1, 0.2, 0.05, { roughness: 0.3 });
        Pp(GEO.octa, tint(color, '#3b2a6b', 0.35), 0.05, 0.14, 0.05, -0.09, 0.17, -0.04, { roughness: 0.3 });
        lamp(g, 0, 0.6, 0, 0.03);
        break;
      case 'gear': {
        Pp(GEO.cyl, '#56606e', 0.14, 0.12, 0.14, 0, 0.06, 0);
        const gear = Pp(GEO.cyl, color, 0.18, 0.045, 0.18, 0, 0.16, 0);
        spinners.push({ o: gear, v: 0.6 });
        Pp(GEO.box, '#f6c64a', 0.04, 0.3, 0.04, 0, 0.33, 0);
        Pp(GEO.box, '#f6c64a', 0.2, 0.035, 0.04, 0.08, 0.49, 0);
        Pp(GEO.ball, '#e2574c', 0.035, 0.035, 0.035, 0.18, 0.46, 0);
        lamp(g, 0, 0.53, 0, 0.028);
        break;
      }
      case 'antenna': {           // 訊號塔：AI Agent（會轉的雷達碟，代表持續感知與行動）
        Pp(GEO.box, '#3b3f58', 0.28, 0.05, 0.28, 0, 0.025, 0);
        Pp(GEO.box, '#f6efe2', 0.17, 0.15, 0.17, 0, 0.125, 0);
        Pp(GEO.box, color, 0.19, 0.03, 0.19, 0, 0.215, 0);
        Pp(GEO.cyl, '#56606e', 0.025, 0.3, 0.025, 0, 0.38, 0);
        const head = new T.Group(); head.position.set(0, 0.5, 0); g.add(head);
        part(head, GEO.dome, color, 0.1, 0.05, 0.1, 0.045, 0, 0).rotation.z = -1.1;
        spinners.push({ o: head, v: 0.9 });
        [[-0.1, 0.1], [0.1, 0.1], [0.1, -0.1]].forEach(([x, z]) => Pp(GEO.ball, tint(color, '#ffffff', 0.4), 0.03, 0.03, 0.03, x, 0.27, z));
        lamp(g, 0, 0.56, 0, 0.03);
        break;
      }
      case 'beacon':
        Pp(GEO.cyl, '#d9d2c4', 0.17, 0.05, 0.17, 0, 0.025, 0);
        Pp(GEO.cyl, '#f6efe2', 0.1, 0.34, 0.1, 0, 0.22, 0);
        Pp(GEO.cyl, color, 0.104, 0.05, 0.104, 0, 0.15, 0);
        Pp(GEO.cyl, color, 0.104, 0.05, 0.104, 0, 0.29, 0);
        Pp(GEO.cyl, '#44546a', 0.078, 0.022, 0.078, 0, 0.4, 0);
        lamp(g, 0, 0.45, 0, 0.045);
        Pp(GEO.cone6, color, 0.085, 0.1, 0.085, 0, 0.53, 0);
        Pp(GEO.box, '#f6efe2', 0.11, 0.08, 0.11, 0.16, 0.04, 0.08);
        Pp(GEO.cone4, color, 0.095, 0.06, 0.095, 0.16, 0.11, 0.08);
        break;
      default:
        Pp(GEO.box, '#f6efe2', 0.3, 0.16, 0.22, 0, 0.08, 0);
        Pp(GEO.box, color, 0.33, 0.04, 0.25, 0, 0.18, 0);
        Pp(GEO.box, '#8d6e63', 0.05, 0.2, 0.05, 0.1, 0.28, -0.05);
        Pp(GEO.box, '#f6c64a', 0.03, 0.36, 0.03, -0.11, 0.38, 0.05);
        Pp(GEO.box, '#f6c64a', 0.2, 0.03, 0.03, -0.03, 0.55, 0.05);
        lamp(g, 0.05, 0.08, 0.115, 0.03);
    }
    return g;
  }

  /* ---------- 版面 ---------- */
  function radFn(R, seed) {
    const r = rng(seed);
    const a = [r() * 6, r() * 6, r() * 6];
    return (th) => R * (1 + 0.05 * Math.sin(3 * th + a[0]) + 0.035 * Math.sin(5 * th + a[1]) + 0.02 * Math.sin(9 * th + a[2]));
  }
  function layout() {
    const home = { id: 'home', kind: 'home', name: '我的小島', color: '#f2b84b', cx: 0, cz: 0, R: 15, seed: 99 };
    home.dockAng = Math.PI / 2;
    islands.push(home);
    const regs = Object.values(G.regions);
    regs.forEach((reg, i) => {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / regs.length;
      const n = reg.lessons.length;
      const isl = { id: reg.id, kind: 'region', region: reg, name: reg.name, color: reg.color, cx: RING * Math.cos(ang), cz: RING * Math.sin(ang), R: Math.max(15, Math.min(32, 13 + n * 1.1)), seed: i + 3 };
      isl.dockAng = Math.atan2(-isl.cz, -isl.cx);
      islands.push(isl);
    });
    islands.forEach((isl) => {
      islandById[isl.id] = isl;
      isl.rad = radFn(isl.R, isl.seed);
      isl.colliders = []; isl.interact = []; isl.pick = [];
      const dr = isl.rad(isl.dockAng);
      const dx = Math.cos(isl.dockAng), dz = Math.sin(isl.dockAng);
      isl.dock = { x: isl.cx + dx * (dr + 3.2), z: isl.cz + dz * (dr + 3.2), tipX: isl.cx + dx * (dr + 6.2), tipZ: isl.cz + dz * (dr + 6.2), dx, dz, r0: dr - 1.5, r1: dr + 6.4 };
      if (isl.kind !== 'region') return;
      const n = isl.region.lessons.length;
      isl.ringR = n >= 3 ? isl.R * 0.62 : isl.R * 0.5;
      isl.spots = isl.region.lessons.map((l, k) => {
        const th = isl.dockAng + ((k + 0.5) * 2 * Math.PI) / n;
        const s = { lesson: l, ang: th, x: isl.cx + Math.cos(th) * isl.ringR, z: isl.cz + Math.sin(th) * isl.ringR, ox: Math.cos(th), oz: Math.sin(th), island: isl };
        l.spot = s;
        return s;
      });
      isl.guideHome = { x: isl.cx + dx * 4.0 + dz * 1.6, z: isl.cz + dz * 4.0 - dx * 1.6 };
    });
    islandById.home.guideHome = { x: 3.2, z: 5.6 };
  }

  /* ---------- 地形 ---------- */
  function islandMesh(isl) {
    const Ns = 72, Nr = 6;
    const pos = [], col = [], idx = [];
    const grass = new T.Color(isl.kind === 'home' ? '#79bd5c' : tint('#74b85a', isl.color, 0.2));
    const sand = new T.Color('#ecd9a6'), dirt = new T.Color('#9a7a55');
    const r = rng(isl.seed + 7);
    const rings = [];
    for (let j = 0; j <= Nr; j++) rings.push({ f: j / Nr, y: 0, c: 'g' });
    rings.push({ add: 1.0, y: -0.16, c: 's' }, { add: 2.2, y: -0.5, c: 's' }, { add: 2.4, y: -3.2, c: 'd' });
    const c = new T.Color();
    rings.forEach((rg, j) => {
      for (let i = 0; i < Ns; i++) {
        const th = (i / Ns) * Math.PI * 2;
        const rr = rg.f != null ? isl.rad(th) * rg.f : isl.rad(th) + rg.add;
        pos.push(isl.cx + Math.cos(th) * rr, rg.y, isl.cz + Math.sin(th) * rr);
        if (rg.c === 'g') { c.copy(grass).multiplyScalar(0.93 + r() * 0.12); if (j === Nr) c.lerp(sand, 0.35); }
        else if (rg.c === 's') c.copy(sand).multiplyScalar(0.95 + r() * 0.08);
        else c.copy(dirt);
        col.push(c.r, c.g, c.b);
      }
    });
    for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < Ns; i++) {
      const a = j * Ns + i, b = j * Ns + (i + 1) % Ns, cc = (j + 1) * Ns + i, d = (j + 1) * Ns + (i + 1) % Ns;
      idx.push(a, b, cc, b, d, cc);   // 逆時針（從上往下看）才是正面
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new T.Mesh(g, new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.96 }));
    m.receiveShadow = true;
    scene.add(m);
    isl.ground = m;
  }

  function instanced(geo, material, list, colorFn) {
    if (!list.length) return null;
    const im = new T.InstancedMesh(geo, material, list.length);
    const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3(), s = new T.Vector3();
    list.forEach((it, i) => {
      e.set(it.rx || 0, it.ry || 0, it.rz || 0); q.setFromEuler(e);
      v.set(it.x, it.y || 0, it.z); s.set(it.sx || it.s || 1, it.sy || it.s || 1, it.sz || it.s || 1);
      m4.compose(v, q, s); im.setMatrixAt(i, m4);
      if (colorFn) im.setColorAt(i, colorFn(it, i));
    });
    im.castShadow = true; im.receiveShadow = true;
    scene.add(im);
    return im;
  }

  function decorate(isl) {
    const r = rng(isl.seed * 13 + 1);
    const stones = [];
    const ringPts = isl.ringR || 0;
    if (isl.kind === 'region') {
      const circ = 2 * Math.PI * isl.ringR;
      const n = Math.floor(circ / 0.95);
      for (let i = 0; i < n; i++) {
        const th = (i / n) * Math.PI * 2;
        const x = isl.cx + Math.cos(th) * isl.ringR + (r() - 0.5) * 0.25, z = isl.cz + Math.sin(th) * isl.ringR + (r() - 0.5) * 0.25;
        if (isl.spots.some((s) => Math.hypot(s.x - x, s.z - z) < PLAZA + 0.2)) continue;
        stones.push({ x, z, y: 0.02, ry: r() * 3, s: 0.85 + r() * 0.35 });
        if (r() < 0.5) stones.push({ x: x + (r() - 0.5) * 1.3, z: z + (r() - 0.5) * 1.3, y: 0.015, ry: r() * 3, s: 0.6 + r() * 0.3 });
      }
      // 從中央廣場到碼頭的直路
      for (let d = 4.6; d < isl.rad(isl.dockAng) - 0.6; d += 0.95) {
        if (Math.abs(d - isl.ringR) < 1.2) continue;
        stones.push({ x: isl.cx + isl.dock.dx * d + (r() - 0.5) * 0.3, z: isl.cz + isl.dock.dz * d + (r() - 0.5) * 0.3, y: 0.02, ry: r() * 3, s: 0.9 + r() * 0.3 });
      }
    } else {
      for (let d = 1.5; d < isl.rad(isl.dockAng) - 0.6; d += 0.95) stones.push({ x: (r() - 0.5) * 0.3, z: d, y: 0.02, ry: r() * 3, s: 0.9 + r() * 0.3 });
    }
    instanced(GEO.stone, mat('#ffffff', { roughness: 1 }), stones, () => new T.Color('#d9cfbf').multiplyScalar(0.9 + r() * 0.15));

    // 樹、草叢、花、石頭：避開路、廣場、碼頭
    const blocked = (x, z, pad) => {
      const dx = x - isl.cx, dz = z - isl.cz, d = Math.hypot(dx, dz);
      const th = Math.atan2(dz, dx);
      if (d > isl.rad(th) - 1.3) return true;
      if (isl.kind === 'region') {
        if (Math.abs(d - isl.ringR) < 1.5 + pad) return true;
        if (d < 5.2 + pad) return true;
        if (isl.spots.some((s) => Math.hypot(s.x - x, s.z - z) < 5.4 + pad)) return true;
      } else {
        if (Math.hypot(x, z - 0.5) < 6.5 + pad && z > -9) return true;
        if (Math.abs(x) < 2.2 + pad && z > 0) return true;
        if ((isl.homeSlots || []).some((s) => Math.hypot(s.x - x, s.z - z) < 2.4 + pad)) return true;
        if (Math.hypot(x + 6.6, z - 3.4) < 4.2 + pad || Math.hypot(x - 4.2, z - 2.6) < 2 + pad) return true;
      }
      let ad = Math.atan2(dz, dx) - isl.dockAng; ad = Math.atan2(Math.sin(ad), Math.cos(ad));
      if (Math.abs(ad) * d < 2.4 + pad && d > 3) return true;
      return false;
    };
    const sample = (count, pad, fn) => {
      let tries = 0, got = 0;
      while (got < count && tries < count * 30) {
        tries++;
        const th = r() * Math.PI * 2, d = Math.sqrt(r()) * isl.R;
        const x = isl.cx + Math.cos(th) * d, z = isl.cz + Math.sin(th) * d;
        if (blocked(x, z, pad)) continue;
        fn(x, z); got++;
      }
    };
    const trunks = [], cones = [], rounds = [], bushes = [], flowers = [], rocks = [];
    const leaf = isl.kind === 'home' ? '#4f9d55' : tint('#3f9b52', isl.color, 0.22);
    const treeN = Math.round(isl.R * (isl.region && isl.region.style === 'forest' ? 2.4 : 1.5));
    sample(treeN, 0.3, (x, z) => {
      const s = 0.8 + r() * 0.6;
      trunks.push({ x, z, y: 0.35 * s, sx: 0.13 * s, sy: 0.7 * s, sz: 0.13 * s });
      if (r() < 0.55) cones.push({ x, z, y: (0.7 + 0.75) * s, sx: 0.75 * s, sy: 1.6 * s, sz: 0.75 * s, ry: r() * 3 });
      else rounds.push({ x, z, y: 1.25 * s, s: 0.82 * s, ry: r() * 3 });
      isl.colliders.push({ x, z, r: 0.45 * s });
    });
    sample(Math.round(isl.R * 1.1), 0, (x, z) => bushes.push({ x, z, y: 0.2, sx: 0.55 + r() * 0.3, sy: 0.38, sz: 0.55 + r() * 0.3, ry: r() * 3 }));
    sample(Math.round(isl.R * 3.2), -0.6, (x, z) => flowers.push({ x, z, y: 0.09, s: 0.07 + r() * 0.05, c: ['#f7d046', '#f28aa0', '#ffffff', '#b59af0', '#ff8f5a'][Math.floor(r() * 5)] }));
    sample(Math.round(isl.R * 0.6), 0.2, (x, z) => { const s = 0.25 + r() * 0.45; rocks.push({ x, z, y: s * 0.4, s, ry: r() * 3 }); if (s > 0.45) isl.colliders.push({ x, z, r: s * 0.9 }); });
    instanced(GEO.cyl, mat('#8a6a45'), trunks);
    instanced(GEO.cone6, mat('#ffffff'), cones, () => new T.Color(leaf).multiplyScalar(0.85 + r() * 0.3));
    instanced(GEO.ball, mat('#ffffff'), rounds, () => new T.Color(leaf).lerp(new T.Color('#9fd36b'), r() * 0.4));
    instanced(GEO.ball, mat('#ffffff'), bushes, () => new T.Color(leaf).multiplyScalar(0.8 + r() * 0.25));
    instanced(GEO.ball, mat('#ffffff', { roughness: 0.7 }), flowers, (it) => new T.Color(it.c));
    instanced(GEO.rock, mat('#ffffff'), rocks, () => new T.Color('#b6b8b0').multiplyScalar(0.85 + r() * 0.25));
  }

  /* ---------- 碼頭與船 ---------- */
  function makeBoat(color) {
    const g = new T.Group();
    part(g, GEO.box, '#8d5a3b', 1.5, 0.5, 3.4, 0, 0.25, 0);
    part(g, GEO.cone4, '#8d5a3b', 1.06, 1.0, 0.5, 0, 0.25, 1.95).rotation.x = Math.PI / 2;
    part(g, GEO.box, '#f4f1ea', 1.56, 0.12, 3.46, 0, 0.52, 0);
    part(g, GEO.box, color, 0.9, 0.6, 1.0, 0, 0.85, -0.7);
    part(g, GEO.cone4, '#5b6474', 0.75, 0.35, 0.65, 0, 1.32, -0.7);
    part(g, GEO.cyl, '#5b6474', 0.04, 1.6, 0.04, 0, 1.2, 0.6);
    part(g, GEO.box, color, 0.02, 0.4, 0.6, 0, 1.75, 0.85);
    return g;
  }
  function buildDock(isl) {
    const g = new T.Group();
    const d = isl.dock;
    const ang = Math.atan2(d.dx, d.dz);
    const len = d.r1 - d.r0;
    const mid = (d.r0 + d.r1) / 2;
    g.position.set(isl.cx + d.dx * mid, 0, isl.cz + d.dz * mid);
    g.rotation.y = ang;
    for (let k = 0; k < Math.floor(len / 0.5); k++) part(g, GEO.box, k % 2 ? '#b0835a' : '#a37650', 2.4, 0.12, 0.46, 0, 0.0, -len / 2 + 0.25 + k * 0.5);
    [-1.15, 1.15].forEach((x) => [-len / 2 + 1.5, 0, len / 2 - 0.3].forEach((z) => part(g, GEO.cyl, '#7a5638', 0.1, 1.4, 0.1, x, -0.3, z)));
    scene.add(g);
    const b = makeBoat(isl.color);
    b.position.set(d.tipX + d.dz * 2.0, -0.25, d.tipZ - d.dx * 2.0);
    b.rotation.y = ang;
    scene.add(b);
    isl.moored = b;
    isl.interact.push({ x: d.x, z: d.z, r: 2.6, label: '搭船（航海圖）', act: () => G.ui.openMap() });
    // 碼頭入口的木牌
    const sg = new T.Group();
    part(sg, GEO.cyl, '#7a5638', 0.07, 1.4, 0.07, 0, 0.7, 0);
    part(sg, GEO.box, '#f4ead2', 1.3, 0.5, 0.08, 0, 1.3, 0);
    part(sg, GEO.box, isl.color, 1.34, 0.1, 0.09, 0, 1.55, 0);
    const er = isl.rad(isl.dockAng) - 0.8;
    sg.position.set(isl.cx + d.dx * er + d.dz * 1.8, 0, isl.cz + d.dz * er - d.dx * 1.8);
    sg.rotation.y = ang + Math.PI;
    scene.add(sg);
    isl.colliders.push({ x: sg.position.x, z: sg.position.z, r: 0.25 });
  }

  /* ---------- 領域島：中央地標與每堂課的地點 ---------- */
  function buildRegion(isl) {
    const reg = isl.region;
    const plaza = new T.Mesh(GEO.cyl16, mat(tint('#e8dcc4', isl.color, 0.08)));
    plaza.scale.set(4.4, 0.08, 4.4); plaza.position.set(isl.cx, 0.04, isl.cz); plaza.receiveShadow = true;
    scene.add(plaza);
    const mon = makeBuilding(reg.style, 3, reg.color);
    mon.scale.setScalar(6.2); mon.position.set(isl.cx, 0.06, isl.cz);
    mon.rotation.y = Math.atan2(isl.dock.dx, isl.dock.dz);
    scene.add(mon);
    isl.colliders.push({ x: isl.cx, z: isl.cz, r: 2.0 });
    isl.spots.forEach((s) => buildSpot(isl, s));
  }
  function buildSpot(isl, s) {
    const l = s.lesson;
    const g = new T.Group();
    scene.add(g);
    const plaza = new T.Mesh(GEO.cyl16, mat(tint('#efe4cc', isl.color, 0.06)));
    plaza.scale.set(PLAZA, 0.07, PLAZA); plaza.position.set(s.x, 0.035, s.z); plaza.receiveShadow = true;
    plaza.userData.lesson = l;
    g.add(plaza);
    // 路牌：在廣場靠島中心那一側
    const sign = new T.Group();
    part(sign, GEO.cyl, '#7a5638', 0.07, 1.5, 0.07, 0, 0.75, 0);
    const board = part(sign, GEO.box, '#f6eedb', 1.25, 0.62, 0.09, 0, 1.38, 0);
    part(sign, GEO.box, isl.color, 1.29, 0.13, 0.1, 0, 1.7, 0);
    sign.position.set(s.x - s.ox * (PLAZA + 0.3), 0, s.z - s.oz * (PLAZA + 0.3));
    sign.rotation.y = Math.atan2(-s.ox, -s.oz);
    board.userData.lesson = l;
    g.add(sign);
    isl.colliders.push({ x: sign.position.x, z: sign.position.z, r: 0.25 });
    // 路燈
    const lp = new T.Group();
    part(lp, GEO.cyl, '#5b6474', 0.05, 1.9, 0.05, 0, 0.95, 0);
    lamp(lp, 0, 1.95, 0, 0.13);
    const tx = -s.oz, tz = s.ox;
    lp.position.set(s.x + tx * (PLAZA + 0.25), 0, s.z + tz * (PLAZA + 0.25));
    g.add(lp);
    isl.colliders.push({ x: lp.position.x, z: lp.position.z, r: 0.2 });
    s.group = g; s.sign = sign; s.buildings = new T.Group(); g.add(s.buildings);
    s.weeds = new T.Group(); g.add(s.weeds);
    s.bugs = [];
    isl.pick.push(plaza, board);
    isl.interact.push({ x: s.x, z: s.z, r: PLAZA + 0.9, lesson: l, label: '第 ' + l.no + ' 堂｜' + l.title, act: () => G.ui.openPlace(l) });
    refreshSpot(l);
  }
  function conceptPos(s, i, n) {
    const spread = n <= 1 ? 0 : Math.min(1.25, 0.34 * (n - 1));
    const a = Math.atan2(s.oz, s.ox) + (n <= 1 ? 0 : -spread + (2 * spread * i) / (n - 1));
    const rr = 3.3;
    return { x: s.x + Math.cos(a) * rr, z: s.z + Math.sin(a) * rr };
  }
  function refreshSpot(l, prevLevels) {
    const s = l.spot;
    if (!s || !s.buildings) return;
    const isl = s.island;
    // 清掉舊的建築與碰撞
    while (s.buildings.children.length) s.buildings.remove(s.buildings.children[0]);
    for (let i = spinners.length - 1; i >= 0; i--) if (spinners[i].spot === s) spinners.splice(i, 1);
    isl.colliders = isl.colliders.filter((c) => c.spot !== s);
    const before = spinners.length;
    s.slots = [];
    const n = l.concepts.length;
    l.concepts.forEach((con, i) => {
      const lv = store.conceptLevel(con);
      const b = makeBuilding(isl.region.style, lv, isl.color);
      const p = conceptPos(s, i, n);
      b.scale.setScalar(BS);
      b.position.set(p.x, 0.05, p.z);
      b.rotation.y = Math.atan2(s.x - p.x, s.z - p.z);
      b.traverse((o) => { if (o.isMesh) o.userData.lesson = l; });
      s.buildings.add(b);
      s.slots.push({ concept: con, obj: b, x: p.x, z: p.z, level: lv });
      isl.colliders.push({ x: p.x, z: p.z, r: lv === 0 ? 0.3 : 0.75, spot: s });
      if (prevLevels && prevLevels[i] !== lv) anims.push({ o: b, t: 0, d: 0.8, base: BS });
    });
    for (let i = before; i < spinners.length; i++) spinners[i].spot = s;
    isl.pick = isl.pick.filter((m) => !m.userData.bld || m.userData.spot !== s);
    s.buildings.traverse((o) => { if (o.isMesh) { o.userData.bld = 1; o.userData.spot = s; isl.pick.push(o); } });
    // 雜草：到期該複習的題數
    while (s.weeds.children.length) s.weeds.remove(s.weeds.children[0]);
    const due = store.lessonDue(l);
    const r = rng(l.order + 5);
    for (let k = 0; k < Math.min(due, 7); k++) {
      const a = r() * Math.PI * 2, d = 0.5 + r() * (PLAZA - 0.7);
      const tuft = new T.Group();
      for (let b = 0; b < 4; b++) { const m = new T.Mesh(GEO.blade, mat('#4c8a3b')); m.position.set((r() - 0.5) * 0.18, 0.18, (r() - 0.5) * 0.18); m.rotation.set((r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6); m.castShadow = true; tuft.add(m); }
      tuft.position.set(s.x + Math.cos(a) * d, 0.06, s.z + Math.sin(a) * d);
      s.weeds.add(tuft);
    }
    // 野生的蟲
    s.bugs.forEach((b) => s.group.remove(b.mesh));
    s.bugs = store.activeBugs(l).slice(0, 5).map((b, k) => {
      const mesh = G.avatar.makeBug(b.type);
      mesh.scale.setScalar(2.2);
      s.group.add(mesh);
      return { mesh, ang: k * 1.3 + r() * 2, rad: 0.7 + r() * 1.0, v: (0.35 + r() * 0.4) * (r() < 0.5 ? -1 : 1), cx: s.x, cz: s.z };
    });
  }

  /* ---------- 我的小島 ---------- */
  // 每個領域在我的小島的建造空地（用領域 id 對應，新增領域時舊的裝飾不會換位置）
  const HOME_SLOTS = { ml: [-10, -3], dl: [-9.5, -8], cv: [-5, -11], nlp: [0.5, -12.3], llm: [6, -11], robot: [9.8, -6.6], tools: [11, -1], ai: [9, 4.5], agent: [-11, 2.6] };
  function buildHome(isl) {
    isl.homeSlots = Object.values(G.regions).filter((reg) => HOME_SLOTS[reg.id]).map((reg) => ({ region: reg, x: HOME_SLOTS[reg.id][0], z: HOME_SLOTS[reg.id][1] }));
    const plaza = new T.Mesh(GEO.cyl16, mat('#efe4cc'));
    plaza.scale.set(4.5, 0.08, 4.5); plaza.position.set(0, 0.04, 1.2); plaza.receiveShadow = true;
    scene.add(plaza);
    isl.houseGroup = new T.Group(); scene.add(isl.houseGroup);
    isl.decoGroup = new T.Group(); scene.add(isl.decoGroup);
    // 蟲蟲博物館
    const mu = new T.Group();
    part(mu, GEO.box, '#e9e2d0', 4.2, 0.3, 3.4, 0, 0.15, 0);
    part(mu, GEO.box, '#f6f1e6', 3.6, 2.0, 2.8, 0, 1.3, 0);
    part(mu, GEO.dome, '#7cc04b', 1.5, 1.2, 1.5, 0, 2.3, 0);
    [-1.3, -0.45, 0.45, 1.3].forEach((x) => part(mu, GEO.cyl, '#ffffff', 0.13, 2.0, 0.13, x, 1.3, 1.5));
    part(mu, GEO.box, '#e9e2d0', 3.9, 0.25, 0.5, 0, 2.38, 1.45);
    const bugSign = G.avatar.makeBug('beetle'); bugSign.scale.setScalar(5); bugSign.position.set(0, 2.45, 1.75); bugSign.rotation.x = -0.5; mu.add(bugSign);
    mu.position.set(-6.6, 0, 3.4); mu.rotation.y = 0.55;
    scene.add(mu);
    isl.colliders.push({ x: -6.6, z: 3.4, r: 2.4 });
    isl.interact.push({ x: -5.3, z: 5.4, r: 2.4, label: '蟲蟲博物館', act: () => G.ui.openBugs() });
    // 每日佈告欄
    const bb = new T.Group();
    [-0.7, 0.7].forEach((x) => part(bb, GEO.cyl, '#7a5638', 0.07, 1.8, 0.07, x, 0.9, 0));
    part(bb, GEO.box, '#a37650', 1.7, 1.1, 0.1, 0, 1.35, 0);
    part(bb, GEO.box, '#c8553d', 1.9, 0.14, 0.4, 0, 2.0, 0);
    [['#f6eedb', -0.4, 1.45], ['#ffe08a', 0.3, 1.5], ['#cfe8ff', -0.1, 1.15], ['#ffd1dc', 0.45, 1.12]].forEach(([c, x, y]) => part(bb, GEO.box, c, 0.42, 0.32, 0.03, x, y, 0.06));
    bb.position.set(4.2, 0, 2.6); bb.rotation.y = -0.5;
    scene.add(bb);
    isl.colliders.push({ x: 4.2, z: 2.6, r: 0.7 });
    isl.interact.push({ x: 3.8, z: 3.6, r: 1.9, label: '每日佈告欄', act: () => G.ui.openDaily() });
    // 建造空地
    isl.homeSlots.forEach((sl) => {
      const ped = new T.Mesh(GEO.cyl16, mat('#d8cdb7'));
      ped.scale.set(1.5, 0.18, 1.5); ped.position.set(sl.x, 0.09, sl.z); ped.receiveShadow = true; ped.castShadow = true;
      scene.add(ped);
      isl.interact.push({ x: sl.x, z: sl.z, r: 2.3, label: '建造：' + store.MATS[sl.region.id].deco, act: () => G.ui.openBuild(sl.region.id) });
    });
    isl.interact.push({ x: 0, z: -2.0, r: 2.6, label: '回家換衣服', act: () => G.ui.openWardrobe() });
    refreshHome();
  }
  function refreshHome() {
    const isl = islandById.home;
    if (!isl || !isl.houseGroup) return;
    const lv = store.level().lv;
    const hg = isl.houseGroup;
    while (hg.children.length) hg.remove(hg.children[0]);
    isl.colliders = isl.colliders.filter((c) => !c.home);
    if (lv < 4) {               // 帳篷
      part(hg, GEO.cone4, '#e8735a', 2.4, 2.4, 2.4, 0, 1.2, 0);
      part(hg, GEO.box, '#5b3a2a', 0.8, 1.1, 0.1, 0, 0.55, 1.2);
      part(hg, GEO.cyl, '#7a5638', 0.05, 2.9, 0.05, 0, 1.45, 0);
      part(hg, GEO.box, '#f2c94c', 0.4, 0.25, 0.02, 0.2, 2.7, 0);
    } else if (lv < 8) {        // 木屋
      part(hg, GEO.box, '#b98a5e', 3.6, 2.2, 3.0, 0, 1.1, 0);
      part(hg, GEO.cone4, '#7e4a33', 3.0, 1.4, 2.6, 0, 2.9, 0);
      part(hg, GEO.box, '#5b3a2a', 0.8, 1.3, 0.1, 0, 0.65, 1.51);
      [[-1.1, 1.3], [1.1, 1.3]].forEach(([x, y]) => { const w = new T.Mesh(GEO.box, lampMat); w.scale.set(0.6, 0.5, 0.05); w.position.set(x, y, 1.52); hg.add(w); });
      part(hg, GEO.box, '#8a8a8a', 0.4, 1.2, 0.4, 1.1, 3.2, -0.5);
    } else {                    // 兩層房子
      part(hg, GEO.box, '#f4ede0', 4.6, 2.2, 3.6, 0, 1.1, 0);
      part(hg, GEO.box, '#f4ede0', 3.4, 1.8, 3.0, -0.4, 3.1, -0.2);
      part(hg, GEO.cone4, '#4f7cc4', 3.0, 1.3, 2.6, -0.4, 4.65, -0.2);
      part(hg, GEO.box, '#4f7cc4', 1.6, 0.2, 1.4, 1.5, 2.3, 0.9);
      part(hg, GEO.box, '#5b3a2a', 0.9, 1.4, 0.1, 0.8, 0.7, 1.81);
      [[-1.3, 1.3, 1.81], [-1.2, 3.2, 1.31], [0.4, 3.2, 1.31]].forEach(([x, y, z]) => { const w = new T.Mesh(GEO.box, lampMat); w.scale.set(0.7, 0.6, 0.05); w.position.set(x, y, z); hg.add(w); });
    }
    hg.position.set(0, 0, -4.6);
    isl.colliders.push({ x: 0, z: -4.6, r: lv < 4 ? 1.7 : 2.3, home: 1 });
    // 門口的雜草：全部到期題數
    const due = store.dueQuestions().length;
    const r = rng(7);
    for (let k = 0; k < Math.min(due, 12); k++) {
      const tuft = new T.Group();
      for (let b = 0; b < 4; b++) { const m = new T.Mesh(GEO.blade, mat('#4c8a3b')); m.position.set((r() - 0.5) * 0.18, 0.18, (r() - 0.5) * 0.18); m.rotation.set((r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6); tuft.add(m); }
      tuft.position.set((r() - 0.5) * 5, 0.06, -2.2 + r() * 2.4);
      tuft.position.sub(hg.position);
      hg.add(tuft);
    }
    // 建造的裝飾
    const dg = isl.decoGroup;
    while (dg.children.length) dg.remove(dg.children[0]);
    for (let i = spinners.length - 1; i >= 0; i--) if (spinners[i].home) spinners.splice(i, 1);
    const before = spinners.length;
    isl.homeSlots.forEach((sl) => {
      const hl = store.homeLevel(sl.region.id);
      if (!hl) {
        const sg = new T.Group();
        part(sg, GEO.box, '#8a6a45', 0.06, 0.6, 0.06, 0, 0.5, 0);
        part(sg, GEO.box, '#eadbb8', 0.6, 0.35, 0.05, 0, 0.75, 0);
        sg.position.set(sl.x, 0.18, sl.z);
        dg.add(sg);
        return;
      }
      const b = makeBuilding(sl.region.style, 3, sl.region.color);
      b.scale.setScalar([0, 2.6, 3.6, 4.8][hl]);
      b.position.set(sl.x, 0.18, sl.z);
      b.rotation.y = Math.atan2(-sl.x, -sl.z + 1);
      dg.add(b);
      if (hl === 3) { const st = part(dg, GEO.octa, '#ffd54a', 0.25, 0.25, 0.25, sl.x, 3.6, sl.z, { emissive: '#ffb300', emissiveIntensity: 0.7, roughness: 0.3 }); spinners.push({ o: st, v: 1.5 }); }
    });
    for (let i = before; i < spinners.length; i++) spinners[i].home = 1;
  }

  /* ---------- 名牌、對話泡泡、互動提示 ---------- */
  const tags = [];
  let promptEl, bubbleEl, nearest = null;
  function buildLabels() {
    islands.forEach((isl) => {
      (isl.spots || []).forEach((s) => {
        const l = s.lesson;
        const el = G.util.el('button', { class: 'spot-tag', type: 'button', onclick: () => api.goToLesson(l, () => G.ui.openPlace(l)) }, [
          G.util.el('span', { class: 'st-no', text: l.no }),
          G.util.el('span', { class: 'st-name', text: l.title }),
          G.util.el('span', { class: 'st-meta' }),
        ]);
        el.style.setProperty('--c', isl.color);
        labelLayer.appendChild(el);
        tags.push({ el, kind: 'spot', l, isl, v: new T.Vector3(s.x - s.ox * (PLAZA + 0.3), 2.25, s.z - s.oz * (PLAZA + 0.3)), shown: false });
      });
      const el = G.util.el('button', { class: 'isl-tag', type: 'button', onclick: () => G.ui.travelConfirm(isl.id) }, [
        G.util.el('b', { text: isl.name }), G.util.el('i', { class: 'it-meta' }),
      ]);
      el.style.setProperty('--c', isl.color);
      labelLayer.appendChild(el);
      tags.push({ el, kind: 'island', isl, v: new T.Vector3(isl.cx, 7, isl.cz), shown: false });
    });
    const homeTags = [['蟲蟲博物館', -6.6, 4.6, 3.4], ['每日佈告欄', 4.2, 2.6, 2.6]];
    homeTags.forEach(([t, x, y, z]) => {
      const el = G.util.el('div', { class: 'obj-tag', text: t });
      labelLayer.appendChild(el);
      tags.push({ el, kind: 'obj', isl: islandById.home, v: new T.Vector3(x, y, z), shown: false });
    });
    tags.forEach((t) => { t.el.style.display = 'none'; });   // 一開始全部隱藏，算好位置才顯示
    promptEl = G.util.el('button', { class: 'prompt', type: 'button', onclick: () => interact() });
    promptEl.style.display = 'none';
    labelLayer.appendChild(promptEl);
    bubbleEl = G.util.el('div', { class: 'bubble' });
    bubbleEl.style.display = 'none';
    labelLayer.appendChild(bubbleEl);
  }
  function refreshTags() {
    tags.forEach((t) => {
      if (t.kind === 'spot') {
        const l = t.l;
        const st = store.lessonStars(l);
        const due = store.lessonDue(l);
        const bugs = store.activeBugs(l).length;
        const meta = t.el.querySelector('.st-meta');
        meta.textContent = (store.courseDone(l) ? '✓ ' : '') + (st.got ? '★' + st.got + '/' + st.max : '') + (due ? ' 🌿' + due : '') + (bugs ? ' 🐛' + bugs : '');
        t.el.classList.toggle('done', st.got >= st.max && st.max > 0);
        t.el.style.setProperty('--p', Math.round(store.lessonProgress(l) * 100) + '%');
      } else if (t.kind === 'island') {
        const isl = t.isl;
        let txt = '';
        if (isl.kind === 'region') {
          const ls = isl.region.lessons.filter((x) => x.concepts.length);
          const p = ls.length ? ls.reduce((a, x) => a + store.lessonProgress(x), 0) / ls.length : 0;
          const due = ls.reduce((a, x) => a + store.lessonDue(x), 0);
          txt = Math.round(p * 100) + '%' + (due ? ' · 🌿' + due : '');
        } else txt = '家';
        t.el.querySelector('.it-meta').textContent = txt;
      }
    });
  }
  const pv = new T.Vector3();
  function place(item, visible) {
    if (visible) {
      pv.copy(item.v).project(camera);
      if (pv.z > 1 || pv.x < -1.1 || pv.x > 1.1 || pv.y < -1.1 || pv.y > 1.15) visible = false;
      else item.el.style.transform = 'translate3d(' + ((pv.x * 0.5 + 0.5) * W).toFixed(1) + 'px,' + ((-pv.y * 0.5 + 0.5) * H).toFixed(1) + 'px,0) translate(-50%,-100%)';
    }
    if (visible !== item.shown) { item.shown = visible; item.el.style.display = visible ? '' : 'none'; }
  }
  function updateLabels() {
    const here = P.island;
    tags.forEach((t) => {
      let vis = false;
      if (t.kind === 'spot') vis = showLabels && t.isl === here && Math.hypot(t.v.x - P.x, t.v.z - P.z) < 34;
      else if (t.kind === 'island') vis = showLabels && t.isl !== here && !sail;
      else if (t.kind === 'obj') vis = showLabels && t.isl === here;
      place(t, vis);
    });
    // 互動提示
    const blocking = G.ui && G.ui.isBlocking && G.ui.isBlocking();
    if (nearest && !sail && !blocking && !api.hold) {
      promptEl.className = 'prompt' + (nearest.cls ? ' ' + nearest.cls : '');   // 例如釣魚時魚上鉤會閃爍
      promptEl.textContent = '';
      promptEl.appendChild(G.util.el('kbd', { text: 'E' }));
      promptEl.appendChild(document.createTextNode(nearest.label));
      place({ el: promptEl, v: new T.Vector3(P.x, 2.3 + 0.6 * (player.headScale() - 1), P.z), shown: promptEl.style.display !== 'none' }, true);   // 頭變大時提示跟著往上
      promptEl.style.display = '';
    } else promptEl.style.display = 'none';
    if (bubbleEl.textContent && guide) {
      const g = guide.group.position;
      const it = { el: bubbleEl, v: new T.Vector3(g.x, 1.9, g.z), shown: bubbleEl.style.display !== 'none' };
      place(it, true);
      bubbleEl.style.display = it.shown ? '' : 'none';
    }
  }

  /* ---------- 移動與碰撞 ---------- */
  function walkable(isl, x, z) {
    const dx = x - isl.cx, dz = z - isl.cz;
    const d = Math.hypot(dx, dz);
    if (d < isl.rad(Math.atan2(dz, dx)) - 0.7) return true;
    // 碼頭
    const along = dx * isl.dock.dx + dz * isl.dock.dz;
    const side = -dx * isl.dock.dz + dz * isl.dock.dx;
    return along > isl.dock.r0 - 1 && along < isl.dock.r1 - 0.4 && Math.abs(side) < 1.0;
  }
  function resolve(isl, x, z) {
    for (let k = 0; k < 2; k++) {
      isl.colliders.forEach((c) => {
        const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), min = c.r + 0.3;
        if (d < min && d > 1e-4) { x = c.x + (dx / d) * min; z = c.z + (dz / d) * min; }
      });
    }
    return [x, z];
  }
  function stepPlayer(dt) {
    const isl = P.island;
    if (!isl || sail) return;
    const blocking = G.ui && G.ui.isBlocking && G.ui.isBlocking();
    let mx = 0, mz = 0;
    if (!blocking && !api.hold) {   // hold：釣魚答題時站著不動
      if (keys.has('KeyW') || keys.has('ArrowUp')) mz -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) mz += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
      // 觸控螢幕的搖桿（沒有鍵盤時用）：推到底就跑步
      if (joy.on && Math.hypot(joy.x, joy.y) > 0.15) { mx += joy.x; mz += joy.y; }
    }
    let vx = 0, vz = 0;
    const run = keys.has('ShiftLeft') || keys.has('ShiftRight') || (joy.on && Math.hypot(joy.x, joy.y) > 0.92);
    let speed = run ? 9.5 : 6.2;
    if (mx || mz) {
      P.target = null; P.path = []; P.onArrive = null;
      const len = Math.hypot(mx, mz);
      const sa = Math.sin(cam.az), ca = Math.cos(cam.az);
      // 鏡頭的前方是 (-sin az, -cos az)
      vx = (mx * ca + mz * sa) / len; vz = (-mx * sa + mz * ca) / len;
    } else if (P.target) {
      const dx = P.target.x - P.x, dz = P.target.z - P.z, d = Math.hypot(dx, dz);
      speed = d > 8 ? 9 : 6.5;
      if (d < 0.35) {
        if (P.path.length) P.target = P.path.shift();
        else { P.target = null; const cb = P.onArrive; P.onArrive = null; if (cb) setTimeout(cb, 60); }
      } else { vx = dx / d; vz = dz / d; }
    }
    if (vx || vz) {
      let nx = P.x + vx * speed * dt, nz = P.z + vz * speed * dt;
      [nx, nz] = resolve(isl, nx, nz);
      if (!walkable(isl, nx, nz)) {
        if (walkable(isl, nx, P.z)) nz = P.z; else if (walkable(isl, P.x, nz)) nx = P.x; else { nx = P.x; nz = P.z; }
      }
      const moved = Math.hypot(nx - P.x, nz - P.z);
      P.speed = moved / Math.max(dt, 1e-3);
      if (P.target && moved < speed * dt * 0.15) { P.stuck += dt; if (P.stuck > 0.8) { P.stuck = 0; P.target = P.path.length ? P.path.shift() : null; if (!P.target && P.onArrive) { const cb = P.onArrive; P.onArrive = null; cb(); } } } else P.stuck = 0;
      P.x = nx; P.z = nz;
      const want = Math.atan2(vx, vz);
      let d = want - P.facing; d = Math.atan2(Math.sin(d), Math.cos(d));
      P.facing += d * Math.min(1, dt * 12);
    } else P.speed = 0;
    player.group.position.set(P.x, 0, P.z);
    player.group.rotation.y = P.facing;
    // 最近的互動對象
    nearest = null;
    let best = Infinity;
    isl.interact.forEach((it) => { const d = Math.hypot(it.x - P.x, it.z - P.z); if (d < it.r && d < best) { best = d; nearest = it; } });
    if (guide && Math.hypot(guide.group.position.x - P.x, guide.group.position.z - P.z) < 1.9) nearest = { label: '和小星說話', act: () => G.ui.guideTalk() };
    if (Date.now() - lastSave > 4000) { lastSave = Date.now(); store.savePos({ island: isl.id, x: +P.x.toFixed(2), z: +P.z.toFixed(2) }); }
  }
  function interact() { if (nearest && !(G.ui.isBlocking && G.ui.isBlocking())) nearest.act(); }

  /** 沿著環形石板路走到某個地點（避免直線穿過樹林） */
  function routeTo(isl, tx, tz) {
    const pts = [];
    if (isl.kind === 'region') {
      const angOf = (x, z) => Math.atan2(z - isl.cz, x - isl.cx);
      const dP = Math.hypot(P.x - isl.cx, P.z - isl.cz);
      const a0 = angOf(P.x, P.z), a1 = angOf(tx, tz);
      const onRing = Math.abs(dP - isl.ringR) < 3;
      if (!onRing) pts.push({ x: isl.cx + Math.cos(a0) * isl.ringR, z: isl.cz + Math.sin(a0) * isl.ringR });   // 先沿半徑走到環形路
      const start = pts.length ? angOf(pts[pts.length - 1].x, pts[pts.length - 1].z) : a0;
      let d = a1 - start; d = Math.atan2(Math.sin(d), Math.cos(d));
      const steps = Math.ceil(Math.abs(d) / 0.18);
      for (let k = 1; k <= steps; k++) { const a = start + (d * k) / steps; pts.push({ x: isl.cx + Math.cos(a) * isl.ringR, z: isl.cz + Math.sin(a) * isl.ringR }); }
    }
    pts.push({ x: tx, z: tz });
    P.target = pts.shift();
    P.path = pts;
  }

  /* ---------- 渡船 ---------- */
  /** 從 A 島碼頭到 B 島碼頭的航線：先出港，遇到擋在中間的島就從旁邊繞過去 */
  function seaPath(from, to) {
    const V = (x, z) => new T.Vector3(x, -0.25, z);
    const a = V(from.dock.tipX + from.dock.dx * 1.5, from.dock.tipZ + from.dock.dz * 1.5);
    const b = V(to.dock.tipX + to.dock.dx * 1.5, to.dock.tipZ + to.dock.dz * 1.5);
    const a1 = V(a.x + from.dock.dx * 14, a.z + from.dock.dz * 14);
    const b1 = V(b.x + to.dock.dx * 14, b.z + to.dock.dz * 14);
    const dx = b1.x - a1.x, dz = b1.z - a1.z, L2 = dx * dx + dz * dz || 1;
    const mids = [];
    islands.forEach((isl) => {
      const t = ((isl.cx - a1.x) * dx + (isl.cz - a1.z) * dz) / L2;
      if (t <= 0.02 || t >= 0.98) return;
      const px = a1.x + dx * t, pz = a1.z + dz * t;
      const need = isl.R + 10;
      if (Math.hypot(isl.cx - px, isl.cz - pz) >= need) return;
      let nx = px - isl.cx, nz = pz - isl.cz, nl = Math.hypot(nx, nz);
      if (nl < 0.5) { nx = -dz; nz = dx; nl = Math.hypot(nx, nz); }
      mids.push({ t, p: V(isl.cx + (nx / nl) * need, isl.cz + (nz / nl) * need) });
    });
    mids.sort((p, q) => p.t - q.t);
    return new T.CatmullRomCurve3([a, a1].concat(mids.map((m) => m.p), [b1, b]), false, 'centripetal');
  }
  function fade(on) { fadeEl.classList.toggle('on', !!on); }
  function travelTo(id, cb) {
    const dest = islandById[id];
    if (!dest || sail) return;
    if (P.island === dest) { if (cb) cb(); return; }
    G.ui.closeAll && G.ui.closeAll();
    const from = P.island;
    const start = () => {
      const curve = seaPath(from, dest);
      const len = curve.getLength();
      sail = { curve, t: 0, d: Math.min(5, Math.max(2.4, len / 40)), dest, cb };
      if (G.play && G.play.rollSeaEvent) { sail.event = G.play.rollSeaEvent(from, dest); sail.eventAt = 0.42 + Math.random() * 0.12; }
      boat.visible = true;
      G.sound && G.sound.play('sail');
    };
    // 不在碼頭時先淡出、移到碼頭再出航
    if (Math.hypot(P.x - from.dock.x, P.z - from.dock.z) > 4) { fade(true); setTimeout(() => { P.x = from.dock.x; P.z = from.dock.z; fade(false); start(); }, 380); }
    else start();
  }
  function arrive(dest) {
    P.island = dest;
    P.x = dest.dock.x - dest.dock.dx * 0.5; P.z = dest.dock.z - dest.dock.dz * 0.5;
    P.facing = Math.atan2(-dest.dock.dx, -dest.dock.dz);
    P.target = null; P.path = [];
    azGoal = Math.atan2(dest.dock.dx, dest.dock.dz);   // 不直接跳過去，交給 update 平滑轉到面向島的角度
    cam.tx = P.x; cam.tz = P.z;
    placeGuide(dest);
    store.savePos({ island: dest.id, x: P.x, z: P.z });
    G.ui && G.ui.refresh && G.ui.refresh();
  }
  function placeGuide(isl) {
    guideState.lesson = null;
    const gh = isl.guideHome;
    guide.group.position.set(gh.x, 0, gh.z);
    guide.group.rotation.y = Math.atan2(isl.dock.x - gh.x, isl.dock.z - gh.z);
    guide.group.visible = true;
  }

  /* ---------- 輸入 ---------- */
  function bindInput() {
    const ptr = new Map();
    let moved = 0, mode = null, pinch0 = 0, dist0 = 0;
    const ndc = new T.Vector2();
    function pick(e) {   // 滑鼠底下是不是課程建築（點地面不再移動，所以不用算地面的交點）
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const isl = P.island;
      const hits = raycaster.intersectObjects(isl.pick, false);
      if (hits.length && hits[0].object.userData.lesson) return { lesson: hits[0].object.userData.lesson };
      return null;
    }
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = 0; mode = 'rotate';
      if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = cam.dist; mode = 'pinch'; }
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = ptr.get(e.pointerId);
      if (!p) { if (e.pointerType === 'mouse' && P.island) { const h = pick(e); canvas.style.cursor = h && h.lesson ? 'pointer' : 'default'; } return; }
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (mode === 'pinch' && ptr.size === 2) { const [a, b] = [...ptr.values()]; cam.dist = dist0 * pinch0 / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)); }
      else if (moved > 4) { dragging = true; cam.az -= dx * 0.006; cam.pol -= dy * 0.004; }
      clampCam();
    });
    const up = (e) => {
      if (!ptr.has(e.pointerId)) return;
      ptr.delete(e.pointerId);
      if (!ptr.size) dragging = false;
      if (moved < 6 && e.type === 'pointerup' && !sail && !camFocus && !(G.ui.isBlocking && G.ui.isBlocking())) {
        const h = pick(e);
        // 只有點到課程的建築才會走過去；點地面不會移動（走路用鍵盤或觸控搖桿）
        if (h && h.lesson) api.goToLesson(h.lesson, () => G.ui.openPlace(h.lesson));
      }
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist *= Math.exp(e.deltaY * 0.0011); clampCam(); }, { passive: false });
    const typing = (e) => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
    window.addEventListener('keydown', (e) => {
      if (typing(e)) return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
        if (G.ui.isBlocking && G.ui.isBlocking()) return;
        keys.add(e.code);
        if (e.code.startsWith('Arrow')) e.preventDefault();
      }
      if ((e.code === 'KeyE' || e.code === 'Space') && !api.hold && !(G.ui.isBlocking && G.ui.isBlocking())) { e.preventDefault(); interact(); }
    });
    window.addEventListener('keyup', (e) => keys.delete(e.code));
    window.addEventListener('blur', () => { keys.clear(); joy.on = false; joy.x = joy.y = 0; });

    // 觸控搖桿：拿掉「點地面走路」後，手機和平板靠它走路。偵測到觸控螢幕才顯示
    const joyEl = G.util.el('div', { id: 'joy', 'aria-hidden': 'true' }, [G.util.el('i')]);
    canvas.parentElement.appendChild(joyEl);
    const knob = joyEl.firstChild;
    const showJoy = () => document.body.classList.add('touch');
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) showJoy();
    window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') showJoy(); }, true);
    let joyId = null;
    const joyMove = (e) => {
      const r = joyEl.getBoundingClientRect(), R = r.width / 2;
      let x = (e.clientX - r.left - R) / R, y = (e.clientY - r.top - R) / R;   // 相對圓心的位置，-1 到 1
      const l = Math.hypot(x, y);
      if (l > 1) { x /= l; y /= l; }
      joy.x = x; joy.y = y;
      knob.style.transform = 'translate(' + (x * R * 0.55) + 'px,' + (y * R * 0.55) + 'px)';
    };
    joyEl.addEventListener('pointerdown', (e) => { e.preventDefault(); joyEl.setPointerCapture(e.pointerId); joyId = e.pointerId; joy.on = true; joyMove(e); });
    joyEl.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) joyMove(e); });
    const joyEnd = (e) => { if (e.pointerId !== joyId) return; joyId = null; joy.on = false; joy.x = joy.y = 0; knob.style.transform = ''; };
    joyEl.addEventListener('pointerup', joyEnd);
    joyEl.addEventListener('pointercancel', joyEnd);
  }
  function clampCam() {
    cam.dist = Math.min(46, Math.max(5, cam.dist));
    cam.pol = Math.min(1.3, Math.max(0.3, cam.pol));
  }

  /* ---------- 晝夜 ---------- */
  const SKY_DAY = new T.Color('#bfe6f5'), SKY_NIGHT = new T.Color('#141d36'), SKY_DUSK = new T.Color('#f7c59f');
  const SEA_DAY = new T.Color('#4fb4c9'), SEA_NIGHT = new T.Color('#1b335c');
  const SUN_DAY = new T.Color('#fff3df'), SUN_NIGHT = new T.Color('#8ea6ff');
  function timeGoal() {
    const mode = store.state.settings.time;
    if (mode === 'day') return [0, 0];
    if (mode === 'night') return [1, 0];
    const d = new Date(), h = d.getHours() + d.getMinutes() / 60;
    let n = 0;
    if (h < 5 || h >= 19.5) n = 1; else if (h < 7) n = 1 - (h - 5) / 2; else if (h >= 17.5) n = (h - 17.5) / 2;
    const du = h >= 16.5 && h < 19.5 ? 1 - Math.abs(h - 18) / 1.5 : h >= 5 && h < 7.5 ? 1 - Math.abs(h - 6.2) / 1.3 : 0;
    return [n, Math.max(0, du) * 0.6];
  }
  function applyNight() {
    const bg = SKY_DAY.clone().lerp(SKY_DUSK, dusk).lerp(SKY_NIGHT, night);
    scene.background.copy(bg);
    scene.fog.color.copy(bg);
    water.material.color.copy(SEA_DAY).lerp(SEA_NIGHT, night);
    hemi.intensity = 0.6 - 0.28 * night;
    sun.intensity = 0.78 - 0.55 * night;
    sun.color.copy(SUN_DAY).lerp(new T.Color('#ffc58a'), dusk).lerp(SUN_NIGHT, night);
    lampMat.emissiveIntensity = 0.05 + 2.3 * night;
    document.body.classList.toggle('night', night > 0.5);
  }

  /* ---------- 特效 ---------- */
  function celebrate(color) {
    const cols = ['#f7d046', '#f28aa0', '#5bc0be', '#9d82e0', '#6cbf5a', color || '#ff8f5a'];
    for (let i = 0; i < 36; i++) {
      const m = new T.Mesh(GEO.box, mat(cols[i % cols.length]));
      m.scale.set(0.1, 0.02, 0.06);
      m.position.set(P.x, 1.6, P.z);
      scene.add(m);
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 3;
      particles.push({ m, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: 4 + Math.random() * 4, t: 0, r: Math.random() * 10 });
    }
  }

  function resize() {
    W = stage.clientWidth || 1; H = stage.clientHeight || 1;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }

  /* ---------- 主迴圈 ---------- */
  const tickers = [];        // 每一格畫面都要呼叫的函式（play.js 註冊）
  let last = 0, clock = 0, timeCheck = 0;
  const lookV = new T.Vector3();
  function frame(ts) {
    requestAnimationFrame(frame);
    if (document.hidden || api.paused || api.idle) return;   // 航海圖打開時主畫面暫停，不要兩個 3D 畫面一起畫；掛機聽 Podcast 時也暫停（idle）
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016);
    last = ts;
    update(dt);
  }
  function update(dt) {
    clock += dt;
    stepPlayer(dt);
    player.animate(dt, sail ? 0 : P.speed);
    tickers.forEach((fn) => fn(dt, clock));   // play.js 的動畫（寶箱、島民、海怪）
    // 搭船
    if (sail) {
      // 航行到一半可能遇到事件（海怪、漂流瓶）：船停下來，事件結束再繼續開
      if (sail.event && !sail.eventFired && sail.t >= sail.eventAt) {
        sail.eventFired = true; sail.hold = true;
        const s0 = sail;
        G.play.seaEvent(sail.event, () => { s0.hold = false; });
      }
      if (!sail.hold) sail.t += dt / sail.d;
      const u = Math.min(1, sail.t), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      const p = sail.curve.getPoint(e), q = sail.curve.getPoint(Math.min(1, e + 0.01));
      boat.position.set(p.x, -0.25 + Math.sin(clock * 3) * 0.06, p.z);
      boat.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
      boat.rotation.z = Math.sin(clock * 2) * 0.04;
      P.x = p.x; P.z = p.z;
      player.group.position.set(p.x, 0.32, p.z);
      player.group.rotation.y = boat.rotation.y;
      if (u >= 1) {
        const s = sail; sail = null; boat.visible = false;
        arrive(s.dest);
        if (s.cb) setTimeout(s.cb, 150);
      }
    }
    // 小星
    if (guide) {
      guide.animate(dt, !!bubbleEl.textContent);
      const gp = guide.group.position;
      if (guideState.goal) {
        const dx = guideState.goal.x - gp.x, dz = guideState.goal.z - gp.z, d = Math.hypot(dx, dz);
        if (d > 0.1) { const st = Math.min(d, dt * 8); gp.x += (dx / d) * st; gp.z += (dz / d) * st; } else guideState.goal = null;
      }
      if (!guideState.goal && Math.hypot(P.x - gp.x, P.z - gp.z) < 9) {
        const want = Math.atan2(P.x - gp.x, P.z - gp.z);
        let d = want - guide.group.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
        guide.group.rotation.y += d * Math.min(1, dt * 4);
      }
    }
    // 鏡頭
    const tgt = camFocus || { x: P.x, z: P.z, y: 0.9 + 0.35 * (player.headScale() - 1) };   // 頭變大時鏡頭看高一點
    // 坐船時船速很快（每秒幾十單位），慢慢追會被甩在後面，所以直接鎖在船上；走路時才平滑跟隨
    const k = sail && !camFocus ? 1 : Math.min(1, dt * (camFocus ? 3 : 6));
    cam.tx += (tgt.x - cam.tx) * k; cam.tz += (tgt.z - cam.tz) * k; cam.ty += ((tgt.y || 0.9) - cam.ty) * k;
    if (camFocus && camFocus.dist) { cam.dist += (camFocus.dist - cam.dist) * k; cam.pol += (camFocus.pol - cam.pol) * k; if (camFocus.az != null) { let d = camFocus.az - cam.az; d = Math.atan2(Math.sin(d), Math.cos(d)); cam.az += d * k; } }
    // 鏡頭自動轉向：坐船時轉到船的後方（看得到前進方向）；靠岸後轉到面向島的角度。
    // 轉速有上限（每秒約 70 度），才不會一出航就猛轉；玩家自己拖曳鏡頭時不干涉
    if (dragging) azGoal = null;
    const wantAz = sail ? boat.rotation.y + Math.PI : azGoal;
    if (wantAz != null && !camFocus && !dragging) {
      let d = wantAz - cam.az; d = Math.atan2(Math.sin(d), Math.cos(d));
      const maxStep = dt * 1.2;
      cam.az += Math.max(-maxStep, Math.min(maxStep, d * Math.min(1, dt * 2)));
      if (!sail && Math.abs(d) < 0.01) azGoal = null;
    }
    // 坐船時鏡頭拉遠一點；用平滑過渡，出航和靠岸時才不會突然跳
    camExtra += ((sail ? Math.max(0, 20 - cam.dist) : 0) - camExtra) * Math.min(1, dt * 2.5);
    const dist = cam.dist + camExtra;
    const sp = Math.sin(cam.pol), cp = Math.cos(cam.pol);
    camera.position.set(cam.tx + dist * sp * Math.sin(cam.az), cam.ty + dist * cp, cam.tz + dist * sp * Math.cos(cam.az));
    lookV.set(cam.tx, cam.ty, cam.tz);
    camera.lookAt(lookV);
    // 陰影跟著主角
    sun.position.set(cam.tx - 16, 28, cam.tz + 12);
    sun.target.position.set(cam.tx, 0, cam.tz);
    sun.target.updateMatrixWorld();
    // 晝夜（每 20 秒對一次真實時間）
    timeCheck -= dt;
    if (timeCheck <= 0) { timeCheck = 20; [nightGoal] = timeGoal(); dusk = timeGoal()[1]; applyNight(); }
    if (Math.abs(night - nightGoal) > 0.002) { night += (nightGoal - night) * Math.min(1, dt * 2); applyNight(); }
    // 海浪（只動鏡頭附近的海面頂點）
    const pos = water.geometry.attributes.position;
    const wox = water.position.x, woz = water.position.z;
    for (let i = 0; i < pos.count; i++) {
      const x = waterBase[i * 2] + wox, z = waterBase[i * 2 + 1] + woz;
      pos.setY(i, Math.sin(x * 0.18 + clock * 0.9) * 0.12 + Math.cos(z * 0.2 + clock * 0.7) * 0.12);
    }
    pos.needsUpdate = true;
    water.position.x = Math.round(cam.tx / 10) * 10; water.position.z = Math.round(cam.tz / 10) * 10;
    clouds.forEach((c) => { c.position.x += c.userData.v * dt; if (c.position.x > 260) c.position.x = -260; });
    spinners.forEach((s) => { s.o.rotation.y += s.v * dt; });
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i];
      a.t += dt / a.d;
      const u = Math.min(1, a.t), c1 = 1.70158, c3 = c1 + 1;
      const e = 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
      if (a.pulse) a.o.scale.setScalar(a.base * (1 + Math.sin(u * Math.PI) * 0.18));
      else a.o.scale.setScalar(Math.max(0.01, e) * a.base);
      if (u >= 1) { a.o.scale.setScalar(a.base); anims.splice(i, 1); }
    }
    // 蟲在廣場上爬
    if (P.island && P.island.spots) P.island.spots.forEach((s) => s.bugs.forEach((b) => {
      b.ang += b.v * dt;
      b.mesh.position.set(b.cx + Math.cos(b.ang) * b.rad, 0.07, b.cz + Math.sin(b.ang) * b.rad);
      b.mesh.rotation.y = Math.atan2(-Math.sin(b.ang) * Math.sign(b.v), Math.cos(b.ang) * Math.sign(b.v));
    }));
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.t += dt; p.vy -= 12 * dt;
      p.m.position.x += p.vx * dt; p.m.position.z += p.vz * dt; p.m.position.y = Math.max(0.05, p.m.position.y + p.vy * dt);
      p.m.rotation.set(p.r + p.t * 8, p.r * 2 + p.t * 5, 0);
      if (p.t > 1.8) { scene.remove(p.m); particles.splice(i, 1); }
    }
    if (glowRing.visible) { glowRing.material.opacity = 0.5 + Math.sin(clock * 4) * 0.3; glowRing.rotation.y += dt; }
    renderer.render(scene, camera);
    updateLabels();
  }

  /* ---------- 對外介面 ---------- */
  const api = (G.world = {
    ok: false,
    paused: false,   // true 時主畫面不更新（航海圖打開時）
    idle: false,     // true 時主畫面不更新（掛機聽 Podcast，js/podcast.js 管理）
    init() {
      stage = document.getElementById('stage');
      canvas = document.getElementById('scene');
      labelLayer = document.getElementById('labels');
      fadeEl = document.getElementById('fade');
      layout();
      try {
        renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
      } catch (e) { document.body.classList.add('no3d'); return false; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFSoftShadowMap;
      scene = new T.Scene();
      scene.background = SKY_DAY.clone();
      scene.fog = new T.Fog(SKY_DAY.clone(), 80, 230);
      camera = new T.PerspectiveCamera(42, 1, 0.3, 400);
      raycaster = new T.Raycaster();
      makeGeos();
      lampMat = new T.MeshStandardMaterial({ color: '#fff1b8', emissive: '#ffc94a', emissiveIntensity: 0.05, roughness: 0.5 });
      hemi = new T.HemisphereLight('#ffffff', '#8fb8a6', 0.95);
      sun = new T.DirectionalLight('#fff3df', 1.05);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const sc = sun.shadow.camera;
      sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 90;
      sun.shadow.bias = -0.0006;
      scene.add(hemi, sun, sun.target);
      const wg = new T.PlaneGeometry(700, 700, 90, 90).rotateX(-Math.PI / 2);
      water = new T.Mesh(wg, new T.MeshStandardMaterial({ color: SEA_DAY.clone(), flatShading: true, roughness: 0.5, metalness: 0.05 }));
      water.position.y = -0.38; water.receiveShadow = true;
      waterBase = new Float32Array(wg.attributes.position.count * 2);
      for (let i = 0; i < wg.attributes.position.count; i++) { waterBase[i * 2] = wg.attributes.position.getX(i); waterBase[i * 2 + 1] = wg.attributes.position.getZ(i); }
      scene.add(water);
      const cm = mat('#ffffff', { transparent: true, opacity: 0.92 });
      for (let i = 0; i < 22; i++) {
        const c = new T.Group();
        [[0, 0, 0, 1], [1.1, -0.1, 0.2, 0.7], [-1.1, -0.12, -0.1, 0.65], [0.4, 0.3, -0.3, 0.6]].forEach(([x, y, z, s]) => { const m = new T.Mesh(GEO.ball, cm); m.scale.set(s, s * 0.6, s * 0.8); m.position.set(x, y, z); c.add(m); });
        c.position.set(-250 + Math.random() * 500, 22 + Math.random() * 10, -200 + Math.random() * 400);
        c.scale.setScalar(2.5 + Math.random() * 2.5);
        c.userData.v = 1 + Math.random() * 1.5;
        clouds.push(c); scene.add(c);
      }
      islands.forEach((isl) => { islandMesh(isl); buildDock(isl); if (isl.kind === 'region') buildRegion(isl); else buildHome(isl); });
      islands.forEach((isl) => decorate(isl));
      glowRing = new T.Mesh(new T.TorusGeometry(1.3, 0.08, 6, 32).rotateX(Math.PI / 2), new T.MeshBasicMaterial({ color: '#fff3a6', transparent: true, opacity: 0.7 }));
      glowRing.visible = false; scene.add(glowRing);
      player = G.avatar.makePlayer(store.state.avatar, store.headScale());   // 頭的大小依答對過的題數
      scene.add(player.group);
      guide = G.avatar.makeGuide();
      scene.add(guide.group);
      boat = makeBoat('#3a86ff'); boat.visible = false; scene.add(boat);
      // 主角起點：上次的位置，或我的小島碼頭
      const sp = store.state.pos;
      const isl = (sp && islandById[sp.island]) || islandById.home;
      P.island = isl;
      if (sp && islandById[sp.island] && walkable(isl, sp.x, sp.z)) { P.x = sp.x; P.z = sp.z; }
      else { P.x = isl.dock.x - isl.dock.dx * 0.5; P.z = isl.dock.z - isl.dock.dz * 0.5; }
      P.facing = Math.atan2(isl.cx - P.x, isl.cz - P.z);
      cam.az = Math.atan2(P.x - isl.cx, P.z - isl.cz);
      cam.tx = P.x; cam.tz = P.z;
      placeGuide(isl);
      buildLabels(); refreshTags();
      bindInput();
      const tg = timeGoal(); night = nightGoal = tg[0]; dusk = tg[1];
      applyNight();
      if (window.ResizeObserver) new ResizeObserver(resize).observe(stage); else window.addEventListener('resize', resize);   // 很舊的手機沒有 ResizeObserver
      resize();
      api.ok = true;
      requestAnimationFrame(frame);
      return true;
    },
    levels(lesson) { return lesson.concepts.map((c) => store.conceptLevel(c)); },
    refresh(lesson, prev) { if (!api.ok) return; refreshSpot(lesson, prev); refreshTags(); refreshHome(); },
    refreshAll() { if (!api.ok) return; G.lessons.forEach((l) => refreshSpot(l)); refreshTags(); refreshHome(); },
    refreshHome() { if (api.ok) refreshHome(); },
    setLook(a) { if (api.ok) player.setLook(a); },
    setHead(s) { if (api.ok) player.setHead(s); },
    travelTo,
    /** 搭船（如果需要）→ 沿路走到地點 → 執行 cb */
    goToLesson(l, cb) {
      if (!api.ok || !l.spot) { if (cb) cb(); return; }
      const s = l.spot;
      const go = () => {
        const tx = s.x - s.ox * 0.9, tz = s.z - s.oz * 0.9;
        if (Math.hypot(P.x - tx, P.z - tz) < 1.2) { if (cb) cb(); return; }
        routeTo(s.island, tx, tz);
        P.onArrive = () => { P.facing = Math.atan2(s.ox, s.oz); if (cb) cb(); };
      };
      if (P.island !== s.island) travelTo(s.island.id, go); else go();
    },
    goHome(cb) { travelTo('home', cb); },
    get island() { return P.island; },
    get islands() { return islands; },
    get sailing() { return !!sail; },
    /** 上課時：鏡頭飛到某個概念建築，建築彈跳發光 */
    focusConcept(l, i) {
      const s = l.spot;
      if (!s || !s.slots || !s.slots[i]) return;
      const sl = s.slots[i];
      camFocus = { x: (sl.x + s.x) / 2, z: (sl.z + s.z) / 2, y: 1.2, dist: 9.5, pol: 0.95, az: Math.atan2(s.x - sl.x, s.z - sl.z) };
      glowRing.position.set(sl.x, 0.12, sl.z); glowRing.visible = true;
      anims.push({ o: sl.obj, t: 0, d: 0.9, base: BS, pulse: true });
    },
    focusSpot(l) {
      const s = l.spot; if (!s) return;
      glowRing.visible = false;
      camFocus = { x: s.x + s.ox * 1.2, z: s.z + s.oz * 1.2, y: 1.2, dist: 13, pol: 0.9, az: Math.atan2(-s.ox, -s.oz) };
    },
    releaseFocus() { camFocus = null; glowRing.visible = false; },
    guideSay(text, ms) {
      clearTimeout(bubbleTimer);
      bubbleEl.textContent = text || '';
      bubbleEl.style.display = text ? '' : 'none';
      if (text && ms !== 0) bubbleTimer = setTimeout(() => { bubbleEl.textContent = ''; bubbleEl.style.display = 'none'; }, ms || 4500);
    },
    guideToLesson(l) {
      const s = l.spot; if (!s) return;
      const tx = -s.oz, tz = s.ox;
      guideState.goal = { x: s.x + tx * 1.4 - s.ox * 0.4, z: s.z + tz * 1.4 - s.oz * 0.4 };
      guideState.lesson = l;
    },
    guideBack() { if (P.island) { guideState.goal = { x: P.island.guideHome.x, z: P.island.guideHome.z }; guideState.lesson = null; } },
    celebrate,
    applyTime() { const tg = timeGoal(); nightGoal = tg[0]; dusk = tg[1]; applyNight(); },
    setLabels(b) { showLabels = b; },
    playerPos() { return { x: P.x, z: P.z, island: P.island }; },
    stop() { P.target = null; P.path = []; P.onArrive = null; keys.clear(); },
    debug() { return { P, keys: [...keys], cam, sail: !!sail, focus: !!camFocus, calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; },   // 測試用
    tick(sec) { const n = Math.round(sec * 30); for (let i = 0; i < n; i++) update(1 / 30); },   // 測試用：不靠 requestAnimationFrame 推進時間

    /* ---------- 給 play.js（新玩法）用：放道具、加互動點、找空地 ---------- */
    kit() { return { T, GEO, mat, part, tint }; },
    addProp(obj) { scene.add(obj); return obj; },
    removeProp(obj) { if (obj) scene.remove(obj); },
    addCollider(id, c) { islandById[id].colliders.push(c); return c; },
    removeCollider(id, c) { const a = islandById[id].colliders, i = a.indexOf(c); if (i >= 0) a.splice(i, 1); },
    addInteract(id, it) { islandById[id].interact.push(it); return it; },
    removeInteract(id, it) { const a = islandById[id].interact, i = a.indexOf(it); if (i >= 0) a.splice(i, 1); },
    onTick(fn) { tickers.push(fn); },
    hold: false,   // true 時主角不能走動、不顯示互動提示（釣魚答題時）
    /** 鏡頭看向某處：{x, z, y, dist, pol, az}；releaseFocus() 回到跟著主角 */
    focus(f) { camFocus = f; },
    face(a) { P.facing = a; player.group.rotation.y = a; },
    playerArm(i) { return player.arm(i); },
    playerObj() { return player.group; },
    /** 海面在 (x, z) 的高度（和海浪動畫用同一個公式） */
    seaY(x, z) { return water.position.y + Math.sin(x * 0.18 + clock * 0.9) * 0.12 + Math.cos(z * 0.2 + clock * 0.7) * 0.12; },
    boatPos() { return sail ? { x: boat.position.x, z: boat.position.z, ry: boat.rotation.y } : null; },
    /** 在島上找一塊空地：不壓到路、廣場、碼頭、樹和建築。seed 決定位置（同一個 seed 每次都一樣） */
    freeSpot(id, seed, pad) {
      const isl = islandById[id];
      const r = rng(seed);
      pad = pad || 1.4;
      for (let k = 0; k < 400; k++) {
        const th = r() * Math.PI * 2, d = (0.25 + 0.65 * Math.sqrt(r())) * isl.R;
        const x = isl.cx + Math.cos(th) * d, z = isl.cz + Math.sin(th) * d;
        if (d > isl.rad(th) - 2.2) continue;
        if (isl.kind === 'region') {
          if (Math.abs(d - isl.ringR) < 2.2 || d < 6.2) continue;
          if (isl.spots.some((s) => Math.hypot(s.x - x, s.z - z) < 5.6)) continue;
        } else if (Math.hypot(x, z - 0.5) < 7 || Math.abs(x) < 2.6) continue;
        let ad = th - isl.dockAng; ad = Math.atan2(Math.sin(ad), Math.cos(ad));
        if (Math.abs(ad) * d < 3) continue;
        if (isl.colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + pad)) continue;
        if (isl.interact.some((it) => Math.hypot(it.x - x, it.z - z) < 2.6)) continue;
        return { x, z };
      }
      return { x: isl.cx + isl.dock.dz * 6, z: isl.cz - isl.dock.dx * 6 };
    },
  });
})();
