export function money(n: number): string {
  const v = Math.round(n);
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${v < 0 ? "−" : ""}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 10_000) return `${v < 0 ? "−" : ""}$${(abs / 1000).toFixed(abs >= 100_000 ? 0 : 1)}k`;
  return `${v < 0 ? "−" : ""}$${abs.toLocaleString("es-ES")}`;
}

export function num(n: number): string {
  return Math.round(n).toLocaleString("es-ES");
}

export function pct(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`;
}

export function signed(n: number): string {
  return `${n >= 0 ? "+" : "−"}${money(Math.abs(n)).replace("$", "$")}`;
}

/** Verde → ámbar → rojo según lo malo que sea el valor. */
export function severity(value: number, warn: number, bad: number): string {
  if (value >= bad) return "text-danger";
  if (value >= warn) return "text-zone-i";
  return "text-ok";
}
