/* AI 面試官 Boss：由 Gemini 扮演面試官。
   流程：題庫的面試題當第一題 → 你用打字回答 → 面試官依你的回答追問 2 次 → 最後打分（0–100）並指出漏洞。
   一場用 3 次 Gemini（2 次追問 + 1 次評分）。60 分以上算過關，85 分以上 3 顆星。 */
(function () {
  'use strict';
  const G = window.G;
  const store = G.store;
  const { el, rich } = G.util;
  const snd = (n) => G.sound && G.sound.play(n);
  const strip = (s) => String(s || '').replace(/<[^>]+>/g, '');
  const TURNS = 3;   // 你要回答幾次（第一題 + 追問 2 次）

  /** Boss 關卡：選 AI 面試官或自評模式 */
  function choose(round) {
    const ready = G.ai && G.ai.ready();
    const left = G.ai && G.ai.quotaLeft;
    G.ui.modal(el('div', { class: 'qz setup' }, [
      el('div', { class: 'eyebrow', text: '第 ' + round.lesson.no + ' 堂 · Boss' }),
      el('h2', { text: '👔 面試官出現了' }),
      el('div', { class: 'modes' }, [
        el('button', { class: 'mode', type: 'button', onclick: () => (ready ? start(round) : (G.ui.closeModal(), G.ai.open({ setup: true }))) }, [
          el('b', { text: '🤖 AI 面試官' }),
          el('span', { text: ready ? 'Gemini 扮演面試官：問一題、看你怎麼答、追問兩次，最後打分。要打字回答，一場用 3 次 AI' + (left != null ? '（今天還剩 ' + left + ' 次）' : '') + '。' : '要先連接 Gemini（輸入通行碼或自己的金鑰），點這裡設定。' }),
        ]),
        el('button', { class: 'mode', type: 'button', onclick: () => G.ui.startSelfBoss(round) }, [
          el('b', { text: '📝 自評模式' }),
          el('span', { text: '原本的玩法：用自己的話講一遍，看參考答案，誠實勾選講到的要點。' }),
        ]),
      ]),
    ]), { wide: true });
  }

  function pickMain(round) {
    const qs = round.questions.slice();
    const fresh = qs.filter((q) => { const s = store.qs(q.id); return !s || s.r === 0 || store.isDue(q.id); });
    const src = fresh.length ? fresh : qs;
    return src[Math.floor(Math.random() * src.length)];
  }

  function systemFor(round, q) {
    const l = round.lesson;
    return [
      '你是一位嚴格但友善的 AI 工程師面試官，正在面試一位求職者。這一段的主題是「第 ' + l.no + ' 堂：' + l.title + '」。',
      '規則：',
      '1. 一律用繁體中文（台灣用語）；專有名詞寫成「英文(繁體中文)」，例如 overfitting(過擬合)。',
      '2. 每次只問一個問題，2–3 句以內，不要用 Markdown 標題或條列。',
      '3. 追問要針對求職者上一個回答的漏洞、模糊或沒講到的地方，例如：為什麼、什麼時候不適用、怎麼驗證、實務上會遇到什麼問題、和另一個方法怎麼比較。',
      '4. 面試中不要給答案、不要評分、不要說「很好」以外的長篇稱讚。',
      '5. 如果求職者答非所問或只寫幾個字，禮貌地請他具體說明。',
      '',
      '【面試官手上的資料，求職者看不到】',
      '第一題：' + strip(q.q),
      '參考要點：\n' + (q.points || []).map((p, i) => (i + 1) + '. ' + strip(p)).join('\n'),
      q.answer ? '參考答案：' + strip(q.answer) : '',
      '這堂課的概念：' + l.concepts.map((c) => c.name).join('、'),
    ].join('\n');
  }

  function start(round) {
    const q = pickMain(round);
    const system = systemFor(round, q);
    // Gemini 的對話要從 user 開始、user 和 model 交替：先放一句「面試開始」，再放面試官的第一題
    const conv = [{ role: 'user', text: '（面試開始，請問第一題。）' }, { role: 'model', text: strip(q.q) }];
    let answered = 0, ctrl = null, finished = false;

    const log = el('div', { class: 'iv-chat' });
    const dots = el('div', { class: 'iv-dots' });
    const input = el('textarea', { rows: 4, placeholder: '像真的面試一樣回答：先講結論，再講為什麼、什麼時候用、有什麼缺點。（Ctrl+Enter 送出）' });
    const sendBtn = el('button', { class: 'btn primary', type: 'button', text: '送出回答' });
    const giveUp = el('button', { class: 'btn', type: 'button', text: '結束面試' });
    const box = el('div', { class: 'qz boss ai-iv' }, [
      el('div', { class: 'qz-head' }, [el('div', { class: 'qz-title' }, [el('b', { text: '👔 AI 面試官：第 ' + round.lesson.no + ' 堂 ' + round.lesson.title }), dots])]),
      log,
      el('div', { class: 'iv-input' }, [input, el('div', { class: 'qz-foot' }, [giveUp, sendBtn])]),
    ]);
    const paintDots = () => { dots.textContent = '回答 ' + Math.min(answered + 1, TURNS) + ' / ' + TURNS; };
    const say = (who, html) => { const b = el('div', { class: 'iv-msg ' + who }); b.innerHTML = html; log.appendChild(b); log.scrollTop = log.scrollHeight; return b; };
    const md = G.ai._md;

    say('them', '<b>面試官</b><p>' + rich(q.q) + '</p>');
    paintDots();

    async function send() {
      const text = input.value.trim();
      if (text.length < 8) { G.ui.toast('多講一點吧，至少一兩句'); input.focus(); return; }
      input.value = ''; input.disabled = true; sendBtn.disabled = true;
      say('me', '<p>' + G.util.esc(text).replace(/\n/g, '<br>') + '</p>');
      conv.push({ role: 'user', text });
      answered++;
      paintDots();
      ctrl = new AbortController();
      if (answered < TURNS) {
        const wait = say('them', '<b>面試官</b><p class="ai-wait">思考中…</p>');
        try {
          const reply = await G.ai.ask({ system, messages: conv, signal: ctrl.signal, maxTokens: 600 });
          conv.push({ role: 'model', text: reply });
          wait.innerHTML = '<b>面試官</b>' + md(reply);
          input.disabled = false; sendBtn.disabled = false; if (!G.util.touch()) input.focus();
        } catch (e) {
          if (e.name === 'AbortError') return;
          conv.pop(); answered--; paintDots();
          wait.className = 'iv-msg err'; wait.textContent = e.message;
          input.value = text; input.disabled = false; sendBtn.disabled = false;
        }
      } else evaluate();
    }

    async function evaluate() {
      finished = true;
      giveUp.remove(); sendBtn.remove(); input.remove();
      const wait = say('them', '<b>面試官</b><p class="ai-wait">面試結束，正在評分…</p>');
      const prompt = [
        '面試結束。請你以面試官的身分，根據求職者在這場面試的全部回答評分。',
        '第一行只輸出一個 JSON（不要放在程式碼區塊裡），格式：{"score": 0 到 100 的整數, "covered": [講到的參考要點編號], "missed": [漏掉的參考要點編號]}',
        '評分標準：90 以上可以直接錄取；75 左右觀念正確但不夠深入；60 是勉強及格；60 以下有明顯錯誤或講太少。',
        '接著換行，用繁體中文、條列寫：',
        '**做得好的地方**（1–2 點）',
        '**需要補強的地方**（2–3 點，具體指出哪裡講錯或沒講到）',
        '**示範回答**（3–5 句，針對第一題）',
      ].join('\n');
      try {
        const reply = await G.ai.ask({ system, messages: conv.concat([{ role: 'user', text: prompt }]), signal: ctrl.signal, maxTokens: 1500 });
        showResult(wait, reply);
      } catch (e) {
        if (e.name === 'AbortError') return;
        wait.className = 'iv-msg err';
        wait.textContent = '評分失敗：' + e.message;
        const retry = el('button', { class: 'btn primary', type: 'button', text: '再評一次', onclick: () => { wait.remove(); retry.remove(); evaluate(); } });
        box.appendChild(el('div', { class: 'qz-foot' }, [retry]));
      }
    }

    function showResult(wait, reply) {
      let score = null, rest = reply;
      const m = reply.match(/\{[^{}]*"score"\s*:\s*(\d+)[^{}]*\}/);
      if (m) { score = Math.max(0, Math.min(100, parseInt(m[1], 10))); rest = reply.replace(m[0], '').trim(); }
      else { const m2 = reply.match(/(\d{1,3})\s*分/); if (m2) score = Math.min(100, parseInt(m2[1], 10)); }
      if (score == null) score = 0;
      rest = rest.replace(/^```(?:json)?\s*```/m, '').trim();
      const pass = score >= 60;
      const stars = score >= 85 ? 3 : score >= 70 ? 2 : pass ? 1 : 0;
      const prev = G.world.levels(q.lesson);
      const res = store.answer(q, pass, {});   // 記進複習排程：這題算答對或答錯
      G.world.refresh(q.lesson, prev);
      let fr = null;
      if (pass) fr = store.finishRound(round, stars === 3 ? 10 : stars === 2 ? 7 : 5, 10);
      store.log('第 ' + round.lesson.no + ' 堂 AI 面試官：' + score + ' 分' + (pass ? '，過關' : ''));
      snd(pass ? 'fanfare' : 'wrong');
      wait.innerHTML = '<b>面試官</b>' + md(rest || '（沒有評語）');
      const meter = el('div', { class: 'iv-score ' + (pass ? 'ok' : 'no') }, [
        el('div', { class: 'iv-num', text: score }),
        el('div', {}, [
          el('b', { text: pass ? '通過面試！' + '★'.repeat(stars) + '☆'.repeat(3 - stars) : '這次沒通過（60 分過關）' }),
          el('div', { class: 'bar' }, [el('i', { style: 'width:' + score + '%' })]),
          el('div', { class: 'rewards' }, [
            res.xp ? el('span', { class: 'rw xp', text: '+' + res.xp + ' XP' }) : null,
            res.coins ? el('span', { class: 'rw coin', text: '+' + res.coins + ' 金幣' }) : null,
            fr && fr.coins ? el('span', { class: 'rw coin', text: '首次過關 +' + fr.coins + ' 金幣' }) : null,
          ]),
        ]),
      ]);
      log.prepend(meter);   // 分數放在最上面，一打開就看得到
      log.appendChild(el('div', { class: 'iv-answer' }, [el('h4', { text: '題庫的參考答案' }), el('p', { html: rich(q.answer || '') })]));
      box.appendChild(el('div', { class: 'qz-foot' }, [
        el('button', { class: 'btn', type: 'button', text: '回到地點', onclick: () => G.ui.openPlace(round.lesson) }),
        el('button', { class: 'btn primary', type: 'button', text: '再面試一次', onclick: () => start(round) }),
      ]));
      log.scrollTop = 0;
      G.ui.refreshHud();
      if (G.ui.checkLevel) G.ui.checkLevel();
    }

    sendBtn.addEventListener('click', send);
    giveUp.addEventListener('click', () => { if (answered === 0) { G.ui.closeModal(); return; } evaluate(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (!sendBtn.disabled) send(); } });
    G.ui.modal(box, { wide: true, onLeave: () => { if (ctrl) ctrl.abort(); } });
    if (!G.util.touch()) setTimeout(() => input.focus(), 50);   // 手機不要一打開就跳鍵盤（會把題目擠出畫面）
    void finished;
  }

  G.interviewer = { choose, start };
})();
