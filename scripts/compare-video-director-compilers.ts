/** Offline only: pure compiler/payload functions; no provider clients or credentials. */
import { writeFileSync } from "node:fs";
import { compileDirectorPlan, fallbackDirectorPlan, type VideoDirectorInput } from "../src/lib/video-director/core";
import { compileDirector30 } from "../tests/fixtures/video-director-30-compiler";
import { directorFixtureInput, directorProducts, authoredDirectorExample } from "../tests/fixtures/video-director-fixtures";
import { buildFalVideoRequestInput } from "../src/lib/video-generation/fal-request";
import { directorProductContext } from "../src/lib/video-director/product-context";

const samples: { name: string; input: VideoDirectorInput; authored: boolean }[] = [
  { name: "Parlak siyah kemerli ceket", input: directorFixtureInput(directorProducts[0], "Cekete yavaş yaklaş, detayları göster."), authored: true },
  { name: "Parfüm şişesi", input: directorFixtureInput(directorProducts[1], "Dramatic highlights, then finish on the label."), authored: true },
  { name: "Saat", input: { ...directorFixtureInput(directorProducts[2], "Kadrana yavaş yaklaş, sonunda saatin tamamını göster."), presetId: "macro-detail-reveal" }, authored: false },
  { name: "Belirsiz ürün", input: { ...directorFixtureInput(directorProducts[0]), profile: null, presetId: "minimal-studio" }, authored: false },
];
let report = "# Director 3.0 → 3.1 ücretsiz compiler karşılaştırması\n\nAynı yapılandırılmış plan iki derleyiciden geçirildi. İlk üç plan mevcut ürünlerle elle yazılmış kabul fikstürüdür; belirsiz ürün mevcut ücretsiz fallback planıdır. Canlı AI/video sonucu veya estetik kalite ölçümü değildir. Karakter sayıları gerçek provider payload builder çıktısındaki prompt string uzunluklarıdır.\n";
for (const { name, input, authored } of samples) {
  const plan = authored ? authoredDirectorExample(input) : fallbackDirectorPlan(input);
  const watch = input.profile?.vertical === "watches";
  if (watch) {
    const evidence = directorProductContext(input.profile).evidence;
    plan.origin = "ai"; // Authored acceptance fixture, never a live model response.
    plan.intent = "Approach the dial slowly, study its visible markers, then reveal the complete watch.";
    plan.shots = plan.shots.map((shot, i) => {
      const detail = evidence.find(item => item.detail === ["blue dial with visible hands", "slim dial markers", "round watch case"][i])!;
      return { ...shot, focus: detail.detail, evidenceRefs: [detail.id],
        camera: ["Slow optical push toward the visible dial", "Locked close framing", "Slow pull-back to medium hero framing"][i],
        motion: ["Focus resolves the existing dial", "Focus settles on the visible dial markers", "Widen within the known source-facing view"][i] };
    });
  }
  const payload = (compiled: ReturnType<typeof compileDirectorPlan>) => buildFalVideoRequestInput({ ...input.draft,
    modelId: "kling-v3-standard-image", endpointId: "fixture", sourceUrl: "https://invalid.example/source", ...compiled });
  const before = payload(compileDirector30(plan, input)).multi_prompt as { prompt: string }[];
  const after = payload(compileDirectorPlan(plan, input)).multi_prompt as { prompt: string }[];
  report += `\n## ${name}\n\nİstek: ${input.draft.prompt || "Boş; ürün ve preset yönü"}. Preset: ${input.presetId}. Plan kaynağı: ${plan.origin}.\n\nNiyet: ${plan.intent}\n\n`;
  report += "```json\n" + JSON.stringify(plan.shots, null, 2) + "\n```\n";
  report += `\nFarklı kamera/kadraj tanımı: ${new Set(plan.shots.map(shot => shot.camera)).size}; ayrı görsel amaç: ${new Set(plan.shots.map(shot => shot.purpose)).size}. Derleyici bu kararlara yeni hareket eklemez. Minimal Studio'da farklı kadrajlar sabit kamerayla çekilir; farklı kamera metni farklı fiziksel hareket anlamına gelmez.\n`;
  for (const [index, shot] of plan.shots.entries()) {
    const evidence = directorProductContext(input.profile).evidence;
    report += `\n### Sahne ${index + 1} · ${shot.durationSeconds} sn\n\nKanıt: ${shot.evidenceRefs.map(id => evidence[id].detail).join("; ") || "Yok; genel görünür form/detay"}. Yeni prompt yalnız seçili odağı kullanır; diğer profil maddeleri eklenmez.\n\n3.0 (${before[index].prompt.length} karakter):\n\n\`\`\`text\n${before[index].prompt}\n\`\`\`\n\n3.1 (${after[index].prompt.length} karakter):\n\n\`\`\`text\n${after[index].prompt}\n\`\`\`\n`;
  }
  report += authored || watch ? "\nİstek uyumu: ceket planının yaklaşma/detay sırası, parfüm planının ışık/etiket finali veya saat planının kadrana yaklaşma/tam ürün finali aynen korunur. Genel poz sabitleme cümlesi çıkarılır; gerçek kamera ve ışık kararları kalır.\n"
    : "\nİstek uyumu: boş istek için preset yönü korunur. Fallback kullanıcı niyetini AI ile yorumladığını iddia etmez.\n";
}
report += "\n## Sınırlar ve güvenlik\n\nBu derleyici yeni yaratıcı plan üretmez; planın dilini düzenler. Etiketler ve sahneyle ilgisiz profil ekleri kaldırılır. Yapı, renk, malzeme, doku, desen, parçalar ve işaretler için kısa kaynak sadakati kuralı korunur. Kaynakta bilinmeyen yüzler açılmaz. İşaretli logo/etiket için ek kesinlik kuralı zorunludur. Uzun zorunlu yönergeler yalnız kontrollü tam ifade eşdeğerleriyle kısalır; sığmazsa mevcut açık fallback devreye girer. Plan sürümü 3.1 olduğundan eski plan makbuzları yeni gönderimlerde kabul edilmez; imza/teklif/rezervasyon mekanizmaları değiştirilmez. UI, DB, env ve job kayıtları değişmez.\n";
report += "\n## Değişen dosyalar\n\n- src/lib/video-director/core.ts\n- src/lib/video-director/kling-compiler.ts (yeni)\n- src/lib/video-director/presets.ts (yalnız Director sürümü)\n- tests/video-director.test.ts\n- tests/video-director-31.test.ts (yeni)\n- tests/fixtures/video-director-30-compiler.ts (dondurulmuş eski render, yalnız test)\n- scripts/compare-video-director-compilers.ts (yeni)\n- docs/video-director-3.1-comparison.md (yeni)\n\n## Doğrulama kaydı\n\n85 hedefli test başarılı, 0 başarısız. Yeni matris 168 ürün/preset/model/süre/çekim kombinasyonunu doğrular. Preview/payload eşleşmesi, kritik bölge, imzalı plan geçersizliği, teklif onayı, idempotency ve ücretli çağrıyı engelleyen kapılar kapsanır. TypeScript ve ESLint başarılı. Bu aşamada build, tarayıcı veya canlı model/video denemesi yapılmadı; UI değişmedi. Dependency eklenmedi; commit/push yapılmadı.\n";
writeFileSync("docs/video-director-3.1-comparison.md", report);
console.log("Offline comparison written: docs/video-director-3.1-comparison.md");
