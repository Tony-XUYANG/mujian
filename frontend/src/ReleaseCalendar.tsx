import { useEffect, useState } from 'react';
import { BellPlus, CalendarDays, Check, LoaderCircle, RefreshCw, Search } from 'lucide-react';
import { api, type User } from './api';
import { releaseDay, releaseStatus, releaseTime, useLiveRevision, type ReleasePlan } from './releases';

export function ReleaseCalendar({user,mine,onLogin,onView,onChange}:{user:User|null;mine:boolean;onLogin:()=>void;onView:(id:number,episodeId?:number)=>void;onChange:()=>void}){
  const [rows,setRows]=useState<ReleasePlan[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState<number|null>(null),[notice,setNotice]=useState('');
  const [query,setQuery]=useState(''),[week,setWeek]=useState(false),[revision,refresh]=useLiveRevision();
  useEffect(()=>{
    if(mine&&!user){setRows([]);setLoading(false);return;}
    let active=true;setError('');
    api<ReleasePlan[]>(mine?'/me/reservations':'/release-plans').then(r=>{if(active)setRows(r);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[user?.id,mine,revision]);
  async function reserve(p:ReleasePlan){
    if(!user){onLogin();return;}if(busy!==null)return;setBusy(p.id);setError('');setNotice('');
    try{await api('/release-plans/'+p.id+'/reservation',{method:p.reserved?'DELETE':'PUT'});setRows(list=>mine?list.filter(x=>x.id!==p.id):list.map(x=>x.id===p.id?{...x,reserved:!p.reserved}:x));setNotice(p.reserved?'已取消预约；如果仍在追剧，上新时会继续收到追剧提醒。':'预约成功，上线后会在右上角提醒你。');onChange();}
    catch(e){setError((e as Error).message);}finally{setBusy(null);}
  }
  const visible=rows.filter(p=>(p.dramaTitle+p.title).includes(query.trim())&&(!week||p.publishAt<=Date.now()+7*86400000));
  return <section className="release-calendar" aria-label={mine?'我的预约':'更新日历'}>
    <div className="release-intro"><CalendarDays size={21}/><div><h2>{mine?'等一场故事，赴一个约':'下一集，提前期待'}</h2><p>北京时间 · {mine?'改期和取消状态会同步到这里':'预约新集，上线后收到站内提醒'}</p></div><button className="icon-button" aria-label="刷新排期" onClick={refresh}><RefreshCw size={17}/></button></div>
    {mine&&!user?<div className="empty"><BellPlus size={32}/><h3>登录后查看预约</h3><button className="primary" onClick={onLogin}>登录 / 注册</button></div>:<>
      <div className="release-tools"><div className="search-box"><Search size={16}/><input aria-label="搜索更新计划" placeholder="搜索剧名或分集" value={query} onChange={e=>setQuery(e.target.value)}/></div>{!mine&&<button className={'category'+(week?' selected':'')} aria-pressed={week} onClick={()=>setWeek(v=>!v)}>未来七天</button>}</div>
      {notice&&<p className="episode-success" role="status">{notice}</p>}{error&&<div className="release-error" role="alert">{error}<button className="secondary" onClick={refresh}>重试</button></div>}
      {loading?<div className="empty"><LoaderCircle className="spin"/>加载更新计划…</div>:!visible.length&&!error?<div className="empty"><CalendarDays size={32}/><h3>{query||week?'没有符合条件的排期':mine?'还没有预约的故事':'暂时没有新的更新计划'}</h3><p>{mine?'到“更新日历”预约喜欢的新集。':'有排期后会在这里展示。'}</p></div>:<div className="release-list">{visible.map((p,i)=><div key={p.id}>{(!i||releaseDay(p.publishAt)!==releaseDay(visible[i-1].publishAt)||p.status!==visible[i-1].status)&&<h3 className="release-day">{releaseDay(p.publishAt)}<span>{releaseStatus[p.status]}</span></h3>}<article className="release-card"><img src={p.coverImg} alt=""/><div className="release-copy"><span className={'release-state '+p.status.toLowerCase()}>{p.status==='SCHEDULED'?releaseTime(p.publishAt)+(p.publishAt<Date.now()?' · 即将上线':' 更新'):releaseStatus[p.status]}</span><h3>{p.dramaTitle}</h3><p>第 {p.episodeNo} 集 · {p.title}</p><div className="release-actions">{p.status==='PUBLISHED'&&p.episodeId?<button className="primary" onClick={()=>onView(p.dramaId,p.episodeId!)}>观看新集</button>:p.status==='PUBLISHED'?<span className="muted">本集已下架</span>:null}{p.status==='SCHEDULED'||p.reserved?<button className={p.reserved?'secondary':'primary'} disabled={busy!==null} onClick={()=>void reserve(p)} aria-label={(p.reserved?'取消预约':'预约')+p.dramaTitle+'第'+p.episodeNo+'集'}>{busy===p.id?<LoaderCircle size={15} className="spin"/>:p.reserved?<Check size={15}/>:<BellPlus size={15}/>} {p.reserved?'取消预约':'预约新集'}</button>:null}</div></div></article></div>)}</div>}
    </>}
  </section>;
}
