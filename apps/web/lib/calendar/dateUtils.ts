import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfDay, endOfDay, addDays, addWeeks, addMonths,
  subDays, subWeeks, subMonths, format, isSameDay,
  isSameMonth, isToday, eachDayOfInterval, eachHourOfInterval,
  differenceInMinutes, startOfHour, getHours, getMinutes,
  parseISO, isValid, setHours, setMinutes,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

export {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfDay, endOfDay, addDays, addWeeks, addMonths,
  subDays, subWeeks, subMonths, isSameDay, isSameMonth,
  isToday, eachDayOfInterval, eachHourOfInterval,
  differenceInMinutes, startOfHour, getHours, getMinutes,
  parseISO, isValid, setHours, setMinutes,
};

export const LOCALE = ptBR;

export function formatDate(date: Date, fmt: string): string {
  return format(date, fmt, { locale: ptBR });
}

export function getWeekDays(date: Date): Date[] {
  const start = startOfWeek(date, { weekStartsOn: 0 });
  const end = endOfWeek(date, { weekStartsOn: 0 });
  return eachDayOfInterval({ start, end });
}

export function getMonthDays(date: Date): Date[] {
  const start = startOfMonth(date);
  const end = endOfMonth(date);
  return eachDayOfInterval({ start, end });
}

export function getHoursOfDay(): Date[] {
  const start = startOfDay(new Date());
  const end = endOfDay(new Date());
  return eachHourOfInterval({ start, end });
}

export function getTopPercentage(date: Date): number {
  const totalMinutes = 24 * 60;
  const minutesSinceMidnight = getHours(date) * 60 + getMinutes(date);
  return (minutesSinceMidnight / totalMinutes) * 100;
}

export function getHeightPercentage(startAt: Date, endAt: Date): number {
  const totalMinutes = 24 * 60;
  const durationMinutes = differenceInMinutes(endAt, startAt);
  return Math.max((durationMinutes / totalMinutes) * 100, 1.5);
}

export function snapToSlot(date: Date, slotMinutes = 15): Date {
  const minutes = getMinutes(date);
  const snapped = Math.round(minutes / slotMinutes) * slotMinutes;
  return setMinutes(setHours(date, getHours(date)), snapped);
}

export function navigateDate(
  date: Date,
  direction: 'prev' | 'next',
  view: 'day' | 'week' | 'month'
): Date {
  if (view === 'day') return direction === 'next' ? addDays(date, 1) : subDays(date, 1);
  if (view === 'week') return direction === 'next' ? addWeeks(date, 1) : subWeeks(date, 1);
  return direction === 'next' ? addMonths(date, 1) : subMonths(date, 1);
}

// Nomes dos dias da semana, controlados explicitamente para evitar divergência
// entre locale do date-fns e o que a UI mostra (não depende de `EEE`/`EEEE`).
// Index = day.getDay() (0=domingo … 6=sábado).
const WEEKDAY_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const;
const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

export function getWeekdayLabel(date: Date, mode: 'full' | 'short' = 'full'): string {
  const arr = mode === 'short' ? WEEKDAY_SHORT : WEEKDAY_FULL;
  return arr[date.getDay()] ?? '';
}
