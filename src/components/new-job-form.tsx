"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Link2, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NEW = "__new__";

export function NewJobForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [brands, setBrands] = useState<string[]>([]);
  const [brand, setBrand] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [tab, setTab] = useState("upload");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/brands").then((r) => r.json()).then(setBrands).catch(() => setBrands([]));
  }, []);

  const brandName = brand === NEW ? newBrand.trim() : brand;
  const ready = brandName && (tab === "upload" ? file : url.trim());

  async function submit(demo = false) {
    setBusy(true);
    const form = new FormData();
    form.set("brand", brandName || "Glossier");
    if (demo) form.set("demo", "1");
    else if (tab === "upload" && file) form.set("file", file);
    else form.set("url", url.trim());
    const res = await fetch("/api/jobs", { method: "POST", body: form });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return toast.error(body.error ?? "Something went wrong");
    onCreated(body.id);
  }

  return (
    <Card className="border-border/60 bg-card/60 backdrop-blur">
      <CardContent className="flex flex-col gap-6 p-6">
        <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
          <TabsList className="grid w-full grid-cols-2 sm:w-80">
            <TabsTrigger value="upload"><Upload className="mr-2 size-4" />Upload</TabsTrigger>
            <TabsTrigger value="link"><Link2 className="mr-2 size-4" />Paste link</TabsTrigger>
          </TabsList>
          <TabsContent value="upload" className="mt-4">
            <button
              type="button"
              onClick={() => input.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); setFile(e.dataTransfer.files[0] ?? null); }}
              className={`flex h-44 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-sm transition-colors ${
                drag ? "border-primary bg-primary/5" : "border-border hover:border-foreground/40"
              }`}
            >
              <Upload className="size-6 text-muted-foreground" />
              {file ? <span className="font-medium">{file.name}</span> : <span className="text-muted-foreground">Drop a 3–90s video, or click to choose</span>}
            </button>
            <input ref={input} type="file" accept="video/*" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </TabsContent>
          <TabsContent value="link" className="mt-4">
            <Input placeholder="https://www.tiktok.com/@creator/video/…" value={url} onChange={(e) => setUrl(e.target.value)} />
          </TabsContent>
        </Tabs>

        <div className="grid gap-2 sm:max-w-sm">
          <Label>Brand</Label>
          <Select value={brand || null} onValueChange={(v) => setBrand((v as string | null) ?? "")}>
            <SelectTrigger className="w-full">
              <SelectValue>
                {(v: string | null) =>
                  v == null ? <span className="text-muted-foreground">Who is this content for?</span> : v === NEW ? "New brand" : v}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              <SelectItem value={NEW}>+ New brand</SelectItem>
            </SelectContent>
          </Select>
          {brand === NEW && <Input autoFocus placeholder="Brand name" value={newBrand} onChange={(e) => setNewBrand(e.target.value)} />}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" disabled={!ready || busy} onClick={() => submit()}>
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
            Generate 3 options
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={busy} onClick={() => submit(true)}>
            Load cached demo
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
