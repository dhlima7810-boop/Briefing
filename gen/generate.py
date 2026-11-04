#!/usr/bin/env python3
"""
Gera os dados do Briefing Diário com o Claude (API da Anthropic, busca e leitura na web).

Uso:
    python3 gen/generate.py                 # gera tudo e grava em site/data/
    python3 gen/generate.py --only ia       # só um grupo (clima, mercado, noticias, ia)
    python3 gen/generate.py --mock DIR      # não chama a API: usa os JSON de DIR (teste do encanamento)

Variáveis de ambiente:
    ANTHROPIC_API_KEY  chave da API (obrigatória fora do --mock)
    MODEL              modelo principal (padrão: claude-opus-5-5)
    LIGHT_MODEL        modelo da parte simples, as dicas do clima (padrão: claude-haiku-5-5)
    DATA_DIR           onde gravar (padrão: site/data)

Regra de ouro: se um grupo falhar, os arquivos de ontem daquele grupo ficam como estão.
O site nunca fica vazio.
"""
import argparse, concurrent.futures as cf, datetime as dt, json, os, re, sys, time, urllib.request
from zoneinfo import ZoneInfo

import jsonschema

TZ = ZoneInfo('America/Sao_Paulo')
NOW = dt.datetime.now(TZ)
MODEL = os.environ.get('MODEL', 'claude-opus-5-5')
LIGHT_MODEL = os.environ.get('LIGHT_MODEL', 'claude-haiku-5-5')
DATA_DIR = os.environ.get('DATA_DIR', 'site/data')

# US$ por milhão de tokens (entrada, saída), tabela oficial em novembro de 2026; busca = US$ 10 por mil.
PRICES = {'claude-opus-5-5': (4, 20), 'claude-sonnet-5-5': (2, 10), 'claude-haiku-5-5': (0.10, 0.50),
          'claude-fable-5-1': (10, 50)}
SEARCH_PRICE = 0.01

WEEKDAYS = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo']
SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

# ---------------------------------------------------------------- schemas
S = lambda **p: {'type': 'string', 'minLength': 1, **p}
N = {'type': 'number'}
def obj(props, req=None):
    return {'type': 'object', 'properties': props, 'required': req or list(props), 'additionalProperties': True}
def rows(item, lo, hi):
    return {'type': 'array', 'items': item, 'minItems': lo, 'maxItems': hi}

SCHEMAS = {
    'weather': rows(obj({'day_label': S(), 'date': S(pattern=r'^\d{4}-\d{2}-\d{2}$'), 'weekday': S(),
                         'condition': S(enum=['Sol', 'Poucas nuvens', 'Nublado', 'Chuva', 'Chuva forte']),
                         'high': N, 'low': N, 'precip': {'type': 'number', 'minimum': 0, 'maximum': 100}, 'tip': S()}), 6, 6),
    'market': rows(obj({'id': S(enum=['usd', 'ibov', 'btc', 'selic']), 'label': S(), 'value': S(), 'delta': S(),
                        'trend': S(enum=['up', 'down', 'flat']), 'note': S(), 'why': S(), 'source': S()}), 4, 4),
    'news': rows(obj({'id': S(), 'tag': S(), 'headline': S(), 'summary': S(), 'what': S(), 'why': S(), 'source': S(),
                      'date': S()}), 5, 5),
    'ai_news': rows(obj({'id': S(), 'kind': S(enum=['Manchete', 'Bastidores']), 'status': S(enum=['Confirmado', 'Reportado', 'Disputado']),
                         'actor': S(), 'headline': S(), 'summary': S(), 'detail': S(), 'apply': S(), 'source': S(), 'date': S(),
                         'url': S(pattern=r'^https://')}), 6, 14),
    'dossier': rows(obj({'block': S(enum=['A', 'B', 'C']), 'country': S(), 'title': S(), 'summary': S(),
                         'events': rows(obj({'date': S(), 'headline': S(), 'detail': S()}), 1, 4)}), 3, 3),
    'dossier_full': rows(obj({'order': {'type': 'integer', 'minimum': 1, 'maximum': 6}, 'section': S(), 'title': S(), 'body': S()}), 6, 6),
    'geopolitics': rows(obj({'title': S(), 'intro': S(), 'points': rows(obj({'heading': S(), 'body': S()}), 3, 3), 'conclusion': S()}), 1, 1),
    'ibov_trend': rows(obj({'label': S(), 'date': S(), 'points': N, 'note': S()}), 3, 6),
    'forces': rows(obj({'front': S(), 'asset': S(), 'effect': S(), 'note': S()}), 5, 8),
}

