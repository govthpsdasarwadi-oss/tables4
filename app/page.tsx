"use client"

import { FileText, ImageIcon, ShieldCheck, Zap } from "lucide-react"
import { ImageTool } from "@/components/image-tool"
import { PdfTool } from "@/components/pdf-tool"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function Page() {
  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border bg-card/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Zap className="size-5" />
            </span>
            <span className="font-display text-xl font-extrabold tracking-tight">Squish</span>
          </div>
          <span className="hidden items-center gap-1.5 rounded-full bg-secondary/25 px-3 py-1 text-sm font-bold text-secondary-foreground sm:flex">
            <ShieldCheck className="size-4" /> 100% private
          </span>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-4 pb-4 pt-12 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/40 px-3 py-1 text-sm font-bold text-accent-foreground">
          <Zap className="size-4" /> No uploads · runs in your browser
        </span>
        <h1 className="mt-5 text-balance font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
          Resize & shrink your <span className="text-primary">images</span> and{" "}
          <span className="text-secondary-foreground">PDFs</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-lg text-muted-foreground">
          Compress, resize, convert, merge, and split — all in your browser. Your files never leave your
          device.
        </p>
      </section>

      {/* Tools */}
      <section className="mx-auto max-w-5xl px-4 pb-20 pt-6">
        <Tabs defaultValue="image" className="w-full">
          <TabsList className="mx-auto mb-8 grid h-auto w-full max-w-md grid-cols-2 gap-1 p-1">
            <TabsTrigger value="image" className="gap-1.5 py-2.5 font-display font-bold">
              <ImageIcon className="size-4" /> Images
            </TabsTrigger>
            <TabsTrigger value="pdf" className="gap-1.5 py-2.5 font-display font-bold">
              <FileText className="size-4" /> PDF
            </TabsTrigger>
          </TabsList>
          <TabsContent value="image">
            <ImageTool />
          </TabsContent>
          <TabsContent value="pdf">
            <PdfTool />
          </TabsContent>
        </Tabs>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">Everything happens on your device.</p>
          <p>No files are uploaded to any server — your data stays private.</p>
        </div>
      </footer>
    </main>
  )
}
