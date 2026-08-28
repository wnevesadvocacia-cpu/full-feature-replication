import { useEffect, useRef, useState } from "react";

/**
 * Barra de rolagem customizada (larga e de alto contraste) que funciona em
 * todos os navegadores, inclusive Firefox (que ignora largura de scrollbar).
 */
export function FatScrollbar({ targetRef }: { targetRef: React.RefObject<HTMLElement> }) {
  const [metrics, setMetrics] = useState({ top: 0, height: 0, visible: false, trackTop: 0, trackHeight: 0 });
  const dragRef = useRef<{ startY: number; startScroll: number } | null>(null);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      const ratio = el.clientHeight / el.scrollHeight;
      const visible = el.scrollHeight - el.clientHeight > 4;
      const trackHeight = rect.height;
      const height = Math.max(48, trackHeight * ratio);
      const maxTop = trackHeight - height;
      const top = maxTop * (el.scrollTop / (el.scrollHeight - el.clientHeight || 1));
      setMetrics({ top, height, visible, trackTop: rect.top, trackHeight });
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const mo = new MutationObserver(update);
    mo.observe(el, { childList: true, subtree: true });

    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      ro.disconnect();
      mo.disconnect();
    };
  }, [targetRef]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const el = targetRef.current;
      const drag = dragRef.current;
      if (!el || !drag) return;
      const maxTop = metrics.trackHeight - metrics.height || 1;
      const delta = e.clientY - drag.startY;
      const scrollable = el.scrollHeight - el.clientHeight;
      el.scrollTop = drag.startScroll + (delta / maxTop) * scrollable;
    };
    const onUp = () => {
      dragRef.current = null;
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [targetRef, metrics.trackHeight, metrics.height]);

  // Autoscroll com o botão do meio (roda) do mouse — o nativo do navegador só
  // funciona no scroller do documento, não em containers internos.
  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    let raf = 0;
    let anchorY = 0;
    let currentY = 0;
    let active = false;

    const stop = () => {
      if (!active) return;
      active = false;
      cancelAnimationFrame(raf);
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onStop, true);
      window.removeEventListener("keydown", onStop, true);
    };
    const onMove = (e: MouseEvent) => { currentY = e.clientY; };
    const onStop = () => stop();
    const tick = () => {
      if (!active) return;
      const d = currentY - anchorY;
      const dead = 12;
      if (Math.abs(d) > dead) {
        // Velocidade progressiva e limitada, no padrão do autoscroll nativo do Chrome.
        const speed = Math.min((Math.abs(d) - dead) * 0.08, 22);
        el.scrollTop += Math.sign(d) * speed;
      }
      raf = requestAnimationFrame(tick);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 1) return;
      e.preventDefault();
      if (active) { stop(); return; }
      active = true;
      anchorY = currentY = e.clientY;
      document.body.style.cursor = "ns-resize";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mousedown", onStop, true);
      window.addEventListener("keydown", onStop, true);
      raf = requestAnimationFrame(tick);
    };
    const onAux = (e: MouseEvent) => { if (e.button === 1) e.preventDefault(); };

    el.addEventListener("mousedown", onMouseDown);
    el.addEventListener("auxclick", onAux);
    return () => {
      el.removeEventListener("mousedown", onMouseDown);
      el.removeEventListener("auxclick", onAux);
      stop();
    };
  }, [targetRef]);


  if (!metrics.visible) return null;

  return (
    <div
      className="fixed right-0 z-40 w-[22px] border-l border-border bg-muted"
      style={{ top: metrics.trackTop, height: metrics.trackHeight }}
      onMouseDown={(e) => {
        const el = targetRef.current;
        if (!el || e.target !== e.currentTarget) return;
        const y = e.clientY - metrics.trackTop - metrics.height / 2;
        const maxTop = metrics.trackHeight - metrics.height || 1;
        el.scrollTop = (Math.min(Math.max(y, 0), maxTop) / maxTop) * (el.scrollHeight - el.clientHeight);
      }}
    >
      <div
        className="absolute left-[3px] w-[16px] rounded-full bg-primary shadow-sm transition-colors hover:bg-primary-glow"
        style={{ top: metrics.top, height: metrics.height }}
        onMouseDown={(e) => {
          const el = targetRef.current;
          if (!el) return;
          e.preventDefault();
          dragRef.current = { startY: e.clientY, startScroll: el.scrollTop };
          document.body.style.userSelect = "none";
        }}
      />
    </div>
  );
}
