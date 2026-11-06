import test from 'node:test';
import assert from 'node:assert/strict';
import {modeFromUserAgent,ScreenModePreference,SCREEN_MODE_KEY} from '../client/screen-mode';
const windows='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';
const android='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36';
function store(initial:string|null=null){let saved=initial;return {getItem:()=>saved,setItem:(key:string,value:string)=>{assert.equal(key,SCREEN_MODE_KEY);saved=value;},removeItem:(key:string)=>{assert.equal(key,SCREEN_MODE_KEY);saved=null;},value:()=>saved};}
test('User-Agent: PC browsers default to PC; phones/tablets default to mobile',()=>{
 for(const ua of [windows,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15','Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:138.0) Gecko/20100101 Firefox/138.0','Mozilla/5.0 (X11; CrOS aarch64 16151.57.0) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36'])assert.equal(modeFromUserAgent(ua),'pc',ua);
 for(const ua of [android,'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1','Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1','Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36'])assert.equal(modeFromUserAgent(ua),'mobile',ua);
});
test('Saved manual mode overrides User-Agent and survives page reload',()=>{
 const storage=store(),pc=new ScreenModePreference(windows,storage);assert.equal(pc.mode,'pc');assert.equal(pc.automatic,true);pc.select('mobile');assert.equal(pc.mode,'mobile');assert.equal(pc.automatic,false);
 const reload=new ScreenModePreference(windows,storage);assert.equal(reload.mode,'mobile');reload.select('pc');assert.equal(new ScreenModePreference(android,storage).mode,'pc');
});
test('Return to automatic clears only the screen preference and restores current User-Agent default',()=>{
 const storage=store('pc'),state=new ScreenModePreference(android,storage);assert.equal(state.mode,'pc');state.reset();assert.equal(state.mode,'mobile');assert.equal(state.automatic,true);assert.equal(storage.value(),null);assert.equal(new ScreenModePreference(android,storage).mode,'mobile');
});
test('Invalid saved preference and unknown User-Agent have a usable default',()=>{
 for(const saved of ['auto','desktop','undefined','',null]){const state=new ScreenModePreference(windows,store(saved));assert.equal(state.mode,'pc');assert.equal(state.automatic,true);}
 assert.equal(modeFromUserAgent(''),'pc');assert.equal(modeFromUserAgent('CustomBrowser/1.0'),'pc');
});
test('Blocked storage still allows mode selection and automatic reset for the current page',()=>{
 const storage={getItem:()=>{throw new Error('blocked');},setItem:()=>{throw new Error('blocked');},removeItem:()=>{throw new Error('blocked');}};
 const state=new ScreenModePreference(windows,storage);assert.equal(state.mode,'pc');state.select('mobile');assert.equal(state.mode,'mobile');state.reset();assert.equal(state.mode,'pc');
 const noStorage=new ScreenModePreference(android);noStorage.select('pc');assert.equal(noStorage.mode,'pc');noStorage.reset();assert.equal(noStorage.mode,'mobile');
});
