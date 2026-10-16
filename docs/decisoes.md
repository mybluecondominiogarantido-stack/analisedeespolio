# Decisões alinhadas · Análise de Espólio

Registro do que foi decidido com a Coordenação de Cobrança (out/2026) para a versão 1 do módulo.

## Escopo e acesso
- O módulo pertence ao setor **Cobrança**. Somente a **coordenação de Cobrança** cria e conclui análises; não há atribuição a analistas. Quem mais tiver o módulo liberado só consulta.
- O campo "analista" da ficha é o remetente do e-mail de sinalização.

## Armazenamento
- Não publicar pelo Claude. O módulo roda no portal MyBlue com o adaptador `claude-db` (Supabase, projeto `myblue-portal`), como os módulos de Síndicos e Gestão de Viagens.
- Fora do portal, o módulo abre em modo local (só o navegador), com aviso.

## Entradas
- **PDF do Vouch é o único padrão** para inadimplência MyBlue. O Excel do Vouch é mais fácil de ler, mas não traz condomínio, CNPJ nem data de corte; o PDF traz, e é o arquivo que já vai para a pasta do condomínio. Leitor dedicado com conferência contra o total impresso.
- O Vouch não exporta a carteira agregada; cada condomínio gera seu PDF.
- **Toda linha de taxa conta igual**: arrecadação, 2º rateio e parcela de acordo. "Jurídico" e "novo vencimento" não alteram o resultado; ficam só como informação na evidência.

## Fluxo
- **Só espólio entra no acompanhamento.** Condomínios verificados sem espólio não são registrados no módulo; a planilha de controle serve apenas como carga inicial da fila.
- **Implantação**: um condomínio por vez, regras 1 a 5, base Preventivo.
- **Fila de acompanhamento**: prazo de **90 dias** a partir da data da análise, por condomínio; vencidos em vermelho no dashboard.
- **Reanálise do dia (lote)**: selecionar na fila, arrastar vários PDFs do Vouch, identificação do condomínio pelo cabeçalho (CNPJ, senão nome), unidades vêm da rodada anterior, revisão por exceção, **conclusão por condomínio**.
- **Fichas**: uma por condomínio, baixadas **uma a uma**, nome `AE-AAAA-NNNN - Condomínio.pdf`, salvas pela assistente de crédito na pasta do condomínio.
- **Protocolo** sequencial começando em **AE-2026-0001**.
- **Rodada concluída trava**; correção gera nova rodada.
- **Carga inicial** a partir da planilha "Controle de Verificação de Espólios": só os 35 condomínios com espólio (jan–jul/2026) entram na fila; unidades em "VÁRIAS" ficam marcadas para completar.
- **Resumo mensal** gerado no dashboard.
- **Dashboard** com quatro cartões, nesta ordem: total de espólios sinalizados (acumulado), análises do mês, pendentes (unidades com reanálise vencida), excluídas (acumulado).

## Saída do acompanhamento
- Exclusão da garantia (3+ taxas no Vouch em acompanhamento) ou **troca de titularidade concluída** (encerramento manual com motivo).
- Regra de saída por tempo ou por rodadas zeradas: **pendente de definição da política**.

## Pendências para fases seguintes
- Ligar a lista de condomínios do portal (tabela `condominios`, 335 cadastrados, com assistente de crédito responsável) ao módulo: depende de o portal expor essa tabela ao adaptador.
- Aviso automático à assistente de crédito ao concluir a rodada (portal já tem notificações).
- Fixtures anonimizadas para o leitor do Vouch (os PDFs reais não vão ao repositório).
