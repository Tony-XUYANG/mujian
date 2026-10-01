import { useEffect, useState } from 'react';

export type ReleasePlan={id:number;dramaId:number;dramaTitle:string;coverImg:string;episodeNo:number;title:string;publishAt:number;status:'SCHEDULED'|'PUBLISHED'|'CANCELLED';reserved:boolean|number;episodeId:number|null;publishedAt:number|null;videoUrl?:string;reservationCount?:number};
export const releaseStatus={SCHEDULED:'待更新',PUBLISHED:'已上线',CANCELLED:'已取消'};
export const releaseTime=(time:number)=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(time);
export const releaseDay=(time:number)=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'long',day:'numeric',weekday:'long'}).format(time);
export function useLiveRevision(){
  const [revision,setRevision]=useState(0);
  const refresh=()=>setRevision(n=>n+1);
  useEffect(()=>{
    const update=()=>{if(document.visibilityState==='visible'&&navigator.onLine)setRevision(n=>n+1);};
    const timer=setInterval(update,30000);
    window.addEventListener('focus',update);window.addEventListener('online',update);document.addEventListener('visibilitychange',update);
    return()=>{clearInterval(timer);window.removeEventListener('focus',update);window.removeEventListener('online',update);document.removeEventListener('visibilitychange',update);};
  },[]);
  return [revision,refresh] as const;
}
