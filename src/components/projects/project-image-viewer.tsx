"use client";

import { Button } from "@/components/ui/button";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

type ProjectImageViewerProps = {
  src: string;
  alt: string;
  open: boolean;
  closeLabel: string;
  zoomInLabel: string;
  zoomOutLabel: string;
  resetLabel: string;
  onOpenChange: (open: boolean) => void;
  downloadControl?: ReactNode;
};

type Point = { x: number; y: number };

const MIN_SCALE = 1;
const MAX_SCALE = 8;
const IMAGE_GUTTER = 16;

export function ProjectImageViewer({ src, alt, open, closeLabel, zoomInLabel, zoomOutLabel, resetLabel, onOpenChange, downloadControl }: ProjectImageViewerProps) {
  const t = useTranslations("Dashboard.project.outputs");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const dragOriginRef = useRef<{ point: Point; pan: Point } | null>(null);
  const pinchRef = useRef<{ distance: number; scale: number; center: Point } | null>(null);
  const [scale, setScale] = useState(MIN_SCALE);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const scaleRef = useRef(scale);
  const panRef = useRef(pan);

  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { panRef.current = pan; }, [pan]);

  const fittedSize = useMemo(() => {
    if (!naturalSize.width || !naturalSize.height || !viewportSize.width || !viewportSize.height) return { width: 0, height: 0 };
    const availableWidth = Math.max(0, viewportSize.width - IMAGE_GUTTER * 2);
    const availableHeight = Math.max(0, viewportSize.height - IMAGE_GUTTER * 2);
    const fitScale = Math.min(availableWidth / naturalSize.width, availableHeight / naturalSize.height, 1);
    return { width: naturalSize.width * fitScale, height: naturalSize.height * fitScale };
  }, [naturalSize, viewportSize]);

  const updatePan = useCallback((nextPan: Point) => {
    panRef.current = nextPan;
    setPan(nextPan);
  }, []);

  const fit = useCallback(() => {
    scaleRef.current = MIN_SCALE;
    panRef.current = { x: 0, y: 0 };
    setScale(MIN_SCALE);
    setPan({ x: 0, y: 0 });
    pointersRef.current.clear();
    dragOriginRef.current = null;
    pinchRef.current = null;
    setDragging(false);
  }, []);

  const bounds = useCallback((nextScale: number) => {
    const width = fittedSize.width * nextScale;
    const height = fittedSize.height * nextScale;
    return {
      x: Math.max(0, (width - viewportSize.width) / 2 + IMAGE_GUTTER),
      y: Math.max(0, (height - viewportSize.height) / 2 + IMAGE_GUTTER),
    };
  }, [fittedSize, viewportSize]);

  const clampPan = useCallback((value: Point, nextScale: number) => {
    const limit = bounds(nextScale);
    return { x: Math.max(-limit.x, Math.min(limit.x, value.x)), y: Math.max(-limit.y, Math.min(limit.y, value.y)) };
  }, [bounds]);

  const zoomAt = useCallback((nextScale: number, point?: Point) => {
    const boundedScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));
    const origin = point ?? { x: viewportSize.width / 2, y: viewportSize.height / 2 };
    const ratio = boundedScale / scaleRef.current;
    const centered = { x: origin.x - viewportSize.width / 2, y: origin.y - viewportSize.height / 2 };
    const nextPan = { x: centered.x - (centered.x - panRef.current.x) * ratio, y: centered.y - (centered.y - panRef.current.y) * ratio };
    scaleRef.current = boundedScale;
    setScale(boundedScale);
    updatePan(clampPan(nextPan, boundedScale));
  }, [clampPan, updatePan, viewportSize]);

  useEffect(() => {
    updatePan(clampPan(panRef.current, scaleRef.current));
  }, [clampPan, updatePan]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      fit();
      dialog.showModal();
      dialog.querySelector<HTMLButtonElement>(".project-lightbox-close")?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [fit, open]);

  useEffect(() => {
    if (!open || !viewportRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewportSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault(); zoomAt(scaleRef.current * 1.2);
      } else if (event.key === "-") {
        event.preventDefault(); zoomAt(scaleRef.current / 1.2);
      } else if (event.key === "0") {
        event.preventDefault(); fit();
      } else if (event.key.startsWith("Arrow") && scaleRef.current > MIN_SCALE) {
        event.preventDefault();
        const delta = event.key === "ArrowLeft" ? { x: 60, y: 0 } : event.key === "ArrowRight" ? { x: -60, y: 0 } : event.key === "ArrowUp" ? { x: 0, y: 60 } : { x: 0, y: -60 };
        updatePan(clampPan({ x: panRef.current.x + delta.x, y: panRef.current.y + delta.y }, scaleRef.current));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clampPan, fit, onOpenChange, open, updatePan, zoomAt]);

  function close() {
    onOpenChange(false);
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 1) {
      dragOriginRef.current = { point: { x: event.clientX, y: event.clientY }, pan: panRef.current };
      setDragging(true);
    } else if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      pinchRef.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: scaleRef.current, center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      dragOriginRef.current = null;
      setDragging(false);
    }
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [a, b] = Array.from(pointersRef.current.values());
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = viewportRef.current?.getBoundingClientRect();
      if (rect) zoomAt(pinchRef.current.scale * (distance / pinchRef.current.distance), { x: pinchRef.current.center.x - rect.left, y: pinchRef.current.center.y - rect.top });
    } else if (dragOriginRef.current) {
      const origin = dragOriginRef.current;
      updatePan(clampPan({ x: origin.pan.x + event.clientX - origin.point.x, y: origin.pan.y + event.clientY - origin.point.y }, scaleRef.current));
    }
  }

  function onPointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 1) {
      const remaining = Array.from(pointersRef.current.values())[0];
      dragOriginRef.current = { point: remaining, pan: panRef.current };
    } else {
      dragOriginRef.current = null;
      setDragging(false);
    }
  }

  function onDoubleClick(event: React.MouseEvent<HTMLDivElement>) {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (scaleRef.current > MIN_SCALE) fit();
    else zoomAt(2.25, { x: event.clientX - rect.left, y: event.clientY - rect.top });
  }

  return <dialog ref={dialogRef} className="project-lightbox" aria-label={alt} onCancel={(event) => { event.preventDefault(); close(); }} onClose={() => { fit(); triggerRef.current?.focus(); }} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <Button variant="icon" size="sm" type="button" className="project-lightbox-close" aria-label={closeLabel} onClick={close}>×</Button>
    <div ref={viewportRef} className={`project-lightbox-viewport${dragging ? " is-dragging" : scale > MIN_SCALE ? " is-zoomed" : ""}`} onWheel={(event) => { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); zoomAt(scaleRef.current * Math.exp(-event.deltaY * 0.002), { x: event.clientX - rect.left, y: event.clientY - rect.top }); }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onDoubleClick={onDoubleClick}>
      {/* Private signed URLs intentionally bypass the public image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={imageRef} className="project-lightbox-image" src={src} alt={alt} draggable={false} onLoad={(event) => setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} style={{ width: fittedSize.width || undefined, height: fittedSize.height || undefined, transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})` }} />
    </div>
    <div className="project-lightbox-controls" aria-label={t("zoomControls")}>
      <Button variant="icon" size="sm" type="button" aria-label={zoomOutLabel} onClick={() => zoomAt(scaleRef.current / 1.2)}>−</Button>
      <output aria-live="polite">{Math.round(scale * 100)}%</output>
      <Button variant="icon" size="sm" type="button" aria-label={zoomInLabel} onClick={() => zoomAt(scaleRef.current * 1.2)}>+</Button>
      <Button variant="secondary" size="sm" type="button" className="project-lightbox-reset" aria-label={resetLabel} onClick={fit}>{resetLabel}</Button>
      {downloadControl}
    </div>
  </dialog>;
}
