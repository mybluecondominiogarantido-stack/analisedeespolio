/* ======================================================================
   Inicialização
   ====================================================================== */
/* erro inesperado nunca passa em silêncio: aparece na faixa de mensagem */
window.addEventListener('error', e => { try{ toast('Erro inesperado: ' + (e.message || e.error || 'desconhecido') + '. Recarregue a página; se repetir, avise.', 8000); }catch(_){} });
window.addEventListener('unhandledrejection', e => { try{ const r = e.reason; toast('Erro inesperado: ' + ((r && r.message) || r || 'desconhecido') + '. Recarregue a página; se repetir, avise.', 8000); }catch(_){} });
(async function init(){
  $('#dataAnalise').value = hojeISO();
  $('#textoRegras').innerHTML = TEXTO_REGRAS;
  try{ await conectarBase(); }
  catch(e){ document.querySelector('main').insertAdjacentHTML('afterbegin', `<div class="erro">${esc(e.message)}</div>`); return; }
  assinarBase();
  renderNovaLista();
})();
