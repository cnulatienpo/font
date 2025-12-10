import React, { useMemo } from "react";

export type GlyphDataLike = {
  svg: string | null;
  scale: number;
  rotate: number;
  x: number;
  y: number;
  advance: number;
  leftBearing: number;
  rightBearing: number;
};

type Props = {
  previewText: string;
  glyphs: Record<string, GlyphDataLike>;
  kerningPairs: Record<string, number>;
  showDebug: boolean;
  previewMode: "typeset" | "monospace" | "grid" | "bounding";
  letterSpacingMultiplier: number;
  tracking: number;
};

const PREVIEW_SCALE = 0.2;
const GRID_SIZE = 20;

function kerningKey(left: string, right: string) {
  return `${left}_${right}`;
}

type LayoutEntry = {
  id: string;
  char: string;
  advance: number;
  left: number;
  right: number;
  width: number;
  start: number;
  collision: boolean;
  svg: string | null;
  glyph: GlyphDataLike;
};

export default function SpacingDebugger({
  previewText,
  glyphs,
  kerningPairs,
  showDebug,
  previewMode,
  letterSpacingMultiplier,
  tracking,
}: Props) {
  const entries = useMemo(() => {
    const layout: LayoutEntry[] = [];
    let cursor = 0;
    let prevEnd = 0;
    let last = "";
    const advances = Object.values(glyphs).map(g => g.advance || 0);
    const uniformAdvance = advances.length > 0 ? Math.max(...advances) : 600;

    previewText.split("").forEach((char, idx) => {
      const glyph = glyphs[char];
      const kern = idx > 0 ? kerningPairs[kerningKey(last, char)] || 0 : 0;
      last = char;
      cursor += kern;
      const baseAdvance = glyph ? glyph.advance : 600;
      const baseLeft = glyph ? glyph.leftBearing : 80;
      const baseRight = glyph ? glyph.rightBearing : 80;
      const rawWidth = Math.max(baseAdvance - baseLeft - baseRight, 120);
      const usedAdvance = previewMode === "monospace" ? uniformAdvance : baseAdvance;
      const ratio = usedAdvance / Math.max(baseAdvance, 1);
      const advance = usedAdvance * letterSpacingMultiplier + tracking;
      const left = baseLeft * ratio * letterSpacingMultiplier;
      const right = baseRight * ratio * letterSpacingMultiplier;
      const width = rawWidth * ratio * letterSpacingMultiplier;

      let start = cursor;
      if (previewMode === "grid") {
        start = Math.round(start / GRID_SIZE) * GRID_SIZE;
      }

      const glyphStart = start + left;
      const collision = glyphStart < prevEnd;
      const endOfBox = glyphStart + width;
      prevEnd = Math.max(prevEnd, endOfBox);
      const finalAdvance = previewMode === "grid" ? Math.round(advance / GRID_SIZE) * GRID_SIZE : advance;
      layout.push({
        id: `${char}-${idx}`,
        char,
        advance: finalAdvance,
        left,
        right,
        width,
        start,
        collision,
        svg: glyph?.svg || null,
        glyph: glyph || {
          svg: null,
          scale: 1,
          rotate: 0,
          x: 0,
          y: 0,
          advance: usedAdvance,
          leftBearing: baseLeft,
          rightBearing: baseRight,
        },
      });
      cursor = start + finalAdvance;
    });

    return layout;
  }, [previewText, glyphs, kerningPairs, previewMode, letterSpacingMultiplier, tracking]);

  const totalWidth = entries.reduce((acc, e) => Math.max(acc, e.start + e.advance), 0) * PREVIEW_SCALE + 40;

  return (
    <div
      style={{
        position: "relative",
        minHeight: 160,
        overflow: "auto",
        background: "#0b1220",
        border: "1px solid #1f2937",
        borderRadius: 6,
        padding: 10,
      }}
    >
      <div style={{ position: "relative", height: 160, width: totalWidth }}>
        {entries.map(entry => {
          const debugActive = showDebug || previewMode === "bounding";
          return (
            <div
              key={entry.id}
              style={{
                position: "absolute",
                left: entry.start * PREVIEW_SCALE,
                bottom: 10,
                width: entry.advance * PREVIEW_SCALE,
                height: 140,
                boxSizing: "border-box",
              }}
            >
              {debugActive && (
                <>
                  <div
                    style={{
                      position: "absolute",
                      left: entry.left * PREVIEW_SCALE,
                      top: 0,
                      bottom: 0,
                      width: 2,
                      background: "rgba(59,130,246,0.8)",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: entry.advance * PREVIEW_SCALE - 2,
                      top: 0,
                      bottom: 0,
                      width: 2,
                      background: "rgba(234,179,8,0.8)",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: entry.left * PREVIEW_SCALE,
                      width: entry.width * PREVIEW_SCALE,
                      bottom: 0,
                      top: 0,
                      border: "1px solid rgba(255,255,255,0.7)",
                      boxSizing: "border-box",
                      background: entry.collision ? "rgba(239,68,68,0.35)" : "transparent",
                    }}
                  />
                </>
              )}
              {entry.svg ? (
                <div
                  style={{
                    position: "absolute",
                    left: entry.left * PREVIEW_SCALE,
                    bottom: 0,
                    width: entry.width * PREVIEW_SCALE,
                    height: 130,
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "center",
                    transform: `translate(${entry.glyph.x * PREVIEW_SCALE}px, ${entry.glyph.y * PREVIEW_SCALE}px) scale(${entry.glyph.scale}) rotate(${entry.glyph.rotate}deg)`,
                    transformOrigin: "center bottom",
                    pointerEvents: "none",
                  }}
                  dangerouslySetInnerHTML={{
                    __html: entry.svg.replace(
                      /<svg/,
                      '<svg preserveAspectRatio="xMidYMid meet" style="width: 100%; height: 100%;"'
                    ),
                  }}
                />
              ) : (
                <div
                  style={{
                    position: "absolute",
                    left: entry.left * PREVIEW_SCALE,
                    bottom: 0,
                    width: entry.width * PREVIEW_SCALE,
                    height: 130,
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "center",
                    color: "#94a3b8",
                    fontSize: 28,
                  }}
                >
                  {entry.char}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
