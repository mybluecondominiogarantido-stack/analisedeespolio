/* ======================================================================
   UI comum: abas, render geral, cartão de unidade, ficha
   ====================================================================== */
function mostrarAba(nome){
  if(nome !== 'nova') S.abaAnterior = nome;
  S.aba = nome;
  $$('.tab').forEach(t => t.classList.toggle('ativa', t.dataset.tab === nome));
  $$('.painel').forEach(p => p.classList.toggle('ativa', p.id === 'p-' + nome));
  window.scrollTo({ top: 0 });
  if(nome === 'lote') renderLote();
  if(['sol','pedir','minhas'].includes(nome)) renderSolicitacoes();
  if(nome === 'acessos') renderAcessos();
  if(nome === 'conf') renderConf();
}
$('#tabs').addEventListener('click', e => { const b = e.target.closest('.tab'); if(b) mostrarAba(b.dataset.tab); });

/* abas por papel, como no Comissões de Novos Condomínios: sem papel nenhum, só o aviso para pedir acesso */
function aplicarPerfil(){
  const abas = abasPermitidas();
  $$('.tab').forEach(t => { t.hidden = !abas.includes(t.dataset.tab); });
  $('#tabs').hidden = !abas.length;
  atualizarChipPerfil();
  renderBanners();
  if(!abas.length){
    S.rodada = null;
    $('#p-sem').innerHTML = `<div class="card"><div class="corpo"><div class="vazio">Olá, ${esc(ME.name || 'usuário')}. Você ainda não tem um papel neste módulo.<br>Peça à gestão para liberar seu acesso na aba <b>Acessos</b> (gestão, implantação ou solicitante avulso).</div></div></div>`;
    $$('.painel').forEach(p => p.classList.toggle('ativa', p.id === 'p-sem')); S.aba = 'sem'; return;
  }
  if(!papeis().gestao && S.rodada) S.rodada = null;
  if(S.aba === 'nova' && S.rodada) return;
  if(!abas.includes(S.aba)) mostrarAba(abas[0]);
}
function renderBanners(){
  const p = papeis();
  $('#banners').innerHTML = p.semGestor ? '<div class="nota"><b>Nenhum gestor definido ainda.</b> Enquanto isso, todos que abrem o módulo veem todas as abas. Defina os papéis na aba <b>Acessos</b>.</div>' : '';
}
function renderTudo(){
  aplicarPerfil();
  const abas = abasPermitidas();
  if(!abas.length) return;
  renderSolicitacoes();
  if(!papeis().gestao) return;
  if(S.aba === 'acessos') renderAcessos();
  renderDashboard();
  renderBadges();
  renderListaCondominios();
  if(S.aba === 'lote') renderLote();
  if(S.aba === 'conf') renderConf();
}
function renderBadges(){
  const f = fila(); const venc = f.filter(i => i.vencida).length;
  const nf = $('#nFila'); nf.hidden = !f.length; nf.textContent = venc ? `${venc} vencida${venc>1?'s':''}` : `${f.length}`; nf.classList.toggle('alerta', venc > 0);
  const novas = solicitacoesNovas().length;
  const ns = $('#nSol'); ns.hidden = !novas; ns.textContent = `${novas} nova${novas>1?'s':''}`; ns.classList.add('alerta');
}
function renderListaCondominios(){
  const nomes = new Set();
  S.rodadas.forEach(r => nomes.add(r.condominio.nome));
  (S.bi.base || []).forEach(b => nomes.add(b.nome));
  $('#listaCondominios').innerHTML = [...nomes].filter(Boolean).sort().map(n => `<option value="${esc(n)}">`).join('');
}

