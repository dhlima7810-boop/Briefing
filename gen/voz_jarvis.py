#!/usr/bin/env python3
"""Jarvis neural narration for the Briefing Diario dashboard.

Reads the day's dataset JSON files, writes the narration script (narration.json) and the
narrated audio for each voice (voice_alex.json, voice_dora.json). Every unit of speech has a
key the dashboard page knows how to highlight.

Usage: python3 voz_jarvis.py <data_dir> <kokoro_dir> <out_dir>
  data_dir   holds weather.json market.json news.json ai_news.json dossier.json
             dossier_full.json geopolitics.json forces.json
  kokoro_dir is the unpacked kokoro-multi-lang-v1_0 model from sherpa-onnx
Needs: pip install sherpa-onnx soundfile espeakng-loader phonemizer-fork ; ffmpeg on PATH.
"""
import base64, json, os, re, subprocess, sys, tempfile
import numpy as np

VOICES = {'alex': 43, 'dora': 42}          # Kokoro v1.0: pm_alex (male), pf_dora (female)
SPEED = 0.93
SENTENCE_GAP = 0.42                         # seconds of silence between sentences
MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
MON3 = {m[:3]: i for i, m in enumerate(MONTHS)}
WEEKDAYS = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo']

# words the Portuguese phonemizer would say wrong, spelled the way a Brazilian says them
SAY = [
    (r'\bbriefing\b', 'brífin'), (r'\bBriefing\b', 'Brífin'), (r'\bDheryck\b', 'Dérik'), (r'\bZyra\b', 'Záira'),
    (r'\bOpenAI\b', 'Ópen Ei Ai'), (r'\bChatGPT\b', 'Tchat G P T'), (r'\bGPT\b', 'G P T'),
    (r'\bDeepMind\b', 'Dip Maind'), (r'\bGoogle\b', 'Gúgou'), (r'\bGitHub\b', 'Guit Rãb'),
    (r'\bApple\b', 'Épou'), (r'\bAnthropic\b', 'Ântropic'), (r'\bClaude\b', 'Clód'),
    (r'\bGemini\b', 'Djêmini'), (r'\bBitcoin\b', 'Bitcóin'), (r'\bEthereum\b', 'Etérium'),
    (r'\bNasdaq\b', 'Násdac'), (r'\bTrump\b', 'Trâmp'), (r'\bMilei\b', 'Milêi'),
    (r'\bReuters\b', 'Róiters'), (r'\bBloomberg\b', 'Blúmberg'), (r'\bWall Street Journal\b', 'Uól Strit Djârnal'),
    (r'\bWashington Post\b', 'Uóchinton Pôust'), (r'\bWashington\b', 'Uóchinton'), (r'\bBusiness Insider\b', 'Bízness Insáider'),
    (r'\bThe Information\b', 'Di Informêichon'), (r'\bThe Register\b', 'Di Réjister'), (r'\bThe Verge\b', 'Di Vêrdj'),
    (r'\bTechCrunch\b', 'Téc Crântch'), (r'\bBig Technology\b', 'Big Tecnólodji'), (r'\bCathedral\b', 'Catídral'),
    (r'\bRevolut\b', 'Révolut'), (r'\bCohere\b', 'Corír'), (r'\bBrent\b', 'Brént'), (r'\bWhite House\b', 'Uáit Ráus'),
    (r'\bSiri\b', 'Síri'), (r'\biOS\b', 'ai ó és'), (r'\bCEO\b', 'C E O'), (r'\bIPO\b', 'I P O'), (r'\bSEC\b', 'S E C'),
    (r'\bDOGE\b', 'Dôudji'), (r'\bIA\b', 'I A'), (r'\bAI\b', 'Ei Ai'), (r'\bEUA\b', 'Estados Unidos'), (r'\bBTC\b', 'Bitcóin'),
    (r'\bB3\b', 'B três'), (r'\bCopom\b', 'Cópom'), (r'\bpts\b', 'pontos'), (r'\bp\.p\.', 'pontos percentuais'),
]

