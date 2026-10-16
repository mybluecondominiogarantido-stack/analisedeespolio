/* ======================================================================
   Solicitações de análise
   - Implantação: nova solicitação e o quadro de condomínios em implantação a verificar; Minhas solicitações
   - Solicitante avulso: nova solicitação (sem o quadro); Minhas solicitações
   - Gestão: caixa de entrada, registrar solicitação, iniciar análise, devolver
   O tipo da solicitação segue o papel de quem pede: Implantação pedindo um condomínio do quadro = implantação;
   qualquer outro caso = avulso. Na solicitação registrada pela gestão, a gestão escolhe o tipo.
   ====================================================================== */
const STATUS_SOL = { nova:'Nova', vista:'Vista', em_analise:'Em análise', concluida:'Concluída', devolvida:'Devolvida' };
const seloSol = st => `<span class="selo ${st==='nova'?'s-exc':st==='concluida'?'s-ok':st==='devolvida'?'s-rean':st==='em_analise'?'s-prev':'s-rasc'}">${esc(STATUS_SOL[st]||st)}</span>`;
const diasDesde = iso => iso ? diasEntre(String(iso).slice(0,10), hojeISO()) : 0;

function renderSolicitacoes(){
  const p = papeis();
  $('#p-sol').innerHTML = p.gestao ? htmlSolGestao() : '';
  $('#p-pedir').innerHTML = (p.implantacao || p.avulso) ? htmlSolSolicitante() : '';
  $('#p-minhas').innerHTML = (p.implantacao || p.avulso) ? htmlListaSolicitacoes(minhasSolicitacoes(), 'Minhas solicitações', 'clique para ver o andamento e, quando concluída, a ficha', 'solicitante') : '';
  ligarSolicitacoes();
}

