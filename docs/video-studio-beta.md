# Video Studio beta teslimatı

26 Ekim 2026. Üretim ve müşteri kredileri varsayılan kapalıdır. [Güncel durum](KLAY_AI_PROJECT_STATUS.md) başındaki Video Studio bölümü bu teslimatın sınırlarını ve kanıtlarını içerir.

## Aktivasyon sözleşmesi

1. Production'da yalnızca database/migrations/20261026132015_prepare_video_beta.sql uygulandı. Video foundation/lease/tier/storage şemaları önceden vardı; eski migration'lar tekrar çalıştırılmadı. Disposable test migration'ı daha önce bir kez uygulandı.
2. Yerel `.env.local` dosyasında yalnız seçilen kullanıcı, beta ve video generation için açıldı. Wildcard/çoklu kullanıcı reddedilir. Production deployment ortamında beta hâlâ kapalıdır.
3. İlk ücretli submission için yerel sunucuya tek bir onaylı submission UUID'si, `standard`, `5` saniye ve `$0.70` üst sınırı verildi. Sayfa her seferinde canlı fal fiyatını yeniden okur; fiyat bilinmiyorsa veya üst sınırı geçiyorsa üretim kapalı kalır. Bu yapılandırma gerçek inference çağrısı yapmaz.
4. Bu onay yeni bir UUID'ye, modele veya süreye geçmez. Belirsiz task için yeni UUID üretip otomatik retry yapılmaz. VIDEO_RECONCILIATION_SCHEDULER_ENABLED ve bearer secret isteğe bağlı iç worker kapısıdır; UI polling aynı fenced reconciliation işlemini tetikler. Scheduler henüz deploy edilmedi.
5. İlk testten sonra yeni istek için ayrı onay UUID/model/süre/tavan gerekir. Uygulama toplamda $10 lifetime, kullanıcı başına günde $2 ve günde 3 denemeyle sınırlıdır; customer wallet veya subscription kullanılmaz. Müşteri ödeme/kredi sistemlerini açmayın.

## Fiyat hassasiyeti düzeltmesi

Canlı bir gönderim denemesinde IEEE-754 `0.14 × 5` ara sonucu `Math.ceil` öncesinde kayan nokta artığı üretip teklifi `$0.700001` yapmış, `$0.70` üst sınırında sunucu onayını durdurmuştur. Bu ret, servis sırasındaki submit/bütçe çağrılarından önce gerçekleşti; Production'da bu submission için job, beta rezervasyonu veya provider task ID yoktur. Arayüz başlangıç UUID'sini sunucunun verdiği mevcut onaylı UUID'den alır; bu görevde UUID değiştirilmedi.

Maliyet artık ondalık metin gösteriminden tam sayı mikro-dolara çevrilip daima yukarı yuvarlanır. Sunucu, istemci onayının canlı teklifle birebir aynı olmasını ve toplam maliyetin ayrıca onay tavanını aşmamasını ister. Test: `$0.14 × 5 = $0.70`; gerçek bir maliyet `$0.700001` ise reddedilir. Fiyat tavanı gevşetilmedi; ücretli fal çağrısı veya retry yapılmadı.

## Gerçek Kling job ve ilerleme arayüzü

İlk başarılı Standard/5 sn işi Production `generations` tablosunda `succeeded` olarak doğrulandı. Sağlayıcı task ID eklenmiş, MP4 private `generated-videos` alanında, beta rezervasyonu `$0.700000` ile `finalized`; polling/reconciliation üç denemede tamamlanmış. Job'da olay geçmişi veya gerçek yüzde bulunmadığından arayüz yalnız `queued`, `processing`, private çıktı yolu kaydedilmiş/finalizing ve `succeeded` işaretlerini gösterir; yüzde uydurmaz. `failed`, belirsiz gönderim ve durum sorgusu hataları ayrı mesajlanır.

Video Studio açılırken mevcut sunucu onaylı submission ID'siyle eşleşen job okunur; yalnız aktif veya belirsiz job durum paneline geri yüklenir. Terminal iş Studio'nun boş preview alanına video olarak gömülmez; onaylı deneme kullanıldı bildirimi ve Video Kütüphanesi bağlantısı gösterilir, dosya kütüphanede kalır. Erişim doğrulanamazsa yeniden ücretli istek başlatma kapalı kalır. Kaynak hazırlama ve server action gönderimi sırasında düğme loading/disabled olur; mobil görünüm gönderim sırasında loading düğmesini, sonrasında ilerleme panelini gösterir. `Videoyu İzle` bağlantısı yalnız Studio'da devam eden job terminal başarıya ulaştığında gösterilir. Yeni tablo, migration, worker veya scheduler eklenmedi.

## İlk yerel deneme — güvenli durum incelemesi

