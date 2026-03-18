import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Filter, Mail, Phone, MoreHorizontal } from 'lucide-react';

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  type: 'PF' | 'PJ';
  document: string;
  activeProcesses: number;
  totalBilled: number;
  status: 'ativo' | 'inativo';
}

const mockClients: Client[] = [
  { id: '1', name: 'João Silva', email: 'joao@email.com', phone: '(11) 99999-1234', type: 'PF', document: '123.456.789-00', activeProcesses: 2, totalBilled: 45000, status: 'ativo' },
  { id: '2', name: 'Maria Santos', email: 'maria@email.com', phone: '(11) 98888-5678', type: 'PF', document: '987.654.321-00', activeProcesses: 1, totalBilled: 25000, status: 'ativo' },
  { id: '3', name: 'Tech Corp LTDA', email: 'contato@techcorp.com', phone: '(11) 3333-4444', type: 'PJ', document: '12.345.678/0001-90', activeProcesses: 3, totalBilled: 120000, status: 'ativo' },
  { id: '4', name: 'Ana Oliveira', email: 'ana@email.com', phone: '(21) 97777-8888', type: 'PF', document: '456.789.123-00', activeProcesses: 1, totalBilled: 8000, status: 'ativo' },
  { id: '5', name: 'Comércio ABC', email: 'financeiro@abc.com', phone: '(11) 2222-3333', type: 'PJ', document: '98.765.432/0001-10', activeProcesses: 1, totalBilled: 75000, status: 'inativo' },
  { id: '6', name: 'Roberto Lima', email: 'roberto@email.com', phone: '(31) 96666-7777', type: 'PF', document: '321.654.987-00', activeProcesses: 1, totalBilled: 32000, status: 'ativo' },
  { id: '7', name: 'Fernanda Costa', email: 'fernanda@email.com', phone: '(21) 95555-4444', type: 'PF', document: '654.321.987-00', activeProcesses: 1, totalBilled: 55000, status: 'ativo' },
  { id: '8', name: 'Imobiliária XYZ', email: 'contato@xyz.com', phone: '(11) 4444-5555', type: 'PJ', document: '11.222.333/0001-44', activeProcesses: 1, totalBilled: 15000, status: 'ativo' },
];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export default function Clientes() {
  const [search, setSearch] = useState('');

  const filtered = mockClients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      c.document.includes(search)
  );

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Clientes</h1>
          <p className="text-muted-foreground text-sm mt-1">{mockClients.length} clientes cadastrados</p>
        </div>
        <Button>
          <Plus className="h-4 w-4" />
          Novo Cliente
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Button variant="outline" size="sm">
          <Filter className="h-4 w-4" />
          Filtros
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((client) => (
          <div key={client.id} className="bg-card rounded-lg p-5 shadow-card hover:shadow-card-hover transition-shadow duration-200 group">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-primary font-semibold text-sm">{client.name.split(' ').map(n => n[0]).join('').slice(0, 2)}</span>
                </div>
                <div>
                  <h3 className="font-medium text-sm">{client.name}</h3>
                  <Badge variant="outline" className="text-xs mt-0.5">{client.type === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'}</Badge>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5" />
                <span>{client.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5" />
                <span>{client.phone}</span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t flex items-center justify-between text-sm">
              <div>
                <span className="text-muted-foreground">{client.activeProcesses} processos</span>
              </div>
              <span className="font-semibold tabular-nums">{formatCurrency(client.totalBilled)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
