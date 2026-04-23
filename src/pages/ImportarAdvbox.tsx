import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, Database } from 'lucide-react';

// ── Parser CSV/TXT robusto (suporta vírgula, ponto-e-vírgula, tab) ──
function detectDelim(line: string): string {
  const c = (ch: string) => (line.match(new RegExp(ch === '\t' ? '\\t' : ch === '|' ? '\\|' : ch, 'g')) || []).length;
  const candidates = [';', '\t', '|', ','];
  return candidates.sort((a, b) => c(b) - c(a))[0];
}

function parseLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === delim) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function parseFile(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const delim = detectDelim(lines[0]);
  const headers = parseLine(lines[0], delim).map(h => h.toLowerCase().trim());
  const rows = lines.slice(1).map(l => {
    const vals = parseLine(l, delim);
    const o: Record<string, string> = {};
    headers.forEach((h, i) => { o[h] = vals[i] ?? ''; });
    return o;
  });
  return { headers, rows };
}

// ── Mapeamentos comuns ADVBOX → schema ──
function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k.toLowerCase()];
    if (v && v.trim()) return v.trim();
  }
  return '';
}

function mapClient(row: Record<string, string>) {
  return {
    name: pick(row, 'nome', 'cliente', 'name', 'razao_social', 'razão social'),
    email: pick(row, 'email', 'e-mail') || null,
    phone: pick(row, 'telefone', 'phone', 'celular', 'fone') || null,
    document: pick(row, 'cpf', 'cnpj', 'documento', 'document') || null,
    type: pick(row, 'tipo', 'type').toUpperCase().includes('PJ') ? 'PJ' : 'PF',
    status: 'ativo',
  };
}

function mapProcess(row: Record<string, string>) {
  return {
    number: pick(row, 'numero', 'número', 'numero_processo', 'cnj', 'processo'),
    title: pick(row, 'titulo', 'título', 'assunto', 'title', 'objeto') || 'Processo importado',
    client_name: pick(row, 'cliente', 'parte', 'autor') || null,
    type: pick(row, 'tipo', 'area', 'área') || null,
    tribunal: pick(row, 'tribunal') || null,
    vara: pick(row, 'vara') || null,
    comarca: pick(row, 'comarca') || null,
    status: pick(row, 'status', 'situacao', 'situação').toLowerCase() || 'em_andamento',
    value: parseFloat(pick(row, 'valor', 'valor_causa', 'value').replace(/[^\d,.-]/g, '').replace(',', '.')) || null,
  };
}

type ImportType = 'clientes' | 'processos';

