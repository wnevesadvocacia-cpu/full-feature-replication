import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useImportClients } from '@/hooks/useClients';
import { useToast } from '@/hooks/use-toast';

type ParsedClient = {
  name: string;
  email?: string;
  phone?: string;
  type?: string;
  document?: string;
};

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',' || ch === ';') {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}

function mapHeaders(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const lower = headers.map(h => h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));

  lower.forEach((h, i) => {
    if (h.includes('nome') || h.includes('name') || h === 'cliente') map['name'] = headers[i];
    else if (h.includes('email') || h.includes('e-mail')) map['email'] = headers[i];
    else if (h.includes('telefone') || h.includes('phone') || h.includes('celular') || h.includes('fone')) map['phone'] = headers[i];
    else if (h.includes('tipo') || h.includes('type') || h === 'pf/pj') map['type'] = headers[i];
    else if (h.includes('cpf') || h.includes('cnpj') || h.includes('document') || h.includes('documento')) map['document'] = headers[i];
  });

  return map;
}

export default function CsvImportDialog() {
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState<ParsedClient[]>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const importClients = useImportClients();
  const { toast } = useToast();

  const reset = () => {
    setParsed([]);
    setFileName('');
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) {
          setError('O arquivo precisa ter pelo menos um cabeçalho e uma linha de dados.');
          return;
        }

        const headers = parseCsvLine(lines[0]);
        const fieldMap = mapHeaders(headers);

        if (!fieldMap['name']) {
          setError('Coluna "Nome" não encontrada. Verifique se o CSV tem uma coluna com nome do cliente.');
          return;
        }

        const clients: ParsedClient[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = parseCsvLine(lines[i]);
          const row: Record<string, string> = {};
          headers.forEach((h, idx) => { row[h] = cols[idx] || ''; });

          const name = row[fieldMap['name']]?.trim();
          if (!name) continue;

          const type = fieldMap['type'] ? row[fieldMap['type']]?.trim().toUpperCase() : undefined;

          clients.push({
            name,
            email: fieldMap['email'] ? row[fieldMap['email']]?.trim() || undefined : undefined,
            phone: fieldMap['phone'] ? row[fieldMap['phone']]?.trim() || undefined : undefined,
            type: type === 'PJ' ? 'PJ' : 'PF',
            document: fieldMap['document'] ? row[fieldMap['document']]?.trim() || undefined : undefined,
          });
        }

        if (clients.length === 0) {
          setError('Nenhum cliente válido encontrado no arquivo.');
          return;
        }

        setParsed(clients);
      } catch {
        setError('Erro ao processar o arquivo. Verifique se é um CSV válido.');
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleImport = async () => {
    try {
      const result = await importClients.mutateAsync(parsed);
      toast({ title: `${result.length} clientes importados com sucesso!` });
      reset();
      setOpen(false);
    } catch (e: any) {
      toast({ title: 'Erro na importação', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline"><Upload className="h-4 w-4" />Importar CSV</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Importar Clientes via CSV</DialogTitle></DialogHeader>

        <div className="space-y-4">
          <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" id="csv-upload" />
            <label htmlFor="csv-upload" className="cursor-pointer space-y-2 block">
              <FileSpreadsheet className="h-8 w-8 mx-auto text-muted-foreground" />
              {fileName ? (
                <p className="text-sm font-medium">{fileName}</p>
              ) : (
                <>
                  <p className="text-sm font-medium">Clique para selecionar o arquivo CSV</p>
                  <p className="text-xs text-muted-foreground">CSV de qualquer planilha ou sistema</p>
                </>
              )}
            </label>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-md">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {parsed.length > 0 && (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                <span><strong>{parsed.length}</strong> clientes encontrados no arquivo</span>
              </div>

              <div className="max-h-48 overflow-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="text-left p-2">Nome</th>
                      <th className="text-left p-2">Email</th>
                      <th className="text-left p-2">Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.slice(0, 50).map((c, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2">{c.name}</td>
                        <td className="p-2 text-muted-foreground">{c.email || '—'}</td>
                        <td className="p-2">{c.type}</td>
                      </tr>
                    ))}
                    {parsed.length > 50 && (
                      <tr className="border-t">
                        <td colSpan={3} className="p-2 text-center text-muted-foreground">
                          ... e mais {parsed.length - 50} clientes
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-muted-foreground">
                Colunas detectadas: Nome{parsed[0]?.email ? ', Email' : ''}{parsed[0]?.phone ? ', Telefone' : ''}{parsed[0]?.document ? ', CPF/CNPJ' : ''}
              </p>

              <Button className="w-full" onClick={handleImport} disabled={importClients.isPending}>
                {importClients.isPending ? 'Importando...' : `Importar ${parsed.length} Clientes`}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
