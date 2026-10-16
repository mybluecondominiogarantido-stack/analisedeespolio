/* ======================================================================
   Estado, assinaturas e operações sobre rodadas
   Rodada: { id, protocolo, tipo, origem, condominio:{nome,cnpj,chave}, dataAnalise, analista, idadeGarantia,
             bi:{valor,sinal}|null, semAnterior, semBi, nota, status:'rascunho'|'concluida',
             vouch:{corte, emissao, totalTaxas, totalUnidades, lidas, conferido}|null,
             unidades:[{id, unid, titular, cpf, obs, override, motivoAjuste, manual:{vouch,ant}, esc:{vouch,ant},
                        cas:{vouch:{nome,unid,modo}|null, ant:…}, vouch:n|null, ant:n|null, resultado, regra, motivo,
                        situacao:'ativa'|'excluida'|'encerrada', encerramento:{motivo,data}|null, completar:bool}],
             anterior: rodadaId|null, proximaReanalise, criadaEm, criadoPor, concluidaEm }
   Evidências (texto dos PDFs e devedores lidos) ficam em evidencias/{rodadaId}.
   ====================================================================== */
const S = {
  rodadas: [],          // todas as rodadas (snapshot)
  verificacoes: [],
  meta: { seq: {} },
  acesso: { ticketRota: '/api/tickets', ticketSetor: 'Crédito' },
  bi: { base: [], enviadoEm: '', por: '' },
  solicitacoes: [],
  carteira: { itens: [], atualizadoEm: '', origem: '' },
  perfis: {}, vistos: {},
  pronto: { r:false, v:false, m:false, b:false, a:false, s:false, c:false, p:false, w:false },
  aba: 'dash',
  // editor (nova análise)
  rodada: null,         // rodada em edição (objeto)
  dev: { vouch: [], ant: [] },   // devedores lidos (da evidência)
  textos: { vouch:'', ant:'', email:'' },
  lote: { selecionados: new Set(), itens: [] }   // itens: {arquivo, leitura, condominio, rodada, dev}
};

function assinarBase(){
  const fail = e => { $('#sync').className = 'sync err'; $('#sync').innerHTML = '<i></i>Desconectado'; toast(dbErr(e), 6000); };
  const pronto = k => { S.pronto[k] = true; if(Object.values(S.pronto).every(Boolean)) renderTudo(); };
  DB.collection(COLECOES.rodadas).onSnapshot(snap => { S.rodadas = snap.docs.map(d => ({ id: d.id, ...d.data() })); pronto('r'); if(S.pronto.r) renderTudo(); }, fail);
  DB.collection(COLECOES.verificacoes).onSnapshot(snap => { S.verificacoes = snap.docs.map(d => ({ id: d.id, ...d.data() })); pronto('v'); if(S.pronto.v) renderTudo(); }, fail);
  DB.doc(COLECOES.meta + '/estado').onSnapshot(snap => { S.meta = snap.exists ? snap.data() : { seq: {} }; pronto('m'); }, fail);
  DB.doc(COLECOES.bi + '/atual').onSnapshot(snap => { S.bi = snap.exists ? snap.data() : { base: [], enviadoEm:'', por:'' }; pronto('b'); renderBiInfo(); }, fail);
  DB.doc(COLECOES.meta + '/acesso').onSnapshot(snap => { S.acesso = { ticketRota: '/api/tickets', ticketSetor: 'Crédito', ...(snap.exists ? snap.data() : {}) }; pronto('a'); if(S.pronto.a) renderTudo(); }, fail);
  DB.collection(COLECOES.perfis).onSnapshot(snap => { const m = {}; snap.docs.forEach(d => { m[d.id] = { id: d.id, ...d.data() }; }); S.perfis = m; pronto('p'); if(S.pronto.p) renderTudo(); }, fail);
  DB.collection(COLECOES.vistos).onSnapshot(snap => { const m = {}; snap.docs.forEach(d => { m[d.id] = { id: d.id, ...d.data() }; }); S.vistos = m; const primeira = !S.pronto.w; pronto('w'); if(primeira) registrarVisto(); if(S.pronto.w) renderTudo(); }, fail);
  DB.collection(COLECOES.solicitacoes).onSnapshot(snap => { S.solicitacoes = snap.docs.map(d => ({ id: d.id, ...d.data() })); pronto('s'); if(S.pronto.s) renderTudo(); }, fail);
  DB.doc(COLECOES.carteira + '/atual').onSnapshot(snap => { const d = snap.exists ? snap.data() : { itens: [], atualizadoEm:'', origem:'' }; S.carteira = { ...d, itens: normalizarCarteira(d.itens || []) }; pronto('c'); if(S.pronto.c) renderTudo(); }, fail);
}

