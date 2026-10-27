#!/usr/bin/env python3
"""Assemble reviewed zh-en question batches into the single-file practice app.

Reads content/drill/final/batch-*.json (falling back to reviewed/ then raw/),
validates every item, removes duplicate Chinese prompts, and injects the bank
into tools/drill/template.html.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from paths import DRILL_APP, DRILL_CONTENT  # noqa: E402
import audio_sprite  # noqa: E402

HERE = Path(__file__).resolve().parent
TEMPLATE = HERE / "template.html"
WORK = DRILL_CONTENT
OUT_HTML = DRILL_APP / "中译英问题生成器.html"
OUT_JSON = WORK / "questions.json"
OUT_DOCS = DRILL_APP / "index.html"
TRANSLATIONS_PATH = WORK / "translations.json"
TRANSLATIONS = {}
if TRANSLATIONS_PATH.exists():
    TRANSLATIONS = json.loads(TRANSLATIONS_PATH.read_text(encoding="utf-8"))
OLD_FIXES_PATH = WORK / "old-fixes.json"
OLD_FIXES = {}
if OLD_FIXES_PATH.exists():
    OLD_FIXES = json.loads(OLD_FIXES_PATH.read_text(encoding="utf-8"))

CAT_ORDER = [
    "日常起居", "饮食", "出行交通", "工作职场", "购物消费", "居住", "健康",
    "人际社交", "学习", "科技网络", "休闲娱乐", "旅行", "城市生活", "服务求助", "观点讨论",
]
PUNCT = re.compile(r"[\s，。！？、,.!?;；:：\"'“”‘’…（）()《》]+")
QUESTION_HINT = re.compile(
    r"吗|呢|吧|呗|怎么|什么|哪|谁|几|多少|能不能|可不可以|要不要|是不是|"
    r"有没有|会不会|行不行|好不好|如何|多久|几点"
)
GENERIC_NOTES = ("更自然", "更地道", "直译", "意译", "都可以", "差不多", "更常用")


def pick_files() -> list[tuple[Path, dict]]:
    """Prefer final, then reviewed, then raw, skipping unreadable/invalid files."""
    names = sorted({
        f.name
        for sub in ("final", "reviewed", "raw")
        for f in (WORK / sub).glob("batch-*.json")
    })
    out: list[tuple[Path, dict]] = []
    for name in names:
        for sub in ("final", "reviewed", "raw"):
            path = WORK / sub / name
            if not path.exists():
                continue
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except Exception:  # noqa: BLE001
                continue
            if isinstance(data.get("items"), list):
                out.append((path, data))
                break
    return out


def norm_zh(text: str) -> str:
    text = PUNCT.sub("", text).lower()
    return text.replace("这个", "这").replace("那个", "那")


def audio_id(text: str) -> str:
    """Stable file name for one sentence's pronunciation clips."""
    norm = " ".join(text.split()).lower()
    return hashlib.sha1(norm.encode("utf-8")).hexdigest()[:12]


def build_sprites(bank: list[dict]) -> None:
    """每题每音色拼一条 sprite，并把每句的时间区间写回题库。

    逐条母版仍留在 audio/{f,m}/，微信小程序从云存储按条下载靠它；
    网页只引用 sprite，部署文件从 8,772 个降到 2,740 个。
    """
    root = DRILL_APP / "audio"
    sprite_dir = root / "sprites"
    sprite_dir.mkdir(parents=True, exist_ok=True)
    missing = 0
    for question in bank:
        made = {}
        for voice in ("f", "m"):
            picks = []
            for index, answer in enumerate(question["answers"]):
                path = root / voice / f"{answer['audio']}.mp3"
                if path.exists():
                    picks.append((index, answer["audio"], path.read_bytes()))
                else:
                    missing += 1
            if not picks:
                continue
            blob, spans = audio_sprite.concat([chunk for _, _, chunk in picks])
            name = audio_sprite.name_for(
                [f"{answer_id}:{voice}" for _, answer_id, _ in picks])
            (sprite_dir / f"{name}-{voice}.mp3").write_bytes(blob)
            made[voice] = name
            for (index, _, _), span in zip(picks, spans):
                question["answers"][index].setdefault("at", {})[voice] = [
                    round(span[0], 3), round(span[1], 3),
                ]
        if made:
            question["sp"] = made
    if missing:
        print(f"注意：{missing} 条录音还没有生成，对应句子暂时没有语音"
              f"（先跑 make_audio.py）")
    written = {f"{q['sp'][v]}-{v}.mp3" for q in bank if q.get("sp") for v in q["sp"]}
    for stale in sprite_dir.glob("*.mp3"):
        if stale.name not in written:
            stale.unlink()