# ---------------------------------------------------------------- instructions
RULES = """REGRAS DE PESQUISA
- Abra e leia (web_fetch) cada página de onde tirar um fato; trecho de busca não é fonte. Prefira Reuters, BBC, AP, Bloomberg, Financial Times, InfoMoney, Valor, Banco Central, B3; para IA: anúncios oficiais, The Information, Axios, The Verge, TechCrunch, Reuters, Business Insider, WSJ, e resumos como The Neuron.
- Tudo do dia: mercado = último fechamento disponível, com a data; notícias = últimas 24 a 48 horas. Fato antigo só como contexto e com a data.
- Nada inventado. Dado não encontrado fica de fora. Gráfico só com pontos verificados.
- Separe fato de interpretação. Sem previsões de preço e sem recomendação de investimento. Política com tom equilibrado.
- Os textos serão lidos em voz alta pelo Jarvis: frases curtas (até 25 palavras), com vírgulas e pontos. Escreva em português do Brasil."""

SPEC = {
    'market': 'market — 4 linhas, ids "usd", "ibov", "btc", "selic": id, label ("Dólar (USD/BRL)", "Ibovespa", "Bitcoin", "Selic"), value (texto formatado, ex.: "R$ 5,444", "167.921,80 pts", "US$ 78.404", "13,75% a.a."), delta (ex.: "+1,05%", "-0,75%", "estável"), trend ("up", "down" ou "flat"), note (uma frase com a data do fechamento), why (2 a 4 frases com o motivo do movimento), source.',
    'ibov_trend': 'ibov_trend — 3 a 6 pontos verificados do Ibovespa que contem a história recente, em ordem cronológica: label, date (DD/MM/AAAA), points (número), note.',
    'forces': 'forces — 5 a 8 ligações: front (frente do noticiário), asset (ativo), effect ("sobe", "cai", "sobem", "perdem fluxo"…), note (motivo, uma frase).',
    'geopolitics': 'geopolitics — 1 linha: title, intro, points = 3 itens {heading ("1. …"), body}, conclusion (a leitura do dia).',
    'news': 'news — 5 linhas: id ("n1"…"n5"), tag (região: "Brasil", "Américas", "Oriente Médio", "Europa", "Ásia", "Tecnologia"…), headline, summary, what (o que aconteceu), why (por que importa), source, date (DD/MM/AAAA).',
    'dossier': 'dossier — 3 linhas: block ("A", "B", "C"), country ("EUA", "Brasil", "Análise"), title ("Bloco A — Trump, Irã e instrumentos executivos"; "Bloco B — Planalto em tensão diplomática com a Argentina"; "Bloco C — Leitura cruzada"), summary, events = 3 itens {date, headline, detail}. Se um tema não teve novidade hoje, diga isso e dê a data do último fato.',
    'dossier_full': 'dossier_full — 6 capítulos: order (1–6), section ("Sumário executivo", "Brasil", "Brasil e Argentina", "Estados Unidos e Irã", "Mercados", "O que observar"), title, body (um parágrafo corrido de 80 a 130 palavras).',
    'ai_news': 'ai_news — inteligência artificial, cerca de 6 manchetes e 5 bastidores: id ("a1"…, "b1"…), kind ("Manchete" ou "Bastidores"), status ("Confirmado", "Reportado" ou "Disputado"), actor, headline, summary, detail (2 a 3 frases), apply (como o Dheryck pode entender e aplicar isso), source (veículo; em bastidores, quem reportou), date (DD/MM/AAAA), url (https da página lida). Bastidores = "fofocas de corredor": furos, vazamentos, saídas e contratações, disputas internas, memorandos, o que circula e ainda não é oficial. Sempre diga quem reportou; fonte anônima é "Reportado"; versão contestada é "Disputado".',
}

