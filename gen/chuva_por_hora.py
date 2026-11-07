"""Chuva hora a hora: acrescenta em cada dia de weather.json o campo "hours",
24 números com a chance de chuva (%) de 0h a 23h, vindos do Open-Meteo (grátis, sem chave).

Roda no workflow, antes da narração, para o site e a voz da Zyra dizerem a que horas deve chover.
Se o Open-Meteo falhar, deixa o arquivo como está (o site só não mostra as horas).

    python3 gen/chuva_por_hora.py site/data
"""
import json, os, sys, urllib.request

URL = ('https://api.open-meteo.com/v1/forecast?latitude=-23.4538&longitude=-46.5333'
       '&hourly=precipitation_probability&timezone=America%2FSao_Paulo&forecast_days=8&past_days=1')

def main():
    path = os.path.join(sys.argv[1] if len(sys.argv) > 1 else 'site/data', 'weather.json')
    rows = json.load(open(path, encoding='utf-8'))
    try:
        hourly = json.load(urllib.request.urlopen(URL, timeout=30))['hourly']
    except Exception as e:
        print(f'::warning::Chuva hora a hora indisponível ({e}); o site sai sem os horários.')
        return
    by_day = {}
    for ts, p in zip(hourly['time'], hourly['precipitation_probability']):
        by_day.setdefault(ts[:10], [None] * 24)[int(ts[11:13])] = p
    done = 0
    for r in rows:
        h = by_day.get(str(r.get('date', '')))
        if h and all(v is not None for v in h):
            r['hours'] = [int(round(v)) for v in h]
            done += 1
    json.dump(rows, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'Chuva hora a hora: {done} de {len(rows)} dias preenchidos.')

if __name__ == '__main__':
    main()
