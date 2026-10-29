import type {Metadata} from "next";
import "./globals.css";
import { bricolage, onest } from "./fonts";

import {AppState} from "@/components/ui/app-state";
import {Button} from "@/components/ui/button";

export const metadata: Metadata = {title: "Page not found | Klay.ai"};

export default function GlobalNotFound() {
  return <html lang="tr" data-theme="light"><body className={`${onest.variable} ${bricolage.variable}`}><main className="app-state-page"><AppState code="404" icon="search" title="Bu sayfa bulunamadı" description="Aradığınız sayfa taşınmış, silinmiş veya hiç var olmamış olabilir." actions={<Button href="/tr/dashboard">Ana sayfaya dön</Button>} /></main></body></html>;
}
