import type {Snapshot} from '../shared/model';
import {stageLabel} from '../shared/match-rules';

// The final winner is authoritative and can differ from the last round winner.
export function finalResult(s: Snapshot, viewerId: string) {
 if(s.phase !== 'finished' || !s.players.some(p => p.id === viewerId)) return null;
 const outcome = s.winner === null ? 'draw' : s.winner === viewerId ? 'win' : 'loss';
 const reason = s.endReason === 'disconnect' ? '연결 종료로 경기가 끝났습니다.'
  : s.endReason === 'roundLimit' ? '최대 라운드에 도달했습니다. 남은 체력, 승수 순으로 결과를 정했습니다.'
  : s.endReason === 'elimination' ? '플레이어의 체력이 소진되어 경기가 끝났습니다.' : '경기가 종료되었습니다.';
 return {
  outcome, title: {win:'최종 승리',loss:'최종 패배',draw:'최종 무승부'}[outcome], reason,
  stage: s.round > 0 ? stageLabel(s.round) : '—', completedRounds: s.roundHistory.length,
  players: [...s.players].sort((a,b) => Number(b.id === viewerId)-Number(a.id === viewerId))
   .map(p => ({id:p.id,name:p.name,health:p.health,wins:p.score,self:p.id === viewerId})),
  canReview: s.roundHistory.length > 0,
  replayMode: s.mode === 'botPractice' ? 'botPractice' as const : s.mode === 'practice' ? 'practice' as const : 'create' as const,
 };
}

export class FinalResultState {
 private scope = '';
 private finished = false;
 observe(s: Snapshot | null, viewerId: string): boolean {
  if(!s) {this.reset();return false;}
  const scope = `${s.roomId}:${viewerId}:${s.debug?.generation ?? 0}`;
  if(scope !== this.scope) {this.scope = scope;this.finished = false;}
  const finished = finalResult(s,viewerId) !== null;
  const open = finished && !this.finished;
  this.finished = finished;
  return open;
 }
 reset() {this.scope = '';this.finished = false;}
}
