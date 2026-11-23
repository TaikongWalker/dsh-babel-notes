import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs/promises'
import { defineTool } from '@deepseek-ai/dsh-tools'

const execFileAsync = promisify(execFile)
const HERE = path.dirname(fileURLToPath(import.meta.url))
const SCRIPTS = path.join(HERE, 'scripts')
const TEMPLATE = path.join(HERE, 'template')
const PYTHON = process.platform === 'win32' ? 'python' : 'python3'

export const name = 'babel-notes-translation'
export const inject = ['tools']

async function runPython(script, args, cwd) {
  const full = path.join(SCRIPTS, script)
  try {
    const { stdout, stderr } = await execFileAsync(PYTHON, [full, ...args], {
      cwd,
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })
    return { code: 0, stdout, stderr }
  } catch (err) {
    return {
      code: typeof err.code === 'number' ? err.code : 1,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? String(err),
    }
  }
}

function asText(result) {
  const parts = []
  if (result.stdout.trim()) parts.push(result.stdout.trim())
  if (result.stderr.trim()) parts.push(`[stderr]\n${result.stderr.trim()}`)
  if (result.code !== 0) parts.push(`[exit ${result.code}]`)
  return parts.join('\n\n') || '(no output)'
}

async function requireProject(projectDir) {
  const target = path.resolve(projectDir)
  let stat
  try {
    stat = await fs.stat(target)
  } catch {
    throw new Error(`项目目录不存在：${target}`)
  }
  if (!stat.isDirectory()) throw new Error(`不是目录：${target}`)
  return target
}

