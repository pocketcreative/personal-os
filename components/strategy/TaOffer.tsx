'use client';
import { useState } from 'react';
import StrategyDoc from './StrategyDoc';
import { DOC_OPTIONS, slugForKey, type DocKey } from '@/lib/strategyDocs';

// One page, three documents. The choice lives in the URL (?doc=) so a refresh keeps it.
export default function TaOffer({ initialDoc }: { initialDoc: DocKey }) {
  const [doc, setDoc] = useState<DocKey>(initialDoc);
  const [dirty, setDirty] = useState(false);

  const pick = (next: DocKey) => {
    if (next === doc) return;
    if (dirty && !window.confirm('You have unsaved changes in this document. Switch anyway and lose them?')) return;
    setDirty(false);
    setDoc(next);
    window.history.replaceState(null, '', `/ta-offer?doc=${next}`);
  };

  return (
    <div className="strategy-page">
      <div className="strategy-switch" role="group" aria-label="Document">
        {DOC_OPTIONS.map((d) => (
          <button key={d.key} type="button" className="strategy-switch-btn" aria-pressed={doc === d.key} onClick={() => pick(d.key)}>
            {d.label}
          </button>
        ))}
      </div>
      <select
        className="strategy-switch-select"
        aria-label="Document"
        value={doc}
        onChange={(e) => {
          pick(e.target.value as DocKey);
          // If the switch was cancelled, put the dropdown back on the open document.
          e.target.value = doc;
        }}
      >
        {DOC_OPTIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
      </select>
      <StrategyDoc key={doc} slug={slugForKey(doc)} onDirtyChange={setDirty} />
    </div>
  );
}
