# -*- coding: utf-8 -*-
"""补齐缺失的词卡图：Qwen-Image 2.1（本机 ComfyUI）生成 → 抠底 → 640×640 WebP。

提示词存在 content/visual-vocabulary/sets/*.json 的 prompt 字段；reuse 字段
表示直接复用另一套的图和录音。

    python -I tools/vv/gen_card_image.py --list
    python -I tools/vv/gen_card_image.py --set clothing
    python -I tools/vv/gen_card_image.py          # 全部缺失
"""

import argparse
import json
import pathlib
import shutil
import sys
import time
import urllib.parse
import urllib.request
import uuid

from PIL import Image

HOST = "http://127.0.0.1:8188"
ROOT = pathlib.Path(__file__).resolve().parents[2]
SETS = ROOT / "content" / "visual-vocabulary" / "sets"
RAW = ROOT / "build" / "vv-work" / "raw"
SUBFOLDER = "packing_ai/raw/vv_rework"

STYLE = ("refined craftsmanship, fine material textures, precise edges and seams, "
         "clear three-dimensional form, soft ambient occlusion, soft studio lighting "
         "with a subtle rim light, gentle contact shadows, plain white background, "
         "no people, no text, no letters, no logo, high-end product render, "
         "sharp focus, ultra detailed")


def items():
    for path in sorted(SETS.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        for sec in data["sections"]:
            for it in sec["items"]:
                if it.get("prompt") or it.get("reuse"):
                    yield data["set"], it


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
        "10": {"class_type": "LoadBackgroundRemovalModel",
               "inputs": {"bg_removal_name": "birefnet.safetensors"}},
        "11": {"class_type": "RemoveBackground",
               "inputs": {"bg_removal_model": ["10", 0], "image": ["9", 0]}},
        "12": {"class_type": "InvertMask",
               "inputs": {"mask": ["11", 0]}},
        "13": {"class_type": "JoinImageWithAlpha",
               "inputs": {"image": ["9", 0], "alpha": ["12", 0]}},
        "14": {"class_type": "SaveImage",
               "inputs": {"images": ["13", 0], "filename_prefix": prefix}},
    }


def post(body, url, timeout=60):
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read())


def get(url, timeout=60):
    return json.loads(urllib.request.urlopen(url, timeout=timeout).read())


def fetch_image(item: dict, dest: pathlib.Path) -> None:
    q = urllib.parse.urlencode({"filename": item["filename"],
                                "subfolder": item.get("subfolder", ""),
                                "type": item.get("type", "output")})
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(urllib.request.urlopen(f"{HOST}/view?{q}",
                                            timeout=180).read())


def to_webp(src: pathlib.Path, dest: pathlib.Path) -> None:
    im = Image.open(src).convert("RGBA").resize((640, 640), Image.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "WEBP", quality=85, method=6)


def dest_for(set_name: str, it: dict) -> pathlib.Path:
    data = json.loads((SETS / f"{set_name}.json").read_text(encoding="utf-8"))
    return ROOT / "apps" / "visual-vocabulary" / set_name / data["asset_root"] / (it["slug"] + ".webp")


def copy_reuse(set_name: str, it: dict) -> None:
    src_root = ROOT / "apps" / "visual-vocabulary" / it["reuse"] / "assets" / it["reuse"] / "color"
    dest = dest_for(set_name, it)
    shutil.copy2(src_root / (it["slug"] + ".webp"), dest)
    for voice in ("h2", "c"):
        a = ROOT / "apps" / "visual-vocabulary" / it["reuse"] / "audio" / voice / (it["slug"] + ".mp3")
        b = ROOT / "apps" / "visual-vocabulary" / set_name / "audio" / voice / (it["slug"] + ".mp3")
        b.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(a, b)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", action="append", default=[])
    ap.add_argument("--only", action="append", default=[])
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--seed", type=int, default=20261116)
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()

    todo = []
    for set_name, it in items():
        if args.set and set_name not in args.set:
            continue
        if args.only and it["slug"] not in args.only:
            continue
        dest = dest_for(set_name, it)
        if dest.exists() and not args.only:
            continue
        todo.append((set_name, it, dest))
    if args.limit:
        todo = todo[: args.limit]
    if args.list:
        for set_name, it, _ in todo:
            print(set_name, it["slug"])
        print("missing:", len(todo))
        return 0
    if not todo:
        print("nothing to do")
        return 0
    print(f"missing: {len(todo)}", flush=True)

    client = str(uuid.uuid4())
    started = time.time()
    fails = []
    done = 0

    # Reuse items are file copies, not GPU work.
    gpu = []
    for set_name, it, dest in todo:
        if it.get("reuse"):
            copy_reuse(set_name, it)
            done += 1
            print(f"[{done}/{len(todo)}] {set_name}/{it['slug']} copied",
                  flush=True)
        else:
            gpu.append((set_name, it, dest))

    # Keep the ComfyUI queue non-empty so the UNet/CLIP stay resident;
    # submitting one prompt at a time makes ComfyUI unload and reload them
    # between every image, which is what made the run take 3x longer.
    depth = 4
    inflight = []
    attempts = {}
    while gpu or inflight:
        while gpu and len(inflight) < depth:
            set_name, it, dest = gpu.pop(0)
            try:
                prefix = f"{SUBFOLDER}/{set_name}/{it['slug']}"
                body = {"prompt": graph(it["prompt"], args.seed + done,
                                        prefix), "client_id": client}
                r = post(body, f"{HOST}/prompt")
                if r.get("node_errors"):
                    raise RuntimeError(str(r["node_errors"])[:300])
                inflight.append({"pid": r["prompt_id"], "set": set_name,
                                 "it": it, "dest": dest,
                                 "t0": time.time()})
            except Exception as exc:  # noqa: BLE001
                print(f"submit failed {it['slug']}: {exc}", flush=True)
                fails.append(f"{set_name}/{it['slug']}")
                done += 1
        if not inflight:
            continue
        job = inflight.pop(0)
        try:
            while True:
                h = get(f"{HOST}/history/{job['pid']}")
                if job["pid"] in h:
                    break
                time.sleep(3)
            entry = h[job["pid"]]
            if entry.get("status", {}).get("status_str") == "error":
                raise RuntimeError(str(entry.get("status"))[:300])
            images = [x for o in entry.get("outputs", {}).values()
                      for x in o.get("images", [])]
            if not images:
                raise RuntimeError("no image")
            src = RAW / f"{job['set']}-{job['it']['slug']}.png"
            fetch_image(images[0], src)
            to_webp(src, job["dest"])
            done += 1
            avg = (time.time() - started) / done
            eta = avg * (len(todo) - done) / 60
            print(f"[{done}/{len(todo)}] {job['set']}/{job['it']['slug']} "
                  f"avg {avg:.0f}s  eta {eta:.0f} min",
                  flush=True)
        except Exception as exc:  # noqa: BLE001
            slug = job["it"]["slug"]
            attempts[slug] = attempts.get(slug, 0) + 1
            if attempts[slug] < 3:
                gpu.append((job["set"], job["it"], job["dest"]))
            else:
                fails.append(f"{job['set']}/{slug}")
                done += 1
            print(f"retry {slug} ({attempts[slug]}): {exc}", flush=True)
    print("done, failures:", fails, flush=True)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
