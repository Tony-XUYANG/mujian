import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { AlertCircle, ArrowUpRight, Bookmark, Camera, Check, History, LoaderCircle, Pencil, Search, Trash2, UserRound, X } from 'lucide-react';
import { api, type Drama, type User } from './api';
import { Modal } from './Modal';
import { ProfileImageEditor, type ProfileImageKind } from './ProfileImageEditor';

type Tab = 'history' | 'favorites';
type Props = {
  user: User | null; onLogin: () => void; onNavigate: (target: string) => void; onView: (id: number) => void;
  onUserUpdated: (user: User) => void; toast: (text: string, error?: boolean) => void; refresh: number;
};

export function Profile({ user, onLogin, onNavigate, onView, onUserUpdated, toast, refresh }: Props) {
  const [history, setHistory] = useState<Drama[]>([]);
  const [favorites, setFavorites] = useState<Drama[]>([]);
  const [tab, setTab] = useState<Tab>('history');
  const [online, setOnline] = useState(navigator.onLine);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [image, setImage] = useState<{ kind: ProfileImageKind; file: File } | null>(null);
  const [editing, setEditing] = useState(false);
  const [managing, setManaging] = useState(false);
  const [query, setQuery] = useState('');
  const [removing, setRemoving] = useState<{ drama: Drama; tab: Tab } | null>(null);
  const [busy, setBusy] = useState(false);
  const [removeError, setRemoveError] = useState('');
  const avatarInput = useRef<HTMLInputElement>(null);
  const backgroundInput = useRef<HTMLInputElement>(null);
  const owner = useRef(user?.id);
  useEffect(() => () => { owner.current = undefined; }, []);

  useEffect(() => {
    const update = () => { setOnline(navigator.onLine); if (navigator.onLine) setRetry(value => value + 1); };
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let active = true;
    setLoading(true); setError('');
    Promise.all([api<Drama[]>('/me/history'), api<Drama[]>('/me/favorites')])
      .then(([watched, saved]) => { if (active) { setHistory(watched); setFavorites(saved); } })
      .catch(failure => { if (active) setError((failure as Error).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.id, refresh, retry]);

  function chooseImage(kind: ProfileImageKind, file?: File) {
    if (!file) return;
    if (file.size > 5_000_000) { toast('请选择不超过5MB的图片', true); return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast('请选择 JPG、PNG 或 WebP 图片', true); return;
    }
    setImage({ kind, file });
  }

  async function upload(file: File) {
    if (!user || !image) return;
    const data = new FormData(); data.append('file', file);
    const result = await api<{ url: string }>(`/auth/profile/${image.kind}`, { method: 'POST', body: data });
    if (owner.current !== user.id) return;
    onUserUpdated({ ...user, [image.kind === 'avatar' ? 'avatarUrl' : 'backgroundUrl']: result.url });
    toast(image.kind === 'avatar' ? '头像已更新' : '主页背景已更新');
  }

  function changeTab(next: Tab) { setTab(next); setManaging(false); setQuery(''); }
  function tabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'history' : event.key === 'End' ? 'favorites' : tab === 'history' ? 'favorites' : 'history';
    changeTab(next);
    document.getElementById(`profile-tab-${next}`)?.focus();
  }

  async function remove() {
    if (!removing || busy) return;
    setBusy(true); setRemoveError('');
    try {
      await api(removing.tab === 'history' ? `/me/history/${removing.drama.id}` : `/dramas/${removing.drama.id}/favorite`, { method: 'DELETE' });
      const update = removing.tab === 'history' ? setHistory : setFavorites;
      update(items => items.filter(item => item.id !== removing.drama.id));
      setRemoving(null);
      toast(removing.tab === 'history' ? '已移除观看记录' : '已取消收藏');
    } catch (failure) { setRemoveError((failure as Error).message); }
    finally { setBusy(false); }
  }

  if (!user) return <div className="profile-empty empty"><UserRound size={42} /><h2>登录你的幕间 App</h2><p>登录后收藏短剧，播放进度也会自动记住。</p><button className="primary" onClick={onLogin}>登录 / 注册</button></div>;
  const items = tab === 'history' ? history : favorites;
  const visible = items.filter(item => item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const cover = user.backgroundUrl || favorites[0]?.coverImg || history[0]?.coverImg || '/media/forest.jpg';

  return <div className="profile-page profile-shell">
    <input className="profile-file-input" ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="选择头像图片" onChange={event => { chooseImage('avatar', event.target.files?.[0]); event.target.value = ''; }} />
    <input className="profile-file-input" ref={backgroundInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="选择背景图片" onChange={event => { chooseImage('background', event.target.files?.[0]); event.target.value = ''; }} />
    <section className="profile-cover" style={{ backgroundImage: `url("${cover}")` }}>
      <div className="profile-cover-shade" />
      <div className="profile-cover-bar"><span>我的主页</span><span className={`profile-live-dot ${online ? '' : 'is-offline'}`}>{online ? '在线' : '离线'}</span></div>
      <button className="profile-change-cover" onClick={() => backgroundInput.current?.click()}><Camera size={15} />更换背景</button>
    </section>
    <section className="profile-user">
      <button className="profile-avatar-xl" onClick={() => avatarInput.current?.click()} aria-label="更换头像">{user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : [...user.nickname][0]}<span><Camera size={16} /></span></button>
      <div className="profile-identity"><h1>{user.nickname}</h1><p>@{user.username}</p></div>
    </section>
    <div className="profile-summary">
      <div className="profile-stats"><button className={`profile-stat ${tab === 'favorites' ? 'active' : ''}`} onClick={() => changeTab('favorites')}><strong>{loading ? '—' : favorites.length}</strong><span>我的收藏</span></button><button className={`profile-stat ${tab === 'history' ? 'active' : ''}`} onClick={() => changeTab('history')}><strong>{loading ? '—' : history.length}</strong><span>观看记录</span></button></div>
      <button className="profile-edit" onClick={() => setEditing(true)}><Pencil size={15} />编辑资料</button>
    </div>
    <section className="profile-library"><button className="profile-follow-entry" onClick={()=>onNavigate('following')}><Bookmark size={19}/><span>我的追剧<small>查看连载更新，继续未看完的故事</small></span><ArrowUpRight size={17}/></button>
      <div className="profile-tabs" role="tablist" aria-label="个人片单">{(['history', 'favorites'] as const).map(value => <button key={value} id={`profile-tab-${value}`} role="tab" aria-selected={tab === value} aria-controls="profile-panel" tabIndex={tab === value ? 0 : -1} className={tab === value ? 'selected' : ''} onKeyDown={tabKey} onClick={() => changeTab(value)}>{value === 'history' ? <History size={16} /> : <Bookmark size={16} />}{value === 'history' ? '观看记录' : '我的收藏'}</button>)}</div>
      <div id="profile-panel" role="tabpanel" aria-labelledby={`profile-tab-${tab}`} aria-busy={loading}>
        {!loading && !error && items.length > 0 && <div className="profile-library-tools"><div className="profile-search"><Search size={16} /><input aria-label="搜索当前片单" placeholder={tab === 'history' ? '搜索观看记录' : '搜索我的收藏'} value={query} onChange={event => setQuery(event.target.value)} />{query && <button aria-label="清空片单搜索" onClick={() => setQuery('')}><X size={16} /></button>}</div><button className={`profile-manage ${managing ? 'active' : ''}`} onClick={() => setManaging(value => !value)}>{managing ? <Check size={16} /> : <Pencil size={15} />}{managing ? '完成管理' : '管理片单'}</button></div>}
        {loading ? <div className="profile-drama-grid" aria-label="正在加载片单">{Array.from({ length: 4 }, (_, i) => <div className="profile-loading" key={i} />)}</div> : error ? <div className="profile-empty-state"><AlertCircle size={24} /><h3>片单暂时加载失败</h3><p>{error}</p><button className="secondary" onClick={() => setRetry(value => value + 1)}>重试</button></div> : visible.length ? <div className="profile-drama-grid">{visible.map(drama => {
          const progress = drama.durationSec ? Math.min(100, Math.round((drama.progressSec || 0) / drama.durationSec * 100)) : 0;
          return <article className="profile-drama-item" key={drama.id}><button className="profile-drama-card" onClick={() => onView(drama.id)} aria-label={`观看${drama.title}`}><div className="profile-drama-poster"><img src={drama.coverImg} alt={`${drama.title}封面`} loading="lazy" /><span>{drama.category}</span>{tab === 'history' && <><b>{progress >= 95 ? '已看完' : `已看 ${progress}%`}</b><i className="profile-progress" style={{ width: `${progress}%` }} /></>}</div><strong>{drama.title}</strong><small>{tab === 'history' ? progress >= 95 ? '再看一次' : (drama.resumeEpisodeNo?'第'+drama.resumeEpisodeNo+'集 · 继续观看':'从上次位置继续') : '已收藏 · 随时重看'}</small></button>{managing && <button className="profile-remove" onClick={() => { setRemoving({ drama, tab }); setRemoveError(''); }} aria-label={tab === 'history' ? `移除${drama.title}的观看记录` : `取消收藏${drama.title}`}><Trash2 size={15} />{tab === 'history' ? '移除记录' : '取消收藏'}</button>}</article>;
        })}</div> : <div className="profile-empty-state"><div className="profile-empty-icon">{query ? <Search size={22} /> : tab === 'history' ? <History size={22} /> : <Bookmark size={22} />}</div><h3>{query ? '没有找到这部短剧' : tab === 'history' ? '还没有观看记录' : '还没有收藏短剧'}</h3><p>{query ? '换个关键词，或清空搜索查看全部片单。' : tab === 'history' ? '打开一部短剧，播放几秒后就能在这里继续。' : '收藏喜欢的故事，之后可以快速找到。'}</p><button className="secondary" onClick={() => query ? setQuery('') : onNavigate('home')}>{query ? '清空搜索' : '去发现好剧'}<ArrowUpRight size={15} /></button></div>}
      </div>
    </section>
    {image && <ProfileImageEditor file={image.file} kind={image.kind} onClose={() => setImage(null)} onSave={upload} />}
    {editing && <ProfileDetails user={user} onClose={() => setEditing(false)} onSaved={updated => { if (owner.current === updated.id) { onUserUpdated(updated); toast('昵称已更新'); } }} />}
    {removing && <Modal label={removing.tab === 'history' ? '移除观看记录' : '取消收藏'} onClose={() => { if (!busy) setRemoving(null); }}><h2>{removing.tab === 'history' ? '移除这条观看记录？' : '取消收藏这部短剧？'}</h2><p className="muted">{`「${removing.drama.title}」${removing.tab === 'history' ? '的观看进度将一并移除，收藏不受影响。' : '将从收藏片单移除，观看记录不受影响。'}`}</p>{removeError && <p className="form-error" role="alert">{removeError}</p>}<div className="modal-actions"><button className="secondary" disabled={busy} onClick={() => setRemoving(null)}>保留</button><button className="primary destructive" disabled={busy} onClick={remove}>{busy ? '处理中…' : '确认移除'}</button></div></Modal>}
  </div>;
}

function ProfileDetails({ user, onClose, onSaved }: { user: User; onClose: () => void; onSaved: (user: User) => void }) {
  const [nickname, setNickname] = useState(user.nickname);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    const value = nickname.trim();
    if (!value || value.length > 30 || /[\u0000-\u001f\u007f-\u009f]/.test(value)) { setError('请输入1–30字昵称，不要包含换行或控制字符'); return; }
    setBusy(true); setError('');
    try {
      const updated = await api<User>('/auth/profile', { method: 'PATCH', body: JSON.stringify({ nickname: value }) });
      onSaved(updated); onClose();
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  return <Modal label="编辑资料" onClose={() => { if (!busy) onClose(); }}><button className="close icon-button" aria-label="关闭资料编辑" disabled={busy} onClick={onClose}><X /></button><h2>编辑资料</h2><p className="muted">换个喜欢的昵称，让主页更像你。</p><form noValidate onSubmit={save}><label>昵称<input aria-label="昵称" autoComplete="nickname" maxLength={30} value={nickname} disabled={busy} onChange={event => setNickname(event.target.value)} /></label><p className="field-hint">{nickname.length}/30 字 · 登录用户名保持为 @{user.username}</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>取消</button><button className="primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}保存资料</button></div></form></Modal>;
}
