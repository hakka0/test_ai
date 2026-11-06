const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
let playwright;
try{playwright=require(path.join(root,'.browser-tools/node_modules/playwright'));}
catch{try{playwright=require('playwright');}catch{throw new Error('Run npm run setup:browser before browser tests.');}}
const {chromium}=playwright;
function browserOptions(){
 const local=path.join(root,'.browser-runtime/chromium');
 return {headless:true,executablePath:process.env.CHROME_PATH||(fs.existsSync(local)?local:undefined),args:['--no-sandbox']};
}
module.exports={chromium,browserOptions};
