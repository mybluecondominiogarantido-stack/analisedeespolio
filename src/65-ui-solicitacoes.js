/* ======================================================================
   Solicitações de análise
   - Solicitante (implantação e analistas de Cobrança): pendentes de verificação, nova solicitação, minhas solicitações
   - Gestão: caixa de entrada, iniciar análise, devolver, verificação da implantação (SLA)
   ====================================================================== */
const STATUS_SOL = { nova:'Nova', vista:'Vista', em_analise:'Em análise', concluida:'Concluída', devolvida:'Devolvida' };
const seloSol = st => `<span class="selo ${st==='nova'?'s-exc':st==='concluida'?'s-ok':st==='devolvida'?'s-rean':st==='em_analise'?'s-prev':'s-rasc'}">${esc(STATUS_SOL[st]||st)}</span>`;
const diasDesde = iso => iso ? diasEntre(String(iso).slice(0,10), hojeISO()) : 0;

function renderSolicitacoes(){
  const el = $('#p-sol'); if(!el) return;
  el.innerHTML = ehGestao() ? htmlSolGestao() : htmlSolSolicitante();
  $('#p-minhas').innerHTML = ehGestao() ? '' : htmlListaSolicitacoes(minhasSolicitacoes(), 'Minhas solicitações', 'clique para ver o andamento e, quando concluída, a ficha', 'solicitante');
  ligarSolicitacoes();
}

