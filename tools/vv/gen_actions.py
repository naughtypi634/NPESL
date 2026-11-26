# -*- coding: utf-8 -*-
"""烹饪动作卡片图：每个动作一张方形食物摄影图。

    python gen_actions.py --items actions.json --out out/actions
"""

import argparse
import json
import pathlib
import time
import urllib.parse
import urllib.request
import uuid

from PIL import Image

HOST = "http://127.0.0.1:8188"
SUBFOLDER = "vv_actions"

STYLE = ("food photography, close-up, clean simple composition on a wooden "
         "cutting board or in a pan, soft natural daylight, shallow depth of "
         "field, warm neutral background, ultra detailed, no people, no hands, "
         "no text, no letters")


def graph(text: str, seed: int, prefix: str) -> dict:
    prompt = text + ", " + STYLE
    return {
        "1": {"class_type": "UNETLoader",
              "inputs": {"unet_name": "qwen_image_2.1_turbo_int8_convrot.safetensors",
                         "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader",
              "inputs": {"clip_name": "qwen3vl_8b_int8_convrot.safetensors",
                         "type": "qwen_image", "device": "default"}},
        "3": {"class_type": "VAELoader",
              "inputs": {"vae_name": "qwen_image_2.1_vae_bf16.safetensors"}},
        "4": {"class_type": "TextEncodeQwenImage21",
              "inputs": {"clip": ["2", 0], "prompt": prompt,
                         "negative_prompt": "", "resolution": 1024}},
        "5": {"class_type": "TextEncodeQwenImage21",
              "inputs": {"clip": ["2", 0], "prompt": "",
                         "negative_prompt": "", "resolution": 1024}},
        "6": {"class_type": "EmptyLatentImage",
              "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
        "101": {"class_type": "QwenImage21Cache",
                "inputs": {"model": ["1", 0], "device": "auto", "dtype": "default"}},
        "102": {"class_type": "CFGGuider",
                "inputs": {"model": ["101", 0], "positive": ["4", 0],
                           "negative": ["5", 0], "cfg": 1.0}},
        "103": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
        "104": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
        "105": {"class_type": "ManualSigmas",
                "inputs": {"sigmas": "1.0, 0.978453, 0.95418, 0.926626, 0.89508, "
                                     "0.845148, 0.704534, 0.414568, 0"}},
        "106": {"class_type": "SamplerCustomAdvanced",
                "inputs": {"noise": ["103", 0], "guider": ["102", 0],
                           "sampler": ["104", 0], "sigmas": ["105", 0],
                           "latent_image": ["6", 0]}},
        "9": {"class_type": "VAEDecode",
              "inputs": {"samples": ["106", 0], "vae": ["3", 0]}},
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
    ap = argparse.ArgumentParser()
    ap.add_argument("--items", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--seed", type=int, default=20261300)
    args = ap.parse_args()

    items = json.loads(pathlib.Path(args.items).read_text(encoding="utf-8"))
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    client = str(uuid.uuid4())

    jobs = []
    for i, it in enumerate(items):
        r = post({"prompt": graph(it["prompt"], args.seed + i,
                                  f"{SUBFOLDER}/{it['slug']}"),
                  "client_id": client}, f"{HOST}/prompt")
        if r.get("node_errors"):
            print("node error", it["slug"], r["node_errors"])
            return 2
        jobs.append((it["slug"], r["prompt_id"]))
        print("queued", it["slug"], flush=True)

    started = time.time()
    pending = dict(jobs)
    while pending:
        for slug, pid in list(pending.items()):
            entry = get(f"{HOST}/history/{pid}").get(pid)
            if not entry:
                continue
            for img in entry["outputs"]["10"]["images"]:
                q = urllib.parse.urlencode({"filename": img["filename"],
                                            "subfolder": img.get("subfolder", ""),
                                            "type": img.get("type", "output")})
                data = urllib.request.urlopen(f"{HOST}/view?{q}", timeout=180).read()
                dest = out / f"{slug}.png"
                dest.write_bytes(data)
                print(f"  {slug} {time.time()-started:.0f}s", flush=True)
            del pending[slug]
        time.sleep(1.5)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
