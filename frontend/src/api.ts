export type User = { id: number; username: string; nickname: string; role: 'USER'|'ADMIN'; avatarUrl?: string|null; backgroundUrl?: string|null };
export type Drama = { id: number; title: string; coverImg: string; description: string; videoUrl: string; category: string; viewCount: number; likeCount: number; favoriteCount: number; liked: boolean|number; favorited: boolean|number; createTime: string; progressSec?: number; durationSec?: number; lastWatched?: string };
export type Comment = { id: number; content: string; nickname: string; avatar: string; createTime: string };
export type DramaInput = Pick<Drama,'title'|'coverImg'|'description'|'videoUrl'|'category'>;
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem('mujian_token');
  const response = await fetch('/api'+path, { ...options, headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
  const data = await response.json().catch(() => ({ message: '服务响应异常，请稍后重试' }));
  if (!response.ok) {
    if(response.status === 401 && token && token === sessionStorage.getItem('mujian_token') && !path.startsWith('/auth/login') && !path.startsWith('/auth/register')) {
      sessionStorage.removeItem('mujian_token'); window.dispatchEvent(new Event('session-expired'));
    }
    throw new ApiError(response.status, data.message || '请求失败，请稍后重试');
  }
  return data;
}
export const count = (n: number) => n >= 10000 ? `${(n/10000).toFixed(1)}万` : n.toLocaleString('zh-CN');
