// Isolated merchant fixtures; uploads and cancelled order history are retained.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
const base=new URL(process.env.APP_URL || 'http://127.0.0.1:8080');
assert.ok(['localhost','127.0.0.1','[::1]'].includes(base.hostname)||process.argv.includes('--test-environment'),'远端写入验收需要 --test-environment');
const suffix=randomBytes(5).toString('hex'), jpg=await readFile(new URL('../frontend/public/media/sunset.jpg',import.meta.url));
let seller,buyer,other,product,order,passed=0;
const check=(text,ok)=>{assert.ok(ok,text);console.log(`PASS ${++passed}: ${text}`);};
async function req(path,method='GET',body,token) {
  const r=await fetch(new URL('/api'+path,base),{method,signal:AbortSignal.timeout(30000),headers:{...(body instanceof FormData?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});
  return {status:r.status,data:await r.json()};
}
async function user(label) {const r=await req('/auth/register','POST',{username:'传图'+label+suffix,password:randomBytes(20).toString('hex'),nickname:'虚拟图片验收'+label});assert.equal(r.status,201);return r.data.token;}
async function upload(token,bytes=jpg,type='image/jpeg',filename='商品.jpg') {const body=new FormData();body.append('file',new Blob([bytes],{type}),filename);return req('/shop/media/images','POST',body,token);}
async function bytes(url) {const r=await fetch(new URL(url,base));assert.equal(r.status,200);return {type:r.headers.get('content-type'),data:Buffer.from(await r.arrayBuffer())};}
const variants=async()=> (await req(`/shop/products/${product.id}/variants`,'GET',undefined,seller)).data;
const saveVariants=async config=>req(`/shop/products/${product.id}/variants`,'PUT',config,seller);
try {
  seller=await user('店主');buyer=await user('买家');other=await user('他店');
  check('游客上传被拒绝',(await upload(undefined)).status===401);
  const noShop=await upload(buyer);check('未开店用户收到中文提示',noShop.status===403&&noShop.data.message.includes('开通店铺'));
  assert.equal((await req('/shop/register','POST',{name:'虚拟图片店'+suffix},seller)).status,201);
  assert.equal((await req('/shop/register','POST',{name:'他店图片店'+suffix},other)).status,201);
  const invalid=[['空文件',Buffer.alloc(0)],['伪装JPEG',Buffer.from('<html>not an image</html>')],['SVG',Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],['截断JPEG',jpg.subarray(0,30)],['超5MB',Buffer.alloc(5_000_001,1)]];
  for (const [name,file] of invalid) {const r=await upload(seller,file);check(name+'被中文拒绝',[400,413].includes(r.status)&&/[\u4e00-\u9fff]/.test(r.data.message));}
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF9kAAAAASUVORK5CYII=','base64');
  const large=Buffer.from(png);large.writeUInt32BE(20000,16);large.writeUInt32BE(20000,20);
  const tooWide=await upload(seller,large,'image/png');check('超大像素图片在解码前拒绝',tooWide.status===400);
  const first=await upload(seller,jpg,'application/octet-stream','../../unsafe.html');
  check('按真实内容读取并生成独立JPEG地址',first.status===201&&/^\/uploads\/shop\/[0-9a-f-]{36}\.jpg$/.test(first.data.url));
  check('输出最大边不超过1024且大小有效',first.data.width<=1024&&first.data.height<=1024&&first.data.bytes>0);
  const publicImage=await bytes(first.data.url), hash=createHash('sha256').update(publicImage.data).digest('hex');
  check('游客可加载规范化图片',publicImage.type.includes('image/jpeg')&&publicImage.data[0]===255&&publicImage.data[1]===216);
  const second=await upload(seller,png,'image/png');check('PNG可以上传并转为JPEG',second.status===201&&second.data.width===1&&second.data.height===1);
  check('连续上传不覆盖原文件',first.data.url!==second.data.url&&createHash('sha256').update((await bytes(first.data.url)).data).digest('hex')===hash);
  const foreign=(await upload(other)).data.url;
  const input={name:'图片上传验收商品'+suffix,imageUrl:first.data.url,price:29,stock:10,details:{category:'生活日用',images:[first.data.url,second.data.url]}};
  const created=await req('/shop/products','POST',input,seller);product=created.data;
  check('本店图片用于主图与相册',created.status===201&&product.imageUrl===first.data.url&&JSON.parse(product.imagesJson).length===2);
  for (const url of [foreign,'/uploads/shop/00000000-0000-0000-0000-000000000000.jpg','/uploads/old-avatar.jpg','/uploads/shop/../secret.jpg']) {
    const r=await req('/shop/products/'+product.id,'PATCH',{...input,imageUrl:url,version:product.version},seller);
    check('他店或无效本地图片不能绑定',r.status===400&&/[\u4e00-\u9fff]/.test(r.data.message));
  }
  const badAlbum=await req('/shop/products/'+product.id,'PATCH',{...input,name:'不应保存',version:product.version,details:{category:'生活日用',images:[foreign]}},seller);
  check('相册越权使商品编辑整笔回滚',badAlbum.status===400&&(await req('/mall/products/'+product.id)).data.name===input.name);
  let config=await saveVariants({version:product.version,items:[{name:'上传图款',price:29,stock:10,onSale:true,imageUrl:first.data.url}]});
  check('规格保存本店上传图',config.status===200&&config.data.items[0].imageUrl===first.data.url);
  let state=config.data;const sku=state.items[0];
  const invalidSku=await saveVariants({version:state.version,items:[{...sku,onSale:true,imageUrl:foreign}]});
  check('规格不能使用他店上传图且版本回滚',invalidSku.status===400&&(await variants()).version===state.version);
  await req('/me/cart/'+product.id,'POST',{skuId:sku.id,quantity:1},buyer);
  check('购物车显示上传的规格图',(await req('/me/cart','GET',undefined,buyer)).data[0].imageUrl===first.data.url);
  const purchase=await req('/products/'+product.id+'/buy','POST',{skuId:sku.id,expectedPrice:29,quantity:1,recipient:'虚拟测试',phone:'00000000000',address:'虚拟测试省测试市不可配送路',requestKey:randomBytes(16).toString('hex')},buyer);
  order=purchase.data.orderNo;check('订单保存上传图片地址',purchase.status===201&&purchase.data.imageUrl===first.data.url);
  state=await variants();assert.equal((await saveVariants({version:state.version,items:[{...state.items[0],onSale:true,imageUrl:second.data.url}]})).status,200);
  check('换图后订单原图仍可读取',(await req('/me/orders/'+order,'GET',undefined,buyer)).data.imageUrl===first.data.url&&createHash('sha256').update((await bytes(first.data.url)).data).digest('hex')===hash);
  state=await variants();const matrix={version:state.version,groups:[{name:'款式',values:[{value:'图片款'}]}],variants:[{...state.items[0],onSale:true,valueIds:[-1],imageUrl:second.data.url}]};
  const savedMatrix=await req(`/shop/products/${product.id}/attributes`,'PUT',matrix,seller);
  check('属性矩阵支持上传图片',savedMatrix.status===200&&savedMatrix.data.variants[0].imageUrl===second.data.url);
  const invalidMatrix=await req(`/shop/products/${product.id}/attributes`,'PUT',{...savedMatrix.data,variants:savedMatrix.data.variants.map(v=>({...v,onSale:true,imageUrl:foreign}))},seller);
  check('属性矩阵拒绝他店上传图',invalidMatrix.status===400);
  // Two prior uploads belong to this isolated seller. Exercise the actual
  // persistent limit and race on the final available slot with tiny fixtures.
  for(let i=0;i<57;i++)assert.equal((await upload(seller,png,'image/png')).status,201);
  const race=await Promise.all([upload(seller,png,'image/png'),upload(seller,png,'image/png'),upload(seller,png,'image/png')]);
  check('并发争抢最后上传额度只有一张成功',race.filter(r=>r.status===201).length===1&&race.filter(r=>r.status===429).length===2);
  check('达到每小时额度后返回中文提示',race.filter(r=>r.status===429).every(r=>r.data.message.includes('上传较频繁')));
  check('本店额度不影响其他店铺',(await upload(other,png,'image/png')).status===201);
} finally {
  if(order)assert.equal((await req('/me/orders/'+order+'/cancel','POST',undefined,buyer)).status,200);
  if(product?.id) {
    const cart=await req('/me/cart','GET',undefined,buyer);
    for(const item of cart.data||[])if(item.id===product.id)assert.equal((await req('/me/cart/'+product.id+(item.skuId?'?skuId='+item.skuId:''),'DELETE',undefined,buyer)).status,200);
    assert.equal((await req('/shop/products/'+product.id+'/status','PUT',{onSale:false},seller)).status,200);
  }
  console.log('收尾：取消测试订单、清空购物车、下架商品；保留独立测试账号及上传图以核查历史订单。');
}
console.log(`${passed} 项商品上传检查通过：${base.origin}`);
