// Test tooling only. Keep browser binaries separate from game dependencies and ZIPs.
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),tools=path.join(root,'.browser-tools'),runtime=path.join(root,'.browser-runtime');
function run(command,args){const result=spawnSync(command,args,{cwd:root,stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)throw new Error(`${command} exited with ${result.status}`);}
(async()=>{
 const fallback=process.platform==='linux'&&process.arch==='x64';
 fs.mkdirSync(tools,{recursive:true});fs.mkdirSync(runtime,{recursive:true});
 const packages=['playwright@1.62.1'];if(fallback)packages.push('@sparticuz/chromium@138.0.2');
 const npmArgs=['install','--prefix',tools,'--no-audit','--no-fund',...packages];
 if(process.env.npm_execpath)run(process.execPath,[process.env.npm_execpath,...npmArgs]);
 else if(process.platform==='win32')throw new Error('Run this installer with npm run setup:browser.');
 else run('npm',npmArgs);
 if(fallback){
  // Brotli data is extracted without restoring ownership, which restricted containers may reject.
  const source=path.join(tools,'node_modules/@sparticuz/chromium/bin');
  for(const name of ['chromium.br','swiftshader.tar.br'])fs.writeFileSync(path.join(runtime,name.slice(0,-3)),zlib.brotliDecompressSync(fs.readFileSync(path.join(source,name))));
  fs.chmodSync(path.join(runtime,'chromium'),0o755);
  run('tar',['--no-same-owner','-xf',path.join(runtime,'swiftshader.tar'),'-C',runtime]);fs.unlinkSync(path.join(runtime,'swiftshader.tar'));
 }else run(process.execPath,[path.join(tools,'node_modules/playwright/cli.js'),'install','chromium']);
 const {chromium,browserOptions}=require('../tests/browser-runtime.cjs');
 const browser=await chromium.launch(browserOptions());const page=await browser.newPage();await page.setContent('<h1>Browser ready</h1>');
 if(await page.locator('h1').textContent()!=='Browser ready')throw new Error('Browser smoke check failed');
 const version=browser.version();await browser.close();
 fs.writeFileSync(path.join(runtime,'installation.json'),JSON.stringify({browser:version,platform:process.platform,arch:process.arch},null,2));
 console.log(`Chromium ${version}: launch and page check passed.`);
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
