from pathlib import Path

p = Path('src/app/dashboard/canvas/editor/page.tsx')
s = p.read_text()

# 1) Animation/export state and motion path UI refresh.
old = '''  const [animationPlaying, setAnimationPlaying] = useState(false);\n  const [animationBackgrounds, setAnimationBackgrounds] = useState<Record<number, AnimationBackground>>({});'''
new = '''  const [animationPlaying, setAnimationPlaying] = useState(false);\n  const [animationExporting, setAnimationExporting] = useState(false);\n  const [animationExportProgress, setAnimationExportProgress] = useState(0);\n  const [motionPathVersion, setMotionPathVersion] = useState(0);\n  const [animationBackgrounds, setAnimationBackgrounds] = useState<Record<number, AnimationBackground>>({});'''
assert old in s, 'animation state marker missing'
s = s.replace(old, new, 1)

old = '''  const animationModeRef = useRef(false);\n  const animationLoadingRef = useRef(false);'''
new = '''  const animationModeRef = useRef(false);\n  const animationLoadingRef = useRef(false);\n  const animationPlayingRef = useRef(false);\n  const animationExportingRef = useRef(false);'''
assert old in s, 'animation ref marker missing'
s = s.replace(old, new, 1)

old = '''  useEffect(() => { animationModeRef.current = animationMode; }, [animationMode]);\n  useEffect(() => { animationLayersRef.current = animationLayers; }, [animationLayers]);'''
new = '''  useEffect(() => { animationModeRef.current = animationMode; }, [animationMode]);\n  useEffect(() => { animationPlayingRef.current = animationPlaying; }, [animationPlaying]);\n  useEffect(() => { animationExportingRef.current = animationExporting; }, [animationExporting]);\n  useEffect(() => { animationLayersRef.current = animationLayers; }, [animationLayers]);'''
assert old in s, 'animation effects marker missing'
s = s.replace(old, new, 1)

# 2) Persist motion-path metadata in animation snapshots.
old = '''    "__glowDistance", "__glowOpacity", "__shadowOpacity", "__shadowBaseColor", "__fixedHeight",\n  ];'''
new = '''    "__glowDistance", "__glowOpacity", "__shadowOpacity", "__shadowBaseColor", "__fixedHeight",\n    "__motionPath", "__isMotionPath", "excludeFromExport",\n  ];'''
assert old in s, 'animation props marker missing'
s = s.replace(old, new, 1)

# 3) Motion path interpolation follows the same keyframe easing.
old = '''    if (from.__threeD && to.__threeD && from.__threeD.enabled && to.__threeD.enabled) {\n      out.__threeD = { ...from.__threeD };\n      ["depth","rotX","rotY","rotZ","perspective","light"].forEach(k => {\n        if (from.__threeD[k] != null && to.__threeD[k] != null) out.__threeD[k] = k.startsWith("rot") ? tweenAngle(from.__threeD[k], to.__threeD[k], t) : tweenNumber(from.__threeD[k], to.__threeD[k], t);\n      });\n    }\n    return out;'''
new = '''    if (from.__threeD && to.__threeD && from.__threeD.enabled && to.__threeD.enabled) {\n      out.__threeD = { ...from.__threeD };\n      ["depth","rotX","rotY","rotZ","perspective","light"].forEach(k => {\n        if (from.__threeD[k] != null && to.__threeD[k] != null) out.__threeD[k] = k.startsWith("rot") ? tweenAngle(from.__threeD[k], to.__threeD[k], t) : tweenNumber(from.__threeD[k], to.__threeD[k], t);\n      });\n    }\n    if (from.__motionPath && to.__motionPath && from.__motionPath.pathId === to.__motionPath.pathId) {\n      out.__motionPath = { ...from.__motionPath };\n      ["progress","offsetX","offsetY","rotationOffset"].forEach(k => {\n        if (from.__motionPath[k] != null && to.__motionPath[k] != null) out.__motionPath[k] = tweenNumber(from.__motionPath[k], to.__motionPath[k], t);\n      });\n    }\n    return out;'''
assert old in s, 'tween marker missing'
s = s.replace(old, new, 1)

