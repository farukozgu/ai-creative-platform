# Cinematic'i koruyan preset kalite pilotu

## Başarılı kayıt ve koruma sınırı

Development projesinde salt okunur incelenen son başarılı Cinematic kayıt: `e1f44b4c-e246-457a-99ef-b0a85925cfff`, 30 Ekim 2026 16:49:34 Türkiye saati. Standard, 5s, 16:9, multi; ana asset `dd5ccbcd-f8d1-504f-ac73-4e9020ed7fee`.

Kayıtlı Director planının origin'i **fallback**. AI üretimi gibi raporlanmadı. Product Understanding profilinde yeşil/beyaz yaka görünümü ve loose-fit şekli var; spesifik örgü/dikiş kanıtı sınırlı. Plan sırası aynen:

1. Genel ürün, diyagonal boşluk, kontur ışığı — 1s.
2. Genişletilmiş güvenli yüzey kadrajı, grazing ışık — 1s.
3. Aynı görünür yüzde lateral kadraj değişimi — 1s.
4. Farklı marjlarla güvenli detay ölçeği, raking ışık — 1s.
5. Simetrik tam ürün hero, dengeli kontur ışığı — 1s.

Olası başarı etkenleri: birkaç saniyede okunabilen ölçek/kadraj değişimleri, farklı ışık görevleri, ürünü hâlâ tanınabilir tutan kaynak bağlılığı ve net kapanış. Kullanıcının başarılı bulduğu görsel kalite referans kabul edildi; bu turda video yeniden üretilmedi veya bağımsız bir görsel kalite puanı verilmedi. Spesifik doku kanıtı bulunmayan iki plan dahil mevcut kombinasyon aynen korundu.

Job `videoPreservation` içinde gerçek planı, derlenmiş promptları, negative prompt'u, cfg ve beş prompt hash'ini saklıyor. Tam HTTP Kling payload'ı ve o isteğin signed URL'leri tutulmuyor. Dolayısıyla bunlar için eksiksiz geçmiş HTTP isteği iddia edilmiyor. Kaydedilmiş plan tekrar derlendiğinde **beş hash ve negative prompt birebir eşleşiyor**.

Koruma testleri kod değişikliğinden **önce** alındı: Cinematic ve diğer değiştirilmeyen 20 preset için toplam 2689 vaka; preset konfigürasyonu, fallback, compiler, iki provider tier'ının payload builder sonucu ve cache anahtarları. Cinematic için AI request bağlamı/şeması/talimatları ile doğrulanmış ön+arka örneği de donduruldu. Testler beklenen değerleri yeniden üretip üzerine yazmıyor.

`duration-strategy.ts` içindeki Cinematic tanımı, `preset-library.ts` içindeki Cinematic seed/single-5s tanımı, `kling-compiler.ts`, global Director/contract sürümleri, signing/cache implementasyonu değiştirilmedi. Ortak core/dispatch'e eklenen davranış yalnız aşağıdaki üç preset ID'sinde çalışıyor. Cinematic ve diğer 20 preset'in parmak izleri aynı kaldı.

## Uygulanan 12 hücre

Yüzey ve Doku / Surface & Texture mevcut `material-detail` ID'sidir. Shot'lar ayrı provider girdileridir; single çekimde kesme yoktur.

| Preset | 5s single | 10s single | 5s multi | 10s multi |
| --- | --- | --- | --- | --- |
| Yüzey ve Doku | Sabit raking ışıkta yüzey boyunca pan: 1s yerleşme, 3s izleme, 1s hold | Kilitli yakın kadrajda ışık bandıyla rölyef: 2+6+2 | Yüzey 1 → ışık/rölyef bağlamı 2 → tanınabilir tam ürün 2 | Yüzey izi 3 → farklı doğrulanmış birleşim 2 → ışıkla bağlam 2 → tam ürün 3 |
| Macro Detail Reveal | Tek doğrulanmış özelliğe optik yaklaşım 3, net hold 2 | Detaydan tam ürüne tek pull-back: detay 3, açılma 5, hold 2 | Detay hook 2 → orta ölçek/lateral bağlam 1 → tam ürün 2 | Özellik keşfi 3 → farklı yüzey bağlantısı 2 → bağlam 2 → tam ürün 3 |
| Product Spotlight | Kilitli geniş kadraj; ışık havuzuyla kontur 3, grafik hold 2 | Orta ölçekten kampanya boşluğuna pull-back: ışık 2, açılma 5, hold 3 | Işık hook 1 → lateral grafik yeniden kadraj 2 → dengeli packshot 2 | Diyagonal grafik giriş 2 → ışıkla kontur 3 → yeniden kadraj 2 → packshot 3 |

Explicit static/push-in gibi seçimler, yeni single pull-back yönlendirmesiyle çatışırsa kamera tercihi korunur; kompozisyon sabit ölçeğe ve uygun hold'a çevrilir. Sabit kameraya genişleyen kadraj sözü verilmez.

Preset sürümleri yalnız hedeflerde arttı: material-detail 2, macro-detail-reveal 4, product-spotlight 2. Bu hedeflerin eski planları yenilenir. Cinematic'in sürümü ve cache davranışı aynı kaldı.