GROUPS = {
    'mercado': {'sets': ['market', 'ibov_trend', 'forces', 'geopolitics'], 'searches': 14, 'fetches': 14,
                'focus': 'Mercado brasileiro e global (dólar, Ibovespa, Bitcoin, Selic) e a geopolítica financeira do dia: quais frentes do noticiário movem quais ativos.'},
    'noticias': {'sets': ['news', 'dossier', 'dossier_full'], 'searches': 14, 'fetches': 16,
                 'focus': '5 notícias internacionais do dia e o dossiê de poder: Casa Branca (Trump, Irã, ordens executivas) e Planalto (relação com a Argentina), com a leitura cruzada.'},
    'ia': {'sets': ['ai_news'], 'searches': 14, 'fetches': 16,
           'focus': 'Inteligência artificial: manchetes do dia e bastidores (fofocas de corredor) das empresas e pessoas do setor.'},
}

def today_line():
    return f"Hoje é {WEEKDAYS[NOW.weekday()].lower()}, {NOW.day} de {MONTHS[NOW.month - 1]} de {NOW.year}, {NOW:%H:%M} em Guarulhos (SP)."

def prompt_for(group, previous):
    g = GROUPS[group]
    specs = '\n'.join(f'{i + 1}. {SPEC[s]}' for i, s in enumerate(g['sets']))
    prev = json.dumps({s: previous.get(s) for s in g['sets']}, ensure_ascii=False)
    keys = ', '.join(f'"{s}"' for s in g['sets'])
    return f"""Você é o pesquisador do Briefing Diário do Dheryck (Guarulhos, SP). {today_line()}

TEMA DESTA PARTE: {g['focus']}

{RULES}

O QUE ENTREGAR (mantenha exatamente estes campos):
{specs}

Para continuidade, esta foi a edição anterior destes blocos (não repita como se fosse novo; use só como contexto):
{prev}

Pesquise agora. No fim, responda APENAS com um objeto JSON válido, dentro de um bloco ```json, com as chaves {keys}; cada chave contém a lista de objetos descrita acima. Nada de texto depois do bloco."""

# ---------------------------------------------------------------- API helpers
class Usage:
    """Soma o uso de todas as chamadas. Cache: escrita = 1,25x a entrada, leitura = 0,05x (0,1x no Haiku)."""
    def __init__(self): self.inp = self.out = self.searches = self.fetches = 0; self.by_model = {}
    def add(self, model, u):
        if not u: return
        base = u.input_tokens or 0
        cw = getattr(u, 'cache_creation_input_tokens', 0) or 0
        cr = getattr(u, 'cache_read_input_tokens', 0) or 0
        o = u.output_tokens or 0
        st = getattr(u, 'server_tool_use', None)
        s = (getattr(st, 'web_search_requests', 0) or 0) if st else 0
        f = (getattr(st, 'web_fetch_requests', 0) or 0) if st else 0
        self.inp += base + cw + cr; self.out += o; self.searches += s; self.fetches += f
        m = self.by_model.setdefault(model, [0, 0, 0, 0]); m[0] += base; m[1] += cw; m[2] += cr; m[3] += o
    def cost(self):
        c = 0.0
        for model, (base, cw, cr, o) in self.by_model.items():
            pi, po = PRICES.get(model, (4, 20))
            read = 0.1 if 'haiku' in model else 0.05
            c += (pi * (base + 1.25 * cw + read * cr) + po * o) / 1e6
        return round(c + self.searches * SEARCH_PRICE, 3)

USAGE = Usage()

def client():
    import anthropic
    return anthropic.Anthropic(max_retries=4, timeout=900)

def ask(c, model, messages, tools=None, max_tokens=16000, container=None):
    """One assistant turn, following pause_turn until the model finishes.

    With web_search/web_fetch 2026 versions the API runs dynamic filtering in a code-execution
    container; a paused turn is continued by resending the paused content as-is (no extra user
    message), with the same tools and the same container id. Returns (resp, msgs, container)."""
    msgs = list(messages)
    for _ in range(8):
        kw = dict(model=model, max_tokens=max_tokens, messages=msgs, cache_control={'type': 'ephemeral'})
        if tools: kw['tools'] = tools
        if container: kw['container'] = container
        with c.messages.stream(**kw) as st:
            resp = st.get_final_message()
        USAGE.add(model, resp.usage)
        ctr = getattr(resp, 'container', None)
        if ctr is not None and getattr(ctr, 'id', None): container = ctr.id
        if resp.stop_reason != 'pause_turn':
            return resp, msgs, container
        msgs = msgs + [{'role': 'assistant', 'content': resp.content}]
    raise RuntimeError('turno pausado demais (pause_turn 8 vezes seguidas)')