# 4) Insert motion path helpers before resolveAnimationLayerFrame.
marker = '''  const resolveAnimationLayerFrame = (layer: AnimationLayer, frame: number) => {'''
helpers = r'''  const motionPathD = (guide:any) => {
    if (!guide?.path) return "";
    return guide.path.map((cmd:any[]) => `${cmd[0]} ${cmd.slice(1).join(" ")}`).join(" ");
  };

  const motionPathPoint = (guide:any, progress:number) => {
    if (!guide?.path || typeof document === "undefined") return null;
    try {
      const fabric = (window as any).fabric;
      const svgPath = document.createElementNS("http://www.w3.org/2000/svg", "path") as SVGPathElement;
      svgPath.setAttribute("d", motionPathD(guide));
      const total = Math.max(0.001, svgPath.getTotalLength());
      const pct = Math.max(0, Math.min(100, progress)) / 100;
      const at = total * pct;
      const eps = Math.max(0.5, total / 1000);
      const p = svgPath.getPointAtLength(at);
      const p0 = svgPath.getPointAtLength(Math.max(0, at - eps));
      const p1 = svgPath.getPointAtLength(Math.min(total, at + eps));
      const po = guide.pathOffset || { x:0, y:0 };
      const m = guide.calcTransformMatrix();
      const world = fabric.util.transformPoint({ x:p.x - po.x, y:p.y - po.y }, m);
      const w0 = fabric.util.transformPoint({ x:p0.x - po.x, y:p0.y - po.y }, m);
      const w1 = fabric.util.transformPoint({ x:p1.x - po.x, y:p1.y - po.y }, m);
      return { x:world.x, y:world.y, angle:Math.atan2(w1.y-w0.y, w1.x-w0.x) * 180 / Math.PI };
    } catch { return null; }
  };

  const setMotionGuidesVisible = (canvas:any, visible:boolean) => {
    if (!canvas) return;
    canvas.getObjects().forEach((o:any) => {
      if (!o.__isMotionPath) return;
      o.set({ visible, selectable:visible, evented:visible, excludeFromExport:true });
      o.setCoords?.();
    });
    canvas.requestRenderAll?.();
  };

  const applyMotionPathPlacement = (obj:any, canvas = fc.current) => {
    if (!obj?.__motionPath || !canvas) return;
    const mp = obj.__motionPath;
    const guide = canvas.getObjects().find((o:any) => o.__uid === mp.pathId && o.__isMotionPath);
    if (!guide) return;
    const pct = mp.reverse ? 100 - Number(mp.progress ?? 0) : Number(mp.progress ?? 0);
    const pt = motionPathPoint(guide, pct);
    if (!pt) return;
    const fabric = (window as any).fabric;
    obj.setPositionByOrigin(new fabric.Point(pt.x + Number(mp.offsetX || 0), pt.y + Number(mp.offsetY || 0)), "center", "center");
    if (mp.orientToPath) obj.set({ angle:pt.angle + Number(mp.rotationOffset || 0) });
    obj.setCoords?.();
  };

  const applyAllMotionPaths = (canvas = fc.current) => {
    if (!canvas) return;
    canvas.getObjects().forEach((o:any) => { if (o.__motionPath && !o.__isMotionPath) applyMotionPathPlacement(o, canvas); });
    canvas.requestRenderAll?.();
  };

  const prepareMotionGuide = (guide:any, visible=true) => {
    if (!guide) return;
    guide.__uid = guide.__uid || Math.random().toString(36).slice(2);
    guide.__isMotionPath = true;
    guide.set({
      fill:"transparent", stroke:"#6366f1", strokeWidth:2, strokeDashArray:[8,5], opacity:.9,
      visible, selectable:visible, evented:visible, excludeFromExport:true, objectCaching:false,
    });
    guide.setCoords?.();
  };

  const linkSelectionToMotionPath = () => {
    if (!fc.current || sel?.type !== "activeSelection") return;
    const canvas = fc.current;
    const objects = (sel as any).getObjects().filter((o:any) => !o.isControlHelper && !o.isEditPreview);
    const guide = objects.find((o:any) => o.type === "path");
    const target = objects.find((o:any) => o !== guide && !o.__isMotionPath);
    if (!guide || !target) return;
    target.__uid = target.__uid || Math.random().toString(36).slice(2);
    const layerId = target.__animLayerId || selectedAnimLayerIdRef.current;
    target.__animLayerId = layerId;
    guide.__animLayerId = layerId;
    prepareMotionGuide(guide, true);
    const start = motionPathPoint(guide, 0);
    target.__motionPath = {
      pathId:guide.__uid, progress:0, orientToPath:false, reverse:false,
      offsetX:0, offsetY:0, rotationOffset:start ? Number(target.angle || 0) - start.angle : 0,
    };
    applyMotionPathPlacement(target, canvas);
    canvas.discardActiveObject();
    canvas.setActiveObject(target);
    syncSel(target);
    setMotionPathVersion(v => v + 1);
    canvas.requestRenderAll();
    if (animationModeRef.current) {
      animationFrameDirtyRef.current = true;
      requestAnimationFrame(() => saveAnimationFrame(currentFrameRef.current, layerId));
    }
  };

  const updateSelectedMotionPath = (patch:Record<string,any>) => {
    if (!fc.current || !sel?.__motionPath || sel.__isMotionPath) return;
    const next = { ...sel.__motionPath, ...patch };
    if (patch.orientToPath === true && !sel.__motionPath.orientToPath) {
      const guide = fc.current.getObjects().find((o:any) => o.__uid === next.pathId && o.__isMotionPath);
      const pct = next.reverse ? 100 - Number(next.progress ?? 0) : Number(next.progress ?? 0);
      const pt = motionPathPoint(guide, pct);
      if (pt) next.rotationOffset = Number(sel.angle || 0) - pt.angle;
    }
    sel.__motionPath = next;
    applyMotionPathPlacement(sel);
    setMotionPathVersion(v => v + 1);
    fc.current.requestRenderAll();
    if (animationModeRef.current) {
      animationFrameDirtyRef.current = true;
      requestAnimationFrame(() => saveAnimationFrame(currentFrameRef.current, sel.__animLayerId || selectedAnimLayerIdRef.current));
    }
  };

  const unlinkSelectedMotionPath = () => {
    if (!fc.current || !sel?.__motionPath) return;
    const pathId = sel.__motionPath.pathId;
    delete sel.__motionPath;
    const guide = fc.current.getObjects().find((o:any) => o.__uid === pathId && o.__isMotionPath);
    if (guide) {
      guide.__isMotionPath = false;
      guide.excludeFromExport = false;
      guide.set({ visible:true, selectable:true, evented:true, strokeDashArray:null, opacity:1 });
    }
    setMotionPathVersion(v => v + 1);
    fc.current.requestRenderAll();
    if (animationModeRef.current) requestAnimationFrame(() => saveAnimationFrame(currentFrameRef.current, sel.__animLayerId || selectedAnimLayerIdRef.current));
  };

'''
assert marker in s, 'resolve frame marker missing'
s = s.replace(marker, helpers + marker, 1)

