import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = (process.env.APP_URL || "http://127.0.0.1:8080") + "/api";
let count=0, seller, buyer, other, p, legacy;
const pending = new Map();
function check(name,ok){ assert.ok(ok,name); console.log("PASS "+ ++count+": "+name); }
async function req(path,method="GET",data,token){ const r=await fetch(base+path,{method,headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,data:await r.json()}; }
async function user(label){const r=await req("/auth/register","POST",{username:"规格"+label+Date.now().toString(36),nickname:label,password:"Shopping123!"});assert.equal(r.status,201);return r.data.token;}
const variant = (name,price,stock,onSale=true) => ({name,price,stock,onSale});
const buyInput = (skuId,expectedPrice=29.9) => ({quantity:1,recipient:"虚拟体验人",phone:"13800000000",address:"演示路100号虚拟地址",requestKey:randomUUID(),expectedPrice,skuId});
async function buy(product,input,token=buyer){const r=await req("/products/"+product+"/buy","POST",input,token);if(r.status===201)pending.set(r.data.orderNo,token);return r;}
async function cancel(no){await req("/me/orders/"+no+"/cancel","POST",undefined,pending.get(no));pending.delete(no);}
async function config(){return (await req("/shop/products/"+p.id+"/variants","GET",undefined,seller)).data;}
async function save(items,version){return req("/shop/products/"+p.id+"/variants","PUT",{version,items},seller);}
try{
 seller=await user("店主");buyer=await user("买家");other=await user("其他");
 await req("/shop/register","POST",{name:"多规格验收店"},seller);
 p=(await req("/shop/products","POST",{name:"款式体验杯",price:29.9,stock:10,imageUrl:"/media/shop-cup.svg"},seller)).data;
 legacy=(await req("/shop/products","POST",{name:"旧款单规格",price:19.9,stock:8},seller)).data;
 const endpoint="/shop/products/"+p.id+"/variants";
 check("游客不能读取商家规格",(await req(endpoint)).status===401);
 check("他人不能读取规格配置",(await req(endpoint,"GET",undefined,other)).status===404);
 check("他人不能编辑规格配置",(await req(endpoint,"PUT",{version:0,items:[variant("白色",29.9,2)]},other)).status===404);
 await req("/me/cart/"+p.id,"POST",{quantity:1},buyer);
 const old=await buy(p.id,buyInput());
 check("未付款旧订单阻止转多规格",(await save([variant("白色",29.9,3)],old.status===201?(await config()).version:0)).status===409);
 await cancel(old.data.orderNo);
 let c=await config();
 check("拒绝重复规格名称",(await save([variant("白色",29.9,2),variant(" 白色 ",39.9,3)],c.version)).status===400);
 check("拒绝非法库存价格",(await save([variant("白色",0,-1)],c.version)).status===400);
 check("拒绝超过20种规格",(await save(Array.from({length:21},(_,i)=>variant("规格"+i,29.9,1)),c.version)).status===400);
 check("拒绝规格总库存超限",(await save([variant("白色",29.9,999999),variant("黑色",39.9,1)],c.version)).status===400);
 const saved=await save([variant("奶油白 / 350毫升",29.9,3),variant("雾蓝 / 500毫升",39.9,4),variant("曜石黑 / 500毫升",49.9,0)],c.version);
 check("商家配置规格",saved.status===200 && saved.data.items.length===3);
 let [white,blue,black]=saved.data.items;
 let detail=(await req("/mall/products/"+p.id)).data;
 check("公开详情返回规格和汇总价库存",detail.hasVariants && detail.variants.length===3 && detail.price===29.9 && detail.stock===7);
 check("旧购物车保留但不能按默认款结算",!(await req("/me/cart","GET",undefined,buyer)).data.find(v=>v.id===p.id).available);
 check("旧商品编辑不可覆盖规格库存",(await req("/shop/products/"+p.id,"PATCH",{name:p.name,price:1,stock:999,version:detail.version},seller)).status===409);
 check("多规格购买必须选规格",(await buy(p.id,buyInput())).status===409);
 check("不能使用其他商品规格",(await buy(legacy.id,buyInput(white.id,19.9))).status===409);
 check("不存在的规格被拒绝",(await buy(p.id,buyInput(99999999))).status===409);
 check("售罄规格不可购买",(await buy(p.id,buyInput(black.id,49.9))).status===409);
 const unpriced=buyInput(white.id);delete unpriced.expectedPrice;
 check("必须确认规格价格",(await buy(p.id,unpriced)).status===409);
 check("规格价格变化拒绝",(await buy(p.id,buyInput(blue.id,29.9))).status===409);
 const purchase=buyInput(white.id);
 const concurrent=await Promise.all(Array.from({length:5},()=>buy(p.id,purchase)));
 check("相同规格重复下单只扣一次",concurrent.every(r=>r.status===201)&&new Set(concurrent.map(r=>r.data.orderNo)).size===1&&(await config()).items[0].stock===2);
 check("相同请求标识不能替换规格",(await buy(p.id,{...purchase,skuId:blue.id,expectedPrice:39.9})).status===409);
 check("订单保存规格快照",concurrent[0].data.skuId===white.id&&concurrent[0].data.variantName===white.name&&concurrent[0].data.unitPrice===29.9);
 check("旧规格表单不能覆盖已扣库存",(await save(saved.data.items,saved.data.version)).status===409);
 c=await config();
 const changed=c.items.map(v=>v.id===white.id?{...v,name:"米白 / 350毫升",price:31.9,onSale:false}:v);
 check("规格可以改名改价停售",(await save(changed,c.version)).status===200);
 check("历史订单不随改名改价变化",(await req("/me/orders/"+concurrent[0].data.orderNo,"GET",undefined,buyer)).data.variantName===white.name);
 check("停售规格不可再加购",(await req("/me/cart/"+p.id,"POST",{quantity:1,skuId:white.id},buyer)).status===409);
 await cancel(concurrent[0].data.orderNo);
 await req("/me/orders/"+concurrent[0].data.orderNo+"/cancel","POST",undefined,buyer);
 c=await config();
 check("取消仅返原规格且重复取消不多返",c.items[0].stock===3&&c.items[1].stock===4);
 detail=(await req("/mall/products/"+p.id)).data;
 check("停售规格不计入在售库存与起价",detail.stock===4&&detail.price===39.9);
 check("已有规格不能物理删除",(await save(c.items.slice(1),c.version)).status===400);
 const resumed=await save(c.items.map(v=>({...v,onSale:true})),c.version);
 [white,blue,black]=resumed.data.items;
 await req("/me/cart/"+p.id,"DELETE",undefined,buyer);
 await req("/me/cart/"+p.id,"POST",{quantity:1,skuId:white.id},buyer);
 await req("/me/cart/"+p.id,"POST",{quantity:2,skuId:blue.id},buyer);
 let cart=(await req("/me/cart","GET",undefined,buyer)).data;
 check("同商品两规格购物车独立",cart.length===2&&new Set(cart.map(v=>v.skuId)).size===2&&cart.find(v=>v.skuId===blue.id).price===39.9);
 check("他人不能修改规格购物车",(await req("/me/cart/"+p.id,"PUT",{quantity:1,skuId:white.id},other)).status===404);
 await req("/me/cart/"+p.id,"PUT",{quantity:2,skuId:white.id},buyer);
 check("修改单规格不影响另一款",(await req("/me/cart","GET",undefined,buyer)).data.every(v=>v.quantity===2));
 await req("/me/cart/"+p.id+"?skuId="+white.id,"DELETE",undefined,buyer);
 check("移除只影响所选规格",(await req("/me/cart","GET",undefined,buyer)).data.length===1);
 await req("/me/cart/"+p.id,"POST",{quantity:1,skuId:white.id},buyer);
 const address=(await req("/me/addresses","POST",{recipient:"虚拟体验人",phone:"13800000000",region:"演示省市",detail:"演示路100号",label:"家",isDefault:true},buyer)).data;
 const batch={addressId:address.id,requestKey:randomUUID(),items:[{productId:p.id,skuId:white.id,quantity:1,expectedPrice:31.9},{productId:p.id,skuId:blue.id,quantity:2,expectedPrice:39.9}]};
 check("同一规格重复结算拒绝",(await req("/me/cart/checkout","POST",{...batch,items:[batch.items[0],batch.items[0]]},buyer)).status===409);
 const wrong=await req("/me/cart/checkout","POST",{...batch,items:[batch.items[0],{...batch.items[1],expectedPrice:1}]},buyer);
 check("一款价格错误整批回滚",wrong.status===409&&(await config()).items[0].stock===3&&(await req("/me/cart","GET",undefined,buyer)).data.length===2);
 c=await config();await save(c.items.map(v=>v.id===blue.id?{...v,stock:0}:v),c.version);
 check("一款缺货整批回滚",(await req("/me/cart/checkout","POST",batch,buyer)).status===409&&(await config()).items[0].stock===3);
 c=await config();await save(c.items.map(v=>v.id===blue.id?{...v,stock:4}:v),c.version);
 const result=await req("/me/cart/checkout","POST",batch,buyer);
 for(const o of result.data.orders||[])pending.set(o.orderNo,buyer);
 check("同商品不同规格一起结算",result.status===201&&result.data.orders.length===2&&Math.abs(result.data.totalAmount-111.7)<0.001);
 check("订单分别保存规格库存正确扣减",new Set(result.data.orders.map(o=>o.skuId)).size===2&&(await config()).items.slice(0,2).every(v=>v.stock===2));
 const repeated=await req("/me/cart/checkout","POST",batch,buyer);
 check("多规格整批重试幂等",repeated.data.batchId===result.data.batchId&&(await config()).items[0].stock===2);
 check("幂等内容包含规格编号",(await req("/me/cart/checkout","POST",{...batch,items:[{...batch.items[0],skuId:blue.id}]},buyer)).status===409);
 check("结算只删除已选规格购物车",(await req("/me/cart","GET",undefined,buyer)).data.length===0);
 for(const o of result.data.orders) await cancel(o.orderNo);
 const race=await Promise.all(Array.from({length:6},(_,i)=>buy(p.id,buyInput(white.id,31.9),i%2?buyer:other)));
 check("两买家并发争抢规格不超卖",race.filter(r=>r.status===201).length===3&&race.filter(r=>r.status===409).length===3&&(await config()).items[0].stock===0);
 check("抢购不影响另一规格",(await config()).items[1].stock===4);
 const oldBuy=await buy(legacy.id,buyInput(undefined,19.9));
 check("旧单规格商品继续兼容",oldBuy.status===201&&oldBuy.data.skuId===null&&oldBuy.data.unitPrice===19.9);
}finally{
 for(const no of [...pending.keys()])await cancel(no);
 for(const product of [p,legacy])if(product?.id)await req("/shop/products/"+product.id+"/status","PUT",{onSale:false},seller);
}
console.log("\n"+count+" variant checks passed.");
