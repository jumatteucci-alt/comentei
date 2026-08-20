"use client";
export const dynamic = "force-dynamic";
import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { db, storage } from "@/lib/firebase";
import { doc, getDoc, addDoc, collection } from "firebase/firestore";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { Site } from "@/types";
import Link from "next/link";

const FORMATS: Record<string, { label: string; w: number; h: number }> = {
  square:    { label: "Feed 1:1",         w: 1080, h: 1080 },
  portrait:  { label: "Stories 9:16",    w: 1080, h: 1920 },
  landscape: { label: "Horizontal 16:9", w: 1920, h: 1080 },
};

const COLORS = ["#000000","#ffffff","#ef4444","#f97316","#eab308","#22c55e","#3b82f6","#8b5cf6","#ec4899","#6b7280","#1e293b","#f8fafc"];

// Google Fonts to load + display names
const FONTS = [
  { name: "Arial",           google: false },
  { name: "Georgia",         google: false },
  { name: "Impact",          google: false },
  { name: "Montserrat",      google: true },
  { name: "Playfair Display",google: true },
  { name: "Roboto",          google: true },
  { name: "Oswald",          google: true },
  { name: "Lato",            google: true },
  { name: "Raleway",         google: true },
  { name: "Pacifico",        google: true },
  { name: "Dancing Script",  google: true },
  { name: "Bebas Neue",      google: true },
];

