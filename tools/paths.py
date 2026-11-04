#!/usr/bin/env python3
"""Repository paths — the single place that knows the layout.

    NPESL/
      content/   内容源（Markdown、题库批次 JSON）
      apps/      六个应用（页面、音频、源）
      tools/     构建、部署、校验脚本
      build/     暂存产物（gitignore）

Every build script imports from here instead of joining `ROOT / "..."` by
hand, so moving a directory is a one-file change.

`python -I` does not put the script's directory on `sys.path`, so callers must
insert `tools/` themselves before importing this module.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
APPS = ROOT / "apps"
TOOLS = ROOT / "tools"
BUILD = ROOT / "build"

# ---- 内容源 ----
PHONETICS_MD = CONTENT / "phonetics" / "Pronunciation音标表.md"
PHONETICS_PDF = CONTENT / "phonetics" / "Pronunciation音标表.pdf"
CONVERSATION_CONTENT = CONTENT / "conversation"
DRILL_CONTENT = CONTENT / "drill"
COLLOCATION_CONTENT = CONTENT / "collocation"
CHARTS_CONTENT = CONTENT / "charts"
TRAVEL_CONTENT = CONTENT / "travel"

# ---- 应用 ----
SITE_APP = APPS / "site"
PHONICS_APP = APPS / "phonics"
IPA_APP = APPS / "ipa"
DRILL_APP = APPS / "drill"
PHENOMENA_APP = APPS / "phenomena"
COLLOCATION_APP = APPS / "collocation"
CONVERSATION_APP = APPS / "conversation"
CHARTS_APP = APPS / "charts"
TRAVEL_APP = APPS / "travel"

PHONICS_AUDIO = PHONICS_APP / "audio"
PHONICS_SOURCE_AUDIO = PHONICS_APP / "source" / "audio"
IPA_AUDIO = IPA_APP / "audio"
DRILL_AUDIO = DRILL_APP / "audio"
PHENOMENA_AUDIO = PHENOMENA_APP / "audio"
COLLOCATION_AUDIO = COLLOCATION_APP / "audio"
TRAVEL_AUDIO = TRAVEL_APP / "audio"

# ---- 内容文件 ----
DRILL_BANK_JSON = DRILL_CONTENT / "questions.json"
DRILL_CHIPS_JSON = DRILL_CONTENT / "chips.json"
DRILL_TOPUP = DRILL_CONTENT / "topup"

# ---- 公开地址 ----
SITE_URL = "https://npesl.pages.dev"
AUDIO_URL = "https://npesl-audio.pages.dev"

# ---- 暂存产物（gitignore）----
SITE_OUT = BUILD / "cloudflare-site"
AUDIO_OUT = BUILD / "cloudflare-audio"
# Conversation Starters 的页面就是应用目录本身（source/ 在旁边），
# 不再经过 build/ 暂存。
CONVERSATION_OUT = CONVERSATION_APP
TTS_CACHE = BUILD / "tts" / "cs"
AUDIT_DIR = BUILD / "audit"
