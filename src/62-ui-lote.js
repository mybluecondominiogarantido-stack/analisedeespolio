/* ======================================================================
   Fila de acompanhamento — reanálise individual (histórico do condomínio) ou em lote
   Lote: selecionar → "Reanalisar selecionados" → anexar PDFs → lista por condomínio → Revisar / Concluir
   ====================================================================== */
function renderLote(){ renderLoteFila(); renderLoteAndamento(); if(S.lote.modalIdx !== null && S.lote.modalIdx !== undefined) renderLoteModal(S.lote.modalIdx); }
S.lote.modalIdx = null;

function renderLoteFila(){
  const f = fila();
  const venc = f.filter(i => i.vencida).length;
  const sel = S.lote.selecionados.size;
  $('#loteContagem').innerHTML = `${f.length} condomínio(s) · <b>${venc}</b> vencido(s)${sel ? ` · <b>${sel}</b> selecionado(s)` : ''}`;
  const btn = $('#btnReanalisarSel'); btn.hidden = !sel; btn.textContent = `Reanalisar ${sel} selecionado(s)`;
  const wrap = $('#loteFila');
  if(!f.length){ wrap.innerHTML = '<div class="corpo"><div class="vazio">A fila está vazia. Conclua análises de implantação ou importe a planilha de controle em Configurações.</div></div>'; renderLoteFora(); return; }
  wrap.innerHTML = `<table><thead><tr><th></th><th>Condomínio</th><th>Unidades</th><th>Última rodada</th><th>Prazo</th><th>Situação</th></tr></thead><tbody>${
    f.map(i => { const emLote = S.lote.itens.find(x => x.fila && x.fila.chave === i.chave);
      return `<tr data-chave="${esc(i.chave)}"><td><input type="checkbox" data-sel="${esc(i.chave)}" ${S.lote.selecionados.has(i.chave)?'checked':''}></td>
      <td><button class="link" data-hist="${esc(i.chave)}" style="text-decoration:none;color:var(--ink)"><b>${esc(i.condominio.nome)}</b></button>${i.condominio.cnpj?`<div class="ajuda" style="margin:0">${esc(i.condominio.cnpj)}</div>`:''}</td>
      <td>${i.unidades.length}${i.completar?' <span class="selo s-rean">completar</span>':''}</td>
      <td>${esc(i.rodada.protocolo || 'carga inicial')} · ${fmtData(i.rodada.dataAnalise)}</td>
      <td class="${i.vencida?'venc':''}">${i.vencida ? `vencida há ${-i.dias} dia(s)` : `em ${i.dias} dia(s)`}</td>
      <td>${i.rascunho ? '<span class="selo s-rasc">rascunho em aberto</span>' : emLote ? (emLote.rodada && emLote.rodada.status === 'concluida' ? '<span class="selo s-ok">reanalisado hoje</span>' : '<span class="selo s-prev">em reanálise</span>') : ''}</td></tr>`; }).join('')}</tbody></table>`;
  wrap.querySelectorAll('[data-sel]').forEach(cb => cb.onchange = () => { if(cb.checked) S.lote.selecionados.add(cb.dataset.sel); else S.lote.selecionados.delete(cb.dataset.sel); renderLoteFila(); if(S.lote.emAndamento) renderLoteAndamento(); });
  wrap.querySelectorAll('[data-hist]').forEach(b => b.onclick = () => abrirCondominioModal(b.dataset.hist));
  renderLoteFora();
}
function renderLoteFora(){
  const fora = foraDaFila(); const el = $('#loteFora');
  if(!fora.length){ el.innerHTML = ''; return; }
  el.innerHTML = `<details style="border-top:1px solid var(--linha)"><summary style="cursor:pointer;padding:11px 18px;font-size:13px;color:var(--muted);font-weight:700">Fora do acompanhamento · ${fora.length} condomínio(s) com todas as unidades excluídas ou encerradas</summary>
    <div class="tabela-wrap"><table><thead><tr><th>Condomínio</th><th>Unidades</th><th>Excluídas</th><th>Última rodada</th></tr></thead><tbody>${fora.map(i => `<tr><td><button class="link" data-hist="${esc(i.chave)}" style="text-decoration:none;color:var(--ink)"><b>${esc(i.condominio.nome)}</b></button></td><td>${i.unidades.length}</td><td>${i.unidades.filter(u=>u.resultado==='EXCLUIR').length}</td><td>${esc(i.rodada.protocolo||'carga inicial')} · ${fmtData(i.rodada.dataAnalise)}</td></tr>`).join('')}</tbody></table></div></details>`;
  el.querySelectorAll('[data-hist]').forEach(b => b.onclick = () => abrirCondominioModal(b.dataset.hist));
}
$('#btnSelVencidos').onclick = () => { fila().filter(i => i.vencida).forEach(i => S.lote.selecionados.add(i.chave)); renderLoteFila(); };
$('#btnSelNenhum').onclick = () => { S.lote.selecionados.clear(); renderLoteFila(); };
$('#btnReanalisarSel').onclick = () => { S.lote.emAndamento = true; renderLoteAndamento(); $('#loteArquivos').click(); };
$('#loteArquivos').addEventListener('change', e => { const fs = [...e.target.files]; e.target.value = ''; if(fs.length) processarLoteArquivos(fs); });