def render(bank: list[dict]) -> int:
    for q in bank:
        for old_en, new_en, note, zh in OLD_FIXES.get(q["zh"], []):
            for a in q["answers"]:
                if a["en"] == old_en:
                    a["en"] = new_en
                    a["note"] = note
                    a["zh"] = zh
                    break
        for a in q["answers"]:
            a["audio"] = audio_id(a["en"])
            a["zh"] = (a.get("zh") or "").strip() or TRANSLATIONS.get(a["audio"], "")
    build_sprites(bank)
    OUT_JSON.write_text(json.dumps(bank, ensure_ascii=False, indent=1), encoding="utf-8")
    payload = json.dumps(bank, ensure_ascii=False, separators=(",", ":"))
    payload = payload.replace("</", "<\\/").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    template = TEMPLATE.read_text(encoding="utf-8")
    for placeholder in ("__BANK_DATA__", "__BANK_SCRIPT__"):
        if placeholder not in template:
            print(f"模板缺少 {placeholder} 占位符", file=sys.stderr)
            return 1

    # 托管版：题库拆成单独的、可长缓存的脚本文件。用普通 <script src>（不加
    # defer）而不是 fetch，是因为离线包要能在 file:// 下直接打开；defer 会让
    # 它在内联脚本之后执行，BANK 就是 undefined。
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:12]
    bank_name = f"bank.{digest}.js"
    OUT_DOCS.parent.mkdir(parents=True, exist_ok=True)
    (OUT_DOCS.parent / bank_name).write_text(
        "window.NPESL_BANK=" + payload + ";\n", encoding="utf-8")
    for stale in OUT_DOCS.parent.glob("bank.*.js"):
        if stale.name != bank_name:
            stale.unlink()
    hosted = (template
              .replace("__BANK_SCRIPT__", f'<script src="{bank_name}"></script>')
              .replace("__BANK_DATA__", "window.NPESL_BANK"))

    # 单文件版：题库仍然内联，保证一个 HTML 拷到哪都能打开。
    single = template.replace("__BANK_SCRIPT__", "").replace("__BANK_DATA__", payload)

    OUT_HTML.parent.mkdir(parents=True, exist_ok=True)
    OUT_HTML.write_text(single, encoding="utf-8")
    print(f"\n已写入 {OUT_HTML.relative_to(ROOT)}  ({OUT_HTML.stat().st_size / 1024:.0f} KB)")
    print(f"已写入 {OUT_JSON.relative_to(ROOT)}")

    # 托管用副本：apps/drill/index.html，整个目录既是本地可开的页面，也是 Cloudflare Pages 的发布源。
    OUT_DOCS.write_text(hosted, encoding="utf-8")
    print(f"已写入 {OUT_DOCS.relative_to(ROOT)} + {bank_name}"
          f"  ({OUT_DOCS.stat().st_size / 1024:.0f} KB + "
          f"{(OUT_DOCS.parent / bank_name).stat().st_size / 1024:.0f} KB)")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Assemble the zh-en question bank into the single-file app.")
    ap.add_argument("--from-json", action="store_true",
                    help="re-render the HTML from content/drill/questions.json（默认行为）")
    ap.add_argument("--from-batches", action="store_true",
                    help="从批次 JSON 重建题库；会丢掉 extra-questions.json 里的补充题，慎用")
    args = ap.parse_args()

    # questions.json 是已发布的权威题库：批次 JSON 复现不出它（extra-questions
    # 里还有 192 道补充题）。所以默认只能从 questions.json 重渲染 HTML；
    # 真要重建题库必须显式 --from-batches。
    if not args.from_batches:
        if not OUT_JSON.exists():
            print(f"{OUT_JSON} 不存在", file=sys.stderr)
            return 1
        bank = json.loads(OUT_JSON.read_text(encoding="utf-8"))
        if len(bank) < 1000:
            print(f"题量不足 1000（当前 {len(bank)}）", file=sys.stderr)
            return 1
        print(f"从 questions.json 读取 {len(bank)} 题")
        third_path = WORK / "third-answers.json"
        if third_path.exists():
            third = json.loads(third_path.read_text(encoding="utf-8"))
            filled = 0
            for q in bank:
                if len(q["answers"]) == 2 and q["zh"] in third:
                    answer = third[q["zh"]]
                    q["answers"].append({
                        "en": answer["en"],
                        "note": answer["note"],
                        "zh": answer["zh"],
                    })
                    filled += 1
            print(f"补齐第三说法 {filled} 道")
        extra_path = WORK / "extra-questions.json"
        if extra_path.exists():
            extra = json.loads(extra_path.read_text(encoding="utf-8"))
            seen_zh = {norm_zh(q["zh"]) for q in bank}
            seen_en = {
                a["en"].strip().lower()
                for q in bank
                for a in q["answers"]
            }
            added = 0
            for item in extra:
                key = norm_zh(item["zh"])
                if key in seen_zh:
                    continue
                answers = [
                    a for a in item["answers"]
                    if a["en"].strip().lower() not in seen_en
                ]
                if len(answers) < 2:
                    continue
                bank.append({
                    "zh": item["zh"],
                    "scene": item["scene"],
                    "cat": item["cat"],
                    "answers": answers,
                })
                seen_zh.add(key)
                seen_en.update(a["en"].strip().lower() for a in answers)
                added += 1
            print(f"补充疑问词题 {added} 道")
        return render(bank)

    errors: list[str] = []
    warnings: list[str] = []
    bank: list[dict] = []
    seen_zh: dict[str, str] = {}
    cat_counts: dict[str, int] = {}
    per_batch: list[tuple[str, int]] = []
    note_lengths: list[int] = []
    answer_counts: dict[int, int] = {}
    nonquestion = 0
    seen_en: set[str] = set()
    dropped_answers = 0
    dropped_items = 0

    files = pick_files()
    if not files:
        print("no batch files found", file=sys.stderr)
        return 1

    for path, data in files:
        rel = path.relative_to(WORK).as_posix()

        category = data.get("category", "")
        if category not in CAT_ORDER:
            raw = WORK / "raw" / path.name
            if raw.exists():
                try:
                    category = json.loads(raw.read_text(encoding="utf-8")).get("category", category)
                except Exception:  # noqa: BLE001
                    pass
        items = data.get("items")
        if not isinstance(items, list):
            errors.append(f"{rel}: 缺少 items 数组")
            continue
        if category not in CAT_ORDER:
            errors.append(f"{rel}: 未知大类 {category!r}")
            category = category or "未分类"

        kept = 0
        for idx, item in enumerate(items, 1):
            tag = f"{rel} #{idx}"
            if not isinstance(item, dict):
                errors.append(f"{tag}: 不是对象")
                continue
            zh = (item.get("zh") or "").strip()
            scene = (item.get("scene") or "").strip()
            answers = item.get("answers")
            if not zh:
                errors.append(f"{tag}: zh 为空")
                continue
            if len(zh) < 4 or len(zh) > 60:
                warnings.append(f"{tag}: zh 长度异常 {len(zh)} 字: {zh}")
            if "？" not in zh and "?" not in zh and not QUESTION_HINT.search(zh):
                nonquestion += 1
                continue
            if not scene:
                warnings.append(f"{tag}: scene 为空: {zh}")
            if not isinstance(answers, list) or not 2 <= len(answers) <= 3:
                errors.append(f"{tag}: answers 数量 {len(answers) if isinstance(answers, list) else '?'}，应为 2-3")
                continue

            clean = []
            ens = set()
            bad = False
            for a in answers:
                if not isinstance(a, dict):
                    errors.append(f"{tag}: answer 不是对象")
                    bad = True
                    break
                en = (a.get("en") or "").strip()
                note = (a.get("note") or "").strip()
                if not en or not note:
                    errors.append(f"{tag}: en 或 note 为空")
                    bad = True
                    break
                if en.lower() in ens:
                    errors.append(f"{tag}: 同一题 en 重复: {en}")
                    bad = True
                    break
                ens.add(en.lower())
                note_lengths.append(len(note))
                if len(note) < 11:
                    warnings.append(f"{tag}: note 过短 ({len(note)} 字): {en} -> {note}")
                if any(g in note for g in GENERIC_NOTES):
                    warnings.append(f"{tag}: note 可能空泛: {note}")
                clean.append({
                    "en": en,
                    "note": note,
                    "zh": (a.get("zh") or "").strip(),
                })
            if bad:
                continue

            key = norm_zh(zh)
            if key in seen_zh:
                warnings.append(f"{tag}: 与 {seen_zh[key]} 中文重复，已跳过: {zh}")
                continue
            seen_zh[key] = rel

            deduped = []
            for a in clean:
                en_key = a["en"].strip().lower()
                if en_key in seen_en:
                    dropped_answers += 1
                    continue
                deduped.append(a)
            if len(deduped) < 2:
                dropped_items += 1
                continue
            for a in deduped:
                seen_en.add(a["en"].strip().lower())

            bank.append({
                "zh": zh,
                "scene": scene,
                "cat": category,
                "answers": deduped,
            })
            cat_counts[category] = cat_counts.get(category, 0) + 1
            answer_counts[len(deduped)] = answer_counts.get(len(deduped), 0) + 1
            kept += 1
        per_batch.append((rel, kept))

    print(f"读取 {len(files)} 批，保留 {len(bank)} 题")
    print("每批题数: " + " ".join(f"{p.replace('final/batch-','').replace('.json','')}:{n}" for p, n in per_batch))
    print("大类分布:")
    for c in CAT_ORDER:
        print(f"  {c}: {cat_counts.get(c, 0)}")
    print("答案条数: " + ", ".join(f"{k} 条 × {v}" for k, v in sorted(answer_counts.items())))
    if note_lengths:
        print(f"note 长度: 最短 {min(note_lengths)}，最长 {max(note_lengths)}，平均 {sum(note_lengths)/len(note_lengths):.1f}")
    print(f"跳过非问句 {nonquestion} 条")
    print(f"跨题去重：删掉重复英文 {dropped_answers} 条，整题跳过 {dropped_items} 条")
    print(f"错误 {len(errors)} 条，提醒 {len(warnings)} 条")

    for e in errors[:40]:
        print(f"[ERROR] {e}")
    for w in warnings[:60]:
        print(f"[WARN] {w}")
    if len(warnings) > 60:
        print(f"... 另有 {len(warnings) - 60} 条提醒")

    if errors:
        print("\n有结构性错误，不生成 HTML。", file=sys.stderr)
        return 1
    if len(bank) < 1000:
        print(f"\n题量不足 1000（当前 {len(bank)}），不生成 HTML。", file=sys.stderr)
        return 1

    return render(bank)


if __name__ == "__main__":
    raise SystemExit(main())
