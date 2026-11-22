# -*- coding: utf-8 -*-
"""RealESRGAN 超分：1536×960 → 3072×1920（落盘），供网页压到 1920×1200。

    python upscale.py --image out/v2/sink/seed20261401.png --out out/v2/sink/up.png
    python upscale.py --dir out/v2            # 每个场景目录里的第一张 png
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
COMFY_INPUT = pathlib.Path("F:/AIProject/comfyui/input")
MODEL = "RealESRGAN_x4plus.pth"


def graph(image_name: str, prefix: str) -> dict:
    return {
        "1": {"class_type": "LoadImage", "inputs": {"image": image_name}},
        "2": {"class_type": "UpscaleModelLoader", "inputs": {"model_name": MODEL}},
        "3": {"class_type": "ImageUpscaleWithModel",
              "inputs": {"upscale_model": ["2", 0], "image": ["1", 0]}},
        "4": {"class_type": "SaveImage",
              "inputs": {"images": ["3", 0], "filename_prefix": prefix}},
    }


def post(body, url, timeout=60):
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read())


def get(url, timeout=60):
    return json.loads(urllib.request.urlopen(url, timeout=timeout).read())


def upscale(src: pathlib.Path, dest: pathlib.Path) -> None:
    client = str(uuid.uuid4())
    name = f"vvup_{uuid.uuid4().hex[:8]}.png"
    dest.parent.mkdir(parents=True, exist_ok=True)
    image = Image.open(src)
    image.save(COMFY_INPUT / name)
    r = post({"prompt": graph(name, f"vv_up/{src.stem}"), "client_id": client},
             f"{HOST}/prompt")
    if r.get("node_errors"):
        raise SystemExit(f"node error {src.name}: {r['node_errors']}")
    pid = r["prompt_id"]
    started = time.time()
    while True:
        entry = get(f"{HOST}/history/{pid}").get(pid)
        if entry:
            break
        time.sleep(1.5)
    imgs = entry["outputs"]["4"]["images"]
    q = urllib.parse.urlencode({"filename": imgs[0]["filename"],
                                "subfolder": imgs[0].get("subfolder", ""),
                                "type": imgs[0].get("type", "output")})
    data = urllib.request.urlopen(f"{HOST}/view?{q}", timeout=300).read()
    dest.write_bytes(data)
    with Image.open(dest) as out:
        out.resize((3072, 1920), Image.LANCZOS).save(dest, "PNG")
    print(f"  {src.parent.name}: {time.time()-started:.0f}s -> {dest.name}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--image")
    ap.add_argument("--out")
    ap.add_argument("--dir")
    args = ap.parse_args()
    if args.dir:
        root = pathlib.Path(args.dir)
        for scene in sorted(p for p in root.iterdir() if p.is_dir()):
            pngs = sorted(scene.glob("*.png"))
            pngs = [p for p in pngs if p.name != "up.png"]
            if not pngs:
                continue
            upscale(pngs[0], scene / "up.png")
    else:
        upscale(pathlib.Path(args.image), pathlib.Path(args.out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
