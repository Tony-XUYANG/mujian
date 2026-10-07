import { useEffect, useState, type FormEvent } from "react";
import {
  Heart,
  MapPin,
  ArrowLeft,
  ChevronRight,
  Package,
  Search,
  ShoppingBag,
  Store,
  X,
} from "lucide-react";
import { api, type User } from "./api";
import { Modal } from "./Modal";
import { createRequestKey } from "./requestKey";
import { AttributeSelector, VariantSelector, type AttributeGroup, type Variant } from "./Variants";
import {
  ProductShopping,
  ShoppingEntry,
  productCategories,
  OrderDetail,
  AddressPicker,
  ProductGallery,
  ProductReviews,
} from "./Shopping";

export type Product = {
  hasVariants?: boolean | number;
  variants?: Variant[];
  attributeGroups?: AttributeGroup[];
  skuId?: number;
  variantName?: string;
  id: number;
  name: string;
  imageUrl: string | null;
  description: string | null;
  price: number;
  stock: number;
  status: string;
  version: number;
  shopId: number;
  shopName: string;
  category?: string;
  material?: string;
  specification?: string;
  origin?: string;
  shippingFrom?: string;
  detailText?: string;
  imagesJson?: string;
  soldCount?: number;
};
export type Shop = {
  id: number;
  name: string;
  logoUrl: string | null;
  description: string | null;
};
export type Order = {
  skuId?: number;
  variantName?: string;
  reviewed: boolean | number;
  orderNo: string;
  productId: number;
  productName: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  status: string;
  createTime: string;
  recipient: string;
  phone: string;
  address: string;
  shopId: number;
  shopName: string;
};
export type CommerceProps = {
  user: User | null;
  onLogin: () => void;
  onNavigate: (path: string) => void;
  toast: (s: string, error?: boolean) => void;
};
export const money = (value: number) => Number(value).toFixed(2);
export const states: Record<string, string> = {
  PENDING: "待付款",
  PAID: "待发货",
  SHIPPED: "待收货",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};
