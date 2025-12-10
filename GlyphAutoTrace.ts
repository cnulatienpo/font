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
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;

  // Detect if we should use brightness or alpha
  let opaqueCount = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 128) opaqueCount++;
  }
  const useAlpha = opaqueCount < (width * height * 0.95); // If most pixels are opaque, use brightness instead
  
  console.log(`Image: ${width}x${height}, Mode: ${useAlpha ? 'alpha' : 'brightness'}`);

  // Create pixel rectangles for dark pixels (or opaque pixels if transparent background)
  const rects: string[] = [];
  let pixelCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const alpha = data[idx + 3];
      
      // Calculate brightness (0-255)
      const brightness = (r + g + b) / 3;
      
      let isGlyph = false;
      if (useAlpha) {
        // Transparent background mode: use alpha
        isGlyph = alpha > 128;
      } else {
        // White background mode: use brightness (dark = glyph)
        isGlyph = brightness < 200; // Anything darker than light gray
      }
      
      if (isGlyph) {
        rects.push(`M${x},${y}h1v1h-1z`);
        pixelCount++;
      }
    }
  }

  console.log(`Generated ${pixelCount} glyph pixels`);

  if (rects.length === 0) {
    console.warn("No glyph pixels found, creating test square");
    return `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<rect x="10" y="10" width="50" height="50" fill="#ff0000" />` +
      `<text x="${width/2}" y="${height/2}" fill="#ffffff" text-anchor="middle" font-size="20">NO DARK PIXELS</text>` +
      `</svg>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<path fill="#ffffff" stroke="none" d="${rects.join("")}" />` +
    `</svg>`;
}
