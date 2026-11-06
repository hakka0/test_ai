import type {Snapshot,SelfPlayerSnapshot} from '../shared/model';
// Presentation only. Dismissing/peeking never claims or alters a server reward.
export class RewardPresentation {
 private key = '';
 private eligible = false;
 private dismissed = false;
 private inspecting = false;
 observe(s:Snapshot|null,viewerId:string,now:number) {
  const p=s?.players.find((p):p is SelfPlayerSnapshot=>p.visibility==='self'&&p.id===viewerId);
  const reward=p?.pendingReward;
  const key=s&&reward?`${s.roomId}:${viewerId}:${s.debug?.generation??0}:${reward.id}`:'';
  if(key!==this.key){this.key=key;this.dismissed=false;this.inspecting=false;}
  this.eligible=!!(s&&reward&&s.phase==='prepare'&&!p!.ready&&now<s.deadline);
  if(!this.eligible)this.inspecting=false;
 }
 get available(){return !!this.key&&this.eligible;}
 get visible(){return this.available&&!this.dismissed;}
 get peeking(){return this.visible&&this.inspecting;}
 open(){if(this.available){this.dismissed=false;this.inspecting=false;}}
 dismiss(){this.dismissed=true;this.inspecting=false;}
 togglePeek(){if(!this.visible)return false;this.inspecting=!this.inspecting;return true;}
 reset(){this.key='';this.eligible=false;this.dismissed=false;this.inspecting=false;}
}
