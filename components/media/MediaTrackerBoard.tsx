export default function MediaTrackerBoard() {
  return (
    <div style={{ maxWidth: 1220, margin: '0 auto' }}>
      <div style={{
        background: '#fbfaf7', border: '1px solid rgba(0,0,0,.08)', borderRadius: 10,
        boxShadow: '0 2px 18px rgba(0,0,0,.05)', overflow: 'hidden',
      }}>
        <iframe
          src="https://pocketcreativesg.notion.site/ebd//f0a30905fc388397a62f81eb6892a138?v=56330905fc3883289149082fb98f4150"
          style={{ width: '100%', height: 'calc(100vh - 220px)', minHeight: 500, border: 'none', display: 'block' }}
          allowFullScreen
        />
      </div>
    </div>
  );
}
