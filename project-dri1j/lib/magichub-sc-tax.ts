/** South Carolina general state sales & use tax rate (verify annually with DOR). */
export const SC_STATE_SALES_TAX_PERCENT = 6;

export type ScTaxPreset = {
  id: string;
  label: string;
  /** Approximate combined state + local rate — verify for your county/city at sale time. */
  totalPercent: number;
};

/** Named presets for common retail pads (rates vary by locality; reps should verify). */
export const SC_TAX_PRESETS: ScTaxPreset[] = [
  { id: "sc-state-only", label: `SC state only (${SC_STATE_SALES_TAX_PERCENT}%)`, totalPercent: SC_STATE_SALES_TAX_PERCENT },
  { id: "sc-colombia", label: "Columbia area (~8%)", totalPercent: 8 },
  { id: "sc-charleston", label: "Charleston / Lowcountry (~9%)", totalPercent: 9 },
  { id: "sc-greenville", label: "Greenville / Upstate (~7%)", totalPercent: 7 },
  { id: "sc-myrtle", label: "Myrtle Beach / Grand Strand (~8%)", totalPercent: 8 },
  { id: "sc-custom", label: "Custom % (manual entry)", totalPercent: SC_STATE_SALES_TAX_PERCENT },
];

export function presetTotalPercent(presetId: string): number | undefined {
  return SC_TAX_PRESETS.find((p) => p.id === presetId)?.totalPercent;
}
