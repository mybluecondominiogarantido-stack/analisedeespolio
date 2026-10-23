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
  const linhas = (r.unidades||[]).map(u => `• ${u.unid || 's/ unid.'} — ${u.titular || '(titular a completar)'}${u.cpf ? ' · ' + u.cpf : ''}: ${u.resultado === 'EXCLUIR' ? 'Excluir' : u.resultado === 'ENCERRADA' ? 'Encerrada' : 'Em acompanhamento'}${u.obs ? ' · ' + u.obs : ''}`).join('\n');
  return `Análise de espólio ${r.protocolo} · ${r.condominio.nome}${r.condominio.cnpj ? ' · CNPJ ' + r.condominio.cnpj : ''}\nTipo: ${r.tipo === 'acompanhamento' ? 'Reanálise' : r.tipo === 'avulso' ? 'Avulso' : 'Implantação'} · Data: ${fmtData(r.dataAnalise)}${sol ? ' · Solicitação de ' + (sol.solicitanteNome||'') : ''}\n\nUnidades:\n${linhas}\n\nFicha em anexo. Favor guardar na pasta do condomínio.${r.proximaReanalise && seguemEmAcompanhamento(r) ? '\nPróxima reanálise: ' + fmtData(r.proximaReanalise) : ''}`;
}
function abrirTicketModal(r, sol){
  const resp = responsavelDoCondominio(r.condominio.chave, sol);
  const texto = textoTicket(r, sol);
  const ja = r.ticket && r.ticket.id ? `<div class="aviso" style="margin-bottom:10px">Esta análise já tem o ticket #${esc(r.ticket.id)}, aberto em ${fmtDataHora(r.ticket.em)} para ${esc(r.ticket.para || 'o setor')}.</div>` : '';
  abrirModal('Abrir ticket · ' + r.protocolo, `${ja}
    <div class="grade" style="margin-bottom:12px">
      <div><label>Para</label><input type="text" id="tkResp" class="campo" value="${esc(resp.nome)}" placeholder="nome da responsável"><p class="ajuda">${resp.nome ? esc(resp.papel) + '. ' : 'Sem assistente de crédito na carteira. '}Se a pessoa não tiver login no portal, o ticket fica na fila do setor.</p></div>
      <div><label>Setor</label><input type="text" id="tkSetor" class="campo" value="${esc(resp.setor)}"></div>
      <div><label>Prioridade</label><select id="tkPrio" class="campo"><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta" selected>Alta</option></select></div>
    </div>
    <div><label>Título</label><input type="text" id="tkTitulo" class="campo" value="${esc('Análise de espólio ' + r.protocolo + ' · ' + r.condominio.nome)}"></div>
    <div style="margin-top:10px"><label>Descrição</label><textarea id="tkTexto" style="min-height:180px;font-family:var(--font);font-size:13px">${esc(texto)}</textarea></div>
    <p class="ajuda">A ficha em PDF vai anexada ao ticket.</p>
    <div id="tkStatus"></div>`,
    `<button class="btn sec mini" id="tkCopiar">Copiar texto</button><button class="btn mini" id="tkEnviar" ${!window.claude || DB._local ? 'disabled title="só pelo portal"' : !ehGestao() ? 'disabled title="só a gestão abre ticket"' : ''}>Abrir ticket no portal</button>`);
  $('#tkCopiar').onclick = async () => { try{ await navigator.clipboard.writeText($('#tkTitulo').value + '\n\n' + $('#tkTexto').value); toast('Texto copiado.'); }catch(_){ toast('Selecione e copie o texto manualmente.'); } };
  $('#tkEnviar').onclick = () => enviarTicket(r, sol);
}
/* O módulo não grava nas tabelas de tickets do portal. Ele grava um pedido em tickets/{id} e a regra
   espolio_ticket do banco (docs/sql/ticket-pelo-modulo.sql) cria o ticket, anexa a ficha, avisa no sino
   e devolve no mesmo documento o número (status "aberto") ou o motivo (status "erro"). */
