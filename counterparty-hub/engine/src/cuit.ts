const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
const VALID_PREFIXES = new Set(['20', '23', '24', '27', '30', '33', '34']);

/** Deja sólo los dígitos: "30-71234567-8" -> "30712345678". */
export function normalizeCuit(input: string): string {
  return input.replace(/\D/g, '');
}

export function checkDigit(first10: string): number {
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(first10[i]) * WEIGHTS[i];
  const v = 11 - (sum % 11);
  return v === 11 ? 0 : v; // 10 no es un dígito válido: ese CUIT no existe
}

export function isValidCuit(input: string): boolean {
  const d = normalizeCuit(input);
  if (d.length !== 11 || !VALID_PREFIXES.has(d.slice(0, 2))) return false;
  const v = checkDigit(d.slice(0, 10));
  return v !== 10 && v === Number(d[10]);
}

export function formatCuit(input: string): string {
  const d = normalizeCuit(input);
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : input;
}
