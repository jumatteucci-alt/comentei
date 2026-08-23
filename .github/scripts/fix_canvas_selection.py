from pathlib import Path
p=Path('src/app/dashboard/canvas/editor/page.tsx')
s=p.read_text()

old='''      const canvas = new (window as any).fabric.Canvas(canvasRef.current, {\n        width: currentW,\n        height: currentH,\n        backgroundColor: "#ffffff",\n        selection: true,\n        centeredRotation: true,\n      });'''
new='''      const canvas = new (window as any).fabric.Canvas(canvasRef.current, {\n        width: currentW,\n        height: currentH,\n        backgroundColor: "#ffffff",\n        selection: true,\n        centeredRotation: true,\n        // Make clicking objects less fragile, especially custom-rendered 3D objects.\n        targetFindTolerance: 8,\n        perPixelTargetFind: false,\n        preserveObjectStacking: true,\n      });'''
assert old in s, 'canvas init marker missing'
s=s.replace(old,new,1)

old='''    obj.__threeD={...cfg}; install3DRenderer(obj);\n    const version = (obj.__threeDRenderVersion || 0) + 1;'''
new='''    obj.__threeD={...cfg}; install3DRenderer(obj);\n    // 3D is only a visual renderer: never let it disable normal Fabric interaction.\n    if (!obj.lockMovementX) obj.set({ selectable:true, evented:true });\n    obj.setCoords?.();\n    const version = (obj.__threeDRenderVersion || 0) + 1;'''
assert old in s, '3d refresh marker missing'
s=s.replace(old,new,1)

old='''      canvas.on("mouse:down", (e: any) => {\n        if (isEditingNodesRef.current && editingData.current) {'''
new='''      canvas.on("mouse:down", (e: any) => {\n        // Robust selection fallback. Custom renderers (3D/blur) can make Fabric's\n        // normal target detection feel inconsistent near visual edges. In Select\n        // mode, if Fabric did not resolve a target, pick the topmost object whose\n        // transformed bounding box contains the pointer.\n        if (activeToolRef.current === "select" && !isEditingNodesRef.current && !e.target) {\n          const pointer = canvas.getPointer(e.e);\n          const objects = canvas.getObjects().filter((o:any) =>\n            o && o.visible !== false && o.selectable !== false && o.evented !== false &&\n            !o.isControlHelper && !o.isEditPreview\n          );\n          for (let i = objects.length - 1; i >= 0; i--) {\n            const o = objects[i];\n            try {\n              o.setCoords?.();\n              const br = o.getBoundingRect(true, true);\n              const pad = o.__threeD?.enabled ? 10 : 4;\n              if (pointer.x >= br.left - pad && pointer.x <= br.left + br.width + pad &&\n                  pointer.y >= br.top - pad && pointer.y <= br.top + br.height + pad) {\n                canvas.setActiveObject(o);\n                syncSel(o);\n                canvas.requestRenderAll();\n                break;\n              }\n            } catch {}\n          }\n        }\n\n        if (isEditingNodesRef.current && editingData.current) {'''
assert old in s, 'mouse down marker missing'
s=s.replace(old,new,1)

p.write_text(s)
