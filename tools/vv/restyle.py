# -*- coding: utf-8 -*-
"""把现有场景图重绘成另一种画风，保持构图不变（img2img）。

    python -I tools/vv/restyle.py --page room-study --style flat --denoise 0.6
    python -I tools/vv/restyle.py --all --styles flat,clay,ink

重绘后构图与原来一致，所以热点坐标、遮罩框都不需要重标；
遮罩仍要按新图重抠（tools/vv/masks.py --style）。

原图取 build/vv-work/out/<zone>/up.png，缺失时退回当前网页上的场景图。
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

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from paths import VV_CONTENT  # noqa: E402

HOST = "http://127.0.0.1:8188"
ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "build" / "vv-work"
COMFY_INPUT = Path("F:/AIProject/comfyui/input")
SUBFOLDER = "vv_restyle"
W, H = 1536, 960

# 写实提示词里的摄影词会和风格打架，重绘时去掉。
PHOTO_WORDS = [
    "shallow depth of field", "photorealistic", "soft daylight", "crisp focus",
    "fine surface detail", "ultra detailed", "physically based materials",
]

STYLES = {
    "flat": ("flat vector illustration, bold clean shapes, flat solid color fills, "
             "minimal internal detail, no gradients, soft flat drop shadows, muted "
             "warm palette, each object clearly separated with a readable silhouette, "
             "no people, no text, no letters, no logo"),
    "clay": ("soft 3D illustration, matte clay-like materials, rounded simplified "
             "forms, gentle ambient occlusion, soft even studio lighting, muted "
             "pastel palette, clean silhouettes, each object clearly separated with "
             "a readable silhouette, no people, no text, no letters, no logo"),
    "ink": ("hand-drawn line art illustration, clean dark outlines of even weight, "
            "flat muted color fills, no gradients, slight paper texture, each object "
            "clearly separated with a readable silhouette, no people, no text, "
            "no letters, no logo"),
}


def graph(prompt: str, image_name: str, seed: int, prefix: str, denoise: float,
          width: int = W, height: int = H, steps: int = 30) -> dict:
    return {
        "1": {"class_type": "UNETLoader",
              "inputs": {"unet_name": "qwen_image_2.1_int8_convrot.safetensors",
                         "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader",
              "inputs": {"clip_name": "qwen3vl_8b_int8_convrot.safetensors",
                         "type": "qwen_image", "device": "default"}},
        "3": {"class_type": "VAELoader",
              "inputs": {"vae_name": "qwen_image_2.1_vae_bf16.safetensors"}},
        "4": {"class_type": "LoadImage", "inputs": {"image": image_name}},
        "5": {"class_type": "VAEEncode", "inputs": {"pixels": ["4", 0], "vae": ["3", 0]}},
        "6": {"class_type": "CLIPTextEncode",
              "inputs": {"clip": ["2", 0], "text": prompt}},
        "7": {"class_type": "CLIPTextEncode",
              "inputs": {"clip": ["2", 0], "text": ""}},
        "8": {"class_type": "KSampler",
              "inputs": {"model": ["1", 0], "positive": ["6", 0],
                         "negative": ["7", 0], "latent_image": ["5", 0],
                         "seed": seed, "steps": steps, "cfg": 1.0,
                         "sampler_name": "euler", "scheduler": "simple",
                         "denoise": denoise}},
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


def clean_prompt(text: str) -> str:
    for w in PHOTO_WORDS:
        text = text.replace(w, "")
    return " ".join(text.split()).strip(" ,")


def source_image(spec: dict, source_style: str = "") -> Path | None:
    if source_style:
        p = WORK / "style" / source_style / f'{spec["page"]}.png'
        if p.exists():
            return p
    up = WORK / "out" / spec["zone"] / "up.png"
    if up.exists():
        return up
    seeds = sorted((WORK / "out" / spec["zone"]).glob("seed*.png"))
    if seeds:
        return seeds[0]
    cur = ROOT / "apps" / "visual-vocabulary" / spec["dir"] / spec["image"]
    return cur if cur.exists() else None


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--page", action="append", default=[])
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--styles", default="flat,clay,ink")
    ap.add_argument("--denoise", default="0.62",
                    help="重画幅度，可给多个：0.62,0.78,0.9")
    ap.add_argument("--seed", type=int, default=20261122)
    ap.add_argument("--steps", type=int, default=30)
    ap.add_argument("--width", type=int, default=W)
    ap.add_argument("--height", type=int, default=H)
    ap.add_argument("--skip-existing", action="store_true",
                    help="已有该画风的成品就跳过（断点续跑）")
    ap.add_argument("--source-style", default="",
                    help="以某种画风为母版再重绘（保证多画风共用同一构图）")
    args = ap.parse_args()

    denoises = [float(v) for v in str(args.denoise).split(",") if v.strip()]
    multi = len(denoises) > 1

    styles = [s.strip() for s in args.styles.split(",") if s.strip()]
    for s in styles:
        if s not in STYLES:
            ap.error(f"未知风格 {s}；可选 {', '.join(STYLES)}")

    paths = sorted((VV_CONTENT / "scenes").glob("*.json"))
    if not args.all:
        paths = [p for p in paths if json.loads(p.read_text(encoding="utf-8"))["page"]
                 in set(args.page)]
    if not paths:
        ap.error("没有要重绘的场景")

    COMFY_INPUT.mkdir(parents=True, exist_ok=True)
    client = str(uuid.uuid4())
    jobs = []
    for path in paths:
        spec = json.loads(path.read_text(encoding="utf-8"))
        src = source_image(spec, args.source_style)
        if not src:
            print("跳过（没有原图）", spec["page"])
            continue
        with Image.open(src) as im:
            im.convert("RGB").resize((args.width, args.height), Image.LANCZOS).save(
                COMFY_INPUT / f"vv_restyle_{spec['page']}.png")
        name = f"vv_restyle_{spec['page']}.png"
        base = clean_prompt(spec.get("prompt", ""))
        for style in styles:
            prompt = f"{base}, {STYLES[style]}"
            for d in denoises:
                tag = f"{style}-{int(d * 100)}" if multi else style
                if args.skip_existing and (WORK / "style" / tag / f'{spec["page"]}.png').exists():
                    continue
                prefix = f"{SUBFOLDER}/{tag}/{spec['page']}"
                r = post({"prompt": graph(prompt, name, args.seed, prefix, d,
                                          steps=args.steps),
                          "client_id": client}, f"{HOST}/prompt")
                if r.get("node_errors"):
                    print("node error", spec["page"], style, r["node_errors"])
                    continue
                jobs.append((spec["page"], tag, d, r["prompt_id"]))
                print("queued", spec["page"], tag, flush=True)

    started = time.time()
    pending = {(p, t, d): pid for p, t, d, pid in jobs}
    done = 0
    while pending:
        for (page, tag, d), pid in list(pending.items()):
            entry = get(f"{HOST}/history/{pid}").get(pid)
            if not entry:
                continue
            imgs = entry["outputs"]["10"]["images"]
            q = urllib.parse.urlencode({"filename": imgs[0]["filename"],
                                        "subfolder": imgs[0].get("subfolder", ""),
                                        "type": imgs[0].get("type", "output")})
            data = urllib.request.urlopen(f"{HOST}/view?{q}", timeout=180).read()
            dest = WORK / "style" / tag / f"{page}.png"
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
            done += 1
            print(f"  {done}/{len(jobs)} {tag}/{page} {time.time()-started:.0f}s",
                  flush=True)
            del pending[(page, tag, d)]
        time.sleep(2)
    print("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
