import React, { useEffect, useRef } from 'react';

export function Modal({children,onClose,className='',label}:{children:React.ReactNode;onClose:()=>void;className?:string;label:string}) {
  const ref=useRef<HTMLDivElement>(null);
  const closeRef=useRef(onClose);
  closeRef.current=onClose;
  useEffect(()=>{
    const before=document.activeElement as HTMLElement|null; const old=document.body.style.overflow; document.body.style.overflow='hidden';
    ref.current?.querySelector<HTMLElement>('button,input')?.focus();
    const key=(e:KeyboardEvent)=>{
      const topDialog=Array.from(document.querySelectorAll<HTMLElement>('.modal-backdrop')).sort((a,b)=>Number(getComputedStyle(a).zIndex)-Number(getComputedStyle(b).zIndex)).at(-1);
      if(topDialog!==ref.current?.parentElement)return;
      if(e.key==='Escape'){e.stopImmediatePropagation();closeRef.current();}
      if(e.key==='Tab'){
        const nodes=ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]):not([type="hidden"]),textarea:not([disabled]),select:not([disabled]),a[href],video[controls]');
        if(!nodes?.length)return;const first=nodes[0],last=nodes[nodes.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    };
    document.addEventListener('keydown',key);
    return()=>{document.body.style.overflow=old;document.removeEventListener('keydown',key);before?.focus();};
  },[]);
  return <div className={'modal-backdrop '+className} onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className="modal" ref={ref} role="dialog" aria-modal="true" aria-label={label}>{children}</div></div>;
}