# 5) Keyframes may contain guides, but guides alone do not keep a keyframe alive.
old = '''    const layerObjects = objects.filter((o:any) => o.__animLayerId === layerId).map(serializeAnimationObject);\n    const next = animationLayersRef.current.map(layer => {\n      if (layer.id !== layerId) return layer;\n      const frames = { ...layer.frames };\n      if (layerObjects.length > 0) frames[frame] = layerObjects;\n      else delete frames[frame];'''
new = '''    const layerLiveObjects = objects.filter((o:any) => o.__animLayerId === layerId);\n    const realObjects = layerLiveObjects.filter((o:any) => !o.__isMotionPath);\n    const layerObjects = layerLiveObjects.map(serializeAnimationObject);\n    const next = animationLayersRef.current.map(layer => {\n      if (layer.id !== layerId) return layer;\n      const frames = { ...layer.frames };\n      if (realObjects.length > 0) frames[frame] = layerObjects;\n      else delete frames[frame];'''
assert old in s, 'save frame guide marker missing'
s = s.replace(old, new, 1)

# 6) Frame load reapplies guide styling/visibility and path placement.
old = '''      canvas.getObjects().forEach((o:any) => {\n        if (o.__vectorBlur) applyVectorBlurRendering(o, Number(o.__vectorBlur));\n        if (o.__threeD?.enabled) requestAnimationFrame(() => refreshThreeDObject(o));\n        o.setCoords?.();\n      });'''
new = '''      canvas.getObjects().forEach((o:any) => {\n        if (o.__vectorBlur) applyVectorBlurRendering(o, Number(o.__vectorBlur));\n        if (o.__threeD?.enabled) requestAnimationFrame(() => refreshThreeDObject(o));\n        if (o.__isMotionPath) prepareMotionGuide(o, !animationPlayingRef.current && !animationExportingRef.current);\n        o.setCoords?.();\n      });\n      applyAllMotionPaths(canvas);\n      setMotionGuidesVisible(canvas, !animationPlayingRef.current && !animationExportingRef.current);'''
assert old in s, 'frame load object loop missing'
s = s.replace(old, new, 1)

