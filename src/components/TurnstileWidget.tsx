// Sec-3.4 — Cloudflare Turnstile (invisible). Renderiza só quando required=true.
import { useEffect, useRef } from 'react';

declare global {
  interface Window { turnstile?: any }
}

const SITE_KEY = (import.meta as any).env?.VITE_TURNSTILE_SITE_KEY ?? '1x00000000000000000000AA';
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__tsLoad';
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve) => {
    (window as any).__tsLoad = () => resolve();
    const s = document.createElement('script');
    s.src = SCRIPT_URL; s.async = true; s.defer = true;
    document.head.appendChild(s);
  });
  return scriptPromise;
}

type Props = { onToken: (token: string) => void; onError?: () => void };

export function TurnstileWidget({ onToken, onError }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancel = false;
    loadScript().then(() => {
      if (cancel || !ref.current || !window.turnstile) return;
      widgetIdRef.current = window.turnstile.render(ref.current, {
        sitekey: SITE_KEY,
        size: 'invisible',
        callback: (token: string) => onToken(token),
        'error-callback': () => onError?.(),
      });
      try { window.turnstile.execute(widgetIdRef.current); } catch {}
    });
    return () => {
      cancel = true;
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch {}
      }
    };
  }, [onToken, onError]);

  return <div ref={ref} />;
}
