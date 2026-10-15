/* ======================================================================
   Histórico e evolução
   ====================================================================== */
function renderHistorico(){
  const busca = normCond($('#histBusca').value), tipo = $('#histTipo').value, status = $('#histStatus').value, per = $('#histPeriodo').value;
  const limite = per ? somaDias(hojeISO(), -(+per)) : null;
  let lista = S.rodadas.slice().sort((a,b) => (b.dataAnalise + (b.concluidaEm||'')).localeCompare(a.dataAnalise + (a.concluidaEm||'')));
  lista = lista.filter(r => (!busca || normCond(r.condominio.nome).includes(busca) || (r.protocolo||'').toUpperCase().includes(busca))
    && (!tipo || (tipo === 'carga' ? r.origem === 'carga' : r.tipo === tipo && r.origem !== 'carga')) && (!status || r.status === status) && (!limite || r.dataAnalise >= limite));
  $('#histContagem').textContent = `${lista.length} de ${S.rodadas.length} rodadas`;
  const wrap = $('#histTabela');
  if(!lista.length){ wrap.innerHTML = '<div class="vazio">Nenhuma rodada com esses filtros.</div>'; return; }
  const tipoTxt = r => r.origem === 'carga' ? 'Carga inicial' : r.tipo === 'acompanhamento' ? 'Acompanhamento' : 'Implantação';
  wrap.innerHTML = `<table><thead><tr><th>Protocolo</th><th>Condomínio</th><th>Tipo</th><th>Data</th><th>Sinalizados</th><th>Excluídos</th><th>Status</th><th>Próxima reanálise</th></tr></thead><tbody>${
    lista.map(r => { const s = r.resumo || resumoRodada(r); const venc = r.proximaReanalise && r.proximaReanalise < hojeISO() && r.status === 'concluida';
      return `<tr class="clic" data-abrir="${r.id}"><td>${esc(r.protocolo || '—')}</td><td><b>${esc(r.condominio.nome)}</b></td><td>${tipoTxt(r)}</td><td>${fmtData(r.dataAnalise)}</td><td>${s.total}</td><td>${s.excluir}</td>
        <td><span class="selo ${r.status==='concluida'?'s-ok':'s-rasc'}">${r.status==='concluida'?'Concluída':'Rascunho'}</span></td><td class="${venc?'venc':''}">${r.status==='concluida' ? fmtData(r.proximaReanalise) + (venc ? ' · vencida' : '') : '—'}</td></tr>`; }).join('')}</tbody></table>`;
  wrap.querySelectorAll('[data-abrir]').forEach(tr => tr.onclick = () => abrirRodadaModal(S.rodadas.find(r => r.id === tr.dataset.abrir)));
  renderEvolucaoSelect();
}
['#histBusca','#histTipo','#histStatus','#histPeriodo'].forEach(id => $(id).addEventListener('input', renderHistorico));

