import {ScreenModePreference,type ScreenMode} from './screen-mode';
export function createScreenModeUI(options:{beforeChange:()=>void;afterChange:()=>void}) {
 let storage:Storage|undefined;try{storage=localStorage;}catch{}
 const state=new ScreenModePreference(navigator.userAgent,storage);
 const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
 function render(){
  document.documentElement.dataset.screenMode=state.mode;
  const landscape=innerWidth>innerHeight;
  document.documentElement.dataset.screenOrientation=landscape?'landscape':'portrait';
  document.documentElement.classList.toggle('landscape-layout',landscape&&(state.mode==='mobile'||innerHeight<=540));
  $('screen-mode-status').textContent=`${state.mode==='pc'?'PC':`모바일 ${landscape?'가로':'세로'}`} 화면 · ${state.automatic?'자동':'직접 선택'}`;
  for(const mode of ['pc','mobile'] as ScreenMode[])$(`screen-mode-${mode}`).setAttribute('aria-pressed',String(state.mode===mode));
  $<HTMLButtonElement>('screen-mode-auto').disabled=state.automatic;
 }
 function change(mode:ScreenMode|null){options.beforeChange();if(mode)state.select(mode);else state.reset();render();options.afterChange();}
 $('screen-mode-pc').onclick=()=>change('pc');$('screen-mode-mobile').onclick=()=>change('mobile');$('screen-mode-auto').onclick=()=>change(null);
 window.addEventListener('resize',render);
 render();
}