/* ---------- cartão de unidade (usado em Nova análise e no lote) ---------- */
function opcoesDevedor(lista, idx){
  return ['<option value="">— não encontrado —</option>'].concat((lista||[]).map((x,i) =>
    `<option value="${i}" ${i===idx?'selected':''}>${esc((x.unidadeTxt||x.unidade ? (x.unidadeTxt||x.unidade)+' · ' : '') + x.nome)} (${x.cobrancas.filter(c=>c.incluir!==false).length})</option>`)).join('');
}
function cardUnidade(u, r, dev, rid, opts){
  opts = opts || {};
  const c = { r: u.resultado, regra: u.regra, motivo: u.motivo };
  const travada = r.status === 'concluida';
  const cas = campo => { const k = u.cas[campo]; if(u.esc[campo] === 'manual') return '<span class="casamento">contagem manual</span>'; if(!k) return `<span class="casamento nao">não localizado no relatório</span>`; return `<span class="casamento ${k.modo==='nome'?'fraco':''}">↔ ${esc(k.nome)}${k.unid?' ('+esc(k.unid)+')':''} · ${esc(k.modo)}${k.nadaConsta?' · <b>nada consta</b>':''}</span>`; };
  const destaque = opts.destaque ? ' destaque' : '';
  const anterior = opts.anterior;   // resultado na rodada anterior (lote)
  const mudou = anterior && anterior !== u.resultado;
  const provas = campo => {
    const b = (u.esc[campo] !== null && u.esc[campo] !== 'manual') ? (dev[campo]||[])[u.esc[campo]] : null;
    if(!b || !b.cobrancas.length) return '';
    return `<label style="margin-top:10px">Evidências · ${campo==='vouch'?'Vouch':'Administradora anterior'} · ${esc(b.nome)} (${b.cobrancas.filter(x=>x.incluir!==false).length} de ${b.cobrancas.length})</label>
      <div class="prova">${b.cobrancas.map((p,i) => `<div><input type="checkbox" data-prova="${campo}" data-idx="${i}" ${p.incluir!==false?'checked':''} ${travada?'disabled':''}><span>${esc(p.comp||'')} · ${esc(p.referencia||'')}${p.marcadores&&p.marcadores.length?' · '+esc(p.marcadores.join(', ')):''}${p.valor!=null?' · '+fmtBRL(p.valor):''} <span style="color:var(--faint)">${esc((p.texto||'').slice(0,90))}</span></span></div>`).join('')}</div>`;
  };
  const semAnt = r.semAnterior || r.tipo === 'acompanhamento' || r.tipo === 'carga';
  return `<details class="unid${destaque}" data-rid="${rid}" data-uid="${u.id}" ${opts.aberto?'open':''}>
    <summary>
      <div class="num">${esc(u.unid || '—')}</div>
      <div class="quem"><b>${esc(u.titular || '(titular a completar)')}</b><span>${esc(u.cpf || 'sem CPF')}${u.completar?' · <b style="color:#b57a12">completar</b>':''}${u.titularAuto==='vouch'?' · titular vindo do Vouch, confira':''}</span>
        <div class="taxas"><span>Vouch <b>${u.vouch===null||u.vouch===undefined?'—':u.vouch}</b></span>${semAnt?'':`<span>Anterior <b>${u.ant===null||u.ant===undefined?'—':u.ant}</b></span>`}${u.debAnterior?`<span>Déb. anterior <b>${esc(u.debAnterior)}</b></span>`:''}${anterior?`<span>antes: <b>${esc(rotuloStatus(anterior))}</b></span>`:''}</div></div>
      <div class="res"><span class="selo ${classeSelo(c.r)}">${esc(rotuloStatus(c.r))}</span>${mudou?' <span class="selo s-rean">mudou</span>':''}${u.pendente?' <span class="selo s-rean">pendência 5.5</span>':''}<div class="motivo">Regra ${esc(c.regra)} · ${esc(c.motivo)}</div></div>
    </summary>
    <div class="det">
      <div class="grade">
        <div><label>Unidade</label><input type="text" data-campo="unid" value="${esc(u.unid)}" ${travada?'disabled':''}></div>
        <div><label>Titular</label><input type="text" data-campo="titular" value="${esc(u.titular)}" ${travada?'disabled':''}></div>
        <div><label>CPF</label><input type="text" data-campo="cpf" value="${esc(u.cpf)}" ${travada?'disabled':''}></div>
        <div><label>Observação para a ficha</label><input type="text" data-campo="obs" value="${esc(u.obs)}" placeholder="titular divergente, inventário..." ${travada?'disabled':''}></div>
      </div>
      <div class="grade">
        <div><label>Casamento no Vouch</label><select data-esc="vouch" ${travada?'disabled':''}>${opcoesDevedor(dev.vouch, u.esc.vouch)}</select><div style="margin-top:4px">${cas('vouch')}</div>
          <label style="margin-top:8px">Taxas no Vouch (manual)</label><input type="number" min="0" data-manual="vouch" value="${u.manual.vouch??''}" placeholder="automático" ${travada?'disabled':''}></div>
        ${semAnt ? '' : `<div><label>Casamento na anterior</label><select data-esc="ant" ${travada?'disabled':''}>${opcoesDevedor(dev.ant, u.esc.ant)}</select><div style="margin-top:4px">${cas('ant')}</div>
          <label style="margin-top:8px">Taxas anteriores (manual)</label><input type="number" min="0" data-manual="ant" value="${u.manual.ant??''}" placeholder="automático" ${travada?'disabled':''}></div>`}
        <div><label>Ajuste do analista</label><select data-campo="override" ${travada?'disabled':''}><option value="">Automático</option><option value="__base__" ${u.override && u.override!=='EXCLUIR'?'selected':''}>Sob análise</option><option value="EXCLUIR" ${u.override==='EXCLUIR'?'selected':''}>Excluir</option></select>
          <label style="margin-top:8px">Motivo do ajuste ${u.override?'<span style="color:var(--red)">(obrigatório)</span>':''}</label><input type="text" data-campo="motivoAjuste" value="${esc(u.motivoAjuste||'')}" placeholder="ex.: alvará judicial apresentado" ${travada?'disabled':''}></div>
      </div>
      ${provas('vouch')}${semAnt?'':provas('ant')}
      ${travada ? '' : `<div class="acoes" style="margin-top:12px">
        ${u.situacao==='encerrada' ? `<span class="selo s-enc">encerrada: ${esc(u.encerramento?u.encerramento.motivo:'')}</span><button class="btn sec mini" data-acao="reabrir">Reabrir</button>`
          : `<button class="btn sec mini" data-acao="encerrar">Encerrar acompanhamento (troca de titularidade)</button>`}
        <button class="btn perigo mini" data-acao="remover">Remover unidade</button></div>`}
    </div>
  </details>`;
}

