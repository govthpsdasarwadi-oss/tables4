export type ImageFormat = "image/jpeg" | "image/png" | "image/webp"

export const FORMAT_LABELS: Record<ImageFormat, string> = {
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WebP",
}

export const FORMAT_EXT: Record<ImageFormat, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

export type ImageProcessOptions = {
  /** Target width in px. If undefined, keep original (subject to maxWidth). */
  width?: number
  height?: number
  /** Output format. If undefined, keep original type. */
  format?: ImageFormat
  /** 0..1 quality for lossy formats. */
  quality: number
}

export async function loadImageBitmap(file: File | Blob): Promise<ImageBitmap> {
  // createImageBitmap handles orientation and is fast; fall back to <img> if needed.
  try {
    return await createImageBitmap(file)
  } catch {
    const url = URL.createObjectURL(file)
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image()
        el.crossOrigin = "anonymous"
        el.onload = () => resolve(el)
        el.onerror = reject
        el.src = url
      })
      return await createImageBitmap(img)
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
  }
}

function drawToCanvas(bitmap: ImageBitmap, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D context unavailable")
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      type,
      quality,
    )
  })
}

export type ImageResult = {
  blob: Blob
  width: number
  height: number
  type: ImageFormat
}

export async function processImage(file: File, options: ImageProcessOptions): Promise<ImageResult> {
  const bitmap = await loadImageBitmap(file)
  const srcW = bitmap.width
  const srcH = bitmap.height

  const targetW = options.width ?? srcW
  const targetH = options.height ?? srcH

  const type: ImageFormat =
    options.format ??
    (file.type === "image/png" || file.type === "image/webp" || file.type === "image/jpeg"
      ? (file.type as ImageFormat)
      : "image/jpeg")

  const canvas = drawToCanvas(bitmap, targetW, targetH)
  bitmap.close?.()

  // PNG ignores quality (lossless).
  const blob = await canvasToBlob(canvas, type, type === "image/png" ? 1 : options.quality)
  return { blob, width: canvas.width, height: canvas.height, type }
}

/**
 * Iteratively compress to hit a target byte size by lowering quality (and, if
 * needed, scaling down). Best-effort for JPEG/WebP.
 */
export async function compressToTarget(
  file: File,
  targetBytes: number,
  format: ImageFormat,
): Promise<ImageResult> {
  const bitmap = await loadImageBitmap(file)
  let scale = 1
  let best: ImageResult | null = null

  for (let attempt = 0; attempt < 8; attempt++) {
    const w = bitmap.width * scale
    const h = bitmap.height * scale
    const canvas = drawToCanvas(bitmap, w, h)

    // Binary search quality between 0.3 and 0.95 at this scale.
    let lo = 0.3
    let hi = 0.95
    let localBest: ImageResult | null = null
    for (let i = 0; i < 6; i++) {
      const q = (lo + hi) / 2
      const blob = await canvasToBlob(canvas, format, q)
      const res: ImageResult = { blob, width: canvas.width, height: canvas.height, type: format }
      if (blob.size > targetBytes) {
        hi = q
      } else {
        localBest = res
        lo = q
      }
    }

    if (localBest) {
      best = localBest
      break
    }
    // Even at lowest quality it's too big — scale down and retry.
    const fallback = await canvasToBlob(canvas, format, 0.3)
    best = { blob: fallback, width: canvas.width, height: canvas.height, type: format }
    scale *= 0.8
  }

  bitmap.close?.()
  return best!
}

export async function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await loadImageBitmap(file)
  const dims = { width: bitmap.width, height: bitmap.height }
  bitmap.close?.()
  return dims
}
