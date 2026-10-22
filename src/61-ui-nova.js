/* ======================================================================
   Nova análise (editor de rodada: implantação ou acompanhamento de um condomínio)
   ====================================================================== */
function renderNovaLista(){
  const lista = $('#novaLista'), editor = $('#novaEditor');
  lista.hidden = true; editor.hidden = !S.rodada;
}
async function abrirEditor(r){
  S.rodada = r; S.dev = { vouch: [], ant: [] }; S.textos = { vouch:'', ant:'', email:'' };
  if(r.id){ try{ const ev = await carregarEvidencias(r.id); if(ev){ S.textos = { vouch:'', ant:'', email:'', ...(ev.textos||{}) }; S.dev = { vouch: [], ant: [], ...(ev.dev||{}) }; } }catch(_){} }
  $$('#docsGrade input[type=file]').forEach(i => i.value = '');
  ['docVouch','docAnt'].forEach(id => { const d = $('#'+id); d.classList.remove('ok','erro'); });
  mostrarAba('nova'); renderNovaLista(); renderEditor();
}
function fecharEditor(){ S.rodada = null; renderNovaLista(); renderBadges(); mostrarAba(S.abaAnterior && S.abaAnterior !== 'nova' ? S.abaAnterior : 'sol'); }

function renderEditor(){
  const r = S.rodada; if(!r) return;
  const set = (id, v, auto) => { const el = $(id); el.value = v ?? ''; if(auto) el.dataset.auto = auto; else delete el.dataset.auto; };
  set('#razao', r.condominio.nome, r.condominio.auto); set('#cnpj', r.condominio.cnpj, r.condominio.auto);
  set('#inicio', r.idadeGarantia, r.idadeAuto); set('#analista', r.analista, r.analistaAuto);
  set('#bi', r.bi ? r.bi.valor : '', r.biAuto); set('#dataAnalise', r.dataAnalise); set('#nota', r.nota);
  $$('#sinalBi button').forEach(b => b.classList.toggle('ativo', b.dataset.sinal === ((r.bi && r.bi.sinal) || '-')));
  $('#tipoRotulo').textContent = r.tipo === 'acompanhamento' ? 'Acompanhamento · reanálise' : r.tipo === 'avulso' ? 'Avulso · sinalização da Cobrança' : 'Implantação · 1ª análise';
  $('#tipoRotulo').className = 'selo ' + (r.tipo === 'acompanhamento' ? 's-rean' : 's-prev');
  $('#tipoAjuda').textContent = r.tipo === 'acompanhamento' ? 'Acompanhamento: reanálise, só o Vouch entra (3+ taxas exclui; abaixo disso, mantida).' : r.tipo === 'avulso' ? 'Avulso: condomínio já em carteira, regras 1 a 5; sem relatório anterior por padrão.' : 'Implantação: 1ª análise, regras 1 a 5.';
  $('#semAnterior').checked = !!r.semAnterior; $('#semBi').checked = !!r.semBi; $('#semVouch').checked = !!r.semVouch;
  $('#relVouch').value = S.textos.vouch; $('#relAdmin').value = S.textos.ant;
  $('#sinal').value = '';
  $('#textoRegras').innerHTML = TEXTO_REGRAS;
  const acomp = r.tipo === 'acompanhamento';
  $('#itemAnt').style.display = acomp ? 'none' : ''; $('#itemBi').style.display = acomp ? 'none' : ''; $('#dispVouch').style.display = acomp ? 'none' : '';
  $('#dicaDocs').textContent = acomp ? 'Anexe o PDF do Vouch — as unidades vêm da análise anterior' : 'Anexe os relatórios ou marque quando o condomínio não tiver · os campos preenchem sozinhos';
  ['docVouch','docAnt'].forEach((id, i) => { const t = [S.textos.vouch, S.textos.ant][i]; $('#'+id).classList.toggle('ok', !!t.trim()); });
  renderDocBi();
  recalcular(r, S.dev, relatoriosLidos());
  renderDiagnostico(); renderEditorUnidades(); renderEditorResumo(); renderFichaPreview(); renderSteps();
}
/* documentos obrigatórios: Vouch, relatório anterior e BI (na reanálise, só o Vouch); cada um pode ser dispensado pela caixa de marcação */
function documentosFaltando(r){
  const acomp = r.tipo === 'acompanhamento', f = [];
  if(!S.textos.vouch.trim() && !(r.semVouch && !acomp)) f.push({ id: 'docVouch', nome: 'Inadimplência MyBlue (Vouch)' });
  if(!acomp && !S.textos.ant.trim() && !r.semAnterior) f.push({ id: 'docAnt', nome: 'Inadimplência anterior' });
  if(!acomp && !r.semBi && !(r.bi && r.bi.valor !== null && r.bi.valor !== undefined && r.bi.valor !== '')) f.push({ id: 'docBi', nome: 'Resultado do Power BI' });
  return f;
}
function renderSteps(){
  const r = S.rodada; if(!r) return;
  const faltando = documentosFaltando(r);
  ['docVouch','docAnt','docBi'].forEach(id => { const d = $('#'+id); d.classList.toggle('falta', faltando.some(x => x.id === id) && r.status !== 'concluida');
    d.classList.toggle('dispensado', (id === 'docVouch' && r.semVouch && !S.textos.vouch.trim()) || (id === 'docAnt' && r.semAnterior && !S.textos.ant.trim()) || (id === 'docBi' && r.semBi)); });
  const feitos = [!faltando.length, !!r.condominio.nome, r.unidades.length > 0 && !r.unidades.some(u => u.pendente && !u.override)];
  const atual = feitos.findIndex(f => !f);
  [1,2,3].forEach(n => { const s = $('#step'+n); s.classList.toggle('feito', feitos[n-1]); s.classList.toggle('atual', n-1 === (atual < 0 ? 2 : atual)); s.querySelector('.bola').textContent = feitos[n-1] ? '✓' : n; });
}
function renderEditorResumo(){
  const r = S.rodada; if(!r) return;
  const s = resumoRodada(r);
  const travada = r.status === 'concluida';
  $('#novaResumo').innerHTML = `<span class="pill">${esc(r.protocolo || 'sem protocolo')}</span><span class="pill">${tipoRodadaTxt(r)}</span>
    <span class="pill">Sinalizados <b>${s.total}</b></span><span class="pill">Mantidas <b>${s.prev + s.rean}</b></span><span class="pill">Excluir <b>${s.excluir}</b></span>${s.pendentes?`<span class="pill" style="color:#b57a12">Pendências <b>${s.pendentes}</b></span>`:''}
    <span style="flex:1"></span>
    ${travada ? `<button class="btn sec mini" id="btnTicketEditor">Abrir ticket</button>` : ''}
    <button class="btn sec mini" id="btnFecharEditor">${travada?'Fechar':'Salvar e fechar'}</button>
    ${travada ? '' : `${r.id && S.rodadas.some(x => x.id === r.id) ? '<button class="btn perigo mini" id="btnExcluirRasc">Excluir rascunho</button>' : ''}<button class="btn sec mini" id="btnSalvarRasc">Salvar rascunho</button><button class="btn mini" id="btnConcluir" ${!CAN_WRITE?'disabled':''}>Concluir análise</button>`}`;
  if($('#btnTicketEditor')) $('#btnTicketEditor').onclick = () => abrirTicketModal(r, r.solicitacaoId ? S.solicitacoes.find(x => x.id === r.solicitacaoId) : null);
  $('#btnFecharEditor').onclick = async () => { if(!travada){ try{ if(r.condominio.nome || r.unidades.length){ await salvarRodada(r); await salvarEvidencias(r.id, { textos: S.textos, dev: S.dev }); } }catch(e){ toast(dbErr(e), 5000); return; } } fecharEditor(); };
  $('#btnFecharEditor').textContent = travada ? '← Voltar' : '← Salvar e voltar';
  if(!travada){
    if($('#btnExcluirRasc')) $('#btnExcluirRasc').onclick = async () => {
      if(!(await confirmar(`Excluir o rascunho de ${r.condominio.nome || 'condomínio sem nome'}? Os documentos lidos também saem. Não dá para desfazer.` + (r.solicitacaoId ? '\nA solicitação volta para a lista, pronta para iniciar de novo.' : '')))) return;
      clearTimeout(salvarTimers.nova);
      try{ await excluirRascunho(r); }catch(e){ toast(e.message && !e.code ? e.message : dbErr(e), 5000); return; }
      fecharEditor(); toast('Rascunho excluído.');
    };
    $('#btnSalvarRasc').onclick = async () => { try{ await salvarRodada(r); await salvarEvidencias(r.id, { textos: S.textos, dev: S.dev }); toast('Rascunho salvo.'); }catch(e){ toast(dbErr(e), 5000); } };
    $('#btnConcluir').onclick = async () => {
      try{
        const falta = documentosFaltando(r);
        if(falta.length){ renderSteps(); toast('Falta documento obrigatório: ' + falta.map(x => x.nome).join(', ') + '. Anexe ou marque que o condomínio não tem.', 7000); return; }
        const s2 = resumoRodada(r);
        if(!(await confirmar(`Concluir a análise de ${r.condominio.nome}?\n${s2.excluir} a excluir · ${s2.prev + s2.rean} mantida(s) em acompanhamento.\nDepois de concluída, a análise não pode ser editada.`))) return;
        await concluirRodada(r); await salvarEvidencias(r.id, { textos: S.textos, dev: S.dev });
        renderEditor();
        // a ficha só é necessária para formalizar exclusão da garantia; sem exclusão, fica disponível em "Baixar ficha"
        if(s2.excluir){ toast('Análise ' + r.protocolo + ' concluída. Baixando a ficha para formalizar a exclusão.', 5000); await baixarFichaPDF(r); }
        else toast('Análise ' + r.protocolo + ' concluída, sem exclusão. A ficha fica disponível em “Baixar ficha” se precisar.', 6000);
        if(window.claude && !DB._local && await confirmar('Abrir o ticket para quem guarda a ficha na pasta?')) abrirTicketModal(r, r.solicitacaoId ? S.solicitacoes.find(x => x.id === r.solicitacaoId) : null);
      }catch(e){ toast(e.message || dbErr(e), 6000); }
    };
  }
}
function renderEditorUnidades(preservarAberto){
  const r = S.rodada; if(!r) return;
  const abertos = preservarAberto ? new Set($$('#unidadesWrap details[open]').map(d => d.dataset.uid)) : new Set();
  const wrap = $('#unidadesWrap');
  $('#addEspolios').open = !r.unidades.length && r.status !== 'concluida'; $('#addEspolios').style.display = r.status === 'concluida' ? 'none' : '';
  if(!r.unidades.length){ wrap.innerHTML = '<div class="vazio">Nenhum espólio ainda. Use “Adicionar espólios” logo abaixo.</div>'; renderSteps(); return; }
  wrap.innerHTML = r.unidades.map(u => cardUnidade(u, r, S.dev, 'nova', { aberto: abertos.has(u.id), destaque: u.pendente || u.completar || (u.cas.vouch && u.cas.vouch.modo === 'nome') })).join('');
  const pend = r.unidades.filter(u => u.pendente && !u.override).length;
  if(pend && r.status !== 'concluida') wrap.insertAdjacentHTML('beforeend', `<div class="aviso">${pend} pendência(s) da regra 5.5 impedem a conclusão. Anexe o insumo que falta ou faça o ajuste manual com motivo.</div>`);
  renderSteps(); renderEditorResumo();
}
function renderFichaPreview(){ if(S.rodada) $('#fichaPreview').innerHTML = fichaHTML(S.rodada); }
function renderDiagnostico(){
  const r = S.rodada; if(!r) return;
  const item = (titulo, campo) => {
    const txt = campo === 'vouch' ? S.textos.vouch : S.textos.ant;
    if(!txt.trim()) return `<p class="ajuda"><b>${titulo}:</b> nenhum relatório carregado.</p>`;
    const lista = S.dev[campo] || [];
    if(!lista.length) return `<div class="aviso"><b>${titulo}:</b> nenhum devedor reconhecido. Ou o PDF é escaneado (sem texto), ou o layout é diferente do previsto. Revise o texto extraído.</div>`;
    const casados = r.unidades.filter(u => u.esc[campo] !== null && u.esc[campo] !== undefined).length;
    const conf = campo === 'vouch' && r.vouch ? (r.vouch.conferido ? ` · conferido com o total do relatório (${r.vouch.totalTaxas} taxas em ${r.vouch.totalUnidades} unidades)` : ` · <b style="color:var(--red)">leitura divergente do total impresso (${r.vouch.lidas} lidas de ${r.vouch.totalTaxas})</b>`) : '';
    const emDia = lista.filter(b => b.nadaConsta).length;
    const fv = campo === 'vouch' ? falhasVouch(r.vouch, r).length : 0;
    return `<div class="${campo==='vouch' && r.vouch && (!r.vouch.conferido || fv) ? 'aviso' : 'ok'}"><b>${titulo}:</b> ${lista.length - emDia} devedor(es) com cobrança em aberto${emDia ? ` · ${emDia} unidade(s) em dia (nada consta)` : ''} · ${casados} de ${r.unidades.length} espólios casados${conf}${r.vouch && r.vouch.corte && campo==='vouch' ? ' · consolidado até ' + esc(r.vouch.corte) : ''}${campo === 'vouch' ? htmlCriteriosVouch(r.vouch, r) : ''}
      <details style="margin-top:6px"><summary style="cursor:pointer;font-size:12.5px">Ver devedores encontrados</summary><ul style="margin:6px 0 0;padding-left:18px;font-size:12.5px">${lista.map(b => `<li>${esc(b.nome)}${b.unidadeTxt||b.unidade?' — '+esc(b.unidadeTxt||b.unidade):''}${b.cpf?' — '+esc(b.cpf):''} — <b>${b.cobrancas.filter(c=>c.incluir!==false).length}</b> taxa(s)</li>`).join('')}</ul></details></div>`;
  };
  $('#diagnostico').innerHTML = item('Vouch','vouch') + (r.tipo === 'acompanhamento' ? '' : item('Administradora anterior','ant'));
}
function renderDocBi(){
  const st = $('#docBiStatus'); const r = S.rodada;
  if(!S.bi.base || !S.bi.base.length){ st.textContent = 'Nenhuma base carregada — suba o Excel do dia'; return; }
  const m = r && r.condominio.nome ? casarBaseBi(S.bi.base, r.condominio.nome) : null;
  st.textContent = `Base de ${fmtData((S.bi.enviadoEm||'').slice(0,10))} · ${S.bi.base.length} condomínios` + (m ? ` · casado: ${m.item.nome}${m.ambiguo?' (conferir)':''}` : (r && r.condominio.nome ? ' · condomínio não encontrado' : ''));
  $('#docBi').classList.toggle('ok', !!m);
}

