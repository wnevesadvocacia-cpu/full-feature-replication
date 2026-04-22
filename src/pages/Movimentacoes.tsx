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
import { Plus, Search, Trash2, Clock, FileText, Pencil, AlertTriangle } from 'lucide-react';
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

interface Process { id: string; number: string; title: string; }

interface MovForm {
  type: string; date: string; description: string; process_id: string;
}

const EMPTY_FORM: MovForm = {
  type: 'despacho',
  date: new Date().toISOString().split('T')[0],
  description: '',
  process_id: '',
};

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
      if (search) q = q.or(`description.ilike.%${search}%,title.ilike.%${search}%`);
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
        .order('updated_at', { ascending: false })
        .limit(4000);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export default function Movimentacoes() {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Movimentacao | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Movimentacao | null>(null);
  const [form, setForm] = useState<MovForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const { data: movs = [], isLoading } = useMovimentacoes(search);
  const { data: processes = [] } = useProcessList();

  const tipoLabel = (v: string) => TIPOS.find(t => t.value === v)?.label ?? v;
  const setF = (k: keyof MovForm) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const openEdit = (m: Movimentacao) => {
    setForm({ type: m.type, date: m.date, description: m.description, process_id: m.process_id ?? '' });
    setEditTarget(m);
  };

  const handleCreate = async () => {
    if (!form.description.trim()) {
      toast({ title: 'Preencha a descrição', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('tasks').insert({
        user_id: user?.id,
        title: form.type,
        description: form.description,
        due_date: form.date,
        process_id: form.process_id || null,
        assignee: MOV_MARKER,
        priority: 'media',
        status: 'concluida',
        completed: true,
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['movimentacoes'] });
      toast({ title: 'Movimentação registrada!' });
      setCreateOpen(false);
      setForm(EMPTY_FORM);
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleEdit = async () => {
    if (!editTarget || !form.description.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('tasks').update({
        title: form.type,
        description: form.description,
        due_date: form.date,
        process_id: form.process_id || null,
      }).eq('id', editTarget.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['movimentacoes'] });
      toast({ title: 'Movimentação atualizada!' });
      setEditTarget(null);
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('tasks').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['movimentacoes'] });
      toast({ title: 'Movimentação removida.' });
      setDeleteTarget(null);
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const FormBody = () => (
    <div className="space-y-4 py-2">
      <div>
        <Label>Processo (opcional)</Label>
        <Select value={form.process_id || '_none'} onValueChange={v => setF('process_id')(v === '_none' ? '' : v)}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione um processo…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">— Nenhum —</SelectItem>
            {processes.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.number} — {p.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Tipo</Label>
          <Select value={form.type} onValueChange={setF('type')}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIPOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Data</Label>
          <Input className="mt-1" type="date" value={form.date}
            onChange={e => setF('date')(e.target.value)} />
        </div>
      </div>
      <div>
        <Label>Descrição *</Label>
        <Textarea
          className="mt-1"
          placeholder="Descreva a movimentação…"
          value={form.description}
          onChange={e => setF('description')(e.target.value)}
          rows={4}
        />
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Movimentações</h1>
          <p className="text-sm text-gray-500 mt-1">Diário de andamentos dos processos</p>
        </div>
        <Button onClick={() => { setForm(EMPTY_FORM); setCreateOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Nova Movimentação
        </Button>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Buscar por descrição, tipo…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Carregando…</div>
      ) : movs.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="h-12 w-12 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">Nenhuma movimentação encontrada.</p>
          <p className="text-sm text-gray-400 mt-1">Clique em "Nova Movimentação" para começar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {movs.map(mov => (
            <Card key={mov.id} className="hover:shadow-md transition-shadow group">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Badge className={`text-xs font-medium ${TIPO_COLORS[mov.type] ?? TIPO_COLORS.outros}`}>
                        {tipoLabel(mov.type)}
                      </Badge>
                      {mov.processes && (
                        <span className="text-xs text-blue-600 font-mono font-medium">{mov.processes.number}</span>
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
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8"
                      onClick={() => openEdit(mov)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-600"
                      onClick={() => setDeleteTarget(mov)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) setCreateOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nova Movimentação</DialogTitle></DialogHeader>
          <FormBody />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving || !form.description.trim()}>
              {saving ? 'Salvando…' : 'Registrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Editar Movimentação</DialogTitle></DialogHeader>
          <FormBody />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button onClick={handleEdit} disabled={saving || !form.description.trim()}>
              {saving ? 'Salvando…' : 'Salvar Alterações'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" /> Remover Movimentação
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Tem certeza que deseja remover esta movimentação? Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? 'Removendo…' : 'Remover'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
