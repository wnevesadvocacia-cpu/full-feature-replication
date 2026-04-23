import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Copy, Loader2, Square, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const TIPOS = [
  'Petição Inicial', 'Contestação', 'Réplica', 'Recurso de Apelação', 'Recurso Especial',
  'Recurso Extraordinário', 'Agravo de Instrumento', 'Embargos de Declaração',
  'Mandado de Segurança', 'Habeas Corpus', 'Reclamação Trabalhista', 'Defesa Prévia',
  'Alegações Finais', 'Cumprimento de Sentença', 'Impugnação ao Cumprimento',
  'Notificação Extrajudicial', 'Parecer Jurídico', 'Memorial',
];

const AREAS = [
  'Cível', 'Penal', 'Trabalhista', 'Tributário', 'Administrativo',
  'Empresarial', 'Família e Sucessões', 'Consumidor', 'Previdenciário', 'Constitucional',
];

export default function GeradorPecas() {
  const { toast } = useToast();
  const [form, setForm] = useState({
    tipo: '', area: '', partes: '', fatos: '', pedidos: '', contexto: '', instrucoes: '',
  });
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const gerar = async () => {
    if (!form.tipo || !form.fatos) {
      toast({ title: 'Preencha pelo menos Tipo e Fatos', variant: 'destructive' });
      return;
    }
    setOutput('');
    setLoading(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gerar-peca`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify(form),
        signal: ctrl.signal,
      });

      if (!resp.ok || !resp.body) {
        if (resp.status === 429) toast({ title: 'Muitas requisições. Aguarde.', variant: 'destructive' });
        else if (resp.status === 402) toast({ title: 'Créditos de IA esgotados', description: 'Adicione créditos no workspace.', variant: 'destructive' });
        else toast({ title: 'Erro ao gerar peça', variant: 'destructive' });
        setLoading(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let done = false;

      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buf += decoder.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf('\n')) !== -1) {
          let line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (json === '[DONE]') { done = true; break; }
          try {
            const p = JSON.parse(json);
            const c = p.choices?.[0]?.delta?.content;
            if (c) setOutput((prev) => prev + c);
          } catch {
            buf = line + '\n' + buf;
            break;
          }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const stop = () => abortRef.current?.abort();

  const copiar = () => {
    navigator.clipboard.writeText(output);
    toast({ title: 'Peça copiada!' });
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" /> Gerador de Peças (IA)
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Advogado(a) Sênior — redação técnica, fundamentação legal e jurisprudência
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="bg-card rounded-lg border p-5 space-y-4 shadow-card">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo de peça *</Label>
              <Select value={form.tipo} onValueChange={(v) => set('tipo', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>{TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Área</Label>
              <Select value={form.area} onValueChange={(v) => set('area', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>{AREAS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Partes (qualificação)</Label>
            <Textarea rows={3} value={form.partes} onChange={(e) => set('partes', e.target.value)}
              placeholder="Autor: João da Silva, CPF…, residente em…&#10;Réu: Empresa X Ltda, CNPJ…" />
          </div>

          <div>
            <Label>Fatos *</Label>
            <Textarea rows={5} value={form.fatos} onChange={(e) => set('fatos', e.target.value)}
              placeholder="Descreva cronologicamente os fatos relevantes…" />
          </div>

          <div>
            <Label>Pedidos desejados</Label>
            <Textarea rows={3} value={form.pedidos} onChange={(e) => set('pedidos', e.target.value)}
              placeholder="Indenização por danos morais (R$ 20.000), tutela de urgência…" />
          </div>

          <div>
            <Label>Contexto adicional</Label>
            <Textarea rows={2} value={form.contexto} onChange={(e) => set('contexto', e.target.value)}
              placeholder="Vara, comarca, número do processo, provas anexadas…" />
          </div>

          <div>
            <Label>Instruções específicas</Label>
            <Input value={form.instrucoes} onChange={(e) => set('instrucoes', e.target.value)}
              placeholder="Ex.: incluir pedido de gratuidade, tom mais agressivo, citar súmula 385 STJ…" />
          </div>

          <div className="flex gap-2">
            {!loading ? (
              <Button onClick={gerar} className="flex-1" size="lg">
                <Sparkles className="h-4 w-4 mr-2" /> Gerar Peça
              </Button>
            ) : (
              <Button onClick={stop} variant="destructive" className="flex-1" size="lg">
                <Square className="h-4 w-4 mr-2" /> Parar
              </Button>
            )}
          </div>
        </div>

        {/* Output */}
        <div className="bg-card rounded-lg border p-5 shadow-card flex flex-col min-h-[600px]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" /> Peça Gerada
            </h2>
            {output && (
              <Button size="sm" variant="outline" onClick={copiar}>
                <Copy className="h-3 w-3 mr-1" /> Copiar
              </Button>
            )}
          </div>
          <div className="flex-1 overflow-auto">
            {loading && !output && (
              <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
                <Loader2 className="h-5 w-5 animate-spin" /> Redigindo…
              </div>
            )}
            {!loading && !output && (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
                <Sparkles className="h-10 w-10 opacity-30" />
                <p>Preencha o formulário e clique em "Gerar Peça"</p>
              </div>
            )}
            {output && (
              <pre className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-foreground">
                {output}
                {loading && <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1" />}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