export default function ImportarAdvbox() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [type, setType] = useState<ImportType>('clientes');
  const [preview, setPreview] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ inserted: number; skipped: number; errors: string[] } | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    const parsed = parseFile(text);
    setPreview(parsed);
    setResult(null);
  };

  const importNow = async () => {
    if (!preview || !user) return;
    setBusy(true);
    setResult(null);
    let inserted = 0, skipped = 0;
    const errors: string[] = [];

    const batchSize = 50;
    const items = preview.rows.map(r => type === 'clientes' ? mapClient(r) : mapProcess(r));
    const valid = items.filter(it =>
      type === 'clientes' ? !!(it as any).name : !!(it as any).number
    );
    skipped = items.length - valid.length;

    for (let i = 0; i < valid.length; i += batchSize) {
      const chunk = valid.slice(i, i + batchSize).map(v => ({ ...v, user_id: user.id }));
      const { error, count } = await supabase.from(type === 'clientes' ? 'clients' : 'processes').insert(chunk).select('id', { count: 'exact', head: true });
      if (error) {
        errors.push(`Lote ${Math.floor(i / batchSize) + 1}: ${error.message}`);
      } else {
        inserted += count ?? chunk.length;
      }
    }

    setResult({ inserted, skipped, errors });
    setBusy(false);
    toast({
      title: errors.length ? 'Importação parcial' : 'Importação concluída',
      description: `${inserted} importado(s), ${skipped} ignorado(s)${errors.length ? `, ${errors.length} erro(s)` : ''}`,
      variant: errors.length ? 'destructive' : 'default',
    });
  };

  const expectedCols = type === 'clientes'
    ? ['nome / cliente / name', 'email / e-mail', 'telefone / celular', 'cpf / cnpj / documento', 'tipo (PF/PJ)']
    : ['numero / cnj', 'titulo / assunto', 'cliente / parte', 'tipo / area', 'tribunal', 'vara', 'comarca', 'status', 'valor'];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Database className="h-6 w-6" /> Importar dados ADVBOX
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Importe clientes e processos a partir de exportações CSV/TXT do ADVBOX (delimitadores , ; tab |).
        </p>
      </div>

      <Tabs value={type} onValueChange={(v) => { setType(v as ImportType); setPreview(null); setResult(null); }}>
        <TabsList>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
          <TabsTrigger value="processos">Processos</TabsTrigger>
        </TabsList>

        <TabsContent value={type} className="space-y-4">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div>
                <p className="text-sm font-medium mb-2">Colunas reconhecidas:</p>
                <div className="flex flex-wrap gap-1">
                  {expectedCols.map(c => <Badge key={c} variant="outline" className="font-mono text-xs">{c}</Badge>)}
                </div>
              </div>
              <label className="block">
                <input type="file" accept=".csv,.txt,.tsv" onChange={onFile} className="hidden" id="file-upload" />
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => document.getElementById('file-upload')?.click()}>
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">Selecionar arquivo CSV/TXT</p>
                  <p className="text-xs text-muted-foreground mt-1">Ou arraste e solte aqui</p>
                </div>
              </label>
            </CardContent>
          </Card>

          {preview && (
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5 text-primary" />
                    <p className="font-medium">{preview.rows.length} linhas detectadas</p>
                    <Badge variant="secondary">{preview.headers.length} colunas</Badge>
                  </div>
                  <Button onClick={importNow} disabled={busy || preview.rows.length === 0}>
                    {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importando…</>
                          : <>Importar {preview.rows.length} {type}</>}
                  </Button>
                </div>

                <div className="overflow-x-auto border rounded-md">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>{preview.headers.map(h => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y">
                      {preview.rows.slice(0, 5).map((r, i) => (
                        <tr key={i}>{preview.headers.map(h => <td key={h} className="px-3 py-2 max-w-[200px] truncate">{r[h]}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.rows.length > 5 && (
                  <p className="text-xs text-muted-foreground text-center">Mostrando 5 de {preview.rows.length} linhas</p>
                )}
              </CardContent>
            </Card>
          )}

          {result && (
            <Card>
              <CardContent className="p-6 space-y-3">
                <div className="flex items-center gap-2">
                  {result.errors.length === 0
                    ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    : <AlertCircle className="h-5 w-5 text-amber-600" />}
                  <p className="font-semibold">Resultado</p>
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="p-3 rounded-md bg-emerald-50 dark:bg-emerald-950">
                    <p className="text-muted-foreground text-xs">Inseridos</p>
                    <p className="text-2xl font-bold text-emerald-700">{result.inserted}</p>
                  </div>
                  <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-950">
                    <p className="text-muted-foreground text-xs">Ignorados</p>
                    <p className="text-2xl font-bold text-amber-700">{result.skipped}</p>
                  </div>
                  <div className="p-3 rounded-md bg-red-50 dark:bg-red-950">
                    <p className="text-muted-foreground text-xs">Erros</p>
                    <p className="text-2xl font-bold text-red-700">{result.errors.length}</p>
                  </div>
                </div>
                {result.errors.length > 0 && (
                  <ul className="text-xs text-red-700 space-y-1 mt-2 max-h-32 overflow-auto">
                    {result.errors.map((e, i) => <li key={i}>• {e}</li>)}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
