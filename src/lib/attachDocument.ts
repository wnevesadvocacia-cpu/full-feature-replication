import { supabase } from '@/integrations/supabase/client';

export interface AttachDocumentParams {
  userId: string;
  file: File;
  processId?: string | null;
  clientId?: string | null;
  description?: string;
  category?: string;
}

export const MAX_ATTACH_BYTES = 50 * 1024 * 1024;

/**
 * Faz upload de um arquivo ao bucket `documents` e cria o registro em `public.documents`,
 * vinculando ao processo e (automaticamente) à pasta do cliente do processo.
 * Retorna o documento inserido.
 */
export async function attachDocumentToProcess(params: AttachDocumentParams) {
  const { userId, file, processId, description, category = 'anexo' } = params;
  if (!file) throw new Error('Arquivo vazio.');
  if (file.size > MAX_ATTACH_BYTES) throw new Error('Arquivo maior que 50 MB.');

  let clientId: string | null = params.clientId ?? null;
  if (!clientId && processId) {
    const { data: proc } = await supabase
      .from('processes')
      .select('client_id')
      .eq('id', processId)
      .maybeSingle();
    clientId = proc?.client_id ?? null;
  }

  const ext = file.name.split('.').pop() ?? 'bin';
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage.from('documents').upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (upErr) throw upErr;

  const { data, error: insErr } = await supabase
    .from('documents')
    .insert({
      user_id: userId,
      name: file.name,
      description: description ?? null,
      category,
      storage_path: path,
      mime_type: file.type || null,
      size_bytes: file.size,
      process_id: processId ?? null,
      client_id: clientId,
    })
    .select()
    .single();

  if (insErr) {
    await supabase.storage.from('documents').remove([path]);
    throw insErr;
  }
  return data;
}