/* ---------- leitura dos PDFs ---------- */
async function processarLoteArquivos(arquivos){
  const f = fila();
  const candidatos = S.lote.selecionados.size ? f.filter(i => S.lote.selecionados.has(i.chave)) : f;
  S.lote.emAndamento = true;
  const avisos = [];
  for(const arq of arquivos){
    try{
      const txt = await pdfParaTexto(arq);
      if(!ehRelatorioVouch(txt)){ avisos.push(`${arq.name}: não parece o relatório consolidado do Vouch — ignorado.`); continue; }
      const leitura = lerVouch(txt);
      const ident = identificarCondominio(leitura, candidatos) || (candidatos !== f ? identificarCondominio(leitura, f) : null);
      const item = { arquivo: arq.name, leitura, textos: { vouch: txt }, ident, fila: ident ? ident.item : null, rodada: null, dev: { vouch: leitura.devedores, ant: [] } };
      if(ident){
        const ja = S.lote.itens.findIndex(x => x.fila && x.fila.chave === ident.item.chave);
        if(ja >= 0 && S.lote.itens[ja].rodada && S.lote.itens[ja].rodada.status === 'concluida'){ avisos.push(`${arq.name}: ${ident.item.condominio.nome} já foi reanalisado nesta sessão — ignorado.`); continue; }
        montarRodadaDoItem(item, ident.item);
        if(ja >= 0) S.lote.itens[ja] = item; else S.lote.itens.push(item);
        if(!S.lote.selecionados.has(ident.item.chave)) S.lote.selecionados.add(ident.item.chave);
      } else S.lote.itens.push(item);
    }catch(err){ avisos.push(`${arq.name}: não deu para ler (${err.message}).`); }
  }
  S.lote.avisos = avisos;
  renderLote();
}
function montarRodadaDoItem(item, filaItem){
  const r = rodadaDeAcompanhamento(filaItem.rodada);
  r.condominio = { ...filaItem.condominio };
  if(!r.condominio.cnpj && item.leitura.cnpj){ r.condominio.cnpj = item.leitura.cnpj; r.condominio.chave = filaItem.chave; }
  r.vouch = { corte: item.leitura.corte, emissao: item.leitura.emissao, totalTaxas: item.leitura.totalTaxas, totalUnidades: item.leitura.totalUnidades, lidas: item.leitura.lidas, conferido: item.leitura.conferido, arquivo: item.arquivo };
  item.fila = filaItem; item.rodada = r;
  recalcular(r, item.dev, { vouch: true, ant: false });
}
const resultadoAnterior = (it, u) => { const prev = (it.fila.rodada.unidades||[]).find(p => (p.cpf && u.cpf && soDigitos(p.cpf) === soDigitos(u.cpf)) || (normUnid(p.unid) === normUnid(u.unid) && (!p.titular || !u.titular || normNome(p.titular) === normNome(u.titular)))); return prev ? prev.resultado : null; };
const ehExcecao = (it, u) => { const ant = resultadoAnterior(it, u); return (ant && ant !== u.resultado) || (u.cas.vouch && u.cas.vouch.modo === 'nome') || !u.cas.vouch || u.pendente || u.completar || !!u.titularAuto; };

