import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Send, Loader2, MessageSquare } from 'lucide-react';

export type CommentType =
  | 'comentario' | 'andamento' | 'despacho' | 'publicacao' | 'conclusao' | 'documento';

const TIPOS: { value: CommentType; label: string; className: string }[] = [
  { value: 'comentario', label: 'Comentário',  className: 'bg-muted text-muted-foreground border-border' },
  { value: 'andamento',  label: 'Andamento',   className: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'despacho',   label: 'Despacho',    className: 'bg-purple-100 text-purple-700 border-purple-200' },
  { value: 'publicacao', label: 'Publicação',  className: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'conclusao',  label: 'Conclusão',   className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { value: 'documento',  label: 'Documento',   className: 'bg-teal-100 text-teal-700 border-teal-200' },
];
const TIPO_MAP = Object.fromEntries(TIPOS.map((t) => [t.value, t]));

interface Comment {
  id: string;
  process_id: string | null;
  task_id: string | null;
  user_id: string;
  author_name: string;
  content: string;
  type: CommentType;
  created_at: string;
}

interface Props {
  processId?: string;
  taskId?: string;
  className?: string;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

function initialsFor(name: string): string {
  if (!name) return '?';
  const parts = name.replace(/@.*$/, '').split(/[\s._-]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const second = parts[1]?.[0] ?? '';
  return (first + second).toUpperCase() || name[0].toUpperCase();
}

const COLORS = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-amber-500', 'bg-pink-500', 'bg-teal-500', 'bg-indigo-500'];
function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function HistoricoConversas({ processId, taskId, className }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [type, setType] = useState<CommentType>('comentario');
  const [sending, setSending] = useState(false);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  if (!processId && !taskId) {
    console.warn('[HistoricoConversas] requires processId or taskId');
  }

  const queryKey = useMemo(
    () => ['process-comments', processId ?? null, taskId ?? null],
    [processId, taskId],
  );

  const { data: comments = [], isLoading } = useQuery<Comment[]>({
    queryKey,
    enabled: !!(processId || taskId),
    queryFn: async () => {
      let q = supabase.from('process_comments' as any).select('*').order('created_at', { ascending: true }).limit(500);
      if (processId) q = q.eq('process_id', processId);
      if (taskId) q = q.eq('task_id', taskId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Comment[];
    },
  });

  // Realtime subscription
  useEffect(() => {
    if (!processId && !taskId) return;
    const filter = processId ? `process_id=eq.${processId}` : `task_id=eq.${taskId}`;
    const channelName = `process_comments:${processId ?? taskId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'process_comments', filter },
        () => { qc.invalidateQueries({ queryKey }); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [processId, taskId, qc, queryKey]);

  // Auto-scroll quando chega novo comentário
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [comments.length]);

  async function handleSend() {
    const content = text.trim();
    if (!content || !user) return;
    setSending(true);
    const author_name = (user.user_metadata as any)?.full_name || user.email || 'Usuário';
    const payload: any = {
      user_id: user.id,
      author_name,
      content,
      type,
      process_id: processId ?? null,
      task_id: taskId ?? null,
    };
    const { error } = await supabase.from('process_comments' as any).insert(payload);
    setSending(false);
    if (error) {
      toast({ title: 'Erro ao enviar', description: error.message, variant: 'destructive' });
      return;
    }
    setText('');
    setType('comentario');
    qc.invalidateQueries({ queryKey });
  }

  return (
    <div className={`flex flex-col h-full ${className ?? ''}`}>
      {/* Timeline */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-4">
        {isLoading && (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Carregando histórico…
          </div>
        )}
        {!isLoading && comments.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
            <MessageSquare className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">Nenhum registro ainda.</p>
            <p className="text-xs">Adicione um comentário, andamento ou despacho abaixo.</p>
          </div>
        )}

        {comments.map((c, idx) => {
          const tipo = TIPO_MAP[c.type] ?? TIPO_MAP.comentario;
          const isLast = idx === comments.length - 1;
          return (
            <div key={c.id} className="flex gap-3 relative">
              {/* timeline line */}
              {!isLast && (
                <div className="absolute left-4 top-9 bottom-[-1rem] w-px bg-border" aria-hidden />
              )}
              {/* avatar */}
              <div className={`h-8 w-8 rounded-full ${colorFor(c.author_name)} text-white text-xs font-semibold flex items-center justify-center shrink-0 z-10`}>
                {initialsFor(c.author_name)}
              </div>
              {/* card */}
              <div className="flex-1 min-w-0 bg-card border rounded-md p-3 shadow-sm">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-sm font-semibold truncate">{c.author_name}</span>
                  <Badge variant="outline" className={`${tipo.className} text-[10px] px-1.5 py-0`}>{tipo.label}</Badge>
                  <span className="text-xs text-muted-foreground ml-auto">{formatDateTime(c.created_at)}</span>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap break-words">{c.content}</p>
              </div>
            </div>
          );
        })}
        <div ref={listEndRef} />
      </div>

      {/* Compose */}
      <div className="border-t mt-3 pt-3 space-y-2">
        <div className="flex items-center gap-2">
          <Select value={type} onValueChange={(v) => setType(v as CommentType)}>
            <SelectTrigger className="h-8 text-xs w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS.map((t) => (
                <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground truncate">
            como <strong>{user?.email ?? 'usuário'}</strong>
          </span>
        </div>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escreva uma mensagem, andamento ou despacho…"
          className="min-h-[72px] text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSend(); }
          }}
        />
        <div className="flex justify-end gap-2">
          <span className="text-[10px] text-muted-foreground self-center">Ctrl/⌘ + Enter para enviar</span>
          <Button size="sm" onClick={handleSend} disabled={sending || !text.trim() || !user}>
            {sending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
            Enviar
          </Button>
        </div>
      </div>
    </div>
  );
}

export default HistoricoConversas;
