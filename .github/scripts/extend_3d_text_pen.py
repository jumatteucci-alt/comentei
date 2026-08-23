from pathlib import Path

p = Path('src/app/dashboard/canvas/editor/page.tsx')
s = p.read_text()

old = '  const supported3DShape = (obj:any) => !!obj && ["rect","circle","triangle","polygon"].includes(obj.type);'
new = '''  const supported3DShape = (obj:any) => {
    if (!obj) return false;
    if (["rect","circle","triangle","polygon","textbox","i-text","text"].includes(obj.type)) return true;
    if (obj.type === "path") return Array.isArray(obj.path) && obj.path.some((cmd:any[]) => String(cmd?.[0] || "").toUpperCase() === "Z");
    return false;
  };'''
assert old in s, 'supported3DShape marker not found'
s = s.replace(old, new, 1)

old = '''    if (obj.type === "polygon" && Array.isArray(obj.points) && obj.points.length > 2) {
      const po=obj.pathOffset||{x:0,y:0}; obj.points.forEach((pt:any,i:number)=>{ const x=Number(pt.x)-Number(po.x||0); const y=-(Number(pt.y)-Number(po.y||0)); if(i===0) shape.moveTo(x,y); else shape.lineTo(x,y); }); shape.closePath(); return shape;
    }
    return null;
  }

  function render3D(obj:any, cfg:Shape3DSettings) {
    const T=(window as any).THREE; if(!T || !supported3DShape(obj)) return null;
    let renderer:any=null;
    try {
      const shape=build3DShape(obj,T); if(!shape) return null;'''
