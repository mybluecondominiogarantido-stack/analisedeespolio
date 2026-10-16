-- APLICADO em 16/10/2026 no projeto myblue-portal (com aval da coordenação).
-- 1) registra o módulo; 2) espelha public.condominios em documentos (analise-espolio / carteira / atual);
-- 3) gatilho por comando em condominios refaz a cópia a cada inclusão, alteração ou exclusão.
-- Não altera dados existentes. Para desfazer, ver o bloco REVERTER no fim.

insert into public.modulos (slug, nome, descricao, setor_id, icone, ordem, ativo, armazenamento, adaptador, fonte_dados, config)
select 'analise-espolio', 'Análise de Espólio', 'Análise de unidades elegíveis à exclusão da garantia (espólios): solicitações, implantação, fila de acompanhamento e fichas.',
       (select id from public.setores where nome = 'Cobrança' limit 1), 'app', coalesce((select max(ordem) from public.modulos), 0) + 1, true,
       'compartilhado', 'claude-db', 'interno', '{"titulo":"Análise de Espólio","chaves_locais":[]}'::jsonb
where not exists (select 1 from public.modulos where slug = 'analise-espolio');

create or replace function public.espolio_carteira_json() returns jsonb language sql stable as $$
  select jsonb_build_object(
    'origem', 'banco',
    'atualizadoEm', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'assinatura', 'banco:' || count(*) || ':' || coalesce(max(atualizado_em)::text, ''),
    'itens', coalesce(jsonb_agg(jsonb_build_object(
      'codigo', codigo, 'nome', nome, 'razao_social', razao_social, 'cnpj', cnpj, 'comarca', comarca, 'situacao', situacao,
      'inicio_contrato', inicio_contrato, 'assistente_credito', assistente_credito, 'analista_cobranca', analista_cobranca,
      'analista_extrajudicial', analista_extrajudicial, 'executivo', executivo, 'administradora', administradora
    ) order by nome), '[]'::jsonb))
  from public.condominios;
$$;

create or replace function public.espolio_atualizar_carteira() returns void language plpgsql as $$
declare novo_seq bigint;
begin
  select coalesce(max(seq), 0) + 1 into novo_seq from public.documentos where modulo_slug = 'analise-espolio';
  insert into public.documentos (modulo_slug, colecao, doc_id, dados, seq, atualizado_em)
  values ('analise-espolio', 'carteira', 'atual', public.espolio_carteira_json(), novo_seq, now())
  on conflict (modulo_slug, colecao, doc_id) do update set dados = excluded.dados, seq = excluded.seq, atualizado_em = now();
end $$;

create or replace function public.espolio_carteira_trigger() returns trigger language plpgsql as $$
begin perform public.espolio_atualizar_carteira(); return null; end $$;

create trigger espolio_carteira after insert or update or delete on public.condominios
  for each statement execute function public.espolio_carteira_trigger();

select public.espolio_atualizar_carteira();

-- REVERTER
-- drop trigger if exists espolio_carteira on public.condominios;
-- drop function if exists public.espolio_carteira_trigger();
-- drop function if exists public.espolio_atualizar_carteira();
-- drop function if exists public.espolio_carteira_json();
-- delete from public.documentos where modulo_slug = 'analise-espolio' and colecao = 'carteira';
-- delete from public.modulos where slug = 'analise-espolio';  -- só se o módulo ainda não tiver dados
