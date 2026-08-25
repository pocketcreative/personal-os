export default function MediaTrackerBoard() {
  return (
    <div style={{ maxWidth: 1220, margin: '0 auto', padding: '56px 24px', background: '#f3f1ec' }}>
      <div style={{
        background: '#fbfaf7', border: '1px solid rgba(0,0,0,.08)', borderRadius: 10,
        boxShadow: '0 2px 18px rgba(0,0,0,.05)', padding: '40px 44px 28px',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ font: "800 22px 'Archivo', sans-serif", color: '#111', letterSpacing: '-0.02em' }}>Media Tracker</div>
          <div style={{
            font: "500 12px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)',
            letterSpacing: '.04em', textTransform: 'uppercase',
          }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
        </div>

        <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(17,17,17,.08)' }}>
          <iframe
            src="https://pocketcreativesg.notion.site/ebd//f0a30905fc388397a62f81eb6892a138?v=56330905fc3883289149082fb98f4150"
            style={{ width: '100%', height: 'calc(100vh - 320px)', minHeight: 480, border: 'none', display: 'block' }}
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}
