import { useState, useRef } from 'react';
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
import { FileText, FileImage, File, Trash2, Download, Search, FolderOpen, Upload, Pencil, AlertTriangle, Sparkles, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface DocumentoItem {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  process_id: string | null;
  client_id: string | null;
  created_at: string;
  processes?: { number: string; title: string } | null;
  clients?: { name: string } | null;
}

interface Process { id: string; number: string; title: string; }
interface Client { id: string; name: string; }

const BUCKET = 'documents';

function useDocumentos(search: string) {
  return useQuery<DocumentoItem[]>({
    queryKey: ['documentos', search],
    queryFn: async () => {
      let q = supabase
        .from('documents')
        .select('id, name, description, category, storage_path, mime_type, size_bytes, process_id, client_id, created_at, processes(number, title), clients(name)')
        .order('created_at', { ascending: false })
        .limit(5000);
      if (search) q = (q as any).ilike('name', `%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

function useProcessList() {
  return useQuery<Process[]>({
    queryKey: ['process-list-doc'],
    queryFn: async () => {
      const { data, error } = await supabase.from('processes')
        .select('id, number, title').order('updated_at', { ascending: false }).limit(4000);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useClientList() {
  return useQuery<Client[]>({
    queryKey: ['client-list-doc'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients')
        .select('id, name').order('name').limit(4000);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function getFileIcon(name: string, mime?: string | null) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (mime?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return <FileImage className="h-5 w-5 text-blue-500" />;
  if (ext === 'pdf' || mime === 'application/pdf') return <FileText className="h-5 w-5 text-red-500" />;
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

function formatBytes(b?: number | null): string {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

const EMPTY_FORM = () => ({ description: '', category: 'geral', process_id: '', client_id: '' });

export default function Documentos() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [editTarget, setEditTarget] = useState<DocumentoItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentoItem | null>(null);
  const [form, setForm] = useState(EMPTY_FORM());
  const [saving, setSaving] = useState(false);
  const [ocrTarget, setOcrTarget] = useState<DocumentoItem | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [ocrLoading, setOcrLoading] = useState(false);

  const runOcr = async (doc: DocumentoItem) => {
    if (!doc.mime_type?.startsWith('image/') && doc.mime_type !== 'application/pdf') {
      toast({ title: 'OCR indisponível', description: 'Apenas imagens (JPG/PNG) ou PDFs.', variant: 'destructive' });
      return;
    }
    setOcrTarget(doc);
    setOcrText('');
    setOcrLoading(true);
    try {
      const { data: signed, error: sErr } = await supabase.storage.from(BUCKET).createSignedUrl(doc.storage_path, 60);
      if (sErr || !signed) throw sErr ?? new Error('URL inválida');
      const fileResp = await fetch(signed.signedUrl);
      const blob = await fileResp.blob();
      const buf = await blob.arrayBuffer();
      let bin = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
      const base64 = btoa(bin);
      const { data, error } = await supabase.functions.invoke('ocr-documento', {
        body: { imageBase64: base64, mimeType: doc.mime_type },
      });
      if (error) throw error;
      setOcrText(data?.text || '(sem texto extraído)');
    } catch (e: any) {
      toast({ title: 'Erro OCR', description: e.message, variant: 'destructive' });
      setOcrTarget(null);
    } finally { setOcrLoading(false); }
  };

  const { data: docs = [], isLoading } = useDocumentos(search);
  const { data: processes = [] } = useProcessList();
  const { data: clients = [] } = useClientList();

  const onPickFile = (f: File | null) => {
    if (!f) return;
    if (f.size > 50 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande', description: 'Limite: 50 MB', variant: 'destructive' });
      return;
    }
    setPendingFile(f);
    setForm(EMPTY_FORM());
    setUploadOpen(true);
  };

  const handleUpload = async () => {
    if (!pendingFile || !user) return;
    setSaving(true);
    try {
      const ext = pendingFile.name.split('.').pop() ?? 'bin';
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, pendingFile, {
        contentType: pendingFile.type || undefined,
        upsert: false,
      });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from('documents').insert({
        user_id: user.id,
        name: pendingFile.name,
        description: form.description || null,
        category: form.category || 'geral',
        storage_path: path,
        mime_type: pendingFile.type || null,
        size_bytes: pendingFile.size,
        process_id: form.process_id || null,
        client_id: form.client_id || null,
      });
      if (insErr) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw insErr;
      }
      toast({ title: 'Documento enviado!' });
      setUploadOpen(false);
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      qc.invalidateQueries({ queryKey: ['documentos'] });
    } catch (e: any) {
      toast({ title: 'Erro no upload', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleDownload = async (doc: DocumentoItem) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.storage_path, 60);
    if (error || !data) {
      toast({ title: 'Erro ao baixar', description: error?.message, variant: 'destructive' });
      return;
    }
    window.open(data.signedUrl, '_blank');
  };

  const openEdit = (doc: DocumentoItem) => {
    setForm({
      description: doc.description ?? '',
      category: doc.category ?? 'geral',
      process_id: doc.process_id ?? '',
      client_id: doc.client_id ?? '',
    });
    setEditTarget(doc);
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('documents').update({
        description: form.description || null,
        category: form.category || 'geral',
        process_id: form.process_id || null,
        client_id: form.client_id || null,
      }).eq('id', editTarget.id);
      if (error) throw error;
      toast({ title: 'Documento atualizado!' });
      setEditTarget(null);
      qc.invalidateQueries({ queryKey: ['documentos'] });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await supabase.storage.from(BUCKET).remove([deleteTarget.storage_path]);
      const { error } = await supabase.from('documents').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      toast({ title: 'Documento removido.' });
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ['documentos'] });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documentos</h1>
          <p className="text-sm text-gray-500 mt-1">GED — Gestão Eletrônica de Documentos</p>
        </div>
        <Button onClick={() => fileInputRef.current?.click()} className="gap-2">
          <Upload className="h-4 w-4" /> Enviar Arquivo
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={e => onPickFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input placeholder="Buscar documentos..." value={search}
          onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : docs.length === 0 ? (
        <div className="text-center py-16">
          <FolderOpen className="h-12 w-12 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">Nenhum documento enviado.</p>
          <p className="text-sm text-gray-400 mt-1">Clique em "Enviar Arquivo" para começar.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {docs.map(doc => {
            const badge = getCategoryBadge(doc.name);
            return (
              <Card key={doc.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="shrink-0">{getFileIcon(doc.name, doc.mime_type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-gray-900 truncate">{doc.name}</span>
                        <Badge className={`text-xs ${badge.cls}`}>{badge.label}</Badge>
                        {doc.size_bytes != null && (
                          <span className="text-xs text-gray-400">{formatBytes(doc.size_bytes)}</span>
                        )}
                        {doc.processes && (
                          <span className="text-xs text-gray-500 font-mono">{doc.processes.number}</span>
                        )}
                        {doc.clients && (
                          <span className="text-xs text-gray-500">👤 {doc.clients.name}</span>
                        )}
                        <span className="text-xs text-gray-400 ml-auto">
                          {new Date(doc.created_at).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                      {doc.description && <p className="text-xs text-gray-500 mt-1 truncate">{doc.description}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon"
                        className="text-purple-500 hover:text-purple-700"
                        onClick={() => runOcr(doc)}
                        title="Extrair texto (OCR)">
                        <Sparkles className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon"
                        className="text-blue-500 hover:text-blue-700"
                        onClick={() => handleDownload(doc)}
                        title="Baixar">
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(doc)} title="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon"
                        className="text-red-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => setDeleteTarget(doc)}>
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

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={(o) => { if (!o) { setUploadOpen(false); setPendingFile(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Enviar Documento</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {pendingFile && (
              <div className="text-sm bg-gray-50 p-3 rounded">
                <p className="font-medium truncate">{pendingFile.name}</p>
                <p className="text-xs text-gray-500">{formatBytes(pendingFile.size)} · {pendingFile.type || 'tipo desconhecido'}</p>
              </div>
            )}
            <div className="space-y-1">
              <Label>Categoria</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="geral">Geral</SelectItem>
                  <SelectItem value="peticao">Petição</SelectItem>
                  <SelectItem value="contrato">Contrato</SelectItem>
                  <SelectItem value="procuracao">Procuração</SelectItem>
                  <SelectItem value="documento_pessoal">Documento Pessoal</SelectItem>
                  <SelectItem value="comprovante">Comprovante</SelectItem>
                  <SelectItem value="decisao">Decisão</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
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
              <div className="space-y-1">
                <Label>Cliente</Label>
                <Select value={form.client_id || '_none'}
                  onValueChange={v => setForm(f => ({ ...f, client_id: v === '_none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Nenhum —</SelectItem>
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Input placeholder="Notas sobre o documento..." value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setUploadOpen(false); setPendingFile(null); }}>Cancelar</Button>
            <Button onClick={handleUpload} disabled={saving || !pendingFile}>
              {saving ? 'Enviando…' : 'Enviar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Editar Documento</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {editTarget && (
              <div className="text-sm bg-gray-50 p-3 rounded">
                <p className="font-medium truncate">{editTarget.name}</p>
                <p className="text-xs text-gray-500">{formatBytes(editTarget.size_bytes)}</p>
              </div>
            )}
            <div className="space-y-1">
              <Label>Categoria</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="geral">Geral</SelectItem>
                  <SelectItem value="peticao">Petição</SelectItem>
                  <SelectItem value="contrato">Contrato</SelectItem>
                  <SelectItem value="procuracao">Procuração</SelectItem>
                  <SelectItem value="documento_pessoal">Documento Pessoal</SelectItem>
                  <SelectItem value="comprovante">Comprovante</SelectItem>
                  <SelectItem value="decisao">Decisão</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
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
              <div className="space-y-1">
                <Label>Cliente</Label>
                <Select value={form.client_id || '_none'}
                  onValueChange={v => setForm(f => ({ ...f, client_id: v === '_none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Nenhum —</SelectItem>
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Input placeholder="Notas…" value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button onClick={handleEdit} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
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
          <p className="text-sm text-gray-600 py-2">
            Tem certeza que deseja remover <strong>{deleteTarget?.name}</strong>? O arquivo será excluído permanentemente.
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
