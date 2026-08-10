/**
 * Ad slots.
 *
 * Slots are plain containers in the markup (`<aside data-ad="rail">`) that this
 * module fills at runtime. Nothing here is specific to one ad network: set
 * AD_CLIENT and the matching slot IDs to serve AdSense, leave them blank and the
 * slots carry house promos for the sibling tools instead. That fallback means a
 * slot is never an empty bordered box — in development, or when a network is
 * blocked or fails to load, the page still looks finished.
 */

/* -------------------------------------------------------------- config --- */

// From the AdSense dashboard: the publisher ID, then one slot ID per format.
const AD_CLIENT = ''
const AD_SLOTS = {
  leaderboard: '',
  rail: '',
}

// Where the sibling tools are hosted. Blank leaves the house promo unlinked.
const TOOLS_BASE = ''

const SELF = 'document-converter'

const SIBLINGS = [
  { id: 'document-converter', name: 'Document Converter', line: 'DOCX, PDF, Markdown and spreadsheets, converted in the browser.' },
  { id: 'image-editor', name: 'Image Editor', line: 'Crop, straighten, adjust and convert images without uploading them.' },
  { id: 'ambigram-creator', name: 'Ambigram Creator', line: 'Design words that read the same upside down.' },
  { id: 'qr-code-generator', name: 'QR Code Generator', line: 'Links, Wi-Fi and contact cards as scannable codes.' },
]

/* --------------------------------------------------------------- mount --- */

export function mountAds() {
  const slots = document.querySelectorAll('[data-ad]')
  if (!slots.length) return

  const live = Boolean(AD_CLIENT)
  if (live) loadNetwork()

  slots.forEach((slot, index) => {
    const format = slot.dataset.ad
    slot.append(label())

    const body = document.createElement('div')
    body.className = 'ad__body'
    body.append(live && AD_SLOTS[format] ? networkUnit(format) : houseUnit(index))
    slot.append(body)
  })
}

function label() {
  const el = document.createElement('span')
  el.className = 'ad__label'
  el.textContent = 'Advertisement'
  return el
}

/* ------------------------------------------------------------- network --- */

function loadNetwork() {
  if (document.querySelector('script[data-ads]')) return
  const script = document.createElement('script')
  script.async = true
  script.crossOrigin = 'anonymous'
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${AD_CLIENT}`
  script.dataset.ads = ''
  document.head.append(script)
}

function networkUnit(format) {
  const ins = document.createElement('ins')
  ins.className = 'adsbygoogle'
  ins.style.display = 'block'
  ins.dataset.adClient = AD_CLIENT
  ins.dataset.adSlot = AD_SLOTS[format]
  // Let the unit size itself to the slot rather than pinning a fixed 728x90 etc,
  // so the rail and leaderboard stay responsive on narrow screens.
  ins.dataset.adFormat = format === 'rail' ? 'rectangle' : 'horizontal'
  ins.dataset.fullWidthResponsive = 'true'
  ;(window.adsbygoogle = window.adsbygoogle || []).push({})
  return ins
}

/* --------------------------------------------------------------- house --- */

function houseUnit(index) {
  const others = SIBLINGS.filter((tool) => tool.id !== SELF)
  const tool = others[index % others.length]

  const card = document.createElement(TOOLS_BASE ? 'a' : 'div')
  card.className = 'ad__house'
  if (TOOLS_BASE) card.href = `${TOOLS_BASE}/${tool.id}`

  const kicker = document.createElement('span')
  kicker.className = 'ad__kicker'
  kicker.textContent = 'Also from us'

  const name = document.createElement('b')
  name.textContent = tool.name

  const line = document.createElement('span')
  line.className = 'ad__line'
  line.textContent = tool.line

  card.append(kicker, name, line)
  return card
}
