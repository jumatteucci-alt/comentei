from pathlib import Path

p = Path('src/app/dashboard/canvas/editor/page.tsx')
s = p.read_text()

# 1) Animation state, refs and timeline model.
old = '''  const [bgSolid, setBgSolid] = useState("#ffffff");
  const [bgGradient, setBgGradient] = useState<GradValue|null>(null);
  const [canvasTransformMode, setCanvasTransformMode] = useState(false);
  const canvasTransformDragRef = useRef<{
    handle: "nw"|"n"|"ne"|"e"|"se"|"s"|"sw"|"w";
    startX: number; startY: number; startW: number; startH: number; zoom: number;
  } | null>(null);'''
new = '''  const [bgSolid, setBgSolid] = useState("#ffffff");
  const [bgGradient, setBgGradient] = useState<GradValue|null>(null);
  const [canvasTransformMode, setCanvasTransformMode] = useState(false);
  const canvasTransformDragRef = useRef<{
    handle: "nw"|"n"|"ne"|"e"|"se"|"s"|"sw"|"w";
    startX: number; startY: number; startW: number; startH: number; zoom: number;
  } | null>(null);

  // Animation mode: timeline layers are separate from the normal object Layers panel.
  // Each animation-layer keyframe stores only the Fabric objects belonging to that layer.
  // The visible canvas is reconstructed by compositing the latest keyframe from every layer.
  type AnimationLayer = { id: string; name: string; frames: Record<number, any[]> };
  type AnimationBackground = { solid: string; gradient: GradValue | null };
  const FIRST_ANIM_LAYER = "anim-layer-1";
  const [animationMode, setAnimationMode] = useState(false);
  const [animationLayers, setAnimationLayers] = useState<AnimationLayer[]>([
    { id: FIRST_ANIM_LAYER, name: "Camada 1", frames: {} },
  ]);
  const [selectedAnimLayerId, setSelectedAnimLayerId] = useState(FIRST_ANIM_LAYER);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [animationFps, setAnimationFps] = useState(12);
  const [animationPlaying, setAnimationPlaying] = useState(false);
  const [animationBackgrounds, setAnimationBackgrounds] = useState<Record<number, AnimationBackground>>({});
  const animationModeRef = useRef(false);
  const animationLoadingRef = useRef(false);
  const animationLayersRef = useRef<AnimationLayer[]>(animationLayers);
  const selectedAnimLayerIdRef = useRef(FIRST_ANIM_LAYER);
  const currentFrameRef = useRef(0);
  const animationBackgroundsRef = useRef<Record<number, AnimationBackground>>({});
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);'''
assert old in s, 'animation state marker missing'
s = s.replace(old, new, 1)

# 2) Animation helpers after fit effect.
marker = '''  useEffect(() => {
    fitCanvasToScreen();
  }, [fitCanvasToScreen]);'''
