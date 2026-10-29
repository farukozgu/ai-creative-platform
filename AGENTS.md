<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project Overview

Bu proje; takı, giyim ve kozmetik markalarının ürün fotoğraflarını kampanyaya hazır, gerçekçi görsel ve kısa videolara dönüştürmesine yardımcı olan AI destekli bir platformdur. Kullanıcı sektör, şablon, dijital model ve stil seçer. Ürünün renk, logo, desen ve formunu korumak temel önceliktir.

# Core Principles

- Önce sadelik, mobil uyumluluk, erişilebilirlik ve performans.
- Mevcut tasarım sistemini koru; gereksiz soyutlama veya dependency ekleme.
- Her görevde yalnızca istenen kapsamı değiştir; çalışan kodu sebepsiz yeniden yazma.
- Tasarım referanslarından ilham al, kodu, içeriği veya tasarımı birebir kopyalama.

# Project Structure

```text
src/
  app/                 # App Router rotaları ve sayfa girişleri
  components/
    ui/                # Genel, yeniden kullanılabilir UI bileşenleri
    layout/            # Navbar, Footer ve sayfa kabukları
    sections/          # Landing page bölümleri
  features/
    generation/        # Görsel/video üretim alanı
    templates/         # Şablon alanı
    models/            # Dijital model alanı
    projects/          # Kullanıcı proje alanı
  hooks/               # Paylaşılan React hook'ları
  lib/                 # Yardımcılar ve entegrasyonlar
  types/               # Paylaşılan TypeScript tipleri
  data/                # Statik içerik ve veri
```

- Tekrar kullanılabilir genel bileşenler `components/ui` içinde, iş alanı kodları ilgili `features` altında olmalı.
- Tek bir sayfaya özel bileşenleri gereksiz yere globale taşıma.
- Barrel export dosyalarını yalnızca gerçekten değer kattığında kullan.

# Design System Rules

- Rastgele hex renk, border-radius, gölge, spacing veya transition değeri kullanma; `globals.css` tokenlarını ve mevcut ölçeği kullan.
- Mevcut UI bileşenini yeniden oluşturma. `Button`, `Badge`, `Container`, `Section` ve `SectionHeading` bileşenlerini kullan; yeni ihtiyaçta önce bunları genişlet.
- Aynı işlev için birden çok button veya kart sistemi oluşturma.
- Font kullanımını tutarlı tut: Başlıklarda Bricolage Grotesque, body/UI, buton ve formlarda Onest kullan. `src/app/fonts.ts` içindeki `next/font/local` tanımlarını, `public/fonts/` içindeki yerel değişken fontları ve `globals.css` tipografi tokenlarını kullan. Harici font servisine runtime isteği ekleme; TR/EN karakter desteğini ve font lisanslarını koru. Ortak sistemin kullanım rehberi `docs/design-system.md` içindedir.
- Uzun paragraflardan, aşırı küçük metinlerden ve görselin önüne geçen içerikten kaçın.

# Component Standards

- Bileşenler küçük, tek sorumluluklu ve açık TypeScript tipleriyle yazılmalı; `any` kullanma.
- Gereksiz client component oluşturma. Yalnızca state, event veya browser API gerektiğinde `"use client"` kullan.
- Semantic HTML kullan; button yerine tıklanabilir `div` kullanma. Uygunsa `next/link` ve görsellerde `next/image` kullan.
- Otomatik videolar `muted` ve `playsInline` olmalı.
- Etkileşimli bileşenlerde klavye desteği ve görünür focus state zorunludur.

# Responsive Design

- Her bileşeni mobile-first tasarla; masaüstünü mobilde yalnızca küçültme.
- Büyük tipografi mobilde taşmamalı; sabit genişlik/yüksekliklerden kaçın.
- Kart ve galeriler gerçek medya oranlarını korumalı; yatay scroll yalnızca bilinçli bir karar olmalı.
- Mobilde ağır parallax ve gereksiz animasyonları azalt.

# Animation Rules

