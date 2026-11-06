import {newTestPlayer as newPlayer} from "./fixtures";
import { snapshotGameNow } from "../shared/view-clock";
import test from 'node:test';
import assert from 'node:assert/strict';
import {newMatch, prepare, startCombat, tick} from "../shared/engine";
import { GameClock, advanceMatch } from '../shared/game-time';
import { DebugSession, debugAllowed } from '../server/debug';
import { COLS } from '../shared/model';
function setup(){const m=newMatch("practice");m.players=[newPlayer('a','A'),newPlayer('practice-bot','Bot')];prepare(m,1000);return{m,clock:new GameClock(1000),d:new DebugSession()};}
test('가상 시간: 배속 변경 연속성·일시정지·실제 시간 유지·클라이언트 보간',()=>{
 const c=new GameClock(1000);assert.equal(c.advance(1100),1100);c.speed=10;assert.equal(c.advance(1200),2100);
 c.paused=true;assert.equal(c.advance(5000),2100);c.paused=false;assert.equal(c.advance(5100),3100);
 assert.equal(snapshotGameNow({gameNow:3100,serverNow:5100,timeScale:10},5200),4100);
 assert.equal(snapshotGameNow({gameNow:3100,serverNow:5100,timeScale:0},9999),3100);
});
test('큰 시간 진행은 정상 진행과 같은 전투·라운드 결과를 생성',t=>{
 // Both runs must receive the same random shop draws at round boundaries.
 t.mock.method(Math,'random',()=>0.5);
 const {m}=setup();startCombat(m,1100);const other=structuredClone(m);
 for(let now=1200;now<=100000;now+=100) advanceMatch(m,now);
 advanceMatch(other,100000);assert.deepEqual(m,other);
});
test('권한: 비활성 서버·대전·미등록 접속·봇은 디버깅 불가',()=>{
 const {m}=setup();assert.ok(debugAllowed(true,true,'a',m));
 assert.ok(!debugAllowed(false,true,'a',m));assert.ok(!debugAllowed(true,false,'a',m));
 assert.ok(!debugAllowed(true,true,'unknown',m));assert.ok(!debugAllowed(true,true,'practice-bot',m));
});
test('배속·일시정지·0.1초 단위 진행과 잘못된 명령 거부',()=>{
 const {m,clock,d}=setup();assert.ok(d.apply(m,clock,{type:'speed',value:999},1000));assert.equal(clock.speed,1);
 assert.ok(d.apply(m,clock,{type:'step',ms:100},1000));assert.equal(clock.now,1000);
 assert.equal(d.apply(m,clock,{type:'speed',value:5},1000),null);
 assert.equal(d.apply(m,clock,{type:'pause',paused:true},1000),null);
 assert.equal(d.apply(m,clock,{type:'step',ms:100},1000),null);assert.equal(clock.now,1100);
 assert.ok(d.apply(m,clock,{type:'step',ms:999999},1000));assert.equal(clock.now,1100);
 assert.ok(d.apply(m,clock,{type:'preset',preset:'toString'},1000));
});
test('후반 프리셋·10인 출전·장비·고유 ID 및 이전 UI 요청 무효화',()=>{
 const {m,clock,d}=setup();const oldShop=m.players[0].shopRevision;
 for(const preset of ['early','mid','late','level10']){
  assert.equal(d.apply(m,clock,{type:'preset',preset},1000),null);
  assert.equal(m.phase,'prepare');assert.equal(m.players[0].shopRevision>oldShop,true);
  for(const p of m.players){const field=p.units.filter(u=>u.x>=0);assert.equal(field.length,p.level);assert.equal(new Set(field.map(u=>`${u.x},${u.y}`)).size,field.length);assert.ok(field.every(u=>u.x<COLS&&u.y<4));}
 }
 assert.equal(m.players[0].level,10);assert.equal(m.players[0].gold,40);
});
test('전투 저장·복원은 코스트·장비·경제·비공개 상태를 유지하며 정지',()=>{
 const {m,clock,d}=setup();d.apply(m,clock,{type:'preset',preset:'late'},1000);
 d.apply(m,clock,{type:'nextPhase'},1000);assert.equal(m.phase,'combat');
 d.apply(m,clock,{type:'pause',paused:true},1000);d.apply(m,clock,{type:'step',ms:1000},1000);
 assert.equal(d.apply(m,clock,{type:'save'},1000),null);const saved=structuredClone(m),at=clock.now;
 d.apply(m,clock,{type:'nextPhase'},1000);assert.equal(m.phase,'result');d.apply(m,clock,{type:'preset',preset:'early'},1000);
 assert.equal(d.apply(m,clock,{type:'load'},1000),null);assert.deepEqual(m,saved);assert.equal(clock.now,at);assert.equal(clock.paused,true);
 const clone=structuredClone(m);tick(m,m.lastTick+100);assert.deepEqual(clone,saved);
});
