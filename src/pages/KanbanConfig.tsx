import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { KanbanSquare, Plus, Trash2, ArrowUp, ArrowDown, Save } from 'lucide-react';

const PRESET_COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#f97316', '#06b6d4'];

const DEFAULTS = [
  { title: 'Novo', status_key: 'novo', color: '#6366f1', position: 0 },
  { title: 'Em Andamento', status_key: 'em_andamento', color: '#3b82f6', position: 1 },
  { title: 'Aguardando', status_key: 'aguardando', color: '#f59e0b', position: 2 },
  { title: 'Concluído', status_key: 'concluido', color: '#10b981', position: 3 },
];

export default function KanbanConfig() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState({ title: '', status_key: '', color: PRESET_COLORS[0] });

  const { data: cols = [] } = useQuery({
    queryKey: ['kanban-cols'],
    queryFn: async () => {
      const { data, error } = await supabase.from('kanban_columns').select('*').order('position');
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const seed = useMutation({
    mutationFn: async () => {
      const rows = DEFAULTS.map(d => ({ ...d, user_id: user!.id }));
      const { error } = await supabase.from('kanban_columns').insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Colunas padrão criadas' });
      qc.invalidateQueries({ queryKey: ['kanban-cols'] });
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!draft.title.trim() || !draft.status_key.trim()) throw new Error('Preencha título e chave');
      const { error } = await supabase.from('kanban_columns').insert({
        user_id: user!.id,
        title: draft.title.trim(),
        status_key: draft.status_key.trim().toLowerCase().replace(/\s+/g, '_'),
        color: draft.color,
        position: cols.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Coluna adicionada' });
      setDraft({ title: '', status_key: '', color: PRESET_COLORS[0] });
      qc.invalidateQueries({ queryKey: ['kanban-cols'] });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { error } = await supabase.from('kanban_columns').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kanban-cols'] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('kanban_columns').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kanban-cols'] }),
  });

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= cols.length) return;
    update.mutate({ id: cols[i].id, patch: { position: j } });
    update.mutate({ id: cols[j].id, patch: { position: i } });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <KanbanSquare className="h-6 w-6" /> Personalizar Kanban CRM
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Crie colunas personalizadas para acompanhar leads e processos no seu fluxo.
        </p>
      </div>

      {cols.length === 0 ? (
        <Card><CardContent className="p-8 text-center space-y-4">
          <p className="text-muted-foreground text-sm">Nenhuma coluna configurada.</p>
          <Button onClick={() => seed.mutate()} disabled={seed.isPending}>
            <Save className="h-4 w-4 mr-1" /> Criar colunas padrão (Novo, Em Andamento, Aguardando, Concluído)
          </Button>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-6 space-y-2">
            {cols.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-md border">
                <div className="w-3 h-8 rounded-sm shrink-0" style={{ background: c.color }} />
                <Input
                  defaultValue={c.title}
                  onBlur={(e) => e.target.value !== c.title && update.mutate({ id: c.id, patch: { title: e.target.value } })}
                  className="flex-1"
                />
                <code className="text-xs text-muted-foreground hidden sm:block">{c.status_key}</code>
                <div className="flex gap-1 shrink-0">
                  {PRESET_COLORS.map(col => (
                    <button
                      key={col}
                      onClick={() => update.mutate({ id: c.id, patch: { color: col } })}
                      className={`w-5 h-5 rounded-full border-2 ${c.color === col ? 'border-foreground' : 'border-transparent'}`}
                      style={{ background: col }}
                      aria-label={`Cor ${col}`}
                    />
                  ))}
                </div>
                <Button size="icon" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => move(i, 1)} disabled={i === cols.length - 1}><ArrowDown className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Excluir coluna "${c.title}"?`)) remove.mutate(c.id); }}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-6 space-y-3">
          <p className="font-semibold flex items-center gap-2"><Plus className="h-4 w-4" /> Nova coluna</p>
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium">Título *</label>
              <Input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="Ex.: Em Análise" />
            </div>
            <div>
              <label className="text-sm font-medium">Chave (status_key) *</label>
              <Input value={draft.status_key} onChange={e => setDraft({ ...draft, status_key: e.target.value })} placeholder="em_analise" />
            </div>
            <div>
              <label className="text-sm font-medium">Cor</label>
              <div className="flex gap-2 mt-2">
                {PRESET_COLORS.map(col => (
                  <button
                    key={col}
                    onClick={() => setDraft({ ...draft, color: col })}
                    className={`w-7 h-7 rounded-full border-2 ${draft.color === col ? 'border-foreground' : 'border-transparent'}`}
                    style={{ background: col }}
                  />
                ))}
              </div>
            </div>
          </div>
          <Button onClick={() => add.mutate()} disabled={add.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar coluna
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
