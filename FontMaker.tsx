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
  const [stagedFiles, setStagedFiles] = useState<Array<{file: File, preview: string, assigned?: string}>>([]);
  const [draggedFile, setDraggedFile] = useState<{file: File, preview: string} | null>(null);

  const activeGlyph = glyphs[selectedGlyph];

  useEffect(() => {
    try {
      // Only save metadata and kerning, not the large SVG data
      localStorage.setItem(
        "fontMakerState",
        JSON.stringify({
          metadata,
          kerningPairs,
          guides,
          letterSpacing,
          tracking,
        })
      );
    } catch (e) {
      // Silent fail - localStorage quota exceeded
      console.warn("Could not save to localStorage:", e.message);
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

  async function handleOTFImport(file: File) {
    try {
      setStatus("Loading font file...");
      const buffer = await file.arrayBuffer();
      
      console.log('Parsing font buffer, size:', buffer.byteLength);
      const font = opentype.parse(buffer);
      console.log('Font parsed:', font);
      
      const importedGlyphs: Record<string, GlyphData> = {};
      let count = 0;
      
      // Extract glyphs for each character
      GLYPHS.forEach(char => {
        try {
          const glyphIndex = font.charToGlyphIndex(char);
          const glyph = font.glyphs.get(glyphIndex);
          
          console.log(`Character '${char}': glyphIndex=${glyphIndex}, hasGlyph=${!!glyph}, hasPath=${!!glyph?.path}`);
          
          if (glyph && glyph.path) {
            // Convert opentype path to SVG
            const pathData = glyph.path.toPathData();
            console.log(`  pathData length: ${pathData?.length || 0}`);
            
            if (!pathData || pathData.trim().length === 0) {
              console.warn(`  Empty path data for '${char}'`);
              return;
            }
            
            // Font coordinates are Y-up, SVG is Y-down, so we need to flip
            // Get the font's unitsPerEm to know the coordinate system height
            const unitsPerEm = font.unitsPerEm || 1000;
            
            const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000" style="width: 100%; height: 100%;">
<g transform="scale(1, -1) translate(0, -${unitsPerEm})">
<path fill="#ffffff" d="${pathData}" />
</g>
</svg>`;
            
            importedGlyphs[char] = {
              svg: svg,
              scale: 1,
              rotate: 0,
              x: 0,
              y: 0,
              advance: glyph.advanceWidth || 600,
              leftBearing: 100,
              rightBearing: 100,
            };
            count++;
            console.log(`  ✓ Imported '${char}'`);
          }
        } catch (charError: any) {
          console.warn(`Failed to import glyph for '${char}':`, charError.message);
        }
      });
      
      console.log('Total imported glyphs:', count);
      console.log('Imported glyph keys:', Object.keys(importedGlyphs));
      
      setGlyphs(prev => {
        const updated = { ...prev, ...importedGlyphs };
        console.log('Updated glyphs state, total keys:', Object.keys(updated).length);
        return updated;
      });
      setStatus(`Imported ${count} glyphs from font!`);
      
      // Also import metadata if available
      if (font.names && font.names.fontFamily) {
        setMetadata(prev => ({
          ...prev,
          fontName: font.names.fontFamily.en || prev.fontName,
        }));
      }
      
    } catch (error: any) {
      setStatus(`Import failed: ${error.message}`);
      console.error('Font import error:', error);
      alert(`Import failed: ${error.message}`);
    }
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
    
    // Extract path data and build the path
    const ds = extractPathData(glyph.svg);
    const basePath = buildPathFromData(ds);
    const transformed = transformPath(basePath, glyph, style);
    const advanceWidth = glyph.advance || 600;

    return new opentype.Glyph({
      name: char,
      unicode: char.codePointAt(0)!,
      advanceWidth: advanceWidth,
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
    console.log('exportFont called with style:', style);
    const glyphList: opentype.Glyph[] = [];
    
    // Create .notdef glyph (required)
    glyphList.push(new opentype.Glyph({
      name: '.notdef',
      unicode: 0,
      advanceWidth: 650,
      path: new opentype.Path()
    }));

    GLYPHS.forEach(char => {
      const glyph = glyphToOpenType(char, glyphs[char], style);
      if (glyph) {
        glyphList.push(glyph);
      }
    });

    const font = new opentype.Font({
      familyName: metadata.fontName,
      styleName: style,
      unitsPerEm: metadata.unitsPerEm,
      ascender: metadata.ascender,
      descender: -Math.abs(metadata.descender),
      glyphs: glyphList
    });

    // Note: Kerning pairs might not be supported in this version of opentype.js
    // Skip kerning for now to get export working
    // Object.entries(kerningPairs).forEach(([key, value]) => {
    //   const [l, r] = key.split("_");
    //   if (l && r && font.glyphs) {
    //     const leftGlyph = font.glyphs.get(font.charToGlyphIndex(l));
    //     const rightGlyph = font.glyphs.get(font.charToGlyphIndex(r));
    //     if (leftGlyph && rightGlyph) {
    //       // Add kerning if API supports it
    //     }
    //   }
    // });

    const fileName = `${metadata.fontName}-${style}.otf`;
    console.log('Attempting to download font:', fileName);
    try {
      // Manual download implementation
      const arrayBuffer = font.toArrayBuffer();
      const blob = new Blob([arrayBuffer], { type: 'font/otf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setStatus(`Exported ${fileName}`);
      console.log('Download triggered successfully');
    } catch (error) {
      console.error('Download failed:', error);
      setStatus(`Export failed: ${error.message}`);
    }
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
        
        <div style={{ marginBottom: "20px", padding: "15px", backgroundColor: "#1b1f2a", borderRadius: "4px", border: "1px solid #1f2d3d" }}>
          <label htmlFor="otf-import" style={{ marginRight: "10px", fontWeight: "bold", fontSize: "14px" }}>
            Import Font (OTF/TTF):
          </label>
          <input
            id="otf-import"
            type="file"
            accept=".otf,.ttf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleOTFImport(file);
            }}
            style={{
              padding: "5px",
              borderRadius: "4px",
              border: "1px solid #666",
              backgroundColor: "#2a2a2a",
              color: "#fff",
            }}
          />
        </div>
        
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

        <div style={{ marginBottom: 12, padding: 12, border: "2px dashed #1f2d3d", borderRadius: 4 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>📁 Stage PNGs for Drag & Drop</div>
          <input
            type="file"
            accept="image/png"
            multiple
            onChange={async e => {
              const files = Array.from(e.target.files || []);
              if (files.length === 0) return;
              
              const newStaged = await Promise.all(
                files.map(async file => {
                  const preview = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.readAsDataURL(file);
                  });
                  return { file, preview };
                })
              );
              
              setStagedFiles(prev => [...prev, ...newStaged]);
              setStatus(`Staged ${files.length} files. Drag them to character slots.`);
            }}
          />
          {stagedFiles.length > 0 && (
            <div style={{ 
              marginTop: 8, 
              display: "grid", 
              gridTemplateColumns: "repeat(auto-fill, 60px)", 
              gap: 6,
              maxHeight: 200,
              overflow: "auto",
              padding: 4,
              background: "#0a0e1a",
              borderRadius: 4
            }}>
              {stagedFiles.map((staged, idx) => (
                <div
                  key={idx}
                  draggable
                  onDragStart={() => setDraggedFile(staged)}
                  onDragEnd={() => setDraggedFile(null)}
                  style={{
                    width: 60,
                    height: 60,
                    border: staged.assigned ? "2px solid #22c55e" : "1px solid #1f2d3d",
                    borderRadius: 4,
                    cursor: "grab",
                    position: "relative",
                    background: "#0f172a"
                  }}
                >
                  <img src={staged.preview} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  {staged.assigned && (
                    <div style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      background: "#22c55e",
                      color: "white",
                      fontSize: 10,
                      textAlign: "center",
                      fontWeight: "bold"
                    }}>
                      {staged.assigned}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
            Drag thumbnails to character boxes below
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Character Slots</div>
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(auto-fill, 40px)", 
            gap: 4,
            maxHeight: 200,
            overflow: "auto",
            padding: 4,
            background: "#0a0e1a",
            borderRadius: 4
          }}>
            {GLYPHS.map(char => (
              <div
                key={char}
                onDragOver={(e) => e.preventDefault()}
                onDrop={async (e) => {
                  e.preventDefault();
                  if (draggedFile) {
                    setSelectedGlyph(char);
                    await handlePNGUpload(draggedFile.file);
                    setStagedFiles(prev => prev.map(f => 
                      f === draggedFile ? {...f, assigned: char} : f
                    ));
                    setStatus(`Assigned to "${char}"`);
                  }
                }}
                onClick={() => setSelectedGlyph(char)}
                style={{
                  width: 40,
                  height: 40,
                  border: selectedGlyph === char ? "2px solid #3b82f6" : glyphs[char].svg ? "1px solid #22c55e" : "1px solid #1f2d3d",
                  borderRadius: 4,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: glyphs[char].svg ? "#1f2d3d" : "#0f172a",
                  fontSize: 14,
                  color: glyphs[char].svg ? "#22c55e" : "#666"
                }}
              >
                {char}
              </div>
            ))}
          </div>
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

        <div style={{ marginBottom: 12, padding: 12, border: "2px dashed #1f2d3d", borderRadius: 4 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>📁 Bulk Upload PNGs</div>
          <input
            type="file"
            accept="image/png"
            multiple
            onChange={async e => {
              const files = Array.from(e.target.files || []);
              if (files.length === 0) return;
              
              setStatus(`Uploading ${files.length} files...`);
              
              for (let i = 0; i < files.length; i++) {
                const file = files[i];
                // Try to guess the character from filename
                // e.g., "A.png" -> "A", "letter-B.png" -> "B", "a.png" -> "a"
                const match = file.name.match(/[A-Za-z0-9!@#$%&*()\[\]{};:'",.<>?/\\|`~+=-]/);
                const guessedChar = match ? match[0] : null;
                
                if (guessedChar && GLYPHS.includes(guessedChar)) {
                  setSelectedGlyph(guessedChar);
                  setStatus(`Processing ${file.name} as "${guessedChar}" (${i + 1}/${files.length})...`);
                  await handlePNGUpload(file);
                } else {
                  setStatus(`Skipped ${file.name} - couldn't determine character (${i + 1}/${files.length})`);
                }
                
                // Small delay to avoid overwhelming the browser
                await new Promise(resolve => setTimeout(resolve, 100));
              }
              
              setStatus(`Completed! Uploaded ${files.length} glyphs.`);
            }}
          />
          <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
            Name files like: A.png, B.png, a.png, 1.png, etc.
          </div>
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

        <div style={{ marginTop: 16, borderTop: "1px solid #1f2330", paddingTop: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>🔧 Normalize All Glyphs</div>
          <button
            onClick={() => {
              try {
                setStatus('Normalizing all glyphs...');
                
                // Step 1: Calculate heights for all glyphs with SVGs
                const heights: number[] = [];
                Object.keys(glyphs).forEach(char => {
                  const g = glyphs[char];
                  if (g.svg) {
                    // Parse viewBox to get height
                    const match = g.svg.match(/viewBox="[\d\s.-]+\s+([\d.]+)"/);
                    if (match) {
                      heights.push(parseFloat(match[1]));
                    }
                  }
                });
                
                // Find median height
                heights.sort((a, b) => a - b);
                const medianHeight = heights[Math.floor(heights.length / 2)] || 1000;
                const targetHeight = 800; // Target uniform height
                
                setStatus(`Median height: ${medianHeight.toFixed(0)}px, normalizing to ${targetHeight}px`);
                
                // Step 2: Normalize each glyph
                const updated = { ...glyphs };
                Object.keys(updated).forEach(char => {
                  const g = updated[char];
                  if (g.svg) {
                    const match = g.svg.match(/viewBox="[\d\s.-]+\s+([\d.]+)"/);
                    if (match) {
                      const currentHeight = parseFloat(match[1]);
                      const scaleFactor = targetHeight / currentHeight;
                      
                      // Apply uniform scale
                      g.scale = scaleFactor;
                      
                      // Set advance width based on character type
                      const isUpper = /[A-Z]/.test(char);
                      const isLower = /[a-z]/.test(char);
                      const isDigit = /[0-9]/.test(char);
                      const isPunctuation = /[.,!?:;'"]/.test(char);
                      const isSpace = char === ' ';
                      const isWide = /[mwMW]/.test(char);
                      const isNarrow = /[ij!l|1.,':;]/.test(char);
                      
                      if (isSpace) {
                        g.advance = 300;
                      } else if (isWide) {
                        g.advance = 900;
                      } else if (isNarrow) {
                        g.advance = 350;
                      } else if (isUpper) {
                        g.advance = 700;
                      } else if (isLower) {
                        g.advance = 600;
                      } else if (isDigit) {
                        g.advance = 600;
                      } else if (isPunctuation) {
                        g.advance = 400;
                      } else {
                        g.advance = 600;
                      }
                      
                      // Don't modify positioning - keep existing x/y/rotation
                      // Just reset bearings
                      g.leftBearing = 50;
                      g.rightBearing = 50;
                    }
                  }
                });
                
                setGlyphs(updated);
                
                // Step 3: Add common kerning pairs
                const commonKerns: Record<string, number> = {};
                
                // Uppercase kerning
                ['AV', 'AW', 'AY', 'AT', 'AO', 'TA', 'TO', 'TY', 'VA', 'WA', 'YA', 'Yo'].forEach(pair => {
                  commonKerns[pair[0] + '_' + pair[1]] = -80;
                });
                
                // Lowercase kerning
                ['av', 'aw', 'ay', 'we', 'wo', 'ya', 'yo'].forEach(pair => {
                  commonKerns[pair[0] + '_' + pair[1]] = -50;
                });
                
                // Punctuation
                ['.A', '.T', '.V', '.W', '.Y', ',A', ',T', ',V', ',W', ',Y'].forEach(pair => {
                  commonKerns[pair[0] + '_' + pair[1]] = -60;
                });
                
                setKerningPairs(prev => ({ ...prev, ...commonKerns }));
                setStatus(`✓ Normalized ${Object.keys(updated).filter(k => updated[k].svg).length} glyphs and added ${Object.keys(commonKerns).length} kerning pairs!`);
              } catch (error: any) {
                setStatus(`Normalization error: ${error.message}`);
                console.error('Normalization error:', error);
              }
            }}
            style={{
              padding: "10px 20px",
              backgroundColor: "#16a34a",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: "bold",
              width: "100%",
              marginBottom: "10px"
            }}
          >
            ✨ Normalize All Glyphs
          </button>
          
          <div style={{ fontWeight: 700, marginBottom: 6, marginTop: 16 }}>Custom Script</div>
          <textarea
            id="customScript"
            placeholder="// JavaScript code - access glyphs, metadata, setGlyphs, etc.
// Example:
// Object.keys(glyphs).forEach(char => {
//   if (glyphs[char].svg) {
//     glyphs[char].scale = 1.5;
//   }
// });
// setGlyphs({...glyphs});"
            style={{
              width: "100%",
              height: 120,
              fontFamily: "monospace",
              fontSize: 11,
              padding: 8,
              background: "#0a0e1a",
              color: "#e0e0e0",
              border: "1px solid #1f2d3d",
              borderRadius: 4,
              resize: "vertical"
            }}
          />
          <button
            onClick={() => {
              try {
                const code = (document.getElementById('customScript') as HTMLTextAreaElement).value;
                // Create function with access to state
                const fn = new Function('glyphs', 'setGlyphs', 'metadata', 'setMetadata', 'kerningPairs', 'setKerningPairs', 'GLYPHS', 'setStatus', code);
                fn(glyphs, setGlyphs, metadata, setMetadata, kerningPairs, setKerningPairs, GLYPHS, setStatus);
                setStatus('Script executed successfully!');
              } catch (error: any) {
                setStatus(`Script error: ${error.message}`);
                console.error('Script execution error:', error);
              }
            }}
            style={{ padding: 8, width: "100%", marginTop: 6 }}
          >
            Run Script
          </button>
          <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
            Available: glyphs, setGlyphs, metadata, setMetadata, kerningPairs, setKerningPairs, GLYPHS, setStatus
          </div>
        </div>

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
