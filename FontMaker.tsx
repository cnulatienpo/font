import { useState } from "react";

type GlyphData = {
  svg: string | null;
  advance: number;
};

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function createGlyphSet(): Record<string, GlyphData> {
  const init: Record<string, GlyphData> = {};
  UPPER.forEach(l => {
    init[l] = {
      svg: null,
      advance: 600,
    };
  });
  return init;
}

export default function FontMaker() {
  const [glyphs, setGlyphs] = useState<Record<string, GlyphData>>(createGlyphSet);
  const [selectedGlyph, setSelectedGlyph] = useState("A");
  const [previewText, setPreviewText] = useState("AVATAR");

  const active = glyphs[selectedGlyph];

  function updateGlyph(patch: Partial<GlyphData>) {
    setGlyphs(prev => ({
      ...prev,
      [selectedGlyph]: { ...prev[selectedGlyph], ...patch }
    }));
  }

  function handleSVGUpload(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      updateGlyph({ svg: reader.result as string });
    };
    reader.readAsText(file);
  }

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        background: "#000",
      }}
    >
      {/* LEFT CONTROL PANEL */}
      <div
        style={{
          width: 420,
          minWidth: 420,
          maxWidth: 420,
          height: "100%",
          overflowY: "auto",
          background: "#111",
          color: "white",
          padding: 10,
          boxSizing: "border-box",
          borderRight: "2px solid #222",
        }}
      >
        <div style={{ marginBottom: 10, fontWeight: "bold" }}>
          Selected Glyph: {selectedGlyph}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
          {UPPER.map(l => (
            <button
              key={l}
              onClick={() => setSelectedGlyph(l)}
              style={{
                background: selectedGlyph === l ? "#0af" : "#222",
                color: "white",
                border: "none",
                padding: 8,
                cursor: "pointer",
              }}
            >
              {l}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 14 }}>Upload SVG for {selectedGlyph}</div>
        <input
          type="file"
          accept=".svg"
          onChange={e => {
            const file = e.target.files?.[0];
            if (!file) return;
            handleSVGUpload(file);
          }}
        />

        <div style={{ marginTop: 14 }}>Advance Width</div>
        <input
          type="range"
          min={100}
          max={1000}
          value={active.advance}
          onChange={e => updateGlyph({ advance: +e.target.value })}
        />

        <div style={{ marginTop: 14 }}>Preview Text</div>
        <input
          value={previewText}
          onChange={e => setPreviewText(e.target.value)}
        />
      </div>

      {/* RIGHT EDIT / PREVIEW PANEL */}
      <div
        style={{
          flex: 1,
          height: "100%",
          position: "relative",
          background: "#000",
          overflow: "hidden",
        }}
      >
        {/* GUIDE LINES */}
        <div
          style={{
            position: "absolute",
            top: 200,
            left: 0,
            right: 0,
            height: 2,
            background: "red",
            zIndex: 1,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 120,
            left: 0,
            right: 0,
            height: 2,
            background: "blue",
            zIndex: 1,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 280,
            left: 0,
            right: 0,
            height: 2,
            background: "green",
            zIndex: 1,
          }}
        />

        {/* PREVIEW ROW */}
        <div
          style={{
            position: "absolute",
            top: 200,
            left: 20,
            display: "flex",
            alignItems: "flex-end",
            zIndex: 2,
          }}
        >
          {previewText.split("").map((c, i) => {
            const g = glyphs[c];
            if (!g?.svg) return null;

            return (
              <div
                key={i}
                style={{
                  marginRight: g.advance,
                }}
                dangerouslySetInnerHTML={{ __html: g.svg }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
