import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Search, Trash2, Clock, FileText } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const TIPOS = [
  { value: 'despacho', label: 'Despacho' },
  { value: 'decisao', label: 'Decisão' },
  { value: 'audiencia', label: 'Audiência' },
  { value: 'sentenca', label: 'Sentença' },
  { value: 'recurso', label: 'Recurso' },
  { value: 'peticao', label: 'Petição' },
  { value: 'citacao', label: 'Citação' },
  { value: 'intimacao', label: 'Intimação' },
  { value: 'outros', label: 'Outros' },
];

const TIPO_COLORS: Record<string, string> = {
  despacho: 'bg-blue-100 text-blue-700',
  decisao: 'bg-purple-100 text-purple-700',
  audiencia: 'bg-green-100 text-green-700',
  sentenca: 'bg-red-100 text-red-700',
  recurso: 'bg-orange-100 text-orange-700',
  peticao: 'bg-gray-100 text-gray-700',
  citacao: 'bg-yellow-100 text-yellow-700',
  intimacao: 'bg-teal-100 text-teal-700',
  outros: 'bg-gray-100 text-gray-600',
};

interface Movimentacao {
  id: string;
  process_id: string | null;
  date: string;
  description: string;
  type: string;
  created_at: string;
  processes?: { number: string; title: string } | null;
}

interface Process {
  id: string;
  number: string;
  title: string;
}

const MOV_MARKER = 'movimentacao';

function useMovimentacoes(search: string) {
  return useQuery<Movimentacao[]>({
    queryKey: ['movimentacoes', search],
    queryFn: async () => {
      let q = supabase
        .from('tasks')
        .select('id, process_id, title, description, due_date, created_at, processes(number, title)')
        .eq('assignee', MOV_MARKER)
        .order('due_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (search) q = q.ilike('description', `%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((t: any) => ({
        id: t.id,
        process_id: t.process_id,
        date: t.due_date || new Date().toISOString().split('T')[0],
        description: t.description || '',
        type: t.title || 'outros',
        created_at: t.created_at,
        processes: t.processes,
      }));
    },
  });
}

function useProcessList() {
  return useQuery<Process[]>({
    queryKey: ['process-list-mov'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('processes')
        .select('id, number, title')
        .order('number')
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useCreateMovimentacao() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (m: {
      process_id?: string;
      date: string;
      description: string;
      type: string;
    }) => {
      const { error } = await supabase.from('tasks').insert({
        user_id: user?.id,
        title: m.type,
        description: m.description,
        due_date: m.date,
        process_id: m.process_id || null,
        assignee: MOV_MARKER,
        priority: 'media',
        status: 'concluida',
        completed: true,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['movimentacoes'] }); },
  });
}

function useDeleteMovimentacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['movimentacoes'] }); },
  });
}

export default function Movimentacoes() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    type: 'despacho',
    date: new Date().toISOString().split('T')[0],
    description: '',
    process_id: '',
  });

  const { data: movs = [], isLoading } = useMovimentacoes(search);
  const { data: processes = [] } = useProcessList();
  const createMov = useCreateMovimentacao();
  const deleteMov = useDeleteMovimentacao();

  const handleCreate = async () => {
    if (!form.description.trim()) {
      toast({ title: 'Preencha a descrição', variant: 'destructive' });
      return;
    }
    try {
      await createMov.mutateAsync({
        type: form.type,
        date: form.date,
        description: form.description,
        process_id: form.process_id || undefined,
      });
      toast({ title: 'Movimentação registrada com sucesso!' });
      setOpen(false);
      setForm({ type: 'despacho', date: new Date().toISOString().split('T')[0], description: '', process_id: '' });
    } catch (e: any) {
      toast({ title: 'Erro ao registrar', description: e.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover esta movimentação?')) return;
    try {
      await deleteMov.mutateAsync(id);
      toast({ title: 'Movimentação removida.' });
    } catch (e: any) {
      toast({ title: 'Erro ao remover', description: e.message, variant: 'destructive' });
    }
  };

  const tipoLabel = (v: string) => TIPOS.find(t => t.value === v)?.label ?? v;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Movimentações</h1>
          <p className="text-sm text-gray-500 mt-1">Diário de andamentos dos processos</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Nova Movimentação
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Buscar por descrição..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : movs.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="h-12 w-12 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">Nenhuma movimentação encontrada.</p>
          <p className="text-sm text-gray-400 mt-1">Clique em "Nova Movimentação" para começar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {movs.map(mov => (
            <Card key={mov.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Badge className={`text-xs font-medium ${TIPO_COLORS[mov.type] ?? TIPO_COLORS.outros}`}>
                        {tipoLabel(mov.type)}
                      </Badge>
                      {mov.processes && (
                        <span className="text-xs text-gray-500 font-mono">{mov.processes.number}</span>
                      )}
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(mov.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{mov.description}</p>
                    {mov.processes && (
                      <p className="text-xs text-gray-400 mt-1 truncate">{mov.processes.title}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost" size="icon"
                    className="text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                    onClick={() => handleDelete(mov.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nova Movimentação</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Processo (opcional)</Label>
              <Select value={form.process_id} onValueChange={v => setForm(f => ({ ...f, process_id: v === '_none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione um processo..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— Nenhum —</SelectItem>
                  {processes.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.number} — {p.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Data</Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Descrição <span className="text-red-500">*</span></Label>
              <Textarea
                placeholder="Descreva a movimentação..."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={createMov.isPending}>
              {createMov.isPending ? 'Salvando...' : 'Registrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
