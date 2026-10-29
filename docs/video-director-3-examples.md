# Video Director 3.0 — iki ürün için doğrulanabilir kabul örnekleri

Bu planlar test için yazılmış örneklerdir; canlı OpenAI veya Kling çıktısı değildir. Tüm promptlar gerçek `compileDirectorPlan` fonksiyonundan geçirilmiştir. Her sahne 512 karakter sınırındadır.

## Kemerli ceket

- İstek: Cekete yavaş yaklaş, detayları göster.
- Preset: Luxury Fashion Film
- Yapı: 10 saniye, multi-shot (3 + 4 + 3), Standard; aynı plan Pro ile de uyumlu.
- Doğrulanmış ürün: wide notched collar; two visible front buttons; front belt knot; glossy coated fabric.
- Director yorumu: Approach slowly, study visible construction, then resolve the full silhouette.

### Sahne 1 · 3 sn · hero-reveal

| Karar | Çekim yönergesi |
|---|---|
| Odak | belted jacket silhouette |
| Kamera | Slow dolly-in from the front |
| Kadraj | Full silhouette with negative space |
| Işık | Soft side light traces the existing surface |
| Hareket | Hold the source-facing pose in the light |
| Tempo | Measured opening |

Derlenmiş Kling sahne promptu (445/512 karakter):

```text
Focus: belted jacket silhouette. Slow dolly-in from the front. Full silhouette with negative space. Soft side light traces the existing surface. Hold the source-facing pose in the light. Measured opening. Preserve source geometry, color, material/texture, pattern, logo/text and parts. Show known surfaces. Visible: two visible front buttons. Visible: black. Visible: glossy coated fabric. Visible: wide notched collar. Visible: front belt knot.
```

### Sahne 2 · 4 sn · macro-detail

| Karar | Çekim yönergesi |
|---|---|
| Odak | two visible front buttons |
| Kamera | Short lateral camera glide |
| Kadraj | Close crop on the evidenced front detail |
| Işık | Soft side light traces the existing surface |
| Hareket | Hold the source-facing pose in the light |
| Tempo | Patient detail hold |

Derlenmiş Kling sahne promptu (451/512 karakter):

```text
Focus: two visible front buttons. Short lateral camera glide. Close crop on the evidenced front detail. Soft side light traces the existing surface. Hold the source-facing pose in the light. Patient detail hold. Preserve source geometry, color, material/texture, pattern, logo/text and parts. Show known surfaces. Visible: black. Visible: glossy coated fabric. Visible: wide notched collar. Visible: front belt knot. Visible: belted jacket silhouette.
```

### Sahne 3 · 3 sn · final-hero

| Karar | Çekim yönergesi |
|---|---|
| Odak | front belt knot |
| Kamera | Locked medium hero framing |
| Kadraj | Full silhouette, knot at the visual center |
| Işık | Soft side light traces the existing surface |
| Hareket | Hold the source-facing pose in the light |
| Tempo | Confident final hold |

Derlenmiş Kling sahne promptu (454/512 karakter):

```text
Focus: front belt knot. Locked medium hero framing. Full silhouette, knot at the visual center. Soft side light traces the existing surface. Hold the source-facing pose in the light. Confident final hold. Preserve source geometry, color, material/texture, pattern, logo/text and parts. Show known surfaces. Visible: two visible front buttons. Visible: black. Visible: glossy coated fabric. Visible: wide notched collar. Visible: belted jacket silhouette.
```


## Parfüm şişesi

- İstek: Dramatic highlights, then finish on the label.
- Preset: Luxury Fashion Film
- Yapı: 10 saniye, multi-shot (3 + 4 + 3), Standard; aynı plan Pro ile de uyumlu.
- Doğrulanmış ürün: rectangular glass bottle; flat black cap; centered front label.
- Director yorumu: Use dramatic highlights to reveal bottle geometry, then finish on the front label.

### Sahne 1 · 3 sn · hero-reveal

| Karar | Çekim yönergesi |
|---|---|
| Odak | rectangular bottle geometry |
| Kamera | Slow vertical camera tilt within the front view |
| Kadraj | Centered geometry with breathing room |
| Işık | A narrow soft highlight travels across the front |
| Hareket | Hold the source-facing pose in the light |
| Tempo | Measured opening |

Derlenmiş Kling sahne promptu (464/512 karakter):

```text
Focus: rectangular bottle geometry. Slow vertical camera tilt within the front view. Centered geometry with breathing room. A narrow soft highlight travels across the front. Hold the source-facing pose in the light. Measured opening. Preserve source geometry, color, material/texture, pattern, logo/text and parts. Show known surfaces. Visible: centered front label. Visible: amber. Visible: rectangular glass bottle. Visible: clear glass. Visible: flat black cap.
```

### Sahne 2 · 4 sn · macro-detail

| Karar | Çekim yönergesi |
|---|---|
| Odak | flat black cap |
| Kamera | Locked close framing |
| Kadraj | Tight source-facing detail with clean margins |
| Işık | A narrow soft highlight travels across the front |
| Hareket | Hold the source-facing pose in the light |
| Tempo | Patient detail hold |

Derlenmiş Kling sahne promptu (448/512 karakter):

```text
Focus: flat black cap. Locked close framing. Tight source-facing detail with clean margins. A narrow soft highlight travels across the front. Hold the source-facing pose in the light. Patient detail hold. Preserve source geometry, color, material/texture, pattern, logo/text and parts. Show known surfaces. Visible: centered front label. Visible: amber. Visible: rectangular bottle geometry. Visible: rectangular glass bottle. Visible: clear glass.
```

### Sahne 3 · 3 sn · final-hero

| Karar | Çekim yönergesi |
|---|---|
| Odak | centered front label |
| Kamera | Slow pull-back to medium hero framing |
| Kadraj | Full bottle, front label facing camera |
| Işık | A narrow soft highlight travels across the front |
| Hareket | Hold the source-facing pose in the light |
| Tempo | Confident final hold |

Derlenmiş Kling sahne promptu (459/512 karakter):

```text
Focus: centered front label. Slow pull-back to medium hero framing. Full bottle, front label facing camera. A narrow soft highlight travels across the front. Hold the source-facing pose in the light. Confident final hold. Preserve source geometry, color, material/texture, pattern, logo/text and parts. Show known surfaces. Visible: amber. Visible: rectangular bottle geometry. Visible: rectangular glass bottle. Visible: clear glass. Visible: flat black cap.
```