/* preenche um campo da rodada só se ainda estiver vazio ou marcado como automático */
function autoPreencher(campoEl, chave, valor, marca, alvo, chaveAuto){
  if(!valor && valor !== 0) return;
  const el = $(campoEl);
  if(el.value.trim() && !el.dataset.auto) return;
  el.value = valor; el.dataset.auto = marca;
  if(alvo) alvo[chave] = valor; if(alvo && chaveAuto) alvo[chaveAuto] = marca;
}
function aplicarBaseBi(){
  const r = S.rodada; if(!r || !S.bi.base.length || !r.condominio.nome) return;
  const m = casarBaseBi(S.bi.base, r.condominio.nome);
  renderDocBi();
  if(!m){ $('#statusBiVal').textContent = 'Condomínio não encontrado na base do BI — confira a razão social ou preencha à mão.'; return; }
  if(m.item.meses !== null) autoPreencher('#inicio', 'idadeGarantia', m.item.meses, 'bi', r, 'idadeAuto');
  const bi = $('#bi');
  if(!bi.value.trim() || bi.dataset.auto){ bi.value = m.item.resultado; bi.dataset.auto = 'bi'; r.bi = { valor: m.item.resultado, sinal: m.item.sinal }; r.biAuto = 'bi'; $$('#sinalBi button').forEach(x => x.classList.toggle('ativo', x.dataset.sinal === m.item.sinal)); }
  $('#statusBiVal').textContent = `Base do BI: ${m.item.nome} → ${m.item.meses!==null?m.item.meses+' meses':'idade n/d'}, ${m.item.sinal}${fmtBRL(m.item.resultado)}.${m.ambiguo?' ⚠ há condomínios de nome parecido — confira.':''}`;
}