function loadGoogleFonts() {
  const googleFonts = FONTS.filter(f => f.google).map(f => f.name.replace(/ /g, "+")).join("|");
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${googleFonts.split("|").map(f => f + ":wght@400;700").join("&family=")}&display=swap`;
  document.head.appendChild(link);
}

function EditorInner() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const format = searchParams.get("format") || "square";
  const fmt = FORMATS[format] || FORMATS.square;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const clipboardRef = useRef<any>(null);
  const historyRef = useRef<{ undo: string[]; redo: string[] }>({ undo: [], redo: [] });
  const savingHistory = useRef(false);

  const [site, setSite] = useState<Site | null>(null);
  const [fabricLoaded, setFabricLoaded] = useState(false);
  const [fillColor, setFillColor] = useState("#3b82f6");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [fontSize, setFontSize] = useState(48);
  const [fontFamily, setFontFamily] = useState("Montserrat");
  const [artName, setArtName] = useState("Minha arte");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [selectedObj, setSelectedObj] = useState<any>(null);
  const [layers, setLayers] = useState<{ id: string; label: string }[]>([]);

  const DISPLAY_W = 540;
  const scale = DISPLAY_W / fmt.w;
  const DISPLAY_H = Math.round(fmt.h * scale);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "sites", user.uid)).then(snap => {
      if (snap.exists()) setSite({ id: snap.id, ...snap.data() } as Site);
    });
  }, [user]);

  // Load fabric + google fonts
  useEffect(() => {
    loadGoogleFonts();
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js";
    script.onload = () => setFabricLoaded(true);
    document.head.appendChild(script);
    return () => { try { document.head.removeChild(script); } catch {} };
  }, []);

  // Refresh layers list from canvas
  const refreshLayers = (fc: any) => {
    const objs = fc.getObjects();
    setLayers([...objs].reverse().map((o: any, i: number) => ({
      id: o.__uid || (o.__uid = Math.random().toString(36).slice(2)),
      label: o.type === "i-text" ? `Texto: "${(o.text || "").slice(0,14)}…"` :
             o.type === "image" ? "Imagem" :
             o.type === "rect" ? "Retângulo" :
             o.type === "circle" ? "Círculo" : o.type,
    })));
  };

  // Init fabric
  useEffect(() => {
    if (!fabricLoaded || !canvasRef.current) return;
    const fc = new (window as any).fabric.Canvas(canvasRef.current, {
      width: DISPLAY_W, height: DISPLAY_H, backgroundColor: "#ffffff", selection: true,
    });
    fabricRef.current = fc;

    const onSel = (e: any) => { setSelectedObj(e.selected?.[0] || null); };
    fc.on("selection:created", onSel);
    fc.on("selection:updated", onSel);
    fc.on("selection:cleared", () => setSelectedObj(null));
    // History helpers
    const saveState = () => {
      if (savingHistory.current) return;
      historyRef.current.undo.push(JSON.stringify(fc.toJSON()));
      historyRef.current.redo = [];
      if (historyRef.current.undo.length > 50) historyRef.current.undo.shift();
    };
    const restoreState = (json: string) => {
      savingHistory.current = true;
      fc.loadFromJSON(JSON.parse(json), () => {
        fc.renderAll();
        refreshLayers(fc);
        savingHistory.current = false;
      });
    };

    fc.on("object:added", () => { saveState(); refreshLayers(fc); });
    fc.on("object:removed", () => { refreshLayers(fc); });
    fc.on("object:modified", () => { saveState(); refreshLayers(fc); });

    // Full keyboard shortcuts
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA";
      const ctrl = e.ctrlKey || e.metaKey;
      const obj = fc.getActiveObject();

      // Delete / Backspace — remove selected (not while editing text)
      if ((e.key === "Delete" || e.key === "Backspace") && !isInput) {
        if (obj && obj.type !== "i-text") { saveState(); fc.remove(obj); setSelectedObj(null); }
        return;
      }
      if (isInput) return; // Don't intercept ctrl shortcuts while in a text field

      if (ctrl) {
        switch (e.key.toLowerCase()) {
          case "c": // Copy
            if (!obj) return;
            e.preventDefault();
            obj.clone((cloned: any) => { clipboardRef.current = cloned; });
            break;
          case "v": // Paste
            e.preventDefault();
            if (!clipboardRef.current) return;
            clipboardRef.current.clone((cloned: any) => {
              cloned.set({ left: cloned.left + 20, top: cloned.top + 20, evented: true });
              if (cloned.type === "activeSelection") {
                cloned.canvas = fc;
                cloned.forEachObject((o: any) => fc.add(o));
                cloned.setCoords();
              } else {
                fc.add(cloned);
              }
              clipboardRef.current.top += 20;
              clipboardRef.current.left += 20;
              fc.setActiveObject(cloned);
              fc.requestRenderAll();
            });
            break;
          case "d": // Duplicate
            e.preventDefault();
            if (!obj) return;
            obj.clone((cloned: any) => {
              cloned.set({ left: obj.left + 20, top: obj.top + 20 });
              fc.add(cloned);
              fc.setActiveObject(cloned);
              fc.requestRenderAll();
            });
            break;
          case "z": // Undo
            e.preventDefault();
            if (e.shiftKey) { // Ctrl+Shift+Z = Redo
              const next = historyRef.current.redo.pop();
              if (!next) return;
              historyRef.current.undo.push(JSON.stringify(fc.toJSON()));
              restoreState(next);
            } else { // Ctrl+Z = Undo
              const prev = historyRef.current.undo.pop();
              if (!prev) return;
              historyRef.current.redo.push(JSON.stringify(fc.toJSON()));
              restoreState(prev);
            }
            break;
          case "y": // Redo
            e.preventDefault();
            const next = historyRef.current.redo.pop();
            if (!next) return;
            historyRef.current.undo.push(JSON.stringify(fc.toJSON()));
            restoreState(next);
            break;
          case "a": // Select all
            e.preventDefault();
            fc.discardActiveObject();
            const sel = new (window as any).fabric.ActiveSelection(fc.getObjects(), { canvas: fc });
            fc.setActiveObject(sel);
            fc.requestRenderAll();
            break;
          case "g": // Group
            e.preventDefault();
            if (obj?.type === "activeSelection") {
              const group = obj.toGroup();
              fc.setActiveObject(group);
              fc.requestRenderAll();
            }
            break;
        }
        // Arrow nudge with Ctrl = 10px
        return;
      }

      // Arrow keys — nudge selected object
      if (obj && ["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        if (e.key === "ArrowLeft")  obj.set("left", obj.left - step);
        if (e.key === "ArrowRight") obj.set("left", obj.left + step);
        if (e.key === "ArrowUp")    obj.set("top",  obj.top  - step);
        if (e.key === "ArrowDown")  obj.set("top",  obj.top  + step);
        obj.setCoords();
        fc.requestRenderAll();
        return;
      }

      // Escape — deselect
      if (e.key === "Escape") { fc.discardActiveObject(); fc.requestRenderAll(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { fc.dispose(); fabricRef.current = null; window.removeEventListener("keydown", onKeyDown); };
  }, [fabricLoaded, DISPLAY_W, DISPLAY_H]);

  useEffect(() => {
    if (!fabricRef.current) return;
    fabricRef.current.setBackgroundColor(bgColor, () => fabricRef.current?.renderAll());
  }, [bgColor]);

  const addText = () => {
    if (!fabricRef.current) return;
    const fabric = (window as any).fabric;
    const t = new fabric.IText("Texto aqui", {
      left: DISPLAY_W / 2, top: DISPLAY_H / 2,
      originX: "center", originY: "center",
      fontSize: fontSize * scale, fontFamily, fill: "#000000",
    });
    fabricRef.current.add(t);
    fabricRef.current.setActiveObject(t);
    t.enterEditing();
  };

  const addRect = () => {
    if (!fabricRef.current) return;
    const r = new (window as any).fabric.Rect({
      left: DISPLAY_W/2-75, top: DISPLAY_H/2-50, width: 150, height: 100,
      fill: fillColor, rx: 4, ry: 4,
    });
    fabricRef.current.add(r);
    fabricRef.current.setActiveObject(r);
  };

  const addCircle = () => {
    if (!fabricRef.current) return;
    const c = new (window as any).fabric.Circle({
      left: DISPLAY_W/2-60, top: DISPLAY_H/2-60, radius: 60, fill: fillColor,
    });
    fabricRef.current.add(c);
    fabricRef.current.setActiveObject(c);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !fabricRef.current) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      (window as any).fabric.Image.fromURL(ev.target?.result as string, (img: any) => {
        const maxW = DISPLAY_W * 0.8;
        if (img.width > maxW) img.scaleToWidth(maxW);
        img.set({ left: DISPLAY_W/2, top: DISPLAY_H/2, originX: "center", originY: "center" });
        fabricRef.current.add(img);
        fabricRef.current.setActiveObject(img);
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

  const updateSelectedFill = (color: string) => {
    if (!fabricRef.current || !selectedObj) return;
    selectedObj.set("fill", color);
    fabricRef.current.renderAll();
  };

  const updateSelectedFont = (family: string) => {
    if (!fabricRef.current || !selectedObj || selectedObj.type !== "i-text") return;
    selectedObj.set("fontFamily", family);
    fabricRef.current.renderAll();
  };

  const updateSelectedFontSize = (size: number) => {
    if (!fabricRef.current || !selectedObj || selectedObj.type !== "i-text") return;
    selectedObj.set("fontSize", size * scale);
    fabricRef.current.renderAll();
  };

  // Layer ordering
  const bringForward = () => {
    if (!fabricRef.current || !selectedObj) return;
    fabricRef.current.bringForward(selectedObj);
    refreshLayers(fabricRef.current);
  };
  const sendBackward = () => {
    if (!fabricRef.current || !selectedObj) return;
    fabricRef.current.sendBackwards(selectedObj);
    refreshLayers(fabricRef.current);
  };
  const bringToFront = () => {
    if (!fabricRef.current || !selectedObj) return;
    fabricRef.current.bringToFront(selectedObj);
    refreshLayers(fabricRef.current);
  };
  const sendToBack = () => {
    if (!fabricRef.current || !selectedObj) return;
    fabricRef.current.sendToBack(selectedObj);
    refreshLayers(fabricRef.current);
  };

  const selectLayerObj = (uid: string) => {
    if (!fabricRef.current) return;
    const obj = fabricRef.current.getObjects().find((o: any) => o.__uid === uid);
    if (obj) { fabricRef.current.setActiveObject(obj); fabricRef.current.renderAll(); setSelectedObj(obj); }
  };

  const exportDataUrl = () => {
    const fc = fabricRef.current;
    const zoom = fmt.w / DISPLAY_W;
    fc.setZoom(zoom); fc.setWidth(fmt.w); fc.setHeight(fmt.h);
    const dataUrl = fc.toDataURL({ format: "png", multiplier: 1 });
    fc.setZoom(1); fc.setWidth(DISPLAY_W); fc.setHeight(DISPLAY_H);
    fc.renderAll();
    return dataUrl;
  };

  const handleDownload = () => {
    if (!fabricRef.current) return;
    const a = document.createElement("a");
    a.href = exportDataUrl(); a.download = artName + ".png"; a.click();
  };

  const handleSave = async () => {
    if (!fabricRef.current || !site) return;
    setSaving(true);
    try {
      const dataUrl = exportDataUrl();
      const path = `canvas/${site.widgetId}/${Date.now()}.png`;
      const storageRef = ref(storage, path);
      await uploadString(storageRef, dataUrl, "data_url");
      const url = await getDownloadURL(storageRef);
      await addDoc(collection(db, "canvas_arts"), {
        widgetId: site.widgetId, name: artName, format: fmt.label,
        url, storagePath: path, createdAt: Date.now(),
      });
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };

  const isText = selectedObj?.type === "i-text";

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
          <button onClick={handleDownload} className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition">↓ Download</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-60">
            {saving ? "Salvando..." : saved ? "✓ Salvo!" : "Salvar na galeria"}
          </button>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* Left toolbar */}
        <div className="w-56 bg-white border-r border-gray-200 flex flex-col gap-4 p-3 overflow-y-auto flex-shrink-0 text-xs">

          {/* Add elements */}
          <div>
            <p className="font-medium text-gray-500 mb-2">Adicionar</p>
            <div className="flex flex-col gap-1.5">
              {[
                { label: "T  Texto", fn: addText },
                { label: "▭  Retângulo", fn: addRect },
                { label: "○  Círculo", fn: addCircle },
                { label: "🖼  Imagem", fn: () => fileRef.current?.click() },
              ].map(({ label, fn }) => (
                <button key={label} onClick={fn}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 text-gray-700 transition text-left">
                  {label}
                </button>
              ))}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </div>
          </div>

          {/* Background */}
          <div>
            <p className="font-medium text-gray-500 mb-2">Fundo</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {COLORS.map(c => (
                <button key={c} onClick={() => setBgColor(c)}
                  style={{ background: c, boxSizing:"border-box", border: bgColor === c ? "2px solid #4f46e5" : "1px solid #e4e4e0" }}
                  className="w-7 h-7 rounded-lg transition" />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} className="w-7 h-7 rounded cursor-pointer border border-gray-200 p-0" />
              <input type="text" value={bgColor} onChange={e => setBgColor(e.target.value)} className="flex-1 px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400" />
            </div>
          </div>

          {/* Selected element properties */}
          {selectedObj && (
            <div className="border-t border-gray-100 pt-3 flex flex-col gap-3">
              <p className="font-medium text-gray-500">Elemento selecionado</p>

              {/* Color */}
              <div>
                <p className="text-gray-400 mb-1.5">Cor</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {COLORS.map(c => (
                    <button key={c} onClick={() => { setFillColor(c); updateSelectedFill(c); }}
                      style={{ background: c, boxSizing:"border-box", border: fillColor === c ? "2px solid #4f46e5" : "1px solid #e4e4e0" }}
                      className="w-7 h-7 rounded-lg transition" />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input type="color" value={fillColor} onChange={e => { setFillColor(e.target.value); updateSelectedFill(e.target.value); }} className="w-7 h-7 rounded cursor-pointer border border-gray-200 p-0" />
                  <input type="text" value={fillColor} onChange={e => setFillColor(e.target.value)} className="flex-1 px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400" />
                </div>
              </div>

              {/* Font options — only for text */}
              {isText && (
                <div className="flex flex-col gap-2">
                  <div>
                    <p className="text-gray-400 mb-1">Fonte</p>
                    <select value={fontFamily} onChange={e => { setFontFamily(e.target.value); updateSelectedFont(e.target.value); }}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-indigo-400">
                      {FONTS.map(f => <option key={f.name} value={f.name} style={{ fontFamily: f.name }}>{f.name}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-gray-400 whitespace-nowrap">Tamanho</p>
                    <input type="number" value={fontSize} min={6} max={300}
                      onChange={e => { setFontSize(+e.target.value); updateSelectedFontSize(+e.target.value); }}
                      className="flex-1 px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400" />
                  </div>
                </div>
              )}

              {/* Layer controls */}
              <div>
                <p className="text-gray-400 mb-1.5">Camada</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { label: "▲▲ Frente", fn: bringToFront },
                    { label: "▲  Acima",  fn: bringForward },
                    { label: "▼  Abaixo", fn: sendBackward },
                    { label: "▼▼ Fundo",  fn: sendToBack },
                  ].map(({ label, fn }) => (
                    <button key={label} onClick={fn}
                      className="px-2 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition text-center">
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Delete */}
              <button onClick={deleteSelected}
                className="w-full py-2 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition">
                🗑 Remover elemento
              </button>
            </div>
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

        {/* Right panel — layers with drag-and-drop */}
        <div className="w-48 bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
          <div className="px-3 py-3 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-500">Camadas</p>
            <p className="text-xs text-gray-400 mt-0.5">Arraste para reordenar</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {layers.length === 0 ? (
              <p className="text-xs text-gray-400 p-3">Nenhum elemento ainda.</p>
            ) : (
              <div className="flex flex-col divide-y divide-gray-100">
                {layers.map((layer, index) => {
                  const isActive = selectedObj?.__uid === layer.id;
                  return (
                    <div
                      key={layer.id}
                      draggable
                      onDragStart={e => { e.dataTransfer.setData("layerIndex", String(index)); e.dataTransfer.effectAllowed = "move"; }}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => {
                        e.preventDefault();
                        const fromIndex = parseInt(e.dataTransfer.getData("layerIndex"));
                        if (fromIndex === index || !fabricRef.current) return;
                        const fc = fabricRef.current;
                        const objs = fc.getObjects();
                        // layers is reversed so index 0 = top = last in objs array
                        const totalObjs = objs.length;
                        const fromObjIndex = totalObjs - 1 - fromIndex;
                        const toObjIndex   = totalObjs - 1 - index;
                        const moving = objs[fromObjIndex];
                        // Remove and reinsert at target position
                        fc.remove(moving);
                        const newObjs = fc.getObjects();
                        const insertAt = toObjIndex > fromObjIndex ? toObjIndex - 1 : toObjIndex;
                        newObjs.splice(insertAt, 0, moving);
                        fc._objects = newObjs;
                        fc.requestRenderAll();
                        refreshLayers(fc);
                      }}
                      onClick={() => selectLayerObj(layer.id)}
                      className={`flex items-center gap-2 px-3 py-2.5 text-xs cursor-grab active:cursor-grabbing transition select-none ${isActive ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-600 hover:bg-gray-50"}`}>
                      <svg width="10" height="14" viewBox="0 0 10 14" fill="none" className="flex-shrink-0 text-gray-300">
                        <circle cx="3" cy="3" r="1.2" fill="currentColor"/><circle cx="7" cy="3" r="1.2" fill="currentColor"/>
                        <circle cx="3" cy="7" r="1.2" fill="currentColor"/><circle cx="7" cy="7" r="1.2" fill="currentColor"/>
                        <circle cx="3" cy="11" r="1.2" fill="currentColor"/><circle cx="7" cy="11" r="1.2" fill="currentColor"/>
                      </svg>
                      <span className="truncate">{layer.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="p-3 border-t border-gray-100 flex flex-col gap-1">
            <p className="text-xs text-gray-400 text-center mb-1">Topo → Fundo</p>
            <div className="text-xs text-gray-400 space-y-0.5">
              <p>Ctrl+C  Copiar</p>
              <p>Ctrl+V  Colar</p>
              <p>Ctrl+D  Duplicar</p>
              <p>Ctrl+Z  Desfazer</p>
              <p>Ctrl+Y  Refazer</p>
              <p>Ctrl+A  Selec. tudo</p>
              <p>Del     Remover</p>
              <p>↑↓←→   Mover 1px</p>
              <p>Shift+↑  Mover 10px</p>
            </div>
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
