import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = process.env.APP_URL || "http://127.0.0.1:8080";
let count = 0;
function check(name, ok) {
  assert.ok(ok, name);
  console.log("PASS " + ++count + ": " + name);
}
async function req(path, method = "GET", data, token) {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return { status: r.status, data: await r.json().catch(() => null) };
}
async function user(label) {
  const r = await req("/auth/register", "POST", {
    username: "购物" + label + Date.now().toString(36),
    password: "Shopping123!",
    nickname: label,
  });
  assert.equal(r.status, 201);
  return r.data.token;
}
const seller = await user("店主"),
  buyer = await user("买家"),
  other = await user("其他");
await req("/shop/register", "POST", { name: "购物详版验收店" }, seller);
const detail = {
  category: "生活日用",
  material: "陶瓷",
  specification: "350毫升",
  origin: "江西",
  shippingFrom: "景德镇",
  detailText: "一杯温暖\n演示商品说明",
  images: ["/media/shop-cup.svg", "/media/shop-bag.svg"],
};
const product = (name, stock = 10) => ({
  name,
  price: 29.9,
  stock,
  imageUrl: "/media/shop-cup.svg",
  description: "购物详版验收",
  details: detail,
});
const addr = {
  recipient: "虚拟买家",
  phone: "13800000000",
  region: "演示省 演示市",
  detail: "虚拟街道100号",
  label: "家",
  isDefault: false,
};
let p1, p2, p3;
const pending = new Set();
try {
  check("游客不可读购物车", (await req("/me/cart")).status === 401);
  p1 = (await req("/shop/products", "POST", product("详版陶瓷杯"), seller))
    .data;
  p2 = (
    await req(
      "/shop/products",
      "POST",
      {
        ...product("详版笔记本"),
        details: { ...detail, category: "文具书籍" },
      },
      seller,
    )
  ).data;
  p3 = (await req("/shop/products", "POST", product("详版保留商品"), seller))
    .data;
  const emptyReviews = await req("/mall/products/" + p1.id + "/reviews");
  check("游客可读空评价且不伪造评分", emptyReviews.status === 200 && emptyReviews.data.reviewCount === 0 && Number(emptyReviews.data.averageRating) === 0);
  check("不存在商品返回中文404", (await req("/mall/products/9223372036854775807/reviews")).status === 404);
  check("游客不可读待评价订单", (await req("/me/products/" + p1.id + "/reviewable-orders")).status === 401);
  check(
    "商品详情参数与相册持久化",
    p1.category === "生活日用" &&
      p1.material === "陶瓷" &&
      JSON.parse(p1.imagesJson).length === 2,
  );
  check(
    "按分类筛选",
    (
      await req("/mall/products?category=" + encodeURIComponent("文具书籍"))
    ).data.every((p) => p.category === "文具书籍"),
  );
  check(
    "分页可读取第二页",
    (await req("/mall/products?size=1&page=1")).data.length === 1,
  );
  const first = (await req("/mall/products?size=1&page=0")).data[0];
  const second = (await req("/mall/products?size=1&page=1")).data[0];
  check("分页商品不重复", first.id !== second.id);
  check(
    "拒绝非法分类",
    (await req("/mall/products?category=bad")).status === 400,
  );
  check(
    "拒绝价格区间倒置",
    (await req("/mall/products?minPrice=100&maxPrice=1")).status === 400,
  );
  check(
    "拒绝危险相册链接",
    (
      await req(
        "/shop/products",
        "POST",
        {
          ...product("错误商品"),
          details: { ...detail, images: ["javascript:alert(1)"] },
        },
        seller,
      )
    ).status === 400,
  );
  check(
    "拒绝超出六张相册",
    (
      await req(
        "/shop/products",
        "POST",
        {
          ...product("错误商品"),
          details: { ...detail, images: Array(7).fill("/media/shop-cup.svg") },
        },
        seller,
      )
    ).status === 400,
  );
  const versions = await req(
    "/shop/products/" + p1.id,
    "PATCH",
    {
      ...product(p1.name),
      version: p1.version,
      details: { ...detail, category: "非法分类" },
    },
    seller,
  );
  check(
    "非法详情编辑回滚",
    versions.status === 400 &&
      (await req("/mall/products/" + p1.id)).data.version === p1.version,
  );
  await req("/me/product-favorites/" + p1.id, "PUT", undefined, buyer);
  await req("/me/product-favorites/" + p1.id, "PUT", undefined, buyer);
  check(
    "重复收藏幂等",
    (await req("/me/product-favorites", "GET", undefined, buyer)).data
      .length === 1,
  );
  check(
    "商品收藏按账号隔离",
    (await req("/me/product-favorites", "GET", undefined, other)).data
      .length === 0,
  );
  await req("/me/cart/" + p1.id, "POST", { quantity: 2 }, buyer);
  await req("/me/cart/" + p1.id, "POST", { quantity: 1 }, buyer);
  check(
    "加入购物车累加且不预扣库存",
    (await req("/me/cart", "GET", undefined, buyer)).data[0].quantity === 3 &&
      (await req("/mall/products/" + p1.id)).data.stock === 10,
  );
  check(
    "购物车不能超过库存",
    (await req("/me/cart/" + p1.id, "PUT", { quantity: 11 }, buyer)).status ===
      409,
  );
  check(
    "其他账号不能改购物车",
    (await req("/me/cart/" + p1.id, "PUT", { quantity: 1 }, other)).status ===
      404,
  );
  check(
    "数量为零拒绝",
    (await req("/me/cart/" + p1.id, "PUT", { quantity: 0 }, buyer)).status ===
      400,
  );
  const a1 = (await req("/me/addresses", "POST", addr, buyer)).data;
  check("第一个地址自动默认", Boolean(a1.isDefault));
  const defaults = await Promise.all([
    req(
      "/me/addresses",
      "POST",
      { ...addr, label: "公司", isDefault: true },
      buyer,
    ),
    req(
      "/me/addresses",
      "POST",
      { ...addr, label: "其他", isDefault: true },
      buyer,
    ),
  ]);
  check(
    "并发默认地址唯一",
    (await req("/me/addresses", "GET", undefined, buyer)).data.filter(
      (a) => a.isDefault,
    ).length === 1,
  );
  check(
    "不能编辑他人地址",
    (await req("/me/addresses/" + a1.id, "PUT", addr, other)).status === 404,
  );
  check(
    "不能删除他人地址",
    (await req("/me/addresses/" + a1.id, "DELETE", undefined, other)).status ===
      404,
  );
  check(
    "地址按账号隔离",
    (await req("/me/addresses", "GET", undefined, other)).data.length === 0,
  );
  const primary = (
    await req("/me/addresses", "GET", undefined, buyer)
  ).data.find((a) => a.isDefault);
  await req("/me/addresses/" + primary.id, "DELETE", undefined, buyer);
  check(
    "删除默认地址后自动选一个默认",
    (await req("/me/addresses", "GET", undefined, buyer)).data.filter(
      (a) => a.isDefault,
    ).length === 1,
  );
  await req("/me/cart/" + p2.id, "POST", { quantity: 2 }, buyer);
  await req("/me/cart/" + p3.id, "POST", { quantity: 1 }, buyer);
  const lines = [
    { productId: p1.id, quantity: 3, expectedPrice: 29.9 },
    { productId: p2.id, quantity: 2, expectedPrice: 29.9 },
  ];
  const checkout = { addressId: a1.id, items: lines, requestKey: randomUUID() };
  const bad = await req(
    "/me/cart/checkout",
    "POST",
    { ...checkout, items: [lines[0], { ...lines[1], expectedPrice: 0.01 }] },
    buyer,
  );
  check("价格变化拒绝整批结算", bad.status === 409);
  check(
    "结算失败不扣库存不清空购物车",
    (await req("/mall/products/" + p1.id)).data.stock === 10 &&
      (await req("/me/cart", "GET", undefined, buyer)).data.length === 3,
  );
  check(
    "结算不能重复商品",
    (
      await req(
        "/me/cart/checkout",
        "POST",
        { ...checkout, items: [lines[0], lines[0]] },
        buyer,
      )
    ).status === 409,
  );
  check(
    "结算不能使用他人地址",
    (await req("/me/cart/checkout", "POST", checkout, other)).status === 404,
  );
  const result = await req("/me/cart/checkout", "POST", checkout, buyer);
  for (const o of result.data.orders || []) pending.add(o.orderNo);
  check(
    "两件商品原子结算并创建独立订单",
    result.status === 201 &&
      result.data.orders.length === 2 &&
      Number(result.data.totalAmount) === 149.5,
  );
  check(
    "结算只移除选中的购物车商品",
    (await req("/me/cart", "GET", undefined, buyer)).data.length === 1 &&
      (await req("/me/cart", "GET", undefined, buyer)).data[0].id === p3.id,
  );
  check(
    "多商品库存准确扣减",
    (await req("/mall/products/" + p1.id)).data.stock === 7 &&
      (await req("/mall/products/" + p2.id)).data.stock === 8,
  );
  const retry = await req("/me/cart/checkout", "POST", checkout, buyer);
  check(
    "结算网络重试幂等",
    retry.status === 201 &&
      retry.data.batchId === result.data.batchId &&
      (await req("/mall/products/" + p1.id)).data.stock === 7,
  );
  check(
    "同一个结算标识不同内容拒绝",
    (
      await req(
        "/me/cart/checkout",
        "POST",
        { ...checkout, items: [lines[0]] },
        buyer,
      )
    ).status === 409,
  );
  await req("/me/addresses/" + a1.id, "DELETE", undefined, buyer);
  const order = result.data.orders[0];
  check(
    "删除地址不影响订单快照",
    (
      await req("/me/orders/" + order.orderNo, "GET", undefined, buyer)
    ).data.address.includes("虚拟街道"),
  );
  check(
    "地址删除后原结算重试仍返回原订单",
    (await req("/me/cart/checkout", "POST", checkout, buyer)).status === 201,
  );
  check(
    "其他人不能读订单详情",
    (await req("/me/orders/" + order.orderNo, "GET", undefined, other))
      .status === 404,
  );
  check(
    "无关商家不能读订单详情",
    (await req("/shop/orders/" + order.orderNo, "GET", undefined, other))
      .status === 404,
  );
  const initial = (
    await req("/me/orders/" + order.orderNo, "GET", undefined, buyer)
  ).data;
  check(
    "下单记录真实时间线",
    initial.events.length === 1 && initial.events[0].status === "PENDING",
  );
  const pendingReview = await req(
    "/me/products/" + order.productId + "/reviews",
    "POST",
    { rating: 5, content: "还未收货不能提前评价", orderNo: order.orderNo },
    buyer,
  );
  check("未完成订单不能评价", pendingReview.status === 409);
  check("未收货的中文提示", pendingReview.data.message === "确认收货后才能评价商品");
  await req(
    "/me/orders/" + order.orderNo + "/demo-pay",
    "POST",
    undefined,
    buyer,
  );
  await req(
    "/me/orders/" + order.orderNo + "/demo-pay",
    "POST",
    undefined,
    buyer,
  );
  await req(
    "/shop/orders/" + order.orderNo + "/ship",
    "POST",
    undefined,
    seller,
  );
  await req(
    "/me/orders/" + order.orderNo + "/complete",
    "POST",
    undefined,
    buyer,
  );
  pending.delete(order.orderNo);
  const timeline = (
    await req("/me/orders/" + order.orderNo, "GET", undefined, buyer)
  ).data;
  check(
    "订单动作时间线不因重复操作重复",
    timeline.events.map((e) => e.status).join(",") ===
      "PENDING,PAID,SHIPPED,COMPLETED",
  );
  check(
    "销量来自已完成订单",
    (await req("/mall/products/" + order.productId)).data.soldCount ===
      order.quantity,
  );
  const reviewable = await req(
    "/me/products/" + order.productId + "/reviewable-orders",
    "GET",
    undefined,
    buyer,
  );
  check(
    "完成订单进入可评价列表",
    reviewable.status === 200 && reviewable.data.some((o) => o.orderNo === order.orderNo),
  );
  const reviewInput = { rating: 5, content: "  商品很喜欢，符合介绍。  ", orderNo: order.orderNo };
  const reviewPath = "/me/products/" + order.productId + "/reviews";
  check("游客不可发布评价", (await req(reviewPath, "POST", reviewInput)).status === 401);
  check("不能评价他人订单", (await req(reviewPath, "POST", reviewInput, other)).status === 404);
  check("待评价订单按账号隔离", (await req("/me/products/" + order.productId + "/reviewable-orders", "GET", undefined, other)).data.length === 0);
  check("订单不能冒用为其他商品评价", (await req("/me/products/" + p3.id + "/reviews", "POST", reviewInput, buyer)).status === 404);
  for (const invalid of [{ rating: 0 }, { rating: 6 }, { content: "   " }, { content: "字".repeat(501) }]) {
    const rejected = await req(reviewPath, "POST", { ...reviewInput, ...invalid }, buyer);
    check("非法评价返回中文校验错误：" + Object.keys(invalid)[0] + (invalid.rating ?? (invalid.content.length)), rejected.status === 400 && /[\u4e00-\u9fff]/.test(rejected.data.message));
  }
  const review = await req(
    "/me/products/" + order.productId + "/reviews",
    "POST",
    reviewInput,
    buyer,
  );
  check(
    "完成订单可以发布评价",
    review.status === 201 && review.data.rating === 5 && review.data.content === "商品很喜欢，符合介绍。",
  );
  const reviewSummary = await req(
    "/mall/products/" + order.productId + "/reviews",
  );
  check(
    "商品详情返回评价摘要",
    reviewSummary.status === 200 &&
      reviewSummary.data.reviewCount === 1 &&
      reviewSummary.data.items[0].id === review.data.id && Number(reviewSummary.data.averageRating) === 5,
  );
  check("公开评价不泄露订单和买家ID", reviewSummary.data.items.every((r) => !('orderNo' in r) && !('buyerId' in r) && !('buyer_id' in r)));
  check("评价后移出待评价列表", (await req("/me/products/" + order.productId + "/reviewable-orders", "GET", undefined, buyer)).data.length === 0);
  check("订单已评价状态同步", Boolean((await req("/me/orders/" + order.orderNo, "GET", undefined, buyer)).data.reviewed));
  check(
    "同一订单不能重复评价",
    (
      await req(
        "/me/products/" + order.productId + "/reviews",
        "POST",
        { rating: 4, content: "重复评价", orderNo: order.orderNo },
        buyer,
      )
    ).status === 409,
  );
  const secondPurchase = (await req("/products/" + order.productId + "/buy", "POST", {
    quantity: 1, recipient: "虚拟买家", phone: "13800000000", address: "虚拟街道100号",
    requestKey: randomUUID(), expectedPrice: 29.9,
  }, buyer)).data;
  pending.add(secondPurchase.orderNo);
  await req("/me/orders/" + secondPurchase.orderNo + "/demo-pay", "POST", undefined, buyer);
  await req("/shop/orders/" + secondPurchase.orderNo + "/ship", "POST", undefined, seller);
  await req("/me/orders/" + secondPurchase.orderNo + "/complete", "POST", undefined, buyer);
  pending.delete(secondPurchase.orderNo);
  await req("/shop/products/" + order.productId + "/status", "PUT", { onSale: false }, seller);
  const concurrentReviews = await Promise.all(Array.from({ length: 5 }, () => req(reviewPath, "POST", {
    rating: 1, content: "再次购买后的不同体验", orderNo: secondPurchase.orderNo,
  }, buyer)));
  check("下架商品的已完成订单仍可评价且并发只成功一次", concurrentReviews.filter((r) => r.status === 201).length === 1 && concurrentReviews.filter((r) => r.status === 409).length === 4);
  const aggregated = (await req("/mall/products/" + order.productId + "/reviews")).data;
  check("复购评价独立计算真实平均分", aggregated.reviewCount === 2 && Number(aggregated.averageRating) === 3 && aggregated.items[0].content === "再次购买后的不同体验");
  await req("/shop/products/" + order.productId + "/status", "PUT", { onSale: true }, seller);
  await req(
    "/shop/products/" + p3.id + "/status",
    "PUT",
    { onSale: false },
    seller,
  );
  const invalid = (await req("/me/cart", "GET", undefined, buyer)).data[0];
  check("购物车明确保留失效商品", !invalid.available);
  await req("/me/cart/" + p3.id, "DELETE", undefined, buyer);
  check(
    "失效商品可以移除",
    (await req("/me/cart", "GET", undefined, buyer)).data.length === 0,
  );
  await req("/me/product-favorites/" + p1.id, "DELETE", undefined, buyer);
  check(
    "好物取消收藏",
    (await req("/me/product-favorites", "GET", undefined, buyer)).data
      .length === 0,
  );
  const remainingAddress = (await req("/me/addresses", "GET", undefined, buyer))
    .data[0];
  await req(
    "/shop/products/" + p3.id + "/status",
    "PUT",
    { onSale: true },
    seller,
  );
  await req("/me/cart/" + p3.id, "POST", { quantity: 2 }, buyer);
  const concurrentPayload = {
    addressId: remainingAddress.id,
    items: [{ productId: p3.id, quantity: 2, expectedPrice: 29.9 }],
    requestKey: randomUUID(),
  };
  const repeated = await Promise.all(
    Array.from({ length: 5 }, () =>
      req("/me/cart/checkout", "POST", concurrentPayload, buyer),
    ),
  );
  for (const result of repeated)
    for (const o of result.data.orders || []) pending.add(o.orderNo);
  check(
    "并发批量结算幂等",
    repeated.every((r) => r.status === 201) &&
      new Set(repeated.map((r) => r.data.batchId)).size === 1 &&
      (await req("/mall/products/" + p3.id)).data.stock === 8,
  );
  await req("/me/cart/" + p1.id, "POST", { quantity: 2 }, buyer);
  await req("/me/cart/" + p2.id, "POST", { quantity: 1 }, buyer);
  const before = (await req("/mall/products/" + p1.id)).data.stock;
  const short = (await req("/mall/products/" + p2.id)).data;
  await req(
    "/shop/products/" + p2.id,
    "PATCH",
    { ...product(p2.name), stock: 0, version: short.version },
    seller,
  );
  const stockFail = await req(
    "/me/cart/checkout",
    "POST",
    {
      addressId: remainingAddress.id,
      requestKey: randomUUID(),
      items: [
        { productId: p1.id, quantity: 2, expectedPrice: 29.9 },
        { productId: p2.id, quantity: 1, expectedPrice: 29.9 },
      ],
    },
    buyer,
  );
  check("一件缺货时整批拒绝", stockFail.status === 409);
  check(
    "批量缺货不扣其他商品库存",
    (await req("/mall/products/" + p1.id)).data.stock === before &&
      (await req("/me/cart", "GET", undefined, buyer)).data.length === 2,
  );
  check(
    "仅看有货不返回售罄商品",
    !(await req("/mall/products?inStock=true&size=100")).data.some(
      (p) => p.id === p2.id,
    ),
  );
  const rejectedPrice = await req(
    "/products/" + p1.id + "/buy",
    "POST",
    {
      quantity: 1,
      recipient: "虚拟",
      phone: "13800000000",
      address: "虚拟街道100号",
      requestKey: randomUUID(),
      expectedPrice: 0.01,
    },
    buyer,
  );
  check("立即购买价格变化也拒绝", rejectedPrice.status === 409);
} finally {
  for (const no of pending)
    await req("/me/orders/" + no + "/cancel", "POST", undefined, buyer);
  for (const p of [p1, p2, p3])
    if (p?.id)
      await req(
        "/shop/products/" + p.id + "/status",
        "PUT",
        { onSale: false },
        seller,
      );
}
console.log("\n" + count + " detailed shopping checks passed.");
