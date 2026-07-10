import { describe, it, expect } from 'vitest';
import { sortTasks, type SortableTask } from '@/lib/taskSort';

const t = (id: string, status: SortableTask['status'], key: boolean): SortableTask =>
  ({ id, status, key });

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
});
