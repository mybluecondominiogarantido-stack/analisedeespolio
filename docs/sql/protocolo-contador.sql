-- Proteção do contador de protocolos (AE-AAAA-NNNN) do módulo analise-de-espolio.
-- APLICADO em 16/10/2026 com aval da coordenação de Cobrança; testado em transação desfeita.
-- O módulo lê meta/estado, soma 1 e grava. Se duas pessoas fizerem isso ao mesmo tempo, as duas gravariam o mesmo número.
-- Este gatilho recusa a gravação que não aumenta o contador (ou que o faz voltar); o módulo então lê de novo e tenta o próximo.
-- Reverter: drop trigger if exists espolio_protocolo_guarda on public.documentos; drop function if exists public.espolio_protocolo_guarda();
create or replace function public.espolio_protocolo_guarda() returns trigger language plpgsql as $$
declare
  ano text; v_old bigint; v_new bigint; subiu boolean := false;
begin
  if new.modulo_slug <> 'analise-de-espolio' or new.colecao <> 'meta' or new.doc_id <> 'estado' then return new; end if;
  if old.dados is null or old.dados->'seq' is null then return new; end if;
  if new.dados is null or new.dados->'seq' is null then
    raise exception 'protocolo_conflito: o contador de protocolos não pode ser apagado';
  end if;
  for ano in select jsonb_object_keys(old.dados->'seq') loop
    v_old := coalesce((old.dados->'seq'->>ano)::bigint, 0);
    v_new := coalesce((new.dados->'seq'->>ano)::bigint, 0);
    if v_new < v_old then raise exception 'protocolo_conflito: contador de % voltaria de % para %', ano, v_old, v_new; end if;
  end loop;
  for ano in select jsonb_object_keys(new.dados->'seq') loop
    if coalesce((new.dados->'seq'->>ano)::bigint, 0) > coalesce((old.dados->'seq'->>ano)::bigint, 0) then subiu := true; end if;
  end loop;
  if not subiu then raise exception 'protocolo_conflito: número já usado, buscar o próximo'; end if;
  return new;
end $$;
create trigger espolio_protocolo_guarda before update on public.documentos for each row
  when (new.modulo_slug = 'analise-de-espolio' and new.colecao = 'meta' and new.doc_id = 'estado')
  execute function public.espolio_protocolo_guarda();
