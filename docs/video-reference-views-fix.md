# Video Studio — çok açılı ürün referansı düzeltmesi

## Gerçek Development kaydı

Development projesi `creative-ai-dev` üzerinde yalnız SELECT sorguları ve mevcut görsellere salt okunur erişim kullanıldı. Tam payload, prompt, signed URL veya anahtar loglanmadı; veritabanı ve Storage değiştirilmedi.

- Job: `c4e3696a-32be-43c8-b6be-3fa39a9e8ff2`
- Submission: `4cc15e9c-6dec-4c33-bc87-a451cd6f06b6`
- Oluşturulma: 30 Ekim 2026, 16:07:38 Türkiye saati. Tamamlanan son Cinematic Hero / Standard / 5s / multi kaydı.
- Ana ön asset: `4c82829b-4ddb-573b-af25-d300aa1c6e78` — 1080×1920, 9:16.
- Ek arka asset: `0771dc20-0bda-5899-a9be-4842d543fc8d` — 1920×1080, 16:9. Ön ve arka görseller, sahipliği aynı job ile eşleşen Storage kayıtlarından görsel olarak incelendi. Malzeme kompozisyonu görünüşten varsayılmadı. Geçici yerel kopyalar inceleme sonunda kaldırıldı.
- Ana görselin önceki 16:9 hazırlanmış asset'i: `c43bf839-95c0-5fca-ae90-3417596c87d0`. Önceki ve yeni ön asset aynı orijinal hash önekini taşıyor; arka asset'in orijinal hash'i farklı.
- Zaman sırası: ön 16:9 16:06:36 → arka 16:9 16:06:41 → aynı ön fotoğraf 9:16 16:07:01 → ana kaynak Product Understanding 16:07:06 → video 16:07:38.
- Product Understanding cache: yalnız ana kaynak için `supported`; arka kaynak için bu zaman aralığında cache kaydı yok.
- Director: `origin=ai`, `video-director-3.2-duration-aware-v1`; **referenceReviews sayısı 0**.
- Derlenmiş shot promptlarında **@Element1 yok**. Beş shot'ın süreleri 1+1+1+1+1; tüm focus değerleri generic, evidenceRefs boş.

Geçmiş job tam HTTP provider payload'ını saklamıyor; mevcut `provider_metadata` yalnız `videoPreservation` içeriyor. Sıfır reference review ve @Element1 yokluğu doğrudan kayıttan doğrulandı. Bu durumda mevcut submit kodunun `elements` üretmemesi koddan çıkarılan sonuçtur; geçmiş HTTP isteği yeniden oynatılmadı.

## Kayıp noktası ve düzeltme

**Bu kayıttaki referans, Director'ın imzalanmış planına ulaşmamış.** UI `referenceKey` değerine hem ana kaynak kimliğini hem en-boy oranını koyuyordu. 16:9 → 9:16 değişikliği referans bileşenini yeniden oluşturuyor ve generation draft'ına boş referans listesi veriyordu. Yukarıdaki kayıt sırası bu durumla örtüşüyor; istemcinin tıklama geçmişi saklanmadığı için ayrı bir kullanıcı olayı iddia edilmiyor. Aynı hata yerel regresyonla yeniden üretildi.

Artık referans seçimi ana ürün kimliğine bağlı; yalnız video oranı değiştiğinde silinmiyor. Bileşen, ana kaynak yeniden hazırlanırken de bağlı kalıyor. Her referans kendi hazırlanma oranını taşıyor; server bu oranı allowlist, sahiplik, Storage metadata ve SHA-256 ile doğruluyor. Referans görsellerin video başlangıç karesiyle aynı oranda olması gerekmiyor. Eski, oran alanı bulunmayan referanslar önceki doğrulama davranışını koruyor. Ürün değişince referanslar hâlâ sıfırlanıyor.

Referans yükleme/hazırlama sürerken Director ve quote/submit bloke ediliyor; eski plan ve fiyat onayı kaldırılıyor. TR/EN bekleme mesajı mevcut focus/disabled bileşenleriyle gösteriliyor.

**İkinci bağımsız engel:** referans inceleme parser'ı `rear` kanıtını koşulsuz reddediyor, plan validator'ı da doğrulanmış arka açı ile uydurulan arka yüzü ayırmıyordu. UI kaybı giderilse bile bu kurallar arka planlamayı engelliyordu.

Şimdi Director, mevcut tek görüntü karşılaştırma çağrısında her referans için `view=front/back/side/detail/unknown` ve eşleşme durumu veriyor. Upload slot etiketi açı kanıtı sayılmıyor. Shot `referenceIndex` ile eşleşmiş görsele bağlanıyor. Back/side yalnız multi-shot'ta ana başlangıç karesinden sonra kullanılabiliyor. Arka shot kendi arka kanıtını veya generic formu kullanıyor; ön fermuar/marka kanıtını arka yüze taşıyamıyor. İç yüz, uydurulmuş mekanizma, döndürme ve tek shot içinde kesme yasakları korunuyor.

## Veri zinciri

