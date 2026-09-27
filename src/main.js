import './style.css'
import '@themeloom/themes-classic/flourishes.css'
import './theme.js'
import { mountAds } from './ads.js'
import { readFile, sanitiseHtml, escapeHtml, tableFromHtml, tableToHtml } from './readers.js'
import { convert } from './writers.js'
import { htmlToBlocks, blocksToHtml } from './blocks.js'
import { FORMATS, INPUT_SUPPORT, commonTargets } from './formats.js'

const $ = (sel) => document.querySelector(sel)

const dropZone = $('#drop')
const fileInput = $('#fileInput')
const filesEl = $('#files')
const targetEl = $('#target')
const resultsEl = $('#results')
const previewEl = $('#preview')
const statusEl = $('#status')
const menubar = $('#menubar')
const formatsModal = $('#formatsModal')

let entries = []
let selectedId = null
let previewView = 'edit'
let nextId = 1

const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function setStatus(message, tone = '') {
  statusEl.textContent = message
  statusEl.dataset.tone = tone
}

/* ----------------------------------------------------------------- input --- */

dropZone.addEventListener('click', () => fileInput.click())
dropZone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    fileInput.click()
  }
})

dropZone.addEventListener('dragover', (event) => {
  event.preventDefault()
  dropZone.classList.add('is-over')
})
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('is-over'))
dropZone.addEventListener('drop', (event) => {
  event.preventDefault()
  dropZone.classList.remove('is-over')
  addFiles(event.dataTransfer.files)
})

fileInput.addEventListener('change', () => {
  addFiles(fileInput.files)
  fileInput.value = ''
})

$('#addBtn').addEventListener('click', () => fileInput.click())

async function addFiles(fileList) {
  const files = [...fileList]
  if (!files.length) return
  setStatus(`Reading ${files.length} file(s)…`)

  for (const file of files) {
    const entry = { id: nextId++, name: file.name, doc: null, error: null }
    entries.push(entry)
    renderFiles()

    try {
      entry.doc = await readFile(file)
    } catch (error) {
      entry.error = error.message || 'Could not read this file.'
    }

    if (!selectedId && entry.doc) selectedId = entry.id
    renderFiles()
    renderPreview()
  }

  refreshTargets()
  const ok = entries.filter((e) => e.doc).length
  setStatus(ok ? `${ok} file(s) ready to convert.` : 'No readable files yet.', ok ? 'ok' : 'warn')
}

/* ------------------------------------------------------------ file list --- */

function renderFiles() {
  filesEl.innerHTML = entries.map((entry) => {
    const state = entry.error ? 'error' : entry.doc ? 'ready' : 'loading'
    const detail = entry.error
      ? entry.error
      : entry.doc
        ? `${entry.doc.ext.toUpperCase()} · ${formatBytes(entry.doc.size)} · ${entry.doc.edited ? 'edited' : entry.doc.note}`
        : 'reading…'
    return `
      <li class="file file--${state} ${entry.id === selectedId ? 'is-selected' : ''}" data-id="${entry.id}">
        <button class="file__main" type="button" data-action="select" data-id="${entry.id}">
          <b>${entry.name}</b>
          <span>${detail}</span>
        </button>
        <button class="file__remove" type="button" data-action="remove" data-id="${entry.id}" aria-label="Remove">×</button>
      </li>`
  }).join('')
}

filesEl.addEventListener('click', (event) => {
  const button = event.target.closest('button')
  if (!button) return
  const id = Number(button.dataset.id)

  if (button.dataset.action === 'remove') {
    entries = entries.filter((entry) => entry.id !== id)
    if (selectedId === id) selectedId = entries.find((e) => e.doc)?.id ?? null
  } else {
    selectedId = id
  }

  renderFiles()
  renderPreview()
  refreshTargets()
})

function clearAll() {
  entries = []
  selectedId = null
  resultsEl.innerHTML = ''
  renderFiles()
  renderPreview()
  refreshTargets()
  setStatus('Cleared.')
}

$('#clear').addEventListener('click', clearAll)

/* -------------------------------------------------------------- targets --- */

