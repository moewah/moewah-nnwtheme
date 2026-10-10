# MoeWah · NetNewsWire 阅读主题

把 MoeWah 「档案纸面」风带进阅读器，这是一份给长文阅读的档案纸面主题。

底色是纸，分区只用发丝线，元数据一律等宽，强调色只有一个；没有圆角，也没有阴影。深浅色跟随系统，macOS 与 iOS 都能用。

设计取自 moewah.com。正文字面用系统自带的 Avenir Next 与 PingFang SC，主题只内嵌等宽的一个字族（176 KB）。

| 浅色 | 深色 |
| --- | --- |
| ![浅色](screenshots/light.webp) | ![深色](screenshots/dark.webp) |

*（图为 NetNewsWire 内的实际渲染）*

## 安装

**macOS**

```sh
./build.sh --install
```

然后在 NetNewsWire 的「设置」里把 **Article Theme** 选成 MoeWah。

**iOS**（NetNewsWire 6.1+）

```sh
./build.sh --zip
```

把 `dist/MoeWah.nnwtheme.zip` 放到可访问的地址，用 `netnewswire://theme/add?url=<zip 地址>` 打开。若本仓库已有 Release，直接下载其中的 `MoeWah.nnwtheme.zip` 也可以。

> 换主题后界面没变，就先切到别的主题再切回来。iOS 上链接打不开时，把 zip 解压后经「文件」导入。

## 设计

- **字体**：拉丁与中文都用系统字体（NetNewsWire 只有 macOS / iOS 版，这几套面每台设备都有）：正文 **Avenir Next**；标题与 h1 走 `--font-display` 取 **Avenir**（Avenir Next 没有 Light，300 会掉到 Ultra Light）；中文 **PingFang SC**。只有元数据、代码与图注内嵌 **IBM Plex Mono Var**（可变，wght 100–700，含真斜体）。
- **字号用 `em`**，跟随阅读器的字号设置。
- **版心也随字号走**，五档各一个列宽：14px→612 · 16px→640 · 18px→668 · 20px→692 · 22px→720。字号越大行越短（43.7 → 32.7 汉字/行）。窗口不足时取「视口宽度 − 88px」。
- **间距按实测值定**，样式清单第 11 节逐条列出。
- **表格**铺满列宽，结构只用横向规则：表头下一条 `--line`、行间一条发丝线、末行用 `--line` 收口（跟站点一致，没有外框、没有竖线）；封面图、代码块、引用块上下各留一档固定间距。
- **脚注**是反色直角芯片。

## 字体与许可

`stylesheet.css` 约 0.25 MB：只有等宽的两个面以 base64 内联在其中（Plex Mono Var 正体 + 斜体，176 KB）。拉丁与中文都不内嵌 —— 用系统的 Avenir Next / Avenir 与 PingFang SC。

内嵌的只有一个字族，SIL Open Font License 1.1，许可文本随产物分发（`fonts/OFL-IBM-Plex.txt`）。拉丁与中文都是系统字体，不内嵌、不再分发。主题代码为 MIT，见 [`LICENSE`](LICENSE)。

## 构建与检查

```sh
./build.sh
swift scripts/check_theme_fonts.swift dist/MoeWah.nnwtheme
swift scripts/check_theme_styles.swift dist/MoeWah.nnwtheme
python3 scripts/make_catalog.py   # 想逐个看样式时，输出到临时目录并打印路径
```

`dist/` 里只有要分发的 `MoeWah.nnwtheme`。

两条检查器按应用真实的方式加载主题（应用自带样式表 + 本主题 + 应用注入的脚本），断言 108 个选择器全部有演示、76 条计算样式、13 项脚本契约；需要本机装有 NetNewsWire。
