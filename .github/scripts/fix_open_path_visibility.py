from pathlib import Path

p = Path('src/app/dashboard/canvas/editor/page.tsx')
s = p.read_text()

old = '''    const path = new fabric.Path(d, {
      // Open Pen paths are permanent vector strokes. They must not depend on a
      // closed fill to stay visible/selectable, because they are also valid
      // Motion Path guides.
      fill: close ? (selFill !== "transparent" ? selFill : "#4f46e5") : null,
      stroke: close ? "#000000" : (selStroke && selStroke !== "transparent" ? selStroke : "#000000"),
      strokeWidth: close ? 2 : Math.max(2, Number(selStrokeW || 2)),
      strokeUniform: true,
      objectCaching: false,
    });
    path.__isOpenPath = !close;'''
new = '''    const path = new fabric.Path(d, {
      // Open Pen paths are permanent vector strokes. Do not inherit the last
      // selected object's border color: a white/transparent stroke looked like
      // the path disappeared as soon as the Fabric selection outline went away.
      fill: close ? (selFill !== "transparent" ? selFill : "#4f46e5") : null,
      stroke: close ? "#000000" : "#4f46e5",
      strokeWidth: close ? 2 : 2.5,
      strokeUniform: true,
      objectCaching: false,
      opacity: 1,
      visible: true,
    });
    path.__isOpenPath = !close;
    if (!close) path.__openPathStroke = "#4f46e5";'''
assert old in s, 'open path constructor marker missing'
s = s.replace(old, new, 1)

# Preserve custom open-path metadata in animation snapshots.
old = '''    "__motionPath", "__isMotionPath", "__isOpenPath", "excludeFromExport",
  ];'''
new = '''    "__motionPath", "__isMotionPath", "__isOpenPath", "__openPathStroke", "excludeFromExport",
  ];'''
assert old in s, 'animation open-path metadata marker missing'
s = s.replace(old, new, 1)

# Keep normal open paths visibly rendered after selection changes. Motion guides
# have their own styling and are intentionally excluded here.
old = '''      canvas.on("selection:created", () => syncSel(canvas.getActiveObject()));
      canvas.on("selection:updated", () => syncSel(canvas.getActiveObject()));
      canvas.on("selection:cleared", () => syncSel(null));'''
new = '''      const keepOpenPenPathsVisible = () => {
        canvas.getObjects().forEach((o:any) => {
          if (!o.__isOpenPath || o.__isMotionPath) return;
          const currentStroke = String(o.stroke || "");
          const badStroke = !currentStroke || currentStroke === "transparent" || currentStroke === "rgba(0,0,0,0)";
          if (badStroke) o.set("stroke", o.__openPathStroke || "#4f46e5");
          o.set({ visible:true, opacity: Number.isFinite(Number(o.opacity)) ? o.opacity : 1, objectCaching:false });
          o.setCoords?.();
        });
      };
      canvas.on("selection:created", () => { keepOpenPenPathsVisible(); syncSel(canvas.getActiveObject()); });
      canvas.on("selection:updated", () => { keepOpenPenPathsVisible(); syncSel(canvas.getActiveObject()); });
      canvas.on("selection:cleared", () => { keepOpenPenPathsVisible(); syncSel(null); canvas.requestRenderAll(); });'''
assert old in s, 'selection listeners marker missing'
s = s.replace(old, new, 1)

# When leaving Pen/selecting another tool, cleanup must only touch temporary
# helper geometry, never the permanent open path that was just finalized.
old = '''  const stopPen = () => {
    setActiveTool("select"); activeToolRef.current = "select";
    cancelPenRef.current();'''
new = '''  const stopPen = () => {
    setActiveTool("select"); activeToolRef.current = "select";
    // A finalized path is already a real Fabric object. Clear this undo-only
    // pointer before temporary Pen cleanup so switching tools cannot treat the
    // permanent object as part of the drawing session.
    lastFinalizedPath.current = null;
    cancelPenRef.current();'''
assert old in s, 'stopPen marker missing'
s = s.replace(old, new, 1)

p.write_text(s)
