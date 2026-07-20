import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const portal=readFileSync(new URL("../portal.js",import.meta.url),"utf8");
const css=readFileSync(new URL("../design-overrides.css",import.meta.url),"utf8");

test("native single selects are enhanced without changing their submitted value",()=>{
  assert.match(portal,/querySelectorAll\("select:not\(\[multiple\]\)"\)/);
  assert.match(portal,/select\.value=option\.value/);
  assert.match(portal,/new Event\("change",\{bubbles:true\}\)/);
  assert.match(portal,/enhanceSelects\(document\)/);
  assert.match(css,/\.custom-select-native/);
});

test("custom selects expose keyboard navigation and a responsive popover",()=>{
  assert.match(portal,/event\.key==="ArrowDown"/);
  assert.match(portal,/event\.key==="Escape"/);
  assert.match(portal,/aria-haspopup/);
  assert.match(css,/\.custom-select-popover/);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
});
