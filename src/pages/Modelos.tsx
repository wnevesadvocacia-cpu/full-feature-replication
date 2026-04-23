import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Loader2, Pencil, Trash2, FileText, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Tpl { id: string; title: string; category: string; content: string; }

export default function Modelos() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tpl | null>(null);
  const [genTpl, setGenTpl] = useState<Tpl | null>(null);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ title: '', category: 'geral', content: '' });

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['templates'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('document_templates').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as Tpl[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (editing) {
        const { error } = await (supabase as any).from('document_templates').update(form).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('document_templates').insert({ ...form, user_id: user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      setOpen(false); setEditing(null); setForm({ title: '', category: 'geral', content: '' });
      toast({ title: 'Modelo salvo!' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('document_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['templates'] }); toast({ title: 'Excluído' }); },
  });

  const openEdit = (t: Tpl) => {
    setEditing(t);
    setForm({ title: t.title, category: t.category, content: t.content });
    setOpen(true);
  };

  const openGen = (t: Tpl) => {
    setGenTpl(t);
    const matches = Array.from(t.content.matchAll(/\{\{\s*(\w+)\s*\}\}/g));
    const uniq = Array.from(new Set(matches.map((m) => m[1])));
    setVars(Object.fromEntries(uniq.map((k) => [k, ''])));
  };

  const generated = genTpl
    ? genTpl.content.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] || `{{${k}}}`)
    : '';

  if (isLoading) return <div className="p-6 flex justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Modelos de Documentos</h1>
          <p className="text-muted-foreground text-sm mt-1">Use {`{{variavel}}`} no conteúdo para campos dinâmicos</p>
        </div>
        <Button onClick={() => { setEditing(null); setForm({ title: '', category: 'geral', content: '' }); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Novo Modelo
        </Button>
      </div>

      {templates.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p>Nenhum modelo. Crie petições, contratos, procurações reutilizáveis.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {templates.map((t) => (
            <div key={t.id} className="bg-card rounded-lg p-4 border shadow-card hover:shadow-card-hover">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{t.title}</p>
                  <p className="text-xs text-muted-foreground">{t.category}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{t.content.slice(0, 120)}…</p>
              <div className="flex gap-1 mt-3">
                <Button size="sm" variant="outline" onClick={() => openGen(t)} className="flex-1">
                  <FileText className="h-3 w-3 mr-1" /> Gerar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => openEdit(t)}><Pencil className="h-3 w-3" /></Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del.mutate(t.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit/Create */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? 'Editar' : 'Novo'} Modelo</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Título</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>Categoria</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="petição / contrato / procuração…" /></div>
            <div>
              <Label>Conteúdo</Label>
              <Textarea rows={12} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Use {{cliente}}, {{processo}}, {{data}}…" className="font-mono text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={!form.title || !form.content || save.isPending}>
              {save.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate */}
      <Dialog open={!!genTpl} onOpenChange={(o) => !o && setGenTpl(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Gerar: {genTpl?.title}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase text-muted-foreground">Variáveis</Label>
              {Object.keys(vars).length === 0 && <p className="text-xs text-muted-foreground">Sem variáveis.</p>}
              {Object.keys(vars).map((k) => (
                <div key={k}>
                  <Label className="text-xs">{k}</Label>
                  <Input value={vars[k]} onChange={(e) => setVars({ ...vars, [k]: e.target.value })} />
                </div>
              ))}
            </div>
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Pré-visualização</Label>
              <Textarea rows={14} readOnly value={generated} className="font-mono text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenTpl(null)}>Fechar</Button>
            <Button onClick={() => { navigator.clipboard.writeText(generated); toast({ title: 'Copiado!' }); }}>
              <Copy className="h-4 w-4 mr-1" /> Copiar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
