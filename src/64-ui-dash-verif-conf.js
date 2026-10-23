/* ======================================================================
   Dashboard, resumo mensal, configurações
   ====================================================================== */
function renderDashboard(){
  const hoje = hojeISO(), mes = mesDe(hoje);
  const conc = rodadasConcluidas().filter(r => r.origem !== 'carga');
  const doMes = conc.filter(r => mesDe(r.dataAnalise) === mes);
  const unidadesMes = doMes.flatMap(r => r.unidades || []);
  const f = fila(); const venc = f.filter(i => i.vencida);
  const n = (arr, x) => arr.filter(u => u.resultado === x).length;
  const pan = panoramaUnidades();
  const pv = pendentesVerificacao(); const impl = { atrasados: pv.filter(c => c.atrasado).length, doMes: pv.filter(c => !c.atrasado).length };
  $('#dashTiles').innerHTML = `
    <div class="tile hero"><small>Espólios sinalizados</small><strong>${pan.total}</strong><em>total de unidades desde o início</em></div>
    <div class="tile"><small>Análises do mês</small><strong>${doMes.length}</strong><em>${doMes.filter(r=>r.tipo==='implantacao').length} implantação · ${doMes.filter(r=>r.tipo==='avulso').length} avulso · ${doMes.filter(r=>r.tipo==='acompanhamento').length} acompanhamento</em></div>
    <div class="tile ${solicitacoesEmAberto().length + venc.length ? 'alerta' : ''}"><small>Pendentes</small><strong>${solicitacoesEmAberto().length + venc.length}</strong><em>${solicitacoesEmAberto().length} solicitação(ões) sem análise concluída · ${venc.length} reanálise(s) vencida(s) na fila</em></div>
    <div class="tile"><small>Excluídas</small><strong>${pan.excluidas}</strong><em>da garantia · acumulado</em></div>
    <div class="tile ${impl.atrasados?'alerta':''}"><small>Implantação atrasada</small><strong>${impl.atrasados}</strong><em>de meses anteriores, sem verificação · ${impl.doMes} do mês aguardando</em></div>`;
  renderGraficoMensal(conc);
  const top = f.slice(0, 8);
  $('#dashFila').innerHTML = top.length ? `<table><thead><tr><th>Condomínio</th><th>Unid.</th><th>Última rodada</th><th>Prazo</th></tr></thead><tbody>${top.map(i => `<tr class="clic" data-lote="${esc(i.chave)}"><td>${esc(i.condominio.nome)}</td><td>${i.unidades.length}</td><td>${fmtData(i.rodada.dataAnalise)}</td><td class="${i.vencida?'venc':''}">${i.vencida ? `vencida há ${-i.dias} dia(s)` : `em ${i.dias} dia(s)`}</td></tr>`).join('')}</tbody></table>` : '<div class="corpo"><div class="vazio">Fila vazia.</div></div>';
  $('#dashFila').querySelectorAll('[data-lote]').forEach(tr => tr.onclick = () => { S.lote.selecionados.add(tr.dataset.lote); mostrarAba('lote'); });
  const ano = hoje.slice(0,4);
  const porCond = new Map();
  conc.filter(r => r.dataAnalise.startsWith(ano)).forEach(r => { const k = r.condominio.chave; const e = porCond.get(k) || { nome: r.condominio.nome, sin: 0, exc: 0, rod: 0 }; e.rod++; e.sin += (r.unidades||[]).length; e.exc += n(r.unidades||[], 'EXCLUIR'); porCond.set(k, e); });
  const topExc = [...porCond.values()].sort((a,b) => b.exc - a.exc || b.sin - a.sin).slice(0, 8);
  $('#dashExclusoes').innerHTML = topExc.length ? `<table><thead><tr><th>Condomínio</th><th>Sinalizados</th><th>Excluídos</th><th>Análises</th></tr></thead><tbody>${topExc.map(e => `<tr><td>${esc(e.nome)}</td><td>${e.sin}</td><td><b>${e.exc}</b></td><td>${e.rod}</td></tr>`).join('')}</tbody></table>` : '<div class="corpo"><div class="vazio">Sem análises concluídas em ' + ano + '.</div></div>';
  if(!$('#resumoMes').value) $('#resumoMes').value = mes;
}
function renderGraficoMensal(conc){
  const meses = []; const d = new Date(); d.setDate(1);
  for(let i = 5; i >= 0; i--){ const x = new Date(d.getFullYear(), d.getMonth() - i, 1); meses.push(x.getFullYear() + '-' + String(x.getMonth()+1).padStart(2,'0')); }
  const dados = meses.map(m => { const us = conc.filter(r => mesDe(r.dataAnalise) === m).flatMap(r => r.unidades || []); return { m, exc: us.filter(u=>u.resultado==='EXCLUIR').length, rean: 0, prev: us.filter(u=>u.resultado==='PREVENTIVO' || u.resultado==='REANÁLISE').length }; });
  const max = Math.max(5, ...dados.map(x => x.exc + x.rean + x.prev));
  const W = 900, H = 230, top = 20, base = 200, lw = 40;
  const y = v => base - (v / max) * (base - top);
  const passo = Math.max(1, Math.ceil(max / 4));
  const grade = []; for(let v = 0; v <= max; v += passo) grade.push(v);
  const bw = 70, gap = (W - lw - 20 - 6*bw) / 6;
  const barras = dados.map((x, i) => {
    const x0 = lw + 10 + i * (bw + gap) + gap/2; const tot = x.exc + x.rean + x.prev;
    const seg = (v, y0, cor, rx) => v ? `<rect x="${x0}" y="${y(y0+v)}" width="${bw}" height="${Math.max(0, y(y0) - y(y0+v) - 2)}" fill="${cor}" ${rx?'rx="4"':''}><title>${MESES[+x.m.slice(5)-1]}/${x.m.slice(0,4)}: ${v}</title></rect>` : '';
    return `<g>${seg(x.prev, 0, '#199cb1')}${seg(x.rean, x.prev, '#d98a1b')}${seg(x.exc, x.prev + x.rean, '#d8463b', true)}<text x="${x0+bw/2}" y="${base+18}" text-anchor="middle">${MESES[+x.m.slice(5)-1]}</text>${tot?`<text x="${x0+bw/2}" y="${y(tot)-6}" text-anchor="middle" fill="#3c5660" font-weight="700">${tot}</text>`:''}</g>`;
  }).join('');
  $('#dashGrafico').innerHTML = `<div class="legenda"><span><i style="background:#d8463b"></i>Excluir</span><span><i style="background:#199cb1"></i>Em acompanhamento</span></div>
    <svg class="graf" viewBox="0 0 ${W} ${H}" width="100%" aria-label="Unidades classificadas por mês"><g stroke="#e4ecef">${grade.map(v => `<line x1="${lw}" x2="${W-10}" y1="${y(v)}" y2="${y(v)}"/>`).join('')}</g>${grade.map(v => `<text x="${lw-6}" y="${y(v)+4}" text-anchor="end">${v}</text>`).join('')}${barras}</svg>`;
}
/* ---------- resumo mensal: números do mês (com o mês anterior), unidades excluídas, análises e a situação de hoje ---------- */
function numerosDoMes(mes){
  const conc = rodadasConcluidas().filter(r => r.origem !== 'carga' && mesDe(r.dataAnalise) === mes);
  const us = conc.flatMap(r => r.unidades || []);
  return { conc, recebidas: S.solicitacoes.filter(x => mesDe(x.criadaEm) === mes).length, atendidas: S.solicitacoes.filter(x => x.status === 'concluida' && mesDe(x.concluidaEm) === mes).length,
           excluidas: us.filter(u => u.resultado === 'EXCLUIR').length, acomp: us.filter(u => u.resultado === 'PREVENTIVO' || u.resultado === 'REANÁLISE').length,
           porTipo: t => conc.filter(r => r.tipo === t).length };
}
/* pdf: a "Situação hoje" começa em página nova quando a lista de vencidas é longa, e a tabela repete o cabeçalho a cada página */
function htmlResumoMensal(mes, pdf){
  const d = new Date(+mes.slice(0, 4), +mes.slice(5, 7) - 2, 1), mesAnt = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const MES_CURTO = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'], antTxt = MES_CURTO[d.getMonth()] + '/' + d.getFullYear();
  const a = numerosDoMes(mes), b = numerosDoMes(mesAnt);
  const vari = (x, y) => { const df = x - y; return `<em>${df === 0 ? 'igual a ' + antTxt : (df > 0 ? '+' : '−') + Math.abs(df) + ' em relação a ' + antTxt}</em>`; };
  const kpi = (rot, x, y, extra, cls) => `<div class="f-kpi ${cls || ''}"><small>${rot}</small><strong>${x}</strong>${extra ? `<em>${extra}</em>` : ''}${vari(x, y)}</div>`;
  const tipos = [['implantacao', 'implantação'], ['avulso', 'avulso'], ['acompanhamento', 'reanálise']].map(([t, n]) => `${a.porTipo(t)} ${n}`).join(' · ');
  const excl = a.conc.flatMap(r => (r.unidades || []).filter(u => u.resultado === 'EXCLUIR').map(u => ({ r, u })));
  const f = fila(), venc = f.filter(i => i.vencida), em30 = f.filter(i => !i.vencida && i.dias <= 30), noPrazo = f.length - venc.length - em30.length;
  const logo = $('.brand img') ? $('.brand img').getAttribute('src') : '';
  const vazio = (n, txt) => `<tr><td colspan="${n}" style="text-align:center;color:#6b7f88">${txt}</td></tr>`;
  const QUEBRA = '<div class="html2pdf__page-break"></div>', LONGA = 6, POR_PAGINA = [19, 25];
  const quebraHoje = pdf && venc.length > LONGA ? QUEBRA : '';
  const tabVenc = lista => `<table class="f-tab" style="margin-top:12px"><thead><tr><th>Reanálise vencida · condomínio</th><th style="width:11%">Unidades</th><th style="width:13%">Venceu em</th><th style="width:13%">Dias de atraso</th><th style="width:24%">Analista de cobrança</th></tr></thead><tbody>${
      lista.map(i => `<tr><td>${esc(i.condominio.nome)}</td><td>${i.unidades.length}</td><td>${fmtData(i.prazo)}</td><td><b>${-i.dias}</b></td><td>${esc((carteiraDe(i.condominio) || {}).analistaCobranca || '—')}</td></tr>`).join('')}</tbody></table>`;
  const partes = []; if(pdf && venc.length > LONGA){ let k = 0; while(k < venc.length){ const n = POR_PAGINA[partes.length ? 1 : 0]; partes.push(venc.slice(k, k + n)); k += n; } } else if(venc.length) partes.push(venc);
  const tabelaVencidas = partes.map(tabVenc).join(QUEBRA);
  return `<div class="ficha" id="resumoFicha" style="padding:20px 24px">${logo ? `<img src="${logo}" class="f-logo" alt="MyBlue">` : ''}
    <div class="f-titulo" style="font-size:20px">Resumo mensal · Análise de Espólio · ${MESES_FULL[+mes.slice(5) - 1]}/${mes.slice(0, 4)}</div>
    <div class="f-sub">Cobrança / Coordenação · gerado em ${fmtData(hojeISO())}</div>
    <div class="f-secao">Números do mês</div>
    <div class="f-kpis">${kpi('Solicitações recebidas', a.recebidas, b.recebidas, `${a.atendidas} atendida(s) no mês`)}${kpi('Análises concluídas', a.conc.length, b.conc.length, tipos)}${kpi('Unidades excluídas', a.excluidas, b.excluidas, '', 'exc')}${kpi('Unidades em acompanhamento', a.acomp, b.acomp, 'nas análises do mês')}</div>
    <div class="f-secao">Unidades excluídas no mês</div>
    <table class="f-tab"><thead><tr><th style="width:24%">Condomínio</th><th style="width:10%">Unidade</th><th style="width:24%">Titular</th><th style="width:13%">Protocolo</th><th style="width:10%">Tipo</th><th>Motivo</th></tr></thead><tbody>${
      excl.length ? excl.map(({ r, u }) => `<tr><td>${esc(r.condominio.nome)}</td><td><b>${esc(u.unid || '—')}</b></td><td>${esc(u.titular || '—')}</td><td>${esc(r.protocolo)}</td><td>${tipoRodadaTxt(r)}</td><td>${esc(motivoCurto(u, r))}</td></tr>`).join('') : vazio(6, 'Nenhuma unidade excluída no mês.')}</tbody></table>
    <div class="f-secao">Análises concluídas no mês</div>
    <table class="f-tab"><thead><tr><th style="width:13%">Protocolo</th><th>Condomínio</th><th style="width:11%">Tipo</th><th style="width:11%">Data</th><th style="width:9%">Unidades</th><th style="width:9%">Excluir</th><th style="width:15%">Em acompanhamento</th></tr></thead><tbody>${
      a.conc.length ? a.conc.map(r => { const s = r.resumo || resumoRodada(r); return `<tr><td>${esc(r.protocolo)}</td><td>${esc(r.condominio.nome)}</td><td>${tipoRodadaTxt(r)}</td><td>${fmtData(r.dataAnalise)}</td><td>${s.total}</td><td>${s.excluir}</td><td>${s.prev + s.rean}</td></tr>`; }).join('') : vazio(7, 'Nenhuma análise concluída no mês.')}</tbody></table>
    ${quebraHoje}<div class="f-secao">Situação hoje · ${fmtData(hojeISO())}</div>
    <div class="f-kpis hoje"><div class="f-kpi exc"><small>Reanálises vencidas</small><strong>${venc.length}</strong></div><div class="f-kpi aviso"><small>Vencem em até 30 dias</small><strong>${em30.length}</strong></div><div class="f-kpi"><small>No prazo</small><strong>${noPrazo}</strong></div><div class="f-kpi"><small>Solicitações aguardando análise</small><strong>${solicitacoesEmAberto().length}</strong></div></div>
    ${tabelaVencidas}
    <div class="f-rodape"><span>MyBlue Condomínio Garantido | contato@myblue.com.br | www.myblue.com.br | 0800 085 9277</span><span>Resumo ${MESES_FULL[+mes.slice(5) - 1]}/${mes.slice(0, 4)} · gerado em ${fmtData(hojeISO())}</span></div></div>`;
}
$('#btnResumo').onclick = () => {
  const mes = $('#resumoMes').value; if(!mes) return;
  $('#resumoMensal').innerHTML = htmlResumoMensal(mes, false) + `<div class="acoes" style="margin-top:10px"><button class="btn sec mini" id="btnResumoPdf">Baixar resumo em PDF</button></div>`;
  $('#btnResumoPdf').onclick = async () => {
    if(typeof html2pdf === 'undefined'){ window.print(); return; }
    const t = document.createElement('div'); t.innerHTML = htmlResumoMensal(mes, true);
    await baixarPDFdeHTML(t.firstElementChild.innerHTML, `Resumo Espolio ${mes}.pdf`);
  };
};

