export async function tracePNGtoSVG(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(image, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const threshold = 10; // alpha threshold
  const pathParts: string[] = [];

  for (let y = 0; y < height; y++) {
    let x = 0;
    while (x < width) {
      const idx = (y * width + x) * 4 + 3;
      const alpha = data[idx];
      if (alpha > threshold) {
        let runStart = x;
        let runEnd = x;
        while (runEnd + 1 < width) {
          const nextAlpha = data[(y * width + runEnd + 1) * 4 + 3];
          if (nextAlpha > threshold) {
            runEnd++;
          } else {
            break;
          }
        }
        const runWidth = runEnd - runStart + 1;
        pathParts.push(`M${runStart} ${y}h${runWidth}v1h-${runWidth}Z`);
        x = runEnd + 1;
      } else {
        x++;
      }
    }
  }

  if (pathParts.length === 0) {
    pathParts.push(`M0 0 H${width} V${height} H0 Z`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">` +
    `<path fill="currentColor" d="${pathParts.join(" ")}" />` +
    `</svg>`;
}
