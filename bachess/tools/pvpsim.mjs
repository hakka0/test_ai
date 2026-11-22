import { makeBots, makePlayer, botPrep, makeMatches, resolveBotMatch, applyResult, standings, PVP_HP } from '../public/js/bots.js';
const N = +(process.argv[2] || 5);
let lens = [], times = [], winSk = [];
for (let g = 0; g < N; g++) {
  const players = [makePlayer(0, '나', true, 0.8), ...makeBots()];
  let round = 1;
  for (; round < 60; round++) {
    const alive = players.filter((p) => p.alive);
    if (alive.length <= 1) break;
    for (const p of alive) botPrep(p, round);
    const ms = makeMatches(players, round);
    const t0 = performance.now();
    const rs = ms.map((m) => resolveBotMatch(m, round));
    times.push(performance.now() - t0);
    for (const r of rs) {
      applyResult(r.m.a, r.aWin, r.dmgA, round);
      if (!r.m.ghost) applyResult(r.m.b, !r.aWin, r.dmgB, round);
      if (!r.m.ghost) { r.m.a.oppHist.push(r.m.b.id); r.m.b.oppHist.push(r.m.a.id); }
    }
  }
  const st = standings(players);
  lens.push(round);
  winSk.push(st[0].skill.toFixed(2));
  if (g < 2) console.log(st.map((p) => `${p.name}(s${p.skill.toFixed(2)},hp${p.hp},lv${p.level},u${p.placed.length})`).join(' | '));
}
console.log('rounds', lens.join(','), 'winner skills', winSk.join(','), 'ms/round avg', (times.reduce((a, b) => a + b, 0) / times.length).toFixed(0), 'max', Math.max(...times).toFixed(0));
