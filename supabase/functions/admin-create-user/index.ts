// Cria um novo usuário (somente admins). Usa SERVICE_ROLE para chamar Auth Admin API.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeadersFor, handleCorsPreflight, rejectIfDisallowedOrigin } from '../_shared/cors.ts';

type AppRole = 'admin' | 'advogado' | 'estagiario' | 'financeiro' | 'gerente';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Cliente "como o usuário" para descobrir quem é o requisitante
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Verifica se é admin
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: isAdminData, error: roleErr } = await admin.rpc('has_role', {
      _user_id: user.id, _role: 'admin',
    });
    if (roleErr || !isAdminData) {
      return new Response(JSON.stringify({ error: 'forbidden_admin_only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { email, password, role } = await req.json() as { email: string; password: string; role: AppRole };
    if (!email || !password || !role) {
      return new Response(JSON.stringify({ error: 'missing_fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (password.length < 8) {
      return new Response(JSON.stringify({ error: 'password_too_short' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Cria usuário já confirmado
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (createErr || !created.user) {
      return new Response(JSON.stringify({ error: createErr?.message ?? 'create_failed' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Atribui o papel
    const { error: rolErr } = await admin.from('user_roles').insert({ user_id: created.user.id, role });
    if (rolErr) {
      return new Response(JSON.stringify({ error: 'user_created_but_role_failed: ' + rolErr.message, user_id: created.user.id }), { status: 207, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true, user_id: created.user.id, email }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
