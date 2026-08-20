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

const SWATCHES = ["#000000","#ffffff","#1e293b","#f8fafc","#ef4444","#f97316","#eab308","#22c55e","#3b82f6","#8b5cf6","#ec4899","#6b7280","#0ea5e9","#14b8a6","#84cc16","#f59e0b"];

const FONTS = [
  { name: "Arial", google: false }, { name: "Georgia", google: false }, { name: "Impact", google: false },
  { name: "Montserrat", google: true }, { name: "Playfair Display", google: true }, { name: "Roboto", google: true },
  { name: "Oswald", google: true }, { name: "Lato", google: true }, { name: "Raleway", google: true },
  { name: "Pacifico", google: true }, { name: "Dancing Script", google: true }, { name: "Bebas Neue", google: true },
];

function loadGoogleFonts() {
  if (document.getElementById("cmc-gfonts")) return;
  const names = FONTS.filter(f => f.google).map(f => f.name.replace(/ /g, "+") + ":wght@400;700").join("&family=");
  const l = document.createElement("link");
  l.id = "cmc-gfonts"; l.rel = "stylesheet";
  l.href = `https://fonts.googleapis.com/css2?family=${names}&display=swap`;
  document.head.appendChild(l);
}

// ─── Colour picker component ──────────────────────────────
function ColorPicker({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string }) {
  return (
    <div>
      {label && <p className="text-xs text-gray-400 mb-1">{label}</p>}
      <div className="flex flex-wrap gap-1 mb-1.5">
        {SWATCHES.map(c => (
          <button key={c} onClick={() => onChange(c)}
            style={{ background: c, outline: value === c ? "2px solid #4f46e5" : "1px solid #e4e4e0", outlineOffset: "1px" }}
            className="w-5 h-5 rounded transition flex-shrink-0" />
        ))}
      </div>
      <div className="flex gap-1.5">
        <input type="color" value={value.startsWith("#") || value.startsWith("rgb") ? value : "#000000"}
          onChange={e => onChange(e.target.value)} className="w-7 h-7 rounded border border-gray-200 cursor-pointer p-0 flex-shrink-0" />
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
          className="flex-1 px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-indigo-400 min-w-0" />
      </div>
    </div>
  );
}

