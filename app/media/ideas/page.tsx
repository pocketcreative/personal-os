import CalendarView from '@/components/media/CalendarView';
import IdeasTab from '@/components/media/IdeasTab';
import MediaTabBar from '@/components/media/MediaTabBar';

// Calendar shown below every tab, including Ideas, rather than special-casing
// it out here -- simpler than conditional logic for one edge case (Ideas
// isn't really "scheduled" content, but a loose idea never has a Post Date
// anyway, so the calendar just never shows it -- no real downside to keeping
// this consistent with every other tab).
export default function Page() {
  return (
    <div style={{ width: '96%', maxWidth: 2200, margin: '0 auto', padding: 'clamp(16px, 6vw, 56px) 0' }}>
      <div style={{ background: '#fbfaf7', border: '1px solid rgba(0,0,0,.08)', borderRadius: 10, boxShadow: '0 2px 18px rgba(0,0,0,.05)' }}>
        <MediaTabBar active="ideas" />
        <IdeasTab />
        <div style={{ borderTop: '1px solid rgba(17,17,17,.08)', paddingTop: 20 }}>
          <div style={{ font: "700 13px 'Archivo', sans-serif", color: '#111', padding: '0 clamp(14px, 3vw, 44px)', marginBottom: 4 }}>Calendar</div>
          <CalendarView />
        </div>
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
