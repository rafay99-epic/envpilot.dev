export interface ResolvedFeature {
  key: string;
  displayName: string;
  valueType: string;
  value: boolean | number | null;
}

export function generateFeatureLines(features: ResolvedFeature[]): string[] {
  const lines: string[] = [];
  for (const f of features) {
    if (f.valueType === "numeric") {
      if (f.value === null)
        lines.push(
          `Unlimited ${f.displayName.toLowerCase().replace(/^max\s*/i, "")}`
        );
      else if (typeof f.value === "number")
        lines.push(
          `${f.value} ${f.displayName.toLowerCase().replace(/^max\s*/i, "")}`
        );
    } else if (f.valueType === "boolean" && f.value === true) {
      lines.push(f.displayName);
    }
  }
  return lines.slice(0, 8);
}
