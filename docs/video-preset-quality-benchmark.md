# Video Preset Quality Benchmark

**Kapsam:** Director 3.1 / 24 preset, ücretsiz mevcut fallback + gerçek compiler + gerçek payload/receipt/quote fonksiyonları. 20 ürün, 7584 senaryo, 7584 benzersiz model/süre/çekim planı kaydı. Hiçbir OpenAI/Kling istemcisi çağrılmadı; ağ runner içinde engellendi. Üretim kodu ve database ağacının SHA-256 özeti çalışmadan önce/sonra aynı: true. Özet: ac2dd75eb7d4d2094b8ee355c0bcfd31593bec1fffe2f4d2aa1e52cba55639f9.

Bu sonuçlar **OpenAI Director'ın canlı anlamsal veya sinematik kalitesini ölçmez**. Ücretli planner kullanılmadığından çevrimdışı deterministik fallback davranışı ölçüldü. Fikstür kanıtları gerçek piksel incelemesi değildir; ek alt türler sentetik uyumluluk örnekleridir. Güvenli bir fallback'in iyi reklam yönetmenliği yaptığı varsayılmadı.

## Tekrarlanabilir çalıştırma

`npx tsx scripts/run-video-preset-quality-benchmark.ts`

JSON: `docs/video-preset-quality-benchmark.json`. Her senaryo `planRef` ile gerçek plan, payload, önizleme ve karakter sayılarına bağlanır; her senaryo kendi gerçek planına ayrı referans verir. HMAC için yalnız benchmark sabiti ve sabit saat kullanılır, gerçek anahtar/env okunmaz. Fiyat onayı testindeki 0.7 USD sentetik değerdir; gerçek fiyat/rezervasyon değildir.

## Veri ve matris

Ürünler: Parlak siyah kemerli ceket, Kot, Tişört, Deri çanta, Saat, Takı, Parfüm, Ayakkabı, Şapka, Gözlük, Mobilya, Yiyecek, Paketli gıda, Elektronik, Belirsiz profil, Kare kol saati, Deri bot, Kozmetik şişesi, Kanepe, Ekmek. Her presete en az iki kategori açısından uygun ürün atanmıştır. Tek ürünlü saat/ayakkabı/mobilya/gıda kategorilerine mevcut fikstürlerden açıkça sentetik ikinci varyant eklendi. Kozmetik şişesi parfümden ayrı tutuldu.

Her uygun preset–ürün çiftinde TR kısa, EN ayrıntılı, boş ve TR kısmen çelişkili istek × Standard/Pro × 5/10 saniye × single/multi uygulanır. Kamera seçimi auto bırakılarak serbest metnin gerçekten etkileyip etkilemediği ölçülür. Ayrıntılı multi isteği detaydan yaklaşma ve tam ürüne açılma; single isteği tek sağ pan ister. Çelişkili istek bilinmeyen arka yüz + 360 isterken uygulanabilir yavaş yaklaşmayı da içerir. Gerçek istek metinleri JSON'dadır.

Belirsiz profil bütün 24 presette ayrı dayanıklılık katmanıdır; kategori uyumsuz denemeler ana sıralamaya katılmaz. Ham 'uygun' sayısı 7040; buna evrensel stillerin belirsiz ürün denemeleri de dahildir. Ana sıralama yalnız kategorisi bilinen ürünleri kullanır.

## Açıklanabilir 100 puan rubriği

