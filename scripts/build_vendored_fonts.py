#!/usr/bin/env python3
"""Verify the theme's font binaries and write their @font-face CSS.

Every face the theme embeds is a committed binary, described by MANIFEST below.
This script checks each one against its pinned sha256 and writes
`src/fonts/vendored-fonts.css` — that stylesheet is inlined into the theme's own
by inline_fonts.py, and it is the only place these faces are declared.

    IBM Plex Mono Var  wght 100-700          metadata, code, captions (mono)
                      +wght 100-700 italic  emphasis inside those

One family, and it is variable: one file per style covers every weight the theme
asks for, where the faces it replaced spelled out a file per weight. Weight is
still asked for with ordinary
`font-weight` — the range is declared in the @font-face and the browser walks
the axis — so there is no `font-variation-settings` anywhere, and there should
not be.

The italics are real faces, not the renderer's shear: text inside code,
figcaption and th really can be emphasised, and so can an <em> in Latin prose.
Chinese has no italic anywhere — PingFang SC does not ship one — so Chinese
emphasis stays synthetic, which is also what keeps a mixed Chinese/Latin
emphasised phrase uniformly slanted instead of half italic, half upright.

Everything else is the system's, and that is the design rather than a shortcut:
NetNewsWire runs on macOS and iOS only, so the two faces this theme would
otherwise have to ship are already on every device it runs on.

Latin: Avenir Next, by family name, nothing embedded. That is where the theme
started, and after a detour through an embedded Geist it is where it landed
again — 324 KB of embedded Latin bought coverage Avenir Next already had (ǐ ǒ ǔ,
Greek) and was still not what display type needed. The bytes went; the families
stayed.

Avenir Next ships UltraLight / Regular / Medium / DemiBold / Bold / Heavy —
there is no Light. The title and h1 ask for 300, and a 300 that lands on Avenir
Next renders at Ultra Light: measured at 96px, 8.36% ink against the older
Avenir family's real Light at 19.40%. Against PingFang SC's 300 (Chinese,
29.19%) that is a ratio of 0.29 versus Avenir's 0.66 — hairline Latin beside
solid Chinese. So display type takes its Latin from Avenir, and --font-display
exists for exactly that one reason. Both are named, neither is shipped.

Chinese: PingFang SC, also by name. It was three embedded IBM Plex Sans SC
statics — 11.12 MB of the 11.43 MB this folder once carried (97%) — and they were
short one weight: h2-h6 ask for 500, and the set stopped at 400/600. PingFang SC
draws six weights (Ultralight through Semibold), so 300/400/500/600 each land on
a real drawing. Eleven megabytes per reader to shadow a face the platform
already has, and to cover one weight worse, is not a trade this theme makes.

What the system faces have no drawing for falls through to -apple-system: ⇒, and
the box drawing the mono face does not take. Order matters in those stacks — the
comments beside them in src/stylesheet.css say which link was bought which way.

It copies nothing and needs no network: a fresh clone can build, because the
binaries are in `src/fonts/`. Run it after replacing a binary:

    python3 scripts/build_vendored_fonts.py            # verify + write CSS
    python3 scripts/build_vendored_fonts.py --hashes   # print the current hashes

A file whose sha256 is not the pinned one is refused rather than shipped, and
the error prints the hash it found: paste that into MANIFEST, re-read the
licence of whatever you replaced, and run again.

Licence — the one embedded family is under the SIL Open Font License 1.1, and a
copy of the licence travels with the bundle (`OFL-*.txt`, copied into it).
IBM Plex declares "Plex", which clause 3 withholds from any Modified Version —
and the OFL counts *changing formats* and *deleting from* a font (i.e.
subsetting) as making one. So these faces go in whole, in the format their
publisher shipped, and stay unrenamed. OFL-IBM-Plex.txt is named for the family
rather than the one face: IBM ships the same bytes (sha256 91c25c35...) with
every Plex webfont.

Nothing here modifies anything: every file goes in byte for byte, under its own
name, which is why no renaming is owed — and why none of these faces can be
subset or converted later without also renaming it.
"""

import hashlib
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_DIR = os.path.join(ROOT, "src", "fonts")
OUT_CSS = os.path.join(FONT_DIR, "vendored-fonts.css")

