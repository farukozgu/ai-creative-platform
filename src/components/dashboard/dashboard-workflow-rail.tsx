"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { DashboardIcon } from "./dashboard-icons";
import styles from "./dashboard-home.module.css";

type DashboardWorkflowRailProps = {
  children: ReactNode;
  label: string;
  previousLabel: string;
  nextLabel: string;
};

export function DashboardWorkflowRail({ children, label, previousLabel, nextLabel }: DashboardWorkflowRailProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ start: true, end: false });
  const updateBounds = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    setBounds({ start: rail.scrollLeft <= 1, end: rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 1 });
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    updateBounds();
    const observer = new ResizeObserver(updateBounds);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [updateBounds]);

  const move = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: direction * rail.clientWidth * 0.8, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };

  return (
    <div className={styles.railWrap}>
      <div className={styles.railControls}>
        <button type="button" aria-label={previousLabel} disabled={bounds.start} onClick={() => move(-1)}><DashboardIcon name="arrow" /></button>
        <button type="button" aria-label={nextLabel} disabled={bounds.end} onClick={() => move(1)}><DashboardIcon name="arrow" /></button>
      </div>
      <div ref={railRef} className={styles.rail} role="region" aria-label={label} tabIndex={0} onScroll={updateBounds} onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          move(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}>{children}</div>
    </div>
  );
}
