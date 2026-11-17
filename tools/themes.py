"""全站主题 id 与首屏切换脚本的唯一来源。

``apps/site/theme.css`` 管每个主题的配色、字体、圆角与阴影，
``apps/site/theme.js`` 用这里的 id 生成菜单。各应用的 ``<head>`` 必须用同一份
id 列表在首屏前写好 data-theme，否则新主题会被当成未知值退回 light，刷新时
先闪一下别的配色。
"""

from __future__ import annotations

# light / dark 是 Solid Glass 的两种光，glass 是同一套材质换成了墨绿底。
# 没存过选择时用 light。顺序就是菜单顺序。
THEME_IDS = ("light", "dark", "glass")
THEME_IDS_JS = "[" + ",".join(f"'{theme}'" for theme in THEME_IDS) + "]"

# Solid Glass 的字体：Geist 配思源黑体。只声明、不预载，浏览器只为真正
# 用到的字族下载文件。
FONT_LINK = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2'
    "?family=Geist:wght@400;500;600;700"
    "&family=Noto+Sans+SC:wght@400;500;600"
    '&display=swap">'
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
        "</script>"
        + (f'\n<link rel="stylesheet" href="{css_href}">' if css_href else "")
        + "\n" + FONT_LINK
    )
