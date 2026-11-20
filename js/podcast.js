/* AI 學習群島：Podcast 節目表與迷你播放器
 *
 * - 不用玩也能聽：工具列「🎧 節目」打開節目表，選一集就播；走路、坐船、開別的視窗都不會停。
 * - 掛機聽：播放中 1 分鐘沒操作，3D 畫面暫停（G.world.idle）省電，聲音照常；點一下就回到遊戲。
 * - 收聽進度存在存檔的 state.podcast（每集聽到幾秒、聽完了沒、領過獎勵沒），匯出／匯入存檔會一起帶走。
 * - 聽節目不改變複習排程；每集第一次聽完 +10 XP。
 * 節目資料在 data/podcast.js（tools/build_podcast.py 產生）。
 */
(function () {
  'use strict';
  const G = window.G;
  const store = G.store;
  const el = G.util.el;
  const $ = (id) => document.getElementById(id);
  const DATA = window.GAME_PODCAST || { episodes: [] };
  const ONLINE = 'https://jingwenliu0113-afk.github.io/ai-learning-islands/';
  // 聲音檔的位置：線上版在 podcast/；從壓縮檔解開直接雙擊時改連線上；本機版在 podcast_audio/
  const BASE = window.GAME_SHARED ? (location.protocol === 'file:' ? ONLINE + 'podcast/' : 'podcast/') : 'podcast_audio/';
  const SPEEDS = [1, 1.25, 1.5, 2];
  const IDLE_MS = 60000;
  const XP = 10;
  const NAME = { host: '小星', guest: '面試官' };
  const byId = {};
  DATA.episodes.forEach((e) => { byId[e.id] = e; });

  let audio = null, cur = null, queue = null, sleepAt = 0, sleepEnd = false;
  let lastInput = Date.now(), idle = false, lastSave = 0, secIdx = -1, subOpen = false, endedCard = null;
  let openIsl = null;                 // 節目表裡展開的島（九座島 88 集全展開太長；重畫節目表時保留使用者的開合）

  /* ---------- 存檔 ---------- */
  function ps() {
    const st = store.state;
    if (!st.podcast || typeof st.podcast !== 'object') st.podcast = {};
    const p = st.podcast;
    ['pos', 'done', 'paid'].forEach((k) => { if (!p[k] || typeof p[k] !== 'object') p[k] = {}; });
    if (!SPEEDS.includes(p.speed)) p.speed = 1;
    if (p.auto == null) p.auto = true;
    return p;
  }

  /* ---------- 小工具 ---------- */
  const mmss = (s) => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const mins = (s) => '約 ' + Math.max(1, Math.round(s / 60)) + ' 分鐘';
  const region = (e) => G.regions[e.region] || { name: '', color: '#888' };
  function forLesson(lid) { return byId[lid] || null; }
  function islandEps(rid) { return DATA.episodes.filter((e) => e.region === rid); }
  function nextOf(e) {
    const list = islandEps(e.region);
    const i = list.indexOf(e);
    return i >= 0 && i < list.length - 1 ? list[i + 1] : null;
  }
  function sectionAt(t) {
    if (!cur) return -1;
    let k = 0;
    cur.sections.forEach((s, i) => { if (s.start <= t + 0.05) k = i; });
    return k;
  }

  /* ---------- 播放 ---------- */
  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = 'metadata';
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', () => { paintBar(); setState(); });
    audio.addEventListener('pause', () => { savePos(true); paintBar(); setState(); });
    audio.addEventListener('error', () => { if (cur) G.ui.toast('這集的聲音檔載入失敗，請確認網路後再試一次'); paintBar(); });
    return audio;
  }
  function play(id, opts) {
    const e = byId[id];
    if (!e) return;
    opts = opts || {};
    const a = ensureAudio();
    endedCard = null;
    if (!opts.keepQueue) queue = null;
    if (!cur || cur.id !== id) {
      if (cur) savePos(true);
      cur = e;
      secIdx = -1;
      const p = ps();
      let start = opts.at != null ? opts.at : (p.pos[id] || 0);
      if (start > e.seconds - 8) start = 0;                     // 上次聽完了：從頭開始
      a.src = BASE + e.file;
      a.addEventListener('loadedmetadata', () => { if (start > 0) a.currentTime = start; }, { once: true });
      setSession();
    }
    a.playbackRate = ps().speed;
    a.defaultPlaybackRate = ps().speed;
    a.play().catch(() => { G.ui.toast('沒辦法自動播放，請再按一次播放'); paintBar(); });
    document.body.classList.add('pod-on');
    $('pod-bar').hidden = false;
    paintBar();
  }
  function toggle() {
    if (!audio || !cur) return;
    if (audio.paused) { endedCard = null; audio.play().catch(() => {}); } else audio.pause();
  }
  function seek(d) { if (audio && cur) audio.currentTime = Math.min(Math.max(0, audio.currentTime + d), cur.seconds - 0.5); }
  function jumpSection(dir) {
    if (!audio || !cur) return;
    const t = audio.currentTime, k = sectionAt(t);
    let to;
    if (dir < 0) to = t - cur.sections[k].start > 3 || k === 0 ? cur.sections[k].start : cur.sections[k - 1].start;
    else { if (k >= cur.sections.length - 1) return; to = cur.sections[k + 1].start; }
    audio.currentTime = to;
    if (audio.paused) audio.play().catch(() => {});
  }
  function setSpeed() {
    const p = ps();
    p.speed = SPEEDS[(SPEEDS.indexOf(p.speed) + 1) % SPEEDS.length];
    if (audio) { audio.playbackRate = p.speed; audio.defaultPlaybackRate = p.speed; }
    store.save();
    paintBar();
  }
  function stopAll() {
    if (audio) { savePos(true); audio.pause(); audio.removeAttribute('src'); audio.load(); }
    cur = null; queue = null; sleepAt = 0; sleepEnd = false; endedCard = null;
    setIdle(false);
    document.body.classList.remove('pod-on');
    $('pod-bar').hidden = true;
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
  }
  function savePos(force) {
    if (!audio || !cur) return;
    const now = Date.now();
    if (!force && now - lastSave < 5000) return;
    lastSave = now;
    ps().pos[cur.id] = audio.ended ? 0 : Math.floor(audio.currentTime);   // 播完了就記 0，不然接下一集時會把結尾秒數存回去
    store.save();
  }
  function onTime() {
    if (!cur) return;
    savePos(false);
    if (sleepAt && Date.now() >= sleepAt) { sleepAt = 0; audio.pause(); G.ui.toast('睡眠計時到了，已暫停'); }
    const k = sectionAt(audio.currentTime);
    if (k !== secIdx) { secIdx = k; paintBar(); if (idle) paintIdle(); }
    else paintTime();
  }
  function onEnded() {
    const e = cur;
    if (!e) return;
    const p = ps();
    p.pos[e.id] = 0;
    p.done[e.id] = Date.now();
    let msg = '聽完「' + e.title + '」';
    if (!p.paid[e.id]) {                                      // 每集第一次聽完才給，掛著重播不會一直加
      p.paid[e.id] = 1;
      store.state.xp += XP;
      store.log('聽完 Podcast「' + e.title + '」，+' + XP + ' XP');
      msg += '，+' + XP + ' XP';
      G.ui.checkLevel();
    }
    store.save();
    const nx = sleepEnd ? null : queue && queue.length ? byId[queue.shift()] : p.auto ? nextOf(e) : null;
    if (sleepEnd) { sleepEnd = false; msg += '。睡眠計時：這集播完就停'; }
    if (nx) { G.ui.toast(msg + '，接著播下一集'); play(nx.id, { keepQueue: true, at: 0 }); return; }
    G.ui.toast(msg);
    endedCard = e;
    paintBar();
  }

  /* ---------- 鎖定畫面、耳機按鍵 ---------- */
  function setSession() {
    if (!('mediaSession' in navigator) || !cur || !window.MediaMetadata) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: cur.title, artist: 'AI 學習群島', album: region(cur).name + ' · Podcast' });
    const set = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch (err) { /* 有些瀏覽器不支援某些按鍵 */ } };
    set('play', () => toggle());
    set('pause', () => toggle());
    set('seekbackward', () => seek(-15));
    set('seekforward', () => seek(15));
    set('previoustrack', () => jumpSection(-1));
    set('nexttrack', () => jumpSection(1));
  }
  function setState() { if ('mediaSession' in navigator && audio) navigator.mediaSession.playbackState = audio.paused ? 'paused' : 'playing'; }

  /* ---------- 掛機：暫停 3D 畫面 ---------- */
  function setIdle(on) {
    if (idle === on) return;
    idle = on;
    G.world.idle = on;
    const ov = $('pod-idle');
    if (!on) { ov.hidden = true; return; }
    const busy = !$('modal').hidden || (G.lesson && G.lesson.active) || !$('drawer').hidden;
    ov.hidden = busy;                                          // 有視窗開著時只暫停 3D，不蓋住視窗
    paintIdle();
  }
  function paintIdle() {
    const ov = $('pod-idle');
    if (ov.hidden || !cur) return;
    ov.innerHTML = '';
    const s = cur.sections[Math.max(0, secIdx)];
    ov.appendChild(el('div', { class: 'pi-card' }, [
      el('span', { class: 'pi-ico', text: '🎧' }),
      el('b', { text: '正在聽：' + cur.title }),
      s ? el('em', { text: s.title }) : null,
      el('p', { text: '畫面先暫停來省電，聲音會繼續播。點一下回到遊戲。' }),
    ]));
  }
  function wake(e) {
    lastInput = Date.now();
    if (!idle) return;
    if (e && e.target && e.target.closest && e.target.closest('#pod-idle')) return;   // 點在掛機畫面上：交給它自己的 click 處理，免得這一下穿過去點到 3D 世界
    setIdle(false);
  }

  /* ---------- 迷你播放器 ---------- */
  function paintTime() {
    if (!cur || !audio) return;
    const bar = $('pod-bar');
    const t = audio.currentTime || 0;
    const r = bar.querySelector('.pb-seek');
    if (r && !r.matches(':active')) r.value = String(Math.round((t / cur.seconds) * 1000));
    const tm = bar.querySelector('.pb-time');
    if (tm) tm.textContent = mmss(t) + ' / ' + mmss(cur.seconds);
  }
  function paintBar() {
    const bar = $('pod-bar');
    if (!cur) { bar.hidden = true; return; }
    const playing = audio && !audio.paused;
    const k = Math.max(0, secIdx);
    const s = cur.sections[k];
    const p = ps();
    bar.innerHTML = '';
    bar.style.setProperty('--c', region(cur).color);
    const seekEl = el('input', { class: 'pb-seek', type: 'range', min: 0, max: 1000, value: 0, 'aria-label': '播放進度' });
    seekEl.addEventListener('input', () => { if (audio && cur) audio.currentTime = (Number(seekEl.value) / 1000) * cur.seconds; });
    const btn = (txt, title, fn, cls) => el('button', { type: 'button', class: 'pb-b' + (cls ? ' ' + cls : ''), title, 'aria-label': title, text: txt, onclick: fn });
    bar.append(
      el('div', { class: 'pb-top' }, [
        el('span', { class: 'pb-ico', text: '🎧' }),
        el('span', { class: 'pb-tt' }, [el('b', { text: cur.title }), el('em', { text: (k + 1) + ' / ' + cur.sections.length + '　' + (s ? s.title : '') })]),
        btn('☰', '節目表', () => openShows()),
        btn('×', '關閉播放器', stopAll),
      ]),
      el('div', { class: 'pb-mid' }, [seekEl, el('span', { class: 'pb-time' })]),
      el('div', { class: 'pb-ctl' }, [
        btn('⏮', '上一段', () => jumpSection(-1)),
        btn('↺15', '倒退 15 秒', () => seek(-15), 'sm'),
        btn(playing ? '⏸' : '▶', playing ? '暫停' : '播放', toggle, 'main'),
        btn('15↻', '快轉 15 秒', () => seek(15), 'sm'),
        btn('⏭', '下一段', () => jumpSection(1)),
        btn(p.speed + '×', '播放速度', setSpeed, 'sm spd'),
        btn('字幕', subOpen ? '收起字幕' : '顯示字幕', () => { subOpen = !subOpen; paintBar(); }, 'sm' + (subOpen ? ' on' : '')),
        btn(sleepAt || sleepEnd ? '⏾ ' + sleepLabel() : '⏾', '睡眠計時', sleepMenu, 'sm' + (sleepAt || sleepEnd ? ' on' : '')),
      ]),
    );
    if (subOpen && s) {
      bar.appendChild(el('div', { class: 'pb-sub' }, s.lines.map(([who, text]) => el('p', { class: who }, [el('b', { text: NAME[who] + '：' }), document.createTextNode(text)]))));
    }
    if (endedCard && endedCard.lesson && G.lessonById[endedCard.lesson]) {
      const l = G.lessonById[endedCard.lesson];
      bar.appendChild(el('div', { class: 'pb-end' }, [
        el('span', { text: '聽完了！要不要實際答幾題？' }),
        el('button', { class: 'btn primary', type: 'button', text: '挑戰第 ' + l.no + ' 堂 →', onclick: () => { endedCard = null; paintBar(); G.ui.openPlace(l); } }),
      ]));
    }
    paintTime();
  }
  function sleepLabel() {
    if (sleepEnd) return '本集';
    return Math.max(1, Math.ceil((sleepAt - Date.now()) / 60000)) + ' 分';
  }
  function sleepMenu() {
    const set = (min, end) => {
      sleepAt = min ? Date.now() + min * 60000 : 0;
      sleepEnd = !!end;
      G.ui.closeModal();
      G.ui.toast(min ? min + ' 分鐘後暫停' : end ? '這集播完就停' : '已取消睡眠計時');
      paintBar();
    };
    G.ui.modal(el('div', { class: 'qz setup small' }, [
      el('h2', { text: '睡眠計時' }),
      el('p', { class: 'hint', text: '時間到就自動暫停，適合睡前聽。' }),
      el('div', { class: 'picks' }, [
        el('button', { class: 'pick', type: 'button', text: '15 分鐘', onclick: () => set(15) }),
        el('button', { class: 'pick', type: 'button', text: '30 分鐘', onclick: () => set(30) }),
        el('button', { class: 'pick', type: 'button', text: '60 分鐘', onclick: () => set(60) }),
        el('button', { class: 'pick', type: 'button', text: '這集播完', onclick: () => set(0, true) }),
        el('button', { class: 'pick', type: 'button', text: '關閉', onclick: () => set(0, false) }),
      ]),
    ]));
  }

  /* ---------- 節目表 ---------- */
  function openShows(keep) {
    const p = ps();
    const regs = Object.values(G.regions);
    if (!keep || !openIsl) {          // 剛打開節目表：只展開正在聽的島；沒在聽就展開聽到一半、或還沒聽完的第一座島
      const has = (r, f) => islandEps(r.id).some(f);
      const pick = (cur && cur.region) || (regs.find((r) => has(r, (e) => (p.pos[e.id] || 0) > 10 && !p.done[e.id]))
        || regs.find((r) => has(r, (e) => !p.done[e.id])) || regs[0] || {}).id;
      openIsl = new Set([pick]);
    }
    const due = DATA.episodes.filter((e) => e.lesson && G.lessonById[e.lesson] && store.lessonDue(G.lessonById[e.lesson]) > 0);
    const node = el('div', { class: 'pod' }, [
      el('div', { class: 'eyebrow', text: '🎧 Podcast' }),
      el('h2', { text: '節目表' }),
      el('p', { class: 'hint', text: '小星和面試官的雙人對談，一堂課一集，每集 6–9 分鐘，最後有兩題面試題（會停 5 秒讓你先講）。不用玩也能聽：選一集就開始播，放著會自動接下一集。聽的進度存在存檔裡，匯出存檔會一起帶走。' }),
      el('div', { class: 'pod-opts' }, [
        el('button', { class: 'btn' + (p.auto ? ' primary' : ''), type: 'button', text: p.auto ? '✓ 自動接下一集' : '自動接下一集：關', onclick: () => { p.auto = !p.auto; store.save(); openShows(true); } }),
        el('button', { class: 'btn', type: 'button', text: '🌿 今日複習電台（' + due.length + ' 集）', onclick: () => {
          if (!due.length) { G.ui.toast('今天沒有雜草，可以依課程順序聽'); return; }
          G.ui.closeModal();
          play(due[0].id, { at: 0 });
          queue = due.slice(1).map((e) => e.id);
          G.ui.toast('今日複習電台：' + due.length + ' 集有雜草的課');
        } }),
      ]),
    ]);
    regs.forEach((r) => {
      const eps = islandEps(r.id);
      const sec = el('details', { class: 'pod-isl' + (eps.length ? '' : ' soon'), open: openIsl.has(r.id) || null,
        ontoggle: (ev) => { if (ev.currentTarget.open) openIsl.add(r.id); else openIsl.delete(r.id); } });
      sec.style.setProperty('--c', r.color);
      const heard = eps.filter((e) => p.done[e.id]).length;
      sec.appendChild(el('summary', { class: 'pod-ih' }, [el('b', { text: r.name }), el('em', { text: eps.length ? eps.length + ' 集 · 聽過 ' + heard : '製作中' })]));
      eps.forEach((e) => {
        const pos = p.pos[e.id] || 0, done = p.done[e.id], on = cur && cur.id === e.id;
        const pct = done && !pos ? 100 : Math.round((pos / e.seconds) * 100);
        sec.appendChild(el('div', { class: 'pod-row' + (on ? ' on' : '') + (done ? ' done' : '') }, [
          el('button', { class: 'pod-play', type: 'button', 'aria-label': '播放 ' + e.title, text: on && audio && !audio.paused ? '⏸' : '▶', onclick: () => {
            if (on) toggle(); else { G.ui.closeModal(); play(e.id); }
            if (on) openShows(true);
          } }),
          el('span', { class: 'pod-t' }, [
            el('b', { text: e.title }),
            el('em', { text: mins(e.seconds) + (done ? ' · ✓ 聽過' : '') + (pos > 10 && !done ? ' · 聽到 ' + mmss(pos) : '') }),
            el('i', { class: 'pod-prog' }, [el('i', { style: 'width:' + pct + '%' })]),
          ]),
          el('a', { class: 'pod-dl', href: BASE + e.file, download: e.file, title: '下載 MP3', 'aria-label': '下載 ' + e.title, text: '⬇' }),
        ]));
      });
      node.appendChild(sec);
    });
    G.ui.modal(node, { wide: true });
  }

  /* ---------- 啟動 ---------- */
  function init() {
    const btn = $('btn-pod');
    if (!DATA.episodes.length) { if (btn) btn.hidden = true; return; }
    if (btn) btn.addEventListener('click', () => openShows());
    $('pod-idle').addEventListener('click', (e) => { e.stopPropagation(); setIdle(false); });
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => window.addEventListener(ev, wake, { capture: true, passive: true }));
    setInterval(() => {
      if (!idle && audio && cur && !audio.paused && !document.hidden && Date.now() - lastInput > IDLE_MS) setIdle(true);
      if (sleepAt && audio && !audio.paused) paintBar();       // 讓睡眠計時的剩餘分鐘更新
    }, 5000);
    window.addEventListener('pagehide', () => savePos(true));
  }

  G.podcast = { init, play, openShows, forLesson, stop: stopAll, get current() { return cur ? cur.id : null; }, get idle() { return idle; },
    debug() { return { cur: cur && cur.id, t: audio ? +audio.currentTime.toFixed(1) : null, paused: audio ? audio.paused : null, sec: secIdx, idle, queue, base: BASE }; } };   // debug 測試用
})();
