const crypto = require('crypto');

// TOTP (RFC 6238) compatible avec toute application d'authentification
// (Bitwarden, Google/Microsoft Authenticator, Duo Mobile, ...).

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const DIGITS = 6;
const PERIOD = 30; // secondes
const ISSUER = 'Contrats';

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = String(str || '').toUpperCase().replace(/[\s=]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const c of clean) {
    const idx = ALPHABET.indexOf(c);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function generateSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

// HOTP : HMAC-SHA1 + troncature dynamique
function hotp(secret, counter) {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(code % 10 ** DIGITS).padStart(DIGITS, '0');
}

function totp(secret, timeMs = Date.now()) {
  return hotp(secret, Math.floor(timeMs / 1000 / PERIOD));
}

// Vérifie un code en tolérant une dérive d'horloge de ±window périodes.
function verifyTotp(token, secret, window = 1) {
  const code = String(token || '').replace(/\D/g, '');
  if (!secret || code.length !== DIGITS) return false;
  const counter = Math.floor(Date.now() / 1000 / PERIOD);
  for (let i = -window; i <= window; i += 1) {
    if (hotp(secret, counter + i) === code) return true;
  }
  return false;
}

function keyuri(secret, username, issuer = ISSUER) {
  const label = encodeURIComponent(`${issuer}:${username || ''}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(PERIOD)
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

module.exports = { generateSecret, base32Encode, base32Decode, hotp, totp, verifyTotp, keyuri, ISSUER };
