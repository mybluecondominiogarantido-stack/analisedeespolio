/* ======================================================================
   Carteira do portal (condomínios e responsáveis) e abertura de ticket
   ====================================================================== */
const limpaRamal = s => String(s||'').replace(/\s*-\s*\d{3,5}\s*$/, '').trim();
function normalizarCarteira(lista){
  return (lista || []).map(c => {
    const nome = c.nome || c.condominio || c.razao_social || '';
    const inicio = c.inicio_contrato || c.inicioContrato || c.inicio || '';
    return { codigo: c.codigo || c.id || '', nome, razao: c.razao_social || c.razao || nome, cnpj: fmtCnpj(c.cnpj || ''), comarca: c.comarca || '', situacao: String(c.situacao || 'ATIVO').toUpperCase(),
             inicio: inicio ? String(inicio).slice(0,10) : '', assistenteCredito: limpaRamal(c.assistente_credito || c.assistenteCredito), analistaCobranca: limpaRamal(c.analista_cobranca || c.analistaCobranca),
             extrajudicial: limpaRamal(c.analista_extrajudicial || c.extrajudicial), executivo: limpaRamal(c.executivo), chave: chaveCond(c.razao_social || nome, c.cnpj || '') };
  }).filter(c => c.nome);
}
/* no portal a carteira chega pelo documento carteira/atual, mantido por uma rotina no banco a partir de public.condominios */
async function sincronizarCarteira(){ /* mantido por compatibilidade: a carteira vem do banco */ }
/* fora do portal: importar JSON ou Excel exportado do cadastro */
async function importarCarteiraArquivo(f){
  let lista;
  if(/\.json$/i.test(f.name)){ const j = JSON.parse(await f.text()); lista = Array.isArray(j) ? j : (j.condominios || []); }
  else {
    const rows = await planilhaParaMatriz(f);
    const hi = rows.findIndex(r => r.some(c => /condom|nome/i.test(String(c)))); const head = rows[hi].map(c => String(c||'').toLowerCase());
    const col = re => head.findIndex(h => re.test(h));
    const ci = { nome: col(/^nome|condom/), cnpj: col(/cnpj/), comarca: col(/comarca/), inicio: col(/in[íi]cio|vig/), ac: col(/assist.*cr[ée]d/), cob: col(/analista.*cobran/), ex: col(/extraj/), sit: col(/situa/) };
    lista = rows.slice(hi+1).map(r => ({ nome: r[ci.nome], cnpj: ci.cnpj>=0 ? r[ci.cnpj] : '', comarca: ci.comarca>=0 ? r[ci.comarca] : '', inicio_contrato: ci.inicio>=0 ? excelData(r[ci.inicio]) : '', assistente_credito: ci.ac>=0 ? r[ci.ac] : '', analista_cobranca: ci.cob>=0 ? r[ci.cob] : '', analista_extrajudicial: ci.ex>=0 ? r[ci.ex] : '', situacao: ci.sit>=0 ? r[ci.sit] : 'ATIVO' }));
  }
  const itens = normalizarCarteira(lista);
  if(!itens.length) throw new Error('nenhum condomínio reconhecido no arquivo');
  await DB.doc(COLECOES.carteira + '/atual').set({ itens, atualizadoEm: nowISO(), origem: 'arquivo:' + f.name, assinatura: 'arquivo' });
  return itens.length;
}
function excelData(v){
  if(v === null || v === undefined || v === '') return '';
  if(typeof v === 'number'){ const d = new Date(Math.round((v - 25569) * 86400000)); return d.toISOString().slice(0,10); }
  const s = String(v); const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if(m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + m[2].padStart(2,'0') + '-' + m[1].padStart(2,'0');
  return s.slice(0,10);
}

/* ---------- ticket para quem guarda a ficha na pasta ---------- */
function textoTicket(r, sol){
  const linhas = (r.unidades||[]).map(u => `• ${u.unid || 's/ unid.'} — ${u.titular || '(titular a completar)'}${u.cpf ? ' · ' + u.cpf : ''}: ${u.resultado === 'EXCLUIR' ? 'Excluída da garantia' : u.resultado === 'ENCERRADA' ? 'Acompanhamento encerrado' : 'Mantida · em acompanhamento'}${u.obs ? ' · ' + u.obs : ''}`).join('\n');
  return `Análise de espólio ${r.protocolo} · ${r.condominio.nome}${r.condominio.cnpj ? ' · CNPJ ' + r.condominio.cnpj : ''}\nTipo: ${r.tipo === 'acompanhamento' ? 'Acompanhamento (reanálise)' : r.tipo === 'avulso' ? 'Avulso' : 'Implantação'} · Data: ${fmtData(r.dataAnalise)}${sol ? ' · Solicitação de ' + (sol.solicitanteNome||'') : ''}\n\nUnidades:\n${linhas}\n\nFicha em anexo. Favor guardar na pasta do condomínio.${r.proximaReanalise && seguemEmAcompanhamento(r) ? '\nPróxima reanálise: ' + fmtData(r.proximaReanalise) : ''}`;
}
function abrirTicketModal(r, sol){
  const resp = responsavelDoCondominio(r.condominio.chave, sol);
  const texto = textoTicket(r, sol);
  abrirModal('Abrir ticket · ' + r.protocolo, `
    <div class="grade" style="margin-bottom:12px">
      <div><label>Para</label><input type="text" id="tkResp" class="campo" value="${esc(resp.nome)}" placeholder="nome da responsável"><p class="ajuda">${resp.nome ? esc(resp.papel) : 'sem assistente de crédito na carteira: informe quem recebe'}</p></div>
      <div><label>Setor</label><input type="text" id="tkSetor" class="campo" value="${esc(resp.setor)}"></div>
      <div><label>Prioridade</label><select id="tkPrio" class="campo"><option value="baixa">Baixa</option><option value="media" selected>Média</option><option value="alta">Alta</option></select></div>
    </div>
    <div><label>Título</label><input type="text" id="tkTitulo" class="campo" value="${esc('Análise de espólio ' + r.protocolo + ' · ' + r.condominio.nome)}"></div>
    <div style="margin-top:10px"><label>Descrição</label><textarea id="tkTexto" style="min-height:180px;font-family:var(--font);font-size:13px">${esc(texto)}</textarea></div>
    <div id="tkStatus"></div>`,
    `<button class="btn sec mini" id="tkCopiar">Copiar texto</button><button class="btn mini" id="tkEnviar" ${!window.claude || DB._local ? 'disabled title="só pelo portal"' : ''}>Abrir ticket no portal</button>`);
  $('#tkCopiar').onclick = async () => { try{ await navigator.clipboard.writeText($('#tkTitulo').value + '\n\n' + $('#tkTexto').value); toast('Texto copiado.'); }catch(_){ toast('Selecione e copie o texto manualmente.'); } };
  $('#tkEnviar').onclick = () => enviarTicket(r, sol);
}
async function enviarTicket(r, sol){
  const st = $('#tkStatus'); st.innerHTML = '<p class="ajuda">Enviando…</p>';
  const rota = S.acesso.ticketRota || '/api/tickets';
  const corpo = { titulo: $('#tkTitulo').value.trim(), descricao: $('#tkTexto').value, setor: $('#tkSetor').value.trim(), prioridade: $('#tkPrio').value, responsavel_nome: $('#tkResp').value.trim(),
                  condominio_nome: r.condominio.nome, condominio_cnpj: r.condominio.cnpj, origem: 'analise-espolio', protocolo: r.protocolo, rodadaId: r.id };
  try{
    const resp = await fetch(rota, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    if(!resp.ok) throw new Error('o portal respondeu ' + resp.status);
    const j = await resp.json().catch(() => ({}));
    const id = j.id || (j.ticket && j.ticket.id);
    let anexo = '';
    if(id && typeof html2pdf !== 'undefined'){
      try{
        const blob = await fichaPDFBlob(r);
        const fd = new FormData(); fd.append('arquivo', blob, nomeFicha(r));
        const ra = await fetch(`${rota}/${id}/anexos`, { method: 'POST', credentials: 'same-origin', body: fd });
        anexo = ra.ok ? ' Ficha anexada.' : ' O ticket foi aberto, mas a ficha não pôde ser anexada: anexe o PDF à mão.';
      }catch(_){ anexo = ' O ticket foi aberto, mas a ficha não pôde ser anexada: anexe o PDF à mão.'; }
    }
    registrarHistorico('ticket', { rodadaId: r.id, protocolo: r.protocolo, ticketId: id || null, para: corpo.responsavel_nome });
    if(r.id) gravarDoc(COLECOES.rodadas + '/' + r.id, { ticket: { id: id || null, para: corpo.responsavel_nome, em: nowISO() } });
    st.innerHTML = `<div class="ok">Ticket ${id ? '#' + id + ' ' : ''}aberto para ${esc(corpo.responsavel_nome || corpo.setor)}.${anexo}</div>`;
  }catch(e){
    st.innerHTML = `<div class="erro">Não foi possível abrir o ticket pelo módulo (${esc(e.message)}). Use "Copiar texto" e abra o ticket no portal; a ficha você baixa pelo botão da rodada. Se a rota do portal for outra, ajuste em Configurações.</div>`;
  }
}
async function fichaPDFBlob(r){
  const LARG = 1070, ALT_MAX = 740;
  const wrap = document.createElement('div'); wrap.style.cssText = `width:${LARG}px;background:#fff;overflow:hidden;margin:0`;
  const el = document.createElement('div'); el.className = 'ficha pdf'; el.style.cssText = `width:${LARG}px;border:0;border-radius:0;transform-origin:top left`;
  el.innerHTML = fichaHTML(r); wrap.appendChild(el); document.body.appendChild(wrap);
  try{
    await new Promise(res => setTimeout(res, 50));
    const h = el.offsetHeight; if(h > ALT_MAX){ const k = ALT_MAX / h; el.style.width = (LARG / k) + 'px'; el.style.transform = `scale(${k})`; } wrap.style.height = Math.min(h, ALT_MAX) + 'px';
    return await html2pdf().set({ margin: 6, image: { type:'jpeg', quality: 0.95 }, html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 }, jsPDF: { unit:'mm', format:'a4', orientation:'landscape' }, pagebreak: { mode: ['css'] } }).from(wrap).outputPdf('blob');
  } finally { wrap.remove(); }
}
