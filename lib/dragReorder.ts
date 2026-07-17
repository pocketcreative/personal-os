export interface CardRect {
  id: string;
  top: number;
  height: number;
}

/**
 * Pure reorder math for a touch/pointer-driven vertical drag list. Card
 * geometry (`rects`) is captured once at drag-start and stays fixed for the
 * gesture — only the mapping of ids to slots changes as the pointer moves,
 * matching the common "freeze geometry, swap slots" technique for
 * dependency-free drag lists (no measurement thrash mid-gesture).
 *
 * The dragged card is inserted just before the first non-dragged card whose
 * vertical midpoint is below `pointerY`, so a card doesn't have to be
 * dragged past a neighbor's full height before they swap — matching how
 * desktop's onDragOver/handleDrop feels.
 */
export function reorderByPointerY(rects: CardRect[], draggedId: string, pointerY: number): string[] {
  const others = rects.filter((r) => r.id !== draggedId);
  let insertAt = others.length;
  for (let i = 0; i < others.length; i++) {
    const midpoint = others[i].top + others[i].height / 2;
    if (pointerY < midpoint) {
      insertAt = i;
      break;
    }
  }
  const ids = others.map((r) => r.id);
  ids.splice(insertAt, 0, draggedId);
  return ids;
}
