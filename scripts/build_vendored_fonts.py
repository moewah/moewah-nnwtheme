#!/usr/bin/env python3
"""Verify the theme's font binaries and write their @font-face CSS.

Both faces the theme embeds are committed binaries, described by MANIFEST
below. This script checks each one against its pinned sha256 and writes
`src/fonts/vendored-fonts.css` — that stylesheet is inlined into the theme's own
by inline_fonts.py, and it is the only place these faces are declared.

    IBM Plex Sans SC  300 / 400 / 600          the CJK face
    Ioskeley Mono     400 / 500 / 600          metadata, code, captions (mono)
                      +400 / 500 italic        emphasis inside those

The mono italics exist because text inside code, figcaption and th really can be
emphasised, and without an italic face the renderer fakes one by shearing the
uprights. 400 and 500 are the two that occur (th and h4-h6 ask for 500, the rest
400); 600 italic would need `<code><strong><em>`, which is not worth 139 KB.
The CJK face has no italic — nothing does — so Chinese emphasis stays synthetic,
which is also what keeps a mixed Chinese/Latin emphasised phrase uniformly
slanted instead of half italic, half upright.

The Latin text is not embedded at all: NetNewsWire is Apple-only, so Avenir is
already on the device, and src/stylesheet.css assembles the four weights it
needs from those system faces with local().

It copies nothing and needs no network: a fresh clone can build, because the
binaries are in `src/fonts/`. Run it after replacing a binary:

    python3 scripts/build_vendored_fonts.py            # verify + write CSS
    python3 scripts/build_vendored_fonts.py --hashes   # print the current hashes

A file whose sha256 is not the pinned one is refused rather than shipped, and
the error prints the hash it found: paste that into MANIFEST, re-read the
licence of whatever you replaced, and run again.

Licences — both faces are under the SIL Open Font License 1.1, and one copy of
the licence travels per face (`OFL-*.txt`, copied into the bundle):

  - IBM Plex declares "Plex", which clause 3 withholds from any Modified
    Version — and the OFL counts *deleting from* a font (subsetting) as making
    one. So this face is embedded whole and stays unrenamed.
  - Ioskeley Mono is a build of Iosevka. Its own licence (copyright Ahmed
    Hatem) declares no reserved name, and the binary retains Iosevka's upstream
    notice, whose licence text travels beside it.

Nothing here modifies anything: every file goes in byte for byte, under its own
name, which is why no renaming is owed — and why none of these faces can be
trimmed later without also renaming it.
"""

import hashlib
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_DIR = os.path.join(ROOT, "src", "fonts")
OUT_CSS = os.path.join(FONT_DIR, "vendored-fonts.css")

# Keeps the CJK face off Latin, digits and ASCII punctuation — those stay on
# Ioskeley Mono — so only Han characters, kana and CJK punctuation
# switch to it. Listing a range adds no glyphs: it only says "this face may be
# used here". Measured coverage inside these ranges (identical for all three
# weights): 基本区 20971/20992, 扩展A 6592/6592, 假名 184/192, 部首 115/128,
# 标点 43/64, 全角 100/240, 扩B+ 204/64032. 笔画 U+31C0-31EF is empty in this
# font, so it is not listed; characters the face has no drawing for fall through
# to PingFang SC on their own.
CJK_RANGE = (
    "U+2E80-2EFF, U+3000-303F, U+3040-30FF, U+3100-312F, U+3200-33FF, "
    "U+3400-4DBF, U+4E00-9FFF, U+F900-FAFF, U+FE10-FE1F, U+FE30-FE4F, "
    "U+FF00-FFEF, U+20000-2FA1F"
)

FETCH_IOSKELEY = (
    "curl -LO https://github.com/ahatem/IoskeleyMono/releases/download/v2.1.0/"
    "IoskeleyMono-Web.zip && unzip -j IoskeleyMono-Web.zip 'WOFF2/Ioskeley*'"
)

