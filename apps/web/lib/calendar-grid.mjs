// A stable six-week calendar window. All arithmetic uses local calendar days
// so DST changes do not shift dates or break seven-day navigation.
export function calendarWeekStart(anchor) {
  const mondayOffset = (anchor.getDay() + 6) % 7;
  return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - mondayOffset);
}

export function calendarWeekCells(anchor) {
  const start = calendarWeekStart(anchor);
  return Array.from({ length: 42 }, (_, index) => (
    new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
  ));
}

export function shiftCalendarWeek(anchor, direction) {
  return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + direction * 7);
}

export function calendarWindowRange(anchor) {
  const start = calendarWeekStart(anchor);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 42);
  return { start: start.toISOString(), end: end.toISOString() };
}