1. UI upload → özel source asset → hazırlanmış referans: kimlik, hash ve referansın kendi oranı taşınıyor.
2. `readProductReferences`: sahiplik/provenance/hash ve referans oranı doğrulanıyor; orijinal sıra korunuyor.
3. Product Understanding: ana kaynak analiz ediliyor; ek görüntü için yeni ücretli çağrı eklenmedi. Varsa eski profil bağlama ekleniyor, referansın görünen açısını mevcut Director görüntü karşılaştırması inceliyor.
4. AI Director: ana görüntü imagePosition 1, ekler 2–4; matched view, kanıt ve shot bağlantısı doğrulanıyor.
5. Signed plan/cache/quote: referans ID, hash, sıra ve oran draft kimliğinin parçası. Contract/Director sürümü yenilendi. Değişiklik eski plan/quote'u geçersiz kılıyor.
6. Compiler: referans kullanan shot `@Element1` ve görünüş yönlendirmesi alıyor. Örnek: `@Element1: Use back view from reference image 1.` Bu doğal dil yönlendirmesidir; API'de yeni bir image token icat edilmedi. Çatışan referanslar filtrelenince görsel sırası yeniden hesaplanıyor. Arka shot'a ön görselin işaretli logo bölgesi zorla uygulanmıyor.
7. Submit/provider: yalnız eşleşmiş referanslar mevcut owned-source resolver'dan alınan gerçek hazırlanmış signed URL'lerle aynı ürünün `elements[0].reference_image_urls` alanına giriyor; `frontal_image_url` ana kaynak kalıyor. [Standard](https://fal.ai/models/fal-ai/kling-video/v3/standard/image-to-video/api) ve [Pro](https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video/api) sözleşmesi kullanılıyor.

Güvenli Development logları ana/referans asset ID'lerini, hash öneklerini, referans sayısını, review durumunu, açıyı ve kullanan shot indekslerini gösteriyor. URL, görüntü içeriği ve tam prompt yazdırılmıyor.

## Test ve hazırlık durumu

Son doğrulama: **165/165 test başarılı**, `npx tsc --noEmit` başarılı, varsayılan Turbopack ile `npm run build` başarılı. Kaynak lint'i `npm run lint -- --ignore-pattern '.next-reference-check*/**'` başarılı; düz lint'in önceki görevde saptanan, mevcut `.next-reference-check*` üretilmiş klasörlerini tarama sorunu için config değiştirilmedi. `git diff --check` başarılı.

`tests/video-reference-views.test.ts` gerçek uygulama action'ları, imzalar, Supabase/Fal SDK'ları ve yerel HTTP harness'i kullanır. Harici servisler taklit edilir; gerçek görüntü analizi veya video üretimi yapılmaz. Fixture tutarlı ön/arka kapüşonlu ceket pikselleri ve açıkça authored review/shot yanıtları içerir; malzeme türü varsayılmaz.

- 9:16 ana ön + 16:9 arka kaynak server action'a kayıpsız ulaşıyor.
- Ön hero 1s → yüzey 1s → doğrulanmış arka 1s → ön final 2s planı kabul ediliyor.
- Standard ve Pro için SDK HTTP payload'ında tek ürün element'i, gerçek resolver'dan gelen arka URL ve doğru @Element1 shot'ı bulunuyor.
- Sahiplik değişimi, içerik/hash değişimi, eski quote/plan, yanlış referans indeksi, eşleşmeyen referans, arka shot'a ön kanıtı taşımak, arka açıyla başlamak ve single-shot arka geçişi reddediliyor.
- Aynı ayrıntının farklı amaç etiketiyle tekrarı, uygun arka referans mevcut Cinematic Hero 5s planında reddediliyor.
- Tekrar submit aynı ücretli POST'u tekrarlamıyor. Mevcut front-only, Standard/Pro ve single/multi regresyonları korunuyor.

Kota, maliyet tavanı, güvenlik, sahiplik ve idempotency mekanizmaları değişmedi. Yeni dependency, migration, commit/push, production değişikliği veya ücretli inference yapılmadı.

Kontrollü tek gerçek Kling testi için payload/plan akışı hazır. Yeni kaynak seçimiyle ön ve arkayı yükleyip plan/quote'u yeniden hazırlamak gerekiyor; eski referanssız plan yeniden kullanılmıyor. Kling'in arka görünüşe uyması garanti edilmez; görsel sadakat ve gerçek kesme davranışı ilk onaylı canlı testte değerlendirilmelidir. Mobil görünüm, klavye/focus ve console için canlı tarayıcı kontrolü ayrıca yapılmalıdır; mevcut responsive/i18n UI sözleşme testleri çalıştırıldı.

## Bu görevde değişen dosyalar

- UI: `src/features/video/video-product-references.tsx`, `video-studio-workspace.tsx`, `video-director-panel.tsx`; `src/messages/tr.json`, `en.json`.
- Kaynak sözleşmesi: `src/lib/video-generation/types.ts`, `validation.ts`, `reference-context.ts`, `product-references.ts`.
- Director/compiler ve güvenli tanılama: `src/lib/video-director/core.ts`, `creative-request.ts`, `openai-director.ts`, `runtime.ts`, `presets.ts`, `plan-contract.ts`; `src/app/[locale]/dashboard/video/director-actions.ts`; `src/lib/video-generation/service.ts`.
- Testler: `tests/video-reference-views.test.ts`, `tests/fixtures/video-front-back-fixture.ts`, `tests/fixtures/video-production-harness.ts`, `tests/video-director-stabilization.test.ts`.
- Önceki görevden kalan çalışma ağacı değişiklikleri korundu.