function abrirRodadaModal(r){
  if(!r) return;
  const ultima = ultimaRodadaPorCondominio().get(r.condominio.chave);
  const ehUltima = ultima && ultima.id === r.id;
  const acoes = `<button class="btn sec mini" id="mCsv">CSV</button><button class="btn sec mini" id="mImprimir">Imprimir</button><button class="btn mini" id="mFicha">Baixar ficha</button>` +
    (r.status === 'rascunho' ? `<button class="btn sec mini" id="mContinuar">Continuar</button>` : ehUltima && fila().some(i => i.chave === r.condominio.chave) ? `<button class="btn sec mini" id="mReanalisar">Nova reanálise</button>` : '');
  abrirModal(`${r.protocolo || 'Rascunho'} · ${r.condominio.nome}`, `<div class="ficha" style="padding:18px 22px">${fichaHTML(r)}</div>
    <p class="ajuda">Criada em ${fmtData((r.criadaEm||'').slice(0,10))} por ${esc(r.criadoPorNome||'—')}${r.concluidaEm ? ` · concluída em ${fmtData(r.concluidaEm.slice(0,10))} por ${esc(r.concluidoPorNome||'—')}` : ''}${r.vouch && r.vouch.arquivo ? ` · Vouch: ${esc(r.vouch.arquivo)}` : ''}</p>
    ${r.unidades.some(u => u.override || u.encerramento) ? `<div class="card" style="margin-top:10px"><header><h2>Ajustes e encerramentos</h2></header><div class="tabela-wrap"><table><thead><tr><th>Unidade</th><th>Titular</th><th>Ajuste</th><th>Motivo</th></tr></thead><tbody>${r.unidades.filter(u => u.override || u.encerramento).map(u => `<tr><td>${esc(u.unid)}</td><td>${esc(u.titular)}</td><td>${u.override ? (u.override==='EXCLUIR'?'Excluir':'Sob análise') : 'Encerrada'}</td><td>${esc(u.motivoAjuste || (u.encerramento && u.encerramento.motivo) || '')}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`, acoes);
  $('#mFicha').onclick = () => baixarFichaPDF(r);
  $('#mImprimir').onclick = () => imprimirFicha(r);
  $('#mCsv').onclick = () => csvAcompanhamento([r], nomeArquivoSeguro(`Acompanhamento Espolio - ${r.condominio.nome}`) + '.csv');
  if($('#mContinuar')) $('#mContinuar').onclick = () => { fecharModal(); abrirEditor(JSON.parse(JSON.stringify(r))); };
  if($('#mReanalisar')) $('#mReanalisar').onclick = () => { fecharModal(); abrirEditor(rodadaDeAcompanhamento(r)); };
}

function renderEvolucaoSelect(){
  const sel = $('#evoCond'); const atual = sel.value;
  const conds = new Map(); S.rodadas.forEach(r => conds.set(r.condominio.chave, r.condominio.nome));
  sel.innerHTML = '<option value="">Escolha o condomínio</option>' + [...conds.entries()].sort((a,b) => a[1].localeCompare(b[1])).map(([k,n]) => `<option value="${esc(k)}" ${k===atual?'selected':''}>${esc(n)}</option>`).join('');
}
$('#evoCond').addEventListener('change', renderEvolucao);
function renderEvolucao(){
  const chave = $('#evoCond').value; const wrap = $('#evoTabela');
  if(!chave){ wrap.innerHTML = ''; return; }
  const rods = rodadasDoCondominio(chave).filter(r => r.status === 'concluida');
  if(!rods.length){ wrap.innerHTML = '<div class="vazio">Sem rodadas concluídas para este condomínio.</div>'; return; }
  const chaveU = u => soDigitos(u.cpf) || (normUnid(u.unid) + '|' + normNome(u.titular));
  const unidades = new Map();
  rods.forEach(r => (r.unidades||[]).forEach(u => { const k = chaveU(u); if(!unidades.has(k)) unidades.set(k, { unid: u.unid, titular: u.titular, por: {} }); unidades.get(k).por[r.id] = u; if(u.titular) unidades.get(k).titular = u.titular; if(u.unid) unidades.get(k).unid = u.unid; }));
  wrap.innerHTML = `<table><thead><tr><th>Unidade</th><th>Titular</th>${rods.map(r => `<th>${esc(r.protocolo || 'carga')}<br><span style="font-weight:600;text-transform:none">${fmtData(r.dataAnalise)}</span></th>`).join('')}</tr></thead><tbody>${
    [...unidades.values()].map(x => `<tr><td><b>${esc(x.unid||'—')}</b></td><td>${esc(x.titular||'(a completar)')}</td>${rods.map(r => { const u = x.por[r.id]; return `<td>${u ? `<span class="selo ${classeSelo(u.resultado)}">${esc(rotuloStatus(u.resultado))}</span><div class="ajuda" style="margin:2px 0 0">Vouch ${u.vouch ?? '—'}${r.tipo!=='acompanhamento' && r.origem!=='carga' ? ' · ant. ' + (u.ant ?? '—') : ''}</div>` : '<span style="color:var(--faint)">—</span>'}</td>`; }).join('')}</tr>`).join('')}</tbody></table>`;
}
