"use client"

import { useCallback, useState } from "react"
import { ArrowDown, ArrowUp, Download, FileText, Loader2, Scissors, Trash2, X } from "lucide-react"
import { Dropzone } from "@/components/dropzone"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  compressPdf,
  getPdfPageCount,
  imagesToPdf,
  mergePdfs,
  parseRanges,
  splitPdf,
} from "@/lib/pdf-tools"
import { downloadBlob, formatBytes, percentChange, stripExtension } from "@/lib/format"

type PdfItem = { id: string; file: File; pages?: number }

function useBusy() {
  const [busy, setBusy] = useState(false)
  return { busy, setBusy }
}

export function PdfTool() {
  return (
    <Tabs defaultValue="compress" className="w-full">
      <TabsList className="mb-6 grid w-full grid-cols-2 gap-1 sm:grid-cols-4">
        <TabsTrigger value="compress">Compress</TabsTrigger>
        <TabsTrigger value="merge">Merge</TabsTrigger>
        <TabsTrigger value="split">Split</TabsTrigger>
        <TabsTrigger value="topdf">Images → PDF</TabsTrigger>
      </TabsList>
      <TabsContent value="compress">
        <CompressPanel />
      </TabsContent>
      <TabsContent value="merge">
        <MergePanel />
      </TabsContent>
      <TabsContent value="split">
        <SplitPanel />
      </TabsContent>
      <TabsContent value="topdf">
        <ImagesToPdfPanel />
      </TabsContent>
    </Tabs>
  )
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return <Card className="flex flex-col gap-5 p-5 sm:p-6">{children}</Card>
}

