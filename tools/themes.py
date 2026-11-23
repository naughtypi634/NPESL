"""全站主题 id 与首屏切换脚本的唯一来源。

``apps/site/theme.css`` 管每个主题的配色、字体、圆角与阴影，
``apps/site/theme.js`` 用这里的 id 生成菜单。各应用的 ``<head>`` 必须用同一份
id 列表在首屏前写好 data-theme，否则新主题会被当成未知值退回 light，刷新时
先闪一下别的配色。
"""

from __future__ import annotations

# light / dark 两套，材质是 coss ui（平、单色、细边）。
# 没存过选择时用 light；旧的 glass 已下线，存过它的会退回 light。
# 顺序就是菜单顺序。
THEME_IDS = ("light", "dark")
THEME_IDS_JS = "[" + ",".join(f"'{theme}'" for theme in THEME_IDS) + "]"

# Inter 自托管在 /fonts/，中文走系统字体。
# 预载 latin 文件（可变字体，100–900 共用一份）；latin-ext 由主题 CSS
# 的 @font-face 按 unicode-range 按需加载。
FONT_PRELOAD = (
    '<link rel="preload" href="/fonts/inter-latin-wght-normal.woff2" '
    'as="font" type="font/woff2" crossorigin>'
)


def theme_boot(css_href: str | None = None, extra_js: str = "") -> str:
    """首屏前的 data-theme 脚本，可选带 theme.css 的 <link>。

    ``extra_js`` 插在同一个 try 里，给需要顺手恢复别的显隐状态的页面用。
    """
    return (
        "<script>try{var t=localStorage.getItem('npesl-theme');"
        "document.documentElement.setAttribute('data-theme',"
        f"t&&{THEME_IDS_JS}.indexOf(t)>-1?t:'light');"
        + extra_js
        + "}catch(e){document.documentElement.setAttribute('data-theme','light');}"
        "</script>\n"
        + FONT_PRELOAD
        + (f'\n<link rel="stylesheet" href="{css_href}">' if css_href else "")
    )
