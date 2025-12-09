type Props = {
  baseline: number;
  capHeight: number;
  descender: number;
};

export default function GuideOverlay({ baseline, capHeight, descender }: Props) {
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {/* Baseline (Red) */}
      <div
        style={{
          position: "absolute",
          top: baseline,
          left: 0,
          right: 0,
          height: 1,
          background: "red",
        }}
      />

      {/* Cap Height (Blue) */}
      <div
        style={{
          position: "absolute",
          top: capHeight,
          left: 0,
          right: 0,
          height: 1,
          background: "blue",
        }}
      />

      {/* Descender (Green) */}
      <div
        style={{
          position: "absolute",
          top: descender,
          left: 0,
          right: 0,
          height: 1,
          background: "green",
        }}
      />
    </div>
  );
}
