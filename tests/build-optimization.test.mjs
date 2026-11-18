import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const vite = await readFile(new URL("../vite.config.js", import.meta.url), "utf8");
const css = await readFile(new URL("../index.css", import.meta.url), "utf8");

test("production build splits Firebase, React and Lucide vendor code into cacheable chunks", () => {
  assert.match(vite, /manualChunks\(id\)/);
  assert.match(vite, /firebase-vendor/);
  assert.match(vite, /react-vendor/);
  assert.match(vite, /return 'icons'/);
});

test("light theme background override uses a valid attribute selector", () => {
  assert.match(css, /\[class~="bg-\[#050505\]"\]/);
  assert.doesNotMatch(css, /\.bg-\\\\\[\\\\#050505\\\\\]/);
});