/* ---------- solicitações ----------
   { condominio:{nome,cnpj,chave}, origem: papel de quem pediu ('implantacao'|'avulso'|'gestao'), tipo:'implantacao'|'avulso', unidades:[{unid,titular,cpf}], obs,
     solicitanteId, solicitanteNome, criadaEm, status:'nova'|'vista'|'em_analise'|'concluida'|'devolvida', vistaEm, rodadaId, protocolo,
     resultado:[{unid,titular,resultado,regra}], motivoDevolucao, concluidaEm } */
const solicitacoesNovas = () => S.solicitacoes.filter(x => x.status === 'nova');
const minhasSolicitacoes = () => S.solicitacoes.filter(x => String(x.solicitanteId) === String(ME.id)).sort((a,b) => (b.criadaEm||'').localeCompare(a.criadaEm||''));
/* o protocolo nasce na solicitação e acompanha a análise até a ficha (excluídas e devolvidas deixam o número sem uso) */
async function criarSolicitacao(dados){
  const protocolo = await proximoProtocolo();
  const doc = { ...dados, solicitanteId: ME.id, solicitanteNome: ME.name, criadaEm: nowISO(), status: 'nova', vistaEm: null, rodadaId: null, protocolo, resultado: [], motivoDevolucao: '' };
  const ref = await DB.collection(COLECOES.solicitacoes).add(doc);
  registrarHistorico('solicitacao', { solicitacaoId: ref.id, protocolo, condominio: dados.condominio.nome, unidades: dados.unidades.length });
  return { id: ref.id, protocolo };
}
const atualizarSolicitacao = (id, patch) => gravarDoc(COLECOES.solicitacoes + '/' + id, patch);

/* ---------- verificação da implantação (quadro do papel Implantação) ----------
   Entram os condomínios da carteira com vigência (início do contrato) no mês atual e os de meses anteriores,
   a partir de VERIFICACAO_DESDE, que ainda não foram verificados: sem "sem espólio" registrado, sem solicitação e sem rodada.
   Os de meses anteriores acumulam como atrasados. */
const VERIFICACAO_DESDE = '2026-08';
function pendentesVerificacao(){
  const mesAtual = mesDe(hojeISO());
  const respondidos = new Set(S.verificacoes.filter(v => v.resultado === 'sem_espolio').map(v => v.chave).filter(Boolean));
  const comRodada = new Set(S.rodadas.map(r => r.condominio.chave));
  const comSolic = new Set(S.solicitacoes.map(x => x.condominio.chave));
  const hoje = hojeISO();
  return (S.carteira.itens || []).filter(c => c.inicio && c.situacao !== 'DISTRATADO' && mesDe(c.inicio) >= VERIFICACAO_DESDE && mesDe(c.inicio) <= mesAtual)
    .filter(c => !respondidos.has(c.chave) && !comRodada.has(c.chave) && !comSolic.has(c.chave) && !respondidos.has('nome:' + normCond(c.nome)))
    .map(c => ({ ...c, atrasado: mesDe(c.inicio) < mesAtual, dias: diasEntre(c.inicio, hoje), assumido: (S.verificacoes.find(v => v.chave === c.chave && v.resultado === 'assumido') || null) }))
    .sort((a,b) => a.inicio.localeCompare(b.inicio) || a.nome.localeCompare(b.nome, 'pt-BR'));
}
/* responsável pelo aviso/ticket: assistente de crédito da carteira; senão a assistente de implantação que solicitou */
function responsavelDoCondominio(chave, solicitacao){
  const c = (S.carteira.itens || []).find(x => x.chave === chave || (solicitacao && normCond(x.nome) === normCond(solicitacao.condominio.nome)));
  const loginDe = nome => { const p = Object.values(S.perfis || {}).find(x => x.nomeCarteira && normNome(x.nomeCarteira) === normNome(nome)) || Object.values(S.vistos || {}).find(v => normNome(v.nome) === normNome(nome)); return p ? p.id : null; };
  if(c && c.assistenteCredito) return { nome: c.assistenteCredito, papel: 'assistente de crédito', setor: S.acesso.ticketSetor || 'Crédito', usuarioId: loginDe(c.assistenteCredito), carteira: c };
  if(solicitacao && solicitacao.tipo !== 'avulso') return { nome: solicitacao.solicitanteNome, papel: 'assistente de implantação (solicitante)', setor: 'Implantação', usuarioId: solicitacao.solicitanteId, carteira: c || null };
  return { nome: '', papel: '', setor: S.acesso.ticketSetor || 'Crédito', carteira: c || null };
}

