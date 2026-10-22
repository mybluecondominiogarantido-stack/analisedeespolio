/* ======================================================================
   Casamento espólio × devedor e regras da Política de Análise de Espólio
   ====================================================================== */

/* melhor devedor para um espólio: CPF definitivo; senão nome + unidade (bloco+número forte, só número fraco) */
function melhorDevedor(u, lista){
  let melhor = -1, melhorS = 0;
  const uNorm = normUnid(u.unid), uDig = digitosUnid(u.unid);
  (lista || []).forEach((b, i) => {
    let s = scoreNome(u.titular, b.nome);
    if(uNorm && normUnid(b.unidadeTxt || b.unidade) === uNorm) s += 0.9;
    else if(uDig && digitosUnid(b.unidade) === uDig) s += 0.55;
    if(u.cpf && b.cpf && soDigitos(u.cpf) === soDigitos(b.cpf)) s = 9;
    if(s > melhorS){ melhorS = s; melhor = i; }
  });
  if(melhorS < 0.75) return null;
  const b = lista[melhor];
  const unidIgual = uNorm && normUnid(b.unidadeTxt || b.unidade) === uNorm;
  const nomeBate = scoreNome(u.titular, b.nome) >= 0.75;
  return { i: melhor, score: melhorS, modo: melhorS >= 9 ? 'CPF' : unidIgual && nomeBate ? 'nome + unidade' : unidIgual ? 'unidade' : 'nome' };
}

/* contagem de taxas de um espólio em um relatório (campo 'vouch' ou 'ant') */
function contagem(u, campo, dev, relatorioLido){
  if(u.manual && u.manual[campo] !== null && u.manual[campo] !== undefined) return u.manual[campo];
  const idx = u.esc ? u.esc[campo] : null;
  if(idx === null || idx === undefined) return relatorioLido ? 0 : null;
  const b = dev[campo] && dev[campo][idx];
  return b ? b.cobrancas.filter(c => c.incluir !== false).length : (relatorioLido ? 0 : null);
}

const BASE_TIPO = tipo => tipo === 'acompanhamento' ? 'REANÁLISE' : 'PREVENTIVO';

/* ctx: {tipo, semAnt, biPos (true/false/null), vig (meses|null)} ; vouch/ant: contagens (null = sem leitura) */
function classificar(u, ctx, vouch, ant){
  const base = BASE_TIPO(ctx.tipo);
  if(u.situacao === 'encerrada') return { r:'ENCERRADA', regra:'—', motivo: u.encerramento && u.encerramento.motivo ? u.encerramento.motivo : 'Acompanhamento encerrado.' };
  if(u.override){
    if(u.override === 'EXCLUIR') return { r:'EXCLUIR', regra:'Manual', motivo:'Excluída manualmente pelo analista.' + (u.motivoAjuste ? ' ' + u.motivoAjuste : '') };
    return { r:base, regra:'Manual', motivo:'Em acompanhamento por ajuste manual.' + (u.motivoAjuste ? ' ' + u.motivoAjuste : '') };
  }
  if(ctx.semAnt) ant = 0;
  if(vouch === null)
    return { r:base, regra:'5.5', motivo:'Sem leitura do Vouch para este devedor — insumo pendente; registrada para acompanhamento.', pendente:true };

  if(ctx.tipo === 'acompanhamento'){
    if(vouch >= 3) return { r:'EXCLUIR', regra:'Acompanhamento', motivo:`Reanálise — segue inadimplente no Vouch (${vouch} taxas); removida da garantia.` };
    return { r:'REANÁLISE', regra:'Acompanhamento', motivo: vouch > 0
      ? `Reanálise — ${vouch} taxa(s) no Vouch (abaixo de 3); permanece em acompanhamento (revisar em ~3 meses).`
      : 'Reanálise — sem cobrança no Vouch nesta reanálise; permanece em acompanhamento (revisar em ~3 meses).' };
  }

  if(ant === null)
    return { r:base, regra:'5.5', motivo:'Sem leitura do relatório anterior — insumo pendente; registrada para acompanhamento.', pendente:true };
  if(vouch > 0 && ant > 0)
    return { r:'EXCLUIR', regra:'1', motivo:`${vouch} no Vouch e ${ant} na base anterior.` };
  if(vouch === 0 && ant >= 3)
    return { r:base, regra:'2', motivo:`Sem Vouch; recorrência anterior (${ant} competências) — registrada para acompanhamento.` };
  if(vouch === 0)
    return { r:base, regra:'3', motivo: ant > 0 ? `Sem Vouch; anterior pontual (${ant}).` : 'Implantação sem inadimplência no Vouch (esperado nesta fase).' };
  if(ctx.biPos === null)
    return { r:base, regra:'5.5', motivo:`${vouch} cobrança(s) no Vouch, mas resultado do BI não informado.`, pendente:true };
  if(ctx.biPos)
    return vouch >= 3 ? { r:'EXCLUIR', regra:'4', motivo:`${vouch} cobranças no Vouch com BI positivo.` }
                      : { r:base, regra:'4', motivo:`${vouch} cobrança(s) no Vouch com BI positivo — em acompanhamento.` };
  if(ctx.vig === null)
    return { r:base, regra:'5.5', motivo:'Só Vouch com BI negativo, mas vigência não informada.', pendente:true };
  return (ctx.vig < 6 && vouch < 3)
    ? { r:base, regra:'5', motivo:`Contrato recente (${ctx.vig} meses) e ${vouch} cobrança(s).` }
    : { r:'EXCLUIR', regra:'5', motivo:`BI negativo, ${ctx.vig} meses de vigência, ${vouch} cobrança(s).` };
}

