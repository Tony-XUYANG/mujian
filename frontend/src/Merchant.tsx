import { useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Clapperboard,
  Package,
  Pencil,
  Plus,
  Store,
  X,
} from "lucide-react";
import { api, type DramaInput } from "./api";
import { Modal } from "./Modal";
import { AttributeMatrixManager, VariantManager } from "./Variants";
import { productCategories } from "./Shopping";
import { CommerceImageField } from "./CommerceImageField";
import {
  CommerceLogin,
  LoadState,
  Orders,
  ProductImage,
  money,
  useRemote,
  type CommerceProps,
  type Product,
  type Shop,
} from "./Commerce";

type Video = DramaInput & { id: number; productIds: number[] };
export function Merchant(props: CommerceProps & { initialTab?: string }) {
  const [retry, setRetry] = useState(0),
    [tab, setTab] = useState(props.initialTab || "products"),
    [editing, setEditing] = useState<Product | null | undefined>(),
    [variantProduct, setVariantProduct] = useState<Product | null>(null),
    [attributeProduct, setAttributeProduct] = useState<Product | null>(null),
    [shopEdit, setShopEdit] = useState(false),
    [publish, setPublish] = useState(false),
    [links, setLinks] = useState<Video | null>(null),
    [busy, setBusy] = useState(false),
    [confirmDelete, setConfirmDelete] = useState<Video | null>(null);
  const { data, error, loading } = useRemote<{
    shop: Shop | null;
    products: Product[];
  }>(props.user ? "/shop/me" : null, retry);
  const videos = useRemote<Video[]>(
    props.user && data?.shop ? "/shop/videos" : null,
    retry,
  );
  const refresh = () => setRetry((n) => n + 1);
  async function toggle(p: Product) {
    if (busy) return;
    setBusy(true);
    try {
      await api("/shop/products/" + p.id + "/status", {
        method: "PUT",
        body: JSON.stringify({ onSale: p.status !== "ON_SALE" }),
      });
      refresh();
      props.toast(
        p.status === "ON_SALE"
          ? "商品已下架，播放页商品卡同步隐藏"
          : "商品已上架",
      );
    } catch (e) {
      props.toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!confirmDelete || busy) return;
    setBusy(true);
    try {
      await api("/shop/videos/" + confirmDelete.id, { method: "DELETE" });
      setConfirmDelete(null);
      refresh();
      props.toast("视频已删除");
    } catch (e) {
      props.toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  if (!props.user) return <CommerceLogin onLogin={props.onLogin} />;
  return (
    <section className="commerce-page merchant-page">
      <button
        className="commerce-back"
        onClick={() => props.onNavigate("profile")}
      >
        <ArrowLeft size={16} />
        返回我的
      </button>
      <LoadState loading={loading} error={error} retry={refresh} />
      {data && !data.shop ? (
        <div className="open-shop-panel">
          <div className="merchant-welcome">
            <Store size={46} />
            <p className="eyebrow">你的好物，从这里出发</p>
            <h1>在幕间，开一家小店</h1>
            <p>
              上架商品，发布带商品的视频，
              <br />
              让喜欢你的故事的人，也发现你的好物。
            </p>
            <div>
              <span>01 填写店铺</span>
              <span>02 上架好物</span>
              <span>03 视频带货</span>
            </div>
          </div>
          <ShopForm
            onSaved={() => {
              refresh();
              props.toast("演示店铺已开通");
            }}
          />
        </div>
      ) : (
        data?.shop && (
          <>
            <div className="commerce-heading">
              <div>
                <p className="eyebrow">我的店铺</p>
                <h1>{data.shop.name}</h1>
              </div>
              <div className="commerce-actions">
                <button className="secondary" onClick={refresh}>
                  刷新
                </button>
                <button
                  className="secondary"
                  onClick={() => props.onNavigate("store/" + data.shop!.id)}
                >
                  查看店铺
                </button>
                <button className="secondary" onClick={() => setShopEdit(true)}>
                  <Pencil size={14} />
                  店铺资料
                </button>
              </div>
            </div>
            <div className="merchant-tabs">
              <button
                className={tab === "products" ? "selected" : ""}
                onClick={() => setTab("products")}
              >
                <Package size={17} />
                商品管理
              </button>
              <button
                className={tab === "videos" ? "selected" : ""}
                onClick={() => setTab("videos")}
              >
                <Clapperboard size={17} />
                带货视频
              </button>
              <button
                className={tab === "orders" ? "selected" : ""}
                onClick={() => setTab("orders")}
              >
                <Store size={17} />
                店铺订单
              </button>
            </div>
            {tab === "products" ? (
              <>
                <div className="merchant-section-title">
                  <h2>
                    店内商品 <small>{data.products.length} 件</small>
                  </h2>
                  <button className="primary" onClick={() => setEditing(null)}>
                    <Plus size={16} />
                    添加商品
                  </button>
                </div>
                {!data.products.length ? (
                  <div className="empty">
                    <Package />
                    <h3>上架第一件好物</h3>
                    <p>填写商品名称、价格与库存后，就可以挂到视频里。</p>
                  </div>
                ) : (
                  <div className="merchant-product-list">
                    {data.products.map((p) => (
                      <article key={p.id}>
                        <div className="merchant-product-image">
                          <ProductImage src={p.imageUrl} name={p.name} />
                        </div>
                        <div>
                          <h3>{p.name}</h3>
                          <p>
                            <strong className="price">
                              ¥ {money(p.price)}
                            </strong>{" "}
                            · 库存 {p.stock}
                          </p>
                          <span className="muted">
                            {p.status === "ON_SALE" ? "在售" : "已下架"}
                          </span>
                        </div>
                        <div className="merchant-product-actions">
                          <button className="secondary" onClick={() => setAttributeProduct(p)}>属性组合</button>
                          <button className="secondary" onClick={() => setVariantProduct(p)}>规格库存</button>
                          <button
                            className="secondary"
                            onClick={() => setEditing(p)}
                          >
                            编辑
                          </button>
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() => toggle(p)}
                          >
                            {p.status === "ON_SALE" ? "下架" : "上架"}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </>
            ) : tab === "videos" ? (
              <>
                <div className="merchant-section-title">
                  <h2>带货视频</h2>
                  <button className="primary" onClick={() => setPublish(true)}>
                    <Plus size={16} />
                    发布视频
                  </button>
                </div>
                <p className="commerce-note">
                  使用视频链接发布，可选择最多6件本店在售商品。请发布有权使用的内容。
                </p>
                <LoadState
                  loading={videos.loading}
                  error={videos.error}
                  retry={refresh}
                />
                {videos.data?.length === 0 && (
                  <div className="empty">
                    <Clapperboard />
                    <h3>还没有带货视频</h3>
                    <p>发布后，观众能从视频下方的商品卡进入你的店铺。</p>
                  </div>
                )}
                <div className="merchant-product-list">
                  {videos.data?.map((v) => (
                    <article key={v.id}>
                      <div className="merchant-product-image">
                        <ProductImage src={v.coverImg} name={v.title} />
                      </div>
                      <div>
                        <h3>{v.title}</h3>
                        <p>已挂载 {v.productIds.length} 件商品</p>
                        <button
                          className="commerce-back"
                          onClick={() => props.onNavigate("watch/" + v.id)}
                        >
                          查看播放效果
                        </button>
                      </div>
                      <div className="merchant-product-actions">
                        <button
                          className="secondary"
                          onClick={() => setLinks(v)}
                        >
                          管理挂载
                        </button>
                        <button
                          className="secondary"
                          onClick={() => setConfirmDelete(v)}
                        >
                          删除视频
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <Orders seller {...props} />
            )}
            {editing !== undefined && (
              <Modal
                label={editing ? "编辑商品" : "添加商品"}
                className="commerce-modal"
                onClose={() => setEditing(undefined)}
              >
                <FormHeading
                  title={editing ? "编辑商品" : "添加商品"}
                  onClose={() => setEditing(undefined)}
                />
                <ProductForm
                  product={editing}
                  onSaved={() => {
                    setEditing(undefined);
                    refresh();
                    props.toast("商品已保存");
                  }}
                />
              </Modal>
            )}
            {variantProduct && <VariantManager product={variantProduct} onClose={() => setVariantProduct(null)} onSaved={() => { setVariantProduct(null); refresh(); props.toast("规格和库存已保存"); }} />}
            {attributeProduct && <AttributeMatrixManager product={attributeProduct} onClose={() => setAttributeProduct(null)} onSaved={() => { setAttributeProduct(null); refresh(); props.toast("属性组合已保存"); }} />}
            {shopEdit && (
              <Modal
                label="店铺资料"
                className="commerce-modal"
                onClose={() => setShopEdit(false)}
              >
                <FormHeading
                  title="店铺资料"
                  onClose={() => setShopEdit(false)}
                />
                <ShopForm
                  shop={data.shop}
                  onSaved={() => {
                    setShopEdit(false);
                    refresh();
                    props.toast("店铺资料已更新");
                  }}
                />
              </Modal>
            )}
            {(publish || links) && (
              <Modal
                label={links ? "管理挂载" : "发布带货视频"}
                className="commerce-modal"
                onClose={() => {
                  setPublish(false);
                  setLinks(null);
                }}
              >
                <FormHeading
                  title={links ? "管理挂载" : "发布带货视频"}
                  onClose={() => {
                    setPublish(false);
                    setLinks(null);
                  }}
                />
                <VideoForm
                  products={data.products}
                  video={links}
                  onSaved={() => {
                    setPublish(false);
                    setLinks(null);
                    refresh();
                    props.toast(
                      links ? "挂载已更新" : "视频已发布，可查看商品卡效果",
                    );
                  }}
                />
              </Modal>
            )}
            {confirmDelete && (
              <Modal
                label="删除视频"
                className="commerce-modal"
                onClose={() => {
                  if (!busy) setConfirmDelete(null);
                }}
              >
                <h2>删除「{confirmDelete.title}」？</h2>
                <p>视频及其评论、观看记录和商品挂载将被移除。</p>
                <div className="modal-actions">
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => setConfirmDelete(null)}
                  >
                    保留
                  </button>
                  <button className="primary" disabled={busy} onClick={remove}>
                    确认删除
                  </button>
                </div>
              </Modal>
            )}
          </>
        )
      )}
    </section>
  );
}
function FormHeading({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="commerce-modal-heading">
      <h2>{title}</h2>
      <button className="icon-button" aria-label="关闭表单" onClick={onClose}>
        <X />
      </button>
    </div>
  );
}
function ShopForm({ shop, onSaved }: { shop?: Shop; onSaved: () => void }) {
  const [form, setForm] = useState({
      name: shop?.name || "",
      logoUrl: shop?.logoUrl || "",
      description: shop?.description || "",
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api(shop ? "/shop/me" : "/shop/register", {
        method: shop ? "PATCH" : "POST",
        body: JSON.stringify(form),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="commerce-form" onSubmit={submit}>
      <fieldset disabled={busy}>
        <label>
          店铺名称
          <input
            required
            maxLength={80}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          店铺头像链接（选填）
          <input
            maxLength={1000}
            placeholder="https://… 或 /media/…"
            value={form.logoUrl}
            onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
          />
        </label>
        <label>
          店铺简介
          <textarea
            maxLength={500}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        {!shop && (
          <>
            <p className="commerce-note">
              每个账号可开通一家演示店铺，当前不收取费用，暂未接入商家资质审核及真实结算。
            </p>
            <label className="commerce-check">
              <input type="checkbox" required />
              我已了解演示规则，将如实填写商品信息
            </label>
          </>
        )}
      </fieldset>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" disabled={busy}>
        {busy ? "保存中…" : shop ? "保存店铺资料" : "开通演示店铺"}
      </button>
    </form>
  );
}
function ProductForm({
  product: p,
  onSaved,
}: {
  product: Product | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
      name: p?.name || "",
      imageUrl: p?.imageUrl || "",
      description: p?.description || "",
      price: p?.price || 1,
      stock: p?.stock || 0,
      version: p?.version,
      details: {
        category: p?.category || "生活日用",
        material: p?.material || "",
        specification: p?.specification || "",
        origin: p?.origin || "",
        shippingFrom: p?.shippingFrom || "",
        detailText: p?.detailText || "",
        images: (() => {
          try {
            return JSON.parse(p?.imagesJson || "[]") as string[];
          } catch {
            return [];
          }
        })(),
      },
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/shop/products" + (p ? "/" + p.id : ""), {
        method: p ? "PATCH" : "POST",
        body: JSON.stringify({
          ...form,
          details: {
            ...form.details,
            images: form.details.images.map((s) => s.trim()).filter(Boolean),
          },
        }),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="commerce-form" onSubmit={submit}>
      <fieldset disabled={busy}>
        <label>
          商品名称
          <input
            required
            maxLength={120}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <CommerceImageField label="商品图片链接（选填）" value={form.imageUrl} onChange={imageUrl => setForm(old => ({ ...old, imageUrl }))} disabled={busy} />
        <label>
          商品介绍
          <textarea
            maxLength={500}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        <label>
          商品分类
          <select
            value={form.details.category}
            onChange={(e) =>
              setForm({
                ...form,
                details: { ...form.details, category: e.target.value },
              })
            }
          >
            {productCategories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <div className="commerce-field-row">
          <label>
            售价（元）
            <input
              required
              type="number"
              min="0.01"
              max="99999999.99"
              step="0.01"
              value={form.price}
              readOnly={Boolean(p?.hasVariants)}
              onChange={(e) =>
                setForm({ ...form, price: Number(e.target.value) })
              }
            />
          </label>
          <label>
            可售库存
            <input
              required
              type="number"
              min="0"
              max="999999"
              step="1"
              value={form.stock}
              readOnly={Boolean(p?.hasVariants)}
              onChange={(e) =>
                setForm({ ...form, stock: Number(e.target.value) })
              }
            />
          </label>
        </div>
        {Boolean(p?.hasVariants) && <p className="commerce-note">价格和库存由各规格汇总，请在商品列表的“规格库存”中修改。</p>}
        <div className="commerce-field-row">
          <label>
            商品材质
            <input
              maxLength={100}
              value={form.details.material}
              onChange={(e) =>
                setForm({
                  ...form,
                  details: { ...form.details, material: e.target.value },
                })
              }
            />
          </label>
          <label>
            规格说明
            <input
              maxLength={100}
              placeholder="如：350毫升 · 单只装"
              value={form.details.specification}
              onChange={(e) =>
                setForm({
                  ...form,
                  details: { ...form.details, specification: e.target.value },
                })
              }
            />
          </label>
          <label>
            产地
            <input
              maxLength={80}
              value={form.details.origin}
              onChange={(e) =>
                setForm({
                  ...form,
                  details: { ...form.details, origin: e.target.value },
                })
              }
            />
          </label>
          <label>
            发货地
            <input
              maxLength={80}
              value={form.details.shippingFrom}
              onChange={(e) =>
                setForm({
                  ...form,
                  details: { ...form.details, shippingFrom: e.target.value },
                })
              }
            />
          </label>
        </div>
        <label>
          图文详情
          <textarea
            aria-label="图文详情"
            maxLength={4000}
            rows={5}
            value={form.details.detailText}
            onChange={(e) =>
              setForm({
                ...form,
                details: { ...form.details, detailText: e.target.value },
              })
            }
          />
        </label>
        <label>
          商品相册链接（每行一张，最多6张）
          <textarea
            aria-label="商品相册链接（每行一张，最多6张）"
            value={form.details.images.join("\n")}
            onChange={(e) =>
              setForm({
                ...form,
                details: {
                  ...form.details,
                  images: e.target.value.split("\n"),
                },
              })
            }
          />
        </label>
        <div className="commerce-gallery-editor" aria-label="商品相册图片">
          {form.details.images.map((imageUrl, i) => <div key={i}>
            <CommerceImageField label={'相册图片' + (i + 1)} value={imageUrl} disabled={busy} onChange={url => setForm(old => ({ ...old, details: { ...old.details, images: old.details.images.map((s,n) => n === i ? url : s) } }))} />
            <button type="button" className="secondary compact-button" aria-label={'移除相册图片' + (i + 1)} onClick={() => setForm(old => ({ ...old, details: { ...old.details, images: old.details.images.filter((_,n) => n !== i) } }))}>移除这张</button>
          </div>)}
          <button type="button" className="secondary" disabled={form.details.images.length >= 6} onClick={() => setForm(old => ({ ...old, details: { ...old.details, images: [...old.details.images, ''] } }))}><Plus size={14} />添加相册图片</button>
        </div>
      </fieldset>
      <p className="commerce-note">
        库存表示当前可售数量。待付款订单取消后，会自动返还对应数量。
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" disabled={busy}>
        {busy ? "保存中…" : p ? "保存商品" : "上架商品"}
      </button>
    </form>
  );
}
function VideoForm({
  products,
  video,
  onSaved,
}: {
  products: Product[];
  video: Video | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<DramaInput>({
      title: "",
      description: "",
      coverImg: "/media/forest.jpg",
      videoUrl: "/media/sintel-trailer.mp4",
      category: "都市",
    }),
    [ids, setIds] = useState<number[]>(video?.productIds || []),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const onSale = products.filter((p) => p.status === "ON_SALE");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/shop/videos" + (video ? "/" + video.id + "/products" : ""), {
        method: video ? "PUT" : "POST",
        body: JSON.stringify(
          video ? { productIds: ids } : { video: form, productIds: ids },
        ),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="commerce-form" onSubmit={submit}>
      <fieldset disabled={busy}>
        {!video && (
          <>
            <label>
              视频标题
              <input
                required
                maxLength={80}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <label>
              视频简介
              <textarea
                required
                maxLength={2000}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </label>
            <label>
              封面链接
              <input
                required
                maxLength={1000}
                value={form.coverImg}
                onChange={(e) => setForm({ ...form, coverImg: e.target.value })}
              />
            </label>
            <label>
              视频链接
              <input
                required
                maxLength={1000}
                value={form.videoUrl}
                onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
              />
            </label>
            <p className="commerce-note">
              默认资源是演示片源。发布自有内容时，请替换为可播放的视频链接。
            </p>
            <label>
              内容分类
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {["都市", "悬疑", "治愈", "古装", "爱情"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </>
        )}
        <h3>
          挂载本店商品 <small>{ids.length} / 6</small>
        </h3>
        {!onSale.length && <p>暂无在售商品，可以先发布视频，之后再挂载。</p>}
        <div className="product-picker">
          {products.map((p) => (
            <label key={p.id} className="commerce-check">
              <input
                type="checkbox"
                checked={ids.includes(p.id)}
                disabled={
                  !ids.includes(p.id) &&
                  (ids.length >= 6 || p.status !== "ON_SALE")
                }
                onChange={(e) =>
                  setIds(
                    e.target.checked
                      ? [...ids, p.id]
                      : ids.filter((id) => id !== p.id),
                  )
                }
              />
              <span>
                {p.name}
                <small>
                  ¥ {money(p.price)}
                  {p.status !== "ON_SALE" ? " · 已下架，请取消勾选" : ""}
                </small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" disabled={busy}>
        {busy ? "保存中…" : video ? "保存挂载" : "发布视频"}
      </button>
    </form>
  );
}
