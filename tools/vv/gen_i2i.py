# -*- coding: utf-8 -*-
"""把摆好的合成图交给 Qwen-Image 做 img2img 重渲染（denoise 控制“重画多少”）。

    python gen_i2i.py --image composite.png --prompt p.txt --out out/zones/sink \
        --denoise 0.45 0.60 --seed 20261129
"""

import argparse
import json
import pathlib
import shutil
import time
import urllib.parse
import urllib.request
import uuid

from PIL import Image

HOST = "http://127.0.0.1:8188"
COMFY_INPUT = pathlib.Path("F:/AIProject/comfyui/input")
SUBFOLDER = "vv_i2i"
SIGMA_BASE = (1.0, 0.978453, 0.95418, 0.926626, 0.89508,
              0.845148, 0.704534, 0.414568, 0.0)


def turbo_sigmas(denoise: float) -> str:
    return ", ".join(f"{s * denoise:.6f}".rstrip("0").rstrip(".") or "0"
                     for s in SIGMA_BASE)


def graph(prompt: str, image_name: str, seed: int, prefix: str,
          denoise: float) -> dict:
    return {
        "1": {"class_type": "UNETLoader",
              "inputs": {"unet_name": "qwen_image_2.1_turbo_int8_convrot.safetensors",
                         "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader",
              "inputs": {"clip_name": "qwen3vl_8b_int8_convrot.safetensors",
                         "type": "qwen_image", "device": "default"}},
        "3": {"class_type": "VAELoader",
              "inputs": {"vae_name": "qwen_image_2.1_vae_bf16.safetensors"}},
        "4": {"class_type": "LoadImage", "inputs": {"image": image_name}},
        "5": {"class_type": "VAEEncode",
              "inputs": {"pixels": ["4", 0], "vae": ["3", 0]}},
        "6": {"class_type": "TextEncodeQwenImage21",
              "inputs": {"clip": ["2", 0], "prompt": prompt,
                         "negative_prompt": "", "resolution": 1024}},
        "7": {"class_type": "TextEncodeQwenImage21",
              "inputs": {"clip": ["2", 0], "prompt": "",
                         "negative_prompt": "", "resolution": 1024}},
        "101": {"class_type": "QwenImage21Cache",
                "inputs": {"model": ["1", 0], "device": "auto", "dtype": "default"}},
        "102": {"class_type": "CFGGuider",
                "inputs": {"model": ["101", 0], "positive": ["6", 0],
                           "negative": ["7", 0], "cfg": 1.0}},
        "103": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
        "104": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
        "105": {"class_type": "ManualSigmas",
                "inputs": {"sigmas": turbo_sigmas(denoise)}},
        "106": {"class_type": "SamplerCustomAdvanced",
                "inputs": {"noise": ["103", 0], "guider": ["102", 0],
                           "sampler": ["104", 0], "sigmas": ["105", 0],
                           "latent_image": ["5", 0]}},
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
    ap.add_argument("--image", required=True)
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--denoise", nargs="+", type=float, default=[0.45])
    ap.add_argument("--seed", type=int, default=20261129)
    args = ap.parse_args()

    src = pathlib.Path(args.image)
    name = f"vv_{src.stem}_{uuid.uuid4().hex[:6]}.png"
    COMFY_INPUT.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, COMFY_INPUT / name)
    with Image.open(src) as im:
        width, height = im.size

    prompt = pathlib.Path(args.prompt).read_text(encoding="utf-8").strip()
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    client = str(uuid.uuid4())
    jobs = {}
    for d in args.denoise:
        seed = args.seed
        prefix = f"{SUBFOLDER}/d{int(d*100)}_{seed}"
        body = {"prompt": graph(prompt, name, seed, prefix, d), "client_id": client}
        r = post(body, f"{HOST}/prompt")
        if r.get("node_errors"):
            print("node error:", r["node_errors"])
            return 2
        jobs[r["prompt_id"]] = d
        print("queued denoise", d, flush=True)

    started = time.time()
    pending = dict(jobs)
    while pending:
        for pid, d in list(pending.items()):
            hist = get(f"{HOST}/history/{pid}")
            entry = hist.get(pid)
            if not entry:
                continue
            for img in entry["outputs"]["10"]["images"]:
                q = urllib.parse.urlencode({"filename": img["filename"],
                                            "subfolder": img.get("subfolder", ""),
                                            "type": img.get("type", "output")})
                data = urllib.request.urlopen(f"{HOST}/view?{q}", timeout=180).read()
                dest = out / f"d{int(d*100)}.png"
                dest.write_bytes(data)
                with Image.open(dest) as im:
                    print(f"  {dest.name} {im.size} {time.time()-started:.0f}s",
                          flush=True)
            del pending[pid]
        time.sleep(2)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