| Boyut | Tavan | Deterministik ölçüt |
|---|---:|---|
| Ürüne özgülük |25| Kanıt ID/odak tutarlılığı 7; yakın kadrajda ayırt edici fikstür özelliği 8; kadraj-odak uyumu 4; anlamlı odak değişimi 3; somut özellik 3. Belirsiz profil genel form doğruluğuyla en çok 3 temel puan alır. |
| Sinematik kararlar |20| Tek anlaşılır kamera yörüngesi 4; süre/hareket uygulanabilirliği 4; yakın kadraj-özellik uyumu 4; gözlenebilir sahne karşıtlığı 4 (single'da 2); bilinen yüzey sınırı 2. Görüntüsüz estetik için kalan 2 verilmez. |
| Farklılaşma |20| Aynı ürün/süre/modda en yakın rakibe karar mesafesi. Kamera ekseni %20, lens/perspektif %10, ışık işlevi %25, kadraj düzeni %15, ölçek sırası %20, odak sınıfı %10. 0.5 mesafe tam puan; sıfır mesafe sıfır puan. İsim, sıfat ve purpose etiketi tek başına puan kazandırmaz. |
| Niyet |15| Elle yazılmış hareket sözleşmesi 8, istenen doğrulanmış odak 4, sıra/güvenli uyarlama 3. Boş istekte 15. Dört istek planı hiç değiştirmiyorsa dolu istekte en çok 5; tesadüfi eşleşme semantik yorum sayılmaz. |
| Kimlik |15| Kanıtla tutarlılık ve bilinen yüzey sınırı 12. Gerçek videodaki kimlik sürekliliği için kalan 3 verilmez. |
| Prompt |5| Gerçek payload ve preview geçerliliği 4; belirli mekanik dil sorununda 3. Gerçek modelin yönergeyi uygulaması için son 1 verilmez. Uzunluk yalnız teknik kapıdır, yaratıcı kalite değildir. |

Puanlar kategori içi ortalamaların eşit ağırlıklı ortalamasıdır; ürün sayısı fazla olan bir kategori baskın olmaz. Buna rağmen her stilin uygun ürün kümesi farklıdır: sıralama kontrollü bir ipucu olup evrensel estetik sıralama değildir. Kaba karar normalizasyonu farklı parallax/ışık nüanslarını kaçırabilir. 'İmza çakışması' manuel inceleme adayıdır, birebir kopya kanıtı değildir. Tekrarlanan kitap başı/sonu hero kadrajı otomatik hata sayılmaz; ardışık aynı görsel kararlar sayılır.

## Kesin başarısızlık kapıları

Uydurulmuş kanıt/odak, gerekçesiz açık niyet kaybı, shot-mode/iç kesme çelişkisi, ardışık aynı görsel sahne, payload sınırı, imza/preview/payload uyuşmazlığı, bilinmeyen yüzey, açıklamasız risk ve 5 saniye aşırı sahne/hareket yoğunluğu ayrı failure kodlarıdır. Bunlar düşük skorla gizlenmez; herhangi biri sonucu riskli yapar.

**Gözlenen mevcut çıktılarda:** 0 kesin başarısızlık. Bu yalnız konservatif fallback örneklemi içindir. Fallback açık kamera/odak/sıra isteklerini deterministik sözleşmeyle uygular; bunun canlı OpenAI semantiğiyle aynı olduğu varsayılmaz.

## 24 preset sonucu

| Preset | Uygun ürün | Senaryo | Ürün /25 | Kamera /20 | Fark /20 | Niyet /15 | Kimlik /15 | Prompt /5 | Toplam /100 | Kesin hata | Sınıf |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| luxury-fashion-film | 19 | 608 | 22.1 | 16.9 | 16.7 | 15 | 12 | 4 | 86.7 | 0 | üretime hazır (yalnız metin kapısı) |
| macro-detail-reveal | 19 | 608 | 23.9 | 16.8 | 13.3 | 15 | 12 | 4 | 85 | 0 | üretime hazır (yalnız metin kapısı) |
| minimal-studio | 19 | 608 | 22.1 | 16.9 | 13.6 | 15 | 12 | 4 | 83.7 | 0 | üretime hazır (yalnız metin kapısı) |
| floating-fashion | 4 | 128 | 12.6 | 14.4 | 12.2 | 15 | 12 | 3 | 69.1 | 0 | iyileştirme gerekli |
| precision-macro | 5 | 160 | 23.1 | 16.3 | 14 | 15 | 12 | 4 | 84.4 | 0 | üretime hazır (yalnız metin kapısı) |
| glass-reflection | 4 | 128 | 24.5 | 17 | 12.9 | 15 | 12 | 3.1 | 84.4 | 0 | üretime hazır (yalnız metin kapısı) |
| product-spotlight | 19 | 608 | 14.8 | 15.5 | 14.9 | 15 | 12 | 4 | 76.2 | 0 | üretime hazır (yalnız metin kapısı) |
| elegant-orbit | 7 | 224 | 19.5 | 15.9 | 8.5 | 15 | 12 | 4 | 74.9 | 0 | iyileştirme gerekli |
| cinematic-hero | 19 | 608 | 13.2 | 14.6 | 11.7 | 15 | 12 | 4 | 70.5 | 0 | iyileştirme gerekli |
| material-detail | 19 | 608 | 22.6 | 16.2 | 11.8 | 15 | 12 | 3.8 | 81.4 | 0 | üretime hazır (yalnız metin kapısı) |
| macro-stitching | 9 | 288 | 23.3 | 16.4 | 12.6 | 15 | 12 | 4 | 83.2 | 0 | üretime hazır (yalnız metin kapısı) |
| fabric-motion | 4 | 128 | 19 | 15.9 | 12.3 | 15 | 12 | 3.2 | 77.3 | 0 | üretime hazır (yalnız metin kapısı) |
| label-reveal | 5 | 160 | 24.6 | 17 | 9.3 | 15 | 12 | 4 | 81.9 | 0 | üretime hazır (yalnız metin kapısı) |
| dramatic-backlight | 5 | 160 | 18.5 | 15.8 | 13.4 | 15 | 12 | 3.2 | 77.8 | 0 | üretime hazır (yalnız metin kapısı) |
| cinematic-dial | 2 | 64 | 24.6 | 17 | 9.9 | 15 | 12 | 4 | 82.5 | 0 | üretime hazır (yalnız metin kapısı) |
| metallic-light-sweep | 6 | 192 | 22.1 | 16.4 | 10.2 | 15 | 12 | 3.1 | 78.8 | 0 | üretime hazır (yalnız metin kapısı) |
| hardware-reveal | 8 | 256 | 18.5 | 16.4 | 13.2 | 15 | 12 | 4 | 79 | 0 | üretime hazır (yalnız metin kapısı) |
| floating-accessory | 5 | 160 | 14.8 | 14.9 | 8.7 | 15 | 12 | 3.2 | 68.6 | 0 | iyileştirme gerekli |
| sneaker-hero | 2 | 64 | 11.1 | 14 | 2.5 | 15 | 12 | 4 | 58.6 | 0 | iyileştirme gerekli |
| upholstery-macro | 2 | 64 | 24.6 | 17 | 9.6 | 15 | 12 | 3.1 | 81.3 | 0 | üretime hazır (yalnız metin kapısı) |
| culinary-texture | 2 | 64 | 24.6 | 17 | 12.4 | 15 | 12 | 3.1 | 84.1 | 0 | üretime hazır (yalnız metin kapısı) |
| optical-lines | 2 | 64 | 18.6 | 15.3 | 11.9 | 15 | 12 | 4 | 76.8 | 0 | üretime hazır (yalnız metin kapısı) |
| craftsmanship-study | 19 | 608 | 19.5 | 16.4 | 15 | 15 | 12 | 3.8 | 81.6 | 0 | üretime hazır (yalnız metin kapısı) |
| window-display | 8 | 256 | 12.9 | 14.5 | 13.6 | 15 | 12 | 3.2 | 71.1 | 0 | iyileştirme gerekli |

Üretime hazır metin kapısı: sıfır kesin hata + en az 75 toplam + dolu istekte en az 10 niyet puanı. Riskli: kesin hata var. Diğerleri iyileştirme gerekli. Hiçbiri gerçek video üretim onayı değildir. Teknik geçerlilikten otomatik üretime hazır sonucu çıkarılmaz.

## Kategori sonuçları

| Kategori | Senaryo | Ham ortalama | Somut detay seçilmeyen | Uygulanmayan dolu niyet |
|---|---:|---:|---:|---:|
| apparel | 1056 | 79 | 312 | 0 |
| bags | 416 | 78.7 | 88 | 0 |
| watches | 832 | 76.8 | 320 | 0 |
| jewelry | 416 | 75.7 | 152 | 0 |
| cosmetics | 704 | 83.2 | 48 | 0 |
| footwear | 704 | 77.5 | 184 | 0 |
| headwear | 384 | 78.7 | 104 | 0 |
| eyewear | 448 | 78.7 | 96 | 0 |
| furniture | 640 | 83.8 | 24 | 0 |
| food | 512 | 82.2 | 96 | 0 |
| packaged-food | 352 | 81.4 | 56 | 0 |
| electronics | 352 | 81.3 | 56 | 0 |
| unknown | 768 | 58.1 | 768 | 0 |

## En güçlü beş ve iyileştirme gereken beş

En güçlü beş (bu çevrimdışı rubrikte): luxury-fashion-film (86.7), macro-detail-reveal (85), glass-reflection (84.4), precision-macro (84.4), culinary-texture (84.1).

En düşük beş: sneaker-hero (58.6), floating-accessory (68.6), floating-fashion (69.1), cinematic-hero (70.5), window-display (71.1). Düşük skorlar teknik bozuklukla eş anlamlı değildir; çoğunlukla genel odak, niyet etkisizliği ve yakın rakiple benzer görsel kararlar söz konusudur.

## Tespit edilen kalite eksikleri

| Bulgu | Senaryo sayısı |
|---|---:|
| Yakın kadrajda somut detay yerine form/genel odak | 1976 |
| Compiler dilinde mekanik/meta ifade | 1448 |
| Ayırt edici ürün detayı seçilmedi | 2304 |
| Bütün sahnelerde aynı odak | 1264 |
| En yakın presetle aynı kaba çekim imzası | 482 |

Karşı-olgusal gruplar: 1896; istek değişince planı değişen: 1896. Bunun OpenAI'nin başarısızlığı olduğu söylenemez: ücretli planner hiç çalıştırılmadı. Bu kıyas ücretsiz fallback davranışını ölçer. Single/multi sonuçları ve request-specific planlar JSON içinde ayrı tutulur.

İlk düzeltilecek üç sorun:

1. Ücretli çağrı olmadan ölçülemeyen canlı AI niyet sözleşmesi uyumunu sonraki offline fixture örnekleriyle sınamak. Canlı AI niyet kalitesi ayrı, ücretli onaylı bir eval gerektirir.
2. Profil kanıtı az olduğunda single-shot yakın kadrajı daha geniş güvenli ölçeğe çevirmek.
3. Kalan yakın preset imzalarını ürün ve kullanıcı niyetine göre yaratıcı incelemeden geçirmek.

## Aynı ürün üzerinde karşılaştırmalar

### Parlak siyah kemerli ceket

| Preset | Kamera sırası | Işık | Kadraj / odak sırası | En yakın rakip, mesafe |
|---|---|---|---|---|
| luxury-fashion-film | Long-lens slow push-in → Short lateral camera glide within the source view → Long-lens locked hero frame | Soft directional contour light / A soft highlight travels over the visible surface | Full visible silhouette with negative space: belted jacket silhouette → Off-center close framing of the chosen detail: two visible front buttons → Return to full product with campaign negative space: belted jacket silhouette | minimal-studio: 0.7 |
| macro-detail-reveal | Locked medium product overview → Restrained macro push toward the visible detail → Slow pull-back to medium hero framing | Soft edge light preserves source colors / Grazing soft light reveals existing relief | Establish the recognizable visible product: belted jacket silhouette → Close framing at source-resolvable detail scale: two visible front buttons → Return to recognizable product form: belted jacket silhouette | material-detail: 0.75 |
| minimal-studio | Locked balanced studio overview → Locked close framing → Locked symmetrical hero frame | Diffuse soft light with natural contact shadow / Even diffuse light defines existing texture | Centered complete product with clean margins: belted jacket silhouette → Graphic crop of the chosen source-visible detail: two visible front buttons → Return to the full product with balanced space: belted jacket silhouette | floating-fashion: 0.55 |
| floating-fashion | Slow upward camera glide within the source view → Long-lens locked close framing → Slow pull-back to a balanced hero view | Broad soft light outlines the existing silhouette | Full silhouette with open margins: belted jacket silhouette → Close crop of the chosen visible detail: belted jacket silhouette → Full form with generous space above: belted jacket silhouette | minimal-studio: 0.55 |
| product-spotlight | Locked wide product framing → Long-lens locked close framing → Locked medium hero framing | A soft focused light pass defines the contour | Full form in balanced negative space: belted jacket silhouette → Wider view of the source-visible product form; no unverified detail is enlarged: Source-visible surface detail → Centered silhouette with clean margins: belted jacket silhouette | floating-fashion: 0.55 |
| cinematic-hero | Slow low-amplitude dolly-in → Locked off-center close framing → Slow pull-back to wide hero framing | Sculpted side light retains source color boundaries | Complete visible form with campaign negative space: belted jacket silhouette → Tight asymmetric crop of the chosen detail: belted jacket silhouette → Wide hero composition with strong visual balance: belted jacket silhouette | floating-fashion: 0.7 |
| material-detail | Locked close framing → Slow pan right across the visible surface → Slow pull-back to medium product framing | Grazing soft light defines existing surface relief | Source-resolved crop of the selected surface: belted jacket silhouette → Parallel crop emphasizing existing relief: glossy coated fabric → Recognizable full form with clear surface context: belted jacket silhouette | macro-stitching: 0.45 |
| macro-stitching | Locked macro framing → Macro pan left along the selected visible detail → Slow pull-back to full product framing | Soft raking light reveals existing relief | Close view of evidenced construction: belted jacket silhouette → Diagonal crop following the existing detail line: wide notched collar → Full visible silhouette with clean margins: belted jacket silhouette | material-detail: 0.45 |
| fabric-motion | Slow vertical tracking within the visible face → Locked close framing → Slow pull-back to a clean silhouette | A gentle light sweep follows existing folds | Long visible contour in a narrow composition: belted jacket silhouette → Source-resolved crop of existing folds: glossy coated fabric → Full form with balanced breathing room: belted jacket silhouette | craftsmanship-study: 0.75 |
| craftsmanship-study | Locked close framing → Long-lens vertical camera tilt over the visible face → Slow pull-back to the complete product | Soft directional light defines existing construction | Close crop of the chosen existing workmanship: belted jacket silhouette → Parallel view of evidenced construction lines: two visible front buttons → Full visible product with quiet negative space: belted jacket silhouette | cinematic-hero: 0.75 |
| window-display | Slow long-lens push-in → Short lateral close camera glide → Slow pull-back to a spacious hero view | A focused overhead accent isolates the product like a retail display | Full product with generous display-like margins: belted jacket silhouette → Close crop of the chosen original design feature: belted jacket silhouette → Wide balanced composition in the source setting: belted jacket silhouette | minimal-studio: 0.65 |

### Parfüm

| Preset | Kamera sırası | Işık | Kadraj / odak sırası | En yakın rakip, mesafe |
|---|---|---|---|---|
| luxury-fashion-film | Long-lens slow push-in → Short lateral camera glide within the source view → Long-lens locked hero frame | Soft directional contour light / A soft highlight travels over the visible surface | Full visible silhouette with negative space: rectangular bottle geometry → Off-center close framing of the chosen detail: centered front label → Return to full product with campaign negative space: rectangular bottle geometry | minimal-studio: 0.7 |
| macro-detail-reveal | Locked medium product overview → Restrained macro push toward the visible detail → Slow pull-back to medium hero framing | Soft edge light preserves source colors / Grazing soft light reveals existing relief | Establish the recognizable visible product: rectangular bottle geometry → Close framing at source-resolvable detail scale: centered front label → Return to recognizable product form: rectangular bottle geometry | label-reveal: 0.7 |
| minimal-studio | Locked balanced studio overview → Locked close framing → Locked symmetrical hero frame | Diffuse soft light with natural contact shadow / Even diffuse light defines existing texture | Centered complete product with clean margins: rectangular bottle geometry → Graphic crop of the chosen source-visible detail: centered front label → Return to the full product with balanced space: rectangular bottle geometry | dramatic-backlight: 0.55 |
| glass-reflection | Locked medium framing → Macro vertical camera tilt within the visible face → Locked symmetrical hero framing | A broad soft highlight travels over the surface | Clean outline with lateral breathing room: rectangular bottle geometry → Close crop of a source-visible reflective edge: rectangular glass bottle → Full form with readable existing marks: rectangular bottle geometry | product-spotlight: 0.75 |
| product-spotlight | Locked wide product framing → Long-lens locked close framing → Locked medium hero framing | A soft focused light pass defines the contour | Full form in balanced negative space: rectangular bottle geometry → Wider view of the source-visible product form; no unverified detail is enlarged: Source-visible surface detail → Centered silhouette with clean margins: rectangular bottle geometry | minimal-studio: 0.6 |
| cinematic-hero | Slow low-amplitude dolly-in → Locked off-center close framing → Slow pull-back to wide hero framing | Sculpted side light retains source color boundaries | Complete visible form with campaign negative space: rectangular bottle geometry → Wider view of the source-visible product form; no unverified detail is enlarged: Source-visible surface detail → Wide hero composition with strong visual balance: rectangular bottle geometry | hardware-reveal: 0.65 |
| material-detail | Locked close framing → Slow pan right across the visible surface → Slow pull-back to medium product framing | Grazing soft light defines existing surface relief | Source-resolved crop of the selected surface: rectangular bottle geometry → Parallel crop emphasizing existing relief: centered front label → Recognizable full form with clear surface context: rectangular bottle geometry | macro-detail-reveal: 0.75 |
| label-reveal | Slow dolly-in within the source view → Locked close framing → Locked medium packshot | Even soft light keeps existing marks readable | Complete product with the visible mark in context: rectangular bottle geometry → Readable crop at source-resolved scale: centered front label → Balanced front-facing product composition: rectangular bottle geometry | minimal-studio: 0.55 |
| dramatic-backlight | Locked medium silhouette view → Short lateral close camera glide → Locked full product hero frame | Soft rim light separates the existing contour | Complete outline with dark negative space: rectangular bottle geometry → Close crop of a source-visible edge: rectangular bottle geometry → Balanced outline with readable existing marks: rectangular bottle geometry | minimal-studio: 0.55 |
| hardware-reveal | Locked close framing → Short lateral camera glide along the visible edge → Slow pull-back to full product framing | Directional soft light defines existing edges | Tight crop of evidenced construction: rectangular bottle geometry → Parallel detail view with clean margins: flat black cap → Recognizable product with the detail in context: rectangular bottle geometry | craftsmanship-study: 0.45 |
| craftsmanship-study | Locked close framing → Long-lens vertical camera tilt over the visible face → Slow pull-back to the complete product | Soft directional light defines existing construction | Close crop of the chosen existing workmanship: rectangular bottle geometry → Parallel view of evidenced construction lines: centered front label → Full visible product with quiet negative space: rectangular bottle geometry | hardware-reveal: 0.45 |

### Saat

| Preset | Kamera sırası | Işık | Kadraj / odak sırası | En yakın rakip, mesafe |
|---|---|---|---|---|
| luxury-fashion-film | Long-lens slow push-in → Short lateral camera glide within the source view → Long-lens locked hero frame | Soft directional contour light / A soft highlight travels over the visible surface | Full visible silhouette with negative space: round watch case → Off-center close framing of the chosen detail: silver → Return to full product with campaign negative space: round watch case | minimal-studio: 0.7 |
| macro-detail-reveal | Locked medium product overview → Restrained macro push toward the visible detail → Slow pull-back to medium hero framing | Soft edge light preserves source colors / Grazing soft light reveals existing relief | Establish the recognizable visible product: round watch case → Close framing at source-resolvable detail scale: silver → Return to recognizable product form: round watch case | material-detail: 0.75 |
| minimal-studio | Locked balanced studio overview → Locked close framing → Locked symmetrical hero frame | Diffuse soft light with natural contact shadow / Even diffuse light defines existing texture | Centered complete product with clean margins: round watch case → Graphic crop of the chosen source-visible detail: silver → Return to the full product with balanced space: round watch case | metallic-light-sweep: 0.45 |
| precision-macro | Locked close framing → Short lateral macro camera glide → Slow pull-back to the complete visible form | Narrow diffuse light defines existing edges | Tight crop on the chosen evidenced feature: silver → Parallel close view of existing surface relief: slim dial markers → Centered recognizable hero view: silver | hardware-reveal: 0.8 |
| product-spotlight | Locked wide product framing → Long-lens locked close framing → Locked medium hero framing | A soft focused light pass defines the contour | Full form in balanced negative space: silver → Wider view of the source-visible product form; no unverified detail is enlarged: Source-visible surface detail → Centered silhouette with clean margins: silver | metallic-light-sweep: 0.35 |
| elegant-orbit | Short lateral camera glide across the visible face → Long-lens locked close framing → Slow pull-back within the source view | Soft directional edge light retains natural source colors | Angled full form retaining source orientation: silver → Wider view of the source-visible product form; no unverified detail is enlarged: Source-visible surface detail → Balanced recognizable hero frame: silver | cinematic-hero: 0.65 |
| cinematic-hero | Slow low-amplitude dolly-in → Locked off-center close framing → Slow pull-back to wide hero framing | Sculpted side light retains source color boundaries | Complete visible form with campaign negative space: silver → Wider view of the source-visible product form; no unverified detail is enlarged: Source-visible surface detail → Wide hero composition with strong visual balance: silver | floating-accessory: 0.35 |
| material-detail | Locked close framing → Slow pan right across the visible surface → Slow pull-back to medium product framing | Grazing soft light defines existing surface relief | Source-resolved crop of the selected surface: round watch case → Parallel crop emphasizing existing relief: silver → Recognizable full form with clear surface context: round watch case | macro-detail-reveal: 0.75 |
| cinematic-dial | Slow optical push toward the selected visible detail → Locked close framing → Slow pull-back to a composed hero view | A narrow highlight crosses the existing relief | Visible face in a balanced graphic composition: silver → Asymmetric close crop of evidenced layout: blue dial with visible hands → Complete product with clean surrounding space: silver | metallic-light-sweep: 0.65 |
| metallic-light-sweep | Locked balanced product view → Locked close framing → Locked long-lens hero view | A narrow soft light band crosses the visible face | Full form with broad side margins: silver → Close crop of the selected reflective detail: brushed steel → Balanced full form with clear original markings: silver | product-spotlight: 0.35 |
| hardware-reveal | Locked close framing → Short lateral camera glide along the visible edge → Slow pull-back to full product framing | Directional soft light defines existing edges | Tight crop of evidenced construction: round watch case → Parallel detail view with clean margins: silver → Recognizable product with the detail in context: round watch case | craftsmanship-study: 0.45 |
| floating-accessory | Slow upward camera glide in the existing view → Short lateral close camera glide → Locked wide hero frame | A broad side key with gentle fill preserves the product's existing contact cues | Full visible form with open vertical margins: silver → Wider view of the source-visible product form; no unverified detail is enlarged: Source-visible surface detail → Airy balanced silhouette composition: silver | cinematic-hero: 0.35 |
| craftsmanship-study | Locked close framing → Long-lens vertical camera tilt over the visible face → Slow pull-back to the complete product | Soft directional light defines existing construction | Close crop of the chosen existing workmanship: round watch case → Parallel view of evidenced construction lines: silver → Full visible product with quiet negative space: round watch case | hardware-reveal: 0.45 |

### Deri çanta

| Preset | Kamera sırası | Işık | Kadraj / odak sırası | En yakın rakip, mesafe |
|---|---|---|---|---|
| luxury-fashion-film | Long-lens slow push-in → Short lateral camera glide within the source view → Long-lens locked hero frame | Soft directional contour light / A soft highlight travels over the visible surface | Full visible silhouette with negative space: structured bag silhouette → Off-center close framing of the chosen detail: front clasp → Return to full product with campaign negative space: structured bag silhouette | floating-accessory: 0.7 |
| macro-detail-reveal | Locked medium product overview → Restrained macro push toward the visible detail → Slow pull-back to medium hero framing | Soft edge light preserves source colors / Grazing soft light reveals existing relief | Establish the recognizable visible product: structured bag silhouette → Close framing at source-resolvable detail scale: front clasp → Return to recognizable product form: structured bag silhouette | elegant-orbit: 0.7 |
| minimal-studio | Locked balanced studio overview → Locked close framing → Locked symmetrical hero frame | Diffuse soft light with natural contact shadow / Even diffuse light defines existing texture | Centered complete product with clean margins: structured bag silhouette → Graphic crop of the chosen source-visible detail: front clasp → Return to the full product with balanced space: structured bag silhouette | metallic-light-sweep: 0.35 |
| product-spotlight | Locked wide product framing → Long-lens locked close framing → Locked medium hero framing | A soft focused light pass defines the contour | Full form in balanced negative space: structured bag silhouette → Wider view of the source-visible product form; no unverified detail is enlarged: Source-visible surface detail → Centered silhouette with clean margins: structured bag silhouette | metallic-light-sweep: 0.35 |
| elegant-orbit | Short lateral camera glide across the visible face → Long-lens locked close framing → Slow pull-back within the source view | Soft directional edge light retains natural source colors | Angled full form retaining source orientation: structured bag silhouette → Diagonal close crop tracing the visible curve: arched front handle → Balanced recognizable hero frame: structured bag silhouette | craftsmanship-study: 0.55 |
| cinematic-hero | Slow low-amplitude dolly-in → Locked off-center close framing → Slow pull-back to wide hero framing | Sculpted side light retains source color boundaries | Complete visible form with campaign negative space: structured bag silhouette → Tight asymmetric crop of the chosen detail: structured bag silhouette → Wide hero composition with strong visual balance: structured bag silhouette | floating-accessory: 0.45 |
| material-detail | Locked close framing → Slow pan right across the visible surface → Slow pull-back to medium product framing | Grazing soft light defines existing surface relief | Source-resolved crop of the selected surface: structured bag silhouette → Parallel crop emphasizing existing relief: pebbled leather grain → Recognizable full form with clear surface context: structured bag silhouette | macro-stitching: 0.45 |
| macro-stitching | Locked macro framing → Macro pan left along the selected visible detail → Slow pull-back to full product framing | Soft raking light reveals existing relief | Close view of evidenced construction: structured bag silhouette → Diagonal crop following the existing detail line: visible edge stitching → Full visible silhouette with clean margins: structured bag silhouette | material-detail: 0.45 |
| metallic-light-sweep | Locked balanced product view → Locked close framing → Locked long-lens hero view | A narrow soft light band crosses the visible face | Full form with broad side margins: structured bag silhouette → Close crop of the selected reflective detail: front clasp → Balanced full form with clear original markings: structured bag silhouette | minimal-studio: 0.35 |
| hardware-reveal | Locked close framing → Short lateral camera glide along the visible edge → Slow pull-back to full product framing | Directional soft light defines existing edges | Tight crop of evidenced construction: structured bag silhouette → Parallel detail view with clean margins: front clasp → Recognizable product with the detail in context: structured bag silhouette | craftsmanship-study: 0.45 |
| floating-accessory | Slow upward camera glide in the existing view → Short lateral close camera glide → Locked wide hero frame | A broad side key with gentle fill preserves the product's existing contact cues | Full visible form with open vertical margins: structured bag silhouette → Close crop of the selected surface feature: arched front handle → Airy balanced silhouette composition: structured bag silhouette | cinematic-hero: 0.45 |
| craftsmanship-study | Locked close framing → Long-lens vertical camera tilt over the visible face → Slow pull-back to the complete product | Soft directional light defines existing construction | Close crop of the chosen existing workmanship: structured bag silhouette → Parallel view of evidenced construction lines: visible edge stitching → Full visible product with quiet negative space: structured bag silhouette | hardware-reveal: 0.45 |
| window-display | Slow long-lens push-in → Short lateral close camera glide → Slow pull-back to a spacious hero view | A focused overhead accent isolates the product like a retail display | Full product with generous display-like margins: structured bag silhouette → Close crop of the chosen original design feature: structured bag silhouette → Wide balanced composition in the source setting: structured bag silhouette | floating-accessory: 0.65 |

### Ayakkabı

| Preset | Kamera sırası | Işık | Kadraj / odak sırası | En yakın rakip, mesafe |
|---|---|---|---|---|
| luxury-fashion-film | Long-lens slow push-in → Short lateral camera glide within the source view → Long-lens locked hero frame | Soft directional contour light / A soft highlight travels over the visible surface | Full visible silhouette with negative space: low shoe silhouette → Off-center close framing of the chosen detail: woven upper texture → Return to full product with campaign negative space: low shoe silhouette | minimal-studio: 0.7 |
| macro-detail-reveal | Locked medium product overview → Restrained macro push toward the visible detail → Slow pull-back to medium hero framing | Soft edge light preserves source colors / Grazing soft light reveals existing relief | Establish the recognizable visible product: low shoe silhouette → Close framing at source-resolvable detail scale: woven upper texture → Return to recognizable product form: low shoe silhouette | elegant-orbit: 0.7 |
| minimal-studio | Locked balanced studio overview → Locked close framing → Locked symmetrical hero frame | Diffuse soft light with natural contact shadow / Even diffuse light defines existing texture | Centered complete product with clean margins: low shoe silhouette → Graphic crop of the chosen source-visible detail: woven upper texture → Return to the full product with balanced space: low shoe silhouette | product-spotlight: 0.6 |
| product-spotlight | Locked wide product framing → Long-lens locked close framing → Locked medium hero framing | A soft focused light pass defines the contour | Full form in balanced negative space: low shoe silhouette → Wider view of the source-visible product form; no unverified detail is enlarged: Source-visible surface detail → Centered silhouette with clean margins: low shoe silhouette | minimal-studio: 0.6 |
| elegant-orbit | Short lateral camera glide across the visible face → Long-lens locked close framing → Slow pull-back within the source view | Soft directional edge light retains natural source colors | Angled full form retaining source orientation: low shoe silhouette → Diagonal close crop tracing the visible curve: visible sole edge → Balanced recognizable hero frame: low shoe silhouette | sneaker-hero: 0.45 |
| cinematic-hero | Slow low-amplitude dolly-in → Locked off-center close framing → Slow pull-back to wide hero framing | Sculpted side light retains source color boundaries | Complete visible form with campaign negative space: low shoe silhouette → Tight asymmetric crop of the chosen detail: low shoe silhouette → Wide hero composition with strong visual balance: low shoe silhouette | sneaker-hero: 0.3 |
| material-detail | Locked close framing → Slow pan right across the visible surface → Slow pull-back to medium product framing | Grazing soft light defines existing surface relief | Source-resolved crop of the selected surface: low shoe silhouette → Parallel crop emphasizing existing relief: woven upper texture → Recognizable full form with clear surface context: low shoe silhouette | macro-stitching: 0.45 |
| macro-stitching | Locked macro framing → Macro pan left along the selected visible detail → Slow pull-back to full product framing | Soft raking light reveals existing relief | Close view of evidenced construction: low shoe silhouette → Diagonal crop following the existing detail line: woven upper texture → Full visible silhouette with clean margins: low shoe silhouette | material-detail: 0.45 |
| hardware-reveal | Locked close framing → Short lateral camera glide along the visible edge → Slow pull-back to full product framing | Directional soft light defines existing edges | Tight crop of evidenced construction: low shoe silhouette → Parallel detail view with clean margins: woven upper texture → Recognizable product with the detail in context: low shoe silhouette | craftsmanship-study: 0.45 |
| sneaker-hero | Short lateral camera glide at source level → Long-lens locked close framing → Slow pull-back to a wide hero view | A traveling side highlight traces only the evidenced contour breaks | Full visible profile with forward negative space: low shoe silhouette → Diagonal crop of the selected visible detail: low shoe silhouette → Complete product with an assertive graphic balance: low shoe silhouette | cinematic-hero: 0.3 |
| craftsmanship-study | Locked close framing → Long-lens vertical camera tilt over the visible face → Slow pull-back to the complete product | Soft directional light defines existing construction | Close crop of the chosen existing workmanship: low shoe silhouette → Parallel view of evidenced construction lines: visible sole edge → Full visible product with quiet negative space: low shoe silhouette | hardware-reveal: 0.45 |

## Başarısızlık algılayıcısının kalibrasyonu

Aşağıdaki bozulmuş plan/payload'lar benchmark için kasıtlı üretilir; gerçek preset sonucu veya sıralama senaryosu sayılmaz. Dedektörün bu bozukluklara kör olmadığını gösterir. 'Yerel guard reddi' yalnız ilgili saf parser/compiler/payload çağrısıdır, tüm production submit zinciri değildir.

| Bozulma | Beklenen failure | Benchmark yakaladı | Yerel guard reddetti |
|---|---|---|---|
| invented-source-feature | invented-detail | true | true |
| unexplained-loss-of-static-request | unjustified-intent-loss | true | true |
| cuts-inside-a-single-take | shot-mode-conflict | true | true |
| renamed-duplicate-scenes | repeated-scene | true | true |
| unknown-rear-as-a-real-view | unseen-surface | true | true |
| unsafe-orbit-with-no-notice | unexplained-risk | true | true |
| three-shots-in-five-seconds | five-second-overload | true | true |
| multi-payload-513-characters | payload-limit | true | true |
| single-payload-2501-characters | payload-limit | true | true |
| preview-differs-from-signed-payload | signed-preview-payload-mismatch | true | Bu probe'da ölçülmedi |

Özellikle gerekçesiz istek kaybı yapısal compiler tarafından reddedilmeyebilir: benchmark'ın niyet kapısı bunu yakalar. Bu bir canlı AI hata oranı değildir; compiler'ın doğal dili semantik olarak doğrulamadığı sınırı gösterir. Preview/payload için gerçek quote hash değişiklik testi her senaryoda ayrıca yapılır.

## Preset başına gerçek plan ve nihai prompt örnekleri

Her preset için en az iki uygun ürün örneği aşağıdadır. Bunlar mevcut fallback fonksiyonunun değiştirilmeden ürettiği gerçek planlardır; OpenAI planı değildir. Diğer tüm istek/model/süre/mod sonuçları JSON'dadır.

### luxury-fashion-film · 86.7/100

Kategori sözleşmesi: evrensel. Güçlü: focus-grounded-to-fixture-or-generic, distinct-structured-directions. Zayıf: Yakın kadrajda somut detay yerine form/genel odak; Ayırt edici ürün detayı seçilmedi; Bütün sahnelerde aynı odak.

**Parlak siyah kemerli ceket / apparel — 94/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "luxury-fashion-film",
  "presetVersion": 3,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        5
      ],
      "camera": "Long-lens slow push-in",
      "lighting": "Soft directional contour light",
      "composition": "Full visible silhouette with negative space",
      "motion": "Advance settles at the source-facing view",
      "pace": "Measured opening",
      "focus": "belted jacket silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "lighting-reveal",
      "evidenceRefs": [
        0
      ],
      "camera": "Short lateral camera glide within the source view",
      "lighting": "A soft highlight travels over the visible surface",
      "composition": "Off-center close framing of the chosen detail",
      "motion": "Highlight reveals existing relief",
      "pace": "Deliberate reveal",
      "focus": "two visible front buttons"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        5
      ],
      "camera": "Long-lens locked hero frame",
      "lighting": "Soft directional contour light",
      "composition": "Return to full product with campaign negative space",
      "motion": "Settle into the recognizable source-facing pose",
      "pace": "Confident final hold",
      "focus": "belted jacket silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 389/512 karakter:

