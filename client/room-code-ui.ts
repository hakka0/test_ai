/** The room identifier is concealed by default and reset for each new room. */
export function createRoomCodeUI(options:{notify:(message:string)=>void}){
 const value=document.getElementById('room-code')!,control=document.getElementById('room-code-control')!;
 const button=document.getElementById('room-code-toggle') as HTMLButtonElement;
 const copy=document.getElementById('room-code-copy') as HTMLButtonElement;
 let room='',revealed=false,copying=false,copied=false,timer:ReturnType<typeof setTimeout>|undefined;
 function paint(){
  control.hidden=!room;value.textContent=room||'—';
  value.classList.toggle('is-concealed',!revealed);value.setAttribute('aria-hidden',String(!revealed));
  button.setAttribute('aria-pressed',String(revealed));button.setAttribute('aria-label',revealed?'방 코드 숨기기':'방 코드 표시');
  copy.disabled=!room||copying;copy.dataset.copied=String(copied);
  const label=copied?'방 코드 복사 완료':'방 코드 복사';copy.setAttribute('aria-label',label);copy.title=label;
 }
 async function writeClipboard(text:string){
  try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return true;}}catch{}
  // LAN HTTP pages may not expose the Clipboard API; retain click-to-copy there.
  const active=document.activeElement as HTMLElement|null,selection=document.getSelection();
  const ranges=selection?Array.from({length:selection.rangeCount},(_,i)=>selection.getRangeAt(i).cloneRange()):[];
  const input=document.createElement('textarea');input.value=text;input.readOnly=true;input.tabIndex=-1;input.setAttribute('aria-hidden','true');
  input.style.cssText='position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;font-size:16px';
  try{document.body.append(input);input.focus({preventScroll:true});input.select();return document.execCommand('copy');}
  finally{input.remove();active?.focus({preventScroll:true});if(selection){selection.removeAllRanges();for(const range of ranges)selection.addRange(range);}}
 }
 copy.onclick=async()=>{
  if(!room||copying)return;
  const id=room;clearTimeout(timer);copying=true;copied=false;paint();let success=false;
  try{success=await writeClipboard(id);}catch{}
  if(id!==room)return;
  copying=false;copied=success;paint();
  options.notify(success?'방 코드를 복사했습니다.':'복사하지 못했습니다. 방 코드를 표시한 뒤 직접 복사해 주세요.');
  if(success)timer=setTimeout(()=>{copied=false;paint();},1800);
 };
 button.onclick=()=>{if(room){revealed=!revealed;paint();}};
 function render(id:string){if(id!==room){clearTimeout(timer);room=id;revealed=false;copying=false;copied=false;}paint();}
 paint();return {render,reset:()=>render('')};
}
