import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Upload, FileText, FileImage, File, Trash2, Download,
  Search, FolderOpen, AlertCircle
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Document {
  id: string;
  name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  process_id: string | null;
  created_at: string;
  created_by: string | null;
}

const BUCKET = 'documents';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mime: string) {
  if (mime.startsWith('image/')) return <FileImage className="h-5 w-5 text-blue-500" />;
  if (mime === 'application/pdf') return <FileText className="h-5 w-5 text-red-500" />;
  return <File className="h-5 w-5 text-gray-500" />;
}

function getCategoryLabel(mime: string): string {
  if (mime.startsWith('image/')) return 'Imagem';
  if (mime === 'application/pdf') return 'PDF';
  if (mime.includes('word') || mime.includes('document')) return 'Word';
  if (mime.includes('sheet') || mime.includes('excel')) return 'Planilha';
  return 'Outro';
}

function useDocuments(search: string) {
  return useQuery<Document[]>({
    queryKey: ['documents', search],
    queryFn: async () => {
      let q = supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });
      if (search) q = q.ilike('name', `%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useUploadDocument() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (file: File) => {
      const ext = file.name.split('.').pop();
      const path = `${user?.id ?? 'anon'}/${Date.now()}_${file.name}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file);
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from('documents').insert({
        name: file.name,
        file_path: path,
        file_size: file.size,
        mime_type: file.type || 'application/octet-stream',
        created_by: user?.id ?? null,
      });
      if (dbErr) throw dbErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] });
      toast({ title: 'Documento enviado com sucesso!' });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro ao enviar documento', description: err.message, variant: 'destructive' });
    },
  });
}

function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (doc: Document) => {
      await supabase.storage.from(BUCKET).remove([doc.file_path]);
      const { error } = await supabase.from('documents').delete().eq('id', doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] });
      toast({ title: 'Documento removido.' });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro ao remover', description: err.message, variant: 'destructive' });
    },
  });
}

export default function Documentos() {
  const [search, setSearch] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: documents = [], isLoading, isError } = useDocuments(search);
  const upload = useUploadDocument();
  const remove = useDeleteDocument();

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((f) => upload.mutate(f));
  }, [upload]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const openUrl = async (doc: Document) => {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(doc.file_path);
    window.open(data.publicUrl, '_blank');
  };

  const grouped = documents.reduce<Record<string, Document[]>>((acc, d) => {
    const cat = getCategoryLabel(d.mime_type);
    (acc[cat] = acc[cat] ?? []).push(d);
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Documentos</h1>
        <Button onClick={() => inputRef.current?.click()} disabled={upload.isPending}>
          <Upload className="h-4 w-4 mr-2" />
          {upload.isPending ? 'Enviandoâ¦' : 'Enviar arquivo'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Pesquisar documentosâ¦"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors ${
          dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-10 w-10 mx-auto text-gray-400 mb-3" />
        <p className="text-sm text-gray-600">
          Arraste arquivos aqui ou <span className="text-blue-600 cursor-pointer underline">clique para selecionar</span>
        </p>
        <p className="text-xs text-gray-400 mt-1">PDF, Word, Excel, imagens â qualquer formato</p>
      </div>

      {/* Error */}
      {isError && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-md">
          <AlertCircle className="h-4 w-4" />
          <p className="text-sm">Erro ao carregar documentos. Verifique a configuraÃ§Ã£o do Storage no Supabase.</p>
        </div>
      )}

      {/* Document list by category */}
      {isLoading ? (
        <p className="text-sm text-gray-400">Carregandoâ¦</p>
      ) : documents.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nenhum documento encontrado.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([cat, docs]) => (
          <Card key={cat}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                {cat} ({docs.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {docs.map((doc) => (
                <div key={doc.id} className="flex items-center gap-3 py-3">
                  {getFileIcon(doc.mime_type)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.name}</p>
                    <p className="text-xs text-gray-400">
                      {formatBytes(doc.file_size)} Â· {new Date(doc.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">{cat}</Badge>
                  <button
                    onClick={() => openUrl(doc)}
                    className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                    title="Abrir"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Remover "${doc.name}"?`)) remove.mutate(doc);
                    }}
                    className="p-1.5 rounded hover:bg-red-50 text-red-400"
                    title="Remover"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