insert = '''  useEffect(() => {
    fitCanvasToScreen();
  }, [fitCanvasToScreen]);

  useEffect(() => { animationModeRef.current = animationMode; }, [animationMode]);
  useEffect(() => { animationLayersRef.current = animationLayers; }, [animationLayers]);
  useEffect(() => { selectedAnimLayerIdRef.current = selectedAnimLayerId; }, [selectedAnimLayerId]);
  useEffect(() => { currentFrameRef.current = currentFrame; }, [currentFrame]);
  useEffect(() => { animationBackgroundsRef.current = animationBackgrounds; }, [animationBackgrounds]);
  useEffect(() => {
    if (!animationMode) setAnimationPlaying(false);
    requestAnimationFrame(() => fitCanvasToScreen());
  }, [animationMode, fitCanvasToScreen]);

  const cloneAnimationGradient = (g: GradValue | null): GradValue | null => g ? JSON.parse(JSON.stringify(g)) : null;
  const ANIMATION_OBJECT_PROPS = [
    "__uid", "__animLayerId", "__threeD", "__vectorBlur", "__fillGradient", "__imageAdjustments",
    "__crop", "__gradMask", "__originalSrc", "__glowEnabled", "__glowColor", "__glowBlur",
    "__glowDistance", "__glowOpacity", "__shadowOpacity", "__shadowBaseColor", "__fixedHeight",
  ];

  const setAnimationLayersLive = (next: AnimationLayer[]) => {
    animationLayersRef.current = next;
    setAnimationLayers(next);
  };

  const serializeAnimationObject = (obj: any) => {
    try { return obj.toObject(ANIMATION_OBJECT_PROPS); }
    catch { return obj.toObject?.() || {}; }
  };

  const resolveAnimationLayerFrame = (layer: AnimationLayer, frame: number) => {
    if (layer.frames[frame] !== undefined) return layer.frames[frame];
    const keys = Object.keys(layer.frames).map(Number).filter(n => n <= frame).sort((a,b) => b-a);
    if (keys.length) return layer.frames[keys[0]];
    return [];
  };

  const resolveAnimationBackground = (frame: number): AnimationBackground => {
    const store = animationBackgroundsRef.current;
    if (store[frame]) return store[frame];
    const keys = Object.keys(store).map(Number).filter(n => n <= frame).sort((a,b) => b-a);
    return keys.length ? store[keys[0]] : { solid: bgSolid, gradient: cloneAnimationGradient(bgGradient) };
  };

  const saveAnimationFrame = (frame = currentFrameRef.current, layerId = selectedAnimLayerIdRef.current) => {
    if (!fc.current || !animationModeRef.current || animationLoadingRef.current) return;
    const canvas = fc.current;
    const objects = canvas.getObjects().filter((o:any) => !o.isControlHelper && !o.isEditPreview);
    objects.forEach((o:any) => {
      if (!o.__animLayerId) o.__animLayerId = layerId;
      if (!o.__uid) o.__uid = Math.random().toString(36).slice(2);
    });
    const layerObjects = objects.filter((o:any) => o.__animLayerId === layerId).map(serializeAnimationObject);
    const next = animationLayersRef.current.map(layer =>
      layer.id === layerId ? { ...layer, frames: { ...layer.frames, [frame]: layerObjects } } : layer
    );
    setAnimationLayersLive(next);
    const nextBg = {
      ...animationBackgroundsRef.current,
      [frame]: { solid: bgSolid, gradient: cloneAnimationGradient(bgGradient) },
    };
    animationBackgroundsRef.current = nextBg;
    setAnimationBackgrounds(nextBg);
  };

  const ensureAnimationKeyframe = (layerId: string, frame: number) => {
    const layers = animationLayersRef.current;
    const layer = layers.find(l => l.id === layerId);
    if (!layer || layer.frames[frame] !== undefined) return;
    const inherited = resolveAnimationLayerFrame(layer, frame);
    const cloned = JSON.parse(JSON.stringify(inherited || []));
    setAnimationLayersLive(layers.map(l => l.id === layerId ? { ...l, frames: { ...l.frames, [frame]: cloned } } : l));
  };

  const loadAnimationFrame = (frame: number, saveCurrent = true, createKeyframe = false, keyLayerId?: string) => {
    if (!fc.current || !animationModeRef.current) return;
    const target = Math.max(0, Math.min(100, Math.round(frame)));
    if (saveCurrent) saveAnimationFrame(currentFrameRef.current);
    const activeLayer = keyLayerId || selectedAnimLayerIdRef.current;
    if (createKeyframe) ensureAnimationKeyframe(activeLayer, target);

    const canvas = fc.current;
    const layers = animationLayersRef.current;
    const objects = layers.flatMap(layer => resolveAnimationLayerFrame(layer, target).map((obj:any) => ({ ...obj, __animLayerId: layer.id })));
    const background = resolveAnimationBackground(target);

    animationLoadingRef.current = true;
    savingHistory.current = true;
    canvas.discardActiveObject();
    syncSel(null);
    canvas.loadFromJSON({ version: "5.3.0", objects }, () => {
      canvas.getObjects().forEach((o:any) => {
        if (o.__vectorBlur) applyVectorBlurRendering(o, Number(o.__vectorBlur));
        if (o.__threeD?.enabled) requestAnimationFrame(() => refreshThreeDObject(o));
        o.setCoords?.();
      });
      setBgSolid(background.solid);
      setBgGradient(cloneAnimationGradient(background.gradient));
      currentFrameRef.current = target;
      setCurrentFrame(target);
      refreshLayers(canvas);
      canvas.requestRenderAll();
      savingHistory.current = false;
      animationLoadingRef.current = false;
    });
  };

  const toggleAnimationMode = () => {
    if (!fc.current) return;
    const nextOn = !animationModeRef.current;
    if (nextOn) {
      const layerId = selectedAnimLayerIdRef.current || animationLayersRef.current[0]?.id || FIRST_ANIM_LAYER;
      fc.current.getObjects().forEach((o:any) => {
        if (!o.isControlHelper && !o.isEditPreview) o.__animLayerId = o.__animLayerId || layerId;
      });
      animationModeRef.current = true;
      setAnimationMode(true);
      currentFrameRef.current = 0;
      setCurrentFrame(0);
      requestAnimationFrame(() => saveAnimationFrame(0, layerId));
    } else {
      saveAnimationFrame(currentFrameRef.current);
      animationModeRef.current = false;
      setAnimationPlaying(false);
      setAnimationMode(false);
    }
  };

  const addAnimationLayer = () => {
    if (!animationModeRef.current) return;
    saveAnimationFrame(currentFrameRef.current);
    const id = `anim-layer-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    const next = [...animationLayersRef.current, { id, name: `Camada ${animationLayersRef.current.length + 1}`, frames: { [currentFrameRef.current]: [] } }];
    setAnimationLayersLive(next);
    selectedAnimLayerIdRef.current = id;
    setSelectedAnimLayerId(id);
  };

  const removeAnimationLayer = (id: string) => {
    if (animationLayersRef.current.length <= 1 || !fc.current) return;
    const next = animationLayersRef.current.filter(l => l.id !== id);
    setAnimationLayersLive(next);
    fc.current.getObjects().filter((o:any) => o.__animLayerId === id).forEach((o:any) => fc.current.remove(o));
    if (selectedAnimLayerIdRef.current === id) {
      selectedAnimLayerIdRef.current = next[0].id;
      setSelectedAnimLayerId(next[0].id);
    }
    refreshLayers(fc.current);
    fc.current.requestRenderAll();
  };

  const playAnimation = () => {
    if (!animationModeRef.current) return;
    saveAnimationFrame(currentFrameRef.current);
    setAnimationPlaying(true);
  };

  const stopAnimation = () => setAnimationPlaying(false);

  useEffect(() => {
    if (!animationPlaying || !animationMode) return;
    const timer = window.setInterval(() => {
      const next = currentFrameRef.current >= 100 ? 0 : currentFrameRef.current + 1;
      loadAnimationFrame(next, false, false);
    }, Math.max(16, Math.round(1000 / Math.max(1, animationFps))));
    return () => window.clearInterval(timer);
  }, [animationPlaying, animationMode, animationFps]);'''
