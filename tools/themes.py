"""全站主题 id 与首屏切换脚本的唯一来源。

``apps/site/theme.css`` 管每个主题的配色、字体、圆角与阴影，
``apps/site/theme.js`` 用这里的 id 生成菜单。各应用的 ``<head>`` 必须用同一份
id 列表在首屏前写好 data-theme，否则新主题会被当成未知值退回 auto，刷新时
先闪一下别的配色。
"""

from __future__ import annotations

# auto 跟随系统；其余是固定主题，顺序就是菜单顺序。
# editorial / brutal / glass 是整套视觉方向（字体、形状、阴影一起换），
# 其余几个只换配色。
THEME_IDS = ("auto", "editorial", "brutal", "glass", "mono", "bright", "sepia", "dark")
THEME_IDS_JS = "[" + ",".join(f"'{theme}'" for theme in THEME_IDS) + "]"

# 三个方向要用的字体。只声明、不预载：浏览器只为当前主题真正引用的字族
# 下载文件，切到别的主题不受影响。
FONT_LINK = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2'
    "?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700"
    "&family=Noto+Serif+SC:wght@400;600;700"
    "&family=Bricolage+Grotesque:opsz,wght@12..96,400"
    ";12..96,500;12..96,700;12..96,800"
    "&family=Plus+Jakarta+Sans:wght@400;500;600;800"
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
        f"t&&{THEME_IDS_JS}.indexOf(t)>-1?t:'auto');"
        + extra_js
        + "}catch(e){document.documentElement.setAttribute('data-theme','auto');}"
        "</script>"
        + (f'\n<link rel="stylesheet" href="{css_href}">' if css_href else "")
        + "\n" + FONT_LINK
    )
