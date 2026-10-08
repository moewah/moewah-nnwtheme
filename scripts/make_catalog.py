#!/usr/bin/env python3
"""Generate a style catalogue page for the theme.

The catalogue is the theme's spec sheet: every selector `src/stylesheet.css`
declares, demonstrated once, plus a section that lays out every pair of blocks
for the spacing audit to measure. It is a fixture, not something the theme
ships, so it is not built into `dist/` — the checker generates it into a
temporary directory when it needs one, and this command is for looking at it:

    python3 scripts/make_catalog.py             # temp dir, prints the path
    python3 scripts/make_catalog.py --out DIR   # somewhere you choose

It renders the same CSS the bundle ships, with one adjustment: the `@supports`
platform gates are rewritten so the macOS branch always wins, in any browser,
whatever it answers for `-webkit-touch-callout` — and `[[font-size]]`, which is
iOS-only, is substituted so it does not appear as a literal token. That rewrite
is for the human opening the page; the checker ignores it and re-inlines the
real theme over core.css.
"""

import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import inline_fonts  # noqa: E402  (same directory; keeps the catalogue honest)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE = os.path.join(ROOT, "src", "template.html")
CATALOG_BODY = os.path.join(ROOT, "scripts", "catalog_body.html")
STYLESHEET = os.path.join(ROOT, "src", "stylesheet.css")
OUT_HTML_NAME = "catalog.html"
OUT_CSS_NAME = "catalog.css"

# Rewrite the platform gates so the macOS block is always taken. The `not`
# variant must go first — it contains the plain variant as a substring.
MAC_GATE = "@supports not (-webkit-touch-callout: none)"
IOS_GATE = "@supports (-webkit-touch-callout: none)"

SAMPLE_IMAGE = (
    "data:image/svg+xml;utf8,"
    "<svg xmlns='http://www.w3.org/2000/svg' width='960' height='540'>"
    "<rect width='960' height='540' fill='%23c9c9c2'/>"
    "<rect x='24' y='24' width='912' height='492' fill='none' stroke='%231d1f21' stroke-width='2'/>"
    "<text x='480' y='285' font-family='monospace' font-size='26' fill='%231d1f21' "
    "text-anchor='middle'>FIGURE · 16:9</text></svg>"
)

# The article-ish metadata the page needs, so the fixture can demonstrate the
# byline, the date, the footer and the like without a real article.
VALUES = {
    "title": "样式清单 · MoeWah 主题",
    "preferred_link": "https://moewah.com/",
    "feed_link": "https://moewah.com/",
    "feed_link_title": "MoeWah",
    "byline": "By 老鱼",
    "avatar_src": SAMPLE_IMAGE,
    "date_medium": "2026-10-03",
    "time_short": "21:54",
    "external_link": "https://moewah.com/",
    "external_link_label": "Source:",
    "external_link_stripped": "moewah.com",
    "dateline_style": "articleDateline",
    "text_size_class": "largeText",
}

SHELL = """<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{title}</title>
<link rel="stylesheet" href="catalog.css" />
<style>
html,body{{margin-top:0;margin-bottom:0}}
/* Catalogue annotations. These live here, not in the theme, so that
   src/stylesheet.css stays exactly what ships. */
.spec-note{{margin:34px 0 0;padding:12px 14px;border:1px dashed var(--hair);font-size:.86em;color:var(--soft)}}
.spec-line{{margin:30px 0 8px;padding-top:10px;border-top:1px dashed var(--hair);font-family:var(--font-mono);font-size:.72em;line-height:1.6;letter-spacing:.02em;color:var(--faint)}}
.spec-line code{{padding:0;border:0;background:none;font-size:1em;color:var(--ink)}}
.spec-line strong{{font-weight:600}}
</style>
</head>
<body>
{content}
</body>
</html>
"""


def main() -> int:
    args = sys.argv[1:]
    if "--out" in args:
        out_dir = args[args.index("--out") + 1]
    elif args:
        print("usage: python3 scripts/make_catalog.py [--out DIR]", file=sys.stderr)
        return 1
    else:
        out_dir = tempfile.mkdtemp(prefix="moewah-catalog-")

    # Fonts inlined as data: URIs, exactly as the bundle ships them — the
    # catalogue is where the theme is looked at, so it must not be a friendlier
    # environment than the app (it was, and that hid the fact that a theme's
    # bundled font files never load in NetNewsWire).
    css = inline_fonts.build(verbose=False)
    with open(STYLESHEET) as fh:
        css += fh.read()

    css = css.replace(MAC_GATE, "@supports (display: block)")
    css = css.replace(IOS_GATE, "@supports (display: -webkit-nonsense)")
    css = css.replace("[[font-size]]", "17")

    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, OUT_CSS_NAME), "w") as fh:
        fh.write(css)

    with open(TEMPLATE) as fh:
        template = fh.read()

    with open(CATALOG_BODY) as fh:
        body = fh.read().replace("__IMAGE__", SAMPLE_IMAGE)

    # The catalogue renders its byline with a link, so `.byline a` is demonstrated
    # where it actually lives (inside .record) rather than re-staged in the body —
    # inside .articleBody it would lose to `.articleBody a` on source order.
    values = {**VALUES, "byline": 'By <a href="https://moewah.com/">老鱼</a>', "body": body}
    content = template
    for key, value in values.items():
        content = content.replace(f"[[{key}]]", value)

    with open(os.path.join(out_dir, OUT_HTML_NAME), "w") as fh:
        fh.write(SHELL.format(title=VALUES["title"], content=content))

    print(f"catalog -> {os.path.join(out_dir, OUT_HTML_NAME)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
