# Video Director 3.1 — Benchmark Sonrası Hedefli İyileştirme

Benchmark: aynı 20 fixture, 7.584 vaka, 1.896 karşı-olgusal grup ve aynı 100 puan rubric. Ağırlıklar, eşikler ve ürün senaryoları değiştirilmedi. OpenAI/Kling çağrısı ve video üretimi yapılmadı.

## Önce / sonra

| Ölçüm | Önce | Sonra | Fark |
|---|---:|---:|---:|
| Uygulanmayan dolu kullanıcı isteği | 4.732 | 0 | −4.732 |
| İstek değiştiği halde planı değişmeyen grup | 1.896 | 0 | −1.896 |
| Planı değiştiren grup | 0 / 1.896 | 1.896 / 1.896 | +1.896 |
| Single-shot yakın kadrajda genel odak | 2.320 | 832 | −1.488 (−64,1%) |
| Benzer preset imzası, tüm istek senaryoları | 336 | 482 | +146 |
| Benzer preset imzası, boş istek / preset stratejisi | 84 | 80 | −4 |
| Kesin teknik/güvenlik başarısızlığı | 0 | 0 | 0 |
| Senaryo planları saklanmış | 1.896 ortak kayıt | 7.584 istek başına kayıt | Referans doğruluğu düzeltildi |

Toplam imza sayısındaki artış saklanmıyor. Yeni fallback aynı açık hareketi bütün presetlerde uyguluyor; bu, özellikle “detaydan ürüne açıl” isteğinde bazı plan eksenlerini ortaklaştırıyor. Boş istekle ölçülen preset stratejisi imza çakışması 84’ten 80’e indi. Bu iki ölçüm ayrı okunmalı.

## Preset puanları

| Preset | Önce | Sonra | Fark |
|---|---:|---:|---:|
| luxury-fashion-film | 75,4 | 86,7 | +11,3 |
| macro-detail-reveal | 77,8 | 85,0 | +7,2 |
| minimal-studio | 71,3 | 83,7 | +12,4 |
| floating-fashion | 54,1 | 69,1 | +15,0 |
| precision-macro | 68,5 | 84,4 | +15,9 |
| glass-reflection | 63,1 | 84,4 | +21,3 |
| product-spotlight | 55,5 | 76,2 | +20,7 |
| elegant-orbit | 64,0 | 74,9 | +10,9 |
| cinematic-hero | 55,8 | 70,5 | +14,7 |
| material-detail | 63,9 | 81,4 | +17,5 |
| macro-stitching | 64,7 | 83,2 | +18,5 |
| fabric-motion | 62,1 | 77,3 | +15,2 |
| label-reveal | 59,6 | 81,9 | +22,3 |
| dramatic-backlight | 66,7 | 77,8 | +11,1 |
| cinematic-dial | 63,8 | 82,5 | +18,7 |
| metallic-light-sweep | 56,3 | 78,8 | +22,5 |
| hardware-reveal | 65,3 | 79,0 | +13,7 |
| floating-accessory | 56,0 | 68,6 | +12,6 |
| sneaker-hero | 44,8 | 58,6 | +13,8 |
| upholstery-macro | 58,0 | 81,3 | +23,3 |
| culinary-texture | 64,2 | 84,1 | +19,9 |
| optical-lines | 64,3 | 76,8 | +12,5 |
| craftsmanship-study | 67,6 | 81,6 | +14,0 |
| window-display | 56,2 | 71,1 | +14,9 |

Her preset puanı yükseldi. En güçlü son beş: Luxury Fashion Film, Macro Detail Reveal, Glass Reflection, Precision Macro ve Culinary Texture. En fazla iyileşenler: Upholstery Macro (+23,3), Metallic Light Sweep (+22,5), Label Reveal (+22,3), Glass Reflection (+21,3) ve Product Spotlight (+20,7). Sneaker Hero 13,8 puan arttı ancak 58,6 ile en düşük kaldı.

## Neler değişti

- Fallback, TR/EN açık kamera hareketlerini, mevcut kanıta uyan detay odağını ve uygulanabilir çekim sırasını yapılandırılmış `intentContract` üzerinden plana uygular. `static`, yaklaşma, uzaklaşma, sağ/sol pan ve yönsüz yanal kayma desteklenir.
- Çok sahneli “detaydan tam ürüne” isteği başlangıç yakın kadrajı, kontrollü yaklaşmayı ve final açılmasını belirler. Tek sahnede bu istek kesintisiz pull-back olarak yorumlanır.
- 360/arka yüz gibi kanıt dışı istekler, görünür yüzeyde kamera hareketine çevrilir; plan özeti bunu açıklar. İstenen detay profilde yoksa daha geniş güvenli kadraj kullanılır ve gerekçe özette görünür.
- OpenAI Structured Output şemasına aynı niyet sözleşmesi eklendi. Sunucu, kamera/odak/sıra uygulamasını planı kabul etmeden doğrular; uyumsuz plan mevcut fallback’e düşer. Yeni ücretli çağrı eklenmedi.
- Single-shot makro presetleri kanıtlanmış ürün ayrıntısını seçer; kanıt yoksa yakın detay uydurmak yerine geniş ürün kadrajı seçer.
- Benchmark vaka planları artık her kullanıcı isteği için ayrı saklanıyor; her case’in plan hash’i ile saklanan planı eşleşiyor. Eski tabloda farklı istekler tek plan kaydını eziyordu.
- Yakın preset eşleşmelerinde kamera perspektifi, ışık işlevi ve kadraj düzeni farkları güçlendirildi. Üç legacy preset ID’si ve sürümleri korundu; plan sürümü eski imzalı planları geçersiz kılacak şekilde artırıldı.

## Sınırlamalar

Benchmark fallback planlarını ölçer; OpenAI modelinin gerçek Türkçe/İngilizce yorum başarısını ölçmez. AI sözleşmesi bozulma probe’unda beklenen şekilde reddedilir, fakat canlı modeldeki başarı oranı için ücretli çağrı gerekir ve bu yapılmadı.

482 toplam yakın preset vakası, açık kullanıcı hareketinin farklı presetleri aynı kamera/kadraj düzenine yaklaştırabildiğini gösteriyor. Boş istek preset imza çakışması azalsa da ürün ve niyete göre yaratıcı ayrışma hâlâ manuel gözden geçirilmeli. Sabit ölçütler gerçek sinematik estetiği kesin puanlayamaz; piksel doğruluğu, temporal tutarlılık, ışık fiziği ve Kling’in yönergeyi uygulama kalitesi ölçülmedi.

İlk gerçek üretim adayları çevrimdışı sıralamada Luxury Fashion Film, Macro Detail Reveal ve Glass Reflection’dır. Bu sıralama Kling’de doğrulanmış kalite veya otomatik ücretli gönderim izni değildir.