/* ---------- blocos comuns ---------- */
function htmlPendentesVerificacao(modo){
  const pend = pendentesVerificacao();
  const temCarteira = (S.carteira.itens || []).length > 0;
  const linhas = pend.map(c => `<tr><td><b>${esc(c.nome)}</b>${c.cnpj?`<div class="ajuda" style="margin:0">${esc(c.cnpj)}</div>`:''}</td><td>${esc(c.comarca||'')}</td><td>${fmtData(c.inicio)}</td>
      <td class="${c.dias > 30 ? 'venc' : ''}">${c.dias} dia(s)</td><td>${c.assumido ? esc(c.assumido.por || '') : '<span class="ajuda" style="margin:0">ninguém</span>'}</td>
      <td class="acoes">${modo === 'solicitante' && !c.assumido ? `<button class="btn sec mini" data-assumir="${esc(c.chave)}">Assumir</button>` : ''}
        <button class="btn sec mini" data-semespolio="${esc(c.chave)}">Sem espólio</button>
        ${modo === 'solicitante' ? `<button class="btn mini" data-solicitar="${esc(c.chave)}">Solicitar análise</button>` : ''}</td></tr>`).join('');
  return `<div class="card"><header><h2>Verificação da implantação</h2><span class="dica">${pend.length} condomínio(s) implantado(s) aguardando verificação${S.acesso.verificacaoDesde ? ' · desde ' + fmtMesAno(S.acesso.verificacaoDesde) : ''}</span></header>
    ${!temCarteira ? '<div class="corpo"><div class="vazio">A carteira do portal ainda não foi carregada. A gestão carrega em Configurações.</div></div>'
      : pend.length ? `<div class="tabela-wrap"><table><thead><tr><th>Condomínio</th><th>Comarca</th><th>Início do contrato</th><th>Aguardando</th><th>Assumido por</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`
      : '<div class="corpo"><div class="vazio">Nenhum condomínio implantado aguardando verificação.</div></div>'}</div>`;
}
function htmlFormSolicitacao(pre){
  pre = pre || {};
  return `<div class="card" id="cardNovaSol"><header><h2>Nova solicitação de análise</h2><span class="dica">preencha as unidades com titular falecido · substitui o e-mail de sinalização</span></header>
    <div class="corpo">
      <div class="grade">
        <div><label>Condomínio</label><input type="text" id="solCond" class="campo" list="listaCarteira" value="${esc(pre.nome||'')}" placeholder="Comece a digitar"><datalist id="listaCarteira">${(S.carteira.itens||[]).map(c => `<option value="${esc(c.nome)}">`).join('')}</datalist></div>
        <div><label>CNPJ</label><input type="text" id="solCnpj" class="campo" value="${esc(pre.cnpj||'')}" placeholder="preenchido pela carteira"></div>
      </div>
      <p class="ajuda" id="solTipoInfo">${pre.nome ? esc(tipoPelaCarteira(pre.nome).texto) : 'O tipo da análise (implantação ou avulso) vem da data de início do contrato na carteira.'}</p>
      <label style="margin-top:12px">Unidades sinalizadas</label>
      <div class="tabela-wrap"><table id="solUnidades"><thead><tr><th style="width:140px">Bloco - unidade</th><th>Titular (falecido)</th><th style="width:170px">CPF</th><th></th></tr></thead><tbody></tbody></table></div>
      <div class="acoes" style="margin-top:8px"><button class="btn sec mini" id="solAddUnid">Adicionar unidade</button></div>
      <div style="margin-top:12px"><label>Observações</label><textarea id="solObs" style="min-height:70px;font-family:var(--font);font-size:13.5px" placeholder="Informações que ajudem a análise: inventário, herdeiros em contato, documentos recebidos..."></textarea></div>
      <div class="acoes" style="margin-top:12px"><button class="btn" id="solEnviar" ${!CAN_WRITE?'disabled':''}>Enviar solicitação</button><button class="btn sec" id="solLimpar">Limpar</button></div>
      <div id="solStatus"></div>
    </div></div>`;
}
/* implantação = contrato iniciado há até 120 dias (ou condomínio ainda na verificação da implantação); senão avulso */
const DIAS_IMPLANTACAO = 120;
function tipoPelaCarteira(nome){
  const c = (S.carteira.itens||[]).find(x => normCond(x.nome) === normCond(nome));
  if(!c || !c.inicio) return { tipo: 'avulso', texto: 'Condomínio fora da carteira ou sem data de início: será tratado como avulso.' };
  const dias = diasEntre(c.inicio, hojeISO());
  return dias <= DIAS_IMPLANTACAO ? { tipo: 'implantacao', texto: `Contrato iniciado em ${fmtData(c.inicio)} (${dias} dias): 1ª análise, implantação.` }
                                  : { tipo: 'avulso', texto: `Contrato iniciado em ${fmtData(c.inicio)} (${dias} dias): condomínio já em carteira, avulso.` };
}
function linhaUnidadeSol(u){ u = u || {}; return `<tr><td><input type="text" data-su="unid" value="${esc(u.unid||'')}" placeholder="A - 101"></td><td><input type="text" data-su="titular" value="${esc(u.titular||'')}" placeholder="nome completo"></td><td><input type="text" data-su="cpf" value="${esc(u.cpf||'')}" placeholder="000.000.000-00"></td><td><button class="btn perigo mini" data-su-rm>×</button></td></tr>`; }

function htmlListaSolicitacoes(lista, titulo, dica, modo){
  const linhas = lista.map(x => `<tr class="clic" data-sol="${x.id}"><td>${fmtData((x.criadaEm||'').slice(0,10))}<div class="ajuda" style="margin:0">há ${diasDesde(x.criadaEm)} dia(s)</div></td>${modo==='gestao'?`<td>${esc(x.solicitanteNome||'')}<div class="ajuda" style="margin:0">${x.tipo==='avulso'?'Avulso':'Implantação'}</div></td>`:''}<td><b>${esc(x.condominio.nome)}</b></td><td>${(x.unidades||[]).length}</td><td>${seloSol(x.status)}</td><td>${esc(x.protocolo||'—')}</td></tr>`).join('');
  return `<div class="card"><header><h2>${titulo}</h2><span class="dica">${dica}</span></header>${lista.length ? `<div class="tabela-wrap"><table><thead><tr><th>Enviada</th>${modo==='gestao'?'<th>Solicitante</th>':''}<th>Condomínio</th><th>Unid.</th><th>Status</th><th>Protocolo</th></tr></thead><tbody>${linhas}</tbody></table></div>` : '<div class="corpo"><div class="vazio">Nenhuma solicitação.</div></div>'}</div>`;
}

