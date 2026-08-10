import { FORMATS } from './formats.js'
import { htmlToBlocks, blocksToText } from './blocks.js'
import { cellText, escapeHtml } from './readers.js'

const baseName = (name) => name.replace(/\.[^.]+$/, '')

/* ------------------------------------------------------------ markdown --- */

function mdEscapeCell(value) {
  return cellText(value).replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

export function tableToMarkdown({ columns, rows }) {
  const header = `| ${columns.map(mdEscapeCell).join(' | ')} |`
  const divider = `| ${columns.map(() => '---').join(' | ')} |`
  const body = rows.map((row) => `| ${columns.map((c) => mdEscapeCell(row[c])).join(' | ')} |`)
  return [header, divider, ...body].join('\n')
}

function domTableToMarkdown(node) {
  const rows = [...node.querySelectorAll('tr')].map((tr) =>
    [...tr.querySelectorAll('th, td')].map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim()),
  )
  if (!rows.length) return ''
  const [header, ...body] = rows
  const width = Math.max(...rows.map((r) => r.length))
  const pad = (row) => Array.from({ length: width }, (_, i) => (row[i] ?? '').replace(/\|/g, '\\|'))
  return [
    `| ${pad(header).join(' | ')} |`,
    `| ${pad([]).map(() => '---').join(' | ')} |`,
    ...body.map((row) => `| ${pad(row).join(' | ')} |`),
  ].join('\n')
}

async function toMarkdown(doc) {
  if (doc.ext === 'md' && doc.source) return doc.source
  if (doc.table) return tableToMarkdown(doc.table)

  const TurndownService = (await import('turndown')).default
  const service = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' })
  service.addRule('tables', {
    filter: ['table'],
    replacement: (_content, node) => `\n\n${domTableToMarkdown(node)}\n\n`,
  })
  return service.turndown(doc.html || '')
}

/* ---------------------------------------------------------------- html --- */

