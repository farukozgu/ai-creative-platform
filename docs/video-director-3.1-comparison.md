# Director 3.0 → 3.1 ücretsiz compiler karşılaştırması

Aynı yapılandırılmış plan iki derleyiciden geçirildi. İlk üç plan mevcut ürünlerle elle yazılmış kabul fikstürüdür; belirsiz ürün mevcut ücretsiz fallback planıdır. Canlı AI/video sonucu veya estetik kalite ölçümü değildir. Karakter sayıları gerçek provider payload builder çıktısındaki prompt string uzunluklarıdır.

## Parlak siyah kemerli ceket

İstek: Cekete yavaş yaklaş, detayları göster.. Preset: luxury-fashion-film. Plan kaynağı: ai.

Niyet: Approach slowly, study visible construction, then resolve the full silhouette.

```json
[
  {
    "durationSeconds": 3,
    "purpose": "hero-reveal",
    "evidenceRefs": [
      5
    ],
    "focus": "belted jacket silhouette",
    "camera": "Slow dolly-in from the front",
    "composition": "Full silhouette with negative space",
    "lighting": "Soft side light traces the existing surface",
    "motion": "Hold the source-facing pose in the light",
    "pace": "Measured opening"
  },
  {
    "durationSeconds": 4,
    "purpose": "macro-detail",
    "evidenceRefs": [
      0
    ],
    "focus": "two visible front buttons",
    "camera": "Short lateral camera glide",
    "composition": "Close crop on the evidenced front detail",
    "lighting": "Soft side light traces the existing surface",
    "motion": "Hold the source-facing pose in the light",
    "pace": "Patient detail hold"
  },
  {
    "durationSeconds": 3,
    "purpose": "final-hero",
    "evidenceRefs": [
      4
    ],
    "focus": "front belt knot",
    "camera": "Locked medium hero framing",
    "composition": "Full silhouette, knot at the visual center",
    "lighting": "Soft side light traces the existing surface",
    "motion": "Hold the source-facing pose in the light",
    "pace": "Confident final hold"
  }
]
```

Farklı kamera/kadraj tanımı: 3; ayrı görsel amaç: 3. Derleyici bu kararlara yeni hareket eklemez. Minimal Studio'da farklı kadrajlar sabit kamerayla çekilir; farklı kamera metni farklı fiziksel hareket anlamına gelmez.

### Sahne 1 · 3 sn

Kanıt: belted jacket silhouette. Yeni prompt yalnız seçili odağı kullanır; diğer profil maddeleri eklenmez.

3.0 (445 karakter):

```text
Focus: belted jacket silhouette. Slow dolly-in from the front. Full silhouette with negative space. Soft side light traces the existing surface. Hold the source-facing pose in the light. Measured opening. Preserve source geometry, color, material/texture, pattern, logo/text and parts. Show known surfaces. Visible: two visible front buttons. Visible: black. Visible: glossy coated fabric. Visible: wide notched collar. Visible: front belt knot.
```

3.1 (298 karakter):

```text
Dolly in slowly from the front, framing the belted jacket silhouette. Compose the full silhouette with negative space. Soft side light traces the existing surface. Allow a measured opening. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

### Sahne 2 · 4 sn

Kanıt: two visible front buttons. Yeni prompt yalnız seçili odağı kullanır; diğer profil maddeleri eklenmez.

3.0 (451 karakter):

```text
Focus: two visible front buttons. Short lateral camera glide. Close crop on the evidenced front detail. Soft side light traces the existing surface. Hold the source-facing pose in the light. Patient detail hold. Preserve source geometry, color, material/texture, pattern, logo/text and parts. Show known surfaces. Visible: black. Visible: glossy coated fabric. Visible: wide notched collar. Visible: front belt knot. Visible: belted jacket silhouette.
```

3.1 (314 karakter):

```text
Glide laterally over a short distance, framing the two visible front buttons. Compose the close crop on the evidenced front detail. Soft side light traces the existing surface. Allow a patient detail hold. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

### Sahne 3 · 3 sn

