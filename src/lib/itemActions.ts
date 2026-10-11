// What happens when you tick, delete, move or edit an item — the same on every screen.
import type { Item } from './types';
import { actions, getState } from './store';
import { isDoneOn, isRepeating, itemsOn } from './schedule';
import { addDays, minToTime, timeToMin, toDateStr } from './dates';
import { undoable } from './undo';
import { askScope } from './ask';
import { celebrate, haptic } from './celebrate';
import { t } from './i18n';

export function toggle(item: Item, date: string) {
  const wasDone = isDoneOn(item, date);
  haptic();
  undoable(wasDone ? t('Marked not done') : t('Done: {title}', { title: item.title }), () => actions.toggleDone(item, date));
  const today = toDateStr(new Date());
  if (!wasDone && date === today) {
    const day = itemsOn(getState().items, today);
    if (day.length >= 2 && day.every((i) => isDoneOn(i, today))) celebrate();
  }
}

export async function remove(item: Item, date: string): Promise<boolean> {
  if (isRepeating(item)) {
    const scope = await askScope(item.title, 'delete');
    if (!scope) return false;
    if (scope === 'one') {
      undoable(t('Removed for {day}', { day: date === toDateStr(new Date()) ? t('today') : date }), () => actions.skipOccurrence(item, date));
      return true;
    }
  }
  undoable(t('Deleted: {title}', { title: item.title }), () => actions.deleteItem(item.id));
  return true;
}

export function moveToTomorrow(item: Item, date: string) {
  undoable(t('Moved to tomorrow'), () => actions.moveToTomorrow(item, date));
}

export function moveAllToTomorrow(list: Item[], date: string) {
  const movable = list.filter((i) => !isRepeating(i));
  if (!movable.length) return;
  undoable(t('Moved {n} to tomorrow', { n: movable.length }), () => actions.moveAllToTomorrow(movable, date));
}

/** Push a timed item later today (rolls into tomorrow past midnight). */
export function postpone(item: Item, date: string, minutes: number) {
  if (!item.start) return moveToTomorrow(item, date);
  const total = timeToMin(item.start) + minutes;
  const patch = { start: minToTime(total), date: total >= 1440 ? addDays(date, 1) : date };
  undoable(t('Moved to {time}', { time: patch.start }), () => {
    if (isRepeating(item)) actions.editOccurrence(item, date, patch);
    else actions.updateItem(item.id, patch);
  });
}

/**
 * Save an edit. For a repeating item whose timing or title changed, ask whether it applies
 * to just this occurrence or to all of them. Returns false if the person cancelled.
 */
export async function saveEdit(item: Item, date: string, patch: Partial<Item>): Promise<boolean> {
  const changesOccurrence = isRepeating(item) && (['title', 'date', 'start', 'durationMin', 'kind', 'areaId', 'remindOffsetMin', 'channel'] as const).some((k) => patch[k] !== undefined && patch[k] !== item[k]);
  const repeatChanged = JSON.stringify(patch.repeat ?? item.repeat) !== JSON.stringify(item.repeat);
  if (changesOccurrence && !repeatChanged) {
    const scope = await askScope(item.title, 'edit');
    if (!scope) return false;
    if (scope === 'one') {
      // Moving this occurrence: if the date field still shows the series start, keep it on this day.
      const { repeat: _r, ...rest } = patch;
      const onDate = patch.date === item.date ? date : patch.date ?? date;
      undoable(t('Changed just this one'), () => actions.editOccurrence(item, date, { ...rest, date: onDate }));
      return true;
    }
  }
  actions.updateItem(item.id, patch);
  return true;
}
