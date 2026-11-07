// Reward/final presentation may close the debug dialog during the same update.
async function closeInfo(page){await page.evaluate(()=>{if(document.getElementById('pc-info-dialog').open)document.getElementById('pc-info-close').click();});}
async function openDebug(page){
 await page.waitForFunction(()=>['mobile-info-open','pc-debug-open'].some(id=>{const e=document.getElementById(id);return e&&e.getClientRects().length>0;}));
 if(!await page.locator('#pc-info-dialog').evaluate(e=>e.open)){
  if(await page.locator('#mobile-info-open').isVisible())await page.locator('#mobile-info-open').click();
  else await page.locator('#pc-debug-open').click();
 }
 if(!await page.locator('#pc-info-debug').isVisible())await page.locator('#pc-debug-tab').click();
 if(!await page.locator('#debug-panel').evaluate(e=>e.open))await page.locator('#debug-panel summary').click();
}
async function debugClick(page,id){await openDebug(page);await page.locator('#'+id).click();await closeInfo(page);}
async function debugPreset(page,preset='early'){await openDebug(page);await page.locator('#debug-preset').selectOption(preset);await page.locator('#debug-apply').click();await closeInfo(page);await page.waitForFunction(level=>document.querySelector('#level-label').textContent.startsWith(`레벨 ${level} /`)&&document.querySelector('#phase').textContent.startsWith('준비'),({catalog:10,overtime:1,minion:1,early:1,mid:7,late:8,level10:10,merge:3,synergy:6,synergyBulwark:8,synergyScout:8,synergyArcane:8,reward:4})[preset]);}
async function selectDock(page,view){if(!await page.locator('#dock-view-switch').count()){if(view==='shop'&&!await page.locator('#pc-dock-reserve').isVisible())await page.locator('#pc-dock-toggle').click();await page.locator(view==='shop'?'#shop-panel':'#bench').waitFor({state:'visible'});return;}await page.locator('#dock-view-switch').waitFor({state:'visible'});if(await page.locator('#dock-view-switch').getAttribute('data-view')!==view)await page.locator('#dock-view-switch').click();else if(!await page.locator('#pc-dock-reserve').isVisible())await page.locator('#pc-dock-toggle').click();await page.waitForFunction(view=>document.querySelector('#dock-view-switch').dataset.view===view,view);}
async function buyOffer(page,offer=page.locator('#shop-offers [data-offer]:enabled').first()){
 await offer.click();
}
module.exports={selectDock,openDebug,closeInfo,debugClick,debugPreset,buyOffer};
