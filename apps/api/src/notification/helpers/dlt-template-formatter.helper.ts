// ==============================================================================
// Kumaran Chits — TRAI DLT Template Formatter Helper
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/02-requirements/notification-and-receipt-templates.md (§2)
// ==============================================================================

export class DltTemplateFormatter {
  /**
   * Sequentially interpolates positional variable values into TRAI DLT {#var#} placeholders.
   *
   * Example:
   *   template: "Kumaran Chits: Received Rs.{#var#} for Chit {#var#}, Ticket #{#var#} on {#var#}. Receipt: {#var#}"
   *   variables: ["3750", "KCA-1L-20M-01", "07", "17-Oct-2026", "KC-REC-001"]
   *   result: "Kumaran Chits: Received Rs.3750 for Chit KCA-1L-20M-01, Ticket #07 on 17-Oct-2026. Receipt: KC-REC-001"
   */
  static interpolate(templateText: string, variables: (string | number)[]): string {
    if (!templateText) {
      return '';
    }

    if (!variables || variables.length === 0) {
      return templateText;
    }

    let index = 0;
    return templateText.replace(/\{#var#\}/g, () => {
      const val = variables[index] !== undefined ? String(variables[index]) : '';
      index += 1;
      return val;
    });
  }

  /**
   * Maps an array of positional variables to an MSG91 variables object (var1, var2, var3...).
   *
   * Example:
   *   ["3750", "KCA-1L-20M-01", "07"] -> { var1: "3750", var2: "KCA-1L-20M-01", var3: "07" }
   */
  static toMsg91Variables(variables: (string | number)[]): Record<string, string> {
    const result: Record<string, string> = {};
    variables.forEach((val, idx) => {
      result[`var${idx + 1}`] = String(val);
    });
    return result;
  }
}
