export function volumePercentage(volume: number) {
  if (!Number.isFinite(volume)) {
    return 0;
  }

  return Math.round(Math.min(1, Math.max(0, volume)) * 100);
}
