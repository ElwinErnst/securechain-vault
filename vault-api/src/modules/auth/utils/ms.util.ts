// Convierte strings tipo: "15m", "7d", "12h" a milisegundos
export function parseDurationToMs(value: string): number {
  const m = /^(\d+)(s|m|h|d)$/.exec(value.trim());
  if (!m) throw new Error(`Invalid duration: ${value}`);
  const n = Number(m[1]);
  const unit = m[2];

  const mult =
    unit === 's'
      ? 1000
      : unit === 'm'
        ? 60_000
        : unit === 'h'
          ? 3_600_000
          : 86_400_000;

  return n * mult;
}
