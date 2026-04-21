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
import { Plus, AlertTriangle, Search, Trash2, Clock, FileText } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const TIPOS = [
  { value: 'despacho', label: 'Despacho' },
  { value: 'decisao', label: 'DecisÃ£o' },
  { value: 'audiencia', label: 'AudiÃªncia' },
  { value: 'sentenca', label: 'SentenÃ§a' },
  { value: 'recurso', label: 'Recurso' },
  { value: 'peticao', label: 'PetiÃ§Ã£o' },
  { value: 'citacao', label: 'CitaÃ§Ã£o' },
  { value: 'intimacao', label: 'IntimaÃ§Ã£o' },
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
  processes?: { number: string; title: string };
}

interface Process {
  id: string;
  number: string;
  title: string;
}

function useMovimentacoes(search: string) {
  return useQuery<Movimentacao[]>({
    queryKey: ['movimentacoes', search],
    queryFn: async () => {
      let q = supabase
        .from('movimentacoes')
        .select('*, processes(number, title)')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });
      if (search) q = q.ilike('description', `%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    retry: false,
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
      const { error } = await supabase.from('movimentacoes').insert({
        ...m,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['movimentacoes'] }),
  });
}

function useDeleteMovimentacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('movimentacoes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['movimentacoes'] }),
  });
}

export default function Movimentacoes() {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    process_id: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    type: 'despacho',
  });
  const { toast } = useToast();

  const { data: movimentacoes = [], isLoading, isError } = useMovimentacoes(search);
  const { data: processes = [] } = useProcessList();
  const create = useCreateMovimentacao();
  const remove = useDeleteMovimentacao();

  const handleCreate = async () => {
    if (!form.description || !form.date) return;
    try {
      await create.mutateAsync({
        process_id: form.process_id || undefined,
        date: form.date,
        description: form.description,
        type: form.type,
      });
      setForm({
        process_id: '',
        date: new Date().toISOString().split('T')[0],
        description: '',
        type: 'despacho',
      });
      setOpen(false);
      toast({ title: 'MovimentaÃ§Ã£o registrada!' });
    } catch (e: any) {
      toast({ title: 'Erro ao registrar', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">MovimentaÃ§Ãµes</h1>
        <Button onClick={() => setOpen(true)} disabled={isError}>
          <Plus className="h-4 w-4 mr-2" />
          Nova MovimentaÃ§Ã£o
        </Button>
      </div>

      {isError && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Migration pendente</p>
            <p className="text-sm text-amber-700 mt-1">
              A tabela <code className="bg-amber-100 px-1 rounded font-mono text-xs">movimentacoes</code> ainda
              nÃ£o foi criada no banco de dados. Para ativar esta funcionalidade, acesse o{' '}
              <strong>Supabase SQL Editor</strong> e execute o arquivo{' '}
              <code className="bg-amber-100 px-1 rounded font-mono text-xs">
                supabase/migrations/20260421000001_extend_schema_advbox_parity.sql
              </code>.
            </p>
          </div>
        </div>
      )}

      {!isError && (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Pesquisar movimentaÃ§Ãµesâ¦"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-400">Carregandoâ¦</p>
      ) : !isError && movimentacoes.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nenhuma movimentaÃ§Ã£o registrada.</p>
          <p className="text-xs mt-1">Clique em "Nova MovimentaÃ§Ã£o" para adicionar.</p>
        </div>
      ) : !isError ? (
        <div className="space-y-3">
          {movimentacoes.map((m) => (
            <Card key={m.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <Badge
                        className={`text-xs font-medium ${TIPO_COLORS[m.type] ?? 'bg-gray-100 text-gray-600'}`}
                      >
                        {TIPOS.find((t) => t.value === m.type)?.label ?? m.type}
                      </Badge>
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(m.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </span>
                      {m.processes && (
                        <span className="text-xs font-medium text-blue-600">
                          {m.processes.number}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-800 leading-relaxed">{m.description}</p>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm('Remover esta movimentaÃ§Ã£o?')) remove.mutate(m.id);
                    }}
                    className="p-1.5 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 shrink-0 transition-colors"
                    title="Remover"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova MovimentaÃ§Ã£o</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Processo (opcional)</Label>
              <Select
                value={form.process_id}
                onValueChange={(v) => setForm((f) => ({ ...f, process_id: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecionar processoâ¦" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">â Sem processo â</SelectItem>
                  {processes.slice(0, 150).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.number} â {(p.title ?? '').slice(0, 40)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Tipo</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigge\r>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Data</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="mt-1"
              />
            </div>

            <div>
              <Label>DescriÃ§Ã£</Label>
              <Textarea
                placeholder="Descreva a movimentaÃ§Ã£oâ¦"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="mt-1"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={create.isPending || !form.description || !form.date}
            >
              {create.isPending ? 'Salvandoâ¦' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
