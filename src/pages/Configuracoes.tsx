import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { User, Lock, Bell, Building2, Save, Loader2, Shield, Mail, Phone, MapPin, Globe, Scale, RefreshCw, Plus, Trash2, CheckCircle2, XCircle, Cloud, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useUserRoles, type AppRole } from '@/hooks/useUserRole';

const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Administrador',
  gerente: 'Gerente',
  advogado: 'Advogado',
  estagiario: 'Estagiário',
  financeiro: 'Financeiro',
  assistente_adm: 'Assistente Administrativo',
  usuario: 'Usuário',
};

type Tab = 'perfil' | 'escritorio' | 'notificacoes' | 'intimacoes' | 'seguranca';

const EMPTY_ESCRITORIO = { nome: '', cnpj: '', endereco: '', cidade: '', estado: '', telefone: '', email: '', site: '' };
const EMPTY_NOTIFS = { vencimento_processo: true, nova_tarefa: true, tarefa_concluida: false, novo_cliente: false, fatura_vencida: true };

export default function Configuracoes() {
  const { user } = useAuth();
  const { data: roles = [] } = useUserRoles();
  const primaryRole = (roles[0] ?? 'usuario') as AppRole;
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('perfil');
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [perfil, setPerfil] = useState({ nome: '', email: user?.email ?? '', oab: '', telefone: '' });
  const [escritorio, setEscritorio] = useState(EMPTY_ESCRITORIO);
  const [notifs, setNotifs] = useState(EMPTY_NOTIFS);
  const [senhaForm, setSenhaForm] = useState({ nova: '', confirmar: '' });
  type OabRow = { id?: string; oab_number: string; oab_uf: string; active: boolean; last_sync_at: string | null; last_success_at?: string | null; consecutive_failures?: number; last_error?: string | null; lawyer_name?: string | null; name_variations?: string[]; name_match_threshold?: number };
  const [oabs, setOabs] = useState<OabRow[]>([]);
  const [newOab, setNewOab] = useState<OabRow>({ oab_number: '', oab_uf: 'SP', active: true, last_sync_at: null, lawyer_name: '', name_variations: [], name_match_threshold: 0.85 });
  const [syncing, setSyncing] = useState(false);

  // Proxy DJEN (Cloudflare Worker) — só admin enxerga
  const isAdmin = roles.includes('admin');
  const [proxyUrl, setProxyUrl] = useState('');
  const [proxyConfig, setProxyConfig] = useState<{ proxy_url: string | null; validated_at: string | null; last_status: string | null } | null>(null);
  const [proxyValidating, setProxyValidating] = useState(false);
  const [proxySaving, setProxySaving] = useState(false);
  const [proxyResult, setProxyResult] = useState<{ ok: boolean; message: string; latencyMs?: number; sample?: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    const meta = (user.user_metadata ?? {}) as Record<string, any>;
    setPerfil(p => ({
      ...p,
      email: user.email ?? p.email,
      nome: meta.full_name ?? meta.name ?? p.nome,
      oab: meta.oab ?? p.oab,
      telefone: meta.phone ?? meta.telefone ?? p.telefone,
    }));
  }, [user]);

  // Carrega escritório e notificações do banco
  useEffect(() => {
    if (!user?.id) return;
    let cancel = false;
    (async () => {
      setLoadingData(true);
      try {
        const [{ data: office }, { data: prefs }, { data: oabRows }] = await Promise.all([
          (supabase as any).from('office_settings').select('*').eq('user_id', user.id).maybeSingle(),
          (supabase as any).from('notification_preferences').select('*').eq('user_id', user.id).maybeSingle(),
          (supabase as any).from('oab_settings').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
        ]);
        if (oabRows) setOabs(oabRows.map((r: any) => ({ id: r.id, oab_number: r.oab_number, oab_uf: r.oab_uf, active: r.active, last_sync_at: r.last_sync_at, last_success_at: r.last_success_at, consecutive_failures: r.consecutive_failures, last_error: r.last_error, lawyer_name: r.lawyer_name ?? '', name_variations: r.name_variations ?? [], name_match_threshold: r.name_match_threshold ?? 0.85 })));
        if (cancel) return;
        if (office) {
          setEscritorio({
            nome: office.nome ?? '', cnpj: office.cnpj ?? '',
            endereco: office.endereco ?? '', cidade: office.cidade ?? '',
            estado: office.estado ?? '', telefone: office.telefone ?? '',
            email: office.email ?? '', site: office.site ?? '',
          });
        }
        if (prefs) {
          setNotifs({
            vencimento_processo: prefs.vencimento_processo,
            nova_tarefa: prefs.nova_tarefa,
            tarefa_concluida: prefs.tarefa_concluida,
            novo_cliente: prefs.novo_cliente,
            fatura_vencida: prefs.fatura_vencida,
          });
        }
      } catch (e) { console.error('config load:', e); }
      finally { if (!cancel) setLoadingData(false); }
    })();
    return () => { cancel = true; };
  }, [user?.id]);

  async function savePerfil() {
    setSaving(true);
    try {
      const { error: metaErr } = await supabase.auth.updateUser({
        data: {
          full_name: perfil.nome,
          oab: perfil.oab,
          phone: perfil.telefone,
        },
      });
      if (metaErr) throw metaErr;

      if (perfil.email !== user?.email) {
        const { error } = await supabase.auth.updateUser({ email: perfil.email });
        if (error) throw error;
        toast({ title: 'Perfil salvo! Verifique seu email para confirmar a alteração.' });
      } else {
        toast({ title: 'Perfil salvo!' });
      }
    } catch (e: any) { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  }

  async function saveEscritorio() {
    if (!user?.id) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from('office_settings')
        .upsert({ user_id: user.id, ...escritorio, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw error;
      toast({ title: 'Escritório salvo!' });
    } catch (e: any) { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  }

  async function saveNotifs() {
    if (!user?.id) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from('notification_preferences')
        .upsert({ user_id: user.id, ...notifs, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw error;
      toast({ title: 'Preferências salvas!' });
    } catch (e: any) { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  }

  async function changeSenha() {
    if (senhaForm.nova !== senhaForm.confirmar) { toast({ title: 'Senhas não conferem', variant: 'destructive' }); return; }
    if (senhaForm.nova.length < 6) { toast({ title: 'Senha deve ter ao menos 6 caracteres', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: senhaForm.nova });
      if (error) throw error;
      setSenhaForm({ nova: '', confirmar: '' });
      toast({ title: 'Senha alterada com sucesso!' });
    } catch (e: any) { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  }

  async function addOab() {
    if (!user?.id) return;
    const num = newOab.oab_number.trim();
    const uf = newOab.oab_uf.toUpperCase().trim();
    if (!num || uf.length !== 2) { toast({ title: 'Preencha número e UF (2 letras)', variant: 'destructive' }); return; }
    if (oabs.some(o => o.oab_number === num && o.oab_uf === uf)) {
      toast({ title: 'Esta OAB já está cadastrada', variant: 'destructive' }); return;
    }
    setSaving(true);
    try {
      const lawyerName = (newOab.lawyer_name || '').trim() || null;
      const variations = (newOab.name_variations || []).map(v => v.trim()).filter(Boolean);
      const { data, error } = await (supabase as any).from('oab_settings').insert({
        user_id: user.id, oab_number: num, oab_uf: uf, active: newOab.active,
        lawyer_name: lawyerName, name_variations: variations,
        name_match_threshold: newOab.name_match_threshold ?? 0.85,
      }).select().single();
      if (error) throw error;
      setOabs(prev => [...prev, { id: data.id, oab_number: data.oab_number, oab_uf: data.oab_uf, active: data.active, last_sync_at: data.last_sync_at, lawyer_name: data.lawyer_name, name_variations: data.name_variations ?? [], name_match_threshold: data.name_match_threshold ?? 0.85 }]);
      setNewOab({ oab_number: '', oab_uf: 'SP', active: true, last_sync_at: null, lawyer_name: '', name_variations: [], name_match_threshold: 0.85 });
      toast({ title: 'OAB adicionada!' });
    } catch (e: any) { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  }

  async function saveOabName(row: OabRow) {
    if (!row.id) return;
    const variations = (row.name_variations || []).map(v => v.trim()).filter(Boolean);
    const { error } = await (supabase as any).from('oab_settings').update({
      lawyer_name: (row.lawyer_name || '').trim() || null,
      name_variations: variations,
      name_match_threshold: row.name_match_threshold ?? 0.85,
      updated_at: new Date().toISOString(),
    }).eq('id', row.id);
    if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Nome do(a) advogado(a) salvo' });
  }

  async function toggleOabActive(row: OabRow) {
    if (!row.id) return;
    const next = !row.active;
    setOabs(prev => prev.map(o => o.id === row.id ? { ...o, active: next } : o));
    const { error } = await (supabase as any).from('oab_settings').update({ active: next, updated_at: new Date().toISOString() }).eq('id', row.id);
    if (error) {
      setOabs(prev => prev.map(o => o.id === row.id ? { ...o, active: !next } : o));
      toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
    }
  }

  async function removeOab(row: OabRow) {
    if (!row.id) return;
    if (!confirm(`Remover OAB ${row.oab_number}/${row.oab_uf}?`)) return;
    const { error } = await (supabase as any).from('oab_settings').delete().eq('id', row.id);
    if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
    setOabs(prev => prev.filter(o => o.id !== row.id));
    toast({ title: 'OAB removida' });
  }

  async function syncNow() {
    if (!user?.id) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-djen?manual=1', { body: {}, method: 'POST' });
      if (error) throw error;
      const totalInserted = (data?.results || []).reduce((s: number, r: any) => s + (r.inserted || 0), 0);
      const totalFound = (data?.results || []).reduce((s: number, r: any) => s + (r.total || 0), 0);
      toast({ title: 'Sincronização concluída', description: `${totalInserted} novas / ${totalFound} encontradas em ${(data?.results || []).length} OAB(s)` });
      const { data: oabRows } = await (supabase as any).from('oab_settings').select('*').eq('user_id', user.id).order('created_at', { ascending: true });
      if (oabRows) setOabs(oabRows.map((r: any) => ({ id: r.id, oab_number: r.oab_number, oab_uf: r.oab_uf, active: r.active, last_sync_at: r.last_sync_at, last_success_at: r.last_success_at, consecutive_failures: r.consecutive_failures, last_error: r.last_error, lawyer_name: r.lawyer_name ?? '', name_variations: r.name_variations ?? [], name_match_threshold: r.name_match_threshold ?? 0.85 })));
    } catch (e: any) { toast({ title: 'Erro ao sincronizar', description: e.message, variant: 'destructive' }); }
    finally { setSyncing(false); }
  }

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'perfil', label: 'Meu Perfil', icon: User },
    { id: 'escritorio', label: 'Escritório', icon: Building2 },
    { id: 'notificacoes', label: 'Notificações', icon: Bell },
    { id: 'intimacoes', label: 'Intimações (DJEN)', icon: Scale },
    { id: 'seguranca', label: 'Segurança', icon: Shield },
  ];

  return (
    <div className="p-6 space-y-6">
      <div><h1 className="text-2xl font-bold text-gray-900">Configurações</h1><p className="text-sm text-gray-500">Gerencie seu perfil e preferências</p></div>
      <div className="flex gap-6">
        <aside className="w-52 flex-shrink-0">
          <nav className="space-y-1">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setTab(id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${tab === id ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}>
                <Icon className="w-4 h-4" />{label}
              </button>
            ))}
          </nav>
        </aside>
        <div className="flex-1 bg-white rounded-xl border shadow-sm p-6">
          {tab === 'perfil' && (
            <div className="space-y-6">
              <div><h2 className="text-lg font-semibold">Meu Perfil</h2><p className="text-sm text-gray-400">Suas informações pessoais</p></div>
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center">
                  <span className="text-blue-600 font-bold text-xl">{(perfil.nome || user?.email || 'U').charAt(0).toUpperCase()}</span>
                </div>
                <div><p className="font-medium">{perfil.nome || user?.email}</p><Badge variant="outline" className="text-xs mt-1">{ROLE_LABELS[primaryRole]}</Badge></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Nome completo</Label><Input className="mt-1" placeholder="Dr. William Neves" value={perfil.nome} onChange={e => setPerfil(p => ({ ...p, nome: e.target.value }))} /></div>
                <div><Label>OAB</Label><Input className="mt-1" placeholder="OAB/XX 000000" value={perfil.oab} onChange={e => setPerfil(p => ({ ...p, oab: e.target.value }))} /></div>
                <div className="col-span-2"><Label>Email</Label><div className="relative mt-1"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><Input className="pl-9" value={perfil.email} onChange={e => setPerfil(p => ({ ...p, email: e.target.value }))} /></div></div>
                <div><Label>Telefone</Label><div className="relative mt-1"><Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><Input className="pl-9" placeholder="(45) 99999-9999" value={perfil.telefone} onChange={e => setPerfil(p => ({ ...p, telefone: e.target.value }))} /></div></div>
              </div>
              <Button onClick={savePerfil} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}Salvar Perfil</Button>
            </div>
          )}
          {tab === 'escritorio' && (
            <div className="space-y-6">
              <div><h2 className="text-lg font-semibold">Dados do Escritório</h2><p className="text-sm text-gray-400">Informações do escritório de advocacia</p></div>
              {loadingData ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2"><Label>Nome do escritório</Label><div className="relative mt-1"><Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><Input className="pl-9" value={escritorio.nome} onChange={e => setEscritorio(s => ({ ...s, nome: e.target.value }))} /></div></div>
                    <div><Label>CNPJ</Label><Input className="mt-1" placeholder="00.000.000/0001-00" value={escritorio.cnpj} onChange={e => setEscritorio(s => ({ ...s, cnpj: e.target.value }))} /></div>
                    <div><Label>Telefone</Label><div className="relative mt-1"><Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><Input className="pl-9" value={escritorio.telefone} onChange={e => setEscritorio(s => ({ ...s, telefone: e.target.value }))} /></div></div>
                    <div className="col-span-2"><Label>Endereço</Label><div className="relative mt-1"><MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><Input className="pl-9" value={escritorio.endereco} onChange={e => setEscritorio(s => ({ ...s, endereco: e.target.value }))} /></div></div>
                    <div><Label>Cidade</Label><Input className="mt-1" value={escritorio.cidade} onChange={e => setEscritorio(s => ({ ...s, cidade: e.target.value }))} /></div>
                    <div><Label>Estado</Label><Input className="mt-1" value={escritorio.estado} onChange={e => setEscritorio(s => ({ ...s, estado: e.target.value }))} /></div>
                    <div><Label>Email</Label><div className="relative mt-1"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><Input className="pl-9" value={escritorio.email} onChange={e => setEscritorio(s => ({ ...s, email: e.target.value }))} /></div></div>
                    <div><Label>Site</Label><div className="relative mt-1"><Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><Input className="pl-9" value={escritorio.site} onChange={e => setEscritorio(s => ({ ...s, site: e.target.value }))} /></div></div>
                  </div>
                  <Button onClick={saveEscritorio} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}Salvar Escritório</Button>
                </>
              )}
            </div>
          )}
          {tab === 'notificacoes' && (
            <div className="space-y-6">
              <div><h2 className="text-lg font-semibold">Notificações</h2><p className="text-sm text-gray-400">Configure quais alertas deseja receber</p></div>
              {loadingData ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                <>
                  <div className="space-y-4">
                    {[
                      { key: 'vencimento_processo', label: 'Vencimento de prazo processual', desc: 'Alerta quando um processo tem prazo próximo' },
                      { key: 'nova_tarefa', label: 'Nova tarefa atribuída', desc: 'Alerta quando uma nova tarefa é criada' },
                      { key: 'tarefa_concluida', label: 'Tarefa concluída', desc: 'Notificação quando tarefa é marcada como concluída' },
                      { key: 'novo_cliente', label: 'Novo cliente cadastrado', desc: 'Alerta quando novo cliente é adicionado' },
                      { key: 'fatura_vencida', label: 'Fatura em atraso', desc: 'Alerta sobre faturas com vencimento ultrapassado' },
                    ].map(({ key, label, desc }) => (
                      <div key={key} className="flex items-start justify-between p-4 border rounded-lg hover:bg-gray-50">
                        <div><p className="font-medium text-sm">{label}</p><p className="text-xs text-gray-400 mt-0.5">{desc}</p></div>
                        <button onClick={() => setNotifs(n => ({ ...n, [key]: !n[key as keyof typeof notifs] }))} className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${notifs[key as keyof typeof notifs] ? 'bg-blue-600' : 'bg-gray-200'}`}>
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${notifs[key as keyof typeof notifs] ? 'translate-x-4' : 'translate-x-0'}`} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <Button onClick={saveNotifs} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}Salvar Preferências</Button>
                </>
              )}
            </div>
          )}
          {tab === 'intimacoes' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">Intimações automáticas (DJEN/CNJ)</h2>
                <p className="text-sm text-gray-400">Cadastre sua OAB para receber intimações de todos os tribunais automaticamente. Fonte oficial gratuita do CNJ. Sincroniza a cada 6h.</p>
              </div>
              {/* Lista de OABs cadastradas */}
              <div className="space-y-2">
                {oabs.length === 0 && <p className="text-sm text-gray-500 italic">Nenhuma OAB cadastrada ainda.</p>}
                {oabs.map((row) => {
                  const failures = row.consecutive_failures || 0;
                  const hoursSinceSuccess = row.last_success_at ? (Date.now() - new Date(row.last_success_at).getTime()) / 3_600_000 : null;
                  const isHealthy = failures === 0 && (hoursSinceSuccess === null || hoursSinceSuccess < 12);
                  const isWarning = failures === 1 || (hoursSinceSuccess !== null && hoursSinceSuccess >= 12 && hoursSinceSuccess < 24);
                  const isCritical = failures >= 2 || (hoursSinceSuccess !== null && hoursSinceSuccess >= 24);
                  const statusColor = !row.active ? 'bg-gray-400' : isCritical ? 'bg-red-500' : isWarning ? 'bg-yellow-500' : 'bg-green-500';
                  const statusLabel = !row.active ? 'Inativa' : isCritical ? `${failures} falha(s)` : isWarning ? 'Atrasada' : 'Saudável';
                  return (
                    <div key={row.id} className={`p-3 border rounded-lg ${isCritical && row.active ? 'border-red-300 bg-red-50/50' : 'hover:bg-gray-50'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <Scale className="w-4 h-4 text-blue-600" />
                            <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${statusColor}`} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm">OAB/{row.oab_uf} {row.oab_number}</p>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full text-white ${statusColor}`}>{statusLabel}</span>
                            </div>
                            {row.last_success_at && <p className="text-xs text-gray-500">Última sync OK: {new Date(row.last_success_at).toLocaleString('pt-BR')}</p>}
                            {row.active && isCritical && row.last_error && (
                              <p className="text-xs text-red-600 mt-0.5 truncate max-w-md" title={row.last_error}>⚠️ {row.last_error}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button onClick={() => toggleOabActive(row)} className={`relative inline-flex h-5 w-9 rounded-full ${row.active ? 'bg-blue-600' : 'bg-gray-200'}`}>
                            <span className={`inline-block h-4 w-4 mt-0.5 transform rounded-full bg-white shadow transition-transform ${row.active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                          </button>
                          <Button variant="ghost" size="sm" onClick={() => removeOab(row)} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      {/* Filtro por nome do(a) advogado(a) */}
                      <div className="mt-3 pt-3 border-t border-dashed grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Nome do(a) advogado(a)</Label>
                          <Input className="mt-1 h-8 text-sm" placeholder="Ex: William Robson das Neves"
                            value={row.lawyer_name ?? ''}
                            onChange={e => setOabs(prev => prev.map(o => o.id === row.id ? { ...o, lawyer_name: e.target.value } : o))} />
                        </div>
                        <div>
                          <Label className="text-xs">Variações (separe por vírgula)</Label>
                          <Input className="mt-1 h-8 text-sm" placeholder="Willian Robson das Neves, W. R. das Neves"
                            value={(row.name_variations ?? []).join(', ')}
                            onChange={e => setOabs(prev => prev.map(o => o.id === row.id ? { ...o, name_variations: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } : o))} />
                        </div>
                        <div className="md:col-span-2 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 text-xs text-gray-600">
                            <span>Tolerância:</span>
                            <input type="range" min={0.7} max={0.98} step={0.01}
                              value={row.name_match_threshold ?? 0.85}
                              onChange={e => setOabs(prev => prev.map(o => o.id === row.id ? { ...o, name_match_threshold: parseFloat(e.target.value) } : o))} />
                            <span className="tabular-nums w-10">{((row.name_match_threshold ?? 0.85) * 100).toFixed(0)}%</span>
                            <span className="text-gray-400">(maior = mais estrito)</span>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => saveOabName(row)}>Salvar nome</Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Adicionar nova OAB */}
              <div className="border-t pt-4 space-y-3">
                <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2"><Plus className="w-4 h-4" />Adicionar inscrição OAB</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <Label>Número OAB</Label>
                    <Input className="mt-1" placeholder="Ex: 290702" value={newOab.oab_number}
                      onChange={e => setNewOab(o => ({ ...o, oab_number: e.target.value.replace(/\D/g, '') }))} />
                  </div>
                  <div>
                    <Label>UF</Label>
                    <Input className="mt-1" maxLength={2} placeholder="SP" value={newOab.oab_uf}
                      onChange={e => setNewOab(o => ({ ...o, oab_uf: e.target.value.toUpperCase() }))} />
                  </div>
                </div>
                <div>
                  <Label>Nome completo do(a) advogado(a) <span className="text-xs text-gray-500">(opcional, recomendado)</span></Label>
                  <Input className="mt-1" placeholder="Ex: William Robson das Neves" value={newOab.lawyer_name ?? ''}
                    onChange={e => setNewOab(o => ({ ...o, lawyer_name: e.target.value }))} />
                  <p className="text-xs text-gray-500 mt-1">Filtra publicações por nome no DJEN com tolerância a typos (ex: "Willian" casa com "William"). Evita publicações de outros advogados.</p>
                </div>
                <div>
                  <Label>Variações do nome <span className="text-xs text-gray-500">(opcional, separe por vírgula)</span></Label>
                  <Input className="mt-1" placeholder="Ex: William R. das Neves, W. R. das Neves"
                    value={(newOab.name_variations ?? []).join(', ')}
                    onChange={e => setNewOab(o => ({ ...o, name_variations: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))} />
                </div>
                <div className="flex gap-2">
                  <Button onClick={addOab} disabled={saving || !newOab.oab_number.trim() || newOab.oab_uf.length !== 2}>
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}Adicionar OAB
                  </Button>
                  <Button variant="outline" onClick={syncNow} disabled={syncing || oabs.filter(o => o.active).length === 0}>
                    {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}Sincronizar todas
                  </Button>
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
                <strong>Sobre AASP:</strong> integração via scraping não foi implementada por risco de bloqueio da conta. O DJEN do CNJ cobre as mesmas intimações eletrônicas que a AASP repassa, oficialmente e sem custo.
              </div>
            </div>
          )}
          {tab === 'seguranca' && (
            <div className="space-y-6">
              <div><h2 className="text-lg font-semibold">Segurança</h2><p className="text-sm text-gray-400">Gerencie sua senha e segurança da conta</p></div>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-gray-400" /><span className="text-gray-600">Email:</span><span className="font-medium">{user?.email}</span></div>
                <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-gray-400" /><span className="text-gray-600">Método:</span><Badge variant="outline" className="text-xs">Email + Senha</Badge></div>
              </div>
              <div className="space-y-4">
                <h3 className="font-medium text-gray-700 flex items-center gap-2"><Lock className="w-4 h-4" />Alterar Senha</h3>
                <div className="grid gap-3">
                  <div><Label>Nova senha</Label><Input type="password" className="mt-1" placeholder="Mínimo 6 caracteres" value={senhaForm.nova} onChange={e => setSenhaForm(f => ({ ...f, nova: e.target.value }))} /></div>
                  <div><Label>Confirmar nova senha</Label><Input type="password" className="mt-1" value={senhaForm.confirmar} onChange={e => setSenhaForm(f => ({ ...f, confirmar: e.target.value }))} /></div>
                </div>
                <Button onClick={changeSenha} disabled={saving || !senhaForm.nova || !senhaForm.confirmar} variant="outline">
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}Alterar Senha
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
