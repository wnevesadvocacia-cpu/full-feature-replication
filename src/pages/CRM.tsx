import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, GripVertical, User2, Inbox } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type Col = { key: string; label: string; accent: string; dot: string };

const COLUMNS: Col[] = [
  { key: 'prospecto', label: 'Prospecto', accent: 'border-t-muted-foreground/40', dot: 'bg-muted-foreground/60' },
  { key: 'novo',      label: 'Novo',      accent: 'border-t-info',                dot: 'bg-info' },
  { key: 'ativo',     label: 'Ativo',     accent: 'border-t-primary',             dot: 'bg-primary' },
  { key: 'recursal',  label: 'Recursal',  accent: 'border-t-warning',             dot: 'bg-warning' },
  { key: 'arquivado', label: 'Arquivado', accent: 'border-t-success',             dot: 'bg-success' },
];

const fmtBRL = (v: number | null | undefined) =>
  typeof v === 'number'
    ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
    : null;

const formatCNJ = (n?: string | null) => {
  if (!n) return '';
  // Show only the meaningful prefix (NNNNNNN-DD.AAAA) for cleaner cards
  const clean = n.replace(/\s/g, '');
  return clean.length > 25 ? clean.slice(0, 25) + '…' : clean;
};

const initials = (name?: string | null) => {
  if (!name) return '—';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
};

export default function CRM() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: processes = [], isLoading } = useQuery({
    queryKey: ['crm-processes'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('processes')
        .select('id, number, title, status, client_name, value')
        .order('updated_at', { ascending: false })
        .limit(5000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const move = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('processes').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm-processes'] }),
    onError: (e: any) => toast({ title: 'Erro ao mover', description: e.message, variant: 'destructive' }),
  });

  const grouped = useMemo(() => {
    const m: Record<string, any[]> = {};
    COLUMNS.forEach((c) => (m[c.key] = []));
    (processes as any[]).forEach((p) => {
      const k = COLUMNS.find((c) => c.key === p.status)?.key || 'novo';
      m[k].push(p);
    });
    return m;
  }, [processes]);

  const totalByCol = (key: string) =>
    grouped[key]?.reduce((s, p) => s + (Number(p.value) || 0), 0) || 0;

  if (isLoading) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight">CRM Kanban</h1>
          <p className="text-muted-foreground text-sm mt-1.5">
            Arraste cards entre colunas para atualizar o status do processo.
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="tabular-nums font-medium text-foreground">{processes.length}</span> total
          </span>
        </div>
      </div>

      {/* Board with horizontal scroll on small screens */}
      <div className="overflow-x-auto -mx-6 lg:-mx-8 px-6 lg:px-8 pb-4">
        <div className="grid grid-flow-col auto-cols-[minmax(280px,1fr)] gap-4 min-h-[calc(100vh-220px)]">
          {COLUMNS.map((col) => {
            const items = grouped[col.key] || [];
            const total = totalByCol(col.key);
            return (
              <div
                key={col.key}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const id = e.dataTransfer.getData('text/plain');
                  if (id) move.mutate({ id, status: col.key });
                }}
                className={cn(
                  'group/col flex flex-col rounded-xl border border-hairline bg-muted/30',
                  'border-t-2', col.accent,
                  'transition-colors hover:bg-muted/40'
                )}
              >
                {/* Column header */}
                <div className="px-4 pt-4 pb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={cn('h-2 w-2 rounded-full', col.dot)} />
                    <h3 className="font-display text-sm font-semibold tracking-tight">
                      {col.label}
                    </h3>
                    <span className="text-[11px] tabular-nums font-medium text-muted-foreground bg-background/80 border border-hairline px-1.5 py-0.5 rounded">
                      {items.length}
                    </span>
                  </div>
                  {total > 0 && (
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {fmtBRL(total)}
                    </span>
                  )}
                </div>

                {/* Cards */}
                <div className="flex-1 px-3 pb-3 space-y-2 overflow-y-auto">
                  {items.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground/60">
                      <Inbox className="h-5 w-5 mb-2 opacity-50" />
                      <p className="text-xs">Solte processos aqui</p>
                    </div>
                  )}

                  {items.map((p) => (
                    <article
                      key={p.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', p.id)}
                      className={cn(
                        'group relative bg-card border border-hairline rounded-lg p-3.5',
                        'shadow-card hover:shadow-card-hover hover:-translate-y-0.5 hover:border-primary/30',
                        'cursor-grab active:cursor-grabbing transition-all duration-200'
                      )}
                    >
                      {/* Drag handle */}
                      <GripVertical className="absolute top-3 right-2 h-3.5 w-3.5 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity" />

                      {/* CNJ */}
                      <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/80 truncate pr-5">
                        {formatCNJ(p.number)}
                      </p>

                      {/* Title */}
                      <p className="text-sm font-medium mt-1.5 leading-snug line-clamp-2 text-foreground">
                        {p.title || 'Sem título'}
                      </p>

                      {/* Footer */}
                      {(p.client_name || p.value) && (
                        <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-hairline">
                          {p.client_name ? (
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="h-5 w-5 rounded-full bg-gradient-gold flex items-center justify-center shrink-0">
                                <span className="text-[9px] font-semibold text-primary-foreground">
                                  {initials(p.client_name)}
                                </span>
                              </span>
                              <span className="text-[11px] text-muted-foreground truncate">
                                {p.client_name}
                              </span>
                            </div>
                          ) : (
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
                              <User2 className="h-3 w-3" /> Sem cliente
                            </span>
                          )}
                          {typeof p.value === 'number' && p.value > 0 && (
                            <span className="text-[11px] tabular-nums font-medium text-primary shrink-0">
                              {fmtBRL(p.value)}
                            </span>
                          )}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
