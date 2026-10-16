-- Gatilho de avisos no sino do portal para o módulo analise-de-espolio.
-- APLICADO em 16/10/2026 com aval da coordenação de Cobrança; testado em transação desfeita (gestão e solicitante avisados).
-- Reverter: drop trigger if exists espolio_notificar on public.documentos; drop function if exists public.espolio_notificar();
-- Efeito: ao entrar uma solicitação nova em documentos (modulo_slug = 'analise-de-espolio', colecao = 'solicitacoes'),
-- grava um aviso para cada usuário da gestão; ao mudar o status para concluida/devolvida, avisa o solicitante.
create or replace function public.espolio_notificar() returns trigger language plpgsql as $$
declare
  st_antigo text := case when tg_op = 'UPDATE' then coalesce(old.dados->>'status', '') else '' end;
  st_novo   text := coalesce(new.dados->>'status', '');
  cond      text := coalesce(new.dados->'condominio'->>'nome', '');
  solic     text := coalesce(new.dados->>'solicitanteNome', '');
  -- o portal entrega o login ao módulo como 'mb-<id de usuarios>'
  solic_id  int  := case when coalesce(new.dados->>'solicitanteId','') ~ '^(mb-)?[0-9]+$' then regexp_replace(new.dados->>'solicitanteId', '^mb-', '')::int end;
begin
  if new.modulo_slug <> 'analise-de-espolio' or new.colecao <> 'solicitacoes' then return new; end if;
  -- nova solicitação → gestão
  if tg_op = 'INSERT' or (st_antigo <> 'nova' and st_novo = 'nova') then
    -- gestão = quem tem o papel 'gestao' em perfis/{id} (doc_id 'mb-<id>')
    insert into public.notificacoes (usuario_id, tipo, titulo, texto, link)
    select u.id, 'espolio', solic || ' solicitou análise de espólio · ' || cond, 'Abra a aba Solicitações do módulo Análise de Espólio.', '#/m/analise-de-espolio'
    from public.usuarios u
    where u.ativo and u.id::text in (select regexp_replace(doc_id, '^mb-', '') from public.documentos where modulo_slug='analise-de-espolio' and colecao='perfis' and dados->'papeis' ? 'gestao');
  end if;
  -- concluída / devolvida → solicitante
  if tg_op = 'UPDATE' and st_antigo <> st_novo and st_novo in ('concluida','devolvida') and solic_id is not null then
    insert into public.notificacoes (usuario_id, tipo, titulo, texto, link) values (solic_id, 'espolio',
      case when st_novo = 'concluida' then 'Análise de espólio concluída · ' || cond || ' · ' || coalesce(new.dados->>'protocolo','') else 'Solicitação de análise devolvida · ' || cond end,
      case when st_novo = 'concluida' then 'A ficha está disponível em Minhas solicitações.' else coalesce(new.dados->>'motivoDevolucao','') end, '#/m/analise-de-espolio');
  end if;
  return new;
exception when others then
  raise warning 'espolio_notificar: %', sqlerrm;  -- aviso nunca bloqueia a gravação do módulo
  return new;
end $$;
drop trigger if exists espolio_notificar on public.documentos;
create trigger espolio_notificar after insert or update of dados on public.documentos for each row execute function public.espolio_notificar();