/* aplica a extração conforme a origem do documento */
function processarTexto(origem, txt, nomeArquivo){
  const r = S.rodada; if(!r) return;
  const st = { vouch: $('#docVouch'), ant: $('#docAnt') }[origem];
  const span = st ? st.querySelector('span') : document.createElement('span');
  if(origem === 'vouch'){
    S.textos.vouch = txt;
    if(ehRelatorioVouch(txt)){
      const v = lerVouch(txt);
      S.dev.vouch = v.devedores;
      r.vouch = resumoVouch(v, nomeArquivo);
      if(v.condominio){ autoPreencher('#razao', 'nome', v.condominio, 'vouch', r.condominio, 'auto'); autoPreencher('#cnpj', 'cnpj', v.cnpj, 'vouch', r.condominio, 'auto'); r.condominio.chave = chaveCond(r.condominio.nome, r.condominio.cnpj); }
      const fv = falhasVouch(r.vouch, r).length;
      span.textContent = `${v.inadimplentes} inadimplente(s) de ${v.unidadesListadas} unidade(s) · ${v.lidas} taxas` + (v.conferido ? ' · conferido' : v.totalTaxas !== null ? ` · divergente do total (${v.totalTaxas})` : '') + (v.corte ? ' · até ' + v.corte : '') + (fv ? ` · ${fv} informação(ões) faltando` : '');
      st.classList.toggle('erro', !v.conferido); st.classList.toggle('atencao', v.conferido && fv > 0);
    } else {
      S.dev.vouch = extrairDevedores(txt, $('#soValor').checked);
      const cab = lerCabecalhoGenerico(txt);
      if(cab.condominio){ autoPreencher('#razao', 'nome', cab.condominio, 'vouch', r.condominio, 'auto'); autoPreencher('#cnpj', 'cnpj', cab.cnpj, 'vouch', r.condominio, 'auto'); r.condominio.chave = chaveCond(r.condominio.nome, r.condominio.cnpj); }
      r.vouch = { conferido: null, lidas: S.dev.vouch.reduce((s,d)=>s+d.cobrancas.length,0), totalTaxas: null, arquivo: nomeArquivo || '' };
      span.textContent = `${S.dev.vouch.length} devedor(es) (leitura genérica — não é o relatório consolidado do Vouch)`;
    }
    aplicarBaseBi();
  } else if(origem === 'ant'){
    S.textos.ant = txt; S.dev.ant = extrairDevedores(txt, $('#soValor').checked);
    const suspeito = S.dev.ant.length <= 1 || S.dev.ant.some(d => d.cobrancas.length > 60);
    span.innerHTML = !S.dev.ant.length ? '<b style="color:var(--red)">Formato não reconhecido: nenhuma unidade encontrada.</b> As unidades ficam com pendência (relatório anterior não lido), sem supor que não havia débito. Informe as taxas à mão ou envie o arquivo para incluirmos o formato.'
      : suspeito ? `<b style="color:#b57a12">${S.dev.ant.length} devedor(es) reconhecido(s) — leitura suspeita, confira as unidades.</b>` : `${S.dev.ant.length} devedor(es) reconhecido(s)`;
    if(!S.dev.ant.length) toast('Relatório anterior: formato não reconhecido. As unidades ficam com pendência, sem supor ausência de débito.', 7000);
  } else if(origem === 'email'){
    S.textos.email = txt;
    const e = lerEmail(txt);
    if(e.remetente) autoPreencher('#analista', 'analista', e.remetente, 'email', r, 'analistaAuto');
    if(e.espolios.length){
      const vistos = new Set(r.unidades.map(u => soDigitos(u.cpf) || normUnid(u.unid)+'|'+normNome(u.titular)));
      e.espolios.forEach(x => { const k = soDigitos(x.cpf) || normUnid(x.unid)+'|'+normNome(x.titular); if(!vistos.has(k)){ r.unidades.push(novaUnidade(x.unid, x.titular, x.cpf)); vistos.add(k); } });
    }
    span.textContent = `${e.espolios.length} espólio(s)${e.remetente ? ' · analista: ' + e.remetente : ''}`;
  }
  if(st) st.classList.add('ok');
  $('#relVouch').value = S.textos.vouch; $('#relAdmin').value = S.textos.ant;
  recalcular(r, S.dev, relatoriosLidos());
  renderDiagnostico(); renderEditorUnidades(true); renderFichaPreview(); renderSteps(); agendarSalvar('nova');
}