26 Ekim 2026'da seçilen hesap için Production `generations` ve `video_beta_reservations` sorgularında video satırı yoktu. Storage'da üç private kaynak JPEG'i 2400×3600 (2:3) olarak duruyordu; `video_source_assets` kaydı oluşmamıştı. Kaynak finalize kodu her kenar için 360–2000 piksel ve desteklenen oran ister; bu yüzden akış finalize aşamasında durdu. Generation REST POST veya bütçe rezervasyon çağrısı görülmedi. Mevcut servis sırası rezervasyon → job kaydı → fal submit olduğundan fal çağrısı, ücret veya provider task ID oluşmadı. Submission UUID onay kontrolüne ulaşılmadı; yerel onay UUID'si değiştirilmedi. Başarısız yüklemeler private Storage'da bırakıldı.

Bu ilk hata artık otomatik kaynak hazırlamayla giderilmiştir; kullanıcıdan dışarıda yeniden boyutlandırma beklenmez.

## Otomatik kaynak hazırlama

- Orijinal JPEG/PNG private Storage'da korunur. Sharp en fazla 25 MB / 40 milyon piksel çözer; çok kareli veya desteklenmeyen formatlar reddedilir. UI dosya sınırı 20 MB'dir. EXIF yönü normalize edilir.
- Kaynak, seçilen 9:16 → 1080×1920, 16:9 → 1920×1080 veya 1:1 → 1080×1080 kareye `contain` ile yerleştirilir. Ürün kırpılmaz veya esnetilmez. Kenar renklerinin medyanı boş alanlara temiz, düz bir arka plan sağlar.
- Hazırlanan PNG ayrı, değiştirilmeyen `owner/prepared-id/prepared-v1.png` yolunda mevcut kaynak tablosuna kaydedilir. Kimliği orijinal byte hash'i, sahibi, kaynak yolu, oran ve sürümden türetilir. Storage metadata orijinal dosya bağlantısını saklar. Eşzamanlı/lost-response hazırlamada aynı dosya doğrulanarak kullanılır; overwrite/delete yoktur. Yeni migration gerekmez.
- Önizleme ve Kling aynı private hazırlanmış kareyi kullanır. Oran değişirken üretim düğmesi yeni kare hazır olana kadar kapanır; eski async sonuçlar ekrana yazılamaz. Yeni beta submission yalnız hazırlanan kaynakları kabul eder; eski kaynak okuma ve Video Library akışları korunur.
- Hazırlama yalnız Storage/Sharp işlemidir; inference veya müşteri kredi rezervasyonu yapmaz. Üretim allowlist'i, mevcut onay UUID/model/süre/$0.70 ve tüm bütçe/idempotency kapıları değişmedi. UGC Generate kapalıdır. Eski başarısız Production upload'ları silinmedi.

## Testler

- npm test (pretest dahil), npm run lint, TypeScript ve varsayılan npm run build çalıştırıldı; nihai sonuçlar PR'da kaydedilir.
- Gerçek staging runner: Windows PowerShell'de VIDEO_QA_PROJECT_REF=gklpgcyndeghjgemoonk olarak açıkça ayarlayın; node node_modules/tsx/dist/cli.mjs scripts/verify-video-beta-staging.ts çalıştırın. Node 26 kullanıldı. CLI mevcut disposable API key'lerini yalnız process belleğinde okur; yeni key oluşturmaz ve çıktıya secret yazmaz. --serve seçeneği geçici staging hesabıyla 127.0.0.1:3100 QA sunucusu açar; paid generation kapalıdır.
- database/verification/video_beta_budget.sql yalnız disposable projede transaction içinde $10 sınırını doğrular; verileri rollback eder.
- Fixture'lar testin finally bloğunda silinir. Zorla process sonlandırılmışsa yalnız bu çalıştırıcının ürettiği exact kullanıcı/job/Storage yolları temizlenmelidir. Gerçek kullanıcı verisine dokunmayın.
- Orijinal JPEG/PNG farklı oran/çözünürlükte olabilir; 20 MB UI / 25 MB Storage ve 40 MP çözümleme sınırı korunur. Hazırlanmış kare 360–2000 px ve doğrulanmış 16:9/9:16/1:1 içinde kalır. Signed input URL erişimi ve oranı submission öncesinde doğrulanır.
- MP4 content-type, boyut, container başlangıcı, güvenilir sağlayıcı host'u ve private output yolu kontrol edilir. Kaybolan upload checkpoint'i aynı byte içeriğiyle recover edilir. Gerçek provider kalite/ürün sadakati ilk onaylı testte değerlendirilecektir.

## Resmî kaynaklar

