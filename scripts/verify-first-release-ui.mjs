// A fresh browser profile exercises actual registration, playback and offline reload.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require=createRequire(new URL('../frontend/package.json',import.meta.url));
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.APP_URL || 'http://127.0.0.1:8080';
const cloudTest=process.argv.includes('--test-environment');
const target=new URL(base);
assert.ok(['127.0.0.1','localhost','[::1]'].includes(target.hostname)||(cloudTest&&target.protocol==='https:'&&!target.username&&!target.password),'公网验收需指定HTTPS APP_URL并传入--test-environment；会创建独立虚拟测试账号');
const output=fileURLToPath(new URL(cloudTest?'../docs/screenshots/cloud-live/':'../docs/screenshots/first-release/',import.meta.url));
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || chromium.executablePath()});
const context=await browser.newContext({viewport:{width:390,height:844}});
const page=await context.newPage(),errors=[],results=[];
page.setDefaultTimeout(cloudTest?60000:30000);
page.on('pageerror',error=>errors.push(error.message));
const check=(name,ok)=>{assert.ok(ok,name);results.push(name);console.log(`PASS ${results.length}: ${name}`);};
let token,drama,episode;
async function api(path,method='GET',data) {
  const response=await context.request.fetch(base+'/api'+path,{method,data,headers:token?{Authorization:'Bearer '+token}:{}});
  assert.ok(response.ok(),path+': '+response.status());return response.status()===204?null:response.json();
}
try {
  await page.goto(base+'/#home');
  await page.getByRole('button',{name:'登录 / 注册',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'注册',exact:true}).click();
  const username='首版体验'+randomBytes(5).toString('hex'),password=randomBytes(18).toString('hex');
  await page.getByLabel('用户名',{exact:true}).fill(username);
  await page.getByLabel('密码',{exact:true}).fill(password);
  await page.getByLabel('昵称',{exact:true}).fill('林间听故事');
  await page.getByRole('button',{name:'创建账号并登录',exact:true}).click();
  await page.waitForFunction(()=>sessionStorage.getItem('mujian_token'));
  token=await page.evaluate(()=>sessionStorage.getItem('mujian_token'));
  check('真实注册页面支持中文用户名',(await api('/auth/me')).username===username);
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.reload();await page.waitForFunction(()=>navigator.serviceWorker.controller);
  check('安全上下文有有效Service Worker',await page.evaluate(()=>window.isSecureContext&&Boolean(navigator.serviceWorker.controller)));
  const manifest=await context.request.get(base+'/manifest.webmanifest');const m=await manifest.json();
  check('安装清单包含独立窗口和图标',m.display==='standalone'&&m.icons.some(i=>i.sizes==='512x512'));
  const shell=await page.evaluate(async()=>{const manifest=await(await fetch('/asset-manifest.json')).json();const names=(await caches.keys()).filter(key=>key.startsWith('mujian-app-'));const paths=Object.values(manifest).flatMap(x=>[x.file,...(x.css||[])]);return(await Promise.all(names.map(async name=>{const cache=await caches.open(name);return(await Promise.all(paths.map(p=>cache.match('/'+p)))).every(Boolean);}))).some(Boolean);});
  check('离线应用壳已缓存构建JS和CSS',shell);
  drama=(await api('/dramas')).find(d=>d.title==='等风，也等你');assert.ok(drama);
  episode=(await api('/dramas/'+drama.id+'/episodes'))[0];
  await page.goto(base+'/#watch/'+drama.id);
  const player=page.getByRole('dialog',{name:'短剧播放',exact:true});await player.locator('video').waitFor();
  // preload=metadata does not promise decoded frames; start playback before waiting.
  await page.evaluate(async()=>{const v=document.querySelector('video');v.muted=true;await v.play();});
  await page.waitForFunction(()=>document.querySelector('video')?.currentTime>0.5);
  check('视频实际解码并播放',true);
  for(const [kind,label,savedLabel] of [['follow','追剧','已追剧'],['favorite','收藏','已收藏']]) {
    const responsePromise=page.waitForResponse(r=>r.url()===base+'/api/dramas/'+drama.id+'/'+kind&&r.request().method()==='PUT');
    await player.getByRole('button',{name:label,exact:true}).click();
    const response=await responsePromise;assert.ok(response.ok(),kind+': '+response.status());
    await player.getByRole('button',{name:savedLabel,exact:true}).waitFor();
  }
  check('追剧收藏真实保存',(await api('/me/following')).some(d=>d.id===drama.id)&&(await api('/me/favorites')).some(d=>d.id===drama.id));
  const progressSaved=page.waitForResponse(r=>r.url().endsWith('/episodes/'+episode.id+'/progress')&&r.ok());
  await page.evaluate(()=>{const v=document.querySelector('video');v.currentTime=12;v.pause();});
  await page.waitForFunction(()=>document.querySelector('video')?.currentTime>=12);
  await player.getByRole('button',{name:'关闭播放器',exact:true}).click();
  await progressSaved;
  const saved=(await api('/dramas/'+drama.id+'/episodes')).find(e=>e.id===episode.id);
  check('暂停关闭播放器后进度入库',saved.progressSec>=12);
  await page.goto(base+'/#watch/'+drama.id);await page.waitForFunction(()=>document.querySelector('video')?.currentTime>=12);
  check('重新打开恢复播放位置',(await page.locator('.resume-note').innerText()).includes('继续播放'));
  await page.screenshot({path:output+'mobile-390-resume.png'});
  await player.getByRole('button',{name:'离线缓存',exact:true}).click();await player.getByRole('button',{name:'已缓存',exact:true}).waitFor({timeout:120000});
  check('用户主动保存分集离线视频',await page.evaluate(()=>JSON.parse(localStorage.getItem('mujian_downloads')||'[]').length===1));
  await player.getByRole('button',{name:'关闭播放器',exact:true}).click();await page.goto(base+'/#offline');
  await page.getByRole('button',{name:/^离线播放/}).waitFor();
  await context.setOffline(true);await page.reload();await page.getByRole('button',{name:/^离线播放/}).click();
  await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
  await page.evaluate(()=>{const v=document.querySelector('video');v.pause();v.muted=true;v.currentTime=20;});
  await page.waitForFunction(()=>document.querySelector('video')?.currentTime>=20&&!document.querySelector('video')?.seeking);
  await page.evaluate(()=>document.querySelector('video').play());
  await page.waitForFunction(()=>document.querySelector('video')?.currentTime>20.5);
  check('断网刷新后离线视频可播放和拖动',true);
  check('断网不清空原登录会话',await page.evaluate(expected=>sessionStorage.getItem('mujian_token')===expected,token));
  await page.screenshot({path:output+'mobile-390-offline.png'});
  await context.setOffline(false);await page.getByRole('button',{name:'关闭离线播放',exact:true}).click();
  for(const width of [390,320]) {
    await page.setViewportSize({width,height:844});await page.goto(base+'/#profile');
    await page.getByRole('heading',{name:'林间听故事',exact:true}).waitFor();
    check(width+'px个人主页无横向溢出',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.goto(base+'/#mall');await page.locator('.product-card').first().waitFor();
    check(width+'px商城无横向溢出',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:output+'mobile-'+width+'-mall.png'});
  }
  check('浏览器没有脚本异常',errors.length===0);
} catch(error) {
  console.error('首版浏览器验收失败：',page.url(),await page.evaluate(()=>({video:document.querySelector('video')&&{time:document.querySelector('video').currentTime,seeking:document.querySelector('video').seeking,ready:document.querySelector('video').readyState,error:document.querySelector('video').error?.message,duration:document.querySelector('video').duration,src:document.querySelector('video').src},downloads:localStorage.getItem('mujian_downloads'),actions:document.querySelector('.player-actions')?.textContent,toast:document.querySelector('.toast')?.textContent})));
  await page.screenshot({path:fileURLToPath(new URL('../.runtime/first-release-failure.png',import.meta.url))});
  throw error;
} finally {
  await context.setOffline(false);
  if(token&&drama) {
    for(const relation of ['follow','favorite'])await api('/dramas/'+drama.id+'/'+relation,'DELETE');
    await api('/me/history/'+drama.id,'DELETE');
  }
  await writeFile(output+'results.json',JSON.stringify({date:new Date().toISOString(),base,browserVersion:browser.version(),platform:process.platform,success:results.length===16&&errors.length===0,checks:results.length,results,scope:'独立桌面浏览器，手机视口与浏览器断网模拟；未验证真机安装。保留虚拟测试账号，清理追剧、收藏和观看进度。'},null,2)+'\n');
  await browser.close();
}
console.log(`${results.length} 项首版浏览器检查通过；真机安装另行验收。`);
