from pathlib import Path

p = Path('src/app/dashboard/canvas/editor/page.tsx')
s = p.read_text()

# Track real animation edits separately from timeline navigation.
old = '''  const animationBackgroundsRef = useRef<Record<number, AnimationBackground>>({});
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);'''
new = '''  const animationBackgroundsRef = useRef<Record<number, AnimationBackground>>({});
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const animationFrameDirtyRef = useRef(false);'''
assert old in s, 'animation refs marker missing'
s = s.replace(old, new, 1)

# Empty layers never keep keyframes.
old = '''    const layerObjects = objects.filter((o:any) => o.__animLayerId === layerId).map(serializeAnimationObject);
    const next = animationLayersRef.current.map(layer =>
      layer.id === layerId ? { ...layer, frames: { ...layer.frames, [frame]: layerObjects } } : layer
    );
    setAnimationLayersLive(next);'''
new = '''    const layerObjects = objects.filter((o:any) => o.__animLayerId === layerId).map(serializeAnimationObject);
    const next = animationLayersRef.current.map(layer => {
      if (layer.id !== layerId) return layer;
      const frames = { ...layer.frames };
      if (layerObjects.length > 0) frames[frame] = layerObjects;
      else delete frames[frame];
      return { ...layer, frames };
    });
    setAnimationLayersLive(next);
    animationFrameDirtyRef.current = false;'''
assert old in s, 'save animation marker missing'
s = s.replace(old, new, 1)

# Explicit keyframe only makes sense when the layer contains something.
old = '''    const inherited = resolveAnimationLayerFrame(layer, frame);
    const cloned = JSON.parse(JSON.stringify(inherited || []));
    setAnimationLayersLive(layers.map(l => l.id === layerId ? { ...l, frames: { ...l.frames, [frame]: cloned } } : l));'''
new = '''    const inherited = resolveAnimationLayerFrame(layer, frame);
    if (!inherited || inherited.length === 0) return;
    const cloned = JSON.parse(JSON.stringify(inherited));
    setAnimationLayersLive(layers.map(l => l.id === layerId ? { ...l, frames: { ...l.frames, [frame]: cloned } } : l));'''
assert old in s, 'ensure keyframe marker missing'
s = s.replace(old, new, 1)

# Navigation should save only when there was a real edit.
old = '''    const target = Math.max(0, Math.min(100, Math.round(frame)));
    if (saveCurrent) saveAnimationFrame(currentFrameRef.current);'''
new = '''    const target = Math.max(0, Math.min(100, Math.round(frame)));
    if (saveCurrent && animationFrameDirtyRef.current) saveAnimationFrame(currentFrameRef.current);'''
assert old in s, 'load animation save marker missing'
s = s.replace(old, new, 1)

old = '''      currentFrameRef.current = target;
      setCurrentFrame(target);
      refreshLayers(canvas);'''
new = '''      currentFrameRef.current = target;
      setCurrentFrame(target);
      animationFrameDirtyRef.current = false;
      refreshLayers(canvas);'''
assert old in s, 'load animation completion marker missing'
s = s.replace(old, new, 1)

# New empty animation layers must not start with an empty keyframe.
old = '''    const next = [...animationLayersRef.current, { id, name: `Camada ${animationLayersRef.current.length + 1}`, frames: { [currentFrameRef.current]: [] }, easing: "easeInOut" as AnimationEasing }];'''
new = '''    const next = [...animationLayersRef.current, { id, name: `Camada ${animationLayersRef.current.length + 1}`, frames: {}, easing: "easeInOut" as AnimationEasing }];'''
assert old in s, 'new animation layer marker missing'
s = s.replace(old, new, 1)

# Add animation layer reordering. Internal array is bottom->top; panel is top->bottom.
marker = '''  const updateAnimationLayerEasing = (id: string, easing: AnimationEasing) => {'''
insert = '''  const reorderAnimationLayers = (draggedId: string, targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    const display = [...animationLayersRef.current].reverse();
    const from = display.findIndex(l => l.id === draggedId);
    const to = display.findIndex(l => l.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = display.splice(from, 1);
    display.splice(to, 0, moved);
    const next = display.reverse();
    setAnimationLayersLive(next);
    if (animationModeRef.current) loadAnimationFrame(currentFrameRef.current, false, false);
  };

  const updateAnimationLayerEasing = (id: string, easing: AnimationEasing) => {'''
assert marker in s, 'animation easing marker missing'
s = s.replace(marker, insert, 1)

