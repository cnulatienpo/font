import React from "react";

export type GuideSet = {
  baseline: number;
  capHeight: number;
  xHeight: number;
  ascender: number;
  descender: number;
  meanline: number;
  centerline: number;
  emTop: number;
  emBottom: number;
};

type Props = {
  guides: GuideSet;
  onChange: (patch: Partial<GuideSet>) => void;
};

const SLIDER_STYLE: React.CSSProperties = {
  width: "100%",
};

function GuideSlider({
  label,
  color,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  color: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontWeight: 600, color }}>{label}: {value}px</div>
      <input
        type="range"
        style={SLIDER_STYLE}
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(parseInt(e.target.value, 10))}
      />
    </div>
  );
}

export default function GuideControls({ guides, onChange }: Props) {
  return (
    <div style={{ marginTop: 12 }}>
      <GuideSlider
        label="Baseline"
        color="red"
        value={guides.baseline}
        min={0}
        max={1200}
        onChange={v => onChange({ baseline: v })}
      />
      <GuideSlider
        label="Cap Height"
        color="blue"
        value={guides.capHeight}
        min={0}
        max={1000}
        onChange={v => onChange({ capHeight: v })}
      />
      <GuideSlider
        label="X-Height"
        color="purple"
        value={guides.xHeight}
        min={0}
        max={1000}
        onChange={v => onChange({ xHeight: v })}
      />
      <GuideSlider
        label="Ascender"
        color="cyan"
        value={guides.ascender}
        min={0}
        max={1000}
        onChange={v => onChange({ ascender: v })}
      />
      <GuideSlider
        label="Descender"
        color="green"
        value={guides.descender}
        min={0}
        max={1200}
        onChange={v => onChange({ descender: v })}
      />
      <GuideSlider
        label="Meanline"
        color="orange"
        value={guides.meanline}
        min={0}
        max={1200}
        onChange={v => onChange({ meanline: v })}
      />
      <GuideSlider
        label="Centerline"
        color="gray"
        value={guides.centerline}
        min={0}
        max={1200}
        onChange={v => onChange({ centerline: v })}
      />
      <GuideSlider
        label="Em Square Top"
        color="white"
        value={guides.emTop}
        min={0}
        max={1200}
        onChange={v => onChange({ emTop: v })}
      />
      <GuideSlider
        label="Em Square Bottom"
        color="white"
        value={guides.emBottom}
        min={0}
        max={1400}
        onChange={v => onChange({ emBottom: v })}
      />
    </div>
  );
}