FETCH_PLEXMONO_VAR = (
    "curl -LO 'https://github.com/IBM/plex/releases/download/"
    "%40ibm%2Fplex-mono-variable%401.0.0/plex-mono-variable.zip' && "
    "unzip -j plex-mono-variable.zip 'fonts/complete/woff2/*'"
)

# '400' for a static face, '100 900' for a variable one — the CSS weight range
# syntax, written the way it goes into @font-face. A range typed as '100..900'
# or '100-900' is silently inert in CSS, so main() refuses it rather than
# shipping a face that renders at one weight and pretends to be variable.
WEIGHT = re.compile(r"\A\d{1,4}(?: \d{1,4})?\Z")

MANIFEST = [
    {
        "file": "ibmplexmono-var.woff2",
        "family": "IBM Plex Mono Var",
        "weight": "100 700",
        "sha256": "ef55d69e81baa6523a9b6e015d746e707bc7e9579f18703a169cb18c36dd567b",
        "note": "IBM Plex Mono Var Roman, wght 100-700 (plex-mono-variable@1.0.0)",
        "refresh": FETCH_PLEXMONO_VAR,
    },
    {
        "file": "ibmplexmono-var-italic.woff2",
        "family": "IBM Plex Mono Var",
        "weight": "100 700",
        "style": "italic",
        "sha256": "b1c1137b5de255336110167a3a66531bed1e7d14fc8a0a384bd0d7c06bdd433b",
        "note": "IBM Plex Mono Var Italic, wght 100-700 (plex-mono-variable@1.0.0)",
        "refresh": FETCH_PLEXMONO_VAR,
    },
]

HEADER = """/* Generated by scripts/build_vendored_fonts.py — do not edit by hand.

   Every face the theme embeds, whole and unmodified, each with its sha256
   pinned in that script and a copy of the SIL Open Font License 1.1 travelling
   with it in this folder:

     IBM Plex Mono Var  wght 100-700   metadata and code     OFL-IBM-Plex.txt
                      +wght 100-700 italic

   It is variable: one file per style covers every weight the theme asks for,
   where the faces it replaced spelled out a file per weight. Weight is driven
   by ordinary font-weight — the range is declared here and the browser walks
   the axis — never by font-variation-settings.

   This is the only embedded face. Latin is the system's Avenir Next — with
   Avenir behind --font-display for the 300 Avenir Next has no Light for — and
   Chinese is PingFang SC. NetNewsWire is Apple-only, so both are on every
   device it runs on; see the docstring in build_vendored_fonts.py, and the
   comments beside --font-sans / --font-display in stylesheet.css.

   Chinese is the system's face outright — PingFang SC. It was three embedded
   IBM Plex Sans SC statics: 11.12 MB of the 11.43 MB this folder carried, and
   they covered one weight fewer than PingFang does — no 500, which the h2-h6
   rule asks for.

   IBM Plex declares the reserved font name "Plex", which clause 3 withholds
   from Modified Versions — and the OFL counts *changing formats* and *deleting
   from* a font, i.e. subsetting, as making one. So neither file is subset or
   converted; each is the byte-for-byte artifact its publisher shipped.
   OFL-IBM-Plex.txt is named for the family; IBM ships the same bytes with every
   Plex webfont. Nor does any face carry a unicode-range fence any more — with
   Chinese off to the system there is nothing left to fence off. */
"""

FACE = """
@font-face {{
\tfont-family: '{family}';
\tfont-style: {style};
\tfont-weight: {weight};
\tfont-display: swap;
\tsrc: url(fonts/{file}) format('woff2');
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
        if not WEIGHT.match(face["weight"]):
            problems.append(
                f"{face['file']}: weight {face['weight']!r} is not CSS weight "
                "syntax (use '400', or '100 900' for a variable face)"
            )
            continue
        low, _, high = face["weight"].partition(" ")
        if high and int(low) >= int(high):
            problems.append(f"{face['file']}: weight range {face['weight']!r} is empty or inverted")
            continue
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
            f"  IBM Plex Mono   {FETCH_PLEXMONO_VAR}",
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
