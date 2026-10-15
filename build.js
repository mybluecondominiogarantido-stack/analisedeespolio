// Monta analise-espolio.html (arquivo único para o portal) a partir de src/
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, 'src');
const ler = f => fs.readFileSync(path.join(src, f), 'utf8');
const js = fs.readdirSync(src).filter(f => /^\d\d-.*\.js$/.test(f)).sort();
const logo = fs.existsSync(path.join(src, 'logo.b64')) ? ler('logo.b64').trim() : '';
let html = ler('01-head.html') + ler('02-body.html').replace('{{LOGO}}', logo)
  + '\n<script>\n' + js.map(f => `/* ===== ${f} ===== */\n` + ler(f)).join('\n') + '\n</script>\n</body>\n</html>\n';
fs.writeFileSync(path.join(__dirname, 'analise-espolio.html'), html);
console.log('analise-espolio.html gerado:', (html.length/1024).toFixed(0), 'KB ·', js.length, 'arquivos JS');