# Don't turn a viewed tween frame into a keyframe merely by pressing play.
old = '''  const playAnimation = () => {
    if (!animationModeRef.current) return;
    saveAnimationFrame(currentFrameRef.current);
    setAnimationPlaying(true);
  };'''
new = '''  const playAnimation = () => {
    if (!animationModeRef.current) return;
    if (animationFrameDirtyRef.current) saveAnimationFrame(currentFrameRef.current);
    setAnimationPlaying(true);
  };'''
assert old in s, 'play animation marker missing'
s = s.replace(old, new, 1)

# Fabric edits automatically become real keyframes. Loading frames is excluded by the guard.
old = '''      canvas.on("object:modified", (e: any) => {
        if (!savingHistory.current) {
          saveState();
          refreshLayers(canvas);
          const obj = e.target;
          if (obj?.type !== "textbox" && obj?.type !== "i-text") {
            syncSel(obj);
          }
        }
      });'''
new = '''      canvas.on("object:modified", (e: any) => {
        if (!savingHistory.current) {
          saveState();
          refreshLayers(canvas);
          const obj = e.target;
          if (obj?.type !== "textbox" && obj?.type !== "i-text") {
            syncSel(obj);
          }
          if (animationModeRef.current && !animationLoadingRef.current && obj && !obj.isControlHelper && !obj.isEditPreview) {
            animationFrameDirtyRef.current = true;
            requestAnimationFrame(() => saveAnimationFrame(currentFrameRef.current, obj.__animLayerId || selectedAnimLayerIdRef.current));
          }
        }
      });'''
assert old in s, 'object modified marker missing'
s = s.replace(old, new, 1)

old = '''        if (!savingHistory.current) { saveState(); refreshLayers(canvas); }
      });
      canvas.on("object:removed",  () => { if (!savingHistory.current) refreshLayers(canvas); });'''
new = '''        if (!savingHistory.current) {
          saveState(); refreshLayers(canvas);
          if (animationModeRef.current && !animationLoadingRef.current && obj && !obj.isControlHelper && !obj.isEditPreview) {
            animationFrameDirtyRef.current = true;
            requestAnimationFrame(() => saveAnimationFrame(currentFrameRef.current, obj.__animLayerId || selectedAnimLayerIdRef.current));
          }
        }
      });
      canvas.on("object:removed", (e:any) => {
        if (!savingHistory.current) {
          refreshLayers(canvas);
          const obj = e.target;
          if (animationModeRef.current && !animationLoadingRef.current && obj && !obj.isControlHelper && !obj.isEditPreview) {
            animationFrameDirtyRef.current = true;
            requestAnimationFrame(() => saveAnimationFrame(currentFrameRef.current, obj.__animLayerId || selectedAnimLayerIdRef.current));
          }
        }
      });'''
assert old in s, 'object added/removed marker missing'
s = s.replace(old, new, 1)

# Sidebar/property edits should also create/update the current keyframe.
old = '''  const upd = (props: Record<string, any>) => {
    if (!fc.current || !sel) return;
    sel.set(props);'''
new = '''  const upd = (props: Record<string, any>) => {
    if (!fc.current || !sel) return;
    sel.set(props);
    if (animationModeRef.current && !animationLoadingRef.current && sel.type !== "activeSelection") {
      animationFrameDirtyRef.current = true;
      requestAnimationFrame(() => saveAnimationFrame(currentFrameRef.current, sel.__animLayerId || selectedAnimLayerIdRef.current));
    }'''
assert old in s, 'upd marker missing'
s = s.replace(old, new, 1)

# Timeline navigation never creates a keyframe just by visiting a frame.
s = s.replace('''<button onClick={() => loadAnimationFrame(Math.max(0, currentFrame - 1), true, false)}''', '''<button onClick={() => loadAnimationFrame(Math.max(0, currentFrame - 1), false, false)}''', 1)
s = s.replace('''<button onClick={() => loadAnimationFrame(Math.min(100, currentFrame + 1), true, false)}''', '''<button onClick={() => loadAnimationFrame(Math.min(100, currentFrame + 1), false, false)}''', 1)
s = s.replace('''onChange={e => loadAnimationFrame(Math.max(0, Math.min(100, +e.target.value || 0)), true, true)}''', '''onChange={e => loadAnimationFrame(Math.max(0, Math.min(100, +e.target.value || 0)), false, false)}''', 1)
s = s.replace('''Clique em um frame para criar/editar um keyframe · cada linha é uma camada de animação''', '''Clique = visualizar · edite para criar keyframe · duplo clique = keyframe explícito''', 1)