/* ---------- protocolo sequencial AE-AAAA-NNNN ---------- */
async function proximoProtocolo(ano){
  ano = ano || hojeISO().slice(0,4);
  const ref = DB.doc(COLECOES.meta + '/estado');
  const snap = await ref.get();
  const meta = snap.exists ? snap.data() : { seq: {} };
  meta.seq = meta.seq || {};
  const n = (meta.seq[ano] || 0) + 1;
  meta.seq[ano] = n;
  await ref.set(meta);
  S.meta = meta;
  return `AE-${ano}-${String(n).padStart(4,'0')}`;
}

/* ---------- derivadas ---------- */
const rodadasConcluidas = () => S.rodadas.filter(r => r.status === 'concluida');
function ultimaRodadaPorCondominio(){
  const mapa = new Map();
  rodadasConcluidas().forEach(r => {
    const k = r.condominio.chave;
    const atual = mapa.get(k);
    if(!atual || (r.dataAnalise > atual.dataAnalise) || (r.dataAnalise === atual.dataAnalise && (r.concluidaEm||'') > (atual.concluidaEm||''))) mapa.set(k, r);
  });
  return mapa;
}
/* fila: um item por condomínio com unidades ativas (não excluídas, não encerradas) na última rodada concluída */
function fila(){
  const hoje = hojeISO();
  const itens = [];
  ultimaRodadaPorCondominio().forEach(r => {
    const ativas = (r.unidades || []).filter(u => u.situacao === 'ativa' && u.resultado !== 'EXCLUIR');
    if(!ativas.length) return;
    const prazo = r.proximaReanalise || somaDias(r.dataAnalise, PRAZO_REANALISE_DIAS);
    const emAberto = S.rodadas.find(x => x.status === 'rascunho' && x.condominio.chave === r.condominio.chave);
    itens.push({ chave: r.condominio.chave, condominio: r.condominio, rodada: r, unidades: ativas, prazo, dias: diasEntre(hoje, prazo), vencida: prazo < hoje, rascunho: emAberto || null, completar: ativas.some(u => u.completar) });
  });
  itens.sort((a,b) => a.prazo.localeCompare(b.prazo));
  return itens;
}
/* panorama acumulado por unidade (mesmo quadro da planilha antiga): total, sob análise, em análise, encerradas, excluídas */
function panoramaUnidades(){
  const chaveU = u => soDigitos(u.cpf) || (normUnid(u.unid) + '|' + normNome(u.titular)) || u.id;
  const porCond = new Map();
  rodadasConcluidas().slice().sort((a,b) => (a.dataAnalise + (a.concluidaEm||'')).localeCompare(b.dataAnalise + (b.concluidaEm||''))).forEach(r => {
    const m = porCond.get(r.condominio.chave) || new Map(); porCond.set(r.condominio.chave, m);
    (r.unidades || []).forEach(u => { m.set(chaveU(u), u.resultado === 'EXCLUIR' ? 'excluida' : u.situacao === 'encerrada' ? 'encerrada' : 'ativa'); });
  });
  const p = { total: 0, sobAnalise: 0, excluidas: 0, encerradas: 0, emAnalise: 0 };
  porCond.forEach(m => m.forEach(st => { p.total++; if(st === 'excluida') p.excluidas++; else if(st === 'encerrada') p.encerradas++; else p.sobAnalise++; }));
  p.emAnalise = S.rodadas.filter(r => r.status === 'rascunho').reduce((s, r) => s + (r.unidades || []).length, 0);
  return p;
}
function rodadasDoCondominio(chave){ return S.rodadas.filter(r => r.condominio.chave === chave).sort((a,b) => a.dataAnalise.localeCompare(b.dataAnalise)); }

