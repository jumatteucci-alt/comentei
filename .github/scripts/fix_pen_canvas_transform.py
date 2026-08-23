from pathlib import Path

p = Path('src/app/dashboard/canvas/editor/page.tsx')
s = p.read_text()

# 1) Finishing a Pen shape must really return Fabric to normal Select mode.
old = '''    canvas.add(path);\n    canvas.setActiveObject(path);\n    syncSel(path);\n    lastFinalizedPath.current = path;\n\n    activeToolRef.current = "select";\n    setActiveTool("select");\n    canvas.defaultCursor = "default";\n    canvas.hoverCursor = "move";\n    canvas.selection = true;\n    canvas.requestRenderAll();'''
new = '''    path.set({ selectable: true, evented: true, hasControls: true, hasBorders: true, padding: Math.max(Number(path.padding || 0), 8) });\n    path.setCoords();\n    canvas.add(path);\n    canvas.setActiveObject(path);\n    syncSel(path);\n    lastFinalizedPath.current = path;\n\n    activeToolRef.current = "select";\n    setActiveTool("select");\n    canvas.isDrawingMode = false;\n    canvas.skipTargetFind = false;\n    canvas.defaultCursor = "default";\n    canvas.hoverCursor = "move";\n    canvas.selection = true;\n    canvas.requestRenderAll();'''
assert old in s, 'finalizePen marker missing'
s = s.replace(old, new, 1)

# 2) Canvas size changes must not dispose/recreate Fabric (which deletes every object).
old = '''  }, [fabricLoaded, canvasWidth, canvasHeight]);'''
new = '''  }, [fabricLoaded]);'''
assert old in s, 'fabric init dependency marker missing'
s = s.replace(old, new, 1)

# 3) State for visually selecting/resizing the canvas itself.
old = '''  const [bgSolid, setBgSolid] = useState("#ffffff");\n  const [bgGradient, setBgGradient] = useState<GradValue|null>(null);'''
new = '''  const [bgSolid, setBgSolid] = useState("#ffffff");\n  const [bgGradient, setBgGradient] = useState<GradValue|null>(null);\n  const [canvasTransformMode, setCanvasTransformMode] = useState(false);\n  const canvasTransformDragRef = useRef<{\n    handle: "nw"|"n"|"ne"|"e"|"se"|"s"|"sw"|"w";\n    startX: number; startY: number; startW: number; startH: number; zoom: number;\n  } | null>(null);'''
assert old in s, 'canvas transform state marker missing'
s = s.replace(old, new, 1)

# 4) Global pointer drag for the canvas transform handles.
marker = '''  useEffect(() => {\n    fitCanvasToScreen();\n  }, [fitCanvasToScreen]);'''
insert = '''  useEffect(() => {\n    fitCanvasToScreen();\n  }, [fitCanvasToScreen]);\n\n  useEffect(() => {\n    const onMove = (e: PointerEvent) => {\n      const drag = canvasTransformDragRef.current;\n      if (!drag) return;\n      const dx = (e.clientX - drag.startX) / Math.max(0.1, drag.zoom);\n      const dy = (e.clientY - drag.startY) / Math.max(0.1, drag.zoom);\n      let w = drag.startW;\n      let h = drag.startH;\n      if (drag.handle.includes("e")) w = drag.startW + dx;\n      if (drag.handle.includes("w")) w = drag.startW - dx;\n      if (drag.handle.includes("s")) h = drag.startH + dy;\n      if (drag.handle.includes("n")) h = drag.startH - dy;\n      w = Math.max(50, Math.min(8000, Math.round(w)));\n      h = Math.max(50, Math.min(8000, Math.round(h)));\n      setCanvasWidth(w);\n      setCanvasHeight(h);\n      setInputWidth(String(w));\n      setInputHeight(String(h));\n    };\n    const onUp = () => { canvasTransformDragRef.current = null; };\n    window.addEventListener("pointermove", onMove);\n    window.addEventListener("pointerup", onUp);\n    window.addEventListener("pointercancel", onUp);\n    return () => {\n      window.removeEventListener("pointermove", onMove);\n      window.removeEventListener("pointerup", onUp);\n      window.removeEventListener("pointercancel", onUp);\n    };\n  }, []);'''
assert marker in s, 'fit effect marker missing'
s = s.replace(marker, insert, 1)