def text_of(resp):
    return ''.join(getattr(b, 'text', '') for b in resp.content if getattr(b, 'type', '') == 'text')

def extract_json(text):
    blocks = re.findall(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.S)
    cand = blocks[-1] if blocks else text[text.find('{'): text.rfind('}') + 1]
    return json.loads(cand)

def check(sets, obj_):
    errs = []
    for s in sets:
        if s not in obj_: errs.append(f'falta a chave "{s}"'); continue
        v = jsonschema.Draft202012Validator(SCHEMAS[s])
        for e in sorted(v.iter_errors(obj_[s]), key=lambda e: list(e.path))[:6]:
            errs.append(f'{s}{"/" + "/".join(map(str, e.path)) if e.path else ""}: {e.message[:160]}')
    return errs

# ---------------------------------------------------------------- groups
def run_group(c, group, previous, log):
    sets = GROUPS[group]['sets']
    tools = [
        {'type': 'web_search_20260318', 'name': 'web_search', 'max_uses': GROUPS[group]['searches'],
         'user_location': {'type': 'approximate', 'city': 'Guarulhos', 'region': 'São Paulo', 'country': 'BR', 'timezone': 'America/Sao_Paulo'}},
        {'type': 'web_fetch_20260318', 'name': 'web_fetch', 'max_uses': GROUPS[group]['fetches'], 'max_content_tokens': 9000},
    ]
    messages = [{'role': 'user', 'content': prompt_for(group, previous)}]
    resp, msgs, ctr = ask(c, MODEL, messages, tools)
    for attempt in range(3):
        try:
            data = extract_json(text_of(resp)); errs = check(sets, data)
        except Exception as e:
            data, errs = None, [f'JSON inválido: {e}']
        if not errs:
            return {s: data[s] for s in sets}
        if attempt == 2: break
        log(f'[{group}] formato com problemas ({len(errs)}): {errs[:3]}')
        msgs = msgs + [{'role': 'assistant', 'content': resp.content},
                       {'role': 'user', 'content': 'O JSON tem estes problemas:\n- ' + '\n- '.join(errs) +
                        '\nCorrija só o formato, sem pesquisar de novo, e responda apenas com o bloco ```json completo.'}]
        # same tools and container: the history holds server_tool_use / *_tool_result blocks
        resp, msgs, ctr = ask(c, MODEL, msgs, tools, container=ctr)
    raise RuntimeError(f'{group}: formato inválido depois de 2 correções')

def weather_codes(code, precip):
    if code in (95, 96, 99) or (code in (63, 65, 81, 82) and precip >= 70): return 'Chuva forte'
    if code >= 51: return 'Chuva'
    if code == 3 or code in (45, 48): return 'Nublado'
    if code in (1, 2): return 'Poucas nuvens'
    return 'Sol'