const blobBase64 = blob => new Promise((ok, falha) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).replace(/^data:[^,]*,/, '')); fr.onerror = () => falha(fr.error); fr.readAsDataURL(blob); });
async function enviarTicket(r, sol){
  const st = $('#tkStatus'), bt = $('#tkEnviar');
  if(r.ticket && r.ticket.id && !(await confirmar(`Esta análise já tem o ticket #${r.ticket.id}. Abrir outro?`))) return;
  bt.disabled = true; st.innerHTML = '<p class="ajuda">Gerando a ficha e abrindo o ticket…</p>';
  const pedido = { status: 'pedido', titulo: $('#tkTitulo').value.trim(), descricao: $('#tkTexto').value, setor: $('#tkSetor').value.trim() || S.acesso.ticketSetor || 'Crédito',
                   prioridade: $('#tkPrio').value, responsavelNome: $('#tkResp').value.trim(), condominio: { nome: r.condominio.nome, cnpj: r.condominio.cnpj || '' },
                   protocolo: r.protocolo, rodadaId: r.id || null, solicitacaoId: sol ? sol.id : (r.solicitacaoId || null), pedidoPor: ME.name, pedidoEm: nowISO() };
  const id = (r.protocolo || 'AE') + '-' + Date.now().toString(36);
  const ref = DB.doc(COLECOES.tickets + '/' + id);
  try{
    try{ pedido.anexo = { nome: nomeFicha(r), base64: await fichaParaTicket(r) }; }catch(_){ /* sem a ficha, o ticket sai sem anexo */ }
    try{ await ref.set(pedido); }
    catch(e){ if(!pedido.anexo) throw e; delete pedido.anexo; await ref.set(pedido); } /* ficha grande demais para a base: abre sem anexo */
    let d = null;
    for(let i = 0; i < 8; i++){ const snap = await ref.get(); d = snap.exists ? snap.data() : null; if(d && d.status !== 'pedido') break; await new Promise(res => setTimeout(res, 500)); }
    if(!d || d.status === 'pedido') throw new Error('o portal não confirmou o ticket. A regra do banco pode não estar ligada');
    if(d.status === 'erro') throw new Error(d.erro || 'recusado pelo banco');
    const para = d.responsavelId ? pedido.responsavelNome : 'a fila do setor ' + pedido.setor;
    registrarHistorico('ticket', { rodadaId: r.id, protocolo: r.protocolo, ticketId: d.ticketId, para });
    if(r.id){ r.ticket = { id: d.ticketId, para, em: nowISO() }; gravarDoc(COLECOES.rodadas + '/' + r.id, { ticket: r.ticket }); }
    st.innerHTML = `<div class="ok">Ticket #${esc(d.ticketId)} aberto para ${esc(para)}.${d.anexado ? ' Ficha anexada.' : ' A ficha não foi anexada: anexe o PDF pelo portal.'}${!d.responsavelId && pedido.responsavelNome ? ` ${esc(pedido.responsavelNome)} não tem login no portal, então o ticket ficou com a liderança do setor.` : ''}</div>`;
    bt.textContent = 'Aberto';
  }catch(e){
    bt.disabled = false;
    st.innerHTML = `<div class="erro">Não foi possível abrir o ticket (${esc(dbErr(e).replace(/^Falha ao acessar a base: /, ''))}). Use "Copiar texto" e abra o ticket no portal; a ficha você baixa pelo botão da análise.</div>`;
  }
}
/* a base do portal recusa documento grande: a ficha vai em qualidade menor até caber (texto continua legível) */
const ANEXO_MAX_CHARS = 180000;   // ~135 KB de PDF; o maior documento já gravado pelo módulo tem ~190 mil caracteres
async function fichaParaTicket(r){
  for(const q of [{ scale: 1.5, quality: 0.82 }, { scale: 1.25, quality: 0.72 }, { scale: 1, quality: 0.65 }]){
    const b64 = await blobBase64(await fichaPDFBlob(r, q));
    if(b64.length <= ANEXO_MAX_CHARS) return b64;
  }
  throw new Error('ficha grande demais para anexar');
}
async function fichaPDFBlob(r, q){
  q = q || { scale: 2, quality: 0.95 };
  const LARG = 1070, ALT_MAX = 740;
  const wrap = document.createElement('div'); wrap.style.cssText = `width:${LARG}px;background:#fff;overflow:hidden;margin:0`;
  const el = document.createElement('div'); el.className = 'ficha pdf'; el.style.cssText = `width:${LARG}px;border:0;border-radius:0;transform-origin:top left`;
  el.innerHTML = fichaHTML(r); wrap.appendChild(el); document.body.appendChild(wrap);
  try{
    await new Promise(res => setTimeout(res, 50));
    const h = el.offsetHeight; if(h > ALT_MAX){ const k = ALT_MAX / h; el.style.width = (LARG / k) + 'px'; el.style.transform = `scale(${k})`; } wrap.style.height = Math.min(h, ALT_MAX) + 'px';
    return await html2pdf().set({ margin: 6, image: { type:'jpeg', quality: q.quality }, html2canvas: { scale: q.scale, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 }, jsPDF: { unit:'mm', format:'a4', orientation:'landscape' }, pagebreak: { mode: ['css'] } }).from(wrap).outputPdf('blob');
  } finally { wrap.remove(); }
}