$('#docsGrade').addEventListener('change', async e => {
  const inp = e.target; if(!inp.dataset.doc) return;
  const f = inp.files[0]; if(!f) return;
  const origem = inp.dataset.doc;
  if(origem === 'bi'){ await subirBaseBi(f); aplicarBaseBi(); renderFichaPreview(); return; }
  const span = inp.parentElement.querySelector('span'); span.textContent = 'Lendo ' + f.name + '…';
  /* anexou o relatório: desmarca o "não há" do mesmo documento */
  const disp = { vouch: ['semVouch', '#semVouch'], ant: ['semAnterior', '#semAnterior'] }[origem];
  if(disp && S.rodada && S.rodada[disp[0]]){ S.rodada[disp[0]] = false; $(disp[1]).checked = false; }
  try{
    if(origem === 'ant' && /\.(xlsx|xls|csv)$/i.test(f.name)){
      const pl = await lerPlanilhaAnterior(f); processarTexto('ant', pl.texto, f.name);
      const nCob = (S.dev.ant || []).reduce((s, d) => s + d.cobrancas.length, 0);
      span.innerHTML = `Planilha padrão: <b>${pl.unidades} unidade(s)</b> e <b>${pl.linhas} linha(s)</b> lidas · ${nCob} competência(s) contadas. Confira com o total do relatório original.`;
      return;
    }
    const txt = await pdfParaTexto(f); processarTexto(origem, txt, f.name);
  }
  catch(err){ span.textContent = 'Não deu para ler o arquivo: ' + err.message; inp.parentElement.classList.add('erro'); }
});
async function subirBaseBi(f){
  const ehPlanilha = /\.(xlsx|xls|csv)$/i.test(f.name);
  try{
    let base;
    if(ehPlanilha) base = baseDaPlanilha(await planilhaParaMatriz(f));
    else base = lerBaseBiTexto(await pdfParaTexto(f));
    if(!base.length){ toast('Não encontrei condomínios no arquivo. Confira se há colunas Condomínio, Idade (meses) e Resultado.', 6000); return; }
    await DB.doc(COLECOES.bi + '/atual').set({ base, enviadoEm: nowISO(), por: ME.name, arquivo: f.name });
    S.bi = { base, enviadoEm: nowISO(), por: ME.name, arquivo: f.name };
    registrarHistorico('bi_base', { condominios: base.length, arquivo: f.name });
    toast(`Base do BI carregada: ${base.length} condomínios.`);
    renderBiInfo(); renderDocBi(); renderListaCondominios();
  }catch(err){ toast('Não deu para ler o arquivo: ' + err.message, 6000); }
}

