// Check the theme the way the app assembles it: NetNewsWire's core.css, then the
// theme's stylesheet, then NetNewsWire's injected JavaScript.
//
//   ./build.sh && swift scripts/check_theme_styles.swift dist/MoeWah.nnwtheme
//
// The catalogue it measures is a fixture: this builds one into a temporary
// directory (scripts/make_catalog.py) when the caller does not hand one in, so
// `dist/` holds nothing but the theme that ships.
//
// Two phases, because a theme can be wrong in two independent places:
//
//   1. Styles. Every rule the stylesheet declares parsed by WebKit, every
//      selector demonstrated on the catalogue page, and computed-style
//      assertions for the effects that fail quietly (table edges, the footnote
//      chip, sup/sub offsets, the five text sizes). Body: theme_styles_audit.js.
//   2. Contract. The app's own main.js is run over the page, and the audit
//      asserts it actually did its work — wrapped the tables, wrapped the
//      iframes, labelled the footnotes, sized the SVGs. Almost all of that
//      hangs off `div.articleBody`, tag name included: the theme shipped an
//      `<article class="articleBody">` for months, so none of it ran, and the
//      reader lost the entire table grid while the browser preview still looked
//      right (the preview hand-wrapped its own table). Body:
//      theme_contract_audit.js.//
// Exits non-zero on a dropped rule, an undemoed selector, a failed assertion, or
// a broken contract point.
import Cocoa
import WebKit

let args = CommandLine.arguments
guard args.count > 1 else {
	print("usage: swift scripts/check_theme_styles.swift <theme.nnwtheme> [catalog.html] [netnewswire-resources]")
	print("  the catalogue is a fixture, not a shipped file: without an argument this builds one")
	print("  into a temporary directory with scripts/make_catalog.py, and keeps it there so you can open it")
	print("  the resources directory defaults to the installed NetNewsWire's, which supplies core.css,")
	print("  main.js and main_mac.js — the same files the app uses to render an article")
	exit(2)
}
let bundle = URL(fileURLWithPath: args[1])

// A .html argument is a prepared catalogue; anything else is the resources
// directory, so the common case reads `check_theme_styles.swift <theme>`.
var catalogArg: URL?
var resourcesArg: String?
for arg in args.dropFirst(2) {
	if arg.hasSuffix(".html") {
		catalogArg = URL(fileURLWithPath: arg)
	} else {
		resourcesArg = arg
	}
}

/// Build the catalogue into a temp directory and report where it went, so the
/// run leaves the repository — and dist/ — with nothing in it but the bundle.
func buildCatalog() -> URL {
	let dir = URL(fileURLWithPath: NSTemporaryDirectory())
		.appendingPathComponent("moewah-catalog-\(UUID().uuidString)")
	let script = URL(fileURLWithPath: "scripts/make_catalog.py")
	guard FileManager.default.fileExists(atPath: script.path) else {
		print("cannot find scripts/make_catalog.py — run this from the repository root")
		exit(2)
	}
	let process = Process()
	process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
	process.arguments = ["python3", "scripts/make_catalog.py", "--out", dir.path]
	// The script prints the path it wrote; this prints it too, once.
	process.standardOutput = FileHandle.nullDevice
	try? process.run()
	process.waitUntilExit()
	let catalog = dir.appendingPathComponent("catalog.html")
	guard process.terminationStatus == 0, FileManager.default.fileExists(atPath: catalog.path) else {
		print("scripts/make_catalog.py failed (exit \(process.terminationStatus))")
		exit(2)
	}
	print("catalogue: \(catalog.path)\n")
	return catalog
}

let catalogURL = catalogArg ?? buildCatalog()

func read(_ url: URL, _ what: String) -> String {
	guard let text = try? String(contentsOf: url, encoding: .utf8) else {
		print("cannot read \(what) at \(url.path) — build the theme first (./build.sh)")
		exit(2)
	}
	return text
}

let rawResources = resourcesArg ?? "/Applications/NetNewsWire.app/Contents/Resources"
let resources = URL(fileURLWithPath: rawResources)
let coreCSS = (try? String(contentsOf: resources.appendingPathComponent("core.css"), encoding: .utf8)) ?? ""
let appJS = ["main.js", "main_mac.js"].compactMap { try? String(contentsOf: resources.appendingPathComponent($0), encoding: .utf8) }.joined(separator: "\n")
if coreCSS.isEmpty || appJS.isEmpty {
	print("note: no core.css / main.js under \(resources.path) — phase 2 will be skipped")
}