/* justificativa curta da ficha: uma linha, sem número de regra */
function motivoCurto(u, r){
  const nV = n => n === 1 ? '1 no Vouch' : n + ' no Vouch';
  const vig = r.idadeGarantia === null || r.idadeGarantia === undefined || r.idadeGarantia === '' ? null : +r.idadeGarantia;
  // a falta do relatório anterior já aparece na coluna da ficha; não repete aqui
  switch(String(u.regra)){
    case 'Manual': return 'Ajuste da coordenação' + (u.motivoAjuste ? ': ' + u.motivoAjuste : '');
    case '1': return nV(u.vouch) + ' + débito anterior';
    case '2': return 'Sem Vouch · anterior recorrente (' + u.ant + ')';
    case '3': return 'Sem cobrança no Vouch' ;
    case '4': return nV(u.vouch) + ' · BI positivo' ;
    case '5': return nV(u.vouch) + ' · BI negativo · ' + (vig === null ? '' : vig + (vig === 1 ? ' mês' : ' meses')) ;
    case 'Acompanhamento': return u.vouch ? (u.vouch >= 3 ? u.vouch + ' taxas acumuladas no Vouch' : nV(u.vouch)) : 'Sem cobrança no Vouch';
    case '5.5': return u.vouch === null || u.vouch === undefined ? 'Insumo pendente: Vouch' : /BI/.test(u.motivo || '') ? 'Insumo pendente: BI' : /vig/i.test(u.motivo || '') ? 'Insumo pendente: vigência' : 'Insumo pendente';
    case 'Carga': return 'Carga inicial';
    case '—': return u.encerramento && u.encerramento.motivo ? u.encerramento.motivo : 'Encerrada';
    default: return '';
  }
}
const sufStatus = r => (r === 'PREVENTIVO' || r === 'REANÁLISE') ? 'PREV' : r === 'EXCLUIR' ? 'EXCLUIR' : r === 'ENCERRADA' ? 'ENC' : 'REAN';
const classeSelo = r => r === 'EXCLUIR' ? 's-exc' : (r === 'PREVENTIVO' || r === 'REANÁLISE') ? 's-prev' : r === 'ENCERRADA' ? 's-enc' : 's-rean';
const classeRes  = r => 'res-' + sufStatus(r);
const rotuloStatus = r => r === 'EXCLUIR' ? 'Excluir' : (r === 'PREVENTIVO' || r === 'REANÁLISE') ? 'Em acompanhamento' : r === 'ENCERRADA' ? 'Encerrada' : r;

const TEXTO_REGRAS = `
<p>Cada unidade recebe um de dois resultados: <b>Excluir</b> (sai da garantia) ou <b>Em acompanhamento</b> (continua garantida e volta a ser analisada a cada ~3 meses).</p>
<p><b>Implantação e avulso (1ª análise).</b> Regras 1 a 5, aplicadas na ordem; a primeira que se confirmar define o resultado:</p>
<ol style="padding-left:18px">
<li><b>Vouch + débito anterior → Excluir.</b> Cobrança no Vouch <i>e</i> débito na administradora anterior.</li>
<li><b>Sem Vouch + anterior recorrente (3+) → Em acompanhamento.</b></li>
<li><b>Sem Vouch (sem anterior ou pontual) → Em acompanhamento.</b></li>
<li><b>Só Vouch + BI positivo.</b> 3 ou mais → Excluir; menos de 3 → Em acompanhamento.</li>
<li><b>Só Vouch + BI negativo.</b> Em acompanhamento só se vigência &lt; 6 meses <i>e</i> menos de 3 cobranças; caso contrário → Excluir.</li>
</ol>
<p><b>Reanálise (acompanhamento).</b> Só o Vouch entra: <b>3 ou mais</b> taxas em aberto → Excluir; abaixo de 3 → continua Em acompanhamento.</p>
<p><b>Item 5.5</b> — faltando insumo, a unidade fica em acompanhamento e a pendência é registrada, sem inferência. Relatório lido sem casamento = sem cobrança (0).</p>
<p>Toda linha de taxa conta igual (arrecadação, rateio, parcela de acordo). Marcadores como "Jurídico" ficam só como informação na evidência.</p>
<p>Saída do acompanhamento: exclusão da garantia ou troca de titularidade concluída. Regra de saída por tempo ou por reanálises zeradas: pendente de definição.</p>`;
