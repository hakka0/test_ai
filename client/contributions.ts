import type {RoundResult} from '../shared/model';
import {unitDefinition} from '../shared/minions';

const number = new Intl.NumberFormat('ko-KR', {maximumFractionDigits: 1});
export const contributionMetrics = [
 ['damageDealt', '준 피해'], ['damageTaken', '받은 피해'],
 ['healing', '회복량'], ['shieldBlocked', '보호막 방어'],
] as const;
export type ContributionMetric=typeof contributionMetrics[number][0];
export type ContributionTeam='self'|'opponent';

// Each fighter has its own row, including identical units and fallen fighters.
export function contributionGroups(record:RoundResult,viewerId:string,metric:ContributionMetric='damageDealt',team:ContributionTeam='self'):string {
 const opponent=record.players.find(p=>p.id===viewerId)?.opponentId;
 const pairedRecord=record.players.some(p=>p.opponentId||p.bye);
 const player=record.players.find(p=>team==='self'?p.id===viewerId:opponent?p.id===opponent:!pairedRecord&&p.id!==viewerId);
 const units=record.units.filter(u=>u.owner===player?.id).sort((a,b)=>b[metric]-a[metric]);
 const label=contributionMetrics.find(([key])=>key===metric)![1];
 // Use a shared scale so the teams remain comparable when switching.
 const maximum=Math.max(0,...record.units.filter(u=>!pairedRecord||u.owner===viewerId||u.owner===opponent).map(u=>u[metric]));
 const rows=units.map(unit=>`<li class="contribution-unit" data-contribution-unit="${unit.id}" data-value="${unit[metric]}">
  <img src="${unitDefinition(unit).image}" alt="" width="32" height="32">
  <div class="contribution-row"><div class="contribution-label"><strong>${unitDefinition(unit).name} · ${unit.rank}성</strong><span data-contribution-metric="${metric}" aria-label="${label} ${number.format(unit[metric])}">${number.format(unit[metric])}</span></div>
  <div class="contribution-track" aria-hidden="true"><span style="width:${maximum?100*unit[metric]/maximum:0}%"></span></div></div>
 </li>`).join('');
 return `<section class="contribution-team" data-metric="${metric}" data-team="${team}"><div class="contribution-team-heading"><h3>${team==='self'?'아군':'상대'} · 출전 ${units.length}명</h3><span>합계 <strong data-contribution-total>${number.format(units.reduce((sum,u)=>sum+u[metric],0))}</strong></span></div>${rows?`<ul class="contribution-list">${rows}</ul>`:'<p class="small muted">출전 유닛 없음</p>'}</section>`;
}