// ─── Gradient editor ─────────────────────────────────────
function GradientEditor({ value, onChange }: { value: { c1: string; c2: string; angle: number } | null; onChange: (g: { c1: string; c2: string; angle: number } | null) => void }) {
  const [on, setOn] = useState(!!value);
  const g = value || { c1: "#4f46e5", c2: "#ec4899", angle: 90 };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">Usar gradiente</span>
        <button onClick={() => { const next = !on; setOn(next); onChange(next ? g : null); }}
          className={`w-9 h-5 rounded-full transition ${on ? "bg-indigo-500" : "bg-gray-200"}`}>
          <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${on ? "translate-x-4" : ""}`} />
        </button>
      </div>
      {on && (
        <div className="flex flex-col gap-2">
          <div>
            <p className="text-xs text-gray-400 mb-1">Cor 1</p>
            <div className="flex gap-1">
              <input type="color" value={g.c1} onChange={e => onChange({ ...g, c1: e.target.value })} className="w-7 h-7 rounded border border-gray-200 cursor-pointer p-0 flex-shrink-0" />
              <input type="text" value={g.c1} onChange={e => onChange({ ...g, c1: e.target.value })} className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:border-indigo-400 min-w-0" />
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Cor 2</p>
            <div className="flex gap-1">
              <input type="color" value={g.c2} onChange={e => onChange({ ...g, c2: e.target.value })} className="w-7 h-7 rounded border border-gray-200 cursor-pointer p-0 flex-shrink-0" />
              <input type="text" value={g.c2} onChange={e => onChange({ ...g, c2: e.target.value })} className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:border-indigo-400 min-w-0" />
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Ângulo: {g.angle}°</p>
            <input type="range" min={0} max={360} value={g.angle} onChange={e => onChange({ ...g, angle: +e.target.value })} className="w-full accent-indigo-600" />
          </div>
          {/* Preview */}
          <div style={{ background: `linear-gradient(${g.angle}deg, ${g.c1}, ${g.c2})`, height: 20, borderRadius: 6 }} />
        </div>
      )}
    </div>
  );
}

// ─── Slider row ───────────────────────────────────────────
function SliderRow({ label, value, min, max, step = 1, unit = "", onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex justify-between mb-1"><p className="text-xs text-gray-400">{label}</p><span className="text-xs text-gray-500">{value}{unit}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)} className="w-full accent-indigo-600" />
    </div>
  );
}

// ─── Number input row ─────────────────────────────────────
function NumRow({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <p className="text-xs text-gray-400 w-20 flex-shrink-0">{label}</p>
      <input type="number" value={value} min={min} max={max} onChange={e => onChange(+e.target.value)}
        className="flex-1 px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-indigo-400" />
    </div>
  );
}

// ─── Section header ───────────────────────────────────────
function Sec({ title }: { title: string }) {
  return <p className="text-xs font-semibold text-gray-600 pt-2 border-t border-gray-100">{title}</p>;
}

// ─── Apply gradient to fabric object ─────────────────────
function applyGradient(fc: any, obj: any, g: { c1: string; c2: string; angle: number }) {
  const fabric = (window as any).fabric;
  const rad = (g.angle * Math.PI) / 180;
  const w = obj.width! * (obj.scaleX || 1);
  const h = obj.height! * (obj.scaleY || 1);
  const x1 = (Math.cos(rad + Math.PI) + 1) / 2 * w;
  const y1 = (Math.sin(rad + Math.PI) + 1) / 2 * h;
  const x2 = (Math.cos(rad) + 1) / 2 * w;
  const y2 = (Math.sin(rad) + 1) / 2 * h;
  const gradient = new fabric.Gradient({
    type: "linear",
    coords: { x1, y1, x2, y2 },
    colorStops: [{ offset: 0, color: g.c1 }, { offset: 1, color: g.c2 }],
  });
  obj.set("fill", gradient);
  fc.requestRenderAll();
}

function rgbToHex(rgb: string): string {
  if (rgb.startsWith("#")) return rgb;
  const m = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return "#000000";
  return "#" + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, "0")).join("");
}

function getObjColor(obj: any): string {
  if (!obj) return "#000000";
  const fill = obj.fill;
  if (!fill) return "#000000";
  if (typeof fill === "string") return rgbToHex(fill);
  if (fill.colorStops?.length) return rgbToHex(fill.colorStops[0].color);
  return "#000000";
}

function EditorInner() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const format = searchParams.get("format") || "square";
  const fmt = FORMATS[format] || FORMATS.square;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fc = useRef<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const clipboardRef = useRef<any>(null);
  const historyRef = useRef<{ undo: string[]; redo: string[] }>({ undo: [], redo: [] });
  const savingHistory = useRef(false);
  const blurOriginMap = useRef<Map<string, string>>(new Map()); // uid → JSON string of original
  const blurValueMap  = useRef<Map<string, number>>(new Map()); // uid → current blur value
  const blurPosMap    = useRef<Map<string, {left:number;top:number;scaleX:number;scaleY:number;angle:number}>>(new Map()); // uid → original position before any blur
  const blurTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rectBeforeScale = useRef<{ rx: number; ry: number } | null>(null);

  const [site, setSite] = useState<Site | null>(null);
  const [fabricLoaded, setFabricLoaded] = useState(false);
  const [openTypeLoaded, setOpenTypeLoaded] = useState(false);
  const [converting, setConverting] = useState(false);
  const [removingBg, setRemovingBg] = useState(false);
  const [rmbgProgress, setRmbgProgress] = useState("");
  const rmbgWorker = useRef<Worker | null>(null);
  const [artName, setArtName] = useState("Minha arte");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [layers, setLayers] = useState<{ id: string; label: string; locked: boolean }[]>([]);
  const [shapesOpen, setShapesOpen] = useState(false);

  // Selected object state — always reflects actual object values
  const [sel, setSel] = useState<any>(null);
  const [selFill, setSelFill] = useState("#000000");
  const [selOpacity, setSelOpacity] = useState(100);
  const [selStroke, setSelStroke] = useState("#000000");
  const [selStrokeW, setSelStrokeW] = useState(0);
  const [selRadius, setSelRadius] = useState(0);
  const [selRotation, setSelRotation] = useState(0);
  const [selShadow, setSelShadow] = useState(false);
  const [selShadowColor, setSelShadowColor] = useState("rgba(0,0,0,0.5)");
  const [selShadowBlur, setSelShadowBlur] = useState(10);
  const [selShadowX, setSelShadowX] = useState(5);
  const [selShadowY, setSelShadowY] = useState(5);
  const [selBlur, setSelBlur] = useState(0);
  const [selSaturation, setSelSaturation] = useState(0);
  const [selFontSize, setSelFontSize] = useState(48);
  const [selFontFamily, setSelFontFamily] = useState("Montserrat");
  const [selBold, setSelBold] = useState(false);
  const [selItalic, setSelItalic] = useState(false);
  const [selUnderline, setSelUnderline] = useState(false);
  const [selCharSpacing, setSelCharSpacing] = useState(0);
  const [selLineHeight, setSelLineHeight] = useState(1.2);
  const [selTextWidth, setSelTextWidth] = useState(300);
  const [selTextHeight, setSelTextHeight] = useState(0); // 0 = auto
  const [selFillGradient, setSelFillGradient] = useState<{c1:string;c2:string;angle:number}|null>(null);

  // Background
  const [bgSolid, setBgSolid] = useState("#ffffff");
  const [bgGradient, setBgGradient] = useState<{c1:string;c2:string;angle:number}|null>(null);

  const DISPLAY_W = 540;
  const scale = DISPLAY_W / fmt.w;
  const DISPLAY_H = Math.round(fmt.h * scale);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "sites", user.uid)).then(s => { if (s.exists()) setSite({ id: s.id, ...s.data() } as Site); });
  }, [user]);

  useEffect(() => {
    loadGoogleFonts();
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js";
    script.onload = () => setFabricLoaded(true);
    document.head.appendChild(script);

    const otScript = document.createElement("script");
    otScript.src = "https://cdnjs.cloudflare.com/ajax/libs/opentype.js/1.3.4/opentype.min.js";
    otScript.onload = () => setOpenTypeLoaded(true);
    document.head.appendChild(otScript);

    // Preload RMBG worker
    try {
      const worker = new Worker("/rmbg-worker.js", { type: "module" });
      worker.postMessage({ type: "preload" });
      rmbgWorker.current = worker;
    } catch {}

    return () => {
      try { document.head.removeChild(script); } catch {}
      try { document.head.removeChild(otScript); } catch {}
    };
  }, []);

  const refreshLayers = (canvas: any) => {
    try {
      const objs = canvas.getObjects();
      setLayers([...objs].reverse().map((o: any) => ({
        id: o.__uid || (o.__uid = Math.random().toString(36).slice(2)),
        label: o.type === "i-text" ? `T "${(o.text||"").slice(0,12)}"` : o.type === "image" ? "Imagem" : o.type === "rect" ? "Retângulo" : o.type === "circle" ? "Círculo" : o.type === "triangle" ? "Triângulo" : o.type === "line" ? "Linha" : o.type,
        locked: !!o.lockMovementX,
      })));
    } catch {}
  };

  const syncSel = (obj: any) => {
    if (!obj) { setSel(null); return; }
    setSel(obj);
    setSelFill(getObjColor(obj));
    setSelOpacity(Math.round((obj.opacity ?? 1) * 100));
    setSelStroke(obj.stroke || "#000000");
    setSelStrokeW(obj.strokeWidth || 0);
    setSelRadius(obj.rx || 0);
    setSelRotation(Math.round(obj.angle || 0));
    setSelFontSize(Math.round((obj.fontSize || 48) / scale));
    setSelFontFamily(obj.fontFamily || "Montserrat");
    setSelBold(obj.fontWeight === "bold");
    setSelItalic(obj.fontStyle === "italic");
    setSelUnderline(!!obj.underline);
    setSelCharSpacing(obj.charSpacing ?? 0);
    setSelLineHeight(obj.lineHeight ?? 1.2);
    if (obj.type === "textbox") {
      setSelTextWidth(Math.round((obj.width || 300) / scale));
      setSelTextHeight(obj.__fixedHeight ? Math.round(obj.height / scale) : 0);
    }
    const sh = obj.shadow;
    setSelShadow(!!sh);
    if (sh) { setSelShadowColor(sh.color||"rgba(0,0,0,0.5)"); setSelShadowBlur(sh.blur||10); setSelShadowX(sh.offsetX||5); setSelShadowY(sh.offsetY||5); }
    // Blur — read from our own map (native CSS blur not stored in fabric filters)
    const uid = obj.__uid;
    setSelBlur(uid && blurValueMap.current.has(uid) ? blurValueMap.current.get(uid)! : 0);
    const satFilter = (obj.filters||[]).find((f: any) => f.type === "Saturation");
    setSelSaturation(satFilter ? (satFilter.saturation ?? 0) : 0);
    // Gradient fill
    const fill = obj.fill;
    if (fill && fill.colorStops) {
      const c1 = fill.colorStops[0]?.color || "#000";
      const c2 = fill.colorStops[1]?.color || "#fff";
      setSelFillGradient({ c1, c2, angle: 90 });
    } else { setSelFillGradient(null); }
  };

  useEffect(() => {
    if (!fabricLoaded || !canvasRef.current) return;
    const canvas = new (window as any).fabric.Canvas(canvasRef.current, {
      width: DISPLAY_W, height: DISPLAY_H, backgroundColor: "#ffffff", selection: true,
      centeredRotation: true,
    });
    fc.current = canvas;

    const saveState = () => {
      if (savingHistory.current) return;
      try { historyRef.current.undo.push(JSON.stringify(canvas.toJSON())); historyRef.current.redo = []; if (historyRef.current.undo.length > 50) historyRef.current.undo.shift(); } catch {}
    };
    const restoreState = (json: string) => {
      savingHistory.current = true;
      try { canvas.loadFromJSON(JSON.parse(json), () => { try { canvas.renderAll(); refreshLayers(canvas); } catch {} savingHistory.current = false; }); } catch { savingHistory.current = false; }
    };

    canvas.on("selection:created", (e: any) => syncSel(e.selected?.[0]));
    canvas.on("selection:updated", (e: any) => syncSel(e.selected?.[0]));
    canvas.on("selection:cleared", () => syncSel(null));
    canvas.on("object:modified", (e: any) => {
      if (!savingHistory.current) {
        saveState();
        refreshLayers(canvas);
        // For text objects, object:scaled already handled syncSel with correct fontSize
        const obj = e.target;
        if (obj?.type !== "textbox" && obj?.type !== "i-text") {
          syncSel(obj);
        }
      }
    });
    canvas.on("object:added",    () => { if (!savingHistory.current) { saveState(); refreshLayers(canvas); } });
    canvas.on("object:removed",  () => { if (!savingHistory.current) refreshLayers(canvas); });

    // When a text/textbox is scaled via handle, bake scale into fontSize so it stays correct
    canvas.on("object:scaling", (e: any) => {
      const obj = e.target;
      if (!obj) return;
      // Track font size live for text
      if (obj.type === "textbox" || obj.type === "i-text") {
        const newSize = Math.round((obj.fontSize * obj.scaleY) / scale);
        setSelFontSize(newSize);
      }
      // For rects: bake scale into width/height on every frame so rx stays correct
      if (obj.type === "rect") {
        const storedRx = rectBeforeScale.current?.rx ?? (obj.rx || 0);
        // visual rx before this frame = storedRx (already in canvas-pixel space)
        const sx = obj.scaleX || 1;
        const sy = obj.scaleY || 1;
        const newW = obj.width * sx;
        const newH = obj.height * sy;
        const maxRx = Math.min(newW, newH) / 2;
        const newRx = Math.min(storedRx, maxRx);
        obj.set({ width: newW, height: newH, rx: newRx, ry: newRx, scaleX: 1, scaleY: 1 });
        rectBeforeScale.current = { rx: newRx, ry: newRx };
        obj.setCoords();
      }
    });
    // Capture rx BEFORE any transform starts

    canvas.on("object:scaled", (e: any) => {
      const obj = e.target;
      if (!obj) return;
      // Bake font size for text
      if (obj.type === "textbox" || obj.type === "i-text") {
        const newFontSize = Math.round(obj.fontSize * obj.scaleY);
        const newWidth = obj.type === "textbox" ? obj.width * obj.scaleX : obj.width;
        obj.set({ fontSize: newFontSize, width: newWidth, scaleX: 1, scaleY: 1 });
        canvas.requestRenderAll();
        syncSel(obj);
      }
      // Rect: already baked live in object:scaling, just sync UI and reset capture
      if (obj.type === "rect") {
        rectBeforeScale.current = { rx: obj.rx || 0, ry: obj.ry || 0 };
        canvas.requestRenderAll();
        syncSel(obj);
      }
    });

    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA";
      const ctrl = e.ctrlKey || e.metaKey;
      const obj = canvas.getActiveObject();

      if ((e.key === "Delete" || e.key === "Backspace") && !isInput) {
        if (obj && !obj.lockMovementX) {
          // For text: only delete when not in edit mode
          if (obj.type === "i-text" && obj.isEditing) return;
          saveState(); canvas.remove(obj); syncSel(null);
        }
        return;
      }
      if (isInput) return;

      if (ctrl) {
        switch (e.key.toLowerCase()) {
          case "c": e.preventDefault(); if (obj) obj.clone((c: any) => { clipboardRef.current = c; }); break;
          case "v": e.preventDefault();
            if (!clipboardRef.current) return;
            clipboardRef.current.clone((c: any) => {
              c.set({ left: c.left + 20, top: c.top + 20, evented: true });
              if (c.type === "activeSelection") { c.canvas = canvas; c.forEachObject((o: any) => canvas.add(o)); c.setCoords(); }
              else canvas.add(c);
              clipboardRef.current.top += 20; clipboardRef.current.left += 20;
              canvas.setActiveObject(c); canvas.requestRenderAll();
            }); break;
          case "d": e.preventDefault();
            if (!obj) return;
            obj.clone((c: any) => { c.set({ left: obj.left+20, top: obj.top+20 }); canvas.add(c); canvas.setActiveObject(c); canvas.requestRenderAll(); }); break;
          case "z": e.preventDefault();
            if (e.shiftKey) { const n = historyRef.current.redo.pop(); if (!n) return; historyRef.current.undo.push(JSON.stringify(canvas.toJSON())); restoreState(n); }
            else { const p = historyRef.current.undo.pop(); if (!p) return; historyRef.current.redo.push(JSON.stringify(canvas.toJSON())); restoreState(p); }
            break;
          case "y": e.preventDefault(); { const n = historyRef.current.redo.pop(); if (!n) return; historyRef.current.undo.push(JSON.stringify(canvas.toJSON())); restoreState(n); } break;
          case "a": e.preventDefault(); { const all = new (window as any).fabric.ActiveSelection(canvas.getObjects(), { canvas }); canvas.setActiveObject(all); canvas.requestRenderAll(); } break;
          case "g": e.preventDefault(); if (obj?.type === "activeSelection") { canvas.setActiveObject(obj.toGroup()); canvas.requestRenderAll(); } break;
        }
        return;
      }
      if (obj && ["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) {
        e.preventDefault(); const s = e.shiftKey ? 10 : 1;
        if (e.key==="ArrowLeft") obj.set("left", obj.left-s);
        if (e.key==="ArrowRight") obj.set("left", obj.left+s);
        if (e.key==="ArrowUp") obj.set("top", obj.top-s);
        if (e.key==="ArrowDown") obj.set("top", obj.top+s);
        obj.setCoords(); canvas.requestRenderAll();
      }
      if (e.key === "Escape") { canvas.discardActiveObject(); canvas.requestRenderAll(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { canvas.dispose(); fc.current = null; window.removeEventListener("keydown", onKey); };
  }, [fabricLoaded, DISPLAY_W, DISPLAY_H]);

  // Apply background
  useEffect(() => {
    if (!fc.current) return;
    if (bgGradient) {
      const fab = (window as any).fabric;
      if (!fab) return;
      const rad = (bgGradient.angle * Math.PI) / 180;
      const grad = new fab.Gradient({ type: "linear", coords: { x1: (Math.cos(rad+Math.PI)+1)/2*DISPLAY_W, y1: (Math.sin(rad+Math.PI)+1)/2*DISPLAY_H, x2: (Math.cos(rad)+1)/2*DISPLAY_W, y2: (Math.sin(rad)+1)/2*DISPLAY_H }, colorStops: [{ offset:0, color: bgGradient.c1 },{ offset:1, color: bgGradient.c2 }] });
      fc.current.setBackgroundColor(grad, () => fc.current?.renderAll());
    } else {
      fc.current.setBackgroundColor(bgSolid, () => fc.current?.renderAll());
    }
  }, [bgSolid, bgGradient, DISPLAY_W, DISPLAY_H]);

  // Apply zoom
  useEffect(() => {
    if (!fc.current) return;
    const z = zoom / 100;
    fc.current.setZoom(z);
    fc.current.setWidth(DISPLAY_W * z);
    fc.current.setHeight(DISPLAY_H * z);
    fc.current.requestRenderAll();
  }, [zoom, DISPLAY_W, DISPLAY_H]);

  // ─── Helpers to update selected object ───────────────
  const upd = (props: Record<string, any>) => {
    if (!fc.current || !sel) return;
    sel.set(props);
    if (isText && sel.fontFamily) {
      document.fonts.load(`${sel.fontSize || 48}px "${sel.fontFamily}"`).finally(() => {
        fc.current?.requestRenderAll();
      });
    } else {
      fc.current.requestRenderAll();
    }
  };

  const updateFill = (color: string) => {
    setSelFill(color); setSelFillGradient(null);
    upd({ fill: color });
  };
  const updateFillGradient = (g: {c1:string;c2:string;angle:number}|null) => {
    setSelFillGradient(g);
    if (!g) { upd({ fill: selFill }); return; }
    if (fc.current && sel) applyGradient(fc.current, sel, g);
  };
  const updateOpacity  = (v: number) => { setSelOpacity(v);  upd({ opacity: v/100 }); };
  const updateStroke   = (c: string) => { setSelStroke(c);   upd({ stroke: c }); };
  const updateStrokeW  = (v: number) => { setSelStrokeW(v);  upd({ strokeWidth: v, strokeUniform: true }); };
  const updateRadius   = (v: number) => { setSelRadius(v);   upd({ rx: v, ry: v }); };
  const updateRotation = (v: number) => { setSelRotation(v); upd({ angle: v }); };
  const updateFontSize = (v: number) => {
    setSelFontSize(v);
    if (!fc.current || !sel) return;
    if (sel.isEditing && sel.selectionStart !== sel.selectionEnd) {
      sel.setSelectionStyles({ fontSize: v * scale });
      fc.current.requestRenderAll();
    } else { upd({ fontSize: v * scale }); }
  };
  const updateFontFamily = (v: string) => {
    setSelFontFamily(v);
    document.fonts.load(`${selFontSize * scale}px "${v}"`).finally(() => {
      upd({ fontFamily: v });
    });
  };
  const toggleBold = () => {
    const n = !selBold; setSelBold(n);
    if (!fc.current || !sel) return;
    if (sel.isEditing && sel.selectionStart !== sel.selectionEnd) {
      sel.setSelectionStyles({ fontWeight: n ? "bold" : "normal" });
      fc.current.requestRenderAll();
    } else {
      sel.set({ fontWeight: n ? "bold" : "normal" });
      // Reinitialize text metrics so charSpacing is recalculated
      // against the correct glyph widths of the bold/normal variant
      if (sel.initDimensions) sel.initDimensions();
      document.fonts.load(`bold ${sel.fontSize}px "${sel.fontFamily}"`).finally(() => {
        fc.current?.requestRenderAll();
      });
    }
  };
  const toggleItalic = () => {
    const n = !selItalic; setSelItalic(n);
    if (!fc.current || !sel) return;
    if (sel.isEditing && sel.selectionStart !== sel.selectionEnd) {
      sel.setSelectionStyles({ fontStyle: n ? "italic" : "normal" });
      fc.current.requestRenderAll();
    } else { upd({ fontStyle: n ? "italic" : "normal" }); }
  };
  const toggleUnderline = () => {
    const n = !selUnderline; setSelUnderline(n);
    if (!fc.current || !sel) return;
    if (sel.isEditing && sel.selectionStart !== sel.selectionEnd) {
      sel.setSelectionStyles({ underline: n });
      fc.current.requestRenderAll();
    } else { upd({ underline: n }); }
  };
  const updateFillForText = (color: string) => {
    // When editing text with selection, apply color only to selected chars
    if (sel?.isEditing && sel.selectionStart !== sel.selectionEnd) {
      setSelFill(color);
      sel.setSelectionStyles({ fill: color });
      fc.current?.requestRenderAll();
    } else {
      updateFill(color);
    }
  };
  const updateCharSpacing = (v: number) => { setSelCharSpacing(v); upd({ charSpacing: v }); };
  const updateLineHeight  = (v: number) => { setSelLineHeight(v);  upd({ lineHeight: v }); };

  const updateShadow = (on: boolean) => {
    setSelShadow(on);
    if (!fc.current || !sel) return;
    sel.set("shadow", on ? new (window as any).fabric.Shadow({ color: selShadowColor, blur: selShadowBlur, offsetX: selShadowX, offsetY: selShadowY }) : null);
    fc.current.requestRenderAll();
  };
  const applyShadow = (color: string, blur: number, ox: number, oy: number) => {
    if (!fc.current || !sel || !selShadow) return;
    sel.set("shadow", new (window as any).fabric.Shadow({ color, blur, offsetX: ox, offsetY: oy }));
    fc.current.requestRenderAll();
  };

  const updateBlur = (v: number) => {
    setSelBlur(v);
    if (!fc.current || !sel) return;

    const uid = sel.__uid;

    // Track value
    if (v > 0) blurValueMap.current.set(uid, v);
    else blurValueMap.current.delete(uid);

    // ── Real uploaded image: fabric filter, no debounce needed ──
    if (sel.type === "image" && !blurOriginMap.current.has(uid)) {
      const fabric = (window as any).fabric;
      const filters = (sel.filters || []).filter((f: any) => f.type !== "Blur");
      if (v > 0) filters.push(new fabric.Image.filters.Blur({ blur: v / 100 }));
      sel.filters = filters;
      sel.set({ padding: v > 0 ? Math.round(v * 0.8) : 0 });
      sel.applyFilters();
      fc.current.requestRenderAll();
      return;
    }

    // Save original position ONCE before first rasterization
    if (!blurPosMap.current.has(uid)) {
      blurPosMap.current.set(uid, {
        left: sel.left, top: sel.top,
        scaleX: sel.scaleX || 1, scaleY: sel.scaleY || 1,
        angle: sel.angle || 0,
      });
    }

    // Save original object JSON ONCE
    if (!blurOriginMap.current.has(uid) && sel.type !== "image") {
      blurOriginMap.current.set(uid, JSON.stringify(sel.toObject()));
    }

    // Debounce: only rasterize 150ms after slider stops
    if (blurTimer.current) clearTimeout(blurTimer.current);
    blurTimer.current = setTimeout(() => {
      const fabric = (window as any).fabric;
      const currentV = blurValueMap.current.get(uid) ?? 0;
      const pos = blurPosMap.current.get(uid)!;

      // ── Blur = 0: restore original ──
      if (currentV === 0 && blurOriginMap.current.has(uid)) {
        const json = blurOriginMap.current.get(uid)!;
        blurOriginMap.current.delete(uid);
        blurPosMap.current.delete(uid);
        const current = fc.current.getObjects().find((o: any) => o.__uid === uid);
        if (current) fc.current.remove(current);
        fabric.util.enlivenObjects([JSON.parse(json)], (objs: any[]) => {
          const orig = objs[0];
          orig.set({ left: pos.left, top: pos.top, angle: pos.angle, scaleX: pos.scaleX, scaleY: pos.scaleY });
          orig.__uid = uid;
          fc.current.add(orig);
          fc.current.setActiveObject(orig);
          setSel(orig);
          setSelBlur(0);
          fc.current.requestRenderAll();
        });
        return;
      }

      // ── Rasterize from original JSON ──
      const sourceJson = blurOriginMap.current.get(uid)!;
      const current = fc.current.getObjects().find((o: any) => o.__uid === uid);
      if (current) fc.current.remove(current);

      fabric.util.enlivenObjects([JSON.parse(sourceJson)], async (objs: any[]) => {
        const sourceObj = objs[0];
        const srcW = (sourceObj.width  || 100) * pos.scaleX;
        const srcH = (sourceObj.height || 100) * pos.scaleY;
        const blurPx = Math.max(1, Math.round(currentV * 0.3));
        const pad = blurPx * 4;
        const cw = Math.min(Math.ceil(srcW) + pad * 2, 1800);
        const ch = Math.min(Math.ceil(srcH) + pad * 2, 1800);

        const miniEl = document.createElement("canvas");
        miniEl.width = cw; miniEl.height = ch;
        const miniCanvas = new fabric.StaticCanvas(miniEl, { width: cw, height: ch, enableRetinaScaling: false });
        sourceObj.set({ left: cw / 2, top: ch / 2, originX: "center", originY: "center", angle: 0, scaleX: pos.scaleX, scaleY: pos.scaleY });
        miniCanvas.add(sourceObj);

        // Wait for fonts before rendering so Google Fonts display correctly
        await document.fonts.ready;
        miniCanvas.renderAll();

        const outEl = document.createElement("canvas");
        outEl.width = cw; outEl.height = ch;
        const ctx = outEl.getContext("2d")!;
        ctx.filter = `blur(${blurPx}px)`;
        ctx.drawImage(miniEl, 0, 0);
        miniCanvas.dispose();

        const dataURL = outEl.toDataURL("image/png");
        fabric.Image.fromURL(dataURL, (img: any) => {
          // Center image over original position
          img.set({
            left: pos.left + (srcW / 2) - (cw / 2),
            top:  pos.top  + (srcH / 2) - (ch / 2),
            angle: pos.angle,
            scaleX: 1, scaleY: 1,
            originX: "left", originY: "top",
            strokeUniform: true,
          });
          img.__uid = uid;
          fc.current.add(img);
          fc.current.setActiveObject(img);
          setSel(img);
          setSelBlur(currentV);
          fc.current.requestRenderAll();
        });
      });
    }, 150);
  };

  const toggleLock = (uid: string) => {
    if (!fc.current) return;
    const obj = fc.current.getObjects().find((o: any) => o.__uid === uid);
    if (!obj) return;
    const locked = !obj.lockMovementX;
    obj.set({
      lockMovementX: locked, lockMovementY: locked,
      lockRotation: locked, lockScalingX: locked, lockScalingY: locked,
      selectable: !locked,
      evented: !locked,
      hoverCursor: locked ? "default" : "move",
    });
    // Deselect if currently selected and being locked
    if (locked && fc.current.getActiveObject() === obj) {
      fc.current.discardActiveObject();
      syncSel(null);
    }
    refreshLayers(fc.current);
    fc.current.requestRenderAll();
  };

  const alignObj = (dir: string) => {
    if (!fc.current || !sel) return;
    const canvas = fc.current;
    const zoom = canvas.getZoom();
    const cw = canvas.getWidth() / zoom;
    const ch = canvas.getHeight() / zoom;
    sel.setCoords();
    const br = sel.getBoundingRect(true);
    if (dir === "left")    sel.set({ left: sel.left - br.left });
    if (dir === "hcenter") sel.set({ left: sel.left - br.left + (cw - br.width) / 2 });
    if (dir === "right")   sel.set({ left: sel.left - br.left + cw - br.width });
    if (dir === "top")     sel.set({ top: sel.top - br.top });
    if (dir === "vcenter") sel.set({ top: sel.top - br.top + (ch - br.height) / 2 });
    if (dir === "bottom")  sel.set({ top: sel.top - br.top + ch - br.height });
    sel.setCoords();
    canvas.requestRenderAll();
  };

  // ─── Add elements ─────────────────────────────────────
  const add = (fn: (fabric: any) => any) => {
    if (!fc.current) return;
    const obj = fn((window as any).fabric);
    fc.current.add(obj); fc.current.setActiveObject(obj); syncSel(obj); setShapesOpen(false);
  };
  const addText = () => {
    if (!fc.current) return;
    const fab = (window as any).fabric;
    const fontToLoad = `${selFontSize * scale}px "${selFontFamily}"`;
    document.fonts.load(fontToLoad).finally(() => {
      const t = new fab.Textbox("Texto aqui", {
        left: DISPLAY_W / 2,
        top: DISPLAY_H / 2,
        originX: "center",
        originY: "center",
        width: 300 * scale,
        fontSize: selFontSize * scale,
        fontFamily: selFontFamily,
        fill: "#000000",
        strokeUniform: true,
        splitByGrapheme: false,
      });
      fc.current.add(t);
      fc.current.setActiveObject(t);
      syncSel(t);
      fc.current.requestRenderAll();
      t.enterEditing();
    });
  };

  const updateSaturation = (v: number) => {
    setSelSaturation(v);
    if (!fc.current || !sel) return;
    const fabric = (window as any).fabric;
    const filters = (sel.filters || []).filter((f: any) => f.type !== "Saturation");
    filters.push(new fabric.Image.filters.Saturation({ saturation: v }));
    sel.filters = filters;
    sel.applyFilters();
    fc.current.requestRenderAll();
  };

  const updateTextWidth = (v: number) => {
    setSelTextWidth(v);
    upd({ width: v * scale });
  };

  const updateTextHeight = (v: number) => {
    setSelTextHeight(v);
    if (!fc.current || !sel) return;
    if (v === 0) {
      // Auto height: remove fixed height
      sel.set({ minHeight: undefined, __fixedHeight: false });
      sel.__fixedHeight = false;
      // Restore natural height by triggering a re-render
      sel.initDimensions?.();
      fc.current.requestRenderAll();
    } else {
      sel.__fixedHeight = true;
      sel.set({ height: v * scale, minHeight: v * scale });
      fc.current.requestRenderAll();
    }
  };
  const addRect  = (r=0) => add(fab => new fab.Rect({ left:DISPLAY_W/2-75, top:DISPLAY_H/2-50, width:150, height:100, fill:"#3b82f6", rx:r, ry:r, strokeUniform:true }));
  const addCirc  = () => add(fab => new fab.Circle({ left:DISPLAY_W/2-60, top:DISPLAY_H/2-60, radius:60, fill:"#3b82f6", strokeUniform:true }));
  const addTri   = () => add(fab => new fab.Triangle({ left:DISPLAY_W/2-60, top:DISPLAY_H/2-60, width:120, height:120, fill:"#3b82f6", strokeUniform:true }));
  const addLine  = () => add(fab => new fab.Line([DISPLAY_W/2-80, DISPLAY_H/2, DISPLAY_W/2+80, DISPLAY_H/2], { stroke:"#000000", strokeWidth:3, strokeUniform:true }));
  const addStar  = () => {
    const points: { x: number; y: number }[] = [];
    for (let i=0;i<10;i++) { const r = i%2===0?60:24; const a = (Math.PI/5)*i - Math.PI/2; points.push({ x: r*Math.cos(a), y: r*Math.sin(a) }); }
    add(fab => new fab.Polygon(points, { left:DISPLAY_W/2, top:DISPLAY_H/2, originX:"center", originY:"center", fill:"#eab308", strokeUniform:true }));
  };
  const addArrow = () => {
    const points: { x: number; y: number }[] = [{ x:0,y:20 },{ x:80,y:20 },{ x:80,y:0 },{ x:120,y:35 },{ x:80,y:70 },{ x:80,y:50 },{ x:0,y:50 }];
    add(fab => new fab.Polygon(points, { left:DISPLAY_W/2-60, top:DISPLAY_H/2-35, fill:"#3b82f6", strokeUniform:true }));
  };

  const handleImg = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !fc.current) return;
    const r = new FileReader();
    r.onload = ev => (window as any).fabric.Image.fromURL(ev.target?.result as string, (img: any) => {
      if (img.width > DISPLAY_W * 0.8) img.scaleToWidth(DISPLAY_W * 0.8);
      // Use top-left origin so alignment math is consistent with other objects
      const scaledW = img.getScaledWidth();
      const scaledH = img.getScaledHeight();
      img.set({
        left: (DISPLAY_W - scaledW) / 2,
        top: (DISPLAY_H - scaledH) / 2,
        originX: "left",
        originY: "top",
      });
      fc.current.add(img); fc.current.setActiveObject(img); syncSel(img);
    });
    r.readAsDataURL(file); e.target.value = "";
  };

  const convertTextToPath = async () => {
    if (!fc.current || !sel || !isText) return;
    const opentype = (window as any).opentype;
    if (!opentype) { alert("opentype.js ainda carregando, tente novamente."); return; }
    setConverting(true);
    try {
      const fabric = (window as any).fabric;
      const fontFamily = sel.fontFamily || "Arial";
      const fontSize   = sel.fontSize   || 48;
      const fillColor  = typeof sel.fill === "string" ? sel.fill : "#000000";
      const text       = sel.text || "";
      const objLeft    = sel.left;
      const objTop     = sel.top;
      const uid        = sel.__uid;

      // Google Fonts CDN URL for opentype download
      const FONT_URLS: Record<string, string> = {
        "Montserrat":       "https://fonts.gstatic.com/s/montserrat/v29/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCtr6Hw5aXo.woff",
        "Playfair Display": "https://fonts.gstatic.com/s/playfairdisplay/v36/nuFiD-vYSZviVYUb_rj3ij__anPXDTnCjmHKM4nYO7KN_qiTbtA.woff",
        "Roboto":           "https://fonts.gstatic.com/s/roboto/v32/KFOmCnqEu92Fr1Mu4mxKKTU1Kg.woff",
        "Oswald":           "https://fonts.gstatic.com/s/oswald/v53/TK3_WkUHHAIjg75cFRf3bXL8LICs13NvgUFoZAaRliE.woff",
        "Lato":             "https://fonts.gstatic.com/s/lato/v24/S6uyw4BMUTPHjx4wXiWtFCc.woff",
        "Raleway":          "https://fonts.gstatic.com/s/raleway/v34/1Ptxg8zYS_SKggPN4iEgvnHyvveLxVsEpYCP.woff",
        "Pacifico":         "https://fonts.gstatic.com/s/pacifico/v22/FwZY7-Qmy14u9lezJ96A4sijpFu_.woff",
        "Dancing Script":   "https://fonts.gstatic.com/s/dancingscript/v25/If2cXTr6YS-zF4S-kcSWSVi_sxjsohD9F50Ruu7BMSo3ROp6.woff",
        "Bebas Neue":       "https://fonts.gstatic.com/s/bebasneue/v14/JTUSjIg69CK48gW7PXoo9WlhyyTh89Y.woff",
      };

      // Load font via opentype — try Google Fonts URL, fall back to system Arial
      const loadFont = async (family: string): Promise<any> => {
        const url = FONT_URLS[family];
        if (url) {
          try {
            return await opentype.load(url);
          } catch {}
        }
        // Fallback: rasterize as image path (can't get system font binary)
        return null;
      };

      const font = await loadFont(fontFamily);

      if (!font) {
        // Fallback: convert via SVG rasterization
        const svgData = sel.toSVG();
        const path = new fabric.Path(svgData, {
          left: objLeft, top: objTop,
          fill: fillColor, strokeUniform: true,
        });
        path.__uid = uid;
        fc.current.remove(sel);
        fc.current.add(path);
        fc.current.setActiveObject(path);
        syncSel(path);
        fc.current.requestRenderAll();
        return;
      }

      // Generate SVG path from opentype
      const svgPath = font.getPath(text, 0, 0, fontSize);
      const pathData = svgPath.toPathData(2);

      const path = new fabric.Path(pathData, {
        left: objLeft,
        top:  objTop,
        fill: fillColor,
        strokeUniform: true,
        scaleX: sel.scaleX || 1,
        scaleY: sel.scaleY || 1,
      });
      path.__uid = uid;
      fc.current.remove(sel);
      fc.current.add(path);
      fc.current.setActiveObject(path);
      syncSel(path);
      fc.current.requestRenderAll();
    } finally {
      setConverting(false);
    }
  };



  const removeBackgroundLocal = () => {
    if (!fc.current || !sel || sel.type !== "image") return;
    if (!rmbgWorker.current) {
      alert("Worker não disponível. Tente recarregar a página.");
      return;
    }
    setRemovingBg(true);
    setRmbgProgress("Preparando imagem...");
    const fabric = (window as any).fabric;

    // Rasterize current image to pixel data
    const origW = Math.round(sel.width  * (sel.scaleX || 1));
    const origH = Math.round(sel.height * (sel.scaleY || 1));
    const MAX = 1024;
    const ratio = Math.min(MAX / origW, MAX / origH, 1);
    const pw = Math.round(origW * ratio);
    const ph = Math.round(origH * ratio);

    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = pw; tmpCanvas.height = ph;
    const ctx = tmpCanvas.getContext("2d")!;
    const imgEl = (sel as any)._element as HTMLImageElement;
    ctx.drawImage(imgEl, 0, 0, pw, ph);
    const pixelData = ctx.getImageData(0, 0, pw, ph);

    const left = sel.left;
    const top  = sel.top;
    const angle = sel.angle || 0;
    const uid  = sel.__uid;
    const scaleX = sel.scaleX || 1;
    const scaleY = sel.scaleY || 1;

    const worker = rmbgWorker.current;

    const handler = (e: MessageEvent) => {
      const { type, message, imageData, width, height } = e.data;
      if (type === "progress") { setRmbgProgress(message); return; }
      if (type === "error") {
        setRemovingBg(false); setRmbgProgress("");
        alert("Erro: " + message);
        worker.removeEventListener("message", handler);
        return;
      }
      if (type === "result") {
        worker.removeEventListener("message", handler);
        // Build PNG from result pixels
        const outCanvas = document.createElement("canvas");
        outCanvas.width = width; outCanvas.height = height;
        const outCtx = outCanvas.getContext("2d")!;
        const outImgData = new ImageData(new Uint8ClampedArray(imageData), width, height);
        outCtx.putImageData(outImgData, 0, 0);
        const dataURL = outCanvas.toDataURL("image/png");
        fc.current.remove(sel);
        fabric.Image.fromURL(dataURL, (img: any) => {
          const scaleToW = (origW / img.width) * (scaleX);
          img.set({ left, top, angle, scaleX: scaleToW, scaleY: scaleToW, strokeUniform: true });
          img.__uid = uid;
          fc.current.add(img);
          fc.current.setActiveObject(img);
          syncSel(img);
          fc.current.requestRenderAll();
          setRemovingBg(false);
          setRmbgProgress("");
        });
      }
    };

    worker.addEventListener("message", handler);
    worker.postMessage({ type: "removebg", imageData: pixelData.data.buffer, width: pw, height: ph }, [pixelData.data.buffer]);
  };


  const deleteSelected = () => {
    if (!fc.current || !sel) return;
    fc.current.remove(sel); syncSel(null);
  };

  const exportDataUrl = () => {
    const canvas = fc.current;
    const currentZoom = canvas.getZoom();
    canvas.setZoom(1); canvas.setWidth(DISPLAY_W); canvas.setHeight(DISPLAY_H);
    const z = fmt.w / DISPLAY_W;
    canvas.setZoom(z); canvas.setWidth(fmt.w); canvas.setHeight(fmt.h);
    const dataUrl = canvas.toDataURL({ format:"png", multiplier:1 });
    canvas.setZoom(currentZoom); canvas.setWidth(DISPLAY_W * currentZoom); canvas.setHeight(DISPLAY_H * currentZoom);
    canvas.requestRenderAll();
    return dataUrl;
  };

  const handleDownload = () => {
    if (!fc.current) return;
    const a = document.createElement("a"); a.href = exportDataUrl(); a.download = artName+".png"; a.click();
  };

  const handleSave = async () => {
    if (!fc.current || !site) return; setSaving(true);
    try {
      const dataUrl = exportDataUrl();
      const path = `canvas/${site.widgetId}/${Date.now()}.png`;
      const sRef = ref(storage, path);
      await uploadString(sRef, dataUrl, "data_url");
      const url = await getDownloadURL(sRef);
      await addDoc(collection(db, "canvas_arts"), { widgetId:site.widgetId, name:artName, format:fmt.label, url, storagePath:path, createdAt:Date.now() });
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };

  const isText = sel?.type === "i-text" || sel?.type === "textbox";
  const isTextbox = sel?.type === "textbox";
  const isShape = sel && ["rect","circle","triangle","polygon"].includes(sel.type);
  const isRect = sel?.type === "rect";

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden" style={{ fontFamily: "system-ui, sans-serif" }}>
      {/* Top bar */}
      <nav className="bg-white border-b border-gray-200 px-4 h-14 flex items-center justify-between flex-shrink-0 z-20">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/canvas" className="text-sm text-gray-500 hover:text-gray-700">← Canvas</Link>
          <span className="text-gray-200">|</span>
          <input value={artName} onChange={e => setArtName(e.target.value)}
            className="text-sm font-medium text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-indigo-400 focus:outline-none px-1 py-0.5 w-40" />
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{fmt.label}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Zoom */}
          <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-2 py-1">
            <button onClick={() => setZoom(z => Math.max(25, z-25))} className="text-gray-500 hover:text-gray-800 w-5 text-center text-sm">−</button>
            <span className="text-xs text-gray-600 w-10 text-center">{zoom}%</span>
            <button onClick={() => setZoom(z => Math.min(200, z+25))} className="text-gray-500 hover:text-gray-800 w-5 text-center text-sm">+</button>
          </div>
          <button onClick={handleDownload} className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition">↓ PNG</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-60">
            {saving ? "Salvando..." : saved ? "✓ Salvo!" : "Salvar"}
          </button>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* ── LEFT TOOLBAR ─────────────────────────────── */}
        <div className="w-52 bg-white border-r border-gray-200 flex flex-col overflow-y-auto flex-shrink-0 text-xs">

          {/* Add section */}
          <div className="p-3 border-b border-gray-100">
            <p className="font-semibold text-gray-500 mb-2 uppercase tracking-wide" style={{fontSize:10}}>Adicionar</p>
            <div className="flex flex-col gap-1">
              <button onClick={addText} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 text-gray-700 transition text-left">
                <span className="w-4 text-center font-bold">T</span> Texto
              </button>

              {/* Shapes dropdown */}
              <div className="relative">
                <button onClick={() => setShapesOpen(o => !o)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 text-gray-700 transition text-left">
                  <span className="w-4 text-center">◻</span> Formas
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`ml-auto text-gray-400 transition-transform ${shapesOpen?"rotate-180":""}`}><path d="M2 3l3 4 3-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </button>
                {shapesOpen && (
                  <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-30 p-2 flex flex-col gap-1">
                    <button onClick={() => addRect(0)}  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-indigo-50 text-gray-700">◻ Retângulo</button>
                    <button onClick={() => addRect(12)} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-indigo-50 text-gray-700">▢ Retângulo arredondado</button>
                    <button onClick={addCirc}  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-indigo-50 text-gray-700">○ Círculo</button>
                    <button onClick={addTri}   className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-indigo-50 text-gray-700">△ Triângulo</button>
                    <button onClick={addLine}  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-indigo-50 text-gray-700">― Linha</button>
                    <button onClick={addStar}  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-indigo-50 text-gray-700">★ Estrela</button>
                    <button onClick={addArrow} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-indigo-50 text-gray-700">→ Seta</button>
                  </div>
                )}
              </div>

              <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 text-gray-700 transition cursor-pointer">
                <span className="w-4 text-center">🖼</span> Imagem
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImg} />
              </label>
            </div>
          </div>

          {/* Background section */}
          <div className="p-3 border-b border-gray-100">
            <p className="font-semibold text-gray-500 mb-2 uppercase tracking-wide" style={{fontSize:10}}>Fundo</p>
            <ColorPicker value={bgGradient ? bgGradient.c1 : bgSolid} onChange={c => { setBgSolid(c); setBgGradient(null); }} label="" />
            <div className="mt-2">
              <GradientEditor value={bgGradient} onChange={g => { if (g) setBgGradient(g); else { setBgGradient(null); } }} />
            </div>
          </div>

          {/* Align section — always visible */}
          {sel && (
            <div className="p-3 border-b border-gray-100">
              <p className="font-semibold text-gray-500 mb-2 uppercase tracking-wide" style={{fontSize:10}}>Alinhar</p>
              <div className="grid grid-cols-3 gap-1">
                {[["left","⬛←","left"],["hcenter","⬛→←","hcenter"],["right","→⬛","right"],["top","⬛↑","top"],["vcenter","⬛↕","vcenter"],["bottom","↓⬛","bottom"]].map(([dir,icon]) => (
                  <button key={dir} onClick={() => alignObj(dir)} title={dir}
                    className="py-1.5 text-center border border-gray-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-300 text-gray-600 transition" style={{fontSize:9}}>{icon}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── CANVAS ───────────────────────────────────── */}
        <div className="flex-1 overflow-auto flex items-start justify-center p-8 bg-gray-100">
          <div className="shadow-2xl">
            {!fabricLoaded ? (
              <div style={{ width: DISPLAY_W, height: DISPLAY_H }} className="bg-white flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : <canvas ref={canvasRef} />}
          </div>
        </div>

        {/* ── RIGHT: PROPERTIES + LAYERS ───────────────── */}
        <div className="w-56 bg-white border-l border-gray-200 flex flex-col flex-shrink-0 overflow-y-auto text-xs">

          {/* Properties panel */}
          {sel ? (
            <div className="p-3 flex flex-col gap-3 border-b border-gray-200">
              <p className="font-semibold text-gray-600 uppercase tracking-wide" style={{fontSize:10}}>Propriedades</p>

              {/* Fill — hidden for images */}
              {sel.type !== "image" && (
                <>
                  <Sec title="Preenchimento" />
                  <ColorPicker value={selFill} onChange={isText ? updateFillForText : updateFill} label="" />
                  <GradientEditor value={selFillGradient} onChange={updateFillGradient} />
                </>
              )}

              {/* Opacity */}
              <Sec title="Opacidade" />
              <SliderRow label="" value={selOpacity} min={0} max={100} unit="%" onChange={updateOpacity} />

              {/* Stroke — hidden for images */}
              {sel.type !== "image" && (
                <>
                  <Sec title="Borda" />
                  <ColorPicker value={selStroke} onChange={c => { setSelStroke(c); updateStroke(c); }} label="Cor" />
                  <NumRow label="Espessura" value={selStrokeW} min={0} max={50} onChange={v => { setSelStrokeW(v); updateStrokeW(v); }} />
                </>
              )}

              {/* Rotation */}
              <Sec title="Rotação" />
              <SliderRow label="" value={selRotation} min={0} max={360} unit="°" onChange={updateRotation} />

              {/* Border radius — only for rects */}
              {isRect && (
                <>
                  <Sec title="Arredondamento" />
                  <SliderRow label="" value={selRadius} min={0} max={200} onChange={v => { setSelRadius(v); updateRadius(v); }} />
                </>
              )}

              {/* Font — only for text */}
              {isText && (
                <>
                  <Sec title="Texto" />
                  <div><p className="text-gray-400 mb-1">Fonte</p>
                    <select value={selFontFamily} onChange={e => updateFontFamily(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-indigo-400">
                      {FONTS.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
                    </select>
                  </div>
                  <NumRow label="Tamanho" value={selFontSize} min={6} max={400} onChange={updateFontSize} />
                  <div>
                    <p className="text-gray-400 mb-1.5">Formatação</p>
                    <div className="flex gap-1.5">
                      <button onClick={toggleBold}
                        className={`flex-1 py-1.5 rounded-lg border text-sm font-bold transition ${selBold ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                        B
                      </button>
                      <button onClick={toggleItalic}
                        className={`flex-1 py-1.5 rounded-lg border text-sm italic transition ${selItalic ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                        I
                      </button>
                      <button onClick={toggleUnderline}
                        className={`flex-1 py-1.5 rounded-lg border text-sm underline transition ${selUnderline ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                        U
                      </button>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <p className="text-gray-400">Espaço entre letras</p>
                      <span className="text-gray-500">{selCharSpacing}</span>
                    </div>
                    <input type="range" min={-200} max={800} step={10} value={selCharSpacing}
                      onChange={e => updateCharSpacing(+e.target.value)}
                      className="w-full accent-indigo-600" />
                    <div className="flex justify-between text-gray-300 mt-0.5" style={{fontSize:9}}><span>−200</span><span>0</span><span>800</span></div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <p className="text-gray-400">Espaço entre linhas</p>
                      <span className="text-gray-500">{selLineHeight.toFixed(1)}</span>
                    </div>
                    <input type="range" min={0.1} max={4} step={0.1} value={selLineHeight}
                      onChange={e => updateLineHeight(+e.target.value)}
                      className="w-full accent-indigo-600" />
                    <div className="flex justify-between text-gray-300 mt-0.5" style={{fontSize:9}}><span>0.1</span><span>1.0</span><span>4.0</span></div>
                  </div>
                  {isTextbox && (
                    <>
                      <NumRow
                        label="Largura (px)"
                        value={selTextWidth}
                        min={50}
                        max={Math.round(fmt.w)}
                        onChange={updateTextWidth}
                      />
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-gray-400">Altura (px)</p>
                          <span className="text-xs text-gray-300">0 = automático</span>
                        </div>
                        <input
                          type="number"
                          value={selTextHeight}
                          min={0}
                          max={Math.round(fmt.h)}
                          onChange={e => updateTextHeight(+e.target.value)}
                          className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-indigo-400"
                        />
                      </div>
                    </>
                  )}
                  <button
                    onClick={convertTextToPath}
                    disabled={converting || !openTypeLoaded}
                    className="w-full py-2 border border-indigo-200 text-indigo-600 rounded-lg hover:bg-indigo-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Converte o texto em vetor editável como forma"
                  >
                    {converting ? "Convertendo..." : "⟳ Converter em vetor"}
                  </button>
                </>
              )}

              {/* Shadow */}
              <Sec title="Sombra" />
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Ativar sombra</span>
                <button onClick={() => updateShadow(!selShadow)} className={`w-9 h-5 rounded-full transition ${selShadow?"bg-indigo-500":"bg-gray-200"}`}>
                  <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${selShadow?"translate-x-4":""}`} />
                </button>
              </div>
              {selShadow && (
                <div className="flex flex-col gap-2">
                  <ColorPicker value={selShadowColor} onChange={c => { setSelShadowColor(c); applyShadow(c, selShadowBlur, selShadowX, selShadowY); }} label="Cor" />
                  <SliderRow label="Blur" value={selShadowBlur} min={0} max={60} onChange={v => { setSelShadowBlur(v); applyShadow(selShadowColor, v, selShadowX, selShadowY); }} />
                  <SliderRow label="X" value={selShadowX} min={-50} max={50} onChange={v => { setSelShadowX(v); applyShadow(selShadowColor, selShadowBlur, v, selShadowY); }} />
                  <SliderRow label="Y" value={selShadowY} min={-50} max={50} onChange={v => { setSelShadowY(v); applyShadow(selShadowColor, selShadowBlur, selShadowX, v); }} />
                </div>
              )}

              {/* Saturation — images only */}
              {sel.type === "image" && (
                <>
                  <Sec title="Imagem" />
                  <button
                    onClick={removeBackgroundLocal}
                    disabled={removingBg}
                    className="w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-xs disabled:opacity-50 font-medium"
                  >
                    {removingBg ? rmbgProgress || "Processando..." : "✂ Remover fundo"}
                  </button>
                  <Sec title="Saturação" />
                  <SliderRow label="" value={Math.round(selSaturation * 100)} min={-100} max={100} unit="%" onChange={v => updateSaturation(v / 100)} />
                  <div className="flex justify-between text-gray-300 mt-0.5" style={{fontSize:9}}><span>P&amp;B</span><span>Normal</span><span>Vivo</span></div>
                </>
              )}

              {/* Blur filter — all types */}
              <>
                <Sec title="Blur" />
                <SliderRow label="" value={selBlur} min={0} max={100} onChange={updateBlur} />
              </>

              {/* Delete */}
              <button onClick={deleteSelected} className="w-full py-2 mt-1 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition">🗑 Remover</button>
            </div>
          ) : (
            <div className="p-3 border-b border-gray-200">
              <p className="text-gray-400 text-center py-4">Selecione um elemento para editar</p>
            </div>
          )}

          {/* Layers panel */}
          <div className="flex flex-col flex-1">
            <div className="px-3 py-2 border-b border-gray-100">
              <p className="font-semibold text-gray-500 uppercase tracking-wide" style={{fontSize:10}}>Camadas</p>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {layers.length === 0 ? (
                <p className="text-gray-400 p-3 text-center">Sem elementos</p>
              ) : layers.map((layer, index) => {
                const isActive = sel?.__uid === layer.id;
                return (
                  <div key={layer.id} draggable
                    onDragStart={e => e.dataTransfer.setData("li", String(index))}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      e.preventDefault();
                      const from = parseInt(e.dataTransfer.getData("li"));
                      if (from === index || !fc.current) return;
                      const canvas = fc.current;
                      const objs = [...canvas.getObjects()];
                      const total = objs.length;
                      const [moving] = objs.splice(total-1-from, 1);
                      objs.splice(total-1-index, 0, moving);
                      objs.forEach((o: any, i: number) => { canvas.remove(o); canvas.insertAt(o, i, false); });
                      canvas.requestRenderAll(); refreshLayers(canvas);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-2 cursor-grab active:cursor-grabbing transition select-none ${isActive ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-600 hover:bg-gray-50"}`}>
                    <svg width="8" height="12" viewBox="0 0 8 12" fill="none" className="flex-shrink-0 text-gray-300">
                      <circle cx="2" cy="2" r="1.2" fill="currentColor"/><circle cx="6" cy="2" r="1.2" fill="currentColor"/>
                      <circle cx="2" cy="6" r="1.2" fill="currentColor"/><circle cx="6" cy="6" r="1.2" fill="currentColor"/>
                      <circle cx="2" cy="10" r="1.2" fill="currentColor"/><circle cx="6" cy="10" r="1.2" fill="currentColor"/>
                    </svg>
                    <span className="flex-1 truncate text-xs" onClick={() => {
                      const obj = fc.current?.getObjects().find((o: any) => o.__uid === layer.id);
                      if (obj) { fc.current.setActiveObject(obj); fc.current.requestRenderAll(); syncSel(obj); }
                    }}>{layer.label}</span>
                    <button onClick={() => toggleLock(layer.id)} title={layer.locked ? "Desbloquear" : "Bloquear"}
                      className={`text-gray-300 hover:text-gray-600 flex-shrink-0 ${layer.locked ? "text-amber-400" : ""}`}>
                      {layer.locked ? "🔒" : "🔓"}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="p-2 border-t border-gray-100 text-gray-400 space-y-0.5" style={{fontSize:9}}>
              <p>Ctrl+C/V Copiar/Colar &nbsp; Ctrl+D Duplicar</p>
              <p>Ctrl+Z/Y Desfazer/Refazer &nbsp; Del Remover</p>
              <p>↑↓←→ Mover 1px &nbsp; Shift+↑ 10px</p>
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
