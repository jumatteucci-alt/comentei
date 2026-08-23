from pathlib import Path

p = Path('src/app/dashboard/canvas/editor/page.tsx')
s = p.read_text()

repls = []
repls.append((
'''  const [lockTransformRatio, setLockTransformRatio] = useState(false);\n  const [selShadow, setSelShadow] = useState(false);''',
'''  const [lockTransformRatio, setLockTransformRatio] = useState(false);\n  const [threeLoaded, setThreeLoaded] = useState(false);\n  const [sel3DEnabled, setSel3DEnabled] = useState(false);\n  const [sel3DDepth, setSel3DDepth] = useState(32);\n  const [sel3DRotX, setSel3DRotX] = useState(0);\n  const [sel3DRotY, setSel3DRotY] = useState(0);\n  const [sel3DRotZ, setSel3DRotZ] = useState(0);\n  const [sel3DPerspective, setSel3DPerspective] = useState(45);\n  const [sel3DSideColor, setSel3DSideColor] = useState("#334155");\n  const [sel3DLight, setSel3DLight] = useState(100);\n  const [selShadow, setSelShadow] = useState(false);'''))

repls.append((
'''    setSelFlipX((obj.scaleX ?? 1) < 0);\n    setSelFlipY((obj.scaleY ?? 1) < 0);\n    setSelFontSize(Math.round(obj.fontSize || 48));''',
'''    setSelFlipX((obj.scaleX ?? 1) < 0);\n    setSelFlipY((obj.scaleY ?? 1) < 0);\n    const d3 = obj.__threeD || {};\n    setSel3DEnabled(!!d3.enabled);\n    setSel3DDepth(Number(d3.depth ?? 32));\n    setSel3DRotX(Number(d3.rotX ?? 0));\n    setSel3DRotY(Number(d3.rotY ?? 0));\n    setSel3DRotZ(Number(d3.rotZ ?? 0));\n    setSel3DPerspective(Number(d3.perspective ?? 45));\n    setSel3DSideColor(d3.sideColor || "#334155");\n    setSel3DLight(Number(d3.light ?? 100));\n    if (d3.enabled) requestAnimationFrame(() => refreshThreeDObject(obj));\n    setSelFontSize(Math.round(obj.fontSize || 48));'''))

repls.append((
'''    const paperScript = document.createElement("script");\n    paperScript.src = "https://cdnjs.cloudflare.com/ajax/libs/paper.js/0.12.18/paper-full.min.js";\n    paperScript.onload = () => setPaperLoaded(true);\n    document.head.appendChild(paperScript);\n\n    try {''',
'''    const paperScript = document.createElement("script");\n    paperScript.src = "https://cdnjs.cloudflare.com/ajax/libs/paper.js/0.12.18/paper-full.min.js";\n    paperScript.onload = () => setPaperLoaded(true);\n    document.head.appendChild(paperScript);\n\n    const threeScript = document.createElement("script");\n    threeScript.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";\n    threeScript.onload = () => setThreeLoaded(true);\n    document.head.appendChild(threeScript);\n\n    try {'''))

repls.append((
'''      try { document.head.removeChild(script); } catch {}\n      try { document.head.removeChild(otScript); } catch {}\n      try { document.head.removeChild(paperScript); } catch {}\n    };\n  }, []);''',
'''      try { document.head.removeChild(script); } catch {}\n      try { document.head.removeChild(otScript); } catch {}\n      try { document.head.removeChild(paperScript); } catch {}\n      try { document.head.removeChild(threeScript); } catch {}\n    };\n  }, []);\n\n  useEffect(() => {\n    if (!threeLoaded || !fc.current) return;\n    fc.current.getObjects().forEach((o:any) => { if (o.__threeD?.enabled) refreshThreeDObject(o); });\n    fc.current.requestRenderAll();\n  }, [threeLoaded]);'''))

repls.append((
'''  const updateFill = (color: string) => {\n    setSelFill(color); setSelFillGradient(null);\n    upd({ fill: color });\n  };''',
'''  const updateFill = (color: string) => {\n    setSelFill(color); setSelFillGradient(null);\n    upd({ fill: color });\n    if (sel?.__threeD?.enabled) requestAnimationFrame(() => refreshThreeDObject(sel));\n  };'''))

for old, new in repls:
    if old not in s:
        raise SystemExit(f'marker not found: {old[:80]!r}')
    s = s.replace(old, new, 1)

