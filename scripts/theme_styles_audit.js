// Audit body for scripts/check_theme_styles.swift.
//
// Runs as an async function inside a WKWebView that holds the built theme's
// stylesheet inlined and the catalogue page in the body — i.e. the shape
// NetNewsWire actually renders. `selectors` arrives via callAsyncJavaScript
// arguments as the list of selectors the theme declares.
//
// Returns a JSON string; the Swift side parses it and decides pass/fail.

// The theme's sheet specifically: core.css is loaded first and would otherwise
// be the one surveyed.
const sheet = document.getElementById('theme-css').sheet;
const coreSheet = document.getElementById('core-css')?.sheet;

// Selectors come from the CSSOM, not from parsing the source text: that is what
// WebKit actually kept, so anything the parser dropped is absent here (and is
// reported separately by the brace count below).
// Split on top-level commas only: WebKit serializes :matches(a, b) as :is(a, b),
// and a naive split would cut that in half.
const splitSelectorList = (text) => {
	const out = [];
	let depth = 0;
	let current = '';
	for (const ch of text) {
		if (ch === '(' || ch === '[') depth++;
		else if (ch === ')' || ch === ']') depth--;
		if (ch === ',' && depth === 0) {
			if (current.trim()) out.push(current.trim());
			current = '';
			continue;
		}
		current += ch;
	}
	if (current.trim()) out.push(current.trim());
	return out;
};

const collectSelectors = (rules, into) => {
	for (const rule of [...rules]) {
		if (rule.selectorText) {
			for (const part of splitSelectorList(rule.selectorText)) into.push(part);
		} else if (rule.cssRules) {
			collectSelectors(rule.cssRules, into);
		}
	}
	return into;
};
const selectors = [...new Set(collectSelectors(sheet.cssRules, []))].sort();

