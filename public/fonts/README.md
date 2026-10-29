# Local variable fonts

Downloaded from the official Google Fonts repository on 2026-10-28:

- [Bricolage Grotesque source and metadata](https://github.com/google/fonts/tree/main/ofl/bricolagegrotesque): original `BricolageGrotesque[opsz,wdth,wght].ttf`, saved as `bricolage-grotesque-variable.ttf`.
- [Onest source and metadata](https://github.com/google/fonts/tree/main/ofl/onest): original `Onest[wght].ttf`, saved as `onest-variable.ttf`.

Original font binaries are unchanged. Each font's SIL Open Font License is included next to it. Both contain Latin and Latin Extended glyphs; Turkish and English glyphs are verified by `tests/design-system.test.ts`.

`src/app/fonts.ts` loads these two variable files through `next/font/local` with swap, preloading and automatic fallback metrics. Font weights share the same binary. No external font request is needed at build time or in the browser.
