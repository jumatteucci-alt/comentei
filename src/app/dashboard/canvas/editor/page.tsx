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
type GradValue = { stops: GradStop[]; angle: number; type: "linear" | "radial" };

function parseGradientColor(color: string, explicitOpacity?: number): { color: string; opacity: number } {
  const raw = (color || "#000000").trim();
  let opacity = explicitOpacity ?? 1;

  if (raw.startsWith("#")) {
    let hex = raw.slice(1);
    if (hex.length === 3 || hex.length === 4) hex = hex.split("").map(ch => ch + ch).join("");
    if (hex.length === 8) {
      opacity *= parseInt(hex.slice(6, 8), 16) / 255;
      hex = hex.slice(0, 6);
    }
    if (/^[0-9a-fA-F]{6}$/.test(hex)) return { color: `#${hex.toLowerCase()}`, opacity: Math.max(0, Math.min(1, opacity)) };
  }

  const m = raw.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (m) {
    const clamp = (n:number) => Math.max(0, Math.min(255, Math.round(n)));
    const toHex = (n:number) => clamp(n).toString(16).padStart(2, "0");
    if (m[4] !== undefined) opacity *= Math.max(0, Math.min(1, Number(m[4])));
    return { color: `#${toHex(Number(m[1]))}${toHex(Number(m[2]))}${toHex(Number(m[3]))}`, opacity: Math.max(0, Math.min(1, opacity)) };
  }

  return { color: "#000000", opacity: Math.max(0, Math.min(1, opacity)) };
}

function gradientFromFabric(fill: any): GradValue | null {
  if (!fill?.colorStops?.length) return null;
  const stops: GradStop[] = fill.colorStops.map((s: any) => {
    const parsed = parseGradientColor(s.color || "#000000", typeof s.opacity === "number" ? s.opacity : 1);
    return { color: parsed.color, opacity: parsed.opacity, pos: Math.round(Math.max(0, Math.min(1, Number(s.offset ?? 0))) * 1000) / 10 };
  });
  const type: "linear" | "radial" = fill.type === "radial" ? "radial" : "linear";
  let angle = 90;
  if (type === "linear" && fill.coords) {
    const dx = Number(fill.coords.x2 ?? 0) - Number(fill.coords.x1 ?? 0);
    const dy = Number(fill.coords.y2 ?? 0) - Number(fill.coords.y1 ?? 0);
    if (dx || dy) angle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
  }
  return { stops, angle, type };
}

function GradientEditor({ value, onChange }: { value: GradValue; onChange: (g: GradValue) => void }) {
  const [selectedStop, setSelectedStop] = useState(0);
  const [draggingStop, setDraggingStop] = useState<number | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const g = value;

  useEffect(() => {
    if (selectedStop >= g.stops.length) setSelectedStop(Math.max(0, g.stops.length - 1));
  }, [g.stops.length, selectedStop]);

  const rgba = (st: GradStop) => {
    const parsed = parseGradientColor(st.color, st.opacity);
    const hex = parsed.color;
    const r = parseInt(hex.slice(1,3),16), gr = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${gr},${b},${parsed.opacity})`;
  };
  const sortedStops = [...g.stops].sort((a,b) => a.pos - b.pos);
  const previewGrad = sortedStops.map(st => `${rgba(st)} ${st.pos}%`).join(", ");
  const previewBackground = g.type === "radial"
    ? `radial-gradient(circle at center, ${previewGrad})`
    : `linear-gradient(${(g.angle + 90) % 360}deg, ${previewGrad})`;

  const updateStop = (i: number, patch: Partial<GradStop>) => {
    const stops = g.stops.map((st, idx) => idx === i ? { ...st, ...patch } : st);
    onChange({ ...g, stops });
  };

  const colorAt = (pos: number) => {
    const stops = sortedStops;
    const before = [...stops].reverse().find(st => st.pos <= pos) || stops[0];
    const after = stops.find(st => st.pos >= pos) || stops[stops.length - 1];
    if (!before || !after || before === after || before.pos === after.pos) return { color: before?.color || "#ffffff", opacity: before?.opacity ?? 1 };
    const t = (pos - before.pos) / (after.pos - before.pos);
    const p1 = parseGradientColor(before.color, before.opacity), p2 = parseGradientColor(after.color, after.opacity);
    const hexToRgb = (hex: string) => [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
    const [r1,g1,b1] = hexToRgb(p1.color), [r2,g2,b2] = hexToRgb(p2.color);
    const toHex = (n:number) => Math.round(n).toString(16).padStart(2,"0");
    return {
      color: `#${toHex(r1+(r2-r1)*t)}${toHex(g1+(g2-g1)*t)}${toHex(b1+(b2-b1)*t)}`,
      opacity: p1.opacity + (p2.opacity - p1.opacity) * t,
    };
  };

  const posFromPointer = (clientX: number, clientY?: number) => {
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    if (g.type === "radial" && typeof clientY === "number") {
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      const dx = clientX - cx, dy = clientY - cy;
      const maxR = Math.max(1, Math.min(rect.width, rect.height) / 2);
      return Math.max(0, Math.min(100, Math.sqrt(dx*dx + dy*dy) / maxR * 100));
    }
    return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
  };

  const addStopAt = (clientX: number, clientY: number) => {
    const pos = posFromPointer(clientX, clientY);
    const sampled = colorAt(pos);
    const next = [...g.stops, { color: sampled.color, opacity: sampled.opacity, pos }];
    onChange({ ...g, stops: next });
    setSelectedStop(next.length - 1);
  };

  const removeSelected = () => {
    if (g.stops.length <= 2) return;
    const stops = g.stops.filter((_, i) => i !== selectedStop);
    onChange({ ...g, stops });
    setSelectedStop(Math.max(0, Math.min(selectedStop - 1, stops.length - 1)));
  };

  const current = g.stops[selectedStop] || g.stops[0];

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-1">
        <button type="button" onClick={() => onChange({ ...g, type: "linear" })}
          className={`py-1.5 rounded-lg border text-xs transition ${g.type === "linear" ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
          Linear
        </button>
        <button type="button" onClick={() => onChange({ ...g, type: "radial" })}
          className={`py-1.5 rounded-lg border text-xs transition ${g.type === "radial" ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
          Radial
        </button>
      </div>

      {g.type === "linear" && (
        <SliderRow label="Orientação" value={Math.round(g.angle)} min={0} max={360} unit="°" onChange={angle => onChange({ ...g, angle })} />
      )}

      <div
        ref={previewRef}
        className="relative h-14 rounded-lg border border-gray-200 cursor-crosshair select-none"
        style={{ background: previewBackground }}
        onPointerDown={e => { if (e.target === e.currentTarget) addStopAt(e.clientX, e.clientY); }}
        onPointerMove={e => {
          if (draggingStop === null) return;
          updateStop(draggingStop, { pos: posFromPointer(e.clientX, e.clientY) });
        }}
        onPointerUp={() => setDraggingStop(null)}
        onPointerCancel={() => setDraggingStop(null)}
        onPointerLeave={() => { if (draggingStop !== null) setDraggingStop(null); }}
      >
        {g.stops.map((st, i) => (
          <button
            key={i}
            type="button"
            title="Arraste para mover este ponto"
            onPointerDown={e => { e.stopPropagation(); setSelectedStop(i); setDraggingStop(i); (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); }}
            onPointerUp={e => { e.stopPropagation(); setDraggingStop(null); }}
            style={{
              position: "absolute", left: `${st.pos}%`, bottom: -7, transform: "translateX(-50%)",
              width: 15, height: 15, borderRadius: "50%", background: rgba(st),
              border: i === selectedStop ? "3px solid #4f46e5" : "2px solid white",
              boxShadow: "0 0 0 1px rgba(0,0,0,.25)", cursor: "ew-resize",
            }}
          />
        ))}
      </div>

      {current && (
        <div className="mt-2 flex flex-col gap-2 p-2 border border-gray-100 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Ponto selecionado</span>
            {g.stops.length > 2 && (
              <button type="button" onClick={removeSelected} className="text-xs text-red-400 hover:text-red-600">Excluir ponto</button>
            )}
          </div>
          <div className="flex gap-1.5">
            <input type="color" value={parseGradientColor(current.color).color}
              onChange={e => updateStop(selectedStop, { color: e.target.value })}
              className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0 flex-shrink-0" />
            <input type="text" value={current.color}
              onChange={e => updateStop(selectedStop, { color: e.target.value })}
              className="flex-1 px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-indigo-400 min-w-0" />
          </div>
          <SliderRow label="Opacidade" value={Math.round(current.opacity * 100)} min={0} max={100} unit="%" onChange={v => updateStop(selectedStop, { opacity: v / 100 })} />
        </div>
      )}
    </div>
  );
}

