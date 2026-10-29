# KLAY AI UI sistemi

Ortak kaynaklar: `src/app/globals.css`, `src/app/fonts.ts`, `src/components/ui/button.tsx`.

## Tipografi

- Başlıklar: **Bricolage Grotesque**, değişken ağırlık 200–800; otomatik optik boyutlandırma. Varsayılan başlık ağırlığı 600, satır yüksekliği 1.15, harf aralığı -0.035em.
- Gövde, formlar ve UI: **Onest**, değişken ağırlık 100–900. Gövde 400, yardımcı UI 500, butonlar 600.
- İki font `next/font/local` ile yerel sunulur. `display: swap`, preload ve Next.js fallback metrikleri kullanılır. Derleme veya tarayıcı sırasında harici font servisine ihtiyaç yoktur.
- Türkçe `ÇĞİÖŞÜçğıöşü`, İngilizce, rakamlar ve temel tipografik noktalama font dosyalarının Unicode tablolarından test edilir. OFL lisansları `public/fonts/` içinde korunur.

| Rol | Token | Boyut | Satır yüksekliği |
| --- | --- | --- | --- |
| Vitrin başlığı | `--text-display` | 44–88 px, akışkan | `--leading-heading` |
| Sayfa başlığı | `--text-heading-1` | 32–56 px, akışkan | `--leading-heading` |
| Bölüm başlığı | `--text-heading-2` | 24–40 px, akışkan | `--leading-heading` |
| Alt başlık | `--text-heading-3` | 20 px | `--leading-heading` |
| Gövde | `--text-body` | 16 px | `--leading-body`: 1.6 |
| UI / buton | `--text-ui` | 14 px | UI: 1.4, buton: 1.25 |
| Küçük metin | `--text-small` | 13 px | `--leading-small`: 1.5 |
| Açıklama / etiket | `--text-caption` | 12 px | `--leading-small`: 1.5 |

Mevcut sayfa kompozisyonları korunur. Ortak ölçek CSS dosyalarındaki tekrarlanan boyutlara bağlanmıştır; 10–11 px açıklamalar 12 px tabanına yükseltilmiştir. `type-display`, `type-heading-1/2/3`, `type-body`, `type-small` ve `type-caption` yardımcı sınıfları yeni yüzeylerde kullanılabilir. `SectionHeading` aynı ölçeği kullanır.

## Aksiyonlar

Tek React bileşeni `Button`; aynı görsel sistemi mevcut locale-aware `Link` üzerinde kullanmak için `buttonStyles`.

| Variant | Kullanım |
| --- | --- |
| `primary` | Pembe marka vurgulu ana aksiyon; üretim, kaydetme, başlama |
| `secondary` | Sakin, kenarlıklı ikincil aksiyon |
| `ghost` | Minimal yardımcı aksiyon |
| `outline` | Hafif seçim aksiyonu; toggle gerekiyorsa `aria-pressed` |
| `destructive` | Geri döndürülemez işlemin onayı |
| `icon` | İkon aksiyonu; erişilebilir ad zorunlu, `shape="round"` isteğe bağlı |
| `dark` | Mevcut çağrılar için korunan nötr/kontrast varyantı |

- Boyutlar: `sm` 36 px, `md` 44 px, `lg` 52 px minimum yükseklik. Dokunmatik cihazlarda `sm` en az 44 px olur. Uzun çeviriler gerektiğinde sarılabilir.
- Radius `--button-radius`, ikon 18 px, ikon/metin aralığı 8 px; yatay padding boyuta göre 14/20/24 px.
- Primary hover: 1 px yükselme, hafif renk ve gölge geçişi. Secondary/outline: yüzey ve kenarlık. Ghost/icon: hafif yüzey vurgusu. Active: 1 px basılma.
- Geçiş 180 ms; focus-visible belirgin outline ve dış halka. Reduced motion durumunda hareket ve spinner animasyonu durur.
- `loading` spinner gösterir ve native butonu devre dışı bırakır. `loadingLabel` çağıranın çevrilmiş metnidir. Mevcut `aria-busy` kullanımları spinner kazanır; mevcut `disabled` ve tıklama politikası korunur.
- Formların `type`, `form`, `formAction`, ref ve event handler'ları aktarılır. Varsayılan type `button` olarak korunur.

```tsx
<Button onClick={createVideo} disabled={!approved}>...</Button>
<Button variant="secondary" type="submit" loading={pending} loadingLabel={t("saving")}>...</Button>
<Button variant="destructive" onClick={confirmDelete}>...</Button>
<Button variant="icon" aria-label={t("preview")}><PreviewIcon /></Button>
<Link href="/dashboard/create" className={buttonStyles({ variant: "primary" })}>...</Link>
```

Locale-aware Link kendi navigation modülünden alınır. Seçim kartları, sekmeler, medya yüzeyleri ve menüler mevcut semantik rollerini, klavye davranışlarını ve özel yerleşimlerini korur; sırf görünüm için Button'a dönüştürülmez. Koyu demo paneli gibi özel bağlamlar ortak sistemin `--action-text` ve `--action-hover-bg` değişkenlerini kullanabilir.

## Uygulanan yüzeyler ve doğrulama

