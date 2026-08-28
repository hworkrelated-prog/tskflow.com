// Human-friendly duration formatting.
// Rules:
//  * Under 60 minutes  -> "45 minutes"
//  * 60 minutes and up -> "1 hour 30 minutes" (or just "2 hours")
//  * Accepts inputs in hours (default), minutes, or seconds via `unit`.

export function formatDuration(value, unit = 'hours') {
  if (value == null || isNaN(value)) return ' - ';
  let minutes;
  if (unit === 'hours') minutes = Math.round(Number(value) * 60);
  else if (unit === 'minutes') minutes = Math.round(Number(value));
  else if (unit === 'seconds') minutes = Math.round(Number(value) / 60);
  else minutes = Math.round(Number(value));

  if (minutes < 1) return 'Less than a minute';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes - hours * 60;
  if (rem === 0) return `${hours} hour${hours === 1 ? '' : 's'}`;
  return `${hours} hour${hours === 1 ? '' : 's'} ${rem} minute${rem === 1 ? '' : 's'}`;
}

// Time until (in a friendly relative form) - negative means overdue
export function formatRelativeHours(hours) {
  if (hours == null || isNaN(hours)) return ' - ';
  const abs = Math.abs(hours);
  const sign = hours < 0 ? 'ago' : 'left';
  return `${formatDuration(abs, 'hours')} ${sign}`;
}
