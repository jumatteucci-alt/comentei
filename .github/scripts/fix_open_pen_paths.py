from pathlib import Path

p = Path('src/app/dashboard/canvas/editor/page.tsx')
s = p.read_text()

old = '''    const path = new fabric.Path(d, {
      fill: close ? (selFill !== "transparent" ? selFill : "#4f46e5") : "transparent",
      stroke: "#000000",
      strokeWidth: 2,
      strokeUniform: true,
    });'''
new = '''    const path = new fabric.Path(d, {
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
assert old in s, 'path constructor marker missing'
s = s.replace(old, new, 1)

old = '''    penLines.current = [];
    penDots.current = [];

    path.set({ selectable: true, evented: true, hasControls: true, hasBorders: true, padding: Math.max(Number(path.padding || 0), 8) });'''
new = '''    penLines.current = [];
    penDots.current = [];
    // Finalizing must fully detach the permanent path from the temporary Pen
    // session. Otherwise later Pen cleanup can leave stale geometry/state.
    penPoints.current = [];
    penCurveHandles.current = [];

    path.set({ selectable: true, evented: true, visible: true, hasControls: true, hasBorders: true, padding: Math.max(Number(path.padding || 0), 8) });'''
assert old in s, 'pen cleanup marker missing'
s = s.replace(old, new, 1)

# Preserve open-path metadata in animation snapshots and Fabric serialization.
old = '''    "__motionPath", "__isMotionPath", "excludeFromExport",
  ];'''
new = '''    "__motionPath", "__isMotionPath", "__isOpenPath", "excludeFromExport",
  ];'''
assert old in s, 'animation props marker missing'
s = s.replace(old, new, 1)

# Do not treat normal open paths as export-hidden guides. Only a linked Motion
# Path receives the guide flag/excludeFromExport in prepareMotionGuide.
# Also make an open path recoverable when unlinked from Motion Path.
old = '''      guide.__isMotionPath = false;
      guide.excludeFromExport = false;
      guide.set({ visible:true, selectable:true, evented:true, strokeDashArray:null, opacity:1 });'''
new = '''      guide.__isMotionPath = false;
      guide.excludeFromExport = false;
      guide.set({
        visible:true, selectable:true, evented:true, strokeDashArray:null, opacity:1,
        fill: guide.__isOpenPath ? null : guide.fill,
        stroke: guide.stroke || "#000000",
        strokeWidth: Math.max(2, Number(guide.strokeWidth || 2)),
      });'''
assert old in s, 'unlink guide marker missing'
s = s.replace(old, new, 1)

p.write_text(s)
