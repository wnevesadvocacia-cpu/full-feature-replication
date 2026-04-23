import { ReactNode } from 'react';
import { useCanDelete } from '@/hooks/useUserRole';

/**
 * Esconde os filhos quando o usuário não é admin nem gerente.
 * Use ao redor de botões de exclusão (Trash, "Remover", etc.).
 */
export function DeleteGuard({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const canDelete = useCanDelete();
  if (!canDelete) return <>{fallback}</>;
  return <>{children}</>;
}