# Animation layer list: display topmost first and allow drag/drop reordering.
old = '''                {animationLayers.map(layer => (
                  <div key={layer.id}
                    onClick={() => { selectedAnimLayerIdRef.current = layer.id; setSelectedAnimLayerId(layer.id); }}
                    className={`h-8 px-2 flex items-center gap-1 border-b border-gray-100 cursor-pointer ${selectedAnimLayerId === layer.id ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-white"}`}>
                    <span className="w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0" />'''
new = '''                {[...animationLayers].reverse().map(layer => (
                  <div key={layer.id}
                    draggable
                    onDragStart={e => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("anim-layer-id", layer.id); }}
                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                    onDrop={e => { e.preventDefault(); reorderAnimationLayers(e.dataTransfer.getData("anim-layer-id"), layer.id); }}
                    onClick={() => { selectedAnimLayerIdRef.current = layer.id; setSelectedAnimLayerId(layer.id); }}
                    className={`h-8 px-2 flex items-center gap-1 border-b border-gray-100 cursor-grab active:cursor-grabbing ${selectedAnimLayerId === layer.id ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-white"}`}>
                    <span className="text-gray-300 select-none text-[10px]" title="Arraste para reorganizar">⋮⋮</span>
                    <span className="w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0" />'''
assert old in s, 'animation layer panel marker missing'
s = s.replace(old, new, 1)

# Ruler squares scrub without selecting a layer or creating a keyframe.
old = '''                  {Array.from({length:101}, (_, frame) => (
                    <div key={frame} style={{width:28,minWidth:28}} className={`h-7 border-r border-gray-100 relative ${currentFrame===frame ? "bg-indigo-50" : ""}`}>
                      {frame % 5 === 0 && <span className={`absolute left-1 top-1 text-[8px] ${currentFrame===frame ? "text-indigo-600 font-bold" : "text-gray-400"}`}>{frame}</span>}
                      {currentFrame===frame && <div className="absolute left-1/2 top-0 bottom-0 w-px bg-indigo-500" />}
                    </div>
                  ))}'''
new = '''                  {Array.from({length:101}, (_, frame) => (
                    <button key={frame} onClick={() => loadAnimationFrame(frame, false, false)}
                      style={{width:28,minWidth:28}} className={`h-7 border-r border-gray-100 relative hover:bg-indigo-50 ${currentFrame===frame ? "bg-indigo-50" : ""}`}
                      title={`Visualizar frame ${frame}`}>
                      {frame % 5 === 0 && <span className={`absolute left-1 top-1 text-[8px] ${currentFrame===frame ? "text-indigo-600 font-bold" : "text-gray-400"}`}>{frame}</span>}
                      {currentFrame===frame && <div className="absolute left-1/2 top-0 bottom-0 w-px bg-indigo-500" />}
                    </button>
                  ))}'''
assert old in s, 'timeline ruler marker missing'
s = s.replace(old, new, 1)

# Timeline rows follow visual layer stacking (top row = top layer). Single click only views; double click explicitly keys.
old = '''                {animationLayers.map(layer => (
                  <div key={layer.id} className={`h-8 flex border-b border-gray-100 ${selectedAnimLayerId===layer.id ? "bg-indigo-50/20" : ""}`}>'''
new = '''                {[...animationLayers].reverse().map(layer => (
                  <div key={layer.id} className={`h-8 flex border-b border-gray-100 ${selectedAnimLayerId===layer.id ? "bg-indigo-50/20" : ""}`}>'''
assert old in s, 'timeline rows marker missing'
s = s.replace(old, new, 1)

old = '''                          onClick={() => {
                            selectedAnimLayerIdRef.current = layer.id;
                            setSelectedAnimLayerId(layer.id);
                            loadAnimationFrame(frame, true, true, layer.id);
                          }}
                          className={`relative h-8 border-r border-gray-100 flex items-center justify-center hover:bg-indigo-50/70 ${active ? "bg-indigo-50" : ""}`}'''
new = '''                          onClick={() => {
                            selectedAnimLayerIdRef.current = layer.id;
                            setSelectedAnimLayerId(layer.id);
                            loadAnimationFrame(frame, false, false, layer.id);
                          }}
                          onDoubleClick={() => {
                            selectedAnimLayerIdRef.current = layer.id;
                            setSelectedAnimLayerId(layer.id);
                            loadAnimationFrame(frame, false, true, layer.id);
                          }}
                          className={`relative h-8 border-r border-gray-100 flex items-center justify-center hover:bg-indigo-50/70 ${active ? "bg-indigo-50" : ""}`}'''
assert old in s, 'timeline cell click marker missing'
s = s.replace(old, new, 1)

p.write_text(s)
