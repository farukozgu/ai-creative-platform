# Video Studio ürün detaylarını koruma — ilk sürüm

> Tarihsel uygulama notu: Fotoğraftan Hareket yolu 27 Ekim 2026'da kaldırıldı. Aşağıdaki yerel render ayrıntıları ve kabul kanıtı kaldırılmadan önceki durumu kaydeder; güncel Video Studio üretimi yalnız Kling Standard/Pro kullanır. Uygulanmış migration'lar korunmuştur.

26 Ekim 2026 · PR #2 · Ücretli sağlayıcı çağrısı yapılmadan geliştirildi.

## Çalışan yollar

- **Fotoğraftan Hareket** varsayılandır. Mevcut Sharp `contain` karesi FFmpeg ile sessiz H.264, 24 FPS, 5/10 saniye MP4'e dönüşür. Sabit, hafif yaklaşma ve sola/sağa kaydırma vardır. Kaynak kare hareket boyunca kadraj içinde kalır; ürün yeniden çizilmez. Küçültme ve sıkıştırma küçük yazıları yumuşatabilir.
- **Kling ile Hareket** Standard/Pro akışını korur. Sunucudaki sürümlü prompt, mevcut Product Understanding profilini varsa kullanır, kamera seçimini bağlar ve hedefli `negative_prompt` gönderir. `cfg_scale=0.5` korunur. Orbit, sert dönüş ve şekil değiştirme talepleri açıklamayla reddedilir; sessizce farklı bir isteğe çevrilmez. Yeni ücretli profil çıkarımı yoktur.
- Kullanıcı orijinal görselde tek kritik bölge seçebilir; sürükleme yanında klavye ve yüzde alanları vardır. Kullanıcı metni doğrulanmamış ipucudur. Orijinal–hazırlanmış kare koordinat dönüşümü ve SHA256, yöntem, prompt sürümü ve isteğin özeti immutable job snapshot'ında tutulur.
- Aynı UUID farklı yöntem, kaynak, bölge, hareket veya analiz onayıyla kullanılamaz. Yerel isteklerin UUID alanı ayrıdır; onaylı Kling UUID'si yerel üretimde reddedilir. Yerel job'larda FAL task veya bütçe rezervasyonu oluşmaz.

## Onaylı analiz

Önceden seçilmiş analiz, tamamlanmış Kling videosunda mevcut Studio/Library polling'i veya detay sayfası açıldığında devam eder. Yeni scheduler yoktur. Sahiplik kontrollü tek `video_fidelity_reviews` tablosu job + değerlendirme sürümü başına onayı, çalışma durumunu ve raporu saklar. Atomik claim ve ücretli çağrıdan önce kalıcı submission marker vardır. Belirsiz çağrı otomatik tekrarlanmaz; analiz hatası videonun başarılı durumunu değiştirmez.

Sunucuda beş kare çıkarılır: 5 saniyelik video için 0, 1.3, 2.5, 3.8 ve 4.8 saniye. Kritik bölge seçilmişse orijinal yakın planı ve orta/son karelerden geniş bağlamlı iki pencere eklenir. Bu pencereler nesne takibi değildir; bölge görünmüyorsa/karşılaştırılamıyorsa sonuç **doğrulanamadı** olmalıdır. Yakın planlar, tam kare küçültülmeden önce çıkarılır. Dört değerlendirme durumu ve zaman damgaları korunur; sayısal kalite yüzdesi yoktur.

Model mevcut **gpt-4o-mini**'dir; başka modele otomatik geçilmez. [Resmî model fiyatı](https://developers.openai.com/api/docs/models/gpt-4o-mini) ve [görsel token kuralları](https://developers.openai.com/api/docs/guides/images-vision#tile-based-image-tokenization) 26 Ekim 2026'da kontrol edildi:

| Girdi sınırı | Hesaplanan analiz üst tahmini |
| --- | --- |
| Bir kaynak + beş tam kare, düşük detay | $0.006270 |
| Yukarıdakiler + en çok üç adet 1024 px yüksek detay yakın plan | $0.017746 |

Girdi $0.15 / milyon, çıktı $0.60 / milyon token; çıktı 2200 token, metin için 16000 tokenlık ihtiyatlı zarf kullanılır. Hesap tam sayı mikro-dolarla yukarı yuvarlanır. Prompt/schema bayt sınırı ayrıca pay bırakır. Fiyat sürümü `gpt-4o-mini-2026-10-26`, son geçerlilik 26 Kasım 2026 UTC'dir; doğrulanmış fiyat yoksa analiz kapalıdır. Kling bedeli, analiz ve toplam ayrı gösterilir; mevcut $0.70 FAL onayı genişletilmez.

Model resmî katalogda deprecated işaretlidir; bu hesabın gerçek model erişimi ücretli çağrıyla sınanmadı. İlk gerçek analiz için model ve yukarıdaki tutar kullanıcıya sunulup ayrıca açık onay alınmalıdır. Fiyat doğrulanmış olması, modelin etiketteki bozulmayı yakalayacağının kanıtı değildir.

## Kurulum sınırı