## Tekrar ve kanıt yönetimi

- Doku ve özellik aksanları farklı, mevcut canonical evidence atomları seçer. Ürün parçaları, malzeme, örgü veya dikiş preset isminden çıkarılmaz.
- İkinci bağımsız yakın plan kanıtı yoksa fallback o shot'ı kaldırıp zamanını final hold'a aktarır: örneğin 10s plan 3+2+2+3 yerine 3+2+5 olabilir. Toplam süre korunur.
- AI planındaki iki detail/material aksanı aynı kanıtı gereksiz kullanırsa yalnız bu üç hedefte validator reddeder. Açık kullanıcı odak isteği bu otomatik çeşitlilik kuralının önündedir. Genel ürünün giriş/finalde görünmesi tek başına tekrar sayılmaz: ışık, ölçek ve görsel görevi farklı olabilir.
- Yeni strateji bağlamı, orta bağlam/yeniden kadraj shot'ı için doğrulanmış back/side referansı aday gösterir. Bu zorunlu değildir. Mevcut review, source binding, @Element1 ve ilk shot/single kısıtları kullanılır; unverified görüntü fallback'te kanıta dönüşmez.
- Provider prompt sınırları 512/2500, 16KB Director bound'u, kaynak sahipliği/hash kontrolleri, quota ve signed quote onayı korunur. Yeni 5s hedefler mevcut pilotların 4000 token tavanını kullanır; ortak transport tavanı yükseltilmez, ek inference çağrısı eklenmez.
- 15s üretim desteği açılmadı. Mevcut type/admission/provider/UI kapıları değişmedi.

## Diğer 23 preset için ayrı değerlendirme

Aşağıdaki dört sütun her presetin kendi kimliğini ayrı süre/mod diline çevirir. **★ olan üç satır bu tur uygulandı. Diğer 20 satır tasarım değerlendirmesidir; kodları değiştirilmedi ve regresyon parmak izleri korunur.** Detay ve açı önerilerinin tamamı kaynak kanıtına bağlıdır.

| Preset | 5s single yönü | 10s single yönü | 5s multi görevleri | 10s multi görevleri |
| --- | --- | --- | --- | --- |
| Luxury Fashion Film | Poised silüet ve kontur ışığı | Kampanya boşluğunda long-lens hareket | Silüet / editorial kadraj / final | Mekânsal açılma / kontur / kanıtlı detay / uzun hero |
| ★ Macro Detail Reveal | Tek özellik hook | Detaydan forma tek pull-back | Detay / bağlam / tam ürün | Özellik / farklı yüzey / bağlam / tanıma |
| Minimal Studio | Dengeli kilitli packshot | Hafif focus settle, uzun sessiz hold | Grafik ölçek karşıtlığı / packshot | Genel / tek doğrulanmış tasarım detayı / simetrik final |
| Floating Fashion | Dikey boşlukla hafiflik | Kaynak duruşunu koruyan yavaş yükseliş | Silüet / üst boşluk / final | Kontur / drape bağlamı / boşluk / tam form |
| Precision Macro | Kilitli kanıtlı özellik | Özellik çizgisinde kısa hassas tarama | Grafik özellik / tanıma | Özellik / bağlantı çizgisi / grafik düzen / tam form |
| Glass Reflection | Kanıtlı yüzeyde yumuşak yansıma | Tek highlight geçişi | Kenar / görünür yansıma / form | Geometri / yansıma / okunabilir işaret / final |
| ★ Product Spotlight | Işık havuzunda grafik hook | Işık havuzu ve kampanya boşluğuna açılma | Işık / reframe / packshot | Grafik giriş / kontur / reframe / packshot |
| Elegant Orbit | Bilinen yüzde kısa parallax | Aynı yüzde derinlik okuması | Bilinen açı / eğri / hero | Genel / doğrulanmış ek açı / kontur / hero |
| ★ Surface & Texture | Raking ışıkta yüzey izi | Kilitli ışık/rölyef çalışması | Doku / ışık bağlamı / tam ürün | Doku / ayrı birleşim / ışık bağlamı / tanıma |
| Macro Stitching | Doğrulanmış dikiş çizgisi | Bir çizgi boyunca ölçülü tarama | Dikiş / tasarım bağlamı / ürün | Dikiş / farklı doğrulanmış bağlantı / kontur / tam ürün |
| Fabric Motion | Gerçek kıvrımda ışık akışı | Kaynak drape boyunca tek dikey yol | Kıvrım / drape / silüet | Genel / kanıtlı yüzey / mevcut kat çizgisi / tam form |
| Label Reveal | Mevcut işarete okunabilir yaklaşım | Geometriden yazı alanına tek hareket | Ürün / okunabilir işaret / packshot | Geometri / işaret / görünür tasarım detayı / packshot |
| Dramatic Backlight | Rim-light konturu | Tek kontrollü kontur gelişimi | Kontur / görünür kenar / hero | Silüet / kenar / işaretin okunması / tam form |
| Cinematic Dial | Doğrulanmış kadrana optik yaklaşım | Grafik düzen boyunca tek tarama | Kadran / tam saat | Düzen / farklı görünür kasa detayı / tanıma / hero |
| Metallic Light Sweep | Sabit kadrajda highlight bandı | Görünür finish üzerinde tek bant geçişi | Yüzey / kontur / hero | Genel / finish / kanıtlı birleşim / tanınabilir hero |
| Hardware Reveal | Doğrulanmış donanım çizgisi | Bağlantıyı açmadan çizgiyi izleme | Donanım / bağlam / ürün | Parça / görünür bağlantı / form / final |
| Floating Accessory | Dikey marjlarla poised sunum | Kaynak yönünü koruyan hafif glide | Tam form / kontur / final | Genel / ek kanıtlı açı / çizgi / açık marjlı hero |
| Sneaker Hero | Kaynak seviyesinde kısa glide | Profil boyunca ritmik ama tek yol | Profil / doğrulanmış üst detay / hero | Genel / üst yüzey / bilinen açı / grafik final |
| Upholstery Macro | Mevcut yüzey kavşağı | Yüzey boyunca sakin yatay tarama | Kavşak / ölçek / form | Genel / doku / kanıtlı birleşim / dengeli final |
| Culinary Texture | Bitmiş yüzey katmanı | Aynı sunum üzerinde sakin glide | Yüzey / sunum bağlamı / final | Katman / farklı görünür kenar / genel sunum / final |
| Optical Lines | Asimetrik kontur crop | Görünür çizgide yatay yol | Çizgi / simetrik tam form | Kontur / doğrulanmış bağlantı / grafik boşluk / simetri |
| Craftsmanship Study | Bitmiş işçilik detayı | Üretim hikâyesi uydurmadan tek izleme | Doğrulanmış işçilik / bağlam / form | İşçilik / farklı kanıtlı bağlantı / kontur / tam ürün |
| Window Display | Mevcut ortamda retail ışık | Display marjlarına açılan tek yol | Genel / özgün tasarım detayı / hero | Genel / kanıtlı detay / ışık / geniş retail final |

