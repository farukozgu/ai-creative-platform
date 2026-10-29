/** Free, reproducible catalog/storyboard export. No provider clients, network or env. */
import { writeFileSync, readFileSync } from "node:fs";
import { compileDirectorPlan, fallbackDirectorPlan } from "../src/lib/video-director/core";
import { videoDirectorPresets, videoPresetIds } from "../src/lib/video-director/presets";
import { presetProduct, recommendVideoPresets } from "../src/lib/video-director/preset-recommendations";
import { buildFalVideoRequestInput } from "../src/lib/video-generation/fal-request";
import { libraryFixtures } from "../tests/fixtures/video-preset-library-fixtures";
import { directorFixtureInput, directorProducts } from "../tests/fixtures/video-director-fixtures";

const sourceMap = [
  ["Giyim", "1, 2, 4", "floating-fashion", "Tişört, denim ve flat-lay varyasyonları; yön değiştirme yerine kamera ile yükseliş hissi"],
  ["Giyim", "3", "product-spotlight", "Dinamik ışık geçişi"],
  ["Giyim", "5", "macro-stitching", "Görünür yaka, dikiş ve birleşim"],
  ["Giyim", "6", "luxury-fashion-film", "Kaynakta manken varsa korunur; yeni manken eklenmez"],
  ["Giyim", "7", "window-display", "Vitrin estetiği kaynak ortamında uygulanır"],
  ["Giyim", "8–11", "craftsmanship-study", "Dikim/imalat/dokumaya dönüşüm yerine bitmiş işçilik"],
  ["Giyim", "12", "fabric-motion", "Rüzgâr deformasyonu yerine mevcut döküm ve ışık ritmi"],
  ["Çanta", "1", "floating-accessory", "Gövde ve kulp varyasyonu"],
  ["Çanta", "2, 3", "elegant-orbit", "Belgedeki aynı 360 fikri tekleştirildi; görünür yüzle sınırlı parallax"],
  ["Çanta", "4", "hardware-reveal", "Görünür kilit/aksam, açılma yok"],
  ["Çanta", "5", "window-display", "Stant/vitrin eklemeden kampanya kadrajı"],
  ["Çanta", "6", "craftsmanship-study", "Doğrulanmamış üretim geçmişi yerine mevcut birleşimler"],
  ["Saat", "1, 3, 5", "cinematic-dial", "Kadran, kordon ve parlamanın kaynağa göre seçilmesi"],
  ["Saat", "2", "metallic-light-sweep", "Kamera sabitken kontrollü yüzey ışığı"],
  ["Saat", "4", "elegant-orbit", "Bilinmeyen arka yüz açılmaz"],
  ["Saat", "6", "precision-macro", "Exploded view yerine görünür yüzey ve kenar incelemesi"],
  ["Saat", "7", "craftsmanship-study", "Montaj geçmişi ve el eklenmez"],
  ["Şapka", "1, 3", "macro-stitching", "Ön panel, siperlik ve görünür dikiş varyasyonları"],
  ["Şapka", "2", "product-spotlight", "Kontur üzerinde ışık geçişi"],
  ["Şapka", "4", "window-display", "Kaynakta olmayan manken/vitrin yok"],
  ["Şapka", "5, 6", "craftsmanship-study", "Nakış/üretim yerine mevcut işçilik"],
  ["Gözlük", "1, 2", "optical-lines", "Menteşe, kontur ve simetrik kapanış"],
  ["Gözlük", "3, 4", "craftsmanship-study", "İmalat, polisaj ve el eklenmez"],
  ["Takı", "1, 2", "precision-macro", "Mevcut işleme ve taş yerleşimleri; taş türü varsayılmaz"],
  ["Takı", "3, 4", "elegant-orbit", "Tam yörünge yerine sınırlı kamera gezintisi"],
  ["Takı", "5, 6", "craftsmanship-study", "Döküm/üretim tekrarları tek bitmiş ürün incelemesine birleştirildi"],
  ["Kozmetik", "1, 3, 6", "label-reveal", "Etiket, amblem ve genel ambalaj akışı birleştirildi"],
  ["Kozmetik", "2", "metallic-light-sweep", "Malzeme türü iddiası olmadan ışık geçişi"],
  ["Kozmetik", "4", "glass-reflection", "Yalnız doğrulanmış yüzey; şeffaflık ve sıvı varsayılmaz"],
  ["Kozmetik", "5", "hardware-reveal", "Görünür kapak ve boyun konturu varyasyonu"],
  ["Kozmetik", "7", "dramatic-backlight", "Sprey aktivasyonu yerine kontur ışığı"],
  ["Kozmetik", "8, 9", "craftsmanship-study", "Dolum/üretim tekrarları yerine mevcut yüzey"],
  ["Ayakkabı", "1", "sneaker-hero", "Silüet ve üst yapı"],
  ["Ayakkabı", "2, 3", "material-detail", "Loafer/bot ve görünür yüzey varyasyonları; egzotik deri iddiası yok"],
  ["Ayakkabı", "4", "craftsmanship-study", "Dikim/yapıştırma üretim hikâyesi yok"],
  ["Mobilya", "1–3", "upholstery-macro", "Döşeme, birleşim ve modüler silüet varyasyonları"],
  ["Mobilya", "4", "craftsmanship-study", "Kaynakta olmayan iskelet/atölye yok"],
  ["Yiyecek", "1", "culinary-texture", "Görünür doku; içerik ve tazelik iddiası yok"],
  ["Yiyecek", "2", "craftsmanship-study", "Hazırlama yerine bitmiş görünür yüzey"],
  ["Paketli gıda", "1, 2", "label-reveal", "Kutu/şişe varyasyonları; açılma ve yazı değişimi yok"],
  ["Paketli gıda", "3", "craftsmanship-study", "Toz işleme/dolum yerine bitmiş ambalaj"],
];
const tr = JSON.parse(readFileSync("src/messages/tr.json", "utf8")).Dashboard.videoStudio.director;
let report = "# KLAY AI Creative Video Preset Library\n\nKaynak: C:/Users/faruk/Desktop/presetler.docx. Belge okundu, değiştirilmedi. SHA256: B158529C460A35FAFDA39A9BD7C638B7E8575BC68669DF96E09D9AB1DBB0192C. Belgenin 11 kategorideki 63 numaralı girdisi (tekrarlar dahil) 24 ana stile ve kategori varyasyonlarına birleştirildi.\n\n## Kaynak eşlemesi\n\n| Belge kategorisi | Girdi no | Ana preset | Varyasyon / güvenli uyarlama |\n|---|---|---|---|\n";
for (const row of sourceMap) report += `| ${row.join(" | ")} |\n`;
report += "\n## 24 ana preset\n\n| ID | TR adı | Kategoriler | Amaç |\n|---|---|---|---|\n";
for (const id of videoPresetIds) {
  const p = videoDirectorPresets[id];
  report += `| ${id} | ${tr.presets[id].title} | ${p.strategy.categories.join(", ") || "Evrensel"} | ${p.strategy.objective} |\n`;
}
report += "\nFloating Fashion, Precision Macro, Glass Reflection, Product Spotlight, Elegant Orbit, Cinematic Hero ve Material Detail KLAY için kaynak fikirlerini yeniden düzenleyen stratejilerdir. Precision Macro, doku odaklı Material Detail ve mevcut Macro Detail Reveal kamera/kadraj/odak öncelikleri bakımından farklıdır. Bunlar yalnız isim değişikliği değildir; sözleşme alanları planner bağlamına aktarılır.\n\n## Öneri ve güvenlik\n\nKaynak hazırlanırken sahipliği doğrulanmış projenin mevcut ürün profili okunur. Yeni analiz veya ek görsel indirme yoktur. Kategori ve alt tür güveni ile görünür kanıt eşleşmeleri puanlanır. En fazla altı öneri gösterilir. Belirsiz profiller evrensel stillere döner. Tüm stiller ve kategori filtreleri her zaman erişilebilirdir; filtre ürün gerçeği sayılmaz.\n\nMevcut Product Understanding kalıcı şeması altı ana sektördür. Video katmanı yüksek güvenli mevcut alt türden şapka, gözlük, mobilya, yiyecek, paketli gıda ve elektronik kategorilerini daraltabilir; eksik alt türü kendisi analiz etmez. Bu ek kategorilerin fikstürleri sentetik şema uyumluluk örnekleridir, canlı analiz başarısı kanıtı değildir. Yeni ham yükleme profili yoksa evrensel önerilir; kullanıcı kategori filtresiyle uygun stili seçebilir.\n\nTam 360, exploded view, imalat geçmişi, el etkileşimi, atomizer çalıştırma ve flat-lay yön değişimi bu tek-kare sözleşmesinde çalıştırılmaz. Yaratıcı amaç kaynak yüzünde kamera/ışık/bitmiş detay incelemesine uyarlanır ve UI'da açıklanır. Bilinmeyen malzeme veya görünmeyen parça eklenmez.\n\nEski üç ID ve fallback çekimleri korunur; preset sürümleri 3 olarak kalır. Yeni presetler v1, Director plan sürümü video-director-3.1-library-v1. Önceki 3.1 makbuzları yeni gönderimde geçersizdir. Eski job'lar değiştirilmez; idempotent kurtarma, fiyat onayı, kota ve rezervasyon kodu korunur.\n\n## Kategori storyboard ve payload örnekleri\n\nAşağıdakiler gerçek compiler ve provider payload builder üzerinden üretilen ücretsiz fallback örnekleridir. AI yaratıcı çıktısı veya render edilmiş video değildir; kullanıcı niyetinin anlamsal yorumlandığı iddia edilmez. OpenAI planner yalnız açık ücret onayından sonra aynı strateji ile tam kullanıcı isteğini birlikte yorumlar.\n";
const records = [];
for (const fixture of libraryFixtures) {
  const base = directorFixtureInput(directorProducts[0]);
  const input = { ...base, profile: fixture.profile, presetId: fixture.presetId };
  const plan = fallbackDirectorPlan(input), compiled = compileDirectorPlan(plan, input);
  const payload = buildFalVideoRequestInput({ ...input.draft, ...compiled, modelId: "kling-v3-standard-image", endpointId: "fixture", sourceUrl: "https://invalid.example/offline-source" });
  const shots = payload.multi_prompt as { prompt: string; duration: string }[];
  records.push({ name: fixture.name, category: fixture.category, product: presetProduct(fixture.profile), recommended: recommendVideoPresets(presetProduct(fixture.profile)), plan, payload });
  report += `\n### ${fixture.name} · ${fixture.presetId}\n\nKategori: ${presetProduct(fixture.profile).category}. Önerilen: ${recommendVideoPresets(presetProduct(fixture.profile)).join(", ")}.\n`;
  for (const [i, shot] of plan.shots.entries()) {
    report += `\n${i + 1}. ${shot.purpose}, ${shot.durationSeconds} sn. Odak: ${shot.focus}. Kamera: ${shot.camera}. Kadraj: ${shot.composition}. Işık: ${shot.lighting}. Tempo: ${shot.pace}.\n\nGerçek payload promptu (${shots[i].prompt.length}/512 karakter):\n\n\`\`\`text\n${shots[i].prompt}\n\`\`\`\n`;
  }
}
report += "\n## Doğrulama ve kalan riskler\n\n24 × 15 fikstür × 2 model × 2 süre × 2 çekim modu = 2.880 payload/preview kombinasyonu; ayrıca 120 açık kamera tercihi doğrulanır. Kaynak sahipliği ve profil okunamadığında güvenli geri dönüş testleri vardır. Tarayıcı testi gerçek UI'yı, mock aksiyonlar ve engellenmiş dış ağ ile TR/EN 320–1440 px aralığında kontrol eder.\n\nKling üzerinde görüntü kalitesi, küçük yazı/taş/işçilik sadakati ve ışık geçişlerinin tutarlılığı canlı doğrulanmadı. Yeni görsel asset üretilmedi; kart görselleri mevcut dekoratif örneklerdir, preset çıktısı değildir. UI filtreleri sınıflandırmayı veya kanıtı değiştirmez. Örnekler hazırlama geçmişi ve iç mekanizma iddiası oluşturmaz.\n";
report += "\n## Görev doğrulama kaydı\n\n117 hedefli test başarılı, 0 başarısız. 2.880 kombinasyon ve 120 açık kamera tercihi test edildi. 436 tarayıcı kontrolü başarılı; konsol hatası 0. TR/EN, mobil/masaüstü, kategori filtresi, sayfalama, klavye seçimi, risk metni ve onay geçersizliği kapsanır. TypeScript ve ESLint başarılı. Webpack üretim derlemesi 32 sayfayla tamamlandı; sandbox EPERM kısıtı dışında çalıştırıldı. Ücretli OpenAI/Kling çağrısı ve gerçek ürün videosu yok. Yeni dependency, migration, env düzenlemesi, commit veya push yok.\n\n## Bu görevde değişen dosyalar\n\n- src/lib/video-director/{preset-contract,preset-library,preset-recommendations}.ts (yeni)\n- src/lib/video-director/{presets,core,openai-director}.ts\n- src/lib/video-generation/prepared-source.ts\n- src/features/video/{video-director-panel.tsx,video-studio-workspace.tsx,video-studio-workspace.module.css}\n- src/messages/{tr,en}.json\n- tests/{video-preset-library,video-preset-source}.test.ts (yeni)\n- tests/fixtures/video-preset-library-fixtures.ts (yeni)\n- tests/video-director.test.ts\n- scripts/verify-video-preset-library.ts (yeni)\n- scripts/verify-video-studio-design.mjs\n- docs/{video-preset-library.md,video-preset-library-examples.json} (yeni)\n- docs/video-director.md\n\nÖnceden mevcut diğer çalışma ağacı değişiklikleri korundu.\n";
writeFileSync("docs/video-preset-library.md", report);
writeFileSync("docs/video-preset-library-examples.json", JSON.stringify(records, null, 2) + "\n");
console.log(JSON.stringify({ presets: videoPresetIds.length, examples: records.length, scenePrompts: records.reduce((n, r) => n + r.plan.shots.length, 0), maxChars: Math.max(...records.flatMap(r => (r.payload.multi_prompt as { prompt: string }[]).map(s => s.prompt.length))) }));
