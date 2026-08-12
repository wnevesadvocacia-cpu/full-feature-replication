import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Props {
  number: string;
  className?: string;
  iconClassName?: string;
  showLabel?: boolean;
  title?: string;
}

export function CopyNumber({ number, className = '', iconClassName = '', showLabel, title }: Props) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(number);
      setCopied(true);
      toast({ title: 'Número copiado!' });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: 'Não foi possível copiar', variant: 'destructive' });
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={title ?? `Copiar ${number}`}
      className={`inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors ${className}`}
    >
      {showLabel && <span className="text-xs">Copiar</span>}
      {copied ? (
        <Check className={`h-3.5 w-3.5 text-green-600 ${iconClassName}`} />
      ) : (
        <Copy className={`h-3.5 w-3.5 ${iconClassName}`} />
      )}
    </button>
  );
}