function refreshTargets() {
  const docs = entries.filter((e) => e.doc).map((e) => e.doc)
  const targets = commonTargets(docs)
  const previous = targetEl.value

  targetEl.innerHTML = targets.map((t) => `<option value="${t}">${FORMATS[t].label}</option>`).join('')
  if (targets.includes(previous)) targetEl.value = previous

  const disabled = !targets.length
  targetEl.disabled = disabled
  $('#convert').disabled = disabled

  // The Convert menu lists the same formats, ticked like a Docs radio group.
  $('#targetMenu').innerHTML = targets.length
    ? targets.map((t) => `<button class="menu__item" type="button" data-do="target:${t}">${FORMATS[t].label}</button>`).join('')
    : '<p class="menu__empty">Add a file to see its formats</p>'
  markTargetMenu()
  syncAfterPane()

  if (docs.length > 1 && !targets.length) {
    setStatus('These files have no output format in common — convert them separately.', 'warn')
  }
}

function markTargetMenu() {
  $('#targetMenu').querySelectorAll('[data-do^="target:"]').forEach((item) => {
    item.classList.toggle('is-checked', item.dataset.do.slice(7) === targetEl.value)
  })
}

targetEl.addEventListener('change', () => {
  markTargetMenu()
  syncAfterPane()
})

/* -------------------------------------------------------------- preview --- */

/** The toolbar toggle and the View menu are two doors onto the same setting. */
function setPreviewView(view) {
  previewView = view
  $('#previewMode').querySelectorAll('.seg__btn').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === view)
  })
  menubar.querySelectorAll('[data-do="edit"], [data-do="compare"], [data-do="source"]').forEach((item) => {
    item.classList.toggle('is-checked', item.dataset.do === view)
  })
  renderPreview()
}

$('#previewMode').addEventListener('click', (event) => {
  const button = event.target.closest('.seg__btn')
  if (button) setPreviewView(button.dataset.view)
})

const activeDoc = () => entries.find((entry) => entry.id === selectedId)?.doc ?? null

/** One labelled page. Compare mode stacks two of these side by side. */
function makePane(label) {
  const pane = document.createElement('div')
  pane.className = 'pane'

  if (label) {
    const heading = document.createElement('p')
    heading.className = 'pane__label'
    heading.textContent = label
    pane.append(heading)
  }

  const page = document.createElement('article')
  page.className = 'page'
  pane.append(page)

  return { pane, page }
}

/**
 * The document itself, editable in place. Edits are written back to `doc.html`,
 * which is what every writer converts from — so what you see is what converts.
 */
function makeEditor(doc) {
  const editor = document.createElement('div')
  editor.className = 'doc doc--editable'
  editor.contentEditable = 'true'
  editor.spellcheck = false
  editor.setAttribute('role', 'textbox')
  editor.setAttribute('aria-multiline', 'true')
  editor.setAttribute('aria-label', 'Document content')
  editor.innerHTML = doc.html || '<p><br></p>'

  editor.addEventListener('input', () => queueEdit(doc, editor))
  editor.addEventListener('blur', flushEdit)

  // Pasted markup is cleaned before it lands, so nothing unsafe reaches an
  // exported HTML file.
  editor.addEventListener('paste', (event) => {
    const html = event.clipboardData?.getData('text/html')
    const text = event.clipboardData?.getData('text/plain') ?? ''
    event.preventDefault()
    const insert = html
      ? sanitiseHtml(html)
      : escapeHtml(text).replace(/\r?\n/g, '<br>')
    document.execCommand('insertHTML', false, insert)
  })

  return editor
}

let editTimer = null
let pendingEdit = null

function queueEdit(doc, editor) {
  pendingEdit = { doc, editor }
  clearTimeout(editTimer)
  editTimer = setTimeout(flushEdit, 350)
}

/**
 * Writes the pending keystrokes back to the document. Debounced while typing,
 * but forced on blur and before a conversion so nothing converts stale content.
 */
function flushEdit() {
  clearTimeout(editTimer)
  const pending = pendingEdit
  pendingEdit = null
  if (!pending) return

  const { doc, editor } = pending
  doc.html = sanitiseHtml(editor.innerHTML)
  doc.edited = true
  // Tabular output reads `doc.table`, so it has to follow the edited markup.
  if (doc.originalTable) doc.table = tableFromHtml(doc.html) ?? doc.table

  renderFiles()
  refreshOutputPane()
  setStatus('Edited — the conversion will use your changes.', 'ok')
}

