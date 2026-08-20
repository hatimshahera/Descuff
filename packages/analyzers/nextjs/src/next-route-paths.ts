import { basename, dirname, extname, relative, sep } from "node:path";
import type { RouterKind } from "@descuff/ir";

const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);

export function isSourceFile(path: string): boolean {
  return sourceExtensions.has(extname(path));
}

export function getRouteKind(rootDir: string, filePath: string): RouterKind {
  const segments = relative(rootDir, filePath).split(sep);

  if (segments[0] === "app") {
    return "next-app";
  }

  if (segments[0] === "pages") {
    return "next-pages";
  }

  return "unknown";
}

export function appPagePath(rootDir: string, filePath: string): string | undefined {
  if (basename(filePath, extname(filePath)) !== "page") {
    return undefined;
  }

  const segments = relative(rootDir, dirname(filePath)).split(sep);
  if (segments[0] !== "app") {
    return undefined;
  }

  return routeSegmentsToPath(segments.slice(1));
}

export function appApiPath(rootDir: string, filePath: string): string | undefined {
  if (basename(filePath, extname(filePath)) !== "route") {
    return undefined;
  }

  const segments = relative(rootDir, dirname(filePath)).split(sep);
  if (segments[0] !== "app") {
    return undefined;
  }

  return routeSegmentsToPath(segments.slice(1));
}

export function pagesRoutePath(rootDir: string, filePath: string): string | undefined {
  if (!isSourceFile(filePath)) {
    return undefined;
  }

  const segments = relative(rootDir, filePath).split(sep);
  if (segments[0] !== "pages" || segments[1] === "api" || segments.at(-1)?.startsWith("_")) {
    return undefined;
  }

  const withoutExtension = segments.slice(1);
  withoutExtension[withoutExtension.length - 1] = basename(filePath, extname(filePath));

  return routeSegmentsToPath(withoutExtension);
}

export function pagesApiPath(rootDir: string, filePath: string): string | undefined {
  if (!isSourceFile(filePath)) {
    return undefined;
  }

  const segments = relative(rootDir, filePath).split(sep);
  if (segments[0] !== "pages" || segments[1] !== "api") {
    return undefined;
  }

  const withoutExtension = segments.slice(1);
  withoutExtension[withoutExtension.length - 1] = basename(filePath, extname(filePath));

  return routeSegmentsToPath(withoutExtension);
}

function routeSegmentsToPath(segments: string[]): string {
  const normalized = segments
    .filter((segment) => segment !== "index" && !isRouteGroup(segment))
    .map((segment) => segment.replace(/^\[(.+)\]$/, "{$1}"));

  return normalized.length === 0 ? "/" : `/${normalized.join("/")}`;
}

function isRouteGroup(segment: string): boolean {
  return segment.startsWith("(") && segment.endsWith(")");
}
