import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { FileText, FileImage, File, Trash2, Download, Search, FolderOpen, Plus, ExternalLink, Pencil, AlertTriangle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface DocumentoItem {
  id: string;
  name: string;
  url: string;
  notes: string;
  date: string;
  process_id: string | null;
  created_at: string;
  processes?: { number: string; title: string } | null;
}

interface Process {
  id: string;
  number: string;
  title: string;
}

// Uses tasks table with assignee='documento' as marker
// title = document name, description = "url|||notes", due_date = date
const DOC_MARKER = 'documento';

function parseDescription(desc: string | null): { url: string; notes: string } {
  if (!desc) return { url: '', notes: '' };
  const sep = desc.indexOf('|||');
  if (sep === -1) return { url: '', notes: desc };
  return { url: desc.substring(0, sep), notes: desc.substring(sep + 3) };
}

function buildDescription(url: string, notes: string): string {
  return url ? `${url}|||${notes}` : notes;
}

function useDocumentos(search: string) {
  return useQuery<DocumentoItem[]>({
    queryKey: ['documentos', search],
    queryFn: async () => {
      let q = supabase
        .from('tasks')
        .select('id, process_id, title, description, due_date, created_at, processes(number, title)')
        .eq('assignee', DOC_MARKER)
        .order('created_at', { ascending: false });
      if (search) q = q.ilike('title', `%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((t: any) => {
        const { url, notes } = parseDescription(t.description);
        return {
          id: t.id,
          process_id: t.process_id,
          name: t.title || 'Documento',
          url,
          notes,
          date: t.due_date || t.created_at?.split('T')[0] || '',
          created_at: t.created_at,
          processes: t.processes,
        };
      });
    },
  });
}

function useProcessList() {
  return useQuery<Process[]>({
    queryKey: ['process-list-doc'],
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

function useCreateDocumento() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (d: { name: string; url: string; notes: string; date: string; process_id?: string }) => {
      const { error } = await supabase.from('tasks').insert({
        user_id: user?.id,
        title: d.name,
        description: buildDescription(d.url, d.notes),
        due_date: d.date,
        process_id: d.process_id || null,
        assignee: DOC_MARKER,
        priority: 'media',
        status: 'pendente',
        completed: false,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['documentos'] }); },
  });
}

function useDeleteDocumento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['documentos'] }); },
  });
}
function useUpdateDocumento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: { id: string; name: string; url: string; notes: string; date: string; process_id?: string }) => {
      const { error } = await supabase.from('tasks').update({
        title: d.name,
        description: buildDescription(d.url, d.notes),
        due_date: d.date || null,
        process_id: d.process_id || null,
      }).eq('id', d.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['documentos'] }); },
  });
}

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return <FileImage className="h-5 w-5 text-blue-500" />;
  if (ext === 'pdf') return <FileText className="h-5 w-5 text-red-500" />;
  return <File className="h-5 w-5 text-gray-500" />;
}

function getCategoryBadge(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return { label: 'Imagem', cls: 'bg-blue-100 text-blue-700' };
  if (ext === 'pdf') return { label: 'PDF', cls: 'bg-red-100 text-red-700' };
  if (['doc', 'docx'].includes(ext)) return { label: 'Word', cls: 'bg-indigo-100 text-indigo-700' };
  if (['xls', 'xlsx'].includes(ext)) return { label: 'Planilha', cls: 'bg-green-100 text-green-700' };
  return { label: 'Documento', cls: 'bg-gray-100 text-gray-700' };
}

const EMPTY_DOC_FORM = () => ({
  name: '', url: '', notes: '',
  date: new Date().toISOString().split('T')[0],
  process_id: '',
});

export default function Documentos() {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DocumentoItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentoItem | null>(null);
  const [form, setForm] = useState(EMPTY_DOC_FORM());
  const [saving, setSaving] = useState(false);

  const { data: docs = [], isLoading } = useDocumentos(search);
  const { data: processes = [] } = useProcessList();
  const createDoc = useCreateDocumento();
  const updateDoc = useUpdateDocumento();
  const deleteDoc = useDeleteDocumento();

  const openEdit = (doc: DocumentoItem) => {
    setForm({ name: doc.name, url: doc.url, notes: doc.notes, date: doc.date, process_id: doc.process_id ?? '' });
    setEditTarget(doc);
  };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Informe o nome do documento', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await createDoc.mutateAsync({
        name: form.name, url: form.url, notes: form.notes, date: form.date,
        process_id: form.process_id || undefined,
      });
      toast({ title: 'Documento cadastrado!' });
      setCreateOpen(false);
      setForm(EMPTY_DOC_FORM());
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleEdit = async () => {
    if (!editTarget || !form.name.trim()) return;
    setSaving(true);
    try {
      await updateDoc.mutateAsync({
        id: editTarget.id, name: form.name, url: form.url,
        notes: form.notes, date: form.date,
        process_id: form.process_id || undefined,
      });
      toast({ title: 'Documento atualizado!' });
      setEditTarget(null);
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteDoc.mutateAsync(deleteTarget.id);
      toast({ title: 'Documento removido.' });
      setDeleteTarget(null);
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documentos</h1>
          <p className="text-sm text-gray-500 mt-1">Gestão de documentos e arquivos</p>
        </div>
        <Button onClick={() => { setForm(EMPTY_DOC_FORM()); setCreateOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Documento
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Buscar documentos..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : docs.length === 0 ? (
        <div className="text-center py-16">
          <FolderOpen className="h-12 w-12 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">Nenhum documento cadastrado.</p>
          <p className="text-sm text-gray-400 mt-1">Clique em "Novo Documento" para adicionar.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {docs.map(doc => {
            const badge = getCategoryBadge(doc.name);
            return (
              <Card key={doc.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="shrink-0">{getFileIcon(doc.name)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-gray-900 truncate">{doc.name}</span>
                        <Badge className={`text-xs ${badge.cls}`}>{badge.label}</Badge>
                        {doc.processes && (
                          <span className="text-xs text-gray-500 font-mono">{doc.processes.number}</span>
                        )}
                        {doc.date && (
                          <span className="text-xs text-gray-400">
                            {new Date(doc.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>
                      {doc.notes && <p className="text-xs text-gray-500 mt-1 truncate">{doc.notes}</p>}
                      {doc.processes && (
                        <p className="text-xs text-gray-400 truncate">{doc.processes.title}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {doc.url ? (
                        <Button
                          variant="ghost" size="icon"
                          className="text-blue-500 hover:text-blue-700"
                          onClick={() => window.open(doc.url, '_blank')}
                          title="Abrir link"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="icon" disabled title="Sem link cadastrado">
                          <Download className="h-4 w-4 text-gray-300" />
                        </Button>
                      )}
                      <Button
                        variant="ghost" size="icon"
                        className="hover:bg-gray-50"
                        onClick={() => openEdit(doc)}
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="text-red-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => setDeleteTarget(doc)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) setCreateOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Novo Documento</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Nome do Documento <span className="text-red-500">*</span></Label>
              <Input
                placeholder="ex: Petição Inicial.pdf"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Link do Arquivo (opcional)</Label>
              <Input
                placeholder="https://drive.google.com/... ou outro link"
                value={form.url}
                onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
              />
              <p className="text-xs text-gray-400">Cole o link do Google Drive, OneDrive ou qualquer nuvem.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Data</Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Processo</Label>
                <Select value={form.process_id} onValueChange={v => setForm(f => ({ ...f, process_id: v === '_none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Nenhum —</SelectItem>
                    {processes.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.number} — {p.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Observações</Label>
              <Input
                placeholder="Notas sobre o documento..."
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? 'Salvando…' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Editar Documento</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Nome do Documento *</Label>
              <Input placeholder="ex: Petição Inicial.pdf" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Link do Arquivo (opcional)</Label>
              <Input placeholder="https://drive.google.com/..." value={form.url}
                onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Data</Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Processo</Label>
                <Select value={form.process_id || '_none'}
                  onValueChange={v => setForm(f => ({ ...f, process_id: v === '_none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Nenhum —</SelectItem>
                    {processes.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.number} — {p.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Observações</Label>
              <Input placeholder="Notas…" value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button onClick={handleEdit} disabled={!form.name || saving}>
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
              <AlertTriangle className="h-5 w-5" /> Remover Documento
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Remover <span className="font-semibold">"{deleteTarget?.name}"</span>? Esta ação não pode ser desfeita.
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