function textOutput() {
  return {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: value }],
  }
}

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'translation_init',
    description: 'Create a Chinese translation project from the bundled LaTeX/Markdown template. Creates project.json, chapters, notes, glossary and generated directories without copying any copyrighted source text.',
    parameters: {
      project_dir: { type: 'string', required: true, description: 'Directory to create the translation project in (absolute, or relative to the current workspace).' },
      title: { type: 'string', required: true, description: 'Chinese title of the translated work.' },
      subtitle: { type: 'string', description: 'Chinese subtitle (optional).' },
      author: { type: 'string', description: 'Author name in Chinese (optional).' },
      slug: { type: 'string', description: 'Project slug; defaults to the directory name.' },
      source_lang: { type: 'string', description: 'Source language code; defaults to en.' },
      year: { type: 'string', description: 'Edition year; defaults to the current year.' },
    },
    output: textOutput(),
    async execute(args) {
      const target = path.resolve(args.project_dir)
      let exists = false
      try {
        const stat = await fs.stat(target)
        if (!stat.isDirectory()) throw new Error(`目标已存在且不是目录：${target}`)
        const entries = await fs.readdir(target)
        if (entries.length > 0) throw new Error(`目标目录非空：${target}`)
        exists = true
      } catch (err) {
        if (err?.code !== 'ENOENT') throw err
      }
      if (!exists) await fs.mkdir(target, { recursive: true })
      await fs.cp(TEMPLATE, target, { recursive: true })

      const slug = (args.slug || path.basename(target)).replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'translation'
      const meta = {
        slug,
        title: args.title,
        subtitle: args.subtitle || '',
        title_original: 'Original Title',
        subtitle_original: '',
        author: args.author || '作者中文名',
        author_original: 'Author Name',
        translator: '',
        series: '',
        publisher: '',
        original_publisher: '',
        original_year: '',
        year: args.year || String(new Date().getFullYear()),
        version: '0.1',
        source_lang: args.source_lang || 'en',
        target_lang: 'zh-CN',
        rights: '版权待确认',
        keywords: '翻译',
      }
      await fs.writeFile(path.join(target, 'project.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8')
      return [
        `已创建翻译项目：${target}`,
        `书名：${meta.title}`,
        `下一步：`,
        `1. 把原文抽取结果放入 source/（只读）`,
        `2. 填写 notes/context.md 与 notes/style.md`,
        `3. 在 glossary/terms.csv 定名术语`,
        `4. 用 translation_prepare 生成 LaTeX 元数据`,
        `5. 用 translation_check 做质量检查`,
      ].join('\n')
    },
  }))

  ctx.tools.register(defineTool({
    name: 'translation_prepare',
    description: 'Generate generated/meta.tex, generated/chapters.tex and generated/glossary.tex from project.json, chapters/*.tex and glossary/terms.csv.',
    parameters: {
      project_dir: { type: 'string', required: true, description: 'Translation project directory.' },
      final_only: { type: 'boolean', description: 'Only include glossary entries with status=final.' },
    },
    output: textOutput(),
    async execute(args) {
      const target = await requireProject(args.project_dir)
      const extra = args.final_only ? ['--final-only'] : []
      const result = await runPython('prepare.py', ['--project', target, ...extra], target)
      return asText(result)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'translation_check',
    description: 'Run the translation QA checker: terminology consistency, forbidden variants, Chinese punctuation, footnote/figure counts, untranslated English runs and TODO markers.',
    parameters: {
      project_dir: { type: 'string', required: true, description: 'Translation project directory.' },
      summary: { type: 'boolean', description: 'Only print the summary; defaults to true.' },
      max_details: { type: 'number', description: 'Maximum details per issue type; default 20, 0 means all.' },
    },
    output: textOutput(),
    async execute(args) {
      const target = await requireProject(args.project_dir)
      const argv = ['--project', target]
      if (args.summary !== false) argv.push('--summary')
      argv.push('--max-details', String(args.max_details ?? 20))
      const result = await runPython('check.py', argv, target)
      const head = result.code === 0
        ? '检查完成：未发现阻断性错误。'
        : `检查完成：发现阻断性错误（退出码 ${result.code}）。`
      return `${head}\n\n${asText(result)}`
    },
  }))

  ctx.tools.register(defineTool({
    name: 'translation_term_candidates',
    description: 'Extract term candidates (proper nouns, acronyms, repeated concepts) from source/ into glossary/candidates.csv for manual review.',
    parameters: {
      project_dir: { type: 'string', required: true, description: 'Translation project directory.' },
      min_count: { type: 'number', description: 'Minimum occurrence count; default 2.' },
      limit: { type: 'number', description: 'Maximum candidates; default 100.' },
    },
    output: textOutput(),
    async execute(args) {
      const target = await requireProject(args.project_dir)
      const argv = ['--project', target, '--min-count', String(args.min_count ?? 2), '--limit', String(args.limit ?? 100)]
      const result = await runPython('term_candidates.py', argv, target)
      return asText(result)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'translation_status',
    description: 'Read project.json and notes/progress.csv and return the current translation progress.',
    parameters: {
      project_dir: { type: 'string', required: true, description: 'Translation project directory.' },
    },
    output: textOutput(),
    async execute(args) {
      const target = await requireProject(args.project_dir)
      const meta = JSON.parse(await fs.readFile(path.join(target, 'project.json'), 'utf8'))
      let progress = ''
      try {
        progress = await fs.readFile(path.join(target, 'notes', 'progress.csv'), 'utf8')
      } catch {
        progress = '(notes/progress.csv not found)'
      }
      const lines = progress.trim().split(/\r?\n/).filter(Boolean)
      const rows = Math.max(lines.length - 1, 0)
      const done = lines.slice(1).filter((line) =>
        line.includes(',润色,') || line.includes(',终检,') || line.includes(',完成,') || line.includes(',done,'),
      ).length
      return [
        `项目：${meta.title || meta.slug}`,
        `版本：${meta.version || '?'}`,
        `状态：${done}/${Math.max(rows, 0)} 个单元进入润色或终检`,
        '',
        progress.trim() || '(empty)',
      ].join('\n')
    },
  }))
}