const HTML_SHELL = (title, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { max-width: 46rem; margin: 3rem auto; padding: 0 1.25rem;
         font: 16px/1.65 Georgia, "Times New Roman", serif; color: #1a1a1a; }
  h1, h2, h3, h4 { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
                   line-height: 1.25; margin: 2rem 0 .6rem; }
  table { border-collapse: collapse; width: 100%; margin: 1.5rem 0; font-size: .9em; }
  th, td { border: 1px solid #cbd0c6; padding: .5rem .65rem; text-align: left; }
  th { background: #f5f7f4; }
  pre { background: #f5f7f4; border: 1px solid #cbd0c6; padding: 1rem; overflow-x: auto;
        font-family: Consolas, "Liberation Mono", Menlo, monospace; }
  blockquote { border-left: 3px solid #cbd0c6; margin: 1.2rem 0; padding-left: 1rem; color: #57604f; }
  img { max-width: 100%; height: auto; }
</style>
</head>
<body>
${body}
</body>
</html>`

/* ----------------------------------------------------------------- pdf --- */

async function toPdf(doc) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 56
  const maxWidth = pageWidth - margin * 2
  let y = margin

  const space = (amount) => {
    y += amount
    if (y > pageHeight - margin) {
      pdf.addPage()
      y = margin
    }
  }

  const writeLines = (text, { size, style = 'normal', font = 'helvetica', indent = 0, leading = 1.4 }) => {
    pdf.setFont(font, style)
    pdf.setFontSize(size)
    const lines = pdf.splitTextToSize(text, maxWidth - indent)
    for (const line of lines) {
      if (y + size > pageHeight - margin) {
        pdf.addPage()
        y = margin
      }
      pdf.text(line, margin + indent, y)
      y += size * leading
    }
  }

  const blocks = htmlToBlocks(doc.html || '')
  const headingSize = { 1: 20, 2: 16, 3: 13.5, 4: 12 }
  let counter = 0

  for (const block of blocks) {
    counter = block.type === 'number' ? counter + 1 : 0

    switch (block.type) {
      case 'heading':
        space(block.level === 1 ? 8 : 12)
        writeLines(block.text, { size: headingSize[block.level], style: 'bold' })
        space(4)
        break
      case 'bullet':
        writeLines(`•  ${block.text}`, { size: 11, indent: 14 })
        space(2)
        break
      case 'number':
        writeLines(`${counter}.  ${block.text}`, { size: 11, indent: 14 })
        space(2)
        break
      case 'quote':
        writeLines(block.text, { size: 11, style: 'italic', indent: 18 })
        space(6)
        break
      case 'code':
        writeLines(block.text, { size: 9.5, font: 'courier', leading: 1.3 })
        space(6)
        break
      case 'rule':
        space(6)
        pdf.setDrawColor(190)
        pdf.line(margin, y, pageWidth - margin, y)
        space(12)
        break
      case 'table': {
        const columns = block.columns.length
        const colWidth = maxWidth / Math.max(columns, 1)
        const drawRow = (cells, bold) => {
          pdf.setFont('helvetica', bold ? 'bold' : 'normal')
          pdf.setFontSize(9.5)
          const wrapped = cells.map((cell) => pdf.splitTextToSize(cell ?? '', colWidth - 8))
          const height = Math.max(...wrapped.map((w) => w.length)) * 12 + 6
          if (y + height > pageHeight - margin) {
            pdf.addPage()
            y = margin
          }
          wrapped.forEach((lines, index) => {
            lines.forEach((line, row) => pdf.text(line, margin + index * colWidth + 2, y + 10 + row * 12))
          })
          y += height
          pdf.setDrawColor(210)
          pdf.line(margin, y, pageWidth - margin, y)
        }
        space(8)
        drawRow(block.columns, true)
        block.rows.forEach((row) => drawRow(row, false))
        space(12)
        break
      }
      default:
        writeLines(block.text, { size: 11 })
        space(6)
    }
  }

  const pages = pdf.internal.getNumberOfPages()
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8.5)
    pdf.setTextColor(140)
    pdf.text(`${page} / ${pages}`, pageWidth / 2, pageHeight - 28, { align: 'center' })
  }

  return pdf.output('blob')
}

/* ---------------------------------------------------------------- docx --- */

async function toDocx(doc) {
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel, BorderStyle,
    Table, TableRow, TableCell, WidthType,
  } = await import('docx')

  const headingFor = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3, 4: HeadingLevel.HEADING_4 }
  const blocks = htmlToBlocks(doc.html || '')
  const children = []
  let counter = 0

  const cell = (text, bold) => new TableCell({
    width: { size: 100, type: WidthType.AUTO },
    children: [new Paragraph({ children: [new TextRun({ text: text ?? '', bold, size: 20 })] })],
  })

  for (const block of blocks) {
    if (block.type !== 'number') counter = 0

    switch (block.type) {
      case 'heading':
        children.push(new Paragraph({ text: block.text, heading: headingFor[block.level], spacing: { before: 240, after: 120 } }))
        break
      case 'bullet':
        children.push(new Paragraph({ text: block.text, bullet: { level: 0 } }))
        break
      case 'number':
        counter += 1
        children.push(new Paragraph({ text: `${counter}. ${block.text}`, indent: { left: 360 } }))
        break
      case 'quote':
        children.push(new Paragraph({
          children: [new TextRun({ text: block.text, italics: true })],
          indent: { left: 480 },
          spacing: { after: 160 },
        }))
        break
      case 'code':
        for (const line of block.text.split('\n')) {
          children.push(new Paragraph({ children: [new TextRun({ text: line, font: 'Courier New', size: 19 })] }))
        }
        children.push(new Paragraph({ text: '' }))
        break
      case 'rule':
        children.push(new Paragraph({
          text: '',
          border: { bottom: { color: 'BFBFBF', style: BorderStyle.SINGLE, size: 6, space: 1 } },
          spacing: { after: 200 },
        }))
        break
      case 'table':
        children.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: block.columns.map((c) => cell(c, true)) }),
            ...block.rows.map((row) => new TableRow({
              children: block.columns.map((_, index) => cell(row[index], false)),
            })),
          ],
        }))
        children.push(new Paragraph({ text: '' }))
        break
      default:
        children.push(new Paragraph({ text: block.text, spacing: { after: 140 } }))
    }
  }

  if (!children.length) children.push(new Paragraph({ text: '' }))

  return Packer.toBlob(new Document({ sections: [{ properties: {}, children }] }))
}

/* --------------------------------------------------------------- tables --- */

async function toCsv(doc) {
  const Papa = (await import('papaparse')).default
  const { columns, rows } = doc.table
  return Papa.unparse({ fields: columns, data: rows.map((row) => columns.map((c) => cellText(row[c]))) })
}

async function toXlsx(doc) {
  const XLSX = await import('xlsx')
  const { columns, rows } = doc.table
  const sheet = XLSX.utils.json_to_sheet(
    rows.map((row) => Object.fromEntries(columns.map((c) => [c, row[c] ?? '']))),
    { header: columns },
  )
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Sheet1')
  return new Blob([XLSX.write(book, { bookType: 'xlsx', type: 'array' })], { type: FORMATS.xlsx.mime })
}

/* -------------------------------------------------------------- convert --- */

export async function convert(doc, target) {
  const format = FORMATS[target]
  if (!format) throw new Error(`Unknown output format: ${target}`)

  const needsTable = ['csv', 'json', 'xlsx'].includes(target)
  if (needsTable && !doc.table) {
    throw new Error(`${format.label} needs tabular input — try a CSV, JSON list or spreadsheet.`)
  }

  let blob
  let text = ''

  switch (target) {
    case 'html':
      text = HTML_SHELL(baseName(doc.name), doc.html || '')
      break
    case 'md':
      text = await toMarkdown(doc)
      break
    case 'txt':
      text = doc.table
        ? blocksToText(htmlToBlocks(doc.html))
        : doc.source && doc.ext === 'txt'
          ? doc.source
          : blocksToText(htmlToBlocks(doc.html || ''))
      break
    case 'csv':
      text = await toCsv(doc)
      break
    case 'json':
      text = JSON.stringify(doc.table.rows, null, 2)
      break
    case 'pdf':
      blob = await toPdf(doc)
      break
    case 'docx':
      blob = await toDocx(doc)
      break
    case 'xlsx':
      blob = await toXlsx(doc)
      break
    default:
      throw new Error(`Unsupported conversion to ${target}.`)
  }

  if (!blob) blob = new Blob([text], { type: `${format.mime};charset=utf-8` })

  return {
    blob,
    text,
    filename: `${baseName(doc.name)}.${format.ext}`,
    size: blob.size,
  }
}
