-- Ticket da ficha aberto pelo módulo Análise de Espólio · APLICADO em 22/10/2026 com aval da coordenação
-- O módulo não alcança as tabelas de tickets do portal (RLS sem política: só o servidor do portal grava).
-- Por isso, como no aviso do sino, o módulo grava um pedido em documentos (coleção "tickets") e esta regra
-- cria o ticket de verdade: tickets + ticket_eventos ("criado") + ticket_anexos (ficha em PDF) + aviso no sino.
-- Antes de gravar o pedido, a regra tira o PDF do documento e devolve o número do ticket (status "aberto")
-- ou o motivo da recusa (status "erro"). Nada é criado se qualquer passo falhar.
--
-- Quem pode abrir: só quem tem o papel de gestão no módulo (perfis/mb-<id> com "gestao"),
-- conferido pelo atualizado_por que o próprio portal grava.
-- Setor: pelo nome (padrão "Crédito"). Categoria: "Análise de Espólio" do setor, se existir. Sem prazo. Prioridade padrão: alta.
-- Responsável: usuário ativo do portal com o mesmo nome do campo "Para"; sem login, fica na fila do setor
-- e o aviso vai para a liderança do setor (mesmo comportamento do portal no ticket sem responsável).

-- 1) categoria "Análise de Espólio" no setor Crédito
INSERT INTO public.ticket_categorias (setor_id, nome, prioridade, ativo)
SELECT s.id, 'Análise de Espólio', 'alta', true FROM public.setores s
WHERE s.nome = 'Crédito'
  AND NOT EXISTS (SELECT 1 FROM public.ticket_categorias c WHERE c.setor_id = s.id AND lower(c.nome) = lower('Análise de Espólio'));

-- 2) regra
CREATE OR REPLACE FUNCTION public.espolio_ticket()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  d          jsonb := new.dados;
  autor      int   := new.atualizado_por;
  v_setor    record;
  v_cat      int;
  v_resp     int;
  v_cond     int;
  v_prio     text;
  v_titulo   text;
  v_tid      int;
  v_nome     text;
  v_cnpj     text;
  v_pdf      bytea;
BEGIN
  IF new.modulo_slug <> 'analise-de-espolio' OR new.colecao <> 'tickets' OR d IS NULL OR coalesce(d->>'status', '') <> 'pedido' THEN
    RETURN new;
  END IF;
  BEGIN
    IF autor IS NULL OR NOT EXISTS (SELECT 1 FROM public.documentos p
        WHERE p.modulo_slug = 'analise-de-espolio' AND p.colecao = 'perfis' AND p.doc_id = 'mb-' || autor AND p.dados->'papeis' ? 'gestao') THEN
      RAISE EXCEPTION 'só a gestão do módulo abre ticket';
    END IF;
    SELECT s.id, s.nome INTO v_setor FROM public.setores s WHERE lower(s.nome) = lower(coalesce(nullif(trim(d->>'setor'), ''), 'Crédito'));
    IF v_setor.id IS NULL THEN RAISE EXCEPTION 'setor "%" não existe no portal', d->>'setor'; END IF;
    SELECT c.id INTO v_cat FROM public.ticket_categorias c WHERE c.setor_id = v_setor.id AND c.ativo AND lower(c.nome) = lower('Análise de Espólio') LIMIT 1;
    SELECT u.id INTO v_resp FROM public.usuarios u WHERE u.ativo AND lower(trim(u.nome)) = lower(trim(coalesce(d->>'responsavelNome', ''))) LIMIT 1;
    v_cnpj := regexp_replace(coalesce(d->'condominio'->>'cnpj', ''), '\D', '', 'g');
    IF length(v_cnpj) = 14 THEN
      SELECT c.id INTO v_cond FROM public.condominios c WHERE regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g') = v_cnpj LIMIT 1;
    END IF;
    v_prio   := CASE WHEN d->>'prioridade' IN ('baixa', 'media', 'alta', 'urgente') THEN d->>'prioridade' ELSE 'alta' END;
    v_titulo := left(coalesce(nullif(trim(d->>'titulo'), ''), 'Análise de espólio'), 300);
    SELECT u.nome INTO v_nome FROM public.usuarios u WHERE u.id = autor;

    INSERT INTO public.tickets (titulo, descricao, setor_id, categoria_id, prioridade, status, solicitante_id, responsavel_id, condominio_id, demanda_interna)
    VALUES (v_titulo, coalesce(d->>'descricao', ''), v_setor.id, v_cat, v_prio, 'novo', autor, v_resp, v_cond, true)
    RETURNING id INTO v_tid;

    INSERT INTO public.ticket_eventos (ticket_id, usuario_id, tipo, detalhe)
    VALUES (v_tid, autor, 'criado', jsonb_build_object('setor', v_setor.nome, 'interna', true, 'condominio', d->'condominio'->>'nome', 'prioridade', v_prio,
                                                      'origem', 'analise-de-espolio', 'protocolo', d->>'protocolo'));

    IF coalesce(d->'anexo'->>'base64', '') <> '' THEN
      v_pdf := decode(d->'anexo'->>'base64', 'base64');
      INSERT INTO public.ticket_anexos (ticket_id, nome, tipo, tamanho, conteudo, interno, enviado_por)
      VALUES (v_tid, left(coalesce(nullif(d->'anexo'->>'nome', ''), 'Ficha.pdf'), 200), 'application/pdf', length(v_pdf), v_pdf, false, autor);
    END IF;

    INSERT INTO public.notificacoes (usuario_id, ticket_id, tipo, titulo, texto)
    SELECT x.uid, v_tid, 'novo', 'Novo ticket para ' || v_setor.nome,
           coalesce(v_nome, 'Gestão') || ' abriu o ticket #' || v_tid || ' para ' || v_setor.nome || ' (interna): ' || v_titulo
    FROM (SELECT v_resp AS uid WHERE v_resp IS NOT NULL
          UNION
          SELECT m.usuario_id FROM public.setor_membros m JOIN public.usuarios u ON u.id = m.usuario_id
          WHERE v_resp IS NULL AND m.setor_id = v_setor.id AND m.lider AND u.ativo) x
    WHERE x.uid IS DISTINCT FROM autor;

    new.dados := (d - 'anexo') || jsonb_build_object('status', 'aberto', 'ticketId', v_tid, 'abertoEm', now(),
      'anexado', v_pdf IS NOT NULL, 'responsavelId', v_resp, 'setorId', v_setor.id);
  EXCEPTION WHEN others THEN
    new.dados := (d - 'anexo') || jsonb_build_object('status', 'erro', 'erro', sqlerrm);
  END;
  RETURN new;
END $function$;

CREATE OR REPLACE TRIGGER espolio_ticket BEFORE INSERT OR UPDATE ON public.documentos
  FOR EACH ROW EXECUTE FUNCTION public.espolio_ticket();

-- Para desfazer:
--   DROP TRIGGER IF EXISTS espolio_ticket ON public.documentos; DROP FUNCTION IF EXISTS public.espolio_ticket();
--   (a categoria pode ser desativada pelo portal)
