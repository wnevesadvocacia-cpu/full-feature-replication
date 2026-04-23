import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const COLUMNS = [
  { key: 'prospecto', label: 'Prospecto' },
  { key: 'novo', label: 'Novo' },
  { key: 'ativo', label: 'Ativo' },
  { key: 'recursal', label: 'Recursal' },
  { key: 'arquivado', label: 'Arquivado' },
];

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
        .limit(500);
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

  if (isLoading) {
    return <div className="p-6 flex justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display font-bold">CRM Kanban</h1>
        <p className="text-muted-foreground text-sm mt-1">Arraste cards para mudar o status do processo</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 min-h-[60vh]">
        {COLUMNS.map((col) => (
          <div
            key={col.key}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const id = e.dataTransfer.getData('text/plain');
              if (id) move.mutate({ id, status: col.key });
            }}
            className="bg-muted/40 rounded-lg p-3 flex flex-col gap-2 min-h-[200px]"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{col.label}</h3>
              <span className="text-xs text-muted-foreground">{grouped[col.key]?.length || 0}</span>
            </div>
            <div className="flex flex-col gap-2">
              {grouped[col.key]?.map((p) => (
                <div
                  key={p.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', p.id)}
                  className="bg-card rounded-md p-3 shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing border"
                >
                  <p className="text-xs font-mono text-muted-foreground">{p.number}</p>
                  <p className="text-sm font-medium mt-1 line-clamp-2">{p.title}</p>
                  {p.client_name && <p className="text-xs text-muted-foreground mt-1">{p.client_name}</p>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