Kanıt: front belt knot. Yeni prompt yalnız seçili odağı kullanır; diğer profil maddeleri eklenmez.

3.0 (454 karakter):

```text
Focus: front belt knot. Locked medium hero framing. Full silhouette, knot at the visual center. Soft side light traces the existing surface. Hold the source-facing pose in the light. Confident final hold. Preserve source geometry, color, material/texture, pattern, logo/text and parts. Show known surfaces. Visible: two visible front buttons. Visible: black. Visible: glossy coated fabric. Visible: wide notched collar. Visible: belted jacket silhouette.
```

3.1 (300 karakter):

```text
Use locked medium hero framing, framing the front belt knot. Compose the full silhouette, knot at the visual center. Soft side light traces the existing surface. Allow a confident final hold. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

İstek uyumu: ceket planının yaklaşma/detay sırası, parfüm planının ışık/etiket finali veya saat planının kadrana yaklaşma/tam ürün finali aynen korunur. Genel poz sabitleme cümlesi çıkarılır; gerçek kamera ve ışık kararları kalır.

## Parfüm şişesi

İstek: Dramatic highlights, then finish on the label.. Preset: luxury-fashion-film. Plan kaynağı: ai.

Niyet: Use dramatic highlights to reveal bottle geometry, then finish on the front label.

```json
[
  {
    "durationSeconds": 3,
    "purpose": "hero-reveal",
    "evidenceRefs": [
      2
    ],
    "focus": "rectangular bottle geometry",
    "camera": "Slow vertical camera tilt within the front view",
    "composition": "Centered geometry with breathing room",
    "lighting": "A narrow soft highlight travels across the front",
    "motion": "Hold the source-facing pose in the light",
    "pace": "Measured opening"
  },
  {
    "durationSeconds": 4,
    "purpose": "macro-detail",
    "evidenceRefs": [
      5
    ],
    "focus": "flat black cap",
    "camera": "Locked close framing",
    "composition": "Tight source-facing detail with clean margins",
    "lighting": "A narrow soft highlight travels across the front",
    "motion": "Hold the source-facing pose in the light",
    "pace": "Patient detail hold"
  },
  {
    "durationSeconds": 3,
    "purpose": "final-hero",
    "evidenceRefs": [
      0
    ],
    "focus": "centered front label",
    "camera": "Slow pull-back to medium hero framing",
    "composition": "Full bottle, front label facing camera",
    "lighting": "A narrow soft highlight travels across the front",
    "motion": "Hold the source-facing pose in the light",
    "pace": "Confident final hold"
  }
]
```

Farklı kamera/kadraj tanımı: 3; ayrı görsel amaç: 3. Derleyici bu kararlara yeni hareket eklemez. Minimal Studio'da farklı kadrajlar sabit kamerayla çekilir; farklı kamera metni farklı fiziksel hareket anlamına gelmez.

### Sahne 1 · 3 sn

Kanıt: rectangular bottle geometry. Yeni prompt yalnız seçili odağı kullanır; diğer profil maddeleri eklenmez.

3.0 (464 karakter):

```text
Focus: rectangular bottle geometry. Slow vertical camera tilt within the front view. Centered geometry with breathing room. A narrow soft highlight travels across the front. Hold the source-facing pose in the light. Measured opening. Preserve source geometry, color, material/texture, pattern, logo/text and parts. Show known surfaces. Visible: centered front label. Visible: amber. Visible: rectangular glass bottle. Visible: clear glass. Visible: flat black cap.
```

3.1 (331 karakter):

```text
Use a slow vertical camera tilt within the front view, framing the rectangular bottle geometry. Compose the centered geometry with breathing room. A narrow soft highlight travels across the front. Allow a measured opening. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

### Sahne 2 · 4 sn

Kanıt: flat black cap. Yeni prompt yalnız seçili odağı kullanır; diğer profil maddeleri eklenmez.

3.0 (448 karakter):

