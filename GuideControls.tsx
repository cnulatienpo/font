import React from "react";

type Props = {
  baseline: number;
  capHeight: number;
  descender: number;
  setBaseline: (v: number) => void;
  setCapHeight: (v: number) => void;
  setDescender: (v: number) => void;
};

export default function GuideControls({
  baseline,
  capHeight,
  descender,
  setBaseline,
  setCapHeight,
  setDescender,
}: Props) {
  return (
    <div style={{ marginTop: 12 }}>
      <div>
        Baseline (Red)
        <input
          type="range"
          min={50}
          max={500}
          value={baseline}
          onChange={e => setBaseline(+e.target.value)}
        />
      </div>

      <div>
        Cap Height (Blue)
        <input
          type="range"
          min={50}
          max={400}
          value={capHeight}
          onChange={e => setCapHeight(+e.target.value)}
        />
      </div>

      <div>
        Descender (Green)
        <input
          type="range"
          min={100}
          max={600}
          value={descender}
          onChange={e => setDescender(+e.target.value)}
        />
      </div>
    </div>
  );
}
