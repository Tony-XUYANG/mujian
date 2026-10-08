// Dedicated virtual shops; no existing seller data is changed.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
const base=new URL(process.env.APP_URL || 'http://127.0.0.1:8080');
assert.ok(['localhost','127.0.0.1','[::1]'].includes(base.hostname)||process.argv.includes('--test-environment'),'远端写入验收需要 --test-environment');
const suffix=randomBytes(5).toString('hex');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF9kAAAAASUVORK5CYII=','base64');
let seller,other,buyer,order,product,secondProduct,passed=0;
const check=(name,ok)=>{assert.ok(ok,name);console.log(`PASS ${++passed}: ${name}`);};
async function req(path,method='GET',body,token=seller) {
  const r=await fetch(new URL('/api'+path,base),{method,signal:AbortSignal.timeout(30000),headers:{...(body instanceof FormData?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});
  return {status:r.status,data:await r.json()};
}
async function user(label) {const r=await req('/auth/register','POST',{username:'图库'+label+suffix,password:randomBytes(20).toString('hex'),nickname:'素材验收'+label},null);assert.equal(r.status,201);return r.data.token;}
async function list(query='',token=seller) {const r=await req('/shop/media/images'+query,'GET',undefined,token);assert.equal(r.status,200,JSON.stringify(r.data));return r.data;}
async function upload(token=seller) {const body=new FormData();body.append('file',new Blob([png],{type:'image/png'}),'测试.png');const r=await req('/shop/media/images','POST',body,token);assert.equal(r.status,201);return r.data.url;}
async function hash(url) {const r=await fetch(new URL(url,base));assert.equal(r.status,200);return createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex');}
const rename=(id,name,token=seller)=>req(`/shop/media/images/${id}/name`,'PATCH',{name},token);
const archive=(id,archived,token=seller)=>req(`/shop/media/images/${id}/archive`,'PUT',{archived},token);
async function editProduct(input) {const old=(await req('/mall/products/'+product.id)).data;const r=await req('/shop/products/'+product.id,'PATCH',{...old,...input,version:old.version});assert.equal(r.status,200,JSON.stringify(r.data));product=r.data;}
try {
  seller=await user('店主');other=await user('他店');buyer=await user('买家');
  check('游客不能浏览素材库',(await req('/shop/media/images','GET',undefined,null)).status===401);
  const denied=await req('/shop/media/images');check('未开店用户收到中文提示',denied.status===403&&denied.data.message.includes('开通店铺'));
  for(const [token,name] of [[seller,'素材验收店'],[other,'隔离验收店']])assert.equal((await req('/shop/register','POST',{name:name+suffix},token)).status,201);
  const empty=await list();check('新店空素材库与额度正确',empty.items.length===0&&empty.total===0&&empty.page===0&&empty.pages===0&&empty.stats.retained===0);
  const urls=[];for(let i=0;i<14;i++)urls.push(await upload());
  const firstPage=await list(), secondPage=await list('?page=1');
  check('分页稳定且没有重复图片',firstPage.total===14&&firstPage.items.length===12&&secondPage.items.length===2&&new Set([...firstPage.items,...secondPage.items].map(x=>x.id)).size===14);
  check('超出末页自动回到有效页',(await list('?page=999')).page===1);
  check('无元数据的旧格式图片自动显示默认名',firstPage.items.every(x=>x.name==='商品图片 #'+x.id));
  const all=(await list('?size=24')).items;
  const a=all.find(x=>x.url===urls[0]), b=all.find(x=>x.url===urls[1]), c=all.find(x=>x.url===urls[2]);
  const initialHash=await hash(a.url);
  check('上传统计含全部文件和最近一小时',firstPage.stats.retained===14&&firstPage.stats.hourlyUploads===14&&firstPage.stats.bytes>0);
  await upload(other);check('店铺素材隔离',(await list('',other)).total===1&&!((await list('',other)).items.some(x=>x.id===a.id)));
  check('不能重命名他店图片',(await rename(a.id,'越权名称',other)).status===404);
  check('不能收起他店图片',(await archive(a.id,true,other)).status===404);
  check('未知图片返回404',(await rename(9223372036854,'不存在')).status===404);
  for(const name of ['', ' '.repeat(8), '字'.repeat(81),'非法\n名称','非法\u0000名称'])check('无效名称被中文拒绝',(await rename(a.id,name)).status===400);
  check('中文名称可保存并去首尾空白',(await rename(a.id,'  奶油白主图  ')).data.name==='奶油白主图');
  const found=await list('?q='+encodeURIComponent('奶油白'));check('中文搜索按名称命中',found.total===1&&found.items[0].id===a.id);
  await rename(b.id,'百分%_图');check('搜索通配字符按文字处理',(await list('?q='+encodeURIComponent('%_'))).total===1);
  for(const query of ['?page=-1','?size=0','?size=25','?usage=invalid','?q='+'a'.repeat(81)])check('错误筛选分页返回400',(await req('/shop/media/images'+query)).status===400);
  const input={name:'素材引用商品'+suffix,imageUrl:a.url,price:29,stock:10,details:{category:'生活日用',images:[a.url,b.url]}};
  const create=await req('/shop/products','POST',input);assert.equal(create.status,201);product=create.data;
  let variants=await req(`/shop/products/${product.id}/variants`,'PUT',{version:product.version,items:[{name:'主图款',price:29,stock:10,onSale:true,imageUrl:a.url},{name:'停售款',price:29,stock:0,onSale:false,imageUrl:c.url}]});assert.equal(variants.status,200);
  let referenced=(await list('?usage=products&size=24')).items;
  check('主图相册规格重复引用只算一件商品',referenced.find(x=>x.id===a.id).productCount===1);
  check('相册专用图与停售规格图也统计',referenced.find(x=>x.id===b.id).productCount===1&&referenced.find(x=>x.id===c.id).productCount===1);
  const another=await req('/shop/products','POST',{...input,name:'复用商品'+suffix,details:{category:'生活日用',images:[]}});assert.equal(another.status,201);secondProduct=another.data;
  check('跨商品复用按商品数计算',(await list('?q='+encodeURIComponent('奶油白'))).items[0].productCount===2);
  assert.equal((await req('/shop/products/'+secondProduct.id+'/status','PUT',{onSale:false})).status,200);
  check('下架商品仍保留引用',(await list('?q='+encodeURIComponent('奶油白'))).items[0].productCount===2);
  const buy=await req('/products/'+product.id+'/buy','POST',{skuId:variants.data.items.find(x=>x.name==='主图款').id,expectedPrice:29,quantity:1,recipient:'虚拟测试',phone:'00000000000',address:'虚拟省测试市不可配送路',requestKey:randomBytes(16).toString('hex')},buyer);assert.equal(buy.status,201);order=buy.data.orderNo;
  const withOrder=(await list('?usage=orders')).items;
  check('订单引用可筛选且只返回数量',withOrder.length===1&&withOrder[0].id===a.id&&withOrder[0].orderCount===1&&!JSON.stringify(withOrder).includes(order)&&!JSON.stringify(withOrder).includes('recipient'));
  assert.equal((await req('/me/orders/'+order+'/cancel','POST',undefined,buyer)).status,200);order=null;
  check('已取消订单也计入留存',(await list('?usage=orders')).items[0].orderCount===1);
  await editProduct({imageUrl:b.url,details:{category:'生活日用',images:[b.url]}});
  variants=await req(`/shop/products/${product.id}/variants`);
  assert.equal((await req(`/shop/products/${product.id}/variants`,'PUT',{version:variants.data.version,items:variants.data.items.map(x=>({...x,onSale:Boolean(x.onSale),imageUrl:b.url}))})).status,200);
  const oldSecond=(await req('/shop/me')).data.products.find(x=>x.id===secondProduct.id);
  assert.equal((await req('/shop/products/'+secondProduct.id,'PATCH',{...oldSecond,imageUrl:b.url,details:{category:'生活日用',images:[]}})).status,200);
  const orderOnly=(await list('?usage=orders')).items[0];check('换图后保留仅订单引用',orderOnly.id===a.id&&orderOnly.productCount===0&&orderOnly.orderCount===1);
  check('未引用筛选排除商品和订单留存',(await list('?usage=unused&size=24')).total===12);
  check('缺少收起参数拒绝',(await req(`/shop/media/images/${a.id}/archive`,'PUT',{})).status===400);
  check('收起成功且重复收起幂等',(await archive(a.id,true)).status===200&&(await archive(a.id,true)).status===200);
  check('收起素材从选择列表隐藏',(await list()).total===13&&(await list('?archived=true')).items[0].id===a.id);
  const stats=(await list()).stats;check('收起不减少占用或重置上传额度',stats.retained===14&&stats.hourlyUploads===14&&stats.bytes===firstPage.stats.bytes);
  check('收起后历史图片文件保持不变',await hash(a.url)===initialHash);
  await editProduct({imageUrl:a.url,details:{category:'生活日用',images:[]}});check('收起不破坏已有草稿的保存',product.imageUrl===a.url);
  check('恢复后可再次选择',(await archive(a.id,false)).status===200&&(await list()).total===14);
  const concurrent=await Promise.all([rename(c.id,'并发名称'),archive(c.id,true)]);check('重命名和收起并发均成功',concurrent.every(r=>r.status===200));
  const concurrentItem=(await list('?archived=true')).items.find(x=>x.id===c.id);check('并发修改不会覆盖另一字段',concurrentItem.name==='并发名称'&&Boolean(concurrentItem.archived));
  await archive(c.id,false);
} finally {
  if(order)await req('/me/orders/'+order+'/cancel','POST',undefined,buyer);
  for(const item of [product,secondProduct])if(item?.id)assert.equal((await req('/shop/products/'+item.id+'/status','PUT',{onSale:false})).status,200);
  console.log('收尾：独立测试商品已下架；保留图片和已取消订单以复核引用。');
}
console.log(`${passed} 项素材库检查通过：${base.origin}`);
