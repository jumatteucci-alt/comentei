from pathlib import Path
import re

p = Path('src/app/dashboard/canvas/editor/page.tsx')
s = p.read_text()

# 1) Leaving Pen with 2+ points should commit an open path, not discard it.
pat = re.compile(r'''  const stopPen = \(\) => \{\n.*?\n  \};\n\n  finalizePenRef\.current = finalizePen;''', re.S)
m = pat.search(s)
if not m:
    raise SystemExit('stopPen block not found')
replacement = '''  const stopPen = () => {
    if (activeToolRef.current === "pen" && penPoints.current.length >= 2) {
      finalizePen(false);
      return;
    }
    setActiveTool("select"); activeToolRef.current = "select";
    lastFinalizedPath.current = null;
    cancelPenRef.current();
    if (fc.current) {
      fc.current.defaultCursor = "default";
      fc.current.hoverCursor = "move";
      fc.current.selection = true;
      fc.current.skipTargetFind = false;
    }
  };

  finalizePenRef.current = finalizePen;'''
s = s[:m.start()] + replacement + s[m.end():]

# 2) If the user clicks another tool directly, commit the pending Pen path on pointer-down
# before that tool's own click handler runs. Exclude Pen's own action buttons.
old = '''        <div className="w-14 bg-white border-r border-gray-200 flex flex-col items-center py-3 gap-1 flex-shrink-0 overflow-y-auto">'''
new = '''        <div
          onPointerDownCapture={e => {
            if (pixelEditMode || activeToolRef.current !== "pen" || penPoints.current.length < 2) return;
            const action = (e.target as HTMLElement).closest("button,label") as HTMLElement | null;
            if (!action) return;
            const title = action.getAttribute("title") || "";
            if (title.startsWith("Caneta") || title.startsWith("Fechar forma") || title.startsWith("Finalizar aberto") || title.startsWith("Cancelar")) return;
            finalizePenRef.current(false);
          }}
          className="w-14 bg-white border-r border-gray-200 flex flex-col items-center py-3 gap-1 flex-shrink-0 overflow-y-auto">'''
if old not in s:
    raise SystemExit('left toolbar marker not found')
s = s.replace(old, new, 1)

p.write_text(s)
