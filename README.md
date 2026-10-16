# Análise de Espólio · MyBlue

Módulo do portal MyBlue para a Coordenação de Cobrança: análise de implantação de espólios, fila de acompanhamento com prazo de 90 dias e histórico por condomínio, reanálise em lote e ficha em PDF por condomínio.

## Arquivos

| Caminho | O que é |
|---|---|
| `analise-espolio.html` | **Arquivo único para subir no portal** (gerado por `build.js`, não edite à mão) |
| `src/` | Fonte do módulo: `01-head.html` (CSS), `02-body.html` (marcação), `10…90-*.js` (lógica) e `logo.b64` |
| `build.js` | Monta `analise-espolio.html` a partir de `src/` (`node build.js`) |
| `test/leitor-vouch.js` | Testa o leitor do relatório do Vouch contra PDFs reais de uma pasta local |
| `test/e2e.js` | Teste de ponta a ponta em Chromium headless, em modo local |
| `docs/fluxograma-analise-espolio.html` | Fluxograma do processo |
| `docs/mockup-analise-espolio.html` | Mockup aprovado do layout |
| `docs/decisoes.md` | Decisões alinhadas com a coordenação |

## Como publicar no portal

1. `node build.js` gera `analise-espolio.html`.
2. No portal MyBlue, cadastrar (ou atualizar) o módulo com:
   - slug `analise-espolio`, setor **Cobrança**, armazenamento **compartilhado**, adaptador **`claude-db`**, fonte de dados **interno**;
   - subir `analise-espolio.html` como nova versão em `modulo_versoes`;
   - liberar a permissão só para a coordenação de Cobrança.
3. O módulo usa `window.claude.use('db')` e `use('user')`, como o módulo de Síndicos. Fora do portal ele abre em **modo local** (localStorage) com aviso, útil para testes.

Bibliotecas externas (cdnjs): pdf.js 3.11.174, SheetJS 0.18.5 e html2pdf.js 0.10.1.

## Dados (coleções em `documentos`)

| Coleção | Conteúdo |
|---|---|
| `rodadas` | Uma por análise: condomínio, tipo, data, protocolo, unidades (com contagens, casamento, resultado, regra, ajuste e situação), status, próxima reanálise |
| `evidencias/{rodadaId}` | Texto extraído dos PDFs e devedores lidos |
| `bi_base/atual` | Base do dia do Power BI, compartilhada |
| `meta/estado` | Sequência do protocolo por ano (`AE-AAAA-NNNN`) |
| `historico` | Log de ações (conclusão, ficha, carga, base do BI) |

A fila de acompanhamento é derivada: última rodada concluída de cada condomínio, unidades ativas (não excluídas, não encerradas), prazo = data da análise + 90 dias.

## Entradas

- **Vouch**: PDF "Relatório de Inadimplências - Consolidado". Leitor dedicado (`lerVouch`) com conferência contra a linha "Total (N taxas em M unidades)" impressa no relatório. Toda linha de taxa conta igual.
- **E-mail de sinalização**: PDF do e-mail (tabela unidade | CPF | nome, blocos rotulados ou linhas soltas com CPF).
- **Inadimplência anterior**: PDF da administradora anterior, leitor heurístico.
- **Base do BI**: Excel/CSV do dia com Condomínio, Idade (meses) e Resultado.
- **Planilha de controle** ("Controle de Verificação de Espólios", abas mensais): carga inicial da fila, só os condomínios marcados com espólio.

## Testes

Os PDFs reais contêm dados pessoais e **não** ficam no repositório. Coloque-os numa pasta local, junto com as bibliotecas baixadas (a rede do CI não alcança a CDN), e rode:

```
node test/leitor-vouch.js <pasta-pdfs> <pasta-libs>
node test/e2e.js <pasta-pdfs> <pasta-libs> <Controle_de_Verificacao_de_Espolios.xlsx> [pasta-screenshots]
```

Libs esperadas na pasta: `pdf.min.js`, `pdf.worker.min.js` (pdfjs-dist 3.11.174), `xlsx.full.min.js` (0.18.5), `html2pdf.bundle.min.js` (0.10.1). Requer Playwright (`PW_PATH` aponta para o pacote) e Chromium (`CHROMIUM`).
