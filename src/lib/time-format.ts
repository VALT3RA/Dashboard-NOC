export function formatMinutes(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (value <= 0) return "0 min";
  if (value < 1) {
    return `${Math.round(value * 60)} s`;
  }
  if (value >= 60) {
    const hours = Math.floor(value / 60);
    const minutes = Math.round(value % 60);
    if (hours && minutes) {
      return `${hours}h ${minutes}min`;
    }
    if (hours) return `${hours}h`;
  }
  return `${value.toFixed(1)} min`;
}

export function formatDurationMinutes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 min";
  }
  const totalMinutes = Math.floor(value);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const mins = totalMinutes % 60;
  const segments: string[] = [];
  if (days) segments.push(`${days}d`);
  if (hours) segments.push(`${hours}h`);
  if (mins) segments.push(`${mins}min`);
  return segments.join(" ");
}
