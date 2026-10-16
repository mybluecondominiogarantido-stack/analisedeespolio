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
- **Avulso**: condomínio já com tempo de casa cujo espólio foi sinalizado pelos analistas de Cobrança. Mesmas regras 1 a 5 e base Preventivo, com "sem relatório anterior" marcado por padrão. Entra na fila como qualquer rodada.
- **Sem aba Nova análise**: toda análise nasce de uma solicitação ("Iniciar análise"). O que chega por e-mail ou telefone a gestão lança com "Registrar solicitação", em nome de quem pediu. O editor das quatro etapas abre como tela temporária e volta para a aba de origem.
- **Reanálise só dentro da Fila de acompanhamento**: em lote (vários PDFs) ou pelo botão "Nova reanálise" no histórico do condomínio. O tipo da rodada é fixo, definido pelo ponto de entrada.
- **Fila de acompanhamento**: prazo de **90 dias** a partir da data da análise, por condomínio; vencidos em vermelho no dashboard.
- **Fila de acompanhamento (reanálise em lote)**: selecionar na fila → botão "Reanalisar selecionados" pede os PDFs do Vouch → identificação do condomínio pelo cabeçalho (CNPJ, senão nome) → lista com um condomínio por linha (leitura, resultado, exceções) → "Revisar" abre os cartões das unidades → **conclusão e ficha por condomínio**. Unidades vêm da rodada anterior.
- **Fichas**: uma por condomínio, baixadas **uma a uma**, nome `AE-AAAA-NNNN - Condomínio.pdf`, salvas pela assistente de crédito na pasta do condomínio.
- **Protocolo** sequencial começando em **AE-2026-0001**.
- **Rodada concluída trava**; correção gera nova rodada.
- **Carga inicial** a partir da planilha "Controle de Verificação de Espólios": só os 35 condomínios com espólio (jan–jul/2026) entram na fila; unidades em "VÁRIAS" ficam marcadas para completar.
- **Resumo mensal** gerado no dashboard.
- **Sem aba de histórico**: o histórico de cada condomínio (rodadas, fichas e evolução das unidades) abre pelo nome na Fila de acompanhamento; os que saíram do acompanhamento ficam numa seção recolhida no fim da fila. Abas da gestão: Dashboard, Solicitações, Fila de acompanhamento, Configurações. Solicitante: Solicitar análise e Minhas solicitações.
- **Dashboard** com quatro cartões, nesta ordem: espólios sinalizados (acumulado), análises do mês, pendentes (unidades com reanálise vencida), excluídas (acumulado).

## Solicitações de análise (out/2026)
- **Acessos, no modelo do Comissões de Novos Condomínios**: o portal libera a entrada; cada pessoa aparece na aba Acessos ao abrir o módulo (último acesso registrado) e a gestão marca os papéis Gestão ou Solicitante, mais o nome dela na carteira. Sem papel, a pessoa vê "Acesso registrado". Enquanto ninguém tiver Gestão marcada, Beatriz Teixeira (coordenação de Cobrança) e Mariana Nascimento (coordenação de Crédito) valem como gestão; a primeira a configurar fica fixada.
- **A solicitação substitui o e-mail de sinalização**: condomínio, unidades (bloco-unidade, titular, CPF) e observações. O tipo (implantação ou avulso) vem da carteira: contrato iniciado há até 120 dias é implantação; a gestão pode corrigir ao iniciar a análise. Só texto, sem anexos. Sem prazo de atendimento; mostra há quantos dias espera.
- **Verificação da implantação**: a carteira do portal (início de contrato) gera a lista de condomínios implantados a verificar; acumula até alguém marcar "sem espólio" ou enviar a solicitação. "Assumir" evita duas pessoas no mesmo condomínio. Idade em dias serve de SLA.
- **Ciclo**: nova → vista (gestão abriu) → em análise (rodada criada já preenchida) → concluída (protocolo e resultado por unidade; o solicitante baixa a ficha para ciência) ou devolvida (com motivo).
- **Ticket por solicitação**: ao concluir, "Abrir ticket" para quem guarda a ficha na pasta do CPD: a assistente de crédito definida no condomínio; se não houver, a assistente de implantação que solicitou; se nenhuma, a gestão escolhe. Depende de rota do portal (configurável, padrão `/api/tickets`); sem rota, o texto fica pronto para copiar.
- **Dashboard**: "Pendentes" passa a ser solicitações ainda não vistas.
- **Avisos no sino**: gatilho no banco do portal escrito em `docs/sql/notificacoes-trigger.sql`, **não aplicado** até aval.

## Saída do acompanhamento
- Exclusão da garantia (3+ taxas no Vouch em acompanhamento) ou **troca de titularidade concluída** (encerramento manual com motivo).
- Regra de saída por tempo ou por rodadas zeradas: **pendente de definição da política**.

## Banco do portal (16/10/2026)
- Módulo `analise-de-espolio` cadastrado e **carteira espelhada** de `public.condominios` no documento `carteira/atual`, com gatilho que refaz a cópia a cada alteração do cadastro (`docs/sql/carteira-e-modulo.sql`, aplicado com aval).
- Sem cartão de exportação de dados: tudo fica na base do portal.
- Guia de implantação: `docs/guia-implantacao-portal.md`.

## Pendências para fases seguintes
- Aviso automático à assistente de crédito ao concluir a rodada (portal já tem notificações).
- Fixtures anonimizadas para o leitor do Vouch (os PDFs reais não vão ao repositório).
