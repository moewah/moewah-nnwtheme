// Contract audit body for scripts/check_theme_styles.swift — phase two.
//
// Phase one checks the theme's own CSS against the catalogue. This phase checks
// the other half of a theme: NetNewsWire's injected JavaScript, which does work
// the stylesheet assumes has already happened. `main.js` wraps tables in
// `.nnw-overflow`, wraps frameless iframes in `.iframeWrap`, tags relative-height
// iframes with `.nnw-constrained`, labels local footnote links `.footnote`,
// converts wp-smiley images to text, sizes Tailwind-classed SVGs, and unwraps
// spans inside `<td><pre>`.
//
// Almost all of that hangs off `div.articleBody` — the tag name included. The
// theme shipped an `<article class="articleBody">` container for months, so
// none of it ran: table borders vanished in the reader while the browser
// preview looked fine, because the preview hand-wraps its own tables.
//
// Runs after main.js + main_mac.js have processed the page. Reports counts and
// a pass/fail per contract point.
const inArticle = (sel) => document.querySelectorAll('div.articleBody ' + sel);
const tables = inArticle('table');
const wrappedTables = [...tables].filter((t) => t.closest('.nnw-overflow') !== null);
const iframes = inArticle('iframe');
const framedIframes = [...iframes].filter((f) => f.closest('.iframeWrap') !== null);
// Fixed-size iframes are deliberately not wrapped: the app gives them an
// aspect-ratio instead, so only the frameless ones are expected to be framed.
const framelessIframes = [...iframes].filter((f) => !f.getAttribute('width') && !f.getAttribute('height'));
const framedFrameless = framelessIframes.filter((f) => f.closest('.iframeWrap') !== null);
const sizedIframes = [...iframes].filter((f) => f.style.aspectRatio !== '' && f.style.height === 'auto');
const constrained = document.querySelectorAll('iframe.nnw-constrained');
const videos = inArticle('video');
const inlineVideos = [...videos].filter((v) => v.hasAttribute('playsinline') && v.hasAttribute('controls'));
const footnotes = document.querySelectorAll("sup > a[href*='#fn'], sup > div > a[href*='#fn']");
const styledFootnotes = [...footnotes].filter((a) => a.classList.contains('footnote'));
const smileys = document.querySelectorAll('img.wp-smiley[alt]');
const tailwindSVGs = [...inArticle('svg')].filter((s) => (s.getAttribute('class') || '').match(/(?:^|\s)w-\[/));
const sizedSVGs = tailwindSVGs.filter((s) => s.style.width !== '');
const tdPreSpans = inArticle('td > pre span');

// Wrapping a table is only half of it: the theme's rules are keyed on
// `.nnw-overflow`, so check the grid actually lands once the wrapper is there.
const grid = (() => {
	const table = document.querySelector('div.articleBody .nnw-overflow table');
	if (!table) return { pass: false, detail: '找不到被包裹的表格' };
	const cell = (n) => table.querySelector('tr td:nth-child(' + n + ')');
	const cs = (el, prop) => getComputedStyle(el).getPropertyValue(prop).trim();
	const got = {
		tableBorder: cs(table, 'border-top-width'),
		innerRight: cs(cell(1), 'border-right-width'),
		lastRight: cs(table.querySelector('tr td:last-child'), 'border-right-width'),
	};
	return {
		pass: got.tableBorder === '1px' && got.innerRight === '1px' && got.lastRight === '0px',
		detail: '表格外框 ' + got.tableBorder + ' · 内部竖线 ' + got.innerRight + ' · 末列 ' + got.lastRight,
	};
})();

const check = (label, pass, detail) => ({ label, pass, detail });

// Computed styles are read below, and a transition that never advances hands
// back its *start* value. That is not hypothetical: this harness's WKWebView
// never enters a window, and a page that is not being rendered does not advance
// CSS transitions — so the footnote chip's background, which only becomes
// var(--faint) once main.js adds `.footnote` after load, still measured
// `rgba(0, 0, 0, 0)` at t=0, at t=400ms and at t=1s. The theme was right; the
// measurement was of a frozen transition. Turn them off for the reading.
document.head.appendChild(
	Object.assign(document.createElement('style'), {
		textContent: '* { transition: none !important; animation: none !important }',
	}),
);

// The chip is the one element here whose paint the theme only reaches *after*
// main.js has run, so it is measured against the token rather than a literal.
const chipPaint = (() => {
	const chip = document.getElementById('fn-chip-js');
	if (!chip) return { pass: false, detail: '缺少 #fn-chip-js' };
	const probe = document.createElement('span');
	probe.style.color = 'var(--faint)';
	document.body.appendChild(probe);
	const want = getComputedStyle(probe).color;
	probe.remove();
	const got = getComputedStyle(chip).backgroundColor;
	return {
		pass: chip.classList.contains('footnote') && got === want,
		detail: got + '，期望 --faint = ' + want,
	};
})();

// Nested wrappers must not repeat the block margin; the outer one owns it.
const nestedSpacing = (() => {
	const nested = [...document.querySelectorAll('.nnw-overflow .nnw-overflow')];
	const spaced = nested.filter((n) => getComputedStyle(n).marginTop !== '0px');
	return {
		pass: nested.length > 0 && spaced.length === 0,
		detail: nested.length + ' 个嵌套 wrapper，带间距的 ' + spaced.length + ' 个',
	};
})();
const results = [
	check('容器是 div.articleBody（脚本的总入口）', document.querySelector('div.articleBody') !== null,
		document.querySelector('div.articleBody') ? 'div.articleBody = ' + document.querySelector('div.articleBody').id : '没有 div.articleBody，main.js 的所有查询都会落空'),
	check('表格被包进 .nnw-overflow', tables.length > 0 && wrappedTables.length === tables.length,
		wrappedTables.length + ' / ' + tables.length + ' 个表格'),
	check('无高宽 iframe 被包进 .iframeWrap', framelessIframes.length > 0 && framedFrameless.length === framelessIframes.length,
		framedFrameless.length + ' / ' + framelessIframes.length + ' 个无高宽 iframe（共 ' + iframes.length + ' 个 iframe，另 ' + framedIframes.length + ' 个有包裹）'),
	check('固定高宽 iframe 得到 aspect-ratio', sizedIframes.length > 0,
		sizedIframes.length + ' 个：' + sizedIframes.map((f) => f.style.aspectRatio).join(', ')),
	check('相对高度 iframe 被标 .nnw-constrained', constrained.length > 0, constrained.length + ' 个'),
	check('video 得到 playsinline + controls', videos.length > 0 && inlineVideos.length === videos.length,
		inlineVideos.length + ' / ' + videos.length + ' 个 video'),
	check('本地脚注链接被标 .footnote', footnotes.length > 0 && styledFootnotes.length === footnotes.length,
		styledFootnotes.length + ' / ' + footnotes.length + ' 个 sup>a[href*=#fn]'),
	check('wp-smiley 被换成文本', smileys.length === 0, '残留 ' + smileys.length + ' 个'),
	check('Tailwind 尺寸的 SVG 拿到 width', tailwindSVGs.length > 0 && sizedSVGs.length === tailwindSVGs.length,
		sizedSVGs.length + ' / ' + tailwindSVGs.length + ' 个'),
	check('<td><pre> 里的 span 被拆掉', tdPreSpans.length === 0, '残留 ' + tdPreSpans.length + ' 个 span'),
	check('包裹后的表格拿到主题的网格', grid.pass, grid.detail),
	check('JS 加上的 .footnote 芯片真的取到了主题配色', chipPaint.pass, chipPaint.detail),
	check('嵌套 .nnw-overflow 不重复加间距', nestedSpacing.pass, nestedSpacing.detail),
];

const failed = results.filter((r) => !r.pass).map((r) => r.label + '  → ' + r.detail);
return JSON.stringify({ results, failed }, null, 1);
