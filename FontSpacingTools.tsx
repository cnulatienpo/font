import React from "react";
import { GlyphDataLike } from "./SpacingDebugger";

type Props = {
  glyphs: Record<string, GlyphDataLike>;
  setGlyphs: React.Dispatch<React.SetStateAction<Record<string, GlyphDataLike>>>;
  letterSpacing: number;
  setLetterSpacing: (v: number) => void;
  tracking: number;
  setTracking: (v: number) => void;
};

export default function FontSpacingTools({
  glyphs,
  setGlyphs,
  letterSpacing,
  setLetterSpacing,
  tracking,
  setTracking,
}: Props) {

  const applyLetterSpacing = (value: number) => {
    const ratio = value / letterSpacing;
    setLetterSpacing(value);
    setGlyphs(prev => {
      const next: Record<string, GlyphDataLike> = {};
      Object.entries(prev).forEach(([key, g]) => {
        next[key] = {
          ...g,
          advance: g.advance * ratio,
          leftBearing: g.leftBearing * ratio,
          rightBearing: g.rightBearing * ratio,
        };
      });
      return next;
    });
  };

  const applyTracking = (value: number) => {
    const delta = value - tracking;
    setTracking(value);
    setGlyphs(prev => {
      const next: Record<string, GlyphDataLike> = {};
      Object.entries(prev).forEach(([key, g]) => {
        next[key] = {
          ...g,
          advance: g.advance + delta,
        };
      });
      return next;
    });
  };

  const autoTighten = () => {
    setGlyphs(prev => {
      const next: Record<string, GlyphDataLike> = {};
      Object.entries(prev).forEach(([key, g]) => {
        const newLeft = Math.max(0, g.leftBearing * 0.85);
        const newRight = Math.max(0, g.rightBearing * 0.85);
        next[key] = { ...g, leftBearing: newLeft, rightBearing: newRight };
      });
      return next;
    });
  };

  const autoDistribute = () => {
    const values = Object.values(glyphs);
    if (values.length === 0) return;
    const averageAdvance =
      values.reduce((acc, g) => acc + g.advance, 0) / Math.max(values.length, 1);
    setGlyphs(prev => {
      const next: Record<string, GlyphDataLike> = {};
      Object.entries(prev).forEach(([key, g]) => {
        const leftRatio = g.advance > 0 ? g.leftBearing / g.advance : 0.25;
        const rightRatio = g.advance > 0 ? g.rightBearing / g.advance : 0.25;
        const width = Math.max(g.advance - g.leftBearing - g.rightBearing, 100);
        const spare = Math.max(averageAdvance - width, 0);
        const left = spare * leftRatio;
        const right = spare * rightRatio;
        next[key] = {
          ...g,
          advance: averageAdvance,
          leftBearing: left,
          rightBearing: right,
        };
      });
      return next;
    });
  };

  return (
    <div style={{ marginTop: 16, padding: 10, background: "#0d1117", borderRadius: 8 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Font Spacing Tools</div>
      <div style={{ marginBottom: 8 }}>
        <div>Global Letter Spacing Multiplier ({letterSpacing.toFixed(2)}x)</div>
        <input
          type="range"
          min={0.5}
          max={2}
          step={0.01}
          value={letterSpacing}
          onChange={e => applyLetterSpacing(parseFloat(e.target.value))}
        />
      </div>
      <div style={{ marginBottom: 8 }}>
        <div>Global Tracking ({tracking.toFixed(0)} units)</div>
        <input
          type="range"
          min={-500}
          max={200}
          step={1}
          value={tracking}
          onChange={e => applyTracking(parseInt(e.target.value, 10))}
        />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={autoTighten} style={{ flex: 1, padding: 6 }}>
          Auto-Tighten
        </button>
        <button onClick={autoDistribute} style={{ flex: 1, padding: 6 }}>
          Auto-Distribute
        </button>
      </div>
    </div>
  );
}
