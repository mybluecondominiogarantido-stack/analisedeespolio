# Decisões alinhadas · Análise de Espólio

Registro do que foi decidido com a Coordenação de Cobrança (out/2026) para a versão 1 do módulo.

## Escopo e acesso
- O módulo pertence ao setor **Cobrança**. Somente a **coordenação de Cobrança** cria e conclui análises; não há atribuição a analistas. Quem mais tiver o módulo liberado só consulta.
- O campo "analista" da ficha é o remetente do e-mail de sinalização.

## Armazenamento
- Não publicar pelo Claude. O módulo roda no portal MyBlue com o adaptador `claude-db` (Supabase, projeto `myblue-portal`), como os módulos de Síndicos e Gestão de Viagens.
- Fora do portal, o módulo abre em modo local (só o navegador), com aviso e todas as abas liberadas.

## Entradas
- **PDF do Vouch é o único padrão** para inadimplência MyBlue. O Excel do Vouch é mais fácil de ler, mas não traz condomínio, CNPJ nem data de corte; o PDF traz, e é o arquivo que já vai para a pasta do condomínio. Leitor dedicado com conferência contra o total impresso.
- O Vouch não exporta a carteira agregada; cada condomínio gera seu PDF.
- **Toda linha de taxa conta igual**: arrecadação, 2º rateio e parcela de acordo. "Jurídico" e "novo vencimento" não alteram o resultado; ficam só como informação na evidência.

## Fluxo
- **Só espólio entra no acompanhamento.** Condomínios verificados sem espólio não são registrados no módulo; a planilha de controle serve apenas como carga inicial da fila.
- **Implantação**: um condomínio por vez, regras 1 a 5, base Preventivo.
- **Avulso**: condomínio fora do quadro de implantação cujo espólio foi sinalizado. Mesmas regras 1 a 5 e base Preventivo, com "sem relatório anterior" marcado por padrão (a confirmar com a coordenação). Entra na fila como qualquer rodada.
- **Sem aba Nova análise**: toda análise nasce de uma solicitação ("Iniciar análise"). O que chega por e-mail ou telefone a gestão lança com "Registrar solicitação", em nome de quem pediu. O editor das quatro etapas abre como tela temporária e volta para a aba de origem.
- **Reanálise só dentro da Fila de acompanhamento**: em lote (vários PDFs) ou pelo botão "Nova reanálise" no histórico do condomínio. O tipo da rodada é fixo, definido pelo ponto de entrada.
- **Fila de acompanhamento**: prazo de **90 dias** a partir da data da análise, por condomínio; vencidos em vermelho no dashboard.
- **Fila de acompanhamento (reanálise em lote)**: selecionar na fila → botão "Reanalisar selecionados" pede os PDFs do Vouch → identificação do condomínio pelo cabeçalho (CNPJ, senão nome) → lista com um condomínio por linha (leitura, resultado, exceções) → "Revisar" abre os cartões das unidades → **conclusão e ficha por condomínio**. Unidades vêm da rodada anterior.
- **Ficha só baixa sozinha quando há exclusão da garantia** (serve para formalizar a exclusão). Análise sem exclusão conclui sem baixar; a ficha fica disponível em "Baixar ficha".
- **Fichas**: uma por condomínio, baixadas **uma a uma**, nome `AE-AAAA-NNNN - Condomínio.pdf`, salvas pela assistente de crédito na pasta do condomínio.
- **Protocolo** sequencial começando em **AE-2026-0001**. Nasce **na solicitação** e acompanha a análise até a ficha; solicitações excluídas ou devolvidas deixam o número sem uso. Reanálises da fila (sem solicitação) ganham o número na conclusão. Ficha baixada antes da conclusão sai como "RASCUNHO AE-…".
- **Rodada concluída trava**; correção gera nova rodada.
- **Exclusão (só gestão)**: rascunho de análise ("Excluir rascunho" no editor; a solicitação ligada volta para "vista") e solicitação ainda não concluída ("Excluir" na solicitação, leva o rascunho junto). Rodada e solicitação concluídas não se excluem. Cada exclusão fica no histórico de ações.
- **Carga inicial pela base unificada** (Acompanhamento de Espólios + Controle de Verificação, uma linha por unidade com CNPJ): um condomínio por rodada de carga, ligado à carteira pelo CNPJ; data da análise = última verificação mais recente; excluídas entram excluídas; o débito anterior conferido na época fica registrado na unidade. A planilha de Controle sozinha continua aceita.
- **Carga inicial** (formato antigo) a partir da planilha "Controle de Verificação de Espólios": só os 35 condomínios com espólio (jan–jul/2026) entram na fila; unidades em "VÁRIAS" ficam marcadas para completar.
- **Resumo mensal** gerado no dashboard.
- **Sem aba de histórico**: o histórico de cada condomínio (rodadas, fichas e evolução das unidades) abre pelo nome na Fila de acompanhamento; os que saíram do acompanhamento ficam numa seção recolhida no fim da fila. Abas: ver "Abas por papel" abaixo.
- **Dashboard** com cinco cartões, nesta ordem: espólios sinalizados (acumulado), análises do mês, pendentes (solicitações não vistas + reanálises vencidas), excluídas (acumulado), implantação atrasada.

