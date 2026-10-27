# Video ve UGC: Kling yönlendirmesi

Yeni video ve UGC hazırlıkları yalnızca şu iki modeli kullanır:

| Alan | Seçim | fal endpoint | Uygulama süreleri |
| --- | --- | --- | --- |
| Video Studio | Standard / Kling 3.0 | fal-ai/kling-video/v3/standard/image-to-video | 5, 10 sn |
| Video Studio | Pro / Kling 3.0 Pro | fal-ai/kling-video/v3/pro/image-to-video | 5, 10 sn |
| UGC | standard / Kling 3.0 | fal-ai/kling-video/v3/standard/image-to-video | 15 sn |
| UGC | premium / Kling 3.0 Pro | fal-ai/kling-video/v3/pro/image-to-video | 15 sn |

Şema kaynakları: [Kling Standard](https://fal.ai/models/fal-ai/kling-video/v3/standard/image-to-video/api), [Kling Pro](https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video/api). İki endpoint de start_image_url ve elements alanlarını kabul eder; belgelenen tek klip süresi 3–15 saniyedir. Uygulama mevcut dar süre sözleşmelerini korur. generate_audio false kalır; konuşma, lip sync veya altyazı desteği eklenmedi.

Seedance planner, provider, audio planlayıcısı ve payload gönderim yolları kaldırıldı. TR/EN model adları ve sınır metinleri güncellendi. Eski taslak süreleri kaybolmaz; 30/60 saniyelik taslaklar desteklenen süre seçilene kadar hazırlanamaz. Önceden hazırlanmış Seedance snapshot'ları Kling'e dönüştürülmez ve sağlayıcıya gönderilmez. Kullanıcı projesini yeniden hazırlayarak yeni model kimliğine sahip bir snapshot oluşturmalıdır. Seedance görevleri otomatik sorgulanmaz; varsa devam eden görevler ayrıca incelenmelidir. Eski Kling v1 işlerinin kayıtlı endpoint'i ve hash'i korunur.

## Veritabanı geçişi

Yeni UGC planları model kimliğini içeren v4 sözleşmesini kullanır; v1 eski Kling planları için korunur. Pipeline hazırlık SQL'i yeni kurulumlar için güncellendi. Pipeline zaten kuruluysa database/rollouts/kling-only-ugc.sql uygulanmalıdır. Bu dosya constraint ve mevcut iki fonksiyonu günceller; immutable snapshot'ları, görev kimliklerini ve eski planları değiştirmez. Eski v2/v3 tanımları yalnızca tarihsel kayıtları korumak için SQL'de kalır; yeni submission claim'leri yalnızca Kling v1/v4 kabul eder.

Bu değişiklik sırasında SQL canlı veritabanında çalıştırılmadı. Supabase CLI veya yerel PostgreSQL bu çalışma ortamında mevcut değildi; SQL için statik kontroller çalıştırıldı. Kurulum sonrasında database/verification/kling_only_ugc.sql ile eşleşen/eşleşmeyen model kimliklerini ve yeni claim kısıtını doğrulayın.

Üretim kapıları, billing ve worker durumu korunur. Her iki video capability'si productionApproved false kalır; UGC üretimi kapalıdır. Kling Standard sağlayıcı maliyeti henüz doğrulanmadığından unconfigured olarak işaretlidir; maliyet veya kredi uydurulmaz. Yeni dependency eklenmedi.

## Değişen dosyalar

- src/lib/video-generation/capabilities.ts
- src/lib/video-generation/fal-request.ts
- src/features/ugc/ugc-model-contract.ts
- src/lib/ugc/ugc-model-registry.ts
- src/lib/ugc/ugc-request-planner.ts
- src/lib/ugc/ugc-fal-submission.ts
- src/lib/ugc/ugc-private-media.ts
- src/lib/ugc/ugc-pipeline.ts
- src/lib/ugc/ugc-kling-provider.ts
- src/messages/tr.json
- src/messages/en.json
- database/migrations/20261104000000_prepare_ugc_pipeline_claims.sql
- database/rollouts/kling-only-ugc.sql
- database/verification/kling_only_ugc.sql
- database/verification/ugc_pipeline_preparation.sql
- database/verification/ugc_pipeline_behavioral_test.sql
- database/verification/ugc_pipeline_two_session_concurrency_test.md
- tests/ugc-pipeline.test.ts
- tests/ugc-foundation.test.ts
- tests/ugc-dialogue.test.ts
- tests/video-generation-backend.test.ts
- docs/KLAY_AI_PROJECT_STATUS.md
- docs/ugc-kling-integration-audit.md
- docs/ugc-seedance-integration-audit.md
- docs/ugc-model-tiers-audit.md
- docs/ugc-production-pipeline-preparation.md
- docs/kling-only-video-routing.md

Kaldırılan dosyalar:

- src/lib/ugc/ugc-seedance-planner.ts
- src/lib/ugc/ugc-seedance-provider.ts
- src/lib/ugc/ugc-seedance-audio.ts

## Doğrulama

- npm test: başarılı (ana test keşfinde 757 test; pretest grubu da geçti).
- npm run lint: başarılı.
- TypeScript: başarılı.
- npm run build: varsayılan Turbopack derleme aşamasında ilerlemedi ve durduruldu.
- npm run build -- --webpack: başarılı, tüm rotalar derlendi.
- TR/EN UGC form render testleri: başarılı.
- Mobil tarayıcı, klavye/focus ve tarayıcı console kontrolü manuel olarak yapılmadı.
- Gerçek sağlayıcı çağrısı veya canlı SQL uygulanmadı.