new = r'''    if (obj.type === "polygon" && Array.isArray(obj.points) && obj.points.length > 2) {
      const po=obj.pathOffset||{x:0,y:0}; obj.points.forEach((pt:any,i:number)=>{ const x=Number(pt.x)-Number(po.x||0); const y=-(Number(pt.y)-Number(po.y||0)); if(i===0) shape.moveTo(x,y); else shape.lineTo(x,y); }); shape.closePath(); return shape;
    }
    if (obj.type === "path" && Array.isArray(obj.path)) {
      const sp = new T.ShapePath();
      const po = obj.pathOffset || { x: 0, y: 0 };
      const X = (n:any) => Number(n || 0) - Number(po.x || 0);
      const Y = (n:any) => -(Number(n || 0) - Number(po.y || 0));
      let cxp = 0, cyp = 0, sx = 0, sy = 0;
      obj.path.forEach((cmd:any[]) => {
        const c = String(cmd?.[0] || "").toUpperCase();
        if (c === "M") { cxp=X(cmd[1]); cyp=Y(cmd[2]); sx=cxp; sy=cyp; sp.moveTo(cxp,cyp); }
        else if (c === "L") { cxp=X(cmd[1]); cyp=Y(cmd[2]); sp.lineTo(cxp,cyp); }
        else if (c === "H") { cxp=X(cmd[1]); sp.lineTo(cxp,cyp); }
        else if (c === "V") { cyp=Y(cmd[1]); sp.lineTo(cxp,cyp); }
        else if (c === "C") { const x1=X(cmd[1]),y1=Y(cmd[2]),x2=X(cmd[3]),y2=Y(cmd[4]); cxp=X(cmd[5]);cyp=Y(cmd[6]); sp.bezierCurveTo(x1,y1,x2,y2,cxp,cyp); }
        else if (c === "Q") { const x1=X(cmd[1]),y1=Y(cmd[2]); cxp=X(cmd[3]);cyp=Y(cmd[4]); sp.quadraticCurveTo(x1,y1,cxp,cyp); }
        else if (c === "Z") { sp.lineTo(sx,sy); }
      });
      const shapes = sp.toShapes(true);
      return shapes.length === 1 ? shapes[0] : shapes;
    }
    return null;
  }

  const TEXT_3D_FONT_URLS: Record<string,string> = {
    "Montserrat":"https://fonts.gstatic.com/s/montserrat/v29/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCtr6Hw5aXo.woff",
    "Playfair Display":"https://fonts.gstatic.com/s/playfairdisplay/v36/nuFiD-vYSZviVYUb_rj3ij__anPXDTnCjmHKM4nYO7KN_qiTbtA.woff",
    "Roboto":"https://fonts.gstatic.com/s/roboto/v32/KFOmCnqEu92Fr1Mu4mxKKTU1Kg.woff",
    "Oswald":"https://fonts.gstatic.com/s/oswald/v53/TK3_WkUHHAIjg75cFRf3bXL8LICs13NvgUFoZAaRliE.woff",
    "Lato":"https://fonts.gstatic.com/s/lato/v24/S6uyw4BMUTPHjx4wXiWtFCc.woff",
    "Raleway":"https://fonts.gstatic.com/s/raleway/v34/1Ptrg8zYS_SKggPNwJYtWqhPANqczVsq4A.woff",
    "Pacifico":"https://fonts.gstatic.com/s/pacifico/v22/FwZY7-Qmy14u9lezJ-6H6MmBp0u-.woff",
    "Dancing Script":"https://fonts.gstatic.com/s/dancingscript/v25/If2cXTr6YS-zF4S-kcSWSVi_sxjsohD9F50Ruu7BMSo3ROp6.woff",
    "Bebas Neue":"https://fonts.gstatic.com/s/bebasneue/v14/JTUSjIg69CK48gW7PXoo9WlhyyTh89Y.woff",
  };

  async function get3DFont(family:string) {
    const opentype = (window as any).opentype;
    if (!opentype) return null;
    const store = ((window as any).__cmc3DFontCache ||= new Map());
    const key = TEXT_3D_FONT_URLS[family] ? family : (family === "Georgia" ? "Playfair Display" : family === "Impact" ? "Oswald" : "Roboto");
    if (store.has(key)) return store.get(key);
    const url = TEXT_3D_FONT_URLS[key] || TEXT_3D_FONT_URLS.Roboto;
    try {
      const font = await opentype.load(url);
      store.set(key, font);
      return font;
    } catch { return null; }
  }

  async function build3DTextShapes(obj:any, T:any) {
    const font = await get3DFont(obj.fontFamily || "Montserrat");
    if (!font) return null;
    const fontSize = Math.max(1, Number(obj.fontSize || 48));
    const lines = Array.isArray(obj.textLines) && obj.textLines.length ? obj.textLines : String(obj.text || "").split("\n");
    const lineH = fontSize * Number(obj.lineHeight || 1.16);
    const commands:any[] = [];
    const widths = lines.map((line:string) => font.getAdvanceWidth(line || " ", fontSize, { kerning:true }));
    lines.forEach((line:string, i:number) => {
      let x = 0;
      if (obj.textAlign === "center") x = -widths[i]/2;
      else if (obj.textAlign === "right") x = -widths[i];
      const y = i * lineH;
      const path = font.getPath(line || " ", x, y, fontSize, { kerning:true });
      commands.push(...path.commands);
    });
    if (!commands.length) return null;
    const pts = commands.flatMap((c:any) => [[c.x,c.y],[c.x1,c.y1],[c.x2,c.y2]].filter((v:any[]) => Number.isFinite(v[0]) && Number.isFinite(v[1])));
    if (!pts.length) return null;
    const minX=Math.min(...pts.map((v:any[])=>v[0])), maxX=Math.max(...pts.map((v:any[])=>v[0]));
    const minY=Math.min(...pts.map((v:any[])=>v[1])), maxY=Math.max(...pts.map((v:any[])=>v[1]));
    const ox=(minX+maxX)/2, oy=(minY+maxY)/2;
    const sp = new T.ShapePath();
    commands.forEach((c:any) => {
      const x=(n:any)=>Number(n)-ox, y=(n:any)=>-(Number(n)-oy);
      if (c.type === "M") sp.moveTo(x(c.x),y(c.y));
      else if (c.type === "L") sp.lineTo(x(c.x),y(c.y));
      else if (c.type === "C") sp.bezierCurveTo(x(c.x1),y(c.y1),x(c.x2),y(c.y2),x(c.x),y(c.y));
      else if (c.type === "Q") sp.quadraticCurveTo(x(c.x1),y(c.y1),x(c.x),y(c.y));
      else if (c.type === "Z") { /* ShapePath closes contours through toShapes */ }
    });
    const shapes = sp.toShapes(true);
    return shapes.length ? shapes : null;
  }

  async function render3D(obj:any, cfg:Shape3DSettings) {
    const T=(window as any).THREE; if(!T || !supported3DShape(obj)) return null;
    let renderer:any=null;
    try {
      const isText3D = ["textbox","i-text","text"].includes(obj.type);
      const shape = isText3D ? await build3DTextShapes(obj,T) : build3DShape(obj,T);
      if(!shape || (Array.isArray(shape) && !shape.length)) return null;'''
assert old in s, 'build/render marker not found'
s = s.replace(old, new, 1)

old = '''  function refreshThreeDObject(obj:any, patch?:Partial<Shape3DSettings>) {
    if(!supported3DShape(obj)) return;
    const cfg:Shape3DSettings={enabled:!!obj.__threeD?.enabled,depth:Number(obj.__threeD?.depth??32),rotX:Number(obj.__threeD?.rotX??0),rotY:Number(obj.__threeD?.rotY??0),rotZ:Number(obj.__threeD?.rotZ??0),perspective:Number(obj.__threeD?.perspective??45),sideColor:obj.__threeD?.sideColor||"#334155",light:Number(obj.__threeD?.light??100),...(patch||{})};
    obj.__threeD={...cfg}; install3DRenderer(obj); obj.__threeDCanvas=cfg.enabled ? render3D(obj,cfg) : null; obj.dirty=true; fc.current?.requestRenderAll();
  }'''
