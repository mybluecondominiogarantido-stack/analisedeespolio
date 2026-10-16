/* ======================================================================
   Fila de acompanhamento — reanálise de vários condomínios em lote (só o Vouch entra)
   ====================================================================== */
function renderLote(){ renderLoteFila(); renderLoteRevisao(); }
function renderLoteFila(){
  const f = fila();
  const venc = f.filter(i => i.vencida).length;
  $('#loteContagem').innerHTML = `${f.length} condomínio(s) na fila · <b>${venc}</b> vencido(s) · <b>${S.lote.selecionados.size}</b> selecionado(s)`;
  const wrap = $('#loteFila');
  if(!f.length){ wrap.innerHTML = '<div class="corpo"><div class="vazio">A fila está vazia. Conclua análises de implantação ou importe a planilha de controle em Configurações.</div></div>'; renderLoteFora(); return; }
  wrap.innerHTML = `<table><thead><tr><th></th><th>Condomínio</th><th>Unidades</th><th>Última rodada</th><th>Prazo</th><th>Situação</th></tr></thead><tbody>${
    f.map(i => `<tr data-chave="${esc(i.chave)}"><td><input type="checkbox" data-sel="${esc(i.chave)}" ${S.lote.selecionados.has(i.chave)?'checked':''}></td>
      <td><button class="link" data-hist="${esc(i.chave)}" style="text-decoration:none;color:var(--ink)"><b>${esc(i.condominio.nome)}</b></button>${i.condominio.cnpj?`<div class="ajuda" style="margin:0">${esc(i.condominio.cnpj)}</div>`:''}</td>
      <td>${i.unidades.length}${i.completar?' <span class="selo s-rean">completar</span>':''}</td>
      <td>${esc(i.rodada.protocolo || 'carga inicial')} · ${fmtData(i.rodada.dataAnalise)}</td>
      <td class="${i.vencida?'venc':''}">${i.vencida ? `vencida há ${-i.dias} dia(s)` : `em ${i.dias} dia(s)`}</td>
      <td>${i.rascunho ? '<span class="selo s-rasc">rascunho em aberto</span>' : S.lote.itens.some(x => x.fila && x.fila.chave === i.chave) ? '<span class="selo s-prev">no lote</span>' : ''}</td></tr>`).join('')}</tbody></table>`;
  wrap.querySelectorAll('[data-sel]').forEach(cb => cb.onchange = () => { if(cb.checked) S.lote.selecionados.add(cb.dataset.sel); else S.lote.selecionados.delete(cb.dataset.sel); renderLoteFila(); });
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

const drop = $('#loteDrop');
['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('sobre'); }));
['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('sobre'); }));
drop.addEventListener('drop', e => { const fs = [...e.dataTransfer.files].filter(f => /\.pdf$/i.test(f.name)); if(fs.length) processarLoteArquivos(fs); });
$('#loteArquivos').addEventListener('change', e => { const fs = [...e.target.files]; e.target.value = ''; if(fs.length) processarLoteArquivos(fs); });

async function processarLoteArquivos(arquivos){
  const f = fila();
  const candidatos = S.lote.selecionados.size ? f.filter(i => S.lote.selecionados.has(i.chave)) : f;
  const log = $('#loteLeitura'); log.innerHTML = '';
  for(const arq of arquivos){
    const linha = document.createElement('p'); linha.className = 'ajuda'; linha.textContent = 'Lendo ' + arq.name + '…'; log.appendChild(linha);
    try{
      const txt = await pdfParaTexto(arq);
      if(!ehRelatorioVouch(txt)){ linha.innerHTML = `<b>${esc(arq.name)}</b>: não parece o relatório consolidado do Vouch — ignorado.`; continue; }
      const leitura = lerVouch(txt);
      const ident = identificarCondominio(leitura, candidatos) || (candidatos !== f ? identificarCondominio(leitura, f) : null);
      const item = { arquivo: arq.name, leitura, textos: { vouch: txt }, ident, fila: ident ? ident.item : null, rodada: null, dev: { vouch: leitura.devedores, ant: [] } };
      if(ident){
        if(S.lote.itens.some(x => x.fila && x.fila.chave === ident.item.chave)){ linha.innerHTML = `<b>${esc(arq.name)}</b>: ${esc(ident.item.condominio.nome)} já está no lote — ignorado.`; continue; }
        montarRodadaDoItem(item, ident.item);
        linha.innerHTML = `<b>${esc(arq.name)}</b>: ${esc(leitura.condominio)} → <b>${esc(ident.item.condominio.nome)}</b> (${ident.modo}${ident.ambiguo?', conferir':''}) · ${leitura.lidas} taxas${leitura.conferido?' · conferido':' · <span style="color:var(--red)">leitura divergente</span>'}`;
      } else {
        linha.innerHTML = `<b>${esc(arq.name)}</b>: ${esc(leitura.condominio || 'condomínio não identificado')} · <span style="color:var(--red)">não está na fila</span> — escolha o condomínio abaixo ou faça a implantação na aba Nova análise.`;
      }
      S.lote.itens.push(item);
    }catch(err){ linha.innerHTML = `<b>${esc(arq.name)}</b>: não deu para ler (${esc(err.message)}).`; }
  }
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
function renderLoteRevisao(){
  const wrap = $('#loteRevisao');
  if(!S.lote.itens.length){ wrap.innerHTML = ''; return; }
  const f = fila();
  wrap.innerHTML = S.lote.itens.map((it, i) => {
    if(!it.rodada){
      return `<div class="lote-cond"><header><h3>${esc(it.leitura.condominio || it.arquivo)}</h3><span class="selo s-exc">não identificado</span></header>
        <div class="corpo"><div class="acoes"><select class="campo" data-escolher="${i}" style="width:auto;min-width:260px"><option value="">Escolha o condomínio da fila…</option>${f.map((x,n) => `<option value="${n}">${esc(x.condominio.nome)}</option>`).join('')}</select><button class="btn perigo mini" data-descartar="${i}">Descartar</button></div></div></div>`;
    }
    const r = it.rodada, s = resumoRodada(r);
    const anteriorPor = new Map((it.fila.rodada.unidades||[]).map(u => [u.id, u]));
    const anteriorDe = u => { const prev = (it.fila.rodada.unidades||[]).find(p => (p.cpf && u.cpf && soDigitos(p.cpf) === soDigitos(u.cpf)) || (normUnid(p.unid) === normUnid(u.unid) && normNome(p.titular) === normNome(u.titular))); return prev ? prev.resultado : null; };
    const cards = r.unidades.map(u => { const ant = anteriorDe(u); const fraco = u.cas.vouch && u.cas.vouch.modo === 'nome'; const exc = (ant && ant !== u.resultado) || fraco || u.pendente || u.completar || !u.cas.vouch && u.vouch === 0 && false; return cardUnidade(u, r, it.dev, 'lote:' + i, { destaque: exc, aberto: exc, anterior: ant }); }).join('');
    const nDest = r.unidades.filter(u => { const ant = anteriorDe(u); return (ant && ant !== u.resultado) || (u.cas.vouch && u.cas.vouch.modo === 'nome') || u.pendente || u.completar; }).length;
    const concluida = r.status === 'concluida';
    return `<div class="lote-cond" id="lote-${i}"><header>
        <div><h3>${esc(r.condominio.nome)}</h3><div class="ajuda" style="margin:2px 0 0">${esc(it.arquivo)} · ${it.ident.modo === 'CNPJ' ? 'identificado pelo CNPJ' : 'identificado pelo nome' + (it.ident.ambiguo ? ' — <b style="color:var(--red)">confira, há nome parecido</b>' : '')} · Vouch até ${esc(it.leitura.corte||'?')} · ${it.leitura.conferido ? 'leitura conferida' : '<b style="color:var(--red)">leitura divergente do total impresso</b>'}</div></div>
        <div class="acoes"><span class="pill">Unidades <b>${s.total}</b></span><span class="pill">Excluir <b>${s.excluir}</b></span><span class="pill">Permanecem <b>${s.rean + s.prev}</b></span>${nDest?`<span class="pill" style="color:#b57a12">Revisar <b>${nDest}</b></span>`:''}
          ${concluida ? `<span class="selo s-ok">concluída · ${esc(r.protocolo)}</span><button class="btn mini" data-ficha="${i}">Baixar ficha</button><button class="btn sec mini" data-descartar="${i}">Fechar</button>`
                      : `<button class="btn sec mini" data-rascunho="${i}">Salvar rascunho</button><button class="btn mini" data-concluir="${i}" ${!CAN_WRITE?'disabled':''}>Concluir e baixar ficha</button><button class="btn perigo mini" data-descartar="${i}">Descartar</button>`}</div>
      </header><div class="corpo">${nDest ? `<p class="ajuda" style="margin:0 0 10px">Em destaque: unidades que mudaram de status, casamento só por nome, pendências ou cadastro a completar. As demais só precisam de confirmação.</p>` : '<p class="ajuda" style="margin:0 0 10px">Nenhuma exceção: nenhuma unidade mudou de status.</p>'}${cards}</div></div>`;
  }).join('');
  wrap.querySelectorAll('[data-escolher]').forEach(sel => sel.onchange = () => { const it = S.lote.itens[+sel.dataset.escolher]; const x = f[+sel.value]; if(!x) return; it.ident = { modo: 'manual', score: 1 }; montarRodadaDoItem(it, x); renderLote(); });
  wrap.querySelectorAll('[data-descartar]').forEach(b => b.onclick = () => { S.lote.itens.splice(+b.dataset.descartar, 1); renderLote(); });
  wrap.querySelectorAll('[data-ficha]').forEach(b => b.onclick = () => baixarFichaPDF(S.lote.itens[+b.dataset.ficha].rodada));
  wrap.querySelectorAll('[data-rascunho]').forEach(b => b.onclick = async () => { const it = S.lote.itens[+b.dataset.rascunho]; try{ await salvarRodada(it.rodada); await salvarEvidencias(it.rodada.id, { textos: it.textos, dev: it.dev }); toast('Rascunho salvo. Continue pela aba Nova análise.'); }catch(e){ toast(dbErr(e), 5000); } });
  wrap.querySelectorAll('[data-concluir]').forEach(b => b.onclick = async () => {
    const it = S.lote.itens[+b.dataset.concluir]; const r = it.rodada; const s = resumoRodada(r);
    if(!(await confirmar(`Concluir a reanálise de ${r.condominio.nome}?\n${s.excluir} a excluir · ${s.rean + s.prev} permanecem.\nDepois de concluída, a rodada não pode ser editada.`))) return;
    try{ await concluirRodada(r); await salvarEvidencias(r.id, { textos: it.textos, dev: it.dev }); toast('Rodada ' + r.protocolo + ' concluída.'); renderLote(); await baixarFichaPDF(r); }
    catch(e){ toast(e.message || dbErr(e), 6000); }
  });
}
