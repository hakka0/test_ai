import test from 'node:test';
import assert from 'node:assert/strict';
import type {Client} from '@colyseus/core';
import {GameRoom} from '../server/GameRoom';

test('방 수명: 접속자가 있으면 대기/진행/종료 화면에서 91분 뒤에도 방 유지',async t=>{
 for(const phase of ['waiting','prepare','finished'] as const){
  const room=new GameRoom();let elapsed=0,disconnected=0;
  t.mock.method(room.clock as unknown as {now:()=>number},'now',()=>elapsed);
  t.mock.method(room,'setSimulationInterval',()=>{});
  t.mock.method(room,'disconnect',async()=>{disconnected++;});
  room.clock.start();
  try{
   room.onCreate({});room.game.phase=phase;
   room.clients.push({sessionId:'connected-player'} as Client);
   elapsed=91*60*1000;room.clock.tick();
   assert.equal(disconnected,0,`${phase}: active room must survive its old lifetime limit`);
  }finally{room.clock.clear();room.clock.stop();room.onDispose();}
 }
});
