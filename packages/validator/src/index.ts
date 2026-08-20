export interface ValidationSummary {
  passed: boolean;
  failures: string[];
}

export function createEmptyValidationSummary(): ValidationSummary {
  return {
    passed: true,
    failures: []
  };
}
