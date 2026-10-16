-- Gatilho de avisos no sino do portal para o módulo analise-de-espolio.
-- NÃO APLICADO: depende do aval da coordenação e de quem mantém o portal.
-- Efeito: ao entrar uma solicitação nova em documentos (modulo_slug = 'analise-de-espolio', colecao = 'solicitacoes'),
-- grava um aviso para cada usuário da gestão; ao mudar o status para concluida/devolvida, avisa o solicitante.
create or replace function public.espolio_notificar() returns trigger language plpgsql as $$
declare
  st_antigo text := coalesce(old.dados->>'status', '');
  st_novo   text := coalesce(new.dados->>'status', '');
  cond      text := coalesce(new.dados->'condominio'->>'nome', '');
  solic     text := coalesce(new.dados->>'solicitanteNome', '');
  solic_id  int  := case when coalesce(new.dados->>'solicitanteId','') ~ '^[0-9]+$' then (new.dados->>'solicitanteId')::int end;
begin
  if new.modulo_slug <> 'analise-de-espolio' or new.colecao <> 'solicitacoes' then return new; end if;
  -- nova solicitação → gestão
  if tg_op = 'INSERT' or (st_antigo <> 'nova' and st_novo = 'nova') then
    -- gestão = quem tem o papel 'gestao' em perfis/{id}; sem ninguém marcado, os nomes padrão
    insert into public.notificacoes (usuario_id, tipo, titulo, texto, link)
    select u.id, 'espolio', solic || ' solicitou análise de espólio · ' || cond, 'Abra a aba Solicitações do módulo Análise de Espólio.', '#/m/analise-de-espolio'
    from public.usuarios u
    where u.ativo and (
      u.id::text in (select doc_id from public.documentos where modulo_slug='analise-de-espolio' and colecao='perfis' and dados->'papeis' ? 'gestao')
      or (not exists (select 1 from public.documentos where modulo_slug='analise-de-espolio' and colecao='perfis' and dados->'papeis' ? 'gestao')
          and upper(u.nome) in ('BEATRIZ TEIXEIRA', 'MARIANA NASCIMENTO')));
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