// WebKit drops a rule it cannot parse. Counting blocks in the source and rules
// in the CSSOM catches that: every `{` in the source that is not a comment is a
// block, and every block is either a rule or an at-rule that contains rules.
// (Braces inside quotes or data: URIs would skew this; this stylesheet has none.)
// CSSRuleList is array-like, not an Array.
const ruleCount = (rules) => [...rules].reduce((n, r) => n + 1 + (r.cssRules ? ruleCount(r.cssRules) : 0), 0);
const sourceBlocks = (css.replace(/\/\*[\s\S]*?\*\//g, '').match(/\{/g) || []).length;
const parsedRules = ruleCount(sheet.cssRules);

// Strip stateful pseudo-classes for the demo test: a static page cannot be in
// :hover, and :visited is deliberately unstyleable.
const normalize = (sel) =>
	sel
		.replace(/::[a-z-]+(\([^)]*\))?/g, '')
		.replace(/:(hover|active|focus|focus-visible|link|visited|target)\b/g, '')
		.split(',')[0]
		.trim();

const coverage = { demoed: [], notDemoed: [] };
for (const sel of selectors) {
	const norm = normalize(sel);
	let count = 0;
	try {
		count = document.querySelectorAll(norm).length;
	} catch (e) {
		count = -1;
	}
	if (count > 0) coverage.demoed.push(sel);
	else coverage.notDemoed.push(sel + (count < 0 ? '  (querySelectorAll 都认不出这个选择器)' : ''));
}

const cs = (sel, prop) => {
	const el = document.querySelector(sel);
	if (!el) return 'MISSING-ELEMENT';
	return getComputedStyle(el).getPropertyValue(prop).trim();
};
const eq = (sel, prop, want) => {
	const got = cs(sel, prop);
	return { pass: got === want, got, want };
};
// Compare against the token itself rather than a literal colour: the theme
// switches on prefers-color-scheme, so hard-coded rgb() values only pass in the
// appearance the machine happened to be in.
const tokenColor = (name) => {
	const probe = document.createElement('span');
	probe.style.color = 'var(' + name + ')';
	document.body.appendChild(probe);
	const value = getComputedStyle(probe).color;
	probe.remove();
	return value;
};
const eqToken = (sel, prop, tokenName) => {
	const got = cs(sel, prop);
	const want = tokenColor(tokenName);
	return { pass: got === want, got, want: 'var(' + tokenName + ') = ' + want };
};

const includes = (sel, prop, needle) => {
	const got = (cs(sel, prop) || '').toLowerCase();
	return { pass: got.includes(needle), got, want: '包含 ' + needle };
};

// Measured gaps, not declared margins: adjacent margins collapse, so 1.15em on
// a paragraph and 1.6em on a table are not what the reader sees.
const gapBetween = (a, b) => {
	const up = document.querySelector(a);
	const down = document.querySelector(b);
	if (!up || !down) return null;
	return +(down.getBoundingClientRect().top - up.getBoundingClientRect().bottom).toFixed(1);
};
const gapOK = (a, b, min) => {
	const got = gapBetween(a, b);
	return { pass: got !== null && got >= min, got: got === null ? '缺少元素' : got + 'px', want: '≥ ' + min + 'px' };
};

const assertions = {
	'间距 段落 A → pre': gapOK('#sp-a', '#sp-pre', 16),
	'间距 pre → 段落 B': gapOK('#sp-pre', '#sp-b', 16),
	'间距 段落 B → 引用块': gapOK('#sp-b', '#sp-quote', 16),
	'间距 引用块 → 段落 C': gapOK('#sp-quote', '#sp-c', 16),
	'间距 段落 C → figure': gapOK('#sp-c', '#sp-figure', 16),
	'间距 figure → 段落 D': gapOK('#sp-figure', '#sp-d', 16),
	'间距 段落 D → 表格': gapOK('#sp-d', '#sp-table-wrap', 16),
	'间距 表格 → 段落 E': gapOK('#sp-table-wrap', '#sp-e', 16),
	'间距 段落 E → 列表': gapOK('#sp-e', '#sp-list', 16),
	'间距 列表 → 段落 F': gapOK('#sp-list', '#sp-f', 16),
	'间距 iframe → 段落 G': gapOK('#sp-iframe', '#sp-g', 16),
	'间距 封面图 → 正文（正文首个元素）': (() => {
		const cover = document.querySelector('img[alt="cover image"]');
		const next = document.querySelector('.spec-note');
		if (!cover || !next) return { pass: false, got: '缺少元素', want: '≥ 16px' };
		const got = +(next.getBoundingClientRect().top - cover.getBoundingClientRect().bottom).toFixed(1);
		return { pass: got >= 16, got: got + 'px', want: '≥ 16px' };
	})(),
	'正文第一个元素的上边距被收掉': eq('.articleBody > :first-child', 'margin-top', '0px'),
	'图与图注之间是 0.5em 而不是图片的 1.6em': (() => {
		const got = gapBetween('#sp-figure img', '#sp-figure figcaption');
		return { pass: got !== null && got >= 2 && got <= 18, got: got === null ? '缺少元素' : got + 'px', want: '2–18px（0.5em ≈ 9px）' };
	})(),
	'短表格铺满列宽': (() => {
		const table = document.getElementById('sp-table');
		const column = document.querySelector('.articleBody');
		if (!table || !column) return { pass: false, got: '缺少元素', want: '≈ 列宽' };
		const got = table.getBoundingClientRect().width;
		const want = column.clientWidth;
		return { pass: Math.abs(got - want) <= 2, got: got + 'px', want: '≈ ' + want + 'px（正文列宽）' };
	})(),
	'嵌套表格不被拉满': (() => {
		const nested = document.querySelector('.nnw-overflow table table');
		const outer = document.querySelector('.nnw-overflow table');
		if (!nested || !outer) return { pass: false, got: '缺少元素', want: '明显窄于外层表格' };
		const got = nested.getBoundingClientRect().width;
		const outerWidth = outer.getBoundingClientRect().width;
		return { pass: got < outerWidth - 20, got: got + 'px', want: '< ' + (outerWidth - 20) + 'px（外层 ' + outerWidth + 'px）' };
	})(),
	'emoji 没被图片外边距打扰': (() => {
		const got = parseFloat(cs('img.emoji', 'margin-top'));
		return { pass: got === 0, got: got + 'px', want: '0px' };
	})(),

	// 表格跟站点一致：没有外框、没有竖线，结构由三条横向规则承担 —— 表头下
	// 一条 --line、行间 --hair、末行收口 --line。
	'table 无外框': eq('.nnw-overflow table', 'border-top-width', '0px'),
	'table 单元格无竖线': eq('.nnw-overflow table tbody tr:first-child td:first-child', 'border-right-width', '0px'),
	'table 单元格无顶边': eq('.nnw-overflow table td', 'border-top-width', '0px'),
	'table 表头下一条 --line': eqToken('.nnw-overflow table thead th', 'border-bottom-color', '--line'),
	'table 行间是 hairline': eqToken('.nnw-overflow table tbody tr:first-child td', 'border-bottom-color', '--hair'),
	'table 末行收口用 --line': eqToken('.nnw-overflow table tbody tr:last-child td', 'border-bottom-color', '--line'),
	'table 比正文小一档（0.92em）': (() => {
		const body = parseFloat(cs('.articleBody p', 'font-size'));
		const got = parseFloat(cs('.nnw-overflow table td', 'font-size'));
		return { pass: Math.abs(got - body * 0.92) < 0.1, got: got + 'px', want: (body * 0.92).toFixed(1) + 'px（正文 ' + body + 'px × 0.92）' };
	})(),
	'嵌套 table 无外框': eq('.nnw-overflow table table', 'border-top-width', '0px'),
	'td 内 pre 去边框': eq('.nnw-overflow td pre', 'border-top-width', '0px'),
	// border 属性是 presentational hint，落在 author 原点最前 —— 基础规则的
	// border: 0 必须压掉它，否则老 feed 里的 border="1" 会带回 UA 的 outset 框。
	'table[border] 的 UA 外框被压掉（0 与 1 都不带框）': (() => {
		const got = [cs('.nnw-overflow table[border="0"]', 'border-top-width'), cs('#sp-table-border1', 'border-top-width'), cs('#sp-table-border1 td', 'border-top-width')];
		return { pass: got.every((v) => v === '0px'), got: got.join(' / '), want: '0px / 0px / 0px' };
	})(),
	'.nnw-overflow 横向滚动': eq('.nnw-overflow', 'overflow-x', 'auto'),
	'pre 横向滚动、纵向裁切': eq('.articleBody pre', 'overflow-y', 'hidden'),
	'.articleBody code 有底色': eqToken('.articleBody code', 'background-color', '--panel'),
	'kbd 不加底色': eq('kbd', 'background-color', 'rgba(0, 0, 0, 0)'),
	'正文链接 accent': eqToken('.articleBody a', 'color', '--accent'),
	'正文链接下划线是 hairline': eqToken('.articleBody a', 'text-decoration-color', '--hair'),
	'正文链接下划线下沉': {
		pass: parseFloat(cs('.articleBody a', 'text-underline-offset')) > 0,
		got: cs('.articleBody a', 'text-underline-offset'),
		want: '正长度（0.3em，默认 auto）',
	},
	'em 提亮到 --ink': eqToken('.articleBody em', 'color', '--ink'),
	'del 退到 --faint': eqToken('.articleBody del', 'color', '--faint'),
	'mark 压 accent 底线': eqToken('.articleBody mark', 'border-bottom-color', '--accent'),
	'sup 上标位移': { pass: parseFloat(cs('.articleBody sup', 'bottom')) > 0, got: cs('.articleBody sup', 'bottom'), want: '正长度（0.2em，默认 auto）' },
	'sub 下标位移': { pass: parseFloat(cs('.articleBody sub', 'top')) > 0, got: cs('.articleBody sub', 'top'), want: '正长度（0.2em，默认 auto）' },
	'h4 换到等宽': includes('.articleBody h4', 'font-family', 'ibm plex mono var'),
	// Sizes are em-based, so assert the shape (strictly decreasing, h4 == body)
	// rather than numbers that depend on the preview's text-size class.
	'h1..h6 层级字号递减且 h4 等于正文': (() => {
		const size = (sel) => parseFloat(cs(sel, 'font-size'));
		const [h1, h2, h3, h4] = [size('.articleBody h1'), size('.articleBody h2'), size('.articleBody h3'), size('.articleBody h4')];
		const body = parseFloat(cs('.articleBody p', 'font-size'));
		return { pass: h1 > h2 && h2 > h3 && h3 > h4 && h4 === body, got: [h1, h2, h3, h4, body].join(' / '), want: '递减，且 h4 == 正文' };
	})(),
	'blockquote accent 左竖线': eqToken('blockquote', 'border-inline-start-color', '--accent'),
	'blockquote 末段收边距': eq('blockquote p:last-child', 'margin-bottom', '0px'),
	'hr 用 --hair': eqToken('hr', 'border-top-color', '--hair'),
	'.iframeWrap 16:9': (() => {
		const el = document.querySelector('.iframeWrap');
		const want = el.parentElement.clientWidth * 0.5625;
		const got = parseFloat(getComputedStyle(el).paddingTop);
		return { pass: Math.abs(got - want) < 1, got: got + 'px', want: want + 'px（父容器宽度 × 56.25%）' };
	})(),
	'iframe.nnw-constrained 限高 50vw': (() => {
		const got = parseFloat(cs('iframe.nnw-constrained', 'max-height'));
		const want = document.documentElement.clientWidth * 0.5;
		return { pass: Math.abs(got - want) < 1, got: got + 'px', want: want + 'px（50vw）' };
	})(),
	'图片不溢出': eq('.articleBody figure img', 'max-width', '100%'),
	'.avatar 固定 34px': eq('.avatar', 'width', '34px'),
	'feed 名走大写 + 字距': eq('.feedlink', 'text-transform', 'uppercase'),
	'.nnwDateTime 用等宽': includes('.nnwDateTime', 'font-family', 'ibm plex mono var'),
	'.articleTitle 是 300': eq('.articleTitle', 'font-weight', '300'),
	'.feedbin--article-wrap 顶部 hairline': eq('.feedbin--article-wrap', 'border-top-width', '1px'),
	'脚注芯片反色（手写 class，底 = --faint，字 = --bg）': {
		pass: cs('#fn-chip-plain', 'background-color') === tokenColor('--faint')
			&& cs('#fn-chip-plain', 'color') === tokenColor('--bg'),
		got: cs('#fn-chip-plain', 'background-color') + ' / ' + cs('#fn-chip-plain', 'color'),
		want: tokenColor('--faint') + ' / ' + tokenColor('--bg'),
	},
	'紧邻 popover 的脚注芯片取 accent': {
		pass: cs('#fn-chip-adjacent', 'background-color') === tokenColor('--accent'),
		got: cs('#fn-chip-adjacent', 'background-color'),
		want: tokenColor('--accent'),
	},
	'.newsfoot popover 有描边': eq('.newsfoot-footnote-popover', 'border-top-width', '1px'),
	'.systemMessage 绝对定位': eq('.systemMessage', 'position', 'absolute'),
	// The five names the app substitutes (ArticleTextSize.cssClass, capital L for
	// the top two) plus the lowercase spellings its own stylesheet and the bundled
	// themes use. All seven must resolve: the app and its themes disagree on case.
	'字号档位五档（app 类名 + 官方主题的小写拼法）': (() => {
		const want = { smallText: 14, mediumText: 16, largeText: 18, xLargeText: 20, xxLargeText: 22, xlargeText: 20, xxlargeText: 22 };
		const bad = [];
		for (const [cls, px] of Object.entries(want)) {
			const el = document.querySelector('.' + cls);
			if (!el) { bad.push(cls + ' 没有演示元素'); continue; }
			const got = parseFloat(getComputedStyle(el).fontSize);
			if (Math.abs(got - px) > 0.5) bad.push(cls + ' = ' + got + 'px，期望 ' + px + 'px');
		}
		return { pass: bad.length === 0, got: bad.length ? bad.join(' · ') : '七种拼法全部正确', want: '14/16/18/20/22px' };
	})(),
	'.record 底部分区线': eq('.record', 'border-bottom-width', '1px'),
	'.record 是 flex 行': eq('.record', 'display', 'flex'),
	'.articleTitle 链接不加重下划线': eq('.articleTitle a', 'text-decoration-line', 'none'),
	'.footer 用等宽': includes('.footer', 'font-family', 'ibm plex mono var'),
	'.footer 链接取 accent': eqToken('.footer a', 'color', '--accent'),
	'.byline 链接不染色': eqToken('.byline a', 'color', '--faint'),
	'strong 钉在 600': eq('.articleBody strong', 'font-weight', '600'),
	'pre code 字号继承外层': eq('.articleBody pre code', 'font-size', cs('.articleBody pre', 'font-size')),
	// The column lives on .fontSize, not body: that is the element the app's text
	// size class also lands on, so it is the only one that can carry a per-size
	// measure. Body's max-width is gone — keep an eye on this one.
	'版心 = .fontSize 的 max-width，取自当前档位的 --measure': (() => {
		const el = document.querySelector('.fontSize');
		if (!el) return { pass: false, got: '没有 .fontSize 元素', want: '有' };
		const want = getComputedStyle(el).getPropertyValue('--measure').trim();
		const got = getComputedStyle(el).maxWidth;
		const sizeCls = [...el.classList].find((c) => c !== 'fontSize') || '(无档位类)';
		return { pass: got === want && got !== 'none', got, want: want + '（.' + sizeCls + '）' };
	})(),
	// The measure now varies by reader text size instead of being a flat 40rem.
	// Seven spellings, because the app and the bundled themes disagree on case.
	'版心五档（--measure，含两种大小写拼法）': (() => {
		const want = { smallText: '612px', mediumText: '640px', largeText: '668px', xLargeText: '692px', xxLargeText: '720px', xlargeText: '692px', xxlargeText: '720px' };
		const bad = [];
		for (const [cls, px] of Object.entries(want)) {
			const el = document.querySelector('.' + cls);
			if (!el) { bad.push(cls + ' 没有演示元素'); continue; }
			const got = getComputedStyle(el).getPropertyValue('--measure').trim();
			if (got !== px) bad.push(cls + ' = ' + (got || '(空)') + '，期望 ' + px);
		}
		return { pass: bad.length === 0, got: bad.length ? bad.join(' · ') : '七种拼法都给出了 --measure', want: '612/640/668/692/720px' };
	})(),
	// The sans stack's order is load-bearing, and every link was bought with a
	// measurement: Avenir Next carries Latin, PingFang SC has to come *before*
	// the system keywords or Han's 500 lands light of its Medium, and
	// -apple-system is last for what the named faces have no drawing for.
	'--font-sans 顺序：Avenir Next → PingFang SC → -apple-system': (() => {
		const entries = cs('body', 'font-family').split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
		const at = (n) => entries.indexOf(n);
		const problems = [];
		if (at('Avenir Next') !== 0) problems.push('Avenir Next 不在最前');
		for (const [a, b] of [['Avenir Next', 'PingFang SC'], ['PingFang SC', '-apple-system']]) {
			if (at(a) < 0 || at(b) < 0) problems.push(a + ' 或 ' + b + ' 不在栈里');
			else if (at(a) >= at(b)) problems.push(a + ' 排到了 ' + b + ' 之后');
		}
		if (at('Geist') >= 0) problems.push('还带着已经移除的 Geist');
		return { pass: problems.length === 0, got: problems.length ? problems.join(' · ') : entries.join(' → '), want: 'Avenir Next → PingFang SC → -apple-system' };
	})(),
	// --font-display is the 300 fix, not a style choice: Avenir Next has no Light,
	// so a 300 landing there is Ultra Light（实测 96px：8.36% 墨，Avenir 的真 Light
	// 是 19.40%）。所以显示字面的拉丁必须取 Avenir，且必须排在 Avenir Next 之前。
	'--font-display 顺序：Avenir → Avenir Next → PingFang SC → -apple-system': (() => {
		const el = document.querySelector('.articleTitle');
		if (!el) return { pass: false, got: '没有 .articleTitle 元素', want: '有' };
		const entries = getComputedStyle(el).fontFamily.split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
		const at = (n) => entries.indexOf(n);
		const problems = [];
		if (at('Avenir') !== 0) problems.push('Avenir 不在最前（300 会落到 Avenir Next 的 Ultra Light）');
		for (const n of ['Avenir Next', 'PingFang SC', '-apple-system']) {
			if (at(n) < 0) problems.push(n + ' 不在栈里');
			else if (at('Avenir') >= at(n)) problems.push('Avenir 排到了 ' + n + ' 之后');
		}
		return { pass: problems.length === 0, got: problems.length ? problems.join(' · ') : entries.join(' → '), want: 'Avenir → Avenir Next → PingFang SC → -apple-system' };
	})(),
	'core.css 已载入（html scrollbar-gutter）': eq('html', 'scrollbar-gutter', 'stable'),
	'theme 原则「无圆角」: 脚注芯片': eq('body a.footnote', 'border-radius', '0px'),
	'theme 原则「无圆角」: 脚注 popover': eq('.newsfoot-footnote-popover', 'border-radius', '0px'),
	'theme 原则「无圆角」: popover 内层': eq('.newsfoot-footnote-popover-inner', 'border-radius', '0px'),
	'emoji 仍被 core.css 限在 1em（我们的 !important 没越权）': (() => {
		const got = parseFloat(cs('img.emoji', 'max-height'));
		const em = parseFloat(cs('.articleBody p', 'font-size'));
		return { pass: got > 0 && got <= em * 1.05, got: got + 'px', want: '≤ ' + em + 'px（1em）' };
	})(),
	'纸张颗粒层 ::after 存在': {
		pass: parseFloat(getComputedStyle(document.body, '::after').opacity || '0') > 0,
		got: getComputedStyle(document.body, '::after').opacity,
		want: '> 0',
	},
	'暗色令牌可取': {
		pass: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim().length > 0,
		got: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
		want: '任意颜色值（跟随系统外观）',
	},
};

const failed = Object.entries(assertions)
	.filter(([, v]) => !v.pass)
	.map(([k, v]) => k + '  → 实测 ' + v.got + '，期望 ' + v.want);

// Informational: what core.css styles that this theme never mentions. These are
// not theme gaps — NetNewsWire styles them on purpose — but they are the answer
// to "what is this theme NOT deciding?".
const coreSelectors = coreSheet ? collectSelectors(coreSheet.cssRules, []) : [];
const themeSet = new Set(selectors.map((s) => s.replace(/:matches\(/g, ':is(')));
const coreOnly = [
	...new Set(
		coreSelectors
			.map((s) => s.replace(/:matches\(/g, ':is('))
			.filter((s) => !themeSet.has(s) && !s.startsWith('a[href*=') && !s.startsWith('img[src*=') && !s.startsWith('iframe[src*=')),
	),
].sort();

return JSON.stringify(
	{
		declaredSelectors: selectors.length,
		coreOnly,
		demoed: coverage.demoed.length,
		notDemoed: coverage.notDemoed,
		sourceBlocks,
		parsedRules,
		droppedRules: sourceBlocks - parsedRules,
		assertions: Object.keys(assertions).length,
		// The measured gaps, so a passing run still shows real numbers rather than
		// just the absence of complaints.
		spacing: Object.entries(assertions)
			.filter(([k]) => /^(间距|图与图注|短表格|嵌套表格|emoji 没被|正文第一个元素|字号档位)/.test(k))
			.map(([k, v]) => k + '  =  ' + v.got),
		failed,
	},
	null,
	1,
);
