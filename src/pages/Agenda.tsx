import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import {
  ChevronLeft, ChevronRight, Plus, Calendar, Clock, CheckCircle2, Circle,
} from 'lucide-react';

const MONTHS = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];
const WEEKDAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

interface Task {
  id: string;
  title: string;
  description?: string;
  due_date?: string;
  priority?: string;
  completed: boolean;
  process_id?: string;
  processes?: { number: string; title: string };
}

interface Process {
  id: string;
  number: string;
  title: string;
}

function useAgendaTasks() {
  return useQuery({
    queryKey: ['agenda-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*, processes(number, title)')
        .order('due_date', { ascending: true });
      if (error) throw error;
      return data as Task[];
    },
  });
}

function useProcessList() {
  return useQuery({
    queryKey: ['process-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('processes')
        .select('id, number, title')
        .limit(100);
      if (error) throw error;
      return data as Process[];
    },
  });
}

export default function Agenda() {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(
    today.toISOString().split('T')[0]
  );
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    due_date: today.toISOString().split('T')[0],
    priority: 'media',
    process_id: '',
  });

  const { data: tasks = [] } = useAgendaTasks();
  const { data: processes = [] } = useProcessList();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const calendarCells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const tasksByDate: Record<string, Task[]> = {};
  tasks.forEach((t) => {
    if (t.due_date) {
      const key = t.due_date.split('T')[0];
      if (!tasksByDate[key]) tasksByDate[key] = [];
      tasksByDate[key].push(t);
    }
  });

  const selectedTasks = tasksByDate[selectedDate] || [];

  const upcoming = tasks
    .filter((t) => {
      if (!t.due_date || t.completed) return false;
      const d = new Date(t.due_date.split('T')[0]);
      const now = new Date(today.toISOString().split('T')[0]);
      const diff = (d.getTime() - now.getTime()) / 86400000;
      return diff >= 0 && diff <= 30;
    })
    .slice(0, 10);

  const createTask = useMutation({
    mutationFn: async (payload: typeof form) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('tasks').insert({
        title: payload.title,
        description: payload.description || null,
        due_date: payload.due_date || null,
        priority: payload.priority,
        process_id: payload.process_id || null,
        user_id: user?.id,
        completed: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agenda-tasks'] });
      toast({ title: 'Compromisso criado!' });
      setNewTaskOpen(false);
      setForm({ title: '', description: '', due_date: today.toISOString().split('T')[0], priority: 'media', process_id: '' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const toggleTask = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const { error } = await supabase.from('tasks').update({ completed }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agenda-tasks'] }),
  });

  function prevMonth() {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
  }
  function nextMonth() {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
  }

  function dateKey(day: number) {
    return `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const priorityColor: Record<string, string> = {
    alta: 'bg-red-500',
    media: 'bg-yellow-500',
    baixa: 'bg-green-500',
  };
  const priorityLabel: Record<string, string> = {
    alta: 'Alta', media: 'Média', baixa: 'Baixa',
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>
          <p className="text-sm text-gray-500">Compromissos, audiências e prazos</p>
        </div>
        <Button onClick={() => { setForm(f => ({ ...f, due_date: selectedDate })); setNewTaskOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Novo compromisso
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="font-semibold text-gray-800">
              {MONTHS[currentMonth]} {currentYear}
            </h2>
            <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-7 mb-2">
            {WEEKDAYS.map(d => (
              <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarCells.map((day, i) => {
              if (!day) return <div key={i} />;
              const key = dateKey(day);
              const isToday = key === today.toISOString().split('T')[0];
              const isSelected = key === selectedDate;
              const hasTasks = !!tasksByDate[key]?.length;
              const hasIncomplete = tasksByDate[key]?.some(t => !t.completed);
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(key)}
                  className={`relative flex flex-col items-center justify-center h-10 w-full rounded-lg text-sm transition-colors
                    ${isSelected ? 'bg-blue-600 text-white' : isToday ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100 text-gray-700'}`}
                >
                  {day}
                  {hasTasks && (
                    <span className={`absolute bottom-1 w-1 h-1 rounded-full ${isSelected ? 'bg-white' : hasIncomplete ? 'bg-orange-500' : 'bg-green-500'}`} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-4">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-500" /> Próximos 30 dias
          </h3>
          {upcoming.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum compromisso próximo.</p>
          ) : (
            <div className="space-y-2">
              {upcoming.map(t => (
                <div key={t.id} className="p-2 rounded-lg border border-gray-100 hover:border-blue-200 cursor-pointer"
                  onClick={() => { if (t.due_date) setSelectedDate(t.due_date.split('T')[0]); }}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityColor[t.priority || 'media']}`} />
                    <span className="text-sm font-medium text-gray-700 truncate">{t.title}</span>
                  </div>
                  {t.due_date && (
                    <p className="text-xs text-gray-400 mt-0.5 ml-4">
                      {new Date(t.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-4">
        <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-blue-500" />
          {new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          <Badge variant="secondary">{selectedTasks.length}</Badge>
        </h3>
        {selectedTasks.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhum compromisso neste dia.</p>
        ) : (
          <div className="space-y-2">
            {selectedTasks.map(t => (
              <div key={t.id} className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${t.completed ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-200'}`}>
                <button onClick={() => toggleTask.mutate({ id: t.id, completed: !t.completed })} className="mt-0.5 flex-shrink-0">
                  {t.completed
                    ? <CheckCircle2 className="w-5 h-5 text-green-500" />
                    : <Circle className="w-5 h-5 text-gray-300" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`font-medium ${t.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>{t.title}</p>
                  {t.description && <p className="text-sm text-gray-500 mt-0.5">{t.description}</p>}
                  {t.processes && <p className="text-xs text-blue-500 mt-0.5">Processo {t.processes.number}</p>}
                </div>
                <Badge className={`text-white text-xs ${priorityColor[t.priority || 'media']}`}>
                  {priorityLabel[t.priority || 'media']}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={newTaskOpen} onOpenChange={setNewTaskOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo compromisso</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: Audiência de instrução" />
            </div>
            <div>
              <Label>Data</Label>
              <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
            </div>
            <div>
              <Label>Prioridade</Label>
              <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="baixa">Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Processo (opcional)</Label>
              <Select value={form.process_id} onValueChange={v => setForm(f => ({ ...f, process_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecionar processo..." /></SelectTrigger>
                <SelectContent>
                  {processes.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.number} — {p.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewTaskOpen(false)}>Cancelar</Button>
            <Button onClick={() => createTask.mutate(form)} disabled={!form.title || createTask.isPending}>
              {createTask.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
