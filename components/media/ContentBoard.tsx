'use client';
import { useState } from 'react';
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useContentItems } from '@/lib/useContentItems';
import { useRouter } from 'next/navigation';
import CalendarView from './CalendarView';
import ContentItemCard from './ContentItemCard';
import ContentTable from './ContentTable';
import MediaTabBar, { type MediaTab } from './MediaTabBar';
import { NOTION_CMS_URL } from '@/lib/notion';
import {
  CONTENT_ITEM_TYPE_LABELS, STAGE_OPTIONS, type ContentItem, type ContentItemType,
} from '@/lib/types';

// Same column width + sensors as TaskKanbanBoard (decision 7: reuse the
// exact drag pattern, including touch support, not a new implementation).
const COLUMN_MIN_WIDTH = 280;

function useBoardSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );
}

// A card that's both cross-column-draggable (existing behavior) and
// sortable within its own column's SortableContext (the new behavior):
// @dnd-kit/sortable's useSortable wraps useDraggable + useDroppable in one
// hook, so this replaces the old plain useDraggable card.
function SortableCard({ item }: { item: ContentItem }) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: item.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    opacity: isDragging ? 0.4 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
    touchAction: 'manipulation',
  };
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <ContentItemCard item={item} />
    </div>
  );
}

function DroppableColumn({ stage, children }: { stage: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div ref={setNodeRef} style={{
      flex: `1 1 ${COLUMN_MIN_WIDTH}px`, minWidth: COLUMN_MIN_WIDTH, maxWidth: 420,
      scrollSnapAlign: 'start',
      background: isOver ? 'rgba(2,74,221,.05)' : 'rgba(17,17,17,.02)',
      border: isOver ? '1px solid rgba(2,74,221,.35)' : '1px solid rgba(17,17,17,.06)',
      borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10,
      transition: 'background .12s ease, border-color .12s ease',
    }}>
      {children}
    </div>
  );
}

type BoardView = 'board' | 'table';

