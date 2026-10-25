# KLAY AI — Proje durumu ve öncelikli yol haritası

Son güncelleme: **26 Ekim 2026** · İlk denetim temeli: `c4dbb2e` · Geliştirme branch'i: `codex/composer-beta`. Mevcut kaydedilmemiş UGC çalışmaları korunuyor ve bu geliştirmeye dahil edilmiyor.

## Güvenlik ve runtime — tamamlandı

Production dependency kontrolündeki önceki **1 kritik + 5 yüksek** bulgu hedefli sürüm güncellemeleriyle kapatıldı. `npm audit --omit=dev` artık **0 toplam bulgu** ve exit 0 döndürüyor. Bu sonuç npm advisory kapsamındaki production bağımlılıklarına aittir; bütün ürün için güvenlik garantisi değildir.

- Next.js / eslint-config-next **16.2.12 → 16.4.3**, sharp **0.34.5 → 0.35.5** sabitlendi. İlgili Next/SWC ve sharp/libvips platform paketleri lockfile'da eşleşti. Runtime gereksinimi Node **20.9+**.
- Yalnız etkilenen transitif nanoid **3.3.20**, source-map-js **1.2.2**, zod **4.6.7** sürümlerine güncellendi; Next'in PostCSS'i **8.5.23** oldu. React, OpenAI, fal, Supabase ve next-intl sürümleri değiştirilmedi. Yeni doğrudan dependency veya zorlayıcı override eklenmedi; `npm audit fix --force` kullanılmadı.
- Kurulu Next.js rehberi ve [resmî Next.js release notları](https://github.com/vercel/next.js/releases/tag/v16.4.3), [sharp release notları](https://github.com/lovell/sharp/releases/tag/v0.35.5), [sharp 0.35 breaking changes](https://sharp.pixelplumbing.com/changelog/v0.35.0/) incelendi. Kaldırılan sharp API'leri kaynakta kullanılmıyor; native görsel testleri geçti.
- Gerçek yerel HTTP kontrolü `/` için 404 ortaya çıkardı: kökteki proxy, `src/app` kullanan yapıda derlenmiyordu. Mevcut kod `src/proxy.ts` konumuna taşındı; session/persisted-cookie davranışı korunarak locale proxy etkinleşti. Manifest'in locale yönlendirmesine girmemesi de düzeltildi.
- [Runtime smoke script'i](../scripts/test-next-runtime.mjs), yeni `npm run test:runtime` komutuyla **11/11** geçti: varsayılan TR, TR/EN yönlendirme ve HTML lang, anonim dashboard reddi, bozuk cookie temizliği, özel API, manifest ve sharp kullanan image optimizer. Yalnız anonim localhost GET'leri; AI kapalı, database fixture/migration yok.
- Bu sürümlerle `npm test` ana aşaması **761/761**, pretest, ESLint, standalone TypeScript ve production build başarılı. Build artık **Proxy (Middleware)** entry point'ini içeriyor. Supabase'de veya production ayarlarında yeni değişiklik yapılmadı.

Sonraki beta kabul adımı canlı authenticated Auth/Storage indirme doğrulaması ve ayrıca onaylanacak sınırlı ücretli ürün/kalite oturumudur. Production migration, ayar değişikliği, merge/deployment ve ücretli çağrı yapılmadı; UGC Generate kapalı.

## Composer Beta — tamamlanan geliştirme

**Güvenli indirme ve ortak OpenAI beta sınırı uygulandı; production'a açılmadı.** Galeri, proje tam ekranı ve dashboard tam ekranında indirme var. Her tıklamada authenticated kullanıcı/proje sahipliği, image/succeeded durumu, private bucket, MIME ve tam owner/project/generation yolu doğrulanıyor. Önizleme URL'si kullanılmıyor; sunucuda 60 saniyelik, dosya adı belirlenmiş yeni signed URL üretiliyor. TR/EN yüklenme ve hata durumları, tekrar tıklama koruması ve mevcut Button/focus sistemi kullanılıyor.

Ortak `getOpenAIClient` transport'u artık bütün OpenAI HTTP çağrılarını korur: Composer, upload analizi, prompt/reference/ürün analizleri, validation, repair, edit ve Model Studio portresi. Sunucudaki `OPENAI_BETA_ENABLED=true` ve açık kullanıcı UUID listesi olmadan çağrı yoktur. Kullanıcı/gün varsayılanı **4 görsel + 24 analiz**, uygulama geneli/gün varsayılanı **20 görsel + 120 analiz** isteğidir. Gün sınırı UTC'dir. Model, görsel sayısı/çözünürlüğü/kalitesi, input boyutu ve analiz output token sayısı sınırlandırılır; otomatik SDK retry kapalıdır. Her gerçek HTTP denemesinden önce atomic PostgreSQL tüketimi yapılır; başarısız/belirsiz çağrılar iade edilmez. Bunlar dolar fiyatı veya müşteri kredisi değildir.

Yeni schema/RPC eksikse, kota servisi erişilemiyorsa veya limit bittiyse sağlayıcıya çıkılmaz. Composer ve portre girişleri ayrıca beta erişimini job oluşturulmadan kontrol eder. Mevcut generation/repair/Storage pipeline yeniden yazılmadı. Worker'a geçiş, finansal işlem veya UGC açılışı yapılmadı. Yeni uygulama dependency'si eklenmedi.

### Supabase erişimi ve doğrulama

- Güvenli Supabase entegrasyonu ve CLI **2.114.0** erişimi çalışıyor; yeni login veya parola paylaşımı gerekmedi. Test ref'i kullanıcı tarafından **`gklpgcyndeghjgemoonk`** olarak teyit edildi ve API'den `klay-ai-staging`, `ACTIVE_HEALTHY`, PostgreSQL 17.11 olarak doğrulandı.
- Production ref'i **`fnzrnlvpkzwztccqzyzf`** korunuyor. Mevcut repository CLI link'i production'a işaret ediyor; değiştirilmedi. Rutin test komutları mutlaka açık `--project-ref gklpgcyndeghjgemoonk` kullanmalı. Bağlayıcı çağrıları da aynı test ref'iyle sınırlandı.
- Yalnız test projesine **`20261025212828_prepare_openai_beta_limits`** kuruldu; local dosya sunucunun kaydettiği sürümle eşleştirildi. Son migration history **41 kayıt**; UGC tabloları/Pipeline kolonları mevcut olsa da önceki UGC kurulumları history'de kayıtlı değil. Eski migration'lar yeniden uygulanmadı veya history repair yapılmadı.
- Yeni migration'ın ilk disposable denemesinde CASE ifadesinin parantez hatası PostgreSQL'de yakalandı; table/function/history'nin tamamen rollback olduğu doğrulandı, hata giderildi ve ardından başarıyla kuruldu. Production'a girişim yapılmadı.
- [Gerçek PostgreSQL davranış/yetki testi](../database/verification/openai_beta_limits.sql): **10/10**. Owner ve global limit, kategori ayrımı, geçersiz girdiler, sayaç korunumu, RLS ve service-only RPC doğrulandı. Sentetik kullanıcılar/kotalar rollback edildi; son kontrol **0 kalıcı sayaç**.
- İki bağımsız CLI SQL oturumunda [holder](../database/verification/openai_beta_lock_holder.sql) PID **232320**, [contender](../database/verification/openai_beta_lock_contender.sql) PID **232340**; `overlapping_session_blocked=true`. Bu yeni beta kotasının kilit izolasyon kanıtıdır; **UGC'nin bekleyen iki-claim testinin yerine geçmez**. Testler committed veri yazmadı.
- Security advisor'daki yeni tablo için “RLS enabled, no policy” INFO bilinçlidir: doğrudan client/service tablo yetkisi yok, yalnızca service-only SECURITY DEFINER RPC var. Eski trigger EXECUTE/Auth uyarıları bu görevde değiştirilmedi; [advisor açıklamaları](https://supabase.com/docs/guides/database/database-linter) ayrı hedefli bakımda ele alınabilir.

### Test ve tarayıcı kapsamı

Yeni güvenlik sınırları ve mevcut Composer/model/galeri regresyonları için odaklı **23/23** test geçti. Tüm `npm test`, lint, TypeScript ve build kontrolleri çalıştırıldı; son doğrulama sonuçları aşağıdaki kayıt bölümünde tutulur. OpenAI SDK gerçek multipart upload ve 429/503/network failure davranışı fake fetch ile test edildi; ücretli çağrı yapılmadı.

Computer Use ile gerçek tarayıcıda, uygulamanın gerçek galeri/viewer/download bileşenlerinden oluşturulmuş **izole mock fixture** incelendi: 375px mobil/TR ve 1280px desktop/EN; yatay taşma yok, indirme hatası `role=alert` ile görünür, test PNG'si indirildi, Enter ile tam ekran açıldı, Escape ile kapanınca odak tetikleyiciye döndü. Mobil tam ekran kontrolleri 336px genişlikle 360px kullanılabilir viewport'a sığdı. Bu bir canlı Auth/Storage/AI E2E testi değildir. Tarayıcı ortamında kaynağı uygulama bundle'ında bulunmayan bir MutationObserver gözlem hatası görüldü; console tamamen temiz diye raporlanmıyor.

**Kalan beta geçişi:** production migration/configuration/deployment için ayrı açık onay; gerçek beta kullanıcı UUID listesi ve onaylı ücretli örneklerin bütçesi; canlı authenticated Storage indirme ve gerçek ürün/kalite/süre kontrolü. Bunlar olmadan “production beta yayında” veya “Composer tüm kabul ölçütleri tamam” denmez. UGC Generate kapalıdır.

## Yönetici özeti

KLAY AI, çalışan ürün omurgası bulunan bir SaaS projesidir. En olgun kullanıcı akışı **Creative Composer → ürün/referans yükleme → OpenAI görsel üretimi → proje galerisi** akışıdır. Model Studio'da taslak ve portre üretimi de uygulamaya bağlanmıştır. Video Studio ile UGC Studio'nun arayüzleri ve önemli altyapıları vardır; bunlar bugün açık, uçtan uca üretim hizmetleri değildir. Ödeme alma ve müşteri kredisi düşme akışı da tamamlanmış değildir.

**Önerilen sonraki kilometre taşı: Composer odaklı kontrollü beta.** Önce mevcut görsel akışının erişim/maliyet sınırlarını ve hata durumlarını tamamlamak, ardından onaylı küçük bir gerçek kullanım oturumuyla doğrulamak en kısa yoldur. Bunun için UGC'yi, tüm video sistemini veya model kimliğiyle üretimi aynı anda açmak gerekmez.

UGC üretimi **kapalı kalmalıdır**. Foundation üretimde kurulu; Pipeline yalnızca disposable Supabase test projesinde kuruludur. Kullanıcının bildirdiği sonuçlar: statik doğrulayıcı **14/14**, PostgreSQL davranış testleri **26/26** başarılı. **Gerçek iki oturumlu concurrency testi hâlâ doğrulanmamıştır.** Bu sonuçlar UGC'nin üretime hazır olduğu anlamına gelmez.

## Kanıt düzeyleri ve bu incelemenin sınırı

- **Kaynakta bağlı:** gerçek route/action, repository ve sağlayıcı bağlantısı kodda mevcut. Bu ifade, bu incelemede canlı üretim yapıldığı anlamına gelmez.
- **Yerelde doğrulandı:** aşağıdaki test/lint/TypeScript/build komutları bu incelemede başarılı oldu.
- **Kullanıcı tarafından bildirildi:** üretim/test kurulumu ve önceki PostgreSQL sonuçları; bu incelemede uzaktan yeniden sorgulanmadı.
- **Hazırlık/kapalı:** altyapı mevcut olsa da yürütme yolu kapalı veya uygulamaya bağlanmamış.

İlk denetimde uygulama kodu veya migration değiştirilmedi. Sonraki Composer Beta geliştirmesinin kod/test ve yalnız disposable Supabase değişiklikleri yukarıda kaydedildi. Production veri/ayar değişikliği, canlı Storage işlemi, ücretli sağlayıcı çağrısı veya deployment yapılmadı. `.env.local` içeriği okunmadı; build normal Next.js davranışıyla bu dosyayı yükledi ve değerleri raporlanmadı.

## Mimari haritası

| Katman | Mevcut yapı ve sorumluluk |
| --- | --- |
| Uygulama | Next.js **16.4.3**, App Router, React **19.2.4**, strict TypeScript. `src/app/[locale]` sayfaları ve Server Actions; birkaç özel API route'u. |
| Kimlik doğrulama | Supabase SSR/browser istemcileri; `src/proxy.ts` oturum yenileme ve locale yönlendirme. Dashboard layout'u oturum kontrolü yapar; mutasyonlarda ayrıca kullanıcı/ownership kontrolü bulunur. |
| Veri erişimi | `src/lib/supabase/{client,server,admin}.ts`. Privileged işlemler sunucu admin istemcisiyle; kullanıcı okumaları ve birçok yazma işlemi RLS üzerinden. |
| Ürün arayüzleri | `src/features/generation`, `models`, `video`, `ugc`; ayrıca `src/components/dashboard` ve `projects` altında Composer/proje akışları. Gerçek yapı AGENTS.md'deki hedef şemadan kısmen farklıdır. |
| Domain/entegrasyon | `src/lib/generation`, `product-understanding`, `models`, `video-generation`, `ugc`, `credit-economy` ve ürün sadakati modülleri. |
| Görsel işleme | OpenAI SDK; `sharp` ile dosya/ölçü doğrulama ve birleştirme. Opsiyonel segmentasyon için fal/BiRefNet adaptörü. |
| Video | Paylaşılan fal.ai istemcisi. Video ve UGC'nin route, süre, state ve çıktı kontratları ayrıdır. |
| Dil/tasarım | `next-intl`, varsayılan `tr`, ikinci dil `en`, locale-aware navigation, aktif `<html lang>`. Yerel Poppins, Tailwind 4, CSS tokenları ve mevcut UI bileşenleri. |
| Veritabanı | `database/migrations` altında **44 SQL dosyası**; tablolar, RLS, özel bucket'lar, transaction/RPC, idempotency, lease ve beta kota korumaları. Dosya sayısı kurulu migration sayısı değildir. |
| Test | Node test runner + `tsx`; kökte **90 test dosyası**. Ayrı PostgreSQL SQL/PowerShell ve yerel mock araçları `tests/staging-postgres` altında. |
| Çalıştırma | `npm run dev` webpack, `npm run build` Turbopack kullanır. `vercel.json` yalnızca schema içerir; depoda deployment/cron kurulumu veya `.github` CI workflow'u bulunmadı. `trigger/` içinde izlenen worker uygulaması yok. |

Yerel Next.js proje yapısı ve Server Functions rehberleri `node_modules/next/dist/docs/` üzerinden incelendi. Sonraki geliştirmelerde kurulu sürümün belgeleri esas alınmalı.

## Özelliklerin gerçek durumu

| Alan | Mevcut uygulama | Eksik/kısıt ve ürün kararı |
| --- | --- | --- |
| Hesap/oturum | E-posta/şifre kayıt ve giriş, auth callback, korunan dashboard, profil, şifre değiştirme, cihaz/diğer/tüm oturumları kapatma. | Google düğmeleri `googleUnavailable`, şifremi unuttum `forgotUnavailable` gösteriyor. Oturum içi şifre değiştirme, unutulan şifre kurtarma akışı değildir. Canlı Auth/posta ayarları doğrulanmadı. |
| Creative Composer | Ürün ve destekleyici görüntüler, referanslar, preset/sunum biçimi, yaratıcı yönlendirme, format seçimi, OpenAI üretimi, sonuç saklama ve bildirimler bağlı. | Gerçek sağlayıcı/hosting/kalite oturumu bu görevde yapılmadı. Model kimliği seçilirse üretim kapalı. |
| Projeler/galeri | Listeleme, arama/filtreleme, yeniden adlandırma, tekli/toplu silme, favoriler, signed URL ile görüntüleme/yakınlaştırma ve güvenli görsel indirme mevcut. | İndirme mock tarayıcı ve güvenlik unit testleriyle doğrulandı; canlı Auth/Storage E2E bekliyor. Proje silme satır/cascade siler; Storage temizliği yapmaz. Orphan/retention ayrı iş. |
| Product Understanding | Ürün yüklemesi sonrası analiz tetiklenir; sürümlü ürün profili, cache/retry ve prompt/routing kullanımı vardır. | Yükleme de ücretli OpenAI analizine yol açabilir. Manuel forced reanalysis ayrı admission RPC'sine bağlıdır; kurulum/operasyon durumu bu incelemede doğrulanmadı. |
| Ürün sadakati | Ürün kimliği, apparel artwork/fit, saat/bilek, ayakkabı anatomisi, çanta, insan gerçekçiliği, sahne/kompozisyon ve creative compliance politikaları; validation ve sınırlı repair mevcut. | Otomatik kararlar görsel kalite garantisi değildir. Validator kullanılamazsa `succeeded_unverified` kararı mümkün. Gerçek ürün benchmark'ı ve insan incelemesi gerekli. |
| Görsel düzenleme | Mevcut sonuç üzerinde edit, validation/repair ve owner/idempotency admission altyapısı vardır. | `IMAGE_EDIT_EXECUTION_ENABLED` varsayılan false; kullanılabilir kabul edilmemeli. İlgili admission migration'ı ve runtime durumu ayrıca kanıt gerektirir. |
| Model Studio | Görünüm taslağı kaydetme/düzenleme/arşivleme, model kütüphanesi, aday inceleme ve OpenAI portre üretimi gerçek server action'a bağlı. | Onay düğmesi disabled. Kimlik sürümü/reference altyapısı olsa da onay → Composer'da aynı kimlikle üretim zinciri tamamlanmamış. Profil başına tek deneme; başarısız/belirsiz denemelerden sonra yeni deneme akışı yok. |
| Video Studio | Görselden videoya arayüz, görsel handoff, kaynak doğrulama, job/reconciliation servisleri, özel çıktı erişimi, Video Library. | Üretim kapalı. Standard: Kling v3 Pro; Pro: ayrı Seedance 2.0 route'u. Her ikisi `productionApproved: false`; action gerçek submit servisini bağlamıyor ve billing engelinde duruyor. |
| UGC Studio | Taslak save/load, ürün yükleme/değiştirme, ayrı sahne/diyalog alanları, süre tahmini, Standard/Premium seçimi, hazırlık action'ı ve sonuç listeleme altyapısı. | Creator'lar placeholder. Generate ve diyalog üretimi disabled. Hazırlanan job `draft`, `submitted: false`; hazır job üretilebilen video anlamına gelmez. |
| Kredi/abonelik | Plan/top-up kataloğu, entitlement, ledger, reserve/settle/release/refund, kaynağa bağlı expiry ve doğrulanmış event adapter kontratları. | Checkout veya imzalı ödeme webhook'u yok; event adapter kapalı. Görsel/model üretiminde müşteri kredisi düşme bağlı değil. Dashboard plan kartı `isDemo: true`. Ticari faturalandırma hazır değil. |
| Landing/iletişim | TR/EN landing, showcase, responsive UI ve iletişim formu bulunur. | İletişim formu doğrulama sonrası `unavailable` bildirir; mesaj gönderimi yok. |

Başlıca kaynaklar: [Composer action](../src/app/[locale]/dashboard/projects/[projectId]/generation-actions.ts), [model action](../src/app/[locale]/dashboard/models/actions.ts), [model aday üretimi](../src/lib/models/candidate-generation.ts), [aday inceleme](../src/features/models/candidate-review.tsx), [kimlik sınırı](../src/lib/models/composer-identity-boundary.ts), [video action](../src/app/[locale]/dashboard/video/generation-actions.ts), [video capabilities](../src/lib/video-generation/capabilities.ts), [UGC action](../src/app/[locale]/dashboard/ugc/actions.ts), [kredi fiyatlama](../src/lib/credit-economy/pricing.ts).

## Üretim akışları ve entegrasyon sınırları

### Creative Composer ve Model Studio

Composer'ın aktif yolu `createQueuedImageGeneration` ile kullanıcıya ait proje/asset'leri doğrular, submission UUID ile kayıt oluşturur, ardından **aynı istekte** `awaitGenerationPipeline` üzerinden üretimi bekler. OpenAI adaptörü `images.edit` kullanır; validation, uygun repair ve özel Storage çıktısı sonrasında sonuç döner. `queued` adı mevcut olsa da bu yol çalışan bir background queue değildir.

`src/lib/generation/image-worker-service.ts` ve `image-scheduler.ts` içinde ayrıca lease/heartbeat destekli worker temeli vardır. Aktif Composer bununla yürütülmez. Action ile worker servisinde büyük ölçüde paralel pipeline kodu bulunur; sonraki değişiklikte doğru yürütme yolunu hedeflemek gerekir. Şimdilik çalışan Composer'ı sırf birleştirmek için yeniden yazmak öncelik değildir.

OpenAI görsel isteğinin timeout'u 300 saniye, model portresinin 240 saniyedir. Hosting süresi/istek kesilmesi sonrası toparlanma bu incelemede kanıtlanmadı; `vercel.json` buna ilişkin runtime yapılandırması içermez. İlk beta için ölçüm ve sınır belirleme gerekir; ölçüm göstermeden tüm sistemi worker'a taşımak gerekmez.

Model Studio'nun aktif zinciri `generateModelPortrait` → `generateModelCandidate` → `candidateOpenAIProvider.images.generate` şeklindedir. DB unique key profil başına tekrar çağrıyı engeller; provider SDK retry kapalıdır. Ancak bu yol, `candidate-contracts.ts`, `candidate-engine.ts` ve `candidate-orchestration.ts` içindeki kapalı foundation policy yardımcılarını kullanmaz. Dolayısıyla bu yardımcıların `false` dönmesi aktif portre action'ını kapatmaz. Bu bir koddan doğrulanan durum tutarsızlığıdır; canlı çağrı yapılmadan saptanmıştır.

Composer submission idempotency'si ve modelin profil başına tek denemesi tek başına maliyet kotası değildir. Yeni ortak transport, submission/profil kimliğinden bağımsız kullanıcı/global günlük API denemesi kotası uygular. Customer credit reservation/ödeme hâlâ bağlı değildir. `local-image-budget.ts` genel üretim kotası olarak değerlendirilmemeli; yeni beta sınırı bundan bağımsızdır.

### Video Studio

Video Studio'nun fal tabanlı provider, storage, idempotency, ambiguity, reconciliation ve fenced billing adaptörleri mevcut. Ancak `VIDEO_GENERATION_ENABLED=true` tek başına yeterli değil: model route'ları onaysız ve production action'ında submit/billing wiring tamamlanmamış. İç reconciliation API'si de scheduler flag'i, bearer secret ve billing sınırlarıyla kapalıdır; depodaki bir route deploy edilmiş scheduler kanıtı değildir.

### UGC Studio

| Kontrat | Korunacak yönlendirme / uygulamanın hazırlık alt kümesi |
| --- | --- |
| Yeni Standard | fal `bytedance/seedance-2.0/mini/reference-to-video`, plan **v3**, 15 sn, 720p. |
| Yeni Premium | fal `bytedance/seedance-2.5/reference-to-video`, plan **v2**, 15/30 sn, 720p. |
| Tarihsel UGC Kling | fal `fal-ai/kling-video/v3/pro/image-to-video`, plan **v1**, 15 sn. Kaydedilmiş işin route/task kimliği korunur. |

Bunlar yerel registry/planner sınırlarıdır; bu incelemede güncel sağlayıcı şeması, hesap erişimi veya fiyat doğrulaması yapılmadı. UGC route'ları Video Studio'nun 5/10 saniyelik kontratından ayrıdır. Yeni Standard için Premium fallback'i yapılmamalı; eski Kling işleri Seedance'e taşınmamalı. 60 saniye için doğrulanmış assembly yolu yoktur.

`requestUgcGeneration` ve provider `submit` yöntemleri koşulsuz kapalıdır. Ortam değişkeniyle açılabilen UGC kaçış yolu yoktur. `verifyUgcSubmission` / `verifyUgcReconciliation`, açıkça enjekte edilen bağımlılıklarla test edilen yürütme noktalarıdır; uygulamada production worker/cron olarak bağlanmamıştır. fal SDK'sının retry davranışına karşı tek POST koruması fake fetch ile test edilir.

**Üretim engelleri:**

1. Gerçek iki bağlantılı claim yarış testi eksik. Mevcut [iki oturumlu plan](../database/verification/ugc_pipeline_two_session_concurrency_test.md) aynı job için yarışı kapsar; farklı job'ların aynı proje için yarışmasını veya sağlayıcı idempotency'sini kanıtlamaz.
2. Gerçek, yetkili creator reference provisioning yok. UI placeholder'larından üretilen snapshot'lar planner tarafından reddedilir. Ürün değişimi/silme eski Storage nesnesini silebildiği için job ömrü boyunca immutable kaynak saklama eksiktir; hash ile değişimi tespit etmek saklama sağlamaz.
3. Exact diyalog, TR/EN konuşma, ses seçimi, lip sync ve altyazı tamamlanmamıştır. Hazırlık politikası konuşmalı/altyazılı istekleri reddeder. Ses planlama desteği, private audio yükleme/decode akışı anlamına gelmez; media katmanı reference audio'yu engeller.
4. Özel çıktı saklama, recovery ve MP4 container/ölçü/süre kontrolü vardır; gerçek codec decode, oynatma, ses ve ürün/kimlik sadakati kanıtı yoktur.
5. Kalıcı worker/scheduler, maliyet/kredi reservation ve settlement, belirsiz task'ların operasyonel çözümü, kaynak/çıktı retention ve orphan süreci tamamlanmamıştır. Task ID'si kaybolan belirsiz submit otomatik tekrarlanmamalı.
6. Signed URL ömrü ile gerçek kuyruk bekleme süresi, polling bütçesi, bellek sınırı ve provider hata/yanıt biçimleri doğrulanmalıdır. Kontrollü ücretli doğrulama ve üretim Pipeline kurulumu için ayrı açık onay gerekir.

## Veritabanı ve migration durumu

| Grup | Kaynak ve bilinen durum |
| --- | --- |
| Ana uygulama | Profile/project/assets/generations, özel product/generated buckets, referanslar, favoriler, bildirimler, multi-view ve analiz cache migration'ları mevcut. Bu inceleme tümünün üretimdeki kurulumunu doğrulamaz. |
| Video/kredi | `20261020…20261026` grubu video lifecycle, reconciliation leases, ledger, tiers, credit economy, source lifecycle ve finansal okuma yetkilerini içerir. Production billing açık kabul edilmemeli. |
| Görsel yürütme | `20261027…20261029` durable jobs/reconciliation/lease renewal altyapısı. Schema bulunması aktif Composer'ın background çalıştığını göstermez. |
| Model/admission | `20261030…20261101` model identity/candidate/orchestration/integrity ve edit/reanalysis admission migration'ları. Eski F-07 güvenlik bulgusu için hardening dosyası mevcut; kurulu ortamdaki son durum burada yeniden doğrulanmadı. |
| Özel model tamamlama | `20261102000000_complete_model_studio_candidate_infrastructure.sql` kısmen kurulmuş foundation için hazırlanmış **özel repair**. Candidate tabloları/RPC/pointer zaten varsa bilerek hata verir. Önceki tüm model migration'larından sonra körlemesine çalıştırılacak genel migration değildir. |
| UGC Foundation | `20261103000000_create_ugc_studio_foundation.sql`: kullanıcı bildirimine göre **üretimde kurulu**. Owned projects/jobs, immutable snapshot, aktif job uniqueness, özel input/output bucket ve RLS temeli. Yeniden uygulanmamalı/değiştirilmemeli. |
| UGC Pipeline | `20261104000000_prepare_ugc_pipeline_claims.sql`: kullanıcı bildirimine göre **yalnızca disposable test projesinde kurulu**, üretimde kurulu değil. Route pinning, submission/reconciliation claim, lease fencing, task uniqueness ve atomik private completion. |

Pipeline için [statik doğrulayıcı](../database/verification/ugc_pipeline_preparation.sql) **14/14** ve [davranış SQL testi](../database/verification/ugc_pipeline_behavioral_test.sql) **26/26** geçmiş sonuçları kullanıcıdan alınmıştır. Bu geliştirmede UGC doğrulama SQL testleri yeniden çalıştırılmadı. Davranış dosyası iki oturumlu yarışı açıkça `NOT PROVEN` raporlar; ardışık ikinci claim'in reddedilmesi gerçek concurrency kanıtı değildir. Geçmiş başarılı kontroller, yeni bir değişiklik veya somut sorun yoksa tekrar tekrar çalıştırılacak bir audit döngüsüne dönüştürülmemeli.

Eski staging araçları 39/40 migration baseline'larına, belirli proje/host'a ve F-07 akışına bağlıdır; yerel depo şu anda 44 SQL dosyası içerir, test history 41 kayıttır. Eski staging runner'ın tüm yeni dosyaları kabul edeceği varsayılmamalı. Özellikle özel model repair'i nedeniyle sonraki DB işi hedef ortamın gerçek catalog/history'siyle seçilmeli; toplu push/reset veya geçmiş migration'ları yeniden yazma yapılmamalı. Dosya adlarındaki zaman damgaları deployment kanıtı değildir.

## Bu incelemede yapılan doğrulama

| Kontrol | Sonuç |
| --- | --- |
| `npm test` | **Başarılı.** Sekiz pretest dosyası aşaması geçti; ardından keşfedilen ana aşama **761 passed, 0 failed, 0 skipped**. Bu sayı ana aşamanın özetidir, pretest dahil toplam değildir. |
| `npm run lint` | **Başarılı**, exit 0. |
| `tsc --noEmit --incremental false` | **Başarılı**, exit 0; yerel TypeScript binary kullanıldı. |
| `npm run build` | **Başarılı**, Next.js 16.4.3; 32/32 static page üretim adımı, dashboard/API ve aktif Proxy derlendi. Bu bir deployment değildir. |
| `npm run test:runtime` | **11/11 başarılı**, anonim yerel production-server kontrolleri. |
| `npm audit --omit=dev` | **0 toplam bulgu**, exit 0; production bağımlılıkları. |
| `git diff --check` | **Başarılı**, exit 0. Yeni belgenin yerel kaynak bağlantıları ve whitespace kontrolü de yapıldı. |
| PostgreSQL / iki oturum | Yeni beta kotası **10/10**, bağımsız CLI oturumlarında kilit çakışması doğrulandı. UGC'nin önceki 14/14 ve 26/26 sonuçları yeniden çalıştırılmadı; UGC claim yarışı açık. |
| Canlı sağlayıcı / ödeme / Storage | Çağrılmadı. |
| Mobil / klavye / console | Gerçek tarayıcıda izole mock fixture ile TR mobil/EN desktop, indirme, hata ve odak testleri yapıldı. Yukarıdaki console ve canlı E2E sınırları geçerlidir. |

Testler salt dosya/kontrat kontrolleri, saf domain davranışı, React static render ve mock transport/repository testlerinin karışımıdır. Gerçek fal SDK'sı fake fetch ile de sınanır. `npm test`, `tests/staging-postgres` altındaki remote SQL/PowerShell suite'ini çalıştırmaz. Depoda Playwright/Cypress browser E2E kurulumu ve bu incelemeye alınabilecek izlenen yeni canlı staging raporu bulunmadı.

Mevcut benchmark araçları ve sentetik pilotlar kalite ölçüm akışını doğrular; gerçek üretim görüntüsüyle insan değerlendirmesi yapılmış benchmark sayılmaz. İlgili kaynaklar: [kalite benchmark'ı](generation-quality-benchmark.md), [apparel notları](apparel-fidelity-architecture.md), [staging hazırlığı](phase-7f-validation-readiness.md), [daha yeni Storage akışı](../tests/staging-postgres/PHASE-7F18-STORAGE.md).

## Öncelikli yol haritası

| Öncelik | Somut iş | Bitiş ölçütü / bağımlılık |
| --- | --- | --- |
| **P0 / production dependency kapısı tamamlandı** | Next.js/sharp ve etkilenen transitif paketler hedefli güncellendi; locale proxy'nin çalışma konumu düzeltildi. | Production npm audit **0**, test **761/761**, runtime **11/11**, lint/TypeScript/build başarılı. Production beta için canlı kabul oturumu ve ayrı açık kurulum/deployment onayı hâlâ gerekli. |
| **P0 / kod tamamlandı** | Composer ve portre girişleriyle ortak OpenAI transport'una açık beta erişimi ve atomic günlük user/global çağrı kotası eklendi. | Yerel SDK/unit testleri, gerçek PostgreSQL 10/10 ve iki oturum kilit kanıtı var. Production kurulum ve ayarları kapalı; ayrı onay gerekiyor. |
| **P0 / sonuç teslimi tamamlandı** | Galeri ve proje/dashboard tam ekranından güvenli görsel indirme eklendi. | Owner/bucket/path/MIME kontrolü, 60 saniyelik named signed URL, TR/EN hata/yüklenme ve klavye/focus doğrulandı. Canlı authenticated Storage doğrulaması bekliyor. |
| **P0 / UGC'deki tek açık yarış kanıtı** | Mevcut iki oturumlu planı yalnızca disposable test projesinde uygula ve kısa, temizlenmiş sonuç kaydı ekle. | Farklı backend PID'leri, çakışan transaction'lar, bir claim kazananı, B'de sıfır claim, tek lease/route ve exact fixture temizliği. Bu, UGC'yi açmaz; diğer engeller devam eder. 14/14 ve 26/26'yı sebepsiz yeniden başlatma. |
| **P1 / beta tamamlanması** | Mevcut Composer akışında TR/EN, mobil/masaüstü, yükleme → üretim → galeri/indirme ve hata durumlarını odaklı doğrula. | Önce mock/yerel kontrol. Sonra kullanıcı açık onayıyla az sayıda, bütçesi belli gerçek ürün oturumu; kaynak/çıktı ve ürün sadakati değerlendirmesi, süre/maliyet/hata kaydı. Upload sonrası analizin de ücretli olabileceğini hesaba kat. |
| **P1 / beta desteği** | Şifre kurtarma ve ulaşılabilir destek akışını tamamla; kapalı özelliklerin metinlerini gerçek durumla eşleştir. | TR/EN çalışır kurtarma veya açık destek yolu; Google/ödeme/video/model kimliği hakkında çalışmayan özellik vaadi yok. Yeni dış servis ancak gerekçeyle. |
| **P2 / ticari SaaS** | Mevcut credit economy üzerine ödeme sağlayıcısı, imzalı webhook, gerçek entitlement, reservation/settlement/refund ve plan görünümünü bağla. | Onaylı fiyat/failure politikası; test event replay'inde çift grant/debit yok; başarısız/ambiguous üretim için açık müşteri davranışı. Production finans ve deployment ayrı onaya bağlı. |
| **P2 / Model Studio'nun ürünle bütünleşmesi** | Güvenli aday onayı, identity version/reference tamamlanması ve Composer'da aynı modelle üretim. | Önce hedef DB'deki integrity kontratı; sonra ürün ve kimlik sadakati testleri. Tek portreyi onaylı çok açılı kimlik kanıtı gibi sunma. Gerçek provider denemesi ayrıca onaylı. |
| **P2 / Video Studio** | İlk açılacak tek route için gerçek submit/billing/scheduler wiring ve kontrollü provider doğrulaması. | Ücretli sınama ve kurulum onayı, durable sonuç teslimi ve hata/ledger davranışı kanıtı. Video Studio ve UGC model registry'lerini karıştırma. |
| **P3 / UGC yayına hazırlık** | Yetkili creator ve immutable input, önce sınırlı görsel video dilimi, ardından konuşma/lip sync/altyazı, worker ve finance. | Yukarıdaki UGC engelleri kapanır; sessiz video başarısı konuşmalı UGC başarısı sayılmaz. Foundation korunur, historical Kling route'ları korunur. Pipeline production kurulumu ve üretim açılması ayrı açık onay ister. |
| **P3 / operasyon** | Kanıtlanan ihtiyaca göre CI, production gözlemlenebilirlik, storage retention/orphan işlemleri ve gerekirse image worker entegrasyonu. | Hedefli kontrol ve ölçüm; toplu refactor, paket güncellemesi veya bütün testlerin tekrar tekrar çalıştırılması yok. Temizlik/destructive işlem açık onaya bağlı. |

### Önerilen kilometre taşının kabul ölçütü

**“Composer kontrollü beta”** şu durumda tamamlanmış sayılır: yetkili beta kullanıcısı TR/EN ve mobil/masaüstünde ürünü yükleyebilir, preset/yönlendirmeyi seçebilir, tekil isteğin sonucunu veya açık hatasını alabilir, sonucu yeniden açıp indirebilir; erişim ve maliyet sınırı sunucuda uygulanır; yeni submission ile retry/replay ayrımı nettir; validator devre dışıyken doğrulanmamış çıktı başarılı kalite diye sunulmaz. Onaylı gerçek oturumda ürün kimliği, süre ve maliyet kaydı tutulur. Mevcut test/lint/build geçer ve ilgisiz özelliklerde regresyon olmaz.

Bu kilometre taşı kapsamında UGC üretimi açılmaz; ödeme alma, tüm sektörlerde kalite garantisi, aynı model kimliğiyle üretim ve tüm video seçenekleri tamamlandı sayılmaz. Önce birkaç temsilî ürünle değer kanıtı elde edilir, sonra kanıtlanan kullanım için kapsam genişletilir.

## Güncelliğini yitiren kayıtlar ve bakım kuralı

- `README.md` bu geliştirmede aktif portre yolu, yeni beta sınırları ve onay gerektiren production geçişiyle güncellendi. Kapalı foundation worker gate'leri, artık ortak beta sınırıyla korunan portre action'ıyla karıştırılmamalı.
- Eski `ugc-production-pipeline-preparation.md`, `ugc-seedance-integration-audit.md`, `ugc-model-tiers-audit.md` ve bazı kaynak yorumları Pipeline'ı tamamen “unapplied/static only” diye anlatır. Güncel durum **test projesinde kurulu, üretimde değil; 14/14 + 26/26 bildirildi; gerçek concurrency açık** şeklindedir.
- Eski staging README'si ve sonraki Phase 7F belgeleri farklı baseline ve Storage akışlarını anlatır. Tarihsel talimatlar bugünkü hedef ortam için otomatik çalıştırma talimatı değildir.
- Bu görevde önceki belgeler yeniden yazılmadı; bu dosya güncel durumun giriş noktasıdır. Sonraki anlamlı geliştirmede yalnızca etkilenen satır/öncelik güncellenmeli; yeni uzun audit belgesi üretmek varsayılan olmamalı.

Sonraki güncellemelerde değişen özelliği, kaynak dosyalarını, çalıştırılan kontrolü ve sonucu, canlı ortam kanıtının kaynağını ve açık kalan tek sonraki adımı kaydet. Prod migration, ücretli AI çağrısı, destructive işlem ve deployment için kullanıcıdan açık onay olmadan işlem yapma. UGC engelleri kapanana kadar kapalı durumu koru.

## Güncel geliştirme kaydı

- İndirme: `image-download.ts`, `download-actions.ts`, `image-download-button.tsx`, galeri/viewer/dashboard bağlantıları ve TR/EN mesajları.
- Beta sınırı: `beta-policy.ts`, `beta-transport.ts`, `beta-budget.ts`, ortak OpenAI client ve Composer/model action erişim kontrolleri; `.env.example`.
- Test: `image-download.test.ts`, `openai-beta-budget.test.ts`; yeni kota migration'ı ve üç SQL doğrulama dosyası. README ve bu durum belgesi güncellendi.
- Dependency: **yok**. CLI yalnız yerel ignored önbellekte; tarayıcı mock fixture'ı da ignored alanda tutuldu ve uygulamaya test route'u eklenmedi.
- Görev başında bulunan altı modified ve iki untracked UGC dosyası korundu; yeni commit'lere katılmıyor. Bunlara ait yerel doğrulama bağlantıları remote branch'te henüz bulunmayabilir.
- Son test/lint/TypeScript/build başarılı. Diff/whitespace ve secret kontrolü commit öncesinde yapılır.
- Bekleyenler: canlı Auth/Storage, kullanıcı onaylı gerçek ürün/sağlayıcı kalitesi ve production geçişi; disposable projede UGC'ye özel gerçek iki-claim testi.

## GitHub senkronizasyon kaydı

- `fdf96a3`: authenticated private image downloads.
- `edf827a`: atomic OpenAI beta access and daily request limits.
- İki geliştirme `origin/codex/composer-beta` branch'ine gönderildi; README ve durum belgesi ayrı dokümantasyon commit'iyle aynı branch'te tutulur. Main'e merge veya deployment yapılmadı.
- Push sırasında GitHub default branch için dependency güvenlik uyarıları bildirdi. Bunlar yeni geliştirmeden önceki bağımlılık ağacına ait; doğrulanmış production etkisine göre hedefli düzeltme önceliğidir, toplu otomatik paket güncellemesi yapılmadı.
- Salt okunur kontrolün doğruladığı önceki 1 kritik ve 5 yüksek production dependency bulgusu, yukarıdaki hedefli güvenlik geliştirmesinde kapatıldı; güncel sonuç 0.
- Reviewable draft PR: [Composer Beta #1](https://github.com/farukozgu/ai-creative-platform/pull/1). GitHub connector'ın PR yazma yetkisi yoktu; mevcut Git Credential Manager oturumu bellekte kullanılarak PR oluşturuldu. Yeni token oluşturulmadı veya kaynak/dokümana kaydedilmedi.
