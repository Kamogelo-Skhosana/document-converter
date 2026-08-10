/**
 * Flattens HTML into a simple block list. PDF and DOCX output are both built
 * from these blocks, which keeps the two writers consistent.
 *
 * Block shapes:
 *   { type: 'heading', level: 1-4, text }
 *   { type: 'paragraph' | 'quote' | 'code', text }
 *   { type: 'bullet' | 'number', text }
 *   { type: 'rule' }
 *   { type: 'table', columns, rows }   // rows are arrays of strings
 */

const HEADINGS = { H1: 1, H2: 2, H3: 3, H4: 4, H5: 4, H6: 4 }

const clean = (node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim()

function tableBlock(table) {
  const rows = [...table.querySelectorAll('tr')].map((tr) =>
    [...tr.querySelectorAll('th, td')].map(clean),
  )
  if (!rows.length) return null
  const [columns, ...body] = rows
  return { type: 'table', columns, rows: body }
}

function walk(node, blocks) {
  for (const child of node.children) {
    const tag = child.tagName

    if (HEADINGS[tag]) {
      const text = clean(child)
      if (text) blocks.push({ type: 'heading', level: HEADINGS[tag], text })
    } else if (tag === 'P') {
      const text = clean(child)
      if (text) blocks.push({ type: 'paragraph', text })
    } else if (tag === 'UL' || tag === 'OL') {
      const type = tag === 'UL' ? 'bullet' : 'number'
      for (const item of child.children) {
        if (item.tagName !== 'LI') continue
        const text = clean(item)
        if (text) blocks.push({ type, text })
      }
    } else if (tag === 'BLOCKQUOTE') {
      const text = clean(child)
      if (text) blocks.push({ type: 'quote', text })
    } else if (tag === 'PRE') {
      const text = (child.textContent ?? '').replace(/\s+$/, '')
      if (text) blocks.push({ type: 'code', text })
    } else if (tag === 'HR') {
      blocks.push({ type: 'rule' })
    } else if (tag === 'TABLE') {
      const block = tableBlock(child)
      if (block) blocks.push(block)
    } else if (child.children.length) {
      walk(child, blocks)
    } else {
      const text = clean(child)
      if (text) blocks.push({ type: 'paragraph', text })
    }
  }
}

export function htmlToBlocks(html) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const blocks = []
  walk(doc.body, blocks)

  // Loose text directly under <body> (common for fragments) still needs capturing.
  if (!blocks.length) {
    const text = clean(doc.body)
    if (text) blocks.push({ type: 'paragraph', text })
  }
  return blocks
}

export function blocksToText(blocks) {
  let counter = 0
  let out = ''

  blocks.forEach((block, index) => {
    counter = block.type === 'number' ? counter + 1 : 0

    let text
    switch (block.type) {
      case 'heading':
        text = `${block.text}\n${'='.repeat(Math.min(block.text.length, 60))}`
        break
      case 'bullet':
        text = `- ${block.text}`
        break
      case 'number':
        text = `${counter}. ${block.text}`
        break
      case 'quote':
        text = `> ${block.text}`
        break
      case 'rule':
        text = '—'.repeat(40)
        break
      case 'table':
        text = [block.columns, ...block.rows].map((row) => row.join('\t')).join('\n')
        break
      default:
        text = block.text
    }

    // List items stay tight against each other, everything else gets a blank line.
    const previous = blocks[index - 1]
    const tight = previous?.type === block.type && (block.type === 'bullet' || block.type === 'number')
    out += index === 0 ? text : `${tight ? '\n' : '\n\n'}${text}`
  })

  return out
}