assert marker in s, 'fit effect insertion marker missing'
s = s.replace(marker, insert, 1)

# 3) Selecting an object also selects its animation layer.
old = '''    setSel(obj);

    if (obj.type === "activeSelection") {'''
new = '''    setSel(obj);
    if (animationModeRef.current && obj.__animLayerId) {
      selectedAnimLayerIdRef.current = obj.__animLayerId;
      setSelectedAnimLayerId(obj.__animLayerId);
    }

    if (obj.type === "activeSelection") {'''
assert old in s, 'syncSel animation marker missing'
s = s.replace(old, new, 1)

# 4) Assign newly-created objects to the currently selected animation layer.
old = '''      canvas.on("object:added",    () => { if (!savingHistory.current) { saveState(); refreshLayers(canvas); } });'''
new = '''      canvas.on("object:added", (e:any) => {
        const obj = e.target;
        if (animationModeRef.current && !animationLoadingRef.current && obj && !obj.isControlHelper && !obj.isEditPreview && !obj.__animLayerId) {
          obj.__animLayerId = selectedAnimLayerIdRef.current;
        }
        if (!savingHistory.current) { saveState(); refreshLayers(canvas); }
      });'''
assert old in s, 'object:added animation marker missing'
s = s.replace(old, new, 1)

# 5) Top-bar animation toggle beside canvas dimensions.
old = '''            <span className="text-gray-400 text-[10px]">px</span>
          </div>
        </div>'''
new = '''            <span className="text-gray-400 text-[10px]">px</span>
          </div>

          <button onClick={toggleAnimationMode}
            className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs font-medium transition ${animationMode ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"}`}
            title="Ativar modo de animação">
            <span className={`relative inline-flex w-8 h-4 rounded-full transition ${animationMode ? "bg-indigo-600" : "bg-gray-300"}`}>
              <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${animationMode ? "translate-x-4" : "translate-x-0.5"}`} />
            </span>
            Animação
          </button>
        </div>'''
assert old in s, 'top animation toggle marker missing'
s = s.replace(old, new, 1)

