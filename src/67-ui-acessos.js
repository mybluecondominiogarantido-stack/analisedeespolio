/* ======================================================================
   Acessos — quem faz o quê (mesmo modelo do módulo Comissões de Novos Condomínios)
   Cada pessoa aparece aqui depois de abrir o módulo no portal uma vez. A gestão marca os papéis.
   ====================================================================== */
function linhasAcessos(){
  const ids = {};
  Object.keys(S.vistos || {}).forEach(k => ids[k] = 1);
  Object.keys(S.perfis || {}).forEach(k => ids[k] = 1);
  if(ME.id !== null && ME.id !== undefined) ids[String(ME.id)] = 1;
  return Object.keys(ids).map(id => {
    const v = (S.vistos || {})[id] || {}, p = (S.perfis || {})[id] || {};
    return { id, nome: p.nome || v.nome || (id === String(ME.id) ? ME.name : 'Usuário ' + id), visto: v.em || '', papeis: p.papeis || [], nomeCarteira: p.nomeCarteira || '' };
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
const semPapel = () => linhasAcessos().filter(l => !l.papeis.length && l.id !== String(ME.id));
function renderAcessosBadge(){
  const n = semPapel().length, el = $('#nAcessos');
  if(!el) return;
  el.hidden = !n; el.textContent = `${n} sem papel`; el.classList.toggle('alerta', n > 0);
}
function nomesDaCarteira(){
  const set = new Map();
  (S.carteira.itens || []).forEach(c => [c.assistenteCredito, c.analistaCobranca].forEach(n => { if(n) set.set(normNome(n), n); }));
  return [...set.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
const fmtDataHora = iso => { if(!iso) return '—'; const d = new Date(iso); if(isNaN(d)) return '—'; return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }); };

function renderAcessos(){
  const root = $('#p-acessos'); if(!root) return;
  const linhas = linhasAcessos();
  const nomes = nomesDaCarteira();
  const provisoria = !temAlgumaGestao();
  const local = DB && DB._local;
  root.innerHTML = `
    <div class="card"><header><h2>Quem faz o quê</h2><span class="dica">${linhas.length} pessoa(s)</span></header>
      <div class="corpo">
        <p class="ajuda" style="margin:0 0 10px">Cada pessoa aparece aqui depois de abrir este módulo no portal uma vez. O acesso ao módulo em si é liberado pela administração do portal (Usuários e acessos). Quem ainda não tem papel vê a tela “Acesso registrado” até a gestão marcar.</p>
        ${provisoria ? `<div class="aviso" style="margin:0 0 10px">Ninguém tem o papel de Gestão ainda. Até alguém ser marcado, valem como gestão: ${GESTAO_PADRAO.map(n => esc(n.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()))).join(' e ')}. Marque a gestão abaixo para fixar.</div>` : ''}
        ${local ? '<div class="aviso" style="margin:0 0 10px">Modo local: fora do portal não há usuários; a tabela mostra só este navegador. Para testar os perfis use “ver como…” no chip do usuário.</div>' : ''}
        <div class="tabela-wrap"><table style="min-width:760px"><thead><tr><th>Pessoa</th><th>Papéis</th><th>Nome na carteira</th><th>Último acesso</th></tr></thead><tbody>${
          linhas.map(l => {
            const cb = (pp, rot) => `<label class="check" style="display:inline-flex;margin:0 16px 0 0;text-transform:none;letter-spacing:0;font-size:13px;font-weight:700;color:var(--ink-2)"><input type="checkbox" data-u="${esc(l.id)}" data-pp="${pp}" ${l.papeis.includes(pp) ? 'checked' : ''} ${!CAN_WRITE ? 'disabled' : ''}> ${rot}</label>`;
            const opts = '<option value="">—</option>' + nomes.map(n => `<option ${normNome(n) === normNome(l.nomeCarteira) ? 'selected' : ''}>${esc(n)}</option>`).join('')
              + (l.nomeCarteira && !nomes.some(n => normNome(n) === normNome(l.nomeCarteira)) ? `<option selected>${esc(l.nomeCarteira)}</option>` : '');
            return `<tr><td><b>${esc(l.nome)}</b>${l.id === String(ME.id) ? ' <span class="ajuda" style="display:inline;margin:0">(você)</span>' : ''}${!l.papeis.length && l.id !== String(ME.id) ? ' <span class="selo s-rean">sem papel</span>' : ''}</td>
              <td>${cb('gestao', 'Gestão')}${cb('solicitante', 'Solicitante')}</td>
              <td><select class="campo" data-nc="${esc(l.id)}" style="width:auto;min-width:220px" ${!CAN_WRITE ? 'disabled' : ''}>${opts}</select></td>
              <td>${fmtDataHora(l.visto)}</td></tr>`;
          }).join('')}</tbody></table></div>
      </div></div>
    <div class="card"><header><h2>Papéis</h2></header><div class="corpo">
      <p class="ajuda" style="margin:0 0 6px"><b>Gestão</b>: coordenação. Vê tudo, recebe e registra solicitações, conduz e conclui as análises, cuida da fila de acompanhamento, das configurações e define os papéis nesta aba.</p>
      <p class="ajuda" style="margin:0 0 6px"><b>Solicitante</b>: assistentes de implantação e analistas de Cobrança. Envia solicitações, verifica os condomínios implantados e acompanha as próprias solicitações, baixando a ficha quando concluída.</p>
      <p class="ajuda" style="margin:0"><b>Nome na carteira</b>: liga o login ao nome que aparece no cadastro de condomínios (assistente de crédito ou analista de cobrança). É assim que o ticket da ficha chega à pessoa certa.</p>
    </div></div>`;

  const salvarPerfil = async (uid, fn) => {
    const lin = linhas.find(l => l.id === uid);
    const atual = JSON.parse(JSON.stringify((S.perfis || {})[uid] || { id: uid, papeis: [], nomeCarteira: '' }));
    atual.nome = lin ? lin.nome : atual.nome;
    fn(atual);
    atual.atualizadoEm = nowISO(); atual.atualizadoPor = ME.name;
    try{
      // primeira configuração: quem está na gestão provisória (nomes padrão) fica fixado como Gestão antes de marcar outra pessoa
      const eu = String(ME.id);
      if(!temAlgumaGestao() && ehGestao() && uid !== eu && !(DB && DB._local)){
        const meu = JSON.parse(JSON.stringify((S.perfis || {})[eu] || { id: eu, papeis: [], nomeCarteira: '' }));
        meu.nome = ME.name; if(!meu.papeis.includes('gestao')) meu.papeis.push('gestao'); meu.atualizadoEm = nowISO(); meu.atualizadoPor = ME.name;
        await DB.doc(COLECOES.perfis + '/' + eu).set(meu);
      }
      await DB.doc(COLECOES.perfis + '/' + uid).set(atual); registrarHistorico('papel', { usuario: uid, nome: atual.nome, papeis: atual.papeis }); toast('Papéis de ' + atual.nome + ' atualizados.'); }
    catch(e){ toast(dbErr(e), 5000); renderAcessos(); }
  };
  root.querySelectorAll('[data-pp]').forEach(el => el.onchange = async () => {
    const uid = el.dataset.u, pp = el.dataset.pp, on = el.checked;
    if(pp === 'gestao' && !on && uid === String(ME.id)){
      const outras = Object.values(S.perfis || {}).filter(p => p.id !== uid && (p.papeis || []).includes('gestao')).length;
      if(!(await confirmar('Você vai tirar o seu próprio papel de Gestão' + (outras ? '.' : ' e não sobra ninguém na gestão: valem de novo os nomes padrão.') + ' Continuar?'))){ el.checked = true; return; }
    }
    salvarPerfil(uid, p => { p.papeis = (p.papeis || []).filter(x => x !== pp); if(on) p.papeis.push(pp); });
  });
  root.querySelectorAll('[data-nc]').forEach(el => el.onchange = () => salvarPerfil(el.dataset.nc, p => { p.nomeCarteira = el.value; }));
}