function discardEdits() {
  const doc = activeDoc()
  if (!doc) return setStatus('Select a file first.', 'warn')
  if (!doc.edited) return setStatus('That file has no edits.')

  doc.html = doc.originalHtml
  doc.table = doc.originalTable
  doc.edited = false
  renderFiles()
  renderPreview()
  setStatus('Edits discarded — back to the file as it was read.', 'ok')
}

function renderPreview() {
  const doc = activeDoc()
  previewEl.classList.toggle('is-compare', previewView === 'compare')
  previewEl.replaceChildren()

  if (!doc) {
    const { pane, page } = makePane()
    const empty = document.createElement('p')
    empty.className = 'preview__empty'
    empty.textContent = 'Select a file to see what was read out of it.'
    page.append(empty)
    previewEl.append(pane)
    return
  }

  if (previewView === 'source') {
    const { pane, page } = makePane()
    const pre = document.createElement('pre')
    pre.textContent = doc.source || doc.html || ''
    page.append(pre)
    previewEl.append(pane)
    return
  }

  const compare = previewView === 'compare'
  const before = makePane(compare ? 'Before — your document' : null)
  before.page.append(makeEditor(doc))
  previewEl.append(before.pane)

  if (!compare) return

  const after = makePane(afterLabel())
  after.pane.querySelector('.pane__label').dataset.outLabel = ''
  after.page.dataset.out = ''
  const note = document.createElement('p')
  note.className = 'pane__note'
  note.dataset.outNote = ''
  after.pane.append(note)
  previewEl.append(after.pane)

  refreshOutputPane()
}

/* --------------------------------------------------------- output pane --- */

const afterLabel = () => (targetEl.value ? `After — ${FORMATS[targetEl.value].label}` : 'After')

/** Retargets the existing "after" pane without rebuilding the editor beside it. */
function syncAfterPane() {
  const label = previewEl.querySelector('[data-out-label]')
  if (!label) return
  label.textContent = afterLabel()
  refreshOutputPane()
}

let outputToken = 0
let outputUrl = null

/**
 * Builds the "after" side. Text formats show their real output; PDF shows the
 * actual generated file in a frame; DOCX and XLSX show the structure the writer
 * will build, since neither can be rendered here.
 */
async function buildOutputPreview(doc, target) {
  if (target === 'docx') {
    const el = document.createElement('div')
    el.className = 'doc'
    el.innerHTML = blocksToHtml(htmlToBlocks(doc.html || ''))
    return { node: el, note: 'Structure preview — DOCX is rebuilt from these blocks, not from the page styling.' }
  }

  if (target === 'xlsx') {
    if (!doc.table) throw new Error('Excel output needs tabular input.')
    const el = document.createElement('div')
    el.className = 'doc'
    el.innerHTML = tableToHtml(doc.table)
    return { node: el, note: 'The sheet that will be written.' }
  }

  const result = await convert(doc, target)

  if (target === 'pdf') {
    if (outputUrl) URL.revokeObjectURL(outputUrl)
    outputUrl = URL.createObjectURL(result.blob)
    const frame = document.createElement('iframe')
    frame.className = 'out-pdf'
    frame.title = 'Converted PDF'
    frame.src = outputUrl
    return { node: frame, note: 'The real PDF, rendered by your browser.' }
  }

  const pre = document.createElement('pre')
  pre.textContent = result.text
  return { node: pre, note: `Exactly what lands in the ${FORMATS[target].ext.toUpperCase()} file.` }
}

async function refreshOutputPane() {
  const host = previewEl.querySelector('[data-out]')
  const noteEl = previewEl.querySelector('[data-out-note]')
  const doc = activeDoc()
  if (!host || !doc) return

  const target = targetEl.value
  if (!target) {
    host.replaceChildren(placeholder('Pick an output format to see the result.'))
    noteEl.textContent = ''
    return
  }

  const token = ++outputToken
  host.replaceChildren(placeholder('Converting…'))

  try {
    const { node, note } = await buildOutputPreview(doc, target)
    if (token !== outputToken) return
    host.replaceChildren(node)
    noteEl.textContent = note
  } catch (error) {
    if (token !== outputToken) return
    host.replaceChildren(placeholder(error.message || 'Could not build this preview.'))
    noteEl.textContent = ''
  }
}