/* ---------- visão do solicitante ---------- */
function htmlSolSolicitante(){
  return `<div class="nota"><b>Solicitação de análise de espólio.</b> Envie a solicitação com as unidades de titular falecido. Abaixo, os condomínios implantados que ainda precisam ser verificados. O andamento fica em “Minhas solicitações”.</div>
    ${htmlFormSolicitacao()}${htmlPendentesVerificacao('solicitante')}`;
}
/* ---------- visão da gestão ---------- */
function htmlSolGestao(){
  const filtro = S.solFiltro || 'abertas';
  let lista = S.solicitacoes.slice().sort((a,b) => (b.criadaEm||'').localeCompare(a.criadaEm||''));
  if(filtro === 'abertas') lista = lista.filter(x => ['nova','vista','em_analise'].includes(x.status));
  else if(filtro !== 'todas') lista = lista.filter(x => x.status === filtro);
  const novas = solicitacoesNovas().length;
  return `<div class="filtros"><span class="pill">Novas <b>${novas}</b></span><select id="solFiltro" class="campo"><option value="abertas" ${filtro==='abertas'?'selected':''}>Abertas</option><option value="nova" ${filtro==='nova'?'selected':''}>Novas</option><option value="em_analise" ${filtro==='em_analise'?'selected':''}>Em análise</option><option value="concluida" ${filtro==='concluida'?'selected':''}>Concluídas</option><option value="devolvida" ${filtro==='devolvida'?'selected':''}>Devolvidas</option><option value="todas" ${filtro==='todas'?'selected':''}>Todas</option></select><span style="flex:1"></span><button class="btn mini" id="btnRegistrarSol" ${!CAN_WRITE?'disabled':''}>Registrar solicitação</button></div>
    ${htmlListaSolicitacoes(lista, 'Solicitações recebidas', 'clique para abrir · "Iniciar análise" cria a rodada já preenchida', 'gestao')}
    ${htmlPendentesVerificacao('gestao')}`;
}

