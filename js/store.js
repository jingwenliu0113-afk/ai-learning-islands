/* 資料模型、存檔、間隔複習（Leitner 盒子）、經濟系統（金幣、素材、蟲、星星、等級） */
(function () {
  'use strict';
  const G = (window.G = window.G || {});
  const M = window.GAME_MANIFEST;
  const CONTENT = window.GAME_LESSONS || {};
  const KEY = 'ai-islands-save-v1';           // 沿用 1.0 的存檔鍵名，舊進度直接沿用
  const DAY = 86400000;
  const INTERVAL_DAYS = [0, 1, 3, 7, 21];     // 盒子 0–4 各自隔幾天再考
  const RANKS = [
    [0, '見習生'], [150, '實習工程師'], [500, '初級工程師'], [1200, '工程師'],
    [2500, '資深工程師'], [4500, '技術主管'], [7000, '架構師'],
  ];

  /* ---------- 遊戲設定資料 ---------- */
  // 每個領域的素材與在「我的小島」能蓋的裝飾
  const MATS = {
    ml: { name: '樹苗', icon: '🌱', deco: '大樹' },
    dl: { name: '積木', icon: '🧱', deco: '積木塔' },
    cv: { name: '鏡片', icon: '🔍', deco: '望遠鏡' },
    nlp: { name: '書頁', icon: '📜', deco: '小圖書館' },
    llm: { name: '水晶', icon: '💎', deco: '水晶柱' },
    robot: { name: '齒輪', icon: '⚙️', deco: '齒輪塔' },
    tools: { name: '螺絲', icon: '🔩', deco: '工作坊' },
    ai: { name: '燈油', icon: '🪔', deco: '小燈塔' },
  };
  const BUILD_COST = [5, 10, 20];               // 裝飾升到 1、2、3 級要的素材
  // 九種蟲：答錯時出現，之後答對同一題就抓到
  const BUGS = [
    { id: 'hopper', name: '混淆蚱蜢', color: '#7cc04b', when: '單選題選到很像、但不是正確的選項時出現。', how: '回去看重點卡的「是什麼」，把兩個很像的選項各用一句話說出差別。' },
    { id: 'beetle', name: '顛倒甲蟲', color: '#d0503f', when: '是非題把對的判成錯、或錯的判成對。', how: '先圈出敘述裡的關鍵字：一定、只有、所有、不會、永遠。這些字最常讓敘述變成錯的。' },
    { id: 'firefly', name: '漏網螢火蟲', color: '#f2c94c', when: '複選題漏選或多選。', how: '每個選項各自判斷對錯，不要只挑看起來最像的一兩個。' },
    { id: 'spider', name: '亂配蜘蛛', color: '#5b5f72', when: '配對題配錯。', how: '先配最有把握的那一組，剩下的用刪去法。' },
    { id: 'ant', name: '插隊螞蟻', color: '#a2582f', when: '排序題的順序錯了。', how: '先找出「第一步」和「最後一步」，再排中間；想想每一步需要上一步的什麼結果。' },
    { id: 'centipede', name: '程式蜈蚣', color: '#9b59b6', when: '讀程式題看錯。', how: '一行一行追變數的值，必要時在紙上寫下來，不要用猜的。' },
    { id: 'cicada', name: '結巴蟬', color: '#4f9a94', when: '面試口述題沒講到六成要點。', how: '先講結論，再講原因與一個例子；照要點清單反覆講到順。' },
    { id: 'snail', name: '遺忘蝸牛', color: '#c98bb9', when: '以前答對過，複習時卻答錯。', how: '每天把雜草拔掉，別讓題目放太久才回來看。' },
    { id: 'mosquito', name: '粗心蚊子', color: '#7a8a99', when: '3 秒內就作答，而且答錯。', how: '把題目讀完、看完全部選項再作答。' },
  ];
  const BUG_BY_TYPE = { single: 'hopper', tf: 'beetle', multi: 'firefly', match: 'spider', order: 'ant', code: 'centipede', interview: 'cicada' };
  // 打扮：大部分免費；lv = 需要等級、price = 需要金幣
  const WARDROBE = {
    skin: ['#f9dcc4', '#f3c6a5', '#e3a37f', '#c98a62', '#9c6644', '#6e4630'],
    hairColor: ['#2b2b2b', '#5a3a22', '#8b5a2b', '#c58c4a', '#e8c766', '#e06a4e', '#e98fb4', '#8f7ad8', '#4a8fd6', '#e9e9e9'],
    hair: [
      { id: 'short', name: '短髮' }, { id: 'side', name: '旁分' }, { id: 'bob', name: '鮑伯頭' }, { id: 'long', name: '長直髮' },
      { id: 'bun', name: '包包頭' }, { id: 'pony', name: '馬尾', lv: 2 }, { id: 'spiky', name: '刺刺頭', lv: 4 }, { id: 'bald', name: '光頭', price: 40 },
    ],
    outfit: [
      { id: 'tee', name: 'T 恤' }, { id: 'stripe', name: '條紋衫' }, { id: 'hoodie', name: '帽 T', lv: 3 },
      { id: 'vest', name: '工程師背心', price: 60 }, { id: 'lab', name: '實驗袍', lv: 6 }, { id: 'suit', name: '面試西裝', price: 150 },
    ],
    outfitColor: ['#e8735a', '#f2b84b', '#6cbf5a', '#4fa6e0', '#9d82e0', '#ea6a80', '#2fb5a5', '#5b6474', '#f4f1ea'],
    hat: [
      { id: 'none', name: '不戴' }, { id: 'beanie', name: '毛帽' }, { id: 'cap', name: '棒球帽', price: 60 },
      { id: 'straw', name: '草帽', lv: 3 }, { id: 'grad', name: '學士帽', lv: 8 }, { id: 'crown', name: '皇冠', lv: 12 },
      { id: 'pirate', name: '海盜帽', rare: '開寶箱' }, { id: 'fisher', name: '漁夫帽', rare: '釣到傳說魚' },
    ],
    acc: [
      { id: 'none', name: '不戴' }, { id: 'glasses', name: '眼鏡' }, { id: 'scarf', name: '圍巾', lv: 4 },
      { id: 'backpack', name: '背包', price: 50 }, { id: 'headphones', name: '耳機', price: 80 }, { id: 'badge', name: '面試名牌', lv: 10 },
      { id: 'parrot', name: '鸚鵡', rare: '完成島民任務' },
    ],
  };
  const DEFAULT_AVATAR = { name: '', skin: 1, hair: 'short', hairColor: 1, outfit: 'tee', outfitColor: '#e8735a', hat: 'none', acc: 'none' };

  /* ---------- 建立資料模型 ---------- */
  G.regions = {};
  M.regions.forEach((r) => { G.regions[r.id] = Object.assign({ lessons: [] }, r); });
  G.lessons = [];
  G.lessonById = {};
  G.qIndex = {};
  M.lessons.forEach((l, li) => {
    const c = CONTENT[l.id] || null;
    const lesson = Object.assign({}, l, {
      order: li, region: G.regions[l.region], content: c, links: [],
      summary: c ? c.summary : '', takeaways: c ? c.takeaways : [],
      materials: c ? c.materials : (l.sources || []).map((p) => ({ label: p.split('/').filter(Boolean).pop(), path: p })),
      concepts: [],
    });
    if (c) {
      c.concepts.forEach((con, ci) => {
        const concept = { id: con.id, name: con.name, card: con.card, lesson, index: ci, questions: [] };
        con.questions.forEach((q, qi) => {
          const qq = Object.assign({}, q, { id: l.id + '.' + con.id + '.q' + (qi + 1), concept, lesson });
          concept.questions.push(qq);
          G.qIndex[qq.id] = qq;
        });
        lesson.concepts.push(concept);
      });
    }
    G.lessons.push(lesson);
    G.lessonById[l.id] = lesson;
    lesson.region.lessons.push(lesson);
  });
  G.links = [];
  M.links.forEach(([a, b, tag, why]) => {
    const A = G.lessonById[a], B = G.lessonById[b];
    if (!A || !B) return;
    const link = { a: A, b: B, tag, why };
    G.links.push(link);
    A.links.push({ to: B, tag, why, link });
    B.links.push({ to: A, tag, why, link });
  });

  /* ---------- 存檔 ---------- */
  const blank = () => ({
    v: 2, q: {}, xp: 0, streak: { last: '', n: 0, best: 0 }, log: [], visited: {}, read: {},
    settings: { labels: true, time: 'real', sound: true },
    tutorialDone: false, created: Date.now(),
    coins: 0, mats: {}, bugs: { active: {}, caught: {}, first: {}, seen: {} },
    stars: {}, course: {}, courseStep: {}, daily: { date: '', done: false, task: null },
    shields: 0, streakPaid: {}, avatar: Object.assign({}, DEFAULT_AVATAR), owned: {}, home: {},
    pos: null, levelSeen: 1,
    play: {},   // 新玩法：魚簍、寶箱、島民任務、小遊戲紀錄（play.js 管理）
  });
  let state = blank();
  let saveTimer = null;
  let storageOk = true;
  let headTotal = 0;        // 全部題數（算頭的大小用，第一次用到時才數）

  const dayStr = (t) => {
    const d = new Date(t || Date.now());
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const dayIndex = (s) => { const [y, m, d] = s.split('-').map(Number); return Math.round(new Date(y, m - 1, d).getTime() / DAY); };

  function migrate(obj) {
    const s = Object.assign(blank(), obj);
    const b = blank();
    s.settings = Object.assign(b.settings, obj.settings || {});
    if (obj.settings && obj.settings.night === true && !obj.settings.time) s.settings.time = 'night';
    s.streak = Object.assign(b.streak, obj.streak || {});
    s.bugs = Object.assign(b.bugs, obj.bugs || {});
    s.avatar = Object.assign({}, DEFAULT_AVATAR, obj.avatar || {});
    s.daily = Object.assign(b.daily, obj.daily || {});
    s.play = Object.assign({}, obj.play || {});
    s.v = 2;
    return s;
  }

  const store = (G.store = {
    get state() { return state; },
    get storageOk() { return storageOk; },
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) state = migrate(JSON.parse(raw));
      } catch (e) { storageOk = false; }
      state.levelSeen = Math.max(state.levelSeen || 1, 1);
    },
    save() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { storageOk = false; }
      }, 200);
    },
    reset() { state = blank(); state.tutorialDone = true; store.save(); },
    exportText() { return JSON.stringify(state); },
    importText(text) {
      const obj = JSON.parse(text);
      if (!obj || typeof obj !== 'object' || !obj.q) throw new Error('不是這個遊戲的存檔');
      state = migrate(obj);
      store.save();
    },

    /* ---------- 等級 ---------- */
    level(xp) {
      xp = xp == null ? state.xp : xp;
      let lv = 1, need = 100, floor = 0;
      while (xp >= floor + need) { floor += need; lv++; need = 100 + 30 * (lv - 1); }
      return { lv, floor, need, into: xp - floor };
    },
    rank() {
      let i = 0;
      while (i + 1 < RANKS.length && state.xp >= RANKS[i + 1][0]) i++;
      const next = RANKS[i + 1];
      return { name: RANKS[i][1], xp: state.xp, floor: RANKS[i][0], next: next ? next[0] : null, nextName: next ? next[1] : null };
    },
    gainXP(n) { state.xp += Math.max(0, Math.round(n)); store.save(); },

    /* ---------- 金幣與素材 ---------- */
    addCoins(n) { state.coins = Math.max(0, state.coins + n); store.save(); },
    spendCoins(n) { if (state.coins < n) return false; state.coins -= n; store.save(); return true; },
    mat(rid) { return state.mats[rid] || 0; },
    addMat(rid, n) { state.mats[rid] = (state.mats[rid] || 0) + n; store.save(); },

    /* ---------- 題目狀態 ---------- */
    qs(id) { return state.q[id]; },
    isDue(id, now) { const s = state.q[id]; return !!s && s.d <= (now || Date.now()); },
    /** 記錄一次作答。opts: {hint, ms}。回傳獎勵與蟲的變化 */
    answer(q, correct, opts) {
      opts = opts || {};
      const now = Date.now();
      let s = state.q[q.id];
      const first = !s;
      const wasDue = !!s && s.d <= now;
      const wasRight = !!s && s.r > 0;
      if (!s) s = state.q[q.id] = { b: 0, d: now, r: 0, w: 0, t: now, lw: 0 };
      const firstRight = correct && s.r === 0;
      if (correct) { s.b = first ? 2 : Math.min(4, s.b + 1); s.r++; s.lw = 0; }
      else { s.b = Math.max(0, Math.min(s.b, 2) - 1); s.w++; s.lw = 1; }
      s.t = now;
      s.d = now + INTERVAL_DAYS[s.b] * DAY;
      const res = { first, xp: 0, coins: 0, mat: 0, bugSpawn: null, bugCaught: null, weeded: correct && wasDue };
      if (correct) {
        res.xp = (q.type === 'interview' ? 20 : 10) + (first ? 5 : 0);
        if (!opts.hint) res.xp = Math.round(res.xp * 1.2);       // 沒用提示多拿 20%
        res.coins = firstRight ? 5 : wasDue ? 3 : 1;
        if (firstRight) { res.mat = 1; store.addMat(q.lesson.region.id, 1); }
        const act = state.bugs.active[q.id];
        if (act) {                                              // 抓到蟲
          delete state.bugs.active[q.id];
          state.bugs.caught[act.type] = (state.bugs.caught[act.type] || 0) + 1;
          if (!state.bugs.first[act.type]) state.bugs.first[act.type] = now;
          res.bugCaught = act.type;
        }
      } else if (!state.bugs.active[q.id]) {                    // 冒出一隻野生的蟲
        let type = BUG_BY_TYPE[q.type] || 'hopper';
        if (wasDue && wasRight) type = 'snail';
        if (opts.ms != null && opts.ms < 3000 && q.type !== 'interview') type = 'mosquito';
        state.bugs.active[q.id] = { type, t: now, lesson: q.lesson.id };
        res.bugSpawn = type;
      }
      state.xp += res.xp;
      state.coins += res.coins;
      store.touchStreak(now);
      store.save();
      if (store.onAnswer) store.onAnswer(q, correct, res);   // 島民任務的進度（play.js）
      return res;
    },
    /** 課程中的小測驗：不影響複習排程，答對 +3 XP */
    miniAnswer(correct) { if (correct) { state.xp += 3; store.save(); return 3; } return 0; },

    /* ---------- 連續天數與護盾 ---------- */
    touchStreak(now) {
      const td = dayStr(now);
      const st = state.streak;
      if (st.last === td) return;
      if (!st.last) st.n = 1;
      else {
        const gap = dayIndex(td) - dayIndex(st.last) - 1;    // 中間漏掉幾天
        if (gap <= 0) st.n += 1;
        else if (gap <= state.shields) { state.shields -= gap; st.n += 1; store.log('護盾保住了連續天數（用掉 ' + gap + ' 個）'); }
        else st.n = 1;
      }
      st.last = td;
      st.best = Math.max(st.best || 0, st.n);
      [[3, 20], [7, 50], [30, 200]].forEach(([k, c]) => {
        if (st.n >= k && !state.streakPaid[k]) { state.streakPaid[k] = 1; state.coins += c; store.log('連續 ' + k + ' 天，獎勵 ' + c + ' 金幣'); }
      });
    },
    streak() {
      const st = state.streak;
      if (!st.last) return 0;
      const gap = dayIndex(dayStr()) - dayIndex(st.last) - 1;
      if (gap <= 0) return st.n;
      return gap <= state.shields ? st.n : 0;
    },
    answeredToday() { return state.streak.last === dayStr(); },
    buyShield() {
      if (state.shields >= 2) return '最多只能持有 2 個護盾';
      if (!store.spendCoins(50)) return '金幣不夠（要 50）';
      state.shields++; store.save(); return '';
    },

    /* ---------- 概念與課的進度 ---------- */
    conceptScore(c) {
      if (!c.questions.length) return 0;
      let sum = 0;
      c.questions.forEach((q) => { const s = state.q[q.id]; if (s) sum += Math.min(s.b, 3); });
      return sum / (c.questions.length * 3);
    },
    conceptLevel(c) {
      const s = store.conceptScore(c);
      return s <= 0 ? 0 : s < 0.5 ? 1 : s < 0.85 ? 2 : 3;
    },
    lessonProgress(l) {
      if (!l.concepts.length) return 0;
      return l.concepts.reduce((a, c) => a + store.conceptLevel(c), 0) / (l.concepts.length * 3);
    },
    lessonDue(l, now) {
      now = now || Date.now();
      let n = 0;
      l.concepts.forEach((c) => c.questions.forEach((q) => { if (store.isDue(q.id, now)) n++; }));
      return n;
    },
    lessonDueList(l) {
      const now = Date.now();
      const out = [];
      l.concepts.forEach((c) => c.questions.forEach((q) => { if (store.isDue(q.id, now)) out.push(q); }));
      return out.sort((a, b) => state.q[a.id].d - state.q[b.id].d);
    },
    lessonStarted(l) { return l.concepts.some((c) => c.questions.some((q) => state.q[q.id])); },
    lessonSolved(l) { let n = 0; l.concepts.forEach((c) => c.questions.forEach((q) => { const s = state.q[q.id]; if (s && s.r > 0) n++; })); return n; },
    lessonTotal(l) { return l.concepts.reduce((a, c) => a + c.questions.length, 0); },
    markVisited(l) { if (!state.visited[l.id]) { state.visited[l.id] = Date.now(); store.save(); } },

    /* ---------- 課程與關卡 ---------- */
    courseDone(l) { return !!state.course[l.id]; },
    courseStep(l) { return state.courseStep[l.id] || 0; },
    setCourseStep(l, i) { state.courseStep[l.id] = i; store.save(); },
    completeCourse(l) {
      if (state.course[l.id]) return null;
      state.course[l.id] = Date.now();
      delete state.courseStep[l.id];
      state.xp += 40; state.coins += 15;
      store.log('上完第 ' + l.no + ' 堂「' + l.title + '」的課程，+40 XP、+15 金幣');
      store.save();
      return { xp: 40, coins: 15 };
    },
    /** 每堂課的關卡：每個概念一關（非面試題），最後一關是面試官 Boss */
    rounds(l) {
      const out = [];
      l.concepts.forEach((c) => {
        const qs = c.questions.filter((q) => q.type !== 'interview');
        if (!qs.length) return;
        const hard = qs.filter((q) => ['multi', 'match', 'order', 'code'].includes(q.type)).length;
        out.push({ key: l.id + '.' + c.id, lesson: l, concept: c, questions: qs, boss: false,
          title: c.name, diff: hard >= qs.length / 2 ? '中等' : '簡單' });
      });
      const iv = [];
      l.concepts.forEach((c) => c.questions.forEach((q) => { if (q.type === 'interview') iv.push(q); }));
      if (iv.length) out.push({ key: l.id + '.boss', lesson: l, concept: null, questions: iv, boss: true, title: '面試官', diff: 'Boss' });
      return out;
    },
    stars(key) { return state.stars[key] || 0; },
    finishRound(round, right, total) {
      const st = right >= total ? 3 : right / total >= 0.7 ? 2 : 1;
      const prev = state.stars[round.key] || 0;
      const firstClear = !prev;
      if (st > prev) state.stars[round.key] = st;
      let coins = 0;
      if (firstClear) { coins = round.boss ? 40 : 20; state.coins += coins; }
      state.daily.done = state.daily.date === dayStr() ? true : state.daily.done;
      store.save();
      return { stars: st, prev, firstClear, coins };
    },
    lessonStars(l) { const r = store.rounds(l); return { got: r.reduce((a, x) => a + store.stars(x.key), 0), max: r.length * 3, cleared: r.filter((x) => store.stars(x.key)).length, n: r.length }; },

    /* ---------- 每日任務 ---------- */
    daily() {
      const td = dayStr();
      if (state.daily.date !== td) {
        state.daily = { date: td, done: false, task: null };
        const due = store.dueQuestions().length;
        if (due) state.daily.task = { kind: 'weed', n: Math.min(due, 5) };
        else {
          const l = G.lessons.find((x) => x.concepts.length && !store.courseDone(x)) ||
            G.lessons.find((x) => store.rounds(x).some((r) => store.stars(r.key) < 3));
          state.daily.task = l ? { kind: store.courseDone(l) ? 'round' : 'course', lesson: l.id } : { kind: 'interview' };
        }
        store.save();
      }
      return state.daily;
    },
    dailyDone() { const d = store.daily(); if (!d.done) { d.done = true; state.coins += 10; store.log('完成今日任務，+10 金幣'); store.save(); return true; } return false; },

    /* ---------- 打扮與小島 ---------- */
    itemState(kind, item) {
      if (!item || typeof item !== 'object') return { ok: true };
      if (item.rare && !state.owned[kind + ':' + item.id]) return { ok: false, why: item.rare, rare: true };   // 稀有裝扮：只能從冒險拿到
      if (item.lv && store.level().lv < item.lv) return { ok: false, why: 'Lv ' + item.lv };
      if (item.price && !state.owned[kind + ':' + item.id]) return { ok: false, buy: item.price };
      return { ok: true };
    },
    buyItem(kind, item) {
      if (!store.spendCoins(item.price)) return false;
      state.owned[kind + ':' + item.id] = Date.now(); store.save(); return true;
    },
    setAvatar(a) { state.avatar = Object.assign({}, DEFAULT_AVATAR, a); store.save(); },
    homeLevel(rid) { return state.home[rid] || 0; },
    build(rid) {
      const lv = store.homeLevel(rid);
      if (lv >= 3) return '已經是最高級';
      const cost = BUILD_COST[lv];
      if (store.mat(rid) < cost) return MATS[rid].name + '不夠（要 ' + cost + '，現在 ' + store.mat(rid) + '）';
      state.mats[rid] -= cost; state.home[rid] = lv + 1;
      store.log('在我的小島把「' + MATS[rid].deco + '」蓋到第 ' + (lv + 1) + ' 級');
      store.save(); return '';
    },
    savePos(p) { state.pos = p; store.save(); },

    /* ---------- 出題 ---------- */
    allQuestions() { return Object.values(G.qIndex); },
    dueQuestions(limit) {
      const now = Date.now();
      const list = store.allQuestions().filter((q) => store.isDue(q.id, now));
      list.sort((a, b) => state.q[a.id].d - state.q[b.id].d);
      return limit ? list.slice(0, limit) : list;
    },
    dueWithin(days) { const t = Date.now() + days * DAY; return store.allQuestions().filter((q) => { const s = state.q[q.id]; return s && s.d > Date.now() && s.d <= t; }).length; },
    weakQuestions(limit) {
      const list = store.allQuestions().filter((q) => { const s = state.q[q.id]; return s && (s.lw || s.w > s.r); });
      list.sort((a, b) => (state.q[b.id].w - state.q[b.id].r) - (state.q[a.id].w - state.q[a.id].r));
      return limit ? list.slice(0, limit) : list;
    },
    lessonSession(l, n, concept) {
      const now = Date.now();
      const pool = [];
      (concept ? [concept] : l.concepts).forEach((c) => c.questions.forEach((q) => pool.push(q)));
      const rank = (q) => { const s = state.q[q.id]; if (!s) return 1; if (s.d <= now) return 0; return 2 + s.b; };
      const shuffled = G.util.shuffle(pool.slice());
      shuffled.sort((a, b) => rank(a) - rank(b));
      return shuffled.slice(0, n);
    },
    interviewQuestions(regionIds, n) {
      const set = new Set(regionIds);
      const pool = store.allQuestions().filter((q) => q.type === 'interview' && set.has(q.lesson.region.id));
      const w = (q) => { const s = state.q[q.id]; return !s ? 0 : s.lw ? 1 : 2 + s.b; };
      return G.util.shuffle(pool).sort((a, b) => w(a) - w(b)).slice(0, n);
    },
    randomQuestions(n) {
      const started = store.allQuestions().filter((q) => q.type !== 'interview' && store.lessonStarted(q.lesson));
      const pool = started.length >= n ? started : store.allQuestions().filter((q) => q.type !== 'interview');
      return G.util.shuffle(pool).slice(0, n);
    },
    activeBugs(l) { return Object.entries(state.bugs.active).filter(([, b]) => !l || b.lesson === l.id).map(([qid, b]) => Object.assign({ qid }, b)); },

    /* ---------- 統計 ---------- */
    totals() {
      let concepts = 0, built = 0, mastered = 0, islands = 0, islandsDone = 0, questions = 0, seen = 0, solved = 0;
      G.lessons.forEach((l) => {
        if (!l.concepts.length) return;
        islands++;
        let all3 = true;
        l.concepts.forEach((c) => {
          concepts++;
          const lv = store.conceptLevel(c);
          if (lv >= 2) built++;
          if (lv >= 3) mastered++; else all3 = false;
          c.questions.forEach((q) => { questions++; const s = state.q[q.id]; if (s) { seen++; if (s.r > 0) solved++; } });
        });
        if (all3) islandsDone++;
      });
      return { concepts, built, mastered, islands, islandsDone, questions, seen, solved, due: store.dueQuestions().length, weak: store.weakQuestions().length };
    },
    /** 頭的大小：答對過的題越多頭越大，全部答對剛好 2.5 倍。
     *  前面長得比後面快一點（1349 題時：50 題約 1.1 倍、300 題約 1.55 倍、一半約 2 倍、全部 2.5 倍） */
    headScale(solved) {
      const n = solved == null ? store.totals().solved : solved;
      if (!headTotal) G.lessons.forEach((l) => l.concepts.forEach((c) => { headTotal += c.questions.length; }));
      const x = Math.min(1, n / Math.max(1, headTotal));                 // 答對的比例 0～1
      return 1 + 1.5 * (1 - Math.exp(-1.5 * x)) / (1 - Math.exp(-1.5));   // 比例 1 時剛好 1 + 1.5 = 2.5
    },
    log(text) {
      state.log.unshift({ t: Date.now(), text });
      if (state.log.length > 150) state.log.length = 150;
      store.save();
    },
    dayStr, INTERVAL_DAYS, MATS, BUGS, BUG_BY_TYPE, WARDROBE, BUILD_COST, DEFAULT_AVATAR,
    bug(id) { return BUGS.find((b) => b.id === id); },
  });

  /* ---------- 小工具 ---------- */
  G.util = {
    /** 觸控裝置（手機、平板）：不要自動把游標放進輸入框，否則鍵盤一跳出來，畫面會被捲走、看不到題目 */
    touch() { return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || document.body.classList.contains('touch'); },
    shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
    esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    /** 把「英文(中文)」的中文註解包成較淡的樣式，並把 `code` 轉成 <code> */
    rich(s) {
      return G.util.esc(s)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/([A-Za-z][A-Za-z0-9 .+#/&\-]*)\(([^()]*[一-鿿][^()]*)\)/g, '$1<span class="zh">($2)</span>');
    },
    el(tag, attrs, children) {
      const e = document.createElement(tag);
      if (attrs) Object.keys(attrs).forEach((k) => {
        if (k === 'class') e.className = attrs[k];
        else if (k === 'html') e.innerHTML = attrs[k];
        else if (k === 'text') e.textContent = attrs[k];
        else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k]);
      });
      (children || []).forEach((c) => { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
      return e;
    },
    fmtTime(t) {
      const d = new Date(t);
      return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    },
    fmtDate(t) { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); },
    circled(n) { return '①②③④⑤⑥⑦⑧⑨⑩'[n] || String(n + 1); },
    /** 教材連結。分享版（window.GAME_SHARED）沒有附課程檔案，只顯示名稱、不做連結 */
    matLink(m, children) {
      if (window.GAME_SHARED) return G.util.el('div', { class: 'mat-off', title: '分享版沒有附教材檔案' }, children);
      return G.util.el('a', { href: '../' + m.path.split('/').map(encodeURIComponent).join('/'), target: '_blank', rel: 'noopener' }, children);
    },
    firstSentence(s) { const m = String(s || '').match(/^[^。！？]*[。！？]?/); return (m ? m[0] : s).trim(); },
  };
})();