# 7) Playback hides guides; stop restores them.
old = '''  const playAnimation = () => {\n    if (!animationModeRef.current) return;\n    if (animationFrameDirtyRef.current) saveAnimationFrame(currentFrameRef.current);\n    setAnimationPlaying(true);\n  };\n\n  const stopAnimation = () => setAnimationPlaying(false);'''
new = '''  const playAnimation = () => {\n    if (!animationModeRef.current) return;\n    if (animationFrameDirtyRef.current) saveAnimationFrame(currentFrameRef.current);\n    animationPlayingRef.current = true;\n    setMotionGuidesVisible(fc.current, false);\n    setAnimationPlaying(true);\n  };\n\n  const stopAnimation = () => {\n    animationPlayingRef.current = false;\n    setAnimationPlaying(false);\n    setMotionGuidesVisible(fc.current, true);\n    applyAllMotionPaths(fc.current);\n  };'''
assert old in s, 'play stop marker missing'
s = s.replace(old, new, 1)

# 8) Motion-guide edits immediately update linked objects and keyframe.
old = '''          if (obj?.type !== "textbox" && obj?.type !== "i-text") {\n            syncSel(obj);\n          }\n          if (animationModeRef.current && !animationLoadingRef.current && obj && !obj.isControlHelper && !obj.isEditPreview) {'''
new = '''          if (obj?.type !== "textbox" && obj?.type !== "i-text") {\n            syncSel(obj);\n          }\n          if (obj?.__isMotionPath) { applyAllMotionPaths(canvas); setMotionPathVersion(v => v + 1); }\n          if (animationModeRef.current && !animationLoadingRef.current && obj && !obj.isControlHelper && !obj.isEditPreview) {'''
assert old in s, 'object modified motion marker missing'
s = s.replace(old, new, 1)

# 9) WebM export inserted before canvas transform pointer effect.
marker = '''  useEffect(() => {\n    const onMove = (e: PointerEvent) => {\n      const drag = canvasTransformDragRef.current;'''
export_code = r'''  const waitForAnimationFrame = async (frame:number) => {
    loadAnimationFrame(frame, false, false);
    while (animationLoadingRef.current) await new Promise(r => setTimeout(r, 1));
    await new Promise<void>(r => requestAnimationFrame(() => r()));
  };

  const exportAnimationWebM = async () => {
    if (!fc.current || !animationModeRef.current || animationExportingRef.current) return;
    const canvas = fc.current;
    const htmlCanvas = canvas.lowerCanvasEl as HTMLCanvasElement;
    if (!htmlCanvas || typeof htmlCanvas.captureStream !== "function" || typeof MediaRecorder === "undefined") {
      alert("Seu navegador não oferece suporte à exportação WebM por Canvas.");
      return;
    }
    if (animationFrameDirtyRef.current) saveAnimationFrame(currentFrameRef.current);
    const returnFrame = currentFrameRef.current;
    const oldW = canvas.getWidth(), oldH = canvas.getHeight(), oldZoom = canvas.getZoom();
    animationExportingRef.current = true;
    animationPlayingRef.current = false;
    setAnimationPlaying(false);
    setAnimationExporting(true);
    setAnimationExportProgress(0);
    setMotionGuidesVisible(canvas, false);
    try {
      canvas.setDimensions({ width:canvasWidth, height:canvasHeight });
      canvas.setZoom(1);
      const out = document.createElement("canvas");
      out.width = canvasWidth; out.height = canvasHeight;
      const ctx = out.getContext("2d")!;
      const stream = out.captureStream(Math.max(1, animationFps));
      const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find(t => MediaRecorder.isTypeSupported(t)) || "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType:mime, videoBitsPerSecond:8_000_000 });
      const chunks:BlobPart[] = [];
      recorder.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
      const stopped = new Promise<void>(resolve => recorder.addEventListener("stop", () => resolve(), { once:true }));
      recorder.start();
      const frameMs = 1000 / Math.max(1, animationFps);
      for (let frame=0; frame<=100; frame++) {
        await waitForAnimationFrame(frame);
        setMotionGuidesVisible(canvas, false);
        applyAllMotionPaths(canvas);
        canvas.renderAll();
        ctx.clearRect(0,0,out.width,out.height);
        ctx.drawImage(canvas.lowerCanvasEl, 0,0,out.width,out.height);
        setAnimationExportProgress(Math.round(frame / 100 * 100));
        await new Promise(r => setTimeout(r, frameMs));
      }
      recorder.stop();
      await stopped;
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type:mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(artName || "animacao").replace(/[^a-z0-9-_]+/gi,"-")}.webm`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (err) {
      console.error(err);
      alert("Não foi possível exportar a animação.");
    } finally {
      canvas.setDimensions({ width:oldW, height:oldH });
      canvas.setZoom(oldZoom);
      animationExportingRef.current = false;
      setAnimationExporting(false);
      setAnimationExportProgress(0);
      await waitForAnimationFrame(returnFrame);
      setMotionGuidesVisible(canvas, true);
      applyAllMotionPaths(canvas);
      canvas.requestRenderAll();
    }
  };

'''
assert marker in s, 'canvas transform effect marker missing'
s = s.replace(marker, export_code + marker, 1)