```text
Focus: flat black cap. Locked close framing. Tight source-facing detail with clean margins. A narrow soft highlight travels across the front. Hold the source-facing pose in the light. Patient detail hold. Preserve source geometry, color, material/texture, pattern, logo/text and parts. Show known surfaces. Visible: centered front label. Visible: amber. Visible: rectangular bottle geometry. Visible: rectangular glass bottle. Visible: clear glass.
```

3.1 (295 karakter):

```text
Frame the flat black cap in a locked close view. Compose the tight source-facing detail with clean margins. A narrow soft highlight travels across the front. Allow a patient detail hold. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

### Sahne 3 · 3 sn

Kanıt: centered front label. Yeni prompt yalnız seçili odağı kullanır; diğer profil maddeleri eklenmez.

3.0 (459 karakter):

```text
Focus: centered front label. Slow pull-back to medium hero framing. Full bottle, front label facing camera. A narrow soft highlight travels across the front. Hold the source-facing pose in the light. Confident final hold. Preserve source geometry, color, material/texture, pattern, logo/text and parts. Show known surfaces. Visible: amber. Visible: rectangular bottle geometry. Visible: rectangular glass bottle. Visible: clear glass. Visible: flat black cap.
```

3.1 (317 karakter):

```text
Use slow pull-back to medium hero framing, framing the centered front label. Compose the full bottle, front label facing camera. A narrow soft highlight travels across the front. Allow a confident final hold. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

İstek uyumu: ceket planının yaklaşma/detay sırası, parfüm planının ışık/etiket finali veya saat planının kadrana yaklaşma/tam ürün finali aynen korunur. Genel poz sabitleme cümlesi çıkarılır; gerçek kamera ve ışık kararları kalır.

## Saat

İstek: Kadrana yavaş yaklaş, sonunda saatin tamamını göster.. Preset: macro-detail-reveal. Plan kaynağı: ai.

Niyet: Approach the dial slowly, study its visible markers, then reveal the complete watch.

```json
[
  {
    "durationSeconds": 3,
    "purpose": "hero-reveal",
    "evidenceRefs": [
      2
    ],
    "camera": "Slow optical push toward the visible dial",
    "lighting": "Soft edge light preserves source colors",
    "composition": "Establish the recognizable visible product",
    "motion": "Focus resolves the existing dial",
    "pace": "Brief introduction",
    "focus": "blue dial with visible hands"
  },
  {
    "durationSeconds": 4,
    "purpose": "macro-detail",
    "evidenceRefs": [
      6
    ],
    "camera": "Locked close framing",
    "lighting": "Grazing soft light reveals existing relief",
    "composition": "Close framing at source-resolvable detail scale",
    "motion": "Focus settles on the visible dial markers",
    "pace": "Patient detail hold",
    "focus": "slim dial markers"
  },
  {
    "durationSeconds": 3,
    "purpose": "final-hero",
    "evidenceRefs": [
      1
    ],
    "camera": "Slow pull-back to medium hero framing",
    "lighting": "Soft edge light preserves source colors",
    "composition": "Return to recognizable product form",
    "motion": "Widen within the known source-facing view",
    "pace": "Calm closing hold",
    "focus": "round watch case"
  }
]
```

Farklı kamera/kadraj tanımı: 3; ayrı görsel amaç: 3. Derleyici bu kararlara yeni hareket eklemez. Minimal Studio'da farklı kadrajlar sabit kamerayla çekilir; farklı kamera metni farklı fiziksel hareket anlamına gelmez.

### Sahne 1 · 3 sn

Kanıt: blue dial with visible hands. Yeni prompt yalnız seçili odağı kullanır; diğer profil maddeleri eklenmez.

3.0 (441 karakter):

```text
Focus: blue dial with visible hands. Slow optical push toward the visible dial. Establish the recognizable visible product. Soft edge light preserves source colors. Focus resolves the existing dial. Brief introduction. Preserve source geometry, color, material/texture, pattern, logo/text and parts. Show known surfaces. Visible: silver. Visible: round watch case. Visible: brushed steel. Visible: steel bracelet. Visible: slim dial markers.
```

3.1 (346 karakter):

