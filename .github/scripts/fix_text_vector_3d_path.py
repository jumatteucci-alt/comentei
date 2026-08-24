from pathlib import Path
import re

p = Path('src/app/dashboard/canvas/editor/page.tsx')
s = p.read_text()

# 1) Replace stale Google Fonts .woff URLs with stable vector TTF sources.
replacements = {
    r'https://fonts\.gstatic\.com/s/montserrat/[^"\']+\.woff': 'https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Regular.ttf',
    r'https://fonts\.gstatic\.com/s/playfairdisplay/[^"\']+\.woff': 'https://raw.githubusercontent.com/google/fonts/main/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf',
    r'https://fonts\.gstatic\.com/s/roboto/[^"\']+\.woff': 'https://raw.githubusercontent.com/google/fonts/main/ofl/roboto/Roboto%5Bwdth,wght%5D.ttf',
    r'https://fonts\.gstatic\.com/s/oswald/[^"\']+\.woff': 'https://raw.githubusercontent.com/google/fonts/main/ofl/oswald/Oswald%5Bwght%5D.ttf',
    r'https://fonts\.gstatic\.com/s/lato/[^"\']+\.woff': 'https://raw.githubusercontent.com/google/fonts/main/ofl/lato/Lato-Regular.ttf',
    r'https://fonts\.gstatic\.com/s/raleway/[^"\']+\.woff': 'https://raw.githubusercontent.com/google/fonts/main/ofl/raleway/Raleway%5Bwght%5D.ttf',
    r'https://fonts\.gstatic\.com/s/pacifico/[^"\']+\.woff': 'https://raw.githubusercontent.com/google/fonts/main/ofl/pacifico/Pacifico-Regular.ttf',
    r'https://fonts\.gstatic\.com/s/dancingscript/[^"\']+\.woff': 'https://raw.githubusercontent.com/google/fonts/main/ofl/dancingscript/DancingScript%5Bwght%5D.ttf',
    r'https://fonts\.gstatic\.com/s/bebasneue/[^"\']+\.woff': 'https://raw.githubusercontent.com/google/fonts/main/ofl/bebasneue/BebasNeue-Regular.ttf',
}
for pattern, url in replacements.items():
    s = re.sub(pattern, url, s)

# 2) Shared resilient vector font loader. It is used by both 3D and convert-to-vector.
marker = '''  async function get3DFont(family:string) {'''
if marker not in s:
    raise SystemExit('get3DFont marker missing')
shared = '''  const getVectorFont = async (family:string) => {
    const opentype = (window as any).opentype;
    if (!opentype) return null;
    const store = ((window as any).__cmcVectorFontCache ||= new Map());
    const key = TEXT_3D_FONT_URLS[family] ? family : (family === "Georgia" ? "Playfair Display" : family === "Impact" ? "Oswald" : "Roboto");
    if (store.has(key)) return store.get(key);
    const url = TEXT_3D_FONT_URLS[key] || TEXT_3D_FONT_URLS.Roboto;
    try {
      const font = await opentype.load(url);
      store.set(key, font);
      return font;
    } catch (err) {
      console.warn("Falha ao carregar fonte vetorial", key, url, err);
      return null;
    }
  };

  async function get3DFont(family:string) {'''
s = s.replace(marker, shared, 1)

# Replace get3DFont implementation body with shared loader if its old body is present.
pat = re.compile(r'''  async function get3DFont\(family:string\) \{\n    const opentype = \(window as any\)\.opentype;.*?\n  \}''', re.S)
m = pat.search(s)
if m:
    s = s[:m.start()] + '''  async function get3DFont(family:string) {
    return getVectorFont(family);
  }''' + s[m.end():]

# In convertTextToPath, use the same vector loader instead of its local stale loader.
old = '''      const loadFont = async (family: string): Promise<any> => {
        const url = FONT_URLS[family];
        if (url) {
          try { return await opentype.load(url); } catch {}
        }
        return null;
      };

      const font = await loadFont(fontFamily);'''
if old in s:
    s = s.replace(old, '''      const font = await getVectorFont(fontFamily);''', 1)
else:
    # fallback for slightly changed spacing
    s = re.sub(r'''      const loadFont = async \(family: string\): Promise<any> => \{.*?      const font = await loadFont\(fontFamily\);''', '''      const font = await getVectorFont(fontFamily);''', s, count=1, flags=re.S)

