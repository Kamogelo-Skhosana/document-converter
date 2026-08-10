import { KIND } from './formats.js'

/** Heavy parsers are pulled in on demand so the first paint stays quick. */

const EXT_ALIASES = {
  htm: 'html',
  markdown: 'md',
  tsv: 'csv',
  xls: 'xlsx',
  text: 'txt',
}

export const escapeHtml = (value = '') =>
  value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))

const readText = (file) => file.text()
const readBuffer = (file) => file.arrayBuffer()

function textToHtml(text) {
  return text
    .split(/\r?\n\s*\r?\n/)
    .filter((block) => block.trim())
    .map((block) => `<p>${escapeHtml(block.trim()).replace(/\r?\n/g, '<br>')}</p>`)
    .join('\n')
}

export function tableToHtml({ columns, rows }) {
  const head = `<thead><tr>${columns.map((c) => `<th>${escapeHtml(String(c))}</th>`).join('')}</tr></thead>`
  const body = rows
    .map((row) => `<tr>${columns.map((c) => `<td>${escapeHtml(cellText(row[c]))}</td>`).join('')}</tr>`)
    .join('\n')
  return `<table>${head}<tbody>${body}</tbody></table>`
}

export function cellText(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** Removes scripts and event handlers before anything is rendered or converted. */
export function sanitiseHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script, style, iframe, object, embed, link[rel="import"]').forEach((n) => n.remove())
  doc.querySelectorAll('*').forEach((node) => {
    for (const attr of [...node.attributes]) {
      if (/^on/i.test(attr.name) || /javascript:/i.test(attr.value)) node.removeAttribute(attr.name)
    }
  })
  return doc.body.innerHTML
}

const readers = {
  async docx(file) {
    const mammoth = await import('mammoth')
    const { value, messages } = await mammoth.convertToHtml({ arrayBuffer: await readBuffer(file) })
    const warnings = messages.filter((m) => m.type === 'warning').length
    return {
      kind: KIND.DOC,
      html: sanitiseHtml(value),
      note: warnings ? `${warnings} formatting detail(s) simplified` : 'Word document read',
    }
  },

  async md(file) {
    const { marked } = await import('marked')
    const source = await readText(file)
    return {
      kind: KIND.DOC,
      html: sanitiseHtml(marked.parse(source, { async: false })),
      source,
      note: 'Markdown parsed',
    }
  },

  async html(file) {
    const source = await readText(file)
    return { kind: KIND.DOC, html: sanitiseHtml(source), source, note: 'HTML parsed' }
  },

  async txt(file) {
    const source = await readText(file)
    return { kind: KIND.TEXT, html: textToHtml(source), source, note: 'Plain text read' }
  },

  async csv(file) {
    const Papa = (await import('papaparse')).default
    const source = await readText(file)
    const parsed = Papa.parse(source.trim(), { header: true, skipEmptyLines: true, dynamicTyping: false })
    const columns = parsed.meta.fields ?? []
    return {
      kind: KIND.TABLE,
      table: { columns, rows: parsed.data },
      html: tableToHtml({ columns, rows: parsed.data }),
      source,
      note: `${parsed.data.length} row(s), ${columns.length} column(s)`,
    }
  },

  async json(file) {
    const source = await readText(file)
    const data = JSON.parse(source)
    const rows = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : null

    if (rows && rows.every((row) => row && typeof row === 'object' && !Array.isArray(row))) {
      const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))]
      return {
        kind: KIND.TABLE,
        table: { columns, rows },
        html: tableToHtml({ columns, rows }),
        source,
        note: `${rows.length} record(s)`,
      }
    }

    const pretty = JSON.stringify(data, null, 2)
    return {
      kind: KIND.TEXT,
      html: `<pre>${escapeHtml(pretty)}</pre>`,
      source: pretty,
      note: 'JSON is not a flat record list — treated as text',
    }
  },

  async xlsx(file) {
    const XLSX = await import('xlsx')
    const book = XLSX.read(await readBuffer(file), { type: 'array' })
    const sheetName = book.SheetNames[0]
    const matrix = XLSX.utils.sheet_to_json(book.Sheets[sheetName], { header: 1, blankrows: false, defval: '' })

    const [headerRow = [], ...dataRows] = matrix
    const columns = headerRow.map((c, i) => cellText(c) || `Column ${i + 1}`)
    const rows = dataRows.map((row) => Object.fromEntries(columns.map((c, i) => [c, cellText(row[i])])))

    return {
      kind: KIND.TABLE,
      table: { columns, rows },
      html: tableToHtml({ columns, rows }),
      note: `Sheet "${sheetName}" — ${rows.length} row(s)${book.SheetNames.length > 1 ? ` (of ${book.SheetNames.length} sheets)` : ''}`,
    }
  },

  async pdf(file) {
    const pdfjs = await import('pdfjs-dist')
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

    const pdf = await pdfjs.getDocument({ data: await readBuffer(file) }).promise
    const pages = []

    for (let index = 1; index <= pdf.numPages; index += 1) {
      const page = await pdf.getPage(index)
      const content = await page.getTextContent()
      let line = ''
      const lines = []

      for (const item of content.items) {
        line += item.str
        if (item.hasEOL) {
          lines.push(line.trim())
          line = ''
        }
      }
      if (line.trim()) lines.push(line.trim())
      pages.push(lines.filter(Boolean).join('\n'))
    }

    const source = pages.join('\n\n')
    return {
      kind: KIND.TEXT,
      html: pages.map((text) => textToHtml(text)).join('\n<hr>\n'),
      source,
      note: `${pdf.numPages} page(s) of text extracted${source.trim() ? '' : ' — this PDF looks scanned, no text layer found'}`,
    }
  },
}

export async function readFile(file) {
  const raw = file.name.split('.').pop()?.toLowerCase() ?? ''
  const ext = EXT_ALIASES[raw] ?? raw
  const reader = readers[ext]
  if (!reader) throw new Error(`${raw.toUpperCase() || 'This file type'} is not supported as an input.`)

  const parsed = await reader(file)
  return { name: file.name, size: file.size, ext, table: null, source: '', ...parsed }
}