/* ---------- eventos ---------- */
function ligarSolicitacoes(){
  const el = $('#p-sol');
  $$('#p-sol [data-sol], #p-minhas [data-sol]').forEach(tr => tr.onclick = () => abrirSolicitacaoModal(S.solicitacoes.find(x => x.id === tr.dataset.sol)));
  const sf = $('#solFiltro'); if(sf) sf.onchange = () => { S.solFiltro = sf.value; renderSolicitacoes(); };
  const br = $('#btnRegistrarSol'); if(br) br.onclick = abrirRegistrarSolicitacao;
  el.querySelectorAll('[data-assumir]').forEach(b => b.onclick = async () => { const c = S.carteira.itens.find(x => x.chave === b.dataset.assumir); await DB.collection(COLECOES.verificacoes).add({ chave: c.chave, condominio: c.nome, cnpj: c.cnpj, mes: mesDe(c.inicio), resultado: 'assumido', por: ME.name, porId: ME.id, quando: nowISO() }); toast('Você assumiu ' + c.nome + '.'); });
  el.querySelectorAll('[data-semespolio]').forEach(b => b.onclick = async () => { const c = S.carteira.itens.find(x => x.chave === b.dataset.semespolio); if(!(await confirmar(`Registrar ${c.nome} como verificado, sem espólio?`))) return; await DB.collection(COLECOES.verificacoes).add({ chave: c.chave, condominio: c.nome, cnpj: c.cnpj, mes: mesDe(c.inicio), resultado: 'sem_espolio', por: ME.name, porId: ME.id, quando: nowISO() }); registrarHistorico('verificacao', { condominio: c.nome, resultado: 'sem_espolio' }); toast(c.nome + ' registrado sem espólio.'); });
  el.querySelectorAll('[data-solicitar]').forEach(b => b.onclick = () => { const c = S.carteira.itens.find(x => x.chave === b.dataset.solicitar); const card = $('#cardNovaSol'); card.outerHTML = htmlFormSolicitacao({ nome: c.nome, cnpj: c.cnpj }); ligarFormSolicitacao(); $('#cardNovaSol').scrollIntoView({ behavior:'smooth' }); });
  ligarFormSolicitacao();
}
function ligarFormSolicitacao(){
  const card = $('#cardNovaSol'); if(!card) return;
  const tb = card.querySelector('#solUnidades tbody'); if(!tb.children.length) tb.innerHTML = linhaUnidadeSol();
  $('#solAddUnid').onclick = () => tb.insertAdjacentHTML('beforeend', linhaUnidadeSol());
  tb.addEventListener('click', e => { if(e.target.closest('[data-su-rm]')){ const tr = e.target.closest('tr'); if(tb.children.length > 1) tr.remove(); else tr.querySelectorAll('input').forEach(i => i.value = ''); } });
  $('#solCond').addEventListener('change', () => { const c = (S.carteira.itens||[]).find(x => normCond(x.nome) === normCond($('#solCond').value)); if(c && !$('#solCnpj').value.trim()) $('#solCnpj').value = c.cnpj || ''; $('#solTipoInfo').textContent = tipoPelaCarteira($('#solCond').value).texto; });
  $('#solLimpar').onclick = () => { card.outerHTML = htmlFormSolicitacao(); ligarFormSolicitacao(); };
  $('#solEnviar').onclick = async () => {
    const nome = $('#solCond').value.trim(); const cnpj = $('#solCnpj').value.trim();
    const unidades = [...tb.querySelectorAll('tr')].map(tr => ({ unid: tr.querySelector('[data-su="unid"]').value.trim(), titular: tr.querySelector('[data-su="titular"]').value.trim(), cpf: tr.querySelector('[data-su="cpf"]').value.trim() })).filter(u => u.unid || u.titular || u.cpf);
    const st = $('#solStatus');
    if(!nome){ st.innerHTML = '<div class="erro">Informe o condomínio.</div>'; return; }
    if(!unidades.length || unidades.some(u => !u.titular && !u.unid)){ st.innerHTML = '<div class="erro">Informe ao menos uma unidade com titular.</div>'; return; }
    const tipo = tipoPelaCarteira(nome).tipo;
    try{
      const c = (S.carteira.itens||[]).find(x => normCond(x.nome) === normCond(nome));
      await criarSolicitacao({ condominio: { nome: c ? c.nome : nome, cnpj: cnpj || (c ? c.cnpj : ''), chave: chaveCond(c ? c.nome : nome, cnpj || (c ? c.cnpj : '')) }, origem: tipo === 'implantacao' ? 'implantacao' : 'cobranca', tipo, unidades, obs: $('#solObs').value.trim() });
      toast('Solicitação enviada.'); renderSolicitacoes();
    }catch(e){ st.innerHTML = `<div class="erro">${esc(dbErr(e))}</div>`; }
  };
}