/* ---------- configurações ---------- */
function renderConfCarteira(){
  const c = S.carteira;
  $('#confCarteira').innerHTML = `<p class="ajuda" style="margin:0 0 8px">${c.itens && c.itens.length ? `<b>${c.itens.length} condomínios</b> · atualizada em ${fmtData((c.atualizadoEm||'').slice(0,10))} · ${c.origem === 'banco' ? 'espelhada do cadastro de condomínios do portal, atualiza sozinha' : 'origem: ' + esc(c.origem||'')}` : (DB._local ? 'Carteira não carregada. Fora do portal, importe um JSON ou Excel do cadastro.' : 'Carteira ainda não espelhada do cadastro do portal.')}</p>
    ${DB._local ? `<div class="doc"><div class="ico">CAD</div><div><b>Importar carteira (JSON ou Excel)</b><span>só em modo local · no portal a carteira vem do cadastro de condomínios</span></div><input type="file" accept=".json,.xlsx,.xls,.csv" id="confCarteiraArquivo"></div>` : ''}
    <div class="grade" style="margin-top:12px"><div><label>Setor padrão do ticket</label><input type="text" id="confTicketSetor" class="campo" value="${esc(S.acesso.ticketSetor||'Crédito')}"></div></div>
    <p class="ajuda">O ticket vai para a assistente de crédito do condomínio; sem assistente na carteira, vai para a assistente de implantação que solicitou. Quem não tem login no portal não recebe: o ticket fica na fila do setor, com aviso à liderança.</p>`;
  if($('#confCarteiraArquivo')) $('#confCarteiraArquivo').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if(!f) return; try{ const n = await importarCarteiraArquivo(f); toast(`Carteira importada: ${n} condomínios.`); }catch(err){ toast('Não deu para importar: ' + err.message, 6000); } };
  $('#confTicketSetor').onchange = e => gravarDoc(COLECOES.meta + '/acesso', { ticketSetor: e.target.value.trim() || 'Crédito' }, S.acesso);
}
function renderConf(){
  renderConfCarteira();
  $('#confRegras').innerHTML = TEXTO_REGRAS;
  renderBiInfo();
}
function renderBiInfo(){
  const el = $('#confBiInfo'); if(!el) return;
  el.innerHTML = S.bi.base && S.bi.base.length ? `Base atual: <b>${S.bi.base.length} condomínios</b> · enviada em ${fmtData((S.bi.enviadoEm||'').slice(0,10))} por ${esc(S.bi.por||'—')}${S.bi.arquivo?' · '+esc(S.bi.arquivo):''}. Vale para toda a equipe.` : 'Nenhuma base do BI carregada.';
  if(S.rodada) renderDocBi();
}
$('#confBiArquivo').addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if(f) await subirBaseBi(f); });
$('#confCargaArquivo').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if(!f) return;
  const st = $('#confCargaStatus'); st.innerHTML = '<p class="ajuda">Lendo a planilha…</p>';
  try{
    const grupos = await lerPlanilhaUnificada(f);
    if(grupos){
      const nU = grupos.reduce((s, g) => s + g.unidades.length, 0), nExc = grupos.reduce((s, g) => s + g.unidades.filter(u => /exclu/i.test(u.status)).length, 0);
      if(!(await confirmar(`Base unificada: ${grupos.length} condomínios e ${nU} unidades (${nExc} excluídas da garantia).\nCada condomínio entra na Fila de acompanhamento com prazo de 90 dias a partir da última verificação.\nCondomínios que já estão na base não duplicam.`))) { st.innerHTML = ''; return; }
      const r = await importarPlanilhaUnificada(grupos);
      st.innerHTML = `<div class="ok">Importado: ${r.rodadas} condomínio(s) e ${r.unidades} unidade(s)${r.pulados ? ` (${r.pulados} condomínio(s) já existiam e foram mantidos)` : ''}.</div>`;
      return;
    }
    const linhas = await lerPlanilhaControle(f);
    if(!linhas.length){ st.innerHTML = '<div class="aviso">Não encontrei abas com a coluna "Condomínio".</div>'; return; }
    const com = linhas.filter(l => l.temEspolio).length;
    if(!(await confirmar(`Encontrei ${linhas.length} condomínios em ${new Set(linhas.map(l=>l.aba)).size} abas; ${com} com espólio entram na fila.\nLinhas já importadas não duplicam.`))) { st.innerHTML = ''; return; }
    const r = await importarPlanilhaControle(linhas);
    st.innerHTML = `<div class="ok">Importado: ${r.rodadas} condomínio(s) com espólio entraram na fila${r.pulados ? ` (${r.pulados} já existiam)` : ''}.</div>`;
  }catch(err){ st.innerHTML = `<div class="erro">Não deu para importar: ${esc(err.message)}</div>`; }
});
$('#btnPlanilhaAcomp').onclick = () => { const rods = fila().map(i => ({ ...i.rodada, unidades: i.unidades })); if(!rods.length){ toast('Fila vazia.'); return; } csvAcompanhamento(rods, `Acompanhamento Espolio - fila ${hojeISO()}.csv`); };
