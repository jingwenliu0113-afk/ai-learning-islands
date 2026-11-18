/* 航海圖：沿用第一版的 3D 六角群島地圖。每堂課是一格六角島，島上的建築顯示學習進度；
   點島或名牌看進度，按「出航」就搭船過去。和 2.0 的世界分開畫（自己的畫布、場景、座標），
   打開時主畫面暫停，關掉時再繼續。 */
(function () {
  'use strict';
  const G = window.G;
  const T = window.THREE;
  const store = G.store;
  const el = G.util.el;
  const SQ3 = Math.sqrt(3);
  const S = 1.1;          // 六角格間距
  const TOP_Y = 0.12;     // 島面高度
  const WATER_Y = -0.2;
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const HOME_HEX = [-12, 0];   // 我的小島：放在地圖左上角的空位（人工智慧導論的正上方）
  const LV_COLOR = ['#b6b0a3', '#e2a233', '#4a98e6', '#23a878'];
  const LV_NAME = ['木牌：還沒學', '鷹架：學了一部分', '小屋：都答對過', '地標：複習後仍答對'];

  let built = false, failed = false, running = false;
  let root, stage, canvas, labelLayer, infoEl;
  let renderer, scene, camera, raycaster, water, waterBase, lampMat, selRing, pin;
  const clouds = [], anims = [], spinners = [], pickTiles = [], planes = [];
  const POS = new Map();       // lesson.id → { x, z, tile }：地圖自己的座標，不動到 2.0 世界的資料
  const REG = new Map();       // region.id → { center, radius }
  const home = { x: 0, z: 0, tile: null };
  let sel = null;              // 選到的東西：{ kind: 'lesson' | 'region' | 'home', lesson?, region? }
  let hovered = null;
  let W = 1, H = 1;
  const cam = { tx: 0, tz: 0, dist: 50, az: 0, pol: 0.68 };
  let camTween = null;
  const bounds = { x0: 0, x1: 0, z0: 0, z1: 0 };

  /* ---------- 材質與形狀（共用快取） ---------- */
  const mats = new Map();
  function mat(color, extra) {
    const k = color + (extra ? JSON.stringify(extra) : '');
    let m = mats.get(k);
    if (!m) {
      m = new T.MeshStandardMaterial(Object.assign({ color, flatShading: true, roughness: 0.88, metalness: 0 }, extra || {}));
      mats.set(k, m);
    }
    return m;
  }
  function tint(a, b, t) { return '#' + new T.Color(a).lerp(new T.Color(b), t).getHexString(); }
  const GEO = {};
  function makeGeos() {
    GEO.base = new T.CylinderGeometry(1.0, 0.78, 0.62, 6).rotateY(Math.PI / 6);
    GEO.sand = new T.CylinderGeometry(1.07, 1.12, 0.1, 6).rotateY(Math.PI / 6);
    GEO.top = new T.CylinderGeometry(0.97, 1.0, 0.12, 6).rotateY(Math.PI / 6);
    GEO.box = new T.BoxGeometry(1, 1, 1);
    GEO.cone4 = new T.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4);
    GEO.cone6 = new T.ConeGeometry(1, 1, 6);
    GEO.cyl = new T.CylinderGeometry(1, 1, 1, 8);
    GEO.ball = new T.IcosahedronGeometry(1, 1);
    GEO.rock = new T.IcosahedronGeometry(1, 0);
    GEO.dome = new T.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    GEO.octa = new T.OctahedronGeometry(1);
    GEO.ring = new T.TorusGeometry(1.06, 0.035, 6, 6).rotateX(Math.PI / 2).rotateY(Math.PI / 6);
    const pg = new T.BufferGeometry();     // 紙飛機：兩堂相關的課都開始學了，就有紙飛機在兩座島之間來回
    pg.setAttribute('position', new T.Float32BufferAttribute([0, 0, 0.2, -0.13, 0.02, -0.12, 0, 0.035, -0.12, 0.13, 0.02, -0.12, 0, -0.06, -0.12], 3));
    pg.setIndex([0, 1, 2, 0, 2, 3, 0, 2, 4]);
    pg.computeVertexNormals();
    GEO.plane = pg;
  }

  /* ---------- 版面：每個領域從種子格往外螺旋排（和第一版一樣） ---------- */
  const hexPos = (q, r) => ({ x: S * 1.5 * q, z: S * SQ3 * (r + q / 2) });
  function spiral(cq, cr, maxR) {
    const out = [[cq, cr]];
    for (let k = 1; k <= maxR; k++) {
      let q = cq + DIRS[4][0] * k, r = cr + DIRS[4][1] * k;
      for (let i = 0; i < 6; i++) for (let j = 0; j < k; j++) { out.push([q, r]); q += DIRS[i][0]; r += DIRS[i][1]; }
    }
    return out;
  }
  function layout() {
    const taken = new Map();
    const key = (q, r) => q + ',' + r;
    taken.set(key(HOME_HEX[0], HOME_HEX[1]), 'home');
    Object.assign(home, hexPos(HOME_HEX[0], HOME_HEX[1]));
    Object.values(G.regions).forEach((region) => {
      const cells = spiral(region.seed[0], region.seed[1], 6);
      let i = 0;
      region.lessons.forEach((lesson) => {
        for (; i < cells.length; i++) {
          const [q, r] = cells[i];
          if (taken.has(key(q, r))) continue;
          if (DIRS.some(([dq, dr]) => { const o = taken.get(key(q + dq, r + dr)); return o && o !== region.id; })) continue;
          taken.set(key(q, r), region.id);
          POS.set(lesson.id, hexPos(q, r));
          i++;
          break;
        }
      });
      const ps = region.lessons.map((l) => POS.get(l.id));
      const center = { x: ps.reduce((a, p) => a + p.x, 0) / ps.length, z: ps.reduce((a, p) => a + p.z, 0) / ps.length };
      REG.set(region.id, { center, radius: Math.max.apply(null, ps.map((p) => Math.hypot(p.x - center.x, p.z - center.z))) + 1 });
    });
    const all = [...POS.values(), home];
    bounds.x0 = Math.min.apply(null, all.map((p) => p.x)); bounds.x1 = Math.max.apply(null, all.map((p) => p.x));
    bounds.z0 = Math.min.apply(null, all.map((p) => p.z)); bounds.z1 = Math.max.apply(null, all.map((p) => p.z));
  }

  /* ---------- 建築：概念等級 0–3（木牌 → 鷹架 → 小屋 → 領域地標） ---------- */
  function part(g, geo, color, sx, sy, sz, x, y, z, extra) {
    const m = new T.Mesh(geo, typeof color === 'string' ? mat(color, extra) : color);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  }
  function lamp(g, x, y, z, s) { const m = new T.Mesh(GEO.ball, lampMat); m.scale.setScalar(s || 0.035); m.position.set(x, y, z); g.add(m); return m; }

  function makeBuilding(style, level, color) {
    const g = new T.Group();
    const P = (geo, col, sx, sy, sz, x, y, z, extra) => part(g, geo, col, sx, sy, sz, x, y, z, extra);
    if (level === 0) {            // 木牌：還沒開工
      P(GEO.box, '#8a6a45', 0.03, 0.2, 0.03, 0, 0.1, 0);
      P(GEO.box, '#eadbb8', 0.18, 0.1, 0.025, 0, 0.2, 0.005);
      return g;
    }
    if (level === 1) {            // 地基與鷹架：開工了
      P(GEO.box, '#cbc4b8', 0.3, 0.05, 0.3, 0, 0.025, 0);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => P(GEO.box, '#a98b62', 0.025, 0.24, 0.025, a * 0.125, 0.17, b * 0.125));
      P(GEO.box, '#a98b62', 0.28, 0.022, 0.025, 0, 0.28, -0.125);
      P(GEO.box, '#a98b62', 0.025, 0.022, 0.28, 0.125, 0.28, 0);
      P(GEO.box, color, 0.11, 0.1, 0.11, -0.03, 0.1, 0.02);
      return g;
    }
    if (level === 2) {            // 小屋：學會了，等複習
      P(GEO.box, '#f6efe2', 0.26, 0.18, 0.26, 0, 0.09, 0);
      P(GEO.cone4, color, 0.215, 0.14, 0.215, 0, 0.25, 0);
      P(GEO.box, '#7a5b3d', 0.06, 0.1, 0.02, 0, 0.05, 0.131);
      const w = new T.Mesh(GEO.box, lampMat); w.scale.set(0.05, 0.05, 0.02); w.position.set(0.08, 0.11, 0.131); g.add(w);
      return g;
    }
    switch (style) {              // 第 3 級：各領域的代表建築
      case 'forest':
        P(GEO.cyl, '#8a6a45', 0.045, 0.2, 0.045, 0, 0.1, 0);
        P(GEO.cone6, tint(color, '#1f5d33', 0.45), 0.21, 0.24, 0.21, 0, 0.3, 0);
        P(GEO.cone6, color, 0.165, 0.2, 0.165, 0, 0.45, 0);
        P(GEO.cone6, tint(color, '#ffffff', 0.3), 0.115, 0.18, 0.115, 0, 0.59, 0);
        P(GEO.box, '#f6efe2', 0.12, 0.1, 0.12, 0.15, 0.05, 0.1);
        P(GEO.cone4, '#c8553d', 0.105, 0.07, 0.105, 0.15, 0.135, 0.1);
        lamp(g, 0.15, 0.06, 0.165, 0.025);
        break;
      case 'layers':
        for (let k = 0; k < 4; k++) { const w = 0.31 - 0.058 * k; P(GEO.box, k % 2 ? '#fff3e0' : color, w, 0.11, w, 0, 0.055 + 0.125 * k, 0); }
        lamp(g, 0, 0.56, 0, 0.05);
        break;
      case 'lens':
        P(GEO.cyl, '#f1f4f8', 0.15, 0.22, 0.15, 0, 0.11, 0);
        P(GEO.dome, color, 0.165, 0.165, 0.165, 0, 0.22, 0);
        P(GEO.cyl, '#44546a', 0.032, 0.2, 0.032, 0.07, 0.36, 0).rotation.z = -0.7;
        lamp(g, 0, 0.1, 0.152, 0.03);
        break;
      case 'library':
        P(GEO.box, '#d9d2c4', 0.36, 0.03, 0.3, 0, 0.015, 0.02);
        P(GEO.box, '#f6efe2', 0.32, 0.2, 0.22, 0, 0.13, 0);
        P(GEO.cone4, color, 0.27, 0.14, 0.19, 0, 0.3, 0);
        [-0.11, 0, 0.11].forEach((x) => P(GEO.cyl, '#ffffff', 0.02, 0.2, 0.02, x, 0.13, 0.13));
        lamp(g, 0, 0.33, 0.1, 0.03);
        break;
      case 'crystal':
        P(GEO.box, '#3b3f58', 0.3, 0.05, 0.3, 0, 0.025, 0);
        P(GEO.octa, color, 0.09, 0.27, 0.09, 0, 0.31, 0, { roughness: 0.3, emissive: color, emissiveIntensity: 0.25 });
        P(GEO.octa, tint(color, '#ffffff', 0.45), 0.06, 0.17, 0.06, 0.1, 0.2, 0.05, { roughness: 0.3 });
        P(GEO.octa, tint(color, '#3b2a6b', 0.35), 0.05, 0.14, 0.05, -0.09, 0.17, -0.04, { roughness: 0.3 });
        lamp(g, 0, 0.6, 0, 0.03);
        break;
      case 'gear': {
        P(GEO.cyl, '#56606e', 0.14, 0.12, 0.14, 0, 0.06, 0);
        const gear = P(GEO.cyl, color, 0.18, 0.045, 0.18, 0, 0.16, 0);
        spinners.push({ o: gear, v: 0.6 });
        P(GEO.box, '#f6c64a', 0.04, 0.3, 0.04, 0, 0.33, 0);
        P(GEO.box, '#f6c64a', 0.2, 0.035, 0.04, 0.08, 0.49, 0);
        P(GEO.ball, '#e2574c', 0.035, 0.035, 0.035, 0.18, 0.46, 0);
        lamp(g, 0, 0.53, 0, 0.028);
        break;
      }
      case 'antenna': {           // 訊號塔：AI Agent
        P(GEO.box, '#3b3f58', 0.28, 0.05, 0.28, 0, 0.025, 0);
        P(GEO.box, '#f6efe2', 0.17, 0.15, 0.17, 0, 0.125, 0);
        P(GEO.box, color, 0.19, 0.03, 0.19, 0, 0.215, 0);
        P(GEO.cyl, '#56606e', 0.025, 0.3, 0.025, 0, 0.38, 0);
        const head = new T.Group(); head.position.set(0, 0.5, 0); g.add(head);
        part(head, GEO.dome, color, 0.1, 0.05, 0.1, 0.045, 0, 0).rotation.z = -1.1;
        spinners.push({ o: head, v: 0.9 });
        [[-0.1, 0.1], [0.1, 0.1], [0.1, -0.1]].forEach(([x, z]) => P(GEO.ball, tint(color, '#ffffff', 0.4), 0.03, 0.03, 0.03, x, 0.27, z));
        lamp(g, 0, 0.56, 0, 0.03);
        break;
      }
      case 'beacon':              // 燈塔：AI 導論
        P(GEO.cyl, '#d9d2c4', 0.17, 0.05, 0.17, 0, 0.025, 0);
        P(GEO.cyl, '#f6efe2', 0.1, 0.34, 0.1, 0, 0.22, 0);
        P(GEO.cyl, color, 0.104, 0.05, 0.104, 0, 0.15, 0);
        P(GEO.cyl, color, 0.104, 0.05, 0.104, 0, 0.29, 0);
        P(GEO.cyl, '#44546a', 0.078, 0.022, 0.078, 0, 0.4, 0);
        lamp(g, 0, 0.45, 0, 0.045);
        P(GEO.cone6, color, 0.085, 0.1, 0.085, 0, 0.53, 0);
        P(GEO.box, '#f6efe2', 0.11, 0.08, 0.11, 0.16, 0.04, 0.08);
        P(GEO.cone4, color, 0.095, 0.06, 0.095, 0.16, 0.11, 0.08);
        break;
      default: // workshop
        P(GEO.box, '#f6efe2', 0.3, 0.16, 0.22, 0, 0.08, 0);
        P(GEO.box, color, 0.33, 0.04, 0.25, 0, 0.18, 0);
        P(GEO.box, '#8d6e63', 0.05, 0.2, 0.05, 0.1, 0.28, -0.05);
        P(GEO.box, '#f6c64a', 0.03, 0.36, 0.03, -0.11, 0.38, 0.05);
        P(GEO.box, '#f6c64a', 0.2, 0.03, 0.03, -0.03, 0.55, 0.05);
        lamp(g, 0.05, 0.08, 0.115, 0.03);
    }
    return g;
  }

  function rng(seed) { let s = seed * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }

  function tileBase(x, z, rc) {
    const g = new T.Group();
    g.position.set(x, 0, z);
    const base = new T.Mesh(GEO.base, mat(tint(rc, '#6b4a2f', 0.75)));
    base.position.y = -0.31;
    const sand = new T.Mesh(GEO.sand, mat('#ecdca8'));
    sand.position.y = -0.03; sand.receiveShadow = true;
    const top = new T.Mesh(GEO.top, new T.MeshStandardMaterial({ flatShading: true, roughness: 0.92 }));
    top.position.y = 0.06; top.receiveShadow = true;
    const decor = new T.Group();
    g.add(base, sand, top, decor);
    scene.add(g);
    pickTiles.push(top);
    return { g, top, decor };
  }
  function buildTile(lesson, idx) {
    const p = POS.get(lesson.id);
    const t = tileBase(p.x, p.z, lesson.region.color);
    t.top.userData.lesson = lesson;
    p.tile = Object.assign(t, { slots: [], seed: idx + 1 });
  }
  function tree(g, x, z, s, green) {
    const tg = new T.Group();
    part(tg, GEO.cyl, '#8a6a45', 0.018, 0.08, 0.018, 0, 0.04, 0);
    part(tg, GEO.cone6, green, 0.075, 0.16, 0.075, 0, 0.15, 0);
    tg.scale.setScalar(s);
    tg.position.set(x, TOP_Y, z);
    g.add(tg);
  }
  function buildHome() {           // 我的小島：小木屋、旗子、樹、碼頭
    const t = tileBase(home.x, home.z, '#f2b84b');
    t.top.userData.home = true;
    t.top.material.color.set('#8fcf7a');
    const d = t.decor;
    part(d, GEO.box, '#f6efe2', 0.34, 0.22, 0.28, -0.1, TOP_Y + 0.11, -0.05);
    part(d, GEO.cone4, '#d9733f', 0.29, 0.18, 0.25, -0.1, TOP_Y + 0.31, -0.05);
    part(d, GEO.box, '#7a5b3d', 0.07, 0.12, 0.02, -0.1, TOP_Y + 0.06, 0.091);
    const w = new T.Mesh(GEO.box, lampMat); w.scale.set(0.06, 0.06, 0.02); w.position.set(0.0, TOP_Y + 0.14, 0.091); d.add(w);
    part(d, GEO.cyl, '#f1f1f1', 0.012, 0.6, 0.012, 0.32, TOP_Y + 0.3, -0.3);
    part(d, GEO.box, '#f2b84b', 0.16, 0.1, 0.012, 0.4, TOP_Y + 0.54, -0.3);
    part(d, GEO.box, '#a98b62', 0.16, 0.03, 0.5, 0.55, TOP_Y - 0.05, 0.55);     // 碼頭
    [[0.6, 0.3], [-0.55, 0.45], [0.15, -0.65], [-0.6, -0.35]].forEach(([x, z], i) => tree(d, x, z, 0.9 + (i % 2) * 0.3, '#3f9b52'));
    home.tile = t;
  }

  function refreshTile(lesson) {
    const t = POS.get(lesson.id).tile;
    for (let i = spinners.length - 1; i >= 0; i--) if (spinners[i].tile === lesson) spinners.splice(i, 1);
    const before = spinners.length;
    while (t.decor.children.length) t.decor.remove(t.decor.children[0]);
    const has = lesson.concepts.length > 0;
    const started = has && (store.lessonStarted(lesson) || !!store.state.visited[lesson.id]);
    const prog = store.lessonProgress(lesson);
    const col = new T.Color('#a9b79f').lerp(new T.Color(lesson.region.color), has ? (started ? 0.55 + 0.45 * prog : 0.38) : 0.1);
    if (started) col.lerp(new T.Color('#ffffff'), 0.1);
    t.top.material.color.copy(col);
    const levels = lesson.concepts.map((c) => store.conceptLevel(c));
    const old = t.slots.map((s) => s.level);
    t.slots = [];
    const rand = rng(t.seed);
    const n = lesson.concepts.length;
    lesson.concepts.forEach((con, i) => {
      const ang = Math.PI * 0.75 + (i * 2 * Math.PI) / n;
      const r = n <= 4 ? 0.5 : 0.6;
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      const lv = levels[i];
      const b = makeBuilding(lesson.region.style, lv, lesson.region.color);
      b.position.set(x, TOP_Y, z);
      b.rotation.y = Math.atan2(x, z);
      t.decor.add(b);
      t.slots.push({ concept: con, obj: b, x, z, level: lv });
      if (old.length && old[i] !== lv) anims.push({ o: b, t: 0, d: 0.7 });   // 上次打開航海圖之後升級的建築會彈一下
    });
    // 中央：沒題庫→石頭；沒去過→霧；去過→旗子（高度是進度）；全部第 3 級→金色星星
    const c = new T.Group();
    if (!has) {
      part(c, GEO.rock, '#a9b0a6', 0.16, 0.12, 0.14, -0.05, 0.05, 0.05);
      part(c, GEO.rock, '#bfc5bc', 0.1, 0.08, 0.1, 0.15, 0.03, -0.08);
    } else if (!started) {
      const fm = mat('#ffffff', { transparent: true, opacity: 0.72 });
      [[0, 0.3, 0, 0.2], [0.17, 0.26, 0.05, 0.14], [-0.16, 0.27, -0.04, 0.15]].forEach(([x, y, z, s]) => {
        const m = new T.Mesh(GEO.ball, fm); m.scale.set(s, s * 0.7, s); m.position.set(x, y, z); c.add(m);
      });
    } else {
      part(c, GEO.cyl, '#f1f1f1', 0.012, 0.56, 0.012, 0, 0.28, 0);
      part(c, GEO.box, lesson.region.color, 0.15, 0.09, 0.012, 0.08, 0.14 + 0.36 * prog, 0);
      if (prog >= 0.999) {
        const star = part(c, GEO.octa, '#ffd54a', 0.075, 0.075, 0.075, 0, 0.66, 0, { emissive: '#ffb300', emissiveIntensity: 0.7, roughness: 0.3 });
        spinners.push({ o: star, v: 1.6 });
      }
    }
    c.position.y = TOP_Y;
    t.decor.add(c);
    // 樹：進度越高越茂盛
    const trees = has ? (started ? 1 + Math.round(prog * 6) : 1) : 2;
    for (let k = 0; k < trees; k++) {
      const a = rand() * Math.PI * 2, r = 0.8 + rand() * 0.08, s = 0.7 + rand() * 0.6;
      tree(t.decor, Math.cos(a) * r, Math.sin(a) * r, s, started ? tint('#3f9b52', lesson.region.color, 0.25 + rand() * 0.2) : '#9aa896');
    }
    for (let i = before; i < spinners.length; i++) spinners[i].tile = lesson;
  }

  function buildPlanes() {
    G.links.forEach((link, i) => {
      const a = POS.get(link.a.id), b = POS.get(link.b.id);
      const dist = Math.hypot(a.x - b.x, a.z - b.z);
      const h = 0.9 + dist * 0.13;
      const curve = new T.QuadraticBezierCurve3(
        new T.Vector3(a.x, 0.5, a.z), new T.Vector3((a.x + b.x) / 2, h * 2 - 0.5, (a.z + b.z) / 2), new T.Vector3(b.x, 0.5, b.z));
      const plane = new T.Mesh(GEO.plane, mat('#ffffff', { side: T.DoubleSide, roughness: 0.6 }));
      plane.castShadow = true;
      plane.visible = false;
      scene.add(plane);
      planes.push({ link, curve, plane, phase: (i * 0.37) % 2, speed: 0.05 + 0.5 / (dist + 6), active: false });
    });
  }

  /* ---------- 名牌（HTML 疊在 3D 上） ---------- */
  const tags = [], regionTags = [];
  let homeTag = null;
  function buildLabels() {
    G.lessons.forEach((l) => {
      const p = POS.get(l.id);
      const b = el('button', { class: 'ch-tag', type: 'button', title: '第 ' + l.no + ' 堂：' + l.title, onclick: () => select({ kind: 'lesson', lesson: l }, true) }, [
        el('span', { class: 'ch-no', text: l.no }),
        el('span', { class: 'ch-name', text: l.title }),
        el('span', { class: 'ch-due' }),
      ]);
      b.style.setProperty('--c', l.region.color);
      labelLayer.appendChild(b);
      tags.push({ el: b, l, shown: true, v: new T.Vector3(p.x, 0.62, p.z) });
    });
    Object.values(G.regions).forEach((r) => {
      const g = REG.get(r.id);
      const b = el('button', { class: 'ch-rtag', type: 'button', onclick: () => select({ kind: 'region', region: r }, true) }, [
        el('b', { text: r.name }), el('i', { text: r.en }), el('em', { class: 'ch-here', text: '📍 你在這裡' }),
      ]);
      b.style.setProperty('--c', r.color);
      labelLayer.appendChild(b);
      regionTags.push({ el: b, r, shown: true, v: new T.Vector3(g.center.x, 2.0, g.center.z) });
    });
    const hb = el('button', { class: 'ch-rtag home', type: 'button', onclick: () => select({ kind: 'home' }, true) }, [
      el('b', { text: '🏠 我的小島' }), el('i', { text: 'Home' }), el('em', { class: 'ch-here', text: '📍 你在這裡' }),
    ]);
    hb.style.setProperty('--c', '#e0a43a');
    labelLayer.appendChild(hb);
    homeTag = { el: hb, shown: true, v: new T.Vector3(home.x, 1.5, home.z) };
  }
  function refreshTags() {
    const now = Date.now();
    tags.forEach((t) => {
      const due = store.lessonDue(t.l, now);
      const prog = store.lessonProgress(t.l);
      t.el.classList.toggle('empty', !t.l.concepts.length);
      t.el.classList.toggle('done', prog >= 0.999);
      t.el.classList.toggle('started', store.lessonStarted(t.l));
      t.el.querySelector('.ch-due').textContent = due ? '🌿' + due : '';
      t.el.style.setProperty('--p', Math.round(prog * 100) + '%');
    });
    const here = G.world.island;
    regionTags.forEach((t) => t.el.classList.toggle('here', !!here && here.kind === 'region' && here.region === t.r));
    homeTag.el.classList.toggle('here', !!here && here.kind === 'home');
    // 3D 大頭針：插在你現在所在的島上
    let at = null;
    if (here && here.kind === 'home') at = home;
    else if (here && here.region) at = REG.get(here.region.id).center;
    pin.visible = !!at;
    if (at) pin.position.set(at.x, 0, at.z);
  }
  const pv = new T.Vector3();
  function place(item, visible) {
    if (visible) {
      pv.copy(item.v).project(camera);
      if (pv.z > 1 || pv.x < -1.05 || pv.x > 1.05 || pv.y < -1.1 || pv.y > 1.1) visible = false;
      else item.el.style.transform = 'translate3d(' + ((pv.x * 0.5 + 0.5) * W).toFixed(1) + 'px,' + ((-pv.y * 0.5 + 0.5) * H).toFixed(1) + 'px,0) translate(-50%,-100%)';
    }
    if (visible !== item.shown) { item.shown = visible; item.el.style.display = visible ? '' : 'none'; }
  }
  function updateLabels() {
    const far = cam.dist > 13;   // 遠景：課的名牌只留編號，另外顯示領域名稱
    if (far !== labelLayer.classList.contains('far')) labelLayer.classList.toggle('far', far);
    const selL = sel && sel.kind === 'lesson' ? sel.lesson : null;
    tags.forEach((t) => {
      const isSel = t.l === selL;
      if (isSel !== t.sel) { t.sel = isSel; t.el.classList.toggle('sel', isSel); }
      place(t, true);
    });
    regionTags.forEach((t) => place(t, far));
    place(homeTag, true);
  }

  /* ---------- 選取與資訊卡 ---------- */
  function islandOf(s) {
    if (s.kind === 'home') return G.world.islands.find((x) => x.kind === 'home');
    const r = s.kind === 'lesson' ? s.lesson.region : s.region;
    return G.world.islands.find((x) => x.kind === 'region' && x.region === r);
  }
  function sailTo(isl) {
    if (G.world.sailing) { G.ui.toast('船還在路上，靠岸後再出航'); return; }
    G.ui.closeModal();
    if (isl && G.world.island !== isl) G.world.travelTo(isl.id);
  }
  function goLesson(l) {
    if (G.world.sailing) { G.ui.toast('船還在路上，靠岸後再出航'); return; }
    G.ui.goPlace(l);   // 關掉航海圖 → 搭船（需要的話）→ 走到這堂課的廣場 → 打開地點面板
  }
  function bar(p, color) {
    const b = el('div', { class: 'ch-bar' }, [el('i')]);
    b.firstChild.style.width = Math.round(p * 100) + '%';
    b.firstChild.style.background = color;
    return b;
  }
  function regionStats(r) {
    const ls = r.lessons.filter((x) => x.concepts.length);
    const p = ls.length ? ls.reduce((a, x) => a + store.lessonProgress(x), 0) / ls.length : 0;
    const due = ls.reduce((a, x) => a + store.lessonDue(x), 0);
    return { p, due, n: r.lessons.length };
  }
  function renderInfo() {
    infoEl.innerHTML = '';
    if (!sel) { infoEl.hidden = true; return; }
    infoEl.hidden = false;
    const isl = islandOf(sel);
    const atHere = !!isl && G.world.island === isl;
    const kids = [];
    if (sel.kind === 'lesson') {
      const l = sel.lesson;
      const due = store.lessonDue(l), prog = store.lessonProgress(l);
      kids.push(el('div', { class: 'ch-eyebrow' }, [el('span', { class: 'ch-pill', text: '第 ' + l.no + ' 堂' }), el('span', { text: l.region.name })]));
      kids.push(el('h3', { text: l.title }));
      if (l.sub) kids.push(el('p', { class: 'ch-sub', text: l.sub }));
      kids.push(bar(prog, l.region.color));
      kids.push(el('p', { class: 'ch-stat', text: '進度 ' + Math.round(prog * 100) + '%' + (due ? '　🌿 ' + due + ' 題到期要複習' : '') }));
      if (l.concepts.length) {
        kids.push(el('ul', { class: 'ch-cons' }, l.concepts.map((c) => {
          const lv = store.conceptLevel(c);
          return el('li', { title: LV_NAME[lv] }, [el('i', { class: 'ch-dot' }), el('span', { text: c.name })]);
        })));
        [...kids[kids.length - 1].querySelectorAll('.ch-dot')].forEach((d, i) => { d.style.background = LV_COLOR[store.conceptLevel(l.concepts[i])]; });
      }
      kids.push(el('div', { class: 'ch-btns' }, [
        el('button', { class: 'btn primary', type: 'button', text: atHere ? '🚶 走過去' : '⛵ 出航去上這堂課', onclick: () => goLesson(l) }),
        atHere ? null : el('button', { class: 'btn', type: 'button', text: '只開到這座島', onclick: () => sailTo(isl) }),
      ].filter(Boolean)));
    } else if (sel.kind === 'region') {
      const r = sel.region, st = regionStats(r);
      kids.push(el('div', { class: 'ch-eyebrow' }, [el('span', { class: 'ch-pill', text: '領域島' }), el('span', { text: r.en })]));
      kids.push(el('h3', { text: r.name }));
      kids.push(bar(st.p, r.color));
      kids.push(el('p', { class: 'ch-stat', text: st.n + ' 堂課．進度 ' + Math.round(st.p * 100) + '%' + (st.due ? '　🌿 ' + st.due + ' 題到期' : '') }));
      kids.push(el('div', { class: 'ch-btns' }, [atHere
        ? el('button', { class: 'btn', type: 'button', text: '📍 你在這裡（關閉航海圖）', onclick: () => G.ui.closeModal() })
        : el('button', { class: 'btn primary', type: 'button', text: '⛵ 出航到這座島', onclick: () => sailTo(isl) })]));
    } else {
      kids.push(el('div', { class: 'ch-eyebrow' }, [el('span', { class: 'ch-pill', text: '我的小島' })]));
      kids.push(el('h3', { text: '🏠 我的小島' }));
      kids.push(el('p', { class: 'ch-sub', text: '家、蟲蟲博物館、每日佈告欄、建造空地都在這裡。' }));
      kids.push(el('div', { class: 'ch-btns' }, [atHere
        ? el('button', { class: 'btn', type: 'button', text: '📍 你在這裡（關閉航海圖）', onclick: () => G.ui.closeModal() })
        : el('button', { class: 'btn primary', type: 'button', text: '⛵ 回家', onclick: () => sailTo(isl) })]));
    }
    kids.forEach((k) => infoEl.appendChild(k));
  }
  function select(s, fly) {
    sel = s || null;
    selRing.visible = !!(sel && sel.kind !== 'region');
    if (sel && sel.kind === 'lesson') { const p = POS.get(sel.lesson.id); selRing.position.set(p.x, TOP_Y + 0.03, p.z); }
    if (sel && sel.kind === 'home') selRing.position.set(home.x, TOP_Y + 0.03, home.z);
    renderInfo();
    if (!fly || !sel) return;
    if (sel.kind === 'lesson') { const p = POS.get(sel.lesson.id); flyTo({ tx: p.x, tz: p.z + 0.3, dist: 9.5, pol: 0.82 }, 900); }
    else if (sel.kind === 'region') { const g = REG.get(sel.region.id); flyTo({ tx: g.center.x, tz: g.center.z + 0.6, dist: Math.max(11, g.radius * 4.6), pol: 0.82 }, 900); }
    else flyTo({ tx: home.x, tz: home.z + 0.3, dist: 9.5, pol: 0.82 }, 900);
  }

  /* ---------- 鏡頭 ---------- */
  function applyCam() {
    const sp = Math.sin(cam.pol), cp = Math.cos(cam.pol);
    camera.position.set(cam.tx + cam.dist * sp * Math.sin(cam.az), cam.dist * cp, cam.tz + cam.dist * sp * Math.cos(cam.az));
    camera.lookAt(cam.tx, 0.2, cam.tz);
  }
  const MAX_DIST = 125;  // 鏡頭最遠距離（手機直式要拉遠一點才放得下整張圖；九座島比較寬）
  function clampCam() {
    cam.dist = Math.min(MAX_DIST, Math.max(3.2, cam.dist));
    cam.pol = Math.min(1.32, Math.max(0.1, cam.pol));
    cam.tx = Math.min(bounds.x1 + 4, Math.max(bounds.x0 - 4, cam.tx));
    cam.tz = Math.min(bounds.z1 + 4, Math.max(bounds.z0 - 4, cam.tz));
  }
  function flyTo(goal, ms) {
    const from = Object.assign({}, cam);
    const to = Object.assign({}, cam, goal);
    let d = to.az - from.az;                     // 走最短的旋轉方向
    d = ((d + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    to.az = from.az + d;
    camTween = { from, to, t: 0, d: (ms || 900) / 1000 };
  }
  function fitView(top) {         // 依全部島的範圍與畫面比例，算出剛好看得到整張地圖的鏡頭
    // 手機直式畫面比較窄：地圖轉 90 度，讓群島長的那一邊（東西向）順著畫面的直向
    const tall = W < H * 0.9;
    let hx = (bounds.x1 - bounds.x0) / 2 + 1.6, hz = (bounds.z1 - bounds.z0) / 2 + 1.6;
    if (tall) { [hx, hz] = [hz, hx]; hx += 2.6; }   // 直式：左右兩側的島名牌會超出六角格，多留一點寬度
    const pol = top ? 0.1 : 0.68;
    const t = Math.tan((camera.fov / 2) * Math.PI / 180);
    const aspect = Math.max(0.4, W / H);
    const dist = Math.max(hx / (t * aspect), (hz * Math.cos(pol)) / t) * (tall ? 1.18 : 1.06);   // 直式畫面的島名牌比較寬，多留一點邊
    const off = top ? 0 : 1.6;
    return { tx: (bounds.x0 + bounds.x1) / 2 + (tall ? off : 0), tz: (bounds.z0 + bounds.z1) / 2 + (tall ? 0 : off), dist: Math.min(MAX_DIST, Math.max(20, dist)), az: tall ? Math.PI / 2 : 0, pol };
  }

  function bindInput() {
    const ptr = new Map();
    let moved = 0, mode = null, pinch0 = 0, dist0 = 0;
    const ndc = new T.Vector2();
    function pick(e) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const h = raycaster.intersectObjects(pickTiles, false)[0];
      if (!h) return null;
      return h.object.userData.home ? { kind: 'home', top: h.object } : { kind: 'lesson', lesson: h.object.userData.lesson, top: h.object };
    }
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = 0; camTween = null; touched = true;
      mode = e.button === 2 || e.shiftKey || e.ctrlKey ? 'rotate' : 'pan';
      if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = cam.dist; mode = 'pinch'; }
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = ptr.get(e.pointerId);
      if (!p) {
        if (e.pointerType === 'mouse') {
          const hit = pick(e);
          const top = hit ? hit.top : null;
          if (top !== hovered) {
            if (hovered) hovered.material.emissive.setHex(0x000000);
            hovered = top;
            if (hovered) hovered.material.emissive.setHex(0x2a2a2a);
          }
          canvas.style.cursor = hit ? 'pointer' : 'grab';
        }
        return;
      }
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (mode === 'pinch' && ptr.size === 2) {
        const [a, b] = [...ptr.values()];
        cam.dist = dist0 * pinch0 / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y));
      } else if (mode === 'rotate') {
        cam.az -= dx * 0.005; cam.pol -= dy * 0.004;
      } else {
        const k = cam.dist * 0.0017;
        cam.tx += (-Math.cos(cam.az) * dx - Math.sin(cam.az) * dy) * k;
        cam.tz += (Math.sin(cam.az) * dx - Math.cos(cam.az) * dy) * k;
      }
      clampCam();
    });
    const up = (e) => {
      if (!ptr.has(e.pointerId)) return;
      ptr.delete(e.pointerId);
      if (moved < 6 && e.type === 'pointerup' && ptr.size === 0) {
        const hit = pick(e);
        if (hit && hit.kind === 'lesson') select({ kind: 'lesson', lesson: hit.lesson }, true);
        else if (hit) select({ kind: 'home' }, true);
        else select(null);
      }
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault(); camTween = null; touched = true;
      cam.dist *= Math.exp(e.deltaY * 0.0011); clampCam();
    }, { passive: false });
  }

  /* ---------- 建立場景（第一次打開航海圖時才做） ---------- */
  function build() {
    root = el('div', { class: 'chartbox' }, [
      el('div', { class: 'chart-head' }, [
        el('h2', { text: '航海圖' }),
        el('p', { class: 'hint', text: '點島或名牌看進度，按「出航」就搭船過去。拖曳移動、滾輪或雙指縮放、右鍵或 Shift 拖曳旋轉。' }),
        el('div', { class: 'chart-tools' }, [
          el('button', { type: 'button', text: '全景', onclick: () => { select(null); flyTo(fitView(false), 900); } }),
          el('button', { type: 'button', text: '鳥瞰', onclick: () => { select(null); flyTo(fitView(true), 900); } }),
          el('button', { type: 'button', text: '📍 我在哪', onclick: () => { const h = G.world.island; if (h) select(h.kind === 'home' ? { kind: 'home' } : { kind: 'region', region: h.region }, true); } }),
        ]),
      ]),
      (stage = el('div', { class: 'chart-stage' }, [
        (canvas = el('canvas')),
        (labelLayer = el('div', { class: 'ch-labels' })),
        (infoEl = el('div', { class: 'ch-info', hidden: true })),
        el('div', { class: 'ch-legend' }, LV_NAME.map((t, i) => {
          const s = el('span', {}, [el('i'), document.createTextNode(t)]);
          s.firstChild.style.background = LV_COLOR[i];
          return s;
        })),
      ])),
    ]);
    try {
      renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      failed = true;
      return false;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    layout();
    scene = new T.Scene();
    scene.background = new T.Color('#c4e9f6');
    scene.fog = new T.Fog(new T.Color('#c4e9f6'), 110, 230);
    camera = new T.PerspectiveCamera(36, 1, 0.5, 280);
    raycaster = new T.Raycaster();
    makeGeos();
    lampMat = new T.MeshStandardMaterial({ color: '#fff1b8', emissive: '#ffc94a', emissiveIntensity: 0.05, roughness: 0.5 });
    const hemi = new T.HemisphereLight('#ffffff', '#8fb8a6', 0.95);
    const sun = new T.DirectionalLight('#fff3df', 1.05);
    sun.position.set(-14, 26, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -29; sc.right = 29; sc.top = 29; sc.bottom = -29; sc.near = 1; sc.far = 80;
    sun.shadow.bias = -0.0006;
    scene.add(hemi, sun);
    const wg = new T.PlaneGeometry(190, 190, 64, 64).rotateX(-Math.PI / 2);
    water = new T.Mesh(wg, new T.MeshStandardMaterial({ color: '#4fb4c9', flatShading: true, roughness: 0.55, metalness: 0.05 }));
    water.position.y = WATER_Y; water.receiveShadow = true;
    waterBase = new Float32Array(wg.attributes.position.count * 2);
    for (let i = 0; i < wg.attributes.position.count; i++) { waterBase[i * 2] = wg.attributes.position.getX(i); waterBase[i * 2 + 1] = wg.attributes.position.getZ(i); }
    scene.add(water);
    const cm = mat('#ffffff', { transparent: true, opacity: 0.9 });
    for (let i = 0; i < 9; i++) {
      const c = new T.Group();
      [[0, 0, 0, 1], [0.9, -0.1, 0.2, 0.7], [-0.9, -0.12, -0.1, 0.65], [0.3, 0.25, -0.3, 0.6]].forEach(([x, y, z, s]) => {
        const m = new T.Mesh(GEO.ball, cm); m.scale.set(s, s * 0.6, s * 0.8); m.position.set(x, y, z); c.add(m);
      });
      const ang = (i / 9) * Math.PI * 2 + 0.4, rad = 30 + (i % 3) * 5;   // 雲圍在地圖外圈，不擋島
      c.position.set(Math.cos(ang) * rad - 3, 5 + (i % 3) * 1.2, Math.sin(ang) * rad * 0.8 - 4);
      c.scale.setScalar(1.2 + (i % 4) * 0.35);
      c.userData.v = 0.25 + (i % 3) * 0.12;
      clouds.push(c); scene.add(c);
    }
    G.lessons.forEach(buildTile);
    buildHome();
    buildPlanes();
    selRing = new T.Mesh(GEO.ring, new T.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.9 }));
    selRing.position.y = TOP_Y + 0.03; selRing.visible = false;
    scene.add(selRing);
    pin = new T.Group();            // 大頭針：尖端朝下，在你所在的島上上下跳
    const pm = mat('#e2574c', { emissive: '#e2574c', emissiveIntensity: 0.25, roughness: 0.4 });
    const head = new T.Mesh(GEO.ball, pm); head.scale.setScalar(0.42); head.position.y = 1.55;
    const tip = new T.Mesh(GEO.cone6, pm); tip.scale.set(0.24, 0.9, 0.24); tip.rotation.x = Math.PI; tip.position.y = 0.95;
    pin.add(head, tip);
    pin.userData.base = 0.25;
    scene.add(pin);
    buildLabels();
    bindInput();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(stage); else window.addEventListener('resize', resize);
    built = true;
    return true;
  }

  let touched = false;      // 打開之後玩家動過鏡頭沒有；沒動過的話，畫面大小改變時重新取景
  function resize() {
    if (!renderer) return;
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    W = w; H = h;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    if (running && !touched && !sel && !camTween) Object.assign(cam, fitView(false));
  }

  let last = 0, clock = 0, raf = 0;
  function frame(ts) {
    if (!running) { raf = 0; return; }
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016);
    last = ts; clock += dt;
    if (camTween) {
      camTween.t += dt / camTween.d;
      const u = Math.min(1, camTween.t), e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      ['tx', 'tz', 'dist', 'az', 'pol'].forEach((k) => { cam[k] = camTween.from[k] + (camTween.to[k] - camTween.from[k]) * e; });
      if (u >= 1) camTween = null;
    }
    applyCam();
    const pos = water.geometry.attributes.position;   // 海浪
    for (let i = 0; i < pos.count; i++) {
      const x = waterBase[i * 2], z = waterBase[i * 2 + 1];
      pos.setY(i, Math.sin(x * 0.55 + clock * 0.9) * 0.05 + Math.cos(z * 0.6 + clock * 0.7) * 0.05);
    }
    pos.needsUpdate = true;
    clouds.forEach((c) => { const a = c.userData.v * dt * 0.012, x = c.position.x, z = c.position.z + 4; c.position.x = x * Math.cos(a) - z * Math.sin(a); c.position.z = x * Math.sin(a) + z * Math.cos(a) - 4; });
    spinners.forEach((s) => { s.o.rotation.y += s.v * dt; });
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i];
      a.t += dt / a.d;
      const u = Math.min(1, a.t), c1 = 1.70158, c3 = c1 + 1;
      a.o.scale.setScalar(Math.max(0.01, 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2)));
      if (u >= 1) anims.splice(i, 1);
    }
    planes.forEach((pl) => {
      if (!pl.active) return;
      let u = (clock * pl.speed + pl.phase) % 2;
      const back = u > 1;
      if (back) u = 2 - u;
      pl.plane.position.copy(pl.curve.getPoint(u));
      pl.plane.position.y += Math.sin(clock * 3 + pl.phase * 5) * 0.03;
      pl.plane.lookAt(pl.curve.getPoint(Math.min(1, Math.max(0, u + (back ? -0.02 : 0.02)))));
    });
    if (pin.visible) { pin.position.y = pin.userData.base + Math.abs(Math.sin(clock * 2.4)) * 0.45; pin.rotation.y += dt * 1.2; }
    if (selRing.visible) { const s = 1 + Math.sin(clock * 3) * 0.02; selRing.scale.set(s, 1, s); }
    renderer.render(scene, camera);
    updateLabels();
  }

  /* ---------- 對外介面 ---------- */
  G.chart = {
    /** 航海圖的畫面節點；這台電腦不能畫 3D 時回傳 null（改用簡易版） */
    node() {
      if (failed) return null;
      if (!built && !build()) return null;
      return root;
    },
    /** 放進對話框之後呼叫：更新進度、取景、開始畫 */
    open() {
      if (!built) return;
      G.lessons.forEach((l) => refreshTile(l));
      planes.forEach((pl) => { pl.active = store.lessonStarted(pl.link.a) && store.lessonStarted(pl.link.b); pl.plane.visible = pl.active; });
      refreshTags();
      select(null);
      camTween = null;
      touched = false;
      G.world.paused = true;
      running = true;
      resize();
      Object.assign(cam, fitView(false));
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    },
    close() {
      running = false;
      G.world.paused = false;
      if (hovered) { hovered.material.emissive.setHex(0x000000); hovered = null; }
    },
    debug() { return { cam: Object.assign({}, cam), W, H, sel, tiles: pickTiles.length, planes: planes.filter((p) => p.active).length, pin: pin && pin.visible }; },   // 測試用
  };
})();
