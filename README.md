# Briefing Diário

Painel pessoal com o resumo da manhã (clima em Guarulhos, mercado, notícias, IA, geopolítica) e narração em voz (Alex e Dora).

Site: **https://dhlima7810-boop.github.io/Briefing/**

## Como funciona

Pense numa padaria: o padeiro (Claude) faz o pão de madrugada, o entregador (GitHub Actions) grava a voz e a vitrine (GitHub Pages) mostra o resultado.

**Modo atual, sem API (custo zero além do plano Claude):** a tarefa agendada do claude.ai pesquisa às 05:34 e envia os `site/data/*.json` para este repositório. Esse envio dispara o workflow, que grava a voz e publica o site.

**Modo com API (opcional, futuro):** crie o segredo `ANTHROPIC_API_KEY` e descomente o `schedule` do workflow; aí o próprio GitHub chama o Claude com `gen/generate.py`.

| Peça | Arquivo | O que faz |
|---|---|---|
| Publicador | `.github/workflows/briefing.yml` | Roda quando chegam JSON novos em `site/data/` ou manualmente |
| Redator (modo API) | `gen/generate.py` | Chama o Claude com busca na web e grava `site/data/*.json` |
| Voz | `gen/voz_jarvis.py` | Gera `narration.json` e os MP3 com o Kokoro (sherpa-onnx) |
| Site | `site/` | Página estática (PWA) que lê os JSON e toca o áudio |

Regras de segurança:
- Se um grupo de dados falhar, os arquivos de ontem daquele grupo continuam no ar. O site nunca fica vazio.
- O áudio não é salvo no repositório: é gerado junto com os dados de cada execução. Se a voz falhar, o site sai sem narração, nunca com o áudio de ontem.

## Configuração (uma vez)

1. **(Só no modo API) Segredo da API**: Settings → Secrets and variables → Actions → New repository secret, nome `ANTHROPIC_API_KEY`. Defina também um limite mensal de gasto no console da Anthropic (Settings → Limits). Nunca cole a chave em chat ou em arquivo.
2. **Pages**: Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. **Primeira execução**: Actions → Briefing diário → Run workflow. No modo API, confira `site/data/meta.json` (campo `cost_usd_estimate`).

## Variáveis opcionais

| Variável | Padrão | Uso |
|---|---|---|
| `MODEL` | `claude-opus-5-5` | Modelo principal |
| `LIGHT_MODEL` | `claude-haiku-5-5` | Dicas do clima |

## Teste local sem gastar API

```bash
pip install anthropic jsonschema
DATA_DIR=/tmp/teste python3 gen/generate.py --mock site/data
```
