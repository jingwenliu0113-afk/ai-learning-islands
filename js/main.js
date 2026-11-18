/* 啟動 */
(function () {
  'use strict';
  const G = window.G;
  G.store.load();
  try {
    if (!G.world.init()) document.body.classList.add('no3d');
  } catch (e) {
    console.error(e);
    document.body.classList.add('no3d');
  }
  try { if (G.play && G.world.ok) G.play.init(); } catch (e) { console.error(e); }   // 新玩法：釣魚、寶箱、島民、遊戲機台
  G.ui.bind();
  G.ui.refresh();
  G.store.state.levelSeen = Math.max(G.store.state.levelSeen || 1, G.store.level().lv);
  if (!G.store.state.tutorialDone) G.ui.tutorial(0);
  else G.world.guideSay('歡迎回來！' + (G.store.dueQuestions().length ? '今天有 ' + G.store.dueQuestions().length + ' 根雜草要拔。' : '看看下面的「下一步」吧。'), 5000);
  // 每分鐘檢查一次到期的題目，讓雜草與名牌保持最新
  setInterval(() => { if (!document.hidden && !G.quiz.active) { G.world.refreshAll(); G.ui.refresh(); } }, 60000);
  window.addEventListener('error', (e) => { document.body.setAttribute('data-error', e.message || 'error'); });
})();