Ortak bileşenler, landing/menü CTA'ları, giriş/kayıt/iletişim formları, dashboard aksiyonları, proje yönetimi, medya görüntüleyici, model kütüphanesi ve video alanları güncellendi. Kaynak kartları ve filtreler kendi seçim semantiğini korur. Backend, API, provider, veri tabanı veya bütçe kuralları değiştirilmedi.

- `tests/design-system.test.ts`: font glifleri/lisanslar, event/ref/form aktarımı, loading/disabled, link semantiği ve ortak varyantlar.
- `scripts/verify-video-studio-design.mjs`: gerçek UI bileşenleri, yerel test verileri ve kapalı dış ağ ile Video Studio, ortak sistem örnekleri, gerçek LoginForm ve ModelLibrary. TR/EN, responsive, light/dark, klavye, focus, hover geometri, metin kontrastı ve reduced motion kontrolleri.
- Script, mevcut geliştirme araçları olan esbuild, PostCSS ve ffmpeg-static'i kullanır. Playwright mevcut kurulumdan `VIDEO_QA_PLAYWRIGHT_MODULE` ile seçilebilir; projeye paket eklenmez. Ekran görüntüleri için `VIDEO_QA_ARTIFACT_DIR` kullanılabilir.

Gerçek hesapla ücretli üretim, oturum açma ve silme gibi servis işlemleri bu UI kontrolünde çalıştırılmaz.

## Değişen dosyalar


### Ortak sistem ve tipografi

- `AGENTS.md`
- `src/app/[locale]/layout.tsx`
- `src/app/fonts.ts`
- `src/app/global-error.tsx`
- `src/app/global-not-found.tsx`
- `src/app/globals.css`
- `src/components/ui/button.tsx`
- `src/components/ui/section-heading.tsx`

### Sayfa ve bileşen uyarlamaları

- `src/app/[locale]/dashboard/account/settings.module.css`
- `src/app/[locale]/dashboard/projects/page.tsx`
- `src/components/auth/google-button.tsx`
- `src/components/auth/login-form.tsx`
- `src/components/auth/password-field.tsx`
- `src/components/auth/signup-form.tsx`
- `src/components/contact/contact-form.tsx`
- `src/components/dashboard/creative-preset-rail.tsx`
- `src/components/dashboard/dashboard-account-menu.module.css`
- `src/components/dashboard/dashboard-home.module.css`
- `src/components/dashboard/dashboard-mobile-nav.tsx`
- `src/components/dashboard/dashboard-sidebar.module.css`
- `src/components/dashboard/dashboard-sidebar.tsx`
- `src/components/dashboard/dashboard-workflow-rail.tsx`
- `src/components/dashboard/notification-center.tsx`
- `src/components/dashboard/recent-generations-gallery.tsx`
- `src/components/dashboard/workspace-create-action.tsx`
- `src/components/layout/mobile-navigation.tsx`
- `src/components/layout/navbar-client.tsx`
- `src/components/projects/delete-project-modal.tsx`
- `src/components/projects/generation-gallery.tsx`
- `src/components/projects/generation-progress-modal.tsx`
- `src/components/projects/product-image-upload.tsx`
- `src/components/projects/project-card-menu.tsx`
- `src/components/projects/project-delete-button.tsx`
- `src/components/projects/project-image-viewer.tsx`
- `src/components/projects/project-title-editor.tsx`
- `src/components/projects/projects-selection.module.css`
- `src/components/projects/projects-selection.tsx`
- `src/components/projects/reference-asset-list.tsx`
- `src/components/sections/hero.tsx`
- `src/components/sections/workspace-chat.tsx`
- `src/components/theme/theme-preference-control.module.css`
- `src/components/ui/favorite-button.tsx`
- `src/features/generation/creation-canvas.module.css`
- `src/features/generation/creation-workspace.module.css`
- `src/features/models/model-create.module.css`
- `src/features/models/model-create.tsx`
- `src/features/models/model-library.tsx`
- `src/features/models/model-studio.module.css`
- `src/features/ugc/ugc-studio-workspace.module.css`
- `src/features/video/video-canvas.tsx`
- `src/features/video/video-director-panel.tsx`
- `src/features/video/video-fidelity-analysis.module.css`
- `src/features/video/video-fidelity-analysis.tsx`
- `src/features/video/video-generation-inspector.tsx`
- `src/features/video/video-job-progress.tsx`
- `src/features/video/video-library.module.css`
- `src/features/video/video-library.tsx`
- `src/features/video/video-preservation-controls.tsx`
- `src/features/video/video-source-selector.tsx`
- `src/features/video/video-studio-workspace.module.css`
- `src/features/video/video-studio-workspace.tsx`
- `src/messages/en.json`
- `src/messages/tr.json`

### Font dosyaları ve lisanslar

- `public/fonts/README.md`
- `public/fonts/bricolage-grotesque-OFL.txt`
- `public/fonts/bricolage-grotesque-variable.ttf`
- `public/fonts/onest-OFL.txt`
- `public/fonts/onest-variable.ttf`

### Doğrulama ve rehber

- `docs/design-system.md`
- `scripts/verify-video-studio-design.mjs`
- `tests/design-system.test.ts`
- `tests/video-studio-ui.test.ts`
