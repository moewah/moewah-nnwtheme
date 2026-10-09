#!/usr/bin/env bash
#
# Assemble the .nnwtheme bundle into dist/, regenerate the preview, and
# optionally install (macOS) or package for iOS.
#
#   ./build.sh            build dist/MoeWah.nnwtheme
#   ./build.sh --install  also copy the bundle into NetNewsWire's Themes folder
#   ./build.sh --zip      also produce dist/MoeWah.nnwtheme.zip (iOS)
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SRC="$ROOT/src"
DIST="$ROOT/dist"
BUNDLE="$DIST/MoeWah.nnwtheme"
THEMES_DIR="$HOME/Library/Containers/com.ranchero.NetNewsWire-Evergreen/Data/Library/Application Support/NetNewsWire/Themes"

# The font binaries are committed, and this regenerates their @font-face CSS from
# them (it verifies every sha256 first, so a swapped or damaged file stops the
# build rather than shipping). No network, so a fresh clone still builds.
python3 "$ROOT/scripts/build_vendored_fonts.py"
rm -rf "$DIST"/*.nnwtheme
mkdir -p "$BUNDLE/fonts"

cp "$SRC/Info.plist" "$BUNDLE/"
cp "$SRC/template.html" "$BUNDLE/"
# No font binaries go into the bundle: the stylesheet carries every face
# inlined as a data: URI (see below), and no OFL has an as-is clause that
# would ask for a second, loose copy. What does have to travel is the licences,
# IBM Plex's own copyright line and the OFL text it ships with. One embedded
# family now — mono — so one licence travels; Latin and Chinese are the system's.
cp "$SRC/fonts"/OFL-*.txt "$BUNDLE/fonts/"

# NetNewsWire loads a theme's stylesheet with the *article's* URL as the base
# URL (loadHTMLString(html, baseURL: article.url) — see the README), so
# url(fonts/..) can never resolve inside the app. The fonts are inlined
# instead, and the script writes the bundle's stylesheet in one step: the
# inlined faces followed by the theme's own rules. No intermediate file.
python3 "$ROOT/scripts/inline_fonts.py" "$BUNDLE/stylesheet.css"

echo "built:  $BUNDLE"
du -sh "$BUNDLE" | awk '{print "size:   " $1}'

if [[ "${1:-}" == "--install" ]]; then
	mkdir -p "$THEMES_DIR"
	rm -rf "$THEMES_DIR/MoeWah.nnwtheme"
	cp -R "$BUNDLE" "$THEMES_DIR/"
	echo "install: $THEMES_DIR/MoeWah.nnwtheme"
fi

if [[ "${1:-}" == "--zip" ]]; then
	rm -f "$DIST/MoeWah.nnwtheme.zip"
	(cd "$DIST" && zip -q -r "MoeWah.nnwtheme.zip" "MoeWah.nnwtheme")
	echo "zip:     $DIST/MoeWah.nnwtheme.zip"
fi
