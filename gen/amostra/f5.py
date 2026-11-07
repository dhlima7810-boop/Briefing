import sys, time
from huggingface_hub import list_repo_files, hf_hub_download
ref, out = sys.argv[1], sys.argv[2]
text = open('/tmp/texto.txt', encoding='utf-8').read().strip()
REPO = 'firstpixel/F5-TTS-pt-br'
files = list_repo_files(REPO); print(files)
ck = sorted([f for f in files if f.endswith(('.safetensors', '.pt'))], key=lambda f: ('last' not in f, f))[0]
voc = [f for f in files if f.endswith('vocab.txt')]
ck = hf_hub_download(REPO, ck); voc = hf_hub_download(REPO, voc[0]) if voc else ''
from f5_tts.api import F5TTS
t0 = time.time(); m = F5TTS(model='F5TTS_Base', ckpt_file=ck, vocab_file=voc, device='cpu'); print('load', round(time.time() - t0), 's')
t0 = time.time(); m.infer(ref_file=ref, ref_text='', gen_text=text, file_wave=out, speed=0.95)
print('F5 chars', len(text), 'secs', round(time.time() - t0))
