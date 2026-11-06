import {EQUIPMENT, ITEM_RECIPES} from '../shared/catalog';
import type {Action, Item, SelfPlayerSnapshot} from '../shared/model';

/** An anchored, nonmodal item inspector. Inspecting a recipe never consumes items. */
export function createCraftUI(options:{
 player:()=>SelfPlayerSnapshot|undefined; allowed:()=>boolean; beforeOpen:()=>void;
 canCraft:()=>boolean; canEquip:()=>boolean; busy:()=>boolean; availability:()=>string;
 commit:(action:Action)=>void; selectForEquip:(id:string)=>void;
}) {
 const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
 const dialog=document.createElement('dialog');dialog.id='craft-dialog';
 dialog.setAttribute('aria-labelledby','craft-title');dialog.setAttribute('aria-describedby','item-description');
 dialog.innerHTML='<div class="craft-heading"><h2 id="craft-title" tabindex="-1">아이템 상세</h2><button id="craft-close" type="button" aria-label="아이템 상세 닫기">✕</button></div><div id="craft-body"><p id="item-kind"></p><p id="item-description"></p><section aria-labelledby="item-recipes-title"><h3 id="item-recipes-title">조합 리스트</h3><div id="recipe-book"></div><p id="item-no-recipes" hidden>조합식 없음</p></section></div><div id="craft-footer"><p id="craft-availability" role="status" hidden></p><p id="craft-message" role="status" hidden></p><p id="craft-preview" role="status" hidden></p><button id="craft-submit" type="button" class="primary">조합 제작</button><button id="item-equip" type="button">장착할 유닛 선택</button></div>';
 document.body.append(dialog);
 let current='',opener:HTMLElement|null=null,anchor:DOMRect|null=null,selectedRecipe=-1,bookKey='';
 let pending:{ids:string[];result:string;previous:Set<string>}|null=null;
 function source(){return document.querySelector<HTMLElement>(`[data-equipment-item="${CSS.escape(current)}"]`);}
 function syncSource(){for(const el of document.querySelectorAll<HTMLElement>('[data-equipment-item]'))el.setAttribute('aria-expanded',String(dialog.open&&el.dataset.equipmentItem===current));}
 function freeItems(){return options.player()?.inventory.filter(i=>i.unitId===null)??[];}
 // Prefer the actual clicked copy; same-kind recipes still require two distinct IDs.
 function pair(index:number):Item[]{
  const recipe=ITEM_RECIPES[index];if(!recipe)return [];
  const remaining=freeItems().sort((a,b)=>Number(b.id===current)-Number(a.id===current)),chosen:Item[]=[];
  for(const definition of recipe.materials){const at=remaining.findIndex(i=>i.definition===definition);if(at<0)return [];chosen.push(remaining.splice(at,1)[0]);}
  return chosen;
 }
 function position(){
  if(!dialog.open)return;
  const el=source();if(el?.getClientRects().length&&!el.closest('[inert]')){opener=el;anchor=el.getBoundingClientRect();}
  const r=anchor??$('equipment-toggle').getBoundingClientRect(),gap=8,edge=8,w=dialog.offsetWidth,h=dialog.offsetHeight;
  const right=r.right+gap,left=r.left-gap-w;
  const x=right+w<=innerWidth-edge?right:left>=edge?left:Math.max(edge,Math.min(innerWidth-w-edge,r.left));
  dialog.style.left=`${x}px`;dialog.style.top=`${Math.max(edge,Math.min(innerHeight-h-edge,r.top))}px`;
 }
 function close(focus=false){
  if(!dialog.open)return;
  dialog.close();syncSource();
  if(focus&&!document.querySelector('dialog[open]')){
   const target=source()??opener;
   (target?.isConnected&&target.getClientRects().length&&!target.closest('[inert]')?target:$('equipment-toggle')).focus({preventScroll:true});
  }
 }
 function render(){
  const items=freeItems();
  if(pending&&!options.busy()){
   const made=pending.ids.every(id=>!items.some(i=>i.id===id))&&items.find(i=>i.definition===pending!.result&&!pending!.previous.has(i.id));
   if(made&&dialog.open&&pending.ids.includes(current)){
    current=made.id;selectedRecipe=-1;bookKey='';
    $('craft-message').textContent=`제작 완료 · ${EQUIPMENT[made.definition].name}`;$('craft-message').hidden=false;
   }
   pending=null;
  }
  if(!dialog.open)return;
  const item=items.find(i=>i.id===current);if(!item){close();return;}
  const def=EQUIPMENT[item.definition],material=def.category==='material',canCraft=options.canCraft();
  $('craft-title').textContent=def.name;
  $('item-kind').textContent=material?`조합 재료 · ${items.filter(i=>i.definition===item.definition).length}개 보유`:`${def.tier}등급 장비`;
  $('item-description').textContent=def.description;
  $('item-recipes-title').textContent=material?'조합 리스트':'제작에 사용한 재료';
  const related=ITEM_RECIPES.map((recipe,index)=>({recipe,index})).filter(({recipe})=>material?recipe.materials.includes(item.definition):`${recipe.result}-t2`===item.definition);
  $('item-no-recipes').hidden=related.length>0;
  const key=JSON.stringify([item.definition,selectedRecipe,canCraft,items.map(i=>[i.id,i.definition])]);
  if(key!==bookKey){
   bookKey=key;
   const focus=(document.activeElement as HTMLElement|null)?.dataset.recipe;
   const rows=related.map(({recipe,index})=>{
    const row=document.createElement(material?'button':'div');row.className='item-recipe';
    const result=EQUIPMENT[`${recipe.result}-t2`],name=document.createElement('strong'),ingredients=document.createElement('span'),description=document.createElement('span'),state=document.createElement('span');
    name.textContent=result.name;ingredients.textContent=recipe.materials.map(id=>EQUIPMENT[id].name).join(' + ');description.textContent=result.description;
    state.className='recipe-state';
    if(material){
     const available=pair(index).length===2,button=row as HTMLButtonElement;
     button.type='button';button.dataset.recipe=String(index);button.dataset.available=String(available);button.setAttribute('aria-pressed',String(selectedRecipe===index));button.disabled=!canCraft||!available;
     state.textContent=available?(selectedRecipe===index?'선택됨':'제작 가능'):'재료 부족';
     ingredients.textContent=Object.entries(recipe.materials.reduce<Record<string,number>>((counts,id)=>{counts[id]=(counts[id]??0)+1;return counts;},{})).map(([id,needed])=>`${EQUIPMENT[id].name} ${items.filter(i=>i.definition===id).length}/${needed}`).join(' + ');
    }else{row.dataset.recipeOrigin=String(index);state.textContent='2등급 조합식';}
    row.append(name,state,ingredients,description);return row;
   });
   $('recipe-book').replaceChildren(...rows);
   if(focus!==undefined)dialog.querySelector<HTMLButtonElement>(`[data-recipe="${focus}"]:enabled`)?.focus({preventScroll:true});
  }
  const chosen=material&&selectedRecipe>=0&&pair(selectedRecipe).length===2?ITEM_RECIPES[selectedRecipe]:undefined;
  const availability=material?options.availability():options.canEquip()?'':'현재는 장착할 수 없습니다.';
  $('craft-availability').textContent=availability;$('craft-availability').hidden=!availability;
  $('craft-preview').hidden=!chosen;$('craft-preview').textContent=chosen?`제작 선택 · ${EQUIPMENT[`${chosen.result}-t2`].name}`:'';
  const submit=$<HTMLButtonElement>('craft-submit');submit.hidden=!material;submit.disabled=!canCraft||!chosen;submit.textContent=pending?'제작 중…':'조합 제작';
  const equip=$<HTMLButtonElement>('item-equip');equip.hidden=material;equip.disabled=!options.canEquip();
  syncSource();position();
 }
 function open(id:string,element:HTMLElement){
  if(!options.allowed()||!freeItems().some(i=>i.id===id))return;
  options.beforeOpen();current=id;opener=element;anchor=element.getBoundingClientRect();selectedRecipe=-1;bookKey='';
  $('craft-message').hidden=true;
  if(!dialog.open)dialog.show();render();dialog.scrollTop=0;$('craft-title').focus({preventScroll:true});
 }
 $('recipe-book').addEventListener('click',e=>{
  const button=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-recipe]');
  if(!button||button.disabled||!options.canCraft())return;
  selectedRecipe=Number(button.dataset.recipe);$('craft-message').hidden=true;render();
 });
 $('craft-submit').onclick=()=>{
  if(!dialog.open||!options.allowed()||!options.canCraft()||pending)return;
  const items=pair(selectedRecipe),recipe=ITEM_RECIPES[selectedRecipe];
  if(items.length!==2||!items.some(i=>i.id===current)||!recipe)return;
  pending={ids:items.map(i=>i.id),result:`${recipe.result}-t2`,previous:new Set(freeItems().map(i=>i.id))};
  $('craft-message').hidden=true;options.commit({type:'craft',itemIds:[items[0].id,items[1].id]});render();
 };
 $('item-equip').onclick=()=>{if(!dialog.open||!options.allowed()||!options.canEquip())return;const id=current;close();options.selectForEquip(id);};
 $('craft-close').onclick=()=>close(true);
 dialog.addEventListener('cancel',e=>{e.preventDefault();close(true);});
 // Capture before the board's pointerdown so an outside drag works immediately.
 document.addEventListener('pointerdown',e=>{const target=e.target as HTMLElement;if(dialog.open&&!dialog.contains(target)&&!target.closest('[data-equipment-item],#game-help-tooltip'))close();},true);
 document.addEventListener('click',e=>{const target=e.target as HTMLElement;if(dialog.open&&!e.composedPath().includes(dialog)&&!target.closest('[data-equipment-item],#game-help-tooltip'))close();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&dialog.open){e.preventDefault();e.stopImmediatePropagation();close(true);}},true);
 window.addEventListener('resize',position);document.addEventListener('scroll',position,true);new ResizeObserver(position).observe(dialog);
 return {open,close,position,render,clearPending:()=>{pending=null;},reset:()=>{close();pending=null;selectedRecipe=-1;}};
}
