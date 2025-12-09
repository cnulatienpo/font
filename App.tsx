import { useState } from "react";
import FontMaker from "../FontMaker";

export default function App() {
  const [showFontMaker, setShowFontMaker] = useState(true);

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      {/* Top bar */}
      <div
        style={{
          padding: "8px 12px",
          background: "#222",
          color: "white",
          fontSize: 14,
          display: "flex",
          gap: 12,
          alignItems: "center"
        }}
      >
        <span>LoadSVG Font App</span>

        <button onClick={() => setShowFontMaker(true)}>
          Font Maker
        </button>

        <button onClick={() => setShowFontMaker(false)}>
          Blank View
        </button>
      </div>

      {/* Main screen */}
      <div style={{ height: "calc(100% - 36px)" }}>
        {showFontMaker ? (
          <FontMaker />
        ) : (
          <div style={{ padding: 20 }}>Blank view is active.</div>
        )}
      </div>
    </div>
  );
}
