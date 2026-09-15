export function percentageChange(current: number, previous: number) {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function changeDescription(
  subject: string,
  current: number,
  previous: number,
) {
  const change = percentageChange(current, previous);
  if (change === null) return `Belum ada pembanding ${subject.toLowerCase()}.`;
  if (change === 0) return `${subject} stabil dari bulan lalu.`;
  return `${subject} ${change > 0 ? "naik" : "turun"} ${Math.abs(change)}% dari bulan lalu.`;
}