/* campos do bloco 2 */
function ligarCampo(id, fn){ $(id).addEventListener('input', e => { if(!S.rodada) return; delete e.target.dataset.auto; fn(e.target.value, S.rodada); recalcular(S.rodada, S.dev, relatoriosLidos()); renderEditorUnidades(true); renderFichaPreview(); renderSteps(); agendarSalvar('nova'); }); }
ligarCampo('#razao', (v, r) => { r.condominio.nome = v; delete r.condominio.auto; r.condominio.chave = chaveCond(v, r.condominio.cnpj); renderDocBi(); });
$('#razao').addEventListener('change', () => { if(S.rodada && S.bi.base.length) aplicarBaseBi(); });
ligarCampo('#cnpj', (v, r) => { r.condominio.cnpj = v; r.condominio.chave = chaveCond(r.condominio.nome, v); });
ligarCampo('#inicio', (v, r) => { r.idadeGarantia = v === '' ? null : +v; delete r.idadeAuto; $('#vigenciaInfo').textContent = v === '' ? '' : `Vigência: ${v} meses${+v < 6 ? ' — contrato recente (regra 5).' : '.'}`; });
ligarCampo('#analista', (v, r) => { r.analista = v; delete r.analistaAuto; });
ligarCampo('#bi', (v, r) => { r.bi = v === '' ? null : { valor: +String(v).replace(',','.'), sinal: ($('#sinalBi .ativo')||{}).dataset ? $('#sinalBi .ativo').dataset.sinal : '-' }; delete r.biAuto; });
ligarCampo('#dataAnalise', (v, r) => { r.dataAnalise = v || hojeISO(); });
ligarCampo('#nota', (v, r) => { r.nota = v; });
$('#sinalBi').addEventListener('click', e => { const b = e.target.closest('button[data-sinal]'); if(!b || !S.rodada) return; $$('#sinalBi button').forEach(x => x.classList.toggle('ativo', x === b)); const r = S.rodada; if(r.bi) r.bi.sinal = b.dataset.sinal; delete r.biAuto; delete $('#bi').dataset.auto; recalcular(r, S.dev, relatoriosLidos()); renderEditorUnidades(true); renderFichaPreview(); agendarSalvar('nova'); });
['#semAnterior','#semBi','#semVouch'].forEach(id => $(id).addEventListener('change', e => { if(!S.rodada) return; S.rodada[id.slice(1)] = e.target.checked; recalcular(S.rodada, S.dev, relatoriosLidos()); renderEditorUnidades(true); renderFichaPreview(); renderSteps(); agendarSalvar('nova'); }));

