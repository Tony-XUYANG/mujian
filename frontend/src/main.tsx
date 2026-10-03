import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ShoppingBag, Play, Search, Bookmark, Compass, Flame, ArrowUpRight, X, LogOut, ChevronRight, Film, Plus, Pencil, Trash2, LayoutDashboard, Users, Eye, EyeOff, Flag, Check, LoaderCircle, CheckCircle2, AlertCircle, SlidersHorizontal, History, UserRound, Download, Sparkles, Clock3 } from 'lucide-react';
import { api, count, type Drama, type DramaInput, type User } from './api';
import { Modal } from './Modal';
import { Profile } from './Profile';
import { Player } from './Player';
import { EpisodeManager } from './EpisodeManager';
import { Following } from './Following';
import { NotificationEntry, NotificationInbox } from './NotificationInbox';
import { RecommendationFeed } from './RecommendationFeed';
import { readDownloads, downloadKey, DOWNLOADS_KEY, type DownloadedDrama } from './downloads';
import { seriesLabel } from './api';
import './style.css';
import './profile.css';
import './episodes.css';
import './releases.css';
import './commerce.css';
import { Mall, Storefront, ProductPage, Orders } from './Commerce';
import { Merchant } from './Merchant';
import { Cart, AddressBook, ProductFavorites } from './Shopping';
import './shopping.css';

