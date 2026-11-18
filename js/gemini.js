/* AI 助教：用 Google 的 Gemini API（預設模型 Gemini 4 Hydrogen）。
   - 每個玩家用自己的 API 金鑰。金鑰只存在這台電腦的這個瀏覽器，從瀏覽器直接送到 Google，
     不會放進遊戲檔案、不會上傳到 GitHub，也不會跟著「匯出存檔」一起匯出。
   - 三個用法：右上角「🤖 AI 助教」聊天、答題後「請 AI 解釋這題」、面試題「請 AI 幫我評分」。 */
(function () {
  'use strict';
  const G = window.G;
  const { el } = G.util;
  const store = G.store;
  const CFG_KEY = 'ai-islands-gemini-v1';           // 金鑰設定的儲存位置（和遊戲存檔分開）
  const API = 'https://generativelanguage.googleapis.com/v1beta/models/';
  const DEFAULT_MODEL = 'gemini-4-hydrogen';
  const MODELS = ['gemini-4-hydrogen', 'gemini-3.8-flash', 'gemini-3.5-flash-lite'];

  /* ---------- 金鑰設定 ---------- */
  function safeGet(s, k) { try { return s.getItem(k); } catch (e) { return null; } }
  function loadCfg() {
    const raw = safeGet(localStorage, CFG_KEY) || safeGet(sessionStorage, CFG_KEY);
    try { return Object.assign({ key: '', model: DEFAULT_MODEL, remember: true }, raw ? JSON.parse(raw) : {}); } catch (e) { return { key: '', model: DEFAULT_MODEL, remember: true }; }
  }
  let cfg = loadCfg();
  function saveCfg() {
    try {
      const s = JSON.stringify(cfg);
      // 勾「記住」才存在 localStorage（關掉瀏覽器還在）；沒勾就只放 sessionStorage（關掉分頁就消失）
      if (cfg.remember) { localStorage.setItem(CFG_KEY, s); sessionStorage.removeItem(CFG_KEY); }
      else { sessionStorage.setItem(CFG_KEY, s); localStorage.removeItem(CFG_KEY); }
    } catch (e) { /* 瀏覽器不讓存：這次開著的時候還是能用 */ }
  }
  function clearCfg() {
    cfg = { key: '', model: cfg.model || DEFAULT_MODEL, remember: true };
    try { localStorage.removeItem(CFG_KEY); sessionStorage.removeItem(CFG_KEY); } catch (e) { /* 忽略 */ }
  }

  /* ---------- 呼叫 Gemini（串流） ---------- */
  const SYSTEM = [
    '你是「AI 學習群島」這個練習遊戲裡的 AI 助教，幫一位準備 AI 工程師求職面試的學生複習。',
    '規則：',
    '1. 一律用繁體中文（台灣用語）回答。',
    '2. 專有名詞或任何英文字詞寫成「英文(繁體中文)」，例如 overfitting(過擬合)、label(標籤)。',
    '3. 不做數學推導。重點講「這是什麼、為什麼要這樣做、什麼時候用、有什麼缺點」；公式只在能幫助理解直覺時出現，並用白話說它在算什麼。',
    '4. 回答裡如果有程式碼，每一行都要說明它在做什麼。',
    '5. 簡潔：先講結論再補充，多用條列，一般在 300 字以內；學生要求時再展開。',
    '6. 以下面提供的課程重點為準。超出範圍、或你不確定的地方，要直接說不確定，不要編造。',
    '7. 適合的時候，最後補一句「面試時可以這樣講」。',
  ].join('\n');

  function lessonContext(l) {
    if (!l) return '';
    const lines = ['', '【目前的課】第 ' + l.no + ' 堂：' + l.title + (l.sub ? '（' + l.sub + '）' : ''), '所屬領域：' + l.region.name];
    if (l.summary) lines.push('課程摘要：' + l.summary);
    l.concepts.forEach((c, i) => {
      const k = c.card || {};
      lines.push('概念 ' + (i + 1) + '：' + c.name);
      ['what', 'why', 'when', 'cons'].forEach((f) => { if (k[f]) lines.push('  ' + { what: '是什麼', why: '為什麼', when: '什麼時候用', cons: '缺點' }[f] + '：' + k[f]); });
    });
    if (l.takeaways && l.takeaways.length) lines.push('重點整理：' + l.takeaways.join('；'));
    return lines.join('\n').slice(0, 9000);
  }

  function friendlyError(status, msg) {
    const m = String(msg || '');
    if (status === 400 && /api key/i.test(m)) return '金鑰無效。請確認有完整貼上（通常是 AIza 開頭的 39 個字元）。';
    if (status === 400) return '請求格式有問題：' + m;
    if (status === 401 || status === 403) return '這把金鑰沒有權限。請確認這個 Google Cloud 專案已啟用「Generative Language API」，或金鑰的網址限制有沒有包含這個網站。（' + m + '）';
    if (status === 404) return '找不到模型「' + cfg.model + '」。請按 ⚙ 換一個模型名稱。（' + m + '）';
    if (status === 429) return '超過免費額度或請求太頻繁，等一下再試。（' + m + '）';
    if (status >= 500) return 'Google 那邊暫時出問題，稍後再試。（' + status + '）';
    return '發生錯誤（' + status + '）：' + m;
  }

  /** 串流呼叫：每收到一段文字就呼叫 onText(目前為止的全文)；回傳完整文字 */
  async function ask({ system, messages, onText, signal, maxTokens }) {
    if (!cfg.key) throw new Error('還沒設定 Gemini API 金鑰。');
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: m.text }] })),
      generationConfig: { maxOutputTokens: maxTokens || 2048 },
    };
    let res;
    try {
      res = await fetch(API + encodeURIComponent(cfg.model) + ':streamGenerateContent?alt=sse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.key },   // 金鑰放在標頭，不放在網址裡
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw new Error('連不到 Google。請確認網路正常（公司或學校網路有時會擋）。');
    }
    if (!res.ok) {
      let msg = '';
      try { const j = await res.json(); msg = (j.error && j.error.message) || ''; } catch (e) { /* 不是 JSON */ }
      throw new Error(friendlyError(res.status, msg));
    }
    // 回應是 Server-Sent Events：一行一行的「data: {JSON}」，每個 JSON 帶一小段文字
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '', text = '', finish = '', blocked = '';
    const handle = (line) => {
      if (!line.startsWith('data:')) return;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') return;
      let j;
      try { j = JSON.parse(data); } catch (e) { return; }
      if (j.promptFeedback && j.promptFeedback.blockReason) blocked = j.promptFeedback.blockReason;
      const cand = j.candidates && j.candidates[0];
      if (!cand) return;
      const parts = (cand.content && cand.content.parts) || [];
      parts.forEach((p) => { if (p.text && !p.thought) text += p.text; });   // 跳過模型的「思考」片段，只留回答
      if (cand.finishReason) finish = cand.finishReason;
      if (onText) onText(text);
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, i).replace(/\r$/, '')); buf = buf.slice(i + 1); }
    }
    if (buf) handle(buf);
    if (blocked) throw new Error('這個問題被 Google 的安全機制擋下來了（' + blocked + '），換個說法試試。');
    if (!text && finish === 'SAFETY') throw new Error('回答被 Google 的安全機制擋下來了，換個說法試試。');
    if (!text) throw new Error('Gemini 沒有回答（' + (finish || '空白回應') + '），再試一次。');
    if (finish === 'MAX_TOKENS') { text += '\n\n（回答太長被截斷了，可以說「繼續」。）'; if (onText) onText(text); }
    return text;
  }

  /* ---------- 簡單又安全的 Markdown 顯示（先跳脫 HTML，再轉粗體、程式碼、條列） ---------- */
  function md(src) {
    const esc = G.util.esc;
    const blocks = String(src).split(/```/);
    return blocks.map((b, i) => {
      if (i % 2) return '<pre class="code"><code>' + esc(b.replace(/^[\w+-]*\n/, '')) + '</code></pre>';
      const out = [];
      let list = null;
      b.split('\n').forEach((raw) => {
        let line = esc(raw)
          .replace(/`([^`]+)`/g, '<code>$1</code>')
          .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
        const li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
        const hd = line.match(/^#{1,4}\s+(.*)$/);
        if (li) {
          const ordered = /^\s*\d/.test(line);
          if (!list || list.ordered !== ordered) { if (list) out.push(list.ordered ? '</ol>' : '</ul>'); list = { ordered }; out.push(ordered ? '<ol>' : '<ul>'); }
          out.push('<li>' + li[1] + '</li>');
          return;
        }
        if (list) { out.push(list.ordered ? '</ol>' : '</ul>'); list = null; }
        if (hd) out.push('<h5>' + hd[1] + '</h5>');
        else if (line.trim()) out.push('<p>' + line + '</p>');
      });
      if (list) out.push(list.ordered ? '</ol>' : '</ul>');
      return out.join('');
    }).join('');
  }

  /* ---------- 聊天面板 ---------- */
  let panel, logEl, inputEl, sendBtn, ctxEl, chipsEl, setupEl;
  let history = [];            // [{ role: 'user' | 'model', text }]
  let lesson = null;           // 目前的課（決定助教拿哪一堂的重點當背景）
  let busy = null;             // 進行中的請求（AbortController）

  function build() {
    if (panel) return;
    panel = el('aside', { id: 'ai-panel', hidden: true, 'aria-label': 'AI 助教' }, [
      el('div', { class: 'ai-head' }, [
        el('b', { text: '🤖 AI 助教' }),
        (ctxEl = el('span', { class: 'ai-ctx' })),
        el('button', { class: 'ai-icon', type: 'button', title: '金鑰與模型設定', text: '⚙', onclick: () => showSetup(setupEl.hidden) }),
        el('button', { class: 'ai-icon', type: 'button', title: '清空對話', text: '🧹', onclick: () => { stop(); history = []; renderLog(); } }),
        el('button', { class: 'ai-icon', type: 'button', title: '關閉', text: '×', onclick: close }),
      ]),
      (setupEl = el('div', { class: 'ai-setup', hidden: true })),
      (logEl = el('div', { class: 'ai-log' })),
      (chipsEl = el('div', { class: 'ai-chips' })),
      el('div', { class: 'ai-input' }, [
        (inputEl = el('textarea', { rows: 2, placeholder: '問任何跟課程有關的問題（Enter 送出，Shift+Enter 換行）' })),
        (sendBtn = el('button', { class: 'btn primary', type: 'button', text: '送出', onclick: () => (busy ? stop() : send(inputEl.value)) })),
      ]),
    ]);
    // 面板裡打字時，不要觸發遊戲的快捷鍵（題目的數字鍵、Enter 下一題）
    panel.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') close();
    });
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!busy) send(inputEl.value); }
    });
    document.getElementById('app').appendChild(panel);
  }

  function renderSetup() {
    setupEl.innerHTML = '';
    const key = el('input', { type: 'password', placeholder: '貼上你的 Gemini API 金鑰（AIza…）', autocomplete: 'off', spellcheck: 'false' });
    key.value = cfg.key;
    const model = el('input', { type: 'text', list: 'ai-models', autocomplete: 'off', spellcheck: 'false' });
    model.value = cfg.model;
    const remember = el('input', { type: 'checkbox' });
    remember.checked = cfg.remember;
    const status = el('p', { class: 'ai-status' });
    const apply = () => { cfg.key = key.value.trim(); cfg.model = model.value.trim() || DEFAULT_MODEL; cfg.remember = remember.checked; saveCfg(); };
    setupEl.append(
      el('h4', { text: '連接 Gemini' }),
      el('p', { class: 'ai-note', html: '用你自己的 Google API 金鑰：到 <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a> 按「Create API key」；或在 Google Cloud Console 的專案裡啟用「Generative Language API」再建立 API 金鑰。' }),
      el('label', { class: 'ai-field' }, [el('span', { text: 'API 金鑰' }), key]),
      el('label', { class: 'ai-field' }, [el('span', { text: '模型' }), model, el('datalist', { id: 'ai-models' }, MODELS.map((m) => el('option', { value: m })))]),
      el('label', { class: 'ai-check' }, [remember, el('span', { text: '記住金鑰（不勾的話，關掉分頁就要重貼）' })]),
      el('p', { class: 'ai-note', text: '金鑰只存在這台電腦的這個瀏覽器，直接送到 Google，不會放進遊戲檔案或 GitHub，也不會跟著匯出存檔。用公用電腦時不要勾「記住」。' }),
      el('div', { class: 'ai-row' }, [
        el('button', { class: 'btn primary', type: 'button', text: '儲存並測試', onclick: async () => {
          apply();
          if (!cfg.key) { status.textContent = '請先貼上金鑰。'; return; }
          status.textContent = '測試中…';
          try {
            const t = await ask({ system: '你是連線測試。', messages: [{ role: 'user', text: '請只回覆「連線成功」四個字。' }], maxTokens: 256 });
            status.textContent = '✅ 可以用了（' + cfg.model + '）：' + t.trim().slice(0, 30);
            setTimeout(() => { if (cfg.key) showSetup(false); }, 900);
          } catch (e) { status.textContent = '❌ ' + e.message; }
        } }),
        el('button', { class: 'btn', type: 'button', text: '清除金鑰', onclick: () => { clearCfg(); renderSetup(); status.textContent = '已清除。'; } }),
      ]),
      status,
    );
  }
  function showSetup(on) {
    if (on) renderSetup(); else renderLog();
    setupEl.hidden = !on;
    logEl.hidden = !!on; chipsEl.hidden = !!on;
  }

  function setCtx() {
    ctxEl.textContent = lesson ? '第 ' + lesson.no + ' 堂 ' + lesson.title : '不限主題';
    ctxEl.title = lesson ? '助教會參考這堂課的重點來回答' : '';
    chipsEl.innerHTML = '';
    const chips = lesson
      ? [['用白話講這堂課', '用白話幫我把這堂課的重點講一遍，每個概念一兩句。'], ['常考的面試題', '這堂課最常被問的 3 題面試題是什麼？先只列題目，讓我自己想。'], ['出一題考我', '針對這堂課出一題簡答題考我，先不要給答案，等我回答再評分。'], ['不限主題', null]]
      : [['幫我排複習順序', '我想準備 AI 工程師面試，請根據我目前的進度建議接下來先複習什麼。'], ['出一題考我', '從機器學習到 LLM 隨機出一題常見面試題考我，先不要給答案。']];
    chips.forEach(([label, prompt]) => chipsEl.appendChild(el('button', { type: 'button', text: label, onclick: () => {
      if (prompt) send(prompt);
      else { lesson = null; setCtx(); }
    } })));
  }

  function bubble(role, html) {
    const b = el('div', { class: 'ai-msg ' + role });
    b.innerHTML = html;
    logEl.appendChild(b);
    logEl.scrollTop = logEl.scrollHeight;
    return b;
  }
  function renderLog() {
    logEl.innerHTML = '';
    if (!history.length) bubble('sys', cfg.key
      ? '<p>有什麼不懂的都可以問我。我會用這堂課的重點、照課程規則（繁體中文、英文(中文)、不做數學推導）回答。</p><p class="ai-small">回答由 Gemini 產生，可能有錯；跟講義不一樣時以講義為準。</p>'
      : '<p>要先連接 Gemini 才能用 AI 助教。按上面的 ⚙ 貼上你的 API 金鑰。</p>');
    history.forEach((m) => bubble(m.role === 'user' ? 'me' : 'ai', m.role === 'user' ? '<p>' + G.util.esc(m.text).replace(/\n/g, '<br>') + '</p>' : md(m.text)));
  }

  function stop() { if (busy) { busy.abort(); busy = null; } sendBtn.textContent = '送出'; }

  async function send(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    if (!cfg.key) { showSetup(true); return; }
    inputEl.value = '';
    history.push({ role: 'user', text });
    bubble('me', '<p>' + G.util.esc(text).replace(/\n/g, '<br>') + '</p>');
    const out = bubble('ai', '<p class="ai-wait">思考中…</p>');
    busy = new AbortController();
    sendBtn.textContent = '停止';
    try {
      const reply = await ask({
        system: SYSTEM + lessonContext(lesson),
        messages: history.slice(-12),          // 只帶最近 12 句，避免越聊越貴
        signal: busy.signal,
        onText: (t) => { out.innerHTML = md(t); logEl.scrollTop = logEl.scrollHeight; },
      });
      history.push({ role: 'model', text: reply });
    } catch (e) {
      history.pop();
      if (e.name === 'AbortError') out.innerHTML = '<p class="ai-small">（已停止）</p>';
      else { out.className = 'ai-msg err'; out.textContent = e.message; }
    } finally {
      busy = null;
      sendBtn.textContent = '送出';
    }
  }

  function open(opts) {
    build();
    opts = opts || {};
    if (opts.lesson !== undefined) lesson = opts.lesson;
    panel.hidden = false;
    document.body.classList.add('ai-open');
    setCtx();
    if (!cfg.key || opts.setup) { showSetup(true); return; }
    showSetup(false);
    if (opts.prompt) send(opts.prompt);
    else setTimeout(() => inputEl.focus(), 50);
  }
  function close() {
    if (!panel) return;
    stop();
    panel.hidden = true;
    document.body.classList.remove('ai-open');
  }

  /* ---------- 題目相關 ---------- */
  const strip = (s) => String(s || '').replace(/<[^>]+>/g, '');
  function questionText(q) {
    const lines = ['題目（' + ({ single: '單選', multi: '複選', tf: '是非', match: '配對', order: '排序', code: '讀程式', interview: '面試口述' }[q.type] || q.type) + '）：' + strip(q.q)];
    if (q.code) lines.push('程式碼：\n' + q.code);
    if (q.options) lines.push('選項：\n' + q.options.map((o, i) => '(' + 'ABCDEFGH'[i] + ') ' + strip(o)).join('\n'));
    if (q.type === 'single' || q.type === 'code') lines.push('正確答案：(' + 'ABCDEFGH'[q.answer] + ') ' + strip(q.options[q.answer]));
    if (q.type === 'multi' && Array.isArray(q.answer)) lines.push('正確答案：' + q.answer.map((i) => '(' + 'ABCDEFGH'[i] + ')').join(''));
    if (q.type === 'tf') lines.push('正確答案：' + (q.answer ? '對' : '錯'));
    if (q.pairs) lines.push('正確配對：\n' + q.pairs.map((p) => strip(p[0]) + ' → ' + strip(p[1])).join('\n'));
    if (q.items) lines.push('正確順序：\n' + q.items.map((t, i) => (i + 1) + '. ' + strip(t)).join('\n'));
    if (q.points) lines.push('參考要點：\n' + q.points.map((p, i) => (i + 1) + '. ' + strip(p)).join('\n'));
    if (q.type === 'interview' && q.answer) lines.push('參考答案：' + strip(q.answer));
    if (q.explain) lines.push('題目附的解析：' + strip(q.explain));
    return lines.join('\n');
  }
  /** 答題後：請 AI 解釋這一題 */
  function explain(q, correct, picked) {
    const prompt = questionText(q) + '\n\n' + (correct ? '我答對了，但想確定自己真的懂。' : '我答錯了' + (picked ? '，我選的是：' + strip(picked) : '') + '。') +
      '\n請說明：為什麼正確答案是對的' + (correct ? '' : '、我的答案錯在哪裡') + '，以及這題要記住的重點。';
    if (busy) stop();
    history = [];            // 每一題重新開始一段對話：比較聚焦，也不會帶著前面的對話一起付費
    open({ lesson: q.lesson, prompt });
  }
  /** 面試口述題：把玩家打的回答交給 AI 評分，結果畫在 host 裡 */
  async function grade(q, answer, host) {
    host.innerHTML = '';
    if (!cfg.key) { open({ lesson: q.lesson }); return; }
    const box = el('div', { class: 'ai-grade' }, [el('b', { text: '🤖 AI 評分' })]);
    const out = el('div', { class: 'ai-grade-body', html: '<p class="ai-wait">評分中…</p>' });
    box.appendChild(out);
    host.appendChild(box);
    const prompt = [
      '這是一題面試口述題，請你當面試官幫我評分。',
      '題目：' + strip(q.q),
      '參考要點：\n' + (q.points || []).map((p, i) => (i + 1) + '. ' + strip(p)).join('\n'),
      q.answer ? '參考答案：' + strip(q.answer) : '',
      '我的回答：\n' + answer,
      '',
      '請用這個格式回答：',
      '**分數**：1–5 分（5 分是可以直接拿去面試的回答）',
      '**講到的要點**：列出編號',
      '**漏掉或講錯的地方**：條列，每點一句',
      '**更好的講法**：用 3–5 句示範一個完整回答',
    ].filter(Boolean).join('\n');
    try {
      await ask({ system: SYSTEM + lessonContext(q.lesson), messages: [{ role: 'user', text: prompt }], maxTokens: 1500, onText: (t) => { out.innerHTML = md(t); } });
      box.appendChild(el('p', { class: 'ai-small', text: 'AI 評分僅供參考；下面的勾選還是以你自己的判斷為準。' }));
    } catch (e) {
      out.innerHTML = '';
      out.appendChild(el('p', { class: 'ai-err', text: e.message }));
    }
  }

  G.ai = {
    open, close, explain, grade,
    ready() { return !!cfg.key; },
    setLesson(l) { lesson = l || null; if (panel && !panel.hidden) setCtx(); },
    get model() { return cfg.model; },
    _md: md,   // 測試用
  };
})();
