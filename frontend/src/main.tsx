import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Play, Search, Bookmark, Compass, Flame, ArrowUpRight, ArrowLeft, Heart, X, LogOut, ChevronRight, Film, Plus, Pencil, Trash2, LayoutDashboard, Users, Eye, Check, Menu, LoaderCircle, CheckCircle2, AlertCircle, SlidersHorizontal } from 'lucide-react';
import { api, count, type Drama, type DramaInput, type User } from './api';
import './style.css';

const categories = ['全部','都市','悬疑','治愈','古装','爱情'];
const emptyInput: DramaInput = { title:'', coverImg:'/media/forest.jpg', description:'', videoUrl:'/media/sintel-trailer.mp4', category:'都市' };
type Notice = { text:string; error?:boolean };
const routeNow = () => window.location.hash.replace('#','') || 'home';

function App() {
  const [user,setUser]=useState<User|null>(null);
  const [route,setRoute]=useState(routeNow);
  const [category,setCategory]=useState('全部');
  const [query,setQuery]=useState('');
  const [search,setSearch]=useState('');
  const [sort,setSort]=useState('latest');
  const [dramas,setDramas]=useState<Drama[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [refresh,setRefresh]=useState(0);
  const [auth,setAuth]=useState(false);
  const [selected,setSelected]=useState<number|null>(null);
  const [notice,setNotice]=useState<Notice|null>(null);
  const [ready,setReady]=useState(false);
  const toast=(text:string,error=false)=>setNotice({text,error});
  const reload=()=>setRefresh(n=>n+1);
  useEffect(()=>{ const change=()=>{setRoute(routeNow());setQuery('');setSearch('');setCategory('全部');};window.addEventListener('hashchange',change); return()=>window.removeEventListener('hashchange',change);},[]);
  useEffect(()=>{const t=setTimeout(()=>setSearch(query.trim()),250);return()=>clearTimeout(t);},[query]);
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(null),3500);return()=>clearTimeout(t);},[notice]);
  useEffect(()=>{
    if(sessionStorage.getItem('mujian_token')) api<User>('/auth/me').then(setUser).catch(()=>sessionStorage.removeItem('mujian_token')).finally(()=>setReady(true));
    else setReady(true);
    const expire=()=>{setUser(null);setAuth(true);toast('登录已过期，请重新登录',true);};
    window.addEventListener('session-expired',expire);return()=>window.removeEventListener('session-expired',expire);
  },[]);
  useEffect(()=>{
    if(!ready)return;
    let active=true;
    if(route==='favorites'&&!user){setDramas([]);setLoading(false);setError('');return;}
    setLoading(true);setError('');
    const path=route==='favorites'?'/me/favorites':`/dramas?q=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}&sort=${route==='popular'?'popular':sort}`;
    api<Drama[]>(path).then(data=>{if(active)setDramas(data);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[ready,user,route,search,category,sort,refresh]);
  const navigate=(target:string)=>{window.location.hash=target;setSelected(null);};
  const logout=()=>{sessionStorage.removeItem('mujian_token');setUser(null);navigate('home');toast('已退出登录');};
  const login=(data:{token:string;user:User})=>{sessionStorage.setItem('mujian_token',data.token);setUser(data.user);setAuth(false);reload();toast(`欢迎回来，${data.user.nickname}`);};
  const featured=dramas.find(d=>d.title==='等风，也等你')||dramas[0];
  const isHome=route==='home';
  return <div className="app">
    <aside className="sidebar">
      <a className="brand" href="#home" aria-label="幕间首页"><span className="brand-icon"><Play size={23} fill="currentColor"/></span><span>幕间<small>MUJIAN</small></span></a>
      <p className="nav-label">你的片刻，值得好故事</p>
      <nav aria-label="主导航">
        <button className={isHome?'nav-item active':'nav-item'} onClick={()=>navigate('home')}><Compass size={20}/>发现好剧<span className="active-dot"/></button>
        <button className={route==='popular'?'nav-item active':'nav-item'} onClick={()=>navigate('popular')}><Flame size={20}/>人气榜单</button>
        <button className={route==='favorites'?'nav-item active':'nav-item'} onClick={()=>navigate('favorites')}><Bookmark size={20}/>我的收藏</button>
        {user?.role==='ADMIN'&&<><div className="nav-divider"/><button className={route==='admin'?'nav-item active':'nav-item'} onClick={()=>navigate('admin')}><LayoutDashboard size={20}/>内容管理</button></>}
      </nav>
      <div className="sidebar-bottom"><div className="small-film"><Film size={19}/></div><strong>把生活调成电影模式</strong><p>不必等到周末<br/>现在，就是好时光。</p><span className="sidebar-line"/><span className="copyright">© 2026 幕间 · 每一刻都有戏</span></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><span className="top-location">{route==='admin'?'创作者工作台':route==='favorites'?'我的片单':route==='popular'?'人气榜单':'发现'}<ChevronRight size={14}/><span>{route==='admin'?'内容管理':'幕间短剧'}</span></span>
        {route!=='admin'&&<div className="search-box"><Search size={17}/><input aria-label="搜索短剧" placeholder="搜索一部好故事…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button className="icon-button" aria-label="清空搜索" onClick={()=>setQuery('')}><X size={14}/></button>}</div>}
        <div className="account">{user?<><span className="avatar">{user.nickname.slice(0,1)}</span><span className="nickname">{user.nickname}</span><button className="icon-button" onClick={logout} aria-label="退出登录" title="退出登录"><LogOut size={17}/></button></>:<button className="login-button" onClick={()=>setAuth(true)}>登录 / 注册<ArrowUpRight size={15}/></button>}</div>
      </header>
      <main>
        {route==='admin'?<Admin user={user} toast={toast} onLogin={()=>setAuth(true)} onView={setSelected} onChange={reload}/>:<>
          {isHome&&!search&&category==='全部'&&<div className="page-intro"><div><p className="eyebrow">A LITTLE BREAK. A GREAT STORY.</p><h1>好故事，<span>随时入戏。</span></h1></div><span className="edition"><span/> 即刻开启你的观剧时光</span></div>}
          {isHome&&!search&&category==='全部'&&featured&&!loading&&<section className="hero" style={{backgroundImage:`url("${featured.coverImg}")`}} aria-label="今日精选">
            <div className="hero-shade"/><div className="hero-content"><div className="hero-label"><span/> 幕间精选 <span className="label-sep">/</span> EDITOR'S PICK</div><h2>{featured.title}</h2><p className="hero-subtitle">在故事里，遇见另一种人生。</p><p className="hero-description">{featured.description}</p><div className="hero-meta"><span>{featured.category}</span><span>精选短片</span><span>免费观赏</span></div><button className="primary hero-play" onClick={()=>setSelected(featured.id)}><Play size={17} fill="currentColor"/>立即观看<ChevronRight size={16}/></button></div><div className="hero-index"><span>01</span> / {String(dramas.length).padStart(2,'0')}<div className="hero-progress"><i/></div></div><div className="hero-vertical">LET THE STORY BEGIN</div>
          </section>}
          <section className="library">
            <div className="section-top"><div><p className="eyebrow">{route==='favorites'?'YOUR PERSONAL COLLECTION':route==='popular'?'STORIES IN THE SPOTLIGHT':'FIND YOUR NEXT FAVORITE'}</p><h2>{route==='favorites'?'舍不得错过的故事':route==='popular'?'正在被看见的好剧':search?`搜索「${search}」`:'值得停留的好剧'}<span className="total">{dramas.length} 部</span></h2></div>{route!=='favorites'&&route!=='popular'&&<div className="sort-control"><SlidersHorizontal size={15}/><select aria-label="排序方式" value={sort} onChange={e=>setSort(e.target.value)}><option value="latest">最新上架</option><option value="popular">最多播放</option></select></div>}</div>
            {route!=='favorites'&&<div className="categories" aria-label="短剧分类">{categories.map(c=><button key={c} className={category===c?'category selected':'category'} onClick={()=>setCategory(c)}>{c}</button>)}</div>}
            {error?<div className="empty"><AlertCircle/><h3>暂时没能加载故事</h3><p>{error}</p><button className="secondary" onClick={reload}>重新加载</button></div>:loading?<div className="drama-grid">{Array.from({length:8},(_,i)=><div className="skeleton" key={i}/>)}</div>:route==='favorites'&&!user?<div className="empty"><Bookmark size={34}/><h3>给喜欢的故事留个位置</h3><p>登录后，收藏会一直为你保留。</p><button className="primary" onClick={()=>setAuth(true)}>登录，开启我的片单</button></div>:!dramas.length?<div className="empty"><Film size={34}/><h3>{route==='favorites'?'你的片单，等待第一个故事':'没有找到相关短剧'}</h3><p>{route==='favorites'?'去发现页逛逛，收藏一部喜欢的短剧吧。':'试试其他关键词，或切换一个分类。'}</p><button className="secondary" onClick={()=>{setCategory('全部');setQuery('');navigate('home');}}>发现好剧</button></div>:<div className="drama-grid">{dramas.filter(d=>route!=='favorites'||!search||d.title.includes(search)).map((d,i)=><button className="drama-card" key={d.id} onClick={()=>setSelected(d.id)} aria-label={`观看${d.title}`}><div className="poster"><img src={d.coverImg} alt={d.title+'封面'} loading="lazy" onError={e=>{e.currentTarget.style.opacity='0';}}/><div className="poster-overlay"/><span className="poster-tag">{d.category}</span>{route==='popular'&&<span className="rank">{String(i+1).padStart(2,'0')}</span>}<span className="poster-title">{d.title}</span><span className="poster-subtitle">幕间 · 精选短片</span><span className="play-hover"><Play size={23} fill="currentColor"/></span><span className="poster-bottom"><Play size={12} fill="currentColor"/> {count(d.viewCount)} 次播放{Boolean(d.favorited)&&<Bookmark size={14} fill="currentColor"/>}</span></div><div className="card-title"><h3>{d.title}</h3><ArrowUpRight size={16}/></div><p>{d.category} <span>·</span> {count(d.likeCount)} 人喜欢</p></button>)}</div>}
          </section><footer><span className="footer-brand">幕间 <i>MUJIAN</i></span><span>片刻闲暇，一场好故事。</span><span>演示内容 · 免费观赏</span></footer>
        </>}
      </main>
    </div>
    {auth&&<AuthModal onClose={()=>setAuth(false)} onSuccess={login}/>}
    {selected!==null&&<Player key={selected} id={selected} user={user} onClose={()=>setSelected(null)} onLogin={()=>setAuth(true)} toast={toast} onChange={reload}/>}
    {notice&&<div className={'toast'+(notice.error?' toast-error':'')} role="status">{notice.error?<AlertCircle size={18}/>:<CheckCircle2 size={18}/>} {notice.text}</div>}
  </div>;
}

function Modal({children,onClose,className='',label}:{children:React.ReactNode;onClose:()=>void;className?:string;label:string}) {
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const before=document.activeElement as HTMLElement|null; const old=document.body.style.overflow; document.body.style.overflow='hidden';
    ref.current?.querySelector<HTMLElement>('button,input')?.focus();
    const key=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){e.stopImmediatePropagation();onClose();}
      if(e.key==='Tab'){
        const nodes=ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input,textarea,select,a[href],video[controls]');
        if(!nodes?.length)return;const first=nodes[0],last=nodes[nodes.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    };
    document.addEventListener('keydown',key);
    return()=>{document.body.style.overflow=old;document.removeEventListener('keydown',key);before?.focus();};
  },[]);
  return <div className={'modal-backdrop '+className} onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className="modal" ref={ref} role="dialog" aria-modal="true" aria-label={label}>{children}</div></div>;
}
function AuthModal({onClose,onSuccess}:{onClose:()=>void;onSuccess:(data:{token:string;user:User})=>void}) {
  const [register,setRegister]=useState(false),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[nickname,setNickname]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{onSuccess(await api('/auth/'+(register?'register':'login'),{method:'POST',body:JSON.stringify({username,password,nickname})}));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <Modal onClose={onClose} className="auth-overlay" label={register?'注册账号':'登录账号'}><button className="close icon-button" onClick={onClose} aria-label="关闭登录窗口"><X/></button><span className="brand-icon"><Play size={23} fill="currentColor"/></span><p className="eyebrow">WELCOME TO MUJIAN</p><h2>{register?'好故事，从这里开始':'欢迎回到故事里'}</h2><p className="muted">{register?'创建账号，收藏属于你的心动瞬间。':'登录幕间，让喜欢的故事不再错过。'}</p><div className="auth-tabs"><button className={!register?'selected':''} onClick={()=>{setRegister(false);setError('');}}>登录</button><button className={register?'selected':''} onClick={()=>{setRegister(true);setError('');}}>注册</button></div><form onSubmit={submit}><label>用户名<input autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} placeholder="3–24位字母、数字或下划线" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]{3,24}"/></label>{register&&<label>昵称<input value={nickname} onChange={e=>setNickname(e.target.value)} placeholder="故事里怎么称呼你" required maxLength={30}/></label>}<label>密码<input type="password" autoComplete={register?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder={register?'至少8位密码':'请输入密码'} required minLength={register?8:undefined} maxLength={64}/></label>{error&&<p className="form-error" role="alert"><AlertCircle size={15}/>{error}</p>}<button className="primary full" disabled={busy}>{busy?<LoaderCircle className="spin" size={18}/>:register?'创建账号并登录':'登录幕间'}<ArrowUpRight size={17}/></button></form>{!register&&<details className="demo-login"><summary>快速体验演示账号</summary><div><button onClick={()=>{setUsername('demo');setPassword('Demo123!');}}>普通用户</button><button onClick={()=>{setUsername('admin');setPassword('Admin123!');}}>管理员</button></div><p>本地演示账号，仅用于体验。</p></details>}</Modal>;
}
function Player({id,user,onClose,onLogin,toast,onChange}:{id:number;user:User|null;onClose:()=>void;onLogin:()=>void;toast:(s:string,error?:boolean)=>void;onChange:()=>void}){
  const [drama,setDrama]=useState<Drama|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[videoError,setVideoError]=useState(false);
  const counted=useRef(false);
  useEffect(()=>{let active=true;api<Drama>('/dramas/'+id).then(d=>{if(active)setDrama(d);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[id,user]);
  async function interact(kind:'like'|'favorite'){
    if(!user){onLogin();return;}if(!drama||busy)return;setBusy(true);
    const active=kind==='like'?drama.liked:drama.favorited;
    try{setDrama(await api<Drama>(`/dramas/${id}/${kind}`,{method:active?'DELETE':'PUT'}));onChange();toast(active?(kind==='like'?'已取消点赞':'已取消收藏'):(kind==='like'?'喜欢已送达':'已加入我的收藏'));}catch(e){toast((e as Error).message,true);}finally{setBusy(false);}
  }
  function view(){if(counted.current)return;counted.current=true;api<Drama>(`/dramas/${id}/view`,{method:'POST'}).then(d=>{setDrama(old=>old?{...old,viewCount:d.viewCount}:old);onChange();}).catch(()=>{counted.current=false;});}
  return <Modal onClose={onClose} className="player-overlay" label="短剧播放"><div className="player-top"><span><Film size={17}/> 幕间放映室</span><button className="icon-button" onClick={onClose} aria-label="关闭播放器"><X/></button></div>{error?<div className="empty"><AlertCircle/><p>{error}</p></div>:!drama?<div className="empty"><LoaderCircle className="spin"/>正在准备故事…</div>:<><div className="video-wrap"><video src={drama.videoUrl} poster={drama.coverImg} controls playsInline preload="metadata" onPlay={view} onError={()=>setVideoError(true)}/>{videoError&&<p className="video-error" role="alert">视频暂时无法播放，请检查视频地址或网络后重试。</p>}</div><div className="player-info"><div className="player-heading"><div><span className="small-tag">{drama.category}</span><h2>{drama.title}</h2></div><div className="interaction"><button className={drama.liked?'secondary is-liked':'secondary'} disabled={busy} onClick={()=>interact('like')} aria-pressed={Boolean(drama.liked)}><Heart size={18} fill={drama.liked?'currentColor':'none'}/>{drama.liked?'已点赞':'点赞'} {count(drama.likeCount)}</button><button className={drama.favorited?'secondary is-liked':'secondary'} disabled={busy} onClick={()=>interact('favorite')} aria-pressed={Boolean(drama.favorited)}><Bookmark size={18} fill={drama.favorited?'currentColor':'none'}/>{drama.favorited?'已收藏':'收藏'}</button></div></div><p className="drama-description">{drama.description}</p><div className="player-foot"><span><Eye size={15}/> {count(drama.viewCount)} 次播放 · 单集短片</span>{drama.videoUrl==='/media/sintel-trailer.mp4'&&<a href="https://www.sintel.org" target="_blank" rel="noreferrer">演示片源：Sintel · Blender Foundation · CC BY 3.0 <ArrowUpRight size={12}/></a>}</div></div></>}</Modal>;
}

function Admin({user,toast,onLogin,onView,onChange}:{user:User|null;toast:(s:string,error?:boolean)=>void;onLogin:()=>void;onView:(id:number)=>void;onChange:()=>void}){
  const [rows,setRows]=useState<Drama[]>([]),[stats,setStats]=useState<Record<string,number>>({}),[query,setQuery]=useState(''),[refresh,setRefresh]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [editing,setEditing]=useState<Drama|null|undefined>(undefined),[deleting,setDeleting]=useState<Drama|null>(null),[busy,setBusy]=useState(false);
  const reload=()=>{setRefresh(n=>n+1);onChange();};
  useEffect(()=>{if(user?.role!=='ADMIN')return;let active=true;setLoading(true);setError('');Promise.all([api<Drama[]>('/admin/dramas'),api<Record<string,number>>('/admin/stats')]).then(([d,s])=>{if(active){setRows(d);setStats(s);}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[user,refresh]);
  if(user?.role!=='ADMIN')return <div className="empty"><LayoutDashboard size={34}/><h2>内容管理工作台</h2><p>{user?'当前账号没有管理员权限。':'请使用管理员账号登录。'}</p>{!user&&<button className="primary" onClick={onLogin}>登录管理员账号</button>}</div>;
  async function remove(){if(!deleting)return;setBusy(true);try{await api('/admin/dramas/'+deleting.id,{method:'DELETE'});setDeleting(null);reload();toast('短剧已删除，关联互动已清理');}catch(e){toast((e as Error).message,true);}finally{setBusy(false);}}
  const items=rows.filter(d=>d.title.includes(query.trim()));
  return <div className="admin"><div className="page-intro"><div><p className="eyebrow">CREATOR STUDIO</p><h1>让好故事，<span>被更多人看见。</span></h1></div><button className="primary" onClick={()=>setEditing(null)}><Plus size={18}/>新增短剧</button></div><div className="stats-grid">{[['dramas','在架短剧',Film],['users','注册用户',Users],['views','累计播放',Eye],['favorites','用户收藏',Bookmark]].map(([key,label,Icon])=>{const I=Icon as typeof Film;return <div className="stat" key={key as string}><span>{label as string}<I size={18}/></span><strong>{count(stats[key as string]||0)}</strong><small>实时数据库统计</small></div>;})}</div><section className="admin-panel"><div className="admin-panel-header"><h2>短剧内容<span className="total">{rows.length} 部</span></h2><div className="search-box"><Search size={16}/><input aria-label="搜索管理内容" placeholder="搜索短剧标题" value={query} onChange={e=>setQuery(e.target.value)}/></div></div>{error?<div className="empty"><p>{error}</p><button onClick={reload} className="secondary">重试</button></div>:loading?<div className="empty"><LoaderCircle className="spin"/>加载内容中…</div>:<div className="table-scroll"><table><thead><tr><th>短剧信息</th><th>分类</th><th>播放</th><th>点赞 / 收藏</th><th>操作</th></tr></thead><tbody>{items.map(d=><tr key={d.id}><td><button className="table-drama" onClick={()=>onView(d.id)}><img src={d.coverImg} alt=""/><span><strong>{d.title}</strong><small>ID {String(d.id).padStart(3,'0')} · 单集短片</small></span></button></td><td><span className="small-tag">{d.category}</span></td><td>{count(d.viewCount)}</td><td>{d.likeCount} / {d.favoriteCount}</td><td><div className="row-actions"><button className="icon-button" aria-label={'编辑'+d.title} onClick={()=>setEditing(d)}><Pencil size={17}/></button><button className="icon-button danger" aria-label={'删除'+d.title} onClick={()=>setDeleting(d)}><Trash2 size={17}/></button></div></td></tr>)}</tbody></table>{!items.length&&<div className="empty"><p>没有匹配的短剧</p></div>}</div>}</section>{editing!==undefined&&<Editor drama={editing} onClose={()=>setEditing(undefined)} onSaved={()=>{setEditing(undefined);reload();toast('短剧已保存，发现页已同步更新');}}/>}{deleting&&<Modal onClose={()=>{if(!busy)setDeleting(null);}} label="删除短剧"><div className="delete-icon"><Trash2/></div><h2>删除这部短剧？</h2><p className="muted">「{deleting.title}」将从发现页移除，对应点赞和收藏也会一起删除。</p><div className="modal-actions"><button className="secondary" disabled={busy} onClick={()=>setDeleting(null)}>保留短剧</button><button className="primary destructive" disabled={busy} onClick={remove}>{busy?'正在删除…':'确认删除'}</button></div></Modal>}</div>;
}
function Editor({drama,onClose,onSaved}:{drama:Drama|null;onClose:()=>void;onSaved:()=>void}){
  const [form,setForm]=useState<DramaInput>(drama?{title:drama.title,coverImg:drama.coverImg,description:drama.description,videoUrl:drama.videoUrl,category:drama.category}:{...emptyInput}),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const field=(key:keyof DramaInput,value:string)=>setForm(f=>({...f,[key]:value}));
  async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{await api('/admin/dramas'+(drama?'/'+drama.id:''),{method:drama?'PUT':'POST',body:JSON.stringify(form)});onSaved();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <Modal onClose={()=>{if(!busy)onClose();}} className="editor-overlay" label={drama?'编辑短剧':'新增短剧'}><button className="close icon-button" aria-label="关闭编辑窗口" disabled={busy} onClick={onClose}><X/></button><p className="eyebrow">STORY DETAILS</p><h2>{drama?'编辑故事':'发布一个新故事'}</h2><p className="muted">保存后，将立即展示在用户发现页。</p><form onSubmit={save}><div className="form-row"><label>短剧标题<input required maxLength={80} value={form.title} onChange={e=>field('title',e.target.value)} placeholder="给你的故事起个名字"/></label><label>分类<select value={form.category} onChange={e=>field('category',e.target.value)}>{categories.slice(1).map(c=><option key={c}>{c}</option>)}</select></label></div><label>短剧简介<textarea required maxLength={2000} rows={3} value={form.description} onChange={e=>field('description',e.target.value)} placeholder="一句话，让观众走进你的故事…"/></label><label>封面地址<input required maxLength={1000} value={form.coverImg} onChange={e=>field('coverImg',e.target.value)} placeholder="https://… 或 /media/forest.jpg"/></label><label>视频地址<input required maxLength={1000} value={form.videoUrl} onChange={e=>field('videoUrl',e.target.value)} placeholder="可播放的 MP4 地址"/></label><p className="field-hint">可使用已提供的本地封面与示例视频，也支持 HTTP / HTTPS 地址。</p>{error&&<p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose} disabled={busy}>取消</button><button className="primary" disabled={busy}>{busy?<LoaderCircle className="spin" size={16}/>:<Check size={16}/>}保存短剧</button></div></form></Modal>;
}

createRoot(document.getElementById('root')!).render(<App/>);
