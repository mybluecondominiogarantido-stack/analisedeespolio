/* ======================================================================
   Inicialização
   ====================================================================== */
(async function init(){
  $('#dataAnalise').value = hojeISO();
  $('#textoRegras').innerHTML = TEXTO_REGRAS;
  try{ await conectarBase(); }
  catch(e){ document.querySelector('main').insertAdjacentHTML('afterbegin', `<div class="erro">${esc(e.message)}</div>`); return; }
  assinarBase();
  renderNovaLista();
  sincronizarCarteira();
})();
