// Check that a built theme's fonts actually load the way NetNewsWire loads
// them — the failure this exists for is silent.
//
// A theme's stylesheet is read into a String, spliced into the article HTML,
// and handed to WKWebView as `loadHTMLString(html, baseURL: article.url)`.
// Nothing in the theme bundle is reachable from that document, so a stylesheet
// that points at `url(fonts/x.woff2)` loads nothing at all and the reader
// quietly renders in system fonts. This runs that same load and reports which
// FontFaces made it.
//
//   ./build.sh && swift scripts/check_theme_fonts.swift dist/MoeWah.nnwtheme
//
// Exits non-zero when the stylesheet declares faces but none of them load.
import Cocoa
import WebKit

guard CommandLine.arguments.count > 1 else {
	print("usage: swift scripts/check_theme_fonts.swift <theme.nnwtheme>")
	exit(2)
}
let theme = URL(fileURLWithPath: CommandLine.arguments[1])
let stylesheet = theme.appendingPathComponent("stylesheet.css")
guard let css = try? String(contentsOf: stylesheet, encoding: .utf8) else {
	print("cannot read \(stylesheet.path) — build the theme first (./build.sh)")
	exit(2)
}

let blockRE = try! NSRegularExpression(pattern: "@font-face\\s*\\{(.*?)\\}", options: [.dotMatchesLineSeparators])
let familyRE = try! NSRegularExpression(pattern: "font-family:\\s*['\"]([^'\"]+)['\"]")
var declared: [String] = []
for match in blockRE.matches(in: css, range: NSRange(css.startIndex..., in: css)) {
	let block = (css as NSString).substring(with: match.range(at: 1))
	if let family = familyRE.firstMatch(in: block, range: NSRange(block.startIndex..., in: block)) {
		declared.append((block as NSString).substring(with: family.range(at: 1)))
	}
}
let unique = Array(Set(declared)).sorted()
print("\(theme.lastPathComponent): \(declared.count) @font-face rules, families: \(unique.joined(separator: ", "))")

// The Latin face is not embedded — the theme is Apple-only and Avenir Next is
// already on the device — so it has no @font-face to inspect. Take the first
// real family name out of each --font-* stack and test it the same way: if it
// renders as the fallback reference, the stack has quietly collapsed to a
// system font, which is the kind of failure this script exists for.
let stackRE = try! NSRegularExpression(pattern: "--font-[a-z]+:\\s*'([^']+)'")
var stackFamilies: [String] = []
for match in stackRE.matches(in: css, range: NSRange(css.startIndex..., in: css)) {
	let family = (css as NSString).substring(with: match.range(at: 1))
	if !stackFamilies.contains(family) { stackFamilies.append(family) }
}
if !stackFamilies.isEmpty {
	print("stack: \(stackFamilies.joined(separator: ", "))")
}

guard !declared.isEmpty || !stackFamilies.isEmpty else {
	print("no @font-face rules and no --font-* stacks — nothing to check")
	exit(0)
}
if css.replacingOccurrences(of: "(?s)/\\*.*?\\*/", with: "", options: .regularExpression).contains("url(fonts/") {
	print("warning: the stylesheet still references url(fonts/..), which cannot resolve in the app")
}

// Sample text that exercises both scripts, so a Latin face is not judged by
// CJK fallback pixels and vice versa.
let html = """
<!doctype html><html><head><meta charset="utf-8"><style>
\(css)
</style></head><body><div class="fontSize"><div class="attribution">
<a class="feedlink" href="#">MoeWah</a><div class="byline">By 老鱼</div></div>
<article id="bodyContainer" class="articleBody">
<p>档案纸面的阅读主题，中文与 English 混排，数字 0123456789。</p>
<p>行内 <code>const x = 1</code>，<code><em>italic in code</em></code>，以及 <strong>加粗</strong>与<em>强调</em>。</p>
</article>
<footer class="footer"><span class="footerLabel">Source:</span> moewah.com</footer></div></body></html>
"""

