import { describe, it, expect } from 'vitest';
import { reorderByPointerY, type CardRect } from '@/lib/dragReorder';

// Three 100px-tall cards stacked with no gap: a[0,100), b[100,200), c[200,300).
const rects: CardRect[] = [
  { id: 'a', top: 0, height: 100 },
  { id: 'b', top: 100, height: 100 },
  { id: 'c', top: 200, height: 100 },
];

describe('reorderByPointerY', () => {
  it('keeps the original order when the pointer stays over the dragged card itself', () => {
    expect(reorderByPointerY(rects, 'a', 40)).toEqual(['a', 'b', 'c']);
  });

  it('moves the dragged card below a neighbor once the pointer crosses that neighbor\'s midpoint', () => {
    // b's midpoint is at 150. Just past it (151) should place a after b.
    expect(reorderByPointerY(rects, 'a', 151)).toEqual(['b', 'a', 'c']);
  });

  it('does not swap yet if the pointer has only reached a neighbor\'s top edge, before its midpoint', () => {
    // b spans [100,200); its midpoint is 150. At 120 (past top, before midpoint) 'a' should stay put.
    expect(reorderByPointerY(rects, 'a', 120)).toEqual(['a', 'b', 'c']);
  });

  it('moves the dragged card all the way to the end when the pointer is past every midpoint', () => {
    expect(reorderByPointerY(rects, 'a', 999)).toEqual(['b', 'c', 'a']);
  });

  it('moves the dragged card all the way to the start when the pointer is before every midpoint', () => {
    expect(reorderByPointerY(rects, 'c', -999)).toEqual(['c', 'a', 'b']);
  });

  it('moving the middle card up past the first card\'s midpoint puts it first', () => {
    // a's midpoint is at 50. Above it (10) should place b before a.
    expect(reorderByPointerY(rects, 'b', 10)).toEqual(['b', 'a', 'c']);
  });

  it('is a no-op reorder for a single-card list', () => {
    expect(reorderByPointerY([{ id: 'only', top: 0, height: 50 }], 'only', 500)).toEqual(['only']);
  });

  it('ignores stray rects not present in the dragged set (defensive)', () => {
    // Same three rects, dragging 'c' up to the very top.
    expect(reorderByPointerY(rects, 'c', -1)).toEqual(['c', 'a', 'b']);
  });
});
