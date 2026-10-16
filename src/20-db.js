/* ======================================================================
   Camada de dados
   - No portal: window.claude.use('db') (adaptador claude-db → Supabase)
   - Fora do portal: LocalDB em localStorage, mesma interface, com aviso.
   Interface usada (subconjunto do adaptador):
     DB.collection(c).add(obj) / .get() / .onSnapshot(cb, err) / .orderBy(f,dir) / .limit(n)
     DB.doc('c/id').set(obj) / .update(patch) / .delete() / .get() / .onSnapshot(cb, err)
     snapshot: .docs[] (id, data()), .exists, .data(), .docChanges()
   ====================================================================== */
const COLECOES = { rodadas:'rodadas', evidencias:'evidencias', verificacoes:'verificacoes', meta:'meta', bi:'bi_base', historico:'historico', solicitacoes:'solicitacoes', carteira:'carteira', perfis:'perfis', vistos:'vistos' };

function LocalDB(prefixo){
  const KEY = prefixo || 'myblue_espolio_local';
  const load = () => { try{ return JSON.parse(localStorage.getItem(KEY) || '{}'); }catch(_){ return {}; } };
  const save = d => { try{ localStorage.setItem(KEY, JSON.stringify(d)); }catch(e){ console.warn('LocalDB: não gravou', e); } };
  const ouvintes = [];
  const notificar = () => ouvintes.forEach(fn => { try{ fn(); }catch(e){ console.error(e); } });
  const snapDoc = (id, data) => ({ id, exists: data !== undefined, data: () => data === undefined ? undefined : JSON.parse(JSON.stringify(data)) });
  const col = (nome, ord, lim) => ({
    add(obj){ const d = load(); d[nome] = d[nome] || {}; const id = uid(); d[nome][id] = JSON.parse(JSON.stringify(obj)); save(d); notificar(); return Promise.resolve({ id }); },
    orderBy(f, dir){ return col(nome, {f, dir: dir || 'asc'}, lim); },
    limit(n){ return col(nome, ord, n); },
    _snap(){
      const d = load(); let docs = Object.entries(d[nome] || {}).map(([id, v]) => snapDoc(id, v));
      if(ord){ docs.sort((a,b) => { const x = a.data()[ord.f], y = b.data()[ord.f]; return (x > y ? 1 : x < y ? -1 : 0) * (ord.dir === 'desc' ? -1 : 1); }); }
      if(lim) docs = docs.slice(0, lim);
      return { docs, docChanges: () => docs.map(doc => ({ type:'added', doc })) };
    },
    get(){ return Promise.resolve(this._snap()); },
    onSnapshot(cb){ const fn = () => cb(this._snap()); ouvintes.push(fn); setTimeout(fn, 0); return () => { const i = ouvintes.indexOf(fn); if(i >= 0) ouvintes.splice(i,1); }; }
  });
  const doc = path => {
    const [nome, id] = path.split('/');
    return {
      set(obj){ const d = load(); d[nome] = d[nome] || {}; d[nome][id] = JSON.parse(JSON.stringify(obj)); save(d); notificar(); return Promise.resolve(); },
      update(patch){ const d = load(); if(!d[nome] || !d[nome][id]) return Promise.reject(Object.assign(new Error('not found'), {code:'not_found'})); Object.assign(d[nome][id], JSON.parse(JSON.stringify(patch))); save(d); notificar(); return Promise.resolve(); },
      delete(){ const d = load(); if(d[nome]) delete d[nome][id]; save(d); notificar(); return Promise.resolve(); },
      get(){ const d = load(); return Promise.resolve(snapDoc(id, (d[nome]||{})[id])); },
      onSnapshot(cb){ const fn = () => { const d = load(); cb(snapDoc(id, (d[nome]||{})[id])); }; ouvintes.push(fn); setTimeout(fn, 0); return () => {}; }
    };
  };
  return { collection: nome => col(nome), doc, _local: true, _dump: load, _restore: d => { save(d); notificar(); } };
}

function dbErr(e){
  const c = e && e.code;
  if(c === 'quota_exceeded') return 'A base atingiu o limite de armazenamento. Avise o responsável pelo portal.';
  if(c === 'resource_exhausted') return 'Muitas operações seguidas. Aguarde alguns segundos e tente de novo.';
  if(c === 'revoked') return 'Seu acesso a esta base foi retirado. Recarregue a página.';
  if(c === 'permission_denied' || c === 'invalid_argument') return 'Você não tem permissão para gravar nesta base.';
  return 'Falha ao acessar a base: ' + ((e && e.message) || e || 'erro desconhecido');
}

