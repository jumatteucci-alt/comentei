from pathlib import Path

p = Path('src/app/dashboard/canvas/editor/page.tsx')
s = p.read_text()

old = '''  type AnimationLayer = { id: string; name: string; frames: Record<number, any[]> };\n  type AnimationBackground = { solid: string; gradient: GradValue | null };'''
new = '''  type AnimationEasing = "linear" | "easeIn" | "easeOut" | "easeInOut" | "bounce";\n  type AnimationLayer = { id: string; name: string; frames: Record<number, any[]>; easing: AnimationEasing };\n  type AnimationBackground = { solid: string; gradient: GradValue | null };'''
assert old in s, 'animation layer type marker missing'
s = s.replace(old, new, 1)

old = '''  const [animationLayers, setAnimationLayers] = useState<AnimationLayer[]>([\n    { id: FIRST_ANIM_LAYER, name: "Camada 1", frames: {} },\n  ]);'''
new = '''  const [animationLayers, setAnimationLayers] = useState<AnimationLayer[]>([\n    { id: FIRST_ANIM_LAYER, name: "Camada 1", frames: {}, easing: "easeInOut" },\n  ]);'''
assert old in s, 'initial animation layer marker missing'
s = s.replace(old, new, 1)

old = '''  const resolveAnimationLayerFrame = (layer: AnimationLayer, frame: number) => {\n    if (layer.frames[frame] !== undefined) return layer.frames[frame];\n    const keys = Object.keys(layer.frames).map(Number).filter(n => n <= frame).sort((a,b) => b-a);\n    if (keys.length) return layer.frames[keys[0]];\n    return [];\n  };'''
new = '''  const applyAnimationEasing = (t: number, easing: AnimationEasing) => {\n    const x = Math.max(0, Math.min(1, t));\n    if (easing === "easeIn") return x * x * x;\n    if (easing === "easeOut") return 1 - Math.pow(1 - x, 3);\n    if (easing === "easeInOut") return x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x + 2, 3) / 2;\n    if (easing === "bounce") {\n      const n1 = 7.5625, d1 = 2.75;\n      if (x < 1/d1) return n1*x*x;\n      if (x < 2/d1) { const y=x-1.5/d1; return n1*y*y+.75; }\n      if (x < 2.5/d1) { const y=x-2.25/d1; return n1*y*y+.9375; }\n      const y=x-2.625/d1; return n1*y*y+.984375;\n    }\n    return x;\n  };\n\n  const tweenNumber = (a:any, b:any, t:number) => {\n    const na = Number(a), nb = Number(b);\n    return Number.isFinite(na) && Number.isFinite(nb) ? na + (nb - na) * t : a;\n  };\n\n  const tweenAngle = (a:any, b:any, t:number) => {\n    const na = Number(a || 0), nb = Number(b || 0);\n    const delta = ((nb - na + 540) % 360) - 180;\n    return na + delta * t;\n  };\n\n  const tweenAnimationObject = (from:any, to:any, t:number) => {\n    if (!from || !to || from.type !== to.type || !from.__uid || from.__uid !== to.__uid) return JSON.parse(JSON.stringify(from || to));\n    const out = JSON.parse(JSON.stringify(from));\n    const numeric = [\n      "left","top","scaleX","scaleY","skewX","skewY","opacity","width","height",\n      "rx","ry","strokeWidth","fontSize","charSpacing","lineHeight","__vectorBlur"\n    ];\n    numeric.forEach(k => { if (from[k] != null && to[k] != null) out[k] = tweenNumber(from[k], to[k], t); });\n    if (from.angle != null || to.angle != null) out.angle = tweenAngle(from.angle, to.angle, t);\n\n    if (from.shadow && to.shadow) {\n      out.shadow = { ...from.shadow };\n      ["blur","offsetX","offsetY"].forEach(k => { if (from.shadow[k] != null && to.shadow[k] != null) out.shadow[k] = tweenNumber(from.shadow[k], to.shadow[k], t); });\n    }\n\n    if (from.__threeD && to.__threeD && from.__threeD.enabled && to.__threeD.enabled) {\n      out.__threeD = { ...from.__threeD };\n      ["depth","rotX","rotY","rotZ","perspective","light"].forEach(k => {\n        if (from.__threeD[k] != null && to.__threeD[k] != null) out.__threeD[k] = k.startsWith("rot") ? tweenAngle(from.__threeD[k], to.__threeD[k], t) : tweenNumber(from.__threeD[k], to.__threeD[k], t);\n      });\n    }\n    return out;\n  };\n\n  const resolveAnimationLayerFrame = (layer: AnimationLayer, frame: number) => {\n    if (layer.frames[frame] !== undefined) return layer.frames[frame];\n    const keys = Object.keys(layer.frames).map(Number).sort((a,b) => a-b);\n    const prev = [...keys].reverse().find(n => n < frame);\n    const next = keys.find(n => n > frame);\n    if (prev === undefined) return [];\n    if (next === undefined) return layer.frames[prev] || [];\n\n    const fromObjects = layer.frames[prev] || [];\n    const toObjects = layer.frames[next] || [];\n    const rawT = (frame - prev) / Math.max(1, next - prev);\n    const t = applyAnimationEasing(rawT, layer.easing || "linear");\n    const toByUid = new Map<any, any>(toObjects.filter((o:any) => o?.__uid).map((o:any) => [o.__uid, o]));\n\n    return fromObjects.map((from:any) => {\n      const to = from?.__uid ? toByUid.get(from.__uid) : null;\n      return to ? tweenAnimationObject(from, to, t) : JSON.parse(JSON.stringify(from));\n    });\n  };'''
assert old in s, 'resolve animation frame marker missing'
s = s.replace(old, new, 1)

