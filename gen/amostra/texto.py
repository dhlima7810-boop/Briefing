"""Prints the sample text: the first units of today's briefing, as the cloned voice would read them."""
import importlib.util, sys
spec = importlib.util.spec_from_file_location('v', 'gen/voz_jarvis.py'); v = importlib.util.module_from_spec(spec); spec.loader.exec_module(v)
units = [u for u in v.build_units('site/data') if u['kind'] == 'brief']
units = [u for u in v.build_units('site/data') if u['kind'] == 'open'][:1] + units
out, n = [], 0
for u in units:
    t = v.speakable(u['text'], v.SAY_EL)
    if out and n + len(t) > 650: break
    out.append(t); n += len(t)
print('\n'.join(out))