MANIFEST = [
    {
        "file": "ibmplexsanssc-300.woff2",
        "family": "IBM Plex Sans SC",
        "weight": "300",
        "range": CJK_RANGE,
        "sha256": "8c4becdf79d1effb55cee5724acfc376845186709f87ed0f1d21a97f861a95ce",
        "note": "IBM Plex Sans SC Light, unhinted woff2 (IBM Plex release)",
        "refresh": "take the file from IBM Plex's own release",
    },
    {
        "file": "ibmplexsanssc-400.woff2",
        "family": "IBM Plex Sans SC",
        "weight": "400",
        "range": CJK_RANGE,
        "sha256": "39967c10c916cc9166b5b0c58e605eb722c8d271f263b42e93af9836dca3d352",
        "note": "IBM Plex Sans SC Regular, unhinted woff2 (IBM Plex release)",
        "refresh": "take the file from IBM Plex's own release",
    },
    {
        "file": "ibmplexsanssc-600.woff2",
        "family": "IBM Plex Sans SC",
        "weight": "600",
        "range": CJK_RANGE,
        "sha256": "f7df201a9426f4a6c338ba1634d655688ad32a310a6f0730e1c45eb367a8fe52",
        "note": "IBM Plex Sans SC SemiBold, unhinted woff2 (IBM Plex release)",
        "refresh": "take the file from IBM Plex's own release",
    },
    {
        "file": "ioskeleymono-400.woff2",
        "family": "Ioskeley Mono",
        "weight": "400",
        "range": None,
        "sha256": "f8f147c0f0818dc67a4bb055b4ba805df4914b05cb37601fdddf003a3e2bca2f",
        "note": "Ioskeley Mono Regular, v2.1.0 (IoskeleyMono-Web.zip)",
        "refresh": FETCH_IOSKELEY,
    },
    {
        "file": "ioskeleymono-500.woff2",
        "family": "Ioskeley Mono",
        "weight": "500",
        "range": None,
        "sha256": "860010b4cdbe4a210cdf57343f84e40ad4a382c2820940952743070a93984f50",
        "note": "Ioskeley Mono Medium, v2.1.0 (IoskeleyMono-Web.zip)",
        "refresh": FETCH_IOSKELEY,
    },
    {
        "file": "ioskeleymono-600.woff2",
        "family": "Ioskeley Mono",
        "weight": "600",
        "range": None,
        "sha256": "2cf826d93efb71d4d28362176a073f32d8ff46f3671fbb4e0ce7fd4a01984828",
        "note": "Ioskeley Mono SemiBold, v2.1.0 (IoskeleyMono-Web.zip)",
        "refresh": FETCH_IOSKELEY,
    },
    {
        "file": "ioskeleymono-400-italic.woff2",
        "family": "Ioskeley Mono",
        "weight": "400",
        "style": "italic",
        "range": None,
        "sha256": "a639ec84dae0846e202896c27034c85a3eaf8ec61350f454c7d0820223db5c15",
        "note": "Ioskeley Mono Italic, v2.1.0 (IoskeleyMono-Web.zip)",
        "refresh": FETCH_IOSKELEY,
    },
    {
        "file": "ioskeleymono-500-italic.woff2",
        "family": "Ioskeley Mono",
        "weight": "500",
        "style": "italic",
        "range": None,
        "sha256": "c4ea94fb430830f8e8bbb9aa959b846aee56d915d61cecf1b2aa0ad67f2e8d39",
        "note": "Ioskeley Mono Medium Italic, v2.1.0 (IoskeleyMono-Web.zip)",
        "refresh": FETCH_IOSKELEY,
    },
]

