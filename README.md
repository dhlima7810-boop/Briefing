# Briefing Diário

Painel pessoal com o resumo da manhã (clima em Guarulhos, mercado, notícias, IA, geopolítica) e narração em voz (Alex e Dora).

Site: **https://dhlima7810-boop.github.io/Briefing/**

## Como funciona

Pense numa padaria que abre às 05:20: o forno (GitHub Actions) liga sozinho, o padeiro (Claude, pela API da Anthropic) pesquisa e escreve o briefing do dia, a voz é gravada na hora, e a vitrine (GitHub Pages) mostra o resultado.

| Peça | Arquivo | O que faz |
|---|---|---|
| Agendador | `.github/workflows/briefing.yml` | Roda de segunda a sexta às 05:20 (Brasília) ou manualmente |
| Redator | `gen/generate.py` | Chama o Claude com busca na web e grava `site/data/*.json` |
| Voz | `gen/voz_jarvis.py` | Gera `narration.json` e os MP3 com o Kokoro (sherpa-onnx) |
| Site | `site/` | Página estática (PWA) que lê os JSON e toca o áudio |

Regras de segurança:
- Se um grupo de dados falhar, os arquivos de ontem daquele grupo continuam no ar. O site nunca fica vazio.
- O áudio não é salvo no repositório: é gerado junto com os dados de cada execução. Se a voz falhar, o site sai sem narração, nunca com o áudio de ontem.

## Configuração (uma vez)

1. **Segredo da API**: Settings → Secrets and variables → Actions → New repository secret, nome `ANTHROPIC_API_KEY`. Defina também um limite mensal de gasto no console da Anthropic (Settings → Limits). Nunca cole a chave em chat ou em arquivo.
2. **Pages**: Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. **Primeira execução**: Actions → Briefing diário → Run workflow. Depois confira `site/data/meta.json` (campo `cost_usd_estimate`).

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
