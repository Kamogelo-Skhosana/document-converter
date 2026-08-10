export const KIND = {
  DOC: 'doc',
  TABLE: 'table',
  TEXT: 'text',
}

export const FORMATS = {
  html: { label: 'HTML', ext: 'html', mime: 'text/html' },
  md: { label: 'Markdown', ext: 'md', mime: 'text/markdown' },
  txt: { label: 'Plain text', ext: 'txt', mime: 'text/plain' },
  pdf: { label: 'PDF', ext: 'pdf', mime: 'application/pdf' },
  docx: { label: 'Word (DOCX)', ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  csv: { label: 'CSV', ext: 'csv', mime: 'text/csv' },
  json: { label: 'JSON', ext: 'json', mime: 'application/json' },
  xlsx: { label: 'Excel (XLSX)', ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
}

const DOCUMENT_TARGETS = ['html', 'md', 'txt', 'pdf', 'docx']
const TABLE_TARGETS = ['csv', 'json', 'xlsx', ...DOCUMENT_TARGETS]

/** Which output formats make sense for a parsed document. */
export function targetsFor(doc) {
  if (!doc) return []
  const targets = doc.kind === KIND.TABLE ? TABLE_TARGETS : DOCUMENT_TARGETS
  return targets.filter((t) => t !== doc.ext)
}

/** Targets available for a whole batch — the intersection of every file's targets. */
export function commonTargets(docs) {
  const lists = docs.map(targetsFor)
  if (!lists.length) return []
  return lists.reduce((acc, list) => acc.filter((t) => list.includes(t)))
}

export const INPUT_SUPPORT = [
  { from: 'DOCX', to: 'HTML, Markdown, TXT, PDF' },
  { from: 'PDF', to: 'TXT, Markdown, HTML, DOCX (text only)' },
  { from: 'HTML', to: 'Markdown, TXT, PDF, DOCX' },
  { from: 'Markdown', to: 'HTML, TXT, PDF, DOCX' },
  { from: 'TXT', to: 'HTML, Markdown, PDF, DOCX' },
  { from: 'CSV / TSV', to: 'JSON, XLSX, HTML, Markdown, TXT, PDF, DOCX' },
  { from: 'JSON', to: 'CSV, XLSX, HTML, Markdown, TXT, PDF, DOCX' },
  { from: 'XLSX / XLS', to: 'CSV, JSON, HTML, Markdown, TXT, PDF, DOCX' },
]
