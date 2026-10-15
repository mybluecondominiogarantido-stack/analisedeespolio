/* Testa o leitor do Vouch com PDFs reais de uma pasta local (não versionada).
   Uso: node test/leitor-vouch.js <pasta-com-pdfs> <pasta-com-pdf.min.js,pdf.worker.min.js,xlsx.full.min.js> */
const { chromium } = require(process.env.PW_PATH || 'playwright');
const fs = require('fs'), path = require('path');
const [,, pasta, libs] = process.argv;
(async () => {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(__dirname, 'harness.html'), 'utf8')
    .replace('{{WORKER}}', 'file://' + path.join(libs, 'pdf.worker.min.js'))
    .replace('{{PDFJS}}', 'file://' + path.join(libs, 'pdf.min.js'))
    .replace('{{XLSX}}', 'file://' + path.join(libs, 'xlsx.full.min.js'));
  const tmp = path.join(__dirname, '.harness.tmp.html'); fs.writeFileSync(tmp, html);
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--headless=new', '--allow-file-access-from-files'] });
  const p = await b.newPage();
  p.on('console', m => { if (m.type() === 'error') console.log('console:', m.text()); });
  p.on('pageerror', e => console.log('pageerror:', e.message));
  await p.goto('file://' + tmp);
  let falhas = 0;
  for (const f of fs.readdirSync(pasta).filter(f => /\.pdf$/i.test(f))) {
    const data = fs.readFileSync(path.join(pasta, f));
    const r = await p.evaluate(async (b64) => {
      const bin = atob(b64); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const txt = await pdfParaTexto({ arrayBuffer: async () => arr.buffer });
      const v = lerVouch(txt);
      return { ehVouch: ehRelatorioVouch(txt), condominio: v.condominio, cnpj: v.cnpj, corte: v.corte, emissao: v.emissao, total: v.totalTaxas, totalUnid: v.totalUnidades, lidas: v.lidas, conferido: v.conferido, avisos: v.avisos,
        devedores: v.devedores.map(d => ({ unid: d.unidadeTxt, nome: d.nome, cpf: d.cpf || d.cnpj, n: d.cobrancas.length, comps: d.cobrancas.map(c => c.comp).join(' '), tipos: [...new Set(d.cobrancas.map(c => c.tipo))].join(','), marc: [...new Set(d.cobrancas.flatMap(c => c.marcadores))].join(','), valores: d.cobrancas.map(c => c.valor).join(' ') })) };
    }, data.toString('base64'));
    console.log('\n=====', f);
    console.log(`${r.condominio} · ${r.cnpj} · corte ${r.corte} · emissão ${r.emissao} · lidas ${r.lidas}/${r.total} em ${r.devedores.length}/${r.totalUnid} unidades · conferido=${r.conferido}`);
    if (r.avisos.length) console.log('avisos:', r.avisos);
    console.table(r.devedores);
    if (!r.conferido) falhas++;
  }
  fs.unlinkSync(tmp); await b.close();
  console.log(falhas ? `\n${falhas} relatório(s) com leitura divergente` : '\nTodos os relatórios conferem com o total impresso.');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