/* localiza a rodada de um cartão pelo rid: 'nova' = editor; 'lote:i' = item do lote */
function rodadaPorRid(rid){
  if(rid === 'nova') return { r: S.rodada, dev: S.dev, lidos: { vouch: !!S.textos.vouch.trim(), ant: !!S.textos.ant.trim() }, apos: () => renderEditorUnidades(true) };
  const m = rid.match(/^lote:(\d+)$/);
  if(m){ const it = S.lote.itens[+m[1]]; return { r: it.rodada, dev: it.dev, lidos: { vouch: true, ant: false }, apos: () => renderLote() }; }
  return null;
}
async function eventoCartao(e, tipo){
  const card = e.target.closest('details.unid[data-rid]'); if(!card) return;
  const ctx = rodadaPorRid(card.dataset.rid); if(!ctx || !ctx.r) return;
  const u = ctx.r.unidades.find(x => x.id === card.dataset.uid); if(!u) return;
  const t = e.target;
  let recalc = false;
  if(tipo === 'input' && t.dataset.campo){
    u[t.dataset.campo] = t.value;
    if(t.dataset.campo === 'unid') u.unidAuto = false;
    if(['unid','titular','cpf'].includes(t.dataset.campo)) recalc = true; else { const c = classificar(u, contextoDe(ctx.r), u.vouch, u.ant); u.resultado = c.r; u.regra = c.regra; u.motivo = c.motivo; u.pendente = !!c.pendente; }
    if(u.titular && u.completar) u.completar = false;
    agendarSalvar(card.dataset.rid); if(tipo === 'input' && ['obs','motivoAjuste','titular','cpf','unid'].includes(t.dataset.campo)){ atualizarResumoSemRender(card.dataset.rid); return; }
  }
  if(tipo === 'input' && t.dataset.manual){ const v = t.value; u.manual[t.dataset.manual] = v === '' ? null : Math.max(0, parseInt(v,10)||0); recalc = true; }
  if(tipo === 'change' && t.dataset.esc){ const v = t.value; u.esc[t.dataset.esc] = v === '' ? null : +v; u.manual[t.dataset.esc] = null; recalc = true; }
  if(tipo === 'change' && t.dataset.campo === 'override'){ u.override = t.value; recalc = true; }
  if(tipo === 'change' && t.dataset.prova){ const b = ctx.dev[t.dataset.prova][u.esc[t.dataset.prova]]; if(b){ b.cobrancas[+t.dataset.idx].incluir = t.checked; u.manual[t.dataset.prova] = null; recalc = true; } }
  if(tipo === 'click' && t.dataset.acao){
    if(t.dataset.acao === 'remover'){ if(!(await confirmar('Remover esta unidade da rodada?'))) return; ctx.r.unidades = ctx.r.unidades.filter(x => x.id !== u.id); recalc = true; }
    if(t.dataset.acao === 'encerrar'){ const motivo = window.prompt('Motivo do encerramento (ex.: troca de titularidade concluída em dd/mm/aaaa):', 'Troca de titularidade concluída'); if(motivo === null) return; u.situacao = 'encerrada'; u.encerramento = { motivo, data: hojeISO(), por: ME.name }; recalc = true; }
    if(t.dataset.acao === 'reabrir'){ u.situacao = 'ativa'; u.encerramento = null; recalc = true; }
  }
  if(recalc){ recalcular(ctx.r, ctx.dev, ctx.lidos); ctx.apos(); agendarSalvar(card.dataset.rid); }
}
document.addEventListener('input', e => eventoCartao(e, 'input'));
document.addEventListener('change', e => eventoCartao(e, 'change'));
document.addEventListener('click', e => { if(e.target.dataset && e.target.dataset.acao) eventoCartao(e, 'click'); });

