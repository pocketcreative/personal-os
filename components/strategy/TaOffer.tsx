'use client';
import { useState } from 'react';
import StrategyDoc from './StrategyDoc';

const DOCS = [
  { slug: 'target-audience', label: 'Target Audience' },
  { slug: 'offer', label: 'Offer' },
] as const;

type DocSlug = (typeof DOCS)[number]['slug'];

// One page, two documents. The choice lives in the URL (?doc=) so a refresh keeps it.
export default function TaOffer({ initialDoc }: { initialDoc: DocSlug }) {
  const [doc, setDoc] = useState<DocSlug>(initialDoc);
  const [dirty, setDirty] = useState(false);

  const pick = (next: DocSlug) => {
    if (next === doc) return;
    if (dirty && !window.confirm('You have unsaved changes in this document. Switch anyway and lose them?')) return;
    setDirty(false);
    setDoc(next);
    window.history.replaceState(null, '', `/ta-offer?doc=${next}`);
  };

  return (
    <div className="strategy-page">
      <div className="strategy-switch" role="group" aria-label="Document">
        {DOCS.map((d) => (
          <button key={d.slug} type="button" className="strategy-switch-btn" aria-pressed={doc === d.slug} onClick={() => pick(d.slug)}>
            {d.label}
          </button>
        ))}
      </div>
      <select
        className="strategy-switch-select"
        aria-label="Document"
        value={doc}
        onChange={(e) => {
          pick(e.target.value as DocSlug);
          // If the switch was cancelled, put the dropdown back on the open document.
          e.target.value = doc;
        }}
      >
        {DOCS.map((d) => <option key={d.slug} value={d.slug}>{d.label}</option>)}
      </select>
      <StrategyDoc key={doc} slug={doc} onDirtyChange={setDirty} />
    </div>
  );
}