# 3) Text-on-path behavior. Insert before motion-path settings updater.
marker = '''  const updateSelectedMotionPath = (patch:Record<string,any>) => {'''
if marker not in s:
    raise SystemExit('motion path updater marker missing')
text_path_code = r'''  const linkSelectionTextToPath = () => {
    if (!fc.current || sel?.type !== "activeSelection") return;
    const canvas = fc.current;
    const objects = (sel as any).getObjects().filter((o:any) => !o.isControlHelper && !o.isEditPreview);
    const guide = objects.find((o:any) => o.type === "path");
    const text = objects.find((o:any) => ["textbox","i-text","text"].includes(o.type));
    if (!guide || !text || objects.length !== 2) return;

    guide.__uid = guide.__uid || Math.random().toString(36).slice(2);
    text.__uid = text.__uid || Math.random().toString(36).slice(2);
    guide.__isTextPathGuide = true;
    guide.__textPathOriginalStroke = guide.__textPathOriginalStroke ?? guide.stroke;
    guide.__textPathOriginalStrokeWidth = guide.__textPathOriginalStrokeWidth ?? guide.strokeWidth;
    guide.__textPathOriginalDash = guide.__textPathOriginalDash ?? guide.strokeDashArray;
    guide.excludeFromExport = true;
    guide.set({ fill:null, stroke:"#6366f1", strokeWidth:2, strokeDashArray:[7,5], visible:true, selectable:true, evented:true, objectCaching:false });

    text.__textPathGuideId = guide.__uid;
    text.path = guide;
    text.pathStartOffset = Number(text.pathStartOffset || 0);
    text.pathSide = text.pathSide || "left";
    text.pathAlign = text.pathAlign || "baseline";
    text.set({ left:guide.left, top:guide.top, objectCaching:false });
    text.dirty = true;
    text.initDimensions?.();
    text.setCoords?.();

    const sync = () => {
      if (!fc.current) return;
      fc.current.getObjects().forEach((o:any) => {
        if (o.__textPathGuideId !== guide.__uid) return;
        o.path = guide;
        o.set({ left:guide.left, top:guide.top });
        o.dirty = true;
        o.initDimensions?.();
        o.setCoords?.();
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

    canvas.discardActiveObject();
    canvas.setActiveObject(text);
    syncSel(text);
    refreshLayers(canvas);
    canvas.requestRenderAll();
    if (animationModeRef.current) {
      animationFrameDirtyRef.current = true;
      requestAnimationFrame(() => saveAnimationFrame(currentFrameRef.current, text.__animLayerId || selectedAnimLayerIdRef.current));
    }
  };

  const updateSelectedTextPath = (patch:Record<string,any>) => {
    if (!fc.current || !sel || !sel.__textPathGuideId || !["textbox","i-text","text"].includes(sel.type)) return;
    sel.set(patch);
    sel.dirty = true;
    sel.initDimensions?.();
    sel.setCoords?.();
    fc.current.requestRenderAll();
    if (animationModeRef.current) {
      animationFrameDirtyRef.current = true;
      requestAnimationFrame(() => saveAnimationFrame(currentFrameRef.current, sel.__animLayerId || selectedAnimLayerIdRef.current));
    }
  };

  const unlinkSelectedTextPath = () => {
    if (!fc.current || !sel?.__textPathGuideId) return;
    const canvas = fc.current;
    const guideId = sel.__textPathGuideId;
    const guide = canvas.getObjects().find((o:any) => o.__uid === guideId);
    sel.path = null;
    delete sel.__textPathGuideId;
    sel.dirty = true;
    sel.initDimensions?.();
    if (guide) {
      guide.__isTextPathGuide = false;
      guide.excludeFromExport = false;
      guide.set({
        visible:true, selectable:true, evented:true,
        stroke:guide.__textPathOriginalStroke || "#4f46e5",
        strokeWidth:Number(guide.__textPathOriginalStrokeWidth || 2.5),
        strokeDashArray:guide.__textPathOriginalDash || null,
      });
    }
    sel.setCoords?.();
    refreshLayers(canvas);
    canvas.requestRenderAll();
  };

'''
s = s.replace(marker, text_path_code + marker, 1)

# 4) Hide both motion guides and text-path guides during playback/export animation.
s = s.replace('''      if (!o.__isMotionPath) return;''', '''      if (!o.__isMotionPath && !o.__isTextPathGuide) return;''', 1)

