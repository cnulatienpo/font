import Potrace from 'potrace';

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

  // Convert canvas to blob for Potrace
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to create blob'));
    });
  });

  // Use Potrace for proper vectorization
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const buffer = reader.result as ArrayBuffer;
      Potrace.trace(Buffer.from(buffer), {
        threshold: 128,
        color: '#ffffff',
        background: 'transparent'
      }, (err: Error | null, svg: string) => {
        if (err) {
          console.error('Potrace error:', err);
          reject(err);
        } else {
          console.log('Potrace traced successfully, SVG length:', svg?.length);
          console.log('SVG preview:', svg?.substring(0, 200));
          resolve(svg);
        }
      });
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}
