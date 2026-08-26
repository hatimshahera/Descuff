export function normalizePath(file: string): string {
  return file.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}
