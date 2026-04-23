import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { History, Save, FileText, GitCompare, RotateCcw, Trash2 } from 'lucide-react';
import { DeleteGuard } from '@/components/DeleteGuard';

export default function Versoes() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [templateId, setTemplateId] = useState<string>('');
  const [diff, setDiff] = useState<{ a: any; b: any } | null>(null);
  const [note, setNote] = useState('');

  const { data: templates = [] } = useQuery({
    queryKey: ['templates-for-versions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('document_templates')
        .select('id, title, content, updated_at').order('updated_at', { ascending: false }).limit(500);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const current = templates.find(t => t.id === templateId);

  const { data: versions = [] } = useQuery({
    queryKey: ['versions', templateId],
    queryFn: async () => {
      const { data, error } = await supabase.from('document_versions')
        .select('*').eq('template_id', templateId).order('version_number', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!templateId,
  });

  const snapshot = useMutation({
    mutationFn: async () => {
      if (!current) throw new Error('Selecione um modelo');
      const next = (versions[0]?.version_number ?? 0) + 1;
      const { error } = await supabase.from('document_versions').insert({
        user_id: user!.id,
        template_id: current.id,
        version_number: next,
        title: current.title,
        content: current.content || '',
        change_note: note.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Versão salva' });
      setNote('');
      qc.invalidateQueries({ queryKey: ['versions', templateId] });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const restore = useMutation({
    mutationFn: async (v: any) => {
      const { error } = await supabase.from('document_templates')
        .update({ content: v.content, title: v.title }).eq('id', v.template_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Versão restaurada — modelo atualizado' });
      qc.invalidateQueries({ queryKey: ['templates-for-versions'] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('document_versions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['versions', templateId] }),
  });

  // Diff simples (linha a linha)
  const diffLines = (a: string, b: string) => {
    const al = a.split('\n'), bl = b.split('\n');
    const max = Math.max(al.length, bl.length);
    const rows: { a: string; b: string; eq: boolean }[] = [];
    for (let i = 0; i < max; i++) {
      const x = al[i] ?? '', y = bl[i] ?? '';
      rows.push({ a: x, b: y, eq: x === y });
    }
    return rows;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <History className="h-6 w-6" /> Versionamento de Petições
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Salve snapshots dos modelos a cada revisão importante e restaure versões anteriores.
        </p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Modelo / Petição</label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger><SelectValue placeholder="Escolha um modelo…" /></SelectTrigger>
                <SelectContent>
                  {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Nota da versão</label>
              <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Ex.: revisão antes do protocolo" />
            </div>
          </div>
          <Button onClick={() => snapshot.mutate()} disabled={!current || snapshot.isPending}>
            <Save className="h-4 w-4 mr-1" /> Salvar versão atual
          </Button>
        </CardContent>
      </Card>

      {templateId && (
        <Card>
          <CardContent className="p-6">
            <p className="font-semibold flex items-center gap-2 mb-3">
              <FileText className="h-4 w-4" /> Histórico ({versions.length})
            </p>
            {versions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhuma versão salva ainda.</p>
            ) : (
              <div className="space-y-2">
                {versions.map((v, i) => (
                  <div key={v.id} className="flex items-center justify-between gap-3 p-3 rounded-md border hover:bg-muted/30">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Badge variant="outline" className="font-mono">v{v.version_number}</Badge>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{v.change_note || 'Sem nota'}</p>
                        <p className="text-xs text-muted-foreground">{new Date(v.created_at).toLocaleString('pt-BR')}</p>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {versions[i + 1] && (
                        <Button size="sm" variant="ghost" onClick={() => setDiff({ a: versions[i + 1], b: v })} title="Comparar com anterior">
                          <GitCompare className="h-4 w-4" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => { if (confirm('Restaurar esta versão sobre o modelo atual?')) restore.mutate(v); }} title="Restaurar">
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <DeleteGuard>
                        <Button size="sm" variant="ghost" onClick={() => { if (confirm('Excluir versão?')) remove.mutate(v.id); }} title="Excluir">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </DeleteGuard>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!diff} onOpenChange={o => !o && setDiff(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Comparar v{diff?.a.version_number} ↔ v{diff?.b.version_number}</DialogTitle>
            <DialogDescription>Diferenças linha a linha (vermelho = anterior, verde = atual).</DialogDescription>
          </DialogHeader>
          {diff && (
            <div className="grid grid-cols-2 gap-2 max-h-[60vh] overflow-auto font-mono text-xs">
              <div className="border rounded-md overflow-hidden">
                <div className="bg-muted px-2 py-1 font-sans font-semibold">v{diff.a.version_number}</div>
                {diffLines(diff.a.content, diff.b.content).map((r, i) => (
                  <div key={i} className={`px-2 py-0.5 ${r.eq ? '' : 'bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200'}`}>{r.a || '\u00A0'}</div>
                ))}
              </div>
              <div className="border rounded-md overflow-hidden">
                <div className="bg-muted px-2 py-1 font-sans font-semibold">v{diff.b.version_number}</div>
                {diffLines(diff.a.content, diff.b.content).map((r, i) => (
                  <div key={i} className={`px-2 py-0.5 ${r.eq ? '' : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'}`}>{r.b || '\u00A0'}</div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
