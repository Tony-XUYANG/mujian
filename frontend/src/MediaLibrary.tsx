import { useEffect, useState } from 'react';
import { Archive, Check, Images, RotateCcw, Search, X } from 'lucide-react';
import { api } from './api';
import { ProductImage, LoadState } from './Commerce';
import { Modal } from './Modal';
import './media-library.css';

type Media = { id: number; name: string; url: string; bytes: number; width: number; height: number; createTime: string; archived: boolean | number; productCount: number; orderCount: number };
type Library = { items: Media[]; total: number; page: number; pages: number; stats: { retained: number; bytes: number; limit: number; hourlyUploads: number; hourlyLimit: number } };
const sizeText = (n: number) => n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1000)) + ' KB';

export function MediaPicker({ current, onSelect, onClose }: { current?: string | null; onSelect: (url: string) => void; onClose: () => void }) {
  return <Modal label="选择商品图片" className="media-library-modal" onClose={onClose}>
    <div className="media-heading"><div><h2>选择商品图片</h2><p>复用本店素材，保存表单后生效</p></div><button type="button" className="secondary" aria-label="关闭素材选择" onClick={onClose}><X size={18} /></button></div>
    <MediaLibrary current={current} onSelect={onSelect} />
  </Modal>;
}

export function MediaLibrary({ current, onSelect, refresh = 0 }: { current?: string | null; onSelect?: (url: string) => void; refresh?: number }) {
  const [query, setQuery] = useState(''), [search, setSearch] = useState('');
  const [usage, setUsage] = useState('all'), [archived, setArchived] = useState(false), [page, setPage] = useState(0);
  const [data, setData] = useState<Library | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [retry, setRetry] = useState(0), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [actionError, setActionError] = useState('');
  const [editing, setEditing] = useState<number | null>(null), [name, setName] = useState('');
  useEffect(() => { const timer = window.setTimeout(() => { setSearch(query.trim()); setPage(0); }, 250); return () => clearTimeout(timer); }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setData(null);
    const params = new URLSearchParams({ q: search, usage, archived: String(archived), page: String(page), size: '12' });
    api<Library>('/shop/media/images?' + params, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [search, usage, archived, page, retry, refresh]);
  async function change(item: Media, action: 'name' | 'archive') {
    if (busy) return;
    setBusy(true); setActionError(''); setNotice('');
    try {
      await api('/shop/media/images/' + item.id + '/' + action, { method: action === 'name' ? 'PATCH' : 'PUT', body: JSON.stringify(action === 'name' ? { name } : { archived: !item.archived }) });
      setEditing(null); setRetry(n => n + 1);
      setNotice(action === 'name' ? '图片名称已保存' : item.archived ? '图片已恢复，可在表单中选择' : '图片已收起，商品和订单中的图片继续保留');
    } catch (e) { setActionError((e as Error).message); } finally { setBusy(false); }
  }
  function resetList() { setPage(0); setEditing(null); setNotice(''); setActionError(''); }
  return <section className="media-library" aria-label={onSelect ? '选择素材' : '店铺图片素材库'}>
    {!onSelect && <>
      <div className="media-heading"><div><p className="eyebrow">一次上传，多处使用</p><h2><Images size={21} />图片素材</h2><p>在商品编辑中上传图片，就会保存在这里。</p></div><button type="button" className="secondary" disabled={busy || loading} onClick={() => setRetry(n => n + 1)}>刷新素材</button></div>
      {data && <div className="media-summary"><span>已保存 <strong>{data.stats.retained} / {data.stats.limit}</strong> 张</span><span>占用 <strong>{data.stats.bytes ? sizeText(data.stats.bytes) : '0 KB'}</strong></span><span>近一小时可再上传 <strong>{Math.max(0, Math.min(data.stats.limit - data.stats.retained, data.stats.hourlyLimit - data.stats.hourlyUploads))}</strong> 张</span></div>}
      <div className="media-visibility" aria-label="素材范围">{[[false, '常用素材'], [true, '已收起']] .map(([value, label]) => <button type="button" key={String(value)} className={archived === value ? 'selected' : ''} disabled={busy} aria-pressed={archived === value} onClick={() => { setArchived(value as boolean); resetList(); }}>{label}</button>)}</div>
    </>}
    <div className="media-toolbar">
      <label className="media-search"><Search size={17} /><input aria-label="搜索图片名称" value={query} maxLength={80} disabled={busy} placeholder="搜索图片名称" onChange={e => { setQuery(e.target.value); setEditing(null); }} /></label>
      <label className="media-filter">用途<select aria-label="筛选图片用途" value={usage} disabled={busy} onChange={e => { setUsage(e.target.value); resetList(); }}><option value="all">全部图片</option><option value="products">商品使用</option><option value="orders">订单留存</option><option value="unused">尚未引用</option></select></label>
    </div>
    {notice && <p className="media-notice" role="status">{notice}</p>}
    {actionError && <p className="form-error" role="alert">{actionError}</p>}
    <LoadState loading={loading} error={error} retry={() => setRetry(n => n + 1)} />
    {data && <>
      <p className="media-result">共 {data.total} 张{onSelect && ' · 点击图片即可选择'}</p>
      {!data.items.length ? <div className="empty"><Images size={30} /><h3>{search || usage !== 'all' ? '没有符合条件的图片' : archived ? '暂无收起的图片' : '还没有常用图片'}</h3><p>{search || usage !== 'all' ? '试试其他名称或用途。' : onSelect ? '可关闭窗口，在表单中上传新图片；已收起的图片需先到素材库恢复。' : archived ? '收起的素材可在这里恢复。' : '在商品主图、相册或规格中上传，也可恢复已收起的图片。'}</p></div> :
        <div className="media-grid">{data.items.map(item => <article className={'media-card' + (current === item.url ? ' is-current' : '')} key={item.id}>
          {onSelect ? <button type="button" className="media-picture" aria-label={'选择图片：' + item.name} onClick={() => onSelect(item.url)}><ProductImage src={item.url} name={item.name} />{current === item.url && <span className="media-current"><Check size={14} />当前图片</span>}</button> : <div className="media-picture"><ProductImage src={item.url} name={item.name} /></div>}
          <div className="media-card-body"><h3 title={item.name}>{item.name}</h3><p className="media-dimensions">{item.width} × {item.height} · {sizeText(item.bytes)}</p>
            <div className="media-usage">{item.productCount > 0 && <span>{item.productCount} 件商品</span>}{item.orderCount > 0 && <span>{item.orderCount} 笔订单</span>}{!item.productCount && !item.orderCount && <span className="unused">尚未引用</span>}</div>
            <small>{new Date(item.createTime).toLocaleDateString('zh-CN')}</small>
            {!onSelect && (editing === item.id ? <div className="media-rename"><input aria-label="新图片名称" autoFocus value={name} maxLength={80} disabled={busy} onChange={e => setName(e.target.value)} onKeyDown={e => { if(e.key === 'Enter') { e.preventDefault(); void change(item, 'name'); } }} /><div><button type="button" className="primary" disabled={busy || !name.trim()} onClick={() => void change(item, 'name')}>保存名称</button><button type="button" className="secondary" disabled={busy} onClick={() => setEditing(null)}>取消</button></div></div> : <div className="media-card-actions"><button type="button" className="secondary" disabled={busy} onClick={() => { setEditing(item.id); setName(item.name); setActionError(''); }}>重命名</button><button type="button" className="secondary" disabled={busy} onClick={() => void change(item, 'archive')}>{item.archived ? <RotateCcw size={13} /> : <Archive size={13} />}{item.archived ? '恢复' : '收起'}</button></div>)}
          </div>
        </article>)}</div>}
      {data.pages > 1 && <nav className="media-pagination" aria-label="素材分页"><button type="button" className="secondary" disabled={busy || data.page === 0} onClick={() => { setPage(data.page - 1); setEditing(null); }}>上一页</button><span>{data.page + 1} / {data.pages}</span><button type="button" className="secondary" disabled={busy || data.page + 1 >= data.pages} onClick={() => { setPage(data.page + 1); setEditing(null); }}>下一页</button></nav>}
    </>}
    {!onSelect && <p className="media-footnote">收起后可随时恢复，不会删除文件或释放额度。引用包含下架商品、停售规格及已取消订单；同一商品的多处用图只计一件。</p>}
  </section>;
}
