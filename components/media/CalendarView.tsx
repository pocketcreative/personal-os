'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { useContentItems } from '@/lib/useContentItems';
import { useShareContext } from '@/lib/shareContext';
import {
  CONFLICT_WINDOW_MINUTES, CONTENT_ITEM_TYPE_LABELS, itemScheduledTime, timeToMinutes, type ContentItem,
} from '@/lib/types';

// Same-day items whose times land within CONFLICT_WINDOW_MINUTES of each
// other -- the real thing Brendan's trying to catch (two videos posting at
// effectively the same time). Items with no time set are never flagged
// against each other (nothing to compare).
function conflictingIds(dayItems: ContentItem[]): Set<string> {
  const timed = dayItems
    .map((it) => ({ id: it.id, minutes: timeToMinutes(it.post_time) }))
    .filter((x): x is { id: string; minutes: number } => x.minutes != null);
  const flagged = new Set<string>();
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      if (Math.abs(timed[i].minutes - timed[j].minutes) <= CONFLICT_WINDOW_MINUTES) {
        flagged.add(timed[i].id);
        flagged.add(timed[j].id);
      }
    }
  }
  return flagged;
}

// The one real capability Notion couldn't give: every type together by Post
// Date, from a single query (content_items has a `type` column, not 5
// separate databases) -- no UNION, no per-database embed.
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Read only on the public /share/[token] CMS view (no drag, no click
// through) -- see CalendarView's own note on why: rescheduling a post date
// has no share-scoped route (it's the one field that can trigger a live
// Zernio reschedule), and editing an item is already fully available from
// the Board/Table views above, so the calendar stays a plain read-only
// schedule there rather than growing a second edit surface for the same
// data.
function DraggableItemPill({ item, conflict, readOnly }: { item: ContentItem; conflict: boolean; readOnly: boolean }) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id, disabled: readOnly });
  const time = itemScheduledTime(item);
  return (
    <div
      ref={setNodeRef}
      {...(readOnly ? {} : listeners)}
      {...(readOnly ? {} : attributes)}
      title={conflict ? 'Same (or near-same) time as another item this day' : undefined}
      onClick={readOnly ? undefined : () => router.push(`/media/item/${item.id}`)}
      style={{
        opacity: isDragging ? 0.3 : 1, cursor: readOnly ? 'default' : isDragging ? 'grabbing' : 'grab',
        padding: '3px 7px', borderRadius: 6,
        background: conflict ? 'rgba(179,38,30,.08)' : 'rgba(2,74,221,.08)',
        border: conflict ? '1px solid rgba(179,38,30,.35)' : '1px solid rgba(2,74,221,.15)',
        marginBottom: 3, touchAction: 'manipulation',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 5 }}>
        <span style={{ font: "700 9px 'Inter Tight', sans-serif", color: '#024ADD', letterSpacing: '.02em' }}>
          {item.type.toUpperCase()}
        </span>
        {time && (
          <span style={{ font: "600 9px 'Inter Tight', sans-serif", color: conflict ? '#b3261e' : 'rgba(2,74,221,.7)', whiteSpace: 'nowrap' }}>
            {conflict ? '⚠️ ' : ''}{time}
          </span>
        )}
      </div>
      <span style={{ display: 'block', font: "500 11px 'Inter Tight', sans-serif", color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.name}
      </span>
    </div>
  );
}

function DroppableDay({ date, inMonth, children }: { date: string; inMonth: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: date });
  const today = isoDate(new Date()) === date;
  return (
    <div ref={setNodeRef} style={{
      minHeight: 92, borderRadius: 8, padding: 6,
      background: isOver ? 'rgba(2,74,221,.08)' : inMonth ? '#fff' : 'rgba(17,17,17,.015)',
      border: isOver ? '1px solid rgba(2,74,221,.35)' : today ? '1px solid rgba(2,74,221,.3)' : '1px solid rgba(17,17,17,.06)',
      transition: 'background .12s ease, border-color .12s ease',
    }}>
      <div style={{
        font: "700 11px 'Inter Tight', sans-serif",
        color: inMonth ? (today ? '#024ADD' : '#111') : 'rgba(17,17,17,.25)', marginBottom: 4,
      }}>
        {Number(date.slice(-2))}
      </div>
      {children}
    </div>
  );
}

