/* 出題與作答：七種題型、提示、蟲、獎勵、關卡星等；也提供課程裡的小測驗與重點卡 */
(function () {
  'use strict';
  const G = window.G;
  const { el, rich, shuffle } = G.util;
  const store = G.store;
  const LEVEL_NAMES = ['木牌', '鷹架', '小屋', '地標'];
  const TYPE_NAMES = { single: '單選', multi: '複選', tf: '是非', match: '配對', order: '排序', code: '讀程式', interview: '面試口述' };
  let S = null;
  let keyHandler = null;

  function detachKeys() { if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; } }
  function keys(fn) { detachKeys(); keyHandler = fn; document.addEventListener('keydown', fn); }
  const snd = (n) => G.sound && G.sound.play(n);

  /* ---------- 把一題畫進容器；作答完呼叫 cfg.onAnswered(correct, detailNode, {hint, ms}) ---------- */
  function mountQuestion(q, host, cfg) {
    const t0 = Date.now();
    let usedHint = false;
    const body = el('div', { class: 'qz-body' });
    const foot = el('div', { class: 'qz-foot' });
    host.appendChild(el('div', { class: 'qz-q', html: rich(q.q) }));
    if (q.code) host.appendChild(el('pre', { class: 'code' }, [el('code', { text: q.code })]));
    host.appendChild(body);
    host.appendChild(foot);
    let answered = false;
    const done = (correct, detail) => {
      if (answered) return;
      answered = true;
      hintBtn.remove();
      cfg.onAnswered(correct, detail, { hint: usedHint, ms: Date.now() - t0 }, body, foot);
    };
    const r = ({ single: renderChoice, code: renderChoice, tf: renderTF, multi: renderMulti, match: renderMatch, order: renderOrder, interview: renderInterview })[q.type](q, body, foot, done);
    const hintBtn = el('button', { class: 'btn ghost hint-btn', type: 'button', text: '💡 提示（免費）', onclick: () => {
      if (usedHint) return;
      usedHint = true;
      hintBtn.disabled = true;
      hintBtn.textContent = '💡 已使用提示';
      (r && r.hint ? r.hint : () => showCardHint(q, body))();
    } });
    if (!cfg.noHint) foot.insertBefore(hintBtn, foot.firstChild);
    return { body, foot };
  }
  function showCardHint(q, body) {
    body.appendChild(el('div', { class: 'hintbox' }, [el('b', { text: '提示：' }), el('span', { html: rich(G.util.firstSentence(q.concept.card.what)) })]));
  }

  /* ---------- 各題型 ---------- */
  function renderChoice(q, body, foot, done) {
    const order = shuffle(q.options.map((_, i) => i));
    const btns = order.map((oi, k) => el('button', {
      class: 'opt', type: 'button', html: '<kbd>' + (k + 1) + '</kbd><span>' + rich(q.options[oi]) + '</span>',
      onclick: () => {
        btns.forEach((b, j) => { b.disabled = true; if (order[j] === q.answer) b.classList.add('right'); });
        if (oi !== q.answer) btns[k].classList.add('wrong');
        done(oi === q.answer);
      },
    }));
    btns.forEach((b) => body.appendChild(b));
    keys((e) => { const n = parseInt(e.key, 10); if (n >= 1 && n <= btns.length && !btns[n - 1].disabled) btns[n - 1].click(); });
    return { hint() {
      const cand = btns.filter((b, j) => order[j] !== q.answer && !b.disabled);
      const b = cand[Math.floor(Math.random() * cand.length)];
      if (b) { b.disabled = true; b.classList.add('elim'); }
    } };
  }

  function renderTF(q, body, foot, done) {
    const mk = (val, label, k) => el('button', {
      class: 'opt tf', type: 'button', html: '<kbd>' + k + '</kbd><span>' + label + '</span>',
      onclick: () => {
        bs.forEach((b) => { b.disabled = true; });
        (q.answer ? bs[0] : bs[1]).classList.add('right');
        if (val !== q.answer) (val ? bs[0] : bs[1]).classList.add('wrong');
        done(val === q.answer);
      },
    });
    const bs = [mk(true, '正確', 1), mk(false, '錯誤', 2)];
    body.appendChild(el('div', { class: 'tf-row' }, bs));
    keys((e) => { if (bs[0].disabled) return; if (e.key === '1') bs[0].click(); if (e.key === '2') bs[1].click(); });
    return null;
  }

  function renderMulti(q, body, foot, done) {
    const order = shuffle(q.options.map((_, i) => i));
    const picked = new Set();
    const ans = new Set(q.answer);
    const submit = el('button', { class: 'btn primary', type: 'button', text: '送出', disabled: true });
    const btns = order.map((oi, k) => el('button', {
      class: 'opt multi', type: 'button', html: '<kbd>' + (k + 1) + '</kbd><span>' + rich(q.options[oi]) + '</span>',
      onclick: () => {
        if (picked.has(oi)) picked.delete(oi); else picked.add(oi);
        btns[k].classList.toggle('picked', picked.has(oi));
        submit.disabled = picked.size === 0;
      },
    }));
    btns.forEach((b) => body.appendChild(b));
    body.appendChild(el('div', { class: 'hint', text: '可以選不只一個，選完按「送出」。' }));
    foot.appendChild(submit);
    submit.addEventListener('click', () => {
      let ok = picked.size === ans.size;
      btns.forEach((b, j) => {
        b.disabled = true;
        const oi = order[j];
        if (ans.has(oi)) b.classList.add('right');
        if (picked.has(oi) && !ans.has(oi)) { b.classList.add('wrong'); ok = false; }
        if (!picked.has(oi) && ans.has(oi)) { b.classList.add('missed'); ok = false; }
      });
      submit.remove();
      done(ok);
    });
    keys((e) => {
      if (!submit.isConnected) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= btns.length && !btns[n - 1].disabled) btns[n - 1].click();
      if (e.key === 'Enter' && !submit.disabled) submit.click();
    });
    return { hint() {
      const cand = btns.filter((b, j) => !ans.has(order[j]) && !b.disabled);
      const b = cand[Math.floor(Math.random() * cand.length)];
      if (b) { const oi = order[btns.indexOf(b)]; picked.delete(oi); b.classList.remove('picked'); b.disabled = true; b.classList.add('elim'); submit.disabled = picked.size === 0; }
    } };
  }

  function renderMatch(q, body, foot, done) {
    const rights = shuffle(q.pairs.map((_, i) => i));
    const pairOf = new Map();
    const locked = new Set();
    let cur = null;
    const submit = el('button', { class: 'btn primary', type: 'button', text: '送出', disabled: true });
    const L = q.pairs.map((p, i) => el('button', { class: 'mt', type: 'button', html: rich(p[0]), onclick: () => pickL(i) }));
    const R = rights.map((ri) => el('button', { class: 'mt', type: 'button', html: rich(q.pairs[ri][1]), onclick: () => pickR(ri) }));
    const owner = (ri) => { let o = null; pairOf.forEach((v, key) => { if (v === ri) o = key; }); return o; };
    function paint() {
      L.forEach((b, i) => { b.className = 'mt' + (cur === i ? ' cur' : '') + (pairOf.has(i) ? ' p' + (i % 5) : '') + (locked.has(i) ? ' lock' : ''); });
      R.forEach((b, k) => { const o = owner(rights[k]); b.className = 'mt' + (o != null ? ' p' + (o % 5) : '') + (o != null && locked.has(o) ? ' lock' : ''); });
      submit.disabled = pairOf.size !== q.pairs.length;
    }
    function pickL(i) { if (locked.has(i)) return; if (pairOf.has(i)) pairOf.delete(i); cur = cur === i ? null : i; paint(); }
    function pickR(ri) {
      const o = owner(ri);
      if (o != null && locked.has(o)) return;
      if (o != null) { pairOf.delete(o); if (cur == null) { paint(); return; } }
      if (cur == null) { const free = q.pairs.findIndex((_, i) => !pairOf.has(i)); if (free < 0) return; cur = free; }
      pairOf.set(cur, ri);
      const next = q.pairs.findIndex((_, i) => !pairOf.has(i));
      cur = next < 0 ? null : next;
      paint();
    }
    cur = 0;
    body.appendChild(el('div', { class: 'match' }, [el('div', { class: 'mcol' }, L), el('div', { class: 'mcol' }, R)]));
    body.appendChild(el('div', { class: 'hint', text: '先點左邊，再點右邊對應的說明。點已配對的可以取消。' }));
    foot.appendChild(submit);
    paint();
    submit.addEventListener('click', () => {
      let ok = true;
      L.forEach((b, i) => { b.disabled = true; const good = pairOf.get(i) === i; b.classList.add(good ? 'right' : 'wrong'); if (!good) ok = false; });
      R.forEach((b) => { b.disabled = true; });
      submit.remove();
      const table = el('div', { class: 'answer-table' }, q.pairs.map((p) => el('div', {}, [el('b', { html: rich(p[0]) }), el('span', { html: rich(p[1]) })])));
      done(ok, ok ? null : table);
    });
    keys((e) => { if (e.key === 'Enter' && submit.isConnected && !submit.disabled) submit.click(); });
    return { hint() {
      const i = q.pairs.findIndex((_, k) => pairOf.get(k) !== k);
      if (i < 0) return;
      const o = owner(i); if (o != null) pairOf.delete(o);
      pairOf.set(i, i); locked.add(i);
      const next = q.pairs.findIndex((_, k) => !pairOf.has(k));
      cur = next < 0 ? null : next;
      paint();
    } };
  }

  function renderOrder(q, body, foot, done) {
    const pool = shuffle(q.items.map((_, i) => i));
    if (pool.every((v, i) => v === i)) pool.reverse();
    const seq = [];
    let lockFirst = false;
    const submit = el('button', { class: 'btn primary', type: 'button', text: '送出', disabled: true });
    const seqBox = el('ol', { class: 'seq' });
    const poolBox = el('div', { class: 'pool' });
    function paint() {
      seqBox.innerHTML = ''; poolBox.innerHTML = '';
      seq.forEach((idx, k) => seqBox.appendChild(el('li', {}, [el('button', { class: 'chipbtn' + (lockFirst && k === 0 ? ' lock' : ''), type: 'button', html: rich(q.items[idx]), onclick: () => { if (lockFirst && k === 0) return; seq.splice(k, 1); pool.push(idx); paint(); } })])));
      if (!seq.length) seqBox.appendChild(el('li', { class: 'ph', text: '依序點下面的項目，排到這裡' }));
      pool.forEach((idx, k) => poolBox.appendChild(el('button', { class: 'chipbtn', type: 'button', html: rich(q.items[idx]), onclick: () => { pool.splice(k, 1); seq.push(idx); paint(); } })));
      submit.disabled = pool.length > 0;
    }
    body.appendChild(seqBox); body.appendChild(poolBox);
    foot.appendChild(submit);
    paint();
    submit.addEventListener('click', () => {
      const ok = seq.every((v, i) => v === i);
      [...seqBox.querySelectorAll('button')].forEach((b, i) => { b.disabled = true; b.classList.add(seq[i] === i ? 'right' : 'wrong'); });
      submit.remove();
      const table = el('ol', { class: 'answer-list' }, q.items.map((t) => el('li', { html: rich(t) })));
      done(ok, ok ? null : table);
    });
    keys((e) => { if (e.key === 'Enter' && submit.isConnected && !submit.disabled) submit.click(); });
    return { hint() {
      seq.splice(0).forEach((x) => pool.push(x));
      pool.splice(pool.indexOf(0), 1);
      seq.push(0); lockFirst = true;
      paint();
    } };
  }

  function renderInterview(q, body, foot, done) {
    const t0 = Date.now();
    const clock = el('span', { class: 'clock', text: '0:00' });
    const timer = setInterval(() => {
      if (!clock.isConnected) { clearInterval(timer); return; }
      const s = Math.floor((Date.now() - t0) / 1000);
      clock.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }, 500);
    const reveal = el('button', { class: 'btn primary', type: 'button', text: '我講完了，看參考答案' });
    body.appendChild(el('div', { class: 'iv-box' }, [
      el('p', { text: '面試官在等你回答。先不要看答案，用自己的話講 1–2 分鐘（講出聲音效果最好）。' }),
      el('div', { class: 'iv-timer' }, [el('span', { text: '已經講了 ' }), clock]),
      el('textarea', { placeholder: '想打字整理思緒可以寫在這裡（不會存檔）', rows: 3 }),
    ]));
    foot.appendChild(reveal);
    reveal.addEventListener('click', () => {
      clearInterval(timer);
      reveal.remove();
      const checks = q.points.map((p) => {
        const cb = el('input', { type: 'checkbox' });
        return { cb, node: el('label', { class: 'pt' }, [cb, el('span', { html: rich(p) })]) };
      });
      const finishBtn = el('button', { class: 'btn primary', type: 'button', text: '完成自評' });
      body.appendChild(el('div', { class: 'iv-points' }, [el('h4', { text: '你剛剛有講到哪幾點？（誠實勾選）' })].concat(checks.map((c) => c.node))));
      body.appendChild(el('div', { class: 'iv-answer' }, [el('h4', { text: '參考答案' }), el('p', { html: rich(q.answer) })]));
      foot.appendChild(finishBtn);
      finishBtn.addEventListener('click', () => {
        const n = checks.filter((c) => c.cb.checked).length;
        checks.forEach((c) => { c.cb.disabled = true; });
        finishBtn.remove();
        const need = Math.ceil(q.points.length * 0.6);
        done(n >= need, el('div', { class: 'hint', text: '講到 ' + n + ' / ' + q.points.length + ' 個要點（' + need + ' 個以上算通過）。' }));
      });
    });
    keys(() => {});
    return { hint() { body.insertBefore(el('div', { class: 'hintbox' }, [el('b', { text: '提示：第一個要點是 ' }), el('span', { html: rich(q.points[0]) })]), body.firstChild); } };
  }

  /* ---------- 一輪練習（關卡、拔草、模式） ---------- */
  function start(opts) {
    const list = opts.questions.slice();
    if (!list.length) { G.ui.toast('目前沒有可以出的題目'); return; }
    S = Object.assign({}, opts, {
      list, i: 0, right: 0, total: list.length, xp: 0, coins: 0, mats: {}, weeded: 0,
      requeued: new Set(), wrong: [], spawned: [], caught: [],
      cBefore: new Map(), lBefore: new Map(), lvBefore: store.level().lv,
    });
    list.forEach((q) => {
      if (!S.cBefore.has(q.concept)) S.cBefore.set(q.concept, store.conceptLevel(q.concept));
      if (!S.lBefore.has(q.lesson)) S.lBefore.set(q.lesson, G.world.levels(q.lesson));
    });
    render();
  }

  function header() {
    const done = Math.min(S.i, S.list.length);
    const title = S.round ? (S.round.boss ? 'Boss：面試官' : '關卡：' + S.round.title) : S.title;
    return el('div', { class: 'qz-head' }, [
      el('div', { class: 'qz-title' }, [el('b', { html: rich(title) }), el('span', { text: Math.min(done + 1, S.list.length) + ' / ' + S.list.length })]),
      el('div', { class: 'bar' }, [el('i', { style: 'width:' + (done / S.list.length) * 100 + '%' })]),
    ]);
  }

  function render() {
    const q = S.list[S.i];
    const again = S.requeued.has(q.id);
    const st = store.qs(q.id);
    const card = el('div', { class: 'qz' + (S.round && S.round.boss ? ' boss' : '') }, [
      header(),
      el('div', { class: 'qz-meta' }, [
        el('span', { class: 'chip', style: '--c:' + q.lesson.region.color, text: '第 ' + q.lesson.no + ' 堂 ' + q.lesson.title }),
        el('span', { class: 'chip ghost', html: rich(q.concept.name) }),
        el('span', { class: 'chip ghost', text: TYPE_NAMES[q.type] }),
        again ? el('span', { class: 'chip warn', text: '再試一次' }) : (st ? (store.isDue(q.id) ? el('span', { class: 'chip weed', text: '🌿 雜草' }) : null) : el('span', { class: 'chip new', text: '新題' })),
        store.state.bugs.active[q.id] ? el('span', { class: 'chip bug', text: '🐛 這題有蟲' }) : null,
      ]),
    ]);
    G.ui.modal(card, { wide: true, onClose: () => { detachKeys(); if (S && S.i > 0) finish(true); else S = null; } });
    mountQuestion(q, card, { onAnswered: (correct, detail, info, body, foot) => answered(q, correct, detail, info, body, foot) });
  }

  function rewardLine(res) {
    const bits = [];
    if (res.xp) bits.push(el('span', { class: 'rw xp', text: '+' + res.xp + ' XP' }));
    if (res.coins) bits.push(el('span', { class: 'rw coin', text: '+' + res.coins + ' 金幣' }));
    if (res.mat) bits.push(el('span', { class: 'rw mat', text: '+' + res.mat + ' ' + store.MATS[res.region].name + ' ' + store.MATS[res.region].icon }));
    if (res.weeded) bits.push(el('span', { class: 'rw weed', text: '拔掉一根雜草 🌿' }));
    return bits.length ? el('div', { class: 'rewards' }, bits) : null;
  }
  function bugBox(type, caught) {
    const b = store.bug(type);
    return el('div', { class: 'bugbox ' + (caught ? 'caught' : 'spawn') }, [
      el('img', { src: G.avatar.bugIcon(type), alt: '' }),
      el('div', {}, [
        el('b', { text: caught ? '抓到了「' + b.name + '」！' : '野生的「' + b.name + '」出現了！' }),
        el('span', { text: caught ? '已收進蟲蟲圖鑑。' : b.how + ' 之後答對這題就能抓到牠。' }),
      ]),
    ]);
  }

  function answered(q, correct, detail, info, body, foot) {
    const again = S.requeued.has(q.id);
    let res = { xp: 0, coins: 0 };
    if (!again) {
      res = store.answer(q, correct, info);
      res.region = q.lesson.region.id;
      S.xp += res.xp; S.coins += res.coins;
      if (res.mat) S.mats[res.region] = (S.mats[res.region] || 0) + res.mat;
      if (res.weeded) S.weeded++;
      if (res.bugSpawn) S.spawned.push(res.bugSpawn);
      if (res.bugCaught) S.caught.push(res.bugCaught);
      if (correct) S.right++;
      else { S.wrong.push(q); if (S.mode !== 'interview' && !(S.round && S.round.boss)) { S.requeued.add(q.id); S.list.push(q); } }
    } else if (correct && store.state.bugs.active[q.id]) {
      res = store.answer(q, true, info); res.region = q.lesson.region.id;
      S.xp += res.xp; S.coins += res.coins;
      if (res.mat) S.mats[res.region] = (S.mats[res.region] || 0) + res.mat;
      if (res.bugCaught) S.caught.push(res.bugCaught);
    }
    snd(correct ? 'right' : 'wrong');
    if (res.bugSpawn) setTimeout(() => snd('bug'), 250);
    if (res.bugCaught) setTimeout(() => snd('catch'), 250);
    const s = store.qs(q.id);
    const days = store.INTERVAL_DAYS[s ? s.b : 0];
    const fb = el('div', { class: 'fb ' + (correct ? 'ok' : 'no') }, [
      el('div', { class: 'fb-head' }, [
        el('b', { text: correct ? (q.type === 'interview' ? '通過！' : '答對了！') : (q.type === 'interview' ? '還沒講完整' : '差一點！') }),
        el('span', { class: 'next-due', text: again ? '這題稍後會再出現在複習裡' : (days ? days + ' 天後回來複習' : '這一輪結束前會再考一次') }),
      ]),
      rewardLine(res),
      correct && !info.hint && res.xp ? el('div', { class: 'hint', text: '沒用提示，多拿 20% XP。' }) : null,
      res.bugSpawn ? bugBox(res.bugSpawn, false) : null,
      res.bugCaught ? bugBox(res.bugCaught, true) : null,
      detail || null,
      q.explain ? el('p', { class: 'explain', html: rich(q.explain) }) : null,
      el('button', { class: 'linkbtn', type: 'button', text: '看這個概念的重點卡', onclick: () => toggleCard(fb, q.concept) }),
    ]);
    body.appendChild(fb);
    const last = S.i >= S.list.length - 1;
    const next = el('button', { class: 'btn primary', type: 'button', text: last ? '看結算' : '下一題' });
    next.addEventListener('click', () => { S.i++; if (S.i >= S.list.length) finish(false); else render(); });
    foot.appendChild(next);
    fb.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    keys((e) => { if (e.key === 'Enter') next.click(); });
    next.focus({ preventScroll: true });
    G.ui.refreshHud();
  }

  function cardNode(c) {
    const rows = [['是什麼', c.card.what], ['為什麼', c.card.why], ['什麼時候用', c.card.when], ['缺點與陷阱', c.card.cons]];
    return el('div', { class: 'ccard' }, rows.map(([k, v]) => el('div', { class: 'crow' }, [el('h5', { text: k }), el('p', { html: rich(v) })])));
  }
  function toggleCard(host, concept) {
    const old = host.querySelector('.ccard');
    if (old) old.remove(); else host.appendChild(cardNode(concept));
  }

  /* ---------- 結算 ---------- */
  function finish(early) {
    detachKeys();
    const s = S; S = null;
    const ups = [];
    s.cBefore.forEach((lv, c) => { const now = store.conceptLevel(c); if (now !== lv) ups.push({ c, from: lv, to: now }); });
    s.lBefore.forEach((levels, lesson) => G.world.refresh(lesson, levels));
    const answeredN = Math.min(s.i, s.total);
    if (early && !answeredN) { G.ui.closeModal(); return; }
    let roundRes = null;
    if (s.round && !early) roundRes = store.finishRound(s.round, s.right, s.total);
    let dailyNow = false;
    if (!early && (s.round || s.mode === 'review' || s.weeded)) dailyNow = store.dailyDone();
    store.log((s.round ? '第 ' + s.round.lesson.no + ' 堂 ' + (s.round.boss ? 'Boss' : '關卡「' + s.round.title + '」') : s.title) + '：' + s.right + ' / ' + s.total + ' 題，+' + s.xp + ' XP、+' + s.coins + ' 金幣' + (s.caught.length ? '，抓到 ' + s.caught.length + ' 隻蟲' : ''));
    G.ui.refresh();
    const lvAfter = store.level().lv;
    const wildLeft = [...new Set(s.wrong)].map((q) => store.state.bugs.active[q.id]).filter(Boolean).map((b) => b.type);
    const node = el('div', { class: 'qz sum' }, [
      el('h2', { text: early ? '這一輪先到這裡' : roundRes ? (roundRes.firstClear ? '過關！' : '完成！') : '這一輪完成' }),
      roundRes ? el('div', { class: 'stars big' }, [1, 2, 3].map((k) => el('i', { class: k <= roundRes.stars ? 'on' : '', text: '★' }))) : null,
      el('div', { class: 'sum-top' }, [
        el('div', { class: 'ring', style: '--p:' + Math.round((s.right / s.total) * 100) }, [el('b', { text: s.right + '/' + s.total }), el('i', { text: '第一次就答對' })]),
        el('div', { class: 'sum-stats' }, [
          el('div', {}, [el('b', { text: '+' + s.xp }), el('span', { text: 'XP' })]),
          el('div', {}, [el('b', { text: '+' + (s.coins + (roundRes ? roundRes.coins : 0) + (dailyNow ? 10 : 0)) }), el('span', { text: '金幣' })]),
          Object.keys(s.mats).length ? el('div', {}, [el('b', { text: Object.entries(s.mats).map(([r, n]) => store.MATS[r].icon + n).join(' ') }), el('span', { text: '素材' })]) : null,
        ]),
      ]),
      roundRes && roundRes.firstClear ? el('p', { class: 'goodnews', text: '第一次過關，獎勵 ' + roundRes.coins + ' 金幣！' }) : null,
      dailyNow ? el('p', { class: 'goodnews', text: '今日任務完成，+10 金幣！' }) : null,
      lvAfter > s.lvBefore ? el('p', { class: 'goodnews lvup', text: '升級了！現在是 Lv ' + lvAfter }) : null,
      s.weeded ? el('p', { class: 'hint', text: '拔掉了 ' + s.weeded + ' 根雜草。' }) : null,
      s.caught.length || wildLeft.length ? el('div', { class: 'sum-bugs' }, [
        s.caught.length ? el('div', {}, [el('span', { text: '抓到：' })].concat(s.caught.map((t) => el('img', { src: G.avatar.bugIcon(t), title: store.bug(t).name })))) : null,
        wildLeft.length ? el('div', {}, [el('span', { text: '還在外面（之後答對就抓得到）：' })].concat(wildLeft.map((t) => el('img', { src: G.avatar.bugIcon(t), title: store.bug(t).name })))) : null,
      ]) : null,
      ups.length ? el('div', { class: 'sum-ups' }, [el('h4', { text: '島上的變化' })].concat(ups.map((u) => el('div', { class: 'up ' + (u.to > u.from ? 'good' : 'bad') }, [
        el('span', { class: 'chip', style: '--c:' + u.c.lesson.region.color, text: u.c.lesson.no }),
        el('span', { html: rich(u.c.name) }),
        el('b', { text: LEVEL_NAMES[u.from] + ' → ' + LEVEL_NAMES[u.to] }),
      ])))) : null,
      el('div', { class: 'qz-foot' }, [
        s.wrong.length ? el('button', { class: 'btn', type: 'button', text: '只重練答錯的', onclick: () => start({ title: '重練答錯的題目', questions: [...new Set(s.wrong)], mode: 'practice' }) }) : null,
        s.round ? (() => {
          const rs = store.rounds(s.round.lesson);
          const k = rs.findIndex((r) => r.key === s.round.key);
          const nx = rs[k + 1];
          return nx ? el('button', { class: 'btn', type: 'button', text: nx.boss ? '挑戰 Boss' : '下一關', onclick: () => G.ui.startRound(nx) }) : null;
        })() : null,
        s.round ? el('button', { class: 'btn', type: 'button', text: '回到地點', onclick: () => G.ui.openPlace(s.round.lesson) }) : null,
        el('button', { class: 'btn primary', type: 'button', text: '回到世界', onclick: () => G.ui.closeModal() }),
      ]),
    ]);
    G.ui.modal(node, {});
    if (lvAfter > s.lvBefore) G.ui.levelUp(s.lvBefore, lvAfter);
    else if (roundRes && roundRes.stars === 3) { G.world.celebrate(); snd('fanfare'); }
    if (s.onDone) s.onDone(s);
  }

  /* ---------- 課程用的小測驗（不影響複習排程） ---------- */
  function mini(q, host, onDone) {
    const box = el('div', { class: 'mini' });
    box.appendChild(el('div', { class: 'mini-tag', text: '小測驗（答錯不扣分）' }));
    host.appendChild(box);
    mountQuestion(q, box, {
      onAnswered: (correct, detail, info, body) => {
        const xp = store.miniAnswer(correct);
        snd(correct ? 'right' : 'wrong');
        body.appendChild(el('div', { class: 'fb ' + (correct ? 'ok' : 'no') }, [
          el('div', { class: 'fb-head' }, [el('b', { text: correct ? '答對了！' : '差一點！' }), xp ? el('span', { class: 'rw xp', text: '+' + xp + ' XP' }) : null]),
          detail || null,
          q.explain ? el('p', { class: 'explain', html: rich(q.explain) }) : null,
        ]));
        detachKeys();
        if (onDone) onDone(correct);
        G.ui.refreshHud();
      },
    });
  }

  /* ---------- 重點卡 ---------- */
  function showCards(lesson, index) {
    let i = index || 0;
    const draw = () => {
      const c = lesson.concepts[i];
      store.state.read[lesson.id + '.' + c.id] = 1; store.save();
      const lv = store.conceptLevel(c);
      const node = el('div', { class: 'qz cards' }, [
        el('div', { class: 'qz-title' }, [el('b', { text: '第 ' + lesson.no + ' 堂 ' + lesson.title + '｜重點卡' }), el('span', { text: (i + 1) + ' / ' + lesson.concepts.length })]),
        el('div', { class: 'dots' }, lesson.concepts.map((cc, k) => el('button', { class: 'dot' + (k === i ? ' on' : ''), type: 'button', title: cc.name, text: G.util.circled(k), onclick: () => { i = k; draw(); } }))),
        el('h2', { class: 'cname', html: rich(c.name) }),
        el('div', { class: 'lvline' }, [el('span', { class: 'lv lv' + lv, text: LEVEL_NAMES[lv] }), el('span', { text: c.questions.length + ' 題，其中 ' + c.questions.filter((q) => q.type === 'interview').length + ' 題面試口述' })]),
        cardNode(c),
        el('div', { class: 'qz-foot' }, [
          el('button', { class: 'btn', type: 'button', text: '上一張', disabled: i === 0, onclick: () => { i--; draw(); } }),
          el('button', { class: 'btn', type: 'button', text: '下一張', disabled: i === lesson.concepts.length - 1, onclick: () => { i++; draw(); } }),
          el('button', { class: 'btn', type: 'button', text: '回到地點', onclick: () => G.ui.openPlace(lesson) }),
        ]),
      ]);
      G.ui.modal(node, {});
      keys((e) => {
        if (e.key === 'ArrowRight' && i < lesson.concepts.length - 1) { i++; draw(); }
        if (e.key === 'ArrowLeft' && i > 0) { i--; draw(); }
      });
    };
    draw();
  }

  G.quiz = { start, mini, showCards, cardNode, LEVEL_NAMES, TYPE_NAMES, detachKeys, get active() { return !!S; } };
})();
