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
  ChevronLeft, ChevronRight, Plus, Calendar, Clock,
  CheckCircle2, Circle, Pencil, Trash2, AlertTriangle,
  MapPin, User, Briefcase, FileText, Tag, RotateCcw,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { DeleteGuard } from '@/components/DeleteGuard';

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
  start_time?: string | null;
  end_time?: string | null;
  event_type?: string | null;
  location?: string | null;
  assignee?: string | null;
  processes?: { number: string; title: string };
}

interface Process { id: string; number: string; title: string; }

interface AgendaForm {
  title: string; description: string; due_date: string;
  priority: string; process_id: string; assignee: string;
  start_time: string; end_time: string; event_type: string; location: string;
}

const EVENT_TYPES = ['Audiência','Prazo Fatal','Reunião','Despacho','Diligência','Sustentação Oral','Outro'];

const EMPTY_FORM = (date: string): AgendaForm => ({
  title: '', description: '', due_date: date, priority: 'media', process_id: '', assignee: '',
  start_time: '', end_time: '', event_type: 'Audiência', location: '',
});

const priorityColor: Record<string, string> = {
  alta: 'bg-red-500', media: 'bg-yellow-500', baixa: 'bg-green-500',
};
const priorityLabel: Record<string, string> = {
  alta: 'Alta', media: 'Média', baixa: 'Baixa',
};

function useAgendaTasks() {
  return useQuery({
    queryKey: ['agenda-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*, processes(number, title)')
        .not('assignee', 'eq', 'movimentacao')
        .not('assignee', 'eq', 'documento')
        .order('due_date', { ascending: true })
        .limit(5000);
      if (error) throw error;
      return data as Task[];
    },
  });
}

