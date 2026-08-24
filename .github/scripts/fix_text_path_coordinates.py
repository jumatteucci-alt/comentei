from pathlib import Path
import re

p = Path('src/app/dashboard/canvas/editor/page.tsx')
s = p.read_text()

# Replace the entire text-on-path linker with a version that first exits the
# ActiveSelection, then uses an invisible runtime-only path clone for Fabric's
# text.path. The original Pen path remains the single visible editing guide.
pat = re.compile(r'''  const linkSelectionTextToPath = \(\) => \{.*?\n  \};\n\n  const updateSelectedTextPath''', re.S)
m = pat.search(s)
if not m:
    raise SystemExit('linkSelectionTextToPath block not found')

replacement = r'''  const makeRuntimeTextPath = (guide:any) => {
    const fabric = (window as any).fabric;
    if (!fabric || !Array.isArray(guide?.path) || guide.path.length < 2) return null;
    const runtime = new fabric.Path(guide.path, {
      fill: null,
      stroke: null,
      strokeWidth: 0,
      selectable: false,
      evented: false,
      objectCaching: false,
      visible: false,
    });
    runtime.segmentsInfo = fabric.util?.getPathSegmentsInfo?.(runtime.path);
    return runtime.segmentsInfo?.length ? runtime : null;
  };

  const positionTextOnGuide = (text:any, guide:any, runtime:any) => {
    if (!text || !guide || !runtime) return;
    const center = guide.getCenterPoint?.() || { x:Number(guide.left||0), y:Number(guide.top||0) };
    text.set({
      path: runtime,
      angle: Number(guide.angle || 0),
      scaleX: Number(guide.scaleX || 1),
      scaleY: Number(guide.scaleY || 1),
      flipX: !!guide.flipX,
      flipY: !!guide.flipY,
      objectCaching: false,
    });
    if (text.setPositionByOrigin) text.setPositionByOrigin(center, 'center', 'center');
    else text.set({ left:center.x, top:center.y, originX:'center', originY:'center' });
    text.dirty = true;
    text.initDimensions?.();
    text.setCoords?.();
  };

  const linkSelectionTextToPath = () => {
    if (!fc.current || sel?.type !== "activeSelection") return;
    const canvas = fc.current;
    const objects = (sel as any).getObjects().filter((o:any) => !o.isControlHelper && !o.isEditPreview);
    const guide = objects.find((o:any) => o.type === "path");
    const text = objects.find((o:any) => ["textbox","i-text","text"].includes(o.type));
    if (!guide || !text || objects.length !== 2) return;

    // ActiveSelection stores children in selection-local coordinates. Exit it
    // first so guide/text recover their real canvas transforms before linking.
    canvas.discardActiveObject();
    guide.setCoords?.();
    text.setCoords?.();

    guide.__uid = guide.__uid || Math.random().toString(36).slice(2);
    text.__uid = text.__uid || Math.random().toString(36).slice(2);

    const runtime = makeRuntimeTextPath(guide);
    if (!runtime) return;

    guide.__isTextPathGuide = true;
    guide.__textPathOriginalStroke = guide.__textPathOriginalStroke ?? guide.stroke;
    guide.__textPathOriginalStrokeWidth = guide.__textPathOriginalStrokeWidth ?? guide.strokeWidth;
    guide.__textPathOriginalDash = guide.__textPathOriginalDash ?? guide.strokeDashArray;
    guide.excludeFromExport = true;
    guide.set({
      fill:null,
      stroke:"#6366f1",
      strokeWidth:2,
      strokeDashArray:[7,5],
      visible:true,
      selectable:true,
      evented:true,
      objectCaching:false,
    });

    text.__textPathGuideId = guide.__uid;
    text.__textPathRuntime = runtime;
    text.pathStartOffset = Number(text.pathStartOffset || 0);
    text.pathSide = text.pathSide || "left";
    text.pathAlign = text.pathAlign || "baseline";
    positionTextOnGuide(text, guide, runtime);

    const sync = () => {
      if (!fc.current) return;
      fc.current.getObjects().forEach((o:any) => {
        if (o.__textPathGuideId !== guide.__uid) return;
        const nextRuntime = makeRuntimeTextPath(guide);
        if (!nextRuntime) return;
        o.__textPathRuntime = nextRuntime;
        positionTextOnGuide(o, guide, nextRuntime);
      });
      fc.current.requestRenderAll();
    };

    if (!guide.__textPathSyncInstalled) {
      guide.on?.("moving", sync);
      guide.on?.("scaling", sync);
      guide.on?.("rotating", sync);
      guide.on?.("modified", sync);
      guide.__textPathSyncInstalled = true;
    }

    canvas.setActiveObject(text);
    syncSel(text);
    refreshLayers(canvas);
    canvas.requestRenderAll();
    if (animationModeRef.current) {
      animationFrameDirtyRef.current = true;
      requestAnimationFrame(() => saveAnimationFrame(currentFrameRef.current, text.__animLayerId || selectedAnimLayerIdRef.current));
    }
  };

  const updateSelectedTextPath'''

s = s[:m.start()] + replacement + s[m.end():]

# Rebuild text-path runtime data after restores using an invisible clone rather
# than assigning the visible guide directly as text.path.
pat = re.compile(r'''  const repairTextPathRuntimeData = \(canvas:any\) => \{.*?\n  \};\n\n  const setMotionGuidesVisible''', re.S)
m = pat.search(s)
if not m:
    raise SystemExit('repairTextPathRuntimeData block not found')
replacement = r'''  const repairTextPathRuntimeData = (canvas:any) => {
    if (!canvas) return;
    const guides = new Map<string, any>();
    canvas.getObjects().forEach((o:any) => {
      if (!o.__isTextPathGuide || !o.__uid || !Array.isArray(o.path) || o.path.length < 2) return;
      guides.set(o.__uid, o);
    });
    canvas.getObjects().forEach((o:any) => {
      if (!o.__textPathGuideId) return;
      const guide = guides.get(o.__textPathGuideId);
      if (!guide) return;
      const runtime = makeRuntimeTextPath(guide);
      if (!runtime) return;
      o.__textPathRuntime = runtime;
      positionTextOnGuide(o, guide, runtime);
    });
  };

  const setMotionGuidesVisible'''
s = s[:m.start()] + replacement + s[m.end():]

# Runtime path clone must never be serialized as project data.
s = s.replace('''    sel.path = null;\n    delete sel.__textPathGuideId;''', '''    sel.path = null;\n    delete sel.__textPathRuntime;\n    delete sel.__textPathGuideId;''', 1)

p.write_text(s)
