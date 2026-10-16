-- Gatilho de avisos no sino do portal para o módulo analise-espolio.
-- NÃO APLICADO: depende do aval da coordenação e de quem mantém o portal.
-- Efeito: ao entrar uma solicitação nova em documentos (modulo_slug = 'analise-espolio', colecao = 'solicitacoes'),
-- grava um aviso para cada usuário da gestão; ao mudar o status para concluida/devolvida, avisa o solicitante.
create or replace function public.espolio_notificar() returns trigger language plpgsql as $$
declare
  st_antigo text := coalesce(old.dados->>'status', '');
  st_novo   text := coalesce(new.dados->>'status', '');
  cond      text := coalesce(new.dados->'condominio'->>'nome', '');
  solic     text := coalesce(new.dados->>'solicitanteNome', '');
  solic_id  int  := nullif(new.dados->>'solicitanteId', '')::int;
  g         jsonb;
  gid       int;
begin
  if new.modulo_slug <> 'analise-espolio' or new.colecao <> 'solicitacoes' then return new; end if;
  -- nova solicitação → gestão (lista em documentos meta/acesso; sem lista, Beatriz Teixeira)
  if tg_op = 'INSERT' or (st_antigo <> 'nova' and st_novo = 'nova') then
    for g in select jsonb_array_elements(coalesce((select dados->'gestao' from public.documentos where modulo_slug='analise-espolio' and colecao='meta' and doc_id='acesso'), '[]'::jsonb)) loop
      gid := nullif(g->>'id','')::int;
      if gid is null then select id into gid from public.usuarios where upper(nome) = upper(g->>'nome') and ativo limit 1; end if;
      if gid is not null then
        insert into public.notificacoes (usuario_id, tipo, titulo, texto, link) values (gid, 'espolio', solic || ' solicitou análise de espólio · ' || cond, 'Abra a aba Solicitações do módulo Análise de Espólio.', '#/m/analise-espolio');
      end if;
    end loop;
    if not exists (select 1 from public.documentos where modulo_slug='analise-espolio' and colecao='meta' and doc_id='acesso' and jsonb_array_length(coalesce(dados->'gestao','[]'::jsonb)) > 0) then
      insert into public.notificacoes (usuario_id, tipo, titulo, texto, link)
      select id, 'espolio', solic || ' solicitou análise de espólio · ' || cond, 'Abra a aba Solicitações do módulo Análise de Espólio.', '#/m/analise-espolio' from public.usuarios where upper(nome) = 'BEATRIZ TEIXEIRA' and ativo;
    end if;
  end if;
  -- concluída / devolvida → solicitante
  if tg_op = 'UPDATE' and st_antigo <> st_novo and st_novo in ('concluida','devolvida') and solic_id is not null then
    insert into public.notificacoes (usuario_id, tipo, titulo, texto, link) values (solic_id, 'espolio',
      case when st_novo = 'concluida' then 'Análise de espólio concluída · ' || cond || ' · ' || coalesce(new.dados->>'protocolo','') else 'Solicitação de análise devolvida · ' || cond end,
      case when st_novo = 'concluida' then 'A ficha está disponível em Minhas solicitações.' else coalesce(new.dados->>'motivoDevolucao','') end, '#/m/analise-espolio');
  end if;
  return new;
end $$;
drop trigger if exists espolio_notificar on public.documentos;
create trigger espolio_notificar after insert or update of dados on public.documentos for each row execute function public.espolio_notificar();
