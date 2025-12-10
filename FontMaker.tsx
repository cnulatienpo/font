import React, { useEffect, useMemo, useState } from "react";
import GuideControls, { GuideSet } from "./GuideControls";
import GuideOverlay from "./GuideOverlay";
import FontMetadataForm from "./FontMetadataForm";
import { tracePNGtoSVG } from "./GlyphAutoTrace";
import opentype from "opentype.js";
import SpacingDebugger from "./SpacingDebugger";
import FontSpacingTools from "./FontSpacingTools";
import {
  buildPathFromData,
  computeBoundingBox,
  extractPathData,
  transformPath,
} from "./GlyphMetrics";

export type GlyphData = {
  svg: string | null;
  scale: number;
  rotate: number;
  x: number;
  y: number;
  advance: number;
  leftBearing: number;
  rightBearing: number;
  lockCapHeight?: boolean;
  lockXHeight?: boolean;
  normalizeCenter?: boolean;
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

const DEFAULT_GUIDES: GuideSet = {
  baseline: 820,
  capHeight: 260,
  xHeight: 440,
  ascender: 180,
  descender: 1120,
  meanline: 520,
  centerline: 600,
  emTop: 120,
  emBottom: 1220,
};

function createDefaultGlyphs(): Record<string, GlyphData> {
  return GLYPHS.reduce((acc, char) => {
    acc[char] = {
      svg: null,
      scale: 1,
      rotate: 0,
      x: 0,
      y: 0,
      advance: 600,
      leftBearing: 100,
      rightBearing: 100,
    };
    return acc;
  }, {} as Record<string, GlyphData>);
}

function kerningKey(left: string, right: string) {
  return `${left}_${right}`;
}

export default function FontMaker() {
  const loadState = () => {
    try {
      const saved = localStorage.getItem("fontMakerState");
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          glyphs: parsed.glyphs || createDefaultGlyphs(),
          metadata: parsed.metadata,
          kerningPairs: parsed.kerningPairs || {},
          guides: parsed.guides || DEFAULT_GUIDES,
          letterSpacing: parsed.letterSpacing || 1,
          tracking: parsed.tracking || 0,
        };
      }
    } catch (e) {
      console.error("Failed to load state:", e);
    }
    return null;
  };

  const initialState = loadState();

  const [glyphs, setGlyphs] = useState<Record<string, GlyphData>>(
    initialState?.glyphs || createDefaultGlyphs()
  );
  const [selectedGlyph, setSelectedGlyph] = useState<string>(GLYPHS[0]);
  const [previewText, setPreviewText] = useState<string>("Font Maker Live Preview");
  const [guides, setGuides] = useState<GuideSet>(initialState?.guides || DEFAULT_GUIDES);
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
      unitsPerEm: guides.emBottom - guides.emTop,
      ascender: guides.baseline - guides.emTop,
      descender: guides.emBottom - guides.baseline,
      padding: 50,
    }
  );
  const [status, setStatus] = useState<string>("");
  const [showSpacingDebug, setShowSpacingDebug] = useState<boolean>(false);
  const [previewMode, setPreviewMode] = useState<
    "typeset" | "monospace" | "grid" | "bounding"
  >("typeset");
  const [letterSpacing, setLetterSpacing] = useState<number>(initialState?.letterSpacing || 1);
  const [tracking, setTracking] = useState<number>(initialState?.tracking || 0);

  const activeGlyph = glyphs[selectedGlyph];

  useEffect(() => {
    try {
      localStorage.setItem(
        "fontMakerState",
        JSON.stringify({
          glyphs,
          metadata,
          kerningPairs,
          guides,
          letterSpacing,
          tracking,
        })
      );
    } catch (e) {
      console.error("Failed to save state:", e);
    }
  }, [glyphs, metadata, kerningPairs, guides, letterSpacing, tracking]);

  useEffect(() => {
    setStatus("");
  }, [selectedGlyph]);

  useEffect(() => {
    const unitsPerEm = guides.emBottom - guides.emTop;
    const ascender = guides.baseline - guides.emTop;
    const descender = guides.emBottom - guides.baseline;
    setMetadata(prev => ({
      ...prev,
      unitsPerEm,
      ascender,
      descender,
    }));
  }, [guides]);

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

  function glyphToOpenType(
    char: string,
    glyph: GlyphData,
    style: "Regular" | "Bold" | "Italic" | "BoldItalic"
  ) {
    if (!glyph.svg) return null;
    const ds = extractPathData(glyph.svg);
    const basePath = buildPathFromData(ds);
    const transformed = transformPath(basePath, glyph, style);
    const bbox = transformed.getBoundingBox();
    const glyphWidth = Math.max(bbox.x2 - bbox.x1, glyph.advance - glyph.leftBearing - glyph.rightBearing);
    const advanceWidth = glyph.leftBearing + glyphWidth + glyph.rightBearing;
    const advanceAdjusted = advanceWidth * (style.includes("Bold") ? 1.08 : 1);

    return new opentype.Glyph({
      name: char,
      unicode: char.codePointAt(0)!,
      advanceWidth: advanceAdjusted,
      leftSideBearing: glyph.leftBearing,
      xMin: bbox.x1,
      xMax: bbox.x2,
      yMin: bbox.y1,
      yMax: bbox.y2,
      path: transformed,
    });
  }

  function applyLock(type: "cap" | "xHeight" | "center") {
    const glyph = glyphs[selectedGlyph];
    if (!glyph?.svg) return;
    const bbox = computeBoundingBox(glyph.svg, glyph);
    if (!bbox) return;
    if (type === "cap") {
      const targetHeight = guides.baseline - guides.capHeight;
      const newScale = Math.max(0.01, (glyph.scale * targetHeight) / Math.max(bbox.height, 1));
      const newY = guides.baseline - bbox.height;
      updateGlyph({ scale: newScale, y: newY, lockCapHeight: true });
    }
    if (type === "xHeight") {
      const targetHeight = guides.baseline - guides.xHeight;
      const newScale = Math.max(0.01, (glyph.scale * targetHeight) / Math.max(bbox.height, 1));
      const newY = guides.baseline - bbox.height;
      updateGlyph({ scale: newScale, y: newY, lockXHeight: true });
    }
    if (type === "center") {
      const center = (bbox.xMin + bbox.xMax) / 2;
      updateGlyph({ x: glyph.x - center, normalizeCenter: true });
    }
  }

  function exportFont(style: "Regular" | "Bold" | "Italic" | "BoldItalic") {
    const font = new opentype.Font({
      familyName: metadata.fontName,
      styleName: style,
      unitsPerEm: metadata.unitsPerEm,
      ascender: metadata.ascender,
      descender: -Math.abs(metadata.descender),
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
    return (
      <SpacingDebugger
        previewText={previewText}
        glyphs={glyphs}
        kerningPairs={kerningPairs}
        showDebug={showSpacingDebug}
        previewMode={previewMode}
        letterSpacingMultiplier={1}
        tracking={0}
      />
    );
  }, [glyphs, previewText, kerningPairs, showSpacingDebug, previewMode]);

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
            max={1600}
            value={activeGlyph.advance}
            onChange={e => updateGlyph({ advance: parseInt(e.target.value, 10) })}
          />
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={{ display: "block" }}>Left Bearing ({activeGlyph.leftBearing.toFixed(0)}px)</label>
          <input
            type="range"
            min={0}
            max={800}
            value={activeGlyph.leftBearing}
            onChange={e => updateGlyph({ leftBearing: parseInt(e.target.value, 10) })}
          />
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={{ display: "block" }}>Right Bearing ({activeGlyph.rightBearing.toFixed(0)}px)</label>
          <input
            type="range"
            min={0}
            max={800}
            value={activeGlyph.rightBearing}
            onChange={e => updateGlyph({ rightBearing: parseInt(e.target.value, 10) })}
          />
        </div>

        <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          <label>
            <input
              type="checkbox"
              checked={!!activeGlyph.lockCapHeight}
              onChange={() => applyLock("cap")}
            />
            <span style={{ marginLeft: 6 }}>Lock cap height to guide</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={!!activeGlyph.lockXHeight}
              onChange={() => applyLock("xHeight")}
            />
            <span style={{ marginLeft: 6 }}>Lock x-height to guide</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={!!activeGlyph.normalizeCenter}
              onChange={() => applyLock("center")}
            />
            <span style={{ marginLeft: 6 }}>Normalize optical center</span>
          </label>
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
            <span>with</span>
            <select value={kerningRight} onChange={e => setKerningRight(e.target.value)}>
              {GLYPHS.map(c => (
                <option key={`kr-${c}`} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="range"
              min={-200}
              max={200}
              value={kerningValue}
              onChange={e => setKerningValue(parseInt(e.target.value, 10))}
            />
            <span style={{ marginLeft: 8 }}>{kerningValue} px</span>
          </div>
          <button style={{ marginTop: 6 }} onClick={setKerningPair}>
            Set Kerning Pair
          </button>
        </div>

        <GuideControls guides={guides} onChange={patch => setGuides(prev => ({ ...prev, ...patch }))} />

        <FontSpacingTools
          glyphs={glyphs}
          setGlyphs={setGlyphs}
          letterSpacing={letterSpacing}
          setLetterSpacing={setLetterSpacing}
          tracking={tracking}
          setTracking={setTracking}
        />

        <FontMetadataForm onChange={setMetadata} />
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Export</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(["Regular", "Bold", "Italic", "BoldItalic"] as const).map(style => (
              <button key={style} onClick={() => exportFont(style)} style={{ padding: 8 }}>
                Export {style}
              </button>
            ))}
          </div>
          <div style={{ color: "#38bdf8", fontSize: 12, marginTop: 6 }}>{status}</div>
        </div>
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
          <GuideOverlay
            baseline={guides.baseline}
            capHeight={guides.capHeight}
            xHeight={guides.xHeight}
            ascender={guides.ascender}
            descender={guides.descender}
            meanline={guides.meanline}
            centerline={guides.centerline}
            emTop={guides.emTop}
            emBottom={guides.emBottom}
          />
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
                      dangerouslySetInnerHTML={{
                        __html: activeGlyph.svg.replace(/<svg/, '<svg style="width: 100%; height: 100%;"'),
                      }}
                    />
                  </div>
                </div>
                <div
                  style={{
                    position: "absolute",
                    top: 10,
                    left: 10,
                    background: "rgba(0,0,0,0.7)",
                    padding: 8,
                    fontSize: 12,
                    color: "#0f0",
                    maxWidth: 200,
                    maxHeight: 140,
                    overflow: "auto",
                    wordBreak: "break-all",
                  }}
                >
                  SVG Length: {activeGlyph.svg.length} chars
                  <br />
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
            flex: "0 0 260px",
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
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="checkbox"
                checked={showSpacingDebug}
                onChange={e => setShowSpacingDebug(e.target.checked)}
              />
              Show Spacing Debug
            </label>
            <select value={previewMode} onChange={e => setPreviewMode(e.target.value as any)}>
              <option value="typeset">Typeset mode</option>
              <option value="monospace">Monospace enforcement</option>
              <option value="grid">Grid-aligned mode</option>
              <option value="bounding">Bounding box mode</option>
            </select>
          </div>
          {previewGlyphElements}
        </div>
      </div>
    </div>
  );
}