function FillColorPickerWithGradient({ solid, gradient, onSolid, onGradient }: { solid: string; gradient: GradValue | null; onSolid: (c:string)=>void; onGradient: (g:GradValue)=>void }) {
  const isNone = solid === "transparent" || solid === "";
  const defaultGradient: GradValue = { stops: [{ color:"#4f46e5", opacity:1, pos:0 }, { color:"#ec4899", opacity:1, pos:100 }], angle: 90, type: "linear" };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1 mb-1">
        <button onClick={() => onSolid("transparent")} title="Sem cor"
          style={{ outline: !gradient && isNone ? "2px solid #4f46e5" : "1px solid #e4e4e0", outlineOffset: "1px", background: "#fff" }}
          className="relative w-5 h-5 rounded overflow-hidden flex-shrink-0 transition">
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom right, transparent calc(50% - 1px), #ef4444 calc(50% - 1px), #ef4444 calc(50% + 1px), transparent calc(50% + 1px))" }} />
        </button>
        <button onClick={() => onGradient(gradient || defaultGradient)} title="Gradiente"
          style={{ background: "linear-gradient(135deg,#4f46e5,#22c55e,#f59e0b,#ec4899)", outline: gradient ? "2px solid #4f46e5" : "1px solid #e4e4e0", outlineOffset: "1px" }}
          className="w-5 h-5 rounded transition flex-shrink-0" />
        {SWATCHES.map(col => (
          <button key={col} onClick={() => onSolid(col)}
            style={{ background: col, outline: !gradient && solid === col ? "2px solid #4f46e5" : "1px solid #e4e4e0", outlineOffset: "1px" }}
            className="w-5 h-5 rounded transition flex-shrink-0" />
        ))}
      </div>
      {gradient ? (
        <GradientEditor value={gradient} onChange={onGradient} />
      ) : !isNone ? (
        <div className="flex gap-1.5">
          <input type="color" value={solid.startsWith("#") ? solid : "#000000"}
            onChange={e => onSolid(e.target.value)} className="w-7 h-7 rounded border border-gray-200 cursor-pointer p-0 flex-shrink-0" />
          <input type="text" value={solid} onChange={e => onSolid(e.target.value)}
            className="flex-1 px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-indigo-400 min-w-0" />
        </div>
      ) : null}
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

function applyGradient(fc: any, obj: any, g: GradValue) {
  const fabric = (window as any).fabric;
  const w = (obj.width || 100) * (obj.scaleX || 1);
  const h = (obj.height || 100) * (obj.scaleY || 1);
  const colorStops = g.stops.map(st => {
    const parsed = parseGradientColor(st.color, st.opacity);
    const hex = parsed.color;
    const r = parseInt(hex.slice(1,3),16), gr = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return { offset: st.pos/100, color: `rgba(${r},${gr},${b},${parsed.opacity})` };
  });

  let gradient: any;
  if (g.type === "radial") {
    const radius = Math.max(1, Math.min(w, h) / 2);
    gradient = new fabric.Gradient({
      type: "radial",
      coords: { x1: w/2, y1: h/2, r1: 0, x2: w/2, y2: h/2, r2: radius },
      colorStops,
    });
  } else {
    const rad = (g.angle * Math.PI) / 180;
    gradient = new fabric.Gradient({
      type: "linear",
      coords: {
        x1: (Math.cos(rad + Math.PI) + 1) / 2 * w,
        y1: (Math.sin(rad + Math.PI) + 1) / 2 * h,
        x2: (Math.cos(rad) + 1) / 2 * w,
        y2: (Math.sin(rad) + 1) / 2 * h,
      },
      colorStops,
    });
  }
  obj.__fillGradient = { type: g.type, angle: g.angle, stops: g.stops.map(st => ({ ...st })) };
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

  const applyVectorBlurRendering = (obj: any, value: number) => {
    if (!obj || obj.type === "image") return;
    obj.__vectorBlur = Math.max(0, value || 0);
    if (!obj.__vectorBlurOriginalRender) {
      obj.__vectorBlurOriginalRender = obj._render;
      obj._render = function(ctx: CanvasRenderingContext2D) {
        ctx.save();
        const blurValue = Math.max(0, this.__vectorBlur || 0);
        if (blurValue > 0) ctx.filter = `blur(${Math.max(0.25, blurValue * 0.3)}px)`;
        this.__vectorBlurOriginalRender.call(this, ctx);
        ctx.restore();
      };
    }
    obj.set({ padding: obj.__vectorBlur > 0 ? Math.ceil(obj.__vectorBlur * 1.2) : 0 });
    obj.dirty = true;
  };

  const copyBlurMetadata = (source: any, target: any) => {
    if (!source || !target) return;
    const blur = source.__vectorBlur ?? (source.__uid ? blurValueMap.current.get(source.__uid) : 0) ?? 0;
    if (target.type !== "image" && blur > 0) {
      target.__vectorBlur = blur;
      applyVectorBlurRendering(target, blur);
    }
  };

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
  const [selScaleX, setSelScaleX] = useState(100);
  const [selScaleY, setSelScaleY] = useState(100);
  const [selSkewX, setSelSkewX] = useState(0);
  const [selSkewY, setSelSkewY] = useState(0);
  const [selFlipX, setSelFlipX] = useState(false);
  const [selFlipY, setSelFlipY] = useState(false);
  const [lockTransformRatio, setLockTransformRatio] = useState(false);
  const [threeLoaded, setThreeLoaded] = useState(false);
  const [sel3DEnabled, setSel3DEnabled] = useState(false);
  const [sel3DDepth, setSel3DDepth] = useState(32);
  const [sel3DRotX, setSel3DRotX] = useState(0);
  const [sel3DRotY, setSel3DRotY] = useState(0);
  const [sel3DRotZ, setSel3DRotZ] = useState(0);
  const [sel3DPerspective, setSel3DPerspective] = useState(45);
  const [sel3DSideColor, setSel3DSideColor] = useState("#334155");
  const [sel3DLight, setSel3DLight] = useState(100);
  const [selShadow, setSelShadow] = useState(false);
  const [selShadowColor, setSelShadowColor] = useState("rgba(0,0,0,0.5)");
  const [selShadowBlur, setSelShadowBlur] = useState(10);
  const [selShadowX, setSelShadowX] = useState(5);
  const [selShadowY, setSelShadowY] = useState(5);
  const [selShadowOpacity, setSelShadowOpacity] = useState(1);
  const [selGlow, setSelGlow] = useState(false);
  const [selGlowColor, setSelGlowColor] = useState("#ffffff");
  const [selGlowBlur, setSelGlowBlur] = useState(20);
  const [selGlowDistance, setSelGlowDistance] = useState(0);
  const [selGlowOpacity, setSelGlowOpacity] = useState(1);
  const [selBlur, setSelBlur] = useState(0);
  const [selSaturation, setSelSaturation] = useState(0);
  const [selBrightness, setSelBrightness] = useState(0);
  const [selContrast, setSelContrast] = useState(0);
  const [selExposure, setSelExposure] = useState(0);
  const [selTemperature, setSelTemperature] = useState(0);
  const [selTint, setSelTint] = useState(0);
  const [selHighlights, setSelHighlights] = useState(0);
  const [selShadows, setSelShadows] = useState(0);
  const [selSharpness, setSelSharpness] = useState(0);
  const [selVignette, setSelVignette] = useState(0);
  const [cropMode, setCropMode] = useState(false);
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropW, setCropW] = useState(100);
  const [cropH, setCropH] = useState(100);
  const cropDragRef = useRef<{ mode: string; startX: number; startY: number; x: number; y: number; w: number; h: number } | null>(null);
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
  const [selFillGradient, setSelFillGradient] = useState<GradValue|null>(null);

  // Pixel editor
  const [pixelEditMode, setPixelEditMode] = useState(false);
  const [pixelTool, setPixelTool] = useState<"eraser"|"stamp"|"lasso"|"move">("eraser");
  const [pixelBrushSize, setPixelBrushSize] = useState(20);
  const [pixelSoftness, setPixelSoftness] = useState(0); // 0=hard, 1=soft
  const pixelSnapshotRef = useRef<ImageData|null>(null); // snapshot before brush stroke
  const pixelCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pixelEditImgRef = useRef<any>(null);
  const pixelOrigSrcRef = useRef<string>("");
  const pixelBaseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stampSourceRef = useRef<{x:number;y:number}|null>(null);
  // Clone stamp: once the first destination point is chosen, keep a fixed
  // source-to-destination offset so the sampled area follows the cursor,
  // like Photoshop's aligned clone stamp.
  const stampOffsetRef = useRef<{x:number;y:number}|null>(null);
  const stampStrokeSourceCanvasRef = useRef<HTMLCanvasElement|null>(null);
  const stampLastPointRef = useRef<{x:number;y:number}|null>(null);
  const lassoPointsRef = useRef<{x:number;y:number}[]>([]);
  const lassoActiveRef = useRef(false);
  const pixelDrawingRef = useRef(false);
  const [lassoSelected, setLassoSelected] = useState(false); // true = has active selection
  const lassoSelectionRef = useRef<{x:number;y:number}[]>([]); // closed lasso selection
  const pixelUndoStack = useRef<ImageData[]>([]); // undo history for pixel editor
  type PixelLayerEffects = {
    opacity?: number;
    saturation?: number;
    blur?: number;
    shadow?: boolean;
    shadowColor?: string;
    shadowBlur?: number;
    shadowX?: number;
    shadowY?: number;
    shadowOpacity?: number;
    glow?: boolean;
    glowColor?: string;
    glowBlur?: number;
    glowDistance?: number;
    glowOpacity?: number;
  };
  const DEFAULT_PIXEL_EFFECTS: Required<PixelLayerEffects> = {
    opacity: 1, saturation: 0, blur: 0,
    shadow: false, shadowColor: "#000000", shadowBlur: 10, shadowX: 5, shadowY: 5, shadowOpacity: 1,
    glow: false, glowColor: "#ffffff", glowBlur: 20, glowDistance: 0, glowOpacity: 1,
  };
  const [pixelLayers, setPixelLayers] = useState<{
    id:string; name:string; canvas:HTMLCanvasElement; offsetX:number; offsetY:number; scale:number;
    opacity?:number; saturation?:number; blur?:number;
    shadow?:boolean; shadowColor?:string; shadowBlur?:number; shadowX?:number; shadowY?:number; shadowOpacity?:number;
    glow?:boolean; glowColor?:string; glowBlur?:number; glowDistance?:number; glowOpacity?:number;
  }[]>([]);
  const [pixelBaseEffects, setPixelBaseEffects] = useState<Required<PixelLayerEffects>>(DEFAULT_PIXEL_EFFECTS);
  const [selectedPixelLayerId, setSelectedPixelLayerId] = useState<string|null>(null);
  const [selectedPixelLayerIds, setSelectedPixelLayerIds] = useState<string[]>([]);
  const PIXEL_BASE_ID = "__base__";
  const pixelBaseUidRef = useRef<string|null>(null);
  const pixelEditLayerIdRef = useRef<string|null>(null);
  const pixelMoveLayerRef = useRef<{id:string;canvas:HTMLCanvasElement;startX:number;startY:number;offsetX:number;offsetY:number}|null>(null);
  const pixelResizeLayerRef = useRef<{id:string;handle:"nw"|"ne"|"sw"|"se";startX:number;startY:number;startScale:number;startOffsetX:number;startOffsetY:number;baseWidth:number;baseHeight:number}|null>(null);
  const pixelMovingRef = useRef(false);
  const pixelResizingRef = useRef(false);

  // Always finish a drag even if the cursor is released outside the layer.
  useEffect(() => {
    const stopPixelInteraction = () => {
      // Mouseup can happen outside the editable canvas. Always end every pixel interaction.
      if (pixelDrawingRef.current && pixelCanvasRef.current) {
        const el = pixelCanvasRef.current;
        const ctx = el.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          const snap = ctx.getImageData(0, 0, el.width, el.height);
          pixelSnapshotRef.current = snap;
          pixelUndoStack.current.push(snap);
          if (pixelUndoStack.current.length > 30) pixelUndoStack.current.shift();
        }
      }
      pixelDrawingRef.current = false;
      lassoActiveRef.current = false;
      pixelMovingRef.current = false;
      pixelResizingRef.current = false;
      pixelMoveLayerRef.current = null;
      pixelResizeLayerRef.current = null;
      stampStrokeSourceCanvasRef.current = null;
      stampLastPointRef.current = null;
    };
    window.addEventListener("mouseup", stopPixelInteraction);
    return () => window.removeEventListener("mouseup", stopPixelInteraction);
  }, []);

  const [bgSolid, setBgSolid] = useState("#ffffff");
  const [bgGradient, setBgGradient] = useState<GradValue|null>(null);

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

    const threeScript = document.createElement("script");
    threeScript.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
    threeScript.onload = () => setThreeLoaded(true);
    document.head.appendChild(threeScript);

    try {
      const worker = new Worker("/rmbg-worker.js", { type: "module" });
      worker.postMessage({ type: "preload" });
      rmbgWorker.current = worker;
    } catch {}

    return () => {
      try { document.head.removeChild(script); } catch {}
      try { document.head.removeChild(otScript); } catch {}
      try { document.head.removeChild(paperScript); } catch {}
      try { document.head.removeChild(threeScript); } catch {}
    };
  }, []);

  useEffect(() => {
    if (!threeLoaded || !fc.current) return;
    fc.current.getObjects().forEach((o:any) => { if (o.__threeD?.enabled) refreshThreeDObject(o); });
    fc.current.requestRenderAll();
  }, [threeLoaded]);

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
    setSelScaleX(Math.round(Math.abs(obj.scaleX ?? 1) * 100));
    setSelScaleY(Math.round(Math.abs(obj.scaleY ?? 1) * 100));
    setSelSkewX(Math.round(obj.skewX || 0));
    setSelSkewY(Math.round(obj.skewY || 0));
    setSelFlipX((obj.scaleX ?? 1) < 0);
    setSelFlipY((obj.scaleY ?? 1) < 0);
    const d3 = obj.__threeD || {};
    setSel3DEnabled(!!d3.enabled);
    setSel3DDepth(Number(d3.depth ?? 32));
    setSel3DRotX(Number(d3.rotX ?? 0));
    setSel3DRotY(Number(d3.rotY ?? 0));
    setSel3DRotZ(Number(d3.rotZ ?? 0));
    setSel3DPerspective(Number(d3.perspective ?? 45));
    setSel3DSideColor(d3.sideColor || "#334155");
    setSel3DLight(Number(d3.light ?? 100));
    if (d3.enabled) requestAnimationFrame(() => refreshThreeDObject(obj));
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
    const glowOn = !!obj.__glowEnabled;
    setSelGlow(glowOn);
    setSelGlowColor(obj.__glowColor || "#ffffff");
    setSelGlowBlur(obj.__glowBlur ?? 20);
    setSelGlowDistance(obj.__glowDistance ?? 0);
    setSelGlowOpacity(obj.__glowOpacity ?? 1);
    setSelShadowOpacity(obj.__shadowOpacity ?? 1);
    setSelShadow(!!sh && !glowOn);
    if (sh && !glowOn) { setSelShadowColor(obj.__shadowBaseColor || sh.color || "#000000"); setSelShadowBlur(sh.blur||10); setSelShadowX(sh.offsetX||5); setSelShadowY(sh.offsetY||5); }
    const uid = obj.__uid;
    setSelBlur(obj.__vectorBlur ?? (uid && blurValueMap.current.has(uid) ? blurValueMap.current.get(uid)! : 0));
    const satFilter = (obj.filters||[]).find((f: any) => f.type === "Saturation");
    const adjustmentFilter = (obj.filters||[]).find((f: any) => f.type === "ComenteiAdjust");
    const imageAdjust = obj.__imageAdjustments || adjustmentFilter || {};
    setSelSaturation(imageAdjust.saturation ?? (satFilter ? (satFilter.saturation ?? 0) : 0));
    setSelBrightness(imageAdjust.brightness ?? 0);
    setSelContrast(imageAdjust.contrast ?? 0);
    setSelExposure(imageAdjust.exposure ?? 0);
    setSelTemperature(imageAdjust.temperature ?? 0);
    setSelTint(imageAdjust.tint ?? 0);
    setSelHighlights(imageAdjust.highlights ?? 0);
    setSelShadows(imageAdjust.shadows ?? 0);
    setSelSharpness(imageAdjust.sharpness ?? 0);
    setSelVignette(imageAdjust.vignette ?? 0);
    if (obj.type === "image") {
      const c = obj.__crop || { x: 0, y: 0, w: 100, h: 100 };
      setCropX(c.x ?? 0); setCropY(c.y ?? 0); setCropW(c.w ?? 100); setCropH(c.h ?? 100);
      setCropMode(false);
    }
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
      const restored = obj.__fillGradient || gradientFromFabric(fill);
      setSelFillGradient(restored ? {
        type: restored.type === "radial" ? "radial" : "linear",
        angle: typeof restored.angle === "number" ? restored.angle : 90,
        stops: restored.stops.map((st:any) => {
          const parsed = parseGradientColor(st.color, st.opacity);
          return { color: parsed.color, opacity: parsed.opacity, pos: Number(st.pos) };
        }),
      } : null);
    } else { setSelFillGradient(null); }
  };


  // ── Pixel editor ────────────────────────────────────────────────
  const enterPixelEdit = (imgObj: any) => {
    if (!fc.current || !imgObj || imgObj.type !== "image") return;
    pixelBaseUidRef.current = imgObj.__uid || (imgObj.__uid = Math.random().toString(36).slice(2));
    setSelectedPixelLayerId(null);
    setSelectedPixelLayerIds([PIXEL_BASE_ID]);
    pixelEditImgRef.current = imgObj;

    const storedLayers = Array.isArray(imgObj.__pixelLayers) ? imgObj.__pixelLayers : [];
    setPixelLayers(storedLayers);
    setPixelBaseEffects(getPixelEffects(imgObj.__pixelBaseEffects));

    const imgEl = imgObj._element as HTMLImageElement;
    const storedBase = imgObj.__pixelBaseCanvas as HTMLCanvasElement | undefined;
    const origC = document.createElement("canvas");
    origC.width = storedBase?.width || imgEl.naturalWidth || imgObj.width;
    origC.height = storedBase?.height || imgEl.naturalHeight || imgObj.height;
    const octx = origC.getContext("2d", { willReadFrequently: true })!;
    if (storedBase) octx.drawImage(storedBase, 0, 0);
    else octx.drawImage(imgEl, 0, 0);
    pixelBaseCanvasRef.current = origC;
    pixelOrigSrcRef.current = origC.toDataURL("image/png");

    imgObj.opacity = 0;
    fc.current.discardActiveObject();
    fc.current.requestRenderAll();
    setPixelEditMode(true);
  };

  const commitCurrentPixelSurface = () => {
    const el = pixelCanvasRef.current;
    if (!el || !el.width || !el.height) return;

    // Never persist the temporary lasso outline into the layer pixels.
    const clean = document.createElement("canvas");
    clean.width = el.width; clean.height = el.height;
    const cleanCtx = clean.getContext("2d", { willReadFrequently: true })!;
    if ((lassoSelected || lassoActiveRef.current) && pixelSnapshotRef.current) {
      cleanCtx.putImageData(pixelSnapshotRef.current, 0, 0);
    } else {
      cleanCtx.drawImage(el, 0, 0);
    }

    const currentLayerId = pixelEditLayerIdRef.current;
    if (currentLayerId) {
      setPixelLayers(prev => prev.map(l => l.id === currentLayerId ? { ...l, canvas: clean } : l));
    } else if (pixelEditImgRef.current || pixelBaseCanvasRef.current) {
      pixelBaseCanvasRef.current = clean;
    }
  };

  const resetPixelToolTransientState = () => {
    lassoPointsRef.current = [];
    lassoSelectionRef.current = [];
    lassoActiveRef.current = false;
    (lassoSelectionRef as any).inverted = false;
    setLassoSelected(false);
    stampSourceRef.current = null;
    stampOffsetRef.current = null;
    stampStrokeSourceCanvasRef.current = null;
    stampLastPointRef.current = null;
    pixelDrawingRef.current = false;
  };

  const applyAlignedCloneStamp = (
    ctx: CanvasRenderingContext2D,
    sampleCanvas: HTMLCanvasElement,
    destX: number,
    destY: number,
  ) => {
    const offset = stampOffsetRef.current;
    if (!offset) return;
    const size = Math.max(1, pixelBrushSize);
    const r = size / 2;
    const sourceX = destX + offset.x;
    const sourceY = destY + offset.y;

    ctx.save();
    ctx.beginPath();
    ctx.arc(destX, destY, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(
      sampleCanvas,
      sourceX - r, sourceY - r, size, size,
      destX - r, destY - r, size, size,
    );
    ctx.restore();
  };

  const switchPixelEditTarget = (targetId: string) => {
    if (!pixelEditMode) return;
    const currentId = pixelEditLayerIdRef.current || PIXEL_BASE_ID;
    if (currentId === targetId) {
      setSelectedPixelLayerId(targetId === PIXEL_BASE_ID ? null : targetId);
      setSelectedPixelLayerIds([targetId]);
      return;
    }

    commitCurrentPixelSurface();
    resetPixelToolTransientState();

    if (targetId === PIXEL_BASE_ID) {
      const baseObj = findPixelBaseObject();
      pixelEditLayerIdRef.current = null;
      pixelEditImgRef.current = baseObj;
      setSelectedPixelLayerId(null);
      setSelectedPixelLayerIds([PIXEL_BASE_ID]);
      requestAnimationFrame(() => {
        const el = pixelCanvasRef.current;
        const source = pixelBaseCanvasRef.current || baseObj?._element;
        if (!el || !source) return;
        el.width = (source as any).width || baseObj?.width || 1;
        el.height = (source as any).height || baseObj?.height || 1;
        el.dataset.initialized = "true";
        const ctx = el.getContext("2d", { willReadFrequently: true })!;
        ctx.clearRect(0, 0, el.width, el.height);
        ctx.drawImage(source, 0, 0, el.width, el.height);
        const snap = ctx.getImageData(0, 0, el.width, el.height);
        pixelSnapshotRef.current = snap;
        pixelUndoStack.current = [snap];
        el.focus();
      });
      return;
    }

    const layer = pixelLayers.find(l => l.id === targetId);
    if (!layer) return;
    pixelEditLayerIdRef.current = targetId;
    pixelEditImgRef.current = null;
    setSelectedPixelLayerId(targetId);
    setSelectedPixelLayerIds([targetId]);
    requestAnimationFrame(() => {
      const el = pixelCanvasRef.current;
      if (!el) return;
      el.width = layer.canvas.width; el.height = layer.canvas.height;
      el.dataset.initialized = "true";
      const ctx = el.getContext("2d", { willReadFrequently: true })!;
      ctx.clearRect(0, 0, el.width, el.height);
      ctx.drawImage(layer.canvas, 0, 0);
      const snap = ctx.getImageData(0, 0, el.width, el.height);
      pixelSnapshotRef.current = snap;
      pixelUndoStack.current = [snap];
      el.focus();
    });
  };

  const enterPixelLayerEdit = (layerId: string) => {
    switchPixelEditTarget(layerId);
  };

  const clearLassoVisual = () => {
    const el = pixelCanvasRef.current;
    if (el && pixelSnapshotRef.current) {
      const ctx = el.getContext("2d", { willReadFrequently: true });
      if (ctx) { ctx.putImageData(pixelSnapshotRef.current, 0, 0); pixelSnapshotRef.current = ctx.getImageData(0, 0, el.width, el.height); }
    }
    lassoPointsRef.current = [];
    lassoSelectionRef.current = [];
    lassoActiveRef.current = false;
    (lassoSelectionRef as any).inverted = false;
    setLassoSelected(false);
  };

  const getPixelEffects = (source?: PixelLayerEffects | null): Required<PixelLayerEffects> => ({
    ...DEFAULT_PIXEL_EFFECTS,
    ...(source || {}),
  });

  const colorWithOpacity = (color: string, opacity: number) => {
    const a = Math.max(0, Math.min(1, opacity));
    if (/^#[0-9a-fA-F]{6}$/.test(color)) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${a})`;
    }
    if (/^#[0-9a-fA-F]{3}$/.test(color)) {
      const r = parseInt(color[1] + color[1], 16);
      const g = parseInt(color[2] + color[2], 16);
      const b = parseInt(color[3] + color[3], 16);
      return `rgba(${r},${g},${b},${a})`;
    }
    const rgb = color.match(/rgba?\(([^)]+)\)/i);
    if (rgb) {
      const parts = rgb[1].split(',').map(v => v.trim());
      return `rgba(${parts[0]},${parts[1]},${parts[2]},${a})`;
    }
    return color;
  };

  const pixelEffectsCss = (source?: PixelLayerEffects | null) => {
    const fx = getPixelEffects(source);
    const parts: string[] = [];
    if (fx.blur > 0) parts.push(`blur(${fx.blur}px)`);
    if (fx.saturation !== 0) parts.push(`saturate(${Math.max(0, 1 + fx.saturation)})`);
    if (fx.shadow) parts.push(`drop-shadow(${fx.shadowX}px ${fx.shadowY}px ${fx.shadowBlur}px ${colorWithOpacity(fx.shadowColor, fx.shadowOpacity)})`);
    if (fx.glow) {
      const d = Math.max(0, fx.glowDistance);
      const b = Math.max(0, fx.glowBlur);
      // Glow is centered on the object. Distance expands the halo equally in all directions.
      parts.push(`drop-shadow(0 0 ${b}px ${colorWithOpacity(fx.glowColor, fx.glowOpacity)})`);
      if (d > 0) {
        const q = d * 0.7071;
        parts.push(
          `drop-shadow(${d}px 0 ${b}px ${colorWithOpacity(fx.glowColor, fx.glowOpacity)})`, `drop-shadow(${-d}px 0 ${b}px ${colorWithOpacity(fx.glowColor, fx.glowOpacity)})`,
          `drop-shadow(0 ${d}px ${b}px ${colorWithOpacity(fx.glowColor, fx.glowOpacity)})`, `drop-shadow(0 ${-d}px ${b}px ${colorWithOpacity(fx.glowColor, fx.glowOpacity)})`,
          `drop-shadow(${q}px ${q}px ${b}px ${colorWithOpacity(fx.glowColor, fx.glowOpacity)})`, `drop-shadow(${-q}px ${q}px ${b}px ${colorWithOpacity(fx.glowColor, fx.glowOpacity)})`,
          `drop-shadow(${q}px ${-q}px ${b}px ${colorWithOpacity(fx.glowColor, fx.glowOpacity)})`, `drop-shadow(${-q}px ${-q}px ${b}px ${colorWithOpacity(fx.glowColor, fx.glowOpacity)})`
        );
      }
    }
    return parts.length ? parts.join(" ") : "none";
  };

  const drawPixelSourceWithEffects = (
    ctx: CanvasRenderingContext2D,
    source: CanvasImageSource,
    x: number, y: number, w: number, h: number,
    effects?: PixelLayerEffects | null,
  ) => {
    const fx = getPixelEffects(effects);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, fx.opacity));
    const filters: string[] = [];
    if (fx.blur > 0) filters.push(`blur(${fx.blur}px)`);
    if (fx.saturation !== 0) filters.push(`saturate(${Math.max(0, 1 + fx.saturation)})`);
    if (fx.shadow) filters.push(`drop-shadow(${fx.shadowX}px ${fx.shadowY}px ${fx.shadowBlur}px ${colorWithOpacity(fx.shadowColor, fx.shadowOpacity)})`);
    if (fx.glow) {
      const d = Math.max(0, fx.glowDistance);
      const b = Math.max(0, fx.glowBlur);
      filters.push(`drop-shadow(0 0 ${b}px ${colorWithOpacity(fx.glowColor, fx.glowOpacity)})`);
      if (d > 0) {
        const q = d * 0.7071;
        filters.push(
          `drop-shadow(${d}px 0 ${b}px ${colorWithOpacity(fx.glowColor, fx.glowOpacity)})`, `drop-shadow(${-d}px 0 ${b}px ${colorWithOpacity(fx.glowColor, fx.glowOpacity)})`,
          `drop-shadow(0 ${d}px ${b}px ${colorWithOpacity(fx.glowColor, fx.glowOpacity)})`, `drop-shadow(0 ${-d}px ${b}px ${colorWithOpacity(fx.glowColor, fx.glowOpacity)})`,
          `drop-shadow(${q}px ${q}px ${b}px ${colorWithOpacity(fx.glowColor, fx.glowOpacity)})`, `drop-shadow(${-q}px ${q}px ${b}px ${colorWithOpacity(fx.glowColor, fx.glowOpacity)})`,
          `drop-shadow(${q}px ${-q}px ${b}px ${colorWithOpacity(fx.glowColor, fx.glowOpacity)})`, `drop-shadow(${-q}px ${-q}px ${b}px ${colorWithOpacity(fx.glowColor, fx.glowOpacity)})`
        );
      }
    }
    ctx.filter = filters.length ? filters.join(" ") : "none";
    ctx.drawImage(source, x, y, w, h);
    ctx.restore();
  };

  const updateSelectedPixelEffects = (patch: PixelLayerEffects) => {
    if (selectedPixelLayerIds.length !== 1) return;
    const id = selectedPixelLayerIds[0];
    if (id === PIXEL_BASE_ID) {
      setPixelBaseEffects(prev => ({ ...prev, ...patch }));
      return;
    }
    setPixelLayers(prev => prev.map(layer => layer.id === id ? { ...layer, ...patch } : layer));
  };

  const findPixelBaseObject = () => {
    if (!fc.current) return null;
    const objs = fc.current.getObjects();
    return objs.find((o:any) => o.__uid === pixelBaseUidRef.current && o.type === "image")
      || objs.find((o:any) => o.type === "image" && !o.__pixelLayerId)
      || null;
  };

  const renderPixelCompositeToProject = (baseObj: any, baseCanvas: HTMLCanvasElement, layersToRender: typeof pixelLayers) => {
    if (!fc.current || !baseObj) return;

    // Expand the visible image so every internal pixel layer is included, even
    // when a layer was moved outside the original base-image bounds.
    const effectPadding = (fxSource?: PixelLayerEffects | null) => {
      const fx = getPixelEffects(fxSource);
      const blurPad = fx.blur * 2;
      const shadowPadX = fx.shadow ? Math.abs(fx.shadowX) + fx.shadowBlur * 2 : 0;
      const shadowPadY = fx.shadow ? Math.abs(fx.shadowY) + fx.shadowBlur * 2 : 0;
      const glowPad = fx.glow ? Math.max(0, fx.glowDistance) + fx.glowBlur * 2 : 0;
      return { x: Math.ceil(blurPad + shadowPadX + glowPad), y: Math.ceil(blurPad + shadowPadY + glowPad) };
    };
    const basePad = effectPadding(pixelBaseEffects);
    const minX = Math.floor(Math.min(-basePad.x, ...layersToRender.map(layer => {
      const pad = effectPadding(layer);
      return (layer.offsetX || 0) - pad.x;
    })));
    const minY = Math.floor(Math.min(-basePad.y, ...layersToRender.map(layer => {
      const pad = effectPadding(layer);
      return (layer.offsetY || 0) - pad.y;
    })));
    const maxX = Math.ceil(Math.max(baseCanvas.width + basePad.x, ...layersToRender.map(layer => {
      const pad = effectPadding(layer);
      return (layer.offsetX || 0) + layer.canvas.width * (layer.scale || 1) + pad.x;
    })));
    const maxY = Math.ceil(Math.max(baseCanvas.height + basePad.y, ...layersToRender.map(layer => {
      const pad = effectPadding(layer);
      return (layer.offsetY || 0) + layer.canvas.height * (layer.scale || 1) + pad.y;
    })));

    const outW = Math.max(1, maxX - minX);
    const outH = Math.max(1, maxY - minY);

    // The base itself also gets the transparent expansion. This keeps all
    // internal layer coordinates relative to the new composite top-left when
    // the user re-enters pixel edit mode later.
    const expandedBase = document.createElement("canvas");
    expandedBase.width = outW;
    expandedBase.height = outH;
    expandedBase.getContext("2d")!.drawImage(baseCanvas, -minX, -minY);

    const normalizedLayers = layersToRender.map(layer => ({
      ...layer,
      offsetX: (layer.offsetX || 0) - minX,
      offsetY: (layer.offsetY || 0) - minY,
    }));

    const composite = document.createElement("canvas");
    composite.width = outW;
    composite.height = outH;
    const ctx = composite.getContext("2d")!;
    drawPixelSourceWithEffects(ctx, baseCanvas, -minX, -minY, baseCanvas.width, baseCanvas.height, pixelBaseEffects);
    normalizedLayers.forEach(layer => {
      drawPixelSourceWithEffects(
        ctx, layer.canvas,
        layer.offsetX, layer.offsetY,
        layer.canvas.width * (layer.scale || 1), layer.canvas.height * (layer.scale || 1),
        layer,
      );
    });

    const fabric = (window as any).fabric;
    const dataURL = composite.toDataURL("image/png");
    const oldLeft = baseObj.left || 0, oldTop = baseObj.top || 0;
    const scaleX = baseObj.scaleX || 1, scaleY = baseObj.scaleY || 1;
    const angle = baseObj.angle || 0, uid = baseObj.__uid;

    // If the composite expanded to the left/top, move the Fabric image by the
    // same transformed amount so the original base pixels stay visually fixed.
    const rad = angle * Math.PI / 180;
    const localDX = minX * scaleX;
    const localDY = minY * scaleY;
    const left = oldLeft + localDX * Math.cos(rad) - localDY * Math.sin(rad);
    const top = oldTop + localDX * Math.sin(rad) + localDY * Math.cos(rad);

    fc.current.remove(baseObj);
    fabric.Image.fromURL(dataURL, (img: any) => {
      img.set({ left, top, scaleX, scaleY, angle, originX: baseObj.originX || "left", originY: baseObj.originY || "top", strokeUniform: true });
      img.__uid = uid;
      img.__pixelBaseCanvas = expandedBase;
      img.__pixelLayers = normalizedLayers;
      img.__pixelBaseEffects = pixelBaseEffects;
      pixelBaseUidRef.current = uid;
      fc.current.add(img);
      fc.current.setActiveObject(img);
      syncSel(img);
      refreshLayers(fc.current);
      fc.current.requestRenderAll();
    });
  };

  const exitPixelEdit = (save = true) => {
    const imgObj = pixelEditImgRef.current;
    const pCanvas = pixelCanvasRef.current;
    const layerId = pixelEditLayerIdRef.current;
    if (save) clearLassoVisual();

    if (layerId) {
      const baseObj = findPixelBaseObject();
      let nextLayers = pixelLayers;
      if (save && pCanvas) {
        const nextCanvas = document.createElement("canvas");
        nextCanvas.width = pCanvas.width; nextCanvas.height = pCanvas.height;
        nextCanvas.getContext("2d")!.drawImage(pCanvas, 0, 0);
        nextLayers = pixelLayers.map(l => l.id === layerId ? { ...l, canvas: nextCanvas } : l);
        setPixelLayers(nextLayers);
      }
      if (save && baseObj) {
        let baseCanvas = baseObj.__pixelBaseCanvas as HTMLCanvasElement | undefined;
        if (!baseCanvas) {
          baseCanvas = document.createElement("canvas");
          const bel = baseObj._element as HTMLImageElement;
          baseCanvas.width = bel?.naturalWidth || baseObj.width || canvasWidth;
          baseCanvas.height = bel?.naturalHeight || baseObj.height || canvasHeight;
          baseCanvas.getContext("2d")!.drawImage(bel, 0, 0);
        }
        renderPixelCompositeToProject(baseObj, baseCanvas, nextLayers);
      }
      setPixelEditMode(false);
      pixelEditLayerIdRef.current = null; pixelCanvasRef.current = null; pixelBaseCanvasRef.current = null;
      stampSourceRef.current = null; stampOffsetRef.current = null; stampStrokeSourceCanvasRef.current = null; stampLastPointRef.current = null; lassoPointsRef.current = []; lassoSelectionRef.current = [];
      lassoActiveRef.current = false; pixelUndoStack.current = []; setLassoSelected(false);
      setSelectedPixelLayerId(null); setSelectedPixelLayerIds([]);
      return;
    }

    if (!fc.current || !imgObj) { setPixelEditMode(false); return; }
    if (save && pCanvas) {
      const cleanBase = document.createElement("canvas");
      cleanBase.width = pCanvas.width; cleanBase.height = pCanvas.height;
      cleanBase.getContext("2d")!.drawImage(pCanvas, 0, 0);
      renderPixelCompositeToProject(imgObj, cleanBase, pixelLayers);
    } else {
      imgObj.opacity = 1;
      fc.current.setActiveObject(imgObj);
      fc.current.requestRenderAll();
    }
    setPixelEditMode(false);
    pixelEditImgRef.current = null; pixelEditLayerIdRef.current = null;
    pixelCanvasRef.current = null; pixelBaseCanvasRef.current = null;
    stampSourceRef.current = null; stampOffsetRef.current = null; stampStrokeSourceCanvasRef.current = null; stampLastPointRef.current = null; lassoPointsRef.current = []; lassoSelectionRef.current = [];
    lassoActiveRef.current = false; pixelUndoStack.current = []; setLassoSelected(false);
    setSelectedPixelLayerId(null); setSelectedPixelLayerIds([]);
  };

  // In pixel-edit mode, a double click anywhere outside the Layers panel
  // commits the edit and exits. This also covers the gray area around the canvas.
  useEffect(() => {
    if (!pixelEditMode) return;
    const onPixelEditDoubleClick = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      // Do not close when the double-click happens inside the pixel canvas area
      // or inside the internal layers panel. This also prevents the same
      // double-click used to ENTER pixel edit from immediately closing it.
      if (target?.closest?.('[data-pixel-canvas-area="true"]')) return;
      if (target?.closest?.('[data-pixel-layers-panel="true"]')) return;
      exitPixelEdit(true);
    };
    document.addEventListener("dblclick", onPixelEditDoubleClick);
    return () => document.removeEventListener("dblclick", onPixelEditDoubleClick);
  }, [pixelEditMode, pixelLayers]);

  const deleteSelectedPixelLayers = () => {
    const idsToDelete = selectedPixelLayerIds.filter(id => id !== PIXEL_BASE_ID);
    if (!idsToDelete.length) return;

    const deletingCurrentEditLayer = !!pixelEditLayerIdRef.current && idsToDelete.includes(pixelEditLayerIdRef.current);
    setPixelLayers(prev => prev.filter(l => !idsToDelete.includes(l.id)));
    setSelectedPixelLayerId(null);
    setSelectedPixelLayerIds([PIXEL_BASE_ID]);

    // If the layer currently open for pixel editing is deleted, keep the editor open
    // and immediately switch the editable surface back to the base image.
    if (deletingCurrentEditLayer) {
      const baseObj = findPixelBaseObject();
      pixelEditLayerIdRef.current = null;
      pixelEditImgRef.current = baseObj;
      const baseCanvas = pixelBaseCanvasRef.current || baseObj?.__pixelBaseCanvas || null;
      const el = pixelCanvasRef.current;
      if (el && (baseCanvas || baseObj?._element)) {
        const source = baseCanvas || baseObj._element;
        el.width = baseCanvas?.width || baseObj._element?.naturalWidth || baseObj.width || 1;
        el.height = baseCanvas?.height || baseObj._element?.naturalHeight || baseObj.height || 1;
        const ctx = el.getContext("2d", { willReadFrequently: true })!;
        ctx.clearRect(0, 0, el.width, el.height);
        ctx.drawImage(source, 0, 0);
        const snap = ctx.getImageData(0, 0, el.width, el.height);
        pixelSnapshotRef.current = snap;
        pixelUndoStack.current = [snap];
      }
    }
  };

  // Pixel-edit keyboard shortcuts need their own live listener. The Fabric listener
  // is created before pixelEditMode changes and otherwise keeps a stale false value.
  useEffect(() => {
    if (!pixelEditMode) return;
    const onPixelEditKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        exitPixelEdit(false);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && lassoSelectionRef.current.length === 0) {
        const hasSelectedPixelLayer = selectedPixelLayerIds.some(id => id !== PIXEL_BASE_ID);
        if (hasSelectedPixelLayer) {
          e.preventDefault();
          e.stopPropagation();
          deleteSelectedPixelLayers();
        }
      }
    };
    window.addEventListener("keydown", onPixelEditKeyDown, true);
    return () => window.removeEventListener("keydown", onPixelEditKeyDown, true);
  }, [pixelEditMode, selectedPixelLayerIds, pixelLayers]);

  const mergePixelSelections = () => {
    const ids = selectedPixelLayerIds;
    const hasBase = ids.includes(PIXEL_BASE_ID);
    const selected = pixelLayers.filter(l => ids.includes(l.id));
    if (ids.length < 2) return;

    // Base + one or more lasso layers: rasterize everything into the base image.
    if (hasBase) {
      const baseObj = pixelEditImgRef.current || findPixelBaseObject();
      if (!baseObj) return;
      const baseEl = baseObj._element as HTMLImageElement | undefined;
      const baseW = pixelCanvasRef.current?.width || baseEl?.naturalWidth || baseObj.width || canvasWidth;
      const baseH = pixelCanvasRef.current?.height || baseEl?.naturalHeight || baseObj.height || canvasHeight;
      const composite = document.createElement("canvas");
      composite.width = Math.max(1, Math.round(baseW));
      composite.height = Math.max(1, Math.round(baseH));
      const ctx = composite.getContext("2d")!;

      // If the base image is the active pixel-edit target, use the editor canvas;
      // otherwise the editor canvas belongs to a pasted layer, so read the real base image.
      const baseSource = (pixelEditImgRef.current && pixelEditLayerIdRef.current === null && pixelCanvasRef.current)
        ? pixelCanvasRef.current
        : (pixelBaseCanvasRef.current || baseEl);
      if (baseSource) {
        drawPixelSourceWithEffects(ctx, baseSource, 0, 0, composite.width, composite.height, pixelBaseEffects);
      }
      selected.forEach(l => {
        drawPixelSourceWithEffects(
          ctx, l.canvas,
          l.offsetX, l.offsetY,
          l.canvas.width * (l.scale || 1), l.canvas.height * (l.scale || 1),
          l,
        );
      });

      const dataURL = composite.toDataURL("image/png");
      const fabric = (window as any).fabric;
      const left = baseObj.left || 0, top = baseObj.top || 0;
      const scaleX = baseObj.scaleX || 1, scaleY = baseObj.scaleY || 1, angle = baseObj.angle || 0;
      const uid = baseObj.__uid;

      if (pixelEditImgRef.current && pixelCanvasRef.current) {
        const pc = pixelCanvasRef.current;
        pc.width = composite.width; pc.height = composite.height;
        pc.getContext("2d")!.drawImage(composite, 0, 0);
        pixelSnapshotRef.current = pc.getContext("2d")!.getImageData(0, 0, pc.width, pc.height);
        pixelUndoStack.current.push(pixelSnapshotRef.current);
        setPixelLayers(prev => prev.filter(l => !ids.includes(l.id)));
        setPixelBaseEffects(DEFAULT_PIXEL_EFFECTS);
        setSelectedPixelLayerId(null);
        setSelectedPixelLayerIds([PIXEL_BASE_ID]);
        clearLassoVisual();
        return;
      }

      fc.current?.remove(baseObj);
      fabric.Image.fromURL(dataURL, (img:any) => {
        img.set({ left, top, scaleX, scaleY, angle, strokeUniform:true });
        img.__uid = uid;
        fc.current.add(img);
        fc.current.setActiveObject(img);
        syncSel(img);
        fc.current.requestRenderAll();
        setPixelLayers(prev => prev.filter(l => !ids.includes(l.id)));
        setSelectedPixelLayerId(null);
        setSelectedPixelLayerIds([]);
      });
      return;
    }

    // Lasso layers only: merge them into one independent layer.
    if (selected.length < 2) return;
    const minX = Math.floor(Math.min(...selected.map(l => l.offsetX)));
    const minY = Math.floor(Math.min(...selected.map(l => l.offsetY)));
    const maxX = Math.ceil(Math.max(...selected.map(l => l.offsetX + l.canvas.width * (l.scale || 1))));
    const maxY = Math.ceil(Math.max(...selected.map(l => l.offsetY + l.canvas.height * (l.scale || 1))));
    const c = document.createElement("canvas");
    c.width = Math.max(1, maxX - minX); c.height = Math.max(1, maxY - minY);
    const ctx = c.getContext("2d")!;
    selected.forEach(l => drawPixelSourceWithEffects(
      ctx, l.canvas,
      l.offsetX - minX, l.offsetY - minY,
      l.canvas.width * (l.scale || 1), l.canvas.height * (l.scale || 1),
      l,
    ));
    const merged = {
      id: Math.random().toString(36).slice(2), name: "Camadas mescladas",
      canvas: c, offsetX: minX, offsetY: minY, scale: 1,
      ...DEFAULT_PIXEL_EFFECTS,
    };
    setPixelLayers(prev => [...prev.filter(l => !ids.includes(l.id)), merged]);
    setSelectedPixelLayerId(merged.id);
    setSelectedPixelLayerIds([merged.id]);
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
      const ctx = el.getContext("2d", { willReadFrequently: true })!;
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
            case "c": e.preventDefault(); if (obj) obj.clone((c: any) => {
              copyBlurMetadata(obj, c);
              clipboardRef.current = c;
            }); break;
            case "v": e.preventDefault();
              if (!clipboardRef.current) return;
              {
                const clipboardBlur = clipboardRef.current.__vectorBlur || 0;
                clipboardRef.current.clone((c: any) => {
                  c.set({ left: c.left + 20, top: c.top + 20, evented: true });
                  if (c.type === "activeSelection") {
                    c.canvas = canvas;
                    c.forEachObject((o: any) => { o.__uid = Math.random().toString(36).slice(2); canvas.add(o); });
                    c.setCoords();
                  } else {
                    c.__uid = Math.random().toString(36).slice(2);
                    if (clipboardBlur > 0 && c.type !== "image") {
                      c.__vectorBlur = clipboardBlur;
                      blurValueMap.current.set(c.__uid, clipboardBlur);
                      applyVectorBlurRendering(c, clipboardBlur);
                    }
                    canvas.add(c);
                  }
                  clipboardRef.current.top += 20; clipboardRef.current.left += 20;
                  canvas.setActiveObject(c);
                  syncSel(c);
                  canvas.requestRenderAll();
                });
              } break;
            case "d": e.preventDefault();
              if (isEditingNodesRef.current) { toggleNodeSmooth(); return; }
              if (!obj) return;
              {
                const sourceBlur = obj.__vectorBlur ?? (obj.__uid ? blurValueMap.current.get(obj.__uid) : 0) ?? 0;
                obj.clone((c: any) => {
                  c.set({ left: obj.left+20, top: obj.top+20 });
                  c.__uid = Math.random().toString(36).slice(2);
                  if (sourceBlur > 0 && c.type !== "image") { c.__vectorBlur = sourceBlur; blurValueMap.current.set(c.__uid, sourceBlur); applyVectorBlurRendering(c, sourceBlur); }
                  canvas.add(c); canvas.setActiveObject(c); syncSel(c); canvas.requestRenderAll();
                });
              } break;
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
      const bgColorStops = bgGradient.stops.map((st: any) => {
        const parsed = parseGradientColor(st.color, st.opacity);
        const hex = parsed.color;
        const r = parseInt(hex.slice(1,3),16), gr = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
        return { offset: st.pos/100, color: `rgba(${r},${gr},${b},${parsed.opacity})` };
      });
      let grad: any;
      if (bgGradient.type === "radial") {
        const radius = Math.max(1, Math.min(canvasWidth, canvasHeight) / 2);
        grad = new fab.Gradient({ type: "radial", coords: { x1: canvasWidth/2, y1: canvasHeight/2, r1: 0, x2: canvasWidth/2, y2: canvasHeight/2, r2: radius }, colorStops: bgColorStops });
      } else {
        const rad = (bgGradient.angle * Math.PI) / 180;
        grad = new fab.Gradient({ type: "linear", coords: { x1: (Math.cos(rad+Math.PI)+1)/2*canvasWidth, y1: (Math.sin(rad+Math.PI)+1)/2*canvasHeight, x2: (Math.cos(rad)+1)/2*canvasWidth, y2: (Math.sin(rad)+1)/2*canvasHeight }, colorStops: bgColorStops });
      }
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
    if (sel?.__threeD?.enabled) requestAnimationFrame(() => refreshThreeDObject(sel));
  };
  const updateFillGradient = (g: GradValue|null) => {
    setSelFillGradient(g);
    if (!g) { upd({ fill: selFill }); return; }
    if (fc.current && sel) applyGradient(fc.current, sel, g);
  };
  const updateOpacity  = (v: number) => { setSelOpacity(v);  upd({ opacity: v/100 }); };
  const updateStroke   = (c: string) => { setSelStroke(c);   upd({ stroke: c }); };
  const updateStrokeW  = (v: number) => { setSelStrokeW(v);  upd({ strokeWidth: v, strokeUniform: true }); };
  const updateRadius   = (v: number) => { setSelRadius(v);   upd({ rx: v, ry: v }); };
  const updateRotation = (v: number) => { setSelRotation(v); upd({ angle: v }); };

  type Shape3DSettings = { enabled:boolean; depth:number; rotX:number; rotY:number; rotZ:number; perspective:number; sideColor:string; light:number };
  const supported3DShape = (obj:any) => !!obj && ["rect","circle","triangle","polygon"].includes(obj.type);

  function front3DColor(obj:any) {
    if (typeof obj?.fill === "string" && obj.fill !== "transparent") return parseGradientColor(obj.fill, 1).color;
    const stop = obj?.fill?.colorStops?.[0];
    return stop?.color ? parseGradientColor(stop.color, stop.opacity ?? 1).color : "#64748b";
  }

  function build3DShape(obj:any, T:any) {
    const shape = new T.Shape();
    const w = Math.max(1, Number(obj.width || (obj.radius ? obj.radius*2 : 100)));
    const h = Math.max(1, Number(obj.height || (obj.radius ? obj.radius*2 : 100)));
    const cx=w/2, cy=h/2;
    if (obj.type === "rect") {
      const rx=Math.max(0,Math.min(Number(obj.rx||0),w/2)); const ry=Math.max(0,Math.min(Number(obj.ry||rx||0),h/2));
      if (rx || ry) {
        const ax=rx||ry, ay=ry||rx;
        shape.moveTo(-cx+ax,cy); shape.lineTo(cx-ax,cy); shape.quadraticCurveTo(cx,cy,cx,cy-ay);
        shape.lineTo(cx,-cy+ay); shape.quadraticCurveTo(cx,-cy,cx-ax,-cy); shape.lineTo(-cx+ax,-cy);
        shape.quadraticCurveTo(-cx,-cy,-cx,-cy+ay); shape.lineTo(-cx,cy-ay); shape.quadraticCurveTo(-cx,cy,-cx+ax,cy); shape.closePath();
      } else { shape.moveTo(-cx,cy); shape.lineTo(cx,cy); shape.lineTo(cx,-cy); shape.lineTo(-cx,-cy); shape.closePath(); }
      return shape;
    }
    if (obj.type === "circle") { shape.absellipse(0,0,w/2,h/2,0,Math.PI*2,false,0); return shape; }
    if (obj.type === "triangle") { shape.moveTo(0,cy); shape.lineTo(cx,-cy); shape.lineTo(-cx,-cy); shape.closePath(); return shape; }
    if (obj.type === "polygon" && Array.isArray(obj.points) && obj.points.length > 2) {
      const po=obj.pathOffset||{x:0,y:0}; obj.points.forEach((pt:any,i:number)=>{ const x=Number(pt.x)-Number(po.x||0); const y=-(Number(pt.y)-Number(po.y||0)); if(i===0) shape.moveTo(x,y); else shape.lineTo(x,y); }); shape.closePath(); return shape;
    }
    return null;
  }

  function render3D(obj:any, cfg:Shape3DSettings) {
    const T=(window as any).THREE; if(!T || !supported3DShape(obj)) return null;
    let renderer:any=null;
    try {
      const shape=build3DShape(obj,T); if(!shape) return null;
      renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true}); renderer.setSize(512,512,false); renderer.setClearColor(0x000000,0);
      const scene=new T.Scene(); const geometry=new T.ExtrudeGeometry(shape,{depth:Math.max(1,cfg.depth),bevelEnabled:false,curveSegments:32,steps:1}); geometry.center();
      const front=new T.MeshStandardMaterial({color:new T.Color(front3DColor(obj)),roughness:.58,metalness:.04});
      const side=new T.MeshStandardMaterial({color:new T.Color(cfg.sideColor||"#334155"),roughness:.64,metalness:.03});
      const mesh=new T.Mesh(geometry,[front,side]); mesh.rotation.set(cfg.rotX*Math.PI/180,cfg.rotY*Math.PI/180,cfg.rotZ*Math.PI/180); scene.add(mesh);
      geometry.computeBoundingSphere(); const radius=Math.max(10,Number(geometry.boundingSphere?.radius||100)); const fov=Math.max(18,Math.min(90,cfg.perspective));
      const camera=new T.PerspectiveCamera(fov,1,.1,radius*100); camera.position.z=radius/Math.max(.08,Math.sin((fov*Math.PI/180)/2))*1.28; camera.lookAt(0,0,0);
      scene.add(new T.AmbientLight(0xffffff,.58)); const key=new T.DirectionalLight(0xffffff,Math.max(0,cfg.light)/100*1.35); key.position.set(-radius*1.4,radius*1.6,radius*2.8); scene.add(key);
      renderer.render(scene,camera); const out=document.createElement("canvas"); out.width=512; out.height=512; out.getContext("2d")!.drawImage(renderer.domElement,0,0);
      geometry.dispose(); front.dispose(); side.dispose(); renderer.dispose(); return out;
    } catch(err) { try{renderer?.dispose?.()}catch{}; console.warn("3D render failed",err); return null; }
  }

  function install3DRenderer(obj:any) {
    if(obj.__threeDRendererInstalled) return;
    obj.__threeDOriginalRender=obj._render;
    obj._render=function(ctx:CanvasRenderingContext2D){
      if(this.__threeD?.enabled && this.__threeDCanvas){ const w=Math.max(1,Number(this.width||100)), h=Math.max(1,Number(this.height||100)); ctx.drawImage(this.__threeDCanvas,-w/2,-h/2,w,h); return; }
      return this.__threeDOriginalRender.call(this,ctx);
    };
    obj.__threeDRendererInstalled=true; obj.objectCaching=false;
  }

  function refreshThreeDObject(obj:any, patch?:Partial<Shape3DSettings>) {
    if(!supported3DShape(obj)) return;
    const cfg:Shape3DSettings={enabled:!!obj.__threeD?.enabled,depth:Number(obj.__threeD?.depth??32),rotX:Number(obj.__threeD?.rotX??0),rotY:Number(obj.__threeD?.rotY??0),rotZ:Number(obj.__threeD?.rotZ??0),perspective:Number(obj.__threeD?.perspective??45),sideColor:obj.__threeD?.sideColor||"#334155",light:Number(obj.__threeD?.light??100),...(patch||{})};
    obj.__threeD={...cfg}; install3DRenderer(obj); obj.__threeDCanvas=cfg.enabled ? render3D(obj,cfg) : null; obj.dirty=true; fc.current?.requestRenderAll();
  }

  const applyShape3D=(patch:Partial<Shape3DSettings>)=>{
    if(!sel || !supported3DShape(sel)) return;
    const cfg:Shape3DSettings={enabled:sel3DEnabled,depth:sel3DDepth,rotX:sel3DRotX,rotY:sel3DRotY,rotZ:sel3DRotZ,perspective:sel3DPerspective,sideColor:sel3DSideColor,light:sel3DLight,...patch};
    setSel3DEnabled(cfg.enabled); setSel3DDepth(cfg.depth); setSel3DRotX(cfg.rotX); setSel3DRotY(cfg.rotY); setSel3DRotZ(cfg.rotZ); setSel3DPerspective(cfg.perspective); setSel3DSideColor(cfg.sideColor); setSel3DLight(cfg.light); refreshThreeDObject(sel,cfg);
  };
  const resetShape3D=()=>applyShape3D({enabled:true,depth:32,rotX:0,rotY:0,rotZ:0,perspective:45,sideColor:"#334155",light:100});
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
    if (on) { setSelGlow(false); sel.__glowEnabled = false; }
    sel.__shadowOpacity = selShadowOpacity;
    sel.__shadowBaseColor = selShadowColor;
    sel.set("shadow", on ? new (window as any).fabric.Shadow({ color: colorWithOpacity(selShadowColor, selShadowOpacity), blur: selShadowBlur, offsetX: selShadowX, offsetY: selShadowY }) : null);
    fc.current.requestRenderAll();
  };
  const applyShadow = (color: string, blur: number, ox: number, oy: number, opacity = selShadowOpacity) => {
    if (!fc.current || !sel || !selShadow) return;
    sel.__shadowOpacity = opacity; sel.__shadowBaseColor = color;
    sel.set("shadow", new (window as any).fabric.Shadow({ color: colorWithOpacity(color, opacity), blur, offsetX: ox, offsetY: oy }));
    fc.current.requestRenderAll();
  };
  const applyGlow = (color: string, blur: number, distance: number, opacity = selGlowOpacity) => {
    if (!fc.current || !sel || !selGlow) return;
    sel.__glowEnabled = true; sel.__glowColor = color; sel.__glowBlur = blur; sel.__glowDistance = distance; sel.__glowOpacity = opacity;
    const effectiveBlur = Math.max(0, blur + distance);
    sel.set("shadow", new (window as any).fabric.Shadow({ color: colorWithOpacity(color, opacity), blur: effectiveBlur, offsetX: 0, offsetY: 0 }));
    fc.current.requestRenderAll();
  };
  const updateGlow = (on: boolean) => {
    setSelGlow(on);
    if (!fc.current || !sel) return;
    sel.__glowEnabled = on; sel.__glowColor = selGlowColor; sel.__glowBlur = selGlowBlur; sel.__glowDistance = selGlowDistance; sel.__glowOpacity = selGlowOpacity;
    if (on) {
      setSelShadow(false);
      const effectiveBlur = Math.max(0, selGlowBlur + selGlowDistance);
      sel.set("shadow", new (window as any).fabric.Shadow({ color: colorWithOpacity(selGlowColor, selGlowOpacity), blur: effectiveBlur, offsetX: 0, offsetY: 0 }));
    } else sel.set("shadow", null);
    fc.current.requestRenderAll();
  };

  const updateBlur = (v: number) => {
    setSelBlur(v);
    if (!fc.current || !sel) return;
    const uid = sel.__uid || (sel.__uid = Math.random().toString(36).slice(2));
    if (v > 0) blurValueMap.current.set(uid, v);
    else blurValueMap.current.delete(uid);

    if (sel.type === "image") {
      const fabric = (window as any).fabric;
      const filters = (sel.filters || []).filter((f: any) => f.type !== "Blur");
      if (v > 0) filters.push(new fabric.Image.filters.Blur({ blur: v / 100 }));
      sel.filters = filters;
      sel.set({ padding: v > 0 ? Math.round(v * 0.8) : 0 });
      sel.applyFilters();
      sel.dirty = true;
      fc.current.requestRenderAll();
      return;
    }

    // Vector/text objects remain true Fabric objects. Blur is applied only at render time,
    // so copy/paste, node editing, fills and strokes remain fully editable.
    applyVectorBlurRendering(sel, v);
    fc.current.requestRenderAll();
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

  const applyImageCrop = (x=cropX, y=cropY, wPct=cropW, hPct=cropH) => {
    if (!fc.current || !sel || sel.type !== "image") return;
    const fabric = (window as any).fabric;
    const iw = sel.width || sel._element?.naturalWidth || 1;
    const ih = sel.height || sel._element?.naturalHeight || 1;
    const w = Math.max(1, Math.min(100, wPct));
    const h = Math.max(1, Math.min(100, hPct));
    const maxX = Math.max(0, 100 - w), maxY = Math.max(0, 100 - h);
    const nx = Math.max(0, Math.min(maxX, x));
    const ny = Math.max(0, Math.min(maxY, y));
    setCropX(nx); setCropY(ny); setCropW(w); setCropH(h);
    sel.__crop = { x: nx, y: ny, w, h };
    const clip = new fabric.Rect({
      left: -iw/2 + iw*(nx/100), top: -ih/2 + ih*(ny/100),
      width: iw*(w/100), height: ih*(h/100),
      originX: "left", originY: "top", absolutePositioned: false
    });
    sel.clipPath = clip;
    sel.dirty = true; sel.setCoords(); fc.current.requestRenderAll();
  };

  const resetImageCrop = () => {
    if (!fc.current || !sel || sel.type !== "image") return;
    setCropX(0); setCropY(0); setCropW(100); setCropH(100);
    delete sel.__crop; sel.clipPath = null; sel.dirty = true; sel.setCoords();
    fc.current.requestRenderAll();
  };

  const setCropAspect = (ratio: number) => {
    if (!sel || sel.type !== "image") return;
    const iw = sel.width || 1, ih = sel.height || 1;
    const currentWPx = iw * cropW/100;
    let nextW = cropW, nextH = (currentWPx / ratio) / ih * 100;
    if (nextH > 100) { nextH = 100; nextW = (ih * nextH/100 * ratio) / iw * 100; }
    const cx = cropX + cropW / 2, cy = cropY + cropH / 2;
    const nx = Math.max(0, Math.min(100 - nextW, cx - nextW / 2));
    const ny = Math.max(0, Math.min(100 - nextH, cy - nextH / 2));
    applyImageCrop(nx, ny, nextW, nextH);
  };

  const cropPointerToPercent = (clientX: number, clientY: number) => {
    if (!fc.current || !sel || sel.type !== "image") return null;
    const fabric = (window as any).fabric;
    const canvas = fc.current;
    const pointer = canvas.getPointer({ clientX, clientY, target: canvas.upperCanvasEl } as any);
    const inverse = fabric.util.invertTransform(sel.calcTransformMatrix());
    const local = fabric.util.transformPoint(pointer, inverse);
    const iw = sel.width || 1, ih = sel.height || 1;
    return {
      x: ((local.x + iw / 2) / iw) * 100,
      y: ((local.y + ih / 2) / ih) * 100,
    };
  };

  const startCropDrag = (mode: string, e: React.PointerEvent) => {
    if (!cropMode || !sel || sel.type !== "image") return;
    e.preventDefault();
    e.stopPropagation();
    const p = cropPointerToPercent(e.clientX, e.clientY);
    if (!p) return;
    cropDragRef.current = { mode, startX: p.x, startY: p.y, x: cropX, y: cropY, w: cropW, h: cropH };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  useEffect(() => {
    if (!cropMode) return;
    const onMove = (e: PointerEvent) => {
      const drag = cropDragRef.current;
      if (!drag || !sel || sel.type !== "image") return;
      const p = cropPointerToPercent(e.clientX, e.clientY);
      if (!p) return;
      const minSize = 2;
      let left = drag.x, top = drag.y, right = drag.x + drag.w, bottom = drag.y + drag.h;
      if (drag.mode === "move") {
        const dx = p.x - drag.startX, dy = p.y - drag.startY;
        left = Math.max(0, Math.min(100 - drag.w, drag.x + dx));
        top = Math.max(0, Math.min(100 - drag.h, drag.y + dy));
        right = left + drag.w; bottom = top + drag.h;
      } else {
        if (drag.mode.includes("w")) left = Math.max(0, Math.min(right - minSize, p.x));
        if (drag.mode.includes("e")) right = Math.min(100, Math.max(left + minSize, p.x));
        if (drag.mode.includes("n")) top = Math.max(0, Math.min(bottom - minSize, p.y));
        if (drag.mode.includes("s")) bottom = Math.min(100, Math.max(top + minSize, p.y));
      }
      applyImageCrop(left, top, right - left, bottom - top);
    };
    const onUp = () => { cropDragRef.current = null; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [cropMode, sel, cropX, cropY, cropW, cropH]);

  type ImageAdjustments = {
    brightness:number; contrast:number; exposure:number; saturation:number; temperature:number; tint:number;
    highlights:number; shadows:number; sharpness:number; vignette:number;
  };

  const ensureComenteiAdjustFilter = () => {
    const fabric = (window as any).fabric;
    if (!fabric?.Image?.filters?.BaseFilter) return null;
    if (!fabric.Image.filters.ComenteiAdjust) {
      const BaseFilter = fabric.Image.filters.BaseFilter;
      const Klass = fabric.util.createClass(BaseFilter, {
        type: "ComenteiAdjust",
        initialize: function(this:any, options:any = {}) {
          this.brightness = Number(options.brightness || 0);
          this.contrast = Number(options.contrast || 0);
          this.exposure = Number(options.exposure || 0);
          this.saturation = Number(options.saturation || 0);
          this.temperature = Number(options.temperature || 0);
          this.tint = Number(options.tint || 0);
          this.highlights = Number(options.highlights || 0);
          this.shadows = Number(options.shadows || 0);
          this.sharpness = Number(options.sharpness || 0);
          this.vignette = Number(options.vignette || 0);
        },
        isNeutralState: function(this:any) {
          return !this.brightness && !this.contrast && !this.exposure && !this.saturation && !this.temperature && !this.tint && !this.highlights && !this.shadows && !this.sharpness && !this.vignette;
        },
        applyTo2d: function(this:any, options:any) {
          const imageData = options.imageData;
          const data = imageData.data as Uint8ClampedArray;
          const width = imageData.width || options.sourceWidth || 1;
          const height = imageData.height || options.sourceHeight || 1;
          const brightness = Math.max(-1, Math.min(1, this.brightness || 0));
          const contrast = Math.max(-1, Math.min(1, this.contrast || 0));
          const exposure = Math.max(-1, Math.min(1, this.exposure || 0));
          const saturation = Math.max(-1, Math.min(1, this.saturation || 0));
          const temperature = Math.max(-1, Math.min(1, this.temperature || 0));
          const tint = Math.max(-1, Math.min(1, this.tint || 0));
          const highlights = Math.max(-1, Math.min(1, this.highlights || 0));
          const shadows = Math.max(-1, Math.min(1, this.shadows || 0));
          const vignette = Math.max(0, Math.min(1, this.vignette || 0));
          const exposureMul = Math.pow(2, exposure * 2);
          const contrastFactor = contrast >= 0 ? 1 + contrast * 2 : 1 + contrast * 0.8;
          const cx = (width - 1) / 2, cy = (height - 1) / 2;
          const maxDist = Math.max(1, Math.hypot(cx, cy));

          for (let i = 0; i < data.length; i += 4) {
            let r = data[i] * exposureMul + brightness * 80;
            let g = data[i+1] * exposureMul + brightness * 80;
            let b = data[i+2] * exposureMul + brightness * 80;

            r = (r - 127.5) * contrastFactor + 127.5;
            g = (g - 127.5) * contrastFactor + 127.5;
            b = (b - 127.5) * contrastFactor + 127.5;

            const lum = Math.max(0, Math.min(1, (0.2126*r + 0.7152*g + 0.0722*b) / 255));
            const shadowWeight = Math.pow(1 - lum, 2);
            const highlightWeight = Math.pow(lum, 2);
            const tonal = shadows * shadowWeight * 95 + highlights * highlightWeight * 95;
            r += tonal; g += tonal; b += tonal;

            const gray = 0.2126*r + 0.7152*g + 0.0722*b;
            const satMul = 1 + saturation;
            r = gray + (r - gray) * satMul;
            g = gray + (g - gray) * satMul;
            b = gray + (b - gray) * satMul;

            r += temperature * 42 + tint * 18;
            g -= tint * 34;
            b -= temperature * 42; b += tint * 18;

            if (vignette > 0) {
              const px = (i / 4) % width;
              const py = Math.floor((i / 4) / width);
              const d = Math.min(1, Math.hypot(px - cx, py - cy) / maxDist);
              const edge = Math.max(0, (d - 0.28) / 0.72);
              const v = 1 - vignette * edge * edge * 0.85;
              r *= v; g *= v; b *= v;
            }

            data[i] = Math.max(0, Math.min(255, r));
            data[i+1] = Math.max(0, Math.min(255, g));
            data[i+2] = Math.max(0, Math.min(255, b));
          }

          const sharpness = Math.max(0, Math.min(1, this.sharpness || 0));
          if (sharpness > 0 && width > 2 && height > 2) {
            const src = new Uint8ClampedArray(data);
            const a = sharpness * 0.65;
            for (let y = 1; y < height - 1; y++) {
              for (let x = 1; x < width - 1; x++) {
                const i = (y * width + x) * 4;
                for (let c = 0; c < 3; c++) {
                  const center = src[i+c] * (1 + 4*a);
                  const around = (src[i-4+c] + src[i+4+c] + src[i-width*4+c] + src[i+width*4+c]) * a;
                  data[i+c] = Math.max(0, Math.min(255, center - around));
                }
              }
            }
          }
        },
        toObject: function(this:any) {
          return {
            ...this.callSuper("toObject"),
            brightness:this.brightness, contrast:this.contrast, exposure:this.exposure, saturation:this.saturation,
            temperature:this.temperature, tint:this.tint, highlights:this.highlights, shadows:this.shadows,
            sharpness:this.sharpness, vignette:this.vignette,
          };
        },
      });
      Klass.fromObject = (object:any, callback?: (value:any)=>void) => {
        const value = new Klass(object);
        if (callback) callback(value);
        return value;
      };
      fabric.Image.filters.ComenteiAdjust = Klass;
    }
    if (fabric.Canvas2dFilterBackend && !(fabric.filterBackend instanceof fabric.Canvas2dFilterBackend)) {
      fabric.filterBackend = new fabric.Canvas2dFilterBackend();
    }
    return fabric.Image.filters.ComenteiAdjust;
  };

  const applyImageAdjustments = (patch: Partial<ImageAdjustments>) => {
    if (!fc.current || !sel || sel.type !== "image") return;
    const next: ImageAdjustments = {
      brightness: selBrightness, contrast: selContrast, exposure: selExposure, saturation: selSaturation,
      temperature: selTemperature, tint: selTint, highlights: selHighlights, shadows: selShadows,
      sharpness: selSharpness, vignette: selVignette, ...patch,
    };
    setSelBrightness(next.brightness); setSelContrast(next.contrast); setSelExposure(next.exposure);
    setSelSaturation(next.saturation); setSelTemperature(next.temperature); setSelTint(next.tint);
    setSelHighlights(next.highlights); setSelShadows(next.shadows); setSelSharpness(next.sharpness); setSelVignette(next.vignette);
    sel.__imageAdjustments = { ...next };
    const Klass = ensureComenteiAdjustFilter();
    if (!Klass) return;
    const filters = (sel.filters || []).filter((f:any) => f.type !== "Saturation" && f.type !== "ComenteiAdjust");
    const neutral = Object.values(next).every(v => Math.abs(Number(v)) < 0.0001);
    if (!neutral) filters.push(new Klass(next));
    sel.filters = filters;
    sel.applyFilters();
    sel.dirty = true;
    fc.current.requestRenderAll();
  };

  const updateSaturation = (v: number) => applyImageAdjustments({ saturation: v });

  const updateTransformScale = (axis: "x"|"y", value: number) => {
    if (!fc.current || !sel || sel.type === "activeSelection") return;
    const safe = Math.max(1, Math.min(1000, value));
    const currentXSign = (sel.scaleX ?? 1) < 0 ? -1 : 1;
    const currentYSign = (sel.scaleY ?? 1) < 0 ? -1 : 1;
    if (axis === "x") {
      setSelScaleX(safe);
      sel.set("scaleX", currentXSign * safe / 100);
      if (lockTransformRatio) {
        setSelScaleY(safe);
        sel.set("scaleY", currentYSign * safe / 100);
      }
    } else {
      setSelScaleY(safe);
      sel.set("scaleY", currentYSign * safe / 100);
      if (lockTransformRatio) {
        setSelScaleX(safe);
        sel.set("scaleX", currentXSign * safe / 100);
      }
    }
    sel.setCoords(); sel.dirty = true; fc.current.requestRenderAll();
  };

  const updateTransformSkew = (axis: "x"|"y", value: number) => {
    if (!fc.current || !sel || sel.type === "activeSelection") return;
    const safe = Math.max(-75, Math.min(75, value));
    if (axis === "x") { setSelSkewX(safe); sel.set("skewX", safe); }
    else { setSelSkewY(safe); sel.set("skewY", safe); }
    sel.setCoords(); sel.dirty = true; fc.current.requestRenderAll();
  };

  const toggleTransformFlip = (axis: "x"|"y") => {
    if (!fc.current || !sel || sel.type === "activeSelection") return;
    if (axis === "x") {
      const next = !(sel.scaleX < 0); setSelFlipX(next);
      sel.set("scaleX", Math.abs(sel.scaleX || 1) * (next ? -1 : 1));
    } else {
      const next = !(sel.scaleY < 0); setSelFlipY(next);
      sel.set("scaleY", Math.abs(sel.scaleY || 1) * (next ? -1 : 1));
    }
    sel.setCoords(); sel.dirty = true; fc.current.requestRenderAll();
  };

  const resetFreeTransform = () => {
    if (!fc.current || !sel || sel.type === "activeSelection") return;
    sel.set({ scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, angle: 0 });
    setSelScaleX(100); setSelScaleY(100); setSelSkewX(0); setSelSkewY(0);
    setSelFlipX(false); setSelFlipY(false); setSelRotation(0);
    sel.setCoords(); sel.dirty = true; fc.current.requestRenderAll();
  };

  const resetImageAdjustments = () => {
    applyImageAdjustments({ brightness:0, contrast:0, exposure:0, saturation:0, temperature:0, tint:0, highlights:0, shadows:0, sharpness:0, vignette:0 });
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
      fc.current.isDrawingMode = false;
      fc.current.skipTargetFind = true;
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
      fc.current.skipTargetFind = false;
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
              {pixelTool !== "lasso" && pixelTool !== "move" && (
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
              {/* Move */}
              <button onClick={() => setPixelTool("move")} title="Mover camada"
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${pixelTool==="move" ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:bg-gray-100"}`}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M9 2v14M2 9h14M9 2L6 5M9 2l3 3M9 16l-3-3M9 16l3-3M2 9l3-3M2 9l3 3M16 9l-3-3M16 9l-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>

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
                    {stampSourceRef.current ? "✓ Fonte alinhada" : "Alt+clique = fonte"}
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
              if (fc.current) { fc.current.isDrawingMode = false; fc.current.skipTargetFind = false; }
            } else {
              setActiveTool("brush"); activeToolRef.current = "brush";
              if (fc.current) {
                const fabric = (window as any).fabric;
                fc.current.skipTargetFind = true;
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
          <div className="shadow-2xl relative" data-pixel-canvas-area="true">
            {!fabricLoaded ? (
              <div style={{ width: Math.round(canvasWidth * (zoom / 100)), height: Math.round(canvasHeight * (zoom / 100)) }} className="bg-white flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : <canvas ref={canvasRef} />}

            {/* Visual non-destructive crop overlay */}
            {!pixelEditMode && cropMode && sel?.type === "image" && (() => {
              const m = sel.calcTransformMatrix?.();
              if (!m) return null;
              const z = zoom / 100;
              const iw = sel.width || 1, ih = sel.height || 1;
              const left = (m[4] - m[0] * iw / 2 - m[2] * ih / 2) * z;
              const top = (m[5] - m[1] * iw / 2 - m[3] * ih / 2) * z;
              const transform = `matrix(${m[0]}, ${m[1]}, ${m[2]}, ${m[3]}, 0, 0)`;
              const handles = [
                ["nw", 0, 0, "nwse-resize"], ["n", 50, 0, "ns-resize"], ["ne", 100, 0, "nesw-resize"],
                ["e", 100, 50, "ew-resize"], ["se", 100, 100, "nwse-resize"], ["s", 50, 100, "ns-resize"],
                ["sw", 0, 100, "nesw-resize"], ["w", 0, 50, "ew-resize"],
              ] as const;
              return (
                <div style={{ position:"absolute", left, top, width: iw * z, height: ih * z, transform, transformOrigin:"0 0", zIndex: 50, pointerEvents:"auto" }}>
                  <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,.42)", pointerEvents:"none" }} />
                  <div
                    onPointerDown={e => startCropDrag("move", e)}
                    style={{
                      position:"absolute", left:`${cropX}%`, top:`${cropY}%`, width:`${cropW}%`, height:`${cropH}%`,
                      boxSizing:"border-box", border:"2px solid white", outline:"1px solid #4f46e5", cursor:"move",
                      boxShadow:"0 0 0 9999px rgba(0,0,0,.0)", background:"rgba(255,255,255,.01)"
                    }}
                  >
                    <div style={{ position:"absolute", inset:0, boxShadow:"0 0 0 9999px rgba(0,0,0,-0.42)", pointerEvents:"none" }} />
                    {[1,2].map(i => <div key={`v${i}`} style={{position:"absolute",left:`${i*33.333}%`,top:0,bottom:0,borderLeft:"1px solid rgba(255,255,255,.55)",pointerEvents:"none"}} />)}
                    {[1,2].map(i => <div key={`h${i}`} style={{position:"absolute",top:`${i*33.333}%`,left:0,right:0,borderTop:"1px solid rgba(255,255,255,.55)",pointerEvents:"none"}} />)}
                    {handles.map(([mode, x, y, cursor]) => (
                      <div key={mode} onPointerDown={e => startCropDrag(mode, e)}
                        style={{ position:"absolute", left:`${x}%`, top:`${y}%`, width:12, height:12, transform:"translate(-50%,-50%)", background:"white", border:"2px solid #4f46e5", borderRadius:2, cursor, zIndex:2 }} />
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Pixel editor overlay */}
            {pixelEditMode && (pixelEditImgRef.current || pixelEditLayerIdRef.current) && (() => {
              const imgObj = pixelEditImgRef.current;
              const editLayer = pixelEditLayerIdRef.current ? pixelLayers.find(l => l.id === pixelEditLayerIdRef.current) : null;
              const baseObj = imgObj || findPixelBaseObject();
              const z = zoom / 100;
              const baseNaturalW = pixelBaseCanvasRef.current?.width || baseObj?._element?.naturalWidth || baseObj?.width || 100;
              const baseNaturalH = pixelBaseCanvasRef.current?.height || baseObj?._element?.naturalHeight || baseObj?.height || 100;
              const baseScaleX = (baseObj?.scaleX || 1) * z;
              const baseScaleY = (baseObj?.scaleY || 1) * z;
              const baseLeft = (baseObj?.left || 0) * z;
              const baseTop = (baseObj?.top || 0) * z;
              const iw = editLayer ? editLayer.canvas.width * (editLayer.scale || 1) * baseScaleX : baseNaturalW * baseScaleX;
              const ih = editLayer ? editLayer.canvas.height * (editLayer.scale || 1) * baseScaleY : baseNaturalH * baseScaleY;
              const il = editLayer ? baseLeft + (editLayer.offsetX || 0) * baseScaleX : baseLeft;
              const it = editLayer ? baseTop + (editLayer.offsetY || 0) * baseScaleY : baseTop;
              const activeLayerZ = editLayer ? Math.max(1, pixelLayers.findIndex(l => l.id === editLayer.id) + 1) : 0;
              return (
                <>
                <canvas
                  ref={el => {
                    if (!el) return;
                    pixelCanvasRef.current = el;
                    if (el.dataset.initialized === "true") return;
                    el.dataset.initialized = "true";
                    const ctx = el.getContext("2d", { willReadFrequently: true })!;
                    if (editLayer) {
                      el.width = editLayer.canvas.width; el.height = editLayer.canvas.height;
                      ctx.drawImage(editLayer.canvas, 0, 0);
                    } else {
                      const baseCanvas = pixelBaseCanvasRef.current;
                      const imgEl = pixelEditImgRef.current?._element as HTMLImageElement;
                      if (!baseCanvas && !imgEl) return;
                      el.width = baseCanvas?.width || imgEl.naturalWidth || pixelEditImgRef.current?.width || 100;
                      el.height = baseCanvas?.height || imgEl.naturalHeight || pixelEditImgRef.current?.height || 100;
                      if (baseCanvas) ctx.drawImage(baseCanvas, 0, 0);
                      else ctx.drawImage(imgEl, 0, 0);
                    }
                    pixelUndoStack.current = [];
                    const snap = ctx.getImageData(0, 0, el.width, el.height);
                    pixelSnapshotRef.current = snap;
                    pixelUndoStack.current.push(snap);
                  }}
                  style={{
                    position: "absolute", left: il, top: it, width: iw, height: ih,
                    cursor: pixelTool === "eraser" ? (() => {
                      const activeNaturalW = editLayer?.canvas.width || pixelBaseCanvasRef.current?.width || baseNaturalW || 100;
                      const displaySize = Math.max(Math.round(pixelBrushSize * iw / activeNaturalW), 6);
                      const half = Math.round(displaySize / 2);
                      const svg = `%3Csvg xmlns='http://www.w3.org/2000/svg' width='${displaySize}' height='${displaySize}' viewBox='0 0 ${displaySize} ${displaySize}'%3E%3Ccircle cx='${half}' cy='${half}' r='${half - 1}' fill='none' stroke='%234f46e5' stroke-width='1.5' stroke-dasharray='4 3'/%3E%3C/svg%3E`;
                      return `url("data:image/svg+xml,${svg}") ${half} ${half}, crosshair`;
                    })() : "crosshair",
                    border: "2px solid #4f46e5", boxSizing: "border-box", imageRendering: "pixelated",
                    zIndex: activeLayerZ,
                    opacity: getPixelEffects(editLayer || pixelBaseEffects).opacity,
                    filter: pixelEffectsCss(editLayer || pixelBaseEffects),
                  }}
                  onMouseDown={ev => {
                    // Clicking the visible base image with the Move tool selects the base layer.
                    // Pasted layers sit above this canvas and stop propagation, so overlap still
                    // selects the pasted layer instead.
                    if (pixelTool === "move") {
                      ev.preventDefault();
                      ev.stopPropagation();
                      if (editLayer) {
                        setSelectedPixelLayerId(editLayer.id);
                        setSelectedPixelLayerIds([editLayer.id]);
                        pixelMoveLayerRef.current = {
                          id: editLayer.id, canvas: editLayer.canvas, startX: ev.clientX, startY: ev.clientY,
                          offsetX: editLayer.offsetX || 0, offsetY: editLayer.offsetY || 0,
                        };
                        pixelMovingRef.current = true;
                        pixelResizingRef.current = false;
                      } else {
                        switchPixelEditTarget(PIXEL_BASE_ID);
                      }
                      return;
                    }
                    const el = pixelCanvasRef.current!;
                    const rect = el.getBoundingClientRect();
                    const sx = el.width / rect.width; const sy = el.height / rect.height;
                    const x = (ev.clientX - rect.left) * sx;
                    const y = (ev.clientY - rect.top) * sy;
                    const ctx = el.getContext("2d", { willReadFrequently: true })!;

                    if (pixelTool === "stamp" && ev.altKey) {
                      // Alt+click defines a new clone source. The aligned offset is
                      // established only when the user starts painting elsewhere.
                      stampSourceRef.current = { x, y };
                      stampOffsetRef.current = null;
                      stampStrokeSourceCanvasRef.current = null;
                      stampLastPointRef.current = null;
                      pixelDrawingRef.current = false;
                      return;
                    }

                    if (pixelTool === "lasso") {
                      // Restaura snapshot limpo (sem contorno do laço anterior)
                      if (pixelSnapshotRef.current) {
                        ctx.putImageData(pixelSnapshotRef.current, 0, 0);
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

                    if (pixelTool === "stamp") {
                      if (!stampSourceRef.current) return;
                      if (!stampOffsetRef.current) {
                        stampOffsetRef.current = {
                          x: stampSourceRef.current.x - x,
                          y: stampSourceRef.current.y - y,
                        };
                      }
                      // Freeze the sampling surface for this stroke. This prevents the
                      // freshly cloned pixels from recursively feeding back into the same stroke.
                      const sample = document.createElement("canvas");
                      sample.width = el.width; sample.height = el.height;
                      sample.getContext("2d")!.drawImage(el, 0, 0);
                      stampStrokeSourceCanvasRef.current = sample;
                      stampLastPointRef.current = { x, y };
                    }

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
                    else if (pixelTool === "stamp" && stampSourceRef.current && stampStrokeSourceCanvasRef.current) {
                      applyAlignedCloneStamp(ctx, stampStrokeSourceCanvasRef.current, x, y);
                    }
                  }}
                  onMouseMove={ev => {
                    if (pixelTool === "move" && editLayer && pixelMovingRef.current && pixelMoveLayerRef.current?.id === editLayer.id) {
                      const move = pixelMoveLayerRef.current;
                      const dx = (ev.clientX - move.startX) / baseScaleX;
                      const dy = (ev.clientY - move.startY) / baseScaleY;
                      setPixelLayers(prev => prev.map(l => l.id === editLayer.id ? { ...l, offsetX: move.offsetX + dx, offsetY: move.offsetY + dy } : l));
                      return;
                    }
                    const el = pixelCanvasRef.current!;
                    const rect = el.getBoundingClientRect();
                    const sx = el.width / rect.width; const sy = el.height / rect.height;
                    const x = (ev.clientX - rect.left) * sx;
                    const y = (ev.clientY - rect.top) * sy;
                    const ctx = el.getContext("2d", { willReadFrequently: true })!;

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

                    if (pixelTool === "eraser" && pixelDrawingRef.current) {
                      const r = pixelBrushSize / 2;
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
                      return;
                    }

                    if (!pixelDrawingRef.current) return;

                    if (pixelTool === "stamp" && stampSourceRef.current && stampStrokeSourceCanvasRef.current) {
                      const last = stampLastPointRef.current || { x, y };
                      const dx = x - last.x;
                      const dy = y - last.y;
                      const dist = Math.hypot(dx, dy);
                      // Interpolate stamps so fast mouse movements create a continuous stroke.
                      const spacing = Math.max(1, pixelBrushSize * 0.2);
                      const steps = Math.max(1, Math.ceil(dist / spacing));
                      for (let i = 1; i <= steps; i++) {
                        const t = i / steps;
                        applyAlignedCloneStamp(
                          ctx,
                          stampStrokeSourceCanvasRef.current,
                          last.x + dx * t,
                          last.y + dy * t,
                        );
                      }
                      stampLastPointRef.current = { x, y };
                    }
                  }}
                  onMouseUp={() => {
                    const el = pixelCanvasRef.current!;
                    const ctx = el.getContext("2d", { willReadFrequently: true })!;

                    if (pixelDrawingRef.current) {
                      // Atualiza snapshot ANTES de setar false
                      pixelSnapshotRef.current = ctx.getImageData(0, 0, el.width, el.height);
                      pixelUndoStack.current.push(ctx.getImageData(0, 0, el.width, el.height));
                      if (pixelUndoStack.current.length > 30) pixelUndoStack.current.shift();
                      pixelDrawingRef.current = false;
                      if (pixelTool === "stamp") {
                        stampStrokeSourceCanvasRef.current = null;
                        stampLastPointRef.current = null;
                      }
                    }

                    if (pixelTool === "lasso" && lassoActiveRef.current) {
                      lassoActiveRef.current = false;
                      const pts = lassoPointsRef.current;
                      if (pts.length < 3) return;
                      lassoSelectionRef.current = [...pts];
                      setLassoSelected(true);
                      // Restaura snapshot limpo antes de desenhar marching ants
                      const snap = pixelSnapshotRef.current;
                      if (snap) ctx.putImageData(snap, 0, 0);
                      ctx.save();
                      ctx.setLineDash([6, 3]);
                      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
                      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
                      pts.forEach(p => ctx.lineTo(p.x, p.y)); ctx.closePath(); ctx.stroke();
                      ctx.strokeStyle = "#222"; ctx.lineWidth = 1;
                      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
                      pts.forEach(p => ctx.lineTo(p.x, p.y)); ctx.closePath(); ctx.stroke();
                      ctx.setLineDash([]); ctx.restore();
                      // snapshot permanece sem o laço desenhado
                    }
                  }}

                  onKeyDown={ev => {
                    ev.stopPropagation();
                    ev.preventDefault();
                    const el = pixelCanvasRef.current!;
                    const ctx = el.getContext("2d", { willReadFrequently: true })!;

                    // Ctrl+Z undo
                    if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && ev.key.toLowerCase() === "z") {
                      const prev = pixelUndoStack.current.pop();
                      if (prev) { ctx.putImageData(prev, 0, 0); pixelSnapshotRef.current = prev; setLassoSelected(false); lassoSelectionRef.current = []; }
                      return;
                    }

                    // Ctrl+C — copia pixels da seleção (só o bounding box)
                    if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && ev.key.toLowerCase() === "c") {
                      const pts = lassoSelectionRef.current;
                      if (!pts.length) return;
                      // Calculate bounding box of selection
                      const minX = Math.floor(Math.min(...pts.map(p => p.x)));
                      const minY = Math.floor(Math.min(...pts.map(p => p.y)));
                      const maxX = Math.ceil(Math.max(...pts.map(p => p.x)));
                      const maxY = Math.ceil(Math.max(...pts.map(p => p.y)));
                      const bw = maxX - minX; const bh = maxY - minY;
                      // Full canvas copy masked to selection
                      const maskC = document.createElement("canvas");
                      maskC.width = el.width; maskC.height = el.height;
                      const maskCtx = maskC.getContext("2d")!;
                      const cleanSnap = pixelSnapshotRef.current;
                      if (cleanSnap) maskCtx.putImageData(cleanSnap, 0, 0);
                      else maskCtx.drawImage(el, 0, 0);
                      maskCtx.save();
                      maskCtx.globalCompositeOperation = "destination-in";
                      maskCtx.beginPath(); maskCtx.moveTo(pts[0].x, pts[0].y);
                      pts.forEach(p => maskCtx.lineTo(p.x, p.y)); maskCtx.closePath(); maskCtx.fill();
                      maskCtx.restore();
                      // Crop to bounding box
                      const cropC = document.createElement("canvas");
                      cropC.width = bw; cropC.height = bh;
                      cropC.getContext("2d")!.drawImage(maskC, minX, minY, bw, bh, 0, 0, bw, bh);
                      (window as any).__pixelClipboard = { canvas: cropC, originX: minX, originY: minY };
                      return;
                    }

                    // Ctrl+V — cola como nova camada (tamanho da seleção)
                    if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && ev.key.toLowerCase() === "v") {
                      const cb = (window as any).__pixelClipboard;
                      if (!cb) return;
                      const clipCanvas = cb.canvas as HTMLCanvasElement;
                      // clipCanvas is already cropped to the lasso bounding box.
                      // scale=1 preserves the exact native selection size on paste.
                      const newLayer = {
                        id: Math.random().toString(36).slice(2),
                        name: `Camada ${Date.now().toString().slice(-4)}`,
                        canvas: clipCanvas, offsetX: cb.originX || 0, offsetY: cb.originY || 0, scale: 1,
                        ...DEFAULT_PIXEL_EFFECTS,
                      };
                      // Commit the source surface, then make the pasted layer the real editable target.
                      commitCurrentPixelSurface();
                      setPixelLayers(prev => [...prev, newLayer]);
                      pixelEditLayerIdRef.current = newLayer.id;
                      pixelEditImgRef.current = null;
                      setSelectedPixelLayerId(newLayer.id);
                      setSelectedPixelLayerIds([newLayer.id]);
                      setPixelTool("move");
                      resetPixelToolTransientState();
                      requestAnimationFrame(() => {
                        const target = pixelCanvasRef.current;
                        if (!target) return;
                        target.width = clipCanvas.width; target.height = clipCanvas.height;
                        target.dataset.initialized = "true";
                        const tctx = target.getContext("2d", { willReadFrequently: true })!;
                        tctx.clearRect(0, 0, target.width, target.height);
                        tctx.drawImage(clipCanvas, 0, 0);
                        const snap = tctx.getImageData(0, 0, target.width, target.height);
                        pixelSnapshotRef.current = snap;
                        pixelUndoStack.current = [snap];
                        target.focus();
                      });
                      return;
                    }

                    const pts = lassoSelectionRef.current;
                    if (!pts.length) return;

                    // Delete — apaga dentro ou fora da seleção (depende da inversão)
                    if (ev.key === "Delete" || ev.key === "Backspace") {
                      pixelUndoStack.current.push(ctx.getImageData(0, 0, el.width, el.height));
                      const snap = pixelSnapshotRef.current;
                      if (snap) ctx.putImageData(snap, 0, 0);
                      const isInverted = (lassoSelectionRef as any).inverted;
                      ctx.save();
                      if (isInverted) {
                        // Apaga fora da seleção
                        ctx.beginPath();
                        ctx.rect(0, 0, el.width, el.height);
                        ctx.moveTo(pts[0].x, pts[0].y);
                        pts.forEach(p => ctx.lineTo(p.x, p.y)); ctx.closePath();
                      } else {
                        // Apaga dentro da seleção
                        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
                        pts.forEach(p => ctx.lineTo(p.x, p.y)); ctx.closePath();
                      }
                      ctx.globalCompositeOperation = "destination-out"; ctx.fill();
                      ctx.restore();
                      pixelSnapshotRef.current = ctx.getImageData(0, 0, el.width, el.height);
                      (lassoSelectionRef as any).inverted = false;
                      setLassoSelected(false); lassoSelectionRef.current = [];
                      return;
                    }

                    // Ctrl+Shift+I — inverte seleção (guarda como flag)
                    if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && ev.key.toLowerCase() === "i") {
                      const w = el.width; const h = el.height;
                      // Marca que a seleção está invertida com flag especial
                      (lassoSelectionRef as any).inverted = !(lassoSelectionRef as any).inverted;
                      const isInverted = (lassoSelectionRef as any).inverted;
                      const snap = pixelSnapshotRef.current;
                      if (snap) ctx.putImageData(snap, 0, 0);
                      ctx.save();
                      ctx.setLineDash([6, 3]);
                      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
                      if (isInverted) {
                        ctx.strokeRect(1, 1, w-2, h-2);
                      }
                      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
                      pts.forEach(p => ctx.lineTo(p.x, p.y)); ctx.closePath();
                      ctx.strokeStyle = isInverted ? "#fff" : "#fff"; ctx.stroke();
                      ctx.strokeStyle = "#222"; ctx.lineWidth = 1;
                      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
                      pts.forEach(p => ctx.lineTo(p.x, p.y)); ctx.closePath(); ctx.stroke();
                      if (isInverted) ctx.strokeRect(1, 1, w-2, h-2);
                      ctx.setLineDash([]); ctx.restore();
                      return;
                    }
                  }}
                  tabIndex={0}
                  autoFocus
                />

                {/* When a pasted layer is the editable target, keep the base visible behind it. */}
                {editLayer && pixelBaseCanvasRef.current && (
                  <canvas
                    width={pixelBaseCanvasRef.current.width}
                    height={pixelBaseCanvasRef.current.height}
                    ref={el => {
                      if (!el || !pixelBaseCanvasRef.current) return;
                      el.width = pixelBaseCanvasRef.current.width;
                      el.height = pixelBaseCanvasRef.current.height;
                      const c = el.getContext("2d")!;
                      c.clearRect(0, 0, el.width, el.height);
                      c.drawImage(pixelBaseCanvasRef.current, 0, 0);
                    }}
                    style={{
                      position: "absolute", left: baseLeft, top: baseTop,
                      width: baseNaturalW * baseScaleX, height: baseNaturalH * baseScaleY,
                      imageRendering: "pixelated", pointerEvents: "none", zIndex: 0,
                      opacity: pixelBaseEffects.opacity, filter: pixelEffectsCss(pixelBaseEffects),
                    }}
                  />
                )}

                {/* Pixel layers — independent, selectable, movable and resizable */}
                {pixelLayers.filter(layer => layer.id !== pixelEditLayerIdRef.current).map((layer) => {
                  const layerIndex = pixelLayers.findIndex(l => l.id === layer.id);
                  const scX = baseScaleX;
                  const scY = baseScaleY;
                  const offsetX = layer.offsetX || 0;
                  const offsetY = layer.offsetY || 0;
                  const layerScale = layer.scale || 1;
                  const displayW = layer.canvas.width * scX * layerScale;
                  const displayH = layer.canvas.height * scY * layerScale;
                  const selected = selectedPixelLayerId === layer.id;
                  const handles = [
                    { key: "nw", left: -6, right: undefined, top: -6, bottom: undefined, cursor: "nwse-resize" },
                    { key: "ne", left: undefined, right: -6, top: -6, bottom: undefined, cursor: "nesw-resize" },
                    { key: "sw", left: -6, right: undefined, top: undefined, bottom: -6, cursor: "nesw-resize" },
                    { key: "se", left: undefined, right: -6, top: undefined, bottom: -6, cursor: "nwse-resize" },
                  ] as const;

                  const selectLayer = () => {
                    switchPixelEditTarget(layer.id);
                  };

                  return (
                    <div key={layer.id}
                      style={{ position: "absolute", left: baseLeft + offsetX * scX, top: baseTop + offsetY * scY, width: displayW, height: displayH,
                        cursor: pixelTool === "move" ? (pixelMovingRef.current ? "grabbing" : "grab") : "default", pointerEvents: pixelTool === "move" ? "auto" : "none",
                        outline: selected ? "1.5px solid #2563eb" : "none", boxSizing: "border-box", zIndex: layerIndex + 1 }}
                      onMouseDown={ev => {
                        if (pixelTool !== "move") return;
                        ev.preventDefault(); ev.stopPropagation();
                        selectLayer();

                        const rect = ev.currentTarget.getBoundingClientRect();
                        const handleSize = 18;
                        const nearLeft = ev.clientX <= rect.left + handleSize;
                        const nearRight = ev.clientX >= rect.right - handleSize;
                        const nearTop = ev.clientY <= rect.top + handleSize;
                        const nearBottom = ev.clientY >= rect.bottom - handleSize;
                        const handle = nearTop && nearLeft ? "nw" : nearTop && nearRight ? "ne" : nearBottom && nearLeft ? "sw" : nearBottom && nearRight ? "se" : null;

                        if (handle) {
                          pixelResizeLayerRef.current = {
                            id: layer.id, handle, startX: ev.clientX, startY: ev.clientY,
                            startScale: layerScale, startOffsetX: offsetX, startOffsetY: offsetY,
                            baseWidth: layer.canvas.width * scX, baseHeight: layer.canvas.height * scY
                          };
                          pixelResizingRef.current = true;
                          pixelMovingRef.current = false;
                          return;
                        }

                        pixelMoveLayerRef.current = { id: layer.id, canvas: layer.canvas, startX: ev.clientX, startY: ev.clientY, offsetX, offsetY };
                        pixelMovingRef.current = true;
                        pixelResizingRef.current = false;
                      }}
                      onMouseMove={ev => {
                        if (pixelResizingRef.current && pixelResizeLayerRef.current?.id === layer.id) {
                          const r = pixelResizeLayerRef.current;
                          const dx = ev.clientX - r.startX;
                          const dy = ev.clientY - r.startY;
                          let delta = 0;
                          if (r.handle === "se") delta = Math.max(dx, dy);
                          if (r.handle === "nw") delta = -Math.min(dx, dy);
                          if (r.handle === "ne") delta = Math.max(-dx, dy);
                          if (r.handle === "sw") delta = Math.max(dx, -dy);
                          const reference = Math.max(r.baseWidth, r.baseHeight, 1);
                          const nextScale = Math.max(0.05, r.startScale + delta / reference);
                          const scaleDelta = nextScale - r.startScale;
                          let nextOffsetX = r.startOffsetX;
                          let nextOffsetY = r.startOffsetY;
                          if (r.handle === "nw" || r.handle === "sw") nextOffsetX = r.startOffsetX - r.baseWidth * scaleDelta / scX;
                          if (r.handle === "nw" || r.handle === "ne") nextOffsetY = r.startOffsetY - r.baseHeight * scaleDelta / scY;
                          setPixelLayers(prev => prev.map(l => l.id === layer.id ? { ...l, scale: nextScale, offsetX: nextOffsetX, offsetY: nextOffsetY } : l));
                          return;
                        }
                        if (!pixelMovingRef.current || pixelMoveLayerRef.current?.id !== layer.id) return;
                        const move = pixelMoveLayerRef.current;
                        const dx = (ev.clientX - move.startX) / baseScaleX;
                        const dy = (ev.clientY - move.startY) / baseScaleY;
                        const nextOffsetX = move.offsetX + dx;
                        const nextOffsetY = move.offsetY + dy;
                        setPixelLayers(prev => prev.map(l => l.id === layer.id ? { ...l, offsetX: nextOffsetX, offsetY: nextOffsetY } : l));
                      }}
                      onMouseUp={() => { pixelMovingRef.current = false; pixelResizingRef.current = false; pixelMoveLayerRef.current = null; pixelResizeLayerRef.current = null; }}
                    >
                      <canvas ref={el => {
                        if (el && layer.canvas) {
                          el.width = layer.canvas.width; el.height = layer.canvas.height;
                          const c = el.getContext("2d")!; c.clearRect(0, 0, el.width, el.height); c.drawImage(layer.canvas, 0, 0);
                        }
                      }} width={layer.canvas.width} height={layer.canvas.height}
                        style={{
                          display: "block", width: "100%", height: "100%", imageRendering: "pixelated", pointerEvents: "none",
                          opacity: getPixelEffects(layer).opacity,
                          filter: pixelEffectsCss(layer),
                        }} />
                      {pixelTool === "move" && selected && handles.map(h => (
                        <div key={h.key} title="Arraste para redimensionar" style={{ position: "absolute", left: h.left, right: h.right, top: h.top, bottom: h.bottom, width: 12, height: 12, border: "2px solid #2563eb", background: "#fff", borderRadius: 2, cursor: h.cursor, boxSizing: "border-box" }} />
                      ))}
                    </div>
                  );
                })}
                </>
              );
            })()}

          </div>
        </div>
        <div className="w-56 bg-white border-l border-gray-200 flex flex-col flex-shrink-0 overflow-y-auto text-xs">
          {pixelEditMode ? (
            <div className="flex flex-col h-full" data-pixel-layers-panel="true">
              <div className="flex flex-col flex-1 overflow-y-auto">
                <p className="px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100" style={{fontSize:10}}>Camadas</p>

                {/* Pasted pixel layers are always above the base. The array is
                    bottom→top, while the panel is displayed top→bottom. */}
                {pixelLayers.slice().reverse().map(layer => {
                  const active = selectedPixelLayerIds.includes(layer.id);
                  return <div key={layer.id}
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("pixel-layer-id", layer.id);
                    }}
                    onDragOver={e => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={e => {
                      e.preventDefault();
                      const draggedId = e.dataTransfer.getData("pixel-layer-id");
                      if (!draggedId || draggedId === layer.id) return;
                      setPixelLayers(prev => {
                        // Reorder in the same top→bottom order the user sees,
                        // then convert back to the internal bottom→top order.
                        const display = [...prev].reverse();
                        const from = display.findIndex(l => l.id === draggedId);
                        const to = display.findIndex(l => l.id === layer.id);
                        if (from < 0 || to < 0) return prev;
                        const [moved] = display.splice(from, 1);
                        display.splice(to, 0, moved);
                        return display.reverse();
                      });
                    }}
                    className={`flex items-center gap-2 px-3 py-2 border-b border-gray-50 cursor-grab active:cursor-grabbing ${active ? "bg-indigo-50 text-indigo-700 font-semibold border-l-2 border-indigo-600" : "hover:bg-gray-50"}`}>
                    <span className="text-gray-300 select-none" title="Arraste para reorganizar">⋮⋮</span>
                    <canvas width={32} height={32} ref={el => {
                      if (el) {
                        const c=el.getContext("2d")!;
                        c.clearRect(0,0,32,32);
                        c.save();
                        c.globalAlpha = getPixelEffects(layer).opacity;
                        c.filter = pixelEffectsCss(layer);
                        c.drawImage(layer.canvas,0,0,32,32);
                        c.restore();
                      }
                    }} className="w-8 h-8 rounded bg-gray-100 border border-gray-200 flex-shrink-0" />
                    <button
                      onClick={e => {
                        const shift=e.shiftKey;
                        if (shift) {
                          setSelectedPixelLayerIds(prev => prev.includes(layer.id) ? prev.filter(id=>id!==layer.id) : [...prev,layer.id]);
                          setSelectedPixelLayerId(layer.id);
                        } else {
                          switchPixelEditTarget(layer.id);
                        }
                      }}
                      onDoubleClick={() => enterPixelLayerEdit(layer.id)}
                      className="text-left text-xs flex-1 truncate"
                    >{layer.name}</button>
                  </div>;
                })}

                {/* Base is permanently the bottom pixel layer. */}
                <button onClick={e => {
                  const shift = (e as any).shiftKey;
                  if (shift) {
                    setSelectedPixelLayerId(null);
                    setSelectedPixelLayerIds(prev => prev.includes(PIXEL_BASE_ID) ? prev.filter(id => id !== PIXEL_BASE_ID) : [...prev, PIXEL_BASE_ID]);
                  } else {
                    switchPixelEditTarget(PIXEL_BASE_ID);
                  }
                }} className={`w-full flex items-center gap-2 px-3 py-2 border-b border-gray-50 text-left ${selectedPixelLayerIds.includes(PIXEL_BASE_ID) ? "bg-indigo-50 text-indigo-700 font-semibold border-l-2 border-indigo-600" : "hover:bg-gray-50"}`}>
                  <span className="w-3 text-gray-200 flex-shrink-0">•</span>
                  <div className="w-8 h-8 rounded bg-gray-100 flex-shrink-0 overflow-hidden border border-gray-200">
                    <canvas ref={el => {
                      const source = pixelBaseCanvasRef.current || (pixelEditLayerIdRef.current ? null : pixelCanvasRef.current);
                      if (el && source) {
                        el.width = 32; el.height = 32;
                        const c = el.getContext("2d")!;
                        c.clearRect(0,0,32,32);
                        c.save();
                        c.globalAlpha = pixelBaseEffects.opacity;
                        c.filter = pixelEffectsCss(pixelBaseEffects);
                        c.drawImage(source, 0, 0, 32, 32);
                        c.restore();
                      }
                    }} width={32} height={32} style={{width:32,height:32}} />
                  </div>
                  <span className="text-xs flex-1">Imagem base</span>
                  {selectedPixelLayerIds.includes(PIXEL_BASE_ID) && <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" title="Camada ativa" />}
                </button>

                {selectedPixelLayerIds.length > 1 && (
                  <button onClick={() => mergePixelSelections()} className="mx-3 mt-2 py-1.5 rounded bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700">Mesclar camadas</button>
                )}
                {selectedPixelLayerIds.some(id => id !== PIXEL_BASE_ID) && (
                  <button onClick={deleteSelectedPixelLayers} className="mx-3 my-2 py-1.5 rounded border border-red-200 text-red-500 text-xs font-medium hover:bg-red-50">Excluir camada{selectedPixelLayerIds.filter(id => id !== PIXEL_BASE_ID).length > 1 ? "s" : ""}</button>
                )}

                {/* Same core image effects available to regular image objects,
                    applied only to the single selected pixel layer. */}
                {(() => {
                  if (selectedPixelLayerIds.length !== 1) return null;
                  const selectedId = selectedPixelLayerIds[0];
                  const selectedLayer = selectedId === PIXEL_BASE_ID ? null : pixelLayers.find(l => l.id === selectedId);
                  const fx = selectedId === PIXEL_BASE_ID ? pixelBaseEffects : (selectedLayer ? getPixelEffects(selectedLayer) : null);
                  if (!fx) return null;
                  return (
                    <div className="p-3 flex flex-col gap-3 border-t border-gray-200 mt-1">
                      <p className="font-semibold text-gray-500 uppercase tracking-wide" style={{fontSize:10}}>Efeitos</p>

                      <Sec title="Opacidade" />
                      <SliderRow label="" value={Math.round(fx.opacity * 100)} min={0} max={100} unit="%" onChange={v => updateSelectedPixelEffects({ opacity: v / 100 })} />

                      <Sec title="Saturação" />
                      <SliderRow label="" value={Math.round(fx.saturation * 100)} min={-100} max={100} unit="%" onChange={v => updateSelectedPixelEffects({ saturation: v / 100 })} />
                      <div className="flex justify-between text-gray-300 -mt-2" style={{fontSize:9}}><span>P&amp;B</span><span>Normal</span><span>Vivo</span></div>

                      <Sec title="Blur" />
                      <SliderRow label="" value={Math.round(fx.blur)} min={0} max={100} onChange={v => updateSelectedPixelEffects({ blur: v })} />

                      <Sec title="Sombra" />
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Ativar sombra</span>
                        <button onClick={() => updateSelectedPixelEffects({ shadow: !fx.shadow })}
                          className={`w-9 h-5 rounded-full transition ${fx.shadow ? "bg-indigo-500" : "bg-gray-200"}`}>
                          <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${fx.shadow ? "translate-x-4" : ""}`} />
                        </button>
                      </div>
                      {fx.shadow && (
                        <div className="flex flex-col gap-2">
                          <ColorPicker value={fx.shadowColor} onChange={c => updateSelectedPixelEffects({ shadowColor: c })} label="Cor" />
                          <SliderRow label="Opacidade" value={Math.round(fx.shadowOpacity * 100)} min={0} max={100} unit="%" onChange={v => updateSelectedPixelEffects({ shadowOpacity: v / 100 })} />
                          <SliderRow label="Blur" value={fx.shadowBlur} min={0} max={60} onChange={v => updateSelectedPixelEffects({ shadowBlur: v })} />
                          <SliderRow label="X" value={fx.shadowX} min={-50} max={50} onChange={v => updateSelectedPixelEffects({ shadowX: v })} />
                          <SliderRow label="Y" value={fx.shadowY} min={-50} max={50} onChange={v => updateSelectedPixelEffects({ shadowY: v })} />
                        </div>
                      )}

                      <Sec title="Brilho" />
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Ativar brilho</span>
                        <button onClick={() => updateSelectedPixelEffects({ glow: !fx.glow })}
                          className={`w-9 h-5 rounded-full transition ${fx.glow ? "bg-indigo-500" : "bg-gray-200"}`}>
                          <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${fx.glow ? "translate-x-4" : ""}`} />
                        </button>
                      </div>
                      {fx.glow && (
                        <div className="flex flex-col gap-2">
                          <ColorPicker value={fx.glowColor} onChange={c => updateSelectedPixelEffects({ glowColor: c })} label="Cor" />
                          <SliderRow label="Opacidade" value={Math.round(fx.glowOpacity * 100)} min={0} max={100} unit="%" onChange={v => updateSelectedPixelEffects({ glowOpacity: v / 100 })} />
                          <SliderRow label="Blur" value={fx.glowBlur} min={0} max={80} onChange={v => updateSelectedPixelEffects({ glowBlur: v })} />
                          <SliderRow label="Distância" value={fx.glowDistance} min={0} max={50} onChange={v => updateSelectedPixelEffects({ glowDistance: v })} />
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
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
                  <FillColorPickerWithGradient
                    solid={selFill}
                    gradient={selFillGradient}
                    onSolid={v => { (isText ? updateFillForText : updateFill)(v); setSelFillGradient(null); }}
                    onGradient={g => updateFillGradient(g)}
                  />
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
                  <Sec title="Transformação livre" />
                  <SliderRow label="Rotação" value={selRotation} min={0} max={360} unit="°" onChange={updateRotation} />
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Manter proporção</span>
                    <button onClick={() => setLockTransformRatio(v => !v)} className={`w-9 h-5 rounded-full transition ${lockTransformRatio ? "bg-indigo-500" : "bg-gray-200"}`}>
                      <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${lockTransformRatio ? "translate-x-4" : ""}`} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <NumRow label="Escala X (%)" value={selScaleX} min={1} max={1000} onChange={v => updateTransformScale("x", v)} />
                    <NumRow label="Escala Y (%)" value={selScaleY} min={1} max={1000} onChange={v => updateTransformScale("y", v)} />
                  </div>
                  <SliderRow label="Inclinação X" value={selSkewX} min={-75} max={75} unit="°" onChange={v => updateTransformSkew("x", v)} />
                  <SliderRow label="Inclinação Y" value={selSkewY} min={-75} max={75} unit="°" onChange={v => updateTransformSkew("y", v)} />
                  <div className="grid grid-cols-2 gap-1">
                    <button onClick={() => toggleTransformFlip("x")} className={`py-1.5 rounded-lg border text-xs transition ${selFlipX ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>↔ Flip horizontal</button>
                    <button onClick={() => toggleTransformFlip("y")} className={`py-1.5 rounded-lg border text-xs transition ${selFlipY ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>↕ Flip vertical</button>
                  </div>
                  <button onClick={resetFreeTransform} className="w-full py-1.5 rounded-lg border border-gray-200 text-gray-500 text-xs hover:bg-gray-50">Resetar transformação</button>
                </>
              )}

              {supported3DShape(sel) && (
                <>
                  <Sec title="3D" />
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Ativar 3D</span>
                    <button disabled={!threeLoaded} onClick={() => applyShape3D({ enabled: !sel3DEnabled })} className={`w-9 h-5 rounded-full transition disabled:opacity-40 ${sel3DEnabled ? "bg-indigo-500" : "bg-gray-200"}`}>
                      <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${sel3DEnabled ? "translate-x-4" : ""}`} />
                    </button>
                  </div>
                  {sel3DEnabled && (
                    <div className="flex flex-col gap-2 p-2 rounded-lg border border-indigo-100 bg-indigo-50/30">
                      <SliderRow label="Extrusão" value={sel3DDepth} min={1} max={200} unit="px" onChange={v => applyShape3D({ depth:v })} />
                      <SliderRow label="Rotação X" value={sel3DRotX} min={-180} max={180} unit="°" onChange={v => applyShape3D({ rotX:v })} />
                      <SliderRow label="Rotação Y" value={sel3DRotY} min={-180} max={180} unit="°" onChange={v => applyShape3D({ rotY:v })} />
                      <SliderRow label="Rotação Z" value={sel3DRotZ} min={-180} max={180} unit="°" onChange={v => applyShape3D({ rotZ:v })} />
                      <SliderRow label="Perspectiva" value={sel3DPerspective} min={18} max={90} unit="°" onChange={v => applyShape3D({ perspective:v })} />
                      <ColorPicker value={sel3DSideColor} onChange={c => applyShape3D({ sideColor:c })} label="Cor da extrusão" />
                      <SliderRow label="Iluminação" value={sel3DLight} min={0} max={200} unit="%" onChange={v => applyShape3D({ light:v })} />
                      <button onClick={resetShape3D} className="w-full py-1.5 rounded-lg border border-indigo-200 text-indigo-600 bg-white text-xs hover:bg-indigo-50">Resetar 3D</button>
                      <button onClick={() => applyShape3D({ enabled:false })} className="w-full py-1.5 rounded-lg border border-gray-200 text-gray-500 bg-white text-xs hover:bg-gray-50">Remover 3D</button>
                    </div>
                  )}
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
                  <ColorPicker value={selShadowColor} onChange={c => { setSelShadowColor(c); applyShadow(c, selShadowBlur, selShadowX, selShadowY, selShadowOpacity); }} label="Cor" />
                  <SliderRow label="Opacidade" value={Math.round(selShadowOpacity * 100)} min={0} max={100} unit="%" onChange={v => { const o=v/100; setSelShadowOpacity(o); applyShadow(selShadowColor, selShadowBlur, selShadowX, selShadowY, o); }} />
                  <SliderRow label="Blur" value={selShadowBlur} min={0} max={60} onChange={v => { setSelShadowBlur(v); applyShadow(selShadowColor, v, selShadowX, selShadowY, selShadowOpacity); }} />
                  <SliderRow label="X" value={selShadowX} min={-50} max={50} onChange={v => { setSelShadowX(v); applyShadow(selShadowColor, selShadowBlur, v, selShadowY, selShadowOpacity); }} />
                  <SliderRow label="Y" value={selShadowY} min={-50} max={50} onChange={v => { setSelShadowY(v); applyShadow(selShadowColor, selShadowBlur, selShadowX, v, selShadowOpacity); }} />
                </div>
              )}

              <Sec title="Brilho" />
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Ativar brilho</span>
                <button onClick={() => updateGlow(!selGlow)} className={`w-9 h-5 rounded-full transition ${selGlow?"bg-indigo-500":"bg-gray-200"}`}>
                  <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${selGlow?"translate-x-4":""}`} />
                </button>
              </div>
              {selGlow && (
                <div className="flex flex-col gap-2">
                  <ColorPicker value={selGlowColor} onChange={c => { setSelGlowColor(c); applyGlow(c, selGlowBlur, selGlowDistance, selGlowOpacity); }} label="Cor" />
                  <SliderRow label="Opacidade" value={Math.round(selGlowOpacity * 100)} min={0} max={100} unit="%" onChange={v => { const o=v/100; setSelGlowOpacity(o); applyGlow(selGlowColor, selGlowBlur, selGlowDistance, o); }} />
                  <SliderRow label="Blur" value={selGlowBlur} min={0} max={80} onChange={v => { setSelGlowBlur(v); applyGlow(selGlowColor, v, selGlowDistance, selGlowOpacity); }} />
                  <SliderRow label="Distância" value={selGlowDistance} min={0} max={50} onChange={v => { setSelGlowDistance(v); applyGlow(selGlowColor, selGlowBlur, v, selGlowOpacity); }} />
                </div>
              )}
                </>
              )}

              {sel.type === "image" && (
                <>
                  <Sec title="Imagem" />
                  <button onClick={() => setCropMode(v => !v)}
                    className={`w-full py-2 rounded-lg border text-xs font-medium transition ${cropMode ? "bg-indigo-600 text-white border-indigo-600" : "border-indigo-200 text-indigo-600 hover:bg-indigo-50"}`}>
                    ✂ {cropMode ? "Fechar recorte" : ((sel as any).__crop ? "Editar recorte" : "Recortar imagem")}
                  </button>
                  {cropMode && (
                    <div className="flex flex-col gap-2 p-2 border border-indigo-100 rounded-lg bg-indigo-50/30">
                      <div className="grid grid-cols-4 gap-1">
                        <button onClick={() => setCropAspect(1)} className="py-1 border border-gray-200 rounded bg-white hover:bg-gray-50">1:1</button>
                        <button onClick={() => setCropAspect(4/5)} className="py-1 border border-gray-200 rounded bg-white hover:bg-gray-50">4:5</button>
                        <button onClick={() => setCropAspect(16/9)} className="py-1 border border-gray-200 rounded bg-white hover:bg-gray-50">16:9</button>
                        <button onClick={() => setCropAspect(9/16)} className="py-1 border border-gray-200 rounded bg-white hover:bg-gray-50">9:16</button>
                      </div>
                      <SliderRow label="X" value={Math.round(cropX)} min={0} max={Math.max(0,100-cropW)} unit="%" onChange={v => applyImageCrop(v,cropY,cropW,cropH)} />
                      <SliderRow label="Y" value={Math.round(cropY)} min={0} max={Math.max(0,100-cropH)} unit="%" onChange={v => applyImageCrop(cropX,v,cropW,cropH)} />
                      <SliderRow label="Largura" value={Math.round(cropW)} min={1} max={100-cropX} unit="%" onChange={v => applyImageCrop(cropX,cropY,v,cropH)} />
                      <SliderRow label="Altura" value={Math.round(cropH)} min={1} max={100-cropY} unit="%" onChange={v => applyImageCrop(cropX,cropY,cropW,v)} />
                      <div className="grid grid-cols-2 gap-1">
                        <button onClick={resetImageCrop} className="py-1.5 border border-gray-200 text-gray-500 rounded bg-white hover:bg-gray-50">Resetar</button>
                        <button onClick={() => setCropMode(false)} className="py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700">Concluir</button>
                      </div>
                      <p className="text-[9px] text-gray-400">Recorte não destrutivo: a imagem original é preservada.</p>
                    </div>
                  )}
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
                  <Sec title="Ajustes" />
                  <div className="flex flex-col gap-2 p-2 rounded-lg border border-gray-100 bg-gray-50/40">
                    <SliderRow label="Brilho" value={Math.round(selBrightness * 100)} min={-100} max={100} unit="%" onChange={v => applyImageAdjustments({ brightness: v / 100 })} />
                    <SliderRow label="Contraste" value={Math.round(selContrast * 100)} min={-100} max={100} unit="%" onChange={v => applyImageAdjustments({ contrast: v / 100 })} />
                    <SliderRow label="Exposição" value={Math.round(selExposure * 100)} min={-100} max={100} unit="%" onChange={v => applyImageAdjustments({ exposure: v / 100 })} />
                    <SliderRow label="Saturação" value={Math.round(selSaturation * 100)} min={-100} max={100} unit="%" onChange={v => updateSaturation(v / 100)} />
                    <SliderRow label="Temperatura" value={Math.round(selTemperature * 100)} min={-100} max={100} unit="%" onChange={v => applyImageAdjustments({ temperature: v / 100 })} />
                    <SliderRow label="Matiz" value={Math.round(selTint * 100)} min={-100} max={100} unit="%" onChange={v => applyImageAdjustments({ tint: v / 100 })} />
                    <SliderRow label="Realces" value={Math.round(selHighlights * 100)} min={-100} max={100} unit="%" onChange={v => applyImageAdjustments({ highlights: v / 100 })} />
                    <SliderRow label="Sombras" value={Math.round(selShadows * 100)} min={-100} max={100} unit="%" onChange={v => applyImageAdjustments({ shadows: v / 100 })} />
                    <SliderRow label="Nitidez" value={Math.round(selSharpness * 100)} min={0} max={100} unit="%" onChange={v => applyImageAdjustments({ sharpness: v / 100 })} />
                    <SliderRow label="Vinheta" value={Math.round(selVignette * 100)} min={0} max={100} unit="%" onChange={v => applyImageAdjustments({ vignette: v / 100 })} />
                    <button onClick={resetImageAdjustments} className="w-full py-1.5 mt-1 border border-gray-200 text-gray-500 rounded-lg bg-white hover:bg-gray-50 transition">Zerar ajustes</button>
                  </div>
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
              <FillColorPickerWithGradient
                solid={bgSolid}
                gradient={bgGradient}
                onSolid={bg => { setBgSolid(bg); setBgGradient(null); }}
                onGradient={g => setBgGradient(g)}
              />
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
                      setSelectedPixelLayerIds([]); setSelectedPixelLayerId(null);

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