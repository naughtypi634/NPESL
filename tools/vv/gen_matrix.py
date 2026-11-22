# -*- coding: utf-8 -*-
"""画风 × 视角矩阵：同一间书房，跑 N 种风格 × M 种角度，供选型。

    python -I tools/vv/gen_matrix.py

输出 build/vv-work/matrix/s<风格号>a<角度号>.png
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from paths import VV_CONTENT  # noqa: E402

HOST = "http://127.0.0.1:8188"
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "build" / "vv-work" / "matrix"
SUBFOLDER = "vv_matrix"
W, H = 1536, 960
STEPS = 26
SEED = 20261301

BASE = ("a home office desk scene: a wooden desk with a monitor, a keyboard, "
        "a mouse, a desk lamp, over-ear headphones, a printer on the right, "
        "a bookshelf with books behind, a wi-fi router, an office chair tucked "
        "in at the side so the desk top stays clearly visible, every object "
        "fully inside the frame with clear space around it")

STYLES = {
    1: ("彩色线稿", "colored line art illustration, clean ink outlines, flat soft "
                "color fills, picture-book look, no gradients"),
    2: ("扁平矢量", "flat vector illustration, bold simplified shapes, solid flat "
                "colors, minimal shading, clean geometric forms"),
    3: ("柔光 3D", "soft 3D clay render, matte rounded forms, gentle ambient "
                "occlusion, pastel palette, soft studio lighting"),
    4: ("皮克斯 3D", "Disney Pixar 3D cartoon film still, rounded exaggerated "
                  "proportions, glossy toy-like materials, bright saturated "
                  "colors, cinematic lighting"),
    5: ("水彩绘本", "watercolor children's book illustration, soft pigment washes, "
                "visible paper texture, gentle ink outlines, warm muted palette"),
    6: ("等距插画", "isometric illustration, clean vector shapes, soft shadows, "
                "pastel palette, crisp edges"),
}

ANGLES = {
    1: ("正面平视", "front view at eye level, straight-on perspective"),
    2: ("俯视 25°", "viewed from 25 degrees above, slight downward angle"),
    3: ("俯视 45°", "viewed from 45 degrees above, looking down"),
    4: ("斜侧 45°", "three-quarter view from the left, slight downward angle"),
    5: ("近景平视", "close-up front view, objects filling the frame, eye level"),
}


def graph(prompt: str, prefix: str, w: int, h: int, steps: int) -> dict:
    return {
        "1": {"class_type": "UNETLoader",
              "inputs": {"unet_name": "qwen_image_2.1_int8_convrot.safetensors",
                         "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader",
              "inputs": {"clip_name": "qwen3vl_8b_int8_convrot.safetensors",
                         "type": "qwen_image", "device": "default"}},
        "3": {"class_type": "VAELoader",
              "inputs": {"vae_name": "qwen_image_2.1_vae_bf16.safetensors"}},
        "4": {"class_type": "CLIPTextEncode",
              "inputs": {"clip": ["2", 0], "text": prompt}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": ""}},
        "6": {"class_type": "EmptyLatentImage",
              "inputs": {"width": w, "height": h, "batch_size": 1}},
        "8": {"class_type": "KSampler",
              "inputs": {"model": ["1", 0], "positive": ["4", 0],
                         "negative": ["5", 0], "latent_image": ["6", 0],
                         "seed": SEED, "steps": steps, "cfg": 1.0,
                         "sampler_name": "euler", "scheduler": "simple",
                         "denoise": 1.0}},
        "9": {"class_type": "VAEDecode",
              "inputs": {"samples": ["8", 0], "vae": ["3", 0]}},
        "10": {"class_type": "SaveImage",
               "inputs": {"images": ["9", 0], "filename_prefix": prefix}},
    }


def post(body, url, timeout=60):
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read())


def get(url, timeout=60):
    return json.loads(urllib.request.urlopen(url, timeout=timeout).read())


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--width", type=int, default=W)
    ap.add_argument("--height", type=int, default=H)
    ap.add_argument("--steps", type=int, default=STEPS)
    ap.add_argument("--skip-existing", action="store_true")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    client = str(uuid.uuid4())
    jobs = []
    for sid, (sname, sdesc) in STYLES.items():
        for aid, (aname, adesc) in ANGLES.items():
            if args.skip_existing and (OUT / f"s{sid}a{aid}.png").exists():
                continue
            prompt = f"{BASE}. {sdesc}, {adesc}. no people, no text, no letters, no logo"
            prefix = f"{SUBFOLDER}/s{sid}a{aid}"
            r = post({"prompt": graph(prompt, prefix, args.width, args.height,
                                      args.steps), "client_id": client},
                     f"{HOST}/prompt")
            if r.get("node_errors"):
                print("node error", sid, aid, r["node_errors"])
                continue
            jobs.append((sid, aid, r["prompt_id"]))
    print(f"queued {len(jobs)}", flush=True)

    started = time.time()
    pending = {(s, a): pid for s, a, pid in jobs}
    while pending:
        for (sid, aid), pid in list(pending.items()):
            entry = get(f"{HOST}/history/{pid}").get(pid)
            if not entry:
                continue
            imgs = entry["outputs"]["10"]["images"]
            q = urllib.parse.urlencode({"filename": imgs[0]["filename"],
                                        "subfolder": imgs[0].get("subfolder", ""),
                                        "type": imgs[0].get("type", "output")})
            data = urllib.request.urlopen(f"{HOST}/view?{q}", timeout=180).read()
            (OUT / f"s{sid}a{aid}.png").write_bytes(data)
            print(f"  {len(jobs)-len(pending)+1}/{len(jobs)} s{sid}a{aid} "
                  f"{time.time()-started:.0f}s", flush=True)
            del pending[(sid, aid)]
        time.sleep(2)
    (OUT / "legend.json").write_text(json.dumps(
        {"styles": {str(k): v[0] for k, v in STYLES.items()},
         "angles": {str(k): v[0] for k, v in ANGLES.items()}},
        ensure_ascii=False, indent=1), encoding="utf-8")
    print("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