## A/B senaryoları

1. Başarılı kazak: aynı kaynak, 5s Standard multi. Cinematic kontrol olarak aynı kalır; Yüzey ve Doku varyantında yüzey okuması ve finalde tanınma karşılaştırılır. Örgü veya dikiş yalnız analiz/görüntü gerçekten doğruluyorsa istenir.
2. Yakın planı çözülebilen çanta/donanım: Macro 5s 2+1+2 ile Macro 10s geliştirilmiş detay-bağlam ritmi karşılaştırılır. İki aksanın gerçekten farklı özellikler göstermesi kontrol edilir.
3. Belirgin geometriye sahip kozmetik ambalajı: Spotlight 5s ve 10s, etiket okunabilirliği ve ışık havuzunun renk/şekli koruması açısından karşılaştırılır.
4. Aynı ürünün doğrulanmış ön+arka görselleri: 5s multi orta bağlam shot'ında referans kullanımını kontrol et. Single-shot ve front-only kontrolünde arka geçiş bekleme.
5. Düşük çözünürlük/tek kanıt: yakın plan tekrarının kaldırılması, tam süre toplamı ve uzatılmış final hold değerlendirilir.

Her gerçek test mevcut yeni plan/quote ve fiyat onayı akışını kullanır. Bu tur ücretli API çağrısı, commit/push, migration veya production değişikliği yapılmadı; yeni dependency eklenmedi.

## Dosyalar ve doğrulama

Son doğrulama: **175/175 hedefli/regresyon testi başarılı**. Başarılı job'ın kaydedilmiş beş prompt hash'i ve negative prompt'u aynen eşleşti; korunan 21 presetin 2689 vakalık parmak izi değişmedi. `npx tsc --noEmit`, varsayılan Turbopack ile `npm run build` ve `git diff --check` başarılı. Kaynak lint'i `npm run lint -- --ignore-pattern '.next-reference-check*/**'` ile başarılı; önceden bulunan üretilmiş `.next-reference-check*` klasörleri dışında config veya kaynak dışı temizlik yapılmadı.

- Yeni uygulama: `src/lib/video-director/preset-quality-directions.ts`.
- Hedefe bağlı dispatch/validator/fallback: `presets.ts`, `plan-contract.ts`, `core.ts`. Diğer presetlerin verisi ve global sürümler korunur.
- Regresyonlar: `tests/cinematic-quality-lock.test.ts`, `tests/video-preset-quality-pilot.test.ts`, `tests/fixtures/preset-quality-baseline.ts`, `tests/fixtures/protected-preset-fingerprints.json`, `tests/fixtures/cinematic-knitwear-success.json`.
- Hedef presetin eski shot/sürüm beklentileri güncellendi: `tests/video-director.test.ts`, `tests/video-preset-library.test.ts`.
- UI, CSS ve locale dosyaları bu görevde değiştirilmedi. Önceki görevlerin çalışma ağacı korundu. Mobil/klavye/console için yeni manuel tarayıcı doğrulaması yapılmadı; mevcut UI/i18n sözleşme regresyonları çalıştırıldı.
