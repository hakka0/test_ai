import { UNITS, SHOP_ODDS, MAX_ROUND, COMP_KEYS } from '../public/js/data.js';

const levelFor = r => Math.min(9, 2 + Math.ceil(r * 0.55));
function pickCost(level){ const o=SHOP_ODDS[level]; let x=Math.random()*100; for(let i=0;i<5;i++){ if((x-=o[i])<0) return i+1;} return 1; }
function team(r, q){
  const L = levelFor(r); const placed=[]; const used=new Set();
  // 역할 균형: 탱커 우선 2~3
  const tanks = UNITS.filter(u=>u.role==='tank'), others = UNITS.filter(u=>u.role!=='tank');
  for(let i=0;i<L;i++){
    const c = pickCost(L);
    let pool = (i<Math.ceil(L/3)? tanks: others).filter(u=>u.cost===c && !used.has(u.key));
    if(!pool.length) pool = UNITS.filter(u=>!used.has(u.key));
    const d = pool[Math.floor(Math.random()*pool.length)]; used.add(d.key);
    const star = Math.random() < q*(d.cost<=3?1:0.35) ? 2 : 1;
    const items=[]; const nItems = Math.floor(r/2.5*Math.random()*1.4); for(let k=0;k<Math.min(nItems,3);k++) if(Math.random()<0.5) items.push(COMP_KEYS[Math.floor(Math.random()*5)]);
    const front = d.role==='tank'; 
    placed.push({def:d, star, items, uid:i, col:0,row:0, front});
  }
  // 배치
  const slots=[[0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[8,2]].sort(()=>Math.random()-.5);
  let fi=0,bi=0; const frontCols=[4,3,5,2,6,1,7], backCols=[4,3,5,2,6,1,7,0,8];
  for(const p of placed){ if(p.front){p.col=frontCols[fi%7]; p.row=fi<7?0:1; fi++;} else {p.col=backCols[bi%9]; p.row=bi<9?2:1; bi++;} }
  return placed;
}
globalThis.__HPK=process.argv[3]||2.6; globalThis.__ATKK=process.argv[4]||1.5;
const { Battle, buildPlayerBattlers, buildEnemyBattlers } = await import('../public/js/sim.js');
const N = +process.argv[2]||150;
for (const [label,q] of [['약',0.0],['보통',0.35],['강',0.7]]) {
  let line = label.padEnd(3)+' ';
  for (let r=1;r<=MAX_ROUND;r++){
    let w=0, tsum=0;
    for(let i=0;i<N;i++){
      const b = new Battle([...buildPlayerBattlers(team(r,q)), ...buildEnemyBattlers(r)]);
      let g=0; while(!b.over && g++<20000) { b.advance(1/60,1); b.freeze=0; b.events.length=0; }
      if(b.winner===0) w++; tsum+=b.time;
    }
    line += `${r}:${Math.round(w/N*100)}%(${(tsum/N).toFixed(0)}s) `;
  }
  console.log(line);
}
