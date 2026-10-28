#!/usr/bin/env python3
"""给题库逐题打 chip，并把 content/drill/topup/ 的补题合并进 questions.json。

    python -I tools/drill/tag_chips.py                # 只统计，不写
    python -I tools/drill/tag_chips.py --write        # 写 chip 到 questions.json
    python -I tools/drill/tag_chips.py --write --merge  # 再合并 topup 补题

合并按中文题干和英文句双重去重；已存在的题不会重复加。
"""

from __future__ import annotations

import argparse
import collections
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "content" / "drill"
BANK = WORK / "questions.json"
TOPUP = WORK / "topup"
CHIPS = WORK / "chips.json"

PUNCT = re.compile(r"[\s，。！？、,.!?;；:：\"'“”‘’…（）()《》【】\-—]+")


def norm(text: str) -> str:
    return PUNCT.sub("", text).lower()


def has(pattern: str, text: str) -> bool:
    return re.search(pattern, text) is not None


def assign(q: dict) -> str:
    cat, scene, zh = q["cat"], q.get("scene", ""), q["zh"]
    t = f"{scene} {zh}"
    if cat == "工作职场":
        if has(r"面试|简历|招聘|offer|录用|背调|试用期|转正|学历|工作经验|期望工资|HR", t):
            return "interview"
        if has(r"会议|开会|汇报|项目|PPT|方案|进度|截止|deadline|演示|视频会|电话会|排期", t):
            return "meetings"
        if has(r"客户|甲方|供应商|合同|谈判|出差|商务|订单|报价|合作|签约|物流", t):
            return "clients"
        if has(r"报销|发票|财务|社保|公积金|行政|采购|考勤|工资|请假|加班|调休|年假|病假|排班|上班时间|下班|远程|在家办公|入职|第一天|工位|门禁", t):
            return "admin"
        return "office"
    if cat == "旅行":
        if has(r"机场|航班|登机|安检|转机|海关|出入境|值机|托运|航站楼|免税", t):
            return "airport"
        if has(r"高铁|火车|车站|站台|车厢|车票|列车|大巴|长途", t):
            return "station"
        if has(r"酒店|民宿|旅馆|入住|退房|前台|房间|房卡|押金|住宿", t):
            return "hotel"
        if has(r"签证|护照|换汇|换钱|汇率|银行|取款|邮局|明信片|电话卡|流量|保险", t):
            return "errands"
        if has(r"景点|景区|游客中心|门票|导游|拍照|参观|开放|博物馆|古镇|索道|旅行团|山脚|码头|古城|讲解", t):
            return "sights"
        if has(r"吃|餐厅|饭|菜|早餐|夜宵|小吃|小费|咖啡", t):
            return "dining"
        if has(r"买|店|纪念品|特产|退税|价格|刷卡|商场|摊", t):
            return "shopping"
        if has(r"药|医院|诊所|生病|感冒|肚子", t):
            return "pharmacy"
        return "transit"
    if cat == "出行交通":
        if has(r"机场|航班|登机|安检|托运|值机|航站楼", t):
            return "airport"
        if has(r"高铁|火车|车站|站台|车厢|车票|列车", t):
            return "station"
        return "transit"
    if cat == "饮食":
        return "dining"
    if cat == "购物消费":
        return "shopping"
    if cat == "居住":
        return "housing"
    if cat == "健康":
        return "pharmacy" if has(r"药|药师|药店", t) else "doctor"
    if cat == "人际社交":
        if has(r"同事", t):
            return "office"
        if has(r"邻居|物业|小区|保安|楼道|电梯", t):
            return "housing"
        if has(r"室友", t):
            return "home"
        return "social"
    if cat == "学习":
        return "study"
    if cat == "科技网络":
        if has(r"客服|网费|宽带|维修|退款|投诉|报修", t):
            return "errands"
        return "digital"
    if cat == "休闲娱乐":
        return "leisure"
    if cat in ("城市生活", "服务求助"):
        return "errands"
    if cat == "观点讨论":
        if has(r"同事|茶水间|午休|加班|跳槽|领导|老板", t):
            return "office"
        return "social"
    if cat == "日常起居":
        return "home"
    return "social"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="把 chip 写回 questions.json")
    ap.add_argument("--merge", action="store_true", help="合并 topup 补题（隐含 --write）")
    args = ap.parse_args()
    write = args.write or args.merge

    bank = json.loads(BANK.read_text(encoding="utf-8"))
    before = len(bank)

    # 补题文件里的 chip 是作者显式指定的，优先级最高；
    # 其余题（原有的 1,370 题）按规则归类，已有合法 chip 的不覆盖。
    valid = set(json.loads(CHIPS.read_text(encoding="utf-8"))["chips"])
    topup_chip: dict[str, str] = {}
    for path in sorted(TOPUP.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        chip = data.get("chip") if isinstance(data, dict) else None
        if not chip:
            continue
        for item in data.get("items", []):
            topup_chip[norm(item["zh"])] = chip

    for q in bank:
        explicit = topup_chip.get(norm(q["zh"]))
        if explicit:
            q["chip"] = explicit
        elif q.get("chip") not in valid:
            q["chip"] = assign(q)
    counts = collections.Counter(q["chip"] for q in bank)
    print(f"现有 {len(bank)} 题：" + "  ".join(f"{k} {v}" for k, v in counts.most_common()))

    added = 0
    skipped = 0
    if args.merge:
        seen_zh = {norm(q["zh"]) for q in bank}
        seen_en = {a["en"].strip().lower() for q in bank for a in q.get("answers", [])}
        for path in sorted(TOPUP.glob("*.json")):
            data = json.loads(path.read_text(encoding="utf-8"))
            items = data.get("items", []) if isinstance(data, dict) else data
            chip = data.get("chip") if isinstance(data, dict) else None
            if not chip:
                print(f"跳过 {path.name}：没有 chip 字段")
                continue
            for item in items:
                key = norm(item["zh"])
                if key in seen_zh:
                    skipped += 1
                    continue
                answers = []
                for a in item.get("answers", []):
                    en = a["en"].strip()
                    if en.lower() in seen_en:
                        skipped += 1
                        continue
                    answers.append({"en": en, "note": a.get("note", ""), "zh": a.get("zh", "")})
                if len(answers) < 2:
                    skipped += 1
                    continue
                bank.append({
                    "zh": item["zh"],
                    "scene": item.get("scene", ""),
                    "cat": item.get("cat", ""),
                    "chip": chip,
                    "answers": answers,
                })
                seen_zh.add(key)
                seen_en.update(a["en"].lower() for a in answers)
                added += 1
        print(f"补题合并：新增 {added}，跳过 {skipped}（与现有重复）")
        counts = collections.Counter(q["chip"] for q in bank)
        print(f"合并后 {len(bank)} 题：" + "  ".join(f"{k} {v}" for k, v in counts.most_common()))

    if write:
        BANK.write_text(json.dumps(bank, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"已写入 {BANK.relative_to(ROOT)}（{before} → {len(bank)}）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