def speakable(s):
    s = str(s or '')
    s = re.sub(r'(\d{1,2})/(\d{1,2})/(\d{4})', lambda m: f"{int(m[1])} de {MONTHS[int(m[2]) - 1]} de {m[3]}" if 1 <= int(m[2]) <= 12 else m[0], s)
    s = re.sub(r'(\d{1,2})/(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)/(\d{4})', lambda m: f"{int(m[1])} de {MONTHS[MON3[m[2].lower()]]} de {m[3]}", s, flags=re.I)
    s = re.sub(r'\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)/(\d{4})', lambda m: f"{MONTHS[MON3[m[1].lower()]]} de {m[2]}", s, flags=re.I)
    s = re.sub(r'\b(\d{1,2})/(\d{1,2})\b', lambda m: f"{int(m[1])} de {MONTHS[int(m[2]) - 1]}" if 1 <= int(m[2]) <= 12 else m[0], s)
    s = re.sub(r'(\d{4})-(\d{2})-(\d{2})', lambda m: f"{int(m[3])} de {MONTHS[int(m[2]) - 1]}", s)
    s = re.sub(r'US\$\s?(\d[\d.]*(?:,\d+)?)\s?(bi|bilhões|bilhão)\b', r'\1 bilhões de dólares', s)
    s = re.sub(r'US\$\s?(\d[\d.]*(?:,\d+)?)\s?(mi|milhões|milhão)\b', r'\1 milhões de dólares', s)
    s = re.sub(r'US\$\s?(\d[\d.]*(?:,\d+)?)', r'\1 dólares', s)
    s = re.sub(r'R\$\s?(\d[\d.]*(?:,\d+)?)\s?(bi|bilhões)\b', r'\1 bilhões de reais', s)
    s = re.sub(r'R\$\s?(\d[\d.]*(?:,\d+)?)', r'\1 reais', s)
    s = re.sub(r'\s*\((?:[A-Z]{2,}[/ -]?)+\)', '', s)
    s = re.sub(r'\ba\.a\.', 'ao ano', s)
    s = re.sub(r'(\d)\.(?=\d{3}\b)', r'\1', s)          # 167.921,80 -> 167921,80
    s = re.sub(r'(\d)\.(?=\d{3}\b)', r'\1', s)
    s = re.sub(r'(?<![\w.,])([+−-])(?=\d)', lambda m: 'mais ' if m[1] == '+' else 'menos ', s)
    s = s.replace('%', ' por cento')
    for pat, rep in SAY:
        s = re.sub(pat, rep, s)
    s = re.sub(r'(\w)\s?[–—]\s?(\w)', r'\1, \2', s)
    s = re.sub(r'[▾▲▼·•"“”]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

def arr(v):
    if isinstance(v, list): return v
    if isinstance(v, str) and v.strip().startswith('['):
        try:
            p = json.loads(v); return p if isinstance(p, list) else []
        except Exception: return []
    return []

def load(d, name):
    p = os.path.join(d, name + '.json')
    if not os.path.exists(p): return []
    data = json.load(open(p, encoding='utf-8'))
    if isinstance(data, dict):
        for k in ('rows', 'data', 'results'):
            if isinstance(data.get(k), list): return data[k]
        return []
    return data

def delta_words(r):
    v = re.sub(r'^[+−-]', '', str(r.get('delta', '')))
    t = r.get('trend')
    return f'em alta de {v}' if t == 'up' else f'em queda de {v}' if t == 'down' else v

def status_words(r):
    st = str(r.get('status', ''))
    if re.search('confirm', st, re.I): return ''
    if re.search('disput', st, re.I): return 'Informação disputada. '
    return f"Segundo {r.get('source', '')}. "

def build_units(d):
    U = []
    def add(key, kind, section, title, target, text, seq=None):
        if text and str(text).strip():
            U.append({'key': key, 'kind': kind, 'section': section, 'title': title, 'target': target, 'text': re.sub(r'\s+', ' ', str(text)).strip(), 'seq': seq})
    seq = [0]
    def b(key, section, title, target, text):          # a unit read in the briefing, in this order
        seq[0] += 1; add(key, 'brief', section, title, target, text, seq[0])

    weather = load(d, 'weather'); market = load(d, 'market'); news = load(d, 'news'); ai = load(d, 'ai_news')
    dossier = load(d, 'dossier'); memo = load(d, 'dossier_full'); geo = load(d, 'geopolitics'); forces = load(d, 'forces')

    # opening: three greetings; the page plays the one that fits the hour
    day = ''
    if weather:
        try:
            y, m, dd = str(weather[0].get('date', '')).split('-')
            import datetime
            wd = datetime.date(int(y), int(m), int(dd)).weekday()
            day = f"{WEEKDAYS[wd]}, {int(dd)} de {MONTHS[int(m) - 1]}"
        except Exception: day = ''
    for k, g in (('open_m', 'Bom dia'), ('open_t', 'Boa tarde'), ('open_n', 'Boa noite')):
        add(k, 'open', 'topo', 'Abertura', '#topo', f"{g}, Dheryck. Aqui é o seu briefing{' de ' + day if day else ''}. Vou direto ao ponto, e com calma. Se quiser perguntar algo, é só falar.")

    # weather
    if weather:
        for x in weather:
            for f in ('high', 'low', 'precip'):
                try: x[f] = round(float(x.get(f)))
                except Exception: pass
        d0 = weather[0]; rest = weather[1:] or [d0]
        hot = max(rest, key=lambda x: x.get('high', 0)); wet = max(rest, key=lambda x: x.get('precip', 0))
        b('clima', 'clima', 'Clima', '#bx-wx', f"Primeiro, o tempo em Guarulhos. Hoje, {str(d0.get('condition', '')).lower()}. Máxima de {d0.get('high')} graus, mínima de {d0.get('low')}. Chance de chuva de {d0.get('precip')} por cento. {d0.get('tip', '')} Nos próximos dias, o mais quente é {str(hot.get('weekday', '')).lower()}, com {hot.get('high')} graus. E fique atento a {str(wet.get('weekday', '')).lower()}: {str(wet.get('condition', '')).lower()}, com {wet.get('precip')} por cento de chance de chuva.")
        for i, x in enumerate(weather):
            lab = x.get('day_label') if x.get('day_label') in ('Hoje', 'Amanhã') else ''
            add(f'w{i}', 'answer', 'clima', 'Clima', '#bx-wx', f"{(lab + ', ') if lab else ''}{str(x.get('weekday', '')).lower()}: {str(x.get('condition', '')).lower()}, máxima de {x.get('high')} e mínima de {x.get('low')} graus, com {x.get('precip')} por cento de chance de chuva. {x.get('tip', '')}")
        add('week', 'answer', 'clima', 'Clima', '#bx-wx', 'A semana em Guarulhos. ' + '. '.join(f"{x.get('day_label') if x.get('day_label') in ('Hoje', 'Amanhã') else str(x.get('weekday', '')).lower()}: {str(x.get('condition', '')).lower()}, {x.get('high')} graus" for x in weather) + '.')

    # market
    if market:
        b('intro_mercado', 'mercado', 'Mercado', '#mercado', 'Agora, o mercado. E hoje ele conta uma história.')
        for i, r in enumerate(market):
            b(f'm{i}', 'mercado', 'Mercado', f'[data-step="m{i}"]', f"{r.get('label')}: {r.get('value')}, {delta_words(r)}. {r.get('why', '')}")
        add('list_market', 'answer', 'mercado', 'Mercado', '#mercado', 'O mercado no último fechamento. ' + '. '.join(f"{r.get('label')}, {r.get('value')}, {delta_words(r)}" for r in market) + '. Pergunte sobre qualquer um e eu explico o motivo.')

    # news
    if news:
        b('intro_noticias', 'noticias', 'Notícias', '#noticias', 'Vamos às cinco notícias que mais pesam hoje.')
        for i, r in enumerate(news):
            b(f'n{i}', 'noticias', 'Notícias', f'[data-step="n{i}"]', f"{r.get('headline')}. {r.get('what', '')} Por que importa: {r.get('why', '')}")
        add('list_news', 'answer', 'noticias', 'Notícias', '#noticias', 'As notícias de hoje. ' + '. '.join(str(r.get('headline')) for r in news) + '. Quer que eu explique alguma?')

    # AI
    if ai:
        man = [(i, r) for i, r in enumerate(ai) if r.get('kind') != 'Bastidores']
        bas = [(i, r) for i, r in enumerate(ai) if r.get('kind') == 'Bastidores']
        if man: b('intro_ia', 'ia', 'Inteligência artificial', '#ia', 'Agora, inteligência artificial. Primeiro, as manchetes.')
        for i, r in man:
            b(f'ai{i}', 'ia', 'Inteligência artificial', f'[data-step="ai{i}"]', f"{r.get('headline')}. {status_words(r)}{r.get('summary', '')} {r.get('detail', '')} Como aplicar: {r.get('apply', '')}")
        if bas: b('intro_bastidores', 'ia', 'Inteligência artificial', '#ia', 'E agora, os bastidores. O que circula nos corredores, e ainda não é oficial.')
        for i, r in bas:
            b(f'ai{i}', 'ia', 'Inteligência artificial', f'[data-step="ai{i}"]', f"{r.get('headline')}. {status_words(r)}{r.get('summary', '')} {r.get('detail', '')}")
        add('list_ai_man', 'answer', 'ia', 'Inteligência artificial', '#ia', 'As manchetes de inteligência artificial hoje. ' + '. '.join(str(r.get('headline')) for _, r in man) + '. Quer que eu detalhe alguma?')
        add('list_ai_bas', 'answer', 'ia', 'Inteligência artificial', '#ia', 'Nos bastidores da inteligência artificial hoje. ' + '. '.join(str(r.get('headline')) for _, r in bas) + '. Quer que eu detalhe alguma?')

    # power dossier
    if dossier:
        b('intro_dossie', 'dossie', 'Dossiê de poder', '#dossie', 'Agora, o dossiê de poder.')
        for i, r in enumerate(dossier):
            b(f'd{i}', 'dossie', 'Dossiê de poder', f'[data-step="d{i}"]', f"Bloco {r.get('block')}, {r.get('country')}. {r.get('summary', '')}")
            for j, e in enumerate(arr(r.get('events'))):
                add(f'd{i}e{j}', 'answer', 'dossie', 'Dossiê de poder', f'[data-step="d{i}"]', f"{e.get('date', '')}. {e.get('headline', '')}. {e.get('detail', '')}")
    if memo:
        rows = sorted(memo, key=lambda r: float(r.get('order', 0) or 0))
        b('intro_memo', 'dossie-completo', 'Dossiê completo', '#dossie-completo', f'E agora, o dossiê completo, em {len(rows)} capítulos.')
        for i, r in enumerate(rows):
            b(f'c{i}', 'dossie-completo', 'Dossiê completo', f'[data-step="c{i}"]', f"Capítulo {i + 1}. {r.get('title', '')}. {r.get('body', '')}")

    # geopolitics
    if geo:
        g = geo[0]
        b('intro_geo', 'geopolitica', 'Geopolítica', '#geopolitica', 'Para fechar, a geopolítica financeira.')
        b('geo_intro', 'geopolitica', 'Geopolítica', '#bx-geo-intro', g.get('intro', ''))
        for i, p in enumerate(arr(g.get('points'))):
            b(f'p{i}', 'geopolitica', 'Geopolítica', f'[data-step="p{i}"]', re.sub(r'^\d+\.\s*', '', str(p.get('heading', ''))) + '. ' + str(p.get('body', '')))
        if forces:
            fronts = list(dict.fromkeys(r.get('front') for r in forces))
            txt = 'No mapa de forças: ' + '. '.join(f + ' pressiona ' + '; '.join(f"{r.get('asset')}, que {r.get('effect')}" for r in forces if r.get('front') == f) for f in fronts) + '.'
            b('forces', 'geopolitica', 'Geopolítica', '#bx-fside', txt)
        b('leitura', 'geopolitica', 'Geopolítica', '#leitura', 'A leitura do dia. ' + str(g.get('conclusion', '')))
        add('fecho_dia', 'close', 'geopolitica', 'Geopolítica', '#leitura', 'É isso. Tenha um ótimo dia.')
        add('fecho_fds', 'close', 'geopolitica', 'Geopolítica', '#leitura', 'É isso. Bom fim de semana.')

    # fixed phrases of the conversation
    add('ph_not_found', 'phrase', 'topo', 'Resposta', '#topo', 'Isso não está no briefing de hoje. Posso falar de clima, mercado, notícias, inteligência artificial, dossiê ou geopolítica.')
    add('ph_stop', 'phrase', 'topo', 'Resposta', '#topo', 'Tudo bem. Estou aqui quando precisar.')
    add('ph_nothing', 'phrase', 'topo', 'Resposta', '#topo', 'Não tenho nada pausado. Quer que eu comece o briefing?')
    return U

_TTS = None
_BACK = None
_TOK = None
def engine(kdir):
    global _TTS, _BACK, _TOK
    if _TTS is None:
        import espeakng_loader, sherpa_onnx
        from phonemizer.backend.espeak.wrapper import EspeakWrapper
        EspeakWrapper.set_library(espeakng_loader.get_library_path()); EspeakWrapper.set_data_path(espeakng_loader.get_data_path())
        from phonemizer.backend import EspeakBackend
        _BACK = EspeakBackend('pt-br', preserve_punctuation=True, with_stress=True)
        _TOK = set()
        for line in open(os.path.join(kdir, 'tokens.txt'), encoding='utf-8'):
            p = line.rstrip('\n').rsplit(' ', 1)
            if len(p) == 2: _TOK.add(p[0] if p[0] else ' ')
        cfg = sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
            model=os.path.join(kdir, 'model.onnx'), voices=os.path.join(kdir, 'voices.bin'), tokens=os.path.join(kdir, 'tokens.txt'),
            data_dir=os.path.join(kdir, 'espeak-ng-data'), dict_dir=os.path.join(kdir, 'dict'), lexicon=os.path.join(kdir, 'lexicon-us-en.txt')),
            num_threads=int(os.environ.get('VOZ_THREADS') or max(2, os.cpu_count() or 2))))
        _TTS = sherpa_onnx.OfflineTts(cfg)
    return _TTS

