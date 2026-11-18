/* 新玩法
   - 島上小遊戲：碼頭釣魚（魚上鉤要答題）、我的小島遊戲機台的翻牌配對與 60 秒快問快答
   - 冒險：坐船時遇到海怪或漂流瓶、每天每座島一個寶箱（知識鎖）、島民的支線任務
   - 稀有裝扮：海盜帽（寶箱）、漁夫帽（傳說魚）、鸚鵡（島民任務）
   會影響複習排程的只有「認真答的題」（釣魚、寶箱、海怪、漂流瓶），翻牌和快問快答只是練習，不改排程。 */
(function () {
  'use strict';
  const G = window.G;
  const store = G.store;
  const { el, rich, shuffle } = G.util;
  const snd = (n) => G.sound && G.sound.play(n);
  const toast = (t) => G.ui.toast(t);
  const MG_CAP = 150;   // 小遊戲與事件每天最多給的額外金幣（避免一直刷）

  /* ---------- 資料 ---------- */
  const RARITY = ['普通', '稀有', '傳說'];
  const FISH = {
    ml: [['小梯度魚', '🐟'], ['隨機森林鱒', '🐠'], ['XGBoost 旗魚', '🐡']],
    dl: [['神經元沙丁魚', '🐟'], ['卷積河豚', '🐠'], ['殘差巨鯨', '🐋']],
    cv: [['像素孔雀魚', '🐟'], ['YOLO 飛魚', '🐠'], ['擴散魷魚', '🦑']],
    nlp: [['詞嵌入鯖魚', '🐟'], ['注意力鰻魚', '🐠'], ['BERT 藍鯨', '🐳']],
    llm: [['Token 小丑魚', '🐟'], ['RAG 石斑', '🐠'], ['Transformer 巨鯊', '🦈']],
    robot: [['PID 鯉魚', '🐟'], ['SLAM 章魚', '🐙'], ['PPO 海豚', '🐬']],
    tools: [['Bash 小蝦', '🦐'], ['API 魟魚', '🐠'], ['Docker 鯨鯊', '🐋']],
    ai: [['A* 海星魚', '🐟'], ['貝氏龍蝦', '🦞'], ['卡爾曼劍魚', '🐡']],
  };
  const fishId = (rid, k) => rid + '.' + k;
  const NPCS = {
    ml: { name: '資料科學家 小林', look: { hair: 'side', hairColor: 1, skin: 1, outfit: 'lab', outfitColor: '#f4f1ea', hat: 'none', acc: 'glasses' }, line: '我的模型一直過擬合，先陪我把基本功練熟吧！' },
    dl: { name: '訓練師 阿哲', look: { hair: 'spiky', hairColor: 0, skin: 2, outfit: 'hoodie', outfitColor: '#f2914e', hat: 'none', acc: 'none' }, line: 'GPU 又在燒了……趁訓練的空檔，幫我個忙？' },
    cv: { name: '攝影師 Iris', look: { hair: 'bob', hairColor: 7, skin: 0, outfit: 'stripe', outfitColor: '#4fa6e0', hat: 'cap', acc: 'none' }, line: '鏡頭裡看到的，不一定是模型看到的。' },
    nlp: { name: '語言學家 小語', look: { hair: 'long', hairColor: 0, skin: 1, outfit: 'vest', outfitColor: '#9d82e0', hat: 'none', acc: 'scarf' }, line: '每個字都是一個向量，你也是。' },
    llm: { name: 'Prompt 工程師 Kai', look: { hair: 'short', hairColor: 8, skin: 3, outfit: 'hoodie', outfitColor: '#ea6a80', hat: 'none', acc: 'headphones' }, line: '我在等模型回覆，你先幫我跑個任務吧。' },
    robot: { name: '機器人工程師 阿德', look: { hair: 'bald', hairColor: 0, skin: 4, outfit: 'vest', outfitColor: '#2fb5a5', hat: 'none', acc: 'backpack' }, line: '我的機器人又撞牆了，需要一點幫手。' },
    tools: { name: 'DevOps 小芸', look: { hair: 'pony', hairColor: 5, skin: 1, outfit: 'tee', outfitColor: '#d0a630', hat: 'beanie', acc: 'none' }, line: '部署前最後一關：先幫我把這件事搞定。' },
    ai: { name: '燈塔管理員 老陳', look: { hair: 'short', hairColor: 9, skin: 2, outfit: 'suit', outfitColor: '#5b6474', hat: 'straw', acc: 'none' }, line: '燈塔照亮的是航道，知識照亮的是答案。' },
  };

  /* ---------- 存檔 ---------- */
  function ps() {
    const s = store.state;
    const p = s.play || (s.play = {});
    p.fish = p.fish || {};
    p.quests = p.quests || {};
    p.chest = p.chest || { day: '', opened: {} };
    p.chests = p.chests || 0;
    p.done = p.done || 0;
    p.monsters = p.monsters || 0;
    p.quick = p.quick || { best: 0, plays: 0 };
    p.memory = p.memory || { best: 0, plays: 0 };
    p.mg = p.mg || { day: '', coins: 0 };
    return p;
  }
  /** 額外金幣（小遊戲、事件、寶箱、任務）：每天最多 MG_CAP */
  function bonus(n) {
    const p = ps(), td = store.dayStr();
    if (p.mg.day !== td) { p.mg.day = td; p.mg.coins = 0; }
    const got = Math.max(0, Math.min(n, MG_CAP - p.mg.coins));
    p.mg.coins += got;
    store.state.coins += got;
    store.save();
    return got;
  }
  function unlock(kind, id, how) {
    const key = kind + ':' + id;
    if (store.state.owned[key]) return false;
    store.state.owned[key] = Date.now();
    const item = store.WARDROBE[kind].find((x) => x.id === id);
    store.log('稀有裝扮：' + how + '，拿到「' + (item ? item.name : id) + '」');
    store.save();
    snd('fanfare');
    return true;
  }
  const owned = (kind, id) => !!store.state.owned[kind + ':' + id];

  /* ---------- 出題 ---------- */
  const EASY = ['single', 'tf'], MID = ['single', 'code', 'multi', 'tf'], HARD = ['multi', 'match', 'order', 'code'];
  function regionQs(rid, types) {
    const out = [];
    const regs = rid ? [G.regions[rid]] : Object.values(G.regions);
    regs.forEach((r) => r.lessons.forEach((l) => l.concepts.forEach((c) => c.questions.forEach((q) => {
      if (q.type !== 'interview' && (!types || types.includes(q.type))) out.push(q);
    }))));
    return out;
  }
  /** 從題庫挑一題：三成機率挑到期的，其次優先已經開始學的課 */
  function pickQ(rid, types) {
    let pool = regionQs(rid, types);
    if (!pool.length) pool = regionQs(rid, null);
    if (!pool.length) pool = regionQs(null, null);
    const due = pool.filter((q) => store.isDue(q.id));
    if (due.length && Math.random() < 0.3) return due[Math.floor(Math.random() * due.length)];
    const started = pool.filter((q) => store.lessonStarted(q.lesson));
    const src = started.length >= 5 && Math.random() < 0.75 ? started : pool;
    return src[Math.floor(Math.random() * src.length)];
  }
  /** 把一題放進 host，作答後記到複習排程。limit 秒內沒答就算錯。回呼 onDone(correct, res) */
  function askQuestion(q, host, onDone, limit) {
    let over = false, timer = null;
    const prev = G.world.levels(q.lesson);
    const bar = el('div', { class: 'pl-timer' }, [el('i')]);
    if (limit) host.appendChild(bar);
    const box = el('div', { class: 'pl-q' });
    host.appendChild(box);
    box.appendChild(el('div', { class: 'qz-meta' }, [
      el('span', { class: 'chip', style: '--c:' + q.lesson.region.color, text: '第 ' + q.lesson.no + ' 堂 ' + q.lesson.title }),
      el('span', { class: 'chip ghost', text: G.quiz.TYPE_NAMES[q.type] }),
    ]));
    const finish = (correct, detail, info, body) => {
      if (over) return;
      over = true; clearInterval(timer);
      G.quiz.detachKeys();
      const res = store.answer(q, correct, info || {});
      G.world.refresh(q.lesson, prev);
      snd(correct ? 'right' : 'wrong');
      if (res.bugSpawn) setTimeout(() => snd('bug'), 250);
      if (body) {
        body.appendChild(el('div', { class: 'fb ' + (correct ? 'ok' : 'no') }, [
          el('div', { class: 'fb-head' }, [el('b', { text: correct ? '答對了！' : '答錯了' }), res.xp ? el('span', { class: 'rw xp', text: '+' + res.xp + ' XP' }) : null, res.coins ? el('span', { class: 'rw coin', text: '+' + res.coins + ' 金幣' }) : null]),
          res.bugSpawn ? el('div', { class: 'hint', text: '🐛 冒出一隻「' + store.bug(res.bugSpawn).name + '」，之後答對這題就能抓到牠。' }) : null,
          detail || null,
          q.explain ? el('p', { class: 'explain', html: rich(q.explain) }) : null,
        ]));
      }
      G.ui.refreshHud();
      onDone(correct, res);
    };
    G.quiz.mount(q, box, { noHint: true, onAnswered: (correct, detail, info, body) => finish(correct, detail, info, body) });
    if (limit) {
      const t0 = Date.now();
      timer = setInterval(() => {
        if (!bar.isConnected) { clearInterval(timer); return; }
        const left = 1 - (Date.now() - t0) / (limit * 1000);
        bar.firstChild.style.width = Math.max(0, left * 100) + '%';
        bar.classList.toggle('hurry', left < 0.3);
        if (left <= 0) {
          box.querySelectorAll('button').forEach((b) => { b.disabled = true; });
          const body = box.querySelector('.qz-body') || box;
          body.appendChild(el('div', { class: 'hint', text: '⏰ 時間到！' }));
          finish(false, null, {}, body);
        }
      }, 100);
    }
    return () => { over = true; clearInterval(timer); };
  }

  /* ---------- 3D 小道具 ---------- */
  let K = null;   // world 的建模工具
  function group() { return new K.T.Group(); }
  function makeChest(open) {
    const g = group(), P = K.part;
    P(g, K.GEO.box, '#8d5a3b', 0.95, 0.55, 0.62, 0, 0.28, 0);
    [-0.3, 0.3].forEach((x) => P(g, K.GEO.box, '#d4a72c', 0.08, 0.57, 0.64, x, 0.28, 0, { metalness: 0.3, roughness: 0.4 }));
    const lid = group();
    lid.position.set(0, 0.55, -0.31);
    P(lid, K.GEO.box, '#9c6644', 0.97, 0.2, 0.64, 0, 0.1, 0.31);
    P(lid, K.GEO.box, '#d4a72c', 0.16, 0.12, 0.05, 0, 0.0, 0.64, { metalness: 0.3, roughness: 0.4 });
    g.add(lid);
    const gold = group();
    [[-0.2, 0], [0.05, 0.08], [0.22, -0.05], [0, -0.12]].forEach(([x, z]) => P(gold, K.GEO.cyl, '#f2c94c', 0.09, 0.03, 0.09, x, 0.56, z, { metalness: 0.4, roughness: 0.35, emissive: '#b8860b', emissiveIntensity: 0.3 }));
    gold.visible = !!open;
    g.add(gold);
    const spark = new K.T.Mesh(K.GEO.octa, K.mat('#ffe27a', { emissive: '#ffcf33', emissiveIntensity: 0.9, roughness: 0.3 }));
    spark.scale.setScalar(0.14); spark.position.set(0, 1.35, 0);
    spark.visible = !open;
    g.add(spark);
    if (open) lid.rotation.x = -1.9;
    g.userData = { lid, gold, spark };
    return g;
  }
  function makeBooth() {
    const g = group(), P = K.part;
    P(g, K.GEO.box, '#5b6474', 1.4, 2.0, 1.0, 0, 1.0, 0);
    P(g, K.GEO.box, '#20283a', 1.1, 0.75, 0.05, 0, 1.45, 0.51);
    P(g, K.GEO.box, '#7ee0ff', 0.98, 0.62, 0.02, 0, 1.45, 0.54, { emissive: '#3fb8e8', emissiveIntensity: 0.8 });
    P(g, K.GEO.box, '#e8735a', 1.5, 0.35, 1.1, 0, 2.15, 0);
    P(g, K.GEO.box, '#f2b84b', 1.2, 0.2, 0.4, 0, 0.95, 0.65);
    [[-0.3, '#e74c3c'], [0, '#4fa6e0'], [0.3, '#6cbf5a']].forEach(([x, c]) => P(g, K.GEO.cyl, c, 0.06, 0.06, 0.06, x, 1.08, 0.7));
    P(g, K.GEO.cyl, '#2b2522', 0.03, 0.2, 0.03, -0.45, 1.15, 0.65);
    P(g, K.GEO.ball, '#e74c3c', 0.07, 0.07, 0.07, -0.45, 1.27, 0.65);
    return g;
  }
  function makeFishingProp() {
    const g = group(), P = K.part;
    P(g, K.GEO.cyl, '#4fa6e0', 0.22, 0.32, 0.22, 0, 0.18, 0);
    P(g, K.GEO.cyl, '#7a5638', 0.02, 1.6, 0.02, 0.35, 0.75, 0).rotation.z = -0.5;
    P(g, K.GEO.ball, '#e74c3c', 0.06, 0.06, 0.06, 0.78, 1.42, 0);
    return g;
  }
  function makeMarker() {
    const g = group(), P = K.part;
    const bar = P(g, K.GEO.box, '#f2c94c', 0.1, 0.34, 0.1, 0, 0.22, 0, { emissive: '#e0a800', emissiveIntensity: 0.6 });
    const dot = P(g, K.GEO.box, '#f2c94c', 0.1, 0.1, 0.1, 0, -0.03, 0, { emissive: '#e0a800', emissiveIntensity: 0.6 });
    g.userData = { bar, dot };
    return g;
  }
  function makeMonster() {
    const g = group(), P = K.part;
    const c = '#3fa58a';
    [[0, 0.2, 0, 0.55], [0.55, 0.65, 0.2, 0.45], [1.0, 1.2, 0.3, 0.4], [1.25, 1.75, 0.35, 0.42]].forEach(([x, y, z, s]) => P(g, K.GEO.ball, c, s, s, s, x, y, z));
    P(g, K.GEO.ball, c, 0.5, 0.42, 0.55, 1.35, 2.15, 0.55);
    [-0.18, 0.18].forEach((dx) => { P(g, K.GEO.ball, '#ffffff', 0.13, 0.13, 0.13, 1.35 + dx, 2.32, 0.95); P(g, K.GEO.ball, '#1d1d1d', 0.06, 0.06, 0.06, 1.35 + dx, 2.32, 1.06); });
    [-0.25, 0, 0.25].forEach((dx) => P(g, K.GEO.cone6, '#2d7d68', 0.08, 0.3, 0.08, 1.3 + dx, 2.62, 0.4));
    return g;
  }
  function makeBottle() {
    const g = group(), P = K.part;
    P(g, K.GEO.cyl, '#8fd3c8', 0.16, 0.5, 0.16, 0, 0.15, 0, { transparent: true, opacity: 0.75, roughness: 0.2 });
    P(g, K.GEO.cyl, '#8fd3c8', 0.07, 0.2, 0.07, 0, 0.5, 0, { transparent: true, opacity: 0.75, roughness: 0.2 });
    P(g, K.GEO.box, '#f4ead2', 0.14, 0.3, 0.02, 0, 0.15, 0);
    P(g, K.GEO.cyl, '#8d5a3b', 0.06, 0.08, 0.06, 0, 0.62, 0);
    g.rotation.z = 1.2;
    return g;
  }

  /* ---------- 釣魚 ---------- */
  function rollRarity() { const r = Math.random(); return r < 0.65 ? 0 : r < 0.93 ? 1 : 2; }
  function fishing(isl) {
    const rid0 = isl.kind === 'region' ? isl.region.id : null;
    let stopQ = null;
    const view = el('div', { class: 'pl pl-fishing' });
    const render = (phase, data) => {
      if (stopQ) { stopQ(); stopQ = null; }
      view.innerHTML = '';
      view.appendChild(el('div', { class: 'eyebrow', text: '🎣 碼頭釣魚 · ' + isl.name }));
      view.appendChild(el('h2', { text: phase === 'question' ? '魚上鉤了！答對就釣起來' : '釣魚' }));
      const pond = el('div', { class: 'pond' + (phase === 'wait' ? ' wait' : '') + (phase === 'bite' ? ' bite' : '') }, [
        el('span', { class: 'bobber', text: '🔴' }), el('span', { class: 'ripple' }),
      ]);
      if (phase !== 'question') view.appendChild(pond);
      const foot = el('div', { class: 'qz-foot' });
      if (phase === 'ready') {
        view.appendChild(el('p', { class: 'hint', text: rid0 ? '這裡釣得到「' + isl.name + '」的魚。浮標一沉就按「拉竿」，然後在時間內答對題目。越稀有的魚，題目越難、時間越長。' : '我的小島的碼頭什麼魚都有。浮標一沉就按「拉竿」，然後在時間內答對題目。' }));
        foot.append(el('button', { class: 'btn', type: 'button', text: '看魚簍', onclick: () => render('basket') }), el('button', { class: 'btn primary', type: 'button', text: '🎣 拋竿', onclick: cast }));
      } else if (phase === 'wait') {
        view.appendChild(el('p', { class: 'hint', text: '靜靜等待……' }));
      } else if (phase === 'bite') {
        view.appendChild(el('p', { class: 'hint strong', text: '浮標沉下去了！快拉！' }));
        foot.append(el('button', { class: 'btn primary big', type: 'button', text: '拉竿！', onclick: () => { clearTimeout(data.miss); hook(); } }));
      } else if (phase === 'miss') {
        view.appendChild(el('p', { class: 'hint', text: '太慢了，魚跑掉了。再試一次？' }));
        foot.append(el('button', { class: 'btn', type: 'button', text: '收竿', onclick: G.ui.closeModal }), el('button', { class: 'btn primary', type: 'button', text: '再拋一次', onclick: cast }));
      } else if (phase === 'question') {
        const { q, rarity, rid } = data;
        view.appendChild(el('p', { class: 'hint', text: '是' + RARITY[rarity] + '的魚！' + [20, 30, 45][rarity] + ' 秒內答對就釣起來。' }));
        const host = el('div');
        view.appendChild(host);
        stopQ = askQuestion(q, host, (correct) => {
          const after = el('div', { class: 'qz-foot' });
          if (correct) {
            const [name, emo] = FISH[rid][rarity];
            const p = ps();
            const id = fishId(rid, rarity);
            const isNew = !p.fish[id];
            p.fish[id] = (p.fish[id] || 0) + 1;
            const coins = bonus([2, 6, 15][rarity]);
            questProgress(rid0 || rid, 'fish');
            let extra = null;
            if (rarity === 2 && unlock('hat', 'fisher', '釣到傳說魚')) extra = el('div', { class: 'pl-unlock', text: '✨ 稀有裝扮解鎖：漁夫帽！到「打扮」穿上它。' });
            store.save();
            snd('catch');
            host.prepend(el('div', { class: 'pl-catch r' + rarity }, [
              el('span', { class: 'fish-emo', text: emo }),
              el('div', {}, [el('b', { text: (isNew ? '新魚種！' : '') + name }), el('span', { text: RARITY[rarity] + (coins ? '　+' + coins + ' 金幣' : '') + '　魚簍裡共 ' + p.fish[id] + ' 條' })]),
            ]));
            if (extra) host.prepend(extra);
          } else {
            host.prepend(el('div', { class: 'pl-catch miss' }, [el('span', { class: 'fish-emo', text: '💨' }), el('div', {}, [el('b', { text: '魚跑掉了' }), el('span', { text: '看看解析，下次就釣得到。' })])]));
          }
          after.append(el('button', { class: 'btn', type: 'button', text: '收竿', onclick: G.ui.closeModal }), el('button', { class: 'btn primary', type: 'button', text: '再拋一次', onclick: cast }));
          host.appendChild(after);
          after.lastChild.focus({ preventScroll: true });
        }, [20, 30, 45][rarity]);
      } else if (phase === 'basket') {
        const p = ps();
        const total = Object.keys(FISH).length * 3, got = Object.keys(p.fish).length;
        view.appendChild(el('p', { class: 'hint', text: '魚簍：' + got + ' / ' + total + ' 種。每座島有普通、稀有、傳說三種魚；釣到任何一條傳說魚可以拿到漁夫帽。' }));
        view.appendChild(el('div', { class: 'basket' }, Object.keys(FISH).map((rid) => el('div', { class: 'bk-row' }, [
          el('span', { class: 'bk-isl', style: '--c:' + G.regions[rid].color, text: G.regions[rid].name }),
        ].concat(FISH[rid].map(([n, e], k) => {
          const c = p.fish[fishId(rid, k)] || 0;
          return el('span', { class: 'bk-fish r' + k + (c ? '' : ' none'), title: c ? n + '（' + RARITY[k] + '）× ' + c : '還沒釣到' }, [el('i', { text: c ? e : '❔' }), el('em', { text: c ? n : '???' })]);
        }))))));
        foot.append(el('button', { class: 'btn primary', type: 'button', text: '回去釣魚', onclick: () => render('ready') }));
      }
      view.appendChild(foot);
    };
    function cast() {
      snd('click');
      render('wait');
      const wait = 1100 + Math.random() * 2200;
      setTimeout(() => {
        if (!view.isConnected) return;
        snd('splash');
        const miss = setTimeout(() => { if (view.isConnected && view.querySelector('.pond.bite')) render('miss'); }, 1600);
        render('bite', { miss });
      }, wait);
    }
    function hook() {
      const rarity = rollRarity();
      const rid = rid0 || Object.keys(FISH)[Math.floor(Math.random() * 8)];
      const q = pickQ(rid, [EASY, MID, HARD][rarity]);
      render('question', { q, rarity, rid });
    }
    G.ui.modal(view, { wide: true, onLeave: () => { if (stopQ) stopQ(); } });
    render('ready');
  }

  /* ---------- 遊戲機台：翻牌配對 ---------- */
  function arcade() {
    const p = ps();
    G.ui.modal(el('div', { class: 'pl' }, [
      el('div', { class: 'eyebrow', text: '🕹️ 遊戲機台' }),
      el('h2', { text: '小遊戲' }),
      el('p', { class: 'hint', text: '小遊戲是額外練習，不會改變複習排程。每天從小遊戲、事件、寶箱、任務最多拿 ' + MG_CAP + ' 金幣（今天已拿 ' + (p.mg.day === store.dayStr() ? p.mg.coins : 0) + '）。' }),
      el('div', { class: 'modes' }, [
        el('button', { class: 'mode', type: 'button', onclick: () => memorySetup() }, [el('b', { text: '🃏 翻牌配對' }), el('span', { text: '把名詞和它的意思配成一對，步數越少越好。最佳：' + (p.memory.best ? p.memory.best + ' 步' : '還沒玩過') })]),
        el('button', { class: 'mode', type: 'button', onclick: () => quickStart() }, [el('b', { text: '⚡ 60 秒快問快答' }), el('span', { text: '是非題和單選題連續答，連對有加乘，答錯扣 3 秒。最高分：' + (p.quick.best || 0) })]),
        el('button', { class: 'mode', type: 'button', onclick: () => { G.ui.closeModal(); toast('走到任何一座島的碼頭盡頭，按 E 或點提示就能釣魚'); } }, [el('b', { text: '🎣 釣魚' }), el('span', { text: '到任何一座島的碼頭盡頭。魚簍：' + Object.keys(p.fish).length + ' / 24 種' })]),
      ]),
    ]), { wide: true });
  }
  function memorySetup() {
    const regs = Object.values(G.regions).filter((r) => regionQs(r.id, ['match']).length);
    G.ui.modal(el('div', { class: 'pl' }, [
      el('div', { class: 'eyebrow', text: '🃏 翻牌配對' }),
      el('h2', { text: '選一個領域' }),
      el('div', { class: 'picks' }, [el('button', { class: 'pick', type: 'button', text: '全部領域', onclick: () => memory(null) })].concat(regs.map((r) => el('button', { class: 'pick', type: 'button', style: '--c:' + r.color, text: r.name, onclick: () => memory(r.id) })))),
    ]), { wide: true });
  }
  function memory(rid) {
    // 從配對題拿 6 對「名詞 ↔ 意思」
    const pairs = [], seen = new Set();
    shuffle(regionQs(rid, ['match']).slice()).forEach((q) => shuffle(q.pairs.slice()).forEach((pr) => {
      if (pairs.length >= 6) return;
      const k = pr[0] + '|' + pr[1];
      if (seen.has(pr[0]) || seen.has(pr[1]) || k.length > 90) return;
      seen.add(pr[0]); seen.add(pr[1]);
      pairs.push({ a: pr[0], b: pr[1], q });
    }));
    if (pairs.length < 4) { toast('這個領域的配對題不夠，換一個試試'); return; }
    const cards = shuffle(pairs.flatMap((pr, i) => [{ i, text: pr.a, side: 'a' }, { i, text: pr.b, side: 'b' }]));
    let open = [], moves = 0, matched = 0, lock = false;
    const t0 = Date.now();
    const info = el('div', { class: 'mem-info' });
    const upd = () => { info.textContent = '步數 ' + moves + '　配對 ' + matched + ' / ' + pairs.length; };
    const grid = el('div', { class: 'mem-grid' });
    cards.forEach((c) => {
      const b = el('button', { class: 'mem-card ' + c.side, type: 'button' }, [el('span', { class: 'back', text: '?' }), el('span', { class: 'front', html: rich(c.text) })]);
      c.el = b;
      b.addEventListener('click', () => {
        if (lock || b.classList.contains('up') || b.classList.contains('done')) return;
        b.classList.add('up'); snd('click');
        open.push(c);
        if (open.length < 2) return;
        moves++;
        const [x, y] = open;
        if (x.i === y.i && x.side !== y.side) {
          x.el.classList.add('done'); y.el.classList.add('done'); matched++; open = []; snd('right');
          if (matched === pairs.length) setTimeout(done, 500);
        } else {
          lock = true;
          setTimeout(() => { x.el.classList.remove('up'); y.el.classList.remove('up'); open = []; lock = false; }, 950);
        }
        upd();
      });
      grid.appendChild(b);
    });
    upd();
    function done() {
      const p = ps();
      const sec = Math.round((Date.now() - t0) / 1000);
      const isBest = !p.memory.best || moves < p.memory.best;
      if (isBest) p.memory.best = moves;
      p.memory.plays++;
      const coins = bonus(Math.max(5, 30 - (moves - pairs.length) * 2));
      store.save(); snd('fanfare'); G.ui.refreshHud();
      G.ui.modal(el('div', { class: 'pl' }, [
        el('div', { class: 'eyebrow', text: '🃏 翻牌配對' }),
        el('h2', { text: '全部配對完成！' }),
        el('p', { class: 'pl-big', text: moves + ' 步 · ' + sec + ' 秒' + (isBest ? '　🏆 新紀錄' : '') }),
        coins ? el('div', { class: 'rewards' }, [el('span', { class: 'rw coin', text: '+' + coins + ' 金幣' })]) : el('p', { class: 'hint', text: '今天的小遊戲金幣已經拿滿了。' }),
        el('h4', { text: '剛剛的 ' + pairs.length + ' 對' }),
        el('div', { class: 'answer-table' }, pairs.map((pr) => el('div', {}, [el('b', { html: rich(pr.a) }), el('span', { html: rich(pr.b) })]))),
        el('div', { class: 'qz-foot' }, [el('button', { class: 'btn', type: 'button', text: '回機台', onclick: arcade }), el('button', { class: 'btn primary', type: 'button', text: '再玩一次', onclick: () => memory(rid) })]),
      ]), { wide: true });
    }
    G.ui.modal(el('div', { class: 'pl' }, [
      el('div', { class: 'eyebrow', text: '🃏 翻牌配對' + (rid ? ' · ' + G.regions[rid].name : '') }),
      el('h2', { text: '把名詞和意思配成一對' }),
      info, grid,
    ]), { wide: true });
  }

  /* ---------- 遊戲機台：60 秒快問快答 ---------- */
  function quickStart() {
    let pool = regionQs(null, ['tf', 'single']).filter((q) => store.lessonStarted(q.lesson));
    if (pool.length < 25) pool = regionQs(null, ['tf', 'single']);
    pool = shuffle(pool.slice());
    let i = 0, score = 0, combo = 0, right = 0, wrongs = [], end = Date.now() + 60000, timer = null, keyFn = null, busy = false;
    const view = el('div', { class: 'pl quick' });
    const hud = el('div', { class: 'quick-hud' });
    const bar = el('div', { class: 'pl-timer' }, [el('i')]);
    const qbox = el('div', { class: 'quick-q' });
    view.append(el('div', { class: 'eyebrow', text: '⚡ 60 秒快問快答' }), hud, bar, qbox);
    const mult = () => Math.min(3, 1 + Math.floor(combo / 3) * 0.5);
    const paintHud = () => { hud.innerHTML = ''; hud.append(el('b', { text: score + ' 分' }), el('span', { text: '連對 ' + combo + (mult() > 1 ? '（×' + mult() + '）' : '') }), el('span', { text: '答對 ' + right })); };
    function next() {
      busy = false;
      const q = pool[i++ % pool.length];
      qbox.innerHTML = '';
      qbox.appendChild(el('div', { class: 'chip', style: '--c:' + q.lesson.region.color, text: q.lesson.region.name + ' · 第 ' + q.lesson.no + ' 堂' }));
      qbox.appendChild(el('div', { class: 'qz-q', html: rich(q.q) }));
      const opts = q.type === 'tf' ? [[true, '對'], [false, '錯']] : shuffle(q.options.map((o, k) => [k, o]));
      const btns = opts.map(([v, label], k) => el('button', { class: 'opt', type: 'button', html: '<kbd>' + (k + 1) + '</kbd><span>' + rich(label) + '</span>', onclick: () => pick(q, v, btns, opts) }));
      btns.forEach((b) => qbox.appendChild(b));
      keyFn = (e) => { const n = parseInt(e.key, 10); if (n >= 1 && n <= btns.length) btns[n - 1].click(); };
    }
    function pick(q, v, btns, opts) {
      if (busy) return;
      busy = true;
      const ok = v === q.answer;
      btns.forEach((b, k) => { b.disabled = true; if (opts[k][0] === q.answer) b.classList.add('right'); });
      if (ok) { combo++; right++; score += Math.round(10 * mult()); snd('right'); }
      else { combo = 0; end -= 3000; wrongs.push(q); snd('wrong'); btns[opts.findIndex((o) => o[0] === v)].classList.add('wrong'); }
      paintHud();
      setTimeout(() => { if (view.isConnected && Date.now() < end) next(); }, ok ? 280 : 900);
    }
    function finish() {
      clearInterval(timer);
      const p = ps();
      const isBest = score > (p.quick.best || 0);
      if (isBest) p.quick.best = score;
      p.quick.plays++;
      const coins = bonus(Math.floor(score / 10));
      store.save(); snd('fanfare'); G.ui.refreshHud();
      const uniq = [...new Set(wrongs)];
      G.ui.modal(el('div', { class: 'pl' }, [
        el('div', { class: 'eyebrow', text: '⚡ 60 秒快問快答' }),
        el('h2', { text: '時間到！' }),
        el('p', { class: 'pl-big', text: score + ' 分 · 答對 ' + right + ' 題' + (isBest ? '　🏆 新紀錄' : '') }),
        coins ? el('div', { class: 'rewards' }, [el('span', { class: 'rw coin', text: '+' + coins + ' 金幣' })]) : null,
        uniq.length ? el('h4', { text: '答錯的題目' }) : el('p', { class: 'hint', text: '全對！' }),
        uniq.length ? el('div', { class: 'sum-wrong' }, uniq.slice(0, 8).map((q) => el('div', { class: 'wq' }, [
          el('b', { html: rich(q.q) }),
          el('span', { html: '答案：' + rich(q.type === 'tf' ? (q.answer ? '對' : '錯') : q.options[q.answer]) }),
        ]))) : null,
        el('div', { class: 'qz-foot' }, [el('button', { class: 'btn', type: 'button', text: '回機台', onclick: arcade }), el('button', { class: 'btn primary', type: 'button', text: '再玩一次', onclick: quickStart })]),
      ]), { wide: true });
    }
    const onKey = (e) => { if (keyFn) keyFn(e); };
    document.addEventListener('keydown', onKey);
    G.ui.modal(view, { wide: true, onLeave: () => { clearInterval(timer); document.removeEventListener('keydown', onKey); } });
    paintHud(); next();
    timer = setInterval(() => {
      if (!view.isConnected) { clearInterval(timer); return; }
      const left = (end - Date.now()) / 60000;
      bar.firstChild.style.width = Math.max(0, left * 100) + '%';
      bar.classList.toggle('hurry', left < 0.2);
      if (left <= 0) { document.removeEventListener('keydown', onKey); finish(); }
    }, 100);
  }

  /* ---------- 航行事件：海怪、漂流瓶 ---------- */
  function rollSeaEvent(from, dest) {
    if (!store.state.tutorialDone || Math.random() > 0.4) return null;
    const rid = dest.kind === 'region' ? dest.region.id : from && from.kind === 'region' ? from.region.id : Object.keys(G.regions)[Math.floor(Math.random() * 8)];
    return { kind: Math.random() < 0.55 ? 'monster' : 'bottle', rid };
  }
  function seaEvent(ev, resume) {
    let prop = null, done = false;
    const bp = G.world.boatPos();
    if (bp && K) {
      prop = ev.kind === 'monster' ? makeMonster() : makeBottle();
      const side = ev.kind === 'monster' ? 3.2 : 2.2;
      prop.position.set(bp.x + Math.cos(bp.ry) * side, ev.kind === 'monster' ? -0.6 : -0.1, bp.z - Math.sin(bp.ry) * side);
      prop.rotation.y = bp.ry + Math.PI;
      if (ev.kind === 'bottle') prop.rotation.set(0, bp.ry, 1.2);
      G.world.addProp(prop);
      prop.userData.t = 0;
      prop.userData.base = prop.position.y;
      seaProp = prop;
    }
    const finish = () => {
      if (done) return; done = true;
      G.world.removeProp(prop); seaProp = null;
      resume();
    };
    const view = el('div', { class: 'pl' });
    const foot = el('div', { class: 'qz-foot' });
    const reg = G.regions[ev.rid];
    if (ev.kind === 'monster') {
      snd('monster');
      view.append(el('div', { class: 'eyebrow', text: '🌊 航行事件' }), el('h2', { text: '🐉 海怪擋住了去路！' }),
        el('p', { class: 'hint', text: '牠說：「答對我的問題，才讓你過去。」（' + reg.name + '的題目）' }));
      const host = el('div');
      view.appendChild(host);
      askQuestion(pickQ(ev.rid, MID), host, (correct) => {
        let msg;
        if (correct) {
          const p = ps(); p.monsters++;
          const coins = bonus(15);
          msg = '海怪被你的知識嚇跑了！' + (coins ? '+' + coins + ' 金幣。' : '') + '（已擊退 ' + p.monsters + ' 隻）';
          store.save();
        } else msg = '海怪噴了你一身水，悻悻地游走了。這次沒有獎勵，看看解析吧。';
        host.prepend(el('div', { class: 'pl-catch ' + (correct ? 'r1' : 'miss') }, [el('span', { class: 'fish-emo', text: correct ? '🏆' : '💦' }), el('div', {}, [el('b', { text: correct ? '擊退海怪！' : '被噴了一身水' }), el('span', { text: msg })])]));
        foot.appendChild(el('button', { class: 'btn primary', type: 'button', text: '繼續航行 ⛵', onclick: G.ui.closeModal }));
      }, 40);
    } else {
      const cands = [];
      reg.lessons.forEach((l) => l.concepts.forEach((c) => { if (c.questions.some((q) => q.type !== 'interview')) cands.push(c); }));
      const weak = cands.filter((c) => store.conceptLevel(c) <= 1);
      const src = weak.length ? weak : cands;
      const con = src[Math.floor(Math.random() * src.length)];
      view.append(el('div', { class: 'eyebrow', text: '🌊 航行事件' }), el('h2', { text: '🍾 撈到一個漂流瓶' }),
        el('p', { class: 'hint', text: '瓶子裡有一張知識卡：第 ' + con.lesson.no + ' 堂「' + con.lesson.title + '」' }),
        G.quiz.cardNode(con));
      const host = el('div');
      view.appendChild(host);
      const qs = con.questions.filter((q) => q.type !== 'interview');
      foot.append(el('button', { class: 'btn', type: 'button', text: '收下，繼續航行', onclick: G.ui.closeModal }),
        el('button', { class: 'btn primary', type: 'button', text: '看完了，考我一題', onclick: (e) => {
          e.target.remove();
          askQuestion(qs[Math.floor(Math.random() * qs.length)], host, (correct) => {
            if (correct) { const coins = bonus(10); store.addMat(ev.rid, 1); host.prepend(el('div', { class: 'rewards' }, [coins ? el('span', { class: 'rw coin', text: '+' + coins + ' 金幣' }) : null, el('span', { class: 'rw mat', text: '+1 ' + store.MATS[ev.rid].name + ' ' + store.MATS[ev.rid].icon })])); }
            foot.firstChild.textContent = '繼續航行 ⛵';
          });
        } }));
    }
    view.appendChild(foot);
    G.ui.modal(view, { wide: true, onClose: finish, onLeave: () => setTimeout(() => { if (document.getElementById('modal').hidden) finish(); }, 0) });
  }
  let seaProp = null;

  /* ---------- 寶箱（每天每座領域島一個） ---------- */
  const chests = {};   // rid → { obj, it, col, open }
  const hash = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000003; return h; };
  function placeChests() {
    const p = ps(), td = store.dayStr();
    if (p.chest.day !== td) { p.chest = { day: td, opened: {} }; store.save(); }
    Object.keys(chests).forEach((rid) => { const c = chests[rid]; G.world.removeProp(c.obj); G.world.removeInteract(rid, c.it); G.world.removeCollider(rid, c.col); delete chests[rid]; });
    Object.keys(G.regions).forEach((rid) => {
      const spot = G.world.freeSpot(rid, hash(td + rid), 1.6);
      const open = !!p.chest.opened[rid];
      const obj = makeChest(open);
      obj.position.set(spot.x, 0, spot.z);
      obj.scale.setScalar(1.35);
      obj.rotation.y = hash(rid + td) % 628 / 100;
      G.world.addProp(obj);
      const it = G.world.addInteract(rid, { x: spot.x, z: spot.z, r: 1.9, label: open ? '寶箱（今天已經打開了）' : '💰 寶箱（知識鎖）', act: () => openChest(rid) });
      const col = G.world.addCollider(rid, { x: spot.x, z: spot.z, r: 0.55 });
      chests[rid] = { obj, it, col, open, day: td };
    });
  }
  function openChest(rid) {
    const c = chests[rid];
    if (c.open) { toast('這個寶箱今天已經打開了，明天會出現在島上的別處'); return; }
    const view = el('div', { class: 'pl' });
    const host = el('div');
    const foot = el('div', { class: 'qz-foot' });
    view.append(el('div', { class: 'eyebrow', text: '💰 寶箱 · ' + G.regions[rid].name }), el('h2', { text: '寶箱上了一道知識鎖' }),
      el('p', { class: 'hint', text: '答對就能打開。答錯沒關係，可以換一題再試。' }), host, foot);
    const attempt = () => {
      host.innerHTML = ''; foot.innerHTML = '';
      askQuestion(pickQ(rid, MID), host, (correct) => {
        if (!correct) { foot.append(el('button', { class: 'btn', type: 'button', text: '先不要', onclick: G.ui.closeModal }), el('button', { class: 'btn primary', type: 'button', text: '換一題再試', onclick: attempt })); return; }
        const p = ps();
        c.open = true; p.chest.opened[rid] = true; p.chests++;
        const coins = bonus(25 + Math.floor(Math.random() * 21));
        const mats = 1 + (Math.random() < 0.5 ? 1 : 0);
        store.addMat(rid, mats);
        let rare = null;
        if (!owned('hat', 'pirate') && (p.chests >= 4 || Math.random() < 0.15) && unlock('hat', 'pirate', '開寶箱')) rare = '✨ 稀有裝扮解鎖：海盜帽！到「打扮」穿上它。';
        questProgress(rid, 'chest');
        store.save(); snd('chest');
        c.it.label = '寶箱（今天已經打開了）';
        c.anim = 0;
        G.ui.refreshHud();
        host.prepend(el('div', { class: 'pl-catch r2' }, [el('span', { class: 'fish-emo', text: '💰' }), el('div', {}, [el('b', { text: '寶箱打開了！' }), el('span', { text: (coins ? '+' + coins + ' 金幣　' : '') + '+' + mats + ' ' + store.MATS[rid].name + ' ' + store.MATS[rid].icon + '（累計開了 ' + p.chests + ' 個）' })])]));
        if (rare) host.prepend(el('div', { class: 'pl-unlock', text: rare }));
        foot.appendChild(el('button', { class: 'btn primary', type: 'button', text: '好耶', onclick: G.ui.closeModal }));
      });
    };
    G.ui.modal(view, { wide: true });
    attempt();
  }

  /* ---------- 島民任務 ---------- */
  const npcs = {};     // rid → { pl, marker, it }
  const KINDS = ['answer', 'fish', 'weed', 'chest', 'bug'];
  function regionDue(rid) { return G.regions[rid].lessons.reduce((a, l) => a + store.lessonDue(l), 0); }
  function regionBugs(rid) { return Object.values(store.state.bugs.active).filter((b) => G.lessonById[b.lesson] && G.lessonById[b.lesson].region.id === rid).length; }
  function newQuest(rid, n) {
    for (let k = 0; k < KINDS.length; k++) {
      const kind = KINDS[(n + k) % KINDS.length];
      if (kind === 'answer') return { kind, target: 5, prog: 0 };
      if (kind === 'fish') return { kind, target: 2, prog: 0 };
      if (kind === 'weed' && regionDue(rid)) return { kind, target: Math.min(3, regionDue(rid)), prog: 0 };
      if (kind === 'chest' && !ps().chest.opened[rid]) return { kind, target: 1, prog: 0 };
      if (kind === 'bug' && regionBugs(rid)) return { kind, target: Math.min(2, regionBugs(rid)), prog: 0 };
    }
    return { kind: 'answer', target: 5, prog: 0 };
  }
  function questText(rid, q) {
    const isl = G.regions[rid].name;
    return {
      answer: '答對 ' + q.target + ' 題「' + isl + '」的題目（關卡、拔草、釣魚、寶箱、海怪都算）',
      fish: '在「' + isl + '」的碼頭釣到 ' + q.target + ' 條魚',
      weed: '拔掉「' + isl + '」的 ' + q.target + ' 根雜草（到期的複習題）',
      chest: '找到並打開「' + isl + '」今天的寶箱',
      bug: '抓到 ' + q.target + ' 隻「' + isl + '」的蟲（答對之前答錯的題）',
    }[q.kind];
  }
  function qs(rid) { const p = ps(); return p.quests[rid] || (p.quests[rid] = { n: 0, cur: null }); }
  function questProgress(rid, kind) {
    const st = qs(rid), q = st.cur;
    if (!q || q.kind !== kind || q.prog >= q.target) return;
    q.prog++;
    store.save();
    if (q.prog >= q.target) { toast('島民任務完成！回去找「' + NPCS[rid].name + '」領獎勵'); snd('coin'); }
    refreshMarkers();
  }
  function talk(rid) {
    const npc = NPCS[rid], st = qs(rid);
    const view = el('div', { class: 'pl npc' });
    const face = el('img', { class: 'npc-face', alt: '' });
    const u = G.avatar.playerIcon(npc.look, 1); if (u) face.src = u;
    const body = el('div');
    view.append(el('div', { class: 'npc-head' }, [face, el('div', {}, [el('div', { class: 'eyebrow', text: G.regions[rid].name + '的島民' }), el('h2', { text: npc.name })])]), body);
    const foot = el('div', { class: 'qz-foot' });
    const q = st.cur;
    if (!q) {
      const nq = newQuest(rid, st.n);
      body.append(el('p', { class: 'npc-line', text: '「' + npc.line + '」' }), el('div', { class: 'npc-quest' }, [el('b', { text: '任務' }), el('span', { text: questText(rid, nq) })]),
        el('p', { class: 'hint', text: '獎勵：' + (30 + 10 * Math.min(st.n, 5)) + ' 金幣、2 個' + store.MATS[rid].name + '。' + (owned('acc', 'parrot') ? '' : '完成 3 個島民任務還有驚喜。') }));
      foot.append(el('button', { class: 'btn', type: 'button', text: '下次再說', onclick: G.ui.closeModal }), el('button', { class: 'btn primary', type: 'button', text: '接下任務', onclick: () => { st.cur = nq; store.save(); refreshMarkers(); G.ui.closeModal(); toast('接下任務：' + questText(rid, nq)); } }));
    } else if (q.prog < q.target) {
      body.append(el('p', { class: 'npc-line', text: '「進行得怎麼樣？」' }), el('div', { class: 'npc-quest' }, [el('b', { text: '任務' }), el('span', { text: questText(rid, q) })]),
        el('div', { class: 'bar' }, [el('i', { style: 'width:' + Math.round((q.prog / q.target) * 100) + '%' })]), el('p', { class: 'hint', text: '進度 ' + q.prog + ' / ' + q.target }));
      foot.append(el('button', { class: 'btn', type: 'button', text: '放棄這個任務', onclick: () => { st.cur = null; store.save(); refreshMarkers(); G.ui.closeModal(); } }), el('button', { class: 'btn primary', type: 'button', text: '我去忙', onclick: G.ui.closeModal }));
    } else {
      const p = ps();
      const coins = bonus(30 + 10 * Math.min(st.n, 5));
      store.addMat(rid, 2);
      st.n++; st.cur = null; p.done++;
      let rare = null;
      if (p.done % 3 === 0 && unlock('acc', 'parrot', '完成島民任務')) rare = '✨ 稀有裝扮解鎖：鸚鵡！牠會站在你的肩膀上。';
      store.log('完成「' + npc.name + '」的任務');
      store.save(); snd('fanfare'); G.ui.refreshHud(); refreshMarkers();
      body.append(...[el('p', { class: 'npc-line', text: '「太感謝你了！這是一點心意。」' }),
        el('div', { class: 'rewards' }, [coins ? el('span', { class: 'rw coin', text: '+' + coins + ' 金幣' }) : null, el('span', { class: 'rw mat', text: '+2 ' + store.MATS[rid].name + ' ' + store.MATS[rid].icon })]),
        rare ? el('div', { class: 'pl-unlock', text: rare }) : null,
        el('p', { class: 'hint', text: '已完成 ' + p.done + ' 個島民任務。' + (p.done % 3 && !owned('acc', 'parrot') ? '再完成 ' + (3 - (p.done % 3)) + ' 個有驚喜。' : '') })].filter(Boolean));
      foot.append(el('button', { class: 'btn primary', type: 'button', text: '再接一個', onclick: () => talk(rid) }));
    }
    view.appendChild(foot);
    G.ui.modal(view, { wide: false });
  }
  function refreshMarkers() {
    Object.keys(npcs).forEach((rid) => {
      const q = qs(rid).cur, m = npcs[rid].marker;
      const state = !q ? 'new' : q.prog >= q.target ? 'done' : 'doing';
      const col = state === 'done' ? '#4caf6a' : state === 'new' ? '#f2c94c' : '#b8b2a6';
      [m.userData.bar, m.userData.dot].forEach((o) => { o.material = K.mat(col, { emissive: col, emissiveIntensity: state === 'doing' ? 0.1 : 0.6 }); });
      m.userData.state = state;
      npcs[rid].it.label = NPCS[rid].name + (state === 'done' ? '（領獎勵！）' : state === 'new' ? '（有任務）' : '（任務進行中）');
    });
  }
  function placeNpcs() {
    G.world.islands.filter((i) => i.kind === 'region').forEach((isl) => {
      const rid = isl.region.id;
      const d = isl.dock;
      const x = isl.cx + d.dx * 4.2 - d.dz * 2.2, z = isl.cz + d.dz * 4.2 + d.dx * 2.2;   // 中央廣場旁、和小星對稱的位置
      const pl = G.avatar.makePlayer(NPCS[rid].look, 1);
      pl.group.position.set(x, 0, z);
      pl.group.rotation.y = Math.atan2(d.x - x, d.z - z);
      G.world.addProp(pl.group);
      const marker = makeMarker();
      marker.position.set(x, 2.55, z);
      G.world.addProp(marker);
      G.world.addCollider(rid, { x, z, r: 0.4 });
      const it = G.world.addInteract(rid, { x, z, r: 1.9, label: NPCS[rid].name, act: () => talk(rid) });
      npcs[rid] = { pl, marker, it };
    });
    refreshMarkers();
  }

  /* ---------- 擺上場景 ---------- */
  function init() {
    if (!G.world.ok) return;
    K = G.world.kit();
    // 每座島的碼頭盡頭可以釣魚
    G.world.islands.forEach((isl) => {
      const d = isl.dock, along = isl.rad(isl.dockAng) + 5.2;
      const x = isl.cx + d.dx * along, z = isl.cz + d.dz * along;
      const prop = makeFishingProp();
      prop.position.set(x - d.dz * 0.75, 0.06, z + d.dx * 0.75);
      G.world.addProp(prop);
      G.world.addInteract(isl.id, { x, z, r: 1.7, label: '🎣 釣魚', act: () => fishing(isl) });
    });
    // 我的小島：遊戲機台
    const spot = G.world.freeSpot('home', 4242, 1.8);
    const booth = makeBooth();
    booth.position.set(spot.x, 0, spot.z);
    booth.rotation.y = Math.atan2(-spot.x, 2);   // 螢幕朝向中間的石板路和碼頭，從碼頭走上來就看得到
    G.world.addProp(booth);
    G.world.addCollider('home', { x: spot.x, z: spot.z, r: 0.9 });
    G.world.addInteract('home', { x: spot.x, z: spot.z, r: 2.3, label: '🕹️ 遊戲機台（小遊戲）', act: arcade });
    placeChests();
    placeNpcs();
    store.onAnswer = (q, correct, res) => {
      const rid = q.lesson.region.id;
      if (correct) questProgress(rid, 'answer');
      if (res.weeded) questProgress(rid, 'weed');
      if (res.bugCaught) questProgress(rid, 'bug');
    };
    let dayCheck = 0;
    G.world.onTick((dt, clock) => {
      Object.values(chests).forEach((c) => {
        const u = c.obj.userData;
        if (c.open) { if (c.anim != null && c.anim < 1) { c.anim = Math.min(1, c.anim + dt * 1.5); u.lid.rotation.x = -1.9 * c.anim; u.gold.visible = true; u.spark.visible = false; } else if (c.anim == null) { u.lid.rotation.x = -1.9; u.gold.visible = true; u.spark.visible = false; } }
        else { u.spark.rotation.y += dt * 2; u.spark.position.y = 1.3 + Math.sin(clock * 2.5) * 0.1; }
      });
      Object.values(npcs).forEach((n) => {
        n.pl.animate(dt, 0);
        n.marker.rotation.y += dt * 1.6;
        n.marker.position.y = 2.55 + (n.marker.userData.state === 'doing' ? 0 : Math.sin(clock * 3) * 0.12);
      });
      if (seaProp) {
        seaProp.userData.t += dt;
        const t = seaProp.userData.t;
        seaProp.position.y = seaProp.userData.base + Math.min(0.6, t * 0.8) + Math.sin(t * 2.4) * 0.12;
      }
      if ((dayCheck += dt) > 20) { dayCheck = 0; if (ps().chest.day !== store.dayStr()) placeChests(); }
    });
  }

  G.play = {
    init, rollSeaEvent, seaEvent, fishing, arcade, memory, quickStart, talk,
    stats() { const p = ps(); return { fish: Object.keys(p.fish).length, fishTotal: 24, chests: p.chests, quests: p.done, monsters: p.monsters, quickBest: p.quick.best, memoryBest: p.memory.best }; },
    debug() { return { chests: Object.keys(chests).map((r) => ({ r, open: chests[r].open, x: +chests[r].obj.position.x.toFixed(1), z: +chests[r].obj.position.z.toFixed(1) })), npcs: Object.keys(npcs) }; },   // 測試用
  };
})();