/* ---------- ficha ---------- */
function fichaHTML(r){
  const res = r.unidades || [];
  const grupo = x => res.filter(u => u.resultado === x);
  const nomes = a => a.length ? a.map(u => `${u.unid||'s/ unid.'} — ${u.titular||'(a completar)'}`).join('; ') : '—';
  const obs = res.filter(u => (u.obs||'').trim()).map(u => `${u.unid||u.titular}: ${u.obs.trim()}`).join('; ');
  const bi = r.semBi || !r.bi || r.bi.valor === null || r.bi.valor === undefined ? null : (r.bi.sinal === '-' ? -Math.abs(r.bi.valor) : Math.abs(r.bi.valor));
  const vig = (r.idadeGarantia === null || r.idadeGarantia === undefined || r.idadeGarantia === '') ? null : +r.idadeGarantia;
  const inicioTxt = vig !== null ? `${vig} ${vig===1?'mês':'meses'}` : '—';
  const nE = grupo('EXCLUIR').length, nR = grupo('REANÁLISE').length, nP = grupo('PREVENTIVO').length, nEnc = grupo('ENCERRADA').length;
  const tipoSob = r.tipo === 'acompanhamento' ? 'reanálise' : 'preventivo';
  const classif = res.length ? [nE?`Excluir da garantia (${nE})`:null, (nR+nP)?`Sob análise · ${tipoSob} (${nR+nP})`:null, nEnc?`Encerradas (${nEnc})`:null].filter(Boolean).join('  ·  ') : '—';
  const sit = n => n === null || n === undefined ? 'Não informado' : (n > 0 ? `Inadimplente (${n} taxa${n>1?'s':''})` : 'Sem cobrança');
  const tipoTxt = r.tipo === 'acompanhamento' ? 'Acompanhamento (reanálise)' : r.tipo === 'carga' ? 'Carga inicial' : r.tipo === 'avulso' ? 'Avulso (sinalização da Cobrança)' : 'Implantação (1ª análise)';
  const semColAnt = r.tipo === 'acompanhamento';   // reanálise: só o Vouch entra
  const antTxt = u => r.semAnterior ? 'Sem relatório anterior' : sit(u.ant);
  const logo = $('.brand img') ? $('.brand img').getAttribute('src') : '';
  return `
  ${logo ? `<img src="${logo}" class="f-logo" alt="MyBlue">` : ''}
  <div class="f-titulo">Análise de Espólio</div>
  <div class="f-sub">Protocolo ${esc(r.protocolo || 'rascunho')} • ${fmtData(r.dataAnalise)} • Cobrança / Coordenação${r.vouch && r.vouch.corte ? ' • Vouch consolidado até ' + esc(r.vouch.corte) : ''}</div>
  <div class="f-secao">Condomínio analisado</div>
  <table class="f-id">
    <tr><th>Razão social</th><td>${esc(r.condominio.nome||'—')}</td><th>CNPJ</th><td>${esc(r.condominio.cnpj||'—')}</td></tr>
    <tr><th>Tipo de análise</th><td>${tipoTxt}</td><th>Analista</th><td>${esc(r.analista||'—')}</td></tr>
    <tr><th>Idade da garantia</th><td>${inicioTxt}</td><th>Data da análise</th><td>${fmtData(r.dataAnalise)}</td></tr>
  </table>
  <div class="f-destaques">
    <div class="f-classif"><small>Resultado</small><div>${esc(classif)}</div></div>
    <div class="f-resumo"><div><small>Idade da garantia</small><strong>${inicioTxt}</strong></div><div><small>Resultado do BI</small><strong>${bi === null ? 'não informado' : fmtBRL(bi)}</strong></div>${r.proximaReanalise?`<div><small>Próxima reanálise</small><strong>${fmtData(r.proximaReanalise)}</strong></div>`:''}</div>
  </div>
  ${r.nota ? `<div class="f-nota">${esc(r.nota)}</div>` : ''}
  <div class="f-secao">Unidades sinalizadas × relatórios de inadimplência</div>
  <table class="f-tab"><thead><tr><th style="width:8%">UNID.</th><th style="width:26%">TITULAR</th><th style="width:14%">CPF</th>${semColAnt?'':'<th style="width:18%">INADIMPLÊNCIA ANTERIOR</th>'}<th style="width:16%">VOUCH</th><th style="width:18%">RESULTADO</th></tr></thead><tbody>${
    res.length ? res.map(u => `<tr><td><b>${esc(u.unid||'—')}</b></td><td>${esc(u.titular||'(a completar)')}</td><td>${esc(u.cpf||'—')}</td>${semColAnt?'':`<td>${antTxt(u)}</td>`}<td>${sit(u.vouch)}</td>
      <td class="res ${classeRes(u.resultado)}">${esc(rotuloStatus(u.resultado))}${motivoCurto(u, r) ? `<small>${esc(motivoCurto(u, r))}</small>` : ''}</td></tr>`).join('')
    : `<tr><td colspan="6" style="text-align:center;color:#6b7f88">Sem unidades sinalizadas.</td></tr>`}
  </tbody></table>
  <div class="f-legenda">
    <span><i style="background:#199CB1"></i> Sob análise · Preventivo (implantação)</span>
    <span><i style="background:#F2A93B"></i> Sob análise · Reanálise (acompanhamento)</span>
    <span><i style="background:#C0392B"></i> Excluir da garantia</span>
  </div>
  <div class="f-rodape-tab">Inadimplência anterior = débito antes da garantia MyBlue. Vouch = sistema interno MyBlue. • Classificação conforme a Política de Análise de Espólio.</div>
  <div class="f-caixas">
    <div class="f-caixa cx-EXCLUIR"><h4>Excluir da garantia</h4><p>${esc(nomes(grupo('EXCLUIR')))}</p></div>
    <div class="f-caixa cx-REAN"><h4>Sob análise · Reanálise</h4><p>${esc(nomes(grupo('REANÁLISE')))}</p></div>
    <div class="f-caixa cx-PREV"><h4>Sob análise · Preventivo</h4><p>${esc(nomes(grupo('PREVENTIVO')))}</p></div>
    <div class="f-caixa"><h4>Observações</h4><p>${esc(obs||'—')}</p></div>
  </div>
  <div class="f-rodape"><span>MyBlue Condomínio Garantido | contato@myblue.com.br | www.myblue.com.br | 0800 085 9277</span><span>${esc(r.protocolo||'rascunho')} · gerada em ${fmtData(hojeISO())}</span></div>`;
}
const nomeFicha = r => nomeArquivoSeguro(`${r.status === 'concluida' && r.protocolo ? r.protocolo : 'RASCUNHO' + (r.protocolo ? ' ' + r.protocolo : '')} - ${r.condominio.nome || 'condominio'}`) + '.pdf';

