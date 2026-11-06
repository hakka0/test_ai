import test from 'node:test';
import assert from 'node:assert/strict';
import {newMatch,newPlayer,prepare,applyAction} from '../shared/engine';
import {UNIT_KINDS} from '../shared/catalog';
import {acquireUnit} from '../shared/bench';
import {refreshShop,removeMaxRankOffers} from '../shared/shop';
import {offerRoundReward,chooseReward} from '../shared/rewards';
import {UNIT_POOL_SIZE,remainingCopies,pickPoolKind,hasMaxRank} from '../shared/unit-pool';
import {snapshotFor} from '../shared/snapshot';
import type {Kind,Player} from '../shared/model';

function setup(){const m=newMatch();m.players=[newPlayer('a','A'),newPlayer('b','B')];prepare(m,0);m.players.forEach(p=>{p.shop=[];p.gold=100;});return {m,p:m.players[0],q:m.players[1]};}
function copies(p:Player,kind:Kind,n:number){for(let i=0;i<n;i++)assert.ok(acquireUnit(p,kind));}
function buy(m:ReturnType<typeof newMatch>,p:Player){return applyAction(m,p.id,{type:'buy',offerId:p.shop[0].id,revision:p.shopRevision},1);}

test('pool counts roster originals, reserved offers and reward choices, without counting combat copies',()=>{
 const {m,p,q}=setup();copies(q,'knight',8);refreshShop(p,()=>0,m.players);
 q.pendingReward={id:'reward',round:5,options:[{id:'unit',type:'unit',kind:'knight'}]};
 assert.equal(remainingCopies(m.players,'knight'),UNIT_POOL_SIZE-8-5-1);
 const saved=JSON.parse(JSON.stringify(m));assert.equal(remainingCopies(saved.players,'knight'),remainingCopies(m.players,'knight'));
 const publicView=snapshotFor(m,p.id,1,'room');assert.equal('unitPool' in publicView,false);assert.equal('shop' in publicView.players[1],false);
});

test('holding copies reduces draw probability; selling restores copies and the owners eligibility',()=>{
 const {m,p,q}=setup();copies(q,'knight',9);
 const drawn=Array.from({length:6000},(_,i)=>pickPoolKind(p,m.players,()=>(i+.5)/6000));
 const count=drawn.filter(k=>k==='knight').length;assert.ok(Math.abs(count-6000*21/(UNIT_KINDS.length*30-9))<=1,count.toString());
 assert.equal(hasMaxRank(q,'knight'),true);assert.notEqual(pickPoolKind(q,m.players,()=>0),'knight');
 assert.equal(applyAction(m,q.id,{type:'sell',unitId:q.units[0].id},1),null);
 assert.equal(remainingCopies(m.players,'knight'),30);assert.equal(pickPoolKind(q,m.players,()=>0),'knight');
});

test('last copies are reserved once, rerolls release them and purchases transfer reservations to ownership',()=>{
 const {m,p,q}=setup();copies(q,'knight',27);refreshShop(p,()=>0,m.players);
 assert.equal(p.shop.filter(o=>o.kind==='knight').length,3);assert.equal(remainingCopies(m.players,'knight'),0);
 refreshShop(q,()=>0,m.players);assert.equal(q.shop.some(o=>o.kind==='knight'),false);
 assert.equal(buy(m,p),null);assert.equal(remainingCopies(m.players,'knight'),0);
 const sold=p.shop[0];assert.equal(sold.sold,true);
 assert.equal(applyAction(m,p.id,{type:'sell',unitId:p.units[0].id},2),null);
 assert.equal(remainingCopies(m.players,'knight'),1);assert.equal(p.shop[0].sold,true);
 assert.ok(applyAction(m,p.id,{type:'buy',offerId:sold.id,revision:p.shopRevision},3));
 refreshShop(p,()=>.999,m.players);assert.equal(remainingCopies(m.players,'knight'),3);
});