old = '''    const next = [...animationLayersRef.current, { id, name: `Camada ${animationLayersRef.current.length + 1}`, frames: { [currentFrameRef.current]: [] } }];'''
new = '''    const next = [...animationLayersRef.current, { id, name: `Camada ${animationLayersRef.current.length + 1}`, frames: { [currentFrameRef.current]: [] }, easing: "easeInOut" as AnimationEasing }];'''
assert old in s, 'add animation layer marker missing'
s = s.replace(old, new, 1)

marker = '''  const removeAnimationLayer = (id: string) => {'''
insert = '''  const updateAnimationLayerEasing = (id: string, easing: AnimationEasing) => {\n    setAnimationLayersLive(animationLayersRef.current.map(layer => layer.id === id ? { ...layer, easing } : layer));\n    if (animationModeRef.current) loadAnimationFrame(currentFrameRef.current, false, false);\n  };\n\n  const removeAnimationLayer = (id: string) => {'''
assert marker in s, 'remove animation layer marker missing'
s = s.replace(marker, insert, 1)

old = '''            <div className="flex items-center gap-1 text-xs text-gray-500 ml-2">\n              <span>FPS</span>\n              <input type="number" min={1} max={60} value={animationFps}\n                onChange={e => setAnimationFps(Math.max(1, Math.min(60, +e.target.value || 1)))}\n                className="w-14 h-7 px-2 border border-gray-200 rounded-lg text-center focus:outline-none focus:border-indigo-400" />\n            </div>'''
new = '''            <div className="flex items-center gap-1 text-xs text-gray-500 ml-2">\n              <span>FPS</span>\n              <input type="number" min={1} max={60} value={animationFps}\n                onChange={e => setAnimationFps(Math.max(1, Math.min(60, +e.target.value || 1)))}\n                className="w-14 h-7 px-2 border border-gray-200 rounded-lg text-center focus:outline-none focus:border-indigo-400" />\n            </div>\n            <div className="flex items-center gap-1 text-xs text-gray-500 ml-2">\n              <span>Easing</span>\n              <select\n                value={animationLayers.find(l => l.id === selectedAnimLayerId)?.easing || "easeInOut"}\n                onChange={e => updateAnimationLayerEasing(selectedAnimLayerId, e.target.value as AnimationEasing)}\n                className="h-7 px-2 border border-gray-200 rounded-lg bg-white text-xs focus:outline-none focus:border-indigo-400">\n                <option value="linear">Linear</option>\n                <option value="easeIn">Ease In</option>\n                <option value="easeOut">Ease Out</option>\n                <option value="easeInOut">Ease In/Out</option>\n                <option value="bounce">Bounce</option>\n              </select>\n            </div>'''
assert old in s, 'fps toolbar marker missing'
s = s.replace(old, new, 1)

old = '''                      const hasKey = layer.frames[frame] !== undefined;\n                      const active = currentFrame === frame;'''
new = '''                      const hasKey = layer.frames[frame] !== undefined;\n                      const keys = Object.keys(layer.frames).map(Number).sort((a,b)=>a-b);\n                      const hasPrev = keys.some(k => k < frame);\n                      const hasNext = keys.some(k => k > frame);\n                      const isTween = !hasKey && hasPrev && hasNext;\n                      const active = currentFrame === frame;'''
assert old in s, 'timeline cell state marker missing'
s = s.replace(old, new, 1)

old = '''                          {hasKey && <span className={`block w-2.5 h-2.5 rotate-45 rounded-[1px] ${selectedAnimLayerId===layer.id ? "bg-indigo-600" : "bg-indigo-400"}`} />}\n                          {active && <span className="absolute left-1/2 top-0 bottom-0 w-px bg-indigo-500 pointer-events-none" />}'''
new = '''                          {hasKey && <span className={`block w-2.5 h-2.5 rotate-45 rounded-[1px] ${selectedAnimLayerId===layer.id ? "bg-indigo-600" : "bg-indigo-400"}`} />}\n                          {isTween && <span className="w-1 h-1 rounded-full bg-indigo-200" title="Frame interpolado" />}\n                          {active && <span className="absolute left-1/2 top-0 bottom-0 w-px bg-indigo-500 pointer-events-none" />}'''
assert old in s, 'timeline keyframe marker missing'
s = s.replace(old, new, 1)

p.write_text(s)
