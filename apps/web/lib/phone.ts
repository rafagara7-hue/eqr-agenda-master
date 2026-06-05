/**
 * Utilitários de telefone. O valor armazenado no banco é sempre uma string
 * com apenas dígitos no formato E.164 — [código do país][DDD][número].
 * A formatação para exibição é responsabilidade do frontend (estas funções).
 */

const MIN_DIGITS = 10;
const MAX_DIGITS = 15;

export function normalizePhone(input: string | null | undefined): string {
  if (!input) return '';
  return input.replace(/\D/g, '');
}

export interface PhoneValidationResult {
  ok: boolean;
  /** Valor normalizado (somente dígitos) ou `null` se vazio. */
  value: string | null;
  /** Mensagem amigável quando ok=false. */
  error?: string;
}

/**
 * Valida o input para persistência.
 * - Vazio/null → ok com value=null (campo opcional).
 * - Entre 1 e 9 dígitos → erro.
 * - Entre 10 e 15 dígitos → ok.
 */
export function validatePhone(input: string | null | undefined): PhoneValidationResult {
  const digits = normalizePhone(input);
  if (digits.length === 0) return { ok: true, value: null };
  if (digits.length < MIN_DIGITS) {
    return { ok: false, value: null, error: 'Telefone incompleto — informe pelo menos DDD + número.' };
  }
  if (digits.length > MAX_DIGITS) {
    return { ok: false, value: null, error: 'Telefone tem mais dígitos do que o permitido (máx. 15).' };
  }
  return { ok: true, value: digits };
}

/**
 * Formata para exibição.
 * - 10 dígitos: (DD) DDDD-DDDD
 * - 11 dígitos: (DD) DDDDD-DDDD
 * - 12+ dígitos: +CC (DD) DDDDD-DDDD (interpreta os 2 ou 3 primeiros como código do país)
 */
export function formatPhone(value: string | null | undefined): string {
  const digits = normalizePhone(value);
  if (digits.length === 0) return '';

  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length >= 12) {
    // Assume 2 dígitos de código do país (55 BR, 54 AR…) por padrão.
    // Casos com 3 dígitos (ex.: +351 PT) ainda formatam corretamente como +351 (XX) ....
    const ccLen = digits.length === 12 ? 2 : digits.length - 11;
    const cc = digits.slice(0, ccLen);
    const ddd = digits.slice(ccLen, ccLen + 2);
    const rest = digits.slice(ccLen + 2);
    const split = rest.length === 9 ? `${rest.slice(0, 5)}-${rest.slice(5)}` : `${rest.slice(0, 4)}-${rest.slice(4)}`;
    return `+${cc} (${ddd}) ${split}`;
  }

  // 1-9 dígitos: devolve o que tem, marcado por (), para o usuário continuar digitando.
  return digits;
}

/**
 * Máscara de input — chama em onChange e usa o resultado como novo value do input.
 */
export function maskPhoneInput(input: string): string {
  return formatPhone(input);
}
