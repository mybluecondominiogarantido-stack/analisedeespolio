/* ======================================================================
   Leitura de documentos
   ====================================================================== */

/* ---------- PDF → texto (uma linha por linha visual, células separadas por " | ") ---------- */
async function pdfParaTexto(file){
  if(typeof pdfjsLib === 'undefined') throw new Error('leitor de PDF indisponível (sem internet) — cole o texto do relatório');
  pdfjsLib.GlobalWorkerOptions.workerSrc = (window.PDFJS_WORKER_SRC || 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js');
  const doc = await pdfjsLib.getDocument({data: await file.arrayBuffer()}).promise;
  const saida = [];
  for(let p = 1; p <= doc.numPages; p++){
    const pagina = await doc.getPage(p);
    const c = await pagina.getTextContent();
    // posição na página como ela é exibida (considera páginas giradas, ex.: relatórios em paisagem salvos com rotação de 90°)
    const vp = pagina.getViewport({ scale: 1 });
    const itens = c.items.filter(i => i.str.trim())
      .map(i => { const t = pdfjsLib.Util.transform(vp.transform, i.transform); return { x: t[4], y: -t[5], t: i.str.trim() }; })
      .sort((a,b) => b.y - a.y || a.x - b.x);
    let linha = [], base = null;
    const fechar = () => { if(linha.length) saida.push(linha.sort((a,b)=>a.x-b.x).map(i=>i.t).join(' | ')); linha=[]; };
    itens.forEach(i => {
      if(base === null || Math.abs(i.y - base) <= 2.5){ if(base===null) base=i.y; linha.push(i); }
      else { fechar(); base = i.y; linha.push(i); }
    });
    fechar();
  }
  return saida.join('\n');
}

/* ---------- expressões comuns ---------- */
const RE_CPF    = /\b\d{3}\.?\d{3}\.?\d{3}-\d{2}\b/;
const RE_CNPJ   = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/;
const RE_VALOR  = /(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}/;
const RE_DATA   = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/;
const MES_TXT = {jan:'01',fev:'02',mar:'03',abr:'04',mai:'05',jun:'06',jul:'07',ago:'08',set:'09',out:'10',nov:'11',dez:'12'};
const MES_FULL = {janeiro:'01',fevereiro:'02','março':'03',marco:'03',abril:'04',maio:'05',junho:'06',julho:'07',agosto:'08',setembro:'09',outubro:'10',novembro:'11',dezembro:'12'};
const RE_MES_NOME = /\b(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/i;

function dataVenc(linha){
  let m = linha.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if(m) return m[2].padStart(2,'0') + '/' + (m[3].length===2 ? '20'+m[3] : m[3]);
  m = linha.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if(m) return m[2] + '/' + m[1];
  m = linha.match(/\b(\d{1,2})\/(\d{4})\b/);
  if(m) return m[1].padStart(2,'0') + '/' + m[2];
  return null;
}
function competenciaDe(linha){
  const d = dataVenc(linha);
  if(d) return d;
  let m = linha.match(/\b(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)[\/\-. ]*(\d{4})\b/i);
  if(m) return MES_FULL[m[1].toLowerCase()] + '/' + m[2];
  m = linha.match(/\b(\d{4})\s*-\s*(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/i);
  if(m) return MES_FULL[m[2].toLowerCase()] + '/' + m[1];
  m = linha.match(/\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*[\/\-. ](\d{2,4})\b/i);
  if(m) return MES_TXT[m[1].toLowerCase()] + '/' + (m[2].length===2 ? '20'+m[2] : m[2]);
  return null;
}

/* ======================================================================
   1) Relatório de Inadimplências do Vouch (consolidado) — leitor dedicado
   Estrutura (linhas do pdf.js):
     Condomínio NOME - CNPJ 00.000.000/0001-00
     Relatório de Inadimplências - Consolidado (Até dd/mm/aaaa) | Emissão: dd/mm/aaaa hh:mm:ss
     Total (N taxas em M unidades, ...)
     BLOCO - UNID | NOME | CPF | telefones      ← cabeçalho do devedor (CPF/telefones opcionais)
     DOCUMENTO | competência | referência | dd/mm/aaaa | [Detalhe] | [Sim] | valores…
     (linhas de continuação com o mês da competência, "Judicial", "#007550 (3/7)", valores)
     Subtotal | …
   ====================================================================== */
const RE_VOUCH_DEVEDOR = /^(?:([A-Za-z0-9]{1,6})\s*-\s*)?((?:(?!TOTAL|SUBTOTAL|P[ÁA]GINA)[A-Za-zÀ-ú]{2,12}\.?\s+)?[A-Za-z]{0,3}\d{1,5}[A-Za-z]?)\s*\|\s*([^|]*[A-Za-zÀ-ú]{3,}[^|]*?)\s*(?:\|\s*(\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b[^|]*)?(?:\|.*)?$/;
const RE_VOUCH_TAXA = /^(\d{7,9})\s*\|\s*(.+)$/;

function ehRelatorioVouch(txt){ return /Relat[óo]rio de Inadimpl[êe]ncias?\s*-\s*Consolidado/i.test(txt) || /FAN R&V/i.test(txt); }

function lerVouch(txt){
  const linhas = String(txt||'').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const r = { condominio:'', cnpj:'', corte:'', emissao:'', totalTaxas:null, totalUnidades:null, devedores:[], avisos:[],
             consolidado: /Relat[óo]rio de Inadimpl[êe]ncias?\s*-\s*Consolidado/i.test(txt),
             /* "Apresentar vencimento para N.V": cabeçalho com a coluna Novo Vencimento (duas colunas "Vencimento") */
             colunaNovoVenc: /^Documento\b.*\bVencimento\b.*\bVencimento\b/im.test(txt) || /\bNovo\s*\|?\s*Vencimento\b/i.test(txt) };
  let atual = null, taxa = null;

  const fecharDevedor = () => { if(atual){ r.devedores.push(atual); } atual = null; taxa = null; };
  const mesDeCelulas = cels => {
    for(const c of cels){
      const m = c.match(/^(\d{4})\s*-\s*([A-Za-zç]+)$/);
      if(m && MES_FULL[m[2].toLowerCase()]) return MES_FULL[m[2].toLowerCase()] + '/' + m[1];
      const m2 = c.match(/^-?\s*([A-Za-zç]+)$/);
      if(m2 && MES_FULL[m2[1].toLowerCase()]) return MES_FULL[m2[1].toLowerCase()];
    }
    return null;
  };
  const ultimoValor = cels => { for(let i = cels.length-1; i >= 0; i--){ const m = cels[i].match(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})$/); if(m) return numBR(m[1]); } return null; };

  for(const linha of linhas){
    let m;
    if((m = linha.match(/^Condom[íi]nio\s+(.+?)\s+-\s+CNPJ\s+([\d.\/-]{14,18})/i))){ r.condominio = m[1].trim(); r.cnpj = m[2]; continue; }
    if((m = linha.match(/Consolidado\s*\(At[ée]\s+(\d{2}\/\d{2}\/\d{4})\)/i))){ r.corte = m[1]; const e = linha.match(/Emiss[ãa]o:\s*(\d{2}\/\d{2}\/\d{4})/i); if(e) r.emissao = e[1]; continue; }
    if((m = linha.match(/^Total\s*\((\d+)\s+taxas?\s+em\s+(\d+)\s+unidades?/i))){ if(r.totalTaxas === null){ r.totalTaxas = +m[1]; r.totalUnidades = +m[2]; } fecharDevedor(); continue; }
    if(/^Subtotal\b/i.test(linha)){ fecharDevedor(); continue; }
    if(/^(Documento\b|Valor\b|Relat[óo]rio|FAN R&V|Tel:|Total\b|Nada consta|Em dia|Sem (d[ée]bitos?|pend[êe]ncias?|inadimpl))/i.test(linha)) continue;

    if((m = linha.match(RE_VOUCH_TAXA))){
      if(!atual){ r.avisos.push('Taxa sem devedor: ' + linha.slice(0,60)); continue; }
      const cels = m[2].split('|').map(c => c.trim()).filter(Boolean);
      const venc = cels.find(c => /^\d{2}\/\d{2}\/\d{4}$/.test(c)) || '';
      if(!venc){ taxa = null; continue; }   // sem vencimento: não é linha de taxa (ex.: continuação com número)
      const compCel = cels[0] || '';
      let comp = null;
      const mc = compCel.match(/^(\d{4})\s*-\s*([A-Za-zç]+)$/);
      if(mc && MES_FULL[mc[2].toLowerCase()]) comp = MES_FULL[mc[2].toLowerCase()] + '/' + mc[1];
      const refCel = cels.find(c => /arrecada|acordo|rateio|taxa|multa|fundo/i.test(c)) || cels[1] || '';
      const tipo = /acordo/i.test(refCel) ? 'acordo' : /arrecada/i.test(refCel) ? 'arrecadacao' : 'outro';
      const marc = [];
      if(cels.some(c => /^Jur[íi]dico$/i.test(c))) marc.push('Jurídico');
      if(cels.some(c => /Em N\.?V/i.test(c))) marc.push('Novo vencimento');
      if(cels.some(c => /^Sim$/i.test(c))) marc.push('Antecipado');
      const ultimaCel = cels[cels.length-1] || '';
      const valorNaLinha = /\d,\d{2}$/.test(ultimaCel) ? ultimoValor([ultimaCel]) : null;
      taxa = { documento: m[1], comp, compAno: compCel.match(/^(\d{4})/) ? compCel.match(/^(\d{4})/)[1] : null, venc, referencia: refCel, tipo, marcadores: marc,
               valor: valorNaLinha, _valorPendente: valorNaLinha === null, texto: linha.slice(0,160), incluir: true };
      atual.cobrancas.push(taxa);
      continue;
    }

    if(!/^\d{7,9}\b/.test(linha) && (m = linha.match(RE_VOUCH_DEVEDOR))){
      const nome = m[3].replace(/\s+/g,' ').trim();
      if(!/^(Subtotal|Total)/i.test(nome) && !RE_MES_NOME.test(nome.split(' ')[0]) ){
        fecharDevedor();
        const bloco = m[1] || '', unid = m[2];
        const docm = m[4] ? (soDigitos(m[4]).length === 11 ? completaCpf(m[4]) : fmtCnpj(m[4])) : '';
        const resto = linha.split('|').slice(2).join('|').replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g, '');
        atual = { bloco, unidade: unid, unidadeTxt: bloco ? `${bloco} - ${unid}` : unid, nome, cpf: soDigitos(docm).length === 11 ? docm : '', cnpj: soDigitos(docm).length === 14 ? docm : '', telefone: /\d{4}-?\d{4}|\d{10,13}/.test(resto), cobrancas: [] };
        continue;
      }
    }

    /* linha de continuação de uma taxa: completa competência, referência e valor */
    if(taxa){
      const cels = linha.split('|').map(c => c.trim()).filter(Boolean);
      if(!taxa.comp){
        const mes = mesDeCelulas(cels);
        if(mes){ taxa.comp = mes.includes('/') ? mes : mes + '/' + (taxa.compAno || taxa.venc.slice(6)); }
      }
      if(/^Judicial\b/i.test(cels[0] || '')) taxa.referencia = (taxa.referencia + ' Judicial').trim();
      const np = cels.find(c => /^#\d+/.test(c)); if(np) taxa.referencia = (taxa.referencia + ' ' + np).trim();
      if(taxa._valorPendente){ const v = ultimoValor(cels); if(v !== null){ taxa.valor = v; taxa._valorPendente = false; } }
    }
  }
  fecharDevedor();

  r.devedores.forEach(d => { d.cobrancas.forEach(t => { if(!t.comp) t.comp = t.venc.slice(3); delete t._valorPendente; delete t.compAno; }); d.nadaConsta = d.cobrancas.length === 0; });
  r.lidas = r.devedores.reduce((s,d) => s + d.cobrancas.length, 0);
  r.inadimplentes = r.devedores.filter(d => !d.nadaConsta).length;
  r.emDia = r.devedores.length - r.inadimplentes;
  r.conferido = r.totalTaxas !== null && r.lidas === r.totalTaxas && r.inadimplentes === r.totalUnidades;
  /* informações que precisam constar no relatório (conferidas por criteriosVouch) */
  r.unidadesListadas = r.devedores.length;
  r.comNome = r.devedores.filter(d => /[A-Za-zÀ-ú]{2,}/.test(d.nome || '')).length;
  r.comCpf = r.devedores.filter(d => d.cpf || d.cnpj).length;
  r.comTelefone = r.devedores.filter(d => d.telefone).length;
  if(r.totalTaxas !== null && !r.conferido)
    r.avisos.push(`Leitura divergente: li ${r.lidas} taxas em ${r.inadimplentes} unidades, o relatório informa ${r.totalTaxas} em ${r.totalUnidades}.`);
  if(r.totalTaxas === null) r.avisos.push('Não encontrei a linha "Total (N taxas em M unidades)" — não foi possível conferir a leitura.');
  return r;
}

/* ======================================================================
   2) Relatórios genéricos (administradora anterior) — leitor heurístico
   ====================================================================== */
const RE_EXCLUI = /multa|juros|corre[çc]|honor|mora\b|atualiza[çc]|desconto|saldo|^total|subtotal/i;
const RE_NAO_NOME = /relat[óo]rio|condom[íi]nio|per[íi]odo|inadimplen|^total|p[áa]gina|emiss|vencimento|compet[êe]ncia|hist[óo]rico|banco|cnpj|endere|telefone|e-?mail|www|ltda|\bs\.?\/?a\.?\b|securitiza|pend[êe]ncia|refer[êe]ncia|documento|arrecada|detalhe|antecipado|jur[íi]dico|d[ée]bito/i;
const RE_UNIDADE = /(?:\b(?:bloco|bl|torre|quadra|qd)\.?\s*([A-Za-z0-9]{1,4})\b[^|]{0,12})?\b(?:ap(?:to|t|artamento)?|unid(?:ade)?|casa|sala|loja|lote)\b\.?\s*[:\-]?\s*([A-Za-z]?\d{1,5}[A-Za-z]?)\b/i;
const RE_RODAPE = /residence|\bclub\b|condom[íi]nio|residencial|avenida|\brua\b|quadra|setor|\bcep\b|business|@|\bde\s+\d+\s*$|^\s*\d+\s*\/\s*\d+\s*$|^\s*p[áa]gina|inadimplen|valores atualizados/i;

function extrairDevedoresTransposto(txt){
  const linhas = txt.split(/\r?\n/).map(l => l.trim());
  const pega = rot => { const l = linhas.find(x => new RegExp('^' + rot + '\\b', 'i').test(x) && x.includes('|')); return l ? l.split('|').slice(1).map(s => s.trim()).filter(s => s !== '') : null; };
  const units = pega('Unidade'), nomes = pega('Devedor'), vencs = pega('Vencimento');
  if(!units || !nomes || !vencs) return null;
  const n = Math.min(units.length, nomes.length, vencs.length);
  if(n === 0) return null;
  const mapa = new Map();
  for(let i = 0; i < n; i++){
    const comp = dataVenc(vencs[i]) || vencs[i];
    const chave = normUnid(units[i]) + '|' + normNome(nomes[i]);
    if(!mapa.has(chave)) mapa.set(chave, { unidade: units[i], unidadeTxt: units[i], nome: nomes[i], cpf:'', cobrancas: [] });
    mapa.get(chave).cobrancas.push({ texto: `${units[i]} · ${nomes[i]} · venc. ${vencs[i]}`, comp, venc: vencs[i], incluir: true });
  }
  return [...mapa.values()];
}

/* "Inadimplências consolidadas" por unidade (ex.: MSA Gestão): linha da unidade com os totais,
   depois uma linha por competência "NOME - NN:000 | MM/AAAA | DD/MM/AAAA | atraso | valor ...". Nome que quebra de linha é ignorado. */
function extrairDevedoresConsolidado(txt){
  if(!/INADIMPL[ÊE]NCIAS CONSOLIDADAS/i.test(txt)) return null;
  const lista = []; let atual = null;
  for(const bruta of txt.split(/\r?\n/)){
    const linha = bruta.trim(); if(!linha) continue;
    const cel = linha.split('|').map(c => c.trim());
    if(/^[A-Za-z0-9][A-Za-z0-9 .\/-]{0,11}$/.test(cel[0]) && /\d/.test(cel[0]) && cel.length >= 2 && cel.slice(1).every(c => /^[\d.,-]+$/.test(c)) && cel.slice(1).some(c => /,\d{2}$/.test(c))){
      atual = { unidade: cel[0], unidadeTxt: cel[0], nome: '', cpf: '', cobrancas: [] }; lista.push(atual); continue;
    }
    if(!atual) continue;
    const iComp = cel.findIndex(c => /^\d{2}\/\d{4}$/.test(c));
    if(iComp > 0 && /^\d{2}\/\d{2}\/\d{4}$/.test(cel[iComp + 1] || '')){
      const nome = cel[0].replace(/\s*-\s*NN:.*$/i, '').trim();
      if(!atual.nome && nome) atual.nome = nome;
      atual.cobrancas.push({ texto: linha.slice(0, 170), comp: cel[iComp], venc: cel[iComp + 1], incluir: true });
    }
  }
  const ok = lista.filter(b => b.cobrancas.length);
  return ok.length ? ok : null;
}
/* Relatórios com cabeçalho rotulado por unidade (ex.: "CONTAS A RECEBER POR CONDÔMINO"):
   "Unidade: SALA 601 - NOME DO CONDÔMINO", seguido de uma linha por cobrança com competência (MM/AAAA) e vencimento.
   Conta competências distintas; tarifa bancária, multa, juros e honorários soltos não contam como cobrança. */
function extrairDevedoresRotulados(txt){
  const linhas = txt.split(/\r?\n/);
  if(linhas.filter(l => /^\s*Unidade\s*:\s*\S/i.test(l)).length < 1) return null;
  const padrao = /PLANILHA PADR[ÃA]O/i.test(linhas[0] || '');   // vinda da planilha padrão: vencimento é opcional
  const lista = []; let atual = null;
  for(const bruta of linhas){
    const linha = bruta.trim(); if(!linha) continue;
    const mU = linha.match(/^Unidade\s*:\s*([^|]+?)\s*(?:\||$)/i);
    if(mU){
      // planilha padrão: "Unidade: A - 101 | Titular: NOME | CPF" (a unidade pode ter hífen); relatórios: "Unidade: SALA 601 - NOME"
      const mT = linha.match(/\|\s*Titular:\s*([^|]*)/i);
      const partes = mT ? [mU[1]] : mU[1].split(/\s+-\s+/);
      const unid = partes.shift().trim(), nome = mT ? mT[1].trim() : partes.join(' - ').trim();
      atual = { unidade: unid, unidadeTxt: unid, nome, cpf: (linha.match(RE_CPF) || [''])[0], cobrancas: [], _comps: new Set() };
      lista.push(atual); continue;
    }
    if(!atual || /^total\b/i.test(linha)) continue;
    const cel = linha.split('|').map(c => c.trim());
    const iComp = cel.findIndex(c => /^\d{2}\/\d{4}$/.test(c));
    if(iComp < 0 || (!padrao && !cel.slice(iComp + 1).some(c => /^\d{2}\/\d{2}\/\d{4}$/.test(c)))) continue;
    if(/^(tarifa|multa|juros|honor|custas|corre[çc])/i.test(cel[0] || '')) continue;
    if(atual._comps.has(cel[iComp])) continue;
    atual._comps.add(cel[iComp]);
    atual.cobrancas.push({ texto: linha.slice(0, 170), comp: cel[iComp], venc: cel.slice(iComp + 1).find(c => /^\d{2}\/\d{2}\/\d{4}$/.test(c)) || '', incluir: true });
  }
  lista.forEach(b => delete b._comps);
  const ok = lista.filter(b => b.cobrancas.length);
  return ok.length ? ok : null;
}
function extrairDevedores(txt, soValor){
  if(ehRelatorioVouch(txt)) return lerVouch(txt).devedores;
  const cons = extrairDevedoresConsolidado(txt);
  if(cons) return cons;
  const rot = extrairDevedoresRotulados(txt);
  if(rot) return rot;
  const trans = extrairDevedoresTransposto(txt);
  if(trans) return trans.filter(b => b.cobrancas.length);
  const lista = [];
  let unidAtual = '', atual = null;
  const exigirValor = soValor && RE_VALOR.test(txt);
  txt.split(/\r?\n/).forEach(bruta => {
    const linha = bruta.trim(); if(!linha) return;
    const mU = linha.match(RE_UNIDADE);
    const unidLinha = mU ? [mU[1], mU[2]].filter(Boolean).join('-') : '';
    if(unidLinha && !RE_CPF.test(linha) && !dataVenc(linha)) unidAtual = unidLinha;
    const cpfM = linha.match(RE_CPF);
    const celulas = linha.split('|').map(c => c.trim()).filter(Boolean);
    if(!cpfM && !dataVenc(linha)){
      const mCod = linha.match(/^([A-Za-z0-9]{1,4}(?:\s+[A-Za-z0-9]{1,4})?)\s*\|?\s*[-–]\s+(.+)$/);
      if(mCod && /\d/.test(mCod[1])){
        const codUnid = mCod[1].replace(/\s+/g,' ').trim();
        const nomeDev = mCod[2].split('/')[0].replace(/\|/g,' ').replace(/\s+/g,' ').trim();
        if(tokensNome(nomeDev).length >= 2){ atual = { unidade: codUnid, unidadeTxt: codUnid, nome: nomeDev, cpf:'', cobrancas: [] }; lista.push(atual); return; }
      }
    }
    let nome = '';
    if(cpfM){
      const antes = linha.split(cpfM[0])[0];
      const cand = (antes.split('|').filter(c => /[A-Za-zÀ-ú]/.test(c) && !/\d/.test(c)).pop() || '').trim();
      nome = cand || celulas.find(c => /[A-Za-zÀ-ú]/.test(c) && !/\d/.test(c)) || '';
    } else if(!dataVenc(linha) && celulas.length <= 2){
      const c = celulas[0] || '';
      if(/^[A-Za-zÀ-ú][A-Za-zÀ-ú' .]{5,}$/.test(c) && tokensNome(c).length >= 2 && !RE_NAO_NOME.test(c) && !RE_RODAPE.test(c)) nome = c;
    }
    if(nome && tokensNome(nome).length >= 2){
      let un = unidLinha;
      if(!un){ const c0 = celulas[0] || ''; if(c0 !== nome && /^[A-Za-z]{0,3}\d{1,5}[A-Za-z]?$/.test(c0)) un = c0; }
      atual = { unidade: un || unidAtual, unidadeTxt: un || unidAtual, nome: nome.replace(/\s+/g,' '), cpf: cpfM ? cpfM[0] : '', cobrancas: [] };
      lista.push(atual); return;
    }
    const comp = dataVenc(linha);
    if(!comp || !atual) return;
    if(RE_EXCLUI.test(linha)) return;
    if(exigirValor && !RE_VALOR.test(linha)) return;
    atual.cobrancas.push({ texto: linha.slice(0,170), comp, venc: (linha.match(RE_DATA)||[''])[0], incluir: true });
  });
  const merged = new Map();
  for(const b of lista){
    const k = normUnid(b.unidade) + '|' + normNome(b.nome);
    if(!merged.has(k)){ merged.set(k, b); continue; }
    const m = merged.get(k); const vistos = new Set(m.cobrancas.map(c => c.texto));
    for(const c of b.cobrancas) if(!vistos.has(c.texto)){ m.cobrancas.push(c); vistos.add(c.texto); }
  }
  return [...merged.values()].filter(b => b.cobrancas.length);
}

/* cabeçalho de relatório genérico: condomínio e CNPJ */
function lerCabecalhoGenerico(txt){
  const linhas = txt.split(/\r?\n/).map(l => l.trim());
  let cond = '', cnpj = '';
  for(const l of linhas){
    let m = l.match(/^condom[íi]nio\s+([A-Za-zÀ-ú0-9 .'&]+?)(?:\s*[-|]\s*cnpj.*)?$/i);
    if(m && !/securitiza|garantia|fan\b/i.test(l)){ const nome = m[1].trim(); if(nome && nome.length > 2) cond = nome; }
    const c = l.match(/cnpj\s*[:\-]?\s*(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/i);
    if(c && /condom[íi]nio/i.test(l)) cnpj = c[1];
    if(cond && cnpj) break;
  }
  return { condominio: cond, cnpj };
}

/* ======================================================================
   3) E-mail de sinalização de espólios
   ====================================================================== */
const RE_ESPOLIO_LIXO = /an[áa]lise|propriet|sistema|assertiva|identificad|\bstatus\b|falecid|d[úu]vida|disposi[çc]|atenciosa|prezad|cordial|permanec/i;

function lerTabelaEmail(linhas){
  const esp = [];
  for(let i = 0; i < linhas.length; i++){
    const l = linhas[i];
    const m = l.match(/^\s*([A-Za-z]?\d{1,5}[A-Za-z]?)\s*\|\s*(\d{10,11})\s*\|\s*(.+)$/);
    if(!m) continue;
    const cels = m[3].split('|').map(s => s.trim());
    const sufixo = cels.filter(s => /[A-Za-zÀ-ú]/.test(s) && !/^(sim|n[ãa]o)$/i.test(s) && !/\d{2}\/\d{2}\/\d{4}/.test(s)).join(' ');
    const prev = (linhas[i-1] || '').trim();
    const ehCabecalho = /\b(unidade|cpf|nome|[óo]bito|datanasc|dataobito|assunto|enviado|prezad|cordial|atenciosa)\b/i.test(prev);
    const prefixo = (/^[A-Za-zÀ-ú' ]{3,}$/.test(prev) && !/\|/.test(prev) && !/\d/.test(prev) && !ehCabecalho && tokensNome(prev).length >= 1) ? prev : '';
    esp.push({ unid: m[1], titular: (prefixo + ' ' + sufixo).replace(/\s+/g,' ').trim(), cpf: completaCpf(m[2]) });
  }
  return esp;
}
function lerLinhaCpf(linhas){
  const esp = [], vistos = new Set();
  for(const l of linhas){
    if(RE_RODAPE.test(l)) continue;
    const m = l.match(/(\d{3}\.\d{3}\.\d{3}-\d{2})/) || l.match(/\b(\d{11})\b/) || l.match(/\b(\d{10})\b/);
    if(!m) continue;
    const cpf = completaCpf(m[1]);
    let resto = l.replace(m[0], ' ').replace(/\|/g,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
    let unid = '';
    const mu = resto.match(/^([A-Za-z]{0,3}\d{1,5}[A-Za-z]?)\b\s*/);
    if(mu){ unid = mu[1].trim(); resto = resto.slice(mu[0].length); }
    const nome = resto.replace(/\s+/g,' ').trim();
    if(tokensNome(nome).length < 2 || RE_ESPOLIO_LIXO.test(nome)) continue;
    const chave = soDigitos(cpf) || (normUnid(unid) + '|' + normNome(nome));
    if(vistos.has(chave)) continue; vistos.add(chave);
    esp.push({ unid, titular: nome, cpf });
  }
  return esp;
}
function dedupEspolios(esp){
  const out = [], vistos = new Set();
  for(const u of esp){ const chave = soDigitos(u.cpf) || (normUnid(u.unid) + '|' + normNome(u.titular)); if(vistos.has(chave)) continue; vistos.add(chave); out.push(u); }
  return out;
}
function lerEmail(txt){
  const linhas = txt.split(/\r?\n/).map(l => l.trim());
  let remetente = '';
  for(const l of linhas){
    if(!/^de\b\s*:?/i.test(l)) continue;
    let corpo = l.replace(/^de\s*:?\s*/i,'').replace(/\|/g,' ').replace(/<[^>]*>/g,' ').replace(/\S+@\S+/g,' ').trim();
    corpo = corpo.split(/\s+-\s+/)[0].trim();
    if(tokensNome(corpo).length >= 2){ remetente = corpo.replace(/\s+/g,' '); break; }
  }
  let esp = lerTabelaEmail(linhas);
  if(!esp.length){
    let cur = null;
    const flush = () => { if(cur && (cur.unid || cur.cpf || cur.nome)) esp.push({ unid: cur.unid, titular: cur.nome, cpf: cur.cpf }); cur = null; };
    linhas.forEach(l => {
      let m = l.match(/^(?:condom[íi]nio|cond[oô]mino|nome|titular|propriet[áa]rio|respons[áa]vel)\s*:?\s*\|?\s*(.+)$/i);
      if(m){ const nome = m[1].replace(/\|/g,' ').trim(); if(tokensNome(nome).length >= 2){ flush(); cur = {unid:'',cpf:'',nome:nome.replace(/\s+/g,' ')}; } return; }
      m = l.match(/^unidade\s*:?\s*\|?\s*([A-Za-z0-9\-]+)/i);
      if(m){ if(!cur) cur = {unid:'',cpf:'',nome:''}; cur.unid = m[1]; return; }
      m = l.match(/^cpf\s*:?\s*\|?\s*(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/i);
      if(m){ if(!cur) cur = {unid:'',cpf:'',nome:''}; cur.cpf = completaCpf(m[1]); return; }
    });
    flush();
  }
  if(!esp.length) esp = lerLinhaCpf(linhas);
  return { remetente, espolios: dedupEspolios(esp.filter(e => e.titular)) };
}
/* texto digitado: um espólio por linha */
function lerSinalizacao(txt){
  const novas = [];
  txt.split(/\r?\n/).forEach(bruta => {
    const linha = bruta.trim(); if(!linha) return;
    const cpfM = linha.match(RE_CPF); const cpf = cpfM ? cpfM[0] : '';
    let resto = cpf ? linha.replace(cpf,' ') : linha;
    let unid = '';
    const mBU = resto.match(/^([A-Za-z0-9]{1,6})\s*-\s*([A-Za-z]{0,3}\d{1,5}[A-Za-z]?)(?=[\s\t;|]|$)/);   // "A - 407", "37 - 403"
    if(mBU && !RE_CPF.test(mBU[0])){ unid = `${mBU[1]} - ${mBU[2]}`; resto = resto.slice(mBU[0].length); }
    const mU = unid ? null : resto.match(RE_UNIDADE);
    if(mU){ unid = [mU[1], mU[2]].filter(Boolean).join('-'); resto = resto.replace(mU[0],' '); }
    let campos = resto.split(/\t|;|\||\s+[-–]\s+/).map(c=>c.trim()).filter(Boolean);
    let titular = campos.find(c => tokensNome(c).length >= 2 && !RE_NAO_NOME.test(c)) || '';
    if(!titular && !unid){ const m = resto.match(/^(\w{1,5})\s+(.{4,})$/); if(m && tokensNome(m[2]).length >= 2){ unid = m[1]; titular = m[2].trim(); } }
    if(!titular) return;
    if(!unid){ const c0 = campos[0]; if(c0 && c0 !== titular && /^[A-Za-z]?\d{1,5}[A-Za-z]?$/.test(c0)) unid = c0; }
    novas.push({ unid, titular: titular.replace(/\s+/g,' '), cpf });
  });
  return novas;
}

/* ======================================================================
   4) Base do Power BI (Excel/CSV do dia ou PDF de um condomínio)
   ====================================================================== */
/* "Extração das Unidades" do Vouch, filtrada pela Implantação só com as unidades marcadas em espólio.
   Cabeçalho: "NOME DO CONDOMÍNIO - CNPJ 00.000.000/0000-00"; tabela: Unidade | Contato (proprietário) | Proprietário CPF/CNPJ | ...
   Só unidade, titular e CPF são aproveitados; valores, contatos e prazos são descartados. */
/* Planilha padrão do relatório anterior (Excel ou CSV): Unidade | Titular | CPF | Descrição | Competência | Vencimento,
   uma linha por cobrança em aberto. Vira o texto "Unidade: X - titular" que extrairDevedoresRotulados já lê,
   com as mesmas regras de contagem (competências distintas; tarifa, multa, juros e honorários soltos não contam). */
async function lerPlanilhaAnterior(file){
  let rows;
  if(/\.csv$/i.test(file.name)){
    const txt = (await file.text()).replace(/^\uFEFF/, '');
    const l1 = txt.split(/\r?\n/)[0] || '';
    const sep = [';', '\t', ','].sort((a, b) => l1.split(b).length - l1.split(a).length)[0];
    rows = txt.split(/\r?\n/).map(l => l.split(sep).map(c => c.replace(/^"|"$/g, '').trim()));
  } else rows = await planilhaParaMatriz(file);
  const hi = rows.findIndex(r => r.some(c => /^unidade$/i.test(String(c).trim())) && r.some(c => /compet/i.test(String(c))));
  if(hi < 0) throw new Error('não encontrei as colunas da planilha padrão (Unidade, Titular, CPF, Descrição, Competência, Vencimento)');
  const head = rows[hi].map(c => String(c || '').toLowerCase().trim());
  const col = re => head.findIndex(h => re.test(h));
  /* aceita também o formato do portal na Análise de Crédito (skill leitura-inadimplencia-myblue): unidade;titular;CPF/CNPJ;competência;tipo;valor;vencimento */
  const c = { u: col(/^unidade$/), t: col(/titular|nome|cond[oô]mino|propriet/), cpf: col(/cpf|cnpj|documento/), d: col(/descri/) >= 0 ? col(/descri/) : col(/^tipo/), comp: col(/compet/), v: col(/venc/) };
  const compTxt = v => { if(typeof v === 'number'){ const d = excelData(v); return d ? d.slice(5,7) + '/' + d.slice(0,4) : ''; }
    const s = String(v || '').trim(); let m = s.match(/^(\d{1,2})\/(\d{4})$/); if(m) return m[1].padStart(2,'0') + '/' + m[2];
    m = s.match(/^(\d{4})-(\d{2})/); if(m) return m[2] + '/' + m[1]; m = s.match(/^\d{2}\/(\d{2})\/(\d{4})$/); if(m) return m[1] + '/' + m[2]; return ''; };
  const vencTxt = v => { if(v === '' || v === null || v === undefined) return ''; const d = excelData(v); return d ? d.slice(8,10) + '/' + d.slice(5,7) + '/' + d.slice(0,4) : ''; };
  const porUnid = new Map(); let n = 0;
  for(const r of rows.slice(hi + 1)){
    const unid = String(r[c.u] ?? '').trim(); const comp = compTxt(r[c.comp]); if(!unid || !comp) continue;
    const g = porUnid.get(unid) || { titular: String(c.t >= 0 ? r[c.t] ?? '' : '').trim(), cpf: String(c.cpf >= 0 ? r[c.cpf] ?? '' : '').trim(), linhas: [] };
    g.linhas.push(`${String(c.d >= 0 ? r[c.d] ?? '' : '').trim() || 'COBRANÇA'} | ${comp} | ${c.v >= 0 ? vencTxt(r[c.v]) : ''}`); n++;
    porUnid.set(unid, g);
  }
  if(!porUnid.size) throw new Error('a planilha não tem linhas de cobrança (Unidade e Competência preenchidas)');
  const texto = ['RELATÓRIO ANTERIOR · PLANILHA PADRÃO · ' + file.name]
    .concat([...porUnid].flatMap(([u, g]) => [`Unidade: ${u} | Titular: ${g.titular}${g.cpf ? ' | ' + g.cpf : ''}`, ...g.linhas])).join('\n');
  return { texto, unidades: porUnid.size, linhas: n };
}
async function lerExtracaoUnidades(file){
  const rows = await planilhaParaMatriz(file);
  let condominio = '', cnpj = '';
  for(const r of rows.slice(0, 15)){
    const t = r.map(c => String(c || '')).join(' ');
    const m = t.match(/^\s*(.+?)\s*-\s*CNPJ\s*([\d./-]{14,18})/i);
    if(m){ condominio = m[1].trim(); cnpj = fmtCnpj(m[2]); break; }
  }
  const hi = rows.findIndex(r => r.some(c => /^unidade$/i.test(String(c).trim())) && r.some(c => /cpf/i.test(String(c))));
  if(hi < 0) return null;
  const head = rows[hi].map(c => String(c || '').toLowerCase().trim());
  const cU = head.findIndex(h => /^unidade$/.test(h)), cN = head.findIndex(h => /contato|propriet[áa]rio$|nome/.test(h) && !/cpf/.test(h)), cC = head.findIndex(h => /cpf/.test(h));
  const unidades = [];
  for(const r of rows.slice(hi + 1)){
    const unid = String(r[cU] ?? '').trim(); if(!unid) continue;
    const nome = String(r[cN] ?? '').trim().replace(/^esp[óo]lio\s+(de|do|da)\s+/i, '').trim();
    const doc = String(r[cC] ?? '').trim();
    unidades.push({ unid, titular: nome, cpf: soDigitos(doc).length === 11 ? doc : '' });
  }
  return { condominio, cnpj, unidades };
}
async function planilhaParaMatriz(file){
  if(typeof XLSX === 'undefined') throw new Error('leitor de Excel não carregou (verifique a conexão)');
  const wb = XLSX.read(await file.arrayBuffer(), {type:'array'});
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, {header:1, raw:true, defval:''});
}
function baseDaPlanilha(rows){
  if(!rows || !rows.length) return [];
  let hi = rows.findIndex(r => Array.isArray(r) && r.some(c => /condom/i.test(String(c))) && r.some(c => /resultado/i.test(String(c))));
  if(hi < 0) hi = 0;
  const head = (rows[hi]||[]).map(c => String(c||'').toLowerCase());
  const acha = (re, doFim) => { const idxs = head.map((h,i) => re.test(h) ? i : -1).filter(i => i >= 0); return idxs.length ? (doFim ? idxs[idxs.length-1] : idxs[0]) : -1; };
  let nomeCol = acha(/condom/); if(nomeCol < 0) nomeCol = 0;
  let mesesCol = acha(/idade|m[êe]s/);
  let resCol = acha(/resultado/, true); if(resCol < 0) resCol = (rows[hi]||[]).length - 1;
  const base = [], vistos = new Set();
  for(let r = hi+1; r < rows.length; r++){
    const row = rows[r]; if(!Array.isArray(row)) continue;
    const nome = String(row[nomeCol] ?? '').trim();
    if(!nome || /^total/i.test(nome)) continue;
    let meses = null;
    if(mesesCol >= 0){ const m = parseInt(String(row[mesesCol]).replace(/\D/g,''),10); if(!isNaN(m)) meses = m; }
    const n = numBR(row[resCol]); if(n === null) continue;
    const chave = normCond(nome); if(vistos.has(chave)) continue; vistos.add(chave);
    base.push({ nome, meses, sinal: n < 0 ? '-' : '+', resultado: Math.abs(n) });
  }
  return base;
}
function lerBaseBiTexto(txt){
  const base = [], vistos = new Set();
  for(const l of txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean)){
    const vals = l.match(/-?\d{1,3}(?:\.\d{3})*,\d{2}/g) || [];
    if(vals.length < 4 || !/^[A-Za-zÀ-ú]/.test(l)) continue;
    const cel = l.split('|').map(c => c.trim()); const nome = cel[0];
    if(!nome || /^total/i.test(nome)) continue;
    const intCell = cel.find(c => /^\d{1,3}$/.test(c)); const ultimo = vals[vals.length-1];
    const chave = normCond(nome); if(vistos.has(chave)) continue; vistos.add(chave);
    base.push({ nome, meses: intCell ? parseInt(intCell,10) : null, sinal: /^-/.test(ultimo) ? '-' : '+', resultado: Math.abs(numBR(ultimo)) });
  }
  return base;
}
/* casa o condomínio com uma linha da base (Dice); devolve {item, ambiguo} ou null */
function casarBaseBi(base, razao){
  if(!base || !base.length) return null;
  const alvo = biTok(normCond(razao||'')); if(!alvo.length) return null;
  let best = null, bs = 0, second = 0;
  base.forEach(b => {
    const t = biTok(normCond(b.nome)); if(!t.length) return;
    const comuns = t.filter(x => alvo.includes(x)).length; if(!comuns) return;
    const dice = 2*comuns / (t.length + alvo.length);
    if(dice > bs){ second = bs; bs = dice; best = b; } else if(dice > second){ second = dice; }
  });
  if(!best || bs < 0.34) return null;
  return { item: best, ambiguo: (bs - second) < 0.08, score: bs };
}

/* ======================================================================
   5) Planilha "Controle de Verificação de Espólios" (carga inicial)
   Abas mensais (Jan26…) com: Quant. | Status | Comarca | Condomínio | Vigência | Responsável | Observações
   ====================================================================== */
const MES_ABA = {jan:'01',fev:'02',mar:'03',abr:'04',mai:'05',jun:'06',jul:'07',ago:'08',set:'09',out:'10',nov:'11',dez:'12'};
function mesDaAba(nome, vigencia){
  let m = String(nome||'').match(/^([a-z]{3})\s*\/?\s*(\d{2,4})$/i);
  if(m && MES_ABA[m[1].toLowerCase()]){ const a = m[2].length === 2 ? '20' + m[2] : m[2]; return a + '-' + MES_ABA[m[1].toLowerCase()]; }
  m = String(vigencia||'').match(/(\d{1,2})\/(\d{2,4})/);
  if(m){ const a = m[2].length === 2 ? '20' + m[2] : m[2]; return a + '-' + m[1].padStart(2,'0'); }
  return '';
}
function unidadesDasObs(obs){
  const s = String(obs||'').trim();
  if(!s) return { unidades: [], varias: false, nota: '' };
  if(/V[ÁA]RIAS/i.test(s)) return { unidades: [], varias: true, nota: s };
  if(/SEM ESP[ÓO]LIO|DISTRATAD/i.test(s)) return { unidades: [], varias: false, nota: s };
  const partes = s.split(/\s*[\/;,]\s*/).map(p => p.trim()).filter(Boolean);
  const unidades = partes.map(p => { const m = p.match(/^(.+?)\s*-\s*([A-Za-z0-9]+)$/); return m ? { bloco: m[1].trim(), unid: m[2].trim(), unidTxt: p } : { bloco:'', unid: p, unidTxt: p }; });
  return { unidades, varias: false, nota: '' };
}
/* planilha unificada (Acompanhamento + Controle): uma linha por unidade, com CNPJ.
   Colunas: Condomínio, Razão social, CNPJ, UF, Vigência, Mês da verificação, Unidade, Déb. anterior, Última verificação, Status, Observação, Fonte.
   Devolve null se o arquivo não estiver nesse formato. */
async function lerPlanilhaUnificada(file){
  if(typeof XLSX === 'undefined') throw new Error('leitor de Excel não carregou');
  const wb = XLSX.read(await file.arrayBuffer(), {type:'array'});
  for(const nomeAba of wb.SheetNames){
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[nomeAba], {header:1, raw:true, defval:''});
    const hi = rows.findIndex(r => { const h = r.map(c => String(c||'').toLowerCase()); return h.some(c => /^unidade/.test(c)) && h.some(c => /cnpj/.test(c)) && h.some(c => /condom/.test(c)); });
    if(hi < 0) continue;
    const head = rows[hi].map(c => String(c||'').toLowerCase().trim());
    const col = re => head.findIndex(h => re.test(h));
    const c = { cond: col(/^condom/), razao: col(/raz/), cnpj: col(/cnpj/), uf: col(/^uf$|comarca/), mes: col(/m[êe]s/), unid: col(/^unidade/), deb: col(/d[ée]b/), ult: col(/[úu]ltima/), st: col(/^status/), obs: col(/observ/), fonte: col(/fonte/) };
    const v = (row, i) => i >= 0 ? row[i] : '';
    const grupos = new Map();
    for(let r = hi+1; r < rows.length; r++){
      const row = rows[r]; const nome = String(v(row, c.cond) ?? '').trim(); if(!nome) continue;
      const cnpj = String(v(row, c.cnpj) ?? '').trim();
      const chave = chaveCond(String(v(row, c.razao) || nome), cnpj);
      const g = grupos.get(chave) || { chave, condominio: nome, razao: String(v(row, c.razao) ?? '').trim(), cnpj, comarca: String(v(row, c.uf) ?? '').trim(), unidades: [] };
      const unid = String(v(row, c.unid) ?? '').trim();
      const mes = String(v(row, c.mes) ?? '').trim();
      g.unidades.push({ unid: /^V[ÁA]RIAS/i.test(unid) ? '' : unid, varias: /^V[ÁA]RIAS/i.test(unid), deb: String(v(row, c.deb) ?? '').trim(), ultima: excelData(v(row, c.ult)),
                        mes: /^\d{2}\/\d{4}$/.test(mes) ? mes.slice(3) + '-' + mes.slice(0,2) : '', status: String(v(row, c.st) ?? '').trim(), obs: String(v(row, c.obs) ?? '').trim(), fonte: String(v(row, c.fonte) ?? '').trim() });
      grupos.set(chave, g);
    }
    return [...grupos.values()];
  }
  return null;
}
async function lerPlanilhaControle(file){
  if(typeof XLSX === 'undefined') throw new Error('leitor de Excel não carregou');
  const wb = XLSX.read(await file.arrayBuffer(), {type:'array'});
  const saida = [];
  for(const nomeAba of wb.SheetNames){
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[nomeAba], {header:1, raw:true, defval:''});
    const hi = rows.findIndex(r => r.some(c => /condom/i.test(String(c))));
    if(hi < 0) continue;
    const head = rows[hi].map(c => String(c||'').toLowerCase());
    const col = re => head.findIndex(h => re.test(h));
    const cStatus = col(/status/), cComarca = col(/comarca/), cCond = col(/condom/), cVig = col(/vig/), cResp = col(/respons/), cObs = col(/observ/);
    for(let r = hi+1; r < rows.length; r++){
      const row = rows[r]; const cond = String(row[cCond] ?? '').trim(); if(!cond) continue;
      const st = row[cStatus];
      const temEspolio = st === true || /^(sim|s|x|true|1|verdadeiro)$/i.test(String(st).trim());
      const vig = String(row[cVig] ?? '').trim();
      const obs = String(row[cObs] ?? '').trim();
      const u = unidadesDasObs(obs);
      saida.push({ mes: mesDaAba(nomeAba, vig), aba: nomeAba, condominio: cond, comarca: String(row[cComarca] ?? '').trim(), vigencia: vig,
                   responsavel: String(row[cResp] ?? '').trim(), temEspolio, obs, unidades: u.unidades, varias: u.varias });
    }
  }
  return saida;
}
