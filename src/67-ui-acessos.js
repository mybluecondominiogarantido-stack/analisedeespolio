/* ======================================================================
   Acessos — quem faz o quê (mesma funcionalidade do módulo Comissões de Novos Condomínios)
   Cada pessoa aparece aqui depois de abrir o módulo no portal uma vez. A gestão marca os papéis.
   ====================================================================== */
function nomesDaCarteira(){
  const set = new Map();
  (S.carteira.itens || []).forEach(c => [c.assistenteCredito, c.analistaCobranca].forEach(n => { if(n) set.set(normNome(n), n); }));
  return [...set.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
const fmtDataHora = iso => { if(!iso) return '—'; const d = new Date(iso); if(isNaN(d)) return '—'; return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }); };

function renderAcessos(){
  const root = $('#p-acessos'); if(!root) return;
  const local = DB && DB._local;
  const ids = {};
  Object.keys(S.vistos || {}).forEach(k => ids[k] = 1);
  Object.keys(S.perfis || {}).forEach(k => ids[k] = 1);
  if(!local && ME.id !== null && ME.id !== undefined) ids[String(ME.id)] = 1;
  const nomes = nomesDaCarteira();
  const linhas = Object.keys(ids).map(id => {
    const v = (S.vistos || {})[id] || {}, p = (S.perfis || {})[id] || {};
    return { id, nome: p.nome || v.nome || (id === String(ME.id) ? ME.name : 'Usuário ' + id), visto: v.em || '', papeis: p.papeis || [], nomeCarteira: p.nomeCarteira || '' };
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  let h = `<div class="card"><header><h2>Quem faz o quê</h2></header><div class="corpo">
    <p class="ajuda" style="margin:0 0 10px">Cada pessoa aparece aqui depois de abrir este módulo no portal uma vez. O acesso ao módulo em si é liberado pela administração do portal (Usuários e acessos).</p>`;
  if(local) h += '<div class="vazio">Fora do portal não há usuários: todas as abas ficam liberadas neste navegador.</div>';
  else h += `<div class="tabela-wrap"><table style="min-width:820px"><thead><tr><th>Pessoa</th><th>Papéis</th><th>Nome na carteira</th><th>Último acesso</th></tr></thead><tbody>${
      linhas.map(l => {
        const cb = (pp, rot) => `<label class="check" style="display:inline-flex;margin:0 16px 0 0;text-transform:none;letter-spacing:0;font-size:13px;font-weight:700;color:var(--ink-2)"><input type="checkbox" data-u="${esc(l.id)}" data-pp="${pp}" ${l.papeis.includes(pp) ? 'checked' : ''} ${!CAN_WRITE ? 'disabled' : ''}> ${rot}</label>`;
        const opts = '<option value="">—</option>' + nomes.map(n => `<option ${normNome(n) === normNome(l.nomeCarteira) ? 'selected' : ''}>${esc(n)}</option>`).join('')
          + (l.nomeCarteira && !nomes.some(n => normNome(n) === normNome(l.nomeCarteira)) ? `<option selected>${esc(l.nomeCarteira)}</option>` : '');
        return `<tr><td><b>${esc(l.nome)}</b>${l.id === String(ME.id) ? ' <span class="ajuda" style="display:inline;margin:0">(você)</span>' : ''}</td>
          <td>${cb('gestao', PAPEIS.gestao)}${cb('implantacao', PAPEIS.implantacao)}${cb('avulso', PAPEIS.avulso)}</td>
          <td><select class="campo" data-nc="${esc(l.id)}" style="width:auto;min-width:220px" ${!CAN_WRITE ? 'disabled' : ''}>${opts}</select></td>
          <td>${fmtDataHora(l.visto)}</td></tr>`;
      }).join('')}</tbody></table></div>`;
  h += `</div></div>
    <div class="card"><header><h2>Papéis</h2></header><div class="corpo"><p class="ajuda" style="margin:0">
      <b>Gestão</b>: coordenação. Vê tudo, recebe e registra solicitações, conduz e conclui as análises, cuida da fila de acompanhamento e das configurações e define os papéis.
      <b>Implantação</b>: assistentes de implantação. Solicitam a análise dos condomínios em implantação, com o quadro dos condomínios com vigência no mês e dos atrasados, e também podem enviar solicitações avulsas.
      <b>Solicitante avulso</b>: analistas de Cobrança e demais. Enviam solicitações avulsas, sem o quadro de implantação.
      <b>Nome na carteira</b>: liga o login ao nome que aparece no cadastro de condomínios (assistente de crédito ou analista de cobrança). É assim que o ticket da ficha chega à pessoa certa.</p></div></div>`;
  root.innerHTML = h;

  const salvarPerfil = async (uid, fn) => {
    const atual = JSON.parse(JSON.stringify((S.perfis || {})[uid] || { id: uid, papeis: [], nomeCarteira: '' }));
    const lin = linhas.find(l => l.id === uid);
    atual.nome = lin ? lin.nome : atual.nome;
    fn(atual);
    const eraGestor = ((((S.perfis || {})[String(ME.id)] || {}).papeis) || []).includes('gestao');
    const restantes = Object.keys(S.perfis || {}).filter(k => k !== uid && (S.perfis[k].papeis || []).includes('gestao')).length + (atual.papeis.includes('gestao') ? 1 : 0);
    if(eraGestor && uid === String(ME.id) && !atual.papeis.includes('gestao') && !(await confirmar('Você vai tirar seu próprio papel de gestão' + (restantes ? '' : ' e não sobra nenhum gestor (todas as abas voltam a ficar liberadas para todos)') + '. Continuar?'))){ renderAcessos(); return; }
    atual.atualizadoPor = ME.name; atual.atualizadoEm = nowISO();
    try{ await DB.doc(COLECOES.perfis + '/' + uid).set(atual); registrarHistorico('papel', { usuario: uid, nome: atual.nome, papeis: atual.papeis, nomeCarteira: atual.nomeCarteira }); toast('Acesso atualizado.'); }
    catch(e){ toast(dbErr(e), 5000); renderAcessos(); }
  };
  root.querySelectorAll('input[data-pp]').forEach(el => el.onchange = () => {
    const pp = el.dataset.pp, on = el.checked;
    salvarPerfil(el.dataset.u, p => { p.papeis = (p.papeis || []).filter(x => x !== pp); if(on) p.papeis.push(pp); });
  });
  root.querySelectorAll('select[data-nc]').forEach(el => el.onchange = () => salvarPerfil(el.dataset.nc, p => { p.nomeCarteira = el.value; }));
}
