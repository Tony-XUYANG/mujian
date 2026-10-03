import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = process.env.APP_URL || "http://127.0.0.1:8080";
let passed = 0;
function check(name, condition) {
  assert.ok(condition, name);
  console.log("PASS " + ++passed + ": " + name);
}
async function req(path, method = "GET", body, token) {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, data: await r.json().catch(() => null) };
}
async function account(label) {
  const r = await req("/auth/register", "POST", {
    username: "商城" + label + Date.now().toString(36),
    password: "Commerce123!",
    nickname: "商城验收" + label,
  });
  assert.equal(r.status, 201);
  return r.data;
}
const seller = await account("店主"),
  buyer = await account("买家"),
  outsider = await account("其他");
const st = seller.token,
  bt = buyer.token,
  ot = outsider.token;
const input = {
  name: "商城验收商品",
  description: "验收完成将下架",
  imageUrl: "/media/shop-cup.svg",
  price: 12.34,
  stock: 5,
};
const buy = (quantity = 1) => ({
  quantity,
  recipient: "虚拟收货人",
  phone: "13800000000",
  address: "演示市测试街道100号（虚拟地址）",
  requestKey: randomUUID(),
});
let product, second, video;
try {
  check("游客可浏览商城", (await req("/mall/products")).status === 200);
  check(
    "匿名不能开店",
    (await req("/shop/register", "POST", { name: "匿名店铺" })).status === 401,
  );
  const registrations = await Promise.all([
    req("/shop/register", "POST", { name: "验收店铺" }, st),
    req("/shop/register", "POST", { name: "重复店铺" }, st),
  ]);
  check(
    "并发开店只产生一家店",
    registrations.filter((r) => r.status === 201).length === 1 &&
      registrations.filter((r) => r.status === 409).length === 1,
  );
  await req("/shop/register", "POST", { name: "其他店铺" }, ot);
  const me = await req("/shop/me", "GET", undefined, st);
  check(
    "店铺资料使用前端字段名",
    me.data.shop.name && "logoUrl" in me.data.shop,
  );
  check(
    "商品价格校验中文提示",
    (
      await req("/shop/products", "POST", { ...input, price: -1 }, st)
    ).data.message.includes("价格"),
  );
  const created = await req("/shop/products", "POST", input, st);
  check("店主添加商品", created.status === 201);
  product = created.data;
  check(
    "匿名可查看商品详情",
    (await req("/mall/products/" + product.id)).data.name === input.name,
  );
  check(
    "禁止跨店编辑商品",
    (await req("/shop/products/" + product.id, "PATCH", input, ot)).status ===
      404,
  );
  check(
    "拒绝危险图片地址",
    (
      await req(
        "/shop/products",
        "POST",
        { ...input, imageUrl: "javascript:alert(1)" },
        st,
      )
    ).status === 400,
  );
  check(
    "非法排序拒绝",
    (await req("/mall/products?sort=unknown")).status === 400,
  );
  check(
    "缺少收货信息不能下单",
    (await req("/products/" + product.id + "/buy", "POST", { quantity: 1 }, bt))
      .status === 400,
  );
  check(
    "匿名不能下单",
    (await req("/products/" + product.id + "/buy", "POST", buy())).status ===
      401,
  );
  const payload = buy(2);
  const duplicates = await Promise.all(
    Array.from({ length: 5 }, () =>
      req(
        "/products/" + product.id + "/buy",
        "POST",
        { ...payload, unitPrice: 0.01, totalAmount: 0.02 },
        bt,
      ),
    ),
  );
  check(
    "并发重复提交返回同一订单",
    duplicates.every((r) => r.status === 201) &&
      new Set(duplicates.map((r) => r.data.orderNo)).size === 1,
  );
  let order = duplicates[0].data;
  check(
    "后端计算价格并创建待付款订单",
    Number(order.totalAmount) === 24.68 && order.status === "PENDING",
  );
  check(
    "重复下单只扣一次库存",
    (await req("/mall/products/" + product.id)).data.stock === 3,
  );
  check(
    "同一请求标识不同内容拒绝",
    (
      await req(
        "/products/" + product.id + "/buy",
        "POST",
        { ...payload, quantity: 1 },
        bt,
      )
    ).status === 409,
  );
  check(
    "其他用户不能取消订单",
    (
      await req(
        "/me/orders/" + order.orderNo + "/cancel",
        "POST",
        undefined,
        ot,
      )
    ).status === 404,
  );
  check(
    "其他店主不能发货",
    (
      await req(
        "/shop/orders/" + order.orderNo + "/ship",
        "POST",
        undefined,
        ot,
      )
    ).status === 404,
  );
  check(
    "待付款不能确认收货",
    (
      await req(
        "/me/orders/" + order.orderNo + "/complete",
        "POST",
        undefined,
        bt,
      )
    ).status === 409,
  );
  const cancels = await Promise.all(
    Array.from({ length: 3 }, () =>
      req("/me/orders/" + order.orderNo + "/cancel", "POST", undefined, bt),
    ),
  );
  check(
    "重复取消幂等并返还库存一次",
    cancels.every((r) => r.status === 200 && r.data.status === "CANCELLED") &&
      (await req("/mall/products/" + product.id)).data.stock === 5,
  );
  check(
    "已取消不可支付",
    (
      await req(
        "/me/orders/" + order.orderNo + "/demo-pay",
        "POST",
        undefined,
        bt,
      )
    ).status === 409,
  );
  const contenders = await Promise.all(
    Array.from({ length: 9 }, (_, i) =>
      req("/products/" + product.id + "/buy", "POST", buy(), i % 2 ? bt : ot),
    ),
  );
  contenders.forEach((r, i) => (r.auth = i % 2 ? bt : ot));
  const won = contenders.filter((r) => r.status === 201);
  check(
    "并发争抢库存不超卖",
    won.length === 5 &&
      contenders.filter((r) => r.status === 409).length === 4 &&
      (await req("/mall/products/" + product.id)).data.stock === 0,
  );
  for (const r of won.slice(1))
    await req(
      "/me/orders/" + r.data.orderNo + "/cancel",
      "POST",
      undefined,
      r.auth,
    );
  const orderAuth = won[0].auth;
  order = won[0].data;
  await req(
    "/shop/products/" + product.id,
    "PATCH",
    {
      ...input,
      name: "更名商品",
      price: 99,
      stock: 4,
      version: (await req("/mall/products/" + product.id)).data.version,
    },
    st,
  );
  const snapshot = (
    await req("/me/orders", "GET", undefined, orderAuth)
  ).data.find((o) => o.orderNo === order.orderNo);
  check(
    "订单保留商品名称与价格快照",
    snapshot.productName === input.name && Number(snapshot.unitPrice) === 12.34,
  );
  check(
    "待付款不能发货",
    (
      await req(
        "/shop/orders/" + order.orderNo + "/ship",
        "POST",
        undefined,
        st,
      )
    ).status === 409,
  );
  check(
    "模拟付款变为待发货",
    (
      await req(
        "/me/orders/" + order.orderNo + "/demo-pay",
        "POST",
        undefined,
        orderAuth,
      )
    ).data.status === "PAID",
  );
  check(
    "重复模拟付款幂等",
    (
      await req(
        "/me/orders/" + order.orderNo + "/demo-pay",
        "POST",
        undefined,
        orderAuth,
      )
    ).data.status === "PAID",
  );
  check(
    "已付款不能按未付款规则取消",
    (
      await req(
        "/me/orders/" + order.orderNo + "/cancel",
        "POST",
        undefined,
        orderAuth,
      )
    ).status === 409,
  );
  check(
    "店主只能看到本店订单",
    (await req("/shop/orders", "GET", undefined, ot)).data.length === 0,
  );
  check(
    "店主演示发货",
    (
      await req(
        "/shop/orders/" + order.orderNo + "/ship",
        "POST",
        undefined,
        st,
      )
    ).data.status === "SHIPPED",
  );
  check(
    "买家确认收货",
    (
      await req(
        "/me/orders/" + order.orderNo + "/complete",
        "POST",
        undefined,
        orderAuth,
      )
    ).data.status === "COMPLETED",
  );
  check(
    "重复确认收货幂等",
    (
      await req(
        "/me/orders/" + order.orderNo + "/complete",
        "POST",
        undefined,
        orderAuth,
      )
    ).data.status === "COMPLETED",
  );
  second = (await req("/shop/products", "POST", input, ot)).data;
  const v = {
    title: "商城验收视频",
    description: "挂载验收视频，验收后删除",
    coverImg: "/media/forest.jpg",
    videoUrl: "/media/sintel-trailer.mp4",
    category: "都市",
  };
  check(
    "店主不能挂其他店的商品",
    (
      await req(
        "/shop/videos",
        "POST",
        { video: v, productIds: [second.id] },
        st,
      )
    ).status === 400,
  );
  check(
    "挂载失败视频事务回滚",
    !(await req("/shop/videos", "GET", undefined, st)).data.some(
      (item) => item.title === v.title,
    ),
  );
  const posted = await req(
    "/shop/videos",
    "POST",
    { video: v, productIds: [product.id] },
    st,
  );
  video = posted.data;
  check(
    "店主发布视频含首集",
    posted.status === 201 &&
      (await req("/dramas/" + video.id + "/episodes")).data.length === 1,
  );
  check(
    "公开视频商品卡",
    (await req("/dramas/" + video.id + "/products")).data[0].id === product.id,
  );
  check(
    "跨店不能修改视频挂载",
    (
      await req(
        "/shop/videos/" + video.id + "/products",
        "PUT",
        { productIds: [] },
        ot,
      )
    ).status === 404,
  );
  await req(
    "/shop/products/" + product.id + "/status",
    "PUT",
    { onSale: false },
    st,
  );
  check(
    "下架商品从视频隐藏",
    (await req("/dramas/" + video.id + "/products")).data.length === 0,
  );
  check(
    "下架商品不能购买",
    (await req("/products/" + product.id + "/buy", "POST", buy(), bt))
      .status === 409,
  );
  check(
    "下架商品详情隐藏",
    (await req("/mall/products/" + product.id)).status === 404,
  );
  await req(
    "/shop/products/" + product.id + "/status",
    "PUT",
    { onSale: true },
    st,
  );
  check(
    "重新上架恢复挂载",
    (await req("/dramas/" + video.id + "/products")).data.length === 1,
  );
  check(
    "超过6件挂载拒绝",
    (
      await req(
        "/shop/videos/" + video.id + "/products",
        "PUT",
        { productIds: Array(7).fill(product.id) },
        st,
      )
    ).status === 400,
  );
  check(
    "店铺页面只返回本店商品",
    (await req("/mall/shops/" + product.shopId)).data.products.every(
      (p) => p.shopId === product.shopId,
    ),
  );
  check(
    "买家订单不会被其他用户读取",
    !(
      await req("/me/orders", "GET", undefined, orderAuth === bt ? ot : bt)
    ).data.some((o) => o.orderNo === order.orderNo),
  );
  check(
    "旧版本编辑不能覆盖新库存",
    (
      await req(
        "/shop/products/" + product.id,
        "PATCH",
        { ...input, version: product.version },
        st,
      )
    ).status === 409,
  );
} finally {
  if (video?.id) await req("/shop/videos/" + video.id, "DELETE", undefined, st);
  for (const [p, t] of [
    [product, st],
    [second, ot],
  ])
    if (p?.id)
      await req(
        "/shop/products/" + p.id + "/status",
        "PUT",
        { onSale: false },
        t,
      );
}
console.log("\n" + passed + " commerce checks passed.");