new = '''  async function refreshThreeDObject(obj:any, patch?:Partial<Shape3DSettings>) {
    if(!supported3DShape(obj)) return;
    const cfg:Shape3DSettings={enabled:!!obj.__threeD?.enabled,depth:Number(obj.__threeD?.depth??32),rotX:Number(obj.__threeD?.rotX??0),rotY:Number(obj.__threeD?.rotY??0),rotZ:Number(obj.__threeD?.rotZ??0),perspective:Number(obj.__threeD?.perspective??45),sideColor:obj.__threeD?.sideColor||"#334155",light:Number(obj.__threeD?.light??100),...(patch||{})};
    obj.__threeD={...cfg}; install3DRenderer(obj);
    const version = (obj.__threeDRenderVersion || 0) + 1;
    obj.__threeDRenderVersion = version;
    const rendered = cfg.enabled ? await render3D(obj,cfg) : null;
    if (obj.__threeDRenderVersion !== version) return;
    obj.__threeDCanvas = rendered; obj.dirty=true; fc.current?.requestRenderAll();
  }'''
assert old in s, 'refresh3D marker not found'
s = s.replace(old, new, 1)

old = '''    const threeScript = document.createElement("script");
    threeScript.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
    threeScript.onload = () => setThreeLoaded(true);
    document.head.appendChild(threeScript);'''
new = '''    const threeScript = document.createElement("script");
    threeScript.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
    threeScript.onload = () => {
      const fabric = (window as any).fabric;
      if (fabric?.Object?.prototype && !fabric.Object.prototype.__cmc3DSerializer) {
        const originalToObject = fabric.Object.prototype.toObject;
        fabric.Object.prototype.toObject = function(propertiesToInclude?: string[]) {
          return originalToObject.call(this, Array.from(new Set([...(propertiesToInclude || []), "__threeD"])));
        };
        fabric.Object.prototype.__cmc3DSerializer = true;
      }
      setThreeLoaded(true);
    };
    document.head.appendChild(threeScript);'''
assert old in s, 'threeScript marker not found'
s = s.replace(old, new, 1)

old = '''      canvas.on("selection:cleared", () => syncSel(null));
      canvas.on("object:modified", (e: any) => {'''
new = '''      canvas.on("selection:cleared", () => syncSel(null));
      canvas.on("text:changed", (e:any) => { if (e.target?.__threeD?.enabled) refreshThreeDObject(e.target); });
      canvas.on("object:modified", (e: any) => {'''
assert old in s, 'canvas events marker not found'
s = s.replace(old, new, 1)

old = '''    } else { upd({ fontSize: v }); }
  };'''
new = '''    } else { upd({ fontSize: v }); }
    if (sel?.__threeD?.enabled) requestAnimationFrame(() => refreshThreeDObject(sel));
  };'''
assert old in s, 'font size marker not found'
s = s.replace(old, new, 1)

old = '''    document.fonts.load(`${selFontSize}px "${v}"`).finally(() => {
      upd({ fontFamily: v });
    });'''
new = '''    document.fonts.load(`${selFontSize}px "${v}"`).finally(() => {
      upd({ fontFamily: v });
      if (sel?.__threeD?.enabled) refreshThreeDObject(sel);
    });'''
assert old in s, 'font family marker not found'
s = s.replace(old, new, 1)

old = '  const updateCharSpacing = (v: number) => { setSelCharSpacing(v); upd({ charSpacing: v }); };\n  const updateLineHeight  = (v: number) => { setSelLineHeight(v);  upd({ lineHeight: v }); };'
new = '''  const updateCharSpacing = (v: number) => { setSelCharSpacing(v); upd({ charSpacing: v }); if (sel?.__threeD?.enabled) requestAnimationFrame(() => refreshThreeDObject(sel)); };
  const updateLineHeight  = (v: number) => { setSelLineHeight(v);  upd({ lineHeight: v }); if (sel?.__threeD?.enabled) requestAnimationFrame(() => refreshThreeDObject(sel)); };'''
assert old in s, 'text spacing marker not found'
s = s.replace(old, new, 1)

old = '''    if (!g) { upd({ fill: selFill }); return; }
    if (fc.current && sel) applyGradient(fc.current, sel, g);
  };'''
new = '''    if (!g) { upd({ fill: selFill }); if (sel?.__threeD?.enabled) requestAnimationFrame(() => refreshThreeDObject(sel)); return; }
    if (fc.current && sel) applyGradient(fc.current, sel, g);
    if (sel?.__threeD?.enabled) requestAnimationFrame(() => refreshThreeDObject(sel));
  };'''
assert old in s, 'gradient 3d refresh marker not found'
s = s.replace(old, new, 1)

p.write_text(s)
