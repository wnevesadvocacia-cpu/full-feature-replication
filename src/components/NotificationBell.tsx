import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Bell } from 'lucide-react';

export function NotificationBell() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { data: count = 0 } = useQuery({
    queryKey: ['notifications-unread-count'],
    enabled: !!user,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { count, error } = await (supabase as any)
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('read', false);
      if (error) return 0;
      return count ?? 0;
    },
  });

  return (
    <Button variant="ghost" size="icon" className="relative" onClick={() => nav('/notificacoes')}>
      <Bell className="h-4 w-4" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Button>
  );
}
