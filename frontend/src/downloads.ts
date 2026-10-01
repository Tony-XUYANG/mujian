import type { Drama } from './api';
export type DownloadedDrama = Pick<Drama,'id'|'title'|'category'|'coverImg'|'videoUrl'> & { episodeId?:number; episodeNo?:number };
export const DOWNLOADS_KEY = 'mujian_downloads';
export const downloadKey = (item:DownloadedDrama) => item.id+':'+(item.episodeId||0);
export function readDownloads(): DownloadedDrama[] {
  try {
    const items=JSON.parse(localStorage.getItem(DOWNLOADS_KEY)||'[]');
    return Array.isArray(items)?items.filter((item):item is DownloadedDrama=>Number.isSafeInteger(item?.id)&&typeof item?.videoUrl==='string'&&typeof item?.title==='string'):[];
  } catch { return []; }
}