const categories = ['全部','都市','悬疑','治愈','古装','爱情'];
const emptyInput: DramaInput = { title:'', coverImg:'/media/forest.jpg', description:'', videoUrl:'/media/sintel-trailer.mp4', category:'都市' };
type Notice = { text:string; error?:boolean };
type CommentReport = { id:number; commentId:number; reason:string; status:'PENDING'|'RESOLVED'|'DISMISSED'; createTime:string; content:string; dramaId:number; dramaTitle:string; authorNickname:string; reporterNickname:string; moderationStatus:'VISIBLE'|'HIDDEN' };
const sharedDramaId = () => {
  const match = /^#watch\/([1-9]\d*)$/.exec(window.location.hash);
  const id = Number(match?.[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};
const routeNow = () => sharedDramaId() ? 'home' : window.location.hash.replace('#','') || 'home';
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{outcome:'accepted'|'dismissed'}> };

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
  const [selected,setSelected]=useState<number|null>(sharedDramaId);
  const [selectedEpisode,setSelectedEpisode]=useState<number|undefined>();
  const [moodOpen,setMoodOpen]=useState(false);
  const openEpisode=(id:number,episodeId?:number)=>{setSelectedEpisode(episodeId);setSelected(id);};
  const [notice,setNotice]=useState<Notice|null>(null);
  const [ready,setReady]=useState(false);
  const [installPrompt,setInstallPrompt]=useState<InstallPrompt|null>(null);
  const [downloads,setDownloads]=useState<DownloadedDrama[]>(readDownloads);
  const toast=(text:string,error=false)=>setNotice({text,error});
  const reload=()=>setRefresh(n=>n+1);
  useEffect(()=>{ const change=()=>{setRoute(routeNow());setSelectedEpisode(undefined);setSelected(sharedDramaId());setQuery('');setSearch('');setCategory('全部');};window.addEventListener('hashchange',change); return()=>window.removeEventListener('hashchange',change);},[]);
  useEffect(()=>{const t=setTimeout(()=>setSearch(query.trim()),250);return()=>clearTimeout(t);},[query]);
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(null),3500);return()=>clearTimeout(t);},[notice]);
  useEffect(()=>{const onInstall=(event:Event)=>{event.preventDefault();setInstallPrompt(event as InstallPrompt);};window.addEventListener('beforeinstallprompt',onInstall);return()=>window.removeEventListener('beforeinstallprompt',onInstall);},[]);
  useEffect(()=>{const update=()=>setDownloads(readDownloads());window.addEventListener('downloads-changed',update);return()=>window.removeEventListener('downloads-changed',update);},[]);
  useEffect(()=>{
    let active=true;
    const restore=()=>{
      const token=sessionStorage.getItem('mujian_token');
      if(token)api<User>('/auth/me').then(data=>{if(active&&sessionStorage.getItem('mujian_token')===token)setUser(data);}).catch(()=>undefined).finally(()=>{if(active)setReady(true);});
      else if(active)setReady(true);
    };
    const expire=()=>{setUser(null);setAuth(true);toast('登录已过期，请重新登录',true);};
    window.addEventListener('session-expired',expire);window.addEventListener('online',restore);restore();
    return()=>{active=false;window.removeEventListener('session-expired',expire);window.removeEventListener('online',restore);};
  },[]);
  useEffect(()=>{
    if(!ready)return;
    let active=true;
    if((route==='favorites'||route==='history')&&!user){setDramas([]);setLoading(false);setError('');return;}
    if(route==='cart'||route==='addresses'||route==='product-favorites'||route==='mall'||route.startsWith('merchant')||route==='orders'||route.startsWith('store/')||route.startsWith('product/')||route==='profile'||route==='offline'||route==='admin'||route==='following'||route==='notifications'||route==='recommend'){setDramas([]);setLoading(false);setError('');return;}
    setLoading(true);setError('');
    const path=route==='favorites'?'/me/favorites':route==='history'?'/me/history':`/dramas?q=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}&sort=${route==='popular'?'popular':sort}`;
    api<Drama[]>(path).then(data=>{if(active)setDramas(data);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[ready,user,route,search,category,sort,refresh]);
  const navigate=(target:string)=>{window.location.hash=target;setSelectedEpisode(undefined);setSelected(null);};
  const closePlayer=()=>{setSelectedEpisode(undefined);if(sharedDramaId())window.history.replaceState(null,'','#home');setSelected(null);};
  async function removeHistory(id:number){
    try{await api(`/me/history/${id}`,{method:'DELETE'});setDramas(current=>current.filter(d=>d.id!==id));toast('已移除观看记录');}
    catch(e){toast((e as Error).message,true);}
  }
  const logout=()=>{sessionStorage.removeItem('mujian_token');setUser(null);navigate('home');toast('已退出登录');};
  const login=(data:{token:string;user:User})=>{sessionStorage.setItem('mujian_token',data.token);setUser(data.user);setAuth(false);reload();toast(`欢迎回来，${data.user.nickname}`);};
  const featured=dramas.find(d=>d.title==='等风，也等你')||dramas[0];
  const commerceProps={user,onLogin:()=>setAuth(true),onNavigate:navigate,toast};
  const isHome=route==='home';
  const isLibrary=['home','popular','favorites','history'].includes(route);
  async function install(){if(!installPrompt){toast('请使用浏览器菜单选择“安装幕间”');return;}await installPrompt.prompt();setInstallPrompt(null);}
  return <div className="app">
    <aside className="sidebar">
      <a className="brand" href="#home" aria-label="幕间首页"><span className="brand-icon"><Play size={23} fill="currentColor"/></span><span>幕间<small>MUJIAN</small></span></a>
      <p className="nav-label">你的片刻，值得好故事</p>
      <nav aria-label="主导航">
        <button className={isHome?'nav-item active':'nav-item'} onClick={()=>navigate('home')}><Compass size={20}/>发现好剧<span className="active-dot"/></button>
        <button data-mobile-hidden className={route==='popular'?'nav-item active':'nav-item'} onClick={()=>navigate('popular')}><Flame size={20}/>人气榜单</button>
        <button className={route==='recommend'?'nav-item active':'nav-item'} onClick={()=>navigate('recommend')}><Sparkles size={20}/>为你推荐</button>
        <button className={route==='following'?'nav-item active':'nav-item'} onClick={()=>navigate('following')}><Bookmark size={20}/>我的追剧</button>
        <button data-mobile-hidden className={route==='history'?'nav-item active':'nav-item'} onClick={()=>navigate('history')}><History size={20}/>继续观看</button>
        <button className={route==='mall'?'nav-item active':'nav-item'} onClick={()=>navigate('mall')}><ShoppingBag size={20}/>商城</button>
        <button className={route==='profile'?'nav-item active':'nav-item'} onClick={()=>navigate('profile')}><UserRound size={20}/>我的</button>
        {user?.role==='ADMIN'&&<><div className="nav-divider"/><button data-mobile-hidden className={route==='admin'?'nav-item active':'nav-item'} onClick={()=>navigate('admin')}><LayoutDashboard size={20}/>内容管理</button></>}
      </nav>
      <div className="sidebar-bottom"><div className="small-film"><Film size={19}/></div><strong>把生活调成电影模式</strong><p>不必等到周末<br/>现在，就是好时光。</p><span className="sidebar-line"/><span className="copyright">© 2026 幕间 · 每一刻都有戏</span></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><span className="top-location">{route==='cart'?'购物车':route==='addresses'?'收货地址':route==='product-favorites'?'好物收藏':route==='mall'?'商城':route.startsWith('merchant')?'我的店铺':route==='orders'?'我的订单':route.startsWith('product/')?'商品详情':route.startsWith('store/')?'店铺':route==='notifications'?'更新提醒':route==='recommend'?'为你推荐':route==='following'?'我的追剧':route==='admin'?'创作者工作台':route==='favorites'?'我的片单':route==='popular'?'人气榜单':route==='history'?'继续观看':route==='profile'?'个人中心':'发现'}<ChevronRight size={14}/><span>{route==='admin'?'内容管理':route==='profile'?'幕间 App':'幕间短剧'}</span></span>
        {isLibrary&&<div className="search-box"><Search size={17}/><input aria-label="搜索短剧" placeholder="搜索一部好故事…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button className="icon-button" aria-label="清空搜索" onClick={()=>setQuery('')}><X size={14}/></button>}</div>}
        <button className="icon-button offline-entry" onClick={()=>navigate('offline')} aria-label="打开离线片库" title={`离线片库 · ${downloads.length} 部`}><Download size={18}/>{downloads.length>0&&<span className="offline-count">{downloads.length}</span>}</button>
        <NotificationEntry key={user?.id||'guest'} user={user} refresh={refresh} onOpen={()=>navigate('notifications')}/>
        <div className="account">{user?<><span className="avatar">{user.avatarUrl?<img src={user.avatarUrl} alt=""/>:user.nickname.slice(0,1)}</span><span className="nickname">{user.nickname}</span><button className="icon-button" onClick={logout} aria-label="退出登录" title="退出登录"><LogOut size={17}/></button></>:<button className="login-button" onClick={()=>setAuth(true)}>登录 / 注册<ArrowUpRight size={15}/></button>}</div>
      </header>
      <main>
        {route==='cart'?<Cart key={user?.id||'guest'} {...commerceProps}/>:route==='addresses'?<AddressBook key={user?.id||'guest'} {...commerceProps}/>:route==='product-favorites'?<ProductFavorites key={user?.id||'guest'} {...commerceProps}/>:route==='mall'?<Mall key={user?.id||'guest'} {...commerceProps}/>:route.startsWith('merchant')?<Merchant key={route+':'+(user?.id||'guest')} initialTab={route.split('/')[1]} {...commerceProps}/>:route==='orders'?<Orders key={user?.id||'guest'} {...commerceProps}/>:route.startsWith('product/')?<ProductPage key={route+':'+(user?.id||'guest')} id={Number(route.split('/')[1])} {...commerceProps}/>:route.startsWith('store/')?<Storefront key={route} id={Number(route.split('/')[1])} {...commerceProps}/>:route==='notifications'?<NotificationInbox key={user?.id||'guest'} user={user} onLogin={()=>setAuth(true)} onView={openEpisode} onChange={reload}/>:route==='recommend'?<RecommendationFeed user={user} onLogin={()=>setAuth(true)} onView={setSelected} refresh={refresh}/>:route==='following'?<Following user={user} onLogin={()=>setAuth(true)} onView={openEpisode} refresh={refresh} onChange={reload}/>:route==='admin'?<Admin user={user} toast={toast} onLogin={()=>setAuth(true)} onView={setSelected} onChange={reload}/>:route==='offline'?<OfflineLibrary items={downloads} toast={toast} onNavigate={navigate}/>:route==='profile'?<Profile key={user?.id || 'guest'} user={user} onLogin={()=>setAuth(true)} onNavigate={navigate} onView={setSelected} onUserUpdated={updated=>setUser(current=>current?.id===updated.id?updated:current)} toast={toast} refresh={refresh}/>:<>
          {isHome&&!search&&category==='全部'&&<div className="page-intro"><div><p className="eyebrow">A LITTLE BREAK. A GREAT STORY.</p><h1>好故事，<span>随时入戏。</span></h1></div><div className="intro-actions"><button className="secondary mood-button" onClick={()=>setMoodOpen(true)}><Sparkles size={15}/>心情选剧</button><span className="edition"><span/> 即刻开启你的观剧时光</span></div></div>}
          {isHome&&!search&&category==='全部'&&featured&&!loading&&<section className="hero" style={{backgroundImage:`url("${featured.coverImg}")`}} aria-label="今日精选">
            <div className="hero-shade"/><div className="hero-content"><div className="hero-label"><span/> 幕间精选 <span className="label-sep">/</span> EDITOR'S PICK</div><h2>{featured.title}</h2><p className="hero-subtitle">在故事里，遇见另一种人生。</p><p className="hero-description">{featured.description}</p><div className="hero-meta"><span>{featured.category}</span><span>{seriesLabel(featured)}</span><span>免费观赏</span></div><button className="primary hero-play" onClick={()=>setSelected(featured.id)}><Play size={17} fill="currentColor"/>立即观看<ChevronRight size={16}/></button></div><div className="hero-index"><span>01</span> / {String(dramas.length).padStart(2,'0')}<div className="hero-progress"><i/></div></div><div className="hero-vertical">LET THE STORY BEGIN</div>
          </section>}
          <section className="library">
            <div className="section-top"><div><p className="eyebrow">{route==='favorites'?'YOUR PERSONAL COLLECTION':route==='popular'?'STORIES IN THE SPOTLIGHT':route==='history'?'PICK UP WHERE YOU LEFT OFF':'FIND YOUR NEXT FAVORITE'}</p><h2>{route==='favorites'?'舍不得错过的故事':route==='popular'?'正在被看见的好剧':route==='history'?'继续看完你的故事':search?`搜索「${search}」`:'值得停留的好剧'}<span className="total">{dramas.length} 部</span></h2></div>{route!=='favorites'&&route!=='popular'&&route!=='history'&&<div className="sort-control"><SlidersHorizontal size={15}/><select aria-label="排序方式" value={sort} onChange={e=>setSort(e.target.value)}><option value="latest">最新上架</option><option value="popular">最多播放</option></select></div>}</div>
            {route!=='favorites'&&route!=='history'&&<div className="categories" aria-label="短剧分类">{categories.map(c=><button key={c} className={category===c?'category selected':'category'} onClick={()=>setCategory(c)}>{c}</button>)}</div>}
            {error?<div className="empty"><AlertCircle/><h3>暂时没能加载故事</h3><p>{error}</p><button className="secondary" onClick={reload}>重新加载</button></div>:loading?<div className="drama-grid">{Array.from({length:8},(_,i)=><div className="skeleton" key={i}/>)}</div>:(route==='favorites'||route==='history')&&!user?<div className="empty"><Bookmark size={34}/><h3>登录后，故事会记住你</h3><p>收藏和观看进度会在不同设备间同步。</p><button className="primary" onClick={()=>setAuth(true)}>登录幕间 App</button></div>:!dramas.length?<div className="empty"><Film size={34}/><h3>{route==='favorites'?'你的片单，等待第一个故事':route==='history'?'还没有观看记录':'没有找到相关短剧'}</h3><p>{route==='favorites'?'去发现页逛逛，收藏一部喜欢的短剧吧。':route==='history'?'打开一部短剧，播放几秒后这里就会出现。':'试试其他关键词，或切换一个分类。'}</p><button className="secondary" onClick={()=>{setCategory('全部');setQuery('');navigate('home');}}>发现好剧</button></div>:<div className="drama-grid">{dramas.filter(d=>!['favorites','history'].includes(route)||!search||d.title.includes(search)).map((d,i)=><div className="drama-item" key={d.id}><button className="drama-card" onClick={()=>setSelected(d.id)} aria-label={`观看${d.title}`}><div className="poster"><img src={d.coverImg} alt={d.title+'封面'} loading="lazy" onError={e=>{e.currentTarget.style.opacity='0';}}/><div className="poster-overlay"/><span className="poster-tag">{d.category}</span>{route==='popular'&&<span className="rank">{String(i+1).padStart(2,'0')}</span>}{route==='history'&&d.progressSec&&d.durationSec&&<span className="progress-pill"><Clock3 size={11}/> {Math.round(d.progressSec/d.durationSec*100)}%</span>}<span className="poster-title">{d.title}</span><span className="poster-subtitle">{seriesLabel(d)}</span><span className="play-hover"><Play size={23} fill="currentColor"/></span><span className="poster-bottom"><Play size={12} fill="currentColor"/> {count(d.viewCount)} 次播放{Boolean(d.favorited)&&<Bookmark size={14} fill="currentColor"/>}</span></div><div className="card-title"><h3>{d.title}</h3><ArrowUpRight size={16}/></div><p>{d.category} <span>·</span> {count(d.likeCount)} 人喜欢</p></button>{route==='history'&&<button className="history-remove icon-button" aria-label={`移除${d.title}的观看记录`} title="移除观看记录" onClick={()=>void removeHistory(d.id)}><Trash2 size={15}/></button>}</div>)}</div>}
          </section><footer><span className="footer-brand">幕间 <i>MUJIAN</i></span><span>片刻闲暇，一场好故事。</span><span>演示内容 · 免费观赏</span></footer>
        </>}
      </main>
    </div>
    {moodOpen&&<MoodPicker dramas={dramas} onClose={()=>setMoodOpen(false)} onPick={id=>{setMoodOpen(false);setSelected(id);}}/>}
    {auth&&<AuthModal onClose={()=>setAuth(false)} onSuccess={login}/>}
    {selected!==null&&<Player key={selected} initialEpisodeId={selectedEpisode} onNavigate={navigate} id={selected} user={user} onClose={closePlayer} onLogin={()=>setAuth(true)} toast={toast} onChange={reload}/>}
    {notice&&<div className={'toast'+(notice.error?' toast-error':'')} role="status">{notice.error?<AlertCircle size={18}/>:<CheckCircle2 size={18}/>} {notice.text}</div>}
  </div>;
}

function MoodPicker({dramas,onClose,onPick}:{dramas:Drama[];onClose:()=>void;onPick:(id:number)=>void}) {
  const moods:ReadonlyArray<readonly [string,readonly string[],string]>=[['想被治愈',['治愈'],'给今天留一点温柔'],['想看反转',['悬疑'],'让真相晚一点出现'],['想谈恋爱',['爱情'],'把心动交给故事'],['想换个活法',['都市','古装'],'去别人的人生走一圈']];
  function choose(categories:readonly string[]) {
    const pool=dramas.filter(d=>categories.includes(d.category));
    const source=pool.length?pool:dramas;
    if(source.length) onPick(source[Math.floor(Math.random()*source.length)].id);
  }
  return <Modal onClose={onClose} label="心情选剧"><button className="close icon-button" onClick={onClose} aria-label="关闭心情选剧"><X/></button><p className="eyebrow">PICK BY MOOD</p><h2>今天想看哪一种心情？</h2><p className="muted">从片库标签里挑一部，打开就能开始播放。</p><div className="mood-picker">{moods.map(([title,cats,desc])=><button key={title} className="mood-choice" onClick={()=>choose(cats)}><span><Sparkles size={17}/>{title}</span><small>{desc}</small></button>)}</div></Modal>;
}

function AuthModal({onClose,onSuccess}:{onClose:()=>void;onSuccess:(data:{token:string;user:User})=>void}) {
  const [register,setRegister]=useState(false),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[nickname,setNickname]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const usernamePattern=/^[\u4e00-\u9fffA-Za-z0-9_]{2,24}$/;
  async function submit(e:React.FormEvent){
    e.preventDefault();
    setError('');
    const name=username.trim();
    if(!name){setError('请输入用户名');return;}
    if(!usernamePattern.test(name)){setError('用户名需为2–24位中文、字母、数字或下划线');return;}
    if(register&&!nickname.trim()){setError('请输入昵称');return;}
    if(register&&password.length<8){setError('密码长度需为8–64位');return;}
    if(!password){setError('请输入密码');return;}
    setBusy(true);
    try{onSuccess(await api('/auth/'+(register?'register':'login'),{method:'POST',body:JSON.stringify({username:name,password,nickname:nickname.trim()})}));}
    catch(e){const message=e instanceof Error?e.message:'';setError(message&&!/Failed to fetch|NetworkError/i.test(message)?message:`${register?'注册':'登录'}失败，请检查网络后重试`);}
    finally{setBusy(false);}
  }
  return <Modal onClose={onClose} className="auth-overlay" label={register?'注册账号':'登录账号'}><button type="button" className="close icon-button" onClick={onClose} aria-label="关闭登录窗口"><X/></button><span className="brand-icon"><Play size={23} fill="currentColor"/></span><p className="eyebrow">幕间账号</p><h2>{register?'好故事，从这里开始':'欢迎回到故事里'}</h2><p className="muted">{register?'创建账号，收藏属于你的心动瞬间。':'登录幕间，让喜欢的故事不再错过。'}</p><div className="auth-tabs"><button type="button" className={!register?'selected':''} onClick={()=>{setRegister(false);setError('');}}>登录</button><button type="button" className={register?'selected':''} onClick={()=>{setRegister(true);setError('');}}>注册</button></div><form noValidate onSubmit={submit}><label>用户名<input autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} placeholder="2–24位中文、字母、数字或下划线" required minLength={2} maxLength={24} pattern="[一-龥A-Za-z0-9_]{2,24}"/></label>{register&&<label>昵称<input value={nickname} onChange={e=>setNickname(e.target.value)} placeholder="故事里怎么称呼你" required maxLength={30}/></label>}<label>密码<input type="password" autoComplete={register?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder={register?'至少8位密码':'请输入密码'} required minLength={register?8:undefined} maxLength={64}/></label>{error&&<p className="form-error" role="alert"><AlertCircle size={15}/>{error}</p>}<button className="primary full" disabled={busy}>{busy?<LoaderCircle className="spin" size={18}/>:register?'创建账号并登录':'登录幕间'}<ArrowUpRight size={17}/></button></form>{!register&&<details className="demo-login"><summary>快速体验演示账号</summary><div><button type="button" onClick={()=>{setUsername('demo');setPassword('Demo123!');}}>普通用户</button><button type="button" onClick={()=>{setUsername('admin');setPassword('Admin123!');}}>管理员</button></div><p>本地演示账号，仅用于体验。</p></details>}</Modal>;
}

function OfflineLibrary({items,toast,onNavigate}:{items:DownloadedDrama[];toast:(s:string,error?:boolean)=>void;onNavigate:(target:string)=>void}){
  const [available,setAvailable]=useState<DownloadedDrama[]>([]),[selected,setSelected]=useState<DownloadedDrama|null>(null);
  useEffect(()=>{
    let active=true;
    if(!('caches' in window)){setAvailable([]);return;}
    caches.open('mujian-offline-v1').then(cache=>Promise.all(items.map(async item=>await cache.match(item.videoUrl)?item:null)))
      .then(found=>{if(active)setAvailable(found.filter((item):item is DownloadedDrama=>item!==null));})
      .catch(()=>{if(active)setAvailable([]);});
    return()=>{active=false;};
  },[items]);
  async function remove(item:DownloadedDrama){
    const remaining=readDownloads().filter(d=>downloadKey(d)!==downloadKey(item));
    try{
      const cache=await caches.open('mujian-offline-v1');
      if(!remaining.some(d=>d.videoUrl===item.videoUrl))await cache.delete(item.videoUrl);
      if(!remaining.some(d=>d.coverImg===item.coverImg))await cache.delete(item.coverImg);
      localStorage.setItem(DOWNLOADS_KEY,JSON.stringify(remaining));
      setAvailable(current=>current.filter(d=>downloadKey(d)!==downloadKey(item)));
      window.dispatchEvent(new Event('downloads-changed'));
      toast('已从离线片库移除');
    }catch{toast('暂时无法移除，请重试',true);}
  }
  return <div className="offline-library"><div className="page-intro"><div><p className="eyebrow">YOUR OFFLINE LIBRARY</p><h1>离线片库</h1></div><span className="offline-total">{available.length} 部已保存</span></div>
    {!available.length?<div className="empty"><Download size={34}/><h2>还没有缓存的视频</h2><p>在播放器点“离线缓存”，已保存的短剧会出现在这里。</p><button className="primary" onClick={()=>onNavigate('home')}>发现好剧</button></div>:<div className="drama-grid">{available.map(item=><div className="drama-item" key={downloadKey(item)}><button className="drama-card" onClick={()=>setSelected(item)} aria-label={`离线播放${item.title}`}><div className="poster"><img src={item.coverImg} alt={item.title+'封面'}/><div className="poster-overlay"/><span className="poster-tag">{item.category}</span><span className="poster-title">{item.title}</span><span className="poster-subtitle">幕间 · 已缓存</span><span className="play-hover"><Play size={23} fill="currentColor"/></span><span className="poster-bottom"><Download size={12}/> 可离线播放</span></div><div className="card-title"><h3>{item.title}</h3><ArrowUpRight size={16}/></div></button><button className="history-remove icon-button" aria-label={`移除${item.title}的离线缓存`} title="移除离线缓存" onClick={()=>void remove(item)}><Trash2 size={15}/></button></div>)}</div>}
    {selected&&<Modal onClose={()=>setSelected(null)} className="player-overlay" label="离线播放"><div className="player-top"><span><Download size={17}/> 离线放映室</span><button className="icon-button" onClick={()=>setSelected(null)} aria-label="关闭离线播放"><X/></button></div><div className="video-wrap"><video src={selected.videoUrl} poster={selected.coverImg} controls playsInline autoPlay preload="metadata"/></div><div className="offline-player-info"><span className="small-tag">{selected.category}</span><h2>{selected.title}</h2><p>离线播放仅使用本机缓存；互动和同步需要网络连接。</p></div></Modal>}
  </div>;
}

function Admin({user,toast,onLogin,onView,onChange}:{user:User|null;toast:(s:string,error?:boolean)=>void;onLogin:()=>void;onView:(id:number)=>void;onChange:()=>void}){
  const [rows,setRows]=useState<Drama[]>([]),[stats,setStats]=useState<Record<string,number>>({}),[reports,setReports]=useState<CommentReport[]>([]),[reportStatus,setReportStatus]=useState('PENDING'),[query,setQuery]=useState(''),[refresh,setRefresh]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [managingEpisodes,setManagingEpisodes]=useState<Drama|null>(null),[editing,setEditing]=useState<Drama|null|undefined>(undefined),[deleting,setDeleting]=useState<Drama|null>(null),[busy,setBusy]=useState(false);
  const reload=()=>{setRefresh(n=>n+1);onChange();};
  useEffect(()=>{if(user?.role!=='ADMIN')return;let active=true;setLoading(true);setError('');Promise.all([api<Drama[]>('/admin/dramas'),api<Record<string,number>>('/admin/stats'),api<CommentReport[]>('/admin/comment-reports?status='+reportStatus)]).then(([d,s,r])=>{if(active){setRows(d);setStats(s);setReports(r);}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[user,refresh,reportStatus]);
  if(user?.role!=='ADMIN')return <div className="empty"><LayoutDashboard size={34}/><h2>内容管理工作台</h2><p>{user?'当前账号没有管理员权限。':'请使用管理员账号登录。'}</p>{!user&&<button className="primary" onClick={onLogin}>登录管理员账号</button>}</div>;
  async function remove(){if(!deleting)return;setBusy(true);try{await api('/admin/dramas/'+deleting.id,{method:'DELETE'});setDeleting(null);reload();toast('短剧已删除，关联互动已清理');}catch(e){toast((e as Error).message,true);}finally{setBusy(false);}}
  async function handleReport(report:CommentReport,action:'HIDE'|'DISMISS'){setBusy(true);try{await api('/admin/comment-reports/'+report.id+'/resolve',{method:'POST',body:JSON.stringify({action})});setReports(items=>items.filter(item=>item.id!==report.id));toast(action==='HIDE'?'评论已隐藏，举报已结案':'举报已驳回，评论保持显示');}catch(e){toast((e as Error).message,true);}finally{setBusy(false);}}
  const items=rows.filter(d=>d.title.includes(query.trim()));
  return <div className="admin"><div className="page-intro"><div><p className="eyebrow">CREATOR STUDIO</p><h1>让好故事，<span>被更多人看见。</span></h1></div><button className="primary" onClick={()=>setEditing(null)}><Plus size={18}/>新增短剧</button></div><div className="stats-grid">{[['dramas','在架短剧',Film],['users','注册用户',Users],['views','累计播放',Eye],['favorites','用户收藏',Bookmark]].map(([key,label,Icon])=>{const I=Icon as typeof Film;return <div className="stat" key={key as string}><span>{label as string}<I size={18}/></span><strong>{count(stats[key as string]||0)}</strong><small>实时数据库统计</small></div>;})}</div><section className="admin-panel"><div className="admin-panel-header"><h2>短剧内容<span className="total">{rows.length} 部</span></h2><div className="search-box"><Search size={16}/><input aria-label="搜索管理内容" placeholder="搜索短剧标题" value={query} onChange={e=>setQuery(e.target.value)}/></div></div>{error?<div className="empty"><p>{error}</p><button onClick={reload} className="secondary">重试</button></div>:loading?<div className="empty"><LoaderCircle className="spin"/>加载内容中…</div>:<div className="table-scroll"><table><thead><tr><th>短剧信息</th><th>分类</th><th>播放</th><th>点赞 / 收藏</th><th>操作</th></tr></thead><tbody>{items.map(d=><tr key={d.id}><td><button className="table-drama" onClick={()=>onView(d.id)}><img src={d.coverImg} alt=""/><span><strong>{d.title}</strong><small>ID {String(d.id).padStart(3,'0')} · {seriesLabel(d)}</small></span></button></td><td><span className="small-tag">{d.category}</span></td><td>{count(d.viewCount)}</td><td>{d.likeCount} / {d.favoriteCount}</td><td><div className="row-actions"><button className="secondary episode-admin-entry" aria-label={'管理'+d.title+'的分集'} onClick={()=>setManagingEpisodes(d)}>分集</button><button className="icon-button" aria-label={'编辑'+d.title} onClick={()=>setEditing(d)}><Pencil size={17}/></button><button className="icon-button danger" aria-label={'删除'+d.title} onClick={()=>setDeleting(d)}><Trash2 size={17}/></button></div></td></tr>)}</tbody></table>{!items.length&&<div className="empty"><p>没有匹配的短剧</p></div>}</div>}</section><section className="admin-panel moderation-panel"><div className="admin-panel-header"><h2><Flag size={18}/> 评论审核 <span className="total">{reports.length} 条</span></h2><select aria-label="评论审核状态" value={reportStatus} onChange={e=>setReportStatus(e.target.value)}><option value="PENDING">待处理</option><option value="ALL">全部记录</option><option value="RESOLVED">已处理</option><option value="DISMISSED">已驳回</option></select></div>{!reports.length?<div className="moderation-empty"><CheckCircle2 size={23}/><p>{reportStatus==='PENDING'?'暂时没有待处理举报':'没有符合条件的举报记录'}</p></div>:<div className="moderation-list">{reports.map(report=><article className={'moderation-item '+report.status.toLowerCase()} key={report.id}><div className="moderation-item-top"><span className="small-tag">{report.dramaTitle}</span><span className="moderation-status">{report.status==='PENDING'?'待处理':report.status==='RESOLVED'?'已处理':'已驳回'}</span></div><p className="moderation-content">“{report.content}”</p><p className="moderation-meta">{report.authorNickname} · 举报人 {report.reporterNickname} · 原因：{report.reason}</p>{report.status==='PENDING'&&<div className="moderation-actions"><button className="secondary" disabled={busy} onClick={()=>void handleReport(report,'DISMISS')}><Check size={14}/>驳回举报</button><button className="primary" disabled={busy} onClick={()=>void handleReport(report,'HIDE')}><EyeOff size={14}/>隐藏评论</button></div>}{report.status==='RESOLVED'&&report.moderationStatus==='HIDDEN'&&<button className="secondary" disabled={busy} onClick={async()=>{setBusy(true);try{await api('/admin/comments/'+report.commentId+'/restore',{method:'POST'});toast('评论已恢复显示');}catch(e){toast((e as Error).message,true);}finally{setBusy(false);}}}><Eye size={14}/>恢复显示</button>}</article>)}</div>}</section>{managingEpisodes&&<EpisodeManager drama={managingEpisodes} onClose={()=>setManagingEpisodes(null)} onChange={reload}/>} {editing!==undefined&&<Editor drama={editing} onClose={()=>setEditing(undefined)} onSaved={()=>{setEditing(undefined);reload();toast('短剧已保存，发现页已同步更新');}}/>}{deleting&&<Modal onClose={()=>{if(!busy)setDeleting(null);}} label="删除短剧"><div className="delete-icon"><Trash2/></div><h2>删除这部短剧？</h2><p className="muted">「{deleting.title}」将从发现页移除，对应点赞和收藏也会一起删除。</p><div className="modal-actions"><button className="secondary" disabled={busy} onClick={()=>setDeleting(null)}>保留短剧</button><button className="primary destructive" disabled={busy} onClick={remove}>{busy?'正在删除…':'确认删除'}</button></div></Modal>}</div>;
}
function Editor({drama,onClose,onSaved}:{drama:Drama|null;onClose:()=>void;onSaved:()=>void}){
  const [form,setForm]=useState<DramaInput>(drama?{title:drama.title,coverImg:drama.coverImg,description:drama.description,videoUrl:drama.videoUrl,category:drama.category}:{...emptyInput}),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const field=(key:keyof DramaInput,value:string)=>setForm(f=>({...f,[key]:value}));
  async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{await api('/admin/dramas'+(drama?'/'+drama.id:''),{method:drama?'PUT':'POST',body:JSON.stringify(form)});onSaved();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <Modal onClose={()=>{if(!busy)onClose();}} className="editor-overlay" label={drama?'编辑短剧':'新增短剧'}><button className="close icon-button" aria-label="关闭编辑窗口" disabled={busy} onClick={onClose}><X/></button><p className="eyebrow">STORY DETAILS</p><h2>{drama?'编辑故事':'发布一个新故事'}</h2><p className="muted">保存后，将立即展示在用户发现页。</p><form onSubmit={save}><div className="form-row"><label>短剧标题<input required maxLength={80} value={form.title} onChange={e=>field('title',e.target.value)} placeholder="给你的故事起个名字"/></label><label>分类<select value={form.category} onChange={e=>field('category',e.target.value)}>{categories.slice(1).map(c=><option key={c}>{c}</option>)}</select></label></div><label>短剧简介<textarea required maxLength={2000} rows={3} value={form.description} onChange={e=>field('description',e.target.value)} placeholder="一句话，让观众走进你的故事…"/></label><label>封面地址<input required maxLength={1000} value={form.coverImg} onChange={e=>field('coverImg',e.target.value)} placeholder="https://… 或 /media/forest.jpg"/></label><label>首集视频地址<input required maxLength={1000} value={form.videoUrl} onChange={e=>field('videoUrl',e.target.value)} placeholder="可播放的 MP4 地址"/></label><p className="field-hint">可使用已提供的本地封面与示例视频，也支持 HTTP / HTTPS 地址。</p>{error&&<p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose} disabled={busy}>取消</button><button className="primary" disabled={busy}>{busy?<LoaderCircle className="spin" size={16}/>:<Check size={16}/>}保存短剧</button></div></form></Modal>;
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
createRoot(document.getElementById('root')!).render(<App/>);
