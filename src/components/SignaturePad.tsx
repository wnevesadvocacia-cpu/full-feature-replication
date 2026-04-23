import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Eraser, Check } from 'lucide-react';

type Props = {
  onSign: (dataUrl: string) => void;
  disabled?: boolean;
};

export function SignaturePad({ onSign, disabled }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * dpr;
    c.height = rect.height * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    setDrawing(true);
    canvasRef.current!.setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setHasInk(true);
  };

  const end = () => setDrawing(false);

  const clear = () => {
    const c = canvasRef.current!;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
  };

  const submit = () => {
    if (!hasInk) return;
    onSign(canvasRef.current!.toDataURL('image/png'));
  };

  return (
    <div className="space-y-3">
      <div className="border-2 border-dashed border-border rounded-md bg-muted/20 touch-none">
        <canvas
          ref={canvasRef}
          className="w-full h-48 cursor-crosshair block"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
      </div>
      <p className="text-xs text-muted-foreground text-center">Assine no campo acima usando mouse, dedo ou caneta.</p>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" size="sm" onClick={clear} disabled={disabled}>
          <Eraser className="h-4 w-4 mr-1" /> Limpar
        </Button>
        <Button type="button" size="sm" onClick={submit} disabled={disabled || !hasInk}>
          <Check className="h-4 w-4 mr-1" /> Confirmar assinatura
        </Button>
      </div>
    </div>
  );
}