let DB = null, NS_USER = null, ME = { id:null, name:'' }, CAN_WRITE = true;
/* Papéis (mesma funcionalidade do módulo Comissões de Novos Condomínios)
   - cada pessoa que abre o módulo é registrada em vistos/{id} (nome e último acesso);
   - a gestão marca os papéis de cada uma na aba Acessos: perfis/{id} = { papeis: ['gestao'|'implantacao'|'avulso'], nomeCarteira };
   - enquanto ninguém tiver o papel de gestão, todos que abrem o módulo veem todas as abas;
   - fora do portal não há usuários: todas as abas ficam liberadas neste navegador;
   - quem não tem papel vê o aviso para pedir acesso à gestão. */
const PAPEIS = { gestao: 'Gestão', implantacao: 'Implantação', avulso: 'Solicitante avulso' };
function papeis(){
  if(DB && DB._local){
    const v = localStorage.getItem('myblue_espolio_papeis');   // só para testes locais: lista separada por vírgula
    if(v !== null){ const pp = v.split(',').filter(Boolean); return { gestao: pp.includes('gestao'), implantacao: pp.includes('implantacao'), avulso: pp.includes('avulso') }; }
    return { gestao: true, implantacao: true, avulso: true, livre: true };
  }
  const temGestor = Object.values(S.perfis || {}).some(p => (p.papeis || []).includes('gestao'));
  if(!temGestor) return { gestao: true, implantacao: true, avulso: true, livre: true, semGestor: true };
  const pp = ((S.perfis || {})[String(ME.id)] || {}).papeis || [];
  return { gestao: pp.includes('gestao'), implantacao: pp.includes('implantacao'), avulso: pp.includes('avulso') };
}
const ehGestao = () => papeis().gestao;
function abasPermitidas(){
  const p = papeis(), a = [];
  if(p.gestao) a.push('dash', 'sol');
  if(p.implantacao || p.avulso) a.push('pedir', 'minhas');
  if(p.gestao) a.push('lote', 'acessos', 'conf');
  return a;
}
/* registra o acesso (uma vez por dia por pessoa) */
async function registrarVisto(){
  if(!DB || DB._local || ME.id === null || ME.id === undefined) return;
  const ant = (S.vistos || {})[String(ME.id)];
  if(ant && ant.nome === ME.name && String(ant.em || '').slice(0,10) === hojeISO()) return;
  try{ await DB.doc(COLECOES.vistos + '/' + String(ME.id)).set({ id: String(ME.id), nome: ME.name || '', em: nowISO() }); }catch(e){ console.warn('acesso não registrado', e); }
}

async function conectarBase(){
  const sync = $('#sync');
  const cl = window.claude;
  if(cl && cl.use){
    try{ [DB, NS_USER] = await Promise.all([cl.use('db'), cl.use('user')]); }catch(e){ DB = null; }
    if(!DB){ sync.className = 'sync err'; sync.innerHTML = '<i></i>Sem acesso à base'; throw new Error('Não foi possível conectar à base compartilhada. Confirme seu acesso no portal e recarregue a página.'); }
    if(NS_USER){ try{ ME = await NS_USER.me() || ME; CAN_WRITE = await NS_USER.can('data.write'); }catch(_){} }
    sync.className = 'sync on'; sync.innerHTML = '<i></i>Base compartilhada · ao vivo';
  } else {
    DB = LocalDB();
    sync.className = 'sync local'; sync.innerHTML = '<i></i>Modo local · só neste navegador';
    ME = { id:'local', name: localStorage.getItem('myblue_espolio_nome') || 'Coordenação de Cobrança' };
    $('#confLocalAviso').innerHTML = '<div class="aviso">Esta página está aberta fora do portal MyBlue. Os dados ficam só neste navegador. Para a base compartilhada, abra pelo portal.</div>';
  }
  const chip = $('#chipUsuario');
  if(ME.name){ chip.textContent = ME.name + (CAN_WRITE ? '' : ' · somente leitura'); chip.hidden = false; }
}
function atualizarChipPerfil(){
  const chip = $('#chipUsuario'), p = papeis();
  const rot = p.livre ? '' : (Object.keys(PAPEIS).filter(k => p[k]).map(k => PAPEIS[k].toLowerCase()).join(' · ') || 'sem papel');
  chip.textContent = (ME.name || 'Usuário') + (rot ? ' · ' + rot : '') + (CAN_WRITE ? '' : ' · somente leitura');
  chip.hidden = false;
}

/* grava com update; se o doc não existe, set */
async function gravarDoc(path, patch, base){
  const ref = DB.doc(path);
  try{ await ref.update(patch); }
  catch(e){ await ref.set({ ...(base || {}), ...patch }); }
}
function registrarHistorico(tipo, detalhe){
  try{ DB.collection(COLECOES.historico).add({ tipo, quando: nowISO(), por: ME.id, porNome: ME.name, ...(detalhe || {}) }); }catch(e){ console.warn(e); }
}
