"use client"

import type React from "react"
import { useCallback, useRef, useState } from "react"
import { UploadCloud } from "lucide-react"
import { cn } from "@/lib/utils"

type DropzoneProps = {
  accept: string
  multiple?: boolean
  onFiles: (files: File[]) => void
  title: string
  hint: string
  className?: string
}

export function Dropzone({ accept, multiple = false, onFiles, title, hint, className }: DropzoneProps) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return
      onFiles(Array.from(list))
    },
    [onFiles],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      handleFiles(e.dataTransfer.files)
    },
    [handleFiles],
  )

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "group relative flex w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed px-6 py-12 text-center transition-colors",
        dragging
          ? "border-primary bg-primary/10"
          : "border-border bg-muted/40 hover:border-primary/60 hover:bg-primary/5",
        className,
      )}
    >
      <span
        className={cn(
          "flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary transition-transform group-hover:scale-110",
          dragging && "scale-110",
        )}
      >
        <UploadCloud className="size-7" />
      </span>
      <span className="font-display text-lg font-bold text-foreground">{title}</span>
      <span className="max-w-sm text-pretty text-sm text-muted-foreground">{hint}</span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ""
        }}
      />
    </button>
  )
}