def synth(text, sid, kdir):
    import sherpa_onnx
    tts = engine(kdir)
    sentences = [p.strip() for p in re.split(r'(?<=[.!?:])\s+', speakable(text)) if p.strip()]
    out, sr = [], 24000
    for s in sentences:
        ph = _BACK.phonemize([s], njobs=1)[0].strip()
        toks = [c for c in ph if c in _TOK]
        if not toks: continue
        g = sherpa_onnx.GenerationConfig(); g.sid = sid; g.speed = SPEED; g.tokens = [toks]
        a = tts.generate('', config=g); sr = a.sample_rate
        out.append(np.asarray(a.samples, dtype=np.float32)); out.append(np.zeros(int(sr * SENTENCE_GAP), dtype=np.float32))
    if not out: return None, sr
    x = np.concatenate(out)
    peak = float(np.max(np.abs(x))) or 1.0
    return (x / peak * 0.92).astype(np.float32), sr

BITRATE = os.environ.get('VOZ_BITRATE', '24k')

def to_mp3_bytes(x, sr):
    import soundfile as sf
    with tempfile.TemporaryDirectory() as t:
        w = os.path.join(t, 'a.wav'); m = os.path.join(t, 'a.mp3')
        sf.write(w, x, sr, subtype='PCM_16')
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', w, '-ac', '1', '-ar', '24000', '-b:a', BITRATE, m], check=True)
        return open(m, 'rb').read()

