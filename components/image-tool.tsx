"use client"

import { useCallback, useEffect, useState } from "react"
import { Download, ImageIcon, Loader2, Sparkles, Trash2, X } from "lucide-react"
import { Dropzone } from "@/components/dropzone"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import {
  compressToTarget,
  FORMAT_EXT,
  FORMAT_LABELS,
  getImageDimensions,
  type ImageFormat,
  processImage,
} from "@/lib/image-tools"
import { downloadBlob, formatBytes, percentChange, stripExtension } from "@/lib/format"
import { cn } from "@/lib/utils"

type Item = {
  id: string
  file: File
  previewUrl: string
  width: number
  height: number
  result?: { blob: Blob; url: string; width: number; height: number; type: ImageFormat }
}

type FormatChoice = "original" | ImageFormat

export function ImageTool() {
  const [items, setItems] = useState<Item[]>([])
  const [busy, setBusy] = useState(false)

  // Settings
  const [resize, setResize] = useState(false)
  const [scalePct, setScalePct] = useState(100)
  const [format, setFormat] = useState<FormatChoice>("original")
  const [quality, setQuality] = useState(80)
  const [useTarget, setUseTarget] = useState(false)
  const [targetKb, setTargetKb] = useState(200)

  useEffect(() => {
    return () => {
      items.forEach((it) => {
        URL.revokeObjectURL(it.previewUrl)
        if (it.result) URL.revokeObjectURL(it.result.url)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addFiles = useCallback(async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"))
    const withDims = await Promise.all(
      images.map(async (file) => {
        let dims = { width: 0, height: 0 }
        try {
          dims = await getImageDimensions(file)
        } catch {
          /* ignore unreadable */
        }
        return {
          id: crypto.randomUUID(),
          file,
          previewUrl: URL.createObjectURL(file),
          width: dims.width,
          height: dims.height,
        } as Item
      }),
    )
    setItems((prev) => [...prev, ...withDims])
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const found = prev.find((p) => p.id === id)
      if (found) {
        URL.revokeObjectURL(found.previewUrl)
        if (found.result) URL.revokeObjectURL(found.result.url)
      }
      return prev.filter((p) => p.id !== id)
    })
  }, [])

  const clearAll = useCallback(() => {
    setItems((prev) => {
      prev.forEach((p) => {
        URL.revokeObjectURL(p.previewUrl)
        if (p.result) URL.revokeObjectURL(p.result.url)
      })
      return []
    })
  }, [])

  const resolveFormat = (file: File): ImageFormat => {
    if (format !== "original") return format
    if (file.type === "image/png" || file.type === "image/webp" || file.type === "image/jpeg") {
      return file.type as ImageFormat
    }
    return "image/jpeg"
  }

  const processAll = useCallback(async () => {
    setBusy(true)
    try {
      const updated: Item[] = []
      for (const it of items) {
        if (it.result) URL.revokeObjectURL(it.result.url)
        try {
          const outFormat = resolveFormat(it.file)
          let res
          if (useTarget && outFormat !== "image/png") {
            res = await compressToTarget(it.file, targetKb * 1024, outFormat)
          } else {
            const scale = resize ? scalePct / 100 : 1
            res = await processImage(it.file, {
              width: it.width ? Math.round(it.width * scale) : undefined,
              height: it.height ? Math.round(it.height * scale) : undefined,
              format: outFormat,
              quality: quality / 100,
            })
          }
          updated.push({
            ...it,
            result: {
              blob: res.blob,
              url: URL.createObjectURL(res.blob),
              width: res.width,
              height: res.height,
              type: res.type,
            },
          })
        } catch {
          updated.push({ ...it, result: undefined })
        }
      }
      setItems(updated)
    } finally {
      setBusy(false)
    }
  }, [items, resize, scalePct, format, quality, useTarget, targetKb])

  const downloadOne = (it: Item) => {
    if (!it.result) return
    const ext = FORMAT_EXT[it.result.type]
    downloadBlob(it.result.blob, `${stripExtension(it.file.name)}-squished.${ext}`)
  }

  const downloadAll = () => items.forEach((it) => it.result && downloadOne(it))

  const hasResults = items.some((it) => it.result)
  const pngSelected = format === "image/png"

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      {/* Left: files */}
      <div className="flex flex-col gap-4">
        {items.length === 0 ? (
          <Dropzone
            accept="image/*"
            multiple
            onFiles={addFiles}
            title="Drop images here"
            hint="JPG, PNG, or WebP. Add as many as you like — they never leave your device."
          />
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="font-display text-sm font-bold text-muted-foreground">
                {items.length} image{items.length > 1 ? "s" : ""}
              </p>
              <Button variant="ghost" size="sm" onClick={clearAll} className="text-muted-foreground">
                <Trash2 className="size-4" /> Clear
              </Button>
            </div>
            <div className="grid gap-3">
              {items.map((it) => (
                <Card key={it.id} className="flex flex-row items-center gap-4 p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={it.previewUrl || "/placeholder.svg"}
                    alt={it.file.name}
                    className="size-16 shrink-0 rounded-xl border border-border object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">{it.file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {it.width > 0 ? `${it.width}×${it.height} · ` : ""}
                      {formatBytes(it.file.size)}
                      {it.result && (
                        <>
                          {" → "}
                          <span className="font-semibold text-secondary-foreground">
                            {it.result.width}×{it.result.height} · {formatBytes(it.result.blob.size)}
                          </span>
                        </>
                      )}
                    </p>
                    {it.result && (
                      <span
                        className={cn(
                          "mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-bold",
                          percentChange(it.file.size, it.result.blob.size) >= 0
                            ? "bg-secondary/25 text-secondary-foreground"
                            : "bg-accent/40 text-accent-foreground",
                        )}
                      >
                        {percentChange(it.file.size, it.result.blob.size) >= 0
                          ? `${percentChange(it.file.size, it.result.blob.size)}% smaller`
                          : `${Math.abs(percentChange(it.file.size, it.result.blob.size))}% larger`}
                      </span>
                    )}
                  </div>
                  {it.result ? (
                    <Button size="icon" variant="secondary" onClick={() => downloadOne(it)} aria-label="Download">
                      <Download className="size-4" />
                    </Button>
                  ) : (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeItem(it.id)}
                      aria-label="Remove"
                      className="text-muted-foreground"
                    >
                      <X className="size-4" />
                    </Button>
                  )}
                </Card>
              ))}
            </div>
            <Dropzone
              accept="image/*"
              multiple
              onFiles={addFiles}
              title="Add more images"
              hint="Drop or click to add more."
              className="py-6"
            />
          </>
        )}
      </div>

      {/* Right: settings */}
      <Card className="flex h-fit flex-col gap-6 p-5">
        <div className="flex items-center gap-2">
          <ImageIcon className="size-5 text-primary" />
          <h3 className="font-display text-lg font-bold">Settings</h3>
        </div>

        {/* Resize */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="resize-toggle" className="font-semibold">
              Resize
            </Label>
            <Switch id="resize-toggle" checked={resize} onCheckedChange={setResize} disabled={useTarget} />
          </div>
          {resize && !useTarget && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Scale</span>
                <span className="font-bold text-foreground">{scalePct}%</span>
              </div>
              <Slider
                value={[scalePct]}
                min={10}
                max={100}
                step={5}
                onValueChange={(v) => setScalePct(v[0])}
              />
            </div>
          )}
        </div>

        {/* Format */}
        <div className="flex flex-col gap-2">
          <Label className="font-semibold">Output format</Label>
          <Select value={format} onValueChange={(v) => setFormat(v as FormatChoice)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="original">Keep original</SelectItem>
              <SelectItem value="image/jpeg">{FORMAT_LABELS["image/jpeg"]}</SelectItem>
              <SelectItem value="image/png">{FORMAT_LABELS["image/png"]}</SelectItem>
              <SelectItem value="image/webp">{FORMAT_LABELS["image/webp"]}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Quality */}
        {!pngSelected && !useTarget && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <Label className="font-semibold">Quality</Label>
              <span className="font-bold">{quality}%</span>
            </div>
            <Slider value={[quality]} min={10} max={100} step={5} onValueChange={(v) => setQuality(v[0])} />
          </div>
        )}

        {/* Target size */}
        {!pngSelected && (
          <div className="flex flex-col gap-3 rounded-2xl bg-muted/50 p-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="target-toggle" className="font-semibold">
                Compress to size
              </Label>
              <Switch id="target-toggle" checked={useTarget} onCheckedChange={setUseTarget} />
            </div>
            {useTarget && (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={10}
                  value={targetKb}
                  onChange={(e) => setTargetKb(Math.max(10, Number(e.target.value) || 0))}
                  className="bg-background"
                />
                <span className="text-sm font-semibold text-muted-foreground">KB</span>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Button onClick={processAll} disabled={items.length === 0 || busy} size="lg" className="font-bold">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {busy ? "Squishing…" : "Squish images"}
          </Button>
          {hasResults && (
            <Button onClick={downloadAll} variant="secondary" size="lg" className="font-bold">
              <Download className="size-4" /> Download all
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}
