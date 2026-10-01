import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertCircle, ArrowUpRight, Bell, Bookmark, Download, Eye, Film, Heart, History, ListVideo, LoaderCircle, MessageCircle, PictureInPicture2, Play, Share2, SkipBack, SkipForward, X } from 'lucide-react';
import { api, count, seriesLabel, type Comment, type Drama, type Episode, type User } from './api';
import { Modal } from './Modal';
import { DOWNLOADS_KEY, downloadKey, readDownloads, type DownloadedDrama } from './downloads';

type Props = { id:number; initialEpisodeId?:number; user:User|null; onClose:()=>void; onLogin:()=>void; toast:(s:string,error?:boolean)=>void; onChange:()=>void };
const rates=[0.75,1,1.25,1.5,2];
function preference(key:string,fallback:string) { try {return localStorage.getItem(key)||fallback;} catch {return fallback;} }
function remember(key:string,value:string) { try {localStorage.setItem(key,value);} catch { /* Playback still works without storage. */ } }
export function Player({id,initialEpisodeId,user,onClose,onLogin,toast,onChange}:Props) {
  const [drama,setDrama]=useState<Drama|null>(null),[episodes,setEpisodes]=useState<Episode[]>([]),[selected,setSelected]=useState(0);
  const [comments,setComments]=useState<Comment[]>([]),[text,setText]=useState(''),[commentBusy,setCommentBusy]=useState(false);
  const [error,setError]=useState(''),[retry,setRetry]=useState(0),[busy,setBusy]=useState(false),[cacheBusy,setCacheBusy]=useState(false),[offline,setOffline]=useState(false);
  const [autoplay,setAutoplay]=useState(false),[autoNext,setAutoNext]=useState(()=>preference('mujian_auto_next','true')==='true');
  const [rate,setRate]=useState(()=>{const n=Number(preference('mujian_rate','1'));return rates.includes(n)?n:1;}),[descending,setDescending]=useState(false);
  const [finished,setFinished]=useState(false);
  const videoRef=useRef<HTMLVideoElement|null>(null),counted=useRef(false),queue=useRef(Promise.resolve());
  const episode=episodes.find(e=>e.id===selected),index=episodes.findIndex(e=>e.id===selected);
  useEffect(()=>{
    let active=true;setDrama(null);setError('');setFinished(false);setAutoplay(false);
    Promise.all([api<Drama>('/dramas/'+id),api<Episode[]>('/dramas/'+id+'/episodes'),api<Comment[]>('/dramas/'+id+'/comments')])
      .then(([d,e,c])=>{if(!active)return;if(!e.length)throw new Error('这部短剧暂时没有可播放的分集');setDrama(d);setEpisodes(e);setComments(c);setSelected(e.find(item=>item.id===initialEpisodeId)?.id||e.find(item=>item.id===d.resumeEpisodeId)?.id||e[0].id);})
      .catch(e=>{if(active)setError(e.message);});
    return()=>{active=false;};
  },[id,initialEpisodeId,user?.id,retry]);
  useEffect(()=>{
    let active=true;setOffline(false);
    if(episode&&'caches' in window)caches.open('mujian-offline-v1').then(cache=>cache.match(episode.videoUrl)).then(cached=>{
      if(active)setOffline(Boolean(cached)&&readDownloads().some(item=>item.id===id&&item.videoUrl===episode.videoUrl&&(item.episodeId===episode.id||(!item.episodeId&&episode.episodeNo===1))));
    }).catch(()=>undefined);
    return()=>{active=false;};
  },[id,episode?.id,episode?.videoUrl,cacheBusy]);

  function persist(ep:Episode,progressSec:number,durationSec:number) {
    if(!user)return;
    const token=sessionStorage.getItem('mujian_token');
    setEpisodes(items=>items.map(item=>item.id===ep.id?{...item,progressSec,durationSec}:item));
    // All requests from this player remain ordered, even when the next video mounts immediately.
    queue.current=queue.current.then(async()=>{
      if(!token||token!==sessionStorage.getItem('mujian_token'))return;
      try {await api('/dramas/'+id+'/episodes/'+ep.id+'/progress',{method:'PUT',keepalive:true,body:JSON.stringify({progressSec,durationSec})});onChange();}
      catch {toast('本次进度未同步，请联网后继续播放',true);}
    });
  }
  function choose(ep:Episode) {if(ep.id===selected)return;setSelected(ep.id);setAutoplay(true);setFinished(false);}
  function ended() {if(autoNext&&index<episodes.length-1)choose(episodes[index+1]);else setFinished(true);}
  async function interact(kind:'like'|'favorite'|'follow') {
    if(!user){onLogin();return;}if(!drama||busy)return;setBusy(true);
    const active=kind==='like'?drama.liked:kind==='favorite'?drama.favorited:drama.followed;
    try {const d=await api<Drama>('/dramas/'+id+'/'+kind,{method:active?'DELETE':'PUT'});setDrama(d);onChange();toast(kind==='follow'?(active?'已取消追剧':'已加入我的追剧'):(active?'已取消'+(kind==='like'?'点赞':'收藏'):kind==='like'?'喜欢已送达':'已加入我的收藏'));}
    catch(e){toast((e as Error).message,true);}finally{setBusy(false);}
  }
  function view() {if(counted.current)return;counted.current=true;api<Drama>('/dramas/'+id+'/view',{method:'POST'}).then(d=>{setDrama(old=>old?{...old,viewCount:d.viewCount}:old);onChange();}).catch(()=>{counted.current=false;});}
  async function share() {const url=location.origin+'/#watch/'+id;try{if(navigator.share)await navigator.share({title:drama?.title||'幕间短剧',url});else{await navigator.clipboard.writeText(url);toast('分享链接已复制');}}catch(e){if(!(e instanceof DOMException&&e.name==='AbortError'))toast('分享失败，请检查浏览器权限',true);}}
  async function pip() {
    const video=videoRef.current;
    if(!video||!document.pictureInPictureEnabled||!video.requestPictureInPicture){toast('当前浏览器暂不支持小窗播放',true);return;}
    if(video.readyState<2){toast('视频加载后即可开启小窗');return;}
    try {if(document.pictureInPictureElement)await document.exitPictureInPicture();else await video.requestPictureInPicture();}
    catch {toast('小窗未能开启，请先播放视频后重试',true);}
  }
  async function cacheVideo() {
    if(!drama||!episode||cacheBusy||offline)return;setCacheBusy(true);
    const ep=episode;
    try {
      if(!('caches' in window))throw new Error();
      const cache=await caches.open('mujian-offline-v1');if(!await cache.match(ep.videoUrl))await cache.add(ep.videoUrl);await cache.add(drama.coverImg).catch(()=>undefined);
      const item:DownloadedDrama={id,title:drama.title+(episodes.length>1?' · 第'+ep.episodeNo+'集':''),category:drama.category,coverImg:drama.coverImg,videoUrl:ep.videoUrl,episodeId:ep.id,episodeNo:ep.episodeNo};
      const rest=readDownloads().filter(d=>downloadKey(d)!==downloadKey(item)&&!(d.id===id&&!d.episodeId&&ep.episodeNo===1));
      localStorage.setItem(DOWNLOADS_KEY,JSON.stringify([item,...rest]));window.dispatchEvent(new Event('downloads-changed'));toast('第'+ep.episodeNo+'集已保存到离线片库');
    }catch{toast('缓存失败，请检查网络或浏览器存储空间',true);}finally{setCacheBusy(false);}
  }
  async function addComment(e:FormEvent) {e.preventDefault();if(!user){onLogin();return;}if(!text.trim()||commentBusy)return;setCommentBusy(true);try{const item=await api<Comment>('/dramas/'+id+'/comments',{method:'POST',body:JSON.stringify({content:text.trim()})});setComments(c=>[item,...c]);setText('');toast('评论已发布');}catch(e){toast((e as Error).message,true);}finally{setCommentBusy(false);}}

  return <Modal label="短剧播放" className="player-overlay" onClose={onClose}>
    <div className="player-top"><span><Film size={17}/> 幕间放映室</span><div className="player-tools"><button className="icon-button" aria-label="分享短剧" onClick={share}><Share2 size={17}/></button><button className="icon-button" aria-label="关闭播放器" onClick={onClose}><X/></button></div></div>
    {error?<div className="empty"><AlertCircle/><p>{error}</p><button className="secondary" onClick={()=>setRetry(n=>n+1)}>重新加载</button></div>:!drama||!episode?<div className="empty"><LoaderCircle className="spin"/>正在准备故事…</div>:<>
      <EpisodeVideo key={episode.id+':'+(user?.id||0)} episode={episode} poster={drama.coverImg} rate={rate} autoplay={autoplay} user={user} bind={v=>{videoRef.current=v;}} onSave={persist} onPlay={view} onEnded={ended}/>
      <div className="playback-toolbar"><button className="icon-button" aria-label="上一集" disabled={index<=0} onClick={()=>choose(episodes[index-1])}><SkipBack size={18}/></button><span className="current-episode">第 {episode.episodeNo} 集<span>{episode.title}</span></span><button className="icon-button" aria-label="下一集" disabled={index>=episodes.length-1} onClick={()=>choose(episodes[index+1])}><SkipForward size={18}/></button><label className="rate-control">倍速<select aria-label="播放倍速" value={rate} onChange={e=>{const n=Number(e.target.value);setRate(n);remember('mujian_rate',String(n));}}>{rates.map(n=><option value={n} key={n}>{n}×</option>)}</select></label><button className="secondary pip-button" onClick={pip}><PictureInPicture2 size={16}/>小窗</button></div>
      <div className="player-info">
        <div className="player-heading"><div><span className="small-tag">{drama.category}</span><h2>{drama.title}</h2><p className="series-meta">{seriesLabel(drama)}</p></div><button className={drama.followed?'secondary is-liked':'primary'} disabled={busy} aria-pressed={Boolean(drama.followed)} onClick={()=>interact('follow')}><Bell size={16}/>{drama.followed?'已追剧':'追剧'}</button></div>
        <section className="episode-picker" aria-label="分集选集"><div className="episode-heading"><h3><ListVideo size={18}/>选集 <small>{episodes.length} 集</small></h3><button onClick={()=>setDescending(v=>!v)}>{descending?'倒序':'正序'}</button></div><div className="episode-grid">{(descending?[...episodes].reverse():episodes).map(ep=><button key={ep.id} className={ep.id===selected?'episode selected':'episode'} aria-label={'播放第'+ep.episodeNo+'集'} aria-pressed={ep.id===selected} onClick={()=>choose(ep)}><span>{ep.episodeNo}</span><small>{ep.id===selected?'播放中':ep.durationSec>0&&ep.progressSec>=Math.max(1,ep.durationSec-2)?'已看完':ep.progressSec>0?'看过':'待观看'}</small></button>)}</div><label className="auto-next"><input type="checkbox" checked={autoNext} onChange={e=>{setAutoNext(e.target.checked);remember('mujian_auto_next',String(e.target.checked));}}/>自动播放下一集<span>看到最后一集后停止</span></label></section>
        {finished&&<div className="episode-finished" role="status">{index<episodes.length-1?'本集已结束，可选择下一集继续。':drama.seriesStatus==='SERIALIZING'?'已看到最新一集，追剧后可在“我的追剧”查看更新。':'全剧已看完，感谢陪伴这个故事。'}</div>}
        <p className="drama-description">{drama.description}</p>
        <div className="player-actions"><button className={drama.liked?'secondary is-liked':'secondary'} disabled={busy} aria-pressed={Boolean(drama.liked)} onClick={()=>interact('like')}><Heart size={16}/>{drama.liked?'已点赞':'点赞'} {count(drama.likeCount)}</button><button className={drama.favorited?'secondary is-liked':'secondary'} disabled={busy} aria-pressed={Boolean(drama.favorited)} onClick={()=>interact('favorite')}><Bookmark size={16}/>{drama.favorited?'已收藏':'收藏'}</button><button className="secondary" disabled={cacheBusy||offline} onClick={cacheVideo}><Download size={15}/>{cacheBusy?'缓存中…':offline?'已缓存':'离线缓存'}</button><button className="secondary" onClick={share}><Share2 size={15}/>分享</button></div>
        <section className="comments"><div className="comments-heading"><h3><MessageCircle size={16}/>剧友说 <span>{comments.length}</span></h3><span>最新评论</span></div><div className="comment-list">{comments.length?comments.map(c=><article className="comment" key={c.id}><span className="comment-avatar">{c.avatar||c.nickname.slice(0,1)}</span><div><strong>{c.nickname}</strong><time>{new Date(c.createTime).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time><p>{c.content}</p></div></article>):<p className="comment-empty">还没有评论，来留下第一句观后感。</p>}</div><form className="comment-form" onSubmit={addComment}><input value={text} onChange={e=>setText(e.target.value)} maxLength={500} placeholder={user?'说说你对这部短剧的感受…':'登录后参与评论'}/><button className="primary" disabled={commentBusy||!text.trim()}>发布</button></form></section>
        <div className="player-foot"><span><Eye size={15}/> {count(drama.viewCount)} 次播放</span>{episode.videoUrl==='/media/sintel-trailer.mp4'&&<a href="https://www.sintel.org" target="_blank" rel="noreferrer">演示片源：Sintel · Blender Foundation · CC BY 3.0 <ArrowUpRight size={12}/></a>}</div>
        {episodes.length>1&&episode.videoUrl==='/media/sintel-trailer.mp4'&&<p className="field-hint">演示章节共用示例片源，用于体验选集与连播。</p>}
      </div>
    </>}
  </Modal>;
}

function EpisodeVideo({episode,poster,rate,autoplay,user,bind,onSave,onPlay,onEnded}:{episode:Episode;poster:string;rate:number;autoplay:boolean;user:User|null;bind:(v:HTMLVideoElement|null)=>void;onSave:(e:Episode,p:number,d:number)=>void;onPlay:()=>void;onEnded:()=>void}) {
  const ref=useRef<HTMLVideoElement>(null),initialized=useRef(false),lastSaved=useRef(-1),checkpoint=useRef(Date.now());
  const saveRef=useRef(onSave);saveRef.current=onSave;
  const [error,setError]=useState(false),[blocked,setBlocked]=useState(false),[restored,setRestored]=useState(0);
  function save(video:HTMLVideoElement) {
    if(!user||!initialized.current||!Number.isFinite(video.duration)||video.duration<1)return;
    const progress=Math.floor(video.currentTime),duration=Math.floor(video.duration);
    if(progress===lastSaved.current||(!progress&&lastSaved.current<0))return;
    lastSaved.current=progress;saveRef.current(episode,progress,duration);
  }
  useEffect(()=>{
    const video=ref.current!;bind(video);
    const hide=()=>{if(document.visibilityState==='hidden')save(video);};
    const leave=()=>save(video);
    document.addEventListener('visibilitychange',hide);window.addEventListener('pagehide',leave);
    return()=>{save(video);document.removeEventListener('visibilitychange',hide);window.removeEventListener('pagehide',leave);bind(null);};
  },[]);
  useEffect(()=>{if(ref.current)ref.current.playbackRate=rate;},[rate]);
  function metadata() {
    const video=ref.current!;video.playbackRate=rate;
    if(initialized.current)return;initialized.current=true;
    if(user&&episode.progressSec>0&&episode.progressSec<video.duration-2){video.currentTime=episode.progressSec;setRestored(episode.progressSec);}
    if(autoplay)void video.play().catch(()=>setBlocked(true));
  }
  return <><div className="video-wrap"><video ref={ref} src={episode.videoUrl} poster={poster} controls playsInline preload="metadata" onLoadedMetadata={metadata} onPlay={()=>{setBlocked(false);onPlay();}} onPause={e=>save(e.currentTarget)} onTimeUpdate={e=>{if(Date.now()-checkpoint.current>=15000){checkpoint.current=Date.now();save(e.currentTarget);}}} onEnded={e=>{save(e.currentTarget);onEnded();}} onError={()=>setError(true)}/>{error&&<div className="video-error" role="alert"><p>视频暂时无法播放，请检查网络后重试或选择其他分集。</p><button className="secondary" onClick={()=>{setError(false);initialized.current=false;ref.current?.load();}}>重试播放</button></div>}{blocked&&<button className="autoplay-blocked primary" onClick={()=>void ref.current?.play().catch(()=>setBlocked(true))}><Play size={16}/>点击播放本集</button>}</div>{restored>0&&<p className="resume-note episode-resume"><History size={14}/> 已从 {Math.floor(restored/60)}:{String(restored%60).padStart(2,'0')} 继续播放 · 第 {episode.episodeNo} 集</p>}</>;
}
