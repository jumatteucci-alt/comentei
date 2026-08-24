from pathlib import Path

p = Path('src/app/dashboard/canvas/editor/page.tsx')
s = p.read_text()

old = '''    guide.__uid = guide.__uid || Math.random().toString(36).slice(2);
    text.__uid = text.__uid || Math.random().toString(36).slice(2);
    guide.__isTextPathGuide = true;'''
new = '''    guide.__uid = guide.__uid || Math.random().toString(36).slice(2);
    text.__uid = text.__uid || Math.random().toString(36).slice(2);
    // Fabric 5 text-on-path requires precomputed segment metadata. Paths made
    // with our Pen tool do not have it until we explicitly calculate it.
    if (!Array.isArray(guide.path) || guide.path.length < 2) return;
    guide.segmentsInfo = (window as any).fabric?.util?.getPathSegmentsInfo?.(guide.path);
    if (!guide.segmentsInfo?.length) return;
    guide.__isTextPathGuide = true;'''
assert old in s, 'text path link marker missing'
s = s.replace(old, new, 1)

old = '''    text.__textPathGuideId = guide.__uid;
    text.path = guide;
    text.pathStartOffset = Number(text.pathStartOffset || 0);'''
new = '''    text.__textPathGuideId = guide.__uid;
    // Use set() so Fabric invalidates text dimensions/cache correctly.
    text.set("path", guide);
    text.pathStartOffset = Number(text.pathStartOffset || 0);'''
assert old in s, 'text.path assignment marker missing'
s = s.replace(old, new, 1)

old = '''    const sync = () => {
      if (!fc.current) return;
      fc.current.getObjects().forEach((o:any) => {
        if (o.__textPathGuideId !== guide.__uid) return;
        o.path = guide;
        o.set({ left:guide.left, top:guide.top });'''
new = '''    const sync = () => {
      if (!fc.current) return;
      // Recalculate path measurements after node edits/transforms so the text
      // keeps following the latest curve instead of stale segment data.
      if (Array.isArray(guide.path) && guide.path.length > 1) {
        guide.segmentsInfo = (window as any).fabric?.util?.getPathSegmentsInfo?.(guide.path);
      }
      fc.current.getObjects().forEach((o:any) => {
        if (o.__textPathGuideId !== guide.__uid) return;
        o.set("path", guide);
        o.set({ left:guide.left, top:guide.top });'''
assert old in s, 'text path sync marker missing'
s = s.replace(old, new, 1)

# When restoring animation/project JSON, a text path guide may have lost the
# runtime-only segmentsInfo. Rebuild it before rendering any linked text.
marker = '''  const setMotionGuidesVisible = (canvas:any, visible:boolean) => {'''
insert = '''  const repairTextPathRuntimeData = (canvas:any) => {
    if (!canvas) return;
    const fabric = (window as any).fabric;
    const guides = new Map<string, any>();
    canvas.getObjects().forEach((o:any) => {
      if (!o.__isTextPathGuide || !o.__uid || !Array.isArray(o.path) || o.path.length < 2) return;
      o.segmentsInfo = fabric?.util?.getPathSegmentsInfo?.(o.path);
      guides.set(o.__uid, o);
    });
    canvas.getObjects().forEach((o:any) => {
      if (!o.__textPathGuideId) return;
      const guide = guides.get(o.__textPathGuideId);
      if (!guide?.segmentsInfo?.length) return;
      o.set("path", guide);
      o.dirty = true;
      o.initDimensions?.();
      o.setCoords?.();
    });
  };

  const setMotionGuidesVisible = (canvas:any, visible:boolean) => {'''
assert marker in s, 'guide visibility marker missing'
s = s.replace(marker, insert, 1)

# Repair runtime data whenever guides are toggled for play/edit. This is a
# convenient central point hit after animation frame loads too.
old = '''  const setMotionGuidesVisible = (canvas:any, visible:boolean) => {
    if (!canvas) return;
    canvas.getObjects().forEach((o:any) => {'''
new = '''  const setMotionGuidesVisible = (canvas:any, visible:boolean) => {
    if (!canvas) return;
    repairTextPathRuntimeData(canvas);
    canvas.getObjects().forEach((o:any) => {'''
assert old in s, 'setMotionGuidesVisible body marker missing'
s = s.replace(old, new, 1)

p.write_text(s)
