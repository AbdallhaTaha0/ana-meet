import { useEffect, useState } from 'react';
import { api, mediaUrl } from './api';

// Loads upload bytes with credentials (cookies) and exposes a blob object URL.
// Plain <img>/<video> tags cannot reliably send SameSite=Lax cookies for
// cross-origin media, and they render a broken icon on 403/404. This hook
// authenticates like every other API call and reports loading/error states.
export function useObjectMedia(url: string | null | undefined): {
  src: string | null;
  loading: boolean;
  failed: boolean;
} {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!url) {
      setSrc(null);
      setLoading(false);
      setFailed(false);
      return;
    }
    let live = true;
    let objectUrl: string | null = null;
    setLoading(true);
    setFailed(false);
    api
      .get<Blob>(mediaUrl(url), { responseType: 'blob' })
      .then(({ data, headers }) => {
        if (!live) return;
        const type =
          (headers['content-type'] as string) || data.type || 'application/octet-stream';
        objectUrl = URL.createObjectURL(new Blob([data], { type }));
        setSrc(objectUrl);
      })
      .catch(() => {
        if (live) setFailed(true);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return { src, loading, failed };
}
