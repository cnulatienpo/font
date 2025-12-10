import opentype from "opentype.js";

export type GlyphTransform = {
  svg: string | null;
  scale: number;
  rotate: number;
  x: number;
  y: number;
};

export type BoundingBox = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  width: number;
  height: number;
};

export function extractPathData(svg: string): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, "image/svg+xml");
  const paths = Array.from(doc.querySelectorAll("path"));
  const ds = paths
    .map(p => p.getAttribute("d"))
    .filter((d): d is string => Boolean(d));

  if (ds.length === 0) {
    const svgEl = doc.querySelector("svg");
    const viewBox = svgEl?.getAttribute("viewBox")?.split(" ").map(Number);
    if (svgEl) {
      const width = Number(svgEl.getAttribute("width")) || viewBox?.[2] || 100;
      const height = Number(svgEl.getAttribute("height")) || viewBox?.[3] || 100;
      return [`M0 0 H${width} V${height} H0 Z`];
    }
  }
  return ds;
}

export function buildPathFromData(ds: string[]) {
  const base = new opentype.Path();
  ds.forEach(d => {
    const p = opentype.Path.fromSVG(d);
    p.commands.forEach(cmd => base.commands.push({ ...cmd } as any));
  });
  return base;
}

export function transformPath(
  path: opentype.Path,
  glyph: GlyphTransform,
  style: "Regular" | "Bold" | "Italic" | "BoldItalic"
) {
  const rad = (glyph.rotate * Math.PI) / 180;
  const styleScale = style.includes("Bold") ? 1.12 : 1;
  const italicShear = style.includes("Italic") ? Math.tan((12 * Math.PI) / 180) : 0;
  const sx = glyph.scale * styleScale;
  const sy = glyph.scale * styleScale;

  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const applyPoint = (x: number, y: number) => {
    let nx = x * sx;
    let ny = y * sy;
    if (italicShear !== 0) {
      nx = nx + ny * italicShear;
    }
    const rx = nx * cos - ny * sin;
    const ry = nx * sin + ny * cos;
    return { x: rx + glyph.x, y: ry + glyph.y };
  };

  const newPath = new opentype.Path();
  path.commands.forEach(cmd => {
    const newCmd: any = { ...cmd };
    if ("x" in newCmd && "y" in newCmd) {
      const p = applyPoint(newCmd.x, newCmd.y);
      newCmd.x = p.x;
      newCmd.y = p.y;
    }
    if ("x1" in newCmd && "y1" in newCmd) {
      const p = applyPoint(newCmd.x1, newCmd.y1);
      newCmd.x1 = p.x;
      newCmd.y1 = p.y;
    }
    if ("x2" in newCmd && "y2" in newCmd) {
      const p = applyPoint(newCmd.x2, newCmd.y2);
      newCmd.x2 = p.x;
      newCmd.y2 = p.y;
    }
    newPath.commands.push(newCmd);
  });
  return newPath;
}

export function computeBoundingBox(svg: string, glyph: GlyphTransform): BoundingBox | null {
  try {
    const ds = extractPathData(svg);
    const basePath = buildPathFromData(ds);
    const transformed = transformPath(basePath, glyph, "Regular");
    const box = transformed.getBoundingBox();
    return {
      xMin: box.x1,
      xMax: box.x2,
      yMin: box.y1,
      yMax: box.y2,
      width: box.x2 - box.x1,
      height: box.y2 - box.y1,
    };
  } catch (e) {
    console.warn("Failed to compute bounding box", e);
    return null;
  }
}
