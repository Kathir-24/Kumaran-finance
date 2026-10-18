export class RupeeWordsHelper {
  private static readonly ONES_EN = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ];

  private static readonly TENS_EN = [
    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
  ];

  /**
   * Converts a BigInt Indian Rupee amount into English words.
   * Uses Indian numbering units: Crore, Lakh, Thousand, Hundred.
   */
  static toEnglishWords(amount: bigint): string {
    if (amount === 0n) {
      return 'Zero Rupees Only';
    }

    if (amount < 0n) {
      return `Minus ${this.toEnglishWords(-amount)}`;
    }

    let num = Number(amount);
    if (amount > BigInt(Number.MAX_SAFE_INTEGER)) {
      num = Number(amount); // For extreme values
    }

    const parts: string[] = [];

    const crores = Math.floor(num / 10000000);
    num %= 10000000;

    const lakhs = Math.floor(num / 100000);
    num %= 100000;

    const thousands = Math.floor(num / 1000);
    num %= 1000;

    const hundreds = Math.floor(num / 100);
    const remainder = num % 100;

    if (crores > 0) {
      parts.push(`${this.convertSubThousandEn(crores)} Crore`);
    }
    if (lakhs > 0) {
      parts.push(`${this.convertSubThousandEn(lakhs)} Lakh`);
    }
    if (thousands > 0) {
      parts.push(`${this.convertSubThousandEn(thousands)} Thousand`);
    }
    if (hundreds > 0) {
      parts.push(`${this.ONES_EN[hundreds]} Hundred`);
    }
    if (remainder > 0) {
      parts.push(this.convertRemainderEn(remainder));
    }

    return `${parts.join(' ')} Rupees Only`;
  }

  private static convertSubThousandEn(n: number): string {
    const parts: string[] = [];
    const hundreds = Math.floor(n / 100);
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
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return ones > 0 ? `${this.TENS_EN[tens]} ${this.ONES_EN[ones]}` : this.TENS_EN[tens];
  }

  /**
   * Converts a BigInt Indian Rupee amount into Tamil words.
   * e.g. 3750 -> "ரூபாய் மூன்றாயிரத்து எழுநூற்று ஐம்பது மட்டும்"
   * e.g. 100000 -> "ரூபாய் ஒரு லட்சம் மட்டும்"
   */
  static toTamilWords(amount: bigint): string {
    if (amount === 0n) {
      return 'ரூபாய் பூஜ்ஜியம் மட்டும்';
    }

    if (amount < 0n) {
      return `கழித்தல் ${this.toTamilWords(-amount)}`;
    }

    let num = Number(amount);
    const parts: string[] = [];

    const crores = Math.floor(num / 10000000);
    num %= 10000000;

    const lakhs = Math.floor(num / 100000);
    num %= 100000;

    const thousands = Math.floor(num / 1000);
    num %= 1000;

    const hundreds = Math.floor(num / 100);
    const rem = num % 100;

    if (crores > 0) {
      parts.push(`${this.getTamilSubThousand(crores)} கோடி`);
    }
    if (lakhs > 0) {
      parts.push(`${this.getTamilSubThousand(lakhs)} லட்சம்`);
    }
    if (thousands > 0) {
      parts.push(this.getTamilThousands(thousands, hundreds > 0 || rem > 0));
    }
    if (hundreds > 0) {
      parts.push(this.getTamilHundreds(hundreds, rem > 0));
    }
    if (rem > 0) {
      parts.push(this.getTamilRemainder(rem));
    }

    return `ரூபாய் ${parts.join(' ')} மட்டும்`;
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
      1: 'ஒன்று', 2: 'இரண்டு', 3: 'மூன்று', 4: 'நான்கு', 5: 'ஐந்து',
      6: 'ஆறு', 7: 'ஏழு', 8: 'எட்டு', 9: 'ஒன்பது', 10: 'பத்து',
      11: 'பதினொன்று', 12: 'பன்னிரண்டு', 13: 'பreleaseதின்மூன்று', 14: 'பதினான்கு', 15: 'பதினைந்து',
      16: 'பதினாறு', 17: 'பதினேழு', 18: 'பதினெட்டு', 19: 'பத்தொன்பது',
      20: 'இருபது', 30: 'முப்பது', 40: 'நாற்பது', 50: 'ஐம்பது',
      60: 'அறுபது', 70: 'எழுபது', 80: 'எண்பது', 90: 'தொண்ணூறு',
    };

    if (direct[n]) return direct[n];

    const tens = Math.floor(n / 10) * 10;
    const ones = n % 10;

    const combiningTens: Record<number, string> = {
      20: 'இருபத்து', 30: 'முப்பத்து', 40: 'நாற்பத்து', 50: 'ஐம்பத்து',
      60: 'அறுபத்து', 70: 'எழுபத்து', 80: 'எண்பத்து', 90: 'தொண்ணூற்று',
    };

    return `${combiningTens[tens] || ''} ${direct[ones] || ''}`.trim();
  }

  private static getTamilSubThousand(n: number): string {
    const small: Record<number, string> = {
      1: 'ஒரு', 2: 'இரண்டு', 3: 'மூன்று', 4: 'நான்கு', 5: 'ஐந்து',
      6: 'ஆறு', 7: 'ஏழு', 8: 'எட்டு', 9: 'ஒன்பது', 10: 'பத்து',
      20: 'இருபது', 25: 'இருபத்தைந்து', 50: 'ஐம்பது',
    };
    return small[n] || String(n);
  }
}
