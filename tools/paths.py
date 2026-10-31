#!/usr/bin/env python3
"""Repository paths — the single place that knows the layout.

    NPESL/
      content/   内容源（Markdown、题库批次 JSON）
      apps/      六个应用（页面、音频、源、小程序）
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
PHRASAL_CONTENT = CONTENT / "phrasal"

# ---- 应用 ----
SITE_APP = APPS / "site"
PHONICS_APP = APPS / "phonics"
IPA_APP = APPS / "ipa"
DRILL_APP = APPS / "drill"
PHENOMENA_APP = APPS / "phenomena"
PHRASAL_APP = APPS / "phrasal"

# ---- 暂存产物（gitignore）----
SITE_OUT = BUILD / "cloudflare-site"
AUDIO_OUT = BUILD / "cloudflare-audio"
OFFLINE_OUT = BUILD / "npesl-offline"
CONVERSATION_OUT = BUILD / "conversation-site"
ESLSE_MIRROR = BUILD / "conversation-eslse"
TTS_CACHE = BUILD / "tts" / "cs"
