import React, { useEffect, useMemo, useState } from "react";
import GuideControls from "./GuideControls";
import GuideOverlay from "./GuideOverlay";
import FontMetadataForm from "./FontMetadataForm";
import { tracePNGtoSVG } from "./GlyphAutoTrace";
import opentype from "opentype.js";

type GlyphData = {
  svg: string | null;
  scale: number;
  rotate: number;
  x: number;
  y: number;
  advance: number;
};

type FontMetadata = {
  fontName: string;
  styleName: string;
  unitsPerEm: number;
  ascender: number;
  descender: number;
  padding: number;
};

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const LOWER = "abcdefghijklmnopqrstuvwxyz".split("");
const DIGITS = "0123456789".split("");
const PUNCTUATION = [
  ".",
  ",",
  "!",
  "?",
  ":",
  ";",
  "'",
  '"',
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  "-",
  "_",
  "+",
  "=",
  "/",
  "\\",
  "@",
  "#",
  "$",
  "%",
  "&",
];

const GLYPHS = [...UPPER, ...LOWER, ...DIGITS, ...PUNCTUATION];

function createDefaultGlyphs(): Record<string, GlyphData> {
  return GLYPHS.reduce((acc, char) => {
    acc[char] = {
      svg: null,
      scale: 1,
      rotate: 0,
      x: 0,
      y: 0,
      advance: 600,
    };
    return acc;
  }, {} as Record<string, GlyphData>);
}