/* ---------- construção de rodada ---------- */
function novaUnidade(unid, titular, cpf){
  return { id: uid(), unid: unid || '', titular: titular || '', cpf: cpf || '', obs:'', override:'', motivoAjuste:'',
           manual:{vouch:null, ant:null}, esc:{vouch:null, ant:null}, cas:{vouch:null, ant:null}, vouch:null, ant:null,
           resultado:'', regra:'', motivo:'', situacao:'ativa', encerramento:null, completar:false };
}
function novaRodada(tipo, cond){
  return { protocolo: '', tipo: tipo || 'implantacao', origem: 'modulo', condominio: cond || { nome:'', cnpj:'', chave:'' },
           dataAnalise: hojeISO(), analista:'', idadeGarantia: null, bi: null, semAnterior: false, semBi: false, nota:'',
           status:'rascunho', vouch: null, unidades: [], anterior: null, proximaReanalise: null, criadaEm: nowISO(), criadoPor: ME.id, criadoPorNome: ME.name, concluidaEm: null };
}
function contextoDe(r){
  const bi = r.semBi || !r.bi || r.bi.valor === null || r.bi.valor === undefined ? null : (r.bi.sinal === '-' ? -Math.abs(r.bi.valor) : Math.abs(r.bi.valor));
  return { tipo: r.tipo === 'acompanhamento' || r.tipo === 'carga' ? 'acompanhamento' : 'implantacao', semAnt: !!r.semAnterior, biPos: bi === null ? null : bi >= 0, vig: (r.idadeGarantia === null || r.idadeGarantia === undefined || r.idadeGarantia === '') ? null : +r.idadeGarantia };
}
/* recasa todas as unidades com os devedores lidos e reclassifica (muta r) */
function recalcular(r, dev, lidos){
  const ctx = contextoDe(r);
  r.unidades.forEach(u => {
    ['vouch','ant'].forEach(campo => {
      if(u.esc[campo] === 'manual') return;
      const m = melhorDevedor(u, dev[campo]);
      u.esc[campo] = m ? m.i : null;
      const b = m ? dev[campo][m.i] : null;
      u.cas[campo] = b ? { nome: b.nome, unid: b.unidadeTxt || b.unidade, modo: m.modo, score: m.score, nadaConsta: !!b.nadaConsta } : null;
      // unidade da carga inicial (sem titular) casada pelo número no Vouch: preenche titular e CPF para conferência
      if(b && campo === 'vouch' && m.modo === 'unidade' && !u.titular){ u.titular = b.nome; if(!u.cpf && b.cpf) u.cpf = b.cpf; u.titularAuto = 'vouch'; u.completar = false; }
    });
    if(!u.unid || u.unidAuto){
      const bv = u.esc.vouch !== null && u.esc.vouch !== 'manual' ? dev.vouch[u.esc.vouch] : null;
      const ba = u.esc.ant !== null && u.esc.ant !== 'manual' ? dev.ant[u.esc.ant] : null;
      const un = (bv && (bv.unidadeTxt || bv.unidade)) || (ba && (ba.unidadeTxt || ba.unidade)) || '';
      if(un){ u.unid = un; u.unidAuto = true; }
    }
    u.vouch = contagem(u, 'vouch', dev, lidos.vouch);
    u.ant = ctx.semAnt ? 0 : contagem(u, 'ant', dev, lidos.ant);
    const c = classificar(u, ctx, u.vouch, u.ant);
    u.resultado = c.r; u.regra = c.regra; u.motivo = c.motivo; u.pendente = !!c.pendente;
  });
}
function resumoRodada(r){
  const n = x => r.unidades.filter(u => u.resultado === x).length;
  return { total: r.unidades.length, excluir: n('EXCLUIR'), prev: n('PREVENTIVO'), rean: n('REANÁLISE'), enc: n('ENCERRADA'), pendentes: r.unidades.filter(u => u.pendente).length };
}
function rodadaParaGravar(r){
  const c = JSON.parse(JSON.stringify(r)); delete c.id; delete c._dev; return c;
}
async function salvarRodada(r){
  if(!CAN_WRITE) throw new Error('Sem permissão de escrita.');
  const dados = rodadaParaGravar(r);
  if(r.id){ await DB.doc(COLECOES.rodadas + '/' + r.id).set(dados); }
  else { const ref = await DB.collection(COLECOES.rodadas).add(dados); r.id = ref.id; }
  return r.id;
}
async function salvarEvidencias(rodadaId, ev){
  if(!rodadaId) return;
  await DB.doc(COLECOES.evidencias + '/' + rodadaId).set({ rodadaId, atualizadoEm: nowISO(), ...ev });
}
async function carregarEvidencias(rodadaId){
  const snap = await DB.doc(COLECOES.evidencias + '/' + rodadaId).get();
  return snap.exists ? snap.data() : null;
}
/* exclusão (só gestão): rascunho de análise e solicitação ainda não concluída. Rodada concluída não se exclui. */
async function excluirRascunho(r, opts){
  opts = opts || {};
  if(!r || !r.id || r.status === 'concluida') throw new Error('Só rascunho pode ser excluído.');
  await DB.doc(COLECOES.rodadas + '/' + r.id).delete();
  try{ await DB.doc(COLECOES.evidencias + '/' + r.id).delete(); }catch(_){}
  // a solicitação ligada volta para "vista", pronta para iniciar de novo (a não ser que ela também esteja sendo excluída)
  const sol = r.solicitacaoId && S.solicitacoes.find(x => x.id === r.solicitacaoId);
  if(sol && !opts.semVoltarSolicitacao && sol.status === 'em_analise') await atualizarSolicitacao(sol.id, { status: 'vista', rodadaId: null });
  registrarHistorico('exclusao', { alvo: 'rascunho', rodadaId: r.id, condominio: r.condominio.nome });
}
async function excluirSolicitacao(x){
  if(!x || x.status === 'concluida') throw new Error('Solicitação concluída não pode ser excluída.');
  const rod = x.rodadaId && S.rodadas.find(r => r.id === x.rodadaId);
  if(rod && rod.status === 'concluida') throw new Error('A análise desta solicitação já foi concluída.');
  if(rod) await excluirRascunho(rod, { semVoltarSolicitacao: true });
  await DB.doc(COLECOES.solicitacoes + '/' + x.id).delete();
  registrarHistorico('exclusao', { alvo: 'solicitacao', solicitacaoId: x.id, condominio: x.condominio.nome, solicitante: x.solicitanteNome });
}
/* conclusão: trava, atribui protocolo (se a rodada veio de solicitação, mantém o da solicitação), define situação das unidades e prazo */
async function concluirRodada(r){
  const pend = r.unidades.filter(u => u.pendente && !u.override);
  if(pend.length) throw new Error(`${pend.length} pendência(s) (regra 5.5) impedem a conclusão. Resolva o insumo ou faça o ajuste manual com motivo.`);
  const semMotivo = r.unidades.filter(u => u.override && !String(u.motivoAjuste||'').trim());
  if(semMotivo.length) throw new Error('Ajuste manual exige motivo (unidade ' + semMotivo.map(u => u.unid || u.titular).join(', ') + ').');
  if(!r.condominio.nome) throw new Error('Informe o condomínio.');
  if(!r.unidades.length) throw new Error('Cadastre ao menos um espólio.');
  if(!r.protocolo) r.protocolo = await proximoProtocolo(r.dataAnalise.slice(0,4));
  r.unidades.forEach(u => { if(u.resultado === 'EXCLUIR') u.situacao = 'excluida'; else if(u.situacao !== 'encerrada') u.situacao = 'ativa'; });
  r.status = 'concluida'; r.concluidaEm = nowISO(); r.concluidoPor = ME.id; r.concluidoPorNome = ME.name;
  r.proximaReanalise = somaDias(r.dataAnalise, PRAZO_REANALISE_DIAS);
  r.resumo = resumoRodada(r);
  await salvarRodada(r);
  registrarHistorico('conclusao', { rodadaId: r.id, protocolo: r.protocolo, condominio: r.condominio.nome, tipo: r.tipo, resumo: r.resumo });
  if(r.solicitacaoId){
    try{ await atualizarSolicitacao(r.solicitacaoId, { status: 'concluida', rodadaId: r.id, protocolo: r.protocolo, concluidaEm: nowISO(),
      resultado: r.unidades.map(u => ({ unid: u.unid, titular: u.titular, cpf: u.cpf, resultado: u.resultado, regra: u.regra, motivo: u.motivo })) }); }
    catch(e){ console.warn('solicitação não atualizada', e); }
  }
  return r;
}
/* nova rodada de acompanhamento a partir da última concluída do condomínio */
function rodadaDeAcompanhamento(anterior){
  const r = novaRodada('acompanhamento', { ...anterior.condominio });
  r.anterior = anterior.id; r.idadeGarantia = anterior.idadeGarantia; r.analista = anterior.analista || '';
  r.semAnterior = true; r.semBi = true;
  r.unidades = (anterior.unidades || []).filter(u => u.situacao === 'ativa' && u.resultado !== 'EXCLUIR').map(u => {
    const n = novaUnidade(u.unid, u.titular, u.cpf); n.obs = u.obs || ''; if(u.debAnterior) n.debAnterior = u.debAnterior; n.completar = !!u.completar; n.historicoVouch = (u.historicoVouch || []).concat([{ rodada: anterior.protocolo || anterior.id, data: anterior.dataAnalise, vouch: u.vouch }]); return n; });
  return r;
}

