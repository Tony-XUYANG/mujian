// Creates isolated virtual fixtures; public servers require an explicit test flag.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
const base = new URL(process.env.APP_URL || 'http://127.0.0.1:8080');
assert.ok(['localhost','127.0.0.1','[::1]'].includes(base.hostname) || process.argv.includes('--test-environment'), '公网写入验收需要 --test-environment');
const suffix=randomBytes(5).toString('hex'), pending=new Set();
let seller,buyer,product,address,passed=0;
const white='/media/shop-cup.svg', blue='/media/shop-cup-blue.svg', black='/media/shop-cup-black.svg';
const check=(label,ok)=>{assert.ok(ok,label);console.log(`PASS ${++passed}: ${label}`);};
async function req(path,method='GET',body,token) {
  const r=await fetch(new URL('/api'+path,base),{method,signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,data:await r.json()};
}
async function user(label) {
  const r=await req('/auth/register','POST',{username:'配图'+label+suffix,nickname:'配图虚拟验收'+label,password:randomBytes(20).toString('hex')});
  assert.equal(r.status,201);return r.data.token;
}
const read=async()=> (await req(`/shop/products/${product.id}/variants`,'GET',undefined,seller)).data;
async function save(items,version,token=seller) {return req(`/shop/products/${product.id}/variants`,'PUT',{version,items},token);}
const pictureless=v=>{const {imageUrl,...rest}=v;return {...rest,onSale:Boolean(v.onSale)};};
try {
  seller=await user('店主');buyer=await user('买家');
  assert.equal((await req('/shop/register','POST',{name:'规格配图验收店'+suffix},seller)).status,201);
  const created=await req('/shop/products','POST',{name:'规格配图验收杯'+suffix,imageUrl:white,price:49,stock:20},seller);
  assert.equal(created.status,201);product=created.data;
  let saved=await save([{name:'奶油白',price:49,stock:5,onSale:true,imageUrl:white},{name:'雾蓝',price:59,stock:8,onSale:true,imageUrl:'  '+blue+'  '},{name:'无配图',price:39,stock:7,onSale:true}],product.version);
  check('独立规格图片可保存并去除首尾空白',saved.status===200 && saved.data.items[1].imageUrl===blue);
  let config=saved.data;const [w,b,fallback]=config.items;
  check('未配图的旧规格返回空值',fallback.imageUrl===null);
  const detail=await req('/mall/products/'+product.id);
  check('公开详情含配图，商品主图不变',detail.data.imageUrl===white && detail.data.variants[1].imageUrl===blue);
  check('他人不能修改图片',(await save(config.items,config.version,buyer)).status===404);
  for(const bad of ['javascript:alert(1)','data:image/svg+xml,test','/media/../secret','https://user:pass@example.com/p.png','x'.repeat(1001)]) {
    const r=await save(config.items.map(v=>({...v,onSale:Boolean(v.onSale),imageUrl:bad})),config.version);
    check('非法规格图片被中文校验拒绝：'+bad.slice(0,22),r.status===400 && /[\u4e00-\u9fff]/.test(r.data.message));
  }
  check('失败保存不改变图片和版本',JSON.stringify(await read())===JSON.stringify(config));
  saved=await save(config.items.map(pictureless),config.version);
  check('旧客户端省略图片字段会保留现有图片',saved.status===200 && saved.data.items[1].imageUrl===blue);
  config=saved.data;
  const cart=await req('/me/cart/'+product.id,'POST',{quantity:1,skuId:b.id},buyer);
  check('购物车直接显示所选规格图片',cart.status===200 && (await req('/me/cart','GET',undefined,buyer)).data[0].imageUrl===blue);
  const payload={skuId:b.id,expectedPrice:59,quantity:1,recipient:'虚拟配图验收',phone:'00000000000',address:'虚拟测试省测试市不可配送路1号',requestKey:randomBytes(16).toString('hex')};
  const purchase=await req('/products/'+product.id+'/buy','POST',payload,buyer);
  if(purchase.data.orderNo)pending.add(purchase.data.orderNo);
  check('立即购买保存规格图片快照',purchase.status===201 && purchase.data.imageUrl===blue);
  config=await read();
  saved=await save(config.items.map(v=>({...v,onSale:Boolean(v.onSale),imageUrl:v.id===b.id?black:v.imageUrl})),config.version);
  assert.equal(saved.status,200);
  check('换图后购物车显示新图片',(await req('/me/cart','GET',undefined,buyer)).data[0].imageUrl===black);
  check('换图不影响既有订单图片',(await req('/me/orders/'+purchase.data.orderNo,'GET',undefined,buyer)).data.imageUrl===blue);
  const repeat=await req('/products/'+product.id+'/buy','POST',payload,buyer);
  check('重试保留同一订单和原图片',repeat.data.orderNo===purchase.data.orderNo && repeat.data.imageUrl===blue);
  address=(await req('/me/addresses','POST',{recipient:'虚拟配图验收',phone:'00000000000',region:'虚拟测试省测试市',detail:'不可配送测试路1号',label:'其他',isDefault:true},buyer)).data;
  const checkout=await req('/me/cart/checkout','POST',{addressId:address.id,requestKey:randomBytes(16).toString('hex'),items:[{productId:product.id,skuId:b.id,quantity:1,expectedPrice:59}]},buyer);
  for(const o of checkout.data.orders||[])pending.add(o.orderNo);
  check('购物车结算保存当前选款图片',checkout.status===201 && checkout.data.orders[0].imageUrl===black);
  config=await read();
  saved=await save(config.items.map(v=>({...v,onSale:Boolean(v.onSale),imageUrl:v.id===b.id?'':v.imageUrl})),config.version);
  check('显式清空配图恢复商品主图',saved.status===200 && saved.data.items.find(v=>v.id===b.id).imageUrl===null);
  await req('/me/cart/'+product.id,'POST',{quantity:1,skuId:b.id},buyer);
  check('清空配图后购物车回退主图',(await req('/me/cart','GET',undefined,buyer)).data[0].imageUrl===white);
  check('清空配图不改变订单快照',(await req('/me/orders/'+checkout.data.orders[0].orderNo,'GET',undefined,buyer)).data.imageUrl===black);
  for(const no of pending)assert.equal((await req('/me/orders/'+no+'/cancel','POST',undefined,buyer)).data.status,'CANCELLED');
  pending.clear();
  check('改图清图及取消后规格库存正确',(await read()).items.find(v=>v.id===b.id).stock===8);
  config=await read();
  const groups=[{name:'款式',values:[{value:'白色组合'},{value:'蓝色组合'},{value:'原色组合'}]}];
  let matrix=await req(`/shop/products/${product.id}/attributes`,'PUT',{version:config.version,groups,variants:config.items.map((v,i)=>({...pictureless(v),valueIds:[-(i+1)],imageUrl:[white,blue,''][i]}))},seller);
  check('属性矩阵可为组合配置不同图片',matrix.status===200 && matrix.data.variants[1].imageUrl===blue);
  const invalid=await req(`/shop/products/${product.id}/attributes`,'PUT',{...matrix.data,variants:matrix.data.variants.map(v=>({...v,onSale:Boolean(v.onSale),imageUrl:'file:///secret'}))},seller);
  check('矩阵非法图片导致整笔回滚',invalid.status===400 && JSON.stringify((await req(`/shop/products/${product.id}/attributes`,'GET',undefined,seller)).data)===JSON.stringify(matrix.data));
  matrix=await req(`/shop/products/${product.id}/attributes`,'PUT',{...matrix.data,variants:matrix.data.variants.map(pictureless)},seller);
  check('矩阵旧客户端重保存不丢失图片',matrix.status===200 && matrix.data.variants[1].imageUrl===blue);
  const html=await (await fetch(base)).text();check('页面资源可读取',html.includes('幕间'));
  for(const asset of [white,blue,black]){const r=await fetch(new URL(asset,base));check('演示配图资源可用：'+asset,r.ok && (r.headers.get('content-type')||'').includes('image/'));await r.body?.cancel();}
} finally {
  const errors=[];
  const clean=async(path,method,body,token)=>{try{const r=await req(path,method,body,token);if(r.status!==200)errors.push(path+':'+r.status);}catch(e){errors.push(e.message);}};
  for(const no of pending)await clean('/me/orders/'+no+'/cancel','POST',undefined,buyer);
  if(product && buyer) {
    const cart=await req('/me/cart','GET',undefined,buyer);
    for(const item of cart.data||[])if(item.id===product.id)await clean('/me/cart/'+product.id+(item.skuId?'?skuId='+item.skuId:''),'DELETE',undefined,buyer);
  }
  if(address?.id)await clean('/me/addresses/'+address.id,'DELETE',undefined,buyer);
  if(product?.id)await clean('/shop/products/'+product.id+'/status','PUT',{onSale:false},seller);
  assert.equal(errors.length,0,'测试收尾失败：'+errors.join('; '));
  console.log('收尾：虚拟待付款单取消、购物车和地址清空、独立商品下架；账号与历史订单保留。');
}
console.log(`${passed} 项规格图片检查通过：${base.origin}`);
