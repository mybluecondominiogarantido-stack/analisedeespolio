'use strict';
/* ======================================================================
   Análise de Espólio · MyBlue · módulo do portal
   Arquivo gerado por build.js a partir de src/ — edite em src/.
   ====================================================================== */

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const MESES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const PRAZO_REANALISE_DIAS = 90;

const hojeISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
const nowISO = () => new Date().toISOString();
const fmtData = v => { if(!v) return '—'; const [a,m,d] = String(v).slice(0,10).split('-'); return d && m && a ? `${d}/${m}/${a}` : v; };
const fmtMesAno = v => { if(!v) return '—'; const [a,m] = String(v).split('-'); return MESES[+m-1] + '/' + a; };
const fmtBRL = n => (n === null || n === undefined || isNaN(n)) ? '—' : Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const somaDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0,10); };
const diasEntre = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
const mesDe = iso => String(iso || '').slice(0,7);

/* ===== nomes ===== */
const SOBRE = ['DE','DA','DO','DOS','DAS','E'];
function normNome(s){
  return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z ]/g,' ').replace(/\s+/g,' ').trim();
}
const tokensNome = s => normNome(s).split(' ').filter(t => t.length > 1 && !SOBRE.includes(t));
function scoreNome(a, b){
  const A = tokensNome(a), B = tokensNome(b);
  if(!A.length || !B.length) return 0;
  const comuns = A.filter(t => B.includes(t)).length;
  let s = comuns / Math.min(A.length, B.length);
  if(A[0] === B[0]) s += 0.2;
  if(A[A.length-1] === B[B.length-1]) s += 0.1;
  return s;
}
const soDigitos = s => String(s||'').replace(/\D/g,'');
const normUnid = u => String(u||'').toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/^0+/,'');
const digitosUnid = u => String(u||'').replace(/\D/g,'').replace(/^0+/,'');
/* chave de condomínio: CNPJ se houver, senão nome normalizado (preserva dígitos) */
const normCond = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase()
  .replace(/\b(CONDOMINIO|COND\.?|RESIDENCIAL|RES\.?|EDIFICIO|ED\.?)\b/g,' ').replace(/[^A-Z0-9]/g,' ').replace(/\s+/g,' ').trim();
const chaveCond = (nome, cnpj) => soDigitos(cnpj).length === 14 ? 'cnpj:' + soDigitos(cnpj) : 'nome:' + normCond(nome);
const biTok = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,' ').split(/\s+/).filter(t => t && !SOBRE.includes(t));
/* coeficiente de Dice entre dois nomes de condomínio */
function diceCond(a, b){
  const A = biTok(normCond(a)), B = biTok(normCond(b));
  if(!A.length || !B.length) return 0;
  const comuns = A.filter(t => B.includes(t)).length;
  return 2 * comuns / (A.length + B.length);
}
function completaCpf(dig){
  dig = String(dig||'').replace(/\D/g,'');
  if(dig.length === 10) dig = '0' + dig;
  if(dig.length !== 11) return dig;
  return dig.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}
function fmtCnpj(d){ d = soDigitos(d); return d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : d; }
function numBR(raw){
  if(raw === null || raw === undefined || raw === '') return null;
  if(typeof raw === 'number') return raw;
  let s = String(raw).trim().replace(/R\$|\s/g,'');
  if(/,\d{1,2}$/.test(s)) s = s.replace(/\./g,'').replace(',','.');
  s = s.replace(/[^\d.\-]/g,'');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,8);

/* ===== UI helpers ===== */
let toastTimer = null;
function toast(msg, ms){
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), ms || 2600);
}
function abrirModal(titulo, html, acoesHtml){
  const m = $('#modal');
  m.innerHTML = `<div class="modal"><div class="caixa"><header><h2 style="font-size:16px">${esc(titulo)}</h2><div class="acoes">${acoesHtml||''}<button class="fechar" data-fechar title="Fechar">×</button></div></header><div class="corpo">${html}</div></div></div>`;
  m.hidden = false;
  m.querySelector('[data-fechar]').onclick = fecharModal;
  m.querySelector('.modal').addEventListener('click', e => { if(e.target.classList.contains('modal')) fecharModal(); });
  return m;
}
function fecharModal(){ const m = $('#modal'); m.hidden = true; m.innerHTML = ''; }
function confirmar(msg){ return Promise.resolve(window.confirm(msg)); }
function baixarArquivo(nome, conteudo, tipo){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([conteudo], {type: tipo || 'application/octet-stream'}));
  a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const nomeArquivoSeguro = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9 \-_.]/g,' ').replace(/\s+/g,' ').trim();