/* bloco 3: espólios */
$('#btnSinal').onclick = () => {
  const r = S.rodada; if(!r) return;
  const novas = lerSinalizacao($('#sinal').value);
  if(!novas.length){ toast('Nenhum devedor reconhecido. Cada linha precisa ter ao menos nome e sobrenome.'); return; }
  novas.forEach(x => r.unidades.push(novaUnidade(x.unid, x.titular, x.cpf)));
  $('#sinal').value = '';
  recalcular(r, S.dev, relatoriosLidos()); renderEditorUnidades(true); renderFichaPreview(); agendarSalvar('nova');
};
$('#btnAddUnid').onclick = () => { const r = S.rodada; if(!r) return; r.unidades.push(novaUnidade()); renderEditorUnidades(true); renderFichaPreview(); };
$('#btnRecontar').onclick = () => { const r = S.rodada; if(!r) return; recalcular(r, S.dev, relatoriosLidos()); renderEditorUnidades(true); renderFichaPreview(); toast('Taxas recontadas.'); };
$('#btnReprocessar').onclick = () => {
  const r = S.rodada; if(!r) return;
  if($('#relVouch').value.trim()) processarTexto('vouch', $('#relVouch').value, r.vouch && r.vouch.arquivo);
  if($('#relAdmin').value.trim()) processarTexto('ant', $('#relAdmin').value);
  toast('Textos reprocessados.');
};
$('#soValor').addEventListener('change', () => { if(S.rodada && S.textos.ant.trim()) processarTexto('ant', S.textos.ant); });
$('#btnImprimir').onclick = () => { if(S.rodada) imprimirFicha(S.rodada); };
$('#btnBaixarFicha').onclick = () => { if(S.rodada) baixarFichaPDF(S.rodada); };
