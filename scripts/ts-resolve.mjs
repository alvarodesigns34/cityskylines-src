// Resolver para `node --test` con TypeScript: el proyecto usa imports sin extensión
// (resolución de bundler), que Node no resuelve por sí solo.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function resolve(specifier, context, next) {
  let spec = specifier;
  if (spec.startsWith("@/")) spec = path.join(ROOT, "src", spec.slice(2));
  const relative = spec.startsWith("./") || spec.startsWith("../") || path.isAbsolute(spec);
  if (relative && !/\.[cm]?[jt]sx?$/i.test(spec)) {
    const base = context.parentURL ? path.dirname(fileURLToPath(context.parentURL)) : process.cwd();
    for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
      const candidate = path.resolve(base, spec + ext);
      if (existsSync(candidate)) return next(pathToFileURL(candidate).href, context);
    }
  }
  if (spec !== specifier) return next(pathToFileURL(spec).href, context);
  return next(specifier, context);
}