async function baixarFichaPDF(r){
  if(typeof html2pdf === 'undefined'){ imprimirFicha(r); return; }
  // A4 paisagem com margem de 6 mm: 285 × 198 mm ≈ 1077 × 748 px a 96 dpi
  const LARG = 1070, ALT_MAX = 740;
  const wrap = document.createElement('div'); wrap.style.cssText = `width:${LARG}px;background:#fff;overflow:hidden;margin:0`;
  const el = document.createElement('div'); el.className = 'ficha pdf'; el.style.cssText = `width:${LARG}px;border:0;border-radius:0;transform-origin:top left`;
  el.innerHTML = fichaHTML(r); wrap.appendChild(el); document.body.appendChild(wrap);
  try{
    await new Promise(res => setTimeout(res, 50));
    const h = el.offsetHeight;
    if(h > ALT_MAX){ const k = ALT_MAX / h; el.style.width = (LARG / k) + 'px'; el.style.transform = `scale(${k})`; }
    wrap.style.height = Math.min(h, ALT_MAX) + 'px';
    await html2pdf().set({ margin: 6, filename: nomeFicha(r), image: { type:'jpeg', quality: 0.95 }, html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 }, jsPDF: { unit:'mm', format:'a4', orientation:'landscape' }, pagebreak: { mode: ['css'] } }).from(wrap).save();
    registrarHistorico('ficha', { rodadaId: r.id, protocolo: r.protocolo, condominio: r.condominio.nome, arquivo: nomeFicha(r) });
  } finally { wrap.remove(); }
}
function imprimirFicha(r){
  const area = $('#areaImpressao'); area.innerHTML = `<div class="ficha">${fichaHTML(r)}</div>`; area.hidden = false;
  window.print();
  setTimeout(() => { area.hidden = true; area.innerHTML = ''; }, 500);
}
function csvAcompanhamento(rodadas, nome){
  const cab = ['Condominio','CNPJ','Protocolo','Tipo de analise','Unidade','Titular','CPF','Data da analise','Status','Regra','Motivo','Taxas Vouch','Taxas anterior','Proxima reanalise'];
  const corpo = [];
  rodadas.forEach(r => (r.unidades||[]).forEach(u => corpo.push([r.condominio.nome, r.condominio.cnpj, r.protocolo, r.tipo, u.unid, u.titular, u.cpf, fmtData(r.dataAnalise), rotuloStatus(u.resultado), u.regra, u.motivo, u.vouch ?? '', u.ant ?? '', fmtData(r.proximaReanalise)])));
  const csv = [cab, ...corpo].map(l => l.map(v => `"${String(v??'').replace(/"/g,'""')}"`).join(';')).join('\r\n');
  baixarArquivo(nome, '﻿' + csv, 'text/csv;charset=utf-8');
}

/* ---------- salvamento com atraso (rascunhos) ---------- */
const salvarTimers = {};
function agendarSalvar(rid){
  clearTimeout(salvarTimers[rid]);
  salvarTimers[rid] = setTimeout(async () => {
    const ctx = rodadaPorRid(rid); if(!ctx || !ctx.r || ctx.r.status === 'concluida') return;
    if(rid === 'nova' && !ctx.r.condominio.nome && !ctx.r.unidades.length) return;
    try{ await salvarRodada(ctx.r); if(rid === 'nova') await salvarEvidencias(ctx.r.id, { textos: S.textos, dev: S.dev }); }
    catch(e){ toast(dbErr(e), 5000); }
  }, 1500);
}
function atualizarResumoSemRender(rid){ if(rid === 'nova'){ renderEditorResumo(); renderFichaPreview(); } }
