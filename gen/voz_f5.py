#!/usr/bin/env python3
"""Dheryck's cloned voice (F5-TTS pt-BR) for the male narration slot ('alex' files).

Usage: python3 gen/voz_f5.py <narration.json> <ref_audio> <out_dir> <shard> <shards>
Writes <out_dir>/<key>.mp3 for every unit with index % shards == shard.
The reference recording is voz/referencia-dheryck.m4a; REF_TEXT is what is said in its first ~12 s
(F5 clips the reference there). Quality settings were approved by the owner on 08/11/2026: keep them.
"""
import concurrent.futures, importlib.util, json, os, subprocess, sys, tempfile, time
import torch
torch.set_num_threads(os.cpu_count() or 4)
import f5_tts.infer.utils_infer as U
U.ThreadPoolExecutor = lambda *a, **k: concurrent.futures.ThreadPoolExecutor(max_workers=1)  # one chunk at a time (no CPU fight)
from huggingface_hub import hf_hub_download
from f5_tts.api import F5TTS

REF_TEXT = 'Bom dia, aqui é seu briefing de hoje. O dólar fechou em queda, a bolsa subiu um pouco e o tempo em Guarulhos deve ficar nublado.'
MODEL_REPO, MODEL_FILE = 'firstpixel/F5-TTS-pt-br', 'pt-br/model_last.safetensors'
NFE, SPEED = 32, 0.95
BITRATE = os.environ.get('VOZ_BITRATE', '32k')

here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('vj', os.path.join(here, 'voz_jarvis.py')); vj = importlib.util.module_from_spec(spec); spec.loader.exec_module(vj)

def main():
    nar, ref, out_dir, shard, shards = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5])
    os.makedirs(out_dir, exist_ok=True)
    units = [u for i, u in enumerate(json.load(open(nar, encoding='utf-8'))) if i % shards == shard]
    m = F5TTS(model='F5TTS_Base', ckpt_file=hf_hub_download(MODEL_REPO, MODEL_FILE), device='cpu')
    t0 = time.time(); chars = 0
    for u in units:
        text = vj.speakable(u['text'], vj.SAY_EL)
        if not text: continue
        with tempfile.TemporaryDirectory() as t:
            w = os.path.join(t, 'a.wav')
            m.infer(ref_file=ref, ref_text=REF_TEXT, gen_text=text, file_wave=w, speed=SPEED, nfe_step=NFE, show_info=lambda *a: None)
            subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', w, '-ac', '1', '-ar', '24000', '-b:a', BITRATE,
                            os.path.join(out_dir, u['key'] + '.mp3')], check=True)
        chars += len(text)
        print(f"{u['key']}: {len(text)} chars, {time.time() - t0:.0f}s", flush=True)
    print(f'shard {shard}/{shards}: {len(units)} units, {chars} chars, {time.time() - t0:.0f}s')

if __name__ == '__main__':
    main()
