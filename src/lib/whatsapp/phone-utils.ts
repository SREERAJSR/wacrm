/**
 * Sanitize phone number for Meta WhatsApp API.
 * Meta requires digits only — no + prefix, no spaces, no dashes.
 * e.g. "+370 63949836" → "37063949836"
 */
export function sanitizePhoneForMeta(phone: string): string {
  if (!phone) return ''
  return phone.replace(/\D/g, '')
}

/**
 * Normalize phone number by removing all non-digit characters.
 * Used for comparing phone numbers in different formats.
 */
export function normalizePhone(phone: string): string {
  if (!phone) return ''
  return phone.replace(/\D/g, '')
}

/**
 * Compare two phone numbers accounting for trunk prefix differences.
 * e.g. "370063949836" (with trunk 0) matches "37063949836" (without trunk 0)
 * by comparing the last 8 digits.
 */
export function phonesMatch(phone1: string, phone2: string): boolean {
  const n1 = normalizePhone(phone1)
  const n2 = normalizePhone(phone2)
  if (n1 === n2) return true
  if (n1.length >= 8 && n2.length >= 8) {
    return n1.slice(-8) === n2.slice(-8)
  }
  return false
}

/**
 * Validate phone number is E.164-like format (7-15 digits starting with non-zero).
 * Accepts with or without + prefix.
 */
export function isValidE164(phone: string): boolean {
  return /^\+?[1-9]\d{6,14}$/.test(phone)
}

/**
 * High-traffic country calling codes we try when a stored contact
 * phone looks national-only (missing the country code). Meta's
 * sandbox allowlist and Cloud API sends require full international
 * digits (e.g. `918547905362`); contacts often get saved as local
 * mobile numbers (`8547905362`), so the developer console works while
 * CRM sends fail with #131030.
 *
 * Order is roughly WhatsApp usage / how often local-only contacts
 * show up in our support tickets — not exhaustive.
 */
const FALLBACK_COUNTRY_CODES = [
  '1', // US/CA
  '91', // IN
  '44', // GB
  '55', // BR
  '49', // DE
  '62', // ID
  '52', // MX
  '57', // CO
  '370', // LT (project origin)
] as const

/**
 * Generate plausible phone number variants for retry when Meta's
 * sandbox rejects a number with error #131030 ("not in allowed list").
 *
 * Many countries use a "trunk prefix" 0 for domestic dialing that is
 * meant to be dropped in international format (e.g. Lithuanian
 * "+370 063 949 836" domestically → "+370 63 949 836" international).
 * But some sandboxes register the number with the trunk 0 included,
 * causing sends to the correct international format to fail.
 *
 * This helper yields:
 *   1. The original sanitized number (first attempt)
 *   2. With a trunk 0 inserted after the country code
 *   3. With a trunk 0 removed after the country code
 *   4. With a common country calling code prepended (when the number
 *      looks national-only — typical 8–11 digit local mobiles)
 *
 * Country-code lengths of 1, 2, and 3 digits are tried because we
 * don't know the user's country ahead of time.
 *
 * @param sanitized - digits-only phone number (from sanitizePhoneForMeta)
 * @returns deduplicated list of variants, original first
 */
export function phoneVariants(sanitized: string): string[] {
  if (!sanitized) return []
  const seen = new Set<string>()
  const push = (v: string) => {
    if (v && !seen.has(v)) seen.add(v)
  }

  // 1. Original
  push(sanitized)

  // 2. Insert a 0 after each plausible country-code length
  for (const ccLen of [1, 2, 3]) {
    if (sanitized.length <= ccLen) continue
    const cc = sanitized.slice(0, ccLen)
    const rest = sanitized.slice(ccLen)
    if (!rest.startsWith('0')) {
      push(cc + '0' + rest)
    }
  }

  // 3. Remove a leading 0 after each plausible country-code length
  for (const ccLen of [1, 2, 3]) {
    if (sanitized.length <= ccLen + 1) continue
    const cc = sanitized.slice(0, ccLen)
    const rest = sanitized.slice(ccLen)
    if (rest.startsWith('0')) {
      push(cc + rest.slice(1))
    }
  }

  // 4. Prepend common country codes when the stored number looks like
  // it omitted the calling code. Skip numbers that already look
  // international (12+ digits) so we don't explode long E.164 values.
  if (sanitized.length >= 8 && sanitized.length <= 11) {
    for (const cc of FALLBACK_COUNTRY_CODES) {
      if (sanitized.startsWith(cc)) continue
      const candidate = cc + sanitized
      // E.164 max is 15 digits
      if (candidate.length <= 15) push(candidate)
    }
  }

  return [...seen]
}

/**
 * Prefer Meta's WhatsApp Cloud API `from` / `wa_id` over a previously
 * stored contact phone when they refer to the same number but differ
 * in format (missing country code, trunk-0, etc.).
 *
 * Example: contact saved as `8547905362`, inbound from `918547905362`
 * → return `918547905362` so outbound sends match the allowlist.
 */
export function preferMetaWhatsAppId(
  storedPhone: string,
  metaWhatsAppId: string,
): string | null {
  const stored = normalizePhone(storedPhone)
  const incoming = normalizePhone(metaWhatsAppId)
  if (!incoming || !stored || incoming === stored) return null
  if (!phonesMatch(stored, incoming)) return null
  // Meta's Cloud API ID is the authoritative send destination.
  return incoming
}

/**
 * Returns true when the Meta API error indicates the recipient
 * phone number isn't in the allowed list (sandbox restriction).
 * Detected via error code 131030 or the standard error text.
 */
export function isRecipientNotAllowedError(message: string): boolean {
  return /131030|not in allowed list|not in the allowed list/i.test(message)
}
