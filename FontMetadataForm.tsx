// FontMetadataForm.tsx
// Small form for entering font metadata before building.

import React, { useState } from "react";

type FontMetadata = {
  fontName: string;
  styleName: string;
  unitsPerEm: number;
  ascender: number;
  descender: number;
  padding: number;
};

export default function FontMetadataForm({ onChange }: { onChange: (meta: FontMetadata) => void }) {
  const [fontName, setFontName] = useState("MyFont");
  const [styleName, setStyleName] = useState("Regular");
  const [unitsPerEm, setUnitsPerEm] = useState(1000);
  const [ascender, setAscender] = useState(800);
  const [descender, setDescender] = useState(-200);
  const [padding, setPadding] = useState(50);

  function emit() {
    onChange({
      fontName,
      styleName,
      unitsPerEm,
      ascender,
      descender,
      padding
    });
  }

  return (
    <div
      style={{
        padding: "1rem",
        marginTop: "1rem",
        border: "1px solid #ccc",
        borderRadius: "6px",
        background: "#f9f9f9",
        width: "100%",
        maxWidth: "400px"
      }}
    >
      <h3 style={{ margin: 0, marginBottom: "0.5rem" }}>Font details</h3>

      <label>Font name</label>
      <input
        type="text"
        value={fontName}
        onChange={e => setFontName(e.target.value)}
        style={{ width: "100%", marginBottom: "0.5rem" }}
      />

      <label>Style name</label>
      <input
        type="text"
        value={styleName}
        onChange={e => setStyleName(e.target.value)}
        style={{ width: "100%", marginBottom: "0.5rem" }}
      />

      <label>Units per em</label>
      <input
        type="number"
        value={unitsPerEm}
        onChange={e => setUnitsPerEm(parseInt(e.target.value))}
        style={{ width: "100%", marginBottom: "0.5rem" }}
      />

      <label>Ascender</label>
      <input
        type="number"
        value={ascender}
        onChange={e => setAscender(parseInt(e.target.value))}
        style={{ width: "100%", marginBottom: "0.5rem" }}
      />

      <label>Descender</label>
      <input
        type="number"
        value={descender}
        onChange={e => setDescender(parseInt(e.target.value))}
        style={{ width: "100%", marginBottom: "0.5rem" }}
      />

      <label>Side padding (canvas)</label>
      <input
        type="number"
        value={padding}
        onChange={e => setPadding(parseInt(e.target.value))}
        style={{ width: "100%", marginBottom: "0.5rem" }}
      />

      <button
        onClick={emit}
        style={{
          marginTop: "0.5rem",
          padding: "0.5rem 1rem",
          fontWeight: 700
        }}
      >
        update
      </button>
    </div>
  );
}