HEADER = """/* Generated by scripts/build_vendored_fonts.py — do not edit by hand.

   Every face the theme embeds, whole and unmodified, each with its sha256
   pinned in that script and a copy of the SIL Open Font License 1.1 travelling
   with it in this folder:

     IBM Plex Sans SC  300/400/600   the CJK face          OFL-IBM-Plex-Sans-SC.txt
     Ioskeley Mono     400/500/600   metadata and code     OFL-Ioskeley-Mono.txt
                      +400/500 italic                       OFL-Iosevka.txt

   Latin text is left to the system: NetNewsWire is Apple-only, and
   src/stylesheet.css assembles Avenir's weights with local(). IBM Plex declares
   the reserved font name "Plex", which the licence withholds from Modified
   Versions — and the OFL counts *deleting from* a font, i.e. subsetting, as
   making one. So none of these files is subset or converted, which is also why
   none of them can be trimmed to save weight later without being renamed.
   Ioskeley Mono is a build of Iosevka: it carries Ahmed Hatem's licence and
   retains Iosevka's upstream notice, so both texts ship.

   The CJK faces carry a unicode-range fence so Latin, digits and ASCII
   punctuation stay on the system sans: only Han characters, kana and CJK punctuation
   switch faces. Characters Plex Sans SC has no drawing for fall through to
   PingFang SC. The mono faces carry no fence — they should claim everything
   they have, box drawing and arrows included. */
"""

FACE = """
@font-face {{
\tfont-family: '{family}';
\tfont-style: {style};
\tfont-weight: {weight};
\tfont-display: swap;
\tsrc: url(fonts/{file}) format('woff2');{range}
}}
"""


def digest(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    if "--hashes" in sys.argv[1:]:
        for face in MANIFEST:
            path = os.path.join(FONT_DIR, face["file"])
            found = digest(path) if os.path.isfile(path) else "(missing)"
            print(f"{found:64}  {face['file']}")
        return 0

    unknown = [a for a in sys.argv[1:] if not a.startswith("-")]
    if unknown:
        print(f"This script takes no arguments (got {unknown[0]}).", file=sys.stderr)
        print("The binaries live in src/fonts/; use --hashes to print their hashes.", file=sys.stderr)
        return 1

    problems = []
    for face in MANIFEST:
        path = os.path.join(FONT_DIR, face["file"])
        if not os.path.isfile(path):
            problems.append(f"{face['file']} is missing (looked in src/fonts/)")
            continue
        found = digest(path)
        if found != face["sha256"]:
            problems.append(
                f"{face['file']}\n"
                f"    pinned {face['sha256']}\n"
                f"    found  {found}"
            )
    if problems:
        print("Refusing to write vendored-fonts.css:", file=sys.stderr)
        for p in problems:
            print(f"  {p}", file=sys.stderr)
        print(
            "\nEvery file here is redistributed whole and unmodified. If you "
            "replaced one\non purpose, read its licence, then update its "
            "sha256 in MANIFEST. To re-fetch:\n"
            f"  Ioskeley Mono    {FETCH_IOSKELEY}",
            file=sys.stderr,
        )
        return 1

    parts = [HEADER]
    for face in MANIFEST:
        parts.append(
            FACE.format(
                family=face["family"],
                weight=face["weight"],
                file=face["file"],
                style=face.get("style", "normal"),
                range=f"\n\tunicode-range: {face['range']};" if face["range"] else "",
            )
        )

    css = "".join(parts)

    # The template used to hardcode `font-style: normal`, so an italic entry was
    # silently emitted as upright. Count them instead of trusting the template.
    wanted = sum(1 for face in MANIFEST if face.get("style") == "italic")
    found = css.count("font-style: italic")
    if found != wanted:
        print(f"Refusing to write {os.path.basename(OUT_CSS)}: {wanted} italic "
              f"face(s) in MANIFEST but {found} in the output.", file=sys.stderr)
        return 1

    with open(OUT_CSS, "w") as fh:
        fh.write(css)

    total = 0
    for face in MANIFEST:
        size = os.path.getsize(os.path.join(FONT_DIR, face["file"]))
        total += size
        print(f"  {face['file']:28} {face['weight']:>8}  {size / 1024:8.1f} KB  {face['note']}")
    print(f"  {os.path.relpath(OUT_CSS, ROOT)}  written  ({total / 1048576:.2f} MB of fonts)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
