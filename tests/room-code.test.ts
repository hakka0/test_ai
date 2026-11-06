import test from 'node:test';
import assert from 'node:assert/strict';
import {reserveRoomCode,releaseRoomCode} from '../server/room-code';

test('방 코드는 4자리 대문자 16진수, 충돌 재추첨·반복 난수 대체·종료 후 재사용',()=>{
 const codes:string[]=[];
 try{
  const first=reserveRoomCode(()=>'BEEF');codes.push(first);assert.equal(first,'BEEF');
  let count=0;const second=reserveRoomCode(()=>count++===0?'BEEF':'CAFE');codes.push(second);assert.equal(second,'CAFE');
  const fallback=reserveRoomCode(()=>'BEEF');codes.push(fallback);assert.notEqual(fallback,first);assert.notEqual(fallback,second);
  for(let i=0;i<100;i++)codes.push(reserveRoomCode());assert.equal(new Set(codes).size,codes.length);assert.ok(codes.every(code=>/^[A-F0-9]{4}$/.test(code)));
  releaseRoomCode(first);assert.equal(reserveRoomCode(()=>'BEEF'),'BEEF');assert.throws(()=>reserveRoomCode(()=>'TOO-LONG'));
 }finally{for(const code of codes)releaseRoomCode(code);}
});
