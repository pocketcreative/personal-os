export default function GoalBanner() {
  return (
    <div
      style={{
        background: '#111',
        borderRadius: 8,
        padding: '14px 20px',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'baseline',
        gap: 10,
      }}
    >
      <span style={{ font: "700 11px 'Archivo', sans-serif", color: 'rgba(255,255,255,.5)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
        Current Goal
      </span>
      <span style={{ font: "700 15px 'Archivo', sans-serif", color: '#fff', letterSpacing: '-0.01em' }}>
        Close 5 × $25,000 Authority Agent deals
      </span>
    </div>
  );
}
