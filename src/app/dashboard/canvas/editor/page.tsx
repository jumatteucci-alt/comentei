"use client";
export const dynamic = "force-dynamic";
import { useEffect, useRef, useState, Suspense, useCallback } from "react";
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


function ColorPickerWithNone({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const isNone = value === "transparent" || value === "";
  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-1.5">
        {/* No-fill button — same size as swatches */}
        <button onClick={() => onChange("transparent")} title="Sem cor"
          style={{ outline: isNone ? "2px solid #4f46e5" : "1px solid #e4e4e0", outlineOffset: "1px", background: "#fff" }}
          className="relative w-5 h-5 rounded overflow-hidden flex-shrink-0 transition">
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom right, transparent calc(50% - 1px), #ef4444 calc(50% - 1px), #ef4444 calc(50% + 1px), transparent calc(50% + 1px))" }} />
        </button>
        {SWATCHES.map(col => (
          <button key={col} onClick={() => onChange(col)}
            style={{ background: col, outline: value === col ? "2px solid #4f46e5" : "1px solid #e4e4e0", outlineOffset: "1px" }}
            className="w-5 h-5 rounded transition flex-shrink-0" />
        ))}
      </div>
      {!isNone && (
        <div className="flex gap-1.5">
          <input type="color" value={value.startsWith("#") ? value : "#000000"}
            onChange={e => onChange(e.target.value)} className="w-7 h-7 rounded border border-gray-200 cursor-pointer p-0 flex-shrink-0" />
          <input type="text" value={value} onChange={e => onChange(e.target.value)}
            className="flex-1 px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-indigo-400 min-w-0" />
        </div>
      )}
    </div>
  );
}

type GradStop = { color: string; opacity: number; pos: number };
type GradValue = { stops: GradStop[]; angle: number };