/* ---------- identificação do condomínio de um PDF do Vouch (lote) ---------- */
function identificarCondominio(leitura, candidatos){
  const cnpj = soDigitos(leitura.cnpj);
  if(cnpj.length === 14){ const c = candidatos.find(x => soDigitos(x.condominio.cnpj) === cnpj); if(c) return { item: c, modo: 'CNPJ', score: 1 }; }
  let best = null, bs = 0, second = 0;
  candidatos.forEach(c => { const d = diceCond(leitura.condominio, c.condominio.nome); if(d > bs){ second = bs; bs = d; best = c; } else if(d > second) second = d; });
  if(!best || bs < 0.5) return null;
  return { item: best, modo: 'nome', score: bs, ambiguo: (bs - second) < 0.15 };
}

/* ---------- carga inicial a partir da planilha de controle ---------- */
/* carga a partir da planilha unificada: uma rodada concluída por condomínio (chave pelo CNPJ, liga com a carteira).
   Data da análise = última verificação mais recente das unidades (sem ela, o mês da verificação).
   "Excluída da garantia" entra excluída; as demais ficam em acompanhamento, titular a completar. */
async function importarPlanilhaUnificada(grupos){
  let nr = 0, pulados = 0, unidades = 0;
  for(const g of grupos){
    const ja = r => r.condominio.chave === g.chave || normCond(r.condominio.nome) === normCond(g.condominio) || (g.razao && normCond(r.condominio.nome) === normCond(g.razao));
    if(S.rodadas.some(ja)){ pulados++; continue; }
    const r = novaRodada('carga', { nome: g.condominio, cnpj: g.cnpj, chave: g.chave });
    r.origem = 'carga'; r.status = 'concluida'; r.protocolo = '';
    const datas = g.unidades.map(u => u.ultima).filter(Boolean).sort();
    const meses = g.unidades.map(u => u.mes).filter(Boolean).sort();
    r.dataAnalise = datas.length ? datas[datas.length - 1] : meses.length ? meses[meses.length - 1] + '-01' : hojeISO();
    r.nota = 'Carga inicial da base unificada (Acompanhamento de Espólios + Controle de Verificação)' + (g.comarca ? ' · ' + g.comarca : '');
    r.unidades = g.unidades.map(x => {
      const n = novaUnidade(x.unid, '', '');
      const exc = /exclu/i.test(x.status);
      n.resultado = exc ? 'EXCLUIR' : 'PREVENTIVO'; n.situacao = exc ? 'excluida' : 'ativa'; n.regra = 'Carga';
      n.motivo = exc ? 'Excluída da garantia (planilha de acompanhamento).' : x.varias ? 'Planilha indica "várias" unidades; completar na primeira reanálise.' : 'Importada da planilha; titular a completar.' + (x.status ? ' Status na planilha: ' + x.status + '.' : '');
      n.obs = [x.deb ? 'Déb. anterior: ' + x.deb : '', x.ultima ? 'Última verificação: ' + fmtData(x.ultima) : '', x.obs, x.fonte ? 'Fonte: ' + x.fonte : ''].filter(Boolean).join(' · ');
      if(/^(sim|n[ãa]o)$/i.test(x.deb)) n.debAnterior = /^sim$/i.test(x.deb) ? 'SIM' : 'NÃO';   // conferência feita na época com a administradora anterior
      n.completar = !exc;
      return n;
    });
    unidades += r.unidades.length;
    r.concluidaEm = nowISO(); r.proximaReanalise = somaDias(r.dataAnalise, PRAZO_REANALISE_DIAS); r.resumo = resumoRodada(r);
    const ref = await DB.collection(COLECOES.rodadas).add(rodadaParaGravar(r));
    S.rodadas.push({ id: ref.id, ...r }); nr++;
  }
  registrarHistorico('carga_inicial', { rodadas: nr, unidades, formato: 'unificada' });
  return { rodadas: nr, pulados, unidades };
}
async function importarPlanilhaControle(linhas){
  let nr = 0, pulados = 0;
  for(const l of linhas){
    if(!l.temEspolio) continue;
    const chave = chaveCond(l.condominio, '');
    if(S.rodadas.some(r => r.condominio.chave === chave)){ pulados++; continue; }
    const r = novaRodada('carga', { nome: l.condominio, cnpj: '', chave });
    r.origem = 'carga'; r.status = 'concluida'; r.protocolo = '';
    r.dataAnalise = l.mes ? l.mes + '-01' : hojeISO();
    r.nota = 'Carga inicial da planilha de controle' + (l.comarca ? ' · ' + l.comarca : '') + (l.obs ? ' · obs.: ' + l.obs : '');
    r.unidades = l.unidades.length ? l.unidades.map(u => { const n = novaUnidade(u.unidTxt, '', ''); n.resultado = 'PREVENTIVO'; n.regra = 'Carga'; n.motivo = 'Importada da planilha de controle; titular a completar.'; n.completar = true; return n; })
                                   : [Object.assign(novaUnidade('', '', ''), { resultado:'PREVENTIVO', regra:'Carga', motivo: l.varias ? 'Planilha indica "várias" unidades; completar na primeira reanálise.' : 'Unidades não informadas na planilha; completar na primeira reanálise.', completar: true })];
    r.concluidaEm = nowISO(); r.proximaReanalise = somaDias(r.dataAnalise, PRAZO_REANALISE_DIAS); r.resumo = resumoRodada(r);
    const ref = await DB.collection(COLECOES.rodadas).add(rodadaParaGravar(r));
    S.rodadas.push({ id: ref.id, ...r }); nr++;
  }
  registrarHistorico('carga_inicial', { rodadas: nr });
  return { rodadas: nr, pulados };
}