```text
Use a slow optical push toward the visible dial, framing the blue dial with visible hands. Establish the recognizable visible product. Soft edge light preserves source colors. Focus resolves the existing dial. Allow a brief introduction. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

### Sahne 2 · 4 sn

Kanıt: slim dial markers. Yeni prompt yalnız seçili odağı kullanır; diğer profil maddeleri eklenmez.

3.0 (438 karakter):

```text
Focus: slim dial markers. Locked close framing. Close framing at source-resolvable detail scale. Grazing soft light reveals existing relief. Focus settles on the visible dial markers. Patient detail hold. Preserve source geometry, color, material/texture, pattern, logo/text and parts. Show known surfaces. Visible: silver. Visible: round watch case. Visible: blue dial with visible hands. Visible: brushed steel. Visible: steel bracelet.
```

3.1 (337 karakter):

```text
Frame the slim dial markers in a locked close view. Compose the close framing at source-resolvable detail scale. Grazing soft light reveals existing relief. Focus settles on the visible dial markers. Allow a patient detail hold. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

### Sahne 3 · 3 sn

Kanıt: round watch case. Yeni prompt yalnız seçili odağı kullanır; diğer profil maddeleri eklenmez.

3.0 (438 karakter):

```text
Focus: round watch case. Slow pull-back to medium hero framing. Return to recognizable product form. Soft edge light preserves source colors. Widen within the known source-facing view. Calm closing hold. Preserve source geometry, color, material/texture, pattern, logo/text and parts. Show known surfaces. Visible: silver. Visible: blue dial with visible hands. Visible: brushed steel. Visible: steel bracelet. Visible: slim dial markers.
```

3.1 (329 karakter):

```text
Use slow pull-back to medium hero framing, framing the round watch case. Return to recognizable product form. Soft edge light preserves source colors. Widen within the known source-facing view. Allow a calm closing hold. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

İstek uyumu: ceket planının yaklaşma/detay sırası, parfüm planının ışık/etiket finali veya saat planının kadrana yaklaşma/tam ürün finali aynen korunur. Genel poz sabitleme cümlesi çıkarılır; gerçek kamera ve ışık kararları kalır.

## Belirsiz ürün

İstek: Boş; ürün ve preset yönü. Preset: minimal-studio. Plan kaynağı: fallback.

Niyet: Preset direction only; user intent has not been interpreted by AI.

```json
[
  {
    "durationSeconds": 3,
    "purpose": "hero-reveal",
    "evidenceRefs": [],
    "camera": "Locked balanced studio overview",
    "lighting": "Diffuse soft light with natural contact shadow",
    "composition": "Centered complete product with clean margins",
    "motion": "Focus settles on the visible contour",
    "pace": "Quiet opening hold",
    "focus": "Source-visible product form"
  },
  {
    "durationSeconds": 4,
    "purpose": "material-study",
    "evidenceRefs": [],
    "camera": "Locked close framing",
    "lighting": "Even diffuse light defines existing texture",
    "composition": "Graphic crop of the chosen source-visible detail",
    "motion": "Gentle focus settle on the existing surface",
    "pace": "Steady detail hold",
    "focus": "Source-visible surface detail"
  },
  {
    "durationSeconds": 3,
    "purpose": "final-hero",
    "evidenceRefs": [],
    "camera": "Locked symmetrical hero frame",
    "lighting": "Diffuse soft light with natural contact shadow",
    "composition": "Return to the full product with balanced space",
    "motion": "Hold the recognizable source-facing pose",
    "pace": "Sustained final hold",
    "focus": "Source-visible product form"
  }
]
```

Farklı kamera/kadraj tanımı: 3; ayrı görsel amaç: 3. Derleyici bu kararlara yeni hareket eklemez. Minimal Studio'da farklı kadrajlar sabit kamerayla çekilir; farklı kamera metni farklı fiziksel hareket anlamına gelmez.

### Sahne 1 · 3 sn

Kanıt: Yok; genel görünür form/detay. Yeni prompt yalnız seçili odağı kullanır; diğer profil maddeleri eklenmez.

3.0 (322 karakter):

```text
Focus: Source-visible product form. Locked balanced studio overview. Centered complete product with clean margins. Diffuse soft light with natural contact shadow. Focus settles on the visible contour. Quiet opening hold. Preserve source geometry, color, material/texture, pattern, logo/text and parts. Show known surfaces.
```

3.1 (372 karakter):

```text
Use locked balanced studio overview, framing the visible product form. Compose the centered complete product with clean margins. Light the scene with diffuse soft light with natural contact shadow. Focus settles on the visible contour. Allow a quiet opening hold. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