```text
Use a long-lens slow push-in, framing the belted jacket silhouette. Compose the full visible silhouette with negative space. Light the scene with soft directional contour light. Advance settles at the source-facing view. Allow a measured opening. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 2, 4 sn, 410/512 karakter:

```text
Use a short lateral camera glide within the source view, framing the two visible front buttons. Compose the off-center close framing of the chosen detail. A soft highlight travels over the visible surface. Highlight reveals existing relief. Allow a deliberate reveal. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 3, 3 sn, 351/512 karakter:

```text
Use a long-lens locked hero frame, framing the belted jacket silhouette. Return to full product with campaign negative space. Light the scene with soft directional contour light. Allow a confident final hold. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

**Kot / apparel — 94/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "luxury-fashion-film",
  "presetVersion": 3,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        2
      ],
      "camera": "Long-lens slow push-in",
      "lighting": "Soft directional contour light",
      "composition": "Full visible silhouette with negative space",
      "motion": "Advance settles at the source-facing view",
      "pace": "Measured opening",
      "focus": "shorts silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "lighting-reveal",
      "evidenceRefs": [
        0
      ],
      "camera": "Short lateral camera glide within the source view",
      "lighting": "A soft highlight travels over the visible surface",
      "composition": "Off-center close framing of the chosen detail",
      "motion": "Highlight reveals existing relief",
      "pace": "Deliberate reveal",
      "focus": "visible hem stitching"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        2
      ],
      "camera": "Long-lens locked hero frame",
      "lighting": "Soft directional contour light",
      "composition": "Return to full product with campaign negative space",
      "motion": "Settle into the recognizable source-facing pose",
      "pace": "Confident final hold",
      "focus": "shorts silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 348/512 karakter:

```text
Use a long-lens slow push-in, framing the shorts silhouette. Compose the full visible silhouette with negative space. Light the scene with soft directional contour light. Advance settles at the source-facing view. Allow a measured opening. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 2, 4 sn, 372/512 karakter:

```text
Use a short lateral camera glide within the source view, framing the visible hem stitching. Compose the off-center close framing of the chosen detail. A soft highlight travels over the visible surface. Highlight reveals existing relief. Allow a deliberate reveal. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 3, 3 sn, 310/512 karakter:

```text
Use a long-lens locked hero frame, framing the shorts silhouette. Return to full product with campaign negative space. Light the scene with soft directional contour light. Allow a confident final hold. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

### macro-detail-reveal · 85/100

Kategori sözleşmesi: evrensel. Güçlü: focus-grounded-to-fixture-or-generic, distinct-structured-directions. Zayıf: Yakın kadrajda somut detay yerine form/genel odak; Ayırt edici ürün detayı seçilmedi; Bütün sahnelerde aynı odak.

**Parlak siyah kemerli ceket / apparel — 94/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "macro-detail-reveal",
  "presetVersion": 3,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        5
      ],
      "camera": "Locked medium product overview",
      "lighting": "Soft edge light preserves source colors",
      "composition": "Establish the recognizable visible product",
      "motion": "Hold the source-facing pose",
      "pace": "Brief introduction",
      "focus": "belted jacket silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "macro-detail",
      "evidenceRefs": [
        0
      ],
      "camera": "Restrained macro push toward the visible detail",
      "lighting": "Grazing soft light reveals existing relief",
      "composition": "Close framing at source-resolvable detail scale",
      "motion": "Approach settles into a sharp detail hold",
      "pace": "Patient detail hold",
      "focus": "two visible front buttons"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        5
      ],
      "camera": "Slow pull-back to medium hero framing",
      "lighting": "Soft edge light preserves source colors",
      "composition": "Return to recognizable product form",
      "motion": "Widen within the known source-facing view",
      "pace": "Calm closing hold",
      "focus": "belted jacket silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 329/512 karakter:

```text
Use locked medium product overview, framing the belted jacket silhouette. Establish the recognizable visible product. Soft edge light preserves source colors. Allow a brief introduction. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 2, 4 sn, 413/512 karakter:

```text
Use a restrained macro push toward the visible detail, framing the two visible front buttons. Compose the close framing at source-resolvable detail scale. Grazing soft light reveals existing relief. Approach settles into a sharp detail hold. Allow a patient detail hold. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 3, 3 sn, 371/512 karakter:

```text
Use slow pull-back to medium hero framing, framing the belted jacket silhouette. Return to recognizable product form. Soft edge light preserves source colors. Widen within the known source-facing view. Allow a calm closing hold. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

**Kot / apparel — 94/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "macro-detail-reveal",
  "presetVersion": 3,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        2
      ],
      "camera": "Locked medium product overview",
      "lighting": "Soft edge light preserves source colors",
      "composition": "Establish the recognizable visible product",
      "motion": "Hold the source-facing pose",
      "pace": "Brief introduction",
      "focus": "shorts silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "macro-detail",
      "evidenceRefs": [
        0
      ],
      "camera": "Restrained macro push toward the visible detail",
      "lighting": "Grazing soft light reveals existing relief",
      "composition": "Close framing at source-resolvable detail scale",
      "motion": "Approach settles into a sharp detail hold",
      "pace": "Patient detail hold",
      "focus": "visible hem stitching"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        2
      ],
      "camera": "Slow pull-back to medium hero framing",
      "lighting": "Soft edge light preserves source colors",
      "composition": "Return to recognizable product form",
      "motion": "Widen within the known source-facing view",
      "pace": "Calm closing hold",
      "focus": "shorts silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 288/512 karakter:

```text
Use locked medium product overview, framing the shorts silhouette. Establish the recognizable visible product. Soft edge light preserves source colors. Allow a brief introduction. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 2, 4 sn, 375/512 karakter:

```text
Use a restrained macro push toward the visible detail, framing the visible hem stitching. Compose the close framing at source-resolvable detail scale. Grazing soft light reveals existing relief. Approach settles into a sharp detail hold. Allow a patient detail hold. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 3, 3 sn, 330/512 karakter:

```text
Use slow pull-back to medium hero framing, framing the shorts silhouette. Return to recognizable product form. Soft edge light preserves source colors. Widen within the known source-facing view. Allow a calm closing hold. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

### minimal-studio · 83.7/100

Kategori sözleşmesi: evrensel. Güçlü: focus-grounded-to-fixture-or-generic, distinct-structured-directions. Zayıf: Yakın kadrajda somut detay yerine form/genel odak; Ayırt edici ürün detayı seçilmedi; Bütün sahnelerde aynı odak; En yakın presetle aynı kaba çekim imzası.

**Parlak siyah kemerli ceket / apparel — 94/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "minimal-studio",
  "presetVersion": 3,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        5
      ],
      "camera": "Locked balanced studio overview",
      "lighting": "Diffuse soft light with natural contact shadow",
      "composition": "Centered complete product with clean margins",
      "motion": "Focus settles on the visible contour",
      "pace": "Quiet opening hold",
      "focus": "belted jacket silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "material-study",
      "evidenceRefs": [
        0
      ],
      "camera": "Locked close framing",
      "lighting": "Even diffuse light defines existing texture",
      "composition": "Graphic crop of the chosen source-visible detail",
      "motion": "Gentle focus settle on the existing surface",
      "pace": "Steady detail hold",
      "focus": "two visible front buttons"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        5
      ],
      "camera": "Locked symmetrical hero frame",
      "lighting": "Diffuse soft light with natural contact shadow",
      "composition": "Return to the full product with balanced space",
      "motion": "Hold the recognizable source-facing pose",
      "pace": "Sustained final hold",
      "focus": "belted jacket silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 410/512 karakter:

```text
Use locked balanced studio overview, framing the belted jacket silhouette. Compose the centered complete product with clean margins. Light the scene with diffuse soft light with natural contact shadow. Focus settles on the visible contour. Allow a quiet opening hold. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 2, 4 sn, 382/512 karakter:

```text
Frame the two visible front buttons in a locked close view. Compose the graphic crop of the chosen source-visible detail. Even diffuse light defines existing texture. Gentle focus settle on the existing surface. Allow a steady detail hold. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 3, 3 sn, 362/512 karakter:

```text
Use locked symmetrical hero frame, framing the belted jacket silhouette. Return to the full product with balanced space. Light the scene with diffuse soft light with natural contact shadow. Allow a sustained final hold. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

**Kot / apparel — 94/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "minimal-studio",
  "presetVersion": 3,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        2
      ],
      "camera": "Locked balanced studio overview",
      "lighting": "Diffuse soft light with natural contact shadow",
      "composition": "Centered complete product with clean margins",
      "motion": "Focus settles on the visible contour",
      "pace": "Quiet opening hold",
      "focus": "shorts silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "material-study",
      "evidenceRefs": [
        0
      ],
      "camera": "Locked close framing",
      "lighting": "Even diffuse light defines existing texture",
      "composition": "Graphic crop of the chosen source-visible detail",
      "motion": "Gentle focus settle on the existing surface",
      "pace": "Steady detail hold",
      "focus": "visible hem stitching"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        2
      ],
      "camera": "Locked symmetrical hero frame",
      "lighting": "Diffuse soft light with natural contact shadow",
      "composition": "Return to the full product with balanced space",
      "motion": "Hold the recognizable source-facing pose",
      "pace": "Sustained final hold",
      "focus": "shorts silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 369/512 karakter:

```text
Use locked balanced studio overview, framing the shorts silhouette. Compose the centered complete product with clean margins. Light the scene with diffuse soft light with natural contact shadow. Focus settles on the visible contour. Allow a quiet opening hold. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 2, 4 sn, 344/512 karakter:

```text
Frame the visible hem stitching in a locked close view. Compose the graphic crop of the chosen source-visible detail. Even diffuse light defines existing texture. Gentle focus settle on the existing surface. Allow a steady detail hold. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 3, 3 sn, 321/512 karakter:

```text
Use locked symmetrical hero frame, framing the shorts silhouette. Return to the full product with balanced space. Light the scene with diffuse soft light with natural contact shadow. Allow a sustained final hold. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

### floating-fashion · 69.1/100

Kategori sözleşmesi: apparel, headwear. Güçlü: focus-grounded-to-fixture-or-generic, distinct-structured-directions. Zayıf: Yakın kadrajda somut detay yerine form/genel odak; Compiler dilinde mekanik/meta ifade; Ayırt edici ürün detayı seçilmedi; Bütün sahnelerde aynı odak.

**Parlak siyah kemerli ceket / apparel — 71/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "floating-fashion",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        5
      ],
      "camera": "Slow upward camera glide within the source view",
      "lighting": "Broad soft light outlines the existing silhouette",
      "composition": "Full silhouette with open margins",
      "motion": "Focus resolves existing surface detail",
      "pace": "Airy measured rhythm",
      "focus": "belted jacket silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "controlled-motion",
      "evidenceRefs": [
        5
      ],
      "camera": "Long-lens locked close framing",
      "lighting": "Broad soft light outlines the existing silhouette",
      "composition": "Close crop of the chosen visible detail",
      "motion": "Focus resolves existing surface detail",
      "pace": "Airy measured rhythm",
      "focus": "belted jacket silhouette"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        5
      ],
      "camera": "Slow pull-back to a balanced hero view",
      "lighting": "Broad soft light outlines the existing silhouette",
      "composition": "Full form with generous space above",
      "motion": "Focus resolves existing surface detail",
      "pace": "Airy measured rhythm",
      "focus": "belted jacket silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 424/512 karakter:

```text
Use a slow upward camera glide within the source view, framing the belted jacket silhouette. Compose the full silhouette with open margins. Light the scene with broad soft light outlines the existing silhouette. Focus resolves existing surface detail. Allow a airy measured rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 2, 4 sn, 411/512 karakter:

```text
Use long-lens locked close framing, framing the belted jacket silhouette. Compose the close crop of the chosen visible detail. Light the scene with broad soft light outlines the existing silhouette. Focus resolves existing surface detail. Allow a airy measured rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 3, 3 sn, 417/512 karakter:

