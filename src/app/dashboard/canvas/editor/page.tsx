"use client";
export const dynamic = "force-dynamic";
import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { db, storage } from "@/lib/firebase";
import { doc, getDoc, addDoc, collection } from "firebase/firestore";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { Site } from "@/types";
import Link from "next/link";

const FORMATS: Record<string, { label: string; w: number; h: number; ratio: string }> = {
  square:    { label: "Feed 1:1",        w: 1080, h: 1080, ratio: "1:1" },
  portrait:  { label: "Stories 9:16",   w: 1080, h: 1920, ratio: "9:16" },
  landscape: { label: "Horizontal 16:9", w: 1920, h: 1080, ratio: "16:9" },
};

const COLORS = ["#000000","#ffffff","#ef4444","#f97316","#eab308","#22c55e","#3b82f6","#8b5cf6","#ec4899","#6b7280"];
const FONTS = ["Arial","Georgia","Verdana","Times New Roman","Courier New","Impact"];

function EditorInner() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const format = searchParams.get("format") || "square";
  const fmt = FORMATS[format] || FORMATS.square;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [site, setSite] = useState<Site | null>(null);
  const [fabricLoaded, setFabricLoaded] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [fillColor, setFillColor] = useState("#3b82f6");
  const [textColor, setTextColor] = useState("#000000");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [fontSize, setFontSize] = useState(48);
  const [fontFamily, setFontFamily] = useState("Arial");
  const [artName, setArtName] = useState("Minha arte");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [selectedObj, setSelectedObj] = useState<any>(null);

  // Scale factor for display (canvas is smaller than actual)
  const DISPLAY_W = 540;
  const scale = DISPLAY_W / fmt.w;
  const DISPLAY_H = Math.round(fmt.h * scale);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "sites", user.uid)).then(snap => {
      if (snap.exists()) setSite({ id: snap.id, ...snap.data() } as Site);
    });
  }, [user]);

  useEffect(() => {
    // Load fabric.js dynamically
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js";
    script.onload = () => setFabricLoaded(true);
    document.head.appendChild(script);
    return () => { document.head.removeChild(script); };
  }, []);

  useEffect(() => {
    if (!fabricLoaded || !canvasRef.current) return;
    const fc = new (window as any).fabric.Canvas(canvasRef.current, {
      width: DISPLAY_W,
      height: DISPLAY_H,
      backgroundColor: "#ffffff",
      selection: true,
    });
    fabricRef.current = fc;

    fc.on("selection:created", (e: any) => setSelectedObj(e.selected?.[0] || null));
    fc.on("selection:updated", (e: any) => setSelectedObj(e.selected?.[0] || null));
    fc.on("selection:cleared", () => setSelectedObj(null));

    return () => { fc.dispose(); fabricRef.current = null; };
  }, [fabricLoaded, DISPLAY_W, DISPLAY_H]);

  // Update background color
  useEffect(() => {
    if (!fabricRef.current) return;
    fabricRef.current.setBackgroundColor(bgColor, () => fabricRef.current?.renderAll());
  }, [bgColor]);

  const addText = () => {
    if (!fabricRef.current) return;
    const fabric = (window as any).fabric;
    const text = new fabric.IText("Texto aqui", {
      left: DISPLAY_W / 2, top: DISPLAY_H / 2,
      originX: "center", originY: "center",
      fontSize: fontSize * scale,
      fontFamily,
      fill: textColor,
    });
    fabricRef.current.add(text);
    fabricRef.current.setActiveObject(text);
    text.enterEditing();
    setActiveTool(null);
  };

  const addRect = () => {
    if (!fabricRef.current) return;
    const fabric = (window as any).fabric;
    const rect = new fabric.Rect({
      left: DISPLAY_W / 2 - 75, top: DISPLAY_H / 2 - 50,
      width: 150, height: 100,
      fill: fillColor, rx: 4, ry: 4,
    });
    fabricRef.current.add(rect);
    fabricRef.current.setActiveObject(rect);
    setActiveTool(null);
  };

  const addCircle = () => {
    if (!fabricRef.current) return;
    const fabric = (window as any).fabric;
    const circle = new fabric.Circle({
      left: DISPLAY_W / 2 - 60, top: DISPLAY_H / 2 - 60,
      radius: 60, fill: fillColor,
    });
    fabricRef.current.add(circle);
    fabricRef.current.setActiveObject(circle);
    setActiveTool(null);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !fabricRef.current) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const fabric = (window as any).fabric;
      fabric.Image.fromURL(ev.target?.result as string, (img: any) => {
        const maxW = DISPLAY_W * 0.7;
        if (img.width! > maxW) img.scaleToWidth(maxW);
        img.set({ left: DISPLAY_W / 2, top: DISPLAY_H / 2, originX: "center", originY: "center" });
        fabricRef.current!.add(img);
        fabricRef.current!.setActiveObject(img);
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const deleteSelected = () => {
    if (!fabricRef.current) return;
    const obj = fabricRef.current.getActiveObject();
    if (obj) { fabricRef.current.remove(obj); setSelectedObj(null); }
  };

  const updateSelectedColor = (color: string) => {
    if (!fabricRef.current || !selectedObj) return;
    (selectedObj as any).set("fill", color);
    fabricRef.current.renderAll();
  };

  const handleSave = async () => {
    if (!fabricRef.current || !site) return;
    setSaving(true);
    try {
      // Scale up to full resolution for export
      const fc = fabricRef.current;
      const zoom = fmt.w / DISPLAY_W;
      fc.setZoom(zoom);
      fc.setWidth(fmt.w);
      fc.setHeight(fmt.h);
      const dataUrl = fc.toDataURL({ format: "png", multiplier: 1 });
      // Scale back down
      fc.setZoom(1);
      fc.setWidth(DISPLAY_W);
      fc.setHeight(DISPLAY_H);
      fc.renderAll();

      const path = `canvas/${site.widgetId}/${Date.now()}.png`;
      const storageRef = ref(storage, path);
      await uploadString(storageRef, dataUrl, "data_url");
      const url = await getDownloadURL(storageRef);

      await addDoc(collection(db, "canvas_arts"), {
        widgetId: site.widgetId,
        name: artName,
        format: fmt.label,
        url,
        storagePath: path,
        createdAt: Date.now(),
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };

  const handleDownload = () => {
    if (!fabricRef.current) return;
    const fc = fabricRef.current;
    const zoom = fmt.w / DISPLAY_W;
    fc.setZoom(zoom); fc.setWidth(fmt.w); fc.setHeight(fmt.h);
    const dataUrl = fc.toDataURL({ format: "png", multiplier: 1 });
    fc.setZoom(1); fc.setWidth(DISPLAY_W); fc.setHeight(DISPLAY_H);
    fc.renderAll();
    const a = document.createElement("a");
    a.href = dataUrl; a.download = artName + ".png"; a.click();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top bar */}
      <nav className="bg-white border-b border-gray-200 px-4 h-14 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/canvas" className="text-sm text-gray-500 hover:text-gray-700">← Canvas</Link>
          <span className="text-gray-300">|</span>
          <input value={artName} onChange={e => setArtName(e.target.value)}
            className="text-sm font-medium text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-indigo-400 focus:outline-none px-1 py-0.5 w-40" />
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">{fmt.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleDownload} className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition">
            ↓ Download
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-60">
            {saving ? "Salvando..." : saved ? "✓ Salvo!" : "Salvar na galeria"}
          </button>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* Left toolbar */}
        <div className="w-56 bg-white border-r border-gray-200 flex flex-col gap-4 p-3 overflow-y-auto flex-shrink-0">
          {/* Elements */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Adicionar</p>
            <div className="flex flex-col gap-1.5">
              <button onClick={addText} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 text-sm text-gray-700 transition">
                <span className="text-base">T</span> Texto
              </button>
              <button onClick={addRect} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 text-sm text-gray-700 transition">
                <span>▭</span> Retângulo
              </button>
              <button onClick={addCircle} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 text-sm text-gray-700 transition">
                <span>○</span> Círculo
              </button>
              <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 text-sm text-gray-700 transition">
                <span>🖼</span> Imagem
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </div>
          </div>

          {/* Background */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Fundo</p>
            <div className="flex flex-wrap gap-1.5">
              {COLORS.map(c => (
                <button key={c} onClick={() => setBgColor(c)} title={c}
                  style={{ background: c, border: bgColor === c ? "2px solid #4f46e5" : "1px solid #e4e4e0" }}
                  className="w-7 h-7 rounded-lg transition" />
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)}
                className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0.5" />
              <input type="text" value={bgColor} onChange={e => setBgColor(e.target.value)}
                className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-indigo-400" />
            </div>
          </div>

          {/* Fill color for shapes */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Cor do elemento</p>
            <div className="flex flex-wrap gap-1.5">
              {COLORS.map(c => (
                <button key={c} onClick={() => { setFillColor(c); setTextColor(c); updateSelectedColor(c); }} title={c}
                  style={{ background: c, border: fillColor === c ? "2px solid #4f46e5" : "1px solid #e4e4e0" }}
                  className="w-7 h-7 rounded-lg transition" />
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input type="color" value={fillColor} onChange={e => { setFillColor(e.target.value); setTextColor(e.target.value); updateSelectedColor(e.target.value); }}
                className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0.5" />
              <input type="text" value={fillColor} onChange={e => { setFillColor(e.target.value); setTextColor(e.target.value); }}
                className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-indigo-400" />
            </div>
          </div>

          {/* Text options */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Texto</p>
            <select value={fontFamily} onChange={e => setFontFamily(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs mb-2 bg-white focus:outline-none focus:border-indigo-400">
              {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Tamanho</label>
              <input type="number" value={fontSize} onChange={e => setFontSize(+e.target.value)} min={8} max={200}
                className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-indigo-400" />
            </div>
          </div>

          {/* Delete selected */}
          {selectedObj && (
            <button onClick={deleteSelected}
              className="w-full py-2 border border-red-200 text-red-500 rounded-lg text-sm hover:bg-red-50 transition">
              🗑 Remover elemento
            </button>
          )}
        </div>

        {/* Canvas area */}
        <div className="flex-1 overflow-auto flex items-start justify-center p-8 bg-gray-100">
          <div className="shadow-2xl">
            {!fabricLoaded ? (
              <div style={{ width: DISPLAY_W, height: DISPLAY_H }} className="bg-white flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <canvas ref={canvasRef} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EditorPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-12"><div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>}>
      <EditorInner />
    </Suspense>
  );
}
