import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

interface Health {
  current_source: string;
  last_ok_at: string | null;
  last_fail_at: string | null;
  consecutive_failures: number;
  last_error: string | null;
  updated_at: string;
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'nunca';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

export function DjenHealthBadge() {
  const { data } = useQuery({
    queryKey: ['djen-source-health'],
    queryFn: async () => {
      const { data } = await supabase
        .from('djen_source_health')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      return data as Health | null;
    },
    refetchInterval: 60_000,
  });

  if (!data) return null;

  const degraded = data.current_source !== 'djen' || data.consecutive_failures >= 2;
  const warn = data.consecutive_failures === 1;
  const ok = !degraded && !warn;

  const Icon = ok ? CheckCircle2 : degraded ? XCircle : AlertTriangle;
  const label = ok
    ? `DJEN/CNJ operante · última sync ${timeAgo(data.last_ok_at)}`
    : degraded
      ? `DJEN/CNJ indisponível (${data.consecutive_failures} falhas) · última OK ${timeAgo(data.last_ok_at)}`
      : `DJEN/CNJ instável · última tentativa falhou ${timeAgo(data.last_fail_at)}`;

  const cls = ok
    ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400'
    : degraded
      ? 'bg-destructive/10 text-destructive border-destructive/30'
      : 'bg-warning/10 text-warning border-warning/30';

  return (
    <div className="mt-2 inline-flex">
      <Badge variant="outline" className={`text-xs font-medium ${cls}`} title={data.last_error ?? ''}>
        <Icon className="h-3 w-3 mr-1" />
        {label}
      </Badge>
    </div>
  );
}
