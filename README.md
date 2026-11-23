# dsh-babel-notes · 巴别记翻译工作流

DeepSeek Harness（DSH）插件：把长篇翻译项目的脚手架、术语检查、LaTeX 元数据生成与进度查看打包成几个可直接调用的工具。

本插件只包含**工具链与空白模板**，不附带任何受版权保护的原文或译文。

## 安装

本地目录安装：

```sh
dsh plugin --profile demo add ./dsh-babel-notes
dsh --profile demo
```

从 npm 安装（发布后）：

```sh
dsh plugin --profile demo add dsh-babel-notes
```

从 GitHub 安装（0.1.0）：

```sh
dsh plugin --profile demo add github:TaikongWalker/dsh-babel-notes#bebfdc31401140bda1e12672e2a2af2affd90240
```

插件市场索引（把该 URL 添加到 DSH 的“发现”页）：

```text
https://raw.githubusercontent.com/TaikongWalker/dsh-babel-notes/main/market/index.json
```

安装后启动 DSH，插件会在 `profile` 中插入自己的配置层。

## 工具

| 工具 | 作用 |
|---|---|
| `translation_init` | 从内置模板创建翻译项目：`project.json`、`chapters/`、`notes/`、`glossary/`、`generated/` |
| `translation_prepare` | 运行 `prepare.py`，生成 `generated/meta.tex`、`chapters.tex`、`glossary.tex` |
| `translation_check` | 运行 `check.py`，检查术语残留/禁用变体、中文标点、脚注/图数量、未译英文、TODO |
| `translation_term_candidates` | 运行 `term_candidates.py`，从 `source/` 提取术语候选到 `glossary/candidates.csv` |
| `translation_status` | 读取 `project.json` 与 `notes/progress.csv`，返回项目进度 |

示例对话：

```text
用 translation_init 在 projects/my-book 建一个翻译项目，书名《……》，作者……。
用 translation_check 检查 projects/my-book 的术语和脚注。
用 translation_prepare 生成 projects/my-book 的 LaTeX 元数据。
```

## 项目模板

`template/` 是一个可直接编译的中文书籍骨架：

- `main.tex` + `preamble.tex`（XeLaTeX / ctexbook）
- `frontmatter/`：封面、版权页、译者说明
- `backmatter/`：术语表、译后记
- `chapters/`、`source/`、`figures/`、`generated/`
- `glossary/terms.csv`、`notes/context.md`、`style.md`、`decisions.md`、`progress.csv`

模板使用 `bigfoot` 处理超长脚注跨页，编译环境需安装 `bigfoot` 与 `ncctools`。构建脚本不在插件内，可用你自己的 `latexmk`/`build.ps1`。

## 开发

插件是普通 ESM 模块，入口为 `index.js`，导出 `name`、`inject = ['tools']` 与 `apply(ctx)`。

```js
export const name = 'babel-notes-translation'
export const inject = ['tools']
export function apply(ctx) {
  ctx.tools.register(/* defineTool({...}) */)
}
```

依赖由 DSH profile 提供：

- `@deepseek-ai/cordis`
- `@deepseek-ai/dsh-tools`

本地调试可用绝对路径 patch：

```yaml
- insert:
    - id: babel-notes
      name: '/absolute/path/to/dsh-babel-notes/index.js'
```

```sh
pnpm dsh web --patch ./cordis.patch.yml
```

## 发布

```sh
pnpm pack
npm publish --access public
```

或推送到 GitHub 后在插件市场索引中登记 Git 来源（需要 40 位 commit SHA）。

插件市场没有中心化审核：发布者把 `index.json` 托管到 HTTPS 静态主机，用户在“发现”页添加索引源。索引格式见 DSH 文档的“插件市场”。

## 版权

本插件不包含任何原文、译文或扫描件。使用者在项目中放入的原文与译文，其版权与使用范围由使用者自行负责。

## License

MIT