- [Standard şema ve ses seçenekleri](https://fal.ai/models/fal-ai/kling-video/v3/standard/image-to-video/llms.txt)
- [Pro şema ve ses seçenekleri](https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video/llms.txt)
- [Authenticated Pricing API](https://fal.ai/docs/platform-apis/v1/models/pricing)
- [fal authentication](https://fal.ai/docs/api-reference/platform-apis/authentication)

İki endpoint'in belgelenen 3–15 saniye aralığı uygulamanın 5/10 saniyelik kontratını kapsar. Payload yalnız start_image_url, prompt, duration, generate_audio=false, enable_safety_checker=true kullanır. resolution, aspect_ratio, camera veya desteklenmeyen speech parametresi gönderilmez.

## Değişen dosyalar

- .env.example
- database/migrations/20261026132015_prepare_video_beta.sql
- database/migrations/20261104000000_prepare_ugc_pipeline_claims.sql
- database/rollouts/kling-only-ugc.sql
- database/verification/kling_only_ugc.sql
- database/verification/ugc_pipeline_behavioral_test.sql
- database/verification/ugc_pipeline_preparation.sql
- database/verification/ugc_pipeline_two_session_concurrency_test.md
- database/verification/video_beta_budget.sql
- docs/KLAY_AI_PROJECT_STATUS.md
- docs/kling-only-video-routing.md
- docs/ugc-kling-integration-audit.md
- docs/ugc-model-tiers-audit.md
- docs/ugc-production-pipeline-preparation.md
- docs/ugc-seedance-integration-audit.md
- docs/video-studio-beta.md
- scripts/verify-video-beta-staging.ts
- src/app/[locale]/dashboard/video/generation-actions.ts
- src/app/[locale]/dashboard/video/page.tsx
- src/app/api/internal/video-reconciliation/route.ts
- src/features/ugc/ugc-model-contract.ts
- src/features/video/video-card.tsx
- src/features/video/video-detail.tsx
- src/features/video/video-download-button.tsx
- src/features/video/video-generation-inspector.tsx
- src/features/video/video-job-progress.tsx
- src/features/video/video-library.tsx
- src/features/video/video-source-selector.tsx
- src/features/video/video-studio-state.ts
- src/features/video/video-studio-workspace.module.css
- src/features/video/video-studio-workspace.tsx
- src/lib/profile/get-or-create-profile.ts
- src/lib/ugc/ugc-fal-submission.ts
- src/lib/ugc/ugc-kling-preparation.ts
- src/lib/ugc/ugc-kling-provider.ts
- src/lib/ugc/ugc-model-registry.ts
- src/lib/ugc/ugc-pipeline.ts
- src/lib/ugc/ugc-private-media.ts
- src/lib/ugc/ugc-request-planner.ts
- src/lib/ugc/ugc-seedance-audio.ts (kaldırıldı)
- src/lib/ugc/ugc-seedance-planner.ts (kaldırıldı)
- src/lib/ugc/ugc-seedance-provider.ts (kaldırıldı)
- src/lib/video-generation/beta-policy.ts
- src/lib/video-generation/money.ts
- src/lib/video-generation/beta-runtime.ts
- src/lib/video-generation/capabilities.ts
- src/lib/video-generation/fal-provider.ts
- src/lib/video-generation/fal-request.ts
- src/lib/video-generation/media-access.ts
- src/lib/video-generation/output.ts
- src/lib/video-generation/reconciliation.ts
- src/lib/video-generation/service.ts
- src/lib/video-generation/supabase-repository.ts
- src/lib/video-generation/supabase-source-resolver.ts
- src/lib/video-generation/types.ts
- src/lib/video-generation/prepare-source-image.ts
- src/lib/video-generation/prepared-source.ts
- src/messages/en.json
- src/messages/tr.json
- tests/profile-first-visit.test.ts
- tests/ugc-dialogue.test.ts
- tests/ugc-foundation.test.ts
- tests/ugc-kling-integration.test.ts
- tests/ugc-pipeline.test.ts
- tests/video-beta.test.ts
- tests/video-generation-backend.test.ts
- tests/video-library-ui.test.ts
- tests/video-studio-state.test.ts
- tests/video-studio-ui.test.ts
- tests/video-source-preparation.test.ts

Nihai doğrulama: 773/773 ana test, 68/68 pretest, lint, TypeScript, varsayılan Turbopack production build (32 sayfa) ve 35/35 gerçek disposable entegrasyon kontrolü başarılı. JPEG 2400×3600 için üç oran, ürün oranı/köşelerin korunması, değişmeyen orijinal, decode limitleri, preview/provider byte eşitliği ve concurrency test edildi. Gerçek tarayıcıda üç oran arasında hazırlanmış önizleme geçişi ve mobil görünüm kontrol edildi. Gerçek ceket görseli yerelde üç orana hazırlandı; fal inference yapılmadı. Önceki $10 cap transaction testi de geçti. İlerleme evreleri için backend phase mapping ve yenileme sonrası approved job geri yükleme testleri eklendi.
