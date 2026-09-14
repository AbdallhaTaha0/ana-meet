import { useCallback, useEffect, useRef, useState } from 'react';
import { api, mediaUrl } from './api';

// Loads upload bytes with credentials (cookies) and exposes a blob object URL.
// Two permanent-jank guards:
// 1. Credentialed fetch (plain <img> tags can't reliably send SameSite=Lax
//    cookies cross-origin) with explicit loading/error states.
// 2. Viewport gating: nothing downloads until the placeholder scrolls near
//    the viewport, so opening a media-heavy chat or feed never fires dozens
//    of concurrent downloads at once.
export function useObjectMedia(url: string | null | undefined): {
  src: string | null;
  loading: boolean;
  failed: boolean;
  gateRef: (element: HTMLElement | null) => void;
} {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);

  const gateRef = useCallback(
    (element: HTMLElement | null) => {
      observer.current?.disconnect();
      observer.current = null;
      if (!element || !url) return;
      if (typeof IntersectionObserver === 'undefined') {
        setVisible(true);
        return;
      }
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setVisible(true);
            io.disconnect();
          }
        },
        { rootMargin: '500px' },
      );
      observer.current = io;
      io.observe(element);
    },
    [url],
  );

  useEffect(() => () => observer.current?.disconnect(), []);

  useEffect(() => {
    if (!url || !visible) {
      if (!url) {
        setSrc(null);
        setLoading(false);
        setFailed(false);
      }
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
  }, [url, visible]);

  return { src, loading, failed, gateRef };
}