marker = '''  const updateRotation = (v: number) => { setSelRotation(v); upd({ angle: v }); };\n  const updateFontSize = (v: number) => {'''
insert = r'''  const updateRotation = (v: number) => { setSelRotation(v); upd({ angle: v }); };

  type Shape3DSettings = { enabled:boolean; depth:number; rotX:number; rotY:number; rotZ:number; perspective:number; sideColor:string; light:number };
  const supported3DShape = (obj:any) => !!obj && ["rect","circle","triangle","polygon"].includes(obj.type);

  function front3DColor(obj:any) {
    if (typeof obj?.fill === "string" && obj.fill !== "transparent") return parseGradientColor(obj.fill, 1).color;
    const stop = obj?.fill?.colorStops?.[0];
    return stop?.color ? parseGradientColor(stop.color, stop.opacity ?? 1).color : "#64748b";
  }

  function build3DShape(obj:any, T:any) {
    const shape = new T.Shape();
    const w = Math.max(1, Number(obj.width || (obj.radius ? obj.radius*2 : 100)));
    const h = Math.max(1, Number(obj.height || (obj.radius ? obj.radius*2 : 100)));
    const cx=w/2, cy=h/2;
    if (obj.type === "rect") {
      const rx=Math.max(0,Math.min(Number(obj.rx||0),w/2)); const ry=Math.max(0,Math.min(Number(obj.ry||rx||0),h/2));
      if (rx || ry) {
        const ax=rx||ry, ay=ry||rx;
        shape.moveTo(-cx+ax,cy); shape.lineTo(cx-ax,cy); shape.quadraticCurveTo(cx,cy,cx,cy-ay);
        shape.lineTo(cx,-cy+ay); shape.quadraticCurveTo(cx,-cy,cx-ax,-cy); shape.lineTo(-cx+ax,-cy);
        shape.quadraticCurveTo(-cx,-cy,-cx,-cy+ay); shape.lineTo(-cx,cy-ay); shape.quadraticCurveTo(-cx,cy,-cx+ax,cy); shape.closePath();
      } else { shape.moveTo(-cx,cy); shape.lineTo(cx,cy); shape.lineTo(cx,-cy); shape.lineTo(-cx,-cy); shape.closePath(); }
      return shape;
    }
    if (obj.type === "circle") { shape.absellipse(0,0,w/2,h/2,0,Math.PI*2,false,0); return shape; }
    if (obj.type === "triangle") { shape.moveTo(0,cy); shape.lineTo(cx,-cy); shape.lineTo(-cx,-cy); shape.closePath(); return shape; }
    if (obj.type === "polygon" && Array.isArray(obj.points) && obj.points.length > 2) {
      const po=obj.pathOffset||{x:0,y:0}; obj.points.forEach((pt:any,i:number)=>{ const x=Number(pt.x)-Number(po.x||0); const y=-(Number(pt.y)-Number(po.y||0)); if(i===0) shape.moveTo(x,y); else shape.lineTo(x,y); }); shape.closePath(); return shape;
    }
    return null;
  }

  function render3D(obj:any, cfg:Shape3DSettings) {
    const T=(window as any).THREE; if(!T || !supported3DShape(obj)) return null;
    let renderer:any=null;
    try {
      const shape=build3DShape(obj,T); if(!shape) return null;
      renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true}); renderer.setSize(512,512,false); renderer.setClearColor(0x000000,0);
      const scene=new T.Scene(); const geometry=new T.ExtrudeGeometry(shape,{depth:Math.max(1,cfg.depth),bevelEnabled:false,curveSegments:32,steps:1}); geometry.center();
      const front=new T.MeshStandardMaterial({color:new T.Color(front3DColor(obj)),roughness:.58,metalness:.04});
      const side=new T.MeshStandardMaterial({color:new T.Color(cfg.sideColor||"#334155"),roughness:.64,metalness:.03});
      const mesh=new T.Mesh(geometry,[front,side]); mesh.rotation.set(cfg.rotX*Math.PI/180,cfg.rotY*Math.PI/180,cfg.rotZ*Math.PI/180); scene.add(mesh);
      geometry.computeBoundingSphere(); const radius=Math.max(10,Number(geometry.boundingSphere?.radius||100)); const fov=Math.max(18,Math.min(90,cfg.perspective));
      const camera=new T.PerspectiveCamera(fov,1,.1,radius*100); camera.position.z=radius/Math.max(.08,Math.sin((fov*Math.PI/180)/2))*1.28; camera.lookAt(0,0,0);
      scene.add(new T.AmbientLight(0xffffff,.58)); const key=new T.DirectionalLight(0xffffff,Math.max(0,cfg.light)/100*1.35); key.position.set(-radius*1.4,radius*1.6,radius*2.8); scene.add(key);
      renderer.render(scene,camera); const out=document.createElement("canvas"); out.width=512; out.height=512; out.getContext("2d")!.drawImage(renderer.domElement,0,0);
      geometry.dispose(); front.dispose(); side.dispose(); renderer.dispose(); return out;
    } catch(err) { try{renderer?.dispose?.()}catch{}; console.warn("3D render failed",err); return null; }
  }

  function install3DRenderer(obj:any) {
    if(obj.__threeDRendererInstalled) return;
    obj.__threeDOriginalRender=obj._render;
    obj._render=function(ctx:CanvasRenderingContext2D){
      if(this.__threeD?.enabled && this.__threeDCanvas){ const w=Math.max(1,Number(this.width||100)), h=Math.max(1,Number(this.height||100)); ctx.drawImage(this.__threeDCanvas,-w/2,-h/2,w,h); return; }
      return this.__threeDOriginalRender.call(this,ctx);
    };
    obj.__threeDRendererInstalled=true; obj.objectCaching=false;
  }

  function refreshThreeDObject(obj:any, patch?:Partial<Shape3DSettings>) {
    if(!supported3DShape(obj)) return;
    const cfg:Shape3DSettings={enabled:!!obj.__threeD?.enabled,depth:Number(obj.__threeD?.depth??32),rotX:Number(obj.__threeD?.rotX??0),rotY:Number(obj.__threeD?.rotY??0),rotZ:Number(obj.__threeD?.rotZ??0),perspective:Number(obj.__threeD?.perspective??45),sideColor:obj.__threeD?.sideColor||"#334155",light:Number(obj.__threeD?.light??100),...(patch||{})};
    obj.__threeD={...cfg}; install3DRenderer(obj); obj.__threeDCanvas=cfg.enabled ? render3D(obj,cfg) : null; obj.dirty=true; fc.current?.requestRenderAll();
  }

  const applyShape3D=(patch:Partial<Shape3DSettings>)=>{
    if(!sel || !supported3DShape(sel)) return;
    const cfg:Shape3DSettings={enabled:sel3DEnabled,depth:sel3DDepth,rotX:sel3DRotX,rotY:sel3DRotY,rotZ:sel3DRotZ,perspective:sel3DPerspective,sideColor:sel3DSideColor,light:sel3DLight,...patch};
    setSel3DEnabled(cfg.enabled); setSel3DDepth(cfg.depth); setSel3DRotX(cfg.rotX); setSel3DRotY(cfg.rotY); setSel3DRotZ(cfg.rotZ); setSel3DPerspective(cfg.perspective); setSel3DSideColor(cfg.sideColor); setSel3DLight(cfg.light); refreshThreeDObject(sel,cfg);
  };
  const resetShape3D=()=>applyShape3D({enabled:true,depth:32,rotX:0,rotY:0,rotZ:0,perspective:45,sideColor:"#334155",light:100});
  const updateFontSize = (v: number) => {'''
