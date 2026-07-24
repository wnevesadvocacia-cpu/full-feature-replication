// Custom confirm modal (sem checkbox "não mostrar novamente" do navegador).
// Retorna Promise<boolean>. Usa DOM puro para funcionar em qualquer contexto.

export function confirmModal(message: string, opts?: { title?: string; okLabel?: string; cancelLabel?: string }): Promise<boolean> {
  return new Promise((resolve) => {
    const title = opts?.title ?? 'Confirmação necessária';
    const okLabel = opts?.okLabel ?? 'Continuar';
    const cancelLabel = opts?.cancelLabel ?? 'Cancelar';

    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:16px;font-family:inherit;pointer-events:auto !important;';

    const box = document.createElement('div');
    box.style.cssText = 'background:hsl(var(--background,0 0% 100%));color:hsl(var(--foreground,222 47% 11%));max-width:520px;width:100%;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.35);padding:20px;border:1px solid hsl(var(--border,214 32% 91%));pointer-events:auto !important;'

    const h = document.createElement('div');
    h.textContent = title;
    h.style.cssText = 'font-weight:600;font-size:16px;margin-bottom:10px;';

    const body = document.createElement('div');
    body.style.cssText = 'font-size:14px;white-space:pre-wrap;line-height:1.5;margin-bottom:18px;';
    body.textContent = message;

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = cancelLabel;
    cancelBtn.style.cssText = 'padding:8px 14px;border-radius:8px;border:1px solid hsl(var(--border,214 32% 91%));background:transparent;color:inherit;cursor:pointer;font-size:14px;pointer-events:auto !important;';

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.textContent = okLabel;
    okBtn.style.cssText = 'padding:8px 14px;border-radius:8px;border:1px solid hsl(var(--primary,222 47% 11%));background:hsl(var(--primary,222 47% 11%));color:hsl(var(--primary-foreground,0 0% 100%));cursor:pointer;font-size:14px;font-weight:500;pointer-events:auto !important;';

    const close = (result: boolean) => {
      document.removeEventListener('keydown', onKey);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      resolve(result);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
      else if (e.key === 'Enter') close(true);
    };

    cancelBtn.onclick = () => close(false);
    okBtn.onclick = () => close(true);
    overlay.onclick = (e) => { if (e.target === overlay) close(false); };
    document.addEventListener('keydown', onKey);

    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    box.appendChild(h);
    box.appendChild(body);
    box.appendChild(actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    setTimeout(() => okBtn.focus(), 0);
  });
}
