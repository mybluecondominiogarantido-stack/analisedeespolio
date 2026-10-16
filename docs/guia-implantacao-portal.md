# Guia de implantação no portal MyBlue · Análise de Espólio

Este guia leva o módulo do repositório até o uso diário no portal. Cada passo diz quem faz e como conferir que deu certo.

## 1. O que já está pronto no banco do portal

Feito em 16/10/2026, com aval da coordenação de Cobrança. O SQL está em `docs/sql/carteira-e-modulo.sql`, com o bloco para desfazer.

| Item | Situação |
|---|---|
| Módulo cadastrado | `analise-espolio`, setor Cobrança, adaptador `claude-db`, armazenamento compartilhado, ainda **sem versão** e **sem ninguém liberado** |
| Carteira de condomínios | Espelhada do cadastro do portal: 335 condomínios, 332 com assistente de crédito |
| Atualização da carteira | Automática: um gatilho no cadastro de condomínios refaz a cópia a cada inclusão, alteração ou exclusão |

Nada além disso foi alterado no banco. Usuários, tickets, notificações e os demais módulos não foram tocados.

## 2. Publicar o arquivo do módulo

**Quem faz:** administrador do portal.

1. No repositório, rode `node build.js`. Ele gera `analise-espolio.html`, o único arquivo a subir.
2. Na administração de módulos do portal, abra **Análise de Espólio** e envie `analise-espolio.html` como nova versão, do mesmo jeito que é feito com o Comissionamento.
3. Confirme que a versão enviada ficou como a versão ativa do módulo.

**Como conferir:** abrindo o módulo pelo portal, o indicador no alto à direita mostra **"Base compartilhada · ao vivo"**. Se mostrar "Modo local", o arquivo foi aberto fora do portal.

## 3. Liberar o acesso

**Quem faz:** administrador do portal.

O módulo decide sozinho o que cada pessoa vê. Basta liberar quem deve entrar.

| Perfil | Quem | O que vê |
|---|---|---|
| Gestão (coordenação) | Beatriz Teixeira e Mariana Nascimento | Dashboard, Solicitações, Fila de acompanhamento, Configurações |
| Solicitante | Assistentes de implantação e analistas de Cobrança | Solicitar análise e Minhas solicitações |

**Atenção, logins que faltam.** Hoje só existem no portal, dos possíveis solicitantes, a Camila Alencar (Cobrança) e a Chayanne Freitas (Crédito). O setor Implantação não tem ninguém cadastrado. Pelo cadastro de condomínios, os nomes que precisam de login são:

- **Analistas de Cobrança:** Eduardo Sousa, Larissa Matos, Mayara Freitas, Raissa Ribeiro, Thaina Souza.
- **Assistentes de crédito** (recebem o ticket da ficha): Evelyne Bezerra, Grazielly Soares, Jaiani Nogueira, Naiara Sousa, Sofia Matos. A Chayanne Freitas já tem.
- **Assistentes de implantação:** informar os nomes ao administrador.

O nome do login deve ser igual ao do cadastro de condomínios, sem o ramal. É assim que o módulo encontra a responsável de cada condomínio.

**Como conferir:** a Beatriz e a Mariana entram e veem quatro abas. Uma analista entra e vê só "Solicitar análise" e "Minhas solicitações".

## 4. Configurar o módulo

**Quem faz:** Beatriz, na aba Configurações.

1. **Gestão e perfis.** A lista já começa com Beatriz Teixeira e Mariana Nascimento. Cada uma pode clicar em "Adicionar a mim" para fixar o próprio login. Inclua outra pessoa só se ela também for conduzir análises.
2. **Verificar implantações a partir de.** Escolha **agosto de 2026**. A planilha de controle já cobre janeiro a julho, e sem esse corte esses meses voltariam como pendentes.
3. **Carga inicial.** Em "Carga inicial · planilha de controle", envie `Controle_de_Verificacao_de_Espolios.xlsx` uma única vez. Os 35 condomínios com espólio entram na Fila de acompanhamento. Repetir a importação não duplica nada.
4. **Base do Power BI.** Envie o Excel do dia. Ela vale para toda a equipe até a próxima troca.
5. **Carteira.** Só conferir: deve mostrar 335 condomínios, "espelhada do cadastro de condomínios do portal".

**Como conferir:** a Fila de acompanhamento mostra 35 condomínios, quase todos vencidos, com o selo "completar". É esperado: a planilha não tinha titular nem CPF, e eles se completam na primeira reanálise.

## 5. Teste de aceite

Fazer uma vez, com dados reais, antes de anunciar para a equipe.

1. **Solicitação.** Uma analista envia uma solicitação de um condomínio real. Na conta da Beatriz, a aba Solicitações mostra "1 nova" e o Dashboard mostra "Pendentes 1".
2. **Análise.** A Beatriz abre a solicitação, clica em "Iniciar análise", anexa o PDF do Vouch e conclui. A ficha baixa com o nome `AE-2026-0001 - Condomínio.pdf`.
3. **Retorno.** A analista vê a solicitação como "Concluída" em "Minhas solicitações" e baixa a mesma ficha.
4. **Fila.** O condomínio aparece na Fila de acompanhamento com prazo de 90 dias.
5. **Reanálise.** Na fila, selecione dois condomínios da carga inicial, clique em "Reanalisar selecionados" e envie os dois PDFs do Vouch. Cada um é identificado pelo cabeçalho e concluído separadamente.

## 6. Pendências com quem mantém o portal

O módulo funciona sem estes itens. Eles só completam a automação.

| Item | O que é preciso | Enquanto não existir |
|---|---|---|
| **Ticket da ficha** | Uma rota do portal que crie ticket pelo módulo, recebendo título, descrição, setor, responsável e condomínio, mais uma rota para anexar o PDF. O módulo chama `/api/tickets` e `/api/tickets/{id}/anexos`, e o caminho pode ser trocado em Configurações. | O botão "Copiar texto" deixa o ticket pronto para abrir à mão no portal. |
| **Aviso no sino** | Aplicar `docs/sql/notificacoes-trigger.sql`. Avisa a gestão a cada solicitação nova e avisa quem pediu quando a análise é concluída ou devolvida. | A Beatriz acompanha pelo contador da aba Solicitações e pelo cartão Pendentes. |

O aviso no sino é uma alteração no banco e **ainda não foi aplicado**: depende de aval.

## 7. Onde ficam os dados

Tudo fica na base do portal, na área do próprio módulo. Não há exportação manual nem arquivo local.

| Dado | Onde |
|---|---|
| Solicitações, rodadas, fichas e evidências dos PDFs | Base compartilhada do módulo |
| Base do BI e configurações | Base compartilhada do módulo |
| Histórico de ações, com quem fez e quando | Base compartilhada do módulo |
| Carteira | Cópia automática do cadastro de condomínios |

## 8. Se precisar desfazer

- **Tirar o módulo do ar:** desativar o módulo ou remover as permissões no portal. Os dados ficam guardados.
- **Desfazer o que foi feito no banco:** bloco "REVERTER" no fim de `docs/sql/carteira-e-modulo.sql`.