# 10) Selection UI: bind object + path.
marker = '''              {/* Operações Booleanas (Paper.js) */}\n              {isMultiShapeSelected && ('''
bind_ui = '''              {sel?.type === "activeSelection" && (() => {\n                const objs = (sel as any).getObjects().filter((o:any) => !o.isControlHelper && !o.isEditPreview);\n                const guide = objs.find((o:any) => o.type === "path");\n                const target = objs.find((o:any) => o !== guide && !o.__isMotionPath);\n                if (!guide || !target || objs.length !== 2) return null;\n                return (\n                  <button onClick={linkSelectionToMotionPath}\n                    className="w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-xs font-medium">\n                    ↝ Vincular ao caminho\n                  </button>\n                );\n              })()}\n\n              {/* Operações Booleanas (Paper.js) */}\n              {isMultiShapeSelected && ('''
assert marker in s, 'boolean UI marker missing'
s = s.replace(marker, bind_ui, 1)

# 11) Selected-object motion path controls before opacity.
marker = '''              {sel.type !== "activeSelection" && (\n                <>\n                  <Sec title="Opacidade" />'''
motion_ui = '''              {sel.type !== "activeSelection" && sel.__motionPath && (() => {\n                const mp = sel.__motionPath; void motionPathVersion;\n                return (\n                  <div className="flex flex-col gap-2 p-2 rounded-xl border border-indigo-100 bg-indigo-50/30">\n                    <Sec title="Caminho de movimento" />\n                    <SliderRow label="Progresso" value={Math.round(Number(mp.progress || 0))} min={0} max={100} unit="%" onChange={v => updateSelectedMotionPath({ progress:v })} />\n                    <div className="grid grid-cols-2 gap-2">\n                      <NumRow label="Offset X" value={Math.round(Number(mp.offsetX || 0))} min={-2000} max={2000} onChange={v => updateSelectedMotionPath({ offsetX:v })} />\n                      <NumRow label="Offset Y" value={Math.round(Number(mp.offsetY || 0))} min={-2000} max={2000} onChange={v => updateSelectedMotionPath({ offsetY:v })} />\n                    </div>\n                    <div className="flex items-center justify-between">\n                      <span className="text-gray-500 text-xs">Orientar ao caminho</span>\n                      <button onClick={() => updateSelectedMotionPath({ orientToPath:!mp.orientToPath })} className={`w-9 h-5 rounded-full transition ${mp.orientToPath ? "bg-indigo-500" : "bg-gray-200"}`}>\n                        <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${mp.orientToPath ? "translate-x-4" : ""}`} />\n                      </button>\n                    </div>\n                    <div className="flex items-center justify-between">\n                      <span className="text-gray-500 text-xs">Inverter direção</span>\n                      <button onClick={() => updateSelectedMotionPath({ reverse:!mp.reverse })} className={`w-9 h-5 rounded-full transition ${mp.reverse ? "bg-indigo-500" : "bg-gray-200"}`}>\n                        <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${mp.reverse ? "translate-x-4" : ""}`} />\n                      </button>\n                    </div>\n                    <button onClick={unlinkSelectedMotionPath} className="w-full py-1.5 rounded-lg border border-gray-200 text-gray-500 bg-white text-xs hover:bg-gray-50">Desvincular caminho</button>\n                  </div>\n                );\n              })()}\n\n              {sel.type !== "activeSelection" && (\n                <>\n                  <Sec title="Opacidade" />'''
assert marker in s, 'opacity UI marker missing'
s = s.replace(marker, motion_ui, 1)

# 12) Timeline export control alongside FPS/easing.
marker = '''            <div className="ml-auto text-[10px] text-gray-400">\n              Clique = visualizar · edite para criar keyframe · duplo clique = keyframe explícito\n            </div>'''
export_ui = '''            <button onClick={exportAnimationWebM} disabled={animationExporting}\n              className="ml-2 h-7 px-3 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 disabled:opacity-50">\n              {animationExporting ? `Exportando ${animationExportProgress}%` : "↓ Exportar WebM"}\n            </button>\n            <div className="ml-auto text-[10px] text-gray-400">\n              Clique = visualizar · edite para criar keyframe · duplo clique = keyframe explícito\n            </div>'''
assert marker in s, 'timeline hint marker missing'
s = s.replace(marker, export_ui, 1)

p.write_text(s)
