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

  /* 2 · implantação a partir de uma solicitação registrada pela gestão (Esmeralda IV) */
  await p.click('[data-tab="sol"]'); await p.waitForTimeout(300);
  await p.click('#btnRegistrarSol'); await p.waitForTimeout(300);
  await p.fill('#rsNome', 'Assistente de Implantação Teste');
  await p.fill('#solCond', 'CONDOMINIO ESMERALDA IV'); await p.fill('#solCnpj', '54.641.400/0001-05');
  await p.fill('#solUnidades [data-su="unid"]', 'A - 207'); await p.fill('#solUnidades [data-su="titular"]', 'LILIANE LOPES PIRES'); await p.fill('#solUnidades [data-su="cpf"]', '000.603.573-63');
  await p.click('#solAddUnid'); await p.fill('#solUnidades tr:nth-child(2) [data-su="unid"]', 'A - 407'); await p.fill('#solUnidades tr:nth-child(2) [data-su="titular"]', 'LUANA DE HOLANDA ROLIM VERAS');
  await p.click('#solAddUnid'); await p.fill('#solUnidades tr:nth-child(3) [data-su="unid"]', 'B - 305'); await p.fill('#solUnidades tr:nth-child(3) [data-su="titular"]', 'FULANO DE TAL QUE NAO EXISTE'); await p.fill('#solUnidades tr:nth-child(3) [data-su="cpf"]', '111.222.333-44');
  await p.click('#solEnviar'); await p.waitForFunction(() => S.solicitacoes.length === 1, { timeout: 10000 }); await p.waitForTimeout(400);
  ok((await p.evaluate(() => S.solicitacoes[0].solicitanteNome)) === 'Assistente de Implantação Teste', 'gestão registra solicitação em nome de quem pediu');
  await p.click('#p-sol [data-sol]'); await p.waitForTimeout(300); await p.click('#mSolIniciar');
  await p.waitForFunction(() => S.rodada && S.rodada.solicitacaoId, { timeout: 10000 }); await p.waitForTimeout(300);
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
  ok(await p.evaluate(() => S.rodada === null && S.aba !== 'nova'), 'voltar fecha o editor e retorna à aba de origem');

  /* 3 · fila: Esmeralda entrou com 2 unidades ativas */
  const fEsm = await p.evaluate(() => fila().find(i => i.condominio.nome === 'CONDOMINIO ESMERALDA IV'));
  ok(fEsm && fEsm.unidades.length === 1 && fEsm.prazo === somaDiasNode(hoje(), 90), 'Esmeralda na fila com 1 unidade ativa (as duas excluídas saem) e prazo de 90 dias');
  function hoje(){ const d = new Date(); return d.toISOString().slice(0,10); }
  function somaDiasNode(iso, n){ const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0,10); }

  /* 4 · reanálise em lote: selecionar → Reanalisar selecionados → anexar PDFs → lista → concluir */
  await p.click('[data-tab="lote"]'); await p.waitForTimeout(300);
  ok(await p.$eval('#btnReanalisarSel', e => e.hidden), 'botão Reanalisar só aparece com seleção');
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
  const [dl2] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click('#mLoteConcluir')]);
  ok(/^AE-2026-0002 - /.test(dl2.suggestedFilename()), `concluir pelo modal gera AE-2026-0002 e baixa a ficha (${dl2.suggestedFilename()})`);
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
  const tiles = await p.$eval('#dashTiles', e => e.textContent);
  ok(/Espólios sinalizados/.test(tiles) && /Pendentes/.test(tiles) && /Excluídas/.test(tiles) && /Análises do mês/.test(tiles) && (await p.$$eval('#dashTiles .tile', t => t.length)) === 4, 'dashboard mostra os quatro cartões: total, pendentes (vencidas), excluídas, análises do mês');
  await shot('dashboard');

  /* 6 · solicitações: carteira, perfil solicitante, pendentes de verificação, envio, gestão inicia e conclui, ficha para o solicitante */
  await p.click('[data-tab="conf"]'); await p.waitForTimeout(200);
  await p.setInputFiles('#confCarteiraArquivo', path.join(__dirname, 'fixtures', 'carteira-exemplo.json'));
  await p.waitForFunction(() => S.carteira.itens && S.carteira.itens.length === 4, { timeout: 10000 }); await p.waitForTimeout(300);
  const pend = await p.evaluate(() => pendentesVerificacao().map(c => c.nome));
  ok(pend.length === 2 && pend.includes('CONDOMINIO JARDIM DE NAZARE') && !pend.includes('CONDOMINIO ESMERALDA IV'), `pendentes de verificação excluem quem já tem rodada e os distratados (${pend.join(', ')})`);
  await p.click('#chipTrocar'); await p.waitForTimeout(300);
  ok((await p.$$eval('.tab', t => t.filter(x => !x.hidden).length)) === 2, 'solicitante vê só as abas Solicitar análise e Minhas solicitações');
  const chaveNaz = await p.evaluate(() => S.carteira.itens.find(c => c.nome === 'CONDOMINIO JARDIM DE NAZARE').chave);
  await p.click(`[data-assumir="${chaveNaz}"]`); await p.waitForTimeout(400);
  ok(/Coordenação de Cobrança/.test(await p.$eval('#p-sol', e => e.textContent)), 'Assumir registra quem assumiu');
  await p.click(`[data-solicitar="${chaveNaz}"]`); await p.waitForTimeout(300);
  ok((await p.inputValue('#solCond')) === 'CONDOMINIO JARDIM DE NAZARE' && (await p.inputValue('#solCnpj')) === '00.116.267/0001-49', 'formulário vem preenchido com condomínio e CNPJ');
  await p.fill('#solUnidades [data-su="unid"]', 'A - 101'); await p.fill('#solUnidades [data-su="titular"]', 'TITULAR DE TESTE'); await p.fill('#solObs', 'teste automatizado');
  await p.click('#solEnviar'); await p.waitForFunction(() => S.solicitacoes.length === 2, { timeout: 10000 }); await p.waitForTimeout(300);
  await p.click('[data-tab="minhas"]'); await p.waitForTimeout(200);
  ok((await p.$$eval('#p-minhas [data-sol]', t => t.length)) === 1, 'Minhas solicitações lista só a solicitação de quem está logado');
  await p.click('[data-tab="sol"]'); await p.waitForTimeout(200);
  ok((await p.evaluate(() => pendentesVerificacao().length)) === 1, 'condomínio solicitado sai dos pendentes de verificação');
  await shot('solicitante');
  // gestão
  await p.evaluate(() => { localStorage.setItem('myblue_espolio_perfil', 'gestao'); }); await p.reload();
  await p.waitForFunction(() => S.pronto.s && S.solicitacoes.length === 2 && S.pronto.r, { timeout: 20000 }); await p.waitForTimeout(400);
  ok(/1 nova/.test(await p.$eval('#nSol', e => e.textContent)), 'gestão vê o contador de solicitação nova');
  ok(/Pendentes\s*1/.test((await p.$eval('#dashTiles', e => e.textContent)).replace(/\s+/g, ' ')), 'cartão Pendentes mostra 1 solicitação não vista');
  await p.click('[data-tab="sol"]'); await p.waitForTimeout(300);
  await p.click('#p-sol [data-sol]'); await p.waitForTimeout(400);
  ok((await p.evaluate(() => S.solicitacoes.find(x => x.status !== 'concluida').status)) === 'vista', 'abrir a solicitação marca como vista');
  await p.click('#mSolIniciar'); await p.waitForFunction(() => S.rodada && S.rodada.solicitacaoId, { timeout: 10000 }); await p.waitForTimeout(300);
  ok((await p.evaluate(() => S.rodada.unidades.length === 1 && S.rodada.unidades[0].unid === 'A - 101' && S.rodada.condominio.cnpj === '00.116.267/0001-49')), 'Iniciar análise abre a rodada com condomínio e unidade da solicitação');
  await p.setInputFiles('#docVouch input[type=file]', path.join(pdfs, arq('nazare')));
  await p.waitForFunction(() => document.querySelector('#docVouch').classList.contains('ok'), { timeout: 30000 });
  await p.fill('#inicio', '2'); await p.fill('#bi', '100'); await p.click('#sinalBi [data-sinal="+"]'); await p.check('#semAnterior'); await p.waitForTimeout(300);
  const uNaz = await p.evaluate(() => S.rodada.unidades[0]);
  ok(uNaz.vouch === 9 && uNaz.resultado === 'EXCLUIR', `unidade casada pelo número com 9 taxas → Excluir (${uNaz.vouch}, ${uNaz.resultado})`);
  await p.click('#btnConcluir'); await p.waitForFunction(() => S.rodada && S.rodada.status === 'concluida', { timeout: 15000 }); await p.waitForTimeout(500);
  const solFinal = await p.evaluate(() => S.solicitacoes.find(x => x.condominio.nome === 'CONDOMINIO JARDIM DE NAZARE'));
  ok(solFinal.status === 'concluida' && /^AE-2026-000\d$/.test(solFinal.protocolo) && solFinal.resultado[0].resultado === 'EXCLUIR', `conclusão atualiza a solicitação (${solFinal.status}, ${solFinal.protocolo})`);
  ok(!!(await p.$('#btnTicketEditor')), 'botão Abrir ticket aparece na rodada concluída');
  await p.click('#btnTicketEditor'); await p.waitForTimeout(300);
  ok(/Coordenação de Cobrança/.test(await p.inputValue('#tkResp')) && /A - 101/.test(await p.inputValue('#tkTexto')), 'ticket vai para a assistente de implantação que solicitou quando a carteira não tem assistente de crédito');
  await p.click('#modal [data-fechar]'); await p.click('#btnFecharEditor'); await p.waitForTimeout(300);
  // solicitante vê o resultado e baixa a ficha
  await p.evaluate(() => { localStorage.setItem('myblue_espolio_perfil', 'solicitante'); }); await p.reload();
  await p.waitForFunction(() => S.pronto.s && S.solicitacoes.length === 2, { timeout: 20000 }); await p.waitForTimeout(400);
  await p.click('[data-tab="minhas"]'); await p.waitForTimeout(200);
  await p.click('#p-minhas [data-sol]'); await p.waitForTimeout(300);
  const [dl3] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click('#mSolFicha')]);
  ok(/CONDOMINIO JARDIM DE NAZARE\.pdf$/.test(dl3.suggestedFilename()), `solicitante baixa a ficha da análise concluída (${dl3.suggestedFilename()})`);
  await shot('solicitacao-concluida');
  await p.click('#modal [data-fechar]');
  await p.evaluate(() => { localStorage.setItem('myblue_espolio_perfil', 'gestao'); });

  /* 7 · acessos: modelo por pessoa (vistos + perfis), papéis definidos pela gestão */
  await p.evaluate(async () => {
    await DB.doc('vistos/21').set({ id:'21', nome:'Camila Alencar', em: nowISO() });
    await DB.doc('vistos/6').set({ id:'6', nome:'Mariana Nascimento', em: nowISO() });
  });
  await p.click('[data-tab="acessos"]'); await p.waitForTimeout(400);
  ok((await p.$$eval('#p-acessos tbody tr', t => t.length)) === 3, 'Acessos lista quem abriu o módulo (3 pessoas)');
  ok(/1 sem papel|2 sem papel/.test(await p.$eval('#nAcessos', e => e.textContent)), 'aba Acessos mostra quem está sem papel');
  await p.check('#p-acessos [data-u="21"][data-pp="solicitante"]'); await p.waitForTimeout(400);
  await p.check('#p-acessos [data-u="6"][data-pp="gestao"]'); await p.waitForTimeout(400);
  const perfis = await p.evaluate(() => S.perfis);
  ok(perfis['21'] && perfis['21'].papeis.includes('solicitante') && perfis['6'].papeis.includes('gestao'), 'marcar papel grava o perfil da pessoa');
  await p.selectOption('#p-acessos select[data-nc="21"]', { index: 1 }); await p.waitForTimeout(300);
  ok(!!(await p.evaluate(() => S.perfis['21'].nomeCarteira)), 'nome na carteira fica ligado ao login');
  const calc = await p.evaluate(() => { const real = DB._local; DB._local = false; const r = {};
    for(const [n,id] of [['Camila Alencar','21'],['Mariana Nascimento','6'],['Beatriz Teixeira','4'],['Pessoa Nova','99']]){ ME = { name:n, id }; r[n] = calcularPerfil(); }
    DB._local = real; ME = { name:'Coordenação de Cobrança', id:'local' }; return r; });
  ok(calc['Camila Alencar'] === 'solicitante' && calc['Mariana Nascimento'] === 'gestao' && calc['Pessoa Nova'] === 'sem', `perfis calculados pelos papéis (${JSON.stringify(calc)})`);
  ok(calc['Beatriz Teixeira'] === 'sem', 'com alguém marcado na gestão, os nomes padrão deixam de valer sozinhos');
  await shot('acessos');

  /* 8 · persistência local: recarrega e confere */
  await p.reload(); await p.waitForFunction(() => S.pronto.r && S.rodadas.length > 0, { timeout: 20000 }); await p.waitForTimeout(300);
  const nR = await p.evaluate(() => S.rodadas.filter(r => r.status === 'concluida').length);
  ok(nR === 38, `rodadas persistidas após recarregar: ${nR} (35 carga + 3)`);

  fs.unlinkSync(tmp); await b.close();
  if(erros.length){ console.log('\nerros de console/página:'); erros.forEach(e => console.log('  -', e.slice(0, 300))); }
  console.log(process.exitCode ? '\nHÁ FALHAS' : '\nTodos os passos passaram.');
})().catch(e => { console.error(e); process.exit(1); });