function GradientEditor({ value, onChange }: { value: GradValue | null; onChange: (g: GradValue | null) => void }) {
  const [on, setOn] = useState(!!value);
  const defaultG: GradValue = { stops: [{ color:"#4f46e5", opacity:1, pos:0 },{ color:"#ec4899", opacity:1, pos:100 }], angle: 90 };
  const g: GradValue = value || defaultG;

  const updateStop = (i: number, patch: Partial<GradStop>) => {
    const stops = g.stops.map((s, idx) => idx===i ? {...s,...patch} : s);
    onChange({ ...g, stops });
  };
  const addStop = () => {
    const stops = [...g.stops, { color:"#ffffff", opacity:1, pos:50 }].sort((a,b)=>a.pos-b.pos);
    onChange({ ...g, stops });
  };
  const removeStop = (i: number) => {
    if (g.stops.length <= 2) return;
    const stops = g.stops.filter((_,idx) => idx!==i);
    onChange({ ...g, stops });
  };

  const previewGrad = g.stops.map(s => {
    const hex = s.color.startsWith("#") ? s.color : "#000";
    const r = parseInt(hex.slice(1,3),16), gr = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${gr},${b},${s.opacity}) ${s.pos}%`;
  }).join(", ");

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
          <div style={{ background: `linear-gradient(${g.angle}deg, ${previewGrad})`, height: 20, borderRadius: 6 }} />
          <div>
            <p className="text-xs text-gray-400 mb-1">Ângulo: {g.angle}°</p>
            <input type="range" min={0} max={360} value={g.angle} onChange={e => onChange({ ...g, angle: +e.target.value })} className="w-full accent-indigo-600" />
          </div>
          {g.stops.map((s, i) => (
            <div key={i} className="flex flex-col gap-1 p-2 border border-gray-100 rounded-lg">
              <div className="flex items-center gap-1 justify-between">
                <span className="text-xs text-gray-400">Cor {i+1}</span>
                {g.stops.length > 2 && (
                  <button onClick={() => removeStop(i)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                )}
              </div>
              <div className="flex gap-1">
                <input type="color" value={s.color.startsWith("#") ? s.color : "#000000"}
                  onChange={e => updateStop(i, { color: e.target.value })} className="w-7 h-7 rounded border border-gray-200 cursor-pointer p-0 flex-shrink-0" />
                <input type="text" value={s.color} onChange={e => updateStop(i, { color: e.target.value })}
                  className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:border-indigo-400 min-w-0" />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-400 w-12 flex-shrink-0">Posição</span>
                <input type="range" min={0} max={100} value={s.pos} onChange={e => updateStop(i, { pos: +e.target.value })} className="flex-1 accent-indigo-600" />
                <span className="text-xs text-gray-400 w-7 text-right">{s.pos}%</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-400 w-12 flex-shrink-0">Opac.</span>
                <input type="range" min={0} max={1} step={0.01} value={s.opacity} onChange={e => updateStop(i, { opacity: +e.target.value })} className="flex-1 accent-indigo-600" />
                <span className="text-xs text-gray-400 w-7 text-right">{Math.round(s.opacity*100)}%</span>
              </div>
            </div>
          ))}
          <button onClick={addStop} className="w-full py-1.5 border border-dashed border-gray-300 text-gray-400 rounded-lg text-xs hover:border-indigo-300 hover:text-indigo-500 transition">
            + Adicionar cor
          </button>
        </div>
      )}
    </div>
  );
}

function SliderRow({ label, value, min, max, step = 1, unit = "", onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex justify-between mb-1"><p className="text-xs text-gray-400">{label}</p><span className="text-xs text-gray-500">{value}{unit}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)} className="w-full accent-indigo-600" />
    </div>
  );
}

function NumRow({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <p className="text-xs text-gray-400 w-20 flex-shrink-0">{label}</p>
      <input type="number" value={value} min={min} max={max} onChange={e => onChange(+e.target.value)}
        className="flex-1 px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-indigo-400" />
    </div>
  );
}

function Sec({ title }: { title: string }) {
  return <p className="text-xs font-semibold text-gray-600 pt-2 border-t border-gray-100">{title}</p>;
}

function applyGradient(fc: any, obj: any, g: { stops: {color:string;opacity:number;pos:number}[]; angle: number }) {
  const fabric = (window as any).fabric;
  const rad = (g.angle * Math.PI) / 180;
  const w = (obj.width || 100) * (obj.scaleX || 1);
  const h = (obj.height || 100) * (obj.scaleY || 1);
  const x1 = (Math.cos(rad + Math.PI) + 1) / 2 * w;
  const y1 = (Math.sin(rad + Math.PI) + 1) / 2 * h;
  const x2 = (Math.cos(rad) + 1) / 2 * w;
  const y2 = (Math.sin(rad) + 1) / 2 * h;
  const colorStops = g.stops.map(s => {
    const hex = s.color.startsWith("#") ? s.color : "#000000";
    const r = parseInt(hex.slice(1,3),16), gr = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return { offset: s.pos/100, color: `rgba(${r},${gr},${b},${s.opacity})` };
  });
  const gradient = new fabric.Gradient({ type: "linear", coords: { x1, y1, x2, y2 }, colorStops });
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

  const [canvasWidth, setCanvasWidth] = useState(fmt.w);
  const [canvasHeight, setCanvasHeight] = useState(fmt.h);
  const [inputWidth, setInputWidth] = useState(String(fmt.w));
  const [inputHeight, setInputHeight] = useState(String(fmt.h));
  const [brushSize, setBrushSize] = useState(4);
  const [brushColor, setBrushColor] = useState("#000000");

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasElRef = useRef<HTMLElement | null>(null);
  const fc = useRef<any>(null);
  const isEditingNodesRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const clipboardRef = useRef<any>(null);
  const selectedNodeRef = useRef<any>(null);
  const historyRef = useRef<{ undo: string[]; redo: string[] }>({ undo: [], redo: [] });
  const savingHistory = useRef(false);
  const blurOriginMap = useRef<Map<string, string>>(new Map());
  const blurValueMap  = useRef<Map<string, number>>(new Map());
  const blurPosMap    = useRef<Map<string, {left:number;top:number;scaleX:number;scaleY:number;angle:number}>>(new Map());
  const blurTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rectBeforeScale = useRef<{ rx: number; ry: number } | null>(null);

  const [showGradientMask, setShowGradientMask] = useState(false);
  const [gradMaskC1, setGradMaskC1] = useState("#000000");
  const [gradMaskA1, setGradMaskA1] = useState(1);
  const [gradMaskC2, setGradMaskC2] = useState("#000000");
  const [gradMaskA2, setGradMaskA2] = useState(0);
  const [gradMaskAngle, setGradMaskAngle] = useState(180);
  const [gradMaskP1, setGradMaskP1] = useState(0);
  const [gradMaskP2, setGradMaskP2] = useState(100);
  const [gradMaskType, setGradMaskType] = useState<"linear"|"radial">("linear");

  const [site, setSite] = useState<Site | null>(null);
  const [fabricLoaded, setFabricLoaded] = useState(false);
  const [openTypeLoaded, setOpenTypeLoaded] = useState(false);
  const [paperLoaded, setPaperLoaded] = useState(false);
  const [converting, setConverting] = useState(false);
  const [removingBg, setRemovingBg] = useState(false);
  const [rmbgProgress, setRmbgProgress] = useState("");
  const rmbgWorker = useRef<Worker | null>(null);
  const [artName, setArtName] = useState("Minha arte");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [layers, setLayers] = useState<{ id: string; label: string; locked: boolean }[]>([]);
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [activeTool, setActiveTool] = useState<"select"|"pen"|"brush">("select");
  const activeToolRef = useRef<"select"|"pen"|"brush">("select");

  const penPoints = useRef<{x:number;y:number}[]>([]);
  const penLines = useRef<any[]>([]);
  const penDots = useRef<any[]>([]);
  const penCurveHandles = useRef<{x:number;y:number}[][]>([]);
  const isPenDragging = useRef(false);
  const activeHandleLine = useRef<any>(null);
  const lastFinalizedPath = useRef<any>(null);
  const finalizePenRef = useRef<(close:boolean)=>void>(() => {});
  const cancelPenRef = useRef<()=>void>(() => {});
  const undoLastPenPointRef = useRef<()=>void>(() => {});

  const [isEditingNodes, setIsEditingNodes] = useState(false);
  const editingData = useRef<{
    originalPathObj: any;
    commands: any[];
    helpers: any[];
    handleLines: any[];
    previewObj: any;
  } | null>(null);

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
  const [selTextAlign, setSelTextAlign] = useState<string>("left");
  const [selCharSpacing, setSelCharSpacing] = useState(0);
  const [selLineHeight, setSelLineHeight] = useState(1.2);
  const [selTextWidth, setSelTextWidth] = useState(300);
  const [selTextHeight, setSelTextHeight] = useState(0);
  const [selFillGradient, setSelFillGradient] = useState<{stops:{color:string;opacity:number;pos:number}[];angle:number}|null>(null);

  // Pixel editor
  const [pixelEditMode, setPixelEditMode] = useState(false);
  const [pixelTool, setPixelTool] = useState<"eraser"|"stamp"|"lasso">("eraser");
  const [pixelBrushSize, setPixelBrushSize] = useState(20);
  const [pixelSoftness, setPixelSoftness] = useState(0); // 0=hard, 1=soft
  const pixelSnapshotRef = useRef<ImageData|null>(null); // snapshot before brush stroke
  const pixelCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pixelEditImgRef = useRef<any>(null);
  const pixelOrigSrcRef = useRef<string>("");
  const stampSourceRef = useRef<{x:number;y:number}|null>(null);
  const lassoPointsRef = useRef<{x:number;y:number}[]>([]);
  const lassoActiveRef = useRef(false);
  const pixelDrawingRef = useRef(false);
  const [lassoSelected, setLassoSelected] = useState(false); // true = has active selection
  const lassoSelectionRef = useRef<{x:number;y:number}[]>([]); // closed lasso selection
  const pixelUndoStack = useRef<ImageData[]>([]); // undo history for pixel editor

  const [bgSolid, setBgSolid] = useState("#ffffff");
  const [bgGradient, setBgGradient] = useState<{stops:{color:string;opacity:number;pos:number}[];angle:number}|null>(null);

  const fitCanvasToScreen = useCallback(() => {
    if (!canvasContainerRef.current) return;
    const container = canvasContainerRef.current;
    const padding = 64;
    const availW = Math.max(200, container.clientWidth - padding);
    const availH = Math.max(200, container.clientHeight - padding);

    const fitRatio = Math.min(availW / canvasWidth, availH / canvasHeight, 1);
    const autoZoom = Math.max(10, Math.round(fitRatio * 100));
    setZoom(autoZoom);
  }, [canvasWidth, canvasHeight]);

  useEffect(() => {
    fitCanvasToScreen();
  }, [fitCanvasToScreen]);

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

    const paperScript = document.createElement("script");
    paperScript.src = "https://cdnjs.cloudflare.com/ajax/libs/paper.js/0.12.18/paper-full.min.js";
    paperScript.onload = () => setPaperLoaded(true);
    document.head.appendChild(paperScript);

    try {
      const worker = new Worker("/rmbg-worker.js", { type: "module" });
      worker.postMessage({ type: "preload" });
      rmbgWorker.current = worker;
    } catch {}

    return () => {
      try { document.head.removeChild(script); } catch {}
      try { document.head.removeChild(otScript); } catch {}
      try { document.head.removeChild(paperScript); } catch {}
    };
  }, []);

  const refreshLayers = (canvas: any) => {
    try {
      const objs = canvas.getObjects().filter((o: any) => !o.isControlHelper && !o.isEditPreview);
      setLayers([...objs].reverse().map((o: any) => ({
        id: o.__uid || (o.__uid = Math.random().toString(36).slice(2)),
        label: o.type === "i-text" ? `T "${(o.text||"").slice(0,12)}"` : o.type === "image" ? (o.clipPath ? "Imagem (Máscara)" : "Imagem") : o.type === "rect" ? "Retângulo" : o.type === "circle" ? "Círculo" : o.type === "triangle" ? "Triângulo" : o.type === "line" ? "Linha" : o.type === "path" ? "Vetor" : o.type,
        locked: !!o.lockMovementX,
      })));
    } catch {}
  };

  const syncSel = (obj: any) => {
    if (!obj || obj.isControlHelper || obj.isEditPreview) {
      setSel(null);
      setSelectedUids([]);
      return;
    }
    setSel(obj);

    if (obj.type === "activeSelection") {
      const uids = (obj as any).getObjects().map((o: any) => o.__uid || (o.__uid = Math.random().toString(36).slice(2)));
      setSelectedUids(uids);
      return;
    }

    const singleUid = obj.__uid || (obj.__uid = Math.random().toString(36).slice(2));
    setSelectedUids([singleUid]);

    setSelFill(getObjColor(obj));
    setSelOpacity(Math.round((obj.opacity ?? 1) * 100));
    setSelStroke(obj.stroke || "#000000");
    setSelStrokeW(obj.strokeWidth || 0);
    setSelRadius(obj.rx || 0);
    setSelRotation(Math.round(obj.angle || 0));
    setSelFontSize(Math.round(obj.fontSize || 48));
    setSelFontFamily(obj.fontFamily || "Montserrat");
    setSelBold(obj.fontWeight === "bold");
    setSelItalic(obj.fontStyle === "italic");
    setSelUnderline(!!obj.underline);
    setSelTextAlign(obj.textAlign || "left");
    setSelCharSpacing(obj.charSpacing ?? 0);
    setSelLineHeight(obj.lineHeight ?? 1.2);
    if (obj.type === "textbox") {
      setSelTextWidth(Math.round(obj.width || 300));
      setSelTextHeight(obj.__fixedHeight ? Math.round(obj.height) : 0);
    }
    const sh = obj.shadow;
    setSelShadow(!!sh);
    if (sh) { setSelShadowColor(sh.color||"rgba(0,0,0,0.5)"); setSelShadowBlur(sh.blur||10); setSelShadowX(sh.offsetX||5); setSelShadowY(sh.offsetY||5); }
    const uid = obj.__uid;
    setSelBlur(uid && blurValueMap.current.has(uid) ? blurValueMap.current.get(uid)! : 0);
    const satFilter = (obj.filters||[]).find((f: any) => f.type === "Saturation");
    setSelSaturation(satFilter ? (satFilter.saturation ?? 0) : 0);
    if (obj.__gradMask) {
      const m = obj.__gradMask;
      setGradMaskC1(m.c1); setGradMaskA1(m.a1);
      setGradMaskC2(m.c2); setGradMaskA2(m.a2);
      setGradMaskAngle(m.angle);
      setGradMaskP1(m.p1 ?? 0);
      setGradMaskP2(m.p2 ?? 100);
      setGradMaskType(m.type ?? "linear");
      setShowGradientMask(true);
    } else {
      setShowGradientMask(false);
    }
    const fill = obj.fill;
    if (fill && fill.colorStops) {
      const stops = fill.colorStops.map((s: any) => ({ color: s.color || "#000", opacity: 1, pos: Math.round((s.offset||0)*100) }));
      setSelFillGradient({ stops, angle: 90 });
    } else { setSelFillGradient(null); }
  };


  // ── Pixel editor ────────────────────────────────────────────────
  const enterPixelEdit = (imgObj: any) => {
    if (!fc.current || !imgObj || imgObj.type !== "image") return;
    pixelEditImgRef.current = imgObj;
    const imgEl = imgObj._element as HTMLImageElement;
    const origC = document.createElement("canvas");
    origC.width  = imgEl.naturalWidth  || imgObj.width;
    origC.height = imgEl.naturalHeight || imgObj.height;
    origC.getContext("2d")!.drawImage(imgEl, 0, 0);
    pixelOrigSrcRef.current = origC.toDataURL("image/png");
    imgObj.opacity = 0;
    fc.current.discardActiveObject();
    fc.current.requestRenderAll();
    setPixelEditMode(true);
  };

  const exitPixelEdit = (save = true) => {
    const imgObj = pixelEditImgRef.current;
    const pCanvas = pixelCanvasRef.current;
    if (!fc.current || !imgObj) { setPixelEditMode(false); return; }
    if (save && pCanvas) {
      const fabric = (window as any).fabric;
      const dataURL = pCanvas.toDataURL("image/png");
      const left = imgObj.left; const top = imgObj.top;
      const scaleX = imgObj.scaleX || 1; const scaleY = imgObj.scaleY || 1;
      const angle = imgObj.angle || 0; const uid = imgObj.__uid;
      fc.current.remove(imgObj);
      fabric.Image.fromURL(dataURL, (img: any) => {
        img.set({ left, top, scaleX, scaleY, angle, strokeUniform: true });
        img.__uid = uid;
        fc.current.add(img);
        fc.current.setActiveObject(img);
        syncSel(img);
        fc.current.requestRenderAll();
      });
    } else {
      imgObj.opacity = 1;
      fc.current.setActiveObject(imgObj);
      fc.current.requestRenderAll();
    }
    setPixelEditMode(false);
    pixelEditImgRef.current = null;
    stampSourceRef.current = null;
    lassoPointsRef.current = [];
    lassoSelectionRef.current = [];
    lassoActiveRef.current = false;
    pixelUndoStack.current = [];
    setLassoSelected(false);
  };

  const deleteSelected = () => {
    if (!fc.current) return;
    const canvas = fc.current;
    const active = canvas.getActiveObject();
    if (!active) return;

    if (active.type === "activeSelection") {
      const objects = (active as any).getObjects();
      canvas.discardActiveObject();
      objects.forEach((o: any) => {
        if (!o.lockMovementX && !o.isControlHelper) canvas.remove(o);
      });
    } else {
      if (!active.lockMovementX && !active.isControlHelper) canvas.remove(active);
    }

    canvas.requestRenderAll();
    syncSel(null);
    refreshLayers(canvas);
  };

  const applyGradientMask = () => {
    if (!fc.current || !sel || sel.type !== "image") return;
    const fabric = (window as any).fabric;
    const imgEl = (sel as any)._element as HTMLImageElement;
    if (!sel.__originalSrc) {
      const origCanvas = document.createElement("canvas");
      origCanvas.width = imgEl.naturalWidth || sel.width;
      origCanvas.height = imgEl.naturalHeight || sel.height;
      const origCtx = origCanvas.getContext("2d")!;
      origCtx.drawImage(imgEl, 0, 0);
      sel.__originalSrc = origCanvas.toDataURL("image/png");
    }
    sel.__gradMask = { c1: gradMaskC1, a1: gradMaskA1, c2: gradMaskC2, a2: gradMaskA2, angle: gradMaskAngle, p1: gradMaskP1, p2: gradMaskP2, type: gradMaskType };
    const origImg = new Image();
    origImg.onload = () => {
      const w = origImg.naturalWidth;
      const h = origImg.naturalHeight;
      const tmpCanvas = document.createElement("canvas");
      tmpCanvas.width = w; tmpCanvas.height = h;
      const ctx = tmpCanvas.getContext("2d")!;
      ctx.drawImage(origImg, 0, 0, w, h);
      const gradCanvas = document.createElement("canvas");
      gradCanvas.width = w; gradCanvas.height = h;
      const gCtx = gradCanvas.getContext("2d")!;
      const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0");
      let grad: CanvasGradient;
      if (gradMaskType === "radial") {
        const cx = w / 2; const cy = h / 2;
        const r = Math.max(w, h) / 2;
        grad = gCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
      } else {
        const rad = (gradMaskAngle * Math.PI) / 180;
        const x1 = (Math.cos(rad + Math.PI) + 1) / 2 * w;
        const y1 = (Math.sin(rad + Math.PI) + 1) / 2 * h;
        const x2 = (Math.cos(rad) + 1) / 2 * w;
        const y2 = (Math.sin(rad) + 1) / 2 * h;
        grad = gCtx.createLinearGradient(x1, y1, x2, y2);
      }
      grad.addColorStop(gradMaskP1 / 100, `${gradMaskC1}${toHex(gradMaskA1)}`);
      grad.addColorStop(gradMaskP2 / 100, `${gradMaskC2}${toHex(gradMaskA2)}`);
      gCtx.fillStyle = grad;
      gCtx.fillRect(0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      const gradData = gCtx.getImageData(0, 0, w, h).data;
      for (let i = 3; i < data.length; i += 4) {
        data[i] = Math.round(data[i] * (gradData[i] / 255));
      }
      ctx.putImageData(imageData, 0, 0);
      const dataURL = tmpCanvas.toDataURL("image/png");
      const left = sel.left; const top = sel.top;
      const scaleX = sel.scaleX || 1; const scaleY = sel.scaleY || 1;
      const angle = sel.angle || 0;
      const uid = sel.__uid;
      const originalSrc = sel.__originalSrc;
      const gradMask = sel.__gradMask;
      fc.current.remove(sel);
      fabric.Image.fromURL(dataURL, (img: any) => {
        img.set({ left, top, scaleX, scaleY, angle, strokeUniform: true });
        img.__uid = uid;
        img.__originalSrc = originalSrc;
        img.__gradMask = gradMask;
        fc.current.add(img);
        fc.current.setActiveObject(img);
        syncSel(img);
        fc.current.requestRenderAll();
      });
    };
    origImg.src = sel.__originalSrc;
  };

  const removeGradientMask = () => {
    if (!fc.current || !sel || !sel.__originalSrc) return;
    const fabric = (window as any).fabric;
    const left = sel.left; const top = sel.top;
    const scaleX = sel.scaleX || 1; const scaleY = sel.scaleY || 1;
    const angle = sel.angle || 0;
    const uid = sel.__uid;
    const src = sel.__originalSrc;
    fc.current.remove(sel);
    fabric.Image.fromURL(src, (img: any) => {
      img.set({ left, top, scaleX, scaleY, angle, strokeUniform: true });
      img.__uid = uid;
      fc.current.add(img);
      fc.current.setActiveObject(img);
      syncSel(img);
      fc.current.requestRenderAll();
    });
  };

  const applyBooleanOperation = (operation: "unite" | "subtract" | "intersect" | "exclude") => {
    if (!fc.current || !sel || sel.type !== "activeSelection") return;
    const paper = (window as any).paper;
    if (!paper) {
      alert("Biblioteca vetorial ainda carregando, tente novamente.");
      return;
    }

    const canvas = fc.current;
    const activeSel = sel;
    const fabric = (window as any).fabric;

    const objects = [...(activeSel as any).getObjects()];
    canvas.discardActiveObject();
    canvas.requestRenderAll();

    const paperCanvas = document.createElement("canvas");
    paperCanvas.width = canvasWidth;
    paperCanvas.height = canvasHeight;
    paper.setup(paperCanvas);

    const fabricObjectToPaperPath = (obj: any): any => {
      const matrix = obj.calcTransformMatrix();
      let pathData = "";

      if (obj.type === "rect") {
        const w = obj.width;
        const h = obj.height;
        const rx = Math.min(obj.rx || 0, w / 2);
        const ry = Math.min(obj.ry || 0, h / 2);

        if (rx > 0 || ry > 0) {
          pathData = `M ${-w/2 + rx} ${-h/2} ` +
                     `L ${w/2 - rx} ${-h/2} Q ${w/2} ${-h/2} ${w/2} ${-h/2 + ry} ` +
                     `L ${w/2} ${h/2 - ry} Q ${w/2} ${h/2} ${w/2 - rx} ${h/2} ` +
                     `L ${-w/2 + rx} ${h/2} Q ${-w/2} ${h/2} ${-w/2} ${h/2 - ry} ` +
                     `L ${-w/2} ${-h/2 + ry} Q ${-w/2} ${-h/2} ${-w/2 + rx} ${-h/2} Z`;
        } else {
          pathData = `M ${-w/2} ${-h/2} L ${w/2} ${-h/2} L ${w/2} ${h/2} L ${-w/2} ${h/2} Z`;
        }
      } else if (obj.type === "circle") {
        const r = obj.radius;
        const k = 0.5522847498;
        pathData = `M ${0} ${-r} ` +
                   `C ${r * k} ${-r} ${r} ${-r * k} ${r} 0 ` +
                   `C ${r} ${r * k} ${r * k} ${r} 0 ${r} ` +
                   `C ${-r * k} ${r} ${-r} ${r * k} ${-r} 0 ` +
                   `C ${-r} ${-r * k} ${-r * k} ${-r} 0 ${-r} Z`;
      } else if (obj.type === "triangle") {
        const w = obj.width;
        const h = obj.height;
        pathData = `M 0 ${-h/2} L ${w/2} ${h/2} L ${-w/2} ${h/2} Z`;
      } else if (obj.type === "polygon" && obj.points) {
        const pts = obj.points;
        const poX = obj.pathOffset ? obj.pathOffset.x : 0;
        const poY = obj.pathOffset ? obj.pathOffset.y : 0;
        pathData = `M ${pts[0].x - poX} ${pts[0].y - poY} ` +
                   pts.slice(1).map((p: any) => `L ${p.x - poX} ${p.y - poY}`).join(" ") + " Z";
      } else if (obj.type === "path" && obj.path) {
        const poX = obj.pathOffset ? obj.pathOffset.x : 0;
        const poY = obj.pathOffset ? obj.pathOffset.y : 0;
        let d = "";
        obj.path.forEach((c: any[]) => {
          if (c[0] === "M" || c[0] === "L") d += `${c[0]} ${c[1] - poX} ${c[2] - poY} `;
          else if (c[0] === "C") d += `C ${c[1] - poX} ${c[2] - poY} ${c[3] - poX} ${c[4] - poY} ${c[5] - poX} ${c[6] - poY} `;
          else if (c[0] === "Z" || c[0] === "z") d += `Z `;
        });
        pathData = d;
      }

      if (!pathData) return null;

      const pPath = new paper.Path(pathData);
      pPath.transform(new paper.Matrix(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]));
      return pPath;
    };

    try {
      const paperItems: any[] = [];
      objects.forEach(obj => {
        const p = fabricObjectToPaperPath(obj);
        if (p) paperItems.push(p);
      });

      if (paperItems.length < 2) {
        canvas.setActiveObject(new fabric.ActiveSelection(objects, { canvas }));
        canvas.requestRenderAll();
        return;
      }

      let result = paperItems[0];
      for (let i = 1; i < paperItems.length; i++) {
        if (operation === "unite") result = result.unite(paperItems[i]);
        else if (operation === "subtract") result = result.subtract(paperItems[i]);
        else if (operation === "intersect") result = result.intersect(paperItems[i]);
        else if (operation === "exclude") result = result.exclude(paperItems[i]);
      }

      if (!result || !result.pathData) {
        canvas.setActiveObject(new fabric.ActiveSelection(objects, { canvas }));
        canvas.requestRenderAll();
        return;
      }

      const finalPathData = result.pathData;
      const baseFill = objects[0].fill || "#3b82f6";
      const baseStroke = objects[0].stroke || "#000000";
      const baseStrokeWidth = objects[0].strokeWidth || 0;

      const newPath = new fabric.Path(finalPathData, {
        fill: baseFill,
        stroke: baseStroke,
        strokeWidth: baseStrokeWidth,
        strokeUniform: true,
      });
      newPath.__uid = Math.random().toString(36).slice(2);

      objects.forEach(o => canvas.remove(o));
      canvas.add(newPath);
      canvas.setActiveObject(newPath);
      syncSel(newPath);
      refreshLayers(canvas);
      canvas.requestRenderAll();
    } catch (err) {
      console.error("Erro na operação booleana:", err);
      canvas.setActiveObject(new fabric.ActiveSelection(objects, { canvas }));
      canvas.requestRenderAll();
    }
  };

  const exitEditNodes = () => {
    if (!fc.current || !editingData.current) return;
    const canvas = fc.current;
    const fabric = (window as any).fabric;
    const { originalPathObj, commands, helpers, handleLines, previewObj } = editingData.current;

    helpers.forEach(h => canvas.remove(h));
    handleLines.forEach(l => canvas.remove(l));
    if (previewObj) canvas.remove(previewObj);

    canvas.defaultCursor = "default";
    canvas.hoverCursor = "move";
    canvas.selection = true;

    let d = "";
    commands.forEach(c => {
      if (c.type === "M") d += `M ${c.x} ${c.y} `;
      else if (c.type === "L") d += `L ${c.x} ${c.y} `;
      else if (c.type === "C") d += `C ${c.cp1x} ${c.cp1y} ${c.cp2x} ${c.cp2y} ${c.x} ${c.y} `;
      else if (c.type === "Z") d += `Z `;
    });

    const newPath = new fabric.Path(d.trim(), {
      fill: originalPathObj.fill,
      stroke: originalPathObj.stroke,
      strokeWidth: originalPathObj.strokeWidth,
      strokeUniform: originalPathObj.strokeUniform ?? true,
      opacity: 1,
    });
    newPath.__uid = originalPathObj.__uid;

    const idx = canvas.getObjects().indexOf(originalPathObj);
    canvas.remove(originalPathObj);
    if (idx >= 0) canvas.insertAt(newPath, idx, false);
    else canvas.add(newPath);

    canvas.setActiveObject(newPath);
    syncSel(newPath);
    editingData.current = null;
    setIsEditingNodes(false);
    isEditingNodesRef.current = false;
    canvas.requestRenderAll();
    refreshLayers(canvas);
  };

  const renderEditControls = () => {
    if (!editingData.current || !fc.current) return;
    const canvas = fc.current;
    const fabric = (window as any).fabric;
    const { commands, helpers, handleLines, previewObj, originalPathObj } = editingData.current;

    helpers.forEach((h: any) => canvas.remove(h));
    handleLines.forEach((l: any) => canvas.remove(l));
    if (previewObj) canvas.remove(previewObj);

    const newHelpers: any[] = [];
    const newHandleLines: any[] = [];
    let currentPreview: any = null;

    const updatePreview = () => {
      if (currentPreview) canvas.remove(currentPreview);
      let d = "";
      commands.forEach(c => {
        if (c.type === "M") d += `M ${c.x} ${c.y} `;
        else if (c.type === "L") d += `L ${c.x} ${c.y} `;
        else if (c.type === "C") d += `C ${c.cp1x} ${c.cp1y} ${c.cp2x} ${c.cp2y} ${c.x} ${c.y} `;
        else if (c.type === "Z") d += `Z `;
      });
      currentPreview = new fabric.Path(d.trim(), {
        fill: originalPathObj.fill,
        stroke: originalPathObj.stroke || "#000000",
        strokeWidth: originalPathObj.strokeWidth || 2,
        strokeUniform: true,
        selectable: false,
        evented: false,
        isEditPreview: true,
      });
      currentPreview.set({
        left: currentPreview.pathOffset.x - (currentPreview.width / 2),
        top: currentPreview.pathOffset.y - (currentPreview.height / 2),
      });
      canvas.add(currentPreview);
      canvas.sendToBack(currentPreview);
      canvas.sendToBack(originalPathObj);
      if (editingData.current) editingData.current.previewObj = currentPreview;
      canvas.requestRenderAll();
    };

    commands.forEach((cmd, idx) => {
      if (cmd.type === "M" || cmd.type === "L") {
        const node = new fabric.Circle({
          left: cmd.x, top: cmd.y, radius: 5, fill: "#ffffff", stroke: "#4f46e5", strokeWidth: 2,
          originX: "center", originY: "center", hasControls: false, hasBorders: false, isControlHelper: true
        });
        node.__cmd = cmd;
        node.on("selected", () => {
          selectedNodeRef.current = node;
          node.set({ fill: "#4f46e5" });
          canvasElRef.current?.focus();
          canvas.requestRenderAll();
        });
        node.on("deselected", () => {
          node.set({ fill: "#ffffff" });
          canvas.requestRenderAll();
        });
        node.on("moving", () => {
          const dx = node.left - cmd.x;
          const dy = node.top - cmd.y;
          cmd.x = node.left;
          cmd.y = node.top;

          const nextCmd = commands[idx + 1];
          if (nextCmd && nextCmd.type === "C") {
            nextCmd.cp1x += dx;
            nextCmd.cp1y += dy;
            const nextCp1Node = newHelpers.find(h => h.__cmd === nextCmd && h.__isCp1);
            if (nextCp1Node) nextCp1Node.set({ left: nextCmd.cp1x, top: nextCmd.cp1y });
          }
          updatePreview();
        });
        newHelpers.push(node);
        canvas.add(node);
      } else if (cmd.type === "C") {
        const prevCmd = commands[idx - 1];
        const line1 = new fabric.Line([prevCmd ? prevCmd.x : cmd.cp1x, prevCmd ? prevCmd.y : cmd.cp1y, cmd.cp1x, cmd.cp1y], {
          stroke: "#6366f1", strokeWidth: 1.2, strokeDashArray: [3, 3], selectable: false, evented: false, isControlHelper: true
        });
        const line2 = new fabric.Line([cmd.x, cmd.y, cmd.cp2x, cmd.cp2y], {
          stroke: "#6366f1", strokeWidth: 1.2, strokeDashArray: [3, 3], selectable: false, evented: false, isControlHelper: true
        });
        cmd.__line1 = line1;
        cmd.__line2 = line2;
        newHandleLines.push(line1, line2);
        canvas.add(line1);
        canvas.add(line2);

        const nodeCp1 = new fabric.Circle({ left: cmd.cp1x, top: cmd.cp1y, radius: 4, fill: "#ef4444", stroke: "#ffffff", strokeWidth: 1.5, originX: "center", originY: "center", hasControls: false, hasBorders: false, isControlHelper: true });
        const nodeCp2 = new fabric.Circle({ left: cmd.cp2x, top: cmd.cp2y, radius: 4, fill: "#ef4444", stroke: "#ffffff", strokeWidth: 1.5, originX: "center", originY: "center", hasControls: false, hasBorders: false, isControlHelper: true });
        const nodeEnd = new fabric.Circle({ left: cmd.x, top: cmd.y, radius: 5, fill: "#ffffff", stroke: "#4f46e5", strokeWidth: 2, originX: "center", originY: "center", hasControls: false, hasBorders: false, isControlHelper: true });

        nodeCp1.__cmd = cmd;
        nodeCp1.__isCp1 = true;
        nodeCp2.__cmd = cmd;
        nodeCp2.__isCp2 = true;
        nodeEnd.__cmd = cmd;

        nodeCp1.on("selected", () => { selectedNodeRef.current = nodeCp1; canvasElRef.current?.focus(); });
        nodeCp2.on("selected", () => { selectedNodeRef.current = nodeCp2; canvasElRef.current?.focus(); });
        nodeEnd.on("selected", () => {
          selectedNodeRef.current = nodeEnd;
          nodeEnd.set({ fill: "#4f46e5" });
          canvasElRef.current?.focus();
          canvas.requestRenderAll();
        });
        nodeEnd.on("deselected", () => {
          nodeEnd.set({ fill: "#ffffff" });
          canvas.requestRenderAll();
        });

        nodeCp1.on("moving", () => {
          cmd.cp1x = nodeCp1.left;
          cmd.cp1y = nodeCp1.top;
          const anchorX = prevCmd ? prevCmd.x : cmd.cp1x;
          const anchorY = prevCmd ? prevCmd.y : cmd.cp1y;
          line1.set({ x1: anchorX, y1: anchorY, x2: nodeCp1.left, y2: nodeCp1.top });
          updatePreview();
        });

        nodeCp2.on("moving", () => {
          cmd.cp2x = nodeCp2.left;
          cmd.cp2y = nodeCp2.top;
          line2.set({ x1: cmd.x, y1: cmd.y, x2: nodeCp2.left, y2: nodeCp2.top });
          updatePreview();
        });

        nodeEnd.on("moving", () => {
          const dx = nodeEnd.left - cmd.x;
          const dy = nodeEnd.top - cmd.y;
          cmd.x = nodeEnd.left;
          cmd.y = nodeEnd.top;

          cmd.cp2x += dx;
          cmd.cp2y += dy;
          nodeCp2.set({ left: cmd.cp2x, top: cmd.cp2y });
          line2.set({ x1: nodeEnd.left, y1: nodeEnd.top, x2: nodeCp2.left, y2: nodeCp2.top });

          const nextCmd = commands[idx + 1];
          if (nextCmd && nextCmd.type === "C") {
            nextCmd.cp1x += dx;
            nextCmd.cp1y += dy;
            const nextCp1Node = newHelpers.find(h => h.__cmd === nextCmd && h.__isCp1);
            if (nextCp1Node) nextCp1Node.set({ left: nextCmd.cp1x, top: nextCmd.cp1y });
            if (nextCmd.__line1) {
              nextCmd.__line1.set({ x1: nodeEnd.left, y1: nodeEnd.top, x2: nextCmd.cp1x, y2: nextCmd.cp1y });
            }
          }
          updatePreview();
        });

        newHelpers.push(nodeCp1, nodeCp2, nodeEnd);
        canvas.add(nodeCp1);
        canvas.add(nodeCp2);
        canvas.add(nodeEnd);
      }
    });

    editingData.current.helpers = newHelpers;
    editingData.current.handleLines = newHandleLines;
    updatePreview();
  };

  const enterEditNodes = (pathObj: any) => {
    console.log("enterEditNodes — type:", pathObj?.type, "toSVG:", pathObj?.toSVG?.()?.slice(0, 100));
    if (!fc.current || !pathObj) return;
    const canvas = fc.current;
    const fabric = (window as any).fabric;

    // Se não é path, converte para path primeiro
    if (pathObj.type !== "path") {
      // Converte forma para path via pathFromElement
      const svgString = pathObj.toSVG();

      const parser = new DOMParser();
      const doc = parser.parseFromString(`<svg>${svgString}</svg>`, "image/svg+xml");
      
      // Tenta achar qualquer elemento com pontos de forma
      const rect = doc.querySelector("rect");
      const circle = doc.querySelector("circle");
      const polygon = doc.querySelector("polygon");
      const ellipse = doc.querySelector("ellipse");
      
      let d = "";
      if (rect) {
        const x = parseFloat(rect.getAttribute("x") || "0");
        const y = parseFloat(rect.getAttribute("y") || "0");
        const w = parseFloat(rect.getAttribute("width") || "0");
        const h = parseFloat(rect.getAttribute("height") || "0");
        const rx = parseFloat(rect.getAttribute("rx") || "0");
        if (rx > 0) {
          d = `M ${x+rx} ${y} L ${x+w-rx} ${y} Q ${x+w} ${y} ${x+w} ${y+rx} L ${x+w} ${y+h-rx} Q ${x+w} ${y+h} ${x+w-rx} ${y+h} L ${x+rx} ${y+h} Q ${x} ${y+h} ${x} ${y+h-rx} L ${x} ${y+rx} Q ${x} ${y} ${x+rx} ${y} Z`;
        } else {
          d = `M ${x} ${y} L ${x+w} ${y} L ${x+w} ${y+h} L ${x} ${y+h} Z`;
        }
      } else if (circle) {
        const cx = parseFloat(circle.getAttribute("cx") || "0");
        const cy = parseFloat(circle.getAttribute("cy") || "0");
        const r = parseFloat(circle.getAttribute("r") || "0");
        const k = 0.5522848;
        d = `M ${cx} ${cy-r} C ${cx+r*k} ${cy-r} ${cx+r} ${cy-r*k} ${cx+r} ${cy} C ${cx+r} ${cy+r*k} ${cx+r*k} ${cy+r} ${cx} ${cy+r} C ${cx-r*k} ${cy+r} ${cx-r} ${cy+r*k} ${cx-r} ${cy} C ${cx-r} ${cy-r*k} ${cx-r*k} ${cy-r} ${cx} ${cy-r} Z`;
      } else if (ellipse) {
        const cx = parseFloat(ellipse.getAttribute("cx") || "0");
        const cy = parseFloat(ellipse.getAttribute("cy") || "0");
        const rx2 = parseFloat(ellipse.getAttribute("rx") || "0");
        const ry2 = parseFloat(ellipse.getAttribute("ry") || "0");
        const k = 0.5522848;
        d = `M ${cx} ${cy-ry2} C ${cx+rx2*k} ${cy-ry2} ${cx+rx2} ${cy-ry2*k} ${cx+rx2} ${cy} C ${cx+rx2} ${cy+ry2*k} ${cx+rx2*k} ${cy+ry2} ${cx} ${cy+ry2} C ${cx-rx2*k} ${cy+ry2} ${cx-rx2} ${cy+ry2*k} ${cx-rx2} ${cy} C ${cx-rx2} ${cy-ry2*k} ${cx-rx2*k} ${cy-ry2} ${cx} ${cy-ry2} Z`;
      } else if (polygon) {
        const pts2 = (polygon.getAttribute("points") || "").trim().split(/\s+|,/).map(Number);
        for (let i = 0; i < pts2.length; i += 2) {
          d += `${i === 0 ? "M" : "L"} ${pts2[i]} ${pts2[i+1]} `;
        }
        d += "Z";
      }
      
      if (!d) { console.warn("Não foi possível converter forma para path"); return; }
      
      const newPath = new fabric.Path(d, {
        left: pathObj.left,
        top: pathObj.top,
        scaleX: pathObj.scaleX || 1,
        scaleY: pathObj.scaleY || 1,
        angle: pathObj.angle || 0,
        fill: pathObj.fill,
        stroke: pathObj.stroke,
        strokeWidth: pathObj.strokeWidth,
        strokeUniform: true,
        originX: pathObj.originX || "left",
        originY: pathObj.originY || "top",
      });
      newPath.__uid = pathObj.__uid;
      canvas.remove(pathObj);
      canvas.add(newPath);
      canvas.requestRenderAll();
      enterEditNodes(newPath);
      return;
    }

    setIsEditingNodes(true);
    isEditingNodesRef.current = true;
    console.log("path commands:", pathObj.path?.slice(0, 5));
    canvas.discardActiveObject();
    pathObj.opacity = 0.3;
    pathObj.selectable = false;
    pathObj.evented = false;
    canvas.defaultCursor = "default";
    canvas.hoverCursor = "move";
    canvas.selection = false;
    const matrix = pathObj.calcTransformMatrix();
    const parsedPath = pathObj.path;
    const commands: any[] = [];
    const poX = pathObj.pathOffset ? pathObj.pathOffset.x : 0;
    const poY = pathObj.pathOffset ? pathObj.pathOffset.y : 0;
    parsedPath.forEach((cmd: any[]) => {
      const type = cmd[0];
      if (type === "M" || type === "L") {
        const pt = fabric.util.transformPoint({ x: cmd[1] - poX, y: cmd[2] - poY }, matrix);
        commands.push({ type, x: pt.x, y: pt.y });
      } else if (type === "C") {
        const cp1 = fabric.util.transformPoint({ x: cmd[1] - poX, y: cmd[2] - poY }, matrix);
        const cp2 = fabric.util.transformPoint({ x: cmd[3] - poX, y: cmd[4] - poY }, matrix);
        const end = fabric.util.transformPoint({ x: cmd[5] - poX, y: cmd[6] - poY }, matrix);
        commands.push({ type: "C", cp1x: cp1.x, cp1y: cp1.y, cp2x: cp2.x, cp2y: cp2.y, x: end.x, y: end.y });
      } else if (type === "Q") {
        // Converte quadratic bezier para cubic (C) para compatibilidade com o editor
        const prevCmd = commands[commands.length - 1];
        const x0 = prevCmd?.x ?? 0;
        const y0 = prevCmd?.y ?? 0;
        const qp = fabric.util.transformPoint({ x: cmd[1] - poX, y: cmd[2] - poY }, matrix);
        const end = fabric.util.transformPoint({ x: cmd[3] - poX, y: cmd[4] - poY }, matrix);
        // Fórmula de conversão Q→C: cp1 = P0 + 2/3*(QP-P0), cp2 = P2 + 2/3*(QP-P2)
        commands.push({
          type: "C",
          cp1x: x0 + (2/3) * (qp.x - x0),
          cp1y: y0 + (2/3) * (qp.y - y0),
          cp2x: end.x + (2/3) * (qp.x - end.x),
          cp2y: end.y + (2/3) * (qp.y - end.y),
          x: end.x,
          y: end.y,
        });
      } else if (type === "Z" || type === "z") {
        commands.push({ type: "Z" });
      }
    });
    editingData.current = {
      originalPathObj: pathObj,
      commands,
      helpers: [],
      handleLines: [],
      previewObj: null,
    };
    renderEditControls();
  };

  const toggleNodeSmooth = () => {
    const node = selectedNodeRef.current;
    if (!node || !editingData.current) return;
    const { commands } = editingData.current;
    const cmd = commands.find((c: any) => c === node.__cmd);
    if (!cmd) return;

    if (cmd.type === "C") {
      const isSmooth = Math.hypot(cmd.cp2x - cmd.x, cmd.cp2y - cmd.y) > 2;
      if (isSmooth) {
        cmd.cp2x = cmd.x;
        cmd.cp2y = cmd.y;
      } else {
        cmd.cp2x = cmd.x + 35;
        cmd.cp2y = cmd.y;
      }
      renderEditControls();
    }
  };

  const deleteSelectedNode = () => {
    const node = selectedNodeRef.current;
    if (!node || !editingData.current) return;
    const { commands } = editingData.current;
    const cmdToRemove = node.__cmd;
    const idx = commands.findIndex((c: any) => c === cmdToRemove);
    if (idx <= 0) return;

    commands.splice(idx, 1);
    selectedNodeRef.current = null;
    renderEditControls();
  };

  const redrawPenCanvas = () => {
    if (!fc.current) return;
    const canvas = fc.current;
    const fabric = (window as any).fabric;
    const pts = penPoints.current;
    const handles = penCurveHandles.current;

    penDots.current.forEach(d => canvas.remove(d));
    penLines.current.forEach(l => canvas.remove(l));
    penDots.current = [];
    penLines.current = [];

    pts.forEach((pt, i) => {
      const dot = new fabric.Circle({
        left: pt.x, top: pt.y, radius: 4, originX: "center", originY: "center",
        fill: i === 0 ? "#22c55e" : "#4f46e5",
        stroke: "white", strokeWidth: 1.5,
        selectable: false, evented: false,
      });
      canvas.add(dot);
      penDots.current.push(dot);

      if (i > 0) {
        const prev = pts[i - 1];
        const prevH = handles[i - 1]?.[1] || prev;
        const currH = handles[i]?.[0] || pt;
        const curvePath = new fabric.Path(`M ${prev.x} ${prev.y} C ${prevH.x} ${prevH.y} ${currH.x} ${currH.y} ${pt.x} ${pt.y}`, {
          stroke: "#4f46e5", strokeWidth: 1.5, strokeDashArray: [4, 3], fill: "transparent",
          selectable: false, evented: false,
        });
        canvas.add(curvePath);
        penLines.current.push(curvePath);
      }
    });

    canvas.requestRenderAll();
  };

  const undoLastPenPoint = () => {
    if (!fc.current) return;
    const canvas = fc.current;

    if (lastFinalizedPath.current) {
      canvas.remove(lastFinalizedPath.current);
      lastFinalizedPath.current = null;
      activeToolRef.current = "pen";
      setActiveTool("pen");
      canvas.defaultCursor = "crosshair";
      canvas.hoverCursor = "crosshair";
      canvas.selection = false;
      redrawPenCanvas();
      return;
    }

    if (penPoints.current.length === 0) return;

    penPoints.current.pop();
    penCurveHandles.current.pop();

    const lastDot = penDots.current.pop();
    if (lastDot) canvas.remove(lastDot);

    const lastLine = penLines.current.pop();
    if (lastLine) canvas.remove(lastLine);

    if (activeHandleLine.current) {
      canvas.remove(activeHandleLine.current);
      activeHandleLine.current = null;
    }

    if (penPoints.current.length === 0) {
      cancelPen();
    } else {
      canvas.requestRenderAll();
    }
  };
  undoLastPenPointRef.current = undoLastPenPoint;

  useEffect(() => {
    // Quando pixelBrushSize muda, salva o estado atual antes do re-render
    if (pixelEditMode && pixelCanvasRef.current) {
      const el = pixelCanvasRef.current;
      const ctx = el.getContext("2d")!;
      pixelSnapshotRef.current = ctx.getImageData(0, 0, el.width, el.height);
    }
  }, [pixelBrushSize]);

  // Renderizador principal e controle de redimensionamento e Zoom
  useEffect(() => {
    if (!fabricLoaded || !canvasRef.current) return;
    const z = zoom / 100;
    const currentW = Math.round(canvasWidth * z);
    const currentH = Math.round(canvasHeight * z);

    if (!fc.current) {
      const canvas = new (window as any).fabric.Canvas(canvasRef.current, {
        width: currentW,
        height: currentH,
        backgroundColor: "#ffffff",
        selection: true,
        centeredRotation: true,
      });
      canvas.setZoom(z);
      fc.current = canvas;
      const canvasEl = canvas.upperCanvasEl;
      canvasElRef.current = canvasEl;
      canvasEl.setAttribute("tabindex", "0");

      const saveState = () => {
        if (savingHistory.current) return;
        try { historyRef.current.undo.push(JSON.stringify(canvas.toJSON())); historyRef.current.redo = []; if (historyRef.current.undo.length > 50) historyRef.current.undo.shift(); } catch {}
      };
      const restoreState = (json: string) => {
        savingHistory.current = true;
        try { canvas.loadFromJSON(JSON.parse(json), () => { try { canvas.renderAll(); refreshLayers(canvas); } catch {} savingHistory.current = false; }); } catch { savingHistory.current = false; }
      };

      canvas.on("selection:created", () => syncSel(canvas.getActiveObject()));
      canvas.on("selection:updated", () => syncSel(canvas.getActiveObject()));
      canvas.on("selection:cleared", () => syncSel(null));
      canvas.on("object:modified", (e: any) => {
        if (!savingHistory.current) {
          saveState();
          refreshLayers(canvas);
          const obj = e.target;
          if (obj?.type !== "textbox" && obj?.type !== "i-text") {
            syncSel(obj);
          }
        }
      });
      canvas.on("object:added",    () => { if (!savingHistory.current) { saveState(); refreshLayers(canvas); } });
      canvas.on("object:removed",  () => { if (!savingHistory.current) refreshLayers(canvas); });

      canvas.on("mouse:dblclick", (e: any) => {
        if (isEditingNodesRef.current) {
          if (!e.target || !e.target.isControlHelper) exitEditNodes();
          return;
        }
        if (e.target && !e.target.isControlHelper) {
          if (e.target.type === "image") { enterPixelEdit(e.target); return; }
          const editableTypes = ["path","rect","circle","triangle","polygon"];
          if (editableTypes.includes(e.target.type)) enterEditNodes(e.target);
        }
      });

      canvas.on("object:scaling", (e: any) => {
        const obj = e.target;
        if (!obj) return;
        if (obj.type === "textbox" || obj.type === "i-text") {
          const newSize = Math.round(obj.fontSize * obj.scaleY);
          setSelFontSize(newSize);
        }
        if (obj.type === "rect") {
          const storedRx = rectBeforeScale.current?.rx ?? (obj.rx || 0);
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

      canvas.on("object:scaled", (e: any) => {
        const obj = e.target;
        if (!obj) return;
        if (obj.type === "textbox" || obj.type === "i-text") {
          const newFontSize = Math.round(obj.fontSize * obj.scaleY);
          const newWidth = obj.type === "textbox" ? obj.width * obj.scaleX : obj.width;
          obj.set({ fontSize: newFontSize, width: newWidth, scaleX: 1, scaleY: 1 });
          canvas.requestRenderAll();
          syncSel(obj);
        }
        if (obj.type === "rect") {
          rectBeforeScale.current = { rx: obj.rx || 0, ry: obj.ry || 0 };
          canvas.requestRenderAll();
          syncSel(obj);
        }
      });

      canvas.on("mouse:down:before", (e: any) => {
        if (activeToolRef.current !== "pen") return;
        e.e.stopPropagation?.();
      });

      canvas.on("mouse:down", (e: any) => {
        if (isEditingNodesRef.current && editingData.current) {
          const p = canvas.getPointer(e.e);
          const target = canvas.findTarget(e.e, false);
          const isTargetHelper = target && target.isControlHelper;

          if (!isTargetHelper) {
            const { commands } = editingData.current;
            let closestIdx = -1;
            let closestDist = 25;

            for (let i = 1; i < commands.length; i++) {
              const cmd = commands[i];
              if (cmd.type === "Z") continue;
              const prevCmd = commands[i - 1];
              if (!prevCmd) continue;

              const px = prevCmd.x ?? 0;
              const py = prevCmd.y ?? 0;
              const cx = cmd.x ?? 0;
              const cy = cmd.y ?? 0;
              const mx = (px + cx) / 2;
              const my = (py + cy) / 2;
              const dist = Math.hypot(p.x - mx, p.y - my);

              if (dist < closestDist) {
                closestDist = dist;
                closestIdx = i;
              }
            }

            if (closestIdx !== -1) {
              const prevCmd = commands[closestIdx - 1];
              const nextCmd = commands[closestIdx];
              const t = 0.5;

              const p1x = prevCmd.x, p1y = prevCmd.y;
              const c1x = nextCmd.type === "C" ? nextCmd.cp1x : p1x;
              const c1y = nextCmd.type === "C" ? nextCmd.cp1y : p1y;
              const c2x = nextCmd.type === "C" ? nextCmd.cp2x : nextCmd.x;
              const c2y = nextCmd.type === "C" ? nextCmd.cp2y : nextCmd.y;
              const p2x = nextCmd.x, p2y = nextCmd.y;

              const m1x = p1x + (c1x - p1x) * t, m1y = p1y + (c1y - p1y) * t;
              const m2x = c1x + (c2x - c1x) * t, m2y = c1y + (c2y - c1y) * t;
              const m3x = c2x + (p2x - c2x) * t, m3y = c2y + (p2y - c2y) * t;
              const m4x = m1x + (m2x - m1x) * t, m4y = m1y + (m2y - m1y) * t;
              const m5x = m2x + (m3x - m2x) * t, m5y = m2y + (m3y - m2y) * t;
              const midX = m4x + (m5x - m4x) * t, midY = m4y + (m5y - m4y) * t;

              if (nextCmd.type === "C") {
                nextCmd.cp1x = m3x; nextCmd.cp1y = m3y;
                nextCmd.cp2x = m5x; nextCmd.cp2y = m5y;
              }

              commands.splice(closestIdx, 0, {
                type: "C",
                cp1x: m1x, cp1y: m1y,
                cp2x: m4x, cp2y: m4y,
                x: midX, y: midY,
              });

              renderEditControls();
              return;
            }
          }
        }

        if (activeToolRef.current !== "pen" || isEditingNodesRef.current) return;
        const fabric = (window as any).fabric;
        const p = canvas.getPointer(e.e);
        const pts = penPoints.current;

        if (pts.length > 1) {
          const first = pts[0];
          const dist = Math.hypot(p.x - first.x, p.y - first.y);
          if (dist < 14) { finalizePenRef.current(true); return; }
        }

        isPenDragging.current = true;
        pts.push({ x: p.x, y: p.y });
        penCurveHandles.current.push([{ x: p.x, y: p.y }, { x: p.x, y: p.y }]);

        const dot = new fabric.Circle({
          left: p.x, top: p.y, radius: 4, originX: "center", originY: "center",
          fill: pts.length === 1 ? "#22c55e" : "#4f46e5",
          stroke: "white", strokeWidth: 1.5,
          selectable: false, evented: false,
        });
        canvas.add(dot);
        penDots.current.push(dot);

        if (pts.length > 1) {
          const prev = pts[pts.length - 2];
          const prevHandle = penCurveHandles.current[pts.length - 2][1];
          const currHandle = penCurveHandles.current[pts.length - 1][0];
          const curvePath = new fabric.Path(`M ${prev.x} ${prev.y} C ${prevHandle.x} ${prevHandle.y} ${currHandle.x} ${currHandle.y} ${p.x} ${p.y}`, {
            stroke: "#4f46e5", strokeWidth: 1.5, strokeDashArray: [4, 3], fill: "transparent",
            selectable: false, evented: false,
          });
          canvas.add(curvePath);
          penLines.current.push(curvePath);
        }

        canvas.requestRenderAll();
      });

      canvas.on("mouse:move", (e: any) => {
        if (activeToolRef.current === "select" && !isEditingNodesRef.current) {
          const target = canvas.findTarget(e.e, false);
          canvas.defaultCursor = (target && target.type === "path" && !target.isControlHelper) ? "crosshair" : "default";
        }

        if (activeToolRef.current !== "pen" || !isPenDragging.current) return;
        const fabric = (window as any).fabric;
        const p = canvas.getPointer(e.e);
        const pts = penPoints.current;
        const currIdx = pts.length - 1;
        const anchor = pts[currIdx];

        const dx = p.x - anchor.x;
        const dy = p.y - anchor.y;

        penCurveHandles.current[currIdx] = [
          { x: anchor.x - dx, y: anchor.y - dy },
          { x: anchor.x + dx, y: anchor.y + dy }
        ];

        if (activeHandleLine.current) canvas.remove(activeHandleLine.current);
        activeHandleLine.current = new fabric.Line([anchor.x - dx, anchor.y - dy, anchor.x + dx, anchor.y + dy], {
          stroke: "#ef4444", strokeWidth: 1, selectable: false, evented: false, strokeDashArray: [2, 2]
        });
        canvas.add(activeHandleLine.current);

        if (pts.length > 1) {
          const prev = pts[pts.length - 2];
          const prevH = penCurveHandles.current[pts.length - 2][1];
          const currH = penCurveHandles.current[currIdx][0];
          const lastLine = penLines.current[penLines.current.length - 1];
          if (lastLine) canvas.remove(lastLine);

          const newPath = new fabric.Path(`M ${prev.x} ${prev.y} C ${prevH.x} ${prevH.y} ${currH.x} ${currH.y} ${anchor.x} ${anchor.y}`, {
            stroke: "#4f46e5", strokeWidth: 1.5, strokeDashArray: [4, 3], fill: "transparent", selectable: false, evented: false,
          });
          canvas.add(newPath);
          penLines.current[penLines.current.length - 1] = newPath;
        }

        canvas.requestRenderAll();
      });

      canvas.on("mouse:up", () => {
        if (activeToolRef.current !== "pen") return;
        isPenDragging.current = false;
        if (activeHandleLine.current) {
          canvas.remove(activeHandleLine.current);
          activeHandleLine.current = null;
          canvas.requestRenderAll();
        }
      });

      const onKey = (e: KeyboardEvent) => {
        const tag = (document.activeElement as HTMLElement)?.tagName;
        const isInput = tag === "INPUT" || tag === "TEXTAREA";
        const ctrl = e.ctrlKey || e.metaKey;
        const obj = canvas.getActiveObject();

        if ((e.key === "Delete" || e.key === "Backspace") && !isInput) {
          if (isEditingNodesRef.current) {
            e.preventDefault();
            deleteSelectedNode();
            return;
          }
          if (obj && !obj.lockMovementX && !obj.isControlHelper && !obj.isEditPreview) {
            if (obj.type === "i-text" && obj.isEditing) return;
            saveState();
            deleteSelected();
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
              if (isEditingNodesRef.current) { toggleNodeSmooth(); return; }
              if (!obj) return;
              obj.clone((c: any) => { c.set({ left: obj.left+20, top: obj.top+20 }); canvas.add(c); canvas.setActiveObject(c); canvas.requestRenderAll(); }); break;
            case "z": e.preventDefault();
              if (lastFinalizedPath.current || (activeToolRef.current === "pen" && penPoints.current.length > 0)) {
                undoLastPenPointRef.current();
                return;
              }
              if (e.shiftKey) { const n = historyRef.current.redo.pop(); if (!n) return; historyRef.current.undo.push(JSON.stringify(canvas.toJSON())); restoreState(n); }
              else { const p = historyRef.current.undo.pop(); if (!p) return; historyRef.current.redo.push(JSON.stringify(canvas.toJSON())); restoreState(p); }
              break;
            case "y": e.preventDefault(); { const n = historyRef.current.redo.pop(); if (!n) return; historyRef.current.undo.push(JSON.stringify(canvas.toJSON())); restoreState(n); } break;
            case "a": e.preventDefault(); { const all = new (window as any).fabric.ActiveSelection(canvas.getObjects().filter((o: any) => !o.isControlHelper && !o.isEditPreview), { canvas }); canvas.setActiveObject(all); canvas.requestRenderAll(); } break;
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
        if (e.key === "Escape") {
          if (pixelEditMode) { exitPixelEdit(false); return; }
          if (isEditingNodesRef.current) {
            exitEditNodes();
          } else if (activeToolRef.current === "pen") {
            cancelPenRef.current(); activeToolRef.current = "select"; setActiveTool("select");
            if (fc.current) { fc.current.defaultCursor="default"; fc.current.hoverCursor="move"; fc.current.selection=true; }
          } else {
            canvas.discardActiveObject(); canvas.requestRenderAll();
          }
        }
        if (e.key === "Enter") {
          if (isEditingNodesRef.current) {
            exitEditNodes();
          } else if (activeToolRef.current === "pen") {
            finalizePenRef.current(true);
          }
        }
      };
      window.addEventListener("keydown", onKey);
      return () => { canvas.dispose(); fc.current = null; window.removeEventListener("keydown", onKey); };
    } 
  }, [fabricLoaded, canvasWidth, canvasHeight]);

  useEffect(() => {
    if (pixelTool !== "eraser" || !pixelEditMode || !pixelCanvasRef.current) return;
    const el = pixelCanvasRef.current;
    const ctx = el.getContext("2d")!;
    const snap = pixelSnapshotRef.current;
    if (!snap) return;
    ctx.putImageData(snap, 0, 0);
    // Desenha círculo no centro como placeholder até o mouse mover
    const cx = el.width / 2;
    const cy = el.height / 2;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, pixelBrushSize / 2, 0, Math.PI * 2);
    ctx.strokeStyle = "#4f46e5"; ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]);
    ctx.stroke(); ctx.setLineDash([]); ctx.restore();
  }, [pixelTool, pixelEditMode]);

  useEffect(() => {
    if (!fc.current) return;
    const z = zoom / 100;
    const currentW = Math.round(canvasWidth * z);
    const currentH = Math.round(canvasHeight * z);
    fc.current.setWidth(currentW);
    fc.current.setHeight(currentH);
    fc.current.setZoom(z);
    fc.current.calcOffset();
    fc.current.requestRenderAll();
  }, [zoom, canvasWidth, canvasHeight]);

  useEffect(() => {
    if (!fc.current) return;
    if (bgGradient) {
      const fab = (window as any).fabric;
      if (!fab) return;
      const rad = (bgGradient.angle * Math.PI) / 180;
      const bgColorStops = bgGradient.stops.map((s: any) => {
        const hex = s.color.startsWith("#") ? s.color : "#000000";
        const r = parseInt(hex.slice(1,3),16), gr = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
        return { offset: s.pos/100, color: `rgba(${r},${gr},${b},${s.opacity})` };
      });
      const grad = new fab.Gradient({ type: "linear", coords: { x1: (Math.cos(rad+Math.PI)+1)/2*canvasWidth, y1: (Math.sin(rad+Math.PI)+1)/2*canvasHeight, x2: (Math.cos(rad)+1)/2*canvasWidth, y2: (Math.sin(rad)+1)/2*canvasHeight }, colorStops: bgColorStops });
      fc.current.setBackgroundColor(grad, () => fc.current?.renderAll());
    } else {
      fc.current.setBackgroundColor(bgSolid, () => fc.current?.renderAll());
    }
  }, [bgSolid, bgGradient, canvasWidth, canvasHeight]);

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
  const updateFillGradient = (g: {stops:{color:string;opacity:number;pos:number}[];angle:number}|null) => {
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
      sel.setSelectionStyles({ fontSize: v });
      fc.current.requestRenderAll();
    } else { upd({ fontSize: v }); }
  };
  const updateFontFamily = (v: string) => {
    setSelFontFamily(v);
    document.fonts.load(`${selFontSize}px "${v}"`).finally(() => {
      upd({ fontFamily: v });
    });
  };
  const updateTextAlign = (align: string) => {
    setSelTextAlign(align);
    if (!fc.current || !sel) return;
    sel.set({ textAlign: align });
    fc.current.requestRenderAll();
  };

  const toggleBold = () => {
    const n = !selBold; setSelBold(n);
    if (!fc.current || !sel) return;
    if (sel.isEditing && sel.selectionStart !== sel.selectionEnd) {
      sel.setSelectionStyles({ fontWeight: n ? "bold" : "normal" });
      fc.current.requestRenderAll();
    } else {
      sel.set({ fontWeight: n ? "bold" : "normal" });
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
    sel.set("shadow", new (window as any).fabric.Shadow({ color, blur, offsetX: ox, oy }));
    fc.current.requestRenderAll();
  };

  const updateBlur = (v: number) => {
    setSelBlur(v);
    if (!fc.current || !sel) return;
    const uid = sel.__uid;
    if (v > 0) blurValueMap.current.set(uid, v);
    else blurValueMap.current.delete(uid);

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

    if (!blurPosMap.current.has(uid)) {
      blurPosMap.current.set(uid, {
        left: sel.left, top: sel.top,
        scaleX: sel.scaleX || 1, scaleY: sel.scaleY || 1,
        angle: sel.angle || 0,
      });
    }

    if (!blurOriginMap.current.has(uid) && sel.type !== "image") {
      blurOriginMap.current.set(uid, JSON.stringify(sel.toObject()));
    }

    if (blurTimer.current) clearTimeout(blurTimer.current);
    blurTimer.current = setTimeout(() => {
      const fabric = (window as any).fabric;
      const currentV = blurValueMap.current.get(uid) ?? 0;
      const pos = blurPosMap.current.get(uid)!;

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
    const cw = canvasWidth;
    const ch = canvasHeight;
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

  const add = (fn: (fabric: any) => any) => {
    if (!fc.current) return;
    const obj = fn((window as any).fabric);
    fc.current.add(obj); fc.current.setActiveObject(obj); syncSel(obj);
  };
  const addText = () => {
    if (!fc.current) return;
    const fab = (window as any).fabric;
    const fontToLoad = `${selFontSize}px "${selFontFamily}"`;
    document.fonts.load(fontToLoad).finally(() => {
      const t = new fab.Textbox("Texto aqui", {
        left: canvasWidth / 2,
        top: canvasHeight / 2,
        originX: "center",
        originY: "center",
        width: 300,
        fontSize: selFontSize,
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
    upd({ width: v });
  };

  const updateTextHeight = (v: number) => {
    setSelTextHeight(v);
    if (!fc.current || !sel) return;
    if (v === 0) {
      sel.set({ minHeight: undefined, __fixedHeight: false });
      sel.__fixedHeight = false;
      sel.initDimensions?.();
      fc.current.requestRenderAll();
    } else {
      sel.__fixedHeight = true;
      sel.set({ height: v, minHeight: v });
      fc.current.requestRenderAll();
    }
  };
  const addRect  = (r=0) => add(fab => new fab.Rect({ left:canvasWidth/2-75, top:canvasHeight/2-50, width:150, height:100, fill:"#3b82f6", rx:r, ry:r, strokeUniform:true }));
  const addCirc  = () => add(fab => new fab.Circle({ left:canvasWidth/2-60, top:canvasHeight/2-60, radius:60, fill:"#3b82f6", strokeUniform:true }));
  const addTri   = () => add(fab => new fab.Triangle({ left:canvasWidth/2-60, top:canvasHeight/2-60, width:120, height:120, fill:"#3b82f6", strokeUniform:true }));
  const addLine  = () => add(fab => new fab.Line([canvasWidth/2-80, canvasHeight/2, canvasWidth/2+80, canvasHeight/2], { stroke:"#000000", strokeWidth:3, strokeUniform:true }));
  const addStar  = () => {
    const points: { x: number; y: number }[] = [];
    for (let i=0;i<10;i++) { const r = i%2===0?60:24; const a = (Math.PI/5)*i - Math.PI/2; points.push({ x: r*Math.cos(a), y: r*Math.sin(a) }); }
    add(fab => new fab.Polygon(points, { left:canvasWidth/2, top:canvasHeight/2, originX:"center", originY:"center", fill:"#eab308", strokeUniform:true }));
  };
  const addArrow = () => {
    const points: { x: number; y: number }[] = [{ x:0,y:20 },{ x:80,y:20 },{ x:80,y:0 },{ x:120,y:35 },{ x:80,y:70 },{ x:80,y:50 },{ x:0,y:50 }];
    add(fab => new fab.Polygon(points, { left:canvasWidth/2-60, top:canvasHeight/2-35, fill:"#3b82f6", strokeUniform:true }));
  };

  const handleImg = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !fc.current) return;
    const r = new FileReader();
    r.onload = ev => (window as any).fabric.Image.fromURL(ev.target?.result as string, (img: any) => {
      if (img.width > canvasWidth * 0.8) img.scaleToWidth(canvasWidth * 0.8);
      const scaledW = img.getScaledWidth();
      const scaledH = img.getScaledHeight();
      img.set({
        left: (canvasWidth - scaledW) / 2,
        top: (canvasHeight - scaledH) / 2,
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

      const loadFont = async (family: string): Promise<any> => {
        const url = FONT_URLS[family];
        if (url) {
          try { return await opentype.load(url); } catch {}
        }
        return null;
      };

      const font = await loadFont(fontFamily);

      if (!font) {
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

  const finalizePen = (close: boolean) => {
    if (!fc.current) return;
    const canvas = fc.current;
    const fabric = (window as any).fabric;
    const pts = penPoints.current;
    const handles = penCurveHandles.current;
    if (pts.length < 2) { cancelPen(); return; }

    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const h1 = handles[i - 1]?.[1] || prev;
      const h2 = handles[i]?.[0]    || curr;
      d += ` C ${h1.x} ${h1.y} ${h2.x} ${h2.y} ${curr.x} ${curr.y}`;
    }
    if (close && pts.length > 2) {
      const h1 = handles[pts.length - 1]?.[1] || pts[pts.length - 1];
      const h2 = handles[0]?.[0] || pts[0];
      d += ` C ${h1.x} ${h1.y} ${h2.x} ${h2.y} ${pts[0].x} ${pts[0].y} Z`;
    }

    const path = new fabric.Path(d, {
      fill: close ? (selFill !== "transparent" ? selFill : "#4f46e5") : "transparent",
      stroke: "#000000",
      strokeWidth: 2,
      strokeUniform: true,
    });

    penLines.current.forEach(l => canvas.remove(l));
    penDots.current.forEach(d => canvas.remove(d));
    if (activeHandleLine.current) {
      canvas.remove(activeHandleLine.current);
      activeHandleLine.current = null;
    }
    penLines.current = [];
    penDots.current = [];

    canvas.add(path);
    canvas.setActiveObject(path);
    syncSel(path);
    lastFinalizedPath.current = path;

    activeToolRef.current = "select";
    setActiveTool("select");
    canvas.defaultCursor = "default";
    canvas.hoverCursor = "move";
    canvas.selection = true;
    canvas.requestRenderAll();
  };

  const cancelPen = () => {
    if (!fc.current) return;
    penLines.current.forEach(l => fc.current.remove(l));
    penDots.current.forEach(d => fc.current.remove(d));
    if (activeHandleLine.current) fc.current.remove(activeHandleLine.current);
    penPoints.current = [];
    penLines.current = [];
    penDots.current = [];
    penCurveHandles.current = [];
    activeHandleLine.current = null;
    lastFinalizedPath.current = null;
    fc.current.requestRenderAll();
  };

  const startPen = () => {
    if (isEditingNodes) exitEditNodes();
    lastFinalizedPath.current = null;
    setActiveTool("pen"); activeToolRef.current = "pen";
    if (fc.current) {
      fc.current.defaultCursor = "crosshair";
      fc.current.hoverCursor = "crosshair";
      fc.current.selection = false;
      fc.current.discardActiveObject();
      fc.current.requestRenderAll();
    }
  };

  const stopPen = () => {
    setActiveTool("select"); activeToolRef.current = "select";
    cancelPenRef.current();
    if (fc.current) {
      fc.current.defaultCursor = "default";
      fc.current.hoverCursor = "move";
      fc.current.selection = true;
      fc.current.isDrawingMode = false;
    }
  };

  finalizePenRef.current = finalizePen;
  cancelPenRef.current = cancelPen;

  const createMask = () => {
    if (!fc.current) return;
    const canvas = fc.current;
    const active = canvas.getActiveObject();
    if (!active || active.type !== "activeSelection") return;
    const objects = (active as any).getObjects();
    const image = objects.find((o: any) => o.type === "image");
    const shape = objects.find((o: any) => o.type !== "image");
    if (!image || !shape) { alert("Selecione uma imagem e uma forma juntas."); return; }

    canvas.discardActiveObject();
    canvas.requestRenderAll();

    const imgCenter = image.getCenterPoint();
    const shapeCenter = shape.getCenterPoint();

    shape.clone((clippedShape: any) => {
      const imgScaleX = image.scaleX || 1;
      const imgScaleY = image.scaleY || 1;

      clippedShape.set({
        left: (shapeCenter.x - imgCenter.x) / imgScaleX,
        top: (shapeCenter.y - imgCenter.y) / imgScaleY,
        originX: "center",
        originY: "center",
        scaleX: (shape.scaleX || 1) / imgScaleX,
        scaleY: (shape.scaleY || 1) / imgScaleY,
        angle: (shape.angle || 0) - (image.angle || 0),
        absolutePositioned: false,
      });

      image.__originalShape = shape;
      image.clipPath = clippedShape;
      image.setCoords();

      canvas.remove(shape);
      canvas.setActiveObject(image);
      syncSel(image);
      refreshLayers(canvas);
      canvas.requestRenderAll();
    });
  };

  const removeMask = () => {
    if (!fc.current || !sel || !sel.clipPath) return;
    const canvas = fc.current;
    const image = sel;
    const clip = image.clipPath;

    if (image.__originalShape) {
      const orig = image.__originalShape;
      const imgCenter = image.getCenterPoint();
      const imgScaleX = image.scaleX || 1;
      const imgScaleY = image.scaleY || 1;

      orig.set({
        left: imgCenter.x + (clip.left || 0) * imgScaleX,
        top: imgCenter.y + (clip.top || 0) * imgScaleY,
        originX: "center",
        originY: "center",
        scaleX: (clip.scaleX || 1) * imgScaleX,
        scaleY: (clip.scaleY || 1) * imgScaleY,
        angle: (clip.angle || 0) + (image.angle || 0),
      });
      orig.setCoords();
      canvas.add(orig);
      delete image.__originalShape;
    }

    image.clipPath = null;
    image.setCoords();
    syncSel(image);
    refreshLayers(canvas);
    canvas.requestRenderAll();
  };

  const exportDataUrl = () => {
    const canvas = fc.current;
    const currentZoom = canvas.getZoom();
    canvas.setZoom(1);
    canvas.setWidth(canvasWidth);
    canvas.setHeight(canvasHeight);
    const dataUrl = canvas.toDataURL({ format:"png", multiplier:1 });
    canvas.setZoom(currentZoom);
    canvas.setWidth(Math.round(canvasWidth * currentZoom));
    canvas.setHeight(Math.round(canvasHeight * currentZoom));
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
  const isPath = sel?.type === "path";
  const isRect = sel?.type === "rect";
  const isEditableShape = ["rect","circle","triangle","polygon","path"].includes(sel?.type || "");
  const hasClipPath = !!sel?.clipPath;

  const isMultiShapeSelected = sel?.type === "activeSelection" && (() => {
    const objs = (sel as any).getObjects();
    return objs.length >= 2 && objs.every((o: any) => o.type !== "image" && o.type !== "i-text" && o.type !== "textbox");
  })();

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden" style={{ fontFamily: "system-ui, sans-serif" }}>
      {/* Top bar */}
      <nav className="bg-white border-b border-gray-200 px-4 h-14 flex items-center justify-between flex-shrink-0 z-20">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/canvas" className="text-sm text-gray-500 hover:text-gray-700">← Canvas</Link>
          <span className="text-gray-200">|</span>
          <input value={artName} onChange={e => setArtName(e.target.value)}
            className="text-sm font-medium text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-indigo-400 focus:outline-none px-1 py-0.5 w-36" />
          
          {/* Dimensões editáveis */}
          <div className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-lg text-xs text-gray-600">
            <span className="text-gray-400 font-semibold">W</span>
            <input
              type="text"
              value={inputWidth}
              onChange={e => {
                setInputWidth(e.target.value);
                const num = parseInt(e.target.value, 10);
                if (!isNaN(num) && num > 0) setCanvasWidth(num);
              }}
              onBlur={() => {
                const num = Math.max(50, Math.min(8000, parseInt(inputWidth, 10) || fmt.w));
                setCanvasWidth(num);
                setInputWidth(String(num));
              }}
              className="w-14 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-indigo-400 focus:outline-none text-center font-medium"
            />
            <span className="text-gray-400">×</span>
            <span className="text-gray-400 font-semibold">H</span>
            <input
              type="text"
              value={inputHeight}
              onChange={e => {
                setInputHeight(e.target.value);
                const num = parseInt(e.target.value, 10);
                if (!isNaN(num) && num > 0) setCanvasHeight(num);
              }}
              onBlur={() => {
                const num = Math.max(50, Math.min(8000, parseInt(inputHeight, 10) || fmt.h));
                setCanvasHeight(num);
                setInputHeight(String(num));
              }}
              className="w-14 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-indigo-400 focus:outline-none text-center font-medium"
            />
            <span className="text-gray-400 text-[10px]">px</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls com botão Fit */}
          <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-2 py-1 bg-white">
            <button onClick={() => setZoom(z => Math.max(10, z - 10))} className="text-gray-500 hover:text-gray-800 w-5 text-center text-sm font-semibold">−</button>
            <span className="text-xs text-gray-600 w-10 text-center">{zoom}%</span>
            <button onClick={() => setZoom(z => Math.min(300, z + 10))} className="text-gray-500 hover:text-gray-800 w-5 text-center text-sm font-semibold">+</button>
            <button onClick={fitCanvasToScreen} title="Ajustar à tela" className="ml-1 px-1.5 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-[10px] font-medium transition">
              Fit
            </button>
          </div>
          <button onClick={handleDownload} className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition">↓ PNG</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-60">
            {saving ? "Salvando..." : saved ? "✓ Salvo!" : "Salvar"}
          </button>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* ── LEFT TOOLBAR ─────────────────────────────── */}
        <div className="w-14 bg-white border-r border-gray-200 flex flex-col items-center py-3 gap-1 flex-shrink-0 overflow-y-auto">

          {pixelEditMode ? (
            /* ── Pixel edit tools ── */
            <>
              {/* Eraser */}
              <button onClick={() => setPixelTool("eraser")} title="Borracha"
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${pixelTool==="eraser" ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:bg-gray-100"}`}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M3 14h12M10 14l4-9-3-2-8 8 3 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M6 11l5-7" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
              </button>

              {/* Stamp */}
              <button onClick={() => setPixelTool("stamp")} title="Carimbo clone (Alt+clique = fonte)"
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${pixelTool==="stamp" ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:bg-gray-100"}`}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <circle cx="9" cy="6" r="4" stroke="currentColor" strokeWidth="1.5"/>
                  <rect x="7" y="10" width="4" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                  <line x1="5" y1="15" x2="13" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>

              {/* Lasso */}
              <button onClick={() => { setPixelTool("lasso"); setLassoSelected(false); lassoSelectionRef.current = []; }} title="Laço"
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${pixelTool==="lasso" ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:bg-gray-100"}`}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M9 3C5.5 3 3 5 3 7.5C3 10 5 11.5 7 12L9 15L11 12C13 11.5 15 10 15 7.5C15 5 12.5 3 9 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeDasharray="2 1"/>
                </svg>
              </button>

              {/* Brush size — shown for eraser and stamp */}
              {pixelTool !== "lasso" && (
                <div className="w-10 flex flex-col items-center gap-1 mt-1">
                  <div className="w-8 border-t border-gray-100" />
                  <div className="w-8 flex items-center justify-center" style={{height:20}}>
                    <div style={{width: Math.min(pixelBrushSize/4+4, 28), height: Math.min(pixelBrushSize/4+4, 28), borderRadius:"50%", background:"currentColor"}} className="text-gray-400 bg-gray-400" />
                  </div>
                  {[4,12,30,60].map(s => (
                    <button key={s} onClick={() => setPixelBrushSize(s)}
                      className={`w-9 h-7 rounded-lg flex items-center justify-center transition ${pixelBrushSize===s ? "bg-blue-100" : "hover:bg-gray-100"}`}>
                      <div style={{width: Math.min(s/3+3,26), height: Math.min(s/3+3,26), borderRadius:"50%", background: pixelBrushSize===s ? "#3b82f6" : "#9ca3af"}} />
                    </button>
                  ))}
                  <input type="range" min={2} max={200} value={pixelBrushSize}
                    onChange={e => setPixelBrushSize(+e.target.value)}
                    className="w-8 accent-blue-600" style={{writingMode:"vertical-lr", direction:"rtl", height:60}} />
                  <div className="w-8 border-t border-gray-100 my-1" />
                  <span className="text-gray-400" style={{fontSize:8}}>Suav.</span>
                  <input type="range" min={0} max={1} step={0.05} value={pixelSoftness}
                    onChange={e => setPixelSoftness(+e.target.value)}
                    className="w-8 accent-blue-600" style={{writingMode:"vertical-lr", direction:"rtl", height:40}} />
                </div>
              )}

              {/* Lasso instructions */}
              {pixelTool === "lasso" && lassoSelected && (
                <div className="w-10 mt-2 flex flex-col items-center gap-1">
                  <div className="w-8 border-t border-gray-100" />
                  <span className="text-gray-400 text-center leading-tight" style={{fontSize:8}}>Del apaga seleção</span>
                  <span className="text-gray-400 text-center leading-tight" style={{fontSize:8}}>⇧I inverte</span>
                </div>
              )}

              {/* Stamp hint */}
              {pixelTool === "stamp" && (
                <div className="w-10 mt-2 flex flex-col items-center">
                  <div className="w-8 border-t border-gray-100 mb-1" />
                  <span className="text-gray-400 text-center leading-tight" style={{fontSize:8}}>
                    {stampSourceRef.current ? "✓ Fonte" : "Alt+clique = fonte"}
                  </span>
                </div>
              )}

              {/* Separator + exit */}
              <div className="w-8 border-t border-gray-200 mt-2" />
              <button onClick={() => exitPixelEdit(true)} title="Sair (duplo clique ou Esc)"
                className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-100 transition">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </>
          ) : (
            /* ── Normal tools ── */
            <>

          {/* Select */}
          <button onClick={() => { stopPen(); if (isEditingNodes) exitEditNodes(); }} title="Selecionar (V)"
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${activeTool==="select" && !isEditingNodes ? "bg-indigo-100 text-indigo-700" : "text-gray-500 hover:bg-gray-100"}`}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 2l12 7-6 1-3 6L3 2z" fill="currentColor"/></svg>
          </button>

          {/* Pen */}
          <button onClick={() => activeTool==="pen" ? stopPen() : startPen()} title="Caneta (P) - Clique e arraste para curvas">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${activeTool==="pen" ? "bg-indigo-100 text-indigo-700" : "text-gray-500 hover:bg-gray-100"}`}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19l7-7 3 3-7 7-3-3z"/>
                <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
                <path d="M2 2l7.586 7.586"/>
                <circle cx="11" cy="11" r="1.5" fill="currentColor"/>
              </svg>
            </div>
          </button>

          {/* Brush */}
          <button onClick={() => {
            if (activeTool === "brush") {
              setActiveTool("select"); activeToolRef.current = "select";
              if (fc.current) { fc.current.isDrawingMode = false; }
            } else {
              setActiveTool("brush"); activeToolRef.current = "brush";
              if (fc.current) {
                const fabric = (window as any).fabric;
                fc.current.isDrawingMode = true;
                fc.current.freeDrawingBrush = new fabric.PencilBrush(fc.current);
                fc.current.freeDrawingBrush.color = brushColor;
                fc.current.freeDrawingBrush.width = brushSize;
              }
            }
          }} title="Pincel"
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${activeTool==="brush" ? "bg-indigo-100 text-indigo-700" : "text-gray-500 hover:bg-gray-100"}`}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 15c1-1 2-3 4-3s2 2 4 2c1 0 2-1 2-2V4l-2-2-8 8-2 4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
          </button>

          {activeTool === "brush" && (
            <div className="w-10 flex flex-col gap-1 items-center">
              <div className="w-10 border-t border-gray-100" />
              {/* Preview do traço */}
              <div className="w-8 flex items-center justify-center" style={{ height: 24 }}>
                <div style={{ width: 28, height: Math.min(brushSize, 16), borderRadius: brushSize, background: brushColor }} />
              </div>
              {/* Tamanhos predefinidos */}
              {[2, 6, 12, 20].map(s => (
                <button key={s} onClick={() => {
                  setBrushSize(s);
                  if (fc.current?.freeDrawingBrush) fc.current.freeDrawingBrush.width = s;
                }}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${brushSize === s ? "bg-indigo-100" : "hover:bg-gray-100"}`}>
                  <div style={{ width: Math.min(s * 1.2, 22), height: Math.min(s * 1.2, 22), borderRadius: "50%", background: brushColor }} />
                </button>
              ))}
              {/* Cor */}
              <input type="color" value={brushColor} onChange={e => {
                setBrushColor(e.target.value);
                if (fc.current?.freeDrawingBrush) fc.current.freeDrawingBrush.color = e.target.value;
              }} className="w-8 h-8 rounded-lg border border-gray-200 cursor-pointer p-0.5 mt-1" />
            </div>
          )}

          <div className="w-8 border-t border-gray-100 my-1" />

          {/* Text */}
          <button onClick={addText} title="Texto (T)"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100 transition font-bold text-base">
            T
          </button>

          {/* Rect */}
          <button onClick={() => addRect(0)} title="Retângulo"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100 transition">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="4" width="14" height="10" rx="1" stroke="currentColor" strokeWidth="1.5"/></svg>
          </button>

          {/* Rounded rect */}
          <button onClick={() => addRect(14)} title="Retângulo arredondado"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100 transition">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="4" width="14" height="10" rx="4" stroke="currentColor" strokeWidth="1.5"/></svg>
          </button>

          {/* Circle */}
          <button onClick={addCirc} title="Círculo"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100 transition">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5"/></svg>
          </button>

          {/* Triangle */}
          <button onClick={addTri} title="Triângulo"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100 transition">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2l8 14H1L9 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
          </button>

          {/* Star */}
          <button onClick={addStar} title="Estrela"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100 transition">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 1l2.2 6.6H18l-5.6 4.1 2.1 6.5L9 14l-5.5 4.2 2.1-6.5L0 7.6h6.8L9 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
          </button>

          {/* Line */}
          <button onClick={addLine} title="Linha"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100 transition">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 16L16 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>

          {/* Arrow */}
          <button onClick={addArrow} title="Seta"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100 transition">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 9h12M10 5l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>

          <div className="w-8 border-t border-gray-100 my-1" />

          {/* Image upload */}
          <label title="Imagem" className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100 transition cursor-pointer">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="1" y="3" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/><circle cx="6" cy="7" r="1.5" fill="currentColor"/><path d="M1 13l4-4 3 3 3-4 5 5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImg} />
          </label>

          {/* Pen options */}
          {activeTool === "pen" && penPoints.current.length > 1 && (
            <div className="mt-2 flex flex-col gap-1 items-center">
              <button onClick={() => finalizePen(true)} title="Fechar forma (Enter)"
                className="w-10 h-10 rounded-xl bg-green-100 text-green-700 flex items-center justify-center hover:bg-green-200 transition">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <button onClick={() => finalizePen(false)} title="Finalizar aberto"
                className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center hover:bg-blue-200 transition">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 13V3l10 5-10 5z" fill="currentColor"/></svg>
              </button>
              <button onClick={cancelPen} title="Cancelar (Esc)"
                className="w-10 h-10 rounded-xl bg-red-100 text-red-500 flex items-center justify-center hover:bg-red-200 transition">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
            </div>
          )}
            </>
          )}
        </div>

        {/* ── CANVAS VIEWPORT ───────────────────────────── */}
        <div ref={canvasContainerRef} className="flex-1 overflow-auto flex items-start justify-center p-8 bg-gray-100">
          <div className="shadow-2xl relative">
            {!fabricLoaded ? (
              <div style={{ width: Math.round(canvasWidth * (zoom / 100)), height: Math.round(canvasHeight * (zoom / 100)) }} className="bg-white flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : <canvas ref={canvasRef} />}

            {/* Pixel editor overlay */}
            {pixelEditMode && pixelEditImgRef.current && (() => {
              const imgObj = pixelEditImgRef.current;
              const z = zoom / 100;
              const iw = (imgObj.width || 0) * (imgObj.scaleX || 1) * z;
              const ih = (imgObj.height || 0) * (imgObj.scaleY || 1) * z;
              const il = (imgObj.left || 0) * z;
              const it = (imgObj.top || 0) * z;
              return (
                <canvas
                  ref={el => {
                    if (!el) return;
                    pixelCanvasRef.current = el;
                    // Só inicializa se o canvas ainda não tem conteúdo
                    if (el.width === 0 || el.dataset.initialized === "true") return;
                    el.dataset.initialized = "true";
                    const imgEl = pixelEditImgRef.current?._element as HTMLImageElement;
                    if (!imgEl) return;
                    el.width  = imgEl.naturalWidth  || pixelEditImgRef.current?.width || 100;
                    el.height = imgEl.naturalHeight || pixelEditImgRef.current?.height || 100;
                    const ctx = el.getContext("2d")!;
                    ctx.drawImage(imgEl, 0, 0);
                    pixelUndoStack.current = [];
                    const snap = ctx.getImageData(0, 0, el.width, el.height);
                    pixelSnapshotRef.current = snap;
                    pixelUndoStack.current.push(snap);
                  }}
                  style={{
                    position: "absolute", left: il, top: it, width: iw, height: ih,
                    cursor: pixelTool === "lasso" ? "crosshair" : "cell",
                    border: "2px solid #4f46e5", boxSizing: "border-box", imageRendering: "pixelated",
                  }}
                  onMouseDown={ev => {
                    if (ev.detail >= 2) { exitPixelEdit(true); return; } // double click exits
                    const el = pixelCanvasRef.current!;
                    const rect = el.getBoundingClientRect();
                    const sx = el.width / rect.width; const sy = el.height / rect.height;
                    const x = (ev.clientX - rect.left) * sx;
                    const y = (ev.clientY - rect.top) * sy;
                    const ctx = el.getContext("2d")!;

                    if (pixelTool === "stamp" && ev.altKey) { stampSourceRef.current = { x, y }; return; }

                    if (pixelTool === "lasso") {
                      // Clear previous lasso selection by restoring last saved state
                      if (pixelUndoStack.current.length > 0) {
                        const last = pixelUndoStack.current[pixelUndoStack.current.length - 1];
                        ctx.putImageData(last, 0, 0);
                      }
                      lassoActiveRef.current = true;
                      lassoPointsRef.current = [{ x, y }];
                      lassoSelectionRef.current = [];
                      setLassoSelected(false);
                      return;
                    }

                    // Save undo snapshot at start of stroke
                    const snap = ctx.getImageData(0, 0, el.width, el.height);
                    pixelSnapshotRef.current = snap;
                    pixelUndoStack.current.push(snap);
                    if (pixelUndoStack.current.length > 30) pixelUndoStack.current.shift();
                    pixelDrawingRef.current = true;

                    const applyEraser = (px: number, py: number) => {
                      const r = pixelBrushSize / 2;
                      if (pixelSoftness === 0) {
                        ctx.globalCompositeOperation = "destination-out";
                        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
                        ctx.globalCompositeOperation = "source-over";
                      } else {
                        // Soft eraser: radial gradient alpha mask
                        const offC = document.createElement("canvas");
                        offC.width = el.width; offC.height = el.height;
                        const offCtx = offC.getContext("2d")!;
                        offCtx.drawImage(el, 0, 0);
                        const grad = ctx.createRadialGradient(px, py, 0, px, py, r);
                        grad.addColorStop(0, `rgba(0,0,0,${pixelSoftness})`);
                        grad.addColorStop(1, "rgba(0,0,0,0)");
                        ctx.globalCompositeOperation = "destination-out";
                        ctx.fillStyle = grad;
                        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
                        ctx.globalCompositeOperation = "source-over";
                      }
                    };

                    if (pixelTool === "eraser") applyEraser(x, y);
                    else if (pixelTool === "stamp" && stampSourceRef.current) {
                      const src = stampSourceRef.current; const r = pixelBrushSize / 2;
                      ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
                      ctx.drawImage(el, src.x - r, src.y - r, pixelBrushSize, pixelBrushSize, x - r, y - r, pixelBrushSize, pixelBrushSize);
                      ctx.restore();
                    }
                  }}
                  onMouseMove={ev => {
                    const el = pixelCanvasRef.current!;
                    const rect = el.getBoundingClientRect();
                    const sx = el.width / rect.width; const sy = el.height / rect.height;
                    const x = (ev.clientX - rect.left) * sx;
                    const y = (ev.clientY - rect.top) * sy;
                    const ctx = el.getContext("2d")!;

                    if (pixelTool === "lasso" && lassoActiveRef.current) {
                      lassoPointsRef.current.push({ x, y });
                      const pts = lassoPointsRef.current;
                      ctx.save();
                      ctx.setLineDash([5, 4]);
                      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
                      ctx.beginPath();
                      ctx.moveTo(pts[pts.length-2]?.x ?? x, pts[pts.length-2]?.y ?? y);
                      ctx.lineTo(x, y); ctx.stroke();
                      ctx.strokeStyle = "#000"; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
                      ctx.beginPath();
                      ctx.moveTo(pts[pts.length-2]?.x ?? x, pts[pts.length-2]?.y ?? y);
                      ctx.lineTo(x, y); ctx.stroke();
                      ctx.setLineDash([]); ctx.restore();
                      return;
                    }

                    if (pixelTool === "eraser") {
                      const r = pixelBrushSize / 2;
                      if (!pixelDrawingRef.current) {
                        const snap = pixelSnapshotRef.current;
                        if (snap) ctx.putImageData(snap, 0, 0);
                        ctx.save();
                        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
                        ctx.strokeStyle = "#4f46e5"; ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]);
                        ctx.stroke(); ctx.setLineDash([]); ctx.restore();
                      } else {
                        // Apaga normalmente sem restaurar snapshot
                        if (pixelSoftness === 0) {
                          ctx.globalCompositeOperation = "destination-out";
                          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
                          ctx.globalCompositeOperation = "source-over";
                        } else {
                          const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
                          grad.addColorStop(0, `rgba(0,0,0,${pixelSoftness})`);
                          grad.addColorStop(1, "rgba(0,0,0,0)");
                          ctx.globalCompositeOperation = "destination-out";
                          ctx.fillStyle = grad;
                          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
                          ctx.globalCompositeOperation = "source-over";
                        }
                      }
                      return;
                    }

                    if (!pixelDrawingRef.current) return;

                    if (pixelTool === "stamp" && stampSourceRef.current) {
                      const src = stampSourceRef.current; const r = pixelBrushSize / 2;
                      ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
                      ctx.drawImage(el, src.x - r, src.y - r, pixelBrushSize, pixelBrushSize, x - r, y - r, pixelBrushSize, pixelBrushSize);
                      ctx.restore();
                    }
                  }}
                  onMouseUp={() => {
                    const el = pixelCanvasRef.current!;
                    const ctx = el.getContext("2d")!;

                    if (pixelDrawingRef.current) {
                      // Atualiza snapshot ANTES de setar false
                      pixelSnapshotRef.current = ctx.getImageData(0, 0, el.width, el.height);
                      pixelUndoStack.current.push(ctx.getImageData(0, 0, el.width, el.height));
                      if (pixelUndoStack.current.length > 30) pixelUndoStack.current.shift();
                      pixelDrawingRef.current = false;
                    }

                    if (pixelTool === "lasso" && lassoActiveRef.current) {
                      lassoActiveRef.current = false;
                      const pts = lassoPointsRef.current;
                      if (pts.length < 3) return;
                      lassoSelectionRef.current = [...pts];
                      setLassoSelected(true);
                      // Draw closed marching ants
                      ctx.save();
                      ctx.setLineDash([6, 3]);
                      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
                      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
                      pts.forEach(p => ctx.lineTo(p.x, p.y)); ctx.closePath(); ctx.stroke();
                      ctx.strokeStyle = "#222"; ctx.lineWidth = 1;
                      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
                      pts.forEach(p => ctx.lineTo(p.x, p.y)); ctx.closePath(); ctx.stroke();
                      ctx.setLineDash([]); ctx.restore();
                    }
                  }}

                  onMouseEnter={ev => {
                    if (pixelTool !== "eraser" || pixelDrawingRef.current) return;
                    const el = pixelCanvasRef.current!;
                    const rect = el.getBoundingClientRect();
                    const sx = el.width / rect.width; const sy = el.height / rect.height;
                    const x = (ev.clientX - rect.left) * sx;
                    const y = (ev.clientY - rect.top) * sy;
                    const ctx = el.getContext("2d")!;
                    const snap = pixelSnapshotRef.current;
                    if (snap) ctx.putImageData(snap, 0, 0);
                    ctx.save();
                    ctx.beginPath(); ctx.arc(x, y, pixelBrushSize / 2, 0, Math.PI * 2);
                    ctx.strokeStyle = "#4f46e5"; ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]);
                    ctx.stroke(); ctx.setLineDash([]); ctx.restore();
                  }}

                  onKeyDown={ev => {
                    ev.stopPropagation();
                    const el = pixelCanvasRef.current!;
                    const ctx = el.getContext("2d")!;
                    if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && ev.key.toLowerCase() === "z") {
                      const prev = pixelUndoStack.current.pop();
                      if (prev) { ctx.putImageData(prev, 0, 0); setLassoSelected(false); lassoSelectionRef.current = []; }
                      return;
                    }
                    const pts = lassoSelectionRef.current;
                    if (!pts.length) return;
                    if (ev.key === "Delete" || ev.key === "Backspace") {
                      pixelUndoStack.current.push(ctx.getImageData(0, 0, el.width, el.height));
                      ctx.save();
                      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
                      pts.forEach(p => ctx.lineTo(p.x, p.y)); ctx.closePath();
                      ctx.globalCompositeOperation = "destination-out"; ctx.fill();
                      ctx.restore();
                      setLassoSelected(false); lassoSelectionRef.current = [];
                    }
                    if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && ev.key.toLowerCase() === "i") {
                      pixelUndoStack.current.push(ctx.getImageData(0, 0, el.width, el.height));
                      ctx.save();
                      ctx.beginPath(); ctx.rect(0, 0, el.width, el.height);
                      ctx.moveTo(pts[0].x, pts[0].y);
                      pts.forEach(p => ctx.lineTo(p.x, p.y)); ctx.closePath();
                      ctx.globalCompositeOperation = "destination-out"; ctx.fill();
                      ctx.restore();
                      setLassoSelected(false); lassoSelectionRef.current = [];
                    }
                  }}
                  tabIndex={0}
                  autoFocus
                />
              );
            })()}
          </div>
        </div>

        {/* ── RIGHT: PROPERTIES + LAYERS ───────────────── */}
        <div className="w-56 bg-white border-l border-gray-200 flex flex-col flex-shrink-0 overflow-y-auto text-xs">
          {pixelEditMode ? (
            <div className="p-3 flex flex-col gap-3">
              <p className="font-semibold text-blue-900 text-xs uppercase tracking-wide">Edição de pixels</p>
              <p className="text-blue-700 text-xs leading-relaxed">
                <b>Duplo clique</b> na imagem — aplica e sai
              </p>
              <p className="text-gray-500 text-xs leading-relaxed">
                <b>Ctrl+Z</b> — desfazer<br/>
                <b>Esc</b> — sair sem salvar
              </p>
              {pixelTool === "lasso" && (
                <div className="bg-blue-50 rounded-lg p-2 flex flex-col gap-1">
                  <p className="text-blue-700 text-xs font-medium">Laço</p>
                  <p className="text-blue-600 text-xs leading-relaxed">
                    Arraste para selecionar.<br/>
                    <b>Delete</b> — apaga seleção<br/>
                    <b>Ctrl+Shift+I</b> — inverte seleção
                  </p>
                  {lassoSelected && <p className="text-green-600 text-xs">✓ Seleção ativa</p>}
                </div>
              )}
              {pixelTool === "stamp" && (
                <div className="bg-blue-50 rounded-lg p-2">
                  <p className="text-blue-700 text-xs font-medium mb-1">Carimbo clone</p>
                  <p className="text-blue-600 text-xs leading-relaxed">
                    <b>Alt+clique</b> — define fonte<br/>
                    Arraste para clonar
                  </p>
                  {stampSourceRef.current
                    ? <p className="text-green-600 text-xs mt-1">✓ Fonte definida</p>
                    : <p className="text-orange-500 text-xs mt-1">Fonte não definida</p>
                  }
                </div>
              )}
            </div>
          ) : null}
          {!pixelEditMode && isEditingNodes && (
            <div className="p-3 bg-indigo-50 border-b border-indigo-100 flex flex-col gap-2">
              <p className="font-semibold text-indigo-900">Modo Edição de Nós</p>
              <p className="text-[11px] text-indigo-700">
                • <b>Clique sobre o traçado</b> para inserir novas vértices no Mesh.<br/>
                • Arraste vértices azuis para mover pontos com suas curvas acompanhando.<br/>
                • Arraste pontos vermelhos para ajustar a curvatura.<br/>
                • <b>Ctrl+D</b>: Alternar curva/canto reto.<br/>
                • <b>Del</b>: Remover vértice.
              </p>
              <button
                onClick={toggleNodeSmooth}
                className="w-full py-1 bg-white border border-indigo-200 text-indigo-700 rounded-md text-xs hover:bg-indigo-100 transition"
              >
                Alternar Curva / Canto
              </button>
              <button
                onClick={exitEditNodes}
                className="w-full py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition mt-1"
              >
                Concluir edição (Enter / Esc)
              </button>
            </div>
          )}

          {!pixelEditMode && (sel ? (
            <div className="p-3 flex flex-col gap-3 border-b border-gray-200">

              {isEditableShape && !isEditingNodes && (
                <button
                  onClick={() => enterEditNodes(sel)}
                  className="w-full py-2 bg-indigo-50 text-indigo-700 font-medium rounded-lg border border-indigo-200 hover:bg-indigo-100 transition"
                >
                  ✎ Editar Nós / Pontos
                </button>
              )}

              {/* Operações Booleanas (Paper.js) */}
              {isMultiShapeSelected && (
                <div className="flex flex-col gap-1.5 p-2 bg-slate-50 border border-slate-200 rounded-xl">
                  <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Operações Booleanas</p>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      onClick={() => applyBooleanOperation("unite")}
                      title="União de formas"
                      className="px-2 py-1.5 bg-white border border-slate-200 hover:bg-indigo-50 hover:border-indigo-300 rounded-lg text-slate-700 transition flex items-center justify-center gap-1 text-[11px]"
                    >
                      <span>∪</span> União
                    </button>
                    <button
                      onClick={() => applyBooleanOperation("subtract")}
                      title="Subtrair forma da frente"
                      className="px-2 py-1.5 bg-white border border-slate-200 hover:bg-indigo-50 hover:border-indigo-300 rounded-lg text-slate-700 transition flex items-center justify-center gap-1 text-[11px]"
                    >
                      <span>−</span> Subtrair
                    </button>
                    <button
                      onClick={() => applyBooleanOperation("intersect")}
                      title="Interseção de formas"
                      className="px-2 py-1.5 bg-white border border-slate-200 hover:bg-indigo-50 hover:border-indigo-300 rounded-lg text-slate-700 transition flex items-center justify-center gap-1 text-[11px]"
                    >
                      <span>∩</span> Interseção
                    </button>
                    <button
                      onClick={() => applyBooleanOperation("exclude")}
                      title="Excluir sobreposição"
                      className="px-2 py-1.5 bg-white border border-slate-200 hover:bg-indigo-50 hover:border-indigo-300 rounded-lg text-slate-700 transition flex items-center justify-center gap-1 text-[11px]"
                    >
                      <span>⨁</span> Exclusão
                    </button>
                  </div>
                </div>
              )}

              {sel?.type === "activeSelection" && (() => {
                const objs = (sel as any).getObjects();
                const hasImage = objs.some((o: any) => o.type === "image");
                const hasShape = objs.some((o: any) => o.type !== "image");
                return hasImage && hasShape;
              })() && (
                <button onClick={createMask}
                  className="w-full py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-xs font-medium">
                  ✂ Criar máscara
                </button>
              )}

              {hasClipPath && (
                <button onClick={removeMask}
                  className="w-full py-2 bg-amber-50 text-amber-700 font-medium rounded-lg border border-amber-200 hover:bg-amber-100 transition text-xs">
                  ↺ Desfazer máscara
                </button>
              )}

              {sel.type !== "image" && sel.type !== "activeSelection" && (
                <>
                  <Sec title="Preenchimento" />
                  {!selFillGradient && (
                    <ColorPickerWithNone
                      value={selFill}
                      onChange={v => { (isText ? updateFillForText : updateFill)(v); setSelFillGradient(null); }}
                    />
                  )}
                  <GradientEditor value={selFillGradient} onChange={updateFillGradient} />
                </>
              )}

              {sel.type !== "activeSelection" && (
                <>
                  <Sec title="Opacidade" />
                  <SliderRow label="" value={selOpacity} min={0} max={100} unit="%" onChange={updateOpacity} />
                </>
              )}

              {sel.type !== "image" && sel.type !== "activeSelection" && (
                <>
                  <Sec title="Borda" />
                  <ColorPickerWithNone
                    value={selStroke}
                    onChange={v => { setSelStroke(v); updateStroke(v === "transparent" ? "" : v); if (v === "transparent") { setSelStrokeW(0); updateStrokeW(0); } }}
                  />
                  <SliderRow label="Espessura" value={selStrokeW} min={0} max={50} onChange={v => { setSelStrokeW(v); updateStrokeW(v); }} />
                </>
              )}

              {sel.type !== "activeSelection" && (
                <>
                  <Sec title="Rotação" />
                  <SliderRow label="" value={selRotation} min={0} max={360} unit="°" onChange={updateRotation} />
                </>
              )}

              {isRect && (
                <>
                  <Sec title="Arredondamento" />
                  <SliderRow label="" value={selRadius} min={0} max={200} onChange={v => { setSelRadius(v); updateRadius(v); }} />
                </>
              )}

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
                    <p className="text-gray-400 mb-1.5">Alinhamento</p>
                    <div className="flex gap-1">
                      {(["left","center","right","justify"] as const).map(a => (
                        <button key={a} onClick={() => updateTextAlign(a)}
                          className={`flex-1 py-1.5 rounded-lg border text-xs transition ${selTextAlign===a ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                          {a==="left"?"⬅":a==="center"?"↔":a==="right"?"➡":"☰"}
                        </button>
                      ))}
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
                      <NumRow label="Largura (px)" value={selTextWidth} min={50} max={Math.round(canvasWidth)} onChange={updateTextWidth} />
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-gray-400">Altura (px)</p>
                          <span className="text-xs text-gray-300">0 = automático</span>
                        </div>
                        <input
                          type="number" value={selTextHeight} min={0} max={Math.round(canvasHeight)}
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

              {sel.type !== "activeSelection" && (
                <>
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
                </>
              )}

              {sel.type === "image" && (
                <>
                  <Sec title="Imagem" />
                  <button
                    onClick={() => setShowGradientMask(v => !v)}
                    className={`w-full py-2 rounded-lg border transition text-xs font-medium ${showGradientMask ? "bg-purple-600 text-white border-purple-600" : "border-purple-200 text-purple-600 hover:bg-purple-50"}`}>
                    🎭 {showGradientMask ? "Fechar máscara" : "Máscara com gradiente"}
                  </button>
                  {showGradientMask && (
                    <div className="flex flex-col gap-2 p-2 border border-purple-100 rounded-lg">
                      {/* Tipo */}
                      <div className="flex gap-1">
                        <button onClick={() => setGradMaskType("linear")}
                          className={`flex-1 py-1 rounded-lg border text-xs transition ${gradMaskType==="linear" ? "bg-purple-600 text-white border-purple-600" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                          Linear
                        </button>
                        <button onClick={() => setGradMaskType("radial")}
                          className={`flex-1 py-1 rounded-lg border text-xs transition ${gradMaskType==="radial" ? "bg-purple-600 text-white border-purple-600" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                          Radial
                        </button>
                      </div>
                      <div className="flex gap-1">
                        <div className="flex-1">
                          <p className="text-gray-400 mb-1" style={{fontSize:10}}>Cor inicial</p>
                          <input type="color" value={gradMaskC1} onChange={e => setGradMaskC1(e.target.value)} className="w-7 h-7 rounded border border-gray-200 cursor-pointer p-0" />
                        </div>
                        <div className="flex-1">
                          <p className="text-gray-400 mb-1" style={{fontSize:10}}>Opac. inicial</p>
                          <input type="range" min={0} max={1} step={0.01} value={gradMaskA1}
                            onChange={e => setGradMaskA1(+e.target.value)} className="w-full accent-indigo-600" />
                          <span className="text-gray-400" style={{fontSize:9}}>{Math.round(gradMaskA1*100)}%</span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <div className="flex-1">
                          <p className="text-gray-400 mb-1" style={{fontSize:10}}>Cor final</p>
                          <input type="color" value={gradMaskC2} onChange={e => setGradMaskC2(e.target.value)} className="w-7 h-7 rounded border border-gray-200 cursor-pointer p-0" />
                        </div>
                        <div className="flex-1">
                          <p className="text-gray-400 mb-1" style={{fontSize:10}}>Opac. final</p>
                          <input type="range" min={0} max={1} step={0.01} value={gradMaskA2}
                            onChange={e => setGradMaskA2(+e.target.value)} className="w-full accent-indigo-600" />
                          <span className="text-gray-400" style={{fontSize:9}}>{Math.round(gradMaskA2*100)}%</span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <div className="flex-1">
                          <p className="text-gray-400 mb-1" style={{fontSize:10}}>Pos. inicial</p>
                          <input type="range" min={0} max={100} value={gradMaskP1}
                            onChange={e => setGradMaskP1(+e.target.value)} className="w-full accent-indigo-600" />
                          <span className="text-gray-400" style={{fontSize:9}}>{gradMaskP1}%</span>
                        </div>
                        <div className="flex-1">
                          <p className="text-gray-400 mb-1" style={{fontSize:10}}>Pos. final</p>
                          <input type="range" min={0} max={100} value={gradMaskP2}
                            onChange={e => setGradMaskP2(+e.target.value)} className="w-full accent-indigo-600" />
                          <span className="text-gray-400" style={{fontSize:9}}>{gradMaskP2}%</span>
                        </div>
                      </div>
                      {gradMaskType === "linear" && (
                        <div>
                          <p className="text-gray-400 mb-1" style={{fontSize:10}}>Ângulo: {gradMaskAngle}°</p>
                          <input type="range" min={0} max={360} value={gradMaskAngle}
                            onChange={e => setGradMaskAngle(+e.target.value)} className="w-full accent-indigo-600" />
                        </div>
                      )}
                      {/* Preview */}
                      <div style={{
                        height: 20, borderRadius: 6,
                        background: gradMaskType === "radial"
                          ? `radial-gradient(circle, ${gradMaskC2}${Math.round(gradMaskA2*255).toString(16).padStart(2,"0")} ${100-gradMaskP2}%, ${gradMaskC1}${Math.round(gradMaskA1*255).toString(16).padStart(2,"0")} ${100-gradMaskP1}%)`
                          : `linear-gradient(${gradMaskAngle - 90}deg, ${gradMaskC2}${Math.round(gradMaskA2*255).toString(16).padStart(2,"0")} ${100-gradMaskP2}%, ${gradMaskC1}${Math.round(gradMaskA1*255).toString(16).padStart(2,"0")} ${100-gradMaskP1}%)`
                      }} />
                      <button onClick={applyGradientMask}
                        className="w-full py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 transition">
                        Aplicar máscara
                      </button>
                      {(sel as any).__originalSrc && (
                        <button onClick={removeGradientMask}
                          className="w-full py-1.5 border border-red-200 text-red-500 rounded-lg text-xs hover:bg-red-50 transition">
                          Remover máscara
                        </button>
                      )}
                    </div>
                  )}
                  <Sec title="Saturação" />
                  <SliderRow label="" value={Math.round(selSaturation * 100)} min={-100} max={100} unit="%" onChange={v => updateSaturation(v / 100)} />
                  <div className="flex justify-between text-gray-300 mt-0.5" style={{fontSize:9}}><span>P&amp;B</span><span>Normal</span><span>Vivo</span></div>
                </>
              )}

              {sel.type !== "activeSelection" && (
                <>
                  <Sec title="Blur" />
                  <SliderRow label="" value={selBlur} min={0} max={100} onChange={updateBlur} />
                </>
              )}

              <Sec title="Alinhar" />
              <div className="grid grid-cols-3 gap-1">
                {([["left","←□"],["hcenter","□↔"],["right","□→"],["top","↑□"],["vcenter","□↕"],["bottom","□↓"]] as [string,string][]).map(([dir,icon]) => (
                  <button key={dir} onClick={() => alignObj(dir)} title={dir}
                    className="py-1.5 text-center border border-gray-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-300 text-gray-500 transition" style={{fontSize:10}}>{icon}</button>
                ))}
              </div>

              <button onClick={deleteSelected} className="w-full py-2 mt-1 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition font-medium">
                🗑 {sel.type === "activeSelection" ? `Remover (${(sel as any).getObjects().length})` : "Remover"}
              </button>
            </div>
          ) : (
            <div className="p-3 flex flex-col gap-3 border-b border-gray-200">
              <p className="font-semibold text-gray-600 uppercase tracking-wide" style={{fontSize:10}}>Fundo do canvas</p>
              <ColorPicker value={bgSolid} onChange={bg => { setBgSolid(bg); setBgGradient(null); }} label="" />
              <GradientEditor value={bgGradient} onChange={g => { if (g) setBgGradient(g); else setBgGradient(null); }} />
            </div>
          ))}

          {!pixelEditMode && <div className="flex flex-col flex-1">
            <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
              <p className="font-semibold text-gray-500 uppercase tracking-wide" style={{fontSize:10}}>Camadas</p>
              {selectedUids.length > 1 && (
                <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-medium">
                  {selectedUids.length} sel
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {layers.length === 0 ? (
                <p className="text-gray-400 p-3 text-center">Sem elementos</p>
              ) : layers.map((layer, index) => {
                const isActive = selectedUids.includes(layer.id);
                return (
                  <div key={layer.id} draggable
                    onDragStart={e => e.dataTransfer.setData("li", String(index))}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      e.preventDefault();
                      const from = parseInt(e.dataTransfer.getData("li"));
                      if (from === index || !fc.current) return;
                      const canvas = fc.current;
                      const objs = [...canvas.getObjects().filter((o: any) => !o.isControlHelper && !o.isEditPreview)];
                      const total = objs.length;
                      const [moving] = objs.splice(total-1-from, 1);
                      objs.splice(total-1-index, 0, moving);
                      objs.forEach((o: any, i: number) => { canvas.remove(o); canvas.insertAt(o, i, false); });
                      canvas.requestRenderAll(); refreshLayers(canvas);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-2 cursor-grab active:cursor-grabbing transition select-none ${isActive ? "bg-indigo-50 text-indigo-700 font-semibold border-l-2 border-indigo-600" : "text-gray-600 hover:bg-gray-50"}`}>
                    <svg width="8" height="12" viewBox="0 0 8 12" fill="none" className="flex-shrink-0 text-gray-300">
                      <circle cx="2" cy="2" r="1.2" fill="currentColor"/><circle cx="6" cy="2" r="1.2" fill="currentColor"/>
                      <circle cx="2" cy="6" r="1.2" fill="currentColor"/><circle cx="6" cy="6" r="1.2" fill="currentColor"/>
                      <circle cx="2" cy="10" r="1.2" fill="currentColor"/><circle cx="6" cy="10" r="1.2" fill="currentColor"/>
                    </svg>
                    <span className="flex-1 truncate text-xs cursor-pointer" onClick={(e) => {
                      const canvas = fc.current;
                      if (!canvas) return;
                      const clickedObj = canvas.getObjects().find((o: any) => o.__uid === layer.id);
                      if (!clickedObj) return;

                      if (e.shiftKey) {
                        const active = canvas.getActiveObject();
                        if (active && active.type === "activeSelection") {
                          const currentObjs = (active as any).getObjects();
                          if (currentObjs.includes(clickedObj)) {
                            const remaining = currentObjs.filter((o: any) => o !== clickedObj);
                            if (remaining.length === 1) canvas.setActiveObject(remaining[0]);
                            else canvas.setActiveObject(new (window as any).fabric.ActiveSelection(remaining, { canvas }));
                          } else {
                            canvas.setActiveObject(new (window as any).fabric.ActiveSelection([...currentObjs, clickedObj], { canvas }));
                          }
                        } else if (active && active !== clickedObj) {
                          canvas.setActiveObject(new (window as any).fabric.ActiveSelection([active, clickedObj], { canvas }));
                        } else {
                          canvas.setActiveObject(clickedObj);
                        }
                      } else {
                        canvas.setActiveObject(clickedObj);
                      }
                      canvas.requestRenderAll();
                      syncSel(canvas.getActiveObject());
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
          </div>}
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