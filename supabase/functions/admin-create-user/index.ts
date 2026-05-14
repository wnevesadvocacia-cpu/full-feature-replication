// Cria um novo usuário (somente admins). Usa SERVICE_ROLE para chamar Auth Admin API.
// S13: CORS allowlist.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeadersFor, handleCorsPreflight, rejectIfDisallowedOrigin } from '../_shared/cors.ts';
import { rejectIfCsrfBlocked } from '../_shared/csrf.ts';
import { captureException } from '../_shared/sentry.ts';

type AppRole = 'admin' | 'gerente' | 'advogado' | 'estagiario' | 'financeiro' | 'usuario' | 'assistente_adm';

const VALID_ROLES: AppRole[] = ['admin', 'gerente', 'advogado', 'estagiario', 'financeiro', 'usuario', 'assistente_adm'];

async function findUserByEmail(admin: ReturnType<typeof createClient>, email: string) {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === target);
    if (found) return found;
    if (data.users.length < 1000) return null;
  }
  return null;
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const blocked = rejectIfDisallowedOrigin(req);
  if (blocked) return blocked;
  const cors = corsHeadersFor(req);
  // S12: defense-in-depth CSRF — Sec-Fetch-Site/Origin/Referer
  const csrfBlock = rejectIfCsrfBlocked(req, cors);
  if (csrfBlock) return csrfBlock;

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: isAdminData, error: roleErr } = await admin.rpc('has_role', {
      _user_id: user.id, _role: 'admin',
    });
    if (roleErr || !isAdminData) {
      return new Response(JSON.stringify({ error: 'forbidden_admin_only' }), {
        status: 403, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const { email, password, role } = await req.json() as { email: string; password: string; role: AppRole };
    if (!email || !password || !role) {
      return new Response(JSON.stringify({ error: 'missing_fields' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!VALID_ROLES.includes(role)) {
      return new Response(JSON.stringify({ error: 'invalid_role' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    if (password.length < 12) {
      // S1: alinhado com password_min_length=12
      return new Response(JSON.stringify({ error: 'password_too_short_min_12' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: normalizedEmail, password, email_confirm: true,
    });
    let targetUser = created.user;
    let existed = false;
    if (createErr || !targetUser) {
      const alreadyExists = createErr?.message?.toLowerCase().includes('already') || createErr?.message?.toLowerCase().includes('registered');
      if (!alreadyExists) {
        return new Response(JSON.stringify({ error: createErr?.message ?? 'create_failed' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
      targetUser = await findUserByEmail(admin, normalizedEmail);
      existed = true;
      if (!targetUser) {
        return new Response(JSON.stringify({ error: 'email_already_registered_but_user_not_found' }), {
          status: 409, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
    }

    const { error: rolErr } = await admin.from('user_roles').upsert(
      { user_id: targetUser.id, role },
      { onConflict: 'user_id,role', ignoreDuplicates: true },
    );
    if (rolErr) {
      return new Response(JSON.stringify({ error: 'user_created_but_role_failed: ' + rolErr.message, user_id: targetUser.id }), {
        status: 207, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, user_id: targetUser.id, email: normalizedEmail, existed }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    await captureException(e, { fn: 'admin-create-user' });
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
