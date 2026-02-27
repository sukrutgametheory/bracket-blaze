/**
 * Phone number normalization utilities.
 * Normalizes to E.164 format with +91 (India) as default country code.
 */

const E164_PATTERN = /^\+[1-9]\d{6,14}$/

/**
 * Normalize a phone number to E.164 format.
 * - Strips all non-digit characters (except leading +)
 * - Prepends +91 if no country code provided
 * - Handles 0-prefixed Indian numbers (e.g., 09876543210)
 *
 * @returns Normalized phone string (e.g., "+919876543210"). May not be valid E.164 for
 *   malformed inputs — callers should validate with isValidE164() if needed.
 */
export function normalizePhone(raw: string): string {
  // Strip everything except digits and leading +
  let digits = raw.replace(/[^0-9+]/g, "")

  // If starts with +, keep it and strip + from the rest
  if (digits.startsWith("+")) {
    const rest = digits.slice(1).replace(/\+/g, "")
    digits = "+" + rest
  } else {
    // No + prefix — pure digits
    digits = digits.replace(/\+/g, "")

    // Handle 0-prefixed Indian numbers (e.g., 09876543210)
    if (digits.startsWith("0")) {
      digits = digits.slice(1)
    }

    // If 10 digits, assume Indian number
    if (digits.length === 10) {
      digits = "+91" + digits
    }
    // If 12 digits starting with 91, add +
    else if (digits.length === 12 && digits.startsWith("91")) {
      digits = "+" + digits
    }
    // Otherwise, just prepend +
    else {
      digits = "+" + digits
    }
  }

  return digits
}

/**
 * Check if a string is a valid E.164 phone number.
 */
export function isValidE164(phone: string): boolean {
  return E164_PATTERN.test(phone)
}
