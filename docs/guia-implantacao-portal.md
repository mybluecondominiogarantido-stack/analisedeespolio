# Guia de implantação no portal MyBlue · Análise de Espólio

Este guia leva o módulo do repositório até o uso diário no portal. Cada passo diz quem faz e como conferir que deu certo.

## 1. O que já está pronto no banco do portal

Feito em 16/10/2026, com aval da coordenação de Cobrança. O SQL está em `docs/sql/carteira-e-modulo.sql`, com o bloco para desfazer.

| Item | Situação |
|---|---|
| Módulo cadastrado | `analise-de-espolio`, criado pela gestão no portal: setor Cobrança, adaptador `claude-db`, armazenamento compartilhado |
| Carteira de condomínios | Espelhada do cadastro do portal: 335 condomínios, 332 com assistente de crédito |
| Atualização da carteira | Automática: um gatilho no cadastro de condomínios refaz a cópia a cada inclusão, alteração ou exclusão |

Em 16/10/2026 também foi ligado o aviso no sino (seção 6). Nada além disso foi alterado no banco. Usuários, tickets, notificações e os demais módulos não foram tocados.

## 2. Publicar o arquivo do módulo

**Quem faz:** administrador do portal.

1. No repositório, rode `node build.js`. Ele gera `analise-espolio.html`, o único arquivo a subir.
2. Na administração de módulos do portal, abra **Análise de Espólio** e envie `analise-espolio.html` como nova versão, do mesmo jeito que é feito com o Comissionamento.
3. Confirme que a versão enviada ficou como a versão ativa do módulo.

**Como conferir:** abrindo o módulo pelo portal, o indicador no alto à direita mostra **"Base compartilhada · ao vivo"**. Se mostrar "Modo local", o arquivo foi aberto fora do portal.

## 3. Liberar o acesso e definir os papéis

O acesso funciona em duas camadas, com a mesma funcionalidade do módulo Comissões de Novos Condomínios.

1. **Portal libera a entrada.** O administrador libera o módulo, em Usuários e acessos, para quem vai usar: coordenação, assistentes de implantação e analistas de Cobrança.
2. **Gestão define o papel.** Cada pessoa aparece na aba **Acessos** do módulo depois de abri-lo uma vez. Ali a gestão marca os papéis de cada uma. Quem abre e ainda não tem papel vê o aviso "Você ainda não tem um papel neste módulo" até ser marcada.

| Papel | Quem | O que vê |
|---|---|---|
| Gestão | Coordenação | Dashboard, Solicitações, Fila de acompanhamento, Acessos, Configurações |
| Implantação | Assistentes de implantação | Solicitar análise, com o quadro de condomínios em implantação, e Minhas solicitações |
| Solicitante avulso | Analistas de Cobrança e demais | Solicitar análise, sem o quadro, e Minhas solicitações |

Quem tem mais de um papel vê a soma das abas. Uma solicitação da Implantação para um condomínio do quadro sai como implantação; qualquer outra sai como avulsa.

**Sem gestor definido.** Enquanto ninguém tiver o papel de Gestão marcado, todos que abrem o módulo veem todas as abas, com um aviso no topo. Quem tirar o próprio papel de Gestão recebe um pedido de confirmação.

**Situação em 16/10/2026.** No módulo publicado, a Beatriz Teixeira está como Gestão e a Mariana Nascimento aparece sem papel. Para a Mariana ter acesso de gestão, marque Gestão na linha dela.

**Nome na carteira.** Na mesma aba, ligue o login de cada assistente de crédito e analista ao nome que aparece no cadastro de condomínios. É isso que faz o ticket da ficha chegar à pessoa certa.

**Logins que faltam.** Hoje só existem no portal, dos possíveis solicitantes, a Camila Alencar (Cobrança) e a Chayanne Freitas (Crédito). O setor Implantação não tem ninguém cadastrado. Pelo cadastro de condomínios, precisam de login:

- **Analistas de Cobrança:** Eduardo Sousa, Larissa Matos, Mayara Freitas, Raissa Ribeiro, Thaina Souza.
- **Assistentes de crédito** (recebem o ticket da ficha): Evelyne Bezerra, Grazielly Soares, Jaiani Nogueira, Naiara Sousa, Sofia Matos. A Chayanne Freitas já tem.
- **Assistentes de implantação:** informar os nomes ao administrador.

**Como conferir:** cada pessoa liberada abre o módulo uma vez e aparece na aba Acessos com a data do último acesso. Depois de marcada, uma analista vê só "Solicitar análise" e "Minhas solicitações", e só a Implantação vê o quadro de condomínios em implantação.

## 4. Configurar o módulo

**Quem faz:** Beatriz, na aba Configurações.

1. **Carga inicial.** Em "Carga inicial", envie a planilha **base unificada** (Acompanhamento de Espólios + Controle de Verificação), depois de conferir as linhas marcadas em amarelo. Os condomínios entram na Fila de acompanhamento com as unidades, o status e o prazo contado da última verificação. Repetir a importação não duplica nada.
2. **Base do Power BI.** Envie o Excel do dia. Ela vale para toda a equipe até a próxima troca.
3. **Carteira.** Só conferir: deve mostrar 335 condomínios, "espelhada do cadastro de condomínios do portal".

O quadro de condomínios em implantação já começa em **agosto de 2026**: entram os de vigência no mês e os atrasados desde agosto. Janeiro a julho ficam de fora, pois já estão na planilha de controle.

**Como conferir:** a Fila de acompanhamento mostra 35 condomínios, quase todos vencidos, com o selo "completar". É esperado: a planilha não tinha titular nem CPF, e eles se completam na primeira reanálise.

## 5. Teste de aceite

Fazer uma vez, com dados reais, antes de anunciar para a equipe.

1. **Solicitação.** Uma analista envia uma solicitação de um condomínio real. Uma assistente de implantação confere se o quadro mostra os condomínios com vigência no mês e os atrasados. Na conta da Beatriz, a aba Solicitações mostra "1 nova" e o Dashboard mostra "Pendentes 1".
2. **Análise.** A Beatriz abre a solicitação, clica em "Iniciar análise", anexa o PDF do Vouch e conclui. A ficha baixa com o nome `AE-2026-0001 - Condomínio.pdf`.
3. **Retorno.** A analista vê a solicitação como "Concluída" em "Minhas solicitações" e baixa a mesma ficha.
4. **Fila.** O condomínio aparece na Fila de acompanhamento com prazo de 90 dias.
5. **Reanálise.** Na fila, selecione dois condomínios da carga inicial, clique em "Reanalisar selecionados" e envie os dois PDFs do Vouch. Cada um é identificado pelo cabeçalho e concluído separadamente.

## 6. Pendências com quem mantém o portal

O módulo funciona sem estes itens. Eles só completam a automação.

| Item | O que é preciso | Enquanto não existir |
|---|---|---|
| **Ticket da ficha** | Uma rota do portal que crie ticket pelo módulo, recebendo título, descrição, setor, responsável e condomínio, mais uma rota para anexar o PDF. O módulo chama `/api/tickets` e `/api/tickets/{id}/anexos`, e o caminho pode ser trocado em Configurações. | O botão "Copiar texto" deixa o ticket pronto para abrir à mão no portal. |

**Aviso no sino: aplicado em 16/10/2026.** O gatilho de `docs/sql/notificacoes-trigger.sql` avisa no sino quem tem o papel Gestão a cada solicitação nova, e avisa quem pediu quando a análise é concluída ou devolvida. Para desfazer, use o comando de reversão no topo do arquivo.

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
