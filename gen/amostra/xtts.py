import os, sys, time
os.environ['COQUI_TOS_AGREED'] = '1'
from TTS.api import TTS
ref, out = sys.argv[1], sys.argv[2]
text = open('/tmp/texto.txt', encoding='utf-8').read().strip()
t0 = time.time(); tts = TTS('tts_models/multilingual/multi-dataset/xtts_v2'); print('load', round(time.time() - t0), 's')
t0 = time.time(); tts.tts_to_file(text=text, speaker_wav=ref, language='pt', file_path=out, split_sentences=True)
print('XTTS chars', len(text), 'secs', round(time.time() - t0))
