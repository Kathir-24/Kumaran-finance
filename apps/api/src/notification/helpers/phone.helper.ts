// ==============================================================================
// Kumaran Chits — Indian Phone Number Normalizer & PII Masker
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: Indian DPDP Act 2023, TRAI Telecom Standards
// ==============================================================================

export class PhoneHelper {
  /**
   * Normalizes an Indian phone number to standard 12-digit MSISDN format (91XXXXXXXXXX).
   * Strips all non-digit characters, spaces, dashes, and leading zeros.
   *
   * Examples:
   *   "9842143210"       -> "919842143210"
   *   "09842143210"      -> "919842143210"
   *   "+91 98421 43210"  -> "919842143210"
   *   "919842143210"     -> "919842143210"
   */
  static formatIndianMsisdn(phone: string): string {
    if (!phone) {
      return '';
    }

    const digits = phone.replace(/\D/g, '');

    // 10 digits standard mobile (e.g. 9842143210)
    if (digits.length === 10) {
      return `91${digits}`;
    }

    // 11 digits with leading 0 (e.g. 09842143210)
    if (digits.length === 11 && digits.startsWith('0')) {
      return `91${digits.slice(1)}`;
    }

    // 12 digits starting with 91 (e.g. 919842143210)
    if (digits.length === 12 && digits.startsWith('91')) {
      return digits;
    }

    // Fallback: return sanitized digits
    return digits;
  }

  /**
   * Validates if the phone number is a valid 10-digit Indian mobile number
   * (starts with 6, 7, 8, or 9).
   */
  static isValidIndianMobile(phone: string): boolean {
    const formatted = this.formatIndianMsisdn(phone);
    if (formatted.length !== 12 || !formatted.startsWith('91')) {
      return false;
    }

    const localPart = formatted.slice(2);
    // Indian mobile numbers start with 6, 7, 8, or 9
    return /^[6-9]\d{9}$/.test(localPart);
  }

  /**
   * Masks a phone number for secure logging to comply with the Indian DPDP Act 2023.
   * Retains the country code and last 4 digits while masking the middle 6 digits.
   *
   * Example: "919842143210" -> "+91******3210"
   */
  static maskPhone(phone: string): string {
    const formatted = this.formatIndianMsisdn(phone);
    if (formatted.length < 10) {
      return '***';
    }

    const last4 = formatted.slice(-4);
    return `+91******${last4}`;
  }
}