function useProcessList() {
  return useQuery<Process[]>({
    queryKey: ['process-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('processes')
        .select('id, number, title')
        .order('number', { ascending: true }).limit(4000);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export default function Agenda() {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Task | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [detailTarget, setDetailTarget] = useState<Task | null>(null);
  const [form, setForm] = useState<AgendaForm>(EMPTY_FORM(todayStr));
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<'day' | 'week' | 'month'>('month');

  const { data: tasks = [] } = useAgendaTasks();
  const { data: processes = [] } = useProcessList();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  // Calendar helpers
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

  // Sort tasks within each day by start_time
  Object.keys(tasksByDate).forEach(k => {
    tasksByDate[k].sort((a, b) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99'));
  });

  const selectedTasks = tasksByDate[selectedDate] ?? [];

  // Week view: 7 days starting Sunday of selected date
  const weekDays: string[] = (() => {
    const d = new Date(selectedDate + 'T12:00:00');
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const x = new Date(start);
      x.setDate(start.getDate() + i);
      return x.toISOString().split('T')[0];
    });
  })();

  const upcoming = tasks
    .filter((t) => {
      if (!t.due_date || t.completed) return false;
      const d = new Date(t.due_date.split('T')[0]);
      const now = new Date(todayStr);
      const diff = (d.getTime() - now.getTime()) / 86400000;
      return diff >= 0 && diff <= 30;
    })
    .slice(0, 10);

  function dateKey(day: number) {
    return `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  function prevMonth() {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
  }
  function nextMonth() {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
  }

  const openEdit = (t: Task) => {
    setForm({
      title: t.title ?? '',
      description: t.description ?? '',
      due_date: t.due_date ? t.due_date.split('T')[0] : selectedDate,
      priority: t.priority ?? 'media',
      process_id: t.process_id ?? '',
      assignee: t.assignee ?? '',
      start_time: t.start_time ?? '',
      end_time: t.end_time ?? '',
      event_type: t.event_type ?? 'Audiência',
      location: t.location ?? '',
    });
    setEditTarget(t);
  };

  const handleCreate = async () => {
    if (!form.title.trim() || !form.process_id || !form.due_date || !form.assignee.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('tasks').insert({
        title: form.title,
        description: form.description || null,
        due_date: form.due_date || null,
        priority: form.priority,
        process_id: form.process_id,
        assignee: form.assignee || null,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        event_type: form.event_type || null,
        location: form.location || null,
        user_id: user?.id,
        completed: false,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['agenda-tasks'] });
      toast({ title: 'Compromisso criado!' });
      setCreateOpen(false);
      setForm(EMPTY_FORM(selectedDate));
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleEdit = async () => {
    if (!editTarget || !form.title.trim() || !form.process_id || !form.due_date || !form.assignee.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('tasks').update({
        title: form.title,
        description: form.description || null,
        due_date: form.due_date || null,
        priority: form.priority,
        process_id: form.process_id,
        assignee: form.assignee || null,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        event_type: form.event_type || null,
        location: form.location || null,
      }).eq('id', editTarget.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['agenda-tasks'] });
      toast({ title: 'Compromisso atualizado!' });
      setEditTarget(null);
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('tasks').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['agenda-tasks'] });
      toast({ title: 'Compromisso removido.' });
      setDeleteTarget(null);
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const toggleTask = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const { error } = await supabase.from('tasks').update({ completed }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agenda-tasks'] }),
  });

  const FormBody = ({ isEdit = false }) => (
    <div className="space-y-4">
      <div>
        <Label>Título *</Label>
        <Input className="mt-1" value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          placeholder="Ex: Audiência de instrução" />
      </div>
      <div>
        <Label>Prazo final *</Label>
        <Input className="mt-1" type="date" value={form.due_date}
          onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} required />
      </div>
      <div>
        <Label>Delegado a *</Label>
        <Input className="mt-1" value={form.assignee}
          onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))}
          placeholder="Nome do responsável" />
      </div>
      <div>
        <Label>Tipo</Label>
        <Select value={form.event_type} onValueChange={v => setForm(f => ({ ...f, event_type: v }))}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {EVENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Hora início</Label>
          <Input className="mt-1" type="time" value={form.start_time}
            onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
        </div>
        <div>
          <Label>Hora fim</Label>
          <Input className="mt-1" type="time" value={form.end_time}
            onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
        </div>
      </div>
      <div>
        <Label>Local</Label>
        <Input className="mt-1" value={form.location}
          onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
          placeholder="Ex: Fórum Central — Sala 302" />
      </div>
      <div>
        <Label>Prioridade</Label>
        <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="media">Média</SelectItem>
            <SelectItem value="baixa">Baixa</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Processo *</Label>
        <Select value={form.process_id}
          onValueChange={v => setForm(f => ({ ...f, process_id: v }))}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar processo…" /></SelectTrigger>
          <SelectContent>
            {processes.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.number} — {p.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Descrição (opcional)</Label>
        <Textarea className="mt-1" value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>
          <p className="text-sm text-gray-500">Compromissos, audiências e prazos</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border bg-white overflow-hidden">
            {(['day','week','month'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs font-medium ${view === v ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                {v === 'day' ? 'Dia' : v === 'week' ? 'Semana' : 'Mês'}
              </button>
            ))}
          </div>
          <Button onClick={() => { setForm(EMPTY_FORM(selectedDate)); setCreateOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" /> Novo compromisso
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendário */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="font-semibold text-gray-800">
              {view === 'day'
                ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                : view === 'week'
                  ? `Semana de ${new Date(weekDays[0] + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} a ${new Date(weekDays[6] + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}`
                  : `${MONTHS[currentMonth]} ${currentYear}`}
            </h2>
            <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {view === 'month' && (
            <>
              <div className="grid grid-cols-7 mb-2">
                {WEEKDAYS.map(d => (
                  <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendarCells.map((day, i) => {
                  if (!day) return <div key={i} />;
                  const key = dateKey(day);
                  const isToday = key === todayStr;
                  const isSelected = key === selectedDate;
                  const dayList = tasksByDate[key] ?? [];
                  const pendingCount = dayList.filter(t => !t.completed).length;
                  const doneCount = dayList.length - pendingCount;
                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedDate(key)}
                      className={`relative flex flex-col items-center justify-center h-12 w-full rounded-lg text-sm transition-colors
                        ${isSelected ? 'bg-blue-600 text-white' : isToday ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100 text-gray-700'}`}
                    >
                      <span>{day}</span>
                      {dayList.length > 0 && (
                        <div className="absolute bottom-0.5 flex items-center gap-0.5">
                          {pendingCount > 0 && (
                            <span className={`text-[9px] font-bold px-1 rounded leading-none py-0.5 ${
                              isSelected ? 'bg-white text-blue-700' : 'bg-orange-500 text-white'
                            }`}>
                              {pendingCount}
                            </span>
                          )}
                          {doneCount > 0 && pendingCount === 0 && (
                            <span className={`text-[9px] font-bold px-1 rounded leading-none py-0.5 ${
                              isSelected ? 'bg-white text-green-700' : 'bg-green-500 text-white'
                            }`}>
                              ✓{doneCount}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {view === 'week' && (
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map((k) => {
                const dt = new Date(k + 'T12:00:00');
                const isSelected = k === selectedDate;
                const isToday = k === todayStr;
                const dayTasks = tasksByDate[k] ?? [];
                return (
                  <button key={k} onClick={() => setSelectedDate(k)}
                    className={`flex flex-col items-stretch h-40 p-2 rounded-lg border text-left transition-colors
                      ${isSelected ? 'border-blue-600 bg-blue-50' : isToday ? 'border-blue-200' : 'border-gray-100 hover:bg-gray-50'}`}>
                    <div className="text-[11px] uppercase text-gray-400">{WEEKDAYS[dt.getDay()]}</div>
                    <div className={`text-lg font-semibold ${isToday ? 'text-blue-700' : 'text-gray-800'}`}>{dt.getDate()}</div>
                    <div className="mt-1 space-y-1 overflow-hidden">
                      {dayTasks.slice(0, 3).map(t => (
                        <div key={t.id} className="text-[11px] truncate px-1 py-0.5 rounded bg-white border border-gray-200">
                          {t.start_time?.slice(0,5) ?? ''} {t.title}
                        </div>
                      ))}
                      {dayTasks.length > 3 && (
                        <div className="text-[11px] text-gray-400">+{dayTasks.length - 3} mais</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {view === 'day' && (
            <p className="text-sm text-gray-400">
              Veja os compromissos do dia abaixo.
            </p>
          )}
        </div>

        {/* Próximos 30 dias */}
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-500" /> Próximos 30 dias
          </h3>
          {upcoming.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum compromisso próximo.</p>
          ) : (
            <div className="space-y-2">
              {upcoming.map(t => (
                <div key={t.id}
                  className="p-2 rounded-lg border border-gray-100 hover:border-blue-300 hover:bg-blue-50/30 cursor-pointer transition-colors"
                  onClick={() => {
                    if (t.due_date) setSelectedDate(t.due_date.split('T')[0]);
                    setDetailTarget(t);
                  }}>
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

      {/* Tarefas do dia selecionado */}
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
              <div key={t.id}
                onClick={() => setDetailTarget(t)}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-colors group cursor-pointer hover:border-blue-300 hover:shadow-sm ${t.completed ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-200'}`}>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleTask.mutate({ id: t.id, completed: !t.completed }); }}
                  className="mt-0.5 flex-shrink-0">
                  {t.completed
                    ? <CheckCircle2 className="w-5 h-5 text-green-500" />
                    : <Circle className="w-5 h-5 text-gray-300" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`font-medium ${t.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                    {t.title}
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-gray-500">
                    {t.event_type && <span className="font-medium text-gray-600">{t.event_type}</span>}
                    {(t.start_time || t.end_time) && (
                      <span>🕐 {t.start_time?.slice(0,5) ?? ''}{t.end_time ? ` – ${t.end_time.slice(0,5)}` : ''}</span>
                    )}
                    {t.location && <span>📍 {t.location}</span>}
                  </div>
                  {t.description && <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{t.description}</p>}
                  {t.processes && (
                    <p className="text-xs text-blue-500 mt-0.5">Processo {t.processes.number}</p>
                  )}
                  {t.assignee && t.assignee !== 'agenda' && t.assignee !== 'movimentacao' && t.assignee !== 'documento' && (
                    <p className="text-xs text-gray-500 mt-0.5">Responsável: {t.assignee}</p>
                  )}
                  {t.assignee === 'agenda' && (
                    <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded mt-0.5 inline-block">AdvBox</span>
                  )}
                </div>
                <Badge className={`text-white text-xs shrink-0 ${priorityColor[t.priority || 'media']}`}>
                  {priorityLabel[t.priority || 'media']}
                </Badge>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(t); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <DeleteGuard>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-600"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(t); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </DeleteGuard>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail / Overview Dialog */}
      <Dialog open={!!detailTarget} onOpenChange={(o) => { if (!o) setDetailTarget(null); }}>
        <DialogContent className="max-w-lg">
          {detailTarget && (() => {
            const t = detailTarget;
            const overdue = !t.completed && t.due_date && t.due_date.split('T')[0] < todayStr;
            return (
              <>
                <DialogHeader>
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleTask.mutate({ id: t.id, completed: !t.completed })}
                      className="mt-1 flex-shrink-0"
                      title={t.completed ? 'Reabrir' : 'Marcar como concluída'}
                    >
                      {t.completed
                        ? <CheckCircle2 className="w-6 h-6 text-green-500" />
                        : <Circle className="w-6 h-6 text-gray-300 hover:text-blue-500" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <DialogTitle className={`text-lg ${t.completed ? 'line-through text-gray-400' : ''}`}>
                        {t.title}
                      </DialogTitle>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Badge className={`text-white ${priorityColor[t.priority || 'media']}`}>
                          {priorityLabel[t.priority || 'media']}
                        </Badge>
                        {t.event_type && <Badge variant="outline">{t.event_type}</Badge>}
                        {t.completed && <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200">Concluída</Badge>}
                        {overdue && <Badge variant="destructive">Atrasada</Badge>}
                      </div>
                    </div>
                  </div>
                </DialogHeader>

                <div className="space-y-3 py-2">
                  {t.due_date && (
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span className="font-medium text-gray-700">
                        {new Date(t.due_date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                    </div>
                  )}
                  {(t.start_time || t.end_time) && (
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span>{t.start_time?.slice(0,5) ?? ''}{t.end_time ? ` – ${t.end_time.slice(0,5)}` : ''}</span>
                    </div>
                  )}
                  {t.location && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="w-4 h-4 text-gray-400" />
                      <span>{t.location}</span>
                    </div>
                  )}
                  {t.assignee && !['agenda','movimentacao','documento'].includes(t.assignee) && (
                    <div className="flex items-center gap-2 text-sm">
                      <User className="w-4 h-4 text-gray-400" />
                      <span>Responsável: <span className="font-medium">{t.assignee}</span></span>
                    </div>
                  )}
                  {t.processes && (
                    <div className="flex items-center gap-2 text-sm">
                      <Briefcase className="w-4 h-4 text-gray-400" />
                      <span>Processo <span className="font-mono">{t.processes.number}</span> — {t.processes.title}</span>
                    </div>
                  )}
                  {t.event_type && (
                    <div className="flex items-center gap-2 text-sm">
                      <Tag className="w-4 h-4 text-gray-400" />
                      <span>{t.event_type}</span>
                    </div>
                  )}
                  {t.description && (
                    <div className="flex items-start gap-2 text-sm pt-1 border-t">
                      <FileText className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <p className="whitespace-pre-wrap text-gray-700">{t.description}</p>
                    </div>
                  )}
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2">
                  <DeleteGuard>
                    <Button
                      variant="outline"
                      className="text-red-500 hover:text-red-600 sm:mr-auto"
                      onClick={() => { setDeleteTarget(t); setDetailTarget(null); }}
                    >
                      <Trash2 className="h-4 w-4 mr-1" /> Remover
                    </Button>
                  </DeleteGuard>
                  <Button variant="outline" onClick={() => { openEdit(t); setDetailTarget(null); }}>
                    <Pencil className="h-4 w-4 mr-1" /> Editar
                  </Button>
                  {t.completed ? (
                    <Button variant="secondary" onClick={() => { toggleTask.mutate({ id: t.id, completed: false }); setDetailTarget(null); }}>
                      <RotateCcw className="h-4 w-4 mr-1" /> Reabrir
                    </Button>
                  ) : (
                    <Button onClick={() => { toggleTask.mutate({ id: t.id, completed: true }); setDetailTarget(null); }}>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Resolver tarefa
                    </Button>
                  )}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) setCreateOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Novo compromisso</DialogTitle></DialogHeader>
          <FormBody />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!form.title || !form.process_id || !form.due_date || !form.assignee || saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Editar compromisso</DialogTitle></DialogHeader>
          <FormBody isEdit />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button onClick={handleEdit} disabled={!form.title || !form.process_id || !form.due_date || !form.assignee || saving}>
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
              <AlertTriangle className="h-5 w-5" /> Remover compromisso
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Remover <span className="font-semibold">"{deleteTarget?.title}"</span>? Esta ação não pode ser desfeita.
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
