export class RupeeWordsHelper {
  private static readonly ONES_EN = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];

  private static readonly TENS_EN = [
    '',
    '',
    'Twenty',
    'Thirty',
    'Forty',
    'Fifty',
    'Sixty',
    'Seventy',
    'Eighty',
    'Ninety',
  ];

  private static readonly CRORE = 10_000_000n;
  private static readonly LAKH = 100_000n;
  private static readonly THOUSAND = 1_000n;
  private static readonly HUNDRED = 100n;
  private static readonly COMMISSION_RATE_REGEX = /^(\d+)(?:\.(\d+))?$/;

  /**
   * Formats a whole-rupee BigInt using Indian comma grouping (e.g. 100000n -> "1,00,000").
   * Pure BigInt + string manipulation: zero IEEE-754 float conversion and zero paise decimals.
   */
  static formatWholeRupees(amount: bigint): string {
    if (typeof amount !== 'bigint') {
      throw new TypeError('Rupee amount must be a BigInt (whole rupees only)');
    }

    const isNegative = amount < 0n;
    const digits = (isNegative ? -amount : amount).toString();
    if (digits.length <= 3) {
      return isNegative ? `-${digits}` : digits;
    }

    const lastThree = digits.slice(-3);
    const leading = digits.slice(0, -3);
    const groupedLeading = leading.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    return `${isNegative ? '-' : ''}${groupedLeading},${lastThree}`;
  }

  /**
   * Formats a frozen foreman commission rate (Decimal / string / number) into a clean percentage label
   * without floating-point arithmetic (e.g. "4.00" -> "4.00%", 5 -> "5.00%", "3.5" -> "3.50%").
   * Falls back to "4.00%" only when rate is null/undefined/invalid.
   */
  static formatCommissionRatePercent(
    rate?: string | number | { toString(): string } | null,
  ): string {
    if (rate === null || rate === undefined) {
      return '4.00%';
    }
    const raw = String(rate).trim().replace(/%$/, '');
    const match = this.COMMISSION_RATE_REGEX.exec(raw);
    if (!match) {
      return '4.00%';
    }
    const whole = BigInt(match[1]).toString();
    const frac = (match[2] ?? '').padEnd(2, '0').slice(0, 2);
    return `${whole}.${frac}%`;
  }

  /**
   * Converts a BigInt Indian Rupee amount into English words using pure BigInt arithmetic.
   * Uses Indian numbering units: Crore, Lakh, Thousand, Hundred.
   * Handles arbitrarily large crore amounts beyond Number.MAX_SAFE_INTEGER with zero precision loss.
   */
  static toEnglishWords(amount: bigint): string {
    if (typeof amount !== 'bigint') {
      throw new TypeError('Rupee amount must be a BigInt (whole rupees only)');
    }

    if (amount === 0n) {
      return 'Zero Rupees Only';
    }

    if (amount < 0n) {
      return `Minus ${this.toEnglishWords(-amount)}`;
    }

    return `${this.convertPositiveBigIntEn(amount)} Rupees Only`;
  }

  private static convertPositiveBigIntEn(amount: bigint): string {
    const parts: string[] = [];

    const crores = amount / this.CRORE;
    let rem = amount % this.CRORE;

    const lakhs = rem / this.LAKH;
    rem %= this.LAKH;

    const thousands = rem / this.THOUSAND;
    rem %= this.THOUSAND;

    const hundreds = rem / this.HUNDRED;
    const subHundred = rem % this.HUNDRED;

    if (crores > 0n) {
      const croreWords =
        crores >= this.THOUSAND
          ? this.convertPositiveBigIntEn(crores)
          : this.convertSubThousandEn(Number(crores));
      parts.push(`${croreWords} Crore`);
    }
    if (lakhs > 0n) {
      parts.push(`${this.convertSubThousandEn(Number(lakhs))} Lakh`);
    }
    if (thousands > 0n) {
      parts.push(`${this.convertSubThousandEn(Number(thousands))} Thousand`);
    }
    if (hundreds > 0n) {
      parts.push(`${this.ONES_EN[Number(hundreds)]} Hundred`);
    }
    if (subHundred > 0n) {
      parts.push(this.convertRemainderEn(Number(subHundred)));
    }

    return parts.join(' ');
  }

  private static convertSubThousandEn(n: number): string {
    const parts: string[] = [];
    const hundreds = Math.trunc(n / 100);
    const rem = n % 100;

    if (hundreds > 0) {
      parts.push(`${this.ONES_EN[hundreds]} Hundred`);
    }
    if (rem > 0) {
      parts.push(this.convertRemainderEn(rem));
    }
    return parts.join(' ');
  }

  private static convertRemainderEn(n: number): string {
    if (n < 20) {
      return this.ONES_EN[n];
    }
    const tens = Math.trunc(n / 10);
    const ones = n % 10;
    return ones > 0 ? `${this.TENS_EN[tens]} ${this.ONES_EN[ones]}` : this.TENS_EN[tens];
  }

  /**
   * Converts a BigInt Indian Rupee amount into Tamil words using pure BigInt arithmetic.
   * e.g. 3750n -> "ரூபாய் மூன்றாயிரத்து எழுநூற்று ஐம்பது மட்டும்"
   * e.g. 100000n -> "ரூபாய் ஒரு லட்சம் மட்டும்"
   */
  static toTamilWords(amount: bigint): string {
    if (typeof amount !== 'bigint') {
      throw new TypeError('Rupee amount must be a BigInt (whole rupees only)');
    }

    if (amount === 0n) {
      return 'ரூபாய் பூஜ்ஜியம் மட்டும்';
    }

    if (amount < 0n) {
      return `கழித்தல் ${this.toTamilWords(-amount)}`;
    }

    return `ரூபாய் ${this.convertPositiveBigIntTa(amount)} மட்டும்`;
  }

  private static convertPositiveBigIntTa(amount: bigint): string {
    const parts: string[] = [];

    const crores = amount / this.CRORE;
    let rem = amount % this.CRORE;

    const lakhs = rem / this.LAKH;
    rem %= this.LAKH;

    const thousands = rem / this.THOUSAND;
    rem %= this.THOUSAND;

    const hundreds = rem / this.HUNDRED;
    const subHundred = rem % this.HUNDRED;

    if (crores > 0n) {
      const croreWords =
        crores >= this.THOUSAND
          ? this.convertPositiveBigIntTa(crores)
          : this.getTamilSubThousand(Number(crores));
      parts.push(`${croreWords} கோடி`);
    }
    if (lakhs > 0n) {
      parts.push(`${this.getTamilSubThousand(Number(lakhs))} லட்சம்`);
    }
    if (thousands > 0n) {
      parts.push(this.getTamilThousands(Number(thousands), hundreds > 0n || subHundred > 0n));
    }
    if (hundreds > 0n) {
      parts.push(this.getTamilHundreds(Number(hundreds), subHundred > 0n));
    }
    if (subHundred > 0n) {
      parts.push(this.getTamilRemainder(Number(subHundred)));
    }

    return parts.join(' ');
  }

  private static getTamilThousands(th: number, hasMore: boolean): string {
    const prefixes: Record<number, { standalone: string; combining: string }> = {
      1: { standalone: 'ஓராயிரம்', combining: 'ஆயிரத்து' },
      2: { standalone: 'இரண்டாயிரம்', combining: 'இரண்டாயிரத்து' },
      3: { standalone: 'மூன்றாயிரம்', combining: 'மூன்றாயிரத்து' },
      4: { standalone: 'நான்காயிரம்', combining: 'நான்காயிரத்து' },
      5: { standalone: 'ஐந்தாயிரம்', combining: 'ஐந்தாயிரத்து' },
      6: { standalone: 'ஆறாயிரம்', combining: 'ஆறாயிரத்து' },
      7: { standalone: 'ஏழாயிரம்', combining: 'ஏழாயிரத்து' },
      8: { standalone: 'எட்டாயிரம்', combining: 'எட்டாயிரத்து' },
      9: { standalone: 'ஒன்பதாயிரம்', combining: 'ஒன்பதாயிரத்து' },
      10: { standalone: 'பத்தாயிரம்', combining: 'பத்தாயிரத்து' },
    };

    if (prefixes[th]) {
      return hasMore ? prefixes[th].combining : prefixes[th].standalone;
    }

    const sub = this.getTamilSubThousand(th);
    return hasMore ? `${sub} ஆயிரத்து` : `${sub} ஆயிரம்`;
  }

  private static getTamilHundreds(h: number, hasMore: boolean): string {
    const hundreds: Record<number, { standalone: string; combining: string }> = {
      1: { standalone: 'நூறு', combining: 'நூற்று' },
      2: { standalone: 'இருநூறு', combining: 'இருநூற்று' },
      3: { standalone: 'முந்நூறு', combining: 'முந்நூற்று' },
      4: { standalone: 'நானூறு', combining: 'நானூற்று' },
      5: { standalone: 'ஐந்நூறு', combining: 'ஐந்நூற்று' },
      6: { standalone: 'அறுநூறு', combining: 'அறுநூற்று' },
      7: { standalone: 'எழுநூறு', combining: 'எழுநூற்று' },
      8: { standalone: 'எண்ணூறு', combining: 'எண்ணூற்று' },
      9: { standalone: 'தொள்ளாயிரம்', combining: 'தொள்ளாயிரத்து' },
    };

    if (hundreds[h]) {
      return hasMore ? hundreds[h].combining : hundreds[h].standalone;
    }
    return '';
  }

  private static getTamilRemainder(n: number): string {
    const direct: Record<number, string> = {
      1: 'ஒன்று',
      2: 'இரண்டு',
      3: 'மூன்று',
      4: 'நான்கு',
      5: 'ஐந்து',
      6: 'ஆறு',
      7: 'ஏழு',
      8: 'எட்டு',
      9: 'ஒன்பது',
      10: 'பத்து',
      11: 'பதினொன்று',
      12: 'பன்னிரண்டு',
      13: 'பதிமூன்று',
      14: 'பதினான்கு',
      15: 'பதினைந்து',
      16: 'பதினாறு',
      17: 'பதினேழு',
      18: 'பதினெட்டு',
      19: 'பத்தொன்பது',
      20: 'இருபது',
      30: 'முப்பது',
      40: 'நாற்பது',
      50: 'ஐம்பது',
      60: 'அறுபது',
      70: 'எழுபது',
      80: 'எண்பது',
      90: 'தொண்ணூறு',
    };

    if (direct[n]) return direct[n];

    const tens = Math.trunc(n / 10) * 10;
    const ones = n % 10;

    const combiningTens: Record<number, string> = {
      20: 'இருபத்து',
      30: 'முப்பத்து',
      40: 'நாற்பத்து',
      50: 'ஐம்பத்து',
      60: 'அறுபத்து',
      70: 'எழுபத்து',
      80: 'எண்பத்து',
      90: 'தொண்ணூற்று',
    };

    return `${combiningTens[tens] || ''} ${direct[ones] || ''}`.trim();
  }

  private static getTamilSubThousand(n: number): string {
    if (n === 1) return 'ஒரு';
    if (n === 25) return 'இருபத்தைந்து';
    if (n === 75) return 'எழுபத்தைந்து';

    const parts: string[] = [];
    const hundreds = Math.trunc(n / 100);
    const rem = n % 100;

    if (hundreds > 0) {
      parts.push(this.getTamilHundreds(hundreds, rem > 0));
    }
    if (rem > 0) {
      parts.push(this.getTamilRemainder(rem));
    }
    return parts.join(' ');
  }
}
