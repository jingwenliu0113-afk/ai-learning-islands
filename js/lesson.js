/* 上課：右側面板一步一步講，鏡頭飛到概念建築，小星在場景裡說話，每個概念後面有一題小測驗 */
(function () {
  'use strict';
  const G = window.G;
  const { el, rich, firstSentence } = G.util;
  const store = G.store;
  let C = null;   // 目前的課程 { lesson, steps, i }

  function pickMini(c) {
    const qs = c.questions.filter((q) => q.type !== 'interview');
    return qs.find((q) => q.type === 'tf') || qs.find((q) => q.type === 'single') || qs.find((q) => q.type === 'code') || qs[0] || null;
  }
  function buildSteps(l) {
    const steps = [{ kind: 'intro' }];
    l.concepts.forEach((c, i) => {
      steps.push({ kind: 'concept', c, i });
      const q = pickMini(c);
      if (q) steps.push({ kind: 'mini', c, i, q });
    });
    steps.push({ kind: 'outro' });
    return steps;
  }
  const minutes = (l) => Math.max(3, Math.round(l.concepts.length * 1.1 + 1));

  function open(l, fromStart) {
    if (!l.concepts.length) { G.ui.toast('這堂課的題庫還沒做好'); return; }
    G.ui.closeModal();
    G.world.stop();
    const steps = buildSteps(l);
    const saved = store.courseStep(l);
    C = { lesson: l, steps, i: fromStart ? 0 : Math.min(saved, steps.length - 1), answered: {} };
    document.body.classList.add('in-course');
    G.world.guideToLesson(l);
    render();
  }
  function close() {
    if (!C) return;
    C = null;
    const p = document.getElementById('course');
    p.hidden = true; p.innerHTML = '';
    document.body.classList.remove('in-course');
    G.world.releaseFocus();
    G.world.guideSay('');
    setTimeout(() => G.world.guideBack(), 1500);
    G.quiz.detachKeys();
    G.ui.refresh();
  }

  function render() {
    const { lesson: l, steps } = C;
    const st = steps[C.i];
    store.setCourseStep(l, C.i);
    const p = document.getElementById('course');
    p.hidden = false; p.innerHTML = '';
    p.style.setProperty('--c', l.region.color);
    p.appendChild(el('div', { class: 'co-head' }, [
      el('img', { class: 'co-guide', src: G.avatar.guideIcon(), alt: '' }),
      el('div', { class: 'co-ttl' }, [
        el('span', { text: '課程 · 小星 · 約 ' + minutes(l) + ' 分鐘' }),
        el('b', { text: '第 ' + l.no + ' 堂 ' + l.title }),
      ]),
      el('button', { class: 'x', type: 'button', title: '關閉課程（進度會保留）', text: '×', onclick: close }),
    ]));
    p.appendChild(el('div', { class: 'co-dots' }, steps.map((s, k) => el('i', { class: (k < C.i ? 'done' : '') + (k === C.i ? ' on' : '') + (s.kind === 'mini' ? ' q' : '') }))));
    const body = el('div', { class: 'co-body' });
    p.appendChild(body);
    const foot = el('div', { class: 'co-foot' });
    p.appendChild(foot);
    const prev = el('button', { class: 'btn', type: 'button', text: '← 上一步', disabled: C.i === 0, onclick: () => { C.i--; render(); } });
    const last = C.i === steps.length - 1;
    const next = el('button', { class: 'btn primary', type: 'button', text: last ? (store.courseDone(l) ? '完成（已拿過獎勵）' : '完成課程 · +40 XP') : '下一步 →', onclick: () => {
      if (last) { finish(); return; }
      C.i++; render();
    } });
    foot.appendChild(prev); foot.appendChild(next);

    if (st.kind === 'intro') {
      G.world.focusSpot(l);
      G.world.guideSay('歡迎來到第 ' + l.no + ' 堂！這裡有 ' + l.concepts.length + ' 棟建築，每一棟是一個概念。', 0);
      body.appendChild(el('h3', { text: l.title + (l.sub ? '：' + l.sub : '') }));
      body.appendChild(el('p', { class: 'co-lead', html: rich(l.summary) }));
      body.appendChild(el('h4', { text: '這堂課會走過的概念' }));
      body.appendChild(el('ol', { class: 'co-list' }, l.concepts.map((c) => el('li', { html: rich(c.name) }))));
      body.appendChild(el('p', { class: 'hint', text: '看島上的演示：每講一個概念，鏡頭會飛到那棟建築。講完後有一題小測驗，答錯不扣分，也不會影響複習排程。' }));
      if (l.materials.length) body.appendChild(el('div', { class: 'mats' }, l.materials.slice(0, 3).map((m) => G.util.matLink(m, [el('b', { text: '📄 ' + m.label })]))));
    } else if (st.kind === 'concept') {
      const c = st.c;
      G.world.focusConcept(l, st.i);
      G.world.guideSay(c.name.replace(/\(.*?\)/g, '') + '：' + firstSentence(c.card.what), 0);
      body.appendChild(el('div', { class: 'co-kicker', text: '概念 ' + (st.i + 1) + ' / ' + l.concepts.length }));
      body.appendChild(el('h3', { html: rich(c.name) }));
      body.appendChild(G.quiz.cardNode(c));
    } else if (st.kind === 'mini') {
      G.world.focusConcept(l, st.i);
      G.world.guideSay('來試試看！答錯也沒關係。', 0);
      body.appendChild(el('div', { class: 'co-kicker', text: '小測驗 · ' + st.c.name.replace(/\(.*?\)/g, '') }));
      const host = el('div', { class: 'co-quiz' });
      body.appendChild(host);
      if (C.answered[C.i] != null) {
        host.appendChild(el('p', { class: 'hint', text: '這題剛剛做過了（' + (C.answered[C.i] ? '答對' : '答錯') + '），可以直接下一步。' }));
        host.appendChild(el('button', { class: 'linkbtn', type: 'button', text: '再做一次', onclick: () => { delete C.answered[C.i]; render(); } }));
      } else {
        const idx = C.i;
        G.quiz.mini(st.q, host, (ok) => {
          C.answered[idx] = ok;
          G.world.guideSay(ok ? '答對了！你真的懂了。' : '差一點！看一下解析，之後關卡還會再遇到。', 0);
          next.focus({ preventScroll: true });
        });
      }
    } else {
      G.world.focusSpot(l);
      G.world.guideSay('這堂課上完了！接下來去挑戰關卡吧。', 0);
      body.appendChild(el('h3', { text: '重點整理' }));
      body.appendChild(el('ul', { class: 'take' }, l.takeaways.map((t) => el('li', { html: rich(t) }))));
      body.appendChild(el('div', { class: 'cues' }, [
        el('h4', { text: '看到這些線索，就想到這招' }),
        el('ul', {}, l.concepts.map((c) => el('li', {}, [el('b', { html: rich(c.name) }), el('span', { html: rich(firstSentence(c.card.when)) })]))),
      ]));
      const rounds = store.rounds(l);
      body.appendChild(el('p', { class: 'hint', text: '下一站：這裡有 ' + rounds.length + ' 個關卡（最後一關是 Boss：面試官）。' }));
    }
    body.scrollTop = 0;
  }

  function finish() {
    const l = C.lesson;
    const res = store.completeCourse(l);
    close();
    if (res) {
      G.sound && G.sound.play('fanfare');
      G.world.celebrate(l.region.color);
      G.ui.toast('上完第 ' + l.no + ' 堂！+40 XP、+15 金幣');
      G.ui.checkLevel();
    }
    G.ui.openPlace(l);
  }

  G.lesson = { open, close, get active() { return !!C; }, minutes };
})();
