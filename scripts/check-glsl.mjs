/**
 * Catches backticks written inside a GLSL template literal.
 *
 * This broke the build three times in one day, always the same way: a prose
 * comment inside a glsl-tagged template quotes an identifier in backticks, the
 * backtick closes the template, and the rest of the shader is parsed as
 * JavaScript.
 *
 * It is worth a script because `tsc` does not catch it — the result is usually
 * still syntactically valid TypeScript — so the first sign is the dev server
 * returning 500 or, worse, the whole R3F tree unmounting, which makes the
 * screenshot harness fail at the biome picker with no shader error anywhere in
 * the log. Twice I diagnosed that as a scene bug before finding the quote.
 *
 * Escaped backticks are fine and are the fix, so they are not flagged.
 *
 *   node scripts/check-glsl.mjs
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = "src";

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(e.name)) yield p;
  }
}

/**
 * Where the template opened at `from` actually ends.
 *
 * Nesting has to be tracked, because these shaders are assembled with
 * `${cond ? \/* glsl *\/ `...` : ""}` and a scan for the next backtick stops on
 * the *inner* template's opener — which is what the first version of this
 * script did, and why it reported a file with a live bug in it as clean.
 */
function endOfTemplate(src, from) {
  let i = from;
  let depth = 0; // ${ } nesting inside this template
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") { i += 2; continue; }
    if (c === "$" && src[i + 1] === "{") { depth++; i += 2; continue; }
    if (c === "}" && depth > 0) { depth--; i++; continue; }
    if (c === "`") {
      if (depth === 0) return i;
      // A nested template inside an interpolation: skip the whole thing.
      const inner = endOfTemplate(src, i + 1);
      if (inner < 0) return -1;
      i = inner + 1;
      continue;
    }
    i++;
  }
  return -1;
}

let bad = 0;
for await (const file of walk(ROOT)) {
  const src = await readFile(file, "utf8");
  const re = /\/\* glsl \*\/\s*`/g;
  let m;
  while ((m = re.exec(src))) {
    const from = m.index + m[0].length;
    const end = endOfTemplate(src, from);
    if (end < 0) break;

    /*
     * The test is on the line the template ENDS on, and only that line.
     *
     * By definition there can be no unescaped backtick anywhere earlier — the
     * first one is what ended it — so the question is only ever whether the
     * terminator is the real one or a quote in prose. If the line it sits on is
     * a comment, it is a quote. Note the terminator itself is deliberately not
     * in the slice being tested, which is the trap the previous version fell
     * into: it scanned for a backtick in text that could not contain one.
     */
    const body = src.slice(from, end).split("\n");
    const endsOn = body[body.length - 1];
    if (/^\s*(\/\/|\*|\/\*)/.test(endsOn)) {
      const line = src.slice(0, end).split("\n").length;
      console.error(`${file}:${line}  backtick in a GLSL comment — it ends the template`);
      bad++;
    }
    re.lastIndex = end + 1;
  }
}

if (bad) {
  console.error(`\n${bad} backtick${bad === 1 ? "" : "s"} inside GLSL. Use plain words instead.`);
  process.exit(1);
}
console.log("GLSL templates clean.");