if marker not in s: raise SystemExit('3d functions marker missing')
s=s.replace(marker,insert,1)

marker='''                  <button onClick={resetFreeTransform} className="w-full py-1.5 rounded-lg border border-gray-200 text-gray-500 text-xs hover:bg-gray-50">Resetar transformação</button>\n                </>\n              )}\n\n              {isRect && ('''
insert='''                  <button onClick={resetFreeTransform} className="w-full py-1.5 rounded-lg border border-gray-200 text-gray-500 text-xs hover:bg-gray-50">Resetar transformação</button>\n                </>\n              )}\n\n              {supported3DShape(sel) && (\n                <>\n                  <Sec title="3D" />\n                  <div className="flex items-center justify-between">\n                    <span className="text-gray-400">Ativar 3D</span>\n                    <button disabled={!threeLoaded} onClick={() => applyShape3D({ enabled: !sel3DEnabled })} className={`w-9 h-5 rounded-full transition disabled:opacity-40 ${sel3DEnabled ? "bg-indigo-500" : "bg-gray-200"}`}>\n                      <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${sel3DEnabled ? "translate-x-4" : ""}`} />\n                    </button>\n                  </div>\n                  {sel3DEnabled && (\n                    <div className="flex flex-col gap-2 p-2 rounded-lg border border-indigo-100 bg-indigo-50/30">\n                      <SliderRow label="Extrusão" value={sel3DDepth} min={1} max={200} unit="px" onChange={v => applyShape3D({ depth:v })} />\n                      <SliderRow label="Rotação X" value={sel3DRotX} min={-180} max={180} unit="°" onChange={v => applyShape3D({ rotX:v })} />\n                      <SliderRow label="Rotação Y" value={sel3DRotY} min={-180} max={180} unit="°" onChange={v => applyShape3D({ rotY:v })} />\n                      <SliderRow label="Rotação Z" value={sel3DRotZ} min={-180} max={180} unit="°" onChange={v => applyShape3D({ rotZ:v })} />\n                      <SliderRow label="Perspectiva" value={sel3DPerspective} min={18} max={90} unit="°" onChange={v => applyShape3D({ perspective:v })} />\n                      <ColorPicker value={sel3DSideColor} onChange={c => applyShape3D({ sideColor:c })} label="Cor da extrusão" />\n                      <SliderRow label="Iluminação" value={sel3DLight} min={0} max={200} unit="%" onChange={v => applyShape3D({ light:v })} />\n                      <button onClick={resetShape3D} className="w-full py-1.5 rounded-lg border border-indigo-200 text-indigo-600 bg-white text-xs hover:bg-indigo-50">Resetar 3D</button>\n                      <button onClick={() => applyShape3D({ enabled:false })} className="w-full py-1.5 rounded-lg border border-gray-200 text-gray-500 bg-white text-xs hover:bg-gray-50">Remover 3D</button>\n                    </div>\n                  )}\n                </>\n              )}\n\n              {isRect && ('''
if marker not in s: raise SystemExit('3d ui marker missing')
s=s.replace(marker,insert,1)

p.write_text(s)
