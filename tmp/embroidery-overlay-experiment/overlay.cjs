/* Standalone local experiment. Writes only inside this script's directory. */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const video = process.argv[2] || '/mnt/user-data/uploads/output_kazak.mp4';
const source = process.argv[3] || '/mnt/user-data/uploads/04087367500-e1_1.jpg';
const directory = __dirname;
const missing = [video, source].filter(file => !fs.existsSync(file));
if (missing.length) {
  const report = { status: 'blocked_missing_inputs', missing, processedFrames: 0, overlayRatio: null };
  fs.writeFileSync(path.join(directory, 'preflight.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(2);
}
let ffmpeg;
try { ffmpeg = require('ffmpeg-static'); } catch { ffmpeg = 'ffmpeg'; }
const program = String.raw`
import csv, json, math, os, subprocess, sys
import cv2
import numpy as np
video, source_path, out, ffmpeg = sys.argv[1:]
cv2.setRNGSeed(17)
cv2.setNumThreads(2)
source = cv2.imread(source_path)
if source is None: raise RuntimeError('Cannot decode source')
height, width = source.shape[:2]
x0, y0, x1, y1 = 1010, 690, 1190, 800
if not (0 <= x0 < x1 <= width and 0 <= y0 < y1 <= height):
    raise RuntimeError('Source bbox outside image; supply full-resolution source')
roi = source[y0:y1, x0:x1]
hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
white = ((hsv[:,:,1] <= 100) & (hsv[:,:,2] >= 150)).astype(np.uint8)
# Remove isolated noise without eroding fine lettering strokes.
count, labels, stats, _ = cv2.connectedComponentsWithStats(white, 8)
clean = np.zeros(white.shape, np.float32)
for label in range(1, count):
    if stats[label, cv2.CC_STAT_AREA] >= 3: clean[labels == label] = 1
if clean.sum() < 20: raise RuntimeError('White-thread mask empty: inspect bbox/thresholds')
alpha = np.zeros((height, width), np.float32)
alpha[y0:y1,x0:x1] = cv2.GaussianBlur(clean, (5,5), .65)
cv2.imwrite(os.path.join(out, 'source_mask.png'), np.uint8(alpha * 255))
cv2.imwrite(os.path.join(out, 'source_bbox_4x.png'), cv2.resize(roi, None, fx=4, fy=4, interpolation=cv2.INTER_NEAREST))
premultiplied = source.astype(np.float32) * alpha[:,:,None]
orb = cv2.ORB_create(nfeatures=6000, scaleFactor=1.2, nlevels=8, fastThreshold=10)
def features(image):
    ratio = min(1., 1400. / max(image.shape[:2]))
    small = cv2.resize(image, None, fx=ratio, fy=ratio) if ratio < 1 else image
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    keypoints, descriptors = orb.detectAndCompute(gray, None)
    return keypoints, descriptors, ratio
source_keys, source_descriptors, source_ratio = features(source)
if source_descriptors is None: raise RuntimeError('No source ORB descriptors')
matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
capture = cv2.VideoCapture(video)
if not capture.isOpened(): raise RuntimeError('Cannot decode video')
fps = capture.get(cv2.CAP_PROP_FPS)
frame_width, frame_height = int(capture.get(3)), int(capture.get(4))
if not fps or not frame_width or not frame_height: raise RuntimeError('Invalid video metadata')
raw_video = os.path.join(out, 'overlay_intermediate.avi')
writer = cv2.VideoWriter(raw_video, cv2.VideoWriter_fourcc(*'MJPG'), fps, (frame_width, frame_height))
if not writer.isOpened(): raise RuntimeError('Cannot open local video writer')
rows, previews = [], []
total_hint = max(1, int(capture.get(cv2.CAP_PROP_FRAME_COUNT)))
sample_indices = set(np.linspace(0, max(0,total_hint-1), 6).astype(int).tolist())
corners = np.float32([[[x0,y0],[x1,y0],[x1,y1],[x0,y1]]])
index = 0
try:
  while True:
    ok, frame = capture.read()
    if not ok: break
    keys, descriptors, ratio = features(frame)
    good, homography, inliers, errors = [], None, 0, None
    projected = None
    if descriptors is not None and len(descriptors) >= 2:
      pairs = matcher.knnMatch(source_descriptors, descriptors, k=2)
      good = [pair[0] for pair in pairs if len(pair)==2 and pair[0].distance < .75*pair[1].distance]
      if len(good) >= 4:
        original = np.float32([source_keys[m.queryIdx].pt for m in good]).reshape(-1,1,2) / source_ratio
        target = np.float32([keys[m.trainIdx].pt for m in good]).reshape(-1,1,2) / ratio
        homography, mask = cv2.findHomography(original, target, cv2.RANSAC, 3., maxIters=4000, confidence=.995)
        if homography is not None and np.isfinite(homography).all():
          keep = mask.ravel().astype(bool)
          inliers = int(keep.sum())
          reprojection = cv2.perspectiveTransform(original, homography)
          distances = np.linalg.norm(reprojection-target, axis=2).ravel()[keep]
          if len(distances): errors = distances
          projected = cv2.perspectiveTransform(corners, homography)[0]
    valid = bool(inliers >= 25 and projected is not None and np.isfinite(projected).all())
    reason = 'overlay' if valid else 'inliers_below_25'
    if valid:
      # Reject only nonphysical/offscreen mappings; never invent a missing location.
      area = abs(cv2.contourArea(projected))
      left, top = np.floor(projected.min(axis=0)).astype(int)
      right, bottom = np.ceil(projected.max(axis=0)).astype(int)
      valid = bool(area >= 4 and area <= frame_width*frame_height*.5 and right>0 and bottom>0 and left<frame_width and top<frame_height)
      if not valid: reason = 'invalid_or_offscreen_mapping'
    output = frame.copy()
    if valid:
      warped_alpha = cv2.warpPerspective(alpha, homography, (frame_width,frame_height), flags=cv2.INTER_LINEAR)
      warped_color = cv2.warpPerspective(premultiplied, homography, (frame_width,frame_height), flags=cv2.INTER_LINEAR)
      output = np.uint8(np.clip(warped_color + frame.astype(np.float32)*(1-warped_alpha[:,:,None]),0,255))
    # Skipped frames remain untouched in MP4; the CSV and panel mark them explicitly.
    writer.write(output)
    rows.append(dict(frame=index, time_seconds=round(index/fps,6), good_matches=len(good), inliers=inliers,
      reprojection_mean_px=float(errors.mean()) if errors is not None else None,
      reprojection_median_px=float(np.median(errors)) if errors is not None else None,
      overlaid=valid, reason=reason))
    if index in sample_indices:
      if valid:
        left,top=max(0,left-6),max(0,top-6)
        right,bottom=min(frame_width,right+6),min(frame_height,bottom+6)
        before, after = frame[top:bottom,left:right],output[top:bottom,left:right]
        before, after = [cv2.resize(crop,None,fx=4,fy=4,interpolation=cv2.INTER_NEAREST) for crop in (before,after)]
      else:
        before,after = [np.full((220,480,3),35,np.uint8) for _ in range(2)]
      previews.append((index, valid, inliers, before, after))
    index += 1
finally:
  capture.release()
  writer.release()
if not rows: raise RuntimeError('No video frames decoded')
with open(os.path.join(out,'frame_metrics.csv'),'w',newline='') as handle:
  csv_writer=csv.DictWriter(handle,fieldnames=list(rows[0]));csv_writer.writeheader();csv_writer.writerows(rows)
# Preserve the exact 4x crop scale; pad cells instead of resizing them a second time.
cell_w=max(item[3].shape[1] for item in previews)
cell_h=max(item[3].shape[0] for item in previews)+45
panel=np.full((cell_h*len(previews),cell_w*2,3),25,np.uint8)
for row,(idx,valid,n,before,after) in enumerate(previews):
  for col,crop in enumerate((before,after)):
    y,x=row*cell_h+45,col*cell_w
    panel[y:y+crop.shape[0],x:x+crop.shape[1]]=crop
    text=f'{"BEFORE" if col==0 else "AFTER"} frame {idx} ({idx/fps:.2f}s), inliers {n}, '+('4x' if valid else 'SKIPPED: no verified crop')
    cv2.putText(panel,text,(x+8,row*cell_h+26),cv2.FONT_HERSHEY_SIMPLEX,.48,(230,230,230),1,cv2.LINE_AA)
cv2.imwrite(os.path.join(out,'comparison.png'),panel)
errors=[row['reprojection_mean_px'] for row in rows if row['reprojection_mean_px'] is not None]
summary=dict(status='processed',frames=len(rows),overlaid=sum(row['overlaid'] for row in rows),
  overlay_ratio=sum(row['overlaid'] for row in rows)/len(rows),
  inliers_min=min(row['inliers'] for row in rows),inliers_median=float(np.median([row['inliers'] for row in rows])),
  inliers_max=max(row['inliers'] for row in rows),reprojection_mean_px=float(np.mean(errors)) if errors else None,
  bbox=[x0,y0,x1,y1],mask_pixels=int(clean.sum()),fps=fps,
  limitation='Planar global homography does not model garment folds, occlusion or local deformation; inspect the panel.')
subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-y','-i',raw_video,'-i',video,
  '-map','0:v:0','-map','1:a?','-c:v','libx264','-crf','17','-pix_fmt','yuv420p','-c:a','aac','-shortest',os.path.join(out,'overlay.mp4')],check=True)
with open(os.path.join(out,'summary.json'),'w') as handle: json.dump(summary,handle,indent=2)
print(json.dumps(summary,indent=2))
`;
const candidates = [process.env.EMBROIDERY_PYTHON, 'python', 'python3', 'py'].filter(Boolean);
const interpreter = candidates.find(candidate => spawnSync(candidate, ['-c', 'import cv2,numpy'], { windowsHide: true, stdio: 'ignore', timeout: 10000 }).status === 0);
if (!interpreter) {
  console.error('No usable Python with cv2/numpy. Set EMBROIDERY_PYTHON to an existing interpreter.');
  process.exit(3);
}
const result = spawnSync(interpreter, ['-c', program, video, source, directory, ffmpeg], { windowsHide: true, stdio: 'inherit' });
process.exit(result.status ?? 1);
