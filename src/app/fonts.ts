import localFont from "next/font/local";

export const onest = localFont({
  src: "../../public/fonts/onest-variable.ttf",
  variable: "--font-sans",
  weight: "100 900",
  style: "normal",
  display: "swap",
  preload: true,
});

export const bricolage = localFont({
  src: "../../public/fonts/bricolage-grotesque-variable.ttf",
  variable: "--font-heading",
  weight: "200 800",
  style: "normal",
  display: "swap",
  preload: true,
});