export function useRemote<T>(path: string | null, refresh = 0) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    setData(null);
    setError("");
    if (!path) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    api<T>(path, { signal: controller.signal })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, refresh]);
  return { data, error, loading };
}
export function ProductImage({
  src,
  name,
}: {
  src: string | null;
  name: string;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  return src && !broken ? (
    <img src={src} alt={name} loading="lazy" onError={() => setBroken(true)} />
  ) : (
    <span className="product-placeholder">
      <ShoppingBag size={36} />
    </span>
  );
}
export function LoadState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
}) {
  return loading ? (
    <div className="empty" role="status">
      正在加载…
    </div>
  ) : error ? (
    <div className="empty">
      <p role="alert">{error}</p>
      <button className="secondary" onClick={retry}>
        重试
      </button>
    </div>
  ) : null;
}
export function CommerceLogin({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="empty">
      <ShoppingBag size={36} />
      <h2>登录后继续</h2>
      <p>查看订单，或开通你的店铺。</p>
      <button className="primary" onClick={onLogin}>
        登录 / 注册
      </button>
    </div>
  );
}
export function ProductGrid({
  products,
  onNavigate,
}: {
  products: Product[];
  onNavigate: (path: string) => void;
}) {
  return products.length ? (
    <div className="product-grid">
      {products.map((p) => (
        <button
          className="product-card"
          key={p.id}
          onClick={() => onNavigate("product/" + p.id)}
        >
          <div className="product-picture">
            <ProductImage src={p.imageUrl} name={p.name} />
            {(p.stock === 0 || p.status !== "ON_SALE") && (
              <span className="stock-badge">
                {p.status !== "ON_SALE" ? "已下架" : "暂时售罄"}
              </span>
            )}
          </div>
          <div className="product-copy">
            <small>{p.shopName}</small>
            <h3>{p.name}</h3>
            <p className="product-card-meta">
              {p.category || "生活日用"} · 已售 {p.soldCount || 0}
            </p>
            <div>
              <strong className="price">¥ {money(p.price)}{Boolean(p.hasVariants) && " 起"}</strong>
              <span>
                查看商品 <ChevronRight size={13} />
              </span>
            </div>
          </div>
        </button>
      ))}
    </div>
  ) : (
    <div className="empty">
      <Package />
      <h3>暂时没有商品</h3>
      <p>换个关键词，或稍后再来看看。</p>
    </div>
  );
}
export function Mall(props: CommerceProps) {
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [sort, setSort] = useState("latest"),
    [category, setCategory] = useState(""),
    [stockOnly, setStockOnly] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const path =
    "/mall/products?q=" +
    encodeURIComponent(search) +
    "&sort=" +
    sort +
    "&category=" +
    encodeURIComponent(category) +
    "&inStock=" +
    stockOnly;
  const marks = ["杯", "香", "袋", "书", "数", "物"];
  return (
    <section className="commerce-page mall-rich">
      <div className="commerce-heading">
        <div>
          <p className="eyebrow">好故事，也有好生活</p>
          <h1>
            幕间商城<span>把喜欢，带进日常</span>
          </h1>
        </div>
        <ShoppingEntry {...props} />
      </div>
      <div className="mall-utility">
        <button onClick={() => props.onNavigate("orders")}>
          <ShoppingBag size={18} />
          <span>我的订单</span>
          <ChevronRight size={14} />
        </button>
        <button onClick={() => props.onNavigate("product-favorites")}>
          <Heart size={18} />
          <span>好物收藏</span>
          <ChevronRight size={14} />
        </button>
        <button onClick={() => props.onNavigate("addresses")}>
          <MapPin size={18} />
          <span>收货地址</span>
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="mall-discovery">
        <div className="mall-editorial">
          <span>幕间生活提案 · 01</span>
          <h2>
            把日子，
            <br />
            过成喜欢的模样。
          </h2>
          <p>一杯热饮，一缕木香，一场好故事。</p>
          <button onClick={() => setCategory("生活日用")}>
            发现日常好物 <ChevronRight size={16} />
          </button>
          <img src="/media/shop-cup.svg" alt="陶瓷杯生活提案" />
        </div>
        <div className="mall-scenes">
          <button onClick={() => setCategory("家居香氛")}>
            <span>
              <small>放松时刻</small>
              <strong>今晚，慢一点</strong>
              <em>
                家居香氛 <ChevronRight size={13} />
              </em>
            </span>
            <img src="/media/shop-candle.svg" alt="香氛好物" />
          </button>
          <button onClick={() => setCategory("文具书籍")}>
            <span>
              <small>灵感日常</small>
              <strong>记下心动的一句</strong>
              <em>
                文具书籍 <ChevronRight size={13} />
              </em>
            </span>
            <img src="/media/shop-book.svg" alt="文具好物" />
          </button>
        </div>
      </div>
      <div className="mall-category-icons" aria-label="商品分类入口">
        {productCategories.map((c, i) => (
          <button
            className={category === c ? "selected" : ""}
            key={c}
            onClick={() => setCategory(category === c ? "" : c)}
          >
            <span>{marks[i]}</span>
            <strong>{c}</strong>
          </button>
        ))}
      </div>
      <div className="shopping-section-title">
        <div>
          <h2>{category || "精选好物"}</h2>
          <p>
            {category ? "找到适合你的那一件" : "从视频里的心动，到生活里的陪伴"}
          </p>
        </div>
        {category && <button onClick={() => setCategory("")}>查看全部</button>}
      </div>
      <div className="commerce-tools">
        <label className="commerce-search">
          <Search size={18} />
          <input
            aria-label="搜索商品"
            placeholder="搜索商品、心动好物…"
            maxLength={100}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              className="icon-button"
              aria-label="清空商品搜索"
              onClick={() => setQuery("")}
            >
              <X size={15} />
            </button>
          )}
        </label>
        <select
          aria-label="商品排序"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="latest">最新上架</option>
          <option value="sales">销量优先</option>
          <option value="priceAsc">价格从低到高</option>
          <option value="priceDesc">价格从高到低</option>
        </select>
        <label className="stock-filter">
          <input
            type="checkbox"
            checked={stockOnly}
            onChange={(e) => setStockOnly(e.target.checked)}
          />
          仅看有货
        </label>
      </div>
      <div className="mall-categories" aria-label="商品分类筛选">
        <button
          className={!category ? "selected" : ""}
          onClick={() => setCategory("")}
        >
          全部好物
        </button>
        {productCategories.map((c) => (
          <button
            key={c}
            className={category === c ? "selected" : ""}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <ProductCatalog key={path} path={path} onNavigate={props.onNavigate} />
      <p className="commerce-note mall-bottom-note">
        演示商城 · 商品销量来自已完成的演示订单 · 模拟支付不实际扣款
      </p>
    </section>
  );
}
function ProductCatalog({
  path,
  onNavigate,
}: {
  path: string;
  onNavigate: (path: string) => void;
}) {
  const [page, setPage] = useState(0),
    [retry, setRetry] = useState(0),
    [items, setItems] = useState<Product[]>([]);
  const { data, error, loading } = useRemote<Product[]>(
    path + "&page=" + page + "&size=24",
    retry,
  );
  useEffect(() => {
    if (data)
      setItems((old) =>
        page === 0
          ? data
          : [...old, ...data.filter((p) => !old.some((o) => o.id === p.id))],
      );
  }, [data, page]);
  return (
    <>
      <LoadState
        loading={loading && page === 0}
        error={error}
        retry={() => setRetry((n) => n + 1)}
      />
      {(!loading || items.length > 0) && (
        <ProductGrid products={items} onNavigate={onNavigate} />
      )}
      <div className="catalog-more">
        {data?.length === 24 && (
          <button
            className="secondary"
            disabled={loading}
            onClick={() => setPage((n) => n + 1)}
          >
            {loading ? "加载中…" : "加载更多好物"}
          </button>
        )}
      </div>
    </>
  );
}
export function Storefront({ id, ...props }: CommerceProps & { id: number }) {
  const [retry, setRetry] = useState(0);
  const { data, error, loading } = useRemote<{
    shop: Shop;
    products: Product[];
  }>("/mall/shops/" + id, retry);
  return (
    <section className="commerce-page">
      <button
        className="commerce-back"
        onClick={() => props.onNavigate("mall")}
      >
        <ArrowLeft size={16} />
        返回商城
      </button>
      <LoadState
        loading={loading}
        error={error}
        retry={() => setRetry((n) => n + 1)}
      />
      {data && (
        <>
          <div className="store-heading">
            <div className="store-logo">
              <ProductImage src={data.shop.logoUrl} name={data.shop.name} />
            </div>
            <div>
              <span className="small-tag">幕间小店</span>
              <h1>{data.shop.name}</h1>
              <p>{data.shop.description || "欢迎来店里逛逛。"}</p>
            </div>
          </div>
          <h2>
            店内好物 <small>{data.products.length} 件</small>
          </h2>
          <ProductGrid products={data.products} onNavigate={props.onNavigate} />
        </>
      )}
    </section>
  );
}
export function ProductPage({ id, ...props }: CommerceProps & { id: number }) {
  const [retry, setRetry] = useState(0),
    [skuId, setSkuId] = useState<number | null>(null),
    [checkout, setCheckout] = useState(false);
  const {
    data: p,
    error,
    loading,
  } = useRemote<Product>("/mall/products/" + id, retry);
  const selected = p?.variants?.find((v) => v.id === skuId && v.onSale && v.stock > 0);
  const purchaseProduct = p && selected ? { ...p, skuId: selected.id, variantName: selected.name, price: selected.price, stock: selected.stock } : p;
  const ready = Boolean(purchaseProduct?.stock && (!p?.hasVariants || selected));
  return (
    <section className="commerce-page">
      <button
        className="commerce-back"
        onClick={() => props.onNavigate("mall")}
      >
        <ArrowLeft size={16} />
        返回商城
      </button>
      <LoadState
        loading={loading}
        error={error}
        retry={() => setRetry((n) => n + 1)}
      />
      {p && (
        <>
          <div className="product-detail">
            <ProductGallery product={p} />
            <div className="detail-copy">
              <span className="small-tag">店铺好物</span>
              <h1>{p.name}</h1>
              <p className="detail-price">¥ {money(purchaseProduct!.price)}{Boolean(p.hasVariants) && !selected && " 起"}</p>
              <p>{p.description || "店主正在准备更多商品介绍。"}</p>
              <p className="product-sales">
                已售 {p.soldCount || 0} · {p.stock > 0 ? "现货" : "暂时售罄"}
              </p>
              <div className="product-facts">
                <span>{p.category || "生活日用"}</span>
                {p.specification && <span>{p.specification}</span>}
                {p.origin && <span>产地·{p.origin}</span>}
              </div>
              <p className="muted">{selected ? "当前规格库存" : "可售库存"} {purchaseProduct!.stock} 件</p>
              {Boolean(p.attributeGroups?.length) && <AttributeSelector groups={p.attributeGroups || []} variants={p.variants || []} selected={skuId} onSelect={setSkuId} />}
              {Boolean(p.hasVariants) && !p.attributeGroups?.length && <VariantSelector variants={p.variants || []} selected={skuId} onSelect={setSkuId} />}
              {Boolean(p.attributeGroups?.length && p.variants?.some(v => !v.valueIds?.length)) && <VariantSelector variants={(p.variants || []).filter(v => !v.valueIds?.length)} selected={skuId} onSelect={setSkuId} />}
              <button
                className="store-link"
                onClick={() => props.onNavigate("store/" + p.shopId)}
              >
                <Store size={22} />
                <span>
                  {p.shopName}
                  <small>进店看看更多好物</small>
                </span>
                <ChevronRight size={18} />
              </button>
              <ProductShopping product={purchaseProduct!} props={props} />
              <button
                className="primary purchase-button"
                disabled={!ready}
                onClick={() =>
                  props.user ? setCheckout(true) : props.onLogin()
                }
              >
                {!p.stock ? "暂时售罄" : !ready ? "请先选择规格" : "立即购买"}
              </button>
              <div className="product-detail-copy">
                <h3>商品详情</h3>
                <p>
                  {p.detailText ||
                    p.description ||
                    "店主正在准备更多商品介绍。"}
                </p>
                <p>发货地：{p.shippingFrom || "演示发货地"} · 物流：演示物流</p>
              </div>
              <p className="commerce-note">
                演示购买，无真实扣款。请使用虚拟收货信息体验。
              </p>
            </div>
          </div>
          <ProductReviews productId={p.id} props={props} />
          {checkout && props.user && (
            <Checkout
              product={purchaseProduct!}
              onClose={() => setCheckout(false)}
              {...props}
            />
          )}
        </>
      )}
    </section>
  );
}
function Checkout({
  product: p,
  onClose,
  ...props
}: CommerceProps & { product: Product; onClose: () => void }) {
  const [quantity, setQuantity] = useState(1),
    [recipient, setRecipient] = useState(""),
    [phone, setPhone] = useState(""),
    [address, setAddress] = useState(""),
    [key, setKey] = useState(createRequestKey);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const change = () => {
    setKey(createRequestKey());
    setError("");
  };
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api<Order>("/products/" + p.id + "/buy", {
        method: "POST",
        body: JSON.stringify({
          quantity,
          recipient,
          phone,
          address,
          requestKey: key,
          expectedPrice: p.price,
          skuId: p.skuId,
        }),
      });
      props.toast("订单已创建，请在我的订单中确认模拟支付");
      onClose();
      props.onNavigate("orders");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      label="确认订单"
      className="commerce-modal"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="commerce-modal-heading">
        <h2>确认订单</h2>
        <button
          className="icon-button"
          disabled={busy}
          aria-label="关闭结算"
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      <p>{p.name}</p>
      {p.variantName && <p className="selected-variant">已选：{p.variantName}</p>}
      <form className="commerce-form" onSubmit={submit}>
        <fieldset disabled={busy}>
          <AddressPicker
            onSelect={(a) => {
              setRecipient(a.recipient);
              setPhone(a.phone);
              setAddress(a.region + " " + a.detail);
              change();
            }}
          />
          <label>
            购买数量
            <input
              type="number"
              min={1}
              max={Math.min(99, p.stock)}
              required
              value={quantity}
              onChange={(e) => {
                setQuantity(Number(e.target.value));
                change();
              }}
            />
          </label>
          <label>
            收货人
            <input
              required
              maxLength={40}
              value={recipient}
              onChange={(e) => {
                setRecipient(e.target.value);
                change();
              }}
            />
          </label>
          <label>
            联系电话
            <input
              type="tel"
              required
              maxLength={24}
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                change();
              }}
            />
          </label>
          <label>
            收货地址
            <textarea
              aria-label="收货地址"
              required
              minLength={5}
              maxLength={300}
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                change();
              }}
              placeholder="省市区、街道及详细地址（体验请使用虚拟信息）"
            />
          </label>
        </fieldset>
        <div className="order-total">
          合计 <strong className="price">¥ {money(p.price * quantity)}</strong>
        </div>
        <p className="commerce-note">
          提交后保留库存15分钟。未付款可取消，超时自动取消。
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "提交中…" : "提交演示订单"}
        </button>
      </form>
    </Modal>
  );
}
export function Orders({
  seller = false,
  ...props
}: CommerceProps & { seller?: boolean }) {
  const [retry, setRetry] = useState(0),
    [detail, setDetail] = useState<string | null>(null),
    [reviewOrder, setReviewOrder] = useState<Order | null>(null),
    [filter, setFilter] = useState("ALL"),
    [busy, setBusy] = useState(""),
    [actionError, setActionError] = useState("");
  const { data, error, loading } = useRemote<Order[]>(
    props.user ? (seller ? "/shop/orders" : "/me/orders") : null,
    retry,
  );
  useEffect(() => {
    if (!props.user) return;
    const timer = setInterval(() => setRetry((n) => n + 1), 30000);
    return () => clearInterval(timer);
  }, [props.user?.id]);
  async function action(o: Order, verb: string) {
    if (busy) return;
    setBusy(o.orderNo);
    setActionError("");
    try {
      const updated = await api<Order>(
        (seller ? "/shop/orders/" : "/me/orders/") + o.orderNo + "/" + verb,
        { method: "POST" },
      );
      props.toast(
        updated.status === "CANCELLED"
          ? "订单已取消，库存已释放"
          : verb === "demo-pay"
            ? "模拟支付完成，未产生真实扣款"
            : verb === "ship"
              ? "已标记演示发货"
              : "已确认收货",
      );
      setRetry((n) => n + 1);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  if (!props.user) return <CommerceLogin onLogin={props.onLogin} />;
  const visible = data?.filter((o) => filter === "ALL" || o.status === filter);
  return (
    <section className="commerce-page orders-page">
      <div className="commerce-heading">
        <div>
          <p className="eyebrow">
            {seller ? "店铺经营" : "每一份心动，都有记录"}
          </p>
          <h1>{seller ? "店铺订单" : "我的订单"}</h1>
        </div>
        <button className="secondary" onClick={() => setRetry((n) => n + 1)}>
          刷新
        </button>
      </div>
      <p className="commerce-note">
        当前为演示订单，支付和发货仅用于体验，不会实际扣款或寄送。
      </p>
      <div className="order-tabs" aria-label="订单状态">
        {Object.entries({ ALL: "全部", ...states }).map(([key, label]) => (
          <button
            className={key === filter ? "selected" : ""}
            key={key}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <LoadState
        loading={loading}
        error={error}
        retry={() => setRetry((n) => n + 1)}
      />
      {actionError && (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      )}
      {!loading && visible?.length === 0 && (
        <div className="empty">
          <ShoppingBag />
          <h3>暂时没有{filter === "ALL" ? "" : states[filter]}订单</h3>
          {!seller && (
            <button
              className="secondary"
              onClick={() => props.onNavigate("mall")}
            >
              去商城逛逛
            </button>
          )}
        </div>
      )}
      <div className="order-list">
        {visible?.map((o) => (
          <article className="order-card" key={o.orderNo}>
            <div className="order-head">
              <button onClick={() => props.onNavigate("store/" + o.shopId)}>
                <Store size={16} />
                {o.shopName}
                <ChevronRight size={14} />
              </button>
              <span className={"order-state state-" + o.status}>
                {states[o.status]}
              </span>
            </div>
            <button
              className="order-product order-detail-trigger"
              onClick={() => setDetail(o.orderNo)}
            >
              <div className="order-image">
                <ProductImage src={o.imageUrl} name={o.productName} />
              </div>
              <div>
                <h3>{o.productName}</h3>
                {o.variantName && <p className="selected-variant">{o.variantName}</p>}
                <p>
                  ¥ {money(o.unitPrice)} × {o.quantity}
                </p>
                <small>{o.orderNo}</small>
              </div>
            </button>
            <details>
              <summary>收货信息与下单时间</summary>
              <p>
                {o.recipient} · {o.phone}
              </p>
              <p>{o.address}</p>
              <p>{new Date(o.createTime).toLocaleString("zh-CN")}</p>
            </details>
            <div className="order-footer">
              <span>
                合计 <strong>¥ {money(o.totalAmount)}</strong>
              </span>
              <div>
                {!seller && o.status === "PENDING" && (
                  <>
                    <button
                      className="secondary"
                      disabled={!!busy}
                      onClick={() => action(o, "cancel")}
                    >
                      取消订单
                    </button>
                    <button
                      className="primary"
                      disabled={!!busy}
                      onClick={() => action(o, "demo-pay")}
                    >
                      模拟支付
                    </button>
                  </>
                )}
                {seller && o.status === "PAID" && (
                  <button
                    className="primary"
                    disabled={!!busy}
                    onClick={() => action(o, "ship")}
                  >
                    演示发货
                  </button>
                )}
                {!seller && o.status === "SHIPPED" && (
                  <button
                    className="primary"
                    disabled={!!busy}
                    onClick={() => action(o, "complete")}
                  >
                    确认收货
                  </button>
                )}
                {!seller && o.status === "COMPLETED" && (
                  <button
                    className="secondary"
                    onClick={() => setReviewOrder(o)}
                  >
                    {o.reviewed ? "查看评价" : "评价商品"}
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
      {detail && (
        <OrderDetail
          no={detail}
          seller={seller}
          onClose={() => setDetail(null)}
        />
      )}
      {reviewOrder && (
        <Modal label="商品评价" className="commerce-modal" onClose={() => setReviewOrder(null)}>
          <div className="commerce-modal-heading">
            <h2>{reviewOrder.productName}</h2>
            <button className="icon-button" aria-label="关闭商品评价" onClick={() => setReviewOrder(null)}><X /></button>
          </div>
          <ProductReviews
            key={reviewOrder.orderNo}
            productId={reviewOrder.productId}
            initialOrderNo={reviewOrder.orderNo}
            onPublished={() => setRetry((n) => n + 1)}
            props={props}
          />
        </Modal>
      )}
    </section>
  );
}
export function VideoProducts({
  id,
  onNavigate,
}: {
  id: number;
  onNavigate: (path: string) => void;
}) {
  const { data } = useRemote<Product[]>("/dramas/" + id + "/products");
  const [open, setOpen] = useState(false);
  if (!data?.length) return null;
  const p = data[0];
  return (
    <div className="video-commerce">
      <div className="video-product-card">
        <button
          className="video-product-main"
          onClick={() => onNavigate("product/" + p.id)}
        >
          <span className="video-product-image">
            <ProductImage src={p.imageUrl} name={p.name} />
          </span>
          <span>
            <small>视频同款 · {data.length} 件好物</small>
            <strong>{p.name}</strong>
            <b>¥ {money(p.price)}{Boolean(p.hasVariants) && " 起"}</b>
          </span>
        </button>
        <button
          className="video-shop-link"
          onClick={() => onNavigate("store/" + p.shopId)}
        >
          <Store size={15} />
          进店
        </button>
        <button className="secondary" onClick={() => setOpen((v) => !v)}>
          {open ? "收起" : "商品袋"}
        </button>
      </div>
      {open && (
        <div className="video-product-shelf" aria-label="视频商品袋">
          {data.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate("product/" + item.id)}
            >
              <span>
                <ProductImage src={item.imageUrl} name={item.name} />
              </span>
              <strong>{item.name}</strong>
              <b>¥ {money(item.price)}{Boolean(item.hasVariants) && " 起"}</b>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
