import { describe, it, expect } from 'vitest';
import { sortTasks, type SortableTask } from '@/lib/taskSort';

const t = (
  id: string,
  status: SortableTask['status'],
  sort_order: number | null = null,
): SortableTask => ({ id, status, sort_order });

describe('sortTasks', () => {
  it('ranks in_progress first, then not_started, completed always last, archived last of all', () => {
    const tasks = [
      t('archived-plain', 'archived'),
      t('completed-plain', 'completed'),
      t('not-started-plain', 'not_started'),
      t('in-progress-plain', 'in_progress'),
    ];
    const sorted = sortTasks(tasks).map((x) => x.id);
    expect(sorted).toEqual([
      'in-progress-plain',
      'not-started-plain',
      'completed-plain',
      'archived-plain',
    ]);
  });

  it('"today" priority does not affect sort position — it is a filter/badge only, never a rank factor', () => {
    // Same status pairs, one "today" and one not (the field itself no
    // longer exists on SortableTask — this test documents the intent at
    // the type level: rank() takes no priority input at all).
    const tasks = [
      t('not-started-b', 'not_started'),
      t('not-started-a', 'not_started'),
      t('in-progress-b', 'in_progress'),
      t('in-progress-a', 'in_progress'),
    ];
    const sorted = sortTasks(tasks).map((x) => x.id);
    // Stable sort: original relative order preserved within each status,
    // since nothing (today or otherwise) is left to break the tie.
    expect(sorted).toEqual(['in-progress-b', 'in-progress-a', 'not-started-b', 'not-started-a']);
  });

  it('completed sorts last regardless of status ordering among active tasks', () => {
    const tasks = [t('a', 'completed'), t('b', 'not_started')];
    expect(sortTasks(tasks).map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('is a stable sort — preserves relative order within the same rank', () => {
    const tasks = [t('first', 'not_started'), t('second', 'not_started')];
    expect(sortTasks(tasks).map((x) => x.id)).toEqual(['first', 'second']);
  });

  it('does not mutate the input array', () => {
    const tasks = [t('a', 'completed'), t('b', 'not_started')];
    const original = [...tasks];
    sortTasks(tasks);
    expect(tasks).toEqual(original);
  });

  it('all-null sort_order falls back exactly to the fixed rank() rule (no regression)', () => {
    const tasks = [
      t('completed-plain', 'completed', null),
      t('not-started-plain', 'not_started', null),
      t('in-progress-plain', 'in_progress', null),
    ];
    const sorted = sortTasks(tasks).map((x) => x.id);
    expect(sorted).toEqual(['in-progress-plain', 'not-started-plain', 'completed-plain']);
  });

  it('manually-ordered active tasks sort first by sort_order ascending, unordered active tasks follow via rank()', () => {
    const tasks = [
      t('unordered-in-progress', 'in_progress', null), // would be rank 0 if it had no sort_order
      t('ordered-second', 'not_started', 1),
      t('unordered-not-started', 'not_started', null),
      t('ordered-first', 'in_progress', 0),
    ];
    const sorted = sortTasks(tasks).map((x) => x.id);
    expect(sorted).toEqual([
      'ordered-first',
      'ordered-second',
      'unordered-in-progress',
      'unordered-not-started',
    ]);
  });

  it('completed/archived tasks always sort last, in rank() order, regardless of any sort_order value they carry', () => {
    const tasks = [
      t('archived-with-low-sort-order', 'archived', -100),
      t('completed-with-low-sort-order', 'completed', -50),
      t('ordered-active', 'not_started', 5),
      t('unordered-active', 'in_progress', null),
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
      t('first-plain', 'not_started', null),
      t('second-plain', 'not_started', null),
    ];
    expect(sortTasks(tasks).map((x) => x.id)).toEqual(['first-plain', 'second-plain']);
  });
});
