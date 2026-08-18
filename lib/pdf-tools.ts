import { PDFDocument } from "pdf-lib"

// pdf.js references browser globals (DOMMatrix, etc.) at module scope, so it must
// only be loaded in the browser. Import it lazily inside client-only calls.
async function loadPdfjs() {
  const pdfjsLib = await import("pdfjs-dist")
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString()
  return pdfjsLib
}

async function readFile(file: File): Promise<ArrayBuffer> {
  return await file.arrayBuffer()
}

export async function getPdfPageCount(file: File): Promise<number> {
  const doc = await PDFDocument.load(await readFile(file), { ignoreEncryption: true })
  return doc.getPageCount()
}

/** Merge multiple PDFs (in order) into a single PDF. */
export async function mergePdfs(files: File[]): Promise<Blob> {
  const merged = await PDFDocument.create()
  for (const file of files) {
    const doc = await PDFDocument.load(await readFile(file), { ignoreEncryption: true })
    const pages = await merged.copyPages(doc, doc.getPageIndices())
    pages.forEach((p) => merged.addPage(p))
  }
  const bytes = await merged.save()
  return new Blob([bytes as BlobPart], { type: "application/pdf" })
}

/**
 * Split a PDF into one document per range group.
 * `ranges` is a list of 1-based inclusive page ranges, e.g. [[1,3],[4,4]].
 */
export async function splitPdf(
  file: File,
  ranges: Array<[number, number]>,
): Promise<Array<{ blob: Blob; label: string }>> {
  const src = await PDFDocument.load(await readFile(file), { ignoreEncryption: true })
  const total = src.getPageCount()
  const out: Array<{ blob: Blob; label: string }> = []

  for (const [start, end] of ranges) {
    const s = Math.max(1, start)
    const e = Math.min(total, end)
    if (s > e) continue
    const doc = await PDFDocument.create()
    const indices: number[] = []
    for (let i = s - 1; i <= e - 1; i++) indices.push(i)
    const pages = await doc.copyPages(src, indices)
    pages.forEach((p) => doc.addPage(p))
    const bytes = await doc.save()
    out.push({
      blob: new Blob([bytes as BlobPart], { type: "application/pdf" }),
      label: s === e ? `page-${s}` : `pages-${s}-${e}`,
    })
  }
  return out
}

/** Parse a page-range string like "1-3, 5, 8-10" into inclusive ranges. */
export function parseRanges(input: string, maxPage: number): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  for (const part of input.split(",")) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const m = trimmed.match(/^(\d+)\s*-\s*(\d+)$/)
    if (m) {
      ranges.push([Number(m[1]), Number(m[2])])
    } else if (/^\d+$/.test(trimmed)) {
      ranges.push([Number(trimmed), Number(trimmed)])
    }
  }
  return ranges
    .map(([a, b]) => [Math.min(a, b), Math.max(a, b)] as [number, number])
    .filter(([a]) => a <= maxPage)
}

/** Combine images into a single PDF, one image per page (fit to page). */
export async function imagesToPdf(
  files: File[],
  opts: { pageSize: "fit" | "a4" | "letter" } = { pageSize: "fit" },
): Promise<Blob> {
  const doc = await PDFDocument.create()
  const A4: [number, number] = [595.28, 841.89]
  const LETTER: [number, number] = [612, 792]

  for (const file of files) {
    const bytes = await readFile(file)
    let img
    if (file.type === "image/png") {
      img = await doc.embedPng(bytes)
    } else if (file.type === "image/jpeg") {
      img = await doc.embedJpg(bytes)
    } else {
      const png = await convertToPngBytes(file)
      img = await doc.embedPng(png)
    }

    if (opts.pageSize === "fit") {
      const page = doc.addPage([img.width, img.height])
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
    } else {
      const [pw, ph] = opts.pageSize === "a4" ? A4 : LETTER
      const margin = 24
      const maxW = pw - margin * 2
      const maxH = ph - margin * 2
      const scale = Math.min(maxW / img.width, maxH / img.height, 1)
      const w = img.width * scale
      const h = img.height * scale
      const page = doc.addPage([pw, ph])
      page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h })
    }
  }

  const out = await doc.save()
  return new Blob([out as BlobPart], { type: "application/pdf" })
}

async function convertToPngBytes(file: File): Promise<ArrayBuffer> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement("canvas")
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext("2d")!
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close?.()
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
  )
  return await blob.arrayBuffer()
}

export type CompressProgress = (done: number, total: number) => void

/**
 * Compress a PDF by rasterizing each page with pdf.js and re-embedding it as a
 * JPEG. `quality` is 0..1, `scale` controls output resolution.
 */
export async function compressPdf(
  file: File,
  opts: { quality: number; scale: number },
  onProgress?: CompressProgress,
): Promise<Blob> {
  const pdfjsLib = await loadPdfjs()
  const data = await readFile(file)
  const pdf = await pdfjsLib.getDocument({ data: data.slice(0) }).promise
  const outDoc = await PDFDocument.create()

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: opts.scale })
    const canvas = document.createElement("canvas")
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    const ctx = canvas.getContext("2d")!
    // White background so transparent PDFs don't turn black in JPEG.
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas, canvasContext: ctx, viewport }).promise

    const jpegBlob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
        "image/jpeg",
        opts.quality,
      ),
    )
    const jpegBytes = await jpegBlob.arrayBuffer()
    const img = await outDoc.embedJpg(jpegBytes)
    const pageDoc = outDoc.addPage([canvas.width, canvas.height])
    pageDoc.drawImage(img, { x: 0, y: 0, width: canvas.width, height: canvas.height })

    onProgress?.(i, pdf.numPages)
    page.cleanup()
  }

  await pdf.destroy()
  const bytes = await outDoc.save()
  return new Blob([bytes as BlobPart], { type: "application/pdf" })
}