/* gestão registra uma solicitação que chegou por e-mail ou telefone, em nome de quem pediu */
function abrirRegistrarSolicitacao(pre){
  abrirModal('Registrar solicitação', `<div class="grade" style="margin-bottom:12px"><div><label>Quem pediu</label><input type="text" id="rsNome" class="campo" placeholder="nome da assistente ou analista"></div><div><label>Como chegou</label><select id="rsCanal" class="campo"><option value="email">E-mail</option><option value="telefone">Telefone / presencial</option><option value="outro">Outro</option></select></div></div>
    ${htmlFormSolicitacao(pre || {}).replace('id="cardNovaSol"', 'id="cardNovaSol" style="margin:0;border:0;box-shadow:none"')}`);
  ligarFormSolicitacao();
  const btn = $('#solEnviar'); btn.textContent = 'Registrar';
  const original = btn.onclick;
  btn.onclick = async () => {
    const quem = $('#rsNome').value.trim(); if(!quem){ $('#solStatus').innerHTML = '<div class="erro">Informe quem pediu.</div>'; return; }
    const meuNome = ME.name, meuId = ME.id;
    ME.name = quem; ME.id = 'registrada:' + normNome(quem);
    try{ await original(); } finally { ME.name = meuNome; ME.id = meuId; }
    if(S.solicitacoes.length){ const ultima = S.solicitacoes.slice().sort((a,b) => (b.criadaEm||'').localeCompare(a.criadaEm||''))[0]; if(ultima && ultima.solicitanteNome === quem) atualizarSolicitacao(ultima.id, { registradaPor: meuNome, canal: $('#rsCanal') ? $('#rsCanal').value : 'outro' }); }
    fecharModal();
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
    <div class="tabela-wrap"><table><thead><tr><th>Unidade</th><th>Titular</th><th>CPF</th>${x.resultado && x.resultado.length ? '<th>Resultado</th>' : ''}</tr></thead><tbody>${unidades.map(u => `<tr><td><b>${esc(u.unid||'—')}</b></td><td>${esc(u.titular||'')}</td><td>${esc(u.cpf||'')}</td>${x.resultado && x.resultado.length ? `<td><span class="selo ${classeSelo(u.resultado)}">${esc(rotuloStatus(u.resultado))}</span><div class="ajuda" style="margin:2px 0 0">Regra ${esc(u.regra||'')}</div></td>` : ''}</tr>`).join('')}</tbody></table></div>`;
  let acoes = '';
  if(x.status === 'concluida' && rod) acoes += `<button class="btn mini" id="mSolFicha">Baixar ficha</button>`;
  if(gestao){
    if(['nova','vista','devolvida'].includes(x.status)) acoes += `<button class="btn sec mini" id="mSolDevolver">Devolver</button><button class="btn mini" id="mSolIniciar">Iniciar análise</button>`;
    if(x.status === 'em_analise' && rod) acoes += `<button class="btn mini" id="mSolAbrirRodada">Abrir rodada</button>`;
    if(x.status === 'concluida' && rod) acoes += `<button class="btn sec mini" id="mSolTicket">Abrir ticket</button>`;
  }
  abrirModal(`Solicitação · ${x.condominio.nome}`, html, acoes);
  if($('#mSolFicha')) $('#mSolFicha').onclick = () => baixarFichaPDF(rod);
  if($('#mSolTicket')) $('#mSolTicket').onclick = () => abrirTicketModal(rod, x);
  if($('#mSolAbrirRodada')) $('#mSolAbrirRodada').onclick = () => { fecharModal(); abrirEditor(JSON.parse(JSON.stringify(rod))); };
  if($('#mSolDevolver')) $('#mSolDevolver').onclick = async () => { const motivo = window.prompt('Motivo da devolução (o solicitante vai ver):'); if(motivo === null || !motivo.trim()) return; await atualizarSolicitacao(x.id, { status: 'devolvida', motivoDevolucao: motivo.trim(), devolvidaEm: nowISO() }); fecharModal(); toast('Solicitação devolvida.'); };
  if($('#mSolIniciar')) $('#mSolIniciar').onclick = async () => {
    const tipoEsc = $('#mSolTipo') ? $('#mSolTipo').value : (x.tipo === 'avulso' ? 'avulso' : 'implantacao');
    if(tipoEsc !== x.tipo) await atualizarSolicitacao(x.id, { tipo: tipoEsc, origem: tipoEsc === 'implantacao' ? 'implantacao' : 'cobranca' });
    const r = novaRodada(tipoEsc, { ...x.condominio });
    if(r.tipo === 'avulso') r.semAnterior = true;
    r.analista = x.solicitanteNome || ''; r.solicitacaoId = x.id; r.nota = x.obs ? 'Solicitação: ' + x.obs : '';
    (x.unidades || []).forEach(u => r.unidades.push(novaUnidade(u.unid, u.titular, u.cpf)));
    try{ await salvarRodada(r); await atualizarSolicitacao(x.id, { status: 'em_analise', rodadaId: r.id, emAnaliseEm: nowISO() }); }catch(e){ toast(dbErr(e), 5000); return; }
    fecharModal(); abrirEditor(r);
  };
}
