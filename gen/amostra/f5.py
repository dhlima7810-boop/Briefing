import os, sys, time, concurrent.futures
import torch
torch.set_num_threads(os.cpu_count() or 4)
import f5_tts.infer.utils_infer as U
U.ThreadPoolExecutor = lambda *a, **k: concurrent.futures.ThreadPoolExecutor(max_workers=1)   # one chunk at a time (no CPU fight)
from huggingface_hub import hf_hub_download
from f5_tts.api import F5TTS
ref, out = sys.argv[1], sys.argv[2]
NFE = int(os.environ.get('NFE', '16'))
# what is said in the first ~12 s of the recording (F5 clips the reference to that)
REF_TEXT = 'Bom dia, aqui é seu briefing de hoje. O dólar fechou em queda, a bolsa subiu um pouco e o tempo em Guarulhos deve ficar nublado.'
text = open('/tmp/texto.txt', encoding='utf-8').read().strip()
ck = hf_hub_download('firstpixel/F5-TTS-pt-br', 'pt-br/model_last.safetensors')
t0 = time.time(); m = F5TTS(model='F5TTS_Base', ckpt_file=ck, device='cpu'); print('load', round(time.time() - t0), 's')
t0 = time.time(); m.infer(ref_file=ref, ref_text=REF_TEXT, gen_text=text, file_wave=out, speed=0.95, nfe_step=NFE)
print(f'F5 nfe={NFE} chars {len(text)} secs {round(time.time() - t0)} threads {torch.get_num_threads()}')
