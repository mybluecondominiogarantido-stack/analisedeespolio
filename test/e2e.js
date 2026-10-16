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
  p.on('dialog', d => d.accept());
  const shot = async nome => { if(shots) await p.screenshot({ path: path.join(shots, nome + '.png'), fullPage: true }); };
  const arq = nome => fs.readdirSync(pdfs).find(f => f.toLowerCase().includes(nome));

  await p.goto('file://' + tmp);
  await p.waitForFunction(() => document.querySelector('#sync').classList.contains('local'), { timeout: 20000 });
  await p.waitForTimeout(500);
  ok(await p.$eval('#sync', e => e.textContent.includes('Modo local')), 'abre em modo local sem portal');

  /* 1 · carga inicial da planilha de controle */
  await p.click('[data-tab="conf"]');
  await p.setInputFiles('#confCargaArquivo', planilha);
  await p.waitForFunction(() => /Importado/.test(document.querySelector('#confCargaStatus').textContent), { timeout: 30000 });
  const carga = await p.$eval('#confCargaStatus', e => e.textContent);
  console.log('    ', carga.trim());
  await p.waitForTimeout(800);
  const nFila = await p.evaluate(() => fila().length);
  ok(nFila === 35, `fila após a carga inicial tem 35 condomínios (tem ${nFila})`);

  /* 2 · implantação com PDF real do Vouch (Esmeralda IV) */
  await p.click('[data-tab="nova"]');
  await p.click('#btnNovaImplantacao');
  await p.setInputFiles('#docVouch input[type=file]', path.join(pdfs, arq('esmeralda')));
  await p.waitForFunction(() => document.querySelector('#docVouch').classList.contains('ok'), { timeout: 30000 });
  ok((await p.inputValue('#razao')) === 'CONDOMINIO ESMERALDA IV', 'razão social preenchida pelo Vouch');
  ok((await p.inputValue('#cnpj')) === '54.641.400/0001-05', 'CNPJ preenchido pelo Vouch');
  await p.fill('#inicio', '4'); await p.fill('#bi', '2953.10'); await p.check('#semAnterior');
  await p.fill('#sinal', 'A - 207\tLILIANE LOPES PIRES\t000.603.573-63\nA - 407\tLUANA DE HOLANDA ROLIM VERAS\nB - 305\tFULANO DE TAL QUE NAO EXISTE\t111.222.333-44');
  await p.click('#btnSinal');
  await p.waitForTimeout(400);
  const res = await p.evaluate(() => S.rodada.unidades.map(u => ({ unid: u.unid, vouch: u.vouch, r: u.resultado, regra: u.regra, cas: u.cas.vouch && u.cas.vouch.modo })));
  console.log('    ', JSON.stringify(res));
  ok(res[0].vouch === 3 && res[0].cas === 'CPF', 'Liliane casada por CPF com 3 taxas');
  ok(res[1].vouch === 4 && res[1].cas === 'nome + unidade' && res[1].r === 'EXCLUIR', 'Luana casada por nome + unidade com 4 taxas → Excluir (regra 5)');
  ok(res[2].unid === 'B - 305', 'unidade digitada como "B - 305" é reconhecida');
  ok(res[2].vouch === 0 && res[2].cas === null, 'unidade inexistente fica com 0 (relatório lido, sem casamento)');
  ok(res[0].r === 'EXCLUIR' && res[0].regra === '5', 'BI negativo, 4 meses, 3 taxas → Excluir (regra 5)');
  ok(res[2].r === 'PREVENTIVO' && res[2].regra === '3', 'sem Vouch → Preventivo (regra 3)');
  await shot('nova-analise');
  // concluir
  await p.click('#btnConcluir');
  await p.waitForFunction(() => S.rodada && S.rodada.status === 'concluida', { timeout: 15000 });
  const prot = await p.evaluate(() => S.rodada.protocolo);
  ok(prot === 'AE-2026-0001', `protocolo sequencial começa em AE-2026-0001 (${prot})`);
  // ficha
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click('#btnBaixarFicha')]);
  const nomeFicha = dl.suggestedFilename(); const destino = path.join(shots || __dirname, nomeFicha); await dl.saveAs(destino);
  const tam = fs.statSync(destino).size;
  ok(/^AE-2026-0001 - CONDOMINIO ESMERALDA IV\.pdf$/.test(nomeFicha) && tam > 20000, `ficha baixada como "${nomeFicha}" (${(tam/1024).toFixed(0)} KB)`);
  await p.click('#btnFecharEditor'); await p.waitForTimeout(400);

  /* 3 · fila: Esmeralda entrou com 2 unidades ativas */
  const fEsm = await p.evaluate(() => fila().find(i => i.condominio.nome === 'CONDOMINIO ESMERALDA IV'));
  ok(fEsm && fEsm.unidades.length === 1 && fEsm.prazo === somaDiasNode(hoje(), 90), 'Esmeralda na fila com 1 unidade ativa (as duas excluídas saem) e prazo de 90 dias');
  function hoje(){ const d = new Date(); return d.toISOString().slice(0,10); }
  function somaDiasNode(iso, n){ const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0,10); }

  /* 4 · reanálise em lote com o mesmo PDF (identificação por CNPJ) */
  await p.click('[data-tab="lote"]');
  await p.setInputFiles('#loteArquivos', [path.join(pdfs, arq('esmeralda')), path.join(pdfs, arq('nazare'))]);
  await p.waitForFunction(() => S.lote.itens.length === 2, { timeout: 30000 });
  await p.waitForTimeout(500);
  const lote = await p.evaluate(() => S.lote.itens.map(it => ({ arq: it.arquivo, ident: it.ident && it.ident.modo, cond: it.rodada && it.rodada.condominio.nome, n: it.rodada && it.rodada.unidades.map(u => [u.unid, u.vouch, u.resultado]) })));
  console.log('    ', JSON.stringify(lote));
  ok(lote.some(x => x.ident === 'CNPJ' && x.cond === 'CONDOMINIO ESMERALDA IV'), 'PDF do Esmeralda identificado pelo CNPJ');
  ok(lote.some(x => x.ident === null && /nazare/i.test(x.arq)), 'PDF de condomínio fora da fila fica como não identificado');
  const esm = lote.find(x => x.ident === 'CNPJ');
  ok(esm.n.every(u => u[2] === 'EXCLUIR' || u[1] < 3), 'acompanhamento: 3+ taxas → Excluir, abaixo permanece');
  await shot('lote');
  const idx = await p.evaluate(() => S.lote.itens.findIndex(it => it.ident && it.ident.modo === 'CNPJ'));
  const [dl2] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click(`[data-concluir="${idx}"]`)]);
  ok(/^AE-2026-0002 - /.test(dl2.suggestedFilename()), `lote concluído gera AE-2026-0002 e baixa a ficha (${dl2.suggestedFilename()})`);
  await p.waitForTimeout(600);

  /* 5 · histórico, evolução, dashboard, resumo */
  await p.click('[data-tab="hist"]'); await p.waitForTimeout(300);
  const nHist = await p.$$eval('#histTabela tbody tr', t => t.length);
  ok(nHist >= 2, `histórico lista as rodadas (${nHist} nos últimos 90 dias)`);
  const chave = await p.evaluate(() => S.rodadas.find(r => r.condominio.nome === 'CONDOMINIO ESMERALDA IV').condominio.chave);
  await p.selectOption('#evoCond', chave); await p.waitForTimeout(300);
  const evoCols = await p.$$eval('#evoTabela thead th', t => t.length);
  ok(evoCols === 4, 'evolução mostra as duas rodadas do condomínio');
  await shot('historico');
  await p.click('[data-tab="dash"]'); await p.click('#btnResumo'); await p.waitForTimeout(300);
  ok(/AE-2026-0001/.test(await p.$eval('#resumoMensal', e => e.textContent)), 'resumo mensal lista a rodada do mês');
  const tiles = await p.$eval('#dashTiles', e => e.textContent);
  ok(/Total de espólios/.test(tiles) && /Pendentes/.test(tiles) && /Excluídas da garantia/.test(tiles) && !/Verificados/.test(tiles), 'dashboard mostra o quadro acumulado (total, pendentes, excluídas) sem verificados');
  await shot('dashboard');

  /* 6 · persistência local: recarrega e confere */
  await p.reload(); await p.waitForFunction(() => S.pronto.r && S.rodadas.length > 0, { timeout: 20000 }); await p.waitForTimeout(300);
  const nR = await p.evaluate(() => S.rodadas.filter(r => r.status === 'concluida').length);
  ok(nR === 37, `rodadas persistidas após recarregar: ${nR} (35 carga + 2)`);

  fs.unlinkSync(tmp); await b.close();
  if(erros.length){ console.log('\nerros de console/página:'); erros.forEach(e => console.log('  -', e.slice(0, 300))); }
  console.log(process.exitCode ? '\nHÁ FALHAS' : '\nTodos os passos passaram.');
})().catch(e => { console.error(e); process.exit(1); });