```text
Use a slow pull-back to a balanced hero view, framing the belted jacket silhouette. Compose the full form with generous space above. Light the scene with broad soft light outlines the existing silhouette. Focus resolves existing surface detail. Allow a airy measured rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

**Kot / apparel — 71/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "floating-fashion",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        2
      ],
      "camera": "Slow upward camera glide within the source view",
      "lighting": "Broad soft light outlines the existing silhouette",
      "composition": "Full silhouette with open margins",
      "motion": "Focus resolves existing surface detail",
      "pace": "Airy measured rhythm",
      "focus": "shorts silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "controlled-motion",
      "evidenceRefs": [
        2
      ],
      "camera": "Long-lens locked close framing",
      "lighting": "Broad soft light outlines the existing silhouette",
      "composition": "Close crop of the chosen visible detail",
      "motion": "Focus resolves existing surface detail",
      "pace": "Airy measured rhythm",
      "focus": "shorts silhouette"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        2
      ],
      "camera": "Slow pull-back to a balanced hero view",
      "lighting": "Broad soft light outlines the existing silhouette",
      "composition": "Full form with generous space above",
      "motion": "Focus resolves existing surface detail",
      "pace": "Airy measured rhythm",
      "focus": "shorts silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 383/512 karakter:

```text
Use a slow upward camera glide within the source view, framing the shorts silhouette. Compose the full silhouette with open margins. Light the scene with broad soft light outlines the existing silhouette. Focus resolves existing surface detail. Allow a airy measured rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 2, 4 sn, 370/512 karakter:

```text
Use long-lens locked close framing, framing the shorts silhouette. Compose the close crop of the chosen visible detail. Light the scene with broad soft light outlines the existing silhouette. Focus resolves existing surface detail. Allow a airy measured rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 3, 3 sn, 376/512 karakter:

```text
Use a slow pull-back to a balanced hero view, framing the shorts silhouette. Compose the full form with generous space above. Light the scene with broad soft light outlines the existing silhouette. Focus resolves existing surface detail. Allow a airy measured rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

### precision-macro · 84.4/100

Kategori sözleşmesi: watches, jewelry, electronics, eyewear. Güçlü: focus-grounded-to-fixture-or-generic, distinct-structured-directions. Zayıf: Yakın kadrajda somut detay yerine form/genel odak; Bütün sahnelerde aynı odak.

**Saat / watches — 82/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "precision-macro",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        0
      ],
      "camera": "Locked close framing",
      "lighting": "Narrow diffuse light defines existing edges",
      "composition": "Tight crop on the chosen evidenced feature",
      "motion": "Focus resolves existing surface detail",
      "pace": "Patient precise rhythm",
      "focus": "silver"
    },
    {
      "durationSeconds": 4,
      "purpose": "macro-detail",
      "evidenceRefs": [
        6
      ],
      "camera": "Short lateral macro camera glide",
      "lighting": "Narrow diffuse light defines existing edges",
      "composition": "Parallel close view of existing surface relief",
      "motion": "Focus resolves existing surface detail",
      "pace": "Patient precise rhythm",
      "focus": "slim dial markers"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        0
      ],
      "camera": "Slow pull-back to the complete visible form",
      "lighting": "Narrow diffuse light defines existing edges",
      "composition": "Centered recognizable hero view",
      "motion": "Focus resolves existing surface detail",
      "pace": "Patient precise rhythm",
      "focus": "silver"
    }
  ]
}
```

Sahne 1, 3 sn, 356/512 karakter:

```text
Frame the silver in a locked close view. Compose the tight crop on the chosen evidenced feature. Narrow diffuse light defines existing edges. Focus resolves existing surface detail. Allow a patient precise rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 2, 4 sn, 390/512 karakter:

```text
Use a short lateral macro camera glide, framing the slim dial markers. Compose the parallel close view of existing surface relief. Narrow diffuse light defines existing edges. Focus resolves existing surface detail. Allow a patient precise rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 3, 3 sn, 375/512 karakter:

```text
Use a slow pull-back to the complete visible form, framing the silver. Compose the centered recognizable hero view. Narrow diffuse light defines existing edges. Focus resolves existing surface detail. Allow a patient precise rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

**Takı / jewelry — 82/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "precision-macro",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        3
      ],
      "camera": "Locked close framing",
      "lighting": "Narrow diffuse light defines existing edges",
      "composition": "Tight crop on the chosen evidenced feature",
      "motion": "Focus resolves existing surface detail",
      "pace": "Patient precise rhythm",
      "focus": "slim ring silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "macro-detail",
      "evidenceRefs": [
        0
      ],
      "camera": "Short lateral macro camera glide",
      "lighting": "Narrow diffuse light defines existing edges",
      "composition": "Parallel close view of existing surface relief",
      "motion": "Focus resolves existing surface detail",
      "pace": "Patient precise rhythm",
      "focus": "oval center stone setting"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        3
      ],
      "camera": "Slow pull-back to the complete visible form",
      "lighting": "Narrow diffuse light defines existing edges",
      "composition": "Centered recognizable hero view",
      "motion": "Focus resolves existing surface detail",
      "pace": "Patient precise rhythm",
      "focus": "slim ring silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 370/512 karakter:

```text
Frame the slim ring silhouette in a locked close view. Compose the tight crop on the chosen evidenced feature. Narrow diffuse light defines existing edges. Focus resolves existing surface detail. Allow a patient precise rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 2, 4 sn, 398/512 karakter:

```text
Use a short lateral macro camera glide, framing the oval center stone setting. Compose the parallel close view of existing surface relief. Narrow diffuse light defines existing edges. Focus resolves existing surface detail. Allow a patient precise rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 3, 3 sn, 389/512 karakter:

```text
Use a slow pull-back to the complete visible form, framing the slim ring silhouette. Compose the centered recognizable hero view. Narrow diffuse light defines existing edges. Focus resolves existing surface detail. Allow a patient precise rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

### glass-reflection · 84.4/100

Kategori sözleşmesi: cosmetics, eyewear, packaged-food. Güçlü: focus-grounded-to-fixture-or-generic, distinct-structured-directions. Zayıf: Compiler dilinde mekanik/meta ifade; Bütün sahnelerde aynı odak.

**Parfüm / cosmetics — 93/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "glass-reflection",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        2
      ],
      "camera": "Locked medium framing",
      "lighting": "A broad soft highlight travels over the surface",
      "composition": "Clean outline with lateral breathing room",
      "motion": "Focus resolves existing surface detail",
      "pace": "Smooth luminous rhythm",
      "focus": "rectangular bottle geometry"
    },
    {
      "durationSeconds": 4,
      "purpose": "lighting-reveal",
      "evidenceRefs": [
        3
      ],
      "camera": "Macro vertical camera tilt within the visible face",
      "lighting": "A broad soft highlight travels over the surface",
      "composition": "Close crop of a source-visible reflective edge",
      "motion": "Focus resolves existing surface detail",
      "pace": "Smooth luminous rhythm",
      "focus": "rectangular glass bottle"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        2
      ],
      "camera": "Locked symmetrical hero framing",
      "lighting": "A broad soft highlight travels over the surface",
      "composition": "Full form with readable existing marks",
      "motion": "Focus resolves existing surface detail",
      "pace": "Smooth luminous rhythm",
      "focus": "rectangular bottle geometry"
    }
  ]
}
```

Sahne 1, 3 sn, 386/512 karakter:

```text
Use locked medium framing, framing the rectangular bottle geometry. Compose the clean outline with lateral breathing room. A broad soft highlight travels over the surface. Focus resolves existing surface detail. Allow a smooth luminous rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 2, 4 sn, 419/512 karakter:

```text
Use a macro vertical camera tilt within the visible face, framing the rectangular glass bottle. Compose the close crop of a source-visible reflective edge. A broad soft highlight travels over the surface. Focus resolves existing surface detail. Allow a smooth luminous rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 3, 3 sn, 393/512 karakter:

```text
Use locked symmetrical hero framing, framing the rectangular bottle geometry. Compose the full form with readable existing marks. A broad soft highlight travels over the surface. Focus resolves existing surface detail. Allow a smooth luminous rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

**Gözlük / eyewear — 93/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "glass-reflection",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        2
      ],
      "camera": "Locked medium framing",
      "lighting": "A broad soft highlight travels over the surface",
      "composition": "Clean outline with lateral breathing room",
      "motion": "Focus resolves existing surface detail",
      "pace": "Smooth luminous rhythm",
      "focus": "curved frame silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "lighting-reveal",
      "evidenceRefs": [
        0
      ],
      "camera": "Macro vertical camera tilt within the visible face",
      "lighting": "A broad soft highlight travels over the surface",
      "composition": "Close crop of a source-visible reflective edge",
      "motion": "Focus resolves existing surface detail",
      "pace": "Smooth luminous rhythm",
      "focus": "visible frame edge"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        2
      ],
      "camera": "Locked symmetrical hero framing",
      "lighting": "A broad soft highlight travels over the surface",
      "composition": "Full form with readable existing marks",
      "motion": "Focus resolves existing surface detail",
      "pace": "Smooth luminous rhythm",
      "focus": "curved frame silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 348/512 karakter:

```text
Use locked medium framing, framing the curved frame silhouette. Compose the clean outline with lateral breathing room. A broad soft highlight travels over the surface. Focus resolves existing surface detail. Allow a smooth luminous rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 2, 4 sn, 379/512 karakter:

```text
Use a macro vertical camera tilt within the visible face, framing the visible frame edge. Compose the close crop of a source-visible reflective edge. A broad soft highlight travels over the surface. Focus resolves existing surface detail. Allow a smooth luminous rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 3, 3 sn, 355/512 karakter:

```text
Use locked symmetrical hero framing, framing the curved frame silhouette. Compose the full form with readable existing marks. A broad soft highlight travels over the surface. Focus resolves existing surface detail. Allow a smooth luminous rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

### product-spotlight · 76.2/100

Kategori sözleşmesi: evrensel. Güçlü: focus-grounded-to-fixture-or-generic, distinct-structured-directions. Zayıf: Yakın kadrajda somut detay yerine form/genel odak; Ayırt edici ürün detayı seçilmedi; Bütün sahnelerde aynı odak.

**Parlak siyah kemerli ceket / apparel — 75/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "product-spotlight",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        5
      ],
      "camera": "Locked wide product framing",
      "lighting": "A soft focused light pass defines the contour",
      "composition": "Full form in balanced negative space",
      "motion": "Focus resolves existing surface detail",
      "pace": "Deliberate light reveal",
      "focus": "belted jacket silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "lighting-reveal",
      "evidenceRefs": [],
      "camera": "Long-lens locked close framing",
      "lighting": "A soft focused light pass defines the contour",
      "composition": "Wider view of the source-visible product form; no unverified detail is enlarged",
      "motion": "Focus resolves existing surface detail",
      "pace": "Deliberate light reveal",
      "focus": "Source-visible surface detail"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        5
      ],
      "camera": "Locked medium hero framing",
      "lighting": "A soft focused light pass defines the contour",
      "composition": "Centered silhouette with clean margins",
      "motion": "Focus resolves existing surface detail",
      "pace": "Deliberate light reveal",
      "focus": "belted jacket silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 383/512 karakter:

```text
Use locked wide product framing, framing the belted jacket silhouette. Compose the full form in balanced negative space. A soft focused light pass defines the contour. Focus resolves existing surface detail. Allow a deliberate light reveal. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 2, 4 sn, 427/512 karakter:

```text
Use long-lens locked close framing, framing the visible surface detail. Compose the wider view of the source-visible product form; no unverified detail is enlarged. A soft focused light pass defines the contour. Focus resolves existing surface detail. Allow a deliberate light reveal. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 3, 3 sn, 384/512 karakter:

```text
Use locked medium hero framing, framing the belted jacket silhouette. Compose the centered silhouette with clean margins. A soft focused light pass defines the contour. Focus resolves existing surface detail. Allow a deliberate light reveal. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

**Kot / apparel — 75/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "product-spotlight",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        2
      ],
      "camera": "Locked wide product framing",
      "lighting": "A soft focused light pass defines the contour",
      "composition": "Full form in balanced negative space",
      "motion": "Focus resolves existing surface detail",
      "pace": "Deliberate light reveal",
      "focus": "shorts silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "lighting-reveal",
      "evidenceRefs": [],
      "camera": "Long-lens locked close framing",
      "lighting": "A soft focused light pass defines the contour",
      "composition": "Wider view of the source-visible product form; no unverified detail is enlarged",
      "motion": "Focus resolves existing surface detail",
      "pace": "Deliberate light reveal",
      "focus": "Source-visible surface detail"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        2
      ],
      "camera": "Locked medium hero framing",
      "lighting": "A soft focused light pass defines the contour",
      "composition": "Centered silhouette with clean margins",
      "motion": "Focus resolves existing surface detail",
      "pace": "Deliberate light reveal",
      "focus": "shorts silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 342/512 karakter:

```text
Use locked wide product framing, framing the shorts silhouette. Compose the full form in balanced negative space. A soft focused light pass defines the contour. Focus resolves existing surface detail. Allow a deliberate light reveal. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 2, 4 sn, 393/512 karakter:

```text
Use long-lens locked close framing, framing the visible surface detail. Compose the wider view of the source-visible product form; no unverified detail is enlarged. A soft focused light pass defines the contour. Focus resolves existing surface detail. Allow a deliberate light reveal. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 3, 3 sn, 343/512 karakter:

```text
Use locked medium hero framing, framing the shorts silhouette. Compose the centered silhouette with clean margins. A soft focused light pass defines the contour. Focus resolves existing surface detail. Allow a deliberate light reveal. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

### elegant-orbit · 74.9/100

Kategori sözleşmesi: bags, watches, jewelry, eyewear, footwear. Güçlü: focus-grounded-to-fixture-or-generic, distinct-structured-directions. Zayıf: Yakın kadrajda somut detay yerine form/genel odak; Ayırt edici ürün detayı seçilmedi; Bütün sahnelerde aynı odak; En yakın presetle aynı kaba çekim imzası.

**Deri çanta / bags — 94/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "elegant-orbit",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        1
      ],
      "camera": "Short lateral camera glide across the visible face",
      "lighting": "Soft directional edge light retains natural source colors",
      "composition": "Angled full form retaining source orientation",
      "motion": "Focus resolves existing surface detail",
      "pace": "Fluid restrained rhythm",
      "focus": "structured bag silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "controlled-motion",
      "evidenceRefs": [
        2
      ],
      "camera": "Long-lens locked close framing",
      "lighting": "Soft directional edge light retains natural source colors",
      "composition": "Diagonal close crop tracing the visible curve",
      "motion": "Focus resolves existing surface detail",
      "pace": "Fluid restrained rhythm",
      "focus": "arched front handle"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        1
      ],
      "camera": "Slow pull-back within the source view",
      "lighting": "Soft directional edge light retains natural source colors",
      "composition": "Balanced recognizable hero frame",
      "motion": "Focus resolves existing surface detail",
      "pace": "Fluid restrained rhythm",
      "focus": "structured bag silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 451/512 karakter:

```text
Use a short lateral camera glide across the visible face, framing the structured bag silhouette. Compose the angled full form retaining source orientation. Light the scene with soft directional edge light retains natural source colors. Focus resolves existing surface detail. Allow a fluid restrained rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 2, 4 sn, 423/512 karakter:

```text
Use long-lens locked close framing, framing the arched front handle. Compose the diagonal close crop tracing the visible curve. Light the scene with soft directional edge light retains natural source colors. Focus resolves existing surface detail. Allow a fluid restrained rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 3, 3 sn, 425/512 karakter:

```text
Use a slow pull-back within the source view, framing the structured bag silhouette. Compose the balanced recognizable hero frame. Light the scene with soft directional edge light retains natural source colors. Focus resolves existing surface detail. Allow a fluid restrained rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

**Saat / watches — 75/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "elegant-orbit",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        0
      ],
      "camera": "Short lateral camera glide across the visible face",
      "lighting": "Soft directional edge light retains natural source colors",
      "composition": "Angled full form retaining source orientation",
      "motion": "Focus resolves existing surface detail",
      "pace": "Fluid restrained rhythm",
      "focus": "silver"
    },
    {
      "durationSeconds": 4,
      "purpose": "controlled-motion",
      "evidenceRefs": [],
      "camera": "Long-lens locked close framing",
      "lighting": "Soft directional edge light retains natural source colors",
      "composition": "Wider view of the source-visible product form; no unverified detail is enlarged",
      "motion": "Focus resolves existing surface detail",
      "pace": "Fluid restrained rhythm",
      "focus": "Source-visible surface detail"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        0
      ],
      "camera": "Slow pull-back within the source view",
      "lighting": "Soft directional edge light retains natural source colors",
      "composition": "Balanced recognizable hero frame",
      "motion": "Focus resolves existing surface detail",
      "pace": "Fluid restrained rhythm",
      "focus": "silver"
    }
  ]
}
```

Sahne 1, 3 sn, 432/512 karakter:

```text
Use a short lateral camera glide across the visible face, framing the silver. Compose the angled full form retaining source orientation. Light the scene with soft directional edge light retains natural source colors. Focus resolves existing surface detail. Allow a fluid restrained rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 2, 4 sn, 460/512 karakter:

```text
Use long-lens locked close framing, framing the visible surface detail. Compose the wider view of the source-visible product form; no unverified detail is enlarged. Light the scene with soft directional edge light retains natural source colors. Focus resolves existing surface detail. Allow a fluid restrained rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 3, 3 sn, 406/512 karakter:

```text
Use a slow pull-back within the source view, framing the silver. Compose the balanced recognizable hero frame. Light the scene with soft directional edge light retains natural source colors. Focus resolves existing surface detail. Allow a fluid restrained rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

### cinematic-hero · 70.5/100

Kategori sözleşmesi: evrensel. Güçlü: focus-grounded-to-fixture-or-generic, distinct-structured-directions. Zayıf: Yakın kadrajda somut detay yerine form/genel odak; Ayırt edici ürün detayı seçilmedi; Bütün sahnelerde aynı odak; En yakın presetle aynı kaba çekim imzası.

**Parlak siyah kemerli ceket / apparel — 72/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "cinematic-hero",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        5
      ],
      "camera": "Slow low-amplitude dolly-in",
      "lighting": "Sculpted side light retains source color boundaries",
      "composition": "Complete visible form with campaign negative space",
      "motion": "Focus resolves existing surface detail",
      "pace": "Confident cinematic rhythm",
      "focus": "belted jacket silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "material-study",
      "evidenceRefs": [
        5
      ],
      "camera": "Locked off-center close framing",
      "lighting": "Sculpted side light retains source color boundaries",
      "composition": "Tight asymmetric crop of the chosen detail",
      "motion": "Focus resolves existing surface detail",
      "pace": "Confident cinematic rhythm",
      "focus": "belted jacket silhouette"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        5
      ],
      "camera": "Slow pull-back to wide hero framing",
      "lighting": "Sculpted side light retains source color boundaries",
      "composition": "Wide hero composition with strong visual balance",
      "motion": "Focus resolves existing surface detail",
      "pace": "Confident cinematic rhythm",
      "focus": "belted jacket silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 429/512 karakter:

```text
Use a slow low-amplitude dolly-in, framing the belted jacket silhouette. Compose the complete visible form with campaign negative space. Light the scene with sculpted side light retains source color boundaries. Focus resolves existing surface detail. Allow a confident cinematic rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 2, 4 sn, 423/512 karakter:

```text
Use locked off-center close framing, framing the belted jacket silhouette. Compose the tight asymmetric crop of the chosen detail. Light the scene with sculpted side light retains source color boundaries. Focus resolves existing surface detail. Allow a confident cinematic rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 3, 3 sn, 433/512 karakter:

```text
Use slow pull-back to wide hero framing, framing the belted jacket silhouette. Compose the wide hero composition with strong visual balance. Light the scene with sculpted side light retains source color boundaries. Focus resolves existing surface detail. Allow a confident cinematic rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

**Kot / apparel — 72/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "cinematic-hero",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        2
      ],
      "camera": "Slow low-amplitude dolly-in",
      "lighting": "Sculpted side light retains source color boundaries",
      "composition": "Complete visible form with campaign negative space",
      "motion": "Focus resolves existing surface detail",
      "pace": "Confident cinematic rhythm",
      "focus": "shorts silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "material-study",
      "evidenceRefs": [
        2
      ],
      "camera": "Locked off-center close framing",
      "lighting": "Sculpted side light retains source color boundaries",
      "composition": "Tight asymmetric crop of the chosen detail",
      "motion": "Focus resolves existing surface detail",
      "pace": "Confident cinematic rhythm",
      "focus": "shorts silhouette"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        2
      ],
      "camera": "Slow pull-back to wide hero framing",
      "lighting": "Sculpted side light retains source color boundaries",
      "composition": "Wide hero composition with strong visual balance",
      "motion": "Focus resolves existing surface detail",
      "pace": "Confident cinematic rhythm",
      "focus": "shorts silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 388/512 karakter:

```text
Use a slow low-amplitude dolly-in, framing the shorts silhouette. Compose the complete visible form with campaign negative space. Light the scene with sculpted side light retains source color boundaries. Focus resolves existing surface detail. Allow a confident cinematic rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 2, 4 sn, 382/512 karakter:

```text
Use locked off-center close framing, framing the shorts silhouette. Compose the tight asymmetric crop of the chosen detail. Light the scene with sculpted side light retains source color boundaries. Focus resolves existing surface detail. Allow a confident cinematic rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 3, 3 sn, 392/512 karakter:

```text
Use slow pull-back to wide hero framing, framing the shorts silhouette. Compose the wide hero composition with strong visual balance. Light the scene with sculpted side light retains source color boundaries. Focus resolves existing surface detail. Allow a confident cinematic rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

### material-detail · 81.4/100

Kategori sözleşmesi: evrensel. Güçlü: focus-grounded-to-fixture-or-generic, distinct-structured-directions. Zayıf: Yakın kadrajda somut detay yerine form/genel odak; Compiler dilinde mekanik/meta ifade; Ayırt edici ürün detayı seçilmedi; Bütün sahnelerde aynı odak.

**Parlak siyah kemerli ceket / apparel — 79/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "material-detail",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        5
      ],
      "camera": "Locked close framing",
      "lighting": "Grazing soft light defines existing surface relief",
      "composition": "Source-resolved crop of the selected surface",
      "motion": "Focus resolves existing surface detail",
      "pace": "Tactile unhurried rhythm",
      "focus": "belted jacket silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "material-study",
      "evidenceRefs": [
        2
      ],
      "camera": "Slow pan right across the visible surface",
      "lighting": "Grazing soft light defines existing surface relief",
      "composition": "Parallel crop emphasizing existing relief",
      "motion": "Focus resolves existing surface detail",
      "pace": "Tactile unhurried rhythm",
      "focus": "glossy coated fabric"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        5
      ],
      "camera": "Slow pull-back to medium product framing",
      "lighting": "Grazing soft light defines existing surface relief",
      "composition": "Recognizable full form with clear surface context",
      "motion": "Focus resolves existing surface detail",
      "pace": "Tactile unhurried rhythm",
      "focus": "belted jacket silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 385/512 karakter:

```text
Frame the belted jacket silhouette in a locked close view. Compose the source-resolved crop of the selected surface. Grazing soft light defines existing surface relief. Focus resolves existing surface detail. Allow a tactile unhurried rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 2, 4 sn, 406/512 karakter:

```text
Use a slow pan right across the visible surface, framing the glossy coated fabric. Compose the parallel crop emphasizing existing relief. Grazing soft light defines existing surface relief. Focus resolves existing surface detail. Allow a tactile unhurried rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 3, 3 sn, 415/512 karakter:

```text
Use slow pull-back to medium product framing, framing the belted jacket silhouette. Compose the recognizable full form with clear surface context. Grazing soft light defines existing surface relief. Focus resolves existing surface detail. Allow a tactile unhurried rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

**Kot / apparel — 79/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "material-detail",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        2
      ],
      "camera": "Locked close framing",
      "lighting": "Grazing soft light defines existing surface relief",
      "composition": "Source-resolved crop of the selected surface",
      "motion": "Focus resolves existing surface detail",
      "pace": "Tactile unhurried rhythm",
      "focus": "shorts silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "material-study",
      "evidenceRefs": [
        1
      ],
      "camera": "Slow pan right across the visible surface",
      "lighting": "Grazing soft light defines existing surface relief",
      "composition": "Parallel crop emphasizing existing relief",
      "motion": "Focus resolves existing surface detail",
      "pace": "Tactile unhurried rhythm",
      "focus": "denim weave"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        2
      ],
      "camera": "Slow pull-back to medium product framing",
      "lighting": "Grazing soft light defines existing surface relief",
      "composition": "Recognizable full form with clear surface context",
      "motion": "Focus resolves existing surface detail",
      "pace": "Tactile unhurried rhythm",
      "focus": "shorts silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 344/512 karakter:

```text
Frame the shorts silhouette in a locked close view. Compose the source-resolved crop of the selected surface. Grazing soft light defines existing surface relief. Focus resolves existing surface detail. Allow a tactile unhurried rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 2, 4 sn, 363/512 karakter:

```text
Use a slow pan right across the visible surface, framing the denim weave. Compose the parallel crop emphasizing existing relief. Grazing soft light defines existing surface relief. Focus resolves existing surface detail. Allow a tactile unhurried rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 3, 3 sn, 374/512 karakter:

```text
Use slow pull-back to medium product framing, framing the shorts silhouette. Compose the recognizable full form with clear surface context. Grazing soft light defines existing surface relief. Focus resolves existing surface detail. Allow a tactile unhurried rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

### macro-stitching · 83.2/100

Kategori sözleşmesi: apparel, headwear, bags, footwear, furniture. Güçlü: focus-grounded-to-fixture-or-generic, distinct-structured-directions. Zayıf: Yakın kadrajda somut detay yerine form/genel odak; Bütün sahnelerde aynı odak.

**Parlak siyah kemerli ceket / apparel — 80/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "macro-stitching",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        5
      ],
      "camera": "Locked macro framing",
      "lighting": "Soft raking light reveals existing relief",
      "composition": "Close view of evidenced construction",
      "motion": "Focus resolves existing surface detail",
      "pace": "Measured craft study",
      "focus": "belted jacket silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "macro-detail",
      "evidenceRefs": [
        3
      ],
      "camera": "Macro pan left along the selected visible detail",
      "lighting": "Soft raking light reveals existing relief",
      "composition": "Diagonal crop following the existing detail line",
      "motion": "Focus resolves existing surface detail",
      "pace": "Measured craft study",
      "focus": "wide notched collar"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        5
      ],
      "camera": "Slow pull-back to full product framing",
      "lighting": "Soft raking light reveals existing relief",
      "composition": "Full visible silhouette with clean margins",
      "motion": "Focus resolves existing surface detail",
      "pace": "Measured craft study",
      "focus": "belted jacket silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 369/512 karakter:

```text
Use locked macro framing, framing the belted jacket silhouette. Compose the close view of evidenced construction. Soft raking light reveals existing relief. Focus resolves existing surface detail. Allow a measured craft study. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 2, 4 sn, 406/512 karakter:

```text
Use a macro pan left along the selected visible detail, framing the wide notched collar. Compose the diagonal crop following the existing detail line. Soft raking light reveals existing relief. Focus resolves existing surface detail. Allow a measured craft study. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 3, 3 sn, 393/512 karakter:

```text
Use slow pull-back to full product framing, framing the belted jacket silhouette. Compose the full visible silhouette with clean margins. Soft raking light reveals existing relief. Focus resolves existing surface detail. Allow a measured craft study. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

**Kot / apparel — 80/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "macro-stitching",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        2
      ],
      "camera": "Locked macro framing",
      "lighting": "Soft raking light reveals existing relief",
      "composition": "Close view of evidenced construction",
      "motion": "Focus resolves existing surface detail",
      "pace": "Measured craft study",
      "focus": "shorts silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "macro-detail",
      "evidenceRefs": [
        0
      ],
      "camera": "Macro pan left along the selected visible detail",
      "lighting": "Soft raking light reveals existing relief",
      "composition": "Diagonal crop following the existing detail line",
      "motion": "Focus resolves existing surface detail",
      "pace": "Measured craft study",
      "focus": "visible hem stitching"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        2
      ],
      "camera": "Slow pull-back to full product framing",
      "lighting": "Soft raking light reveals existing relief",
      "composition": "Full visible silhouette with clean margins",
      "motion": "Focus resolves existing surface detail",
      "pace": "Measured craft study",
      "focus": "shorts silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 328/512 karakter:

```text
Use locked macro framing, framing the shorts silhouette. Compose the close view of evidenced construction. Soft raking light reveals existing relief. Focus resolves existing surface detail. Allow a measured craft study. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 2, 4 sn, 374/512 karakter:

```text
Use a macro pan left along the selected visible detail, framing the visible hem stitching. Compose the diagonal crop following the existing detail line. Soft raking light reveals existing relief. Focus resolves existing surface detail. Allow a measured craft study. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 3, 3 sn, 352/512 karakter:

```text
Use slow pull-back to full product framing, framing the shorts silhouette. Compose the full visible silhouette with clean margins. Soft raking light reveals existing relief. Focus resolves existing surface detail. Allow a measured craft study. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

### fabric-motion · 77.3/100

Kategori sözleşmesi: apparel, headwear. Güçlü: focus-grounded-to-fixture-or-generic, distinct-structured-directions. Zayıf: Yakın kadrajda somut detay yerine form/genel odak; Compiler dilinde mekanik/meta ifade; Ayırt edici ürün detayı seçilmedi; Bütün sahnelerde aynı odak.

**Parlak siyah kemerli ceket / apparel — 93/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "fabric-motion",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        5
      ],
      "camera": "Slow vertical tracking within the visible face",
      "lighting": "A gentle light sweep follows existing folds",
      "composition": "Long visible contour in a narrow composition",
      "motion": "Focus resolves existing surface detail",
      "pace": "Soft kinetic rhythm",
      "focus": "belted jacket silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "controlled-motion",
      "evidenceRefs": [
        2
      ],
      "camera": "Locked close framing",
      "lighting": "A gentle light sweep follows existing folds",
      "composition": "Source-resolved crop of existing folds",
      "motion": "Focus resolves existing surface detail",
      "pace": "Soft kinetic rhythm",
      "focus": "glossy coated fabric"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        5
      ],
      "camera": "Slow pull-back to a clean silhouette",
      "lighting": "A gentle light sweep follows existing folds",
      "composition": "Full form with balanced breathing room",
      "motion": "Focus resolves existing surface detail",
      "pace": "Soft kinetic rhythm",
      "focus": "belted jacket silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 427/512 karakter:

```text
Use a slow vertical tracking within the visible face, framing the belted jacket silhouette. Compose the long visible contour in a narrow composition. Light the scene with a gentle light sweep follows existing folds. Focus resolves existing surface detail. Allow a soft kinetic rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 2, 4 sn, 384/512 karakter:

```text
Frame the glossy coated fabric in a locked close view. Compose the source-resolved crop of existing folds. Light the scene with a gentle light sweep follows existing folds. Focus resolves existing surface detail. Allow a soft kinetic rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 3, 3 sn, 411/512 karakter:

```text
Use a slow pull-back to a clean silhouette, framing the belted jacket silhouette. Compose the full form with balanced breathing room. Light the scene with a gentle light sweep follows existing folds. Focus resolves existing surface detail. Allow a soft kinetic rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

**Kot / apparel — 93/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "fabric-motion",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        2
      ],
      "camera": "Slow vertical tracking within the visible face",
      "lighting": "A gentle light sweep follows existing folds",
      "composition": "Long visible contour in a narrow composition",
      "motion": "Focus resolves existing surface detail",
      "pace": "Soft kinetic rhythm",
      "focus": "shorts silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "controlled-motion",
      "evidenceRefs": [
        1
      ],
      "camera": "Locked close framing",
      "lighting": "A gentle light sweep follows existing folds",
      "composition": "Source-resolved crop of existing folds",
      "motion": "Focus resolves existing surface detail",
      "pace": "Soft kinetic rhythm",
      "focus": "denim weave"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        2
      ],
      "camera": "Slow pull-back to a clean silhouette",
      "lighting": "A gentle light sweep follows existing folds",
      "composition": "Full form with balanced breathing room",
      "motion": "Focus resolves existing surface detail",
      "pace": "Soft kinetic rhythm",
      "focus": "shorts silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 386/512 karakter:

```text
Use a slow vertical tracking within the visible face, framing the shorts silhouette. Compose the long visible contour in a narrow composition. Light the scene with a gentle light sweep follows existing folds. Focus resolves existing surface detail. Allow a soft kinetic rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 2, 4 sn, 341/512 karakter:

```text
Frame the denim weave in a locked close view. Compose the source-resolved crop of existing folds. Light the scene with a gentle light sweep follows existing folds. Focus resolves existing surface detail. Allow a soft kinetic rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 3, 3 sn, 370/512 karakter:

```text
Use a slow pull-back to a clean silhouette, framing the shorts silhouette. Compose the full form with balanced breathing room. Light the scene with a gentle light sweep follows existing folds. Focus resolves existing surface detail. Allow a soft kinetic rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

### label-reveal · 81.9/100

Kategori sözleşmesi: cosmetics, packaged-food, electronics, headwear. Güçlü: focus-grounded-to-fixture-or-generic, distinct-structured-directions. Zayıf: Bütün sahnelerde aynı odak; En yakın presetle aynı kaba çekim imzası.

**Parfüm / cosmetics — 94/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "label-reveal",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        2
      ],
      "camera": "Slow dolly-in within the source view",
      "lighting": "Even soft light keeps existing marks readable",
      "composition": "Complete product with the visible mark in context",
      "motion": "Focus resolves existing surface detail",
      "pace": "Clear measured reveal",
      "focus": "rectangular bottle geometry"
    },
    {
      "durationSeconds": 4,
      "purpose": "macro-detail",
      "evidenceRefs": [
        0
      ],
      "camera": "Locked close framing",
      "lighting": "Even soft light keeps existing marks readable",
      "composition": "Readable crop at source-resolved scale",
      "motion": "Focus resolves existing surface detail",
      "pace": "Clear measured reveal",
      "focus": "centered front label"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        2
      ],
      "camera": "Locked medium packshot",
      "lighting": "Even soft light keeps existing marks readable",
      "composition": "Balanced front-facing product composition",
      "motion": "Focus resolves existing surface detail",
      "pace": "Clear measured reveal",
      "focus": "rectangular bottle geometry"
    }
  ]
}
```

Sahne 1, 3 sn, 425/512 karakter:

```text
Dolly in slowly within the source view, framing the rectangular bottle geometry. Compose the complete product with the visible mark in context. Light the scene with even soft light keeps existing marks readable. Focus resolves existing surface detail. Allow a clear measured reveal. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 2, 4 sn, 388/512 karakter:

```text
Frame the centered front label in a locked close view. Compose the readable crop at source-resolved scale. Light the scene with even soft light keeps existing marks readable. Focus resolves existing surface detail. Allow a clear measured reveal. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 3, 3 sn, 405/512 karakter:

```text
Use locked medium packshot, framing the rectangular bottle geometry. Compose the balanced front-facing product composition. Light the scene with even soft light keeps existing marks readable. Focus resolves existing surface detail. Allow a clear measured reveal. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

**Şapka / headwear — 94/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "label-reveal",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        1
      ],
      "camera": "Slow dolly-in within the source view",
      "lighting": "Even soft light keeps existing marks readable",
      "composition": "Complete product with the visible mark in context",
      "motion": "Focus resolves existing surface detail",
      "pace": "Clear measured reveal",
      "focus": "curved brim silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "macro-detail",
      "evidenceRefs": [
        0
      ],
      "camera": "Locked close framing",
      "lighting": "Even soft light keeps existing marks readable",
      "composition": "Readable crop at source-resolved scale",
      "motion": "Focus resolves existing surface detail",
      "pace": "Clear measured reveal",
      "focus": "visible brim stitching"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        1
      ],
      "camera": "Locked medium packshot",
      "lighting": "Even soft light keeps existing marks readable",
      "composition": "Balanced front-facing product composition",
      "motion": "Focus resolves existing surface detail",
      "pace": "Clear measured reveal",
      "focus": "curved brim silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 386/512 karakter:

```text
Dolly in slowly within the source view, framing the curved brim silhouette. Compose the complete product with the visible mark in context. Light the scene with even soft light keeps existing marks readable. Focus resolves existing surface detail. Allow a clear measured reveal. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 2, 4 sn, 356/512 karakter:

```text
Frame the visible brim stitching in a locked close view. Compose the readable crop at source-resolved scale. Light the scene with even soft light keeps existing marks readable. Focus resolves existing surface detail. Allow a clear measured reveal. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 3, 3 sn, 366/512 karakter:

```text
Use locked medium packshot, framing the curved brim silhouette. Compose the balanced front-facing product composition. Light the scene with even soft light keeps existing marks readable. Focus resolves existing surface detail. Allow a clear measured reveal. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

### dramatic-backlight · 77.8/100

Kategori sözleşmesi: cosmetics, jewelry, eyewear, packaged-food. Güçlü: focus-grounded-to-fixture-or-generic, distinct-structured-directions. Zayıf: Yakın kadrajda somut detay yerine form/genel odak; Compiler dilinde mekanik/meta ifade; Ayırt edici ürün detayı seçilmedi; Bütün sahnelerde aynı odak.

**Takı / jewelry — 75/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "dramatic-backlight",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        3
      ],
      "camera": "Locked medium silhouette view",
      "lighting": "Soft rim light separates the existing contour",
      "composition": "Complete outline with dark negative space",
      "motion": "Focus resolves existing surface detail",
      "pace": "Gradual dramatic reveal",
      "focus": "slim ring silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "lighting-reveal",
      "evidenceRefs": [],
      "camera": "Short lateral close camera glide",
      "lighting": "Soft rim light separates the existing contour",
      "composition": "Wider view of the source-visible product form; no unverified detail is enlarged",
      "motion": "Focus resolves existing surface detail",
      "pace": "Gradual dramatic reveal",
      "focus": "Source-visible surface detail"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        3
      ],
      "camera": "Locked full product hero frame",
      "lighting": "Soft rim light separates the existing contour",
      "composition": "Balanced outline with readable existing marks",
      "motion": "Focus resolves existing surface detail",
      "pace": "Gradual dramatic reveal",
      "focus": "slim ring silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 407/512 karakter:

```text
Use locked medium silhouette view, framing the slim ring silhouette. Compose the complete outline with dark negative space. Light the scene with soft rim light separates the existing contour. Focus resolves existing surface detail. Allow a gradual dramatic reveal. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 2, 4 sn, 452/512 karakter:

```text
Use a short lateral close camera glide, framing the visible surface detail. Compose the wider view of the source-visible product form; no unverified detail is enlarged. Light the scene with soft rim light separates the existing contour. Focus resolves existing surface detail. Allow a gradual dramatic reveal. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 3, 3 sn, 414/512 karakter:

```text
Use a locked full product hero frame, framing the slim ring silhouette. Compose the balanced outline with readable existing marks. Light the scene with soft rim light separates the existing contour. Focus resolves existing surface detail. Allow a gradual dramatic reveal. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

**Parfüm / cosmetics — 71/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "dramatic-backlight",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        2
      ],
      "camera": "Locked medium silhouette view",
      "lighting": "Soft rim light separates the existing contour",
      "composition": "Complete outline with dark negative space",
      "motion": "Focus resolves existing surface detail",
      "pace": "Gradual dramatic reveal",
      "focus": "rectangular bottle geometry"
    },
    {
      "durationSeconds": 4,
      "purpose": "lighting-reveal",
      "evidenceRefs": [
        2
      ],
      "camera": "Short lateral close camera glide",
      "lighting": "Soft rim light separates the existing contour",
      "composition": "Close crop of a source-visible edge",
      "motion": "Focus resolves existing surface detail",
      "pace": "Gradual dramatic reveal",
      "focus": "rectangular bottle geometry"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        2
      ],
      "camera": "Locked full product hero frame",
      "lighting": "Soft rim light separates the existing contour",
      "composition": "Balanced outline with readable existing marks",
      "motion": "Focus resolves existing surface detail",
      "pace": "Gradual dramatic reveal",
      "focus": "rectangular bottle geometry"
    }
  ]
}
```

Sahne 1, 3 sn, 414/512 karakter:

```text
Use locked medium silhouette view, framing the rectangular bottle geometry. Compose the complete outline with dark negative space. Light the scene with soft rim light separates the existing contour. Focus resolves existing surface detail. Allow a gradual dramatic reveal. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 2, 4 sn, 413/512 karakter:

```text
Use a short lateral close camera glide, framing the rectangular bottle geometry. Compose the close crop of a source-visible edge. Light the scene with soft rim light separates the existing contour. Focus resolves existing surface detail. Allow a gradual dramatic reveal. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 3, 3 sn, 421/512 karakter:

```text
Use a locked full product hero frame, framing the rectangular bottle geometry. Compose the balanced outline with readable existing marks. Light the scene with soft rim light separates the existing contour. Focus resolves existing surface detail. Allow a gradual dramatic reveal. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

### cinematic-dial · 82.5/100

Kategori sözleşmesi: watches. Güçlü: focus-grounded-to-fixture-or-generic, distinct-structured-directions. Zayıf: Bütün sahnelerde aynı odak.

**Saat / watches — 94/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "cinematic-dial",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        0
      ],
      "camera": "Slow optical push toward the selected visible detail",
      "lighting": "A narrow highlight crosses the existing relief",
      "composition": "Visible face in a balanced graphic composition",
      "motion": "Focus resolves existing surface detail",
      "pace": "Precise editorial rhythm",
      "focus": "silver"
    },
    {
      "durationSeconds": 4,
      "purpose": "macro-detail",
      "evidenceRefs": [
        2
      ],
      "camera": "Locked close framing",
      "lighting": "A narrow highlight crosses the existing relief",
      "composition": "Asymmetric close crop of evidenced layout",
      "motion": "Focus resolves existing surface detail",
      "pace": "Precise editorial rhythm",
      "focus": "blue dial with visible hands"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        0
      ],
      "camera": "Slow pull-back to a composed hero view",
      "lighting": "A narrow highlight crosses the existing relief",
      "composition": "Complete product with clean surrounding space",
      "motion": "Focus resolves existing surface detail",
      "pace": "Precise editorial rhythm",
      "focus": "silver"
    }
  ]
}
```

Sahne 1, 3 sn, 425/512 karakter:

```text
Use a slow optical push toward the selected visible detail, framing the silver. Compose the visible face in a balanced graphic composition. Light the scene with a narrow highlight crosses the existing relief. Focus resolves existing surface detail. Allow a precise editorial rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 2, 4 sn, 403/512 karakter:

```text
Frame the blue dial with visible hands in a locked close view. Compose the asymmetric close crop of evidenced layout. Light the scene with a narrow highlight crosses the existing relief. Focus resolves existing surface detail. Allow a precise editorial rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 3, 3 sn, 410/512 karakter:

```text
Use a slow pull-back to a composed hero view, framing the silver. Compose the complete product with clean surrounding space. Light the scene with a narrow highlight crosses the existing relief. Focus resolves existing surface detail. Allow a precise editorial rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

**Kare kol saati / watches — 94/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "cinematic-dial",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        0
      ],
      "camera": "Slow optical push toward the selected visible detail",
      "lighting": "A narrow highlight crosses the existing relief",
      "composition": "Visible face in a balanced graphic composition",
      "motion": "Focus resolves existing surface detail",
      "pace": "Precise editorial rhythm",
      "focus": "silver"
    },
    {
      "durationSeconds": 4,
      "purpose": "macro-detail",
      "evidenceRefs": [
        2
      ],
      "camera": "Locked close framing",
      "lighting": "A narrow highlight crosses the existing relief",
      "composition": "Asymmetric close crop of evidenced layout",
      "motion": "Focus resolves existing surface detail",
      "pace": "Precise editorial rhythm",
      "focus": "ivory dial with visible hands"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        0
      ],
      "camera": "Slow pull-back to a composed hero view",
      "lighting": "A narrow highlight crosses the existing relief",
      "composition": "Complete product with clean surrounding space",
      "motion": "Focus resolves existing surface detail",
      "pace": "Precise editorial rhythm",
      "focus": "silver"
    }
  ]
}
```

Sahne 1, 3 sn, 425/512 karakter:

```text
Use a slow optical push toward the selected visible detail, framing the silver. Compose the visible face in a balanced graphic composition. Light the scene with a narrow highlight crosses the existing relief. Focus resolves existing surface detail. Allow a precise editorial rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 2, 4 sn, 404/512 karakter:

```text
Frame the ivory dial with visible hands in a locked close view. Compose the asymmetric close crop of evidenced layout. Light the scene with a narrow highlight crosses the existing relief. Focus resolves existing surface detail. Allow a precise editorial rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 3, 3 sn, 410/512 karakter:

```text
Use a slow pull-back to a composed hero view, framing the silver. Compose the complete product with clean surrounding space. Light the scene with a narrow highlight crosses the existing relief. Focus resolves existing surface detail. Allow a precise editorial rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

### metallic-light-sweep · 78.8/100

Kategori sözleşmesi: watches, jewelry, bags, electronics, packaged-food. Güçlü: focus-grounded-to-fixture-or-generic, distinct-structured-directions. Zayıf: Yakın kadrajda somut detay yerine form/genel odak; Compiler dilinde mekanik/meta ifade; Ayırt edici ürün detayı seçilmedi; Bütün sahnelerde aynı odak.

**Deri çanta / bags — 87/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "metallic-light-sweep",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        1
      ],
      "camera": "Locked balanced product view",
      "lighting": "A narrow soft light band crosses the visible face",
      "composition": "Full form with broad side margins",
      "motion": "Focus resolves existing surface detail",
      "pace": "Controlled light cadence",
      "focus": "structured bag silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "lighting-reveal",
      "evidenceRefs": [
        3
      ],
      "camera": "Locked close framing",
      "lighting": "A narrow soft light band crosses the visible face",
      "composition": "Close crop of the selected reflective detail",
      "motion": "Focus resolves existing surface detail",
      "pace": "Controlled light cadence",
      "focus": "front clasp"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        1
      ],
      "camera": "Locked long-lens hero view",
      "lighting": "A narrow soft light band crosses the visible face",
      "composition": "Balanced full form with clear original markings",
      "motion": "Focus resolves existing surface detail",
      "pace": "Controlled light cadence",
      "focus": "structured bag silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 408/512 karakter:

```text
Use locked balanced product view, framing the structured bag silhouette. Compose the full form with broad side margins. Light the scene with a narrow soft light band crosses the visible face. Focus resolves existing surface detail. Allow a controlled light cadence. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 2, 4 sn, 392/512 karakter:

```text
Frame the front clasp in a locked close view. Compose the close crop of the selected reflective detail. Light the scene with a narrow soft light band crosses the visible face. Focus resolves existing surface detail. Allow a controlled light cadence. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 3, 3 sn, 422/512 karakter:

```text
Use a locked long-lens hero view, framing the structured bag silhouette. Compose the balanced full form with clear original markings. Light the scene with a narrow soft light band crosses the visible face. Focus resolves existing surface detail. Allow a controlled light cadence. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

**Saat / watches — 87/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "metallic-light-sweep",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        0
      ],
      "camera": "Locked balanced product view",
      "lighting": "A narrow soft light band crosses the visible face",
      "composition": "Full form with broad side margins",
      "motion": "Focus resolves existing surface detail",
      "pace": "Controlled light cadence",
      "focus": "silver"
    },
    {
      "durationSeconds": 4,
      "purpose": "lighting-reveal",
      "evidenceRefs": [
        3
      ],
      "camera": "Locked close framing",
      "lighting": "A narrow soft light band crosses the visible face",
      "composition": "Close crop of the selected reflective detail",
      "motion": "Focus resolves existing surface detail",
      "pace": "Controlled light cadence",
      "focus": "brushed steel"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        0
      ],
      "camera": "Locked long-lens hero view",
      "lighting": "A narrow soft light band crosses the visible face",
      "composition": "Balanced full form with clear original markings",
      "motion": "Focus resolves existing surface detail",
      "pace": "Controlled light cadence",
      "focus": "silver"
    }
  ]
}
```

Sahne 1, 3 sn, 389/512 karakter:

```text
Use locked balanced product view, framing the silver. Compose the full form with broad side margins. Light the scene with a narrow soft light band crosses the visible face. Focus resolves existing surface detail. Allow a controlled light cadence. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 2, 4 sn, 394/512 karakter:

```text
Frame the brushed steel in a locked close view. Compose the close crop of the selected reflective detail. Light the scene with a narrow soft light band crosses the visible face. Focus resolves existing surface detail. Allow a controlled light cadence. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 3, 3 sn, 403/512 karakter:

```text
Use a locked long-lens hero view, framing the silver. Compose the balanced full form with clear original markings. Light the scene with a narrow soft light band crosses the visible face. Focus resolves existing surface detail. Allow a controlled light cadence. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

### hardware-reveal · 79/100

Kategori sözleşmesi: bags, footwear, eyewear, watches, cosmetics. Güçlü: focus-grounded-to-fixture-or-generic, distinct-structured-directions. Zayıf: Yakın kadrajda somut detay yerine form/genel odak; Ayırt edici ürün detayı seçilmedi; Bütün sahnelerde aynı odak; En yakın presetle aynı kaba çekim imzası.

**Deri çanta / bags — 76/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "hardware-reveal",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        1
      ],
      "camera": "Locked close framing",
      "lighting": "Directional soft light defines existing edges",
      "composition": "Tight crop of evidenced construction",
      "motion": "Focus resolves existing surface detail",
      "pace": "Crisp deliberate rhythm",
      "focus": "structured bag silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "macro-detail",
      "evidenceRefs": [
        3
      ],
      "camera": "Short lateral camera glide along the visible edge",
      "lighting": "Directional soft light defines existing edges",
      "composition": "Parallel detail view with clean margins",
      "motion": "Focus resolves existing surface detail",
      "pace": "Crisp deliberate rhythm",
      "focus": "front clasp"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        1
      ],
      "camera": "Slow pull-back to full product framing",
      "lighting": "Directional soft light defines existing edges",
      "composition": "Recognizable product with the detail in context",
      "motion": "Focus resolves existing surface detail",
      "pace": "Crisp deliberate rhythm",
      "focus": "structured bag silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 372/512 karakter:

```text
Frame the structured bag silhouette in a locked close view. Compose the tight crop of evidenced construction. Directional soft light defines existing edges. Focus resolves existing surface detail. Allow a crisp deliberate rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 2, 4 sn, 397/512 karakter:

```text
Use a short lateral camera glide along the visible edge, framing the front clasp. Compose the parallel detail view with clean margins. Directional soft light defines existing edges. Focus resolves existing surface detail. Allow a crisp deliberate rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 3, 3 sn, 406/512 karakter:

```text
Use slow pull-back to full product framing, framing the structured bag silhouette. Compose the recognizable product with the detail in context. Directional soft light defines existing edges. Focus resolves existing surface detail. Allow a crisp deliberate rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

**Saat / watches — 73/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "hardware-reveal",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        1
      ],
      "camera": "Locked close framing",
      "lighting": "Directional soft light defines existing edges",
      "composition": "Tight crop of evidenced construction",
      "motion": "Focus resolves existing surface detail",
      "pace": "Crisp deliberate rhythm",
      "focus": "round watch case"
    },
    {
      "durationSeconds": 4,
      "purpose": "macro-detail",
      "evidenceRefs": [
        0
      ],
      "camera": "Short lateral camera glide along the visible edge",
      "lighting": "Directional soft light defines existing edges",
      "composition": "Parallel detail view with clean margins",
      "motion": "Focus resolves existing surface detail",
      "pace": "Crisp deliberate rhythm",
      "focus": "silver"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        1
      ],
      "camera": "Slow pull-back to full product framing",
      "lighting": "Directional soft light defines existing edges",
      "composition": "Recognizable product with the detail in context",
      "motion": "Focus resolves existing surface detail",
      "pace": "Crisp deliberate rhythm",
      "focus": "round watch case"
    }
  ]
}
```