/* ---------- blocos comuns ---------- */
function htmlPendentesVerificacao(){
  const pend = pendentesVerificacao();
  const temCarteira = (S.carteira.itens || []).length > 0;
  const mesAtual = mesDe(hojeISO());
  const doMes = pend.filter(c => !c.atrasado), atrasados = pend.filter(c => c.atrasado);
  const tabela = (lista, titulo) => `<h3 class="sub-quadro">${titulo} <span class="pill">${lista.length}</span></h3>` + (lista.length ? `<div class="tabela-wrap"><table><thead><tr><th>Condomínio</th><th>Comarca</th><th>Vigência</th><th>Aguardando</th><th>Assumido por</th><th></th></tr></thead><tbody>${lista.map(c => `<tr><td><b>${esc(c.nome)}</b>${c.cnpj?`<div class="ajuda" style="margin:0">${esc(c.cnpj)}</div>`:''}</td><td>${esc(c.comarca||'')}</td><td>${fmtData(c.inicio)}</td>
      <td class="${c.atrasado ? 'venc' : ''}">${c.dias} dia(s)</td><td>${c.assumido ? esc(c.assumido.por || '') : '<span class="ajuda" style="margin:0">ninguém</span>'}</td>
      <td class="acoes">${!c.assumido ? `<button class="btn sec mini" data-assumir="${esc(c.chave)}">Assumir</button>` : ''}
        <button class="btn sec mini" data-semespolio="${esc(c.chave)}">Sem espólio</button>
        <button class="btn mini" data-solicitar="${esc(c.chave)}">Solicitar análise</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="corpo"><div class="vazio">Nenhum.</div></div>');
  return `<div class="card"><header><h2>Condomínios em implantação</h2><span class="dica">vigência no mês e atrasados desde ${fmtMesAno(VERIFICACAO_DESDE)} · saem do quadro com “Sem espólio” ou com a solicitação enviada</span></header>
    ${!temCarteira ? '<div class="corpo"><div class="vazio">A carteira de condomínios do portal não foi carregada. Recarregue o módulo; se persistir, avise a gestão.</div></div>'
      : tabela(doMes, 'Vigência em ' + fmtMesAno(mesAtual)) + tabela(atrasados, 'Atrasados')}</div>`;
}
/* tipo pela regra do papel: Implantação pedindo condomínio do quadro = implantação; senão avulso */
function tipoPeloPapel(nome, cnpj){
  const p = papeis();
  if(!p.implantacao) return { tipo: 'avulso', texto: 'Solicitação avulsa.' };
  const d = soDigitos(cnpj);
  const c = pendentesVerificacao().find(x => (d.length === 14 && soDigitos(x.cnpj) === d) || (nome && normCond(x.nome) === normCond(nome)));
  return c ? { tipo: 'implantacao', texto: `Condomínio no quadro de implantação (vigência ${fmtData(c.inicio)}): solicitação de implantação.` }
           : { tipo: 'avulso', texto: nome ? 'Condomínio fora do quadro de implantação: solicitação avulsa.' : 'Condomínio do quadro de implantação vira solicitação de implantação; os demais, avulsa.' };
}
function htmlFormSolicitacao(pre){
  pre = pre || {};
  return `<div class="card" id="cardNovaSol"><header><h2>Nova solicitação de análise</h2><span class="dica">preencha as unidades com titular falecido · substitui o e-mail de sinalização</span></header>
    <div class="corpo">
      <div class="grade">
        <div><label>Condomínio</label><input type="text" id="solCond" class="campo" list="listaCarteira" value="${esc(pre.nome||'')}" placeholder="Comece a digitar"><datalist id="listaCarteira">${(S.carteira.itens||[]).filter(c => c.situacao !== 'DISTRATADO').map(c => `<option value="${esc(c.nome)}">${esc([c.cnpj, c.comarca].filter(Boolean).join(' · '))}</option>`).join('')}</datalist>${(S.carteira.itens||[]).length ? '' : '<p class="ajuda" style="color:var(--red)">Carteira de condomínios não carregada. Recarregue o módulo; se persistir, avise a gestão.</p>'}</div>
        <div><label>CNPJ</label><input type="text" id="solCnpj" class="campo" value="${esc(pre.cnpj||'')}" placeholder="preenchido pela carteira, ou digite para buscar"></div>
      </div>
      ${pre.semTipo ? '' : `<p class="ajuda" id="solTipoInfo">${esc(tipoPeloPapel(pre.nome, pre.cnpj).texto)}</p>`}
      <label style="margin-top:12px">Unidades sinalizadas</label>
      <div class="tabela-wrap"><table id="solUnidades"><thead><tr><th style="width:140px">Bloco - unidade</th><th>Titular (falecido)</th><th style="width:170px">CPF</th><th></th></tr></thead><tbody></tbody></table></div>
      <div class="acoes" style="margin-top:8px"><button class="btn sec mini" id="solAddUnid">Adicionar unidade</button></div>
      <div style="margin-top:12px"><label>Observações</label><textarea id="solObs" style="min-height:70px;font-family:var(--font);font-size:13.5px" placeholder="Informações que ajudem a análise: inventário, herdeiros em contato, documentos recebidos..."></textarea></div>
      <div class="acoes" style="margin-top:12px"><button class="btn" id="solEnviar" ${!CAN_WRITE?'disabled':''}>Enviar solicitação</button><button class="btn sec" id="solLimpar">Limpar</button></div>
      <div id="solStatus"></div>
    </div></div>`;
}
function linhaUnidadeSol(u){ u = u || {}; return `<tr><td><input type="text" data-su="unid" value="${esc(u.unid||'')}" placeholder="A - 101"></td><td><input type="text" data-su="titular" value="${esc(u.titular||'')}" placeholder="nome completo"></td><td><input type="text" data-su="cpf" value="${esc(u.cpf||'')}" placeholder="000.000.000-00"></td><td><button class="btn perigo mini" data-su-rm>×</button></td></tr>`; }

function htmlListaSolicitacoes(lista, titulo, dica, modo){
  const linhas = lista.map(x => `<tr class="clic" data-sol="${x.id}"><td>${fmtData((x.criadaEm||'').slice(0,10))}<div class="ajuda" style="margin:0">há ${diasDesde(x.criadaEm)} dia(s)</div></td>${modo==='gestao'?`<td>${esc(x.solicitanteNome||'')}<div class="ajuda" style="margin:0">${x.tipo==='avulso'?'Avulso':'Implantação'}</div></td>`:''}<td><b>${esc(x.condominio.nome)}</b></td><td>${(x.unidades||[]).length}</td><td>${seloSol(x.status)}</td><td>${esc(x.protocolo||'—')}</td></tr>`).join('');
  return `<div class="card"><header><h2>${titulo}</h2><span class="dica">${dica}</span></header>${lista.length ? `<div class="tabela-wrap"><table><thead><tr><th>Enviada</th>${modo==='gestao'?'<th>Solicitante</th>':''}<th>Condomínio</th><th>Unid.</th><th>Status</th><th>Protocolo</th></tr></thead><tbody>${linhas}</tbody></table></div>` : '<div class="corpo"><div class="vazio">Nenhuma solicitação.</div></div>'}</div>`;
}

/* ---------- visão do solicitante ---------- */
function htmlSolSolicitante(){
  const quadro = papeis().implantacao;
  return `<div class="nota"><b>Solicitação de análise de espólio.</b> Envie a solicitação com as unidades de titular falecido.${quadro ? ' Abaixo, os condomínios em implantação que ainda precisam ser verificados.' : ''} O andamento fica em “Minhas solicitações”.</div>
    ${htmlFormSolicitacao()}${quadro ? htmlPendentesVerificacao() : ''}`;
}
/* ---------- visão da gestão ---------- */
function htmlSolGestao(){
  const filtro = S.solFiltro || 'abertas';
  let lista = S.solicitacoes.slice().sort((a,b) => (b.criadaEm||'').localeCompare(a.criadaEm||''));
  if(filtro === 'abertas') lista = lista.filter(x => ['nova','vista','em_analise'].includes(x.status));
  else if(filtro !== 'todas') lista = lista.filter(x => x.status === filtro);
  const novas = solicitacoesNovas().length;
  return `<div class="filtros"><span class="pill">Novas <b>${novas}</b></span><select id="solFiltro" class="campo"><option value="abertas" ${filtro==='abertas'?'selected':''}>Abertas</option><option value="nova" ${filtro==='nova'?'selected':''}>Novas</option><option value="em_analise" ${filtro==='em_analise'?'selected':''}>Em análise</option><option value="concluida" ${filtro==='concluida'?'selected':''}>Concluídas</option><option value="devolvida" ${filtro==='devolvida'?'selected':''}>Devolvidas</option><option value="todas" ${filtro==='todas'?'selected':''}>Todas</option></select><span style="flex:1"></span><button class="btn mini" id="btnRegistrarSol" ${!CAN_WRITE?'disabled':''}>Registrar solicitação</button></div>
    ${htmlListaSolicitacoes(lista, 'Solicitações recebidas', 'clique para abrir · "Iniciar análise" cria a rodada já preenchida', 'gestao')}`;
}

/* ---------- eventos ---------- */
function ligarSolicitacoes(){
  const el = $('#p-pedir');
  $$('#p-sol [data-sol], #p-minhas [data-sol]').forEach(tr => tr.onclick = () => abrirSolicitacaoModal(S.solicitacoes.find(x => x.id === tr.dataset.sol)));
  const sf = $('#solFiltro'); if(sf) sf.onchange = () => { S.solFiltro = sf.value; renderSolicitacoes(); };
  const br = $('#btnRegistrarSol'); if(br) br.onclick = abrirRegistrarSolicitacao;
  el.querySelectorAll('[data-assumir]').forEach(b => b.onclick = async () => { const c = S.carteira.itens.find(x => x.chave === b.dataset.assumir); await DB.collection(COLECOES.verificacoes).add({ chave: c.chave, condominio: c.nome, cnpj: c.cnpj, mes: mesDe(c.inicio), resultado: 'assumido', por: ME.name, porId: ME.id, quando: nowISO() }); toast('Você assumiu ' + c.nome + '.'); });
  el.querySelectorAll('[data-semespolio]').forEach(b => b.onclick = async () => { const c = S.carteira.itens.find(x => x.chave === b.dataset.semespolio); if(!(await confirmar(`Registrar ${c.nome} como verificado, sem espólio?`))) return; await DB.collection(COLECOES.verificacoes).add({ chave: c.chave, condominio: c.nome, cnpj: c.cnpj, mes: mesDe(c.inicio), resultado: 'sem_espolio', por: ME.name, porId: ME.id, quando: nowISO() }); registrarHistorico('verificacao', { condominio: c.nome, resultado: 'sem_espolio' }); toast(c.nome + ' registrado sem espólio.'); });
  el.querySelectorAll('[data-solicitar]').forEach(b => b.onclick = () => { const c = S.carteira.itens.find(x => x.chave === b.dataset.solicitar); const card = el.querySelector('#cardNovaSol'); card.outerHTML = htmlFormSolicitacao({ nome: c.nome, cnpj: c.cnpj }); ligarFormSolicitacao(el.querySelector('#cardNovaSol')); el.querySelector('#cardNovaSol').scrollIntoView({ behavior:'smooth' }); });
  ligarFormSolicitacao(el.querySelector('#cardNovaSol'));
}
/* liga um formulário de solicitação (aba Solicitar análise ou modal Registrar solicitação); devolve a função de envio */
function ligarFormSolicitacao(card){
  if(!card) return null;
  const q = sel => card.querySelector(sel);
  const tb = q('#solUnidades tbody'); if(!tb.children.length) tb.innerHTML = linhaUnidadeSol();
  q('#solAddUnid').onclick = () => tb.insertAdjacentHTML('beforeend', linhaUnidadeSol());
  tb.addEventListener('click', e => { if(e.target.closest('[data-su-rm]')){ const tr = e.target.closest('tr'); if(tb.children.length > 1) tr.remove(); else tr.querySelectorAll('input').forEach(i => i.value = ''); } });
  const cond = q('#solCond'), cnpjEl = q('#solCnpj');
  const acharPorNome = v => (S.carteira.itens||[]).find(x => normCond(x.nome) === normCond(v) || normCond(x.razao) === normCond(v));
  const acharPorCnpj = v => { const d = soDigitos(v); return d.length === 14 ? (S.carteira.itens||[]).find(x => soDigitos(x.cnpj) === d) : null; };
  const tipoInfo = () => { const el = q('#solTipoInfo'); if(el) el.textContent = tipoPeloPapel(cond.value.trim(), cnpjEl.value).texto; };
  const aplicarCond = c => { cond.value = c.nome; cnpjEl.value = c.cnpj || ''; cnpjEl.dataset.auto = '1'; tipoInfo(); };
  ['input','change'].forEach(ev => cond.addEventListener(ev, () => { const c = acharPorNome(cond.value); if(c && (!cnpjEl.value.trim() || cnpjEl.dataset.auto)) aplicarCond(c); else if(!c){ if(cnpjEl.dataset.auto){ cnpjEl.value = ''; delete cnpjEl.dataset.auto; } tipoInfo(); } }));
  ['input','change'].forEach(ev => cnpjEl.addEventListener(ev, () => { delete cnpjEl.dataset.auto; const c = acharPorCnpj(cnpjEl.value); if(c) aplicarCond(c); else tipoInfo(); }));
  q('#solLimpar').onclick = () => { const pai = card.parentNode; card.outerHTML = htmlFormSolicitacao(); ligarFormSolicitacao(pai.querySelector('#cardNovaSol')); };
  /* extra (registro pela gestão): { tipo, dados } */
  const enviar = async (extra) => {
    extra = extra && extra.tipo ? extra : null;
    const nome = cond.value.trim(); const cnpj = cnpjEl.value.trim();
    const unidades = [...tb.querySelectorAll('tr')].map(tr => ({ unid: tr.querySelector('[data-su="unid"]').value.trim(), titular: tr.querySelector('[data-su="titular"]').value.trim(), cpf: tr.querySelector('[data-su="cpf"]').value.trim() })).filter(u => u.unid || u.titular || u.cpf);
    const st = q('#solStatus');
    if(!nome){ st.innerHTML = '<div class="erro">Informe o condomínio.</div>'; return false; }
    if(!unidades.length || unidades.some(u => !u.titular && !u.unid)){ st.innerHTML = '<div class="erro">Informe ao menos uma unidade com titular.</div>'; return false; }
    const tipo = extra ? extra.tipo : tipoPeloPapel(nome, cnpj).tipo;
    const origem = extra ? 'gestao' : (papeis().implantacao ? 'implantacao' : 'avulso');
    try{
      const c = (S.carteira.itens||[]).find(x => normCond(x.nome) === normCond(nome));
      const criada = await criarSolicitacao({ condominio: { nome: c ? c.nome : nome, cnpj: cnpj || (c ? c.cnpj : ''), chave: chaveCond(c ? c.nome : nome, cnpj || (c ? c.cnpj : '')) }, origem, tipo, unidades, obs: q('#solObs').value.trim(), ...(extra ? extra.dados : {}) });
      toast('Solicitação enviada · protocolo ' + criada.protocolo + '.', 4000); renderSolicitacoes();
      return true;
    }catch(e){ st.innerHTML = `<div class="erro">${esc(dbErr(e))}</div>`; return false; }
  };
  q('#solEnviar').onclick = () => enviar();
  return enviar;
}

/* gestão registra uma solicitação que chegou por e-mail ou telefone, em nome de quem pediu; o tipo é a gestão que escolhe */
function abrirRegistrarSolicitacao(pre){
  abrirModal('Registrar solicitação', `<div class="grade" style="margin-bottom:12px"><div><label>Quem pediu</label><input type="text" id="rsNome" class="campo" placeholder="nome da assistente ou analista"></div><div><label>Como chegou</label><select id="rsCanal" class="campo"><option value="email">E-mail</option><option value="telefone">Telefone / presencial</option><option value="outro">Outro</option></select></div>
      <div><label>Tipo</label><select id="rsTipo" class="campo"><option value="">Selecione…</option><option value="implantacao">Implantação · 1ª análise</option><option value="avulso">Avulso · já em carteira</option></select></div></div>
    ${htmlFormSolicitacao({ ...(pre || {}), semTipo: true }).replace('id="cardNovaSol"', 'id="cardNovaSol" style="margin:0;border:0;box-shadow:none"')}`);
  const card = $('#modal #cardNovaSol');
  const enviar = ligarFormSolicitacao(card);
  const btn = card.querySelector('#solEnviar'); btn.textContent = 'Registrar';
  const st = card.querySelector('#solStatus');
  btn.onclick = async () => {
    const quem = $('#rsNome').value.trim(); if(!quem){ st.innerHTML = '<div class="erro">Informe quem pediu.</div>'; return; }
    const tipo = $('#rsTipo').value; if(!tipo){ st.innerHTML = '<div class="erro">Escolha o tipo: implantação ou avulso.</div>'; return; }
    const meuNome = ME.name, meuId = ME.id;
    ME.name = quem; ME.id = 'registrada:' + normNome(quem);
    let ok = false;
    try{ ok = await enviar({ tipo, dados: { registradaPor: meuNome, canal: $('#rsCanal').value } }); } finally { ME.name = meuNome; ME.id = meuId; }
    if(ok) fecharModal();
  };
}

/* ---------- detalhe de uma solicitação ---------- */
function abrirSolicitacaoModal(x){
  if(!x) return;
  const gestao = ehGestao();
  if(gestao && x.status === 'nova'){ atualizarSolicitacao(x.id, { status: 'vista', vistaEm: nowISO(), vistaPor: ME.name }); x.status = 'vista'; }
  const rod = x.rodadaId ? S.rodadas.find(r => r.id === x.rodadaId) : null;
  const resp = responsavelDoCondominio(x.condominio.chave, x);
  const unidades = (x.resultado && x.resultado.length ? x.resultado : x.unidades || []);
  const html = `<div class="grade" style="margin-bottom:12px">
      <div><label>Condomínio</label><div><b>${esc(x.condominio.nome)}</b>${x.condominio.cnpj?`<div class="ajuda" style="margin:0">${esc(x.condominio.cnpj)}</div>`:''}</div></div>
      <div><label>Solicitante</label><div>${esc(x.solicitanteNome||'')}<div class="ajuda" style="margin:0">${fmtData((x.criadaEm||'').slice(0,10))}</div></div></div>
      <div><label>Tipo</label><div>${gestao && ['nova','vista','devolvida'].includes(x.status) ? `<select id="mSolTipo" class="campo" style="width:auto"><option value="implantacao" ${x.tipo!=='avulso'?'selected':''}>Implantação · 1ª análise</option><option value="avulso" ${x.tipo==='avulso'?'selected':''}>Avulso · já em carteira</option></select>` : (x.tipo==='avulso'?'Avulso · já em carteira':'Implantação · 1ª análise')}</div></div>
      <div><label>Status</label><div>${seloSol(x.status)}${x.protocolo?` <span class="pill">${esc(x.protocolo)}</span>`:''}</div></div>
      <div><label>Responsável pela pasta</label><div>${resp.nome ? `${esc(resp.nome)}<div class="ajuda" style="margin:0">${esc(resp.papel)}</div>` : '<span class="ajuda" style="margin:0">sem assistente de crédito na carteira</span>'}</div></div>
    </div>
    ${x.obs ? `<div class="nota" style="margin-bottom:12px"><b>Observações:</b> ${esc(x.obs)}</div>` : ''}
    ${x.motivoDevolucao ? `<div class="aviso" style="margin:0 0 12px"><b>Devolvida:</b> ${esc(x.motivoDevolucao)}</div>` : ''}
    <div class="tabela-wrap"><table><thead><tr><th>Unidade</th><th>Titular</th><th>CPF</th>${x.resultado && x.resultado.length ? '<th>Resultado</th>' : ''}</tr></thead><tbody>${unidades.map(u => `<tr><td><b>${esc(u.unid||'—')}</b></td><td>${esc(u.titular||'')}</td><td>${esc(u.cpf||'')}</td>${x.resultado && x.resultado.length ? `<td><span class="selo ${classeSelo(u.resultado)}">${esc(rotuloStatus(u.resultado))}</span></td>` : ''}</tr>`).join('')}</tbody></table></div>`;
  let acoes = '';
  if(x.status === 'concluida' && rod) acoes += `<button class="btn mini" id="mSolFicha">Baixar ficha</button>`;
  if(gestao){
    if(x.status !== 'concluida' && !(rod && rod.status === 'concluida')) acoes += `<button class="btn perigo mini" id="mSolExcluir">Excluir</button>`;
    if(['nova','vista','devolvida'].includes(x.status)) acoes += `<button class="btn sec mini" id="mSolDevolver">Devolver</button><button class="btn mini" id="mSolIniciar">Iniciar análise</button>`;
    if(x.status === 'em_analise' && rod) acoes += `<button class="btn mini" id="mSolAbrirRodada">Abrir rodada</button>`;
    if(x.status === 'concluida' && rod) acoes += `<button class="btn sec mini" id="mSolTicket">Abrir ticket</button>`;
  }
  abrirModal(`Solicitação · ${x.condominio.nome}`, html, acoes);
  if($('#mSolFicha')) $('#mSolFicha').onclick = () => baixarFichaPDF(rod);
  if($('#mSolTicket')) $('#mSolTicket').onclick = () => abrirTicketModal(rod, x);
  if($('#mSolAbrirRodada')) $('#mSolAbrirRodada').onclick = () => { fecharModal(); abrirEditor(JSON.parse(JSON.stringify(rod))); };
  if($('#mSolExcluir')) $('#mSolExcluir').onclick = async () => {
    if(!(await confirmar(`Excluir a solicitação de ${x.condominio.nome}${x.solicitanteNome ? ' (' + x.solicitanteNome + ')' : ''}?` + (rod ? ' O rascunho da análise também será excluído.' : '') + ' Não dá para desfazer.\nUse para testes ou lançamentos errados; para recusar um pedido, prefira Devolver.'))) return;
    try{ await excluirSolicitacao(x); }catch(e){ toast(e.message && !e.code ? e.message : dbErr(e), 5000); return; }
    if(S.rodada && S.rodada.id === x.rodadaId) S.rodada = null;
    fecharModal(); toast('Solicitação excluída.');
  };
  if($('#mSolDevolver')) $('#mSolDevolver').onclick = async () => { const motivo = window.prompt('Motivo da devolução (o solicitante vai ver):'); if(motivo === null || !motivo.trim()) return; await atualizarSolicitacao(x.id, { status: 'devolvida', motivoDevolucao: motivo.trim(), devolvidaEm: nowISO() }); fecharModal(); toast('Solicitação devolvida.'); };
  if($('#mSolIniciar')) $('#mSolIniciar').onclick = async () => {
    const tipoEsc = $('#mSolTipo') ? $('#mSolTipo').value : (x.tipo === 'avulso' ? 'avulso' : 'implantacao');
    if(tipoEsc !== x.tipo) await atualizarSolicitacao(x.id, { tipo: tipoEsc });
    const r = novaRodada(tipoEsc, { ...x.condominio });
    if(r.tipo === 'avulso') r.semAnterior = true;
    r.analista = x.solicitanteNome || ''; r.solicitacaoId = x.id; if(x.protocolo) r.protocolo = x.protocolo; r.nota = x.obs ? 'Solicitação: ' + x.obs : '';
    (x.unidades || []).forEach(u => r.unidades.push(novaUnidade(u.unid, u.titular, u.cpf)));
    try{ await salvarRodada(r); await atualizarSolicitacao(x.id, { status: 'em_analise', rodadaId: r.id, emAnaliseEm: nowISO() }); }catch(e){ toast(dbErr(e), 5000); return; }
    fecharModal(); abrirEditor(r);
  };
}