def run_weather(c, previous, log):
    url = ('https://api.open-meteo.com/v1/forecast?latitude=-23.4538&longitude=-46.5333'
           '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
           '&timezone=America%2FSao_Paulo&forecast_days=6')
    d = json.load(urllib.request.urlopen(url, timeout=30))['daily']
    out = []
    for i, day in enumerate(d['time']):
        date = dt.date.fromisoformat(day)
        p = int(round(d['precipitation_probability_max'][i] or 0))
        out.append({'day_label': 'Hoje' if i == 0 else 'Amanhã' if i == 1 else SHORT[date.weekday()],
                    'date': day, 'weekday': WEEKDAYS[date.weekday()],
                    'condition': weather_codes(int(d['weather_code'][i] or 0), p),
                    'high': int(round(d['temperature_2m_max'][i])), 'low': int(round(d['temperature_2m_min'][i])),
                    'precip': p, 'tip': ''})
    # dicas práticas escritas pelo Claude (modelo leve, sem busca)
    msg = ('Escreva uma dica prática curta (até 20 palavras, português do Brasil, tom acolhedor, para ser lida em voz alta) '
           'para cada dia desta previsão de Guarulhos. Responda só com um array JSON de 6 strings, na mesma ordem.\n' +
           json.dumps([{k: r[k] for k in ('weekday', 'condition', 'high', 'low', 'precip')} for r in out], ensure_ascii=False))
    try:
        resp, _, _ = ask(c, LIGHT_MODEL, [{'role': 'user', 'content': msg}], max_tokens=1500)
        t = text_of(resp); tips = json.loads(t[t.find('['): t.rfind(']') + 1])
        for r, tip in zip(out, tips): r['tip'] = str(tip).strip()
    except Exception as e:
        log(f'[clima] dicas pelo modelo falharam ({e}); usando dicas padrão')
    for r in out:
        if not r['tip']:
            r['tip'] = ('Leve guarda-chuva.' if r['precip'] >= 50 else 'Dia quente, beba bastante água.' if r['high'] >= 30
                        else 'Leve um casaco para a noite.' if r['low'] <= 15 else 'Tempo tranquilo para sair.')
    errs = check(['weather'], {'weather': out})
    if errs: raise RuntimeError('clima: ' + '; '.join(errs))
    return {'weather': out}

# ---------------------------------------------------------------- main
def load_previous():
    prev = {}
    for s in SCHEMAS:
        p = os.path.join(DATA_DIR, s + '.json')
        if os.path.exists(p):
            try: prev[s] = json.load(open(p, encoding='utf-8'))
            except Exception: pass
    return prev

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', choices=['clima'] + list(GROUPS))
    ap.add_argument('--mock')
    a = ap.parse_args()
    os.makedirs(DATA_DIR, exist_ok=True)
    previous = load_previous()
    log = lambda m: print(f'{dt.datetime.now(TZ):%H:%M:%S} {m}', flush=True)
    jobs = ['clima'] + list(GROUPS) if not a.only else [a.only]
    results, failed = {}, []

    if a.mock:
        for g in jobs:
            sets = ['weather'] if g == 'clima' else GROUPS[g]['sets']
            data = {s: json.load(open(os.path.join(a.mock, s + '.json'), encoding='utf-8')) for s in sets}
            errs = check(sets, data)
            if errs: failed.append(g); log(f'[{g}] mock inválido: {errs[:3]}')
            else: results.update(data)
    else:
        if not os.environ.get('ANTHROPIC_API_KEY'): sys.exit('Falta ANTHROPIC_API_KEY')
        c = client()
        def job(g):
            t0 = time.time()
            r = run_weather(c, previous, log) if g == 'clima' else run_group(c, g, previous, log)
            log(f'[{g}] ok em {time.time() - t0:.0f}s')
            return r
        with cf.ThreadPoolExecutor(max_workers=4) as ex:
            futs = {ex.submit(job, g): g for g in jobs}
            for f in cf.as_completed(futs):
                g = futs[f]
                try: results.update(f.result())
                except Exception as e: failed.append(g); log(f'[{g}] FALHOU: {e} (mantenho os dados anteriores)')

    for s, rows_ in results.items():
        p = os.path.join(DATA_DIR, s + '.json')
        json.dump(rows_, open(p + '.tmp', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        os.replace(p + '.tmp', p)
    meta = {'generated_at': NOW.isoformat(timespec='seconds'), 'model': MODEL, 'updated': sorted(results),
            'failed_groups': failed, 'tokens_in': USAGE.inp, 'tokens_out': USAGE.out, 'searches': USAGE.searches, 'fetches': USAGE.fetches,
            'cost_usd_estimate': USAGE.cost()}
    json.dump(meta, open(os.path.join(DATA_DIR, 'meta.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    log(f'pronto: {len(results)} datasets, falhas: {failed or "nenhuma"}, custo estimado US$ {meta["cost_usd_estimate"]}')
    # sinaliza para o workflow: a voz só é refeita se algo mudou
    if os.environ.get('GITHUB_OUTPUT'):
        open(os.environ['GITHUB_OUTPUT'], 'a').write(f'updated={len(results)}\nfailed={",".join(failed)}\n')
    sys.exit(2 if len(failed) == len(jobs) else 0)

if __name__ == '__main__':
    main()
