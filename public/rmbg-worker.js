/**
 * Web Worker — Remove Background using RMBG-1.4 (public model, no auth required)
 */
import { AutoModel, AutoProcessor, RawImage, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/dist/transformers.min.js";

env.allowLocalModels = false;
env.useBrowserCache = true;

let model = null;
let processor = null;

async function loadModel() {
  if (model && processor) return;
  self.postMessage({ type: "progress", message: "Carregando modelo (primeira vez ~170MB)..." });
  model = await AutoModel.from_pretrained("briaai/RMBG-1.4", {
    config: { model_type: "custom" },
  });
  processor = await AutoProcessor.from_pretrained("briaai/RMBG-1.4");
  self.postMessage({ type: "ready" });
}

self.onmessage = async (e) => {
  const { type, imageData, width, height } = e.data;

  if (type === "preload") {
    try { await loadModel(); } catch {}
    return;
  }

  if (type === "removebg") {
    try {
      await loadModel();
      self.postMessage({ type: "progress", message: "Processando imagem..." });

      const img = new RawImage(new Uint8ClampedArray(imageData), width, height, 4);
      const { pixel_values } = await processor(img);
      const { output } = await model({ input: pixel_values });

      const maskData = output.tolist()[0][0];
      const maskH = maskData.length;
      const maskW = maskData[0].length;

      const outData = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const srcIdx = (y * width + x) * 4;
          const maskY = Math.round((y / height) * (maskH - 1));
          const maskX = Math.round((x / width)  * (maskW - 1));
          const alpha = Math.round(maskData[maskY][maskX] * 255);
          outData[srcIdx]     = imageData[srcIdx];
          outData[srcIdx + 1] = imageData[srcIdx + 1];
          outData[srcIdx + 2] = imageData[srcIdx + 2];
          outData[srcIdx + 3] = alpha;
        }
      }

      self.postMessage({ type: "result", imageData: outData.buffer, width, height }, [outData.buffer]);
    } catch (err) {
      self.postMessage({ type: "error", message: String(err) });
    }
  }
};