let themeCSS = read(bundle.appendingPathComponent("stylesheet.css"), "stylesheet.css")
let stylesJS = read(URL(fileURLWithPath: "scripts/theme_styles_audit.js"), "scripts/theme_styles_audit.js")
let contractJS = read(URL(fileURLWithPath: "scripts/theme_contract_audit.js"), "scripts/theme_contract_audit.js")

// The catalogue's own annotation styles live in its <head>; take the body and
// re-inline core.css + the theme, the way the app does.
let catalogHTML = read(catalogURL, "catalog.html")
guard let bodyStart = catalogHTML.range(of: "<body>"),
      let bodyEnd = catalogHTML.range(of: "</body>", options: .backwards) else {
	print("catalog has no <body>")
	exit(2)
}
let catalogBody = String(catalogHTML[bodyStart.upperBound..<bodyEnd.lowerBound])

let stylesPage = """
<!doctype html><html><head><meta charset='utf-8'>
<style id="core-css">\(coreCSS)</style>
<style id="theme-css">\(themeCSS)</style>
</head><body>\(catalogBody)</body></html>
"""

let contractPage = """
<!doctype html><html><head><meta charset='utf-8'>
<style id="core-css">\(coreCSS)</style>
<style id="theme-css">\(themeCSS)</style>
<script>\(appJS)</script>
</head><body>\(catalogBody)</body></html>
"""

final class Delegate: NSObject, WKNavigationDelegate {
	let stylesJS: String
	let contractJS: String
	let stylesPage: String
	let contractPage: String
	let css: String
	let hasAppJS: Bool
	var phase = 0

	init(stylesJS: String, contractJS: String, stylesPage: String, contractPage: String, css: String, hasAppJS: Bool) {
		self.stylesJS = stylesJS
		self.contractJS = contractJS
		self.stylesPage = stylesPage
		self.contractPage = contractPage
		self.css = css
		self.hasAppJS = hasAppJS
	}

	func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
		if phase == 0 {
			phase = 1
			webView.callAsyncJavaScript(stylesJS, arguments: ["css": css], in: nil, in: .page) { result in
				print("### 1 · 样式\n")
				let failed = self.report(result, keys: ["notDemoed", "failed"])
				if !self.hasAppJS {
					print("\n(跳过契约检查：找不到 NetNewsWire 的 main.js)")
					exit(failed.isEmpty ? 0 : 1)
				}
				self.stylesFailed = failed
				// The app's scripts run on DOMContentLoaded, so navigate and then wait.
				webView.loadHTMLString(self.contractPage, baseURL: URL(string: "https://moewah.com/posts/some-article/"))
				return
			}
			return
		}
		// main.js does its work on DOMContentLoaded; give it a beat before asking.
		DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
			webView.callAsyncJavaScript(self.contractJS, arguments: [:], in: nil, in: .page) { result in
				print("\n### 2 · 与 app 注入脚本的契约\n")
				let failed = self.report(result, keys: ["failed"])
				let all = self.stylesFailed + failed
				if all.isEmpty {
					print("\nOK: 规则全部被解析，选择器全部有演示，断言全部成立，契约全部满足。")
					exit(0)
				}
				print("\nFAIL: \(all.count) 项不成立")
				exit(1)
			}
		}
	}

	var stylesFailed: [String] = []

	/// Prints a report and returns its failures.
	func report(_ result: Result<Any, Error>, keys: [String]) -> [String] {
		guard case .success(let value) = result, let text = value as? String else {
			if case .failure(let error) = result { print("JS failed: \(error)") }
			return ["JS 执行失败"]
		}
		print(text)
		let json = (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any] ?? [:]
		var failures: [String] = []
		for key in keys {
			if let list = json[key] as? [String] { failures += list }
		}
		if let dropped = json["droppedRules"] as? Int, dropped != 0 {
			failures.append("\(dropped) 条规则被 WebKit 丢弃")
		}
		return failures
	}
}

// A real viewport: with a zero-sized frame, 50vw and percentage padding compute
// to 0px and the assertions about them would fail for the wrong reason.
let webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 640, height: 1200), configuration: WKWebViewConfiguration())
let delegate = Delegate(stylesJS: stylesJS, contractJS: contractJS, stylesPage: stylesPage,
                        contractPage: contractPage, css: themeCSS, hasAppJS: !appJS.isEmpty)
webView.navigationDelegate = delegate
webView.loadHTMLString(stylesPage, baseURL: URL(string: "https://moewah.com/posts/some-article/"))
RunLoop.main.run()