export default function CalendarView() {
  const { items, loading, updateItem } = useContentItems();
  const share = useShareContext();
  const [cursor, setCursor] = useState(() => new Date());
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const byDate = useMemo(() => {
    const map = new Map<string, ContentItem[]>();
    for (const it of items) {
      if (!it.post_date) continue;
      const list = map.get(it.post_date) ?? [];
      list.push(it);
      map.set(it.post_date, list);
    }
    return map;
  }, [items]);

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const days: { date: Date; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push({ date: d, inMonth: d.getMonth() === cursor.getMonth() });
  }

  const undated = items.filter((it) => !it.post_date);

  async function handleDragEnd(event: DragEndEvent) {
    if (share) return;
    const date = event.over?.id as string | undefined;
    if (!date) return;
    const item = items.find((i) => i.id === event.active.id);
    if (!item || item.post_date === date) return;
    // Real two-way Zernio sync fires server-side inside PATCH /api/content-items/[id]
    // when this item's Stage is "Scheduled" -- see lib/contentItemsServer.ts.
    await updateItem(item.id, { post_date: date });
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div style={{ padding: '0 clamp(14px, 3vw, 44px) 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            style={{ font: "700 14px 'Inter Tight', sans-serif", background: 'none', border: 'none', cursor: 'pointer', color: '#111', padding: '4px 8px' }}>‹</button>
          <div style={{ font: "700 15px 'Archivo', sans-serif", color: '#111', minWidth: 140, textAlign: 'center' }}>
            {cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </div>
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            style={{ font: "700 14px 'Inter Tight', sans-serif", background: 'none', border: 'none', cursor: 'pointer', color: '#111', padding: '4px 8px' }}>›</button>
          <button onClick={() => setCursor(new Date())}
            style={{ font: "600 12px 'Inter Tight', sans-serif", background: 'rgba(17,17,17,.06)', border: 'none', borderRadius: 20, cursor: 'pointer', color: '#111', padding: '6px 14px', marginLeft: 4 }}>Today</button>
        </div>

        {loading ? (
          <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)', padding: '20px 0' }}>Loading…</div>
        ) : (
          <>
            {/* Month grid: desktop only (see .calendar-grid in globals.css). */}
            <div className="calendar-grid">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 }}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d} style={{ font: "700 10px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)', textTransform: 'uppercase', letterSpacing: '.04em', textAlign: 'center' }}>{d}</div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
                {days.map(({ date, inMonth }) => {
                  const key = isoDate(date);
                  const dayItems = byDate.get(key) ?? [];
                  const flagged = conflictingIds(dayItems);
                  return (
                    <DroppableDay key={key} date={key} inMonth={inMonth}>
                      {dayItems.map((it) => <DraggableItemPill key={it.id} item={it} conflict={flagged.has(it.id)} readOnly={!!share} />)}
                    </DroppableDay>
                  );
                })}
              </div>
            </div>

            {/* Agenda list: mobile only. No drag here (a scrolling list isn't
                a meaningful drop target) -- change a date from the item page
                instead, which works everywhere. */}
            <div className="calendar-agenda">
              {items.filter((it) => it.post_date).sort((a, b) => (a.post_date! < b.post_date! ? -1 : 1))
                .filter((it) => {
                  const d = new Date(`${it.post_date}T00:00:00`);
                  return d.getFullYear() === cursor.getFullYear() && d.getMonth() === cursor.getMonth();
                })
                .map((it) => {
                  const time = itemScheduledTime(it);
                  const conflict = conflictingIds(byDate.get(it.post_date!) ?? []).has(it.id);
                  return (
                    <div key={it.id} onClick={share ? undefined : () => window.location.assign(`/media/item/${it.id}`)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', borderBottom: '1px solid rgba(17,17,17,.06)', cursor: share ? 'default' : 'pointer' }}>
                      <div style={{ width: 52 }}>
                        <div style={{ font: "700 11px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.45)' }}>
                          {new Date(`${it.post_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                        {time && (
                          <div style={{ font: "600 9.5px 'Inter Tight', sans-serif", color: conflict ? '#b3261e' : 'rgba(2,74,221,.7)', whiteSpace: 'nowrap' }}>
                            {conflict ? '⚠️ ' : ''}{time}
                          </div>
                        )}
                      </div>
                      <span style={{ font: "700 9px 'Inter Tight', sans-serif", color: '#024ADD' }}>{it.type.toUpperCase()}</span>
                      <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: '#111', flex: 1 }}>{it.name}</div>
                    </div>
                  );
                })}
              {items.filter((it) => {
                if (!it.post_date) return false;
                const d = new Date(`${it.post_date}T00:00:00`);
                return d.getFullYear() === cursor.getFullYear() && d.getMonth() === cursor.getMonth();
              }).length === 0 && (
                <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)', padding: '16px 4px' }}>Nothing scheduled this month.</div>
              )}
            </div>

            {undated.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ font: "700 11px 'Archivo', sans-serif", color: 'rgba(17,17,17,.5)', letterSpacing: '.03em', textTransform: 'uppercase', marginBottom: 8 }}>
                  No Post Date ({undated.length})
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {undated.map((it) => (
                    <div key={it.id} style={{ minWidth: 160 }}><DraggableItemPill item={it} conflict={false} readOnly={!!share} /></div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: 24, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {(['lf', 'lts', 'sf', 'ad', 'vsl'] as const).map((t) => (
                <div key={t} style={{ font: "500 11px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>
                  {t.toUpperCase()} = {CONTENT_ITEM_TYPE_LABELS[t]}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </DndContext>
  );
}
