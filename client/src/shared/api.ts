import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

const baseURL = import.meta.env.VITE_API_URL || '';
export const api = axios.create({ baseURL, withCredentials: true, timeout: 15000 });

api.interceptors.request.use((request: InternalAxiosRequestConfig) => {
  if (request.method && !['get', 'head', 'options'].includes(request.method.toLowerCase())) {
    request.headers.set('X-Requested-With', 'XMLHttpRequest');
  }
  return request;
});

let refreshPromise: Promise<void> | null = null;
api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const request = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
  if (
    error.response?.status === 401 &&
    request &&
    !request._retried &&
    !request.url?.includes('/auth/')
  ) {
    request._retried = true;
    try {
      refreshPromise ??= api
        .post('/api/v1/auth/refresh')
        .then(() => undefined)
        .finally(() => {
          refreshPromise = null;
        });
      await refreshPromise;
      return api(request);
    } catch {
      window.dispatchEvent(new Event('ana-auth-expired'));
    }
  }
  return Promise.reject(error);
});

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'Could not connect. Check your connection and try again.';
    const body = error.response.data as { error?: { message?: string } } | undefined;
    return body?.error?.message || `Request failed (${error.response.status}). Please try again.`;
  }
  return 'Please try again.';
}

export function mediaUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.pathname.startsWith('/api/v1/uploads/')) return `${baseURL}${parsed.pathname}`;
  } catch {
    return url;
  }
  return url;
}
