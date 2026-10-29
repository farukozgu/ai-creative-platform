import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement, isValidElement, type ButtonHTMLAttributes } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, buttonStyles, type ButtonVariant } from "../src/components/ui/button";

function hasGlyph(font: Buffer, code: number) {
  const tables = font.readUInt16BE(4);
  let cmap = 0;
  for (let i = 0; i < tables; i++) {
    const record = 12 + i * 16;
    if (font.toString("ascii", record, record + 4) === "cmap") cmap = font.readUInt32BE(record + 8);
  }
  assert.ok(cmap, "Font has a Unicode character map");
  for (let i = 0; i < font.readUInt16BE(cmap + 2); i++) {
    const subtable = cmap + font.readUInt32BE(cmap + 4 + i * 8 + 4);
    if (font.readUInt16BE(subtable) !== 4) continue;
    const count = font.readUInt16BE(subtable + 6) / 2;
    const ends = subtable + 14, starts = ends + count * 2 + 2;
    const deltas = starts + count * 2, offsets = deltas + count * 2;
    for (let segment = 0; segment < count; segment++) {
      const start = font.readUInt16BE(starts + segment * 2), end = font.readUInt16BE(ends + segment * 2);
      if (code < start || code > end) continue;
      const delta = font.readInt16BE(deltas + segment * 2), offset = font.readUInt16BE(offsets + segment * 2);
      if (!offset) return ((code + delta) & 0xffff) !== 0;
      const glyph = font.readUInt16BE(offsets + segment * 2 + offset + (code - start) * 2);
      return glyph !== 0 && ((glyph + delta) & 0xffff) !== 0;
    }
  }
  return false;
}

test("both local variable fonts contain Turkish and English glyphs, punctuation and licenses", () => {
  for (const family of ["bricolage-grotesque", "onest"]) {
    const font = readFileSync(`public/fonts/${family}-variable.ttf`);
    for (const char of "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÇĞİÖŞÜçğıöşü0123456789€$’“”—…") {
      assert.ok(hasGlyph(font, char.codePointAt(0)!), `${family}: ${char}`);
    }
    assert.match(readFileSync(`public/fonts/${family}-OFL.txt`, "utf8"), /SIL OPEN FONT LICENSE/);
  }
  const configuration = readFileSync("src/app/fonts.ts", "utf8");
  assert.match(configuration, /next\/font\/local/);
  assert.doesNotMatch(configuration, /next\/font\/google|https?:/);
  assert.match(configuration, /weight: "100 900"/);
  assert.match(configuration, /weight: "200 800"/);
});

test("Button preserves handlers, refs, form submission and the caller's disabled state", () => {
  const onClick = () => undefined;
  const ref = { current: null };
  const node = Button({ children: "Kaydet", type: "submit", onClick, ref, form: "settings", disabled: true });
  assert.ok(isValidElement<ButtonHTMLAttributes<HTMLButtonElement> & { ref: typeof ref }>(node));
  assert.equal(node.type, "button");
  assert.equal(node.props.onClick, onClick);
  assert.equal(node.props.ref, ref);
  assert.equal(node.props.type, "submit");
  assert.equal(node.props.form, "settings");
  assert.equal(node.props.disabled, true);
  assert.equal(Button({ children: "Open" }).props.type, "button");
});

test("loading exposes a single accessible label, busy state and a decorative spinner", () => {
  const html = renderToStaticMarkup(createElement(Button, { loading: true, loadingLabel: "Kaydediliyor…" }, "Kaydet"));
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /disabled=""/);
  assert.match(html, /ui-button__spinner[^>]*aria-hidden="true"/);
  assert.equal(html.split("Kaydediliyor…").length - 1, 1);
  assert.doesNotMatch(html, /button-label-copy|button-roll|loadingLabel=/);
  const busyOnly = Button({ "aria-busy": true, children: "Working" });
  assert.equal(busyOnly.props.disabled, false, "aria-busy alone does not change click policy");
});

test("action links keep href and locale-aware links can reuse only the styles", () => {
  const html = renderToStaticMarkup(createElement(Button, { href: "/tr/dashboard", variant: "secondary" }, "Aç"));
  assert.match(html, /href="\/tr\/dashboard"/);
  assert.match(html, /ui-button--secondary/);
  assert.doesNotMatch(html, /<button/);
  assert.equal(buttonStyles({ variant: "outline", size: "sm", className: "w-full" }), "ui-button ui-button--outline ui-button--sm w-full");
});

test("every action role shares sizing, focus, short transitions and reduced motion", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  for (const variant of ["primary", "secondary", "ghost", "outline", "destructive", "icon"]) {
    assert.ok(buttonStyles({ variant: variant as ButtonVariant }).includes(`ui-button--${variant}`));
    assert.ok(css.includes(`.ui-button--${variant}`));
  }
  assert.match(css, /--button-transition-duration: 180ms/);
  assert.match(css, /\.ui-button\.ui-button:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.ui-button__spinner \{ animation: none/);
  assert.doesNotMatch(css, /button-label-copy|button-roll/);
});