function extractPathData(svg: string): string[] {
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

function buildPathFromData(ds: string[]) {
  const base = new opentype.Path();
  ds.forEach(d => {
    const p = opentype.Path.fromSVG(d);
    p.commands.forEach(cmd => base.commands.push({ ...cmd } as any));
  });
  return base;
}

function transformPath(
  path: opentype.Path,
  glyph: GlyphData,
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

function glyphToOpenType(
  char: string,
  glyph: GlyphData,
  style: "Regular" | "Bold" | "Italic" | "BoldItalic"
) {
  if (!glyph.svg) return null;
  const ds = extractPathData(glyph.svg);
  const basePath = buildPathFromData(ds);
  const transformed = transformPath(basePath, glyph, style);
  const advanceWidth = glyph.advance * (style.includes("Bold") ? 1.08 : 1);

  return new opentype.Glyph({
    name: char,
    unicode: char.codePointAt(0)!,
    advanceWidth,
    path: transformed,
  });
}

function kerningKey(left: string, right: string) {
  return `${left}_${right}`;
}

export default function FontMaker() {
  // Load from localStorage or use defaults
  const loadState = () => {
    try {
      const saved = localStorage.getItem('fontMakerState');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          glyphs: parsed.glyphs || createDefaultGlyphs(),
          metadata: parsed.metadata,
          kerningPairs: parsed.kerningPairs || {},
        };
      }
    } catch (e) {
      console.error('Failed to load state:', e);
    }
    return null;
  };

  const initialState = loadState();
  
  const [glyphs, setGlyphs] = useState<Record<string, GlyphData>>(
    initialState?.glyphs || createDefaultGlyphs()
  );
  const [selectedGlyph, setSelectedGlyph] = useState<string>(GLYPHS[0]);
  const [previewText, setPreviewText] = useState<string>("Font Maker Live Preview");
  const [baseline, setBaseline] = useState(320);
  const [capHeight, setCapHeight] = useState(180);
  const [descender, setDescender] = useState(420);
  const [kerningPairs, setKerningPairs] = useState<Record<string, number>>(
    initialState?.kerningPairs || {}
  );
  const [kerningLeft, setKerningLeft] = useState<string>("A");
  const [kerningRight, setKerningRight] = useState<string>("V");
  const [kerningValue, setKerningValue] = useState<number>(0);
  const [metadata, setMetadata] = useState<FontMetadata>(
    initialState?.metadata || {
      fontName: "MyFont",
      styleName: "Regular",
      unitsPerEm: 1000,
      ascender: 800,
      descender: -200,
      padding: 50,
    }
  );
  const [status, setStatus] = useState<string>("");

  const activeGlyph = glyphs[selectedGlyph];

  // Auto-save to localStorage whenever glyphs, metadata, or kerning changes
  useEffect(() => {
    try {
      localStorage.setItem('fontMakerState', JSON.stringify({
        glyphs,
        metadata,
        kerningPairs,
      }));
    } catch (e) {
      console.error('Failed to save state:', e);
    }
  }, [glyphs, metadata, kerningPairs]);

  useEffect(() => {
    setStatus("");
  }, [selectedGlyph]);

  const kerningValueForPreview = (left: string, right: string) => {
    return kerningPairs[kerningKey(left, right)] || 0;
  };

  function updateGlyph(patch: Partial<GlyphData>) {
    setGlyphs(prev => ({
      ...prev,
      [selectedGlyph]: {
        ...prev[selectedGlyph],
        ...patch,
      },
    }));
  }

  function handleSVGUpload(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      updateGlyph({ svg: content });
    };
    reader.readAsText(file);
  }

  async function handlePNGUpload(file: File) {
    setStatus("Tracing PNG to SVG...");
    const svg = await tracePNGtoSVG(file);
    updateGlyph({ svg });
    setStatus("Trace complete and applied to glyph.");
  }

  function setKerningPair() {
    const key = kerningKey(kerningLeft, kerningRight);
    setKerningPairs(prev => ({
      ...prev,
      [key]: kerningValue,
    }));
  }

  function exportFont(style: "Regular" | "Bold" | "Italic" | "BoldItalic") {
    const font = new opentype.Font({
      familyName: metadata.fontName,
      styleName: style,
      unitsPerEm: metadata.unitsPerEm,
      ascender: metadata.ascender,
      descender: metadata.descender,
    });

    GLYPHS.forEach(char => {
      const glyph = glyphToOpenType(char, glyphs[char], style);
      if (glyph) {
        font.addGlyph(glyph);
      }
    });

    Object.entries(kerningPairs).forEach(([key, value]) => {
      const [l, r] = key.split("_");
      if (l && r) {
        font.kerningPairs[`${l}${r}`] = value;
      }
    });

    const fileName = `${metadata.fontName}-${style}.otf`;
    font.download(fileName);
    setStatus(`Exported ${fileName}`);
  }

  const previewGlyphElements = useMemo(() => {
    const nodes: React.ReactNode[] = [];
    let last = "";
    previewText.split("").forEach((char, idx) => {
      const glyph = glyphs[char];
      const kern = idx > 0 ? kerningValueForPreview(last, char) : 0;
      last = char;
      const advance = glyph?.advance ?? 500;
      // Scale down the advance for preview (divide by 5 for better visibility)
      const spacing = Math.max(advance / 5, 20);

      if (glyph?.svg) {
        nodes.push(
          <span
            key={`${char}-${idx}`}
            style={{
              display: "inline-block",
              width: spacing,
              marginLeft: idx > 0 ? kern / 5 : 0,
              position: "relative",
              color: "#fff",
              height: 120,
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                transform: `translate(${glyph.x / 5}px, ${glyph.y / 5}px) scale(${glyph.scale}) rotate(${glyph.rotate}deg)`,
                transformOrigin: "center bottom",
              }}
            >
              <div
                style={{ width: "100%", height: "100%", color: "#fff" }}
                dangerouslySetInnerHTML={{ __html: glyph.svg.replace(/<svg/, '<svg preserveAspectRatio="xMidYMid meet" style="width: 100%; height: 100%;"') }}
              />
            </div>
          </span>
        );
      } else {
        nodes.push(
          <span
            key={`${char}-${idx}`}
            style={{
              display: "inline-block",
              width: spacing,
              marginLeft: idx > 0 ? kern : 0,
              color: "#888",
              fontSize: 22,
              textAlign: "center",
            }}
          >
            {char}
          </span>
        );
      }
    });
    return nodes;
  }, [glyphs, previewText, kerningPairs]);

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        width: "100%",
        background: "#0b0b0f",
        color: "#eaeaea",
        overflow: "hidden",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          width: 420,
          minWidth: 420,
          maxWidth: 420,
          height: "100vh",
          overflowY: "auto",
          padding: 16,
          boxSizing: "border-box",
          background: "#11131a",
          borderRight: "1px solid #1f2330",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Font Controls</h2>
        <div style={{ marginBottom: 8, fontWeight: 700 }}>
          Selected Glyph: {selectedGlyph}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(8, 1fr)",
            gap: 6,
            marginBottom: 12,
          }}
        >
          {GLYPHS.map(char => (
            <button
              key={char}
              onClick={() => setSelectedGlyph(char)}
              style={{
                padding: "6px 0",
                background: selectedGlyph === char ? "#2563eb" : "#1b1f2a",
                color: "white",
                border: "1px solid #1f2d3d",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              {char}
            </button>
          ))}
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Upload SVG</div>
          <input
            type="file"
            accept=".svg"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleSVGUpload(file);
            }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Upload PNG (auto-trace)</div>
          <input
            type="file"
            accept="image/png"
            onChange={async e => {
              const file = e.target.files?.[0];
              if (file) {
                await handlePNGUpload(file);
              }
            }}
          />
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={{ display: "block" }}>X Position ({activeGlyph.x}px)</label>
          <input
            type="range"
            min={-200}
            max={200}
            value={activeGlyph.x}
            onChange={e => updateGlyph({ x: parseInt(e.target.value, 10) })}
          />
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={{ display: "block" }}>Y Position ({activeGlyph.y}px)</label>
          <input
            type="range"
            min={-200}
            max={200}
            value={activeGlyph.y}
            onChange={e => updateGlyph({ y: parseInt(e.target.value, 10) })}
          />
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={{ display: "block" }}>Scale ({activeGlyph.scale.toFixed(2)}x)</label>
          <input
            type="range"
            min={0.1}
            max={3}
            step={0.01}
            value={activeGlyph.scale}
            onChange={e => updateGlyph({ scale: parseFloat(e.target.value) })}
          />
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={{ display: "block" }}>Rotate ({activeGlyph.rotate}°)</label>
          <input
            type="range"
            min={-180}
            max={180}
            value={activeGlyph.rotate}
            onChange={e => updateGlyph({ rotate: parseInt(e.target.value, 10) })}
          />
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={{ display: "block" }}>Advance Width ({activeGlyph.advance}px)</label>
          <input
            type="range"
            min={100}
            max={1200}
            value={activeGlyph.advance}
            onChange={e => updateGlyph({ advance: parseInt(e.target.value, 10) })}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700 }}>Preview Text</div>
          <input
            value={previewText}
            onChange={e => setPreviewText(e.target.value)}
            style={{ width: "100%", marginTop: 4, padding: 6 }}
          />
        </div>

        <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid #1f2330" }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Kerning</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <select value={kerningLeft} onChange={e => setKerningLeft(e.target.value)}>
              {GLYPHS.map(c => (
                <option key={`kl-${c}`} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <span style={{ color: "#888" }}>with</span>
            <select value={kerningRight} onChange={e => setKerningRight(e.target.value)}>
              {GLYPHS.map(c => (
                <option key={`kr-${c}`} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <input
              type="range"
              min={-200}
              max={200}
              value={kerningValue}
              onChange={e => setKerningValue(parseInt(e.target.value, 10))}
            />
            <span style={{ marginLeft: 8 }}>{kerningValue} px</span>
          </div>
          <button
            onClick={setKerningPair}
            style={{ marginTop: 8, padding: "6px 10px", cursor: "pointer" }}
          >
            Apply Kerning Pair
          </button>
        </div>

        <GuideControls
          baseline={baseline}
          capHeight={capHeight}
          descender={descender}
          setBaseline={setBaseline}
          setCapHeight={setCapHeight}
          setDescender={setDescender}
        />

        <FontMetadataForm onChange={setMetadata} />

        <div style={{ marginTop: 16, borderTop: "1px solid #1f2330", paddingTop: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Export</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
            <button onClick={() => exportFont("Regular")} style={{ padding: 8 }}>
              Export Regular
            </button>
            <button onClick={() => exportFont("Bold")} style={{ padding: 8 }}>
              Export Bold
            </button>
            <button onClick={() => exportFont("Italic")} style={{ padding: 8 }}>
              Export Italic
            </button>
            <button onClick={() => exportFont("BoldItalic")} style={{ padding: 8 }}>
              Export BoldItalic
            </button>
          </div>
        </div>

        {status && <div style={{ marginTop: 12, color: "#7dd3fc" }}>{status}</div>}
      </div>

      <div
        style={{
          flex: 1,
          minWidth: 0,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            flex: "1 1 auto",
            position: "relative",
            margin: 16,
            borderRadius: 8,
            background: "#0f172a",
            overflow: "hidden",
            border: "1px solid #1f2937",
          }}
        >
          <GuideOverlay baseline={baseline} capHeight={capHeight} descender={descender} />
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            {activeGlyph.svg ? (
              <>
                <div
                  style={{
                    maxWidth: "80%",
                    maxHeight: "80%",
                    overflow: "visible",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      transform: `translate(${activeGlyph.x}px, ${activeGlyph.y}px) scale(${activeGlyph.scale}) rotate(${activeGlyph.rotate}deg)`,
                      transformOrigin: "center center",
                      lineHeight: 0,
                      width: "500px",
                      height: "500px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <div
                      style={{ 
                        color: "white", 
                        display: "inline-block",
                        width: "100%",
                        height: "100%",
                      }}
                      dangerouslySetInnerHTML={{ __html: activeGlyph.svg.replace(/<svg/, '<svg style="width: 100%; height: 100%;"') }}
                    />
                  </div>
                </div>
                <div style={{ 
                  position: "absolute", 
                  top: 10, 
                  left: 10, 
                  background: "rgba(0,0,0,0.7)", 
                  padding: 8,
                  fontSize: 12,
                  color: "#0f0",
                  maxWidth: 200,
                  maxHeight: 100,
                  overflow: "auto",
                  wordBreak: "break-all"
                }}>
                  SVG Length: {activeGlyph.svg.length} chars
                  <br/>
                  Preview: {activeGlyph.svg.substring(0, 50)}...
                </div>
              </>
            ) : (
              <div style={{ color: "#475569", fontSize: 18 }}>Upload artwork to begin editing.</div>
            )}
          </div>
        </div>

        <div
          style={{
            flex: "0 0 220px",
            background: "#111827",
            color: "white",
            margin: "0 16px 16px 16px",
            borderRadius: 8,
            padding: 12,
            border: "1px solid #1f2937",
            overflow: "hidden",
          }}
        >
          <div style={{ marginBottom: 8, fontWeight: 700 }}>Live Preview</div>
          <div
            style={{
              border: "1px solid #1f2937",
              borderRadius: 6,
              padding: 10,
              minHeight: 120,
              overflow: "auto",
              background: "#0b1220",
              whiteSpace: "nowrap",
            }}
          >
            {previewGlyphElements}
          </div>
        </div>
      </div>
    </div>
  );
}
