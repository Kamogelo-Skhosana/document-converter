# Document Converter

Convert documents between formats without uploading them anywhere — every parser
and writer runs in the browser.

## Run

```bash
npm install
npm run dev
```

Opens on http://localhost:5175

## Supported conversions

| From | To |
| --- | --- |
| DOCX | HTML, Markdown, TXT, PDF |
| PDF | TXT, Markdown, HTML, DOCX *(text layer only)* |
| HTML | Markdown, TXT, PDF, DOCX |
| Markdown | HTML, TXT, PDF, DOCX |
| TXT | HTML, Markdown, PDF, DOCX |
| CSV / TSV | JSON, XLSX, HTML, Markdown, TXT, PDF, DOCX |
| JSON *(list of records)* | CSV, XLSX, HTML, Markdown, TXT, PDF, DOCX |
| XLSX / XLS | CSV, JSON, HTML, Markdown, TXT, PDF, DOCX |

Drop several files at once — the format list narrows to the outputs every file supports.

## How it works

1. **Read** — each input is parsed into HTML (documents) or rows + columns (tabular data).
2. **Preview** — see exactly what was extracted, rendered or as source.
3. **Write** — HTML is flattened into blocks (headings, paragraphs, lists, quotes, code,
   tables) and rewritten into the target format.

## Known limits

- **PDF input** extracts the text layer. A scanned PDF has no text layer and will come out
  empty — that needs OCR, which this app doesn't do.
- **PDF/DOCX output** rebuilds the document from structure, not pixel-for-pixel layout.
  Headings, lists, quotes, code blocks and tables carry over; bespoke styling does not.
- **DOCX input** keeps structure and inline emphasis; images and complex layout are dropped.
- **XLSX input** reads the first sheet.

## Stack

Vite + vanilla JS. [mammoth](https://www.npmjs.com/package/mammoth) (DOCX in),
[pdfjs-dist](https://www.npmjs.com/package/pdfjs-dist) (PDF in),
[marked](https://www.npmjs.com/package/marked) / [turndown](https://www.npmjs.com/package/turndown)
(Markdown), [papaparse](https://www.npmjs.com/package/papaparse) (CSV),
[xlsx](https://www.npmjs.com/package/xlsx) (spreadsheets),
[jspdf](https://www.npmjs.com/package/jspdf) (PDF out),
[docx](https://www.npmjs.com/package/docx) (DOCX out). Parsers load on demand.
# document-converter
