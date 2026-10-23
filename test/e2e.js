/* Teste de ponta a ponta em modo local (sem portal), com Chromium headless.
   Uso: node test/e2e.js <pasta-com-pdfs-reais> <pasta-com-libs-locais> <planilha-controle.xlsx> [pasta-screenshots]
   Libs locais: pdf.min.js, pdf.worker.min.js, xlsx.full.min.js, html2pdf.bundle.min.js (a rede do CI não alcança a CDN). */
const { chromium } = require(process.env.PW_PATH || 'playwright');
const fs = require('fs'), path = require('path');
const [,, pdfs, libs, planilha, shots] = process.argv;
const root = path.resolve(__dirname, '..');
const ok = (cond, msg) => { if(!cond){ console.error('FALHOU:', msg); process.exitCode = 1; } else console.log('ok  ', msg); };
(async () => {
  let html = fs.readFileSync(path.join(root, 'analise-espolio.html'), 'utf8')
    .replace('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'file://' + path.join(libs, 'pdf.min.js'))
    .replace('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'file://' + path.join(libs, 'xlsx.full.min.js'))
    .replace('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js', 'file://' + path.join(libs, 'html2pdf.bundle.min.js'))
    .replace('<script>', `<script>window.PDFJS_WORKER_SRC='file://${path.join(libs, 'pdf.worker.min.js')}';</script><script>`);
  const tmp = path.join(__dirname, '.e2e.tmp.html'); fs.writeFileSync(tmp, html);
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--headless=new', '--allow-file-access-from-files'] });
  const ctx = await b.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  p.on('console', m => { if(m.type() === 'error') erros.push(m.text()); });
  const dialogos = [];
  p.on('dialog', d => { dialogos.push(d.message()); d.accept(); });
  const papeisLocal = async v => { await p.evaluate(v => { if(v === null) localStorage.removeItem('myblue_espolio_papeis'); else localStorage.setItem('myblue_espolio_papeis', v); }, v); await p.reload(); await p.waitForFunction(() => Object.values(S.pronto).every(Boolean), { timeout: 20000 }); await p.waitForTimeout(400); };
  const abasVisiveis = () => p.$$eval('.tab', t => t.filter(x => !x.hidden).map(x => x.dataset.tab).join(','));
  const shot = async nome => { if(shots) await p.screenshot({ path: path.join(shots, nome + '.png'), fullPage: true }); };
  const arq = nome => fs.readdirSync(pdfs).find(f => f.toLowerCase().includes(nome));

  await p.goto('file://' + tmp);
  await p.waitForFunction(() => document.querySelector('#sync').classList.contains('local'), { timeout: 20000 });
  await p.waitForTimeout(500);
  ok(await p.$eval('#sync', e => e.textContent.includes('Modo local')), 'abre em modo local sem portal');
  await p.waitForFunction(() => Object.values(S.pronto).every(Boolean), { timeout: 20000 });
  ok((await abasVisiveis()) === 'dash,sol,pedir,minhas,lote,acessos,conf', 'fora do portal todas as abas ficam liberadas');
  await p.click('[data-tab="acessos"]'); await p.waitForTimeout(200);
  ok(/Fora do portal não há usuários: todas as abas ficam liberadas neste navegador/.test(await p.$eval('#p-acessos', e => e.textContent)), 'Acessos fora do portal mostra o aviso do Comissões');
  await papeisLocal('gestao');
  ok((await abasVisiveis()) === 'dash,sol,lote,acessos,conf', 'gestão vê Dashboard, Solicitações, Fila, Acessos e Configurações');

  /* 1 · carga inicial da planilha de controle */
  await p.click('[data-tab="conf"]');
  await p.setInputFiles('#confCargaArquivo', planilha);
  await p.waitForFunction(() => /Importado/.test(document.querySelector('#confCargaStatus').textContent), { timeout: 30000 });
  const carga = await p.$eval('#confCargaStatus', e => e.textContent);
  console.log('    ', carga.trim());
  await p.waitForTimeout(800);
  const nFila = await p.evaluate(() => fila().length);
  ok(nFila === 35, `fila após a carga inicial tem 35 condomínios (tem ${nFila})`);

  /* 2 · implantação a partir de uma solicitação registrada pela gestão (Esmeralda IV) */
  await p.click('[data-tab="sol"]'); await p.waitForTimeout(300);
  await p.evaluate(() => { 'use strict'; ME = Object.freeze({ ...ME }); });   // no portal o usuário pode vir somente leitura
  await p.click('#btnRegistrarSol'); await p.waitForTimeout(300);
  await p.fill('#rsNome', 'Assistente de Implantação Teste');
  await p.fill('#modal #solCond', 'CONDOMINIO ESMERALDA IV'); await p.fill('#modal #solCnpj', '54.641.400/0001-05');
  await p.fill('#modal #solUnidades [data-su="unid"]', 'A - 207'); await p.fill('#modal #solUnidades [data-su="titular"]', 'LILIANE LOPES PIRES'); await p.fill('#modal #solUnidades [data-su="cpf"]', '000.603.573-63');
  await p.click('#modal #solAddUnid'); await p.fill('#modal #solUnidades tr:nth-child(2) [data-su="unid"]', 'A - 407'); await p.fill('#modal #solUnidades tr:nth-child(2) [data-su="titular"]', 'LUANA DE HOLANDA ROLIM VERAS');
  await p.click('#modal #solAddUnid'); await p.fill('#modal #solUnidades tr:nth-child(3) [data-su="unid"]', 'B - 305'); await p.fill('#modal #solUnidades tr:nth-child(3) [data-su="titular"]', 'FULANO DE TAL QUE NAO EXISTE'); await p.fill('#modal #solUnidades tr:nth-child(3) [data-su="cpf"]', '111.222.333-44');
  await p.click('#modal #solEnviar'); await p.waitForTimeout(200);
  ok(/Escolha o tipo/.test(await p.$eval('#modal #solStatus', e => e.textContent)) && (await p.evaluate(() => S.solicitacoes.length)) === 0, 'registro pela gestão exige escolher o tipo');
  ok((await p.$eval('#rsTipo', e => e.classList.contains('invalido'))) && /Escolha o tipo/.test(await p.$eval('#toast', e => e.textContent)), 'campo que falta fica em vermelho e o aviso aparece na faixa de mensagem');
  await p.selectOption('#rsTipo', 'implantacao');
  await p.click('#modal #solEnviar'); await p.waitForFunction(() => S.solicitacoes.length === 1, { timeout: 10000 }); await p.waitForTimeout(400);
  const reg = await p.evaluate(() => S.solicitacoes[0]);
  ok(reg.solicitanteNome === 'Assistente de Implantação Teste' && reg.tipo === 'implantacao' && reg.origem === 'gestao' && reg.registradaPor === 'Coordenação de Cobrança', 'gestão registra solicitação em nome de quem pediu, com o tipo escolhido');
  ok(reg.protocolo === 'AE-2026-0001', `protocolo nasce na solicitação (${reg.protocolo})`);
  await p.click('#p-sol [data-sol]'); await p.waitForTimeout(300); await p.click('#mSolIniciar');
  await p.waitForFunction(() => S.rodada && S.rodada.solicitacaoId, { timeout: 10000 }); await p.waitForTimeout(300);
  ok((await p.evaluate(() => S.rodada.protocolo + ' | ' + nomeFicha(S.rodada))) === 'AE-2026-0001 | RASCUNHO AE-2026-0001 - CONDOMINIO ESMERALDA IV.pdf', 'análise iniciada leva o protocolo da solicitação; ficha de rascunho sai marcada como RASCUNHO');
  ok((await p.$$eval('.tab', t => t.filter(x => !x.hidden).length)) === 5 && (await p.$eval('#p-nova', e => e.classList.contains('ativa'))), 'editor abre como tela temporária, sem aba própria');
  await p.setInputFiles('#docVouch input[type=file]', path.join(pdfs, arq('esmeralda')));
  await p.waitForFunction(() => document.querySelector('#docVouch').classList.contains('ok'), { timeout: 30000 });
  ok((await p.inputValue('#razao')) === 'CONDOMINIO ESMERALDA IV', 'razão social preenchida pelo Vouch');
  ok((await p.inputValue('#cnpj')) === '54.641.400/0001-05', 'CNPJ preenchido pelo Vouch');
  await p.fill('#inicio', '4'); await p.fill('#bi', '2953.10'); await p.check('#semAnterior'); await p.waitForTimeout(400);
  const res = await p.evaluate(() => S.rodada.unidades.map(u => ({ unid: u.unid, vouch: u.vouch, r: u.resultado, regra: u.regra, cas: u.cas.vouch && u.cas.vouch.modo })));
  console.log('    ', JSON.stringify(res));
  ok(res[0].vouch === 3 && res[0].cas === 'CPF', 'Liliane casada por CPF com 3 taxas');
  ok(res[1].vouch === 4 && res[1].cas === 'nome + unidade' && res[1].r === 'EXCLUIR', 'Luana casada por nome + unidade com 4 taxas → Excluir (regra 5)');
  ok(res[2].unid === 'B - 305', 'unidade digitada como "B - 305" é reconhecida');
  ok(res[2].vouch === 0 && res[2].cas === null, 'unidade inexistente fica com 0 (relatório lido, sem casamento)');
  ok(res[0].r === 'EXCLUIR' && res[0].regra === '5', 'BI negativo, 4 meses, 3 taxas → Excluir (regra 5)');
  ok(res[2].r === 'PREVENTIVO' && res[2].regra === '3', 'sem Vouch → Em acompanhamento (regra 3)');
  const formatos = await p.evaluate(() => {
    const rot = ['CONTAS A RECEBER POR CONDÔMINO - COBRANÇA', 'Unidade: SALA 601 - ESPÓLIO DE FULANO DE TAL | Cobrança: Juridico', 'Descrição | Competencia | Vencimento | Emissão | Vlr. Principal',
      'TARIFA BANCÁRIA TARIFA | 05/2026 | 04/05/2026 | 17/04/2026 | 1,99', 'TAXA DE CONDOMINIO | 05/2026 | 04/05/2026 | 17/04/2026 | 483,95', 'TAXA DE CONDOMINIO | 06/2026 | 04/06/2026 | 19/05/2026 | 483,95',
      '1/24 -ACORDO NG | 07/2026 | 08/07/2026 | 01/07/2026 | 100,00', 'Total SALA 601: | 1.457,82', 'Unidade: LOJA 02 - CICRANO | Cobrança: Normal', 'TAXA DE CONDOMINIO | 07/2026 | 04/07/2026 | 17/06/2026 | 483,95'].join('\n');
    const msa = ['INADIMPLÊNCIAS CONSOLIDADAS', 'Unidade | Competência | Vencimento', '0709 | 2.489,86 | 29,46', 'BELTRANO - NN:1 | 03/2026 | 10/03/2026 | 51 | 1.244,93', 'BELTRANO - NN:2 | 04/2026 | 10/04/2026 | 20 | 1.244,93', '0805 | 207,33', 'FULANO - NN: | 01/2026 | 10/01/2026 | 110 | 207,33'].join('\n');
    const a = extrairDevedores(rot, false), b = extrairDevedores(msa, false);
    const u = novaUnidade('SALA 601', 'FULANO DE TAL', ''); const m = melhorDevedor(u, a);
    return { rot: a.map(d => d.unidade + ':' + d.cobrancas.length).join(','), msa: b.map(d => d.unidade + ':' + d.cobrancas.length).join(','), casa: m && m.modo };
  });
  ok(formatos.rot === 'SALA 601:3,LOJA 02:1' && formatos.msa === '0709:2,0805:1' && formatos.casa === 'nome + unidade', `relatório anterior: formatos "Unidade: X - nome" e "Inadimplências consolidadas"; "Espólio de" casa pelo nome (${JSON.stringify(formatos)})`);
  const padrao = await p.evaluate(async ([csvTxt, xlsxB64]) => {
    const out = [];
    for(const f of [new File([csvTxt], 'anterior.csv'), new File([Uint8Array.from(atob(xlsxB64), c => c.charCodeAt(0))], 'modelo.xlsx')]){
      const pl = await lerPlanilhaAnterior(f); const d = extrairDevedores(pl.texto, false);
      out.push(d.map(x => x.unidade + ':' + x.cobrancas.length + ':' + (x.cpf ? 'cpf' : '-')).join(','));
    }
    return out;
  }, [fs.readFileSync(path.join(__dirname, 'fixtures', 'relatorio-anterior-padrao.csv'), 'utf8'), fs.readFileSync(path.join(root, 'docs', 'modelos', 'Relatorio_anterior_padrao.xlsx')).toString('base64')]);
  ok(padrao[0] === 'A - 101:3:cpf,SALA 215:1:-' && padrao[1] === 'A - 101:2:cpf,SALA 215:1:-', `planilha padrão do relatório anterior (CSV e modelo Excel): competências distintas, tarifa não conta (${padrao})`);
  const credito = await p.evaluate(async csvTxt => {
    const pl = await lerPlanilhaAnterior(new File([csvTxt], 'credito.csv')); const d = extrairDevedores(pl.texto, false);
    return d.map(x => x.unidade + ':' + x.cobrancas.length + ':' + (x.cpf ? 'cpf' : '-')).join(',');
  }, fs.readFileSync(path.join(__dirname, 'fixtures', 'relatorio-anterior-formato-credito.csv'), 'utf8'));
  ok(credito === 'A - 101:3:cpf,B - 202:1:-', `relatório anterior no formato da Análise de Crédito (unidade;titular;CPF/CNPJ;competência;tipo;valor;vencimento): multa não conta, acordo conta (${credito})`);
  const ficha = await p.evaluate(() => fichaHTML(S.rodada));
  ok(!/f-caixa/.test(ficha), 'ficha sem as caixas de resumo por resultado');
  ok(/Em acompanhamento/.test(ficha) && !/Mantida|Sob análise|Preventivo|Reanálise \(|Exclu[ií]\S* da garantia/.test(ficha), 'ficha usa os nomes curtos: Excluir e Em acompanhamento');
  ok(/3 no Vouch · BI negativo · 4 meses</.test(ficha) && /Sem cobrança no Vouch</.test(ficha) && !/Regra \d/.test(ficha), 'ficha traz justificativa curta, sem número de regra');
  const semAnt = await p.evaluate(() => { const u = novaUnidade('X','',''); const base = { tipo:'implantacao', semAnt:true, biPos:true, vig:10 };
    return [classificar(u, base, 1, null), classificar(u, base, 4, null), classificar(u, { ...base, semAnt:false }, 1, 2)].map(c => c.r + '|' + c.regra + '|' + (c.pendente ? 'P' : '-')); });
  ok(semAnt[0] === 'PREVENTIVO|4|-' && semAnt[1] === 'EXCLUIR|4|-' && semAnt[2] === 'EXCLUIR|1|-', `sem relatório anterior: mesmo resultado, sem travar a conclusão (${semAnt})`);
  await shot('nova-analise');
  // concluir
  // com exclusão, concluir já baixa a ficha (para formalizar)
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click('#btnConcluir')]);
  await p.waitForFunction(() => S.rodada && S.rodada.status === 'concluida', { timeout: 15000 });
  const prot = await p.evaluate(() => S.rodada.protocolo);
  ok(prot === 'AE-2026-0001', `protocolo sequencial começa em AE-2026-0001 (${prot})`);
  const nomeFicha = dl.suggestedFilename(); const destino = path.join(shots || __dirname, nomeFicha); await dl.saveAs(destino);
  const tam = fs.statSync(destino).size;
  ok(/^AE-2026-0001 - CONDOMINIO ESMERALDA IV\.pdf$/.test(nomeFicha) && tam > 20000, `ficha baixada como "${nomeFicha}" (${(tam/1024).toFixed(0)} KB)`);
  await p.click('#btnFecharEditor'); await p.waitForTimeout(400);
  ok(await p.evaluate(() => S.rodada === null && S.aba !== 'nova'), 'voltar fecha o editor e retorna à aba de origem');

  /* 3 · fila: Esmeralda entrou com 2 unidades ativas */
  const fEsm = await p.evaluate(() => fila().find(i => i.condominio.nome === 'CONDOMINIO ESMERALDA IV'));
  ok(fEsm && fEsm.unidades.length === 1 && fEsm.prazo === somaDiasNode(hoje(), 90), 'Esmeralda na fila com 1 unidade ativa (as duas excluídas saem) e prazo de 90 dias');
  function hoje(){ const d = new Date(); return d.toISOString().slice(0,10); }
  function somaDiasNode(iso, n){ const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0,10); }

  /* 4 · reanálise em lote: selecionar → Reanalisar selecionados → anexar PDFs → lista → concluir */
  await p.click('[data-tab="lote"]'); await p.waitForTimeout(300);
  ok(await p.$eval('#btnReanalisarSel', e => e.hidden), 'botão Reanalisar só aparece com seleção');
  await p.fill('#loteBusca', 'esmeralda'); await p.waitForTimeout(150);
  const b1 = await p.$$eval('#loteFila tbody tr', t => t.length);
  await p.fill('#loteBusca', '54.641.400'); await p.waitForTimeout(150);
  const b2 = await p.$$eval('#loteFila tbody tr', t => t.map(x => x.textContent).join('|'));
  await p.fill('#loteBusca', 'nao existe xyz'); await p.waitForTimeout(150);
  const b3 = await p.$eval('#loteFila', e => e.textContent);
  await p.fill('#loteBusca', ''); await p.waitForTimeout(150);
  ok(b1 === 1 && /ESMERALDA/.test(b2) && !/\|/.test(b2) && /Nenhum condomínio/.test(b3) && (await p.$$eval('#loteFila tbody tr', t => t.length)) === 36, `pesquisa da fila por nome e por CNPJ (${b1}, ${b2.slice(0,40)})`);
  // filtros da fila
  const espera = await p.evaluate(() => { const f = fila(); return { venc: f.filter(i => i.vencida).length, carga: f.filter(i => i.rodada.origem === 'carga').length, modulo: f.filter(i => i.rodada.origem !== 'carga').length, mes: String(f[0].prazo).slice(0, 7), nMes: f.filter(i => String(i.prazo).slice(0, 7) === String(f[0].prazo).slice(0, 7)).length }; });
  await p.selectOption('#fPrazo', 'vencidos'); await p.waitForTimeout(150);
  const fv = await p.$$eval('#loteFila tbody tr', t => t.length);
  ok(fv === espera.venc && /de 36/.test(await p.innerText('#loteContagem')) && !(await p.$eval('#fLimpar', e => e.hidden)), `filtro de prazo mostra só os vencidos (${fv} de ${espera.venc})`);
  await p.click('#btnSelVencidos'); await p.waitForTimeout(100);
  const selV = await p.evaluate(() => S.lote.selecionados.size); await p.click('#btnSelNenhum');
  await p.selectOption('#fPrazo', ''); await p.selectOption('#fOrigem', 'modulo'); await p.waitForTimeout(150);
  const fo = await p.$$eval('#loteFila tbody tr', t => t.length);
  await p.selectOption('#fOrigem', ''); await p.selectOption('#fMes', espera.mes); await p.waitForTimeout(150);
  const fm = await p.$$eval('#loteFila tbody tr', t => t.length);
  ok(selV === espera.venc && fo === espera.modulo && fm === espera.nMes, `filtros de origem e mês da reanálise (${fo} do módulo, ${fm} em ${espera.mes}); "Selecionar vencidos" respeita os filtros`);
  await p.click('#fLimpar'); await p.waitForTimeout(150);
  ok((await p.$$eval('#loteFila tbody tr', t => t.length)) === 36 && await p.$eval('#fLimpar', e => e.hidden), 'Limpar filtros volta a fila inteira');
  const chaveEsm = await p.evaluate(() => fila().find(i => i.condominio.nome === 'CONDOMINIO ESMERALDA IV').chave);
  await p.check(`[data-sel="${chaveEsm}"]`);
  ok(!(await p.$eval('#btnReanalisarSel', e => e.hidden)), 'botão Reanalisar aparece após selecionar');
  const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('#btnReanalisarSel')]);
  await chooser.setFiles([path.join(pdfs, arq('esmeralda')), path.join(pdfs, arq('nazare'))]);
  await p.waitForFunction(() => S.lote.itens.length === 2, { timeout: 30000 });
  await p.waitForTimeout(500);
  const lote = await p.evaluate(() => S.lote.itens.map(it => ({ arq: it.arquivo, ident: it.ident && it.ident.modo, cond: it.rodada && it.rodada.condominio.nome, n: it.rodada && it.rodada.unidades.map(u => [u.unid, u.vouch, u.resultado]) })));
  console.log('    ', JSON.stringify(lote));
  ok(lote.some(x => x.ident === 'CNPJ' && x.cond === 'CONDOMINIO ESMERALDA IV'), 'PDF do Esmeralda identificado pelo CNPJ');
  ok(lote.some(x => x.ident === null && /nazare/i.test(x.arq)), 'PDF de condomínio fora da fila fica como não identificado');
  const linhas = await p.$$eval('#loteAndamento tbody tr', t => t.length);
  ok(linhas === 1, `lista de reanálise tem uma linha por condomínio selecionado (${linhas})`);
  ok(/Relatórios sem condomínio na fila/.test(await p.$eval('#loteAndamento', e => e.textContent)), 'relatório sem dono aparece à parte com escolha manual');
  await shot('lote-lista');
  const idx = await p.evaluate(() => S.lote.itens.findIndex(it => it.ident && it.ident.modo === 'CNPJ'));
  await p.click(`[data-revisar="${idx}"]`); await p.waitForTimeout(300);
  ok((await p.$$eval('#modal details.unid', t => t.length)) === 1, 'Revisar abre o modal com os cartões das unidades');
  await shot('lote-revisar');
  ok((await p.$eval('#mLoteConcluir', e => e.textContent.trim())) === 'Concluir', 'sem exclusão, o botão é só "Concluir"');
  let baixouSozinho = false; const ouvir = () => { baixouSozinho = true; }; p.on('download', ouvir);
  await p.click('#mLoteConcluir'); await p.waitForTimeout(4000); p.off('download', ouvir);
  ok(!baixouSozinho && /sem exclusão/.test(await p.$eval('#toast', e => e.textContent)), 'concluir sem exclusão não baixa a ficha');
  const [dl2] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click('#loteAndamento [data-ficha]')]);
  if(shots) await dl2.saveAs(path.join(shots, dl2.suggestedFilename()));
  ok(/^AE-2026-0002 - /.test(dl2.suggestedFilename()), `ficha continua disponível em "Baixar ficha" (${dl2.suggestedFilename()})`);
  await p.waitForTimeout(600);
  ok(/AE-2026-0002/.test(await p.$eval('#loteAndamento', e => e.textContent)), 'linha do condomínio mostra o protocolo concluído');
  await p.click('#btnLoteCancelar'); await p.waitForTimeout(300);

  /* 5 · histórico do condomínio pela fila, dashboard, resumo */
  const chave = chaveEsm;
  await p.click(`#loteFila [data-hist="${chave}"]`); await p.waitForTimeout(300);
  const nRod = await p.$$eval('#modal [data-ver]', t => t.length);
  ok(nRod === 2, `histórico do condomínio lista as duas rodadas (${nRod})`);
  const evoCols = await p.$$eval('#modal .card:last-child thead th', t => t.length);
  ok(evoCols === 4, 'evolução mostra as duas rodadas do condomínio');
  await shot('historico-condominio');
  await p.click('#modal [data-ver]'); await p.waitForTimeout(300);
  ok(/AE-2026-0002/.test(await p.$eval('#modal h2', e => e.textContent)), 'clique na rodada abre a ficha');
  await p.click('#mVoltar'); await p.waitForTimeout(200); await p.click('#modal [data-fechar]');
  ok((await p.$$eval('.tab', t => t.filter(x => !x.hidden).length)) === 5, 'gestão vê cinco abas: dashboard, solicitações, fila, acessos, configurações');
  await p.click('[data-tab="dash"]'); await p.click('#btnResumo'); await p.waitForTimeout(300);
  ok(/AE-2026-0001/.test(await p.$eval('#resumoMensal', e => e.textContent)), 'resumo mensal lista a rodada do mês');
  if(shots){ const [dlR] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click('#btnResumoPdf')]); await dlR.saveAs(path.join(shots, 'resumo-mensal.pdf')); }
  const tiles = await p.$eval('#dashTiles', e => e.textContent);
  ok(/Espólios sinalizados/.test(tiles) && /Pendentes/.test(tiles) && /Excluídas/.test(tiles) && /Análises do mês/.test(tiles) && /Implantação atrasada/.test(tiles) && (await p.$$eval('#dashTiles .tile', t => t.length)) === 5, 'dashboard mostra os cinco cartões, com a implantação atrasada');
  await shot('dashboard');

  /* 6 · solicitações: carteira, papéis, quadro de implantação, envio, gestão inicia e conclui, ficha para o solicitante */
  const mesAtual = new Date().toISOString().slice(0,7);
  const cart = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'carteira-exemplo.json'), 'utf8'));
  cart.condominios.find(c => c.codigo === 'C2').inicio_contrato = mesAtual + '-01';          // vigência no mês
  cart.condominios.push({ codigo: 'C5', nome: 'CONDOMINIO ATRASADO EXEMPLO', razao_social: 'CONDOMINIO ATRASADO EXEMPLO', cnpj: '33.333.333/0001-33', comarca: 'CE', situacao: 'ATIVO', inicio_contrato: '2026-08-01' });   // atrasado desde ago/26
  const cartTmp = path.join(__dirname, '.carteira.tmp.json'); fs.writeFileSync(cartTmp, JSON.stringify(cart));
  await p.click('[data-tab="conf"]'); await p.waitForTimeout(200);
  await p.setInputFiles('#confCarteiraArquivo', cartTmp);
  await p.waitForFunction(() => S.carteira.itens && S.carteira.itens.length === 5, { timeout: 10000 }); fs.unlinkSync(cartTmp); await p.waitForTimeout(300);
  const pend = await p.evaluate(() => pendentesVerificacao().map(c => c.nome + (c.atrasado ? ' (atrasado)' : '')));
  ok(pend.length === 2 && pend.includes('CONDOMINIO JARDIM DE NAZARE') && pend.includes('CONDOMINIO ATRASADO EXEMPLO (atrasado)'), `quadro: vigência no mês e atrasados desde ago/26, sem os anteriores, com rodada ou distratados (${pend.join(', ')})`);
  const reInfo = await p.evaluate(() => { S.bi = { base: [{ nome: 'CONDOMINIO ESMERALDA IV', meses: 99, sinal: '+', resultado: 1234.5 }] };
    const ant = S.rodadas.find(x => x.condominio.nome === 'CONDOMINIO ESMERALDA IV' && x.status === 'concluida');
    const r = rodadaDeAcompanhamento(ant); const esperado = mesesEntre('2026-06-15', r.dataAnalise);
    const f = fichaHTML(r); S.bi = { base: [] }; return { idade: r.idadeGarantia, esperado, bi: r.bi, regra: classificar(novaUnidade('X','',''), contextoDe(r), 1, null).r, inicio: /Início do contrato<\/th><td>15\/06\/2026/.test(f) };
  });
  ok(reInfo.idade === reInfo.esperado && reInfo.bi && reInfo.bi.valor === 1234.5 && reInfo.regra === 'REANÁLISE' && reInfo.inicio, `reanálise: idade pela carteira, BI da base do dia só como informação, início do contrato na ficha (${JSON.stringify(reInfo)})`);
  const protRetry = await p.evaluate(async () => { const orig = DB.doc; let falhas = 1;
    DB.doc = path => { const d = orig(path); if(path !== COLECOES.meta + '/estado') return d; return { ...d, get: d.get, set: async v => { if(falhas-- > 0) throw new Error('protocolo_conflito'); return d.set(v); } }; };
    try{ return await proximoProtocolo('2099'); } finally { DB.doc = orig; } });
  ok(protRetry === "AE-2099-0001", `contador tenta de novo quando o banco recusa o número (${protRetry})`);
  ok(/Implantação atrasada\s*1/.test((await p.$eval('#dashTiles', e => e.textContent)).replace(/\s+/g, ' ')), 'dashboard mostra 1 implantação atrasada');
  await p.click('[data-tab="sol"]'); await p.waitForTimeout(200);
  ok(!/Condomínios em implantação/.test(await p.$eval('#p-sol', e => e.textContent)) && !/verificar/.test(await p.$eval('#nSol', e => e.textContent)), 'Solicitações da gestão não mostram o quadro de implantação');
  // papel Implantação
  await papeisLocal('implantacao');
  ok((await abasVisiveis()) === 'pedir,minhas', 'Implantação vê só Solicitar análise e Minhas solicitações');
  ok(/Condomínios em implantação/.test(await p.$eval('#p-pedir', e => e.textContent)) && /Atrasados/.test(await p.$eval('#p-pedir', e => e.textContent)), 'Implantação vê o quadro com os do mês e os atrasados');
  const tipos = await p.evaluate(() => [tipoPeloPapel('CONDOMINIO JARDIM DE NAZARE').tipo, tipoPeloPapel('CONDOMINIO ANTIGO EXEMPLO').tipo]);
  ok(tipos[0] === 'implantacao' && tipos[1] === 'avulso', `Implantação: condomínio do quadro = implantação, fora do quadro = avulso (${tipos})`);
  const chaveNaz = await p.evaluate(() => S.carteira.itens.find(c => c.nome === 'CONDOMINIO JARDIM DE NAZARE').chave);
  await p.click(`[data-assumir="${chaveNaz}"]`); await p.waitForTimeout(400);
  ok(/Coordenação de Cobrança/.test(await p.$eval('#p-pedir', e => e.textContent)), 'Assumir registra quem assumiu');
  await p.click(`[data-solicitar="${chaveNaz}"]`); await p.waitForTimeout(300);
  ok((await p.inputValue('#p-pedir #solCond')) === 'CONDOMINIO JARDIM DE NAZARE' && (await p.inputValue('#p-pedir #solCnpj')) === '00.116.267/0001-49', 'formulário vem preenchido com condomínio e CNPJ');
  ok(/implantação/.test(await p.$eval('#p-pedir #solTipoInfo', e => e.textContent)), 'formulário avisa que é solicitação de implantação');
  await p.fill('#p-pedir #solUnidades [data-su="unid"]', 'A - 101'); await p.fill('#p-pedir #solUnidades [data-su="titular"]', 'TITULAR DE TESTE'); await p.fill('#p-pedir #solObs', 'teste automatizado');
  await p.click('#p-pedir #solEnviar'); await p.waitForFunction(() => S.solicitacoes.length === 2, { timeout: 10000 }); await p.waitForTimeout(300);
  const solNaz = await p.evaluate(() => S.solicitacoes.find(x => x.condominio.nome === 'CONDOMINIO JARDIM DE NAZARE'));
  ok(solNaz.tipo === 'implantacao' && solNaz.origem === 'implantacao', 'solicitação da Implantação para condomínio do quadro sai como implantação');
  await p.click('[data-tab="minhas"]'); await p.waitForTimeout(200);
  ok((await p.$$eval('#p-minhas [data-sol]', t => t.length)) === 1, 'Minhas solicitações lista só a solicitação de quem está logado');
  ok((await p.evaluate(() => pendentesVerificacao().length)) === 1, 'condomínio solicitado sai do quadro');
  await p.click('[data-tab="pedir"]'); await p.waitForTimeout(200);
  await p.setInputFiles('#p-pedir #solExtracao', path.join(__dirname, 'fixtures', 'extracao-unidades-exemplo.xlsx'));
  await p.waitForFunction(() => /importada/.test(document.querySelector('#p-pedir #solExtracaoInfo').textContent), { timeout: 10000 });
  const ext = await p.evaluate(() => ({ cond: document.querySelector('#p-pedir #solCond').value, cnpj: document.querySelector('#p-pedir #solCnpj').value,
    u: [...document.querySelectorAll('#p-pedir #solUnidades tbody tr')].map(tr => [...tr.querySelectorAll('input')].map(i => i.value).join('|')) }));
  ok(ext.cond === 'CONDOMINIO ATRASADO EXEMPLO' && ext.cnpj === '33.333.333/0001-33' && ext.u.length === 3 && ext.u[0] === 'SALA 101|FULANO DE TESTE|111.111.111-11' && ext.u[1].startsWith('SALA 102|BELTRANA EXEMPLO'), `extração das unidades preenche condomínio, unidades, titulares e CPF (${JSON.stringify(ext)})`);
  await p.click('#p-pedir #solLimpar'); await p.waitForTimeout(150);
  await p.click('[data-tab="pedir"]'); await p.waitForTimeout(200);
  await shot('solicitante-implantacao');
  // papel Solicitante avulso
  await papeisLocal('avulso');
  ok((await abasVisiveis()) === 'pedir,minhas', 'Solicitante avulso vê só Solicitar análise e Minhas solicitações');
  ok(!/Condomínios em implantação/.test(await p.$eval('#p-pedir', e => e.textContent)), 'Solicitante avulso não vê o quadro de implantação');
  await p.fill('#p-pedir #solCond', 'CONDOMINIO ATRASADO EXEMPLO'); await p.waitForTimeout(100);
  ok(/avulsa/.test(await p.$eval('#p-pedir #solTipoInfo', e => e.textContent)) && (await p.evaluate(() => tipoPeloPapel('CONDOMINIO ATRASADO EXEMPLO').tipo)) === 'avulso', 'Solicitante avulso sempre envia avulsa');
  await shot('solicitante-avulso');
  // papel sem nenhum
  await papeisLocal('');
  ok((await abasVisiveis()) === '' && /Você ainda não tem um papel neste módulo/.test(await p.$eval('#p-sem', e => e.textContent)), 'sem papel: nenhuma aba e o aviso para pedir acesso à gestão');
  // gestão
  await papeisLocal('gestao');
  ok(/1 nova/.test(await p.$eval('#nSol', e => e.textContent)), 'gestão vê o contador de solicitação nova');
  const pendEsperado = await p.evaluate(() => solicitacoesEmAberto().length + fila().filter(i => i.vencida).length);
  ok(new RegExp('Pendentes\\s*' + pendEsperado + '\\s*1 solicitação').test((await p.$eval('#dashTiles', e => e.textContent)).replace(/\s+/g, ' ')), `cartão Pendentes soma as solicitações sem análise concluída e as reanálises vencidas (${pendEsperado})`);
  await p.click('[data-tab="sol"]'); await p.waitForTimeout(300);
  await p.click('#p-sol [data-sol]'); await p.waitForTimeout(400);
  ok((await p.evaluate(() => S.solicitacoes.find(x => x.status !== 'concluida').status)) === 'vista', 'abrir a solicitação marca como vista');
  ok((await p.$eval('#nSol', e => !e.hidden && e.textContent.trim())) === '1', 'número da aba continua depois de abrir a solicitação, até a análise ser concluída');
  await p.click('#mSolIniciar'); await p.waitForFunction(() => S.rodada && S.rodada.solicitacaoId, { timeout: 10000 }); await p.waitForTimeout(300);
  ok((await p.evaluate(() => S.rodada.unidades.length === 1 && S.rodada.unidades[0].unid === 'A - 101' && S.rodada.condominio.cnpj === '00.116.267/0001-49')), 'Iniciar análise abre a rodada com condomínio e unidade da solicitação');
  await p.setInputFiles('#docVouch input[type=file]', path.join(pdfs, arq('nazare')));
  await p.waitForFunction(() => document.querySelector('#docVouch').classList.contains('ok'), { timeout: 30000 });
  ok(!(await p.$('#docEmail')) && (await p.$$eval('#docsGrade .doc', d => d.length)) === 3, 'e-mail de sinalização saiu dos documentos; ficam Vouch, anterior e BI');
  await p.fill('#inicio', '2'); await p.fill('#bi', '100'); await p.click('#sinalBi [data-sinal="+"]'); await p.waitForTimeout(300);
  ok(await p.$eval('#docAnt', e => e.classList.contains('falta')), 'relatório anterior sem anexo e sem marcação aparece como faltando');
  await p.click('#btnConcluir'); await p.waitForTimeout(400);
  ok((await p.evaluate(() => S.rodada.status)) !== 'concluida' && /Falta documento obrigatório: Inadimplência anterior/.test(await p.$eval('#toast', e => e.textContent)), 'não conclui sem o relatório anterior ou a marcação de que não há');
  await p.check('#semAnterior'); await p.waitForTimeout(300);
  ok(!(await p.$eval('#docAnt', e => e.classList.contains('falta'))) && await p.$eval('#docAnt', e => e.classList.contains('dispensado')), 'marcar "não há relatório anterior" dispensa o documento');
  const uNaz = await p.evaluate(() => S.rodada.unidades[0]);
  ok(uNaz.vouch === 9 && uNaz.resultado === 'EXCLUIR', `unidade casada pelo número com 9 taxas → Excluir (${uNaz.vouch}, ${uNaz.resultado})`);
  await p.click('#btnConcluir'); await p.waitForFunction(() => S.rodada && S.rodada.status === 'concluida', { timeout: 15000 }); await p.waitForTimeout(500);
  const solFinal = await p.evaluate(() => S.solicitacoes.find(x => x.condominio.nome === 'CONDOMINIO JARDIM DE NAZARE'));
  ok(solFinal.status === 'concluida' && /^AE-2026-000\d$/.test(solFinal.protocolo) && solFinal.resultado[0].resultado === 'EXCLUIR', `conclusão atualiza a solicitação (${solFinal.status}, ${solFinal.protocolo})`);
  ok(!!(await p.$('#btnTicketEditor')), 'botão Abrir ticket aparece na rodada concluída');
  await p.click('#btnTicketEditor'); await p.waitForTimeout(300);
  ok(!/Próxima reanálise/.test(await p.inputValue('#tkTexto')), 'ticket sem "Próxima reanálise" quando todas as unidades foram excluídas');
  if(shots){ fs.writeFileSync(path.join(shots, 'ticket-exemplo.txt'), 'Título: ' + await p.inputValue('#tkTitulo') + '\nPara: ' + await p.inputValue('#tkResp') + '\n\n' + await p.inputValue('#tkTexto')); await shot('ticket-modal'); }
  ok(/Coordenação de Cobrança/.test(await p.inputValue('#tkResp')) && /A - 101/.test(await p.inputValue('#tkTexto')), 'ticket vai para a assistente de implantação que solicitou quando a carteira não tem assistente de crédito');
  ok(await p.$eval('#tkEnviar', b => b.disabled), 'fora do portal o botão de abrir ticket fica desligado');
  await p.click('#modal [data-fechar]'); await p.waitForTimeout(200);
  // envio do ticket: simula o portal e a regra espolio_ticket do banco (docs/sql/ticket-pelo-modulo.sql)
  await p.evaluate(() => {
    window.__docOrig = DB.doc; window.claude = window.claude || {}; DB._local = false;
    DB.doc = caminho => { const ref = window.__docOrig(caminho); if(!caminho.startsWith('tickets/')) return ref;
      const set0 = ref.set.bind(ref);
      ref.set = async d => { window.__pedido = d; const t = { ...d }; delete t.anexo; return set0({ ...t, status: 'aberto', ticketId: 42, anexado: !!d.anexo, responsavelId: null }); };
      return ref; };
  });
  await p.click('#btnTicketEditor'); await p.waitForTimeout(300);
  ok(!(await p.$eval('#tkEnviar', b => b.disabled)), 'no portal, a gestão pode abrir o ticket');
  await p.click('#tkEnviar');
  await p.waitForSelector('#tkStatus .ok, #tkStatus .erro', { timeout: 60000 });
  const tk = await p.evaluate(() => ({ txt: document.querySelector('#tkStatus').innerText, ped: { ...window.__pedido, anexo: window.__pedido.anexo && (b64 => ({ nome: window.__pedido.anexo.nome, tam: b64.length, ini: b64.slice(0, 8), b64, maiorParte: Math.max(...window.__pedido.anexo.partes.map(x => x.length)), nPartes: window.__pedido.anexo.partes.length }))(window.__pedido.anexo.partes.join('')) }, rod: S.rodada && S.rodada.ticket }));
  ok(/Ticket #42 aberto para a fila do setor Implantação/.test(tk.txt) && /Ficha anexada/.test(tk.txt) && /não tem login/.test(tk.txt), `ticket aberto pelo pedido no banco, sem login vai para a fila do setor da solicitante (${tk.txt.replace(/\s+/g, ' ')})`);
  ok(tk.ped.status === 'pedido' && tk.ped.setor === 'Implantação' && /^AE-2026-\d{4}$/.test(tk.ped.protocolo) && tk.ped.anexo && tk.ped.anexo.ini.startsWith('JVBER') && /\.pdf$/.test(tk.ped.anexo.nome) && tk.ped.anexo.tam <= 180000 && tk.ped.anexo.maiorParte <= 40000, `pedido leva a ficha em PDF, em partes de até 40 mil caracteres (${tk.ped.anexo && Math.round(tk.ped.anexo.tam * 3 / 4 / 1024)} KB em ${tk.ped.anexo && tk.ped.anexo.nPartes} partes, ${tk.ped.protocolo}, ${tk.ped.anexo && tk.ped.anexo.nome}, ${tk.ped.anexo && tk.ped.anexo.ini})`);
  if(shots && tk.ped.anexo) fs.writeFileSync(path.join(shots, 'ficha-do-ticket.pdf'), Buffer.from(tk.ped.anexo.b64, 'base64'));
  ok(tk.rod && tk.rod.id === 42, 'número do ticket fica gravado na análise');
  await p.click('#modal [data-fechar]'); await p.waitForTimeout(200);
  await p.click('#btnTicketEditor'); await p.waitForTimeout(300);
  ok(/já tem o ticket #42/.test(await p.innerText('#modal')), 'análise mostra que já tem ticket aberto');
  await p.click('#modal [data-fechar]');
  await p.evaluate(() => { DB.doc = window.__docOrig; DB._local = true; delete window.claude; });
  await p.click('#btnFecharEditor'); await p.waitForTimeout(300);
  const semV = await p.evaluate(async () => {
    const r = novaRodada('implantacao', { nome: 'CONDOMINIO TESTE SEM VOUCH', cnpj: '' }); r.unidades.push(novaUnidade('101', 'MARIA DE SOUZA', '')); r.idadeGarantia = 1; r.semAnterior = true; r.semBi = true;
    await abrirEditor(r); const antes = { pend: S.rodada.unidades[0].pendente, falta: documentosFaltando(S.rodada).map(x => x.nome).join(',') };
    document.querySelector('#semVouch').click(); await new Promise(res => setTimeout(res, 200));
    const u = S.rodada.unidades[0]; const depois = { pend: u.pendente, vouch: u.vouch, falta: documentosFaltando(S.rodada).length, disp: document.querySelector('#docVouch').classList.contains('dispensado') };
    S.rodada = null; renderNovaLista(); return { antes, depois };
  });
  ok(semV.antes.pend && /Vouch/.test(semV.antes.falta) && !semV.depois.pend && semV.depois.vouch === 0 && semV.depois.falta === 0 && semV.depois.disp, `"ainda não há inadimplência no Vouch" conta o Vouch como zero e libera a conclusão (${JSON.stringify(semV)})`);
  await papeisLocal('gestao');
  // solicitante vê o resultado e baixa a ficha
  await papeisLocal('implantacao');
  await p.click('[data-tab="minhas"]'); await p.waitForTimeout(200);
  await p.click('#p-minhas [data-sol]'); await p.waitForTimeout(300);
  const [dl3] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click('#mSolFicha')]);
  if(shots) await dl3.saveAs(path.join(shots, dl3.suggestedFilename()));
  ok(/CONDOMINIO JARDIM DE NAZARE\.pdf$/.test(dl3.suggestedFilename()), `solicitante baixa a ficha da análise concluída (${dl3.suggestedFilename()})`);
  await shot('solicitacao-concluida');
  await p.click('#modal [data-fechar]');
  await papeisLocal('gestao');

  /* 7 · acessos: mesma funcionalidade do Comissões de Novos Condomínios (simula o portal: DB._local = false) */
  await p.evaluate(async () => {
    await DB.doc('vistos/21').set({ id:'21', nome:'Camila Alencar', em: nowISO() });
    await DB.doc('vistos/6').set({ id:'6', nome:'Mariana Nascimento', em: nowISO() });
    DB._local = false; ME = { name: 'Beatriz Teixeira', id: '4' }; renderTudo();
  });
  await p.waitForTimeout(300);
  ok((await abasVisiveis()) === 'dash,sol,pedir,minhas,lote,acessos,conf' && /Nenhum gestor definido ainda/.test(await p.$eval('#banners', e => e.textContent)), 'sem gestor definido: todas as abas liberadas, com o aviso');
  await p.click('[data-tab="acessos"]'); await p.waitForTimeout(300);
  ok((await p.$$eval('#p-acessos tbody tr', t => t.length)) === 3, 'Acessos lista quem abriu o módulo (3 pessoas)');
  ok((await p.$$eval('#p-acessos tbody tr:first-child [data-pp]', t => t.map(x => x.dataset.pp).join(','))) === 'gestao,implantacao,avulso', 'papéis: Gestão, Implantação e Solicitante avulso');
  ok((await p.$$eval('#p-acessos select[data-nc]', t => t.every(x => !x.disabled))), 'nome na carteira liberado para todos');
  await p.check('#p-acessos [data-u="4"][data-pp="gestao"]'); await p.waitForTimeout(400);
  ok((await abasVisiveis()) === 'dash,sol,lote,acessos,conf' && !(await p.$eval('#banners', e => e.textContent)), 'com gestor marcado, cada um vê só as abas do seu papel');
  await p.check('#p-acessos [data-u="6"][data-pp="gestao"]'); await p.waitForTimeout(400);
  await p.check('#p-acessos [data-u="21"][data-pp="implantacao"]'); await p.waitForTimeout(400);
  await p.check('#p-acessos [data-u="21"][data-pp="avulso"]'); await p.waitForTimeout(400);
  await p.selectOption('#p-acessos select[data-nc="21"]', { index: 1 }); await p.waitForTimeout(300);
  const perfis = await p.evaluate(() => S.perfis);
  ok(perfis['21'].papeis.includes('implantacao') && perfis['21'].papeis.includes('avulso') && perfis['6'].papeis.includes('gestao') && perfis['4'].papeis.includes('gestao') && !!perfis['21'].nomeCarteira, 'marcar papel e nome na carteira grava o perfil da pessoa');
  ok(/Acesso atualizado/.test(await p.$eval('#toast', e => e.textContent)), 'toast "Acesso atualizado."');
  await shot('acessos-gestao');
  await p.click('#p-acessos [data-u="4"][data-pp="gestao"]'); await p.waitForTimeout(400);
  ok(dialogos.some(m => /Você vai tirar seu próprio papel de gestão\. Continuar\?/.test(m)) && !(await p.evaluate(() => S.perfis['4'].papeis.includes('gestao'))), 'tirar a própria gestão pede confirmação e grava');
  const calc = await p.evaluate(() => { const r = {};
    for(const [n,id] of [['Camila Alencar','21'],['Mariana Nascimento','6'],['Beatriz Teixeira','4'],['Pessoa Nova','99']]){ ME = { name:n, id }; r[n] = abasPermitidas().join(','); }
    return r; });
  ok(calc['Camila Alencar'] === 'pedir,minhas' && calc['Mariana Nascimento'] === 'dash,sol,lote,acessos,conf' && calc['Beatriz Teixeira'] === '' && calc['Pessoa Nova'] === '', `abas pelos papéis (${JSON.stringify(calc)})`);
  await p.evaluate(() => { ME = { name: 'Pessoa Nova', id: '99' }; renderTudo(); }); await p.waitForTimeout(200);
  ok(/Olá, Pessoa Nova\. Você ainda não tem um papel neste módulo/.test(await p.$eval('#p-sem', e => e.textContent)), 'quem não tem papel vê o aviso do Comissões');
  await shot('sem-papel');
  await p.evaluate(() => { ME = { name: 'Mariana Nascimento', id: '6' }; renderTudo(); mostrarAba('acessos'); }); await p.waitForTimeout(200);
  await shot('acessos');
  await p.evaluate(() => { DB._local = true; ME = { name:'Coordenação de Cobrança', id:'local' }; });

  /* 7b · exclusão de teste: rascunho volta a solicitação; solicitação sai com o rascunho */
  const registrar = async (cond) => {
    await p.click('[data-tab="sol"]'); await p.waitForTimeout(200); await p.click('#btnRegistrarSol'); await p.waitForTimeout(200);
    await p.fill('#rsNome', 'Teste Exclusão'); await p.selectOption('#rsTipo', 'avulso');
    await p.fill('#modal #solCond', cond); await p.fill('#modal #solUnidades [data-su="unid"]', 'A - 1'); await p.fill('#modal #solUnidades [data-su="titular"]', 'TITULAR TESTE');
    const n = await p.evaluate(() => S.solicitacoes.length);
    await p.click('#modal #solEnviar'); await p.waitForFunction(n => S.solicitacoes.length === n + 1, n, { timeout: 10000 }); await p.waitForTimeout(300);
    return p.evaluate(() => S.solicitacoes.find(x => x.solicitanteNome === 'Teste Exclusão').id);
  };
  const nRodAntes = await p.evaluate(() => S.rodadas.length);
  let sid = await registrar('CONDOMINIO TESTE EXCLUSAO');
  await p.click(`#p-sol [data-sol="${sid}"]`); await p.waitForTimeout(300); await p.click('#mSolIniciar');
  await p.waitForFunction(() => S.rodada && S.rodada.solicitacaoId && S.rodadas.some(r => r.id === S.rodada.id), { timeout: 10000 }); await p.waitForTimeout(300);
  const renderok = await p.$('#btnExcluirRasc');
  ok(!!renderok, 'rascunho mostra o botão Excluir rascunho');
  await p.click('#btnExcluirRasc'); await p.waitForTimeout(2200);
  const aposRasc = await p.evaluate(sid => ({ rod: S.rodadas.length, st: S.solicitacoes.find(x => x.id === sid).status, aba: S.aba }), sid);
  ok(aposRasc.rod === nRodAntes && aposRasc.st === 'vista', `Excluir rascunho apaga a rodada e devolve a solicitação para "vista" (${JSON.stringify(aposRasc)})`);
  await p.click(`#p-sol [data-sol="${sid}"]`); await p.waitForTimeout(300); await p.click('#mSolIniciar');
  await p.waitForFunction(() => S.rodada && S.rodadas.some(r => r.id === S.rodada.id), { timeout: 10000 }); await p.waitForTimeout(300);
  await p.click('#btnFecharEditor'); await p.waitForTimeout(300);
  await p.click(`#p-sol [data-sol="${sid}"]`); await p.waitForTimeout(300);
  await p.click('#mSolExcluir'); await p.waitForTimeout(500);
  const aposSol = await p.evaluate(sid => ({ rod: S.rodadas.length, existe: S.solicitacoes.some(x => x.id === sid) }), sid);
  ok(aposSol.rod === nRodAntes && !aposSol.existe, `Excluir solicitação apaga a solicitação e o rascunho dela (${JSON.stringify(aposSol)})`);
  const concl = await p.evaluate(() => S.solicitacoes.find(x => x.status === 'concluida').id);
  await p.click('[data-tab="sol"]'); await p.selectOption('#solFiltro', 'todas'); await p.waitForTimeout(200);
  await p.click(`#p-sol [data-sol="${concl}"]`); await p.waitForTimeout(300);
  ok(!(await p.$('#mSolExcluir')), 'solicitação concluída não tem Excluir');
  await p.click('#modal [data-fechar]');

  /* 8 · persistência local: recarrega e confere */
  await p.reload(); await p.waitForFunction(() => S.pronto.r && S.rodadas.length > 0, { timeout: 20000 }); await p.waitForTimeout(300);
  const nR = await p.evaluate(() => S.rodadas.filter(r => r.status === 'concluida').length);
  ok(nR === 38, `rodadas persistidas após recarregar: ${nR} (35 carga + 3)`);

  /* 9a · relatório anterior em formato novo: leitura guiada pela unidade */
  const lg = await p.evaluate(async () => {
    const txt = ['POSIÇÃO DE DÉBITOS · ADMINISTRADORA NOVA', 'A - 101 | FULANO UM', 'TAXA ORDINÁRIA | 03/2026 | 350,00', 'TAXA ORDINÁRIA | 04/2026 | 350,00', 'MULTA | 04/2026 | 7,00',
      'B - 101 | FULANO DOIS', 'FUNDO DE RESERVA | 05/2026 | 35,00', 'Total | 742,00', 'Cobrança 06/2026 | SALA 0215 | 120,00'].join('\n');
    const orig = extrairDevedores; extrairDevedores = () => [];   // força o caminho de formato desconhecido
    const r = novaRodada('implantacao', { nome: 'CONDOMINIO TESTE GUIADA', cnpj: '', chave: 'teste-guiada' });
    [['A - 101', 'FULANO UM'], ['SALA 215', 'FULANO TRES'], ['C - 101', 'FULANO QUATRO'], ['A - 909', 'FULANO CINCO']].forEach(([un, t]) => r.unidades.push(novaUnidade(un, t, '')));
    r.idadeGarantia = 12; r.bi = { valor: 100, sinal: '+' };
    await abrirEditor(r); S.textos.vouch = 'x'; S.dev.vouch = [{ nome: 'NINGUEM', unidade: '9999', cobrancas: [] }];
    processarTexto('ant', txt, 'nova.pdf');
    const us = () => S.rodada.unidades.map(u => ({ un: u.unid, ant: u.ant, pend: u.pendente, mot: u.motivo }));
    const antes = us(), diag = document.querySelector('#diagnostico').textContent;
    const u909 = S.rodada.unidades.find(x => x.unid === 'A - 909'); u909.manual.ant = 0; recalcular(S.rodada, S.dev, relatoriosLidos());
    const depois = S.rodada.unidades.find(x => x.unid === 'A - 909');
    extrairDevedores = orig; S.rodada = null; renderNovaLista();
    return { antes, diag, manual: { ant: depois.ant, pend: depois.pendente } };
  });
  const g = Object.fromEntries(lg.antes.map(x => [x.un, x]));
  ok(g['A - 101'].ant === 2 && !g['A - 101'].pend && g['SALA 215'].ant === 1, `leitura guiada: conta competências pela unidade (cabeçalho e mesma linha), multa não conta (A-101 ${g['A - 101'].ant}, SALA 215 ${g['SALA 215'].ant})`);
  ok(g['C - 101'].pend && /ambígua/.test(g['C - 101'].mot) && g['A - 909'].pend && /não encontrada/.test(g['A - 909'].mot), 'leitura guiada: unidade ambígua ou não encontrada fica pendente, nunca "sem débito"');
  ok(/lido pela unidade/.test(lg.diag) && /não encontrada\(s\): C - 101, A - 909/.test(lg.diag) && lg.manual.ant === 0 && !lg.manual.pend, `leitura guiada: aviso lista as não encontradas e a contagem manual resolve a pendência`);

  /* 9b · resultado da skill leitura-inadimplencia-myblue colado no relatório anterior */
  const sk = await p.evaluate(async txt => {
    const r = novaRodada('implantacao', { nome: 'CONDOMINIO TESTE SKILL', cnpj: '', chave: 'teste-skill' });
    [['A - 101', 'FULANO UM', '111.222.333-44'], ['SALA 215', 'FULANO DOIS', '']].forEach(([un, t, c]) => r.unidades.push(novaUnidade(un, t, c)));
    await abrirEditor(r);
    document.querySelector('#btnColarSkill').click(); document.querySelector('#txtSkill').value = txt; document.querySelector('#btnLerSkill').click();
    await new Promise(res => setTimeout(res, 600));
    const out = { a101: S.rodada.unidades[0].ant, s215: S.rodada.unidades[1].ant, msg: document.querySelector('#docAnt span').textContent, modal: !document.querySelector('#modal').hidden };
    S.rodada = null; renderNovaLista(); return out;
  }, fs.readFileSync(path.join(__dirname, 'fixtures', 'resultado-skill-exemplo.txt'), 'utf8'));
  ok(sk.a101 === 3 && sk.s215 === 0 && !sk.modal && /fora da contagem: .*1 multa/.test(sk.msg) && /2 outro/.test(sk.msg) && /1 água\/gás/.test(sk.msg), `resultado da skill colado: conta taxa ordinária e acordo; multa, "Outro" (tarifa) e água/gás ficam de fora (${sk.a101}, ${sk.s215}, ${sk.msg})`);
  const csvPal = path.join(pdfs, '..', 'skilltest', 'palacio-portal.csv');
  if(fs.existsSync(csvPal)){
    const pal = await p.evaluate(async csv => { const pl = await lerPlanilhaAnterior(new File([csv], 'p.csv')); const d = extrairDevedores(pl.texto, false); return Object.fromEntries(d.filter(x => ['SALA 401','SALA 601','SALA 701','SALA 215','SALA 717','SALA 1101','SALA 338'].includes(x.unidade)).map(x => [x.unidade, x.cobrancas.length])); }, fs.readFileSync(csvPal, 'utf8'));
    ok(pal['SALA 401'] === 3 && pal['SALA 601'] === 3 && pal['SALA 701'] === 2 && pal['SALA 215'] === 1 && pal['SALA 717'] === 3 && pal['SALA 1101'] === 2 && !pal['SALA 338'], `Palácio Progresso convertido no formato da skill: mesmas contagens do leitor dedicado (${JSON.stringify(pal)})`);
  }

  /* 9 · conferência dos filtros do relatório do Vouch */
  const filtros = async (nome, dataAnalise) => p.evaluate(async ([b64, dataAnalise]) => {
    const bin = atob(b64); const arr = new Uint8Array(bin.length); for(let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const v = lerVouch(await pdfParaTexto({ arrayBuffer: async () => arr.buffer }));
    const r = { dataAnalise, condominio: { cnpj: v.cnpj } };
    return falhasVouch(resumoVouch(v, ''), r).map(x => x.txt);
  }, [fs.readFileSync(path.join(pdfs, arq(nome))).toString('base64'), dataAnalise]);
  if(arq('mister_hull')){
    const fMh = await filtros('mister_hull', '2026-10-22');
    ok(fMh.length === 0, `relatório emitido com as informações combinadas passa em todos os critérios (${fMh.join('; ') || 'nenhuma falha'})`);
  }
  const fNaz = await filtros('nazare', '2026-10-10');
  ok(fNaz.length === 1 && /unidades adimplentes/.test(fNaz[0]), `relatório sem as unidades adimplentes é sinalizado (${fNaz.join('; ')})`);
  const fEco = await filtros('eco_way', '2026-10-10');
  ok(['CPF do morador', 'Telefone do morador', 'Apresentar unidades adimplentes', 'Apresentar vencimento para N.V'].every(x => fEco.includes(x)) && !fEco.includes('Nome do morador') && !fEco.includes('Mostrar valor total'), `relatório sem CPF, telefone, adimplentes e N.V é sinalizado nesses quatro (${fEco.join('; ')})`);

  /* 10a · a mesma unidade não conta duas vezes quando o titular só aparece na reanálise */
  const dup = await p.evaluate(() => {
    const antes = panoramaUnidades().total;
    const car = novaRodada('carga', { nome: 'CONDOMINIO TESTE DUPLICADO', cnpj: '', chave: 'teste-dup' }); car.origem = 'carga'; car.id = 'dup-carga'; car.status = 'concluida'; car.dataAnalise = '2026-07-01';
    const u1 = novaUnidade('2A - 101', '', ''); u1.resultado = 'REANÁLISE'; u1.situacao = 'ativa'; car.unidades = [u1];
    const re = novaRodada('acompanhamento', car.condominio); re.id = 'dup-re'; re.status = 'concluida'; re.dataAnalise = '2026-10-22';
    const u2 = novaUnidade('2A-101', 'SONIA TESTE', '123.456.789-09'); u2.resultado = 'REANÁLISE'; u2.situacao = 'ativa'; re.unidades = [u2];
    S.rodadas.push(car, re);
    const depois = panoramaUnidades().total, linhas = (evolucaoHTML([car, re]).match(/<tr>/g) || []).length - 1;
    S.rodadas = S.rodadas.filter(x => !['dup-carga', 'dup-re'].includes(x.id));
    return { soma: depois - antes, linhas };
  });
  ok(dup.soma === 1 && dup.linhas === 1, `unidade da carga sem titular e da reanálise com titular conta uma vez só, no total e na evolução (${JSON.stringify(dup)})`);

  /* 10 · ficha da reanálise: tipo "Reanálise" e coluna de inadimplência anterior vinda da 1ª análise */
  const fr = await p.evaluate(() => {
    const imp = novaRodada('implantacao', { nome: 'CONDOMINIO TESTE ANTERIOR', cnpj: '', chave: 'teste-ant' }); imp.id = 'imp-teste'; imp.status = 'concluida';
    const a = novaUnidade('A - 1', 'FULANO UM', ''); a.ant = 4; a.vouch = 1; a.resultado = 'PREVENTIVO'; a.situacao = 'ativa';
    const b = novaUnidade('A - 2', 'FULANO DOIS', ''); b.ant = 0; b.vouch = 0; b.resultado = 'PREVENTIVO'; b.situacao = 'ativa';
    imp.unidades = [a, b];
    const car = novaRodada('carga', { nome: 'CONDOMINIO TESTE CARGA', cnpj: '', chave: 'teste-carga' }); car.origem = 'carga'; car.id = 'carga-teste'; car.status = 'concluida';
    const c = novaUnidade('B - 1', 'FULANO TRES', ''); c.debAnterior = 'SIM'; c.resultado = 'REANÁLISE'; c.situacao = 'ativa'; car.unidades = [c];
    S.rodadas.push(imp, car);
    const re1 = rodadaDeAcompanhamento(imp); re1.id = 're1-teste'; re1.status = 'concluida'; re1.unidades.forEach(u => { u.resultado = 'REANÁLISE'; u.situacao = 'ativa'; delete u.antOrigem; }); S.rodadas.push(re1);
    const re2 = rodadaDeAcompanhamento(re1);   // re1 sem antOrigem gravado: busca na 1ª análise pela cadeia
    const reC = rodadaDeAcompanhamento(car);
    const h2 = fichaHTML(re2), hC = fichaHTML(reC);
    S.rodadas = S.rodadas.filter(x => !['imp-teste', 'carga-teste', 're1-teste'].includes(x.id));
    return { tipo: /Reanálise/.test(h2) && !/Acompanhamento \(reanálise\)/.test(h2), col: /INADIMPLÊNCIA ANTERIOR/.test(h2), a4: /Inadimplente \(4 taxas\)/.test(h2), b0: />Sem cobrança</.test(h2), rodape: /conforme a 1ª análise/.test(h2), deb: /Com débito anterior/.test(hC) };
  });
  ok(fr.tipo && fr.col && fr.a4 && fr.b0 && fr.rodape && fr.deb, `ficha da reanálise: tipo "Reanálise" e inadimplência anterior da 1ª análise ou da planilha antiga (${JSON.stringify(fr)})`);

  fs.unlinkSync(tmp); await b.close();
  if(erros.length){ console.log('\nerros de console/página:'); erros.forEach(e => console.log('  -', e.slice(0, 300))); }
  console.log(process.exitCode ? '\nHÁ FALHAS' : '\nTodos os passos passaram.');
})().catch(e => { console.error(e); process.exit(1); });