## Solicitações de análise (out/2026)
- **Acessos com a mesma funcionalidade do Comissões de Novos Condomínios**: o portal libera a entrada; cada pessoa aparece na aba Acessos ao abrir o módulo (último acesso registrado) e a gestão marca os papéis **Gestão**, **Implantação** e **Solicitante avulso**, mais o nome dela na carteira (liberado para todos). Enquanto ninguém tiver Gestão marcada, todos que abrem o módulo veem todas as abas, com aviso. Sem papel, a pessoa vê "Você ainda não tem um papel neste módulo". Tirar a própria gestão pede confirmação. Fora do portal todas as abas ficam liberadas.
- **Abas por papel**: Gestão vê Dashboard, Solicitações, Fila de acompanhamento, Acessos e Configurações. Implantação e Solicitante avulso veem Solicitar análise e Minhas solicitações. Quem tem mais de um papel vê a soma.
- **A solicitação substitui o e-mail de sinalização**: condomínio, unidades (bloco-unidade, titular, CPF) e observações. Só texto, sem anexos. Sem prazo de atendimento; mostra há quantos dias espera.
- **Tipo pelo papel de quem pede**: Implantação pedindo um condomínio do quadro de implantação = implantação; Implantação pedindo um condomínio fora do quadro = avulso; Solicitante avulso = sempre avulso. Na solicitação registrada pela gestão, a gestão escolhe o tipo. A gestão pode corrigir o tipo ao iniciar a análise.
- **Quadro de condomínios em implantação** (só o papel Implantação vê, em Solicitar análise): condomínios da carteira com vigência (início do contrato) no mês atual, mais os de meses anteriores ainda não verificados, acumulando como atrasados **a partir de agosto/2026**. Sai do quadro com "Sem espólio", com a solicitação enviada ou com rodada. "Assumir" evita duas pessoas no mesmo condomínio. Idade em dias serve de SLA. A aba Solicitações da gestão não mostra o quadro.
- **Ciclo**: nova → vista (gestão abriu) → em análise (rodada criada já preenchida) → concluída (protocolo e resultado por unidade; o solicitante baixa a ficha para ciência) ou devolvida (com motivo).
- **Ticket por solicitação**: ao concluir, "Abrir ticket" para quem guarda a ficha na pasta do CPD: a assistente de crédito definida no condomínio; se não houver, a assistente de implantação que solicitou; se nenhuma, a gestão escolhe. O ticket é criado no sistema de tickets do portal por uma regra no banco (ver "Ticket pelo banco"); "Copiar texto" continua disponível.
- **Dashboard**: "Pendentes" soma as solicitações ainda não vistas e as reanálises vencidas da fila. Quinto cartão, **Implantação atrasada**: número de condomínios do quadro de meses anteriores sem verificação, com os do mês aguardando.
- **Avisos no sino**: gatilho no banco do portal (`docs/sql/notificacoes-trigger.sql`), **aplicado em 16/10/2026** com aval. Solicitação nova avisa quem tem papel Gestão; concluída ou devolvida avisa quem pediu.

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

