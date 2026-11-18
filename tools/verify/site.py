"""Static audit of the built site: links, assets, audio, and page metadata.

Every check here answers a question a reader would notice: does this link go
anywhere, does this sound exist, does this page have a title.  Problems are
collected with a page path and a short reason so a red run names the file to
open, not an internal state variable.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import unquote, urlsplit

AUDIO_HOST = "npesl-audio.pages.dev"
IGNORED_HOSTS = {"www.w3.org"}  # SVG namespace, not a network fetch
VOICE_DIRS = {"f": "h2", "m": "c", "female": "h2", "male": "c"}
APP_PREFIXES = (
    "/phonics/", "/ipa/", "/drill/", "/conversation/",
    "/phenomena/", "/collocation/", "/visual-vocabulary/",
)

A_RE = re.compile(r"<a\b[^>]*?\bhref=\"([^\"]*)\"", re.I | re.S)
SRC_RE = re.compile(r"\bsrc=\"([^\"]*)\"", re.I)
LINK_RE = re.compile(r"<link\b[^>]*?\bhref=\"([^\"]*)\"", re.I | re.S)
IMG_RE = re.compile(r"<img\b[^>]*>", re.I | re.S)
SPRITE_ATTR_RE = re.compile(r'data-sprite-[fm]="([^"]+)"')
FONT_RE = re.compile(r"/fonts/[A-Za-z0-9._-]+\.woff2")
TITLE_RE = re.compile(r"<title>\s*([^<]+?)\s*</title>", re.I | re.S)


@dataclass
class Problem:
    level: str  # FAIL / WARN
    where: str
    kind: str
    detail: str


@dataclass
class SiteReport:
    pages: int = 0
    links: int = 0
    assets: int = 0
    audio_refs: int = 0
    images: int = 0
    fonts: int = 0
    problems: list[Problem] = field(default_factory=list)
    _seen: set[tuple[str, str, str]] = field(default_factory=set)

    def add(self, level: str, where: str, kind: str, detail: str) -> None:
        key = (level, where, f"{kind}:{detail}")
        if key in self._seen:
            return
        self._seen.add(key)
        if len(self.problems) < 500:
            self.problems.append(Problem(level, where, kind, detail))

    def fail(self, where: str, kind: str, detail: str) -> None:
        self.add("FAIL", where, kind, detail)

    def warn(self, where: str, kind: str, detail: str) -> None:
        self.add("WARN", where, kind, detail)

    @property
    def failures(self) -> list[Problem]:
        return [p for p in self.problems if p.level == "FAIL"]

    @property
    def warnings(self) -> list[Problem]:
        return [p for p in self.problems if p.level == "WARN"]


def _json_script(text: str, element_id: str) -> dict:
    match = re.search(
        rf'<script id="{re.escape(element_id)}"[^>]*>(.*?)</script>', text, re.S)
    if not match:
        return {}
    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError:
        return {}


def _resolve(page: Path, raw: str, site: Path) -> Path | None:
    """Resolve a relative/site-absolute URL to a file in the deploy tree."""
    raw = raw.strip()
    if not raw or raw.startswith(("#", "mailto:", "tel:", "javascript:", "data:")):
        return None
    path = unquote(urlsplit(raw).path)
    if not path:
        return None
    target = site / path.lstrip("/") if path.startswith("/") else page.parent / path
    try:
        target = target.resolve()
        target.relative_to(site)
    except (OSError, ValueError):
        return None
    candidates = [target]
    if path.endswith("/") or target.is_dir():
        candidates = [target / "index.html"]
    elif not target.suffix:
        candidates = [target, target.with_suffix(".html"), target / "index.html"]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return None


class SiteAudit:
    def __init__(self, site: Path, audio: Path | None):
        self.site = site.resolve()
        self.audio = audio.resolve() if audio and audio.exists() else None
        self.report = SiteReport()
        self._audio_cache: dict[str, str | None] = {}

    # ---------------------------------------------------------------- audio
    def _audio_problem(self, path: Path) -> str | None:
        key = str(path)
        if key in self._audio_cache:
            return self._audio_cache[key]
        if not path.is_file():
            reason = "文件不存在"
        elif path.stat().st_size < 512:
            reason = f"文件过小（{path.stat().st_size} B）"
        else:
            with path.open("rb") as fh:
                head = fh.read(64)
            reason = "文件是 HTML/文本，不是音频" if head.lstrip()[:1] == b"<" else None
        self._audio_cache[key] = reason
        return reason

    def _check_audio(self, where: str, kind: str, path: Path | None) -> None:
        self.report.audio_refs += 1
        if path is None:
            self.report.fail(where, kind, "音频路径无法解析")
            return
        reason = self._audio_problem(path)
        if reason:
            self.report.fail(where, kind, f"{reason}: {path.name}")

    def _audio_from_url(self, raw: str) -> Path | None:
        parts = urlsplit(raw if not raw.startswith("//") else "https:" + raw)
        if parts.netloc.lower() != AUDIO_HOST:
            return None
        if not parts.path.startswith("/audio/"):
            return None
        if self.audio is None:
            return None
        return self.audio / parts.path.lstrip("/")

    # ---------------------------------------------------------------- pages
    def run(self) -> SiteReport:
        if not self.site.is_dir():
            self.report.fail(str(self.site), "站点", "目录不存在")
            return self.report
        pages = sorted(self.site.rglob("*.html"))
        self.report.pages = len(pages)
        for page in pages:
            self._check_page(page)
        self._check_fonts()
        self._check_home_links()
        return self.report

    def _check_page(self, page: Path) -> None:
        rel = page.relative_to(self.site).as_posix()
        text = page.read_text(encoding="utf-8", errors="replace")

        if "fonts.googleapis.com" in text or "fonts.gstatic.com" in text:
            self.report.fail(rel, "字体", "仍引用 Google Fonts")

        title = TITLE_RE.search(text)
        if not title or not title.group(1).strip():
            self.report.fail(rel, "页面", "缺少非空 <title>")
        if 'name="viewport"' not in text:
            self.report.fail(rel, "页面", "缺少 viewport meta")

        self._check_links(rel, page, text)
        self._check_assets(rel, page, text)
        self._check_sprites(rel, page, text)
        self._check_audio_map(rel, page, text)
        self._check_sprite_map(rel, page, text)

        if rel == "collocation/index.html":
            self._check_collocation(rel, page, text)
        if rel.startswith("phonics/lessons/"):
            pass  # audioMap already covered
        if rel.startswith("drill/"):
            pass  # bank checked once from run()
        if rel.startswith("visual-vocabulary/"):
            self._check_vv(rel, page, text)

    def _check_links(self, rel: str, page: Path, text: str) -> None:
        for raw in A_RE.findall(text):
            raw = raw.strip()
            self.report.links += 1
            if not raw or raw.startswith(("#", "mailto:", "tel:", "javascript:", "data:")):
                continue
            if raw.startswith(("http://", "https://", "//")):
                audio = self._audio_from_url(raw)
                if audio is not None:
                    self._check_audio(rel, "链接音频", audio)
                    continue
                host = urlsplit(raw if not raw.startswith("//") else "https:" + raw).netloc.lower()
                if host in IGNORED_HOSTS:
                    continue
                self.report.warn(rel, "外链", f"外部链接 {raw}")
                continue
            if ".md" in raw.lower():
                self.report.fail(rel, "链接", f"指向 Markdown: {raw}")
                continue
            if _resolve(page, raw, self.site) is None:
                self.report.fail(rel, "链接", f"目标不存在: {raw}")

    def _check_assets(self, rel: str, page: Path, text: str) -> None:
        for raw in SRC_RE.findall(text):
            raw = raw.strip()
            if not raw or raw.startswith(("data:", "javascript:")):
                continue
            self.report.assets += 1
            if raw.startswith(("http://", "https://", "//")):
                audio = self._audio_from_url(raw)
                if audio is not None:
                    self._check_audio(rel, "媒体", audio)
                continue
            if _resolve(page, raw, self.site) is None:
                self.report.fail(rel, "资源", f"src 目标不存在: {raw}")
        for raw in LINK_RE.findall(text):
            raw = raw.strip()
            if not raw or raw.startswith(("data:", "javascript:")):
                continue
            self.report.assets += 1
            if raw.startswith(("http://", "https://", "//")):
                host = urlsplit(raw if not raw.startswith("//") else "https:" + raw).netloc.lower()
                if host == AUDIO_HOST:
                    continue  # preconnect/preload for the audio host
                if host not in IGNORED_HOSTS:
                    self.report.warn(rel, "外链", f"外部样式: {raw}")
                continue
            if _resolve(page, raw, self.site) is None:
                self.report.fail(rel, "资源", f"link href 目标不存在: {raw}")

    def _check_sprites(self, rel: str, page: Path, text: str) -> None:
        for raw in SPRITE_ATTR_RE.findall(text):
            self._check_audio(rel, "sprite", _resolve(page, raw, self.site))

    def _check_audio_map(self, rel: str, page: Path, text: str) -> None:
        if not rel.startswith("phonics/lessons/"):
            return
        for value in _json_script(text, "audioMap").values():
            if isinstance(value, str) and value.startswith(("../audio/", "audio/")):
                self._check_audio(rel, "audioMap", _resolve(page, value, self.site))

    def _check_sprite_map(self, rel: str, page: Path, text: str) -> None:
        sprites = _json_script(text, "spriteMap")
        if not sprites:
            return
        for voice, value in sprites.items():
            if not isinstance(value, str):
                continue
            if rel.startswith(("phenomena/", "collocation/")):
                self._check_audio(rel, "spriteMap", _resolve(page, "audio/" + value, self.site))
            else:
                voice_dir = VOICE_DIRS.get(voice, voice)
                if self.audio is None:
                    self.report.fail(rel, "spriteMap", "音频站目录不存在")
                    continue
                self._check_audio(rel, "spriteMap", self.audio / "audio" / voice_dir / value)

    # ------------------------------------------------------------ per-app
    def _check_collocation(self, rel: str, page: Path, text: str) -> None:
        match = re.search(r'<script src="(data\.[0-9a-f]+\.js)"></script>', text)
        if not match:
            self.report.fail(rel, "collocation", "找不到 data.*.js")
            return
        data_path = page.parent / match.group(1)
        if not data_path.is_file():
            self.report.fail(rel, "collocation", f"缺少 {match.group(1)}")
            return
        raw = data_path.read_text(encoding="utf-8").strip()
        prefix = "window.COLLOCATION_INDEX="
        if raw.startswith(prefix):
            raw = raw[len(prefix):]
        if raw.endswith(";"):
            raw = raw[:-1]
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            self.report.fail(rel, "collocation", f"JSON 解析失败: {exc}")
            return
        spr = data.get("spr") or []
        for k, row in enumerate(spr, 1):
            for voice, value in row.items():
                if voice in ("f", "m") and value:
                    self._check_audio(
                        rel, "collocation", page.parent / "audio" / value)
        for entry in data.get("entries") or []:
            sp = entry.get("sp", 0)
            if not sp:
                continue
            if not isinstance(sp, int) or not 1 <= sp <= len(spr):
                self.report.fail(
                    rel, "collocation",
                    f"词条 {entry.get('id')} 的 sp={sp} 越界")
                continue
            if any(x is not None for x in entry.get("au") or []):
                if not (spr[sp - 1].get("f") and spr[sp - 1].get("m")):
                    self.report.fail(
                        rel, "collocation",
                        f"词条 {entry.get('id')} 有音频但 chunk {sp} 缺音色")

    def _check_vv(self, rel: str, page: Path, text: str) -> None:
        for tag in IMG_RE.findall(text):
            src_match = re.search(r'\bsrc="([^"]+)"', tag, re.I)
            if not src_match:
                continue
            src = src_match.group(1)
            if src.startswith("assets/"):
                self.report.images += 1
                if 'loading="lazy"' not in tag:
                    self.report.fail(rel, "VV", f"图片未懒加载: {src}")
            if _resolve(page, src, self.site) is None:
                self.report.fail(rel, "VV", f"图片不存在: {src}")
        for voice in ("h2", "c"):
            for slug in re.findall(rf'data-audio-{voice}="([^"]+)"', text):
                self._check_audio(
                    rel, "VV", page.parent / "audio" / voice / f"{slug}.mp3")

    # --------------------------------------------------------------- drill
    def check_drill(self) -> None:
        drill = self.site / "drill"
        if not drill.is_dir():
            return
        banks = sorted(drill.glob("bank.*.js"))
        if not banks:
            self.report.fail("drill", "drill", "没有 bank.*.js")
            return
        pattern = re.compile(r'"sp":\{"f":"([0-9a-f]+)","m":"([0-9a-f]+)"\}')
        for bank in banks:
            text = bank.read_text(encoding="utf-8", errors="replace")
            for female, male in pattern.findall(text):
                for voice, digest in (("f", female), ("m", male)):
                    self._check_audio(
                        "drill", "drill",
                        drill / "audio" / "sprites" / f"{digest}-{voice}.mp3")

    # --------------------------------------------------------------- fonts
    def _check_fonts(self) -> None:
        refs: set[str] = set()
        theme = self.site / "theme.css"
        if theme.is_file():
            refs.update(FONT_RE.findall(theme.read_text(encoding="utf-8", errors="replace")))
        for page in self.site.rglob("*.html"):
            refs.update(FONT_RE.findall(
                page.read_text(encoding="utf-8", errors="replace")))
        self.report.fonts = len(refs)
        for ref in sorted(refs):
            if not (self.site / ref.lstrip("/")).is_file():
                self.report.fail("theme.css", "字体", f"缺少 {ref}")

    # ---------------------------------------------------------- home links
    def _check_home_links(self) -> None:
        home = self.site / "index.html"
        if not home.is_file():
            self.report.fail("/", "首页", "缺少 index.html")
            return
        text = home.read_text(encoding="utf-8", errors="replace")
        hrefs = A_RE.findall(text)
        seen = set()
        for href in hrefs:
            href = href.strip()
            if not href or href.startswith(("http://", "https://", "//", "#", "mailto:")):
                continue
            first = urlsplit(href).path.strip("/").split("/")[0]
            if first:
                seen.add(first)
        missing = [p.strip("/") for p in APP_PREFIXES if p.strip("/") not in seen]
        if missing:
            self.report.fail("/", "首页", f"缺少入口: {', '.join(missing)}")


def audit(site: Path, audio: Path | None) -> SiteReport:
    auditor = SiteAudit(site, audio)
    report = auditor.run()
    auditor.check_drill()
    return report
