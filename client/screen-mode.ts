export type ScreenMode = 'pc' | 'mobile';
export const SCREEN_MODE_KEY = 'autochess-screen-mode';
type ModeStorage = Pick<Storage,'getItem'|'setItem'|'removeItem'>;

// Only the User-Agent chooses the default. Window dimensions never choose a mode.
export function modeFromUserAgent(userAgent:string):ScreenMode {
 return /Mobi|Android|iPhone|iPad|iPod|IEMobile|Windows Phone|Opera Mini|BlackBerry|BB10|webOS|Kindle|Silk\//i.test(userAgent) ? 'mobile' : 'pc';
}
export class ScreenModePreference {
 private manual:ScreenMode|null=null;
 readonly detected:ScreenMode;
 constructor(userAgent:string,private storage?:ModeStorage) {
  this.detected=modeFromUserAgent(userAgent);
  try {const saved=storage?.getItem(SCREEN_MODE_KEY);if(saved==='pc'||saved==='mobile')this.manual=saved;} catch {}
 }
 get mode(){return this.manual??this.detected;}
 get automatic(){return this.manual===null;}
 select(mode:ScreenMode){this.manual=mode;try{this.storage?.setItem(SCREEN_MODE_KEY,mode);}catch{}}
 reset(){this.manual=null;try{this.storage?.removeItem(SCREEN_MODE_KEY);}catch{}}
}
