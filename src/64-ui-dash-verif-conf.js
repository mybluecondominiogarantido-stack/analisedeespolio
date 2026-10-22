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
    <div class="tile ${solicitacoesNovas().length + venc.length ? 'alerta' : ''}"><small>Pendentes</small><strong>${solicitacoesNovas().length + venc.length}</strong><em>${solicitacoesNovas().length} solicitação(ões) não vista(s) · ${venc.length} reanálise(s) vencida(s) na fila</em></div>
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
  $('#dashExclusoes').innerHTML = topExc.length ? `<table><thead><tr><th>Condomínio</th><th>Sinalizados</th><th>Excluídos</th><th>Rodadas</th></tr></thead><tbody>${topExc.map(e => `<tr><td>${esc(e.nome)}</td><td>${e.sin}</td><td><b>${e.exc}</b></td><td>${e.rod}</td></tr>`).join('')}</tbody></table>` : '<div class="corpo"><div class="vazio">Sem rodadas concluídas em ' + ano + '.</div></div>';
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
  $('#dashGrafico').innerHTML = `<div class="legenda"><span><i style="background:#d8463b"></i>Excluir</span><span><i style="background:#199cb1"></i>Mantida · em acompanhamento</span></div>
    <svg class="graf" viewBox="0 0 ${W} ${H}" width="100%" aria-label="Unidades classificadas por mês"><g stroke="#e4ecef">${grade.map(v => `<line x1="${lw}" x2="${W-10}" y1="${y(v)}" y2="${y(v)}"/>`).join('')}</g>${grade.map(v => `<text x="${lw-6}" y="${y(v)+4}" text-anchor="end">${v}</text>`).join('')}${barras}</svg>`;
}
$('#btnResumo').onclick = () => {
  const mes = $('#resumoMes').value; if(!mes) return;
  const conc = rodadasConcluidas().filter(r => r.origem !== 'carga' && mesDe(r.dataAnalise) === mes);
  const us = conc.flatMap(r => r.unidades || []);
  const f = fila(); const venc = f.filter(i => i.vencida);
  const n = x => us.filter(u => u.resultado === x).length;
  const html = `<div class="ficha" id="resumoFicha" style="padding:20px 24px"><div class="f-titulo" style="font-size:20px">Resumo mensal · Análise de Espólio · ${MESES_FULL[+mes.slice(5)-1]}/${mes.slice(0,4)}</div><div class="f-sub">Cobrança / Coordenação · gerado em ${fmtData(hojeISO())}</div>
    <div class="f-secao">Rodadas concluídas no mês</div>
    <table class="f-tab"><thead><tr><th>Protocolo</th><th>Condomínio</th><th>Tipo</th><th>Data</th><th>Sinalizados</th><th>Excluídos</th><th>Mantidas</th></tr></thead><tbody>${conc.length ? conc.map(r => { const s = r.resumo || resumoRodada(r); return `<tr><td>${esc(r.protocolo)}</td><td>${esc(r.condominio.nome)}</td><td>${tipoRodadaTxt(r)}</td><td>${fmtData(r.dataAnalise)}</td><td>${s.total}</td><td>${s.excluir}</td><td>${s.prev+s.rean}</td></tr>`; }).join('') : '<tr><td colspan="7" style="text-align:center">Nenhuma rodada concluída no mês.</td></tr>'}</tbody></table>
    <div class="f-caixas" style="grid-template-columns:repeat(4,1fr)"><div class="f-caixa"><h4>Rodadas</h4><p>${conc.length}</p></div><div class="f-caixa cx-EXCLUIR"><h4>Excluídos</h4><p>${n('EXCLUIR')}</p></div><div class="f-caixa"><h4>Mantidas em acompanhamento</h4><p>${n('PREVENTIVO')+n('REANÁLISE')}</p></div><div class="f-caixa cx-REAN"><h4>Fila vencida hoje</h4><p>${venc.length} condomínio(s)</p></div></div>
    ${venc.length ? `<div class="f-secao">Reanálises vencidas</div><p>${venc.map(i => `${esc(i.condominio.nome)} (desde ${fmtData(i.prazo)})`).join('; ')}</p>` : ''}</div>
    <div class="acoes" style="margin-top:10px"><button class="btn sec mini" id="btnResumoPdf">Baixar resumo em PDF</button></div>`;
  $('#resumoMensal').innerHTML = html;
  $('#btnResumoPdf').onclick = async () => { const el = $('#resumoFicha'); if(typeof html2pdf === 'undefined'){ window.print(); return; } await html2pdf().set({ margin: 8, filename: `Resumo Espolio ${mes}.pdf`, html2canvas: { scale: 2, backgroundColor:'#fff' }, jsPDF: { unit:'mm', format:'a4', orientation:'landscape' } }).from(el).save(); };
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