# 5) Clicking the gray workspace selects the canvas; clicking the canvas deselects that mode.
old = '''        <div ref={canvasContainerRef} className="flex-1 overflow-auto flex items-start justify-center p-8 bg-gray-100">\n          <div className="shadow-2xl relative" data-pixel-canvas-area="true">'''
new = '''        <div ref={canvasContainerRef}\n          onPointerDown={e => {\n            if (e.target !== e.currentTarget || pixelEditMode) return;\n            setCanvasTransformMode(true);\n            if (fc.current) { fc.current.discardActiveObject(); fc.current.requestRenderAll(); }\n            syncSel(null);\n          }}\n          className="flex-1 overflow-auto flex items-start justify-center p-8 bg-gray-100">\n          <div className="shadow-2xl relative" data-pixel-canvas-area="true"\n            onPointerDown={() => { if (!canvasTransformDragRef.current) setCanvasTransformMode(false); }}>'''
assert old in s, 'canvas viewport marker missing'
s = s.replace(old, new, 1)

# 6) Visual free-transform frame for the canvas, including 8 resize handles.
old = '''            ) : <canvas ref={canvasRef} />}\n\n            {/* Visual non-destructive crop overlay */}'''
new = '''            ) : <canvas ref={canvasRef} />}\n\n            {!pixelEditMode && canvasTransformMode && (() => {\n              const handles = [\n                ["nw", -7, -7, undefined, undefined, "nwse-resize"],\n                ["n", "50%", -7, undefined, undefined, "ns-resize"],\n                ["ne", undefined, -7, -7, undefined, "nesw-resize"],\n                ["e", undefined, "50%", -7, undefined, "ew-resize"],\n                ["se", undefined, undefined, -7, -7, "nwse-resize"],\n                ["s", "50%", undefined, undefined, -7, "ns-resize"],\n                ["sw", -7, undefined, undefined, -7, "nesw-resize"],\n                ["w", -7, "50%", undefined, undefined, "ew-resize"],\n              ] as const;\n              return (\n                <div style={{ position:"absolute", inset:-2, border:"2px solid #4f46e5", boxSizing:"border-box", zIndex:70, pointerEvents:"none" }}>\n                  <div style={{ position:"absolute", left:8, top:-24, background:"#4f46e5", color:"white", borderRadius:5, padding:"2px 7px", fontSize:10, whiteSpace:"nowrap" }}>\n                    Canvas · {canvasWidth} × {canvasHeight}\n                  </div>\n                  {handles.map(([handle,left,top,right,bottom,cursor]) => (\n                    <div key={handle}\n                      onPointerDown={e => {\n                        e.preventDefault(); e.stopPropagation();\n                        canvasTransformDragRef.current = {\n                          handle, startX:e.clientX, startY:e.clientY, startW:canvasWidth, startH:canvasHeight, zoom:zoom/100,\n                        };\n                        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);\n                      }}\n                      style={{\n                        position:"absolute", left, top, right, bottom, width:14, height:14,\n                        transform: (left === "50%" || top === "50%") ? "translate(-50%,-50%)" : undefined,\n                        background:"white", border:"2px solid #4f46e5", borderRadius:2, cursor, pointerEvents:"auto", boxSizing:"border-box",\n                      }} />\n                  ))}\n                </div>\n              );\n            })()}\n\n            {/* Visual non-destructive crop overlay */}'''
assert old in s, 'canvas overlay marker missing'
s = s.replace(old, new, 1)

p.write_text(s)