function placeholder(text) {
  const el = document.createElement('p')
  el.className = 'preview__empty'
  el.textContent = text
  return el
}

/* -------------------------------------------------------------- convert --- */

async function runConvert() {
  flushEdit() // never convert a document the user is still mid-keystroke on
  const docs = entries.filter((e) => e.doc)
  const target = targetEl.value
  if (!docs.length || !target) return

  $('#convert').disabled = true
  setStatus(`Converting ${docs.length} file(s) to ${FORMATS[target].label}…`)
  resultsEl.innerHTML = ''

  const outputs = []
  for (const entry of docs) {
    try {
      const result = await convert(entry.doc, target)
      outputs.push(result)
      appendResult(result)
    } catch (error) {
      appendResult({ filename: entry.doc.name, error: error.message || 'Conversion failed.' })
    }
  }

  $('#convert').disabled = false
  const ok = outputs.length
  setStatus(
    ok ? `Done — ${ok} file(s) converted.` : 'Nothing converted, see the messages below.',
    ok ? 'ok' : 'error',
  )

  if (outputs.length > 1) appendDownloadAll(outputs)
}

$('#convert').addEventListener('click', runConvert)

function appendResult(result) {
  const li = document.createElement('li')
  li.className = `result ${result.error ? 'result--error' : ''}`

  if (result.error) {
    li.innerHTML = `<div><b>${result.filename}</b><span>${result.error}</span></div>`
  } else {
    const url = URL.createObjectURL(result.blob)
    li.innerHTML = `
      <div><b>${result.filename}</b><span>${formatBytes(result.size)}</span></div>
      <a class="btn btn--small" href="${url}" download="${result.filename}">Download</a>`
  }

  resultsEl.append(li)
}

function appendDownloadAll(outputs) {
  const li = document.createElement('li')
  li.className = 'result result--all'
  li.innerHTML = '<div><b>All files</b><span>saves each one in turn</span></div>'

  const button = document.createElement('button')
  button.className = 'btn btn--small'
  button.textContent = `Download all (${outputs.length})`
  button.addEventListener('click', () => {
    outputs.forEach((result, index) => {
      setTimeout(() => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(result.blob)
        a.download = result.filename
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 2000)
      }, index * 350)
    })
  })

  li.append(button)
  resultsEl.append(li)
}

/* ----------------------------------------------------------------- menus --- */

/**
 * Docs-style menu bar. Every item is a real action that already exists
 * elsewhere in the UI — the menu is a second route to it, not a decoration.
 */
const MENU_ACTIONS = {
  add: () => fileInput.click(),
  clear: clearAll,
  discard: discardEdits,
  convert: runConvert,
  edit: () => setPreviewView('edit'),
  compare: () => setPreviewView('compare'),
  source: () => setPreviewView('source'),
  formats: () => formatsModal.showModal(),
}

function closeMenus() {
  menubar.querySelectorAll('[data-menu-panel]').forEach((panel) => { panel.hidden = true })
  menubar.querySelectorAll('[data-menu]').forEach((button) => button.classList.remove('is-open'))
}

menubar.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-menu]')
  if (trigger) {
    const panel = menubar.querySelector(`[data-menu-panel="${trigger.dataset.menu}"]`)
    const wasOpen = !panel.hidden
    closeMenus()
    if (!wasOpen) {
      panel.hidden = false
      trigger.classList.add('is-open')
    }
    return
  }

  const item = event.target.closest('[data-do]')
  if (!item) return
  closeMenus()

  if (item.dataset.do.startsWith('target:')) {
    targetEl.value = item.dataset.do.slice(7)
    markTargetMenu()
    return
  }

  MENU_ACTIONS[item.dataset.do]?.()
})

// Once a menu is open, anywhere else on the page dismisses it.
document.addEventListener('click', (event) => {
  if (!menubar.contains(event.target)) closeMenus()
})

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeMenus()
})

$('#formatsBtn').addEventListener('click', () => formatsModal.showModal())

/* --------------------------------------------------------------- matrix --- */

$('#matrix').innerHTML = INPUT_SUPPORT.map(
  (row) => `<div class="matrix__row"><b>${row.from}</b><span>→</span><i>${row.to}</i></div>`,
).join('')

renderFiles()
renderPreview()
refreshTargets()
mountAds()