let familiesJSON = "[" + unique.map { "\"\($0)\"" }.joined(separator: ",") + "]"
let stacksJSON = "[" + stackFamilies.map { "\"\($0)\"" }.joined(separator: ",") + "]"
let js = """
await document.fonts.ready;
const shot = (fam, text) => {
	const c = document.createElement('canvas');
	c.width = 320; c.height = 64;
	const ctx = c.getContext('2d');
	ctx.font = '36px "' + fam + '"';
	ctx.fillText(text, 4, 44);
	return c.toDataURL();
};
const refs = {
	cjk: { 'PingFang SC': shot('PingFang SC', '档案纸面楷宋'), 'Songti SC': shot('Songti SC', '档案纸面楷宋') },
	// The third reference is the one that gives the Latin side teeth: a family
	// that does not exist renders as the canvas default, and that default was
	// measured to be what `serif` produces — not Helvetica. Without it, a missing
	// face reported "distinct" and the check could not fail. (Verified by
	// swapping 'Avenir Next' for a name that does not exist: with this reference
	// the run fails, without it it passed.)
	latin: { 'Helvetica': shot('Helvetica', 'MoeWah 0123'), 'Times New Roman': shot('Times New Roman', 'MoeWah 0123'), 'serif（未知家族的回落目标）': shot('serif', 'MoeWah 0123') },
};
const out = { loaded: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + '/' + f.weight + (f.style === 'italic' ? ' italic' : '')), rendered: {} };
for (const fam of \(familiesJSON)) {
	// A Latin-only face legitimately falls back for CJK, and vice versa, so
	// the two samples are judged separately.
	const sample = (kind) => {
		const shotData = kind === 'cjk' ? shot(fam, '档案纸面楷宋') : shot(fam, 'MoeWah 0123');
		const same = Object.entries(refs[kind]).filter(([, v]) => v === shotData).map(([k]) => k);
		return same.length ? 'falls back to ' + same.join(' / ') : 'distinct';
	};
	out.rendered[fam] = { cjk: sample('cjk'), latin: sample('latin') };
}
// A stack's first family is what the theme intends to render with; the families
// after it are fallbacks. Falling back means the intent is no longer in effect.
out.stackFellBack = \(stacksJSON).filter((fam) => {
	const shotData = shot(fam, 'MoeWah 0123');
	return Object.values(refs.latin).some((v) => v === shotData);
});
for (const fam of \(stacksJSON)) {
	out.rendered['stack: ' + fam] = { latin: (() => {
		const shotData = shot(fam, 'MoeWah 0123');
		const same = Object.entries(refs.latin).filter(([, v]) => v === shotData).map(([k]) => k);
		return same.length ? 'falls back to ' + same.join(' / ') : 'distinct';
	})() };
}
return JSON.stringify(out, null, 1);
"""

final class Delegate: NSObject, WKNavigationDelegate {
	func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
		webView.callAsyncJavaScript(js, arguments: [:], in: nil, in: .page) { result in
			var loadedCount = 0
			var stackFellBack: [String] = []
			switch result {
			case .success(let value):
				let text = value as? String ?? "\(value)"
				print(text)
				if let data = text.data(using: .utf8),
				   let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
					loadedCount = (parsed["loaded"] as? [String])?.count ?? 0
					stackFellBack = parsed["stackFellBack"] as? [String] ?? []
				}
			case .failure(let error):
				print("JS failed: \(error)")
			}
			if loadedCount == 0 {
				print("FAIL: none of the declared faces loaded — the reader will render in system fonts.")
				exit(1)
			}
			if !stackFellBack.isEmpty {
				print("FAIL: the font stack collapsed to a fallback for: "
					+ stackFellBack.joined(separator: ", ")
					+ " — the theme will render in a font it did not ask for.")
				exit(1)
			}
			print("OK: \(loadedCount) face(s) loaded.")
			exit(0)
		}
	}
}

let webView = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
let delegate = Delegate()
webView.navigationDelegate = delegate
webView.loadHTMLString(html, baseURL: URL(string: "https://moewah.com/posts/some-article/"))
RunLoop.main.run()