## Alinhamento com a Política de Análise de Espólio v1.1 (16/10/2026)
- **Manter descontinuado** (decisão da coordenação): toda unidade não excluída fica sob análise. A Política v1.1 ainda prevê Manter; precisa ser revisada.
- **Reanálise mantida**, com regra própria: só o Vouch entra; **3 taxas acumuladas** (em aberto) excluem. A Política v1.1 diz que a reanálise foi descontinuada; precisa ser revisada.
- **Sem relatório anterior**: continua como antes (a análise considera sem débito anterior); na ficha, a coluna mostra "Sem relatório anterior".
- **Justificativa na ficha** (item 8): uma linha curta embaixo do resultado (ex.: "3 no Vouch · BI negativo · 4 meses"), sem número de regra.
- **Decisão sobre exclusão**: coordenação (a Política fala em supervisor de cobrança).
- **Nome do arquivo**: "AE-AAAA-NNNN - Condomínio.pdf" (a Política fala em "Análise de Espólios - [condomínio]").
- **Saída da fila**: em espera.
- **3 taxas acumuladas** = 3 taxas em aberto no Vouch na data da reanálise (como já funciona).
- **Parcelas de acordo e coluna "Antecipado" do Vouch**: decisão adiada; segue contando toda linha de taxa.
- **Reanálise**: idade da garantia calculada pela carteira (início do contrato até a data da reanálise) e BI da base do dia, só como informação na ficha; o resultado continua só pelo Vouch.
- **Ficha**: a tabela de cima mostra o início do contrato (a idade fica no quadro de destaques); "Próxima reanálise" só aparece, na ficha e no ticket, se alguma unidade continua em acompanhamento.
- **Protocolo**: contador protegido no banco contra números repetidos (`docs/sql/protocolo-contador.sql`).
- **Extração das Unidades (Vouch) na solicitação**: a Implantação marca as unidades em espólio no sistema e gera a extração já filtrada; anexada no formulário, preenche condomínio (pelo CNPJ do cabeçalho), unidades, titulares (sem o prefixo "Espólio de") e CPF. Só esses campos são aproveitados; valores e contatos são descartados. A solicitação guarda o nome do arquivo de origem. A contagem de taxas da análise continua pelo PDF do Vouch. O arquivo de enriquecimento (óbito por nome) não é usado.
- **CPF na solicitação**: continua opcional.
- **Ficha sem as caixas de resumo** por resultado (repetiam a tabela e cresciam sem limite); observações em uma linha, só quando houver.
- **Leitura de PDFs**: unidades com palavra antes do número no Vouch (SALA 215, LOJA 01, GARAGEM 12); páginas giradas (relatórios em paisagem); relatório anterior no formato "Inadimplências consolidadas" por unidade (ex.: MSA Gestão).
- **Ficha com muitas unidades**: encolhe até 80% para caber em uma página; passando disso, segue para novas páginas sem cortar linhas (raro).
- **Relatório anterior no formato "Unidade: X - nome"** (ex.: "Contas a receber por condômino"): conta competências distintas por unidade; tarifa bancária, multa, juros e honorários soltos não contam; parcelas de acordo contam (decisão sobre acordos segue em aberto). "Espólio de" no nome não atrapalha o casamento.
- **Relatório não reconhecido não vira "sem débito"**: se nenhuma unidade for encontrada, o relatório conta como não lido (pendência 5.5) e o módulo avisa; leitura suspeita (1 devedor ou devedor com mais de 60 cobranças) também é sinalizada.
- **Planilha padrão do relatório anterior** (decisão de 17/10: caminho "a"): o módulo aceita Excel/CSV com Unidade | Titular | CPF | Descrição | Competência | Vencimento. Relatórios em formato desconhecido são convertidos para ela pelo projeto "Formatador de relatório anterior" no Claude (`docs/formatador-relatorio-anterior.md`); modelo em `docs/modelos/Relatorio_anterior_padrao.xlsx`. Mesmas regras de contagem dos PDFs.
- **Nomes dos resultados (18/10)**: "Sob análise · Preventivo" e "Sob análise · Reanálise" passam a aparecer como **"Mantida · em acompanhamento"**; "Excluir" continua. A etapa (1ª análise ou reanálise) fica no tipo de análise. Só muda a exibição: regras e dados gravados são os mesmos.
- **Ticket pelo banco (22/10)**: as tabelas de tickets do portal só aceitam gravação do próprio portal, e a rota `/api/tickets` não existe para o módulo; por isso o teste não abriu ticket. Com aval da coordenação, o módulo grava um pedido em `tickets/{id}` e a regra `espolio_ticket` (`docs/sql/ticket-pelo-modulo.sql`) cria o ticket no setor do pedido (padrão Crédito), categoria **"Análise de Espólio"**, **sem prazo**, demanda interna, com a ficha em PDF anexada e aviso no sino. Só a gestão abre ticket. Responsável = usuário do portal com o mesmo nome do campo "Para"; quem não tem login (hoje Evelyne, Grazielly, Naiara e Sofia) não recebe: o ticket fica na fila do setor, com aviso à liderança. O PDF sai do documento do módulo assim que o ticket é criado. O número do ticket fica gravado na análise.