# 5) Persist custom text-path metadata in animation snapshots.
old = '''    "__motionPath", "__isMotionPath", "__isOpenPath", "__openPathStroke", "excludeFromExport",'''
new = '''    "__motionPath", "__isMotionPath", "__isOpenPath", "__openPathStroke", "__isTextPathGuide", "__textPathGuideId", "excludeFromExport",'''
if old in s:
    s = s.replace(old, new, 1)

# 6) Active selection: offer Text-on-path separately from Motion Path.
old = '''                return (
                  <button onClick={linkSelectionToMotionPath}
                    className="w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-xs font-medium">
                    ↝ Vincular ao caminho
                  </button>
                );'''
new = '''                const textTarget = ["textbox","i-text","text"].includes(target.type);
                return (
                  <div className="flex flex-col gap-2">
                    {textTarget && (
                      <button onClick={linkSelectionTextToPath}
                        className="w-full py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition text-xs font-medium">
                        ⌁ Texto no caminho
                      </button>
                    )}
                    <button onClick={linkSelectionToMotionPath}
                      className="w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-xs font-medium">
                      ↝ Animar pelo caminho
                    </button>
                  </div>
                );'''
if old not in s:
    raise SystemExit('active selection motion button marker missing')
s = s.replace(old, new, 1)

# 7) Text sidebar controls for an already linked text path.
needle = '''                    {converting ? "Convertendo..." : "⟳ Converter em vetor"}
                  </button>'''
if needle not in s:
    raise SystemExit('convert vector button marker missing')
controls = '''                    {converting ? "Convertendo..." : "⟳ Converter em vetor"}
                  </button>
                  {sel.__textPathGuideId && (
                    <div className="flex flex-col gap-2 p-2 rounded-lg border border-violet-100 bg-violet-50/30">
                      <Sec title="Texto no caminho" />
                      <SliderRow label="Posição" value={Math.round(Number(sel.pathStartOffset || 0))} min={-500} max={1500} unit="px" onChange={v => updateSelectedTextPath({ pathStartOffset:v })} />
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => updateSelectedTextPath({ pathSide:"left" })}
                          className={`py-1.5 rounded-lg border text-xs ${sel.pathSide !== "right" ? "bg-violet-600 text-white border-violet-600" : "bg-white text-gray-500 border-gray-200"}`}>Lado A</button>
                        <button onClick={() => updateSelectedTextPath({ pathSide:"right" })}
                          className={`py-1.5 rounded-lg border text-xs ${sel.pathSide === "right" ? "bg-violet-600 text-white border-violet-600" : "bg-white text-gray-500 border-gray-200"}`}>Lado B</button>
                      </div>
                      <select value={sel.pathAlign || "baseline"} onChange={e => updateSelectedTextPath({ pathAlign:e.target.value })}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg bg-white text-xs focus:outline-none focus:border-violet-400">
                        <option value="baseline">Na linha</option>
                        <option value="center">Centralizado</option>
                        <option value="ascender">Acima</option>
                        <option value="descender">Abaixo</option>
                      </select>
                      <button onClick={unlinkSelectedTextPath} className="w-full py-1.5 rounded-lg border border-gray-200 text-gray-500 bg-white text-xs hover:bg-gray-50">Remover caminho do texto</button>
                    </div>
                  )}'''
s = s.replace(needle, controls, 1)

# 8) PNG export: guide paths are editor-only.
old = '''    canvas.setWidth(canvasWidth);
    canvas.setHeight(canvasHeight);
    const dataUrl = canvas.toDataURL({ format:"png", multiplier:1 });
    canvas.setZoom(currentZoom);'''
new = '''    canvas.setWidth(canvasWidth);
    canvas.setHeight(canvasHeight);
    const editorGuides = canvas.getObjects().filter((o:any) => o.__isMotionPath || o.__isTextPathGuide).map((o:any) => ({ o, visible:o.visible }));
    editorGuides.forEach(({o}:any) => o.set("visible", false));
    canvas.requestRenderAll();
    const dataUrl = canvas.toDataURL({ format:"png", multiplier:1 });
    editorGuides.forEach(({o,visible}:any) => o.set("visible", visible));
    canvas.setZoom(currentZoom);'''
if old in s:
    s = s.replace(old, new, 1)

p.write_text(s)
