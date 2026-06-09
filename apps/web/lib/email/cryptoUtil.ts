/**
 * Encriptação simétrica AES-256-GCM pra senha SMTP gravada em DB.
 *
 * Por que GCM: AEAD (autenticado) — adulteração no DB falha decrypt em vez de
 * abrir vetor pra side-channel.
 *
 * Formato armazenado: base64(IV[12] || TAG[16] || CIPHERTEXT[n])
 *
 * Chave: env `SMTP_ENCRYPT_KEY`. Aceita:
 *   - 44 chars base64 → 32 bytes raw key (gera com `openssl rand -base64 32`)
 *   - Qualquer outra string → deriva 32 bytes via scrypt (mais devagar, ok pra startup)
 *
 * Se a chave do env mudar, todas senhas salvas viram lixo — o admin precisa
 * reconectar SMTP via UI. Não rotacione sem aviso.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env['SMTP_ENCRYPT_KEY'];
  if (!raw) {
    throw new Error(
      'SMTP_ENCRYPT_KEY env var não configurada. ' +
      'Gere uma chave com `openssl rand -base64 32` e adicione no Vercel.'
    );
  }
  // 44 chars base64 = 32 bytes raw
  if (raw.length === 44 && /^[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
    const buf = Buffer.from(raw, 'base64');
    if (buf.length === KEY_LEN) {
      cachedKey = buf;
      return buf;
    }
  }
  // Fallback: scrypt — passphrase qualquer vira 32 bytes
  cachedKey = scryptSync(raw, 'eqr-smtp-encrypt-salt-v1', KEY_LEN);
  return cachedKey;
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decrypt(envelope: string): string {
  const key = getKey();
  const buf = Buffer.from(envelope, 'base64');
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error('Envelope SMTP encriptado corrompido (tamanho inválido)');
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
