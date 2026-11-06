import type {Snapshot} from '../shared/model';
import {opponentFor,standings} from './scouting';
export function createRankingUI(options:{snapshot:()=>Snapshot|null;viewerId:()=>string;watchedId:()=>string;select:(id:string)=>void;blocked:()=>boolean}){
 const $=(id:string)=>document.getElementById(id)!;
 const panel=document.createElement('section');panel.id='player-ranking';panel.setAttribute('aria-label','참가자 순위와 남은 체력');panel.hidden=true;
 panel.innerHTML='<div class="ranking-heading"><strong>순위</strong><span id="ranking-count"></span></div><div id="ranking-list" role="group" aria-label="유저의 전장과 대기석 보기"></div>';
 const list=panel.querySelector<HTMLElement>('#ranking-list')!,cards=new Map<string,HTMLButtonElement>();
 $('game-view').append(panel);
 const banner=document.createElement('div');banner.id='scout-banner';banner.hidden=true;
 banner.innerHTML='<strong id="scout-title" aria-live="polite"></strong><button id="scout-return" type="button">내 전장으로</button>';
 $('battlefield-stage').before(banner);$('scout-return').onclick=()=>{if(!options.blocked())options.select(options.viewerId());};
 function compact(){return document.documentElement.dataset.screenMode==='mobile'||innerWidth<=700||(innerHeight<=540&&innerWidth>innerHeight);}
 function sync(){
  const small=compact();document.body.classList.toggle('ranking-compact',small);
 }
 function render(){
  const s=options.snapshot(),viewer=options.viewerId();panel.hidden=!s;
  if(!s){banner.hidden=true;cards.clear();list.replaceChildren();sync();return;}
  const current=opponentFor(s,viewer)?.id,watched=options.watchedId()||viewer,rows=standings(s),focused=document.activeElement as HTMLElement|null;
  $('ranking-count').textContent=`${s.players.filter(p=>p.health>0).length} / ${s.players.length}명`;
  list.style.setProperty('--ranking-count',String(Math.max(1,rows.length)));
  const ids=new Set(rows.map(({player})=>player.id));for(const [id,card] of cards)if(!ids.has(id)){card.remove();cards.delete(id);}
  rows.forEach(({player,index},rank)=>{
   let card=cards.get(player.id);if(!card){card=document.createElement('button');card.type='button';card.className='ranking-row';card.dataset.playerId=player.id;
    card.innerHTML='<span class="ranking-place"></span><span class="ranking-avatar" aria-hidden="true"></span><span class="ranking-name"></span><span class="ranking-level"></span><span class="ranking-tag"></span><strong class="ranking-health"></strong><span class="ranking-health-track" aria-hidden="true"><span></span></span>';cards.set(player.id,card);}
   const set=(selector:string,text:string)=>{const el=card!.querySelector<HTMLElement>(selector)!;if(el.textContent!==text)el.textContent=text;};
   const self=player.id===viewer,opponent=player.id===current,selected=player.id===watched,dead=player.health<=0;
   card.dataset.self=String(self);card.dataset.opponent=String(opponent);card.dataset.watching=String(selected);card.dataset.eliminated=String(dead);
   card.setAttribute('aria-pressed',String(selected));card.setAttribute('aria-label',`${rank+1}위, ${player.name}${self?', 나':''}${opponent?', 현재 상대':''}, 체력 ${player.health}${dead?', 탈락':''}${!player.connected?', 연결 끊김':''}, 전장과 대기석 확인`);
   card.title=player.name;
   set('.ranking-place',String(rank+1));set('.ranking-avatar',Array.from(player.name)[0]||String(index+1));set('.ranking-name',player.name);set('.ranking-level',`Lv.${player.level}`);set('.ranking-tag',dead?'탈락':self?'나':opponent?'VS':'');set('.ranking-health',String(Math.max(0,player.health)));
   card.querySelector<HTMLElement>('.ranking-avatar')!.style.setProperty('--avatar-hue',String(index*57+25));
   card.querySelector<HTMLElement>('.ranking-health-track > span')!.style.width=`${Math.max(0,Math.min(100,player.health))}%`;
   if(list.children[rank]!==card)list.insertBefore(card,list.children[rank]??null);
  });
  if(focused?.dataset.playerId&&cards.get(focused.dataset.playerId)===focused&&document.activeElement!==focused)focused.focus({preventScroll:true});
  const viewed=s.players.find(p=>p.id===options.watchedId());banner.hidden=!viewed;
  const title=viewed?`${viewed.name}${viewed.visibility==='opponent'&&viewed.rosterVisible===false?` · ${s.phase==='matching'?'매칭':'준비'} 중 비공개`:'의 전장'}`:'';if($('scout-title').textContent!==title)$('scout-title').textContent=title;
  document.body.classList.toggle('scouting-player',!!viewed);sync();
 }
 list.addEventListener('click',e=>{const card=(e.target as Element).closest<HTMLElement>('[data-player-id]');if(card&&!options.blocked())options.select(card.dataset.playerId!);});
 new ResizeObserver(sync).observe(panel);window.addEventListener('resize',sync);
 return {render,sync};
}
