import {randomBytes} from 'node:crypto';
const reserved=new Set<string>();
export function reserveRoomCode(random=()=>randomBytes(2).toString('hex').toUpperCase()):string {
 for(let attempt=0;attempt<64;attempt++){
  const code=random();
  if(!/^[A-F0-9]{4}$/.test(code))throw new Error('Invalid room code');
  if(!reserved.has(code)){reserved.add(code);return code;}
 }
 // A collision never reuses an active room, even with a repeated random value.
 for(let index=0;index<65536;index++){
  const code=index.toString(16).toUpperCase().padStart(4,'0');
  if(!reserved.has(code)){reserved.add(code);return code;}
 }
 throw new Error('사용 가능한 방 코드가 없습니다. 잠시 후 다시 시도하세요.');
}
export function releaseRoomCode(code:string){reserved.delete(code);}
