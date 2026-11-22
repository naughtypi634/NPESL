# -*- coding: utf-8 -*-
"""按三种画风从零生成场景图（同一场景三种画风共用同一种子与构图）。

    python -I tools/vv/gen_styles.py --page room-study --styles flat
    python -I tools/vv/gen_styles.py --all --styles flat,clay,ink

输出 build/vv-work/style/<style>/<page>.png
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
sys.path.insert(0, str(Path(__file__).resolve().parent))
from paths import VV_CONTENT  # noqa: E402
from restyle import STYLES, clean_prompt  # noqa: E402

HOST = "http://127.0.0.1:8188"
ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "build" / "vv-work"
SUBFOLDER = "vv_styles"


def graph(prompt: str, seed: int, prefix: str, w: int, h: int, steps: int) -> dict:
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
        "5": {"class_type": "CLIPTextEncode",
              "inputs": {"clip": ["2", 0], "text": ""}},
        "6": {"class_type": "EmptyLatentImage",
              "inputs": {"width": w, "height": h, "batch_size": 1}},
        "8": {"class_type": "KSampler",
              "inputs": {"model": ["1", 0], "positive": ["4", 0],
                         "negative": ["5", 0], "latent_image": ["6", 0],
                         "seed": seed, "steps": steps, "cfg": 1.0,
                         "sampler_name": "euler", "scheduler": "simple",
                         "denoise": 1.0}},
        "9": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["3", 0]}},
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
    ap.add_argument("--page", action="append", default=[])
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--styles", default="flat,clay,ink")
    ap.add_argument("--seed", type=int, default=20261122)
    ap.add_argument("--width", type=int, default=1344)
    ap.add_argument("--height", type=int, default=840)
    ap.add_argument("--steps", type=int, default=26)
    args = ap.parse_args()

    styles = [s.strip() for s in args.styles.split(",") if s.strip()]
    for s in styles:
        if s not in STYLES:
            ap.error(f"未知风格 {s}")

    paths = sorted((VV_CONTENT / "scenes").glob("*.json"))
    if not args.all:
        paths = [p for p in paths
                 if json.loads(p.read_text(encoding="utf-8"))["page"] in set(args.page)]
    if not paths:
        ap.error("没有要生成的场景")

    client = str(uuid.uuid4())
    jobs = []
    for path in paths:
        spec = json.loads(path.read_text(encoding="utf-8"))
        base = clean_prompt(spec.get("prompt", ""))
        for style in styles:
            prompt = f"{base}, {STYLES[style]}"
            prefix = f"{SUBFOLDER}/{style}/{spec['page']}"
            body = {"prompt": graph(prompt, args.seed, prefix,
                                    args.width, args.height, args.steps),
                    "client_id": client}
            r = post(body, f"{HOST}/prompt")
            if r.get("node_errors"):
                print("node error", spec["page"], style, r["node_errors"])
                continue
            jobs.append((spec["page"], style, r["prompt_id"]))
            print("queued", spec["page"], style, flush=True)

    started = time.time()
    pending = {(p, s): pid for p, s, pid in jobs}
    done = 0
    while pending:
        for (page, style), pid in list(pending.items()):
            entry = get(f"{HOST}/history/{pid}").get(pid)
            if not entry:
                continue
            imgs = entry["outputs"]["10"]["images"]
            q = urllib.parse.urlencode({"filename": imgs[0]["filename"],
                                        "subfolder": imgs[0].get("subfolder", ""),
                                        "type": imgs[0].get("type", "output")})
            data = urllib.request.urlopen(f"{HOST}/view?{q}", timeout=180).read()
            dest = WORK / "style" / style / f"{page}.png"
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
            done += 1
            print(f"  {done}/{len(jobs)} {style}/{page} {time.time()-started:.0f}s",
                  flush=True)
            del pending[(page, style)]
        time.sleep(2)
    print("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
