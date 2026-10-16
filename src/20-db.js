/* ======================================================================
   Camada de dados
   - No portal: window.claude.use('db') (adaptador claude-db → Supabase)
   - Fora do portal: LocalDB em localStorage, mesma interface, com aviso.
   Interface usada (subconjunto do adaptador):
     DB.collection(c).add(obj) / .get() / .onSnapshot(cb, err) / .orderBy(f,dir) / .limit(n)
     DB.doc('c/id').set(obj) / .update(patch) / .delete() / .get() / .onSnapshot(cb, err)
     snapshot: .docs[] (id, data()), .exists, .data(), .docChanges()
   ====================================================================== */
const COLECOES = { rodadas:'rodadas', evidencias:'evidencias', verificacoes:'verificacoes', meta:'meta', bi:'bi_base', historico:'historico', solicitacoes:'solicitacoes', carteira:'carteira' };

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
/* perfil: 'gestao' (coordenação de Cobrança) ou 'solicitante' (implantação e analistas de Cobrança) */
let PERFIL = 'gestao';
const GESTAO_PADRAO = ['BEATRIZ TEIXEIRA'];
function calcularPerfil(acesso){
  const lista = (acesso && acesso.gestao && acesso.gestao.length) ? acesso.gestao : GESTAO_PADRAO.map(n => ({ nome: n }));
  const euId = ME.id === null || ME.id === undefined ? '' : String(ME.id);
  const euNome = normNome(ME.name);
  const sou = lista.some(g => (g.id !== undefined && g.id !== null && String(g.id) === euId && euId !== '' && euId !== 'local') || (g.nome && normNome(g.nome) === euNome));
  if(DB && DB._local) return localStorage.getItem('myblue_espolio_perfil') === 'solicitante' ? 'solicitante' : 'gestao';
  return sou ? 'gestao' : 'solicitante';
}
const ehGestao = () => PERFIL === 'gestao';

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
  const chip = $('#chipUsuario');
  const local = DB && DB._local;
  chip.innerHTML = esc(ME.name || 'Usuário') + ' · ' + (ehGestao() ? 'gestão' : 'solicitante') + (CAN_WRITE ? '' : ' · somente leitura')
    + (local ? ` <button class="link" id="chipTrocar" style="margin-left:6px">ver como ${ehGestao() ? 'solicitante' : 'gestão'}</button>` : '');
  chip.hidden = false;
  if(local) $('#chipTrocar').onclick = () => { localStorage.setItem('myblue_espolio_perfil', ehGestao() ? 'solicitante' : 'gestao'); PERFIL = calcularPerfil(S.acesso); atualizarChipPerfil(); aplicarPerfil(); renderTudo(); };
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