# 6) Timeline panel under the main editor.
old = '''        </div>
      </div>
    </div>
  );
}'''
timeline = '''        </div>
      </div>

      {animationMode && (
        <div className="h-52 bg-white border-t border-gray-200 flex-shrink-0 flex flex-col shadow-[0_-8px_24px_rgba(15,23,42,0.05)] z-30">
          <div className="h-10 px-3 border-b border-gray-100 flex items-center gap-2 flex-shrink-0">
            <div className="flex items-center gap-1.5 pr-3 border-r border-gray-200">
              <button onClick={animationPlaying ? stopAnimation : playAnimation}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${animationPlaying ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}
                title={animationPlaying ? "Parar" : "Reproduzir"}>
                {animationPlaying ? "■" : "▶"}
              </button>
              <button onClick={() => loadAnimationFrame(Math.max(0, currentFrame - 1), true, false)} className="w-7 h-7 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50" title="Frame anterior">‹</button>
              <button onClick={() => loadAnimationFrame(Math.min(100, currentFrame + 1), true, false)} className="w-7 h-7 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50" title="Próximo frame">›</button>
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <span>Frame</span>
              <input type="number" min={0} max={100} value={currentFrame}
                onChange={e => loadAnimationFrame(Math.max(0, Math.min(100, +e.target.value || 0)), true, true)}
                className="w-14 h-7 px-2 border border-gray-200 rounded-lg text-center focus:outline-none focus:border-indigo-400" />
              <span className="text-gray-300">/ 100</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-500 ml-2">
              <span>FPS</span>
              <input type="number" min={1} max={60} value={animationFps}
                onChange={e => setAnimationFps(Math.max(1, Math.min(60, +e.target.value || 1)))}
                className="w-14 h-7 px-2 border border-gray-200 rounded-lg text-center focus:outline-none focus:border-indigo-400" />
            </div>
            <div className="ml-auto text-[10px] text-gray-400">
              Clique em um frame para criar/editar um keyframe · cada linha é uma camada de animação
            </div>
          </div>

          <div className="flex flex-1 min-h-0">
            <div className="w-44 border-r border-gray-200 flex-shrink-0 bg-gray-50/60">
              <div className="h-7 px-2 flex items-center justify-between border-b border-gray-200">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Camadas de animação</span>
                <button onClick={addAnimationLayer} className="w-5 h-5 rounded text-indigo-600 hover:bg-indigo-50 text-sm" title="Nova camada">＋</button>
              </div>
              <div className="overflow-y-auto" style={{maxHeight: 132}}>
                {animationLayers.map(layer => (
                  <div key={layer.id}
                    onClick={() => { selectedAnimLayerIdRef.current = layer.id; setSelectedAnimLayerId(layer.id); }}
                    className={`h-8 px-2 flex items-center gap-1 border-b border-gray-100 cursor-pointer ${selectedAnimLayerId === layer.id ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-white"}`}>
                    <span className="w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0" />
                    <input value={layer.name}
                      onClick={e => e.stopPropagation()}
                      onChange={e => {
                        const next = animationLayersRef.current.map(l => l.id === layer.id ? { ...l, name: e.target.value } : l);
                        setAnimationLayersLive(next);
                      }}
                      className="flex-1 min-w-0 bg-transparent text-xs outline-none truncate" />
                    {animationLayers.length > 1 && (
                      <button onClick={e => { e.stopPropagation(); removeAnimationLayer(layer.id); }} className="text-gray-300 hover:text-red-500 px-1" title="Excluir camada">×</button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div ref={timelineScrollRef} className="flex-1 overflow-auto bg-white">
              <div style={{minWidth: 101 * 28}}>
                <div className="h-7 flex sticky top-0 bg-white z-10 border-b border-gray-200">
                  {Array.from({length:101}, (_, frame) => (
                    <div key={frame} style={{width:28,minWidth:28}} className={`h-7 border-r border-gray-100 relative ${currentFrame===frame ? "bg-indigo-50" : ""}`}>
                      {frame % 5 === 0 && <span className={`absolute left-1 top-1 text-[8px] ${currentFrame===frame ? "text-indigo-600 font-bold" : "text-gray-400"}`}>{frame}</span>}
                      {currentFrame===frame && <div className="absolute left-1/2 top-0 bottom-0 w-px bg-indigo-500" />}
                    </div>
                  ))}
                </div>

                {animationLayers.map(layer => (
                  <div key={layer.id} className={`h-8 flex border-b border-gray-100 ${selectedAnimLayerId===layer.id ? "bg-indigo-50/20" : ""}`}>
                    {Array.from({length:101}, (_, frame) => {
                      const hasKey = layer.frames[frame] !== undefined;
                      const active = currentFrame === frame;
                      return (
                        <button key={frame}
                          onClick={() => {
                            selectedAnimLayerIdRef.current = layer.id;
                            setSelectedAnimLayerId(layer.id);
                            loadAnimationFrame(frame, true, true, layer.id);
                          }}
                          className={`relative h-8 border-r border-gray-100 flex items-center justify-center hover:bg-indigo-50/70 ${active ? "bg-indigo-50" : ""}`}
                          style={{width:28,minWidth:28}}
                          title={`${layer.name} · frame ${frame}${hasKey ? " · keyframe" : ""}`}>
                          {hasKey && <span className={`block w-2.5 h-2.5 rotate-45 rounded-[1px] ${selectedAnimLayerId===layer.id ? "bg-indigo-600" : "bg-indigo-400"}`} />}
                          {active && <span className="absolute left-1/2 top-0 bottom-0 w-px bg-indigo-500 pointer-events-none" />}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}'''
assert old in s, 'timeline insertion marker missing'
s = s.replace(old, timeline, 1)

p.write_text(s)