test('third star consumes nine originals and replaces that owners remaining offers without blocking opponents',()=>{
 const {m,p,q}=setup();copies(p,'knight',8);refreshShop(p,()=>0,m.players);const stale=p.shop[1].id;
 assert.equal(buy(m,p),null);assert.equal(p.units.length,1);assert.equal(p.units[0].rank,3);
 assert.equal(p.shop.filter(o=>!o.sold&&o.kind==='knight').length,0);assert.ok(!p.shop.some(o=>o.id===stale));
 assert.equal(remainingCopies(m.players,'knight'),21);refreshShop(q,()=>0,m.players);assert.ok(q.shop.some(o=>o.kind==='knight'));
 const before=structuredClone(m);assert.ok(applyAction(m,p.id,{type:'buy',offerId:stale,revision:p.shopRevision},2));assert.deepEqual(m,before);
});

test('reward draws exclude own max rank, claim reserved copies and return unchosen reservations',()=>{
 const {m,p,q}=setup();copies(p,'knight',9);offerRoundReward(p,5,()=>0,m.players);
 const unit=p.pendingReward!.options.find(o=>o.type==='unit')!;assert.equal(unit.type,'unit');assert.notEqual(unit.kind,'knight');
 offerRoundReward(q,5,()=>0,m.players);const option=q.pendingReward!.options.find(o=>o.type==='unit')!;assert.equal(option.type,'unit');assert.equal(option.kind,'knight');
 const remaining=remainingCopies(m.players,'knight');assert.equal(chooseReward(q,q.pendingReward!.id,option.id,false,m.players),null);assert.equal(remainingCopies(m.players,'knight'),remaining);
 p.pendingReward=null;offerRoundReward(p,10,()=>0,m.players);const r=p.pendingReward!,u=r.options.find(o=>o.type==='unit')!;assert.equal(u.type,'unit');const before=remainingCopies(m.players,u.kind);
 assert.equal(chooseReward(p,r.id,r.options.find(o=>o.type==='gold')!.id,false,m.players),null);assert.equal(remainingCopies(m.players,u.kind),before+1);
});

test('stale max-rank reward is rejected without mutation; sanitizing removes the invalid choice',()=>{
 const {m,p}=setup();offerRoundReward(p,5,()=>0,m.players);const r=p.pendingReward!,unit=r.options.find(o=>o.type==='unit')!;assert.equal(unit.type,'unit');copies(p,unit.kind,9);
 const before=structuredClone(m);assert.ok(chooseReward(p,r.id,unit.id,false,m.players));assert.deepEqual(m,before);
 removeMaxRankOffers(p,m.players);assert.equal(p.pendingReward!.options.some(o=>o.type==='unit'&&o.kind===unit.kind),false);
});

test('all kinds at three stars produce empty shop and gold/item rewards, not an infinite roll',()=>{
 const {m,p}=setup();p.level=10;
 UNIT_KINDS.forEach((kind,i)=>{copies(p,kind,9);if(i<10)Object.assign(p.units.find(u=>u.kind===kind)!,{x:i%8,y:Math.floor(i/8),benchSlot:null});});
 refreshShop(p,()=>0,m.players);assert.equal(p.shop.length,0);offerRoundReward(p,5,()=>0,m.players);
 assert.deepEqual(p.pendingReward!.options.map(o=>o.type),['gold','item']);
 const before=structuredClone(m);assert.ok(applyAction(m,p.id,{type:'reroll',revision:p.shopRevision},1));assert.deepEqual(m,before);
});

test('six-player pool logic reserves at most thirty copies of each kind',()=>{
 const players=Array.from({length:6},(_,i)=>newPlayer('p'+i,'P'+i));players.forEach(p=>p.shop=[]);
 for(let round=0;round<12;round++)for(const p of players){refreshShop(p,()=>0,players);for(const kind of UNIT_KINDS){const reserved=players.flatMap(p=>p.shop).filter(o=>!o.sold&&o.kind===kind).length;assert.ok(reserved<=30);assert.equal(remainingCopies(players,kind),30-reserved);}}
});

test('holding copies lowers that kinds reward probability in the expanded rarity pool',()=>{
 const {m,p,q}=setup();
 const draws=()=>{let mage=0,seed=412;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};for(let i=0;i<10000;i++){offerRoundReward(p,5,random,m.players);if(p.pendingReward!.options.some(o=>o.type==='unit'&&o.kind==='mage'))mage++;p.pendingReward=null;}return mage;};
 const before=draws();copies(q,'mage',9);const after=draws();assert.ok(before>0);assert.ok(after<before&&after>0);
});
