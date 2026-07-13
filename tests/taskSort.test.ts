import { describe, it, expect } from 'vitest';
import { sortTasks, type SortableTask } from '@/lib/taskSort';

const t = (
  id: string,
  status: SortableTask['status'],
  key: boolean,
  sort_order: number | null = null,
): SortableTask => ({ id, status, key, sort_order });

describe('sortTasks', () => {
  it('ranks in_progress+today first, then not_started+today, then in_progress, then not_started, completed always last', () => {
    const tasks = [
      t('completed-today', 'completed', true),
      t('not-started-plain', 'not_started', false),
      t('in-progress-plain', 'in_progress', false),
      t('not-started-today', 'not_started', true),
      t('in-progress-today', 'in_progress', true),
    ];
    const sorted = sortTasks(tasks).map((x) => x.id);
    expect(sorted).toEqual([
      'in-progress-today',
      'not-started-today',
      'in-progress-plain',
      'not-started-plain',
      'completed-today',
    ]);
  });
  it('completed sorts last regardless of key/priority', () => {
    const tasks = [t('a', 'completed', true), t('b', 'not_started', false)];
    expect(sortTasks(tasks).map((x) => x.id)).toEqual(['b', 'a']);
  });
  it('is a stable sort — preserves relative order within the same rank', () => {
    const tasks = [t('first', 'not_started', false), t('second', 'not_started', false)];
    expect(sortTasks(tasks).map((x) => x.id)).toEqual(['first', 'second']);
  });
  it('does not mutate the input array', () => {
    const tasks = [t('a', 'completed', false), t('b', 'not_started', true)];
    const original = [...tasks];
    sortTasks(tasks);
    expect(tasks).toEqual(original);
  });

  it('all-null sort_order falls back exactly to the fixed rank() rule (no regression)', () => {
    const tasks = [
      t('completed-today', 'completed', true, null),
      t('not-started-plain', 'not_started', false, null),
      t('in-progress-plain', 'in_progress', false, null),
      t('not-started-today', 'not_started', true, null),
      t('in-progress-today', 'in_progress', true, null),
    ];
    const sorted = sortTasks(tasks).map((x) => x.id);
    expect(sorted).toEqual([
      'in-progress-today',
      'not-started-today',
      'in-progress-plain',
      'not-started-plain',
      'completed-today',
    ]);
  });

  it('manually-ordered active tasks sort first by sort_order ascending, unordered active tasks follow via rank()', () => {
    const tasks = [
      t('unordered-in-progress-today', 'in_progress', true, null), // would be rank 0 if it had no sort_order
      t('ordered-second', 'not_started', false, 1),
      t('unordered-not-started-plain', 'not_started', false, null),
      t('ordered-first', 'in_progress', false, 0),
    ];
    const sorted = sortTasks(tasks).map((x) => x.id);
    expect(sorted).toEqual([
      'ordered-first',
      'ordered-second',
      'unordered-in-progress-today',
      'unordered-not-started-plain',
    ]);
  });

  it('completed/archived tasks always sort last, in rank() order, regardless of any sort_order value they carry', () => {
    const tasks = [
      t('archived-with-low-sort-order', 'archived', true, -100),
      t('completed-with-low-sort-order', 'completed', true, -50),
      t('ordered-active', 'not_started', false, 5),
      t('unordered-active', 'in_progress', true, null),
    ];
    const sorted = sortTasks(tasks).map((x) => x.id);
    expect(sorted).toEqual([
      'ordered-active',
      'unordered-active',
      'completed-with-low-sort-order',
      'archived-with-low-sort-order',
    ]);
  });

  it('is stable among unordered active tasks with the same rank', () => {
    const tasks = [
      t('first-plain', 'not_started', false, null),
      t('second-plain', 'not_started', false, null),
    ];
    expect(sortTasks(tasks).map((x) => x.id)).toEqual(['first-plain', 'second-plain']);
  });
});
