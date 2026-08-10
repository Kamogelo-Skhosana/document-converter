import './style.css'
import { mountAds } from './ads.js'
import { readFile } from './readers.js'
import { convert } from './writers.js'
import { FORMATS, INPUT_SUPPORT, commonTargets } from './formats.js'

const $ = (sel) => document.querySelector(sel)

const dropZone = $('#drop')
const fileInput = $('#fileInput')
const filesEl = $('#files')
const targetEl = $('#target')
const resultsEl = $('#results')
const previewEl = $('#preview')
const statusEl = $('#status')

let entries = []
let selectedId = null
let previewView = 'rendered'
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
        ? `${entry.doc.ext.toUpperCase()} · ${formatBytes(entry.doc.size)} · ${entry.doc.note}`
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

$('#clear').addEventListener('click', () => {
  entries = []
  selectedId = null
  resultsEl.innerHTML = ''
  renderFiles()
  renderPreview()
  refreshTargets()
  setStatus('Cleared.')
})

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

  if (docs.length > 1 && !targets.length) {
    setStatus('These files have no output format in common — convert them separately.', 'warn')
  }
}

/* -------------------------------------------------------------- preview --- */

$('#previewMode').addEventListener('click', (event) => {
  const button = event.target.closest('.seg__btn')
  if (!button) return
  previewView = button.dataset.view
  $('#previewMode').querySelectorAll('.seg__btn').forEach((b) => b.classList.toggle('is-active', b === button))
  renderPreview()
})

function renderPreview() {
  const entry = entries.find((e) => e.id === selectedId)
  if (!entry?.doc) {
    previewEl.innerHTML = '<p class="preview__empty">Select a file to see what was read out of it.</p>'
    return
  }

  if (previewView === 'rendered') {
    previewEl.innerHTML = `<article class="doc">${entry.doc.html || '<p><em>No content found.</em></p>'}</article>`
  } else {
    const source = entry.doc.source || entry.doc.html || ''
    previewEl.innerHTML = '<pre></pre>'
    previewEl.firstChild.textContent = source
  }
}

/* -------------------------------------------------------------- convert --- */

$('#convert').addEventListener('click', async () => {
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
})

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

/* --------------------------------------------------------------- matrix --- */

$('#matrix').innerHTML = INPUT_SUPPORT.map(
  (row) => `<div class="matrix__row"><b>${row.from}</b><span>→</span><i>${row.to}</i></div>`,
).join('')

renderFiles()
refreshTargets()
mountAds()