### Sahne 2 · 4 sn

Kanıt: Yok; genel görünür form/detay. Yeni prompt yalnız seçili odağı kullanır; diğer profil maddeleri eklenmez.

3.0 (321 karakter):

```text
Focus: Source-visible surface detail. Locked close framing. Graphic crop of the chosen source-visible detail. Even diffuse light defines existing texture. Gentle focus settle on the existing surface. Steady detail hold. Preserve source geometry, color, material/texture, pattern, logo/text and parts. Show known surfaces.
```

3.1 (345 karakter):

```text
Frame the visible surface detail in a locked close view. Compose the graphic crop of the chosen source-visible detail. Even diffuse light defines existing texture. Gentle focus settle on the existing surface. Allow a steady detail hold. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

### Sahne 3 · 3 sn

Kanıt: Yok; genel görünür form/detay. Yeni prompt yalnız seçili odağı kullanır; diğer profil maddeleri eklenmez.

3.0 (328 karakter):

```text
Focus: Source-visible product form. Locked symmetrical hero frame. Return to the full product with balanced space. Diffuse soft light with natural contact shadow. Hold the recognizable source-facing pose. Sustained final hold. Preserve source geometry, color, material/texture, pattern, logo/text and parts. Show known surfaces.
```

3.1 (324 karakter):

```text
Use locked symmetrical hero frame, framing the visible product form. Return to the full product with balanced space. Light the scene with diffuse soft light with natural contact shadow. Allow a sustained final hold. Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.
```

İstek uyumu: boş istek için preset yönü korunur. Fallback kullanıcı niyetini AI ile yorumladığını iddia etmez.

## Sınırlar ve güvenlik

Bu derleyici yeni yaratıcı plan üretmez; planın dilini düzenler. Etiketler ve sahneyle ilgisiz profil ekleri kaldırılır. Yapı, renk, malzeme, doku, desen, parçalar ve işaretler için kısa kaynak sadakati kuralı korunur. Kaynakta bilinmeyen yüzler açılmaz. İşaretli logo/etiket için ek kesinlik kuralı zorunludur. Uzun zorunlu yönergeler yalnız kontrollü tam ifade eşdeğerleriyle kısalır; sığmazsa mevcut açık fallback devreye girer. Plan sürümü 3.1 olduğundan eski plan makbuzları yeni gönderimlerde kabul edilmez; imza/teklif/rezervasyon mekanizmaları değiştirilmez. UI, DB, env ve job kayıtları değişmez.

## Değişen dosyalar

- src/lib/video-director/core.ts
- src/lib/video-director/kling-compiler.ts (yeni)
- src/lib/video-director/presets.ts (yalnız Director sürümü)
- tests/video-director.test.ts
- tests/video-director-31.test.ts (yeni)
- tests/fixtures/video-director-30-compiler.ts (dondurulmuş eski render, yalnız test)
- scripts/compare-video-director-compilers.ts (yeni)
- docs/video-director-3.1-comparison.md (yeni)

## Doğrulama kaydı

85 hedefli test başarılı, 0 başarısız. Yeni matris 168 ürün/preset/model/süre/çekim kombinasyonunu doğrular. Preview/payload eşleşmesi, kritik bölge, imzalı plan geçersizliği, teklif onayı, idempotency ve ücretli çağrıyı engelleyen kapılar kapsanır. TypeScript ve ESLint başarılı. Bu aşamada build, tarayıcı veya canlı model/video denemesi yapılmadı; UI değişmedi. Dependency eklenmedi; commit/push yapılmadı.
