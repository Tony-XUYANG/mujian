import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const require=createRequire(new URL('../frontend/package.json',import.meta.url));
const { chromium }=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.APP_URL || 'http://127.0.0.1:8080';
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname)||process.argv.includes('--test-environment'));
const output=fileURLToPath(new URL('../docs/screenshots/media-library/',import.meta.url));
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || chromium.executablePath()});
const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
const page=await context.newPage(), errors=[];
page.on('pageerror',e=>errors.push(e.message));
let count=0,seller,product;
const check=(name,ok)=>{assert.ok(ok,name);console.log(`PASS ${++count}: ${name}`);};
async function api(path,method='GET',data,token=seller) {
  const r=await context.request.fetch(base+'/api'+path,{method,data,headers:token?{Authorization:'Bearer '+token}:{}});
  assert.ok(r.ok(),path+': '+await r.text());return r.json();
}
const fits=()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1&&[...document.querySelectorAll('.modal,.media-library')].every(el=>el.scrollWidth<=el.clientWidth+1));
async function picker() {await page.getByRole('button',{name:'从素材库选择商品图片链接（选填）',exact:true}).click();const d=page.getByRole('dialog',{name:'选择商品图片',exact:true});await d.locator('.media-card').first().waitFor();return d;}
try {
  const suffix=randomBytes(5).toString('hex');
  seller=(await api('/auth/register','POST',{username:'素材界面'+suffix,password:randomBytes(18).toString('hex'),nickname:'图片素材体验店主'},null)).token;
  await api('/shop/register','POST',{name:'幕间好物 · 素材体验店'});
  const names=['日落主图','山间晨光','城市夜色','暖色细节','林间小路','窗边光影','周末好物','生活片刻','旅行灵感','自然质感','柔和色调','新品封面','备用图片'];
  // Reuse the repository's demo image; visual fixtures are not remote downloads.
  const images=await Promise.all(['sunset','mountain','city','ancient','forest','rain','sea'].map(name=>readFile(new URL('../frontend/public/media/'+name+'.jpg',import.meta.url))));
  const urls=[];
  for(const name of names) {
    const r=await context.request.post(base+'/api/shop/media/images',{headers:{Authorization:'Bearer '+seller},multipart:{file:{name:'测试.jpg',mimeType:'image/jpeg',buffer:images[urls.length % images.length]}}});assert.equal(r.status(),201);urls.push((await r.json()).url);
  }
  const assets=(await api('/shop/media/images?size=24')).items;
  for(let i=0;i<urls.length;i++)await api('/shop/media/images/'+assets.find(x=>x.url===urls[i]).id+'/name','PATCH',{name:names[i]});
  product=await api('/shop/products','POST',{name:'周末好物展示',price:29,stock:10,imageUrl:urls[0],details:{category:'生活日用',images:[urls[0]]}});
  await context.addInitScript(token=>sessionStorage.setItem('mujian_token',token),seller);
  await page.goto(base+'/#merchant');
  await page.getByRole('button',{name:'图片素材',exact:true}).click();
  const library=page.getByRole('region',{name:'店铺图片素材库'});
  await library.locator('.media-card').first().waitFor();
  check('商家可以看到分页素材和引用标签',await library.locator('.media-card').count()===12);
  await page.screenshot({path:output+'desktop-library.png',fullPage:true});
  await library.getByRole('button',{name:'下一页',exact:true}).click();await library.getByText('日落主图',{exact:true}).waitFor();
  check('下一页显示最后一张且引用去重',await library.locator('.media-card').count()===1&&(await library.locator('.media-usage').innerText()).includes('1 件商品'));
  await library.getByRole('button',{name:'重命名',exact:true}).click();await library.getByLabel('新图片名称',{exact:true}).fill('奶油白商品主图');
  await library.getByRole('button',{name:'保存名称',exact:true}).click();await library.getByText('奶油白商品主图',{exact:true}).waitFor();
  check('中文重命名保存后显示',true);
  await library.getByLabel('搜索图片名称',{exact:true}).fill('奶油白');await page.waitForFunction(()=>document.querySelector('.media-result')?.textContent?.includes('共 1 张'));
  check('中文搜索可查到重命名图片',await library.locator('.media-card').count()===1);
  await library.getByRole('button',{name:'收起',exact:true}).click();await library.getByText('没有符合条件的图片',{exact:true}).waitFor();
  await library.getByRole('button',{name:'已收起',exact:true}).click();await library.getByText('奶油白商品主图',{exact:true}).waitFor();
  check('收起后可以在已收起列表找回',await library.locator('.media-card').count()===1);
  await library.getByRole('button',{name:'恢复',exact:true}).click();await library.getByText('没有符合条件的图片',{exact:true}).waitFor();
  await library.getByRole('button',{name:'常用素材',exact:true}).click();await library.getByText('奶油白商品主图',{exact:true}).waitFor();
  check('恢复回常用素材',true);
  await library.getByLabel('搜索图片名称',{exact:true}).fill('');await page.waitForFunction(()=>document.querySelectorAll('.media-card').length===12);
  for(const width of [390,320]) {await page.setViewportSize({width,height:844});check(width+'px素材库无横向溢出',await fits());await page.screenshot({path:output+'mobile-'+width+'-library.png',fullPage:true});}
  // Exercise actual API failure and retry without corrupting any persisted data.
  await page.route('**/api/shop/media/images?*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'素材暂时无法加载，请重试'})}));
  await library.getByRole('button',{name:'刷新素材',exact:true}).click();await library.getByRole('alert').waitFor();
  check('加载失败显示中文并提供重试',(await library.getByRole('alert').innerText()).includes('重试'));
  await page.unroute('**/api/shop/media/images?*');await library.getByRole('button',{name:'重试',exact:true}).click();await library.locator('.media-card').first().waitFor();
  check('重试恢复列表',await library.locator('.media-card').count()===12);
  await page.getByRole('button',{name:'商品管理',exact:true}).click();await page.getByRole('button',{name:'编辑',exact:true}).click();
  const form=page.getByRole('dialog',{name:'编辑商品',exact:true});
  const before=await form.getByLabel('商品图片链接（选填）',{exact:true}).inputValue();
  let dialog=await picker();await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  check('关闭选图保留草稿且父表单不关闭',await form.isVisible()&&await form.getByLabel('商品图片链接（选填）',{exact:true}).inputValue()===before);
  for(const width of [390,320]) {await page.setViewportSize({width,height:844});dialog=await picker();check(width+'px选图弹窗无横向溢出',await fits());await page.screenshot({path:output+'mobile-'+width+'-picker.png',fullPage:true});await dialog.getByRole('button',{name:'关闭素材选择',exact:true}).click();}
  dialog=await picker();await dialog.getByRole('button',{name:'选择图片：山间晨光',exact:true}).click();await dialog.waitFor({state:'hidden'});
  check('选择素材回填表单',await form.getByLabel('商品图片链接（选填）',{exact:true}).inputValue()===urls[1]);
  check('选图不自动保存商品',(await api('/mall/products/'+product.id)).imageUrl===urls[0]);
  await form.getByRole('button',{name:'保存商品',exact:true}).click();await form.waitFor({state:'hidden'});
  check('明确保存后才更新商品',(await api('/mall/products/'+product.id)).imageUrl===urls[1]);
  await page.getByRole('button',{name:'编辑',exact:true}).click();
  check('重开表单保留所选图片',await form.getByLabel('商品图片链接（选填）',{exact:true}).inputValue()===urls[1]);
  check('浏览器没有脚本异常',errors.length===0);
} finally {
  if(product?.id)await api('/shop/products/'+product.id+'/status','PUT',{onSale:false});
  await browser.close();
}
console.log(`${count} 项素材库浏览器检查通过`);
