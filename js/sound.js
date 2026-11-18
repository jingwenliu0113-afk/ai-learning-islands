/* 用 Web Audio 合成的簡單音效（沒有音檔，離線也能用） */
(function () {
  'use strict';
  const G = window.G;
  let ctx = null;
  function ac() {
    if (!ctx) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ctx = new A(); }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(f, t0, dur, type, vol) {
    const c = ac(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, c.currentTime + t0);
    g.gain.setValueAtTime(0.0001, c.currentTime + t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.12, c.currentTime + t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t0 + dur);
    o.connect(g); g.connect(c.destination);
    o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + dur + 0.05);
  }
  const SOUNDS = {
    right: () => { tone(660, 0, 0.12, 'triangle'); tone(880, 0.09, 0.2, 'triangle'); },
    wrong: () => { tone(220, 0, 0.18, 'square', 0.05); tone(180, 0.12, 0.25, 'square', 0.05); },
    bug: () => { for (let i = 0; i < 6; i++) tone(520 + (i % 2) * 90, i * 0.04, 0.05, 'sawtooth', 0.03); },
    catch: () => { [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.06, 0.16, 'sine', 0.09)); },
    coin: () => { tone(988, 0, 0.08, 'square', 0.05); tone(1319, 0.07, 0.18, 'square', 0.05); },
    fanfare: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.3, 'triangle', 0.1)); },
    levelup: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.08, 0.35, 'triangle', 0.11)); tone(1568, 0.45, 0.5, 'sine', 0.08); },
    sail: () => { tone(196, 0, 0.6, 'sine', 0.06); tone(247, 0.25, 0.6, 'sine', 0.05); },
    click: () => tone(1200, 0, 0.04, 'sine', 0.04),
  };
  G.sound = {
    play(name) {
      if (!G.store.state.settings.sound) return;
      try { (SOUNDS[name] || SOUNDS.click)(); } catch (e) { /* 音效失敗不影響遊戲 */ }
    },
  };
})();