- Migration `20261026195727_video_product_preservation.sql`, açık hedef onayı sonrasında yalnız disposable **gklpgcyndeghjgemoonk** projesine bir kez uygulandı. Transaction/rollback PostgreSQL doğrulaması 16/16 geçti. Tek yeni tablo, servis RPC'leri ve snapshot koruma trigger'ı içerir; eski migration'ları yeniden çalıştırmaz.
- Production **fnzrnlvpkzwztccqzyzf** değişmedi. Production migration, deployment ve merge ayrıca onay gerektirir. Bu migration'ı toplu `db push/reset` ile uygulamayın; hedefin history'sini kontrol ederek yalnız eksik migration'ı uygulayın.
- `.env.local` ve mevcut beta onayları değiştirilmedi. Yeni kapılar varsayılan kapalı: `VIDEO_SOURCE_MOTION_ENABLED=false`, `VIDEO_FIDELITY_ENABLED=false`. Fotoğraf modu için migration ve mevcut Video beta allowlist gerekir. Analiz için ayrıca mevcut OpenAI beta allowlist, kota RPC'si, API anahtarı ve iş başına açık maliyet onayı gerekir.
- Bu nedenle production'a bağlı mevcut localhost hesabında yeni fotoğraf modu henüz açılmaz. İzole staging kabul ortamında gerçek upload → yerel MP4 → private Storage → oynatma yolu çalıştırıldı. Production kurulumu onaylanmadan bu engeli kaldırmayın.
- UGC Generate ve müşteri ödeme sistemi değişmedi; kapalı kalır. FAL UUID, $0.70 tavanı ve toplam bütçe/idempotency korumaları korunur.

## Medya sınırları

Tek yeni medya bağımlılığı pinlenmiş `ffmpeg-static@5.3.0` (FFmpeg b6.1.1, GPL-3.0-or-later). Sunucuda Node runtime ve çalıştırılabilir binary gerekir; Next output tracing ilgili sayfa/API paketlerine binary'yi dahil eder. Dağıtımda lisans yükümlülükleri ve platformun native binary desteği değerlendirilmelidir.

Kaynak 25 MB / 40 MP decode, video 32 MB, 5/10 saniye, üç oran; FFmpeg shell kullanmaz. Render 45 saniye, kare çıkarımı 30 saniye, OpenAI 30 saniye ile sınırlıdır. Renderer iki codec thread'i, sınırlı tek allocation ve kendine ait geçici dizin kullanır. Timeout yalnız kendi child process'ini sonlandırır. Veritabanı claim'i hesap başına bir, uygulama genelinde iki eşzamanlı yerel render'a izin verir. Kaybolan yerel işlem yeniden render edilmez; owner kapsamındaki süre aşımı terminal olur. Mevcut kullanıcı dosyalarında toplu temizlik yoktur.

## Kabul kanıtı ve sınırlar

- Gerçek 2400×3600 ceket JPEG'i üç orana hazırlandı; orijinal dosyanın hash'i değişmedi. Yerelde yeni 5 saniyelik fotoğraf hareketi MP4'ü üretildi. Özel JPEG/MP4, yakın planlar ve karşılaştırma görseli Git'e eklenmedi.
- Mevcut Kling MP4'ünün 2.5 ve 4.8 saniye kareleri gerçekten decode edildi. İnsan gözlemiyle etiket harflerindeki değişim görüldü. Aynı çözünürlüğe küçültülmüş kaynak kontrolü, sadece sıkıştırmadan doğan yumuşamayı ayırt etmek için saklandı. Yerel fotoğraf hareketinde harf geometrisi kaynak görüntüden gelir; bu, tüm metnin her çözünürlükte okunacağı garantisi değildir.
- **Otomatik etiket bozulması tespiti doğrulanmış değildir.** OpenAI çağrısı yapılmadı. Mock raporlar akış/UI testidir; gerçek ceket analiz sonucu değildir. Kemer, siluet ve doku için otomatik kalite onayı verilmedi.
- Testler gerçek FFmpeg render/decode (üç oran × iki süre), prompt/idempotency/maliyet sınırları, belirsiz analizde tek çağrı ve görünmeyen detayların korunmuş sayılmamasını içerir. Sentetik staging hesaplarıyla gerçek Auth/RLS/Storage, eşzamanlı claim ve Chrome kontrolleri yapılır. Browser fixture raporu açıkça MOCK'tur.

Tekrar çalıştırma araçları:

- `npm test`, `npm run lint`, `npx tsc --noEmit --incremental false`, `npm run build` (varsayılan Turbopack).
- `scripts/verify-video-preservation-local.ts`: yalnız yerel kabul; dış servis kullanmaz.
- `scripts/verify-video-preservation-staging.ts`: açık `VIDEO_QA_PROJECT_REF=gklpgcyndeghjgemoonk` gerektirir. FAL/OpenAI anahtarlarını boşaltır, sentetik hesaplar oluşturur ve yalnız kendi fixture'larını temizler. `VIDEO_QA_PLAYWRIGHT_MODULE` verilirse izole 3100 portunda gerçek Chrome testi de çalışır; ana `.env.local` değişmez.
