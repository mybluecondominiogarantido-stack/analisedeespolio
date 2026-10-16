/* ======================================================================
   Histórico por condomínio (modal aberto a partir da fila) e ficha de uma rodada
   ====================================================================== */
const tipoRodadaTxt = r => r.origem === 'carga' ? 'Carga inicial' : r.tipo === 'acompanhamento' ? 'Acompanhamento' : r.tipo === 'avulso' ? 'Avulso' : 'Implantação';

/* condomínios com rodada concluída que não estão mais na fila (tudo excluído ou encerrado) */
function foraDaFila(){
  const naFila = new Set(fila().map(i => i.chave));
  const out = [];
  ultimaRodadaPorCondominio().forEach((r, chave) => { if(!naFila.has(chave)) out.push({ chave, condominio: r.condominio, rodada: r, unidades: r.unidades || [] }); });
  return out.sort((a,b) => b.rodada.dataAnalise.localeCompare(a.rodada.dataAnalise));
}

function evolucaoHTML(rods){
  if(!rods.length) return '<div class="vazio">Sem rodadas concluídas.</div>';
  const chaveU = u => soDigitos(u.cpf) || (normUnid(u.unid) + '|' + normNome(u.titular));
  const unidades = new Map();
  rods.forEach(r => (r.unidades||[]).forEach(u => { const k = chaveU(u); if(!unidades.has(k)) unidades.set(k, { unid: u.unid, titular: u.titular, por: {} }); unidades.get(k).por[r.id] = u; if(u.titular) unidades.get(k).titular = u.titular; if(u.unid) unidades.get(k).unid = u.unid; }));
  return `<div class="tabela-wrap"><table><thead><tr><th>Unidade</th><th>Titular</th>${rods.map(r => `<th>${esc(r.protocolo || 'carga')}<br><span style="font-weight:600;text-transform:none">${fmtData(r.dataAnalise)}</span></th>`).join('')}</tr></thead><tbody>${
    [...unidades.values()].map(x => `<tr><td><b>${esc(x.unid||'—')}</b></td><td>${esc(x.titular||'(a completar)')}</td>${rods.map(r => { const u = x.por[r.id]; return `<td>${u ? `<span class="selo ${classeSelo(u.resultado)}">${esc(rotuloStatus(u.resultado))}</span><div class="ajuda" style="margin:2px 0 0">Vouch ${u.vouch ?? '—'}${r.tipo!=='acompanhamento' && r.origem!=='carga' ? ' · ant. ' + (u.ant ?? '—') : ''}</div>` : '<span style="color:var(--faint)">—</span>'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function abrirCondominioModal(chave){
  const rods = rodadasDoCondominio(chave);
  if(!rods.length) return;
  const nome = rods[rods.length-1].condominio.nome;
  const concluidas = rods.filter(r => r.status === 'concluida');
  const emFila = fila().find(i => i.chave === chave);
  const html = `
    <p class="ajuda" style="margin:0 0 12px">${emFila ? `Em acompanhamento · ${emFila.unidades.length} unidade(s) ativa(s) · próxima reanálise ${fmtData(emFila.prazo)}${emFila.vencida ? ' <b style="color:var(--red)">(vencida)</b>' : ''}` : 'Fora do acompanhamento: todas as unidades foram excluídas ou encerradas.'}</p>
    <div class="card"><header><h2>Rodadas</h2><span class="dica">${rods.length} no total · clique para ver a ficha</span></header>
      <div class="tabela-wrap"><table><thead><tr><th>Protocolo</th><th>Tipo</th><th>Data</th><th>Sinalizados</th><th>Excluídos</th><th>Status</th><th>Próxima reanálise</th><th></th></tr></thead><tbody>${
        rods.slice().reverse().map(r => { const s = r.resumo || resumoRodada(r); return `<tr class="clic" data-ver="${r.id}"><td><b>${esc(r.protocolo || '—')}</b></td><td>${tipoRodadaTxt(r)}</td><td>${fmtData(r.dataAnalise)}</td><td>${s.total}</td><td>${s.excluir}</td>
          <td><span class="selo ${r.status==='concluida'?'s-ok':'s-rasc'}">${r.status==='concluida'?'Concluída':'Rascunho'}</span></td><td>${r.status==='concluida' ? fmtData(r.proximaReanalise) : '—'}</td>
          <td class="acoes">${r.status==='concluida' ? `<button class="btn sec mini" data-baixar="${r.id}">Baixar ficha</button>` : `<button class="btn sec mini" data-continuar="${r.id}">Continuar</button>`}</td></tr>`; }).join('')}</tbody></table></div></div>
    <div class="card"><header><h2>Evolução das unidades</h2><span class="dica">resultado e taxas no Vouch, rodada a rodada</span></header><div class="corpo">${evolucaoHTML(concluidas)}</div></div>`;
  const acoes = emFila ? `<button class="btn mini" id="mReanalisarCond">Nova reanálise</button>` : '';
  const m = abrirModal(nome, html, acoes);
  m.querySelectorAll('[data-ver]').forEach(tr => tr.addEventListener('click', e => { if(e.target.closest('button')) return; const r = rods.find(x => x.id === tr.dataset.ver); abrirRodadaModal(r, () => abrirCondominioModal(chave)); }));
  m.querySelectorAll('[data-baixar]').forEach(b => b.onclick = () => baixarFichaPDF(rods.find(x => x.id === b.dataset.baixar)));
  m.querySelectorAll('[data-continuar]').forEach(b => b.onclick = () => { fecharModal(); abrirEditor(JSON.parse(JSON.stringify(rods.find(x => x.id === b.dataset.continuar)))); });
  if(emFila) $('#mReanalisarCond').onclick = () => { fecharModal(); abrirEditor(rodadaDeAcompanhamento(emFila.rodada)); };
}

function abrirRodadaModal(r, voltar){
  if(!r) return;
  const acoes = `${voltar ? '<button class="btn sec mini" id="mVoltar">← Condomínio</button>' : ''}<button class="btn sec mini" id="mCsv">CSV</button><button class="btn sec mini" id="mImprimir">Imprimir</button><button class="btn mini" id="mFicha">Baixar ficha</button>` +
    (r.status === 'rascunho' ? `<button class="btn sec mini" id="mContinuar">Continuar</button>` : '');
  abrirModal(`${r.protocolo || 'Rascunho'} · ${r.condominio.nome}`, `<div class="ficha" style="padding:18px 22px">${fichaHTML(r)}</div>
    <p class="ajuda">Criada em ${fmtData((r.criadaEm||'').slice(0,10))} por ${esc(r.criadoPorNome||'—')}${r.concluidaEm ? ` · concluída em ${fmtData(r.concluidaEm.slice(0,10))} por ${esc(r.concluidoPorNome||'—')}` : ''}${r.vouch && r.vouch.arquivo ? ` · Vouch: ${esc(r.vouch.arquivo)}` : ''}</p>
    ${r.unidades.some(u => u.override || u.encerramento) ? `<div class="card" style="margin-top:10px"><header><h2>Ajustes e encerramentos</h2></header><div class="tabela-wrap"><table><thead><tr><th>Unidade</th><th>Titular</th><th>Ajuste</th><th>Motivo</th></tr></thead><tbody>${r.unidades.filter(u => u.override || u.encerramento).map(u => `<tr><td>${esc(u.unid)}</td><td>${esc(u.titular)}</td><td>${u.override ? (u.override==='EXCLUIR'?'Excluir':'Sob análise') : 'Encerrada'}</td><td>${esc(u.motivoAjuste || (u.encerramento && u.encerramento.motivo) || '')}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`, acoes);
  if(voltar) $('#mVoltar').onclick = voltar;
  $('#mFicha').onclick = () => baixarFichaPDF(r);
  $('#mImprimir').onclick = () => imprimirFicha(r);
  $('#mCsv').onclick = () => csvAcompanhamento([r], nomeArquivoSeguro(`Acompanhamento Espolio - ${r.condominio.nome}`) + '.csv');
  if($('#mContinuar')) $('#mContinuar').onclick = () => { fecharModal(); abrirEditor(JSON.parse(JSON.stringify(r))); };
}