export default function ContentBoard({ type }: { type: ContentItemType }) {
  const { items, loading, addItem, updateItem } = useContentItems(type);
  const sensors = useBoardSensors();
  const [draggingItem, setDraggingItem] = useState<ContentItem | null>(null);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<BoardView>('board');
  const router = useRouter();
  const stages = STAGE_OPTIONS[type];

  const query = search.trim().toLowerCase();
  const visibleItems = query
    ? items.filter((i) => i.name.toLowerCase().includes(query) || (i.body_md ?? '').toLowerCase().includes(query))
    : items;

  function itemsForStage(stage: string) {
    return visibleItems.filter((i) => i.stage === stage);
  }

  function handleDragStart(event: DragStartEvent) {
    setDraggingItem(items.find((i) => i.id === event.active.id) ?? null);
  }

  // Handles both existing behavior (drop on a different column moves the
  // card between Stages) and the new behavior (drop on/near another card
  // reorders within the same column, or inserts at that position in a
  // different column). Either way, the whole destination column gets
  // renumbered (sort_order = its index) and persisted -- this is what
  // correctly folds in legacy items that have never had a real sort_order
  // (they were ordered by created_at until now), not just the one moved
  // card, so a drag next to an untouched card lands in the right spot
  // instead of always jumping to the front/back of the null group.
  async function handleDragEnd(event: DragEndEvent) {
    setDraggingItem(null);
    const activeId = event.active.id as string;
    const overId = event.over?.id as string | undefined;
    if (!overId) return;

    const activeItem = visibleItems.find((i) => i.id === activeId);
    if (!activeItem) return;

    const droppedOnColumn = stages.includes(overId);
    const overItem = droppedOnColumn ? null : visibleItems.find((i) => i.id === overId);
    const targetStage = droppedOnColumn ? overId : (overItem?.stage ?? activeItem.stage);

    const targetStageItems = itemsForStage(targetStage).filter((i) => i.id !== activeId);
    let insertIndex = targetStageItems.length;
    if (overItem) {
      const idx = targetStageItems.findIndex((i) => i.id === overId);
      if (idx !== -1) insertIndex = idx;
    }
    targetStageItems.splice(insertIndex, 0, activeItem);

    const original = itemsForStage(targetStage);
    const unchanged = activeItem.stage === targetStage
      && original.length === targetStageItems.length
      && original.every((it, idx) => it.id === targetStageItems[idx].id);
    if (unchanged) return;

    await Promise.all(targetStageItems.map((it, idx) => {
      const patch: Partial<ContentItem> = { sort_order: idx };
      if (it.id === activeId && activeItem.stage !== targetStage) patch.stage = targetStage;
      return updateItem(it.id, patch);
    }));
  }

  async function submitAdd() {
    const name = draft.trim();
    if (!name || adding) return;
    setAdding(true);
    const created = await addItem(type, name);
    setAdding(false);
    if (created) { setDraft(''); router.push(`/media/item/${created.id}`); }
  }

  return (
    <div style={{ width: '96%', maxWidth: 2200, margin: '0 auto', padding: 'clamp(16px, 6vw, 56px) 0' }}>
      <div style={{ background: '#fbfaf7', border: '1px solid rgba(0,0,0,.08)', borderRadius: 10, boxShadow: '0 2px 18px rgba(0,0,0,.05)' }}>
        <MediaTabBar active={type as MediaTab} />
        <div style={{ padding: '0 clamp(14px, 3vw, 44px) 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
            <div style={{ font: "700 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.5)' }}>
              {CONTENT_ITEM_TYPE_LABELS[type]}
            </div>
            {/* Board / Table toggle (feature 2), same pill treatment as
                MediaTabBar's tabs above -- dark fill for the active state. */}
            <div style={{ display: 'flex', gap: 6 }}>
              {(['board', 'table'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  style={{
                    font: "700 12px 'Inter Tight', sans-serif", letterSpacing: '.02em',
                    color: view === v ? '#fff' : '#111',
                    background: view === v ? '#111' : 'rgba(17,17,17,.06)',
                    border: 'none', borderRadius: 20, padding: '7px 16px', cursor: 'pointer',
                  }}
                >
                  {v === 'board' ? 'Board' : 'Table'}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title or content…"
              style={{
                flex: 1, padding: '10px 14px', border: '1px solid rgba(17,17,17,.12)', borderRadius: 8,
                background: '#fff', fontFamily: "'Inter Tight', sans-serif", fontSize: 14, outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitAdd(); }}
              placeholder={`New ${CONTENT_ITEM_TYPE_LABELS[type]} item…`}
              style={{
                flex: 1, padding: '10px 14px', border: '1px solid rgba(17,17,17,.12)', borderRadius: 8,
                background: '#fff', fontFamily: "'Inter Tight', sans-serif", fontSize: 14, outline: 'none',
              }}
            />
            <button
              onClick={submitAdd}
              disabled={adding || !draft.trim()}
              style={{
                font: "600 13px 'Inter Tight', sans-serif", color: '#fff', background: '#024ADD',
                border: 'none', borderRadius: 8, padding: '10px 20px', cursor: adding ? 'default' : 'pointer',
                opacity: adding || !draft.trim() ? 0.5 : 1,
              }}
            >Add</button>
          </div>

          {loading ? (
            <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)', padding: '20px 0' }}>Loading…</div>
          ) : query && visibleItems.length === 0 ? (
            <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)', padding: '20px 0' }}>No matches</div>
          ) : view === 'table' ? (
            <div style={{ paddingBottom: 20 }}>
              <ContentTable items={visibleItems} />
            </div>
          ) : (
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setDraggingItem(null)}>
              <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 20, scrollSnapType: 'x proximity' }}>
                {stages.map((stage) => {
                  const stageItems = itemsForStage(stage);
                  return (
                    <DroppableColumn key={stage} stage={stage}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 7,
                        font: "700 11.5px 'Archivo', sans-serif", color: '#111', letterSpacing: '.03em',
                        textTransform: 'uppercase', padding: '2px 2px 6px',
                      }}>
                        {stage}
                        <span style={{ color: 'rgba(17,17,17,.35)', fontWeight: 600 }}>{stageItems.length}</span>
                      </div>
                      {stageItems.length === 0 && (
                        <div style={{ font: "500 12px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.3)', padding: '4px 2px' }}>
                          Nothing here
                        </div>
                      )}
                      <SortableContext items={stageItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                        {stageItems.map((item) => <SortableCard key={item.id} item={item} />)}
                      </SortableContext>
                    </DroppableColumn>
                  );
                })}
              </div>
              <DragOverlay>
                {draggingItem && (
                  <div style={{ width: COLUMN_MIN_WIDTH - 24, boxShadow: '0 14px 30px rgba(0,0,0,.2)', borderRadius: 10, transform: 'rotate(1.5deg)', cursor: 'grabbing' }}>
                    <ContentItemCard item={draggingItem} />
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          )}
        </div>

        {/* Calendar lives below the board (and below the table view, same
            treatment), not as a competing tab. It always shows every
            content type together by Post Date -- the same real unified
            query regardless of which board tab or view is active. */}
        <div style={{ borderTop: '1px solid rgba(17,17,17,.08)', paddingTop: 20 }}>
          <div style={{ font: "700 13px 'Archivo', sans-serif", color: '#111', padding: '0 clamp(14px, 3vw, 44px)', marginBottom: 4 }}>Calendar</div>
          <CalendarView />
        </div>

        <div style={{ padding: '4px clamp(14px, 3vw, 44px) 24px' }}>
          <a href={NOTION_CMS_URL} target="_blank" rel="noopener noreferrer"
            style={{ font: "500 11px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.35)', textDecoration: 'underline' }}>
            Old Notion CMS (read-only reference during the move) ↗
          </a>
        </div>
      </div>
    </div>
  );
}