/* ---------- lista da reanálise em andamento ---------- */
function renderLoteAndamento(){
  const wrap = $('#loteAndamento');
  if(!S.lote.emAndamento && !S.lote.itens.length){ wrap.innerHTML = ''; return; }
  const f = fila();
  const selecionados = [...S.lote.selecionados].map(ch => f.find(i => i.chave === ch)).filter(Boolean);
  const semDono = S.lote.itens.filter(it => !it.rodada);
  const linhas = selecionados.map(fi => {
    const it = S.lote.itens.find(x => x.fila && x.fila.chave === fi.chave);
    if(!it) return `<tr><td><b>${esc(fi.condominio.nome)}</b></td><td colspan="3"><span class="selo s-rasc">aguardando relatório do Vouch</span></td><td>${fi.unidades.length}</td><td class="acoes"><button class="btn sec mini" data-anexar>Anexar</button></td></tr>`;
    const r = it.rodada, s = resumoRodada(r), i = S.lote.itens.indexOf(it);
    const exc = r.unidades.filter(u => ehExcecao(it, u)).length;
    const concluida = r.status === 'concluida';
    return `<tr><td><b>${esc(fi.condominio.nome)}</b><div class="ajuda" style="margin:0">${esc(it.arquivo)}</div></td>
      <td>${it.leitura.conferido ? `<span class="selo s-ok">leitura conferida</span>` : `<span class="selo s-exc">leitura divergente</span>`}<div class="ajuda" style="margin:2px 0 0">até ${esc(it.leitura.corte||'?')}${it.ident && it.ident.modo !== 'CNPJ' ? ' · identificado pelo nome' + (it.ident.ambiguo ? ', confira' : '') : ''}</div></td>
      <td>${s.excluir ? `<span class="selo s-exc">${s.excluir} excluir</span> ` : ''}<span class="selo s-rean">${s.rean + s.prev} permanece(m)</span>${s.enc ? ` <span class="selo s-enc">${s.enc} encerrada(s)</span>` : ''}</td>
      <td>${exc ? `<span class="selo s-rean">${exc} a revisar</span>` : '<span class="ajuda" style="margin:0">sem exceções</span>'}</td>
      <td>${s.total}</td>
      <td class="acoes">${concluida ? `<span class="selo s-ok">${esc(r.protocolo)}</span><button class="btn sec mini" data-ficha="${i}">Baixar ficha</button>`
        : `<button class="btn sec mini" data-revisar="${i}">Revisar</button><button class="btn mini" data-concluir="${i}" ${!CAN_WRITE?'disabled':''}>Concluir e baixar ficha</button>`}</td></tr>`;
  }).join('');
  const nConc = S.lote.itens.filter(it => it.rodada && it.rodada.status === 'concluida').length;
  wrap.innerHTML = `<div class="card"><header><h2>Reanálise em andamento</h2><div class="acoes"><span class="pill">${selecionados.length} condomínio(s) · <b>${nConc}</b> concluído(s)</span><button class="btn sec mini" id="btnLoteMais">Anexar relatórios</button><button class="btn perigo mini" id="btnLoteCancelar">${nConc ? 'Encerrar lote' : 'Cancelar'}</button></div></header>
    <div class="corpo" style="padding-top:10px">
      ${(S.lote.avisos||[]).map(a => `<div class="aviso" style="margin:0 0 8px">${esc(a)}</div>`).join('')}
      ${selecionados.length ? `<div class="tabela-wrap"><table><thead><tr><th>Condomínio</th><th>Relatório do Vouch</th><th>Resultado</th><th>Revisar</th><th>Unid.</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>` : '<div class="vazio">Selecione condomínios na fila acima ou anexe os relatórios do Vouch: o módulo identifica o condomínio pelo cabeçalho.</div>'}
      ${semDono.length ? `<div class="aviso" style="margin-top:10px"><b>Relatórios sem condomínio na fila:</b></div>${semDono.map(it => { const i = S.lote.itens.indexOf(it); return `<div class="acoes" style="margin-top:8px"><span>${esc(it.leitura.condominio || it.arquivo)}</span><select class="campo" data-escolher="${i}" style="width:auto;min-width:240px"><option value="">Escolha o condomínio da fila…</option>${f.map((x,n) => `<option value="${n}">${esc(x.condominio.nome)}</option>`).join('')}</select><button class="btn perigo mini" data-descartar="${i}">Descartar</button></div>`; }).join('')}` : ''}
    </div></div>`;
  $('#btnLoteMais').onclick = () => $('#loteArquivos').click();
  wrap.querySelectorAll('[data-anexar]').forEach(b => b.onclick = () => $('#loteArquivos').click());
  $('#btnLoteCancelar').onclick = async () => { const abertos = S.lote.itens.filter(it => it.rodada && it.rodada.status !== 'concluida').length; if(abertos && !(await confirmar(`${abertos} condomínio(s) ainda não concluído(s) serão descartados. Continuar?`))) return; S.lote.itens = []; S.lote.avisos = []; S.lote.emAndamento = false; S.lote.selecionados.clear(); renderLote(); };
  wrap.querySelectorAll('[data-escolher]').forEach(sel => sel.onchange = () => { const it = S.lote.itens[+sel.dataset.escolher]; const x = f[+sel.value]; if(!x) return; it.ident = { modo: 'manual', score: 1 }; montarRodadaDoItem(it, x); S.lote.selecionados.add(x.chave); renderLote(); });
  wrap.querySelectorAll('[data-descartar]').forEach(b => b.onclick = () => { S.lote.itens.splice(+b.dataset.descartar, 1); renderLote(); });
  wrap.querySelectorAll('[data-ficha]').forEach(b => b.onclick = () => baixarFichaPDF(S.lote.itens[+b.dataset.ficha].rodada));
  wrap.querySelectorAll('[data-revisar]').forEach(b => b.onclick = () => renderLoteModal(+b.dataset.revisar));
  wrap.querySelectorAll('[data-concluir]').forEach(b => b.onclick = () => concluirItemLote(+b.dataset.concluir));
}
async function concluirItemLote(i){
  const it = S.lote.itens[i]; const r = it.rodada; const s = resumoRodada(r);
  if(!(await confirmar(`Concluir a reanálise de ${r.condominio.nome}?\n${s.excluir} a excluir · ${s.rean + s.prev} permanecem.\nDepois de concluída, a rodada não pode ser editada.`))) return;
  try{ await concluirRodada(r); await salvarEvidencias(r.id, { textos: it.textos, dev: it.dev }); toast('Rodada ' + r.protocolo + ' concluída.'); if(S.lote.modalIdx === i){ S.lote.modalIdx = null; fecharModal(); } renderLote(); await baixarFichaPDF(r); }
  catch(e){ toast(e.message || dbErr(e), 6000); }
}
/* revisão de um condomínio do lote, em modal com os cartões de unidade */
function renderLoteModal(i){
  const it = S.lote.itens[i]; if(!it || !it.rodada) return;
  const r = it.rodada, s = resumoRodada(r), concluida = r.status === 'concluida';
  const abertos = new Set($$('#modal details[open]').map(d => d.dataset.uid));
  const primeira = S.lote.modalIdx !== i;
  S.lote.modalIdx = i;
  const cards = r.unidades.map(u => { const exc = ehExcecao(it, u); return cardUnidade(u, r, it.dev, 'lote:' + i, { destaque: exc, aberto: primeira ? exc : abertos.has(u.id), anterior: resultadoAnterior(it, u) }); }).join('');
  const html = `<p class="ajuda" style="margin:0 0 10px">${esc(it.arquivo)} · Vouch até ${esc(it.leitura.corte||'?')} · ${it.leitura.conferido ? 'leitura conferida com o total do relatório' : '<b style="color:var(--red)">leitura divergente do total impresso</b>'} · em destaque: mudou de status, não localizado, casamento só por nome, pendência ou cadastro a completar.</p>
    <div class="resumo"><span class="pill">Unidades <b>${s.total}</b></span><span class="pill">Excluir <b>${s.excluir}</b></span><span class="pill">Permanecem <b>${s.rean + s.prev}</b></span>${s.enc?`<span class="pill">Encerradas <b>${s.enc}</b></span>`:''}</div>${cards}`;
  const acoes = concluida ? `<span class="selo s-ok">${esc(r.protocolo)}</span><button class="btn mini" id="mLoteFicha">Baixar ficha</button>` : `<button class="btn mini" id="mLoteConcluir" ${!CAN_WRITE?'disabled':''}>Concluir e baixar ficha</button>`;
  const m = $('#modal');
  if(m.hidden || !m.querySelector('.caixa')){ abrirModal(r.condominio.nome + ' · reanálise', html, acoes); m.querySelector('[data-fechar]').addEventListener('click', () => { S.lote.modalIdx = null; }); }
  else { m.querySelector('.caixa .corpo').innerHTML = html; }
  if($('#mLoteConcluir')) $('#mLoteConcluir').onclick = () => concluirItemLote(i);
  if($('#mLoteFicha')) $('#mLoteFicha').onclick = () => baixarFichaPDF(r);
}