/* ---------------- Compress ---------------- */
function CompressPanel() {
  const [file, setFile] = useState<File | null>(null)
  const [quality, setQuality] = useState(60)
  const [resolution, setResolution] = useState(1.5)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<Blob | null>(null)
  const { busy, setBusy } = useBusy()

  const run = async () => {
    if (!file) return
    setBusy(true)
    setResult(null)
    setProgress(0)
    try {
      const blob = await compressPdf(
        file,
        { quality: quality / 100, scale: resolution },
        (done, total) => setProgress(Math.round((done / total) * 100)),
      )
      setResult(blob)
    } finally {
      setBusy(false)
    }
  }

  return (
    <SectionCard>
      {!file ? (
        <Dropzone
          accept="application/pdf"
          onFiles={(f) => setFile(f[0] ?? null)}
          title="Drop a PDF to compress"
          hint="Pages are re-rendered and re-compressed to shrink file size."
        />
      ) : (
        <>
          <FileRow file={file} onRemove={() => (setFile(null), setResult(null))} />
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <Label className="font-semibold">Image quality</Label>
              <span className="font-bold">{quality}%</span>
            </div>
            <Slider value={[quality]} min={20} max={90} step={5} onValueChange={(v) => setQuality(v[0])} />
          </div>
          <div className="flex flex-col gap-2">
            <Label className="font-semibold">Resolution</Label>
            <Select value={String(resolution)} onValueChange={(v) => setResolution(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Low (smaller file)</SelectItem>
                <SelectItem value="1.5">Medium</SelectItem>
                <SelectItem value="2">High (sharper)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {busy && <Progress value={progress} />}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={run} disabled={busy} size="lg" className="flex-1 font-bold">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
              {busy ? `Compressing… ${progress}%` : "Compress PDF"}
            </Button>
            {result && (
              <ResultButton
                blob={result}
                name={`${stripExtension(file.name)}-compressed.pdf`}
                originalSize={file.size}
              />
            )}
          </div>
        </>
      )}
    </SectionCard>
  )
}

/* ---------------- Merge ---------------- */
function MergePanel() {
  const [items, setItems] = useState<PdfItem[]>([])
  const [result, setResult] = useState<Blob | null>(null)
  const { busy, setBusy } = useBusy()

  const add = useCallback((files: File[]) => {
    const pdfs = files
      .filter((f) => f.type === "application/pdf")
      .map((file) => ({ id: crypto.randomUUID(), file }))
    setItems((prev) => [...prev, ...pdfs])
    setResult(null)
  }, [])

  const move = (index: number, dir: -1 | 1) => {
    setItems((prev) => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const run = async () => {
    if (items.length < 2) return
    setBusy(true)
    try {
      const blob = await mergePdfs(items.map((i) => i.file))
      setResult(blob)
    } finally {
      setBusy(false)
    }
  }

  const totalSize = items.reduce((s, i) => s + i.file.size, 0)

  return (
    <SectionCard>
      {items.length === 0 ? (
        <Dropzone
          accept="application/pdf"
          multiple
          onFiles={add}
          title="Drop PDFs to merge"
          hint="Add two or more PDFs, reorder them, then combine into one."
        />
      ) : (
        <>
          <div className="grid gap-2">
            {items.map((it, i) => (
              <Card key={it.id} className="flex flex-row items-center gap-3 p-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 font-display font-bold text-primary">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{it.file.name}</p>
                  <p className="text-sm text-muted-foreground">{formatBytes(it.file.size)}</p>
                </div>
                <Button size="icon" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => move(i, 1)}
                  disabled={i === items.length - 1}
                  aria-label="Move down"
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setItems((prev) => prev.filter((p) => p.id !== it.id))}
                  aria-label="Remove"
                  className="text-muted-foreground"
                >
                  <X className="size-4" />
                </Button>
              </Card>
            ))}
          </div>
          <Dropzone accept="application/pdf" multiple onFiles={add} title="Add more PDFs" hint="" className="py-6" />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={run} disabled={items.length < 2 || busy} size="lg" className="flex-1 font-bold">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
              Merge {items.length} PDFs
            </Button>
            {result && <ResultButton blob={result} name="merged.pdf" originalSize={totalSize} />}
          </div>
        </>
      )}
    </SectionCard>
  )
}

/* ---------------- Split ---------------- */
function SplitPanel() {
  const [file, setFile] = useState<File | null>(null)
  const [pages, setPages] = useState(0)
  const [ranges, setRanges] = useState("")
  const [results, setResults] = useState<Array<{ blob: Blob; label: string }>>([])
  const { busy, setBusy } = useBusy()

  const onFile = async (f: File | null) => {
    setFile(f)
    setResults([])
    if (f) {
      try {
        setPages(await getPdfPageCount(f))
      } catch {
        setPages(0)
      }
    }
  }

  const run = async () => {
    if (!file) return
    const parsed = parseRanges(ranges, pages)
    if (parsed.length === 0) return
    setBusy(true)
    try {
      setResults(await splitPdf(file, parsed))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SectionCard>
      {!file ? (
        <Dropzone
          accept="application/pdf"
          onFiles={(f) => onFile(f[0] ?? null)}
          title="Drop a PDF to split"
          hint="Extract specific pages or ranges into separate PDF files."
        />
      ) : (
        <>
          <FileRow file={file} onRemove={() => onFile(null)} extra={pages > 0 ? `${pages} pages` : undefined} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="ranges" className="font-semibold">
              Page ranges
            </Label>
            <Input
              id="ranges"
              placeholder="e.g. 1-3, 5, 8-10"
              value={ranges}
              onChange={(e) => setRanges(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Each range becomes its own PDF. Separate with commas.
            </p>
          </div>
          <Button onClick={run} disabled={busy || !ranges.trim()} size="lg" className="font-bold">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Scissors className="size-4" />}
            Split PDF
          </Button>
          {results.length > 0 && (
            <div className="grid gap-2">
              {results.map((r) => (
                <Card key={r.label} className="flex flex-row items-center gap-3 p-3">
                  <FileText className="size-5 shrink-0 text-secondary-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {stripExtension(file.name)}-{r.label}.pdf
                    </p>
                    <p className="text-sm text-muted-foreground">{formatBytes(r.blob.size)}</p>
                  </div>
                  <Button
                    size="icon"
                    variant="secondary"
                    onClick={() =>
                      downloadBlob(r.blob, `${stripExtension(file.name)}-${r.label}.pdf`)
                    }
                    aria-label="Download"
                  >
                    <Download className="size-4" />
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </SectionCard>
  )
}

/* ---------------- Images to PDF ---------------- */
function ImagesToPdfPanel() {
  const [items, setItems] = useState<Array<{ id: string; file: File; url: string }>>([])
  const [pageSize, setPageSize] = useState<"fit" | "a4" | "letter">("a4")
  const [result, setResult] = useState<Blob | null>(null)
  const { busy, setBusy } = useBusy()

  const add = useCallback((files: File[]) => {
    const imgs = files
      .filter((f) => f.type.startsWith("image/"))
      .map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }))
    setItems((prev) => [...prev, ...imgs])
    setResult(null)
  }, [])

  const remove = (id: string) =>
    setItems((prev) => {
      const found = prev.find((p) => p.id === id)
      if (found) URL.revokeObjectURL(found.url)
      return prev.filter((p) => p.id !== id)
    })

  const run = async () => {
    if (items.length === 0) return
    setBusy(true)
    try {
      setResult(await imagesToPdf(items.map((i) => i.file), { pageSize }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SectionCard>
      {items.length === 0 ? (
        <Dropzone
          accept="image/*"
          multiple
          onFiles={add}
          title="Drop images to make a PDF"
          hint="Each image becomes a page, in the order you add them."
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {items.map((it, i) => (
              <div key={it.id} className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={it.url || "/placeholder.svg"}
                  alt={it.file.name}
                  className="aspect-square w-full rounded-xl border border-border object-cover"
                />
                <span className="absolute left-1.5 top-1.5 flex size-6 items-center justify-center rounded-md bg-foreground/80 font-display text-xs font-bold text-background">
                  {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => remove(it.id)}
                  aria-label="Remove"
                  className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-md bg-destructive text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
          <Dropzone accept="image/*" multiple onFiles={add} title="Add more images" hint="" className="py-6" />
          <div className="flex flex-col gap-2">
            <Label className="font-semibold">Page size</Label>
            <Select value={pageSize} onValueChange={(v) => setPageSize(v as typeof pageSize)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="a4">A4</SelectItem>
                <SelectItem value="letter">Letter</SelectItem>
                <SelectItem value="fit">Fit to image</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={run} disabled={busy} size="lg" className="flex-1 font-bold">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
              Create PDF
            </Button>
            {result && <ResultButton blob={result} name="images.pdf" />}
          </div>
        </>
      )}
    </SectionCard>
  )
}

/* ---------------- Shared bits ---------------- */
function FileRow({
  file,
  onRemove,
  extra,
}: {
  file: File
  onRemove: () => void
  extra?: string
}) {
  return (
    <Card className="flex flex-row items-center gap-3 p-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
        <FileText className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{file.name}</p>
        <p className="text-sm text-muted-foreground">
          {formatBytes(file.size)}
          {extra ? ` · ${extra}` : ""}
        </p>
      </div>
      <Button size="icon" variant="ghost" onClick={onRemove} aria-label="Remove" className="text-muted-foreground">
        <Trash2 className="size-4" />
      </Button>
    </Card>
  )
}

function ResultButton({
  blob,
  name,
  originalSize,
}: {
  blob: Blob
  name: string
  originalSize?: number
}) {
  const change = originalSize ? percentChange(originalSize, blob.size) : null
  return (
    <Button
      onClick={() => downloadBlob(blob, name)}
      variant="secondary"
      size="lg"
      className="flex-1 font-bold"
    >
      <Download className="size-4" />
      Download {formatBytes(blob.size)}
      {change !== null && change > 0 ? ` (−${change}%)` : ""}
    </Button>
  )
}
