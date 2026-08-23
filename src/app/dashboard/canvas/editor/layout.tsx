"use client";

import { useEffect } from "react";

export default function CanvasEditorLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let syncing = false;

    const syncRadialGradientStops = () => {
      if (syncing) return;
      syncing = true;

      try {
        const radialButtons = Array.from(document.querySelectorAll("button")).filter(
          button => button.textContent?.trim() === "Radial"
        );

        radialButtons.forEach(radialButton => {
          const controls = radialButton.parentElement;
          const editor = controls?.parentElement;
          if (!controls || !editor) return;

          const linearButton = Array.from(controls.querySelectorAll("button")).find(
            button => button.textContent?.trim() === "Linear"
          );
          if (!linearButton) return;

          const preview = Array.from(editor.children).find(child =>
            child instanceof HTMLElement &&
            child.classList.contains("h-14") &&
            child.classList.contains("relative")
          ) as HTMLElement | undefined;
          if (!preview) return;

          const isRadial = radialButton.className.includes("bg-indigo-600");
          const handles = Array.from(
            preview.querySelectorAll<HTMLButtonElement>('button[title="Arraste para mover este ponto"]')
          );

          if (!isRadial) {
            handles.forEach(handle => {
              const savedPos = handle.dataset.radialGradientPos;
              if (savedPos == null) return;
              handle.style.left = `${savedPos}%`;
              handle.style.top = "";
              handle.style.bottom = "-7px";
              handle.style.transform = "translateX(-50%)";
              delete handle.dataset.radialGradientPos;
            });
            return;
          }

          // Keep the preview geometry consistent with the Fabric radial gradient,
          // whose 100% point is the closest side of the preview.
          if (preview.style.background.includes("radial-gradient(circle at center")) {
            preview.style.background = preview.style.background.replace(
              "radial-gradient(circle at center",
              "radial-gradient(circle closest-side at center"
            );
          }

          const rect = preview.getBoundingClientRect();
          const radius = Math.max(1, Math.min(rect.width, rect.height) / 2);

          handles.forEach(handle => {
            const alreadyPatched = handle.style.transform.includes("translate(-50%, -50%)");

            // React writes the real stop position back as a percentage after every
            // gradient update. Capture that value before repositioning the handle.
            if (!alreadyPatched && handle.style.left.endsWith("%")) {
              const pos = Number.parseFloat(handle.style.left);
              if (Number.isFinite(pos)) handle.dataset.radialGradientPos = String(pos);
            }

            const pos = Math.max(
              0,
              Math.min(100, Number.parseFloat(handle.dataset.radialGradientPos || "0") || 0)
            );
            const offset = radius * (pos / 100);

            // Radial stops live on a radius from the center instead of on the
            // bottom edge. This makes pointer distance map 1:1 to stop position.
            const expectedLeft = `calc(50% + ${offset}px)`;
            if (handle.style.left !== expectedLeft) handle.style.left = expectedLeft;
            if (handle.style.top !== "50%") handle.style.top = "50%";
            if (handle.style.bottom !== "") handle.style.bottom = "";
            if (handle.style.transform !== "translate(-50%, -50%)") {
              handle.style.transform = "translate(-50%, -50%)";
            }
          });
        });
      } finally {
        syncing = false;
      }
    };

    const observer = new MutationObserver(syncRadialGradientStops);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    window.addEventListener("resize", syncRadialGradientStops);
    syncRadialGradientStops();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncRadialGradientStops);
    };
  }, []);

  return <>{children}</>;
}