Sahne 1, 3 sn, 363/512 karakter:

```text
Frame the round watch case in a locked close view. Compose the tight crop of evidenced construction. Directional soft light defines existing edges. Focus resolves existing surface detail. Allow a crisp deliberate rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 2, 4 sn, 392/512 karakter:

```text
Use a short lateral camera glide along the visible edge, framing the silver. Compose the parallel detail view with clean margins. Directional soft light defines existing edges. Focus resolves existing surface detail. Allow a crisp deliberate rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 3, 3 sn, 397/512 karakter:

```text
Use slow pull-back to full product framing, framing the round watch case. Compose the recognizable product with the detail in context. Directional soft light defines existing edges. Focus resolves existing surface detail. Allow a crisp deliberate rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

### floating-accessory · 68.6/100

Kategori sözleşmesi: bags, jewelry, watches, eyewear. Güçlü: focus-grounded-to-fixture-or-generic, distinct-structured-directions. Zayıf: Yakın kadrajda somut detay yerine form/genel odak; Compiler dilinde mekanik/meta ifade; Ayırt edici ürün detayı seçilmedi; Bütün sahnelerde aynı odak; En yakın presetle aynı kaba çekim imzası.

**Deri çanta / bags — 91/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "floating-accessory",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        1
      ],
      "camera": "Slow upward camera glide in the existing view",
      "lighting": "A broad side key with gentle fill preserves the product's existing contact cues",
      "composition": "Full visible form with open vertical margins",
      "motion": "Focus resolves existing surface detail",
      "pace": "Poised floating rhythm",
      "focus": "structured bag silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "controlled-motion",
      "evidenceRefs": [
        2
      ],
      "camera": "Short lateral close camera glide",
      "lighting": "A broad side key with gentle fill preserves the product's existing contact cues",
      "composition": "Close crop of the selected surface feature",
      "motion": "Focus resolves existing surface detail",
      "pace": "Poised floating rhythm",
      "focus": "arched front handle"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        1
      ],
      "camera": "Locked wide hero frame",
      "lighting": "A broad side key with gentle fill preserves the product's existing contact cues",
      "composition": "Airy balanced silhouette composition",
      "motion": "Focus resolves existing surface detail",
      "pace": "Poised floating rhythm",
      "focus": "structured bag silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 445/512 karakter:

```text
Use a slow upward camera glide in the existing view, framing the structured bag silhouette. Compose the full visible form with open vertical margins. A broad side key with gentle fill preserves the product's existing contact cues. Focus resolves existing surface detail. Allow a poised floating rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 2, 4 sn, 424/512 karakter:

```text
Use a short lateral close camera glide, framing the arched front handle. Compose the close crop of the selected surface feature. A broad side key with gentle fill preserves the product's existing contact cues. Focus resolves existing surface detail. Allow a poised floating rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 3, 3 sn, 414/512 karakter:

```text
Use a locked wide hero frame, framing the structured bag silhouette. Compose the airy balanced silhouette composition. A broad side key with gentle fill preserves the product's existing contact cues. Focus resolves existing surface detail. Allow a poised floating rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

**Saat / watches — 69/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "floating-accessory",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        0
      ],
      "camera": "Slow upward camera glide in the existing view",
      "lighting": "A broad side key with gentle fill preserves the product's existing contact cues",
      "composition": "Full visible form with open vertical margins",
      "motion": "Focus resolves existing surface detail",
      "pace": "Poised floating rhythm",
      "focus": "silver"
    },
    {
      "durationSeconds": 4,
      "purpose": "controlled-motion",
      "evidenceRefs": [],
      "camera": "Short lateral close camera glide",
      "lighting": "A broad side key with gentle fill preserves the product's existing contact cues",
      "composition": "Wider view of the source-visible product form; no unverified detail is enlarged",
      "motion": "Focus resolves existing surface detail",
      "pace": "Poised floating rhythm",
      "focus": "Source-visible surface detail"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        0
      ],
      "camera": "Locked wide hero frame",
      "lighting": "A broad side key with gentle fill preserves the product's existing contact cues",
      "composition": "Airy balanced silhouette composition",
      "motion": "Focus resolves existing surface detail",
      "pace": "Poised floating rhythm",
      "focus": "silver"
    }
  ]
}
```

Sahne 1, 3 sn, 426/512 karakter:

```text
Use a slow upward camera glide in the existing view, framing the silver. Compose the full visible form with open vertical margins. A broad side key with gentle fill preserves the product's existing contact cues. Focus resolves existing surface detail. Allow a poised floating rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 2, 4 sn, 464/512 karakter:

```text
Use a short lateral close camera glide, framing the visible surface detail. Compose the wider view of the source-visible product form; no unverified detail is enlarged. A broad side key with gentle fill preserves the product's existing contact cues. Focus resolves existing surface detail. Allow a poised floating rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 3, 3 sn, 395/512 karakter:

```text
Use a locked wide hero frame, framing the silver. Compose the airy balanced silhouette composition. A broad side key with gentle fill preserves the product's existing contact cues. Focus resolves existing surface detail. Allow a poised floating rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

### sneaker-hero · 58.6/100

Kategori sözleşmesi: footwear. Güçlü: focus-grounded-to-fixture-or-generic, distinct-structured-directions. Zayıf: Yakın kadrajda somut detay yerine form/genel odak; Ayırt edici ürün detayı seçilmedi; Bütün sahnelerde aynı odak; En yakın presetle aynı kaba çekim imzası.

**Ayakkabı / footwear — 64/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "sneaker-hero",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        2
      ],
      "camera": "Short lateral camera glide at source level",
      "lighting": "A traveling side highlight traces only the evidenced contour breaks",
      "composition": "Full visible profile with forward negative space",
      "motion": "Focus resolves existing surface detail",
      "pace": "Crisp athletic rhythm",
      "focus": "low shoe silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "macro-detail",
      "evidenceRefs": [
        2
      ],
      "camera": "Long-lens locked close framing",
      "lighting": "A traveling side highlight traces only the evidenced contour breaks",
      "composition": "Diagonal crop of the selected visible detail",
      "motion": "Focus resolves existing surface detail",
      "pace": "Crisp athletic rhythm",
      "focus": "low shoe silhouette"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        2
      ],
      "camera": "Slow pull-back to a wide hero view",
      "lighting": "A traveling side highlight traces only the evidenced contour breaks",
      "composition": "Complete product with an assertive graphic balance",
      "motion": "Focus resolves existing surface detail",
      "pace": "Crisp athletic rhythm",
      "focus": "low shoe silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 427/512 karakter:

```text
Use a short lateral camera glide at source level, framing the low shoe silhouette. Compose the full visible profile with forward negative space. A traveling side highlight traces only the evidenced contour breaks. Focus resolves existing surface detail. Allow a crisp athletic rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 2, 4 sn, 409/512 karakter:

```text
Use long-lens locked close framing, framing the low shoe silhouette. Compose the diagonal crop of the selected visible detail. A traveling side highlight traces only the evidenced contour breaks. Focus resolves existing surface detail. Allow a crisp athletic rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 3, 3 sn, 421/512 karakter:

```text
Use a slow pull-back to a wide hero view, framing the low shoe silhouette. Compose the complete product with an assertive graphic balance. A traveling side highlight traces only the evidenced contour breaks. Focus resolves existing surface detail. Allow a crisp athletic rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

**Deri bot / footwear — 64/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "sneaker-hero",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        2
      ],
      "camera": "Short lateral camera glide at source level",
      "lighting": "A traveling side highlight traces only the evidenced contour breaks",
      "composition": "Full visible profile with forward negative space",
      "motion": "Focus resolves existing surface detail",
      "pace": "Crisp athletic rhythm",
      "focus": "ankle boot silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "macro-detail",
      "evidenceRefs": [
        2
      ],
      "camera": "Long-lens locked close framing",
      "lighting": "A traveling side highlight traces only the evidenced contour breaks",
      "composition": "Diagonal crop of the selected visible detail",
      "motion": "Focus resolves existing surface detail",
      "pace": "Crisp athletic rhythm",
      "focus": "ankle boot silhouette"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        2
      ],
      "camera": "Slow pull-back to a wide hero view",
      "lighting": "A traveling side highlight traces only the evidenced contour breaks",
      "composition": "Complete product with an assertive graphic balance",
      "motion": "Focus resolves existing surface detail",
      "pace": "Crisp athletic rhythm",
      "focus": "ankle boot silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 429/512 karakter:

```text
Use a short lateral camera glide at source level, framing the ankle boot silhouette. Compose the full visible profile with forward negative space. A traveling side highlight traces only the evidenced contour breaks. Focus resolves existing surface detail. Allow a crisp athletic rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 2, 4 sn, 411/512 karakter:

```text
Use long-lens locked close framing, framing the ankle boot silhouette. Compose the diagonal crop of the selected visible detail. A traveling side highlight traces only the evidenced contour breaks. Focus resolves existing surface detail. Allow a crisp athletic rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 3, 3 sn, 423/512 karakter:

```text
Use a slow pull-back to a wide hero view, framing the ankle boot silhouette. Compose the complete product with an assertive graphic balance. A traveling side highlight traces only the evidenced contour breaks. Focus resolves existing surface detail. Allow a crisp athletic rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

### upholstery-macro · 81.3/100

Kategori sözleşmesi: furniture. Güçlü: focus-grounded-to-fixture-or-generic, distinct-structured-directions. Zayıf: Compiler dilinde mekanik/meta ifade; Bütün sahnelerde aynı odak; En yakın presetle aynı kaba çekim imzası.

**Mobilya / furniture — 87/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "upholstery-macro",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        1
      ],
      "camera": "Locked wide product framing",
      "lighting": "Broad overhead soft light gives upholstery a gradual falloff and grounded contact shadow",
      "composition": "Complete visible form with room to read scale",
      "motion": "Focus resolves existing surface detail",
      "pace": "Spacious unhurried rhythm",
      "focus": "wide chair outline"
    },
    {
      "durationSeconds": 4,
      "purpose": "material-study",
      "evidenceRefs": [
        0
      ],
      "camera": "Slow pan left across the visible surface",
      "lighting": "Broad overhead soft light gives upholstery a gradual falloff and grounded contact shadow",
      "composition": "Close crop of an evidenced surface junction",
      "motion": "Focus resolves existing surface detail",
      "pace": "Spacious unhurried rhythm",
      "focus": "visible edge seam"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        1
      ],
      "camera": "Slow pull-back to wide hero framing",
      "lighting": "Broad overhead soft light gives upholstery a gradual falloff and grounded contact shadow",
      "composition": "Balanced full form with natural contact shadow",
      "motion": "Focus resolves existing surface detail",
      "pace": "Spacious unhurried rhythm",
      "focus": "wide chair outline"
    }
  ]
}
```

Sahne 1, 3 sn, 418/512 karakter:

```text
Use locked wide product framing, framing the wide chair outline. Compose the complete visible form with room to read scale. Light the scene with broad overhead soft light gives upholstery a gradual falloff and grounded contact shadow. Focus resolves existing surface detail. Allow a spacious unhurried rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 2, 4 sn, 430/512 karakter:

```text
Use a slow pan left across the visible surface, framing the visible edge seam. Compose the close crop of an evidenced surface junction. Light the scene with broad overhead soft light gives upholstery a gradual falloff and grounded contact shadow. Focus resolves existing surface detail. Allow a spacious unhurried rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 3, 3 sn, 427/512 karakter:

```text
Use slow pull-back to wide hero framing, framing the wide chair outline. Compose the balanced full form with natural contact shadow. Light the scene with broad overhead soft light gives upholstery a gradual falloff and grounded contact shadow. Focus resolves existing surface detail. Allow a spacious unhurried rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

**Kanepe / furniture — 87/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "upholstery-macro",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        1
      ],
      "camera": "Locked wide product framing",
      "lighting": "Broad overhead soft light gives upholstery a gradual falloff and grounded contact shadow",
      "composition": "Complete visible form with room to read scale",
      "motion": "Focus resolves existing surface detail",
      "pace": "Spacious unhurried rhythm",
      "focus": "woven surface relief"
    },
    {
      "durationSeconds": 4,
      "purpose": "material-study",
      "evidenceRefs": [
        0
      ],
      "camera": "Slow pan left across the visible surface",
      "lighting": "Broad overhead soft light gives upholstery a gradual falloff and grounded contact shadow",
      "composition": "Close crop of an evidenced surface junction",
      "motion": "Focus resolves existing surface detail",
      "pace": "Spacious unhurried rhythm",
      "focus": "visible panel junction"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        1
      ],
      "camera": "Slow pull-back to wide hero framing",
      "lighting": "Broad overhead soft light gives upholstery a gradual falloff and grounded contact shadow",
      "composition": "Balanced full form with natural contact shadow",
      "motion": "Focus resolves existing surface detail",
      "pace": "Spacious unhurried rhythm",
      "focus": "woven surface relief"
    }
  ]
}
```

Sahne 1, 3 sn, 420/512 karakter:

```text
Use locked wide product framing, framing the woven surface relief. Compose the complete visible form with room to read scale. Light the scene with broad overhead soft light gives upholstery a gradual falloff and grounded contact shadow. Focus resolves existing surface detail. Allow a spacious unhurried rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 2, 4 sn, 435/512 karakter:

```text
Use a slow pan left across the visible surface, framing the visible panel junction. Compose the close crop of an evidenced surface junction. Light the scene with broad overhead soft light gives upholstery a gradual falloff and grounded contact shadow. Focus resolves existing surface detail. Allow a spacious unhurried rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 3, 3 sn, 429/512 karakter:

```text
Use slow pull-back to wide hero framing, framing the woven surface relief. Compose the balanced full form with natural contact shadow. Light the scene with broad overhead soft light gives upholstery a gradual falloff and grounded contact shadow. Focus resolves existing surface detail. Allow a spacious unhurried rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

### culinary-texture · 84.1/100

Kategori sözleşmesi: food. Güçlü: focus-grounded-to-fixture-or-generic, distinct-structured-directions. Zayıf: Compiler dilinde mekanik/meta ifade; Bütün sahnelerde aynı odak; En yakın presetle aynı kaba çekim imzası.

**Yiyecek / food — 93/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "culinary-texture",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        1
      ],
      "camera": "Locked medium product view",
      "lighting": "Soft top-side light brings out the finished food surface while holding its original color",
      "composition": "Existing presentation with clean margins",
      "motion": "Focus resolves existing surface detail",
      "pace": "Patient sensory rhythm",
      "focus": "round food silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "material-study",
      "evidenceRefs": [
        0
      ],
      "camera": "Slow horizontal camera glide across the visible face",
      "lighting": "Soft top-side light brings out the finished food surface while holding its original color",
      "composition": "Source-resolved crop of existing surface layers",
      "motion": "Focus resolves existing surface detail",
      "pace": "Patient sensory rhythm",
      "focus": "visible layered surface"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        1
      ],
      "camera": "Slow pull-back to a balanced presentation",
      "lighting": "Soft top-side light brings out the finished food surface while holding its original color",
      "composition": "Full visible form in its original arrangement",
      "motion": "Focus resolves existing surface detail",
      "pace": "Patient sensory rhythm",
      "focus": "round food silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 413/512 karakter:

```text
Use locked medium product view, framing the round food silhouette. Compose the existing presentation with clean margins. Light the scene with soft top-side light brings out the finished food surface while holding its original color. Focus resolves existing surface detail. Allow a patient sensory rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 2, 4 sn, 450/512 karakter:

```text
Use a slow horizontal camera glide across the visible face, framing the visible layered surface. Compose the source-resolved crop of existing surface layers. Light the scene with soft top-side light brings out the finished food surface while holding its original color. Focus resolves existing surface detail. Allow a patient sensory rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 3, 3 sn, 435/512 karakter:

```text
Use a slow pull-back to a balanced presentation, framing the round food silhouette. Compose the full visible form in its original arrangement. Light the scene with soft top-side light brings out the finished food surface while holding its original color. Focus resolves existing surface detail. Allow a patient sensory rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

**Ekmek / food — 93/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "culinary-texture",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        2
      ],
      "camera": "Locked medium product view",
      "lighting": "Soft top-side light brings out the finished food surface while holding its original color",
      "composition": "Existing presentation with clean margins",
      "motion": "Focus resolves existing surface detail",
      "pace": "Patient sensory rhythm",
      "focus": "oval bread silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "material-study",
      "evidenceRefs": [
        0
      ],
      "camera": "Slow horizontal camera glide across the visible face",
      "lighting": "Soft top-side light brings out the finished food surface while holding its original color",
      "composition": "Source-resolved crop of existing surface layers",
      "motion": "Focus resolves existing surface detail",
      "pace": "Patient sensory rhythm",
      "focus": "coarse crumb surface"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        2
      ],
      "camera": "Slow pull-back to a balanced presentation",
      "lighting": "Soft top-side light brings out the finished food surface while holding its original color",
      "composition": "Full visible form in its original arrangement",
      "motion": "Focus resolves existing surface detail",
      "pace": "Patient sensory rhythm",
      "focus": "oval bread silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 413/512 karakter:

```text
Use locked medium product view, framing the oval bread silhouette. Compose the existing presentation with clean margins. Light the scene with soft top-side light brings out the finished food surface while holding its original color. Focus resolves existing surface detail. Allow a patient sensory rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 2, 4 sn, 447/512 karakter:

```text
Use a slow horizontal camera glide across the visible face, framing the coarse crumb surface. Compose the source-resolved crop of existing surface layers. Light the scene with soft top-side light brings out the finished food surface while holding its original color. Focus resolves existing surface detail. Allow a patient sensory rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 3, 3 sn, 435/512 karakter:

```text
Use a slow pull-back to a balanced presentation, framing the oval bread silhouette. Compose the full visible form in its original arrangement. Light the scene with soft top-side light brings out the finished food surface while holding its original color. Focus resolves existing surface detail. Allow a patient sensory rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

### optical-lines · 76.8/100

Kategori sözleşmesi: eyewear, electronics. Güçlü: focus-grounded-to-fixture-or-generic, distinct-structured-directions. Zayıf: Yakın kadrajda somut detay yerine form/genel odak; Ayırt edici ürün detayı seçilmedi; Bütün sahnelerde aynı odak.

**Gözlük / eyewear — 82/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "optical-lines",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        2
      ],
      "camera": "Locked off-center close framing",
      "lighting": "Broad soft edge light preserves surface appearance",
      "composition": "Asymmetric crop of an evidenced contour",
      "motion": "Focus resolves existing surface detail",
      "pace": "Clean graphic rhythm",
      "focus": "curved frame silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "controlled-motion",
      "evidenceRefs": [
        0
      ],
      "camera": "Macro pan right across the visible face",
      "lighting": "Broad soft edge light preserves surface appearance",
      "composition": "Horizontal composition retaining known edges",
      "motion": "Focus resolves existing surface detail",
      "pace": "Clean graphic rhythm",
      "focus": "visible frame edge"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        2
      ],
      "camera": "Locked symmetrical hero framing",
      "lighting": "Broad soft edge light preserves surface appearance",
      "composition": "Clean centered full product outline",
      "motion": "Focus resolves existing surface detail",
      "pace": "Clean graphic rhythm",
      "focus": "curved frame silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 357/512 karakter:

```text
Use locked off-center close framing, framing the curved frame silhouette. Compose the asymmetric crop of an evidenced contour. Broad soft edge light preserves surface appearance. Focus resolves existing surface detail. Allow a clean graphic rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 2, 4 sn, 367/512 karakter:

```text
Use a macro pan right across the visible face, framing the visible frame edge. Compose the horizontal composition retaining known edges. Broad soft edge light preserves surface appearance. Focus resolves existing surface detail. Allow a clean graphic rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 3, 3 sn, 353/512 karakter:

```text
Use locked symmetrical hero framing, framing the curved frame silhouette. Compose the clean centered full product outline. Broad soft edge light preserves surface appearance. Focus resolves existing surface detail. Allow a clean graphic rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

**Elektronik / electronics — 82/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "optical-lines",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        2
      ],
      "camera": "Locked off-center close framing",
      "lighting": "Broad soft edge light preserves surface appearance",
      "composition": "Asymmetric crop of an evidenced contour",
      "motion": "Focus resolves existing surface detail",
      "pace": "Clean graphic rhythm",
      "focus": "curved housing silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "controlled-motion",
      "evidenceRefs": [
        1
      ],
      "camera": "Macro pan right across the visible face",
      "lighting": "Broad soft edge light preserves surface appearance",
      "composition": "Horizontal composition retaining known edges",
      "motion": "Focus resolves existing surface detail",
      "pace": "Clean graphic rhythm",
      "focus": "housing edge detail"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        2
      ],
      "camera": "Locked symmetrical hero framing",
      "lighting": "Broad soft edge light preserves surface appearance",
      "composition": "Clean centered full product outline",
      "motion": "Focus resolves existing surface detail",
      "pace": "Clean graphic rhythm",
      "focus": "curved housing silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 359/512 karakter:

```text
Use locked off-center close framing, framing the curved housing silhouette. Compose the asymmetric crop of an evidenced contour. Broad soft edge light preserves surface appearance. Focus resolves existing surface detail. Allow a clean graphic rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 2, 4 sn, 368/512 karakter:

```text
Use a macro pan right across the visible face, framing the housing edge detail. Compose the horizontal composition retaining known edges. Broad soft edge light preserves surface appearance. Focus resolves existing surface detail. Allow a clean graphic rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 3, 3 sn, 355/512 karakter:

```text
Use locked symmetrical hero framing, framing the curved housing silhouette. Compose the clean centered full product outline. Broad soft edge light preserves surface appearance. Focus resolves existing surface detail. Allow a clean graphic rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

### craftsmanship-study · 81.6/100

Kategori sözleşmesi: evrensel. Güçlü: focus-grounded-to-fixture-or-generic, distinct-structured-directions. Zayıf: Yakın kadrajda somut detay yerine form/genel odak; Compiler dilinde mekanik/meta ifade; Ayırt edici ürün detayı seçilmedi; Bütün sahnelerde aynı odak; En yakın presetle aynı kaba çekim imzası.

**Parlak siyah kemerli ceket / apparel — 77/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "craftsmanship-study",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        5
      ],
      "camera": "Locked close framing",
      "lighting": "Soft directional light defines existing construction",
      "composition": "Close crop of the chosen existing workmanship",
      "motion": "Focus resolves existing surface detail",
      "pace": "Deliberate craft rhythm",
      "focus": "belted jacket silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "material-study",
      "evidenceRefs": [
        0
      ],
      "camera": "Long-lens vertical camera tilt over the visible face",
      "lighting": "Soft directional light defines existing construction",
      "composition": "Parallel view of evidenced construction lines",
      "motion": "Focus resolves existing surface detail",
      "pace": "Deliberate craft rhythm",
      "focus": "two visible front buttons"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        5
      ],
      "camera": "Slow pull-back to the complete product",
      "lighting": "Soft directional light defines existing construction",
      "composition": "Full visible product with quiet negative space",
      "motion": "Focus resolves existing surface detail",
      "pace": "Deliberate craft rhythm",
      "focus": "belted jacket silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 387/512 karakter:

```text
Frame the belted jacket silhouette in a locked close view. Compose the close crop of the chosen existing workmanship. Soft directional light defines existing construction. Focus resolves existing surface detail. Allow a deliberate craft rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 2, 4 sn, 427/512 karakter:

```text
Use a long-lens vertical camera tilt over the visible face, framing the two visible front buttons. Compose the parallel view of evidenced construction lines. Soft directional light defines existing construction. Focus resolves existing surface detail. Allow a deliberate craft rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 3, 3 sn, 413/512 karakter:

```text
Use a slow pull-back to the complete product, framing the belted jacket silhouette. Compose the full visible product with quiet negative space. Soft directional light defines existing construction. Focus resolves existing surface detail. Allow a deliberate craft rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

**Kot / apparel — 77/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "craftsmanship-study",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        2
      ],
      "camera": "Locked close framing",
      "lighting": "Soft directional light defines existing construction",
      "composition": "Close crop of the chosen existing workmanship",
      "motion": "Focus resolves existing surface detail",
      "pace": "Deliberate craft rhythm",
      "focus": "shorts silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "material-study",
      "evidenceRefs": [
        0
      ],
      "camera": "Long-lens vertical camera tilt over the visible face",
      "lighting": "Soft directional light defines existing construction",
      "composition": "Parallel view of evidenced construction lines",
      "motion": "Focus resolves existing surface detail",
      "pace": "Deliberate craft rhythm",
      "focus": "visible hem stitching"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        2
      ],
      "camera": "Slow pull-back to the complete product",
      "lighting": "Soft directional light defines existing construction",
      "composition": "Full visible product with quiet negative space",
      "motion": "Focus resolves existing surface detail",
      "pace": "Deliberate craft rhythm",
      "focus": "shorts silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 346/512 karakter:

```text
Frame the shorts silhouette in a locked close view. Compose the close crop of the chosen existing workmanship. Soft directional light defines existing construction. Focus resolves existing surface detail. Allow a deliberate craft rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 2, 4 sn, 389/512 karakter:

```text
Use a long-lens vertical camera tilt over the visible face, framing the visible hem stitching. Compose the parallel view of evidenced construction lines. Soft directional light defines existing construction. Focus resolves existing surface detail. Allow a deliberate craft rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 3, 3 sn, 372/512 karakter:

```text
Use a slow pull-back to the complete product, framing the shorts silhouette. Compose the full visible product with quiet negative space. Soft directional light defines existing construction. Focus resolves existing surface detail. Allow a deliberate craft rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

### window-display · 71.1/100

Kategori sözleşmesi: apparel, bags, headwear, jewelry, furniture. Güçlü: focus-grounded-to-fixture-or-generic, distinct-structured-directions. Zayıf: Yakın kadrajda somut detay yerine form/genel odak; Compiler dilinde mekanik/meta ifade; Ayırt edici ürün detayı seçilmedi; Bütün sahnelerde aynı odak.

**Parlak siyah kemerli ceket / apparel — 71/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "window-display",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        5
      ],
      "camera": "Slow long-lens push-in",
      "lighting": "A focused overhead accent isolates the product like a retail display",
      "composition": "Full product with generous display-like margins",
      "motion": "Focus resolves existing surface detail",
      "pace": "Elegant retail rhythm",
      "focus": "belted jacket silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "macro-detail",
      "evidenceRefs": [
        5
      ],
      "camera": "Short lateral close camera glide",
      "lighting": "A focused overhead accent isolates the product like a retail display",
      "composition": "Close crop of the chosen original design feature",
      "motion": "Focus resolves existing surface detail",
      "pace": "Elegant retail rhythm",
      "focus": "belted jacket silhouette"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        5
      ],
      "camera": "Slow pull-back to a spacious hero view",
      "lighting": "A focused overhead accent isolates the product like a retail display",
      "composition": "Wide balanced composition in the source setting",
      "motion": "Focus resolves existing surface detail",
      "pace": "Elegant retail rhythm",
      "focus": "belted jacket silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 433/512 karakter:

```text
Use a slow long-lens push-in, framing the belted jacket silhouette. Compose the full product with generous display-like margins. Light the scene with a focused overhead accent isolates the product like a retail display. Focus resolves existing surface detail. Allow a elegant retail rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 2, 4 sn, 444/512 karakter:

```text
Use a short lateral close camera glide, framing the belted jacket silhouette. Compose the close crop of the chosen original design feature. Light the scene with a focused overhead accent isolates the product like a retail display. Focus resolves existing surface detail. Allow a elegant retail rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

Sahne 3, 3 sn, 449/512 karakter:

```text
Use a slow pull-back to a spacious hero view, framing the belted jacket silhouette. Compose the wide balanced composition in the source setting. Light the scene with a focused overhead accent isolates the product like a retail display. Focus resolves existing surface detail. Allow a elegant retail rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces.
```

**Kot / apparel — 71/100, kategori uyumu true.**

```json
{
  "version": "video-director-3.1-library-v2",
  "presetId": "window-display",
  "presetVersion": 1,
  "shotMode": "multi",
  "origin": "fallback",
  "intent": "Preset direction selected from verified product evidence.",
  "intentContract": {
    "camera": "auto",
    "focusRequested": false,
    "focusEvidenceId": null,
    "focusPosition": "any",
    "sequence": "preset",
    "safeAdjustment": "none"
  },
  "summary": "Preset direction adapted to the explicit camera and focus request using only verified product evidence.",
  "shots": [
    {
      "durationSeconds": 3,
      "purpose": "hero-reveal",
      "evidenceRefs": [
        2
      ],
      "camera": "Slow long-lens push-in",
      "lighting": "A focused overhead accent isolates the product like a retail display",
      "composition": "Full product with generous display-like margins",
      "motion": "Focus resolves existing surface detail",
      "pace": "Elegant retail rhythm",
      "focus": "shorts silhouette"
    },
    {
      "durationSeconds": 4,
      "purpose": "macro-detail",
      "evidenceRefs": [
        2
      ],
      "camera": "Short lateral close camera glide",
      "lighting": "A focused overhead accent isolates the product like a retail display",
      "composition": "Close crop of the chosen original design feature",
      "motion": "Focus resolves existing surface detail",
      "pace": "Elegant retail rhythm",
      "focus": "shorts silhouette"
    },
    {
      "durationSeconds": 3,
      "purpose": "final-hero",
      "evidenceRefs": [
        2
      ],
      "camera": "Slow pull-back to a spacious hero view",
      "lighting": "A focused overhead accent isolates the product like a retail display",
      "composition": "Wide balanced composition in the source setting",
      "motion": "Focus resolves existing surface detail",
      "pace": "Elegant retail rhythm",
      "focus": "shorts silhouette"
    }
  ]
}
```

Sahne 1, 3 sn, 392/512 karakter:

```text
Use a slow long-lens push-in, framing the shorts silhouette. Compose the full product with generous display-like margins. Light the scene with a focused overhead accent isolates the product like a retail display. Focus resolves existing surface detail. Allow a elegant retail rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 2, 4 sn, 403/512 karakter:

```text
Use a short lateral close camera glide, framing the shorts silhouette. Compose the close crop of the chosen original design feature. Light the scene with a focused overhead accent isolates the product like a retail display. Focus resolves existing surface detail. Allow a elegant retail rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

Sahne 3, 3 sn, 408/512 karakter:

```text
Use a slow pull-back to a spacious hero view, framing the shorts silhouette. Compose the wide balanced composition in the source setting. Light the scene with a focused overhead accent isolates the product like a retail display. Focus resolves existing surface detail. Allow a elegant retail rhythm. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

## İlk gerçek Kling denemesi için üç aday

1. luxury-fashion-film: 86.7/100, 0 teknik hata. Yalnız manuel incelenmiş boş/temel istekle, kaynakta yeterli detay varsa kontrollü başlangıç adayı.
2. macro-detail-reveal: 85/100, 0 teknik hata. Yalnız manuel incelenmiş boş/temel istekle, kaynakta yeterli detay varsa kontrollü başlangıç adayı.
3. glass-reflection: 84.4/100, 0 teknik hata. Yalnız manuel incelenmiş boş/temel istekle, kaynakta yeterli detay varsa kontrollü başlangıç adayı.

Bu liste üretim izni değildir. Dolu yaratıcı istekleri yerine getirmeyen fallback üzerine otomatik ücretli gönderim önerilmez. Hiçbir çağrı başlatılmadı.

## Ölçülemeyenler ve gerçek riskler

Piksel düzeyinde gerçek ürün doğruluğu, logo/yazı okunabilirliği, temporal tutarlılık, taş/kenar bozulması, ışık fiziği, kamera ivmesi, montaj estetiği, insan algısı, gerçek provider erişimi/fiyatı ve OpenAI'nin TR/EN anlama kalitesi ölçülmedi. Standard/Pro bu benchmark'ta aynı metni kullanır; gerçek görüntü farkı çıkarılamaz. 5 saniyede yoğunluk kapısı yalnız sahne sayısı, pozitif süre ve kamera eksen sayısını kontrol eder; fiziksel hız veya geçiş süresini ispatlamaz. Risk açıklamaları UI kaynak bağlantısı ve mesajlarından kontrol edilir; bu görevde tarayıcı çalıştırılmadı.

Bu kıyas üretim kodunda gerçek davranış değişikliklerinden sonra çalıştırıldı. Benchmark senaryosu, puan ağırlıkları ve failure eşikleri değiştirilmedi.

## Rubrik yanlılıkları ve doğrulama kaydı

Bu rubrik detay odaklı stilleri ödüllendirebilir. Sadece hero kadrajı seçilmesi tek başına yanlış yönetmenlik değildir; ayırt edici özellik fırsatı olarak kaydedilir, kesin başarısızlık sayılmaz. Fikstür hedefleri yalnız identityCriticalAttributes değil, elle işaretlenmiş mevcut dikey detayları da içerir (ör. çanta kilidi ve kadran işaretleri). Puanlar bu kürasyona duyarlıdır.

Uydurma detay kapısı kanıt referansları ve mevcut sınırlı ürün iddiası sözlüğüne dayanır. Bütün serbest metin iddialarını kapsayan bağımsız bir görsel/semantik doğrulayıcı değildir. On kalibrasyon örneği bu sınırı ortadan kaldırmaz. Tablo bileşenleri ayrı yuvarlandığından toplamda 0.1 puan fark olabilir.

Doğrulama testleri, TypeScript ve ESLint sonucu son çalıştırmada raporlanmalıdır. Ücretli çağrı, video üretimi, yeni dependency, commit/push yok.

Eklenen dosyalar: scripts/preset-benchmark/{dataset,analysis,benchmark,probes,report}.ts; scripts/run-video-preset-quality-benchmark.ts; tests/video-preset-quality-benchmark.test.ts; docs/video-preset-quality-benchmark.{md,json}.
