/* 介面：HUD、下一步引導、地點面板、清單、航海圖、每日佈告欄、蟲蟲圖鑑、打扮、建造、設定、教學 */
(function () {
  'use strict';
  const G = window.G;
  const { el, rich } = G.util;
  const store = G.store;
  const $ = (id) => document.getElementById(id);
  const snd = (n) => G.sound && G.sound.play(n);
  let modalState = null;
  let drawerTab = 'index', query = '';
  const openRegions = new Set();
  let faceKey = '';

  /* ---------- 對話框與提示 ---------- */
  function modal(node, opts) {
    opts = opts || {};
    const m = $('modal');
    const card = m.querySelector('.modal-card');
    if (modalState && modalState.onLeave) modalState.onLeave();
    card.innerHTML = '';
    card.className = 'modal-card' + (opts.wide ? ' wide' : '') + (opts.cls ? ' ' + opts.cls : '');
    card.appendChild(el('button', { class: 'x', type: 'button', title: '關閉 (Esc)', text: '×', onclick: closeModal }));
    card.appendChild(node);
    card.scrollTop = 0;
    m.hidden = false;
    modalState = opts;
    G.world.stop();
  }
  function closeModal() {
    const st = modalState;
    modalState = null;
    $('modal').hidden = true;
    G.quiz.detachKeys();
    if (st && st.onLeave) st.onLeave();
    if (st && st.onClose) st.onClose();
  }
  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), 2800);
  }
  const isBlocking = () => !$('modal').hidden || (G.lesson && G.lesson.active) || !$('lvup').hidden;
  function closeAll() { if (!$('modal').hidden) closeModal(); if (G.lesson.active) G.lesson.close(); }

  /* ---------- HUD ---------- */
  function refreshHud() {
    const lv = store.level();
    const tt = store.totals();
    const st = store.state;
    $('hud-lv').textContent = 'Lv' + lv.lv;
    $('hud-isl').textContent = G.world.island ? G.world.island.name : '';
    $('hud-xpbar').style.width = Math.round((lv.into / lv.need) * 100) + '%';
    $('hud-xp').textContent = lv.into + ' / ' + lv.need + ' XP';
    $('hud-coin').textContent = st.coins;
    $('hud-solved').textContent = tt.solved + ' / ' + tt.questions;
    // 學越多頭越大：每次答對都重算（全部答對是 2.5 倍）
    const hs = store.headScale(tt.solved);
    G.world.setHead(hs);
    const k = JSON.stringify(st.avatar) + '|' + hs.toFixed(2);
    if (k !== faceKey) { faceKey = k; const u = G.avatar.playerIcon(st.avatar, hs); if (u) $('hud-face').src = u; }
    const d = store.daily();
    $('btn-daily').querySelector('b').textContent = store.streak();
    $('btn-daily').classList.toggle('dot', !d.done);
    $('btn-bugs').classList.toggle('dot', Object.keys(st.bugs.caught).some((t) => !st.bugs.seen[t]));
    $('btn-sound').textContent = st.settings.sound ? '🔊' : '🔇';
    renderGuideBar();
  }

  /* ---------- 下一步引導 ---------- */
  function nextStep() {
    const due = store.dueQuestions();
    if (due.length) {
      const by = {};
      due.forEach((q) => { by[q.lesson.id] = (by[q.lesson.id] || 0) + 1; });
      const lid = Object.keys(by).sort((a, b) => by[b] - by[a])[0];
      const l = G.lessonById[lid];
      return { text: '拔草：第 ' + l.no + ' 堂「' + l.title + '」長了 ' + by[lid] + ' 根雜草', btn: '出發 →', go: () => goPlace(l, () => startWeeds(l)) };
    }
    const inprog = G.lessons.find((l) => (store.state.courseStep[l.id] || 0) > 0 && !store.courseDone(l));
    if (inprog) return { text: '繼續上課：第 ' + inprog.no + ' 堂「' + inprog.title + '」', btn: '上課 →', go: () => goPlace(inprog, () => G.lesson.open(inprog)) };
    const challenge = (l, r) => ({ text: '挑戰：第 ' + l.no + ' 堂' + (r.boss ? ' Boss 面試官' : '「' + r.title.replace(/\(.*?\)/g, '') + '」'), btn: '挑戰 →', go: () => goPlace(l, () => startRound(r)) });
    // 先把開始過的那堂打完：上完課、或已經過了一關的課，還有沒過的關卡就先打，再去下一堂（釣魚、寶箱答到的題目不算開始）
    for (const l of G.lessons) {
      const rs = store.rounds(l);
      if (!store.courseDone(l) && !rs.some((x) => store.stars(x.key))) continue;
      const r = rs.find((x) => !store.stars(x.key));
      if (r) return challenge(l, r);
    }
    const fresh = G.lessons.find((l) => l.concepts.length && !store.courseDone(l) && !store.lessonStarted(l));
    if (fresh) return { text: '到第 ' + fresh.no + ' 堂「' + fresh.title + '」上課', btn: '出發 →', go: () => goPlace(fresh, () => G.lesson.open(fresh)) };
    for (const l of G.lessons) {
      const r = store.rounds(l).find((x) => !store.stars(x.key));
      if (r) return challenge(l, r);
    }
    for (const l of G.lessons) {
      const r = store.rounds(l).find((x) => store.stars(x.key) < 3);
      if (r) return { text: '拿滿星星：第 ' + l.no + ' 堂' + (r.boss ? ' Boss' : '「' + r.title.replace(/\(.*?\)/g, '') + '」'), btn: '挑戰 →', go: () => goPlace(l, () => startRound(r)) };
    }
    return { text: '全部過關了！來一場跨領域的面試模擬吧', btn: '開始 →', go: interviewSetup };
  }
  let currentStep = null;
  function renderGuideBar() {
    currentStep = nextStep();
    $('gb-text').innerHTML = '<b>下一步：</b>' + G.util.esc(currentStep.text);
    $('gb-go').textContent = currentStep.btn;
  }
  function goPlace(l, then) {
    closeAll();
    if (G.world.sailing) return;
    G.world.goToLesson(l, () => { if (then) then(); else openPlace(l); });
  }

  /* ---------- 地點面板（一堂課） ---------- */
  function startRound(r) {
    if (r.boss && G.interviewer) { G.interviewer.choose(r); return; }   // Boss：可以選 AI 面試官或自評
    G.quiz.start({ title: '第 ' + r.lesson.no + ' 堂', questions: G.util.shuffle(r.questions.slice()), mode: 'round', round: r, lesson: r.lesson });
  }
  function startWeeds(l) {
    const qs = store.lessonDueList(l);
    if (!qs.length) { toast('這裡沒有雜草了'); return; }
    G.quiz.start({ title: '拔草：第 ' + l.no + ' 堂', questions: qs.slice(0, 15), mode: 'review', lesson: l });
  }
  function openPlace(l) {
    store.markVisited(l);
    if (G.ai) G.ai.setLesson(l);   // AI 助教改用這堂課的重點回答
    const reg = l.region;
    const near = G.world.island === l.spot.island && Math.hypot(G.world.playerPos().x - l.spot.x, G.world.playerPos().z - l.spot.z) < 6;
    const prog = store.lessonProgress(l);
    const due = store.lessonDue(l);
    const done = store.courseDone(l);
    const step = store.courseStep(l);
    const rounds = store.rounds(l);
    const bugs = store.activeBugs(l);
    const ls = store.lessonStars(l);
    const node = el('div', { class: 'place' }, [
      el('div', { class: 'eyebrow', style: '--c:' + reg.color, text: reg.name + ' · 第 ' + l.no + ' 堂' }),
      el('h2', { text: l.title }),
      l.sub ? el('p', { class: 'dsub', text: l.sub }) : null,
      !l.concepts.length ? el('p', { class: 'warnbox', text: '這堂課的題庫還沒有做好。' }) : null,
      l.concepts.length ? el('div', { class: 'course-card' + (done ? ' done' : '') }, [
        el('div', { class: 'cc-top', text: done ? '✓ 已經上完課' : '第一步：上課 · 約 ' + G.lesson.minutes(l) + ' 分鐘' }),
        el('b', { text: '小星帶你走過 ' + l.concepts.length + ' 個概念' }),
        el('p', { html: rich(l.summary) }),
        el('div', { class: 'row' }, [
          el('button', { class: 'btn primary', type: 'button', text: done ? '複習課程' : step > 0 ? '繼續上課' : '開始上課', onclick: () => { closeModal(); if (!near) goPlace(l, () => G.lesson.open(l, done)); else G.lesson.open(l, done); } }),
          !done ? el('button', { class: 'btn', type: 'button', text: '我已經會了，直接挑戰', onclick: () => { const r = rounds[0]; if (r) startRound(r); } }) : null,
          el('button', { class: 'btn ghost', type: 'button', text: '重點卡', onclick: () => G.quiz.showCards(l, 0) }),
        ]),
      ]) : null,
      l.concepts.length ? el('div', { class: 'pstats' }, [
        el('span', { text: '完成度 ' + Math.round(prog * 100) + '%' }),
        el('span', { text: '★ ' + ls.got + ' / ' + ls.max }),
        el('span', { text: store.MATS[reg.id].icon + ' ' + store.MATS[reg.id].name + ' × ' + store.mat(reg.id) }),
        bugs.length ? el('span', { class: 'warn', text: '🐛 ' + bugs.length + ' 隻野生的蟲' }) : null,
      ]) : null,
      due ? el('button', { class: 'weedrow', type: 'button', onclick: () => startWeeds(l) }, [
        el('span', { text: '🌿' }), el('b', { text: '這裡長了 ' + due + ' 根雜草' }), el('em', { text: '到期該複習的題目，重答一次就拔掉' }), el('i', { text: '拔草 →' }),
      ]) : null,
      rounds.length ? el('h4', { text: '挑戰關卡' }) : null,
      el('div', { class: 'rounds' }, rounds.map((r, k) => {
        const s = store.stars(r.key);
        const lv = r.concept ? store.conceptLevel(r.concept) : null;
        return el('button', { class: 'round' + (r.boss ? ' boss' : '') + (s ? ' cleared' : ''), type: 'button', onclick: () => startRound(r) }, [
          el('span', { class: 'rnum', text: r.boss ? '👔' : String(k + 1) }),
          el('span', { class: 'rname' }, [el('b', { html: r.boss ? 'Boss：面試官' : rich(r.title) }), el('em', { text: r.questions.length + ' 題' + (r.boss ? '口述' : '') + (lv != null ? ' · ' + G.quiz.LEVEL_NAMES[lv] : '') })]),
          el('span', { class: 'diff d-' + (r.boss ? 'boss' : r.diff === '中等' ? 'mid' : 'easy'), text: r.diff }),
          el('span', { class: 'stars' }, [1, 2, 3].map((n) => el('i', { class: n <= s ? 'on' : '', text: '★' }))),
        ]);
      })),
      l.materials.length ? el('details', { class: 'more' }, [el('summary', { text: '對應教材' }), el('div', { class: 'mats' }, l.materials.map((m) => G.util.matLink(m, [el('b', { text: m.label }), el('span', { text: m.path })])))]) : null,
      l.links.length ? el('details', { class: 'more' }, [el('summary', { text: '和哪些課相關（' + l.links.length + '）' }), el('div', { class: 'rel' }, l.links.map((k) => el('button', { type: 'button', onclick: () => openPlace(k.to) }, [
        el('span', { class: 'chip', style: '--c:' + k.to.region.color, text: k.to.no }),
        el('span', { class: 'reltext' }, [el('b', { text: k.to.title + '｜' + k.tag }), el('em', { text: k.why })]),
      ])))]) : null,
      !near ? el('div', { class: 'qz-foot' }, [el('button', { class: 'btn', type: 'button', text: '📍 走過去', onclick: () => goPlace(l) })]) : null,
    ]);
    modal(node, { cls: 'place-card' });
  }

  /* ---------- 清單模式 ---------- */
  function toggleDrawer(on) {
    const d = $('drawer');
    d.hidden = on == null ? !d.hidden : !on;
    if (!d.hidden) renderDrawer();
  }
  function renderDrawer() {
    const d = $('drawer');
    if (d.hidden) return;
    d.innerHTML = '';
    const tt = store.totals();
    d.appendChild(el('div', { class: 'dr-head' }, [
      el('b', { text: '清單模式' }), el('span', { text: G.lessons.length + ' 堂 · ' + tt.questions + ' 題 · 不用走路，直接選' }),
      el('button', { class: 'x', type: 'button', text: '×', onclick: () => toggleDrawer(false) }),
    ]));
    d.appendChild(el('div', { class: 'modes' }, [
      el('button', { class: 'mode' + (tt.due ? ' hot' : ''), type: 'button', onclick: startReview }, [el('b', { text: '🌿 全部拔草' }), el('span', { text: tt.due ? tt.due + ' 題到期' : '沒有雜草' })]),
      el('button', { class: 'mode', type: 'button', onclick: interviewSetup }, [el('b', { text: '👔 面試模擬' }), el('span', { text: '口述題，自己講再對答案' })]),
      el('button', { class: 'mode', type: 'button', onclick: startWeak }, [el('b', { text: '🐛 弱點加強' }), el('span', { text: tt.weak ? tt.weak + ' 題答錯過' : '目前沒有' })]),
      el('button', { class: 'mode', type: 'button', onclick: startRandom }, [el('b', { text: '🎲 隨機抽考' }), el('span', { text: '從學過的課抽 10 題' })]),
    ]));
    d.appendChild(el('div', { class: 'tabs' }, [
      el('button', { type: 'button', class: drawerTab === 'index' ? 'on' : '', text: '課程', onclick: () => { drawerTab = 'index'; renderDrawer(); } }),
      el('button', { type: 'button', class: drawerTab === 'log' ? 'on' : '', text: '學習日誌', onclick: () => { drawerTab = 'log'; renderDrawer(); } }),
    ]));
    const list = el('div', { class: 'dr-list' });
    if (drawerTab === 'log') {
      const log = store.state.log;
      if (!log.length) list.appendChild(el('p', { class: 'empty', text: '還沒有紀錄。' }));
      log.forEach((r) => list.appendChild(el('div', { class: 'logrow' }, [el('time', { text: G.util.fmtTime(r.t) }), el('span', { text: r.text })])));
      d.appendChild(list);
      return;
    }
    const search = el('input', { type: 'search', placeholder: '搜尋課名或概念，例如：過擬合、RAG、PPO', value: query, autocomplete: 'off' });
    search.addEventListener('input', () => { query = search.value; renderList(); search.focus(); });
    d.appendChild(search);
    d.appendChild(list);
    function renderList() {
      list.innerHTML = '';
      const q = query.trim().toLowerCase();
      Object.values(G.regions).forEach((r) => {
        const lessons = r.lessons.filter((l) => !q || (l.no + ' ' + l.title + ' ' + (l.sub || '') + ' ' + l.concepts.map((c) => c.name).join(' ')).toLowerCase().includes(q));
        if (!lessons.length) return;
        const withQ = r.lessons.filter((l) => l.concepts.length);
        const prog = withQ.length ? withQ.reduce((a, l) => a + store.lessonProgress(l), 0) / withQ.length : 0;
        const open = q || openRegions.has(r.id);
        const sec = el('section', { class: 'region' + (open ? ' open' : '') });
        sec.style.setProperty('--c', r.color);
        sec.appendChild(el('button', { class: 'rhead', type: 'button', onclick: () => { if (openRegions.has(r.id)) openRegions.delete(r.id); else openRegions.add(r.id); renderList(); } }, [
          el('i', { class: 'dotc' }), el('span', { class: 'rname' }, [el('b', { text: r.name }), el('em', { text: r.en })]),
          el('span', { class: 'rprog', text: Math.round(prog * 100) + '%' }), el('span', { class: 'rcount', text: r.lessons.length + ' 堂' }),
        ]));
        if (open) lessons.forEach((l) => {
          const p = store.lessonProgress(l), due = store.lessonDue(l), ls = store.lessonStars(l);
          sec.appendChild(el('button', { class: 'lrow' + (l.concepts.length ? '' : ' empty'), type: 'button', onclick: () => openPlace(l) }, [
            el('span', { class: 'lno', text: l.no }),
            el('span', { class: 'ltitle' }, [el('b', { text: (store.courseDone(l) ? '✓ ' : '') + l.title }), l.sub ? el('em', { text: l.sub }) : null]),
            due ? el('span', { class: 'due', title: '雜草（到期題數）', text: '🌿' + due }) : null,
            ls.got ? el('span', { class: 'lst', text: '★' + ls.got }) : null,
            el('span', { class: 'mini' }, [el('i', { style: 'width:' + Math.round(p * 100) + '%' })]),
          ]));
        });
        list.appendChild(sec);
      });
      if (!list.children.length) list.appendChild(el('p', { class: 'empty', text: '找不到符合「' + query + '」的課或概念。' }));
    }
    renderList();
  }
  function startReview() {
    const qs = store.dueQuestions(20);
    if (!qs.length) { toast('目前沒有雜草。答過的題目會在 1、3、7、21 天後長回來。'); return; }
    G.quiz.start({ title: '全部拔草', questions: qs, mode: 'review' });
  }
  function startWeak() {
    const qs = store.weakQuestions(15);
    if (!qs.length) { toast('目前沒有答錯過的題目。'); return; }
    G.quiz.start({ title: '弱點加強', questions: qs, mode: 'weak' });
  }
  function startRandom() { G.quiz.start({ title: '隨機抽考', questions: store.randomQuestions(10), mode: 'random' }); }
  function interviewSetup() {
    const picks = new Set(Object.values(G.regions).filter((r) => r.lessons.some((l) => store.lessonStarted(l))).map((r) => r.id));
    if (!picks.size) Object.keys(G.regions).forEach((k) => picks.add(k));
    let n = 6;
    const count = (id) => store.allQuestions().filter((q) => q.type === 'interview' && q.lesson.region.id === id).length;
    modal(el('div', { class: 'qz setup' }, [
      el('h2', { text: '面試模擬' }),
      el('p', { class: 'hint', text: '每題先自己講 1–2 分鐘，再對照要點自評，講到六成要點算通過。沒答過和上次沒通過的題目會優先出。' }),
      el('h4', { text: '要考哪些領域' }),
      el('div', { class: 'picks' }, Object.values(G.regions).map((r) => {
        const c = count(r.id);
        const b = el('button', { class: 'pick' + (picks.has(r.id) && c ? ' on' : ''), type: 'button', disabled: !c, onclick: () => { if (picks.has(r.id)) picks.delete(r.id); else picks.add(r.id); b.classList.toggle('on', picks.has(r.id)); } }, [el('b', { text: r.name }), el('span', { text: c + ' 題' })]);
        b.style.setProperty('--c', r.color);
        return b;
      })),
      el('h4', { text: '題數' }),
      el('div', { class: 'picks nums' }, [4, 6, 8, 10].map((k) => {
        const b = el('button', { class: 'pick' + (k === n ? ' on' : ''), type: 'button', text: k + ' 題', onclick: () => { n = k; [...b.parentNode.children].forEach((x) => x.classList.toggle('on', x === b)); } });
        return b;
      })),
      el('div', { class: 'qz-foot' }, [el('button', { class: 'btn primary', type: 'button', text: '開始', onclick: () => {
        const qs = store.interviewQuestions([...picks], n);
        if (!qs.length) { toast('選到的領域還沒有面試題'); return; }
        G.quiz.start({ title: '面試模擬', questions: qs, mode: 'interview' });
      } })]),
    ]));
  }

  /* ---------- 航海圖 ---------- */
  function openMap() {
    // 用第一版的 3D 六角群島地圖（js/chart.js）；這台電腦畫不了第二個 3D 畫面時，改用下面的簡易圓圈版
    const chart = G.chart && G.chart.node();
    if (chart) {
      modal(chart, { cls: 'chart-card', onLeave: G.chart.close });
      G.chart.open();
      return;
    }
    const isls = G.world.islands;
    const here = G.world.island;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '-150 -150 300 300');
    svg.setAttribute('class', 'map-svg');
    const mk = (tag, at) => { const e = document.createElementNS(svgNS, tag); Object.keys(at).forEach((k) => e.setAttribute(k, at[k])); return e; };
    svg.appendChild(mk('circle', { cx: 0, cy: 0, r: 100, class: 'route' }));
    isls.forEach((isl) => {
      const g = mk('g', { class: 'm-isl' + (isl === here ? ' here' : ''), tabindex: 0 });
      g.appendChild(mk('circle', { cx: isl.cx, cy: isl.cz, r: isl.R * 0.95, fill: isl.color }));
      let pct = '';
      if (isl.kind === 'region') {
        const ls = isl.region.lessons.filter((x) => x.concepts.length);
        const p = ls.length ? ls.reduce((a, x) => a + store.lessonProgress(x), 0) / ls.length : 0;
        pct = Math.round(p * 100) + '%';
        const due = ls.reduce((a, x) => a + store.lessonDue(x), 0);
        if (due) { const t = mk('text', { x: isl.cx + isl.R * 0.7, y: isl.cz - isl.R * 0.7, class: 'm-due' }); t.textContent = '🌿' + due; g.appendChild(t); }
      }
      const t1 = mk('text', { x: isl.cx, y: isl.cz - 2, class: 'm-name' }); t1.textContent = isl.name; g.appendChild(t1);
      const t2 = mk('text', { x: isl.cx, y: isl.cz + 9, class: 'm-pct' }); t2.textContent = isl === here ? '📍 你在這裡' : pct || '家'; g.appendChild(t2);
      g.addEventListener('click', () => { if (isl === here) { closeModal(); return; } closeModal(); G.world.travelTo(isl.id); });
      svg.appendChild(g);
    });
    modal(el('div', { class: 'mapbox' }, [
      el('h2', { text: '航海圖' }),
      el('p', { class: 'hint', text: '點一座島就出航。每座島都可以直接去，不用照順序。' }),
      svg,
    ]), { wide: true });
  }
  function travelConfirm(id) {
    const isl = G.world.islands.find((x) => x.id === id);
    if (!isl) return;
    modal(el('div', { class: 'qz setup small' }, [
      el('h2', { text: '要出航到「' + isl.name + '」嗎？' }),
      isl.kind === 'region' ? el('p', { class: 'hint', text: '這座島有 ' + isl.region.lessons.length + ' 堂課。' }) : el('p', { class: 'hint', text: '回到自己的小島：博物館、建造、換衣服。' }),
      el('div', { class: 'qz-foot' }, [el('button', { class: 'btn', type: 'button', text: '先不要', onclick: closeModal }), el('button', { class: 'btn primary', type: 'button', text: '⛵ 出航', onclick: () => { closeModal(); G.world.travelTo(id); } })]),
    ]));
  }

  /* ---------- 每日佈告欄 ---------- */
  function openDaily() {
    const d = store.daily();
    const st = store.state;
    const t = d.task || {};
    let taskText = '', taskGo = null;
    if (t.kind === 'weed') { taskText = '拔掉 ' + t.n + ' 根雜草（到期的複習題）'; taskGo = () => { closeModal(); startReview(); }; }
    else if (t.kind === 'course' || t.kind === 'round') { const l = G.lessonById[t.lesson]; taskText = (t.kind === 'course' ? '上第 ' : '挑戰第 ') + l.no + ' 堂「' + l.title + '」' + (t.kind === 'course' ? '的課' : '的關卡'); taskGo = () => goPlace(l); }
    else { taskText = '來一場面試模擬'; taskGo = () => { closeModal(); interviewSetup(); }; }
    const shieldBtn = el('button', { class: 'btn', type: 'button', text: '買護盾（50 金幣）', disabled: st.shields >= 2, onclick: () => { const err = store.buyShield(); if (err) toast(err); else { snd('coin'); toast('買了一個護盾'); openDaily(); refreshHud(); } } });
    modal(el('div', { class: 'daily' }, [
      el('div', { class: 'eyebrow', text: store.dayStr() }),
      el('h2', { text: '每日佈告欄' }),
      el('div', { class: 'dcard task' + (d.done ? ' done' : '') }, [
        el('span', { class: 'dk', text: '今日任務' }),
        el('b', { text: taskText }),
        el('em', { text: d.done ? '完成了！明天會有新的任務。' : '完成任何一個關卡、或拔一次草就算完成，獎勵 10 金幣。' }),
        d.done ? el('span', { class: 'okmark', text: '✓ 已完成' }) : el('button', { class: 'btn primary', type: 'button', text: '前往', onclick: taskGo }),
      ]),
      el('div', { class: 'dcard streak' }, [
        el('span', { class: 'fire', text: '🔥' }),
        el('div', {}, [
          el('b', { text: '連續 ' + store.streak() + ' 天' }),
          el('em', { text: store.answeredToday() ? '今天已經答題了，明天見！' : store.streak() ? '今天還沒答題，答一題就能延續。' : st.streak.last ? '連續天數中斷了，今天答一題重新開始累積。' : '今天答一題，就開始累積連續天數。' }),
          el('em', { text: '最佳紀錄 ' + (st.streak.best || 0) + ' 天 · 連續 3 天 +20、7 天 +50、30 天 +200 金幣' }),
        ]),
        el('div', { class: 'shields' }, [
          el('span', { class: 'sh-slots', title: '護盾 ' + st.shields + ' / 2' }, [0, 1].map((k) => el('i', { class: k < st.shields ? 'on' : '', text: '🛡️' }))),
          shieldBtn,
          el('em', { text: '漏掉一天時，護盾會自動保住連續天數。' }),
        ]),
      ]),
      el('h4', { text: '複習雜草' }),
      el('p', { class: 'hint', text: '答過的題目會在第 1、3、7、21 天回來，到時候那堂課的廣場和你家門口會長出雜草。重答一次就拔掉（還有複習 XP 和金幣）。' }),
      el('div', { class: 'row' }, [
        el('b', { text: store.dueQuestions().length ? '現在有 ' + store.dueQuestions().length + ' 根雜草' : '島上一根雜草都沒有，好乾淨！' }),
        el('span', { class: 'hint', text: '接下來 7 天會長出 ' + store.dueWithin(7) + ' 根' }),
        store.dueQuestions().length ? el('button', { class: 'btn', type: 'button', text: '全部拔草', onclick: () => { closeModal(); startReview(); } }) : null,
      ]),
    ]));
  }

  /* ---------- 蟲蟲圖鑑 ---------- */
  function openBugs(sel) {
    const st = store.state.bugs;
    const kinds = store.BUGS;
    const caughtKinds = kinds.filter((b) => st.caught[b.id]).length;
    const total = Object.values(st.caught).reduce((a, n) => a + n, 0);
    const wild = store.activeBugs();
    sel = sel || (kinds.find((b) => st.caught[b.id]) || kinds[0]).id;
    if (st.caught[sel]) { st.seen[sel] = 1; store.save(); }
    const b = store.bug(sel);
    const wildHere = wild.filter((w) => w.type === sel);
    modal(el('div', { class: 'bugs' }, [
      el('div', { class: 'eyebrow', text: '我的小島 · 蟲蟲博物館' }),
      el('h2', { text: '蟲蟲圖鑑' }),
      el('div', { class: 'bprog' }, [el('span', { text: '已發現 ' + caughtKinds + ' / ' + kinds.length + ' 種 · 共抓到 ' + total + ' 隻 · 外面還有 ' + wild.length + ' 隻野生的蟲' }), el('div', { class: 'bar' }, [el('i', { style: 'width:' + (caughtKinds / kinds.length) * 100 + '%' })])]),
      el('div', { class: 'bgrid' }, kinds.map((k) => {
        const got = st.caught[k.id];
        return el('button', { class: 'bcell' + (got ? ' got' : '') + (k.id === sel ? ' sel' : '') + (got && !st.seen[k.id] ? ' new' : ''), type: 'button', onclick: () => openBugs(k.id) }, [
          el('img', { src: G.avatar.bugIcon(k.id), alt: '', style: got ? '' : 'filter: brightness(0) opacity(.25)' }),
          el('b', { text: got ? k.name : '？？？' }),
          got ? el('em', { text: '× ' + got }) : null,
        ]);
      })),
      el('div', { class: 'bdetail' }, [
        el('img', { src: G.avatar.bugIcon(sel), alt: '' }),
        el('div', {}, [
          el('h3', { text: st.caught[sel] ? b.name : b.name + '（還沒抓到）' }),
          el('h5', { text: '出沒時機' }), el('p', { text: b.when }),
          el('h5', { text: '對付方法' }), el('p', { text: b.how }),
          el('h5', { text: '捕獲紀錄' }),
          el('p', { text: st.caught[sel] ? '第一次抓到：' + G.util.fmtDate(st.first[sel]) + ' · 共 ' + st.caught[sel] + ' 隻' : '還沒抓到。答錯題目時就會遇到牠，之後答對同一題就能抓到。' }),
          wildHere.length ? el('div', { class: 'wild' }, [el('h5', { text: '外面還有 ' + wildHere.length + ' 隻' })].concat(wildHere.slice(0, 6).map((w) => {
            const l = G.lessonById[w.lesson];
            return el('button', { class: 'chipbtn', type: 'button', text: '第 ' + l.no + ' 堂 ' + l.title, onclick: () => goPlace(l) });
          }))) : null,
        ]),
      ]),
    ]), { wide: true });
    refreshHud();
  }

  /* ---------- 打扮 ---------- */
  let prev = null;
  function previewer(host) {
    if (!prev) {
      const T = window.THREE;
      const canvas = el('canvas', { class: 'pv-canvas' });
      const r = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      const sc = new T.Scene();
      sc.add(new T.HemisphereLight('#ffffff', '#c9b79a', 1.0));
      const dl = new T.DirectionalLight('#ffffff', 0.8); dl.position.set(2, 4, 3); sc.add(dl);
      const cam = new T.PerspectiveCamera(30, 1, 0.1, 50);
      cam.position.set(0, 1.0, 3.6); cam.lookAt(0, 0.62, 0);
      const pl = G.avatar.makePlayer(store.state.avatar);
      sc.add(pl.group);
      prev = { canvas, r, sc, cam, pl, rot: 0.4, raf: 0 };
      let down = null;
      canvas.addEventListener('pointerdown', (e) => { down = e.clientX; canvas.setPointerCapture(e.pointerId); });
      canvas.addEventListener('pointermove', (e) => { if (down != null) { prev.rot += (e.clientX - down) * 0.012; down = e.clientX; } });
      canvas.addEventListener('pointerup', () => { down = null; });
    }
    host.appendChild(prev.canvas);
    // 預覽也用目前的頭圍；頭越大，鏡頭拉遠一點
    const hs = store.headScale(), up = 0.3 * (hs - 1);
    prev.pl.setHead(hs);
    prev.cam.position.set(0, 1.0 + up, 3.6 + 1.3 * (hs - 1)); prev.cam.lookAt(0, 0.62 + up, 0);
    const loop = () => {
      if (!prev.canvas.isConnected) { prev.raf = 0; return; }
      const w = prev.canvas.clientWidth || 220, h = prev.canvas.clientHeight || 260;
      prev.r.setSize(w, h, false); prev.cam.aspect = w / h; prev.cam.updateProjectionMatrix();
      prev.pl.group.rotation.y = prev.rot; prev.pl.animate(0.016, 0);
      prev.r.render(prev.sc, prev.cam);
      prev.raf = requestAnimationFrame(loop);
    };
    if (!prev.raf) prev.raf = requestAnimationFrame(loop);
  }
  function openWardrobe(tab, draft) {
    const W = store.WARDROBE;
    draft = draft || Object.assign({}, store.state.avatar);
    tab = tab || 'look';
    const pvHost = el('div', { class: 'pv' });
    const lv = store.level().lv;
    const apply = () => { if (prev) prev.pl.setLook(draft); };
    const swatches = (arr, key, isIndex) => el('div', { class: 'sw' }, arr.map((c, i) => el('button', { type: 'button', class: 'swc' + ((isIndex ? draft[key] === i : draft[key] === c) ? ' on' : ''), style: 'background:' + c, onclick: () => { draft[key] = isIndex ? i : c; openWardrobe(tab, draft); } })));
    const items = (arr, key) => el('div', { class: 'items' }, arr.map((it) => {
      const s = store.itemState(key, it);
      const on = draft[key] === it.id;
      return el('button', { type: 'button', class: 'item' + (on ? ' on' : '') + (s.ok ? '' : ' locked'), onclick: () => {
        if (!s.ok && s.rare) { toast('「' + it.name + '」是稀有裝扮：' + s.why + '才拿得到'); return; }
        if (!s.ok && s.why) { toast('要 ' + s.why + ' 才能穿'); return; }
        if (!s.ok && s.buy) {
          if (store.state.coins < s.buy) { toast('金幣不夠（要 ' + s.buy + '）'); return; }
          if (!confirm('花 ' + s.buy + ' 金幣買下「' + it.name + '」？')) return;
          store.buyItem(key, it); snd('coin'); refreshHud();
        }
        draft[key] = it.id; openWardrobe(tab, draft);
      } }, [el('span', { text: it.name }), !s.ok ? el('em', { text: s.rare ? '✨ ' + s.why : s.why ? '🔒 ' + s.why : '🪙 ' + s.buy }) : null]);
    }));
    const nameIn = el('input', { type: 'text', maxlength: 12, placeholder: '你想被怎麼稱呼？', value: draft.name || '' });
    nameIn.addEventListener('input', () => { draft.name = nameIn.value; });
    const tabs = [['look', '外觀'], ['wear', '服裝'], ['acc', '配件']];
    const panes = {
      look: [el('h5', { text: '名字' }), nameIn, el('h5', { text: '膚色' }), swatches(W.skin, 'skin', true), el('h5', { text: '髮型' }), items(W.hair, 'hair'), el('h5', { text: '髮色' }), swatches(W.hairColor, 'hairColor', true)],
      wear: [el('h5', { text: '衣服' }), items(W.outfit, 'outfit'), el('h5', { text: '顏色' }), swatches(W.outfitColor, 'outfitColor', false)],
      acc: [el('h5', { text: '帽子' }), items(W.hat, 'hat'), el('h5', { text: '配件' }), items(W.acc, 'acc')],
    };
    modal(el('div', { class: 'wardrobe' }, [
      el('div', { class: 'eyebrow', text: '衣櫃' }),
      el('h2', { text: '打扮一下' }),
      el('div', { class: 'wd' }, [
        el('div', { class: 'wd-left' }, [pvHost, el('span', { class: 'hint', text: '拖曳可以旋轉' }), el('span', { class: 'wd-coin', text: '🪙 ' + store.state.coins + ' · Lv ' + lv })]),
        el('div', { class: 'wd-right' }, [
          el('div', { class: 'tabs' }, tabs.map(([k, t]) => el('button', { type: 'button', class: k === tab ? 'on' : '', text: t, onclick: () => openWardrobe(k, draft) }))),
          el('div', { class: 'wd-pane' }, panes[tab]),
        ]),
      ]),
      el('div', { class: 'qz-foot' }, [
        el('button', { class: 'btn', type: 'button', text: '取消', onclick: closeModal }),
        el('button', { class: 'btn primary', type: 'button', text: '換上', onclick: () => { store.setAvatar(draft); G.world.setLook(draft); closeModal(); refreshHud(); toast('換好了！'); } }),
      ]),
    ]), { wide: true });
    previewer(pvHost);
    apply();
  }

  /* ---------- 我的小島：建造 ---------- */
  function openBuild(focus) {
    const rows = Object.values(G.regions).map((r) => {
      const m = store.MATS[r.id];
      const lv = store.homeLevel(r.id);
      const cost = store.BUILD_COST[lv];
      return el('div', { class: 'brow' + (r.id === focus ? ' focus' : ''), style: '--c:' + r.color }, [
        el('span', { class: 'bicon', text: m.icon }),
        el('span', { class: 'bname' }, [el('b', { text: m.deco }), el('em', { text: r.name + ' · ' + m.name + ' × ' + store.mat(r.id) })]),
        el('span', { class: 'stars' }, [1, 2, 3].map((n) => el('i', { class: n <= lv ? 'on' : '', text: '★' }))),
        lv >= 3 ? el('span', { class: 'okmark', text: '已完成' }) : el('button', { class: 'btn' + (store.mat(r.id) >= cost ? ' primary' : ''), type: 'button', text: (lv ? '升級' : '建造') + '（' + cost + ' ' + m.name + '）', onclick: () => {
          const err = store.build(r.id);
          if (err) { toast(err); return; }
          snd('fanfare'); G.world.refreshHome(); G.world.celebrate(r.color); toast(m.deco + ' 蓋到第 ' + (lv + 1) + ' 級！'); openBuild(r.id);
        } }),
      ]);
    });
    modal(el('div', { class: 'build' }, [
      el('div', { class: 'eyebrow', text: '我的小島' }),
      el('h2', { text: '建造空地' }),
      el('p', { class: 'hint', text: '每一題第一次答對，會得到 1 個那座島的素材。用素材在家旁邊的 ' + Object.keys(G.regions).length + ' 塊空地蓋裝飾，每個三級（5、10、20 個素材）。' }),
      el('div', { class: 'brows' }, rows),
    ]), { wide: true });
  }

  /* ---------- 個人資料 ---------- */
  function openProfile() {
    const st = store.state, lv = store.level(), rk = store.rank(), tt = store.totals();
    const coursed = Object.keys(st.course).length;
    modal(el('div', { class: 'profile' }, [
      el('div', { class: 'pf-top' }, [
        el('img', { src: $('hud-face').src, alt: '' }),
        el('div', {}, [el('h2', { text: st.avatar.name || '冒險者' }), el('b', { text: 'Lv ' + lv.lv + ' · ' + rk.name }), el('em', { text: '累積 ' + st.xp + ' XP' + (rk.next ? ' · 距離「' + rk.nextName + '」還差 ' + (rk.next - st.xp) : '') })]),
      ]),
      el('div', { class: 'pf-stats' }, [
        ['🪙', st.coins, '金幣'], ['🔥', store.streak(), '連續天數'], ['✅', tt.solved + '/' + tt.questions, '答對過的題'],
        ['🧠', '×' + store.headScale(tt.solved).toFixed(2), '大腦尺寸（學越多頭越大）'],
        ['📘', coursed + '/' + G.lessons.length, '上完的課'], ['🏠', tt.built + '/' + tt.concepts, '蓋到小屋的概念'], ['🗼', tt.mastered, '地標'],
      ].map(([i, v, t]) => el('div', {}, [el('span', { text: i }), el('b', { text: String(v) }), el('em', { text: t })]))),
      el('h4', { text: '素材背包' }),
      el('div', { class: 'pf-mats' }, Object.values(G.regions).map((r) => el('span', { style: '--c:' + r.color }, [el('i', { text: store.MATS[r.id].icon }), el('b', { text: store.MATS[r.id].name + ' × ' + store.mat(r.id) })]))),
      el('div', { class: 'qz-foot' }, [
        el('button', { class: 'btn', type: 'button', text: '打扮', onclick: () => openWardrobe() }),
        el('button', { class: 'btn', type: 'button', text: '建造', onclick: () => openBuild() }),
        el('button', { class: 'btn primary', type: 'button', text: '學習日誌', onclick: () => { closeModal(); drawerTab = 'log'; toggleDrawer(true); } }),
      ]),
    ]));
  }

  /* ---------- 升級 ---------- */
  function levelUp(from, to) {
    store.state.levelSeen = Math.max(store.state.levelSeen || 1, to); store.save();
    const unlocks = [];
    const W = store.WARDROBE;
    ['hair', 'outfit', 'hat', 'acc'].forEach((k) => W[k].forEach((it) => { if (it.lv && it.lv > from && it.lv <= to) unlocks.push(it.name); }));
    if (from < 4 && to >= 4) unlocks.push('家從帳篷升級成木屋');
    if (from < 8 && to >= 8) unlocks.push('家升級成兩層房子');
    const box = $('lvup');
    box.innerHTML = '';
    box.appendChild(el('div', { class: 'lv-card' }, [
      el('span', { text: '升級！' }), el('b', { text: 'Lv ' + to }),
      unlocks.length ? el('em', { text: '解鎖：' + unlocks.join('、') }) : el('em', { text: '繼續加油！' }),
    ]));
    box.hidden = false;
    snd('levelup');
    G.world.celebrate();
    G.world.refreshHome();
    setTimeout(() => { box.hidden = true; }, 3200);
    box.onclick = () => { box.hidden = true; };
    refreshHud();
  }
  function checkLevel() {
    const lv = store.level().lv;
    if (lv > (store.state.levelSeen || 1)) levelUp(store.state.levelSeen || 1, lv);
    refreshHud();
  }

  /* ---------- 小星 ---------- */
  const TIPS = [
    '每天先拔草！到期的複習題會長成雜草，重答一次就拔掉。',
    '答錯會冒出蟲，之後答對同一題就能抓到牠，收進蟲蟲圖鑑。',
    '沒用提示答對，可以多拿 20% XP。',
    '每一題第一次答對都會得到那座島的素材，可以回家蓋裝飾。',
    '面試題要用講的！先自己講 1–2 分鐘，再對答案。',
    '覺得走路太慢？右上角的「清單」可以直接選課。',
    '金幣可以買護盾，漏掉一天時保住連續天數。',
  ];
  function guideTalk() {
    const s = currentStep || nextStep();
    G.world.guideSay('嗨！' + TIPS[Math.floor(Math.random() * TIPS.length)] + ' 下一步：' + s.text + '。', 7000);
    snd('click');
  }

  /* ---------- 設定 ---------- */
  function settings() {
    const st = store.state.settings;
    let armed = false;
    const file = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
    file.addEventListener('change', () => {
      const f = file.files[0];
      if (!f) return;
      f.text().then((t) => { store.importText(t); G.world.refreshAll(); G.world.setLook(store.state.avatar); refresh(); closeModal(); toast('已匯入存檔'); }).catch((e) => toast('匯入失敗：' + e.message));
    });
    const resetBtn = el('button', { class: 'btn danger', type: 'button', text: '重設全部進度', onclick: () => {
      if (!armed) { armed = true; resetBtn.textContent = '再按一次確認（無法復原）'; return; }
      store.reset(); G.world.refreshAll(); G.world.setLook(store.state.avatar); refresh(); closeModal(); toast('進度已重設');
    } });
    const radio = (key, opts) => el('div', { class: 'seg' }, opts.map(([v, t]) => el('button', { type: 'button', class: st[key] === v ? 'on' : '', text: t, onclick: () => { st[key] = v; store.save(); if (key === 'time') G.world.applyTime(); settings(); } })));
    modal(el('div', { class: 'qz setup' }, [
      el('h2', { text: '設定' }),
      el('h4', { text: '時間' }), radio('time', [['real', '跟著真實時間'], ['day', '永遠白天'], ['night', '永遠夜晚']]),
      el('h4', { text: '畫面' }),
      el('div', { class: 'seg' }, [
        el('button', { type: 'button', class: st.labels ? 'on' : '', text: st.labels ? '名牌：顯示' : '名牌：隱藏', onclick: () => { st.labels = !st.labels; store.save(); G.world.setLabels(st.labels); settings(); } }),
        el('button', { type: 'button', class: st.sound ? 'on' : '', text: st.sound ? '音效：開' : '音效：關', onclick: () => { st.sound = !st.sound; store.save(); refreshHud(); settings(); } }),
      ]),
      el('h4', { text: '存檔' }),
      el('p', { class: 'hint', text: '進度存在這個瀏覽器裡。換電腦、換瀏覽器或清除瀏覽資料前，先匯出存檔。1.0 版的存檔會自動沿用。' }),
      el('div', { class: 'setrow' }, [
        el('button', { class: 'btn', type: 'button', text: '匯出存檔', onclick: () => {
          const a = el('a', { href: URL.createObjectURL(new Blob([store.exportText()], { type: 'application/json' })), download: 'AI學習群島_存檔_' + store.dayStr() + '.json' });
          document.body.appendChild(a); a.click(); a.remove();
        } }),
        el('button', { class: 'btn', type: 'button', text: '匯入存檔', onclick: () => file.click() }), file, resetBtn,
      ]),
      G.ai ? el('h4', { text: 'AI 助教（Gemini）' }) : null,
      G.ai ? el('p', { class: 'hint', text: G.ai.ready() ? '已連接，模型：' + G.ai.model + '。' : '輸入遊戲作者給的通行碼（用分享的額度），或貼上自己的 Gemini API 金鑰，就能問 AI 助教、請 AI 解釋題目、挑戰 AI 面試官。' }) : null,
      G.ai ? el('div', { class: 'setrow' }, [el('button', { class: 'btn', type: 'button', text: G.ai.ready() ? '連線設定' : '連接 Gemini', onclick: () => { closeModal(); G.ai.open({ setup: true }); } })]) : null,
      el('h4', { text: '說明' }),
      el('div', { class: 'setrow' }, [el('button', { class: 'btn', type: 'button', text: '重看新手教學', onclick: () => tutorial(0) })]),
      el('p', { class: 'hint', text: '操作：WASD／方向鍵走路（Shift 跑步；手機用左下角的搖桿）、點課程建築會自動走過去、拖曳轉鏡頭、滾輪縮放、E 或空白鍵互動、Esc 關閉視窗。' }),
    ]));
  }

  /* ---------- 新手教學 ---------- */
  const TUTORIAL = [
    ['嗨，我是小星！', '歡迎來到 AI 學習群島。這裡有 ' + Object.keys(G.regions).length + ' 座領域島和你自己的小島，每一堂課是島上的一個地點。'],
    ['怎麼走路', '用 WASD 或方向鍵走路（按住 Shift 跑步）；手機和平板用左下角的搖桿。點課程建築或名牌會自動走過去。拖曳畫面轉鏡頭、滾輪縮放。走到地點旁邊按 E、空白鍵或點提示進入。'],
    ['先上課，再闖關', '每個地點先上一堂小課（鏡頭會帶你看每棟概念建築，還有不扣分的小測驗），再挑戰關卡，最後一關是 Boss：面試官。也可以按「我已經會了，直接挑戰」。'],
    ['錯誤會變成蟲', '答錯會冒出一隻野生的蟲。之後答對同一題就抓到牠，收進蟲蟲圖鑑。每一種蟲都在提醒你一種常見的錯誤。'],
    ['雜草就是該複習了', '答過的題目會在 1、3、7、21 天後回來，到時候那裡會長雜草。每天先拔草，連續天數會累積金幣。'],
    ['島上還有很多事', '每座島的碼頭盡頭按 E 就能甩竿釣魚（浮標沉下去再按一次拉竿，答對題目就釣起來）、島上每天藏一個寶箱、島民會給你支線任務；坐船時可能遇到海怪或漂流瓶。我的小島有遊戲機台：翻牌配對和 60 秒快問快答。Boss 可以挑戰 AI 面試官（要先在右上角「🤖 AI 助教」連接 Gemini）。'],
    ['看下面的「下一步」', '不知道要做什麼時，按畫面下方的「出發」，我會帶你去。想直接選課就用右上角的「清單」。所有島都可以直接去，不用照順序。'],
  ];
  function tutorial(i) {
    i = i || 0;
    const last = i === TUTORIAL.length - 1;
    modal(el('div', { class: 'tut' }, [
      el('img', { src: G.avatar.guideIcon(), alt: '' }),
      el('div', {}, [
        el('div', { class: 'eyebrow', text: '新手教學 ' + (i + 1) + ' / ' + TUTORIAL.length }),
        el('h2', { text: TUTORIAL[i][0] }),
        el('p', { text: TUTORIAL[i][1] }),
        el('div', { class: 'qz-foot' }, [
          el('button', { class: 'btn', type: 'button', text: '略過', onclick: closeModal }),
          i > 0 ? el('button', { class: 'btn', type: 'button', text: '上一步', onclick: () => tutorial(i - 1) }) : null,
          el('button', { class: 'btn primary', type: 'button', text: last ? '開始冒險' : '下一步', onclick: () => (last ? closeModal() : tutorial(i + 1)) }),
        ]),
      ]),
    ]), { onClose: () => { store.state.tutorialDone = true; store.save(); G.world.guideSay('準備好了嗎？看畫面下方的「下一步」，我帶你出發！', 6000); } });
  }

  /* ---------- 綁定 ---------- */
  function bind() {
    $('hud-me').addEventListener('click', openProfile);
    $('btn-map').addEventListener('click', openMap);
    $('btn-ai').addEventListener('click', () => G.ai.open());
    $('btn-list').addEventListener('click', () => toggleDrawer());
    $('btn-bugs').addEventListener('click', () => openBugs());
    $('btn-daily').addEventListener('click', openDaily);
    $('btn-wear').addEventListener('click', () => openWardrobe());
    $('btn-home').addEventListener('click', () => { closeAll(); G.world.goHome(); });
    $('btn-sound').addEventListener('click', () => { const s = store.state.settings; s.sound = !s.sound; store.save(); refreshHud(); });
    $('btn-settings').addEventListener('click', settings);
    $('gb-go').addEventListener('click', () => { if (currentStep) { snd('click'); currentStep.go(); } });
    $('modal').addEventListener('pointerdown', (e) => { if (e.target === $('modal')) closeModal(); });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!$('lvup').hidden) $('lvup').hidden = true;
      else if (!$('modal').hidden) closeModal();
      else if (G.lesson.active) G.lesson.close();
      else if (!$('drawer').hidden) toggleDrawer(false);
    });
  }

  function refresh() { refreshHud(); renderDrawer(); }

  G.ui = {
    modal, closeModal, toast, isBlocking, closeAll, refresh, refreshHud, bind,
    openPlace, startRound, startWeeds, startSelfBoss: (r) => G.quiz.start({ title: '第 ' + r.lesson.no + ' 堂', questions: G.util.shuffle(r.questions.slice()), mode: 'round', round: r, lesson: r.lesson }), openMap, travelConfirm, openDaily, openBugs, openWardrobe, openBuild, openProfile,
    guideTalk, levelUp, checkLevel, tutorial, interviewSetup, goPlace,
  };
})();
