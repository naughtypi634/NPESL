# -*- coding: utf-8 -*-
"""Merge the 48 built lessons + the index into one self-contained HTML file.

Every lesson page already carries its own recording as base64 inside a
<script id="audioMap"> block, so the merged file needs no external assets.
The lessons are stored verbatim in <script type="text/plain"> blocks and
handed to an iframe one at a time, which keeps the original player code
untouched and only one document alive in memory.
"""

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent
BASE = ROOT.parent
LESSONS_DIR = BASE / "lessons"
INDEX = BASE / "index.html"
OUT = BASE / "自然拼读阅读训练-成人A1-单文件版.html"

SHELL_CSS = """
  body.viewing { overflow: hidden; }
  #viewer { position: fixed; inset: 0; z-index: 10; display: flex;
    flex-direction: column; background: var(--bg); }
  #viewer[hidden] { display: none; }
  .bar { flex: none; display: flex; align-items: center; gap: 10px;
    height: 52px; box-sizing: content-box;
    padding-top: env(safe-area-inset-top, 0px);
    padding-left: max(10px, env(safe-area-inset-left, 0px));
    padding-right: max(16px, env(safe-area-inset-right, 0px));
    border-bottom: 1px solid var(--rule); background: var(--bg); }
  #back { -webkit-appearance: none; appearance: none; flex: none;
    border: 0; background: none; color: var(--blue); font-family: var(--font);
    font-size: 16px; padding: 8px 6px; cursor: pointer; }
  #vlabel { flex: 1; min-width: 0; font-size: 14px; color: var(--muted);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #frame { flex: 1; width: 100%; border: 0; display: block;
    background: var(--bg); }
"""

SHELL_JS = """
  (function () {
    var frame = document.getElementById("frame");
    var viewer = document.getElementById("viewer");
    var vlabel = document.getElementById("vlabel");
    var back = document.getElementById("back");
    var stored = {};

    Array.prototype.forEach.call(
      document.querySelectorAll('script[data-lesson]'),
      function (node) {
        stored[node.getAttribute("data-lesson")] = node.textContent;
      }
    );

    function labelFor(num) {
      var row = document.querySelector('a.row[data-lesson="' + num + '"]');
      if (!row) return "";
      var en = row.querySelector(".en");
      var zh = row.querySelector(".zh");
      return (en ? en.textContent : "") + (zh ? " · " + zh.textContent : "");
    }

    function open(num, push) {
      var raw = stored[num];
      if (raw === undefined) return;
      vlabel.textContent = labelFor(num);
      frame.srcdoc = raw.replace(/<\\\\\\/script>/g, "<\\/script>");
      viewer.hidden = false;
      document.body.classList.add("viewing");
      if (push !== false) history.pushState({ num: num }, "", "#/" + num);
      else history.replaceState({ num: num }, "", "#/" + num);
      window.scrollTo(0, 0);
    }

    function close(push) {
      frame.removeAttribute("srcdoc");
      viewer.hidden = true;
      vlabel.textContent = "";
      document.body.classList.remove("viewing");
      if (push !== false) history.pushState({}, "", "#/");
    }

    document.addEventListener("click", function (event) {
      var row = event.target.closest && event.target.closest("a.row[data-lesson]");
      if (!row) return;
      event.preventDefault();
      open(row.getAttribute("data-lesson"));
    });

    back.addEventListener("click", function () { close(); });

    function route() {
      var match = location.hash.match(/^#\\/([0-9]{2})$/);
      if (match) open(match[1], false);
      else close(false);
    }

    window.addEventListener("popstate", route);
    route();
  })();
"""


def lesson_files():
    found = []
    for path in sorted(LESSONS_DIR.glob("*.html")):
        match = re.match(r"^(\d{2})-", path.name)
        if not match:
            raise SystemExit(f"unexpected lesson file name: {path.name}")
        found.append((match.group(1), path))
    if len(found) != 48:
        raise SystemExit(f"expected 48 lessons, found {len(found)}")
    return found


def main():
    index = INDEX.read_text(encoding="utf-8")
    style = re.search(r"<style>(.*?)</style>", index, re.S)
    page = re.search(
        r'<div class="page">(.*)</div>\s*</body>\s*</html>\s*$', index, re.S
    )
    if not style or not page:
        raise SystemExit("cannot split index.html")

    listing = re.sub(
        r'href="lessons/(\d{2})-[^"]*\.html"',
        lambda m: f'href="#/{m.group(1)}" data-lesson="{m.group(1)}"',
        page.group(1),
    )

    blocks = []
    total = 0
    for num, path in lesson_files():
        raw = path.read_text(encoding="utf-8")
        if "<!--" in raw:
            raise SystemExit(f"{path.name}: comment sequence would break the raw text block")
        body = raw.replace("</script>", "<\\/script>")
        total += len(path.read_bytes())
        blocks.append(f'<script type="text/plain" data-lesson="{num}">{body}</script>')

    document = (
        "<!doctype html>\n"
        '<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, '
        'viewport-fit=cover">\n'
        "<title>自然拼读阅读训练 · 成人 A1</title>\n"
        f"<style>{style.group(1)}{SHELL_CSS}</style>\n</head>\n<body>\n"
        f'<div class="page">{listing}</div>\n'
        '<div id="viewer" hidden>\n'
        '<div class="bar"><button id="back" type="button">‹ 目录</button>'
        '<span id="vlabel"></span></div>\n'
        '<iframe id="frame" title="课程内容" allow="autoplay"></iframe>\n'
        "</div>\n"
        + "\n".join(blocks)
        + "\n<script>"
        + SHELL_JS
        + "</script>\n</body>\n</html>\n"
    )
    OUT.write_text(document, encoding="utf-8")
    print(f"built {OUT.name}: {OUT.stat().st_size / 1024 / 1024:.1f} MB "
          f"({len(blocks)} lessons, source {total / 1024 / 1024:.1f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
