# -*- coding: utf-8 -*-
"""给每个物件抠一张整幅画布大小的轮廓图（alpha），供场景页做“悬浮”。

    python -I tools/vv/masks.py --page room-study
    python -I tools/vv/masks.py --page room-study --style flat
    python -I tools/vv/masks.py --all --style flat

流程：按物件框裁图 → ComfyUI BiRefNet 抠底 → 闭运算补洞 → 覆盖率检查
→ 贴回整幅画布 → 存无损 WebP（只有 alpha，体积很小）。
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
import uuid
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from paths import VV_CONTENT, VISUAL_VOCAB_APP  # noqa: E402

HOST = "http://127.0.0.1:8188"
ROOT = Path(__file__).resolve().parents[2]
COMFY_INPUT = Path("F:/AIProject/comfyui/input")
WORK = ROOT / "build" / "vv-work"
CANVAS = (1920, 1200)
MIN_COVER = 0.03
MAX_COVER = 0.82


def graph(image_name: str, prefix: str) -> dict:
    return {
        "1": {"class_type": "LoadImage", "inputs": {"image": image_name}},
        "2": {"class_type": "LoadBackgroundRemovalModel",
              "inputs": {"bg_removal_name": "birefnet.safetensors"}},
        "3": {"class_type": "RemoveBackground",
              "inputs": {"bg_removal_model": ["2", 0], "image": ["1", 0]}},
        "5": {"class_type": "MaskToImage", "inputs": {"mask": ["3", 0]}},
        "6": {"class_type": "SaveImage",
              "inputs": {"images": ["5", 0], "filename_prefix": prefix}},
    }


def post(body, url, timeout=60):
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read())


def get(url, timeout=60):
    return json.loads(urllib.request.urlopen(url, timeout=timeout).read())


def keep_centre_component(mask: Image.Image) -> Image.Image:
    """只保留最靠近画面中心的那一块（防止把旁边的物件一起带进来）。"""
    small = mask.resize((160, int(160 * mask.height / mask.width)), Image.NEAREST)
    arr = np.array(small) > 127
    h, w = arr.shape
    seen = np.zeros_like(arr, dtype=bool)
    best = None
    best_score = -1
    for y in range(h):
        for x in range(w):
            if not arr[y, x] or seen[y, x]:
                continue
            q = deque([(y, x)])
            seen[y, x] = True
            cells = []
            while q:
                cy, cx = q.popleft()
                cells.append((cy, cx))
                for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                    if 0 <= ny < h and 0 <= nx < w and arr[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
            area = len(cells)
            cy = sum(c[0] for c in cells) / area
            cx = sum(c[1] for c in cells) / area
            dist = ((cy - h / 2) ** 2 + (cx - w / 2) ** 2) ** 0.5
            score = area - dist * 4
            if score > best_score:
                best_score = score
                best = cells
    if not best:
        return mask
    keep = np.zeros((h, w), dtype=bool)
    for cy, cx in best:
        keep[cy, cx] = True
    kept = Image.fromarray((keep * 255).astype("uint8")).resize(mask.size, Image.NEAREST)
    out = Image.new("L", mask.size, 0)
    out.paste(mask, (0, 0), kept)
    return out


def clean_alpha(alpha: Image.Image) -> Image.Image:
    """补洞、去掉零星小块，再用一个椭圆窗口把画面边缘的误判切掉。"""
    m = alpha.point(lambda v: 255 if v > 127 else 0)
    w0, h0 = m.size
    edge = Image.new("L", (w0, h0), 0)
    ImageDraw.Draw(edge).rectangle(
        [w0 * 0.03, h0 * 0.03, w0 * 0.97, h0 * 0.97], fill=255)
    m = Image.composite(m, Image.new("L", (w0, h0), 0), edge)
    m = m.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9))
    w, h = m.size
    win = Image.new("L", (w, h), 0)
    ImageDraw.Draw(win).rectangle(
        [w * 0.13, h * 0.13, w * 0.87, h * 0.87], fill=255)
    m = Image.composite(m, Image.new("L", (w, h), 0), win)
    return keep_centre_component(m)


def scene_path(spec: dict, style: str) -> Path:
    if style:
        return WORK / "style" / style / f'{spec["page"]}.png'
    return VISUAL_VOCAB_APP / spec["dir"] / spec["image"]


def run(spec: dict, style: str, source_style: str = "") -> None:
    if source_style:
        scene_path_ = WORK / "style" / source_style / f'{spec["page"]}.png'
    else:
        scene_path_ = scene_path(spec, style)
    if not scene_path_.exists():
        print("  跳过（没有图）", spec["page"], style)
        return
    page = spec["page"]
    out_dir = VISUAL_VOCAB_APP / spec["dir"] / "assets" / "scenes" / "masks"
    out_dir.mkdir(parents=True, exist_ok=True)

    scene = Image.open(scene_path_).convert("RGB")
    W, H = scene.size
    sx, sy = CANVAS[0] / W, CANVAS[1] / H

    client = str(uuid.uuid4())
    jobs = []
    for w in spec["words"]:
        if "box" not in w:
            continue
        x0, y0, x1, y1 = w["box"]
        x0, x1 = float(x0) / 100 * W, float(x1) / 100 * W
        y0, y1 = float(y0) / 100 * H, float(y1) / 100 * H
        pad_x = (x1 - x0) * 0.18
        pad_y = (y1 - y0) * 0.18
        x0 = max(0, int(x0 - pad_x)); y0 = max(0, int(y0 - pad_y))
        x1 = min(W, int(x1 + pad_x)); y1 = min(H, int(y1 + pad_y))
        crop = scene.crop((x0, y0, x1, y1))
        COMFY_INPUT.mkdir(parents=True, exist_ok=True)
        name = f"vvmask_{page}_{w['slug']}_{uuid.uuid4().hex[:6]}.png"
        crop.save(COMFY_INPUT / name)
        tag = f"{page}/{w['slug']}" + (f"/{style}" if style else "")
        r = post({"prompt": graph(name, f"vv_mask/{tag}"), "client_id": client},
                 f"{HOST}/prompt")
        if r.get("node_errors"):
            print("  node error", w["slug"], r["node_errors"])
            continue
        jobs.append((w, r["prompt_id"], (x0, y0, x1, y1)))

    started = time.time()
    pending = {pid: (w, box) for w, pid, box in jobs}
    kept = 0
    work = WORK / "tmp"
    work.mkdir(parents=True, exist_ok=True)
    while pending:
        for pid, (w, box) in list(pending.items()):
            entry = get(f"{HOST}/history/{pid}").get(pid)
            if not entry:
                continue
            imgs = entry["outputs"]["6"]["images"]
            q = urllib.parse.urlencode({"filename": imgs[0]["filename"],
                                        "subfolder": imgs[0].get("subfolder", ""),
                                        "type": imgs[0].get("type", "output")})
            data = urllib.request.urlopen(f"{HOST}/view?{q}", timeout=120).read()
            tmp = work / f"mask-{page}-{w['slug']}.png"
            tmp.write_bytes(data)
            with Image.open(tmp) as im:
                alpha = clean_alpha(im.convert("L"))
            cover = sum(1 for v in alpha.getdata() if v > 0) / (alpha.width * alpha.height)
            if cover < MIN_COVER or cover > MAX_COVER:
                print(f"  skip {w['slug']} (coverage {cover:.0%})")
                del pending[pid]
                continue
            canvas = Image.new("L", CANVAS, 0)
            x0, y0, x1, y1 = box
            scaled = alpha.resize((max(1, int((x1 - x0) * sx)),
                                   max(1, int((y1 - y0) * sy))), Image.LANCZOS)
            canvas.paste(scaled, (int(x0 * sx), int(y0 * sy)))
            rgba = Image.merge("RGBA", (Image.new("L", CANVAS, 255),) * 3 + (canvas,))
            fname = f"{page}-{w['slug']}" + (f".{style}" if style else "") + ".webp"
            rgba.save(out_dir / fname, "WEBP", lossless=True, method=6)
            if style:
                w.setdefault("masks", {})[style] = f"assets/scenes/masks/{fname}"
            else:
                w["mask"] = f"assets/scenes/masks/{fname}"
            kept += 1
            del pending[pid]
        time.sleep(1.5)
    print(f"{page} [{style or 'photo'}]: {kept}/{len(spec['words'])} masks "
          f"{time.time()-started:.0f}s")


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--page", action="append", default=[])
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--style", default="", choices=["", "flat", "clay", "ink", "pixar", "iso-flat", "iso-pixar", "iso-illust"])
    ap.add_argument("--source-style", default="",
                    choices=["", "flat", "clay", "ink", "pixar", "iso-flat", "iso-pixar", "iso-illust"],
                    help="从某种画风的图抠遮罩，但仍写成默认遮罩（三画风共用）")
    ap.add_argument("--no-write", action="store_true", help="只生成遮罩，不改 content JSON")
    args = ap.parse_args()

    paths = sorted((VV_CONTENT / "scenes").glob("*.json"))
    if not args.all:
        paths = [p for p in paths if json.loads(p.read_text(encoding="utf-8"))["page"]
                 in set(args.page)]
    if not paths:
        ap.error("给出 --page 或 --all")

    for path in paths:
        spec = json.loads(path.read_text(encoding="utf-8"))
        run(spec, args.style, args.source_style)
        if not args.no_write:
            path.write_text(json.dumps(spec, ensure_ascii=False, indent=1) + "\n",
                            encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
