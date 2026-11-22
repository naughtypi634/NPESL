# -*- coding: utf-8 -*-
"""生成 Visual Vocabulary 场景底图（Qwen-Image 2.1，本机 ComfyUI）。

    python gen_scene.py --prompt-file p.txt --out out/kitchen --seeds 3
"""

import argparse
import json
import pathlib
import sys
import time
import urllib.parse
import urllib.request
import uuid

from PIL import Image

HOST = "http://127.0.0.1:8188"
HERE = pathlib.Path(__file__).resolve().parent
SUBFOLDER = "vv_scene"

STYLE = ("photorealistic interior render, physically based materials, precise "
         "edges and seams, clear three-dimensional form, soft ambient occlusion, "
         "soft daylight with gentle contact shadows, camera at 25 degrees above "
         "horizontal, 35mm lens, straight-on perspective, no wide-angle "
         "distortion, every object fully inside the frame with clear margin from "
         "the edges, nothing cropped, crisp focus, fine surface detail, ultra "
         "detailed, no people, no text, no letters, no logo")


def graph(prompt: str, seed: int, prefix: str, width: int, height: int) -> dict:
    text = prompt + ", " + STYLE
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
              "inputs": {"clip": ["2", 0], "text": text}},
        "5": {"class_type": "CLIPTextEncode",
              "inputs": {"clip": ["2", 0], "text": ""}},
        "6": {"class_type": "EmptyLatentImage",
              "inputs": {"width": width, "height": height, "batch_size": 1}},
        "8": {"class_type": "KSampler",
              "inputs": {"model": ["1", 0], "positive": ["4", 0],
                         "negative": ["5", 0], "latent_image": ["6", 0],
                         "seed": seed, "steps": 30, "cfg": 1.0,
                         "sampler_name": "euler", "scheduler": "simple",
                         "denoise": 1.0}},
        "9": {"class_type": "VAEDecode",
              "inputs": {"samples": ["8", 0], "vae": ["3", 0]}},
        "14": {"class_type": "SaveImage",
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
    ap.add_argument("--prompt-file", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--seeds", type=int, default=2)
    ap.add_argument("--seed", type=int, default=20261120)
    ap.add_argument("--width", type=int, default=1536)
    ap.add_argument("--height", type=int, default=960)
    args = ap.parse_args()

    prompt = pathlib.Path(args.prompt_file).read_text(encoding="utf-8").strip()
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    client = str(uuid.uuid4())
    jobs = []
    for i in range(args.seeds):
        seed = args.seed + i
        prefix = f"{SUBFOLDER}/seed{seed}"
        body = {"prompt": graph(prompt, seed, prefix, args.width, args.height),
                "client_id": client}
        r = post(body, f"{HOST}/prompt")
        if r.get("node_errors"):
            print("node error:", r["node_errors"], file=sys.stderr)
            return 2
        jobs.append((seed, r["prompt_id"]))
        print("queued", seed, flush=True)

    done = 0
    started = time.time()
    pending = dict(jobs)
    while pending:
        for seed, pid in list(pending.items()):
            hist = get(f"{HOST}/history/{pid}")
            entry = hist.get(pid)
            if not entry:
                continue
            for img in entry["outputs"]["14"]["images"]:
                q = urllib.parse.urlencode({"filename": img["filename"],
                                            "subfolder": img.get("subfolder", ""),
                                            "type": img.get("type", "output")})
                data = urllib.request.urlopen(f"{HOST}/view?{q}", timeout=180).read()
                dest = out / f"seed{seed}.png"
                dest.write_bytes(data)
                with Image.open(dest) as im:
                    print(f"  {dest.name} {im.size}  {time.time()-started:.0f}s", flush=True)
            del pending[seed]
            done += 1
        time.sleep(2)
    print("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
