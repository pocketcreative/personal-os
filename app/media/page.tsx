import Link from 'next/link';
import { NOTION_CMS_URL, NOTION_DASHBOARDS } from '@/lib/notion';

// /media is a launcher into the Notion Content Management System. Notion does
// not allow its pages to be shown inside other sites, so every button opens
// Notion in a new tab. The old tracker (content_pieces) lives on at /media/old.

function ExternalArrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M4 10L10 4M5 4h5v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function MediaPage() {
  return (
    <div className="media-launcher">
      <h1 className="media-launcher-title">Media</h1>
      <p className="media-launcher-intro">Your content lives in Notion. Every button opens it in a new tab.</p>

      <a className="media-launcher-primary" href={NOTION_CMS_URL} target="_blank" rel="noopener noreferrer">
        Open Content Management System in Notion
        <ExternalArrow />
      </a>

      <h2 className="media-launcher-heading">Jump straight to a dashboard</h2>
      <ul className="media-launcher-grid">
        {NOTION_DASHBOARDS.map((d) => (
          <li key={d.url}>
            <a className="media-launcher-secondary" href={d.url} target="_blank" rel="noopener noreferrer">
              {d.label}
              <ExternalArrow />
            </a>
          </li>
        ))}
      </ul>

      <Link className="media-launcher-archive" href="/media/old">Old media tracker (archived)</Link>
    </div>
  );
}