- Animasyon tasarımı desteklemeli, dikkat dağıtmamalı ve layout shift oluşturmamalı.
- Kısa, kontrollü transition kullan; basit durumlarda CSS veya Framer Motion, karmaşık scroll animasyonlarında yalnızca gerektiğinde GSAP kullan.
- Smooth scroll yalnızca deneyimi iyileştiriyorsa eklenmeli; `prefers-reduced-motion` zorunludur.
- Aynı bölümde birden fazla animasyon dili kullanma; mobilde yoğunluğu düşür.

# Dependency Policy

- Yeni paket öncesi mevcut bağımlılıklarla çözümü değerlendir ve gerekçeyi belirt.
- Aynı işi yapan birden fazla kütüphane veya büyük UI kit kurma; kullanılmayan paketleri kaldır, sürümleri sebepsiz topluca güncelleme.
- Başlangıçta kabul edilen araçlar: `clsx`, `tailwind-merge`.
- İhtiyaç doğarsa değerlendirilebilecek araçlar: `motion` / `framer-motion`, `gsap`, `lenis`, `embla-carousel-react`. İhtiyaç oluşmadan yükleme.

# Performance Rules

- İlk ekranda gereksiz büyük video yükleme; görselleri uygun boyut ve formatta kullan, ekran altı medyayı lazy load et.
- Otomatik videolar kısa, sessiz ve optimize olmalı.
- Ağır client-side JavaScript'ten kaçın; Server Component yaklaşımını varsayılan kabul et.
- CLS, LCP, Core Web Vitals ve üçüncü taraf scriptlerin performans etkisini gözet.

# Content and Visual Media

- Placeholder içeriği geçici olarak açıkça işaretle.
- Gerçek ürün görsellerinin en-boy oranını bozma veya insan/ürün görsellerini dekoratif amaçla gereksiz kırpma.
- Anlamlı alt metinler yaz. Landing metinleri kısa, güçlü ve sonuç odaklı olmalı.
- Teknik AI model isimlerini gereksiz göstermeyin; ana mesaj ürün fotoğrafından kampanyaya hazır içerik üretimidir.
- “Ürünü yüzde yüz bozmama garantisi” gibi doğrulanamayan iddialar kullanma.

# Code Quality

- ESLint veya build hatası, kullanılmayan import/değişken bırakma.
- Tekrarlanan kodu makul ölçüde bileşene çıkar; erken optimizasyon ve aşırı soyutlamadan kaçın.
- Karmaşık kodda kısa, anlamlı açıklama kullan; kötü kodu yorumla açıklamak yerine sadeleştir.
- Dosya ve bileşen dosyalarında kebab-case, React bileşenlerinde PascalCase kullan.

# Validation Checklist

Her görev sonunda şunları doğrula:

1. İstenen kapsam dışında değişiklik yapıldı mı?
2. Mevcut tasarım sistemi korundu mu?
3. Mobil görünüm kontrol edildi mi?
4. Klavye ve focus davranışı çalışıyor mu?
5. Yeni dependency gerçekten gerekli mi?
6. Console hatası var mı?
7. `npm run lint` başarılı mı?
8. `npm run build` başarılı mı?

# Agent Response Format

Her görev sonunda şunları raporla:

- Değiştirilen dosyalar
- Değişikliklerin kısa özeti
- Varsa eklenen dependency ve gerekçesi
- Lint sonucu
- Build sonucu
- Manuel kontrol edilmesi gereken noktalar

# Internationalization Rules

- Desteklenen locale'ler `tr` ve `en`, varsayılan locale `tr` olmalı.
- Kullanıcıya görünen sabit metinleri component içinde hard-code etme.
- Yeni mesajları hem `tr.json` hem `en.json` dosyasına ekle.
- Route ve URL değerlerini çeviri dosyalarına koyma.
- `CREATIVE AI` marka adını çevirme.
- Locale-aware navigation yardımcılarını kullan.
- `<html lang>` aktif locale'i doğru göstermeli.
- Çeviriler doğal ve kısa olmalı; kelime kelime kötü çeviriden kaçın.
- Yeni section veya feature iki dilde tamamlanmadan bitmiş kabul edilmemeli.
