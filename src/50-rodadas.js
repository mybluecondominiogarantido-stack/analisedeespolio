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
  bi: { base: [], enviadoEm: '', por: '' },
  pronto: { r:false, v:false, m:false, b:false },
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
      u.cas[campo] = m ? { nome: dev[campo][m.i].nome, unid: dev[campo][m.i].unidadeTxt || dev[campo][m.i].unidade, modo: m.modo, score: m.score } : null;
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
/* conclusão: trava, atribui protocolo, define situação das unidades e prazo */
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
  return r;
}
/* nova rodada de acompanhamento a partir da última concluída do condomínio */
function rodadaDeAcompanhamento(anterior){
  const r = novaRodada('acompanhamento', { ...anterior.condominio });
  r.anterior = anterior.id; r.idadeGarantia = anterior.idadeGarantia; r.analista = anterior.analista || '';
  r.semAnterior = true; r.semBi = true;
  r.unidades = (anterior.unidades || []).filter(u => u.situacao === 'ativa' && u.resultado !== 'EXCLUIR').map(u => {
    const n = novaUnidade(u.unid, u.titular, u.cpf); n.obs = u.obs || ''; n.completar = !!u.completar; n.historicoVouch = (u.historicoVouch || []).concat([{ rodada: anterior.protocolo || anterior.id, data: anterior.dataAnalise, vouch: u.vouch }]); return n; });
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
async function importarPlanilhaControle(linhas){
  const existentesV = new Set(S.verificacoes.map(v => v.mes + '|' + normCond(v.condominio)));
  const existentesR = new Set(S.rodadas.filter(r => r.origem === 'carga').map(r => r.condominio.chave));
  let nv = 0, nr = 0, pulados = 0;
  for(const l of linhas){
    const kv = l.mes + '|' + normCond(l.condominio);
    if(!existentesV.has(kv)){
      await DB.collection(COLECOES.verificacoes).add({ mes: l.mes, condominio: l.condominio, comarca: l.comarca, vigencia: l.vigencia, responsavel: l.responsavel, temEspolio: l.temEspolio, obs: l.obs, origem: 'planilha', criadoEm: nowISO(), criadoPor: ME.id });
      existentesV.add(kv); nv++;
    } else pulados++;
    if(l.temEspolio){
      const chave = chaveCond(l.condominio, '');
      if(existentesR.has(chave) || S.rodadas.some(r => r.condominio.chave === chave)) continue;
      const r = novaRodada('carga', { nome: l.condominio, cnpj: '', chave });
      r.origem = 'carga'; r.status = 'concluida'; r.protocolo = '';
      r.dataAnalise = l.mes ? l.mes + '-01' : hojeISO();
      r.nota = 'Carga inicial da planilha de controle' + (l.obs ? ' · obs.: ' + l.obs : '');
      r.unidades = l.unidades.length ? l.unidades.map(u => { const n = novaUnidade(u.unidTxt, '', ''); n.resultado = 'PREVENTIVO'; n.regra = 'Carga'; n.motivo = 'Importada da planilha de controle; titular a completar.'; n.completar = true; return n; })
                                     : [Object.assign(novaUnidade('', '', ''), { resultado:'PREVENTIVO', regra:'Carga', motivo: l.varias ? 'Planilha indica "várias" unidades; completar na primeira reanálise.' : 'Unidades não informadas na planilha; completar na primeira reanálise.', completar: true })];
      r.concluidaEm = nowISO(); r.proximaReanalise = somaDias(r.dataAnalise, PRAZO_REANALISE_DIAS); r.resumo = resumoRodada(r);
      await DB.collection(COLECOES.rodadas).add(rodadaParaGravar(r));
      existentesR.add(chave); nr++;
    }
  }
  registrarHistorico('carga_inicial', { verificacoes: nv, rodadas: nr });
  return { verificacoes: nv, rodadas: nr, pulados };
}