def to_mp3_b64(x, sr):
    return base64.b64encode(to_mp3_bytes(x, sr)).decode('ascii')

def main():
    # VOZ_FILES=1 writes one MP3 per unit in <out_dir>/audio/<voice>/<key>.mp3 (used by the standalone site);
    # otherwise writes voice_<voice>.json with base64 MP3s (used by the claude.ai dashboard).
    # VOZ_ONLY=alex (or dora) renders just one voice, so two processes can run in parallel.
    data_dir, kdir, out_dir = sys.argv[1], sys.argv[2], sys.argv[3]
    as_files = os.environ.get('VOZ_FILES') == '1'
    only = os.environ.get('VOZ_ONLY')
    os.makedirs(out_dir, exist_ok=True)
    units = build_units(data_dir)
    json.dump(units, open(os.path.join(out_dir, 'narration.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    print('units:', len(units))
    for name, sid in VOICES.items():
        if only and name != only: continue
        rows, total = [], 0.0
        adir = os.path.join(out_dir, 'audio', name)
        if as_files: os.makedirs(adir, exist_ok=True)
        for u in units:
            x, sr = synth(u['text'], sid, kdir)
            if x is None: continue
            total += len(x) / sr
            if as_files:
                open(os.path.join(adir, u['key'] + '.mp3'), 'wb').write(to_mp3_bytes(x, sr))
            else:
                rows.append({'key': u['key'], 'secs': round(len(x) / sr, 2), 'mp3': to_mp3_b64(x, sr)})
        if as_files:
            print(f'audio/{name}: {len(os.listdir(adir))} files, {total / 60:.1f} min')
        else:
            p = os.path.join(out_dir, f'voice_{name}.json')
            json.dump(rows, open(p, 'w'), separators=(',', ':'))
            print(f'voice_{name}.json: {len(rows)} units, {total / 60:.1f} min, {os.path.getsize(p) / 1e6:.2f} MB')

if __name__ == '__main__':
    main()
