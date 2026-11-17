/** Rotate the configured homepage wallpapers and synchronize their extracted accents. · refs: none */
"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  DEFAULT_CUSTOM_WALLPAPER_ROTATION_MS,
  getCustomWallpaperRotationMs,
  getWallpaperEnabled,
  resolveCustomWallpapers,
  type CustomWallpaperRotationMs,
  type ResolvedCustomWallpaper,
  WALLPAPER_CHANGE_EVENT,
} from "@/lib/wallpaper-preference";
import { BUILT_IN_WALLPAPER_INTERVAL_MS, WALLPAPER_TRANSITION_MS, DEFAULT_WALLPAPERS, randomizeWallpaperOrder, type BuiltInWallpaper } from "@/lib/wallpaper-images";
import {
  extractWallpaperAccents,
  HOME_CAT_ACCENT_PROPERTY,
  HOME_PLATFORM_ACCENT_PROPERTY,
  HOME_THIRD_ACCENT_PROPERTY,
  HOME_FOURTH_ACCENT_PROPERTY,
} from "@/lib/wallpaper-accent";

type WallpaperSlide = BuiltInWallpaper | string;

/**
 * MapSlideshow — rotating background slideshow of Paladins maps.
 *
 * Built-in maps cycle hourly; custom collections use their browser-local speed.
 * Starts with a deterministic first map to avoid SSR hydration mismatch,
 * then randomizes the client-side order after mount.
 * refs: none
 * I/O types: `none -> JSX.Element`.
 */
export default function MapSlideshow() {
  const [wallpaperEnabled, setWallpaperEnabled] = useState(true);
  const [customWallpapers, setCustomWallpapers] = useState<ResolvedCustomWallpaper[]>([]);
  const [customWallpaperIntervalMs, setCustomWallpaperIntervalMs] = useState<CustomWallpaperRotationMs>(DEFAULT_CUSTOM_WALLPAPER_ROTATION_MS);
  // Deterministic on server: always start at index 0
  const [index, setIndex] = useState(0);
  // Null until client mounts and shuffles
  const [order, setOrder] = useState<BuiltInWallpaper[] | null>(null);
  const mounted = useRef(false);
  const wallpaperActive = wallpaperEnabled;

  useEffect(() => {
    let active = true;
    let refreshVersion = 0;
    const syncWallpaperPreferences = async () => {
      const version = ++refreshVersion;
      setWallpaperEnabled(getWallpaperEnabled());
      setCustomWallpaperIntervalMs(getCustomWallpaperRotationMs());
      const wallpapers = await resolveCustomWallpapers().catch(() => []);
      if (active && version === refreshVersion) {
        setCustomWallpapers(wallpapers);
      } else {
        wallpapers.forEach((wallpaper) => {
          if (wallpaper.revoke) URL.revokeObjectURL(wallpaper.source);
        });
      }
    };
    void syncWallpaperPreferences();
    const handleWallpaperChange = () => void syncWallpaperPreferences();
    window.addEventListener(WALLPAPER_CHANGE_EVENT, handleWallpaperChange);
    window.addEventListener("storage", handleWallpaperChange);
    return () => {
      active = false;
      window.removeEventListener(WALLPAPER_CHANGE_EVENT, handleWallpaperChange);
      window.removeEventListener("storage", handleWallpaperChange);
    };
  }, []);

  useEffect(() => () => {
    customWallpapers.forEach((wallpaper) => {
      if (wallpaper.revoke) URL.revokeObjectURL(wallpaper.source);
    });
  }, [customWallpapers]);

  useEffect(() => {
    // Shuffle once on mount
    if (!mounted.current) {
      mounted.current = true;
      setOrder(randomizeWallpaperOrder(DEFAULT_WALLPAPERS));
    }
  }, []);

  const reduceMotion = useReducedMotion();
  const slides = useMemo<WallpaperSlide[] | null>(
    () => customWallpapers.length > 0 ? customWallpapers.map((wallpaper) => wallpaper.source) : order,
    [customWallpapers, order],
  );
  const rotationIntervalMs = customWallpapers.length > 0
    ? customWallpaperIntervalMs
    : BUILT_IN_WALLPAPER_INTERVAL_MS;

  useEffect(() => {
    setIndex(0);
  }, [customWallpapers]);

  useEffect(() => {
    if (!slides || slides.length <= 1) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, rotationIntervalMs);
    return () => clearInterval(id);
  }, [rotationIntervalMs, slides]);

  // Before client mount, render the first map in static order (matches SSR)
  const currentWallpaper = slides?.[index] ?? DEFAULT_WALLPAPERS[0];
  const currentWallpaperKey = typeof currentWallpaper === "string" ? currentWallpaper : currentWallpaper.avif;
  const currentWallpaperImage = typeof currentWallpaper === "string"
    ? `url(${JSON.stringify(currentWallpaper)})`
    : `image-set(url(${JSON.stringify(currentWallpaper.avif)}) type("image/avif"), url(${JSON.stringify(currentWallpaper.png)}) type("image/png"))`;
  const currentWallpaperAccentSource = typeof currentWallpaper === "string"
    ? currentWallpaper
    : currentWallpaper.avif;
  const currentWallpaperAccentFallback = typeof currentWallpaper === "string"
    ? undefined
    : currentWallpaper.png;

  useEffect(() => {
    let active = true;
    if (!wallpaperActive) {
      document.documentElement.style.removeProperty(HOME_CAT_ACCENT_PROPERTY);
      document.documentElement.style.removeProperty(HOME_PLATFORM_ACCENT_PROPERTY);
      document.documentElement.style.removeProperty(HOME_THIRD_ACCENT_PROPERTY);
      document.documentElement.style.removeProperty(HOME_FOURTH_ACCENT_PROPERTY);
      return () => { active = false; };
    }

    void extractWallpaperAccents(currentWallpaperAccentSource, currentWallpaperAccentFallback).then(({ primary, secondary, tertiary, fourth }) => {
      if (!active) return;
      if (primary) document.documentElement.style.setProperty(HOME_CAT_ACCENT_PROPERTY, primary);
      else document.documentElement.style.removeProperty(HOME_CAT_ACCENT_PROPERTY);
      if (secondary) document.documentElement.style.setProperty(HOME_PLATFORM_ACCENT_PROPERTY, secondary);
      else document.documentElement.style.removeProperty(HOME_PLATFORM_ACCENT_PROPERTY);
      if (tertiary) document.documentElement.style.setProperty(HOME_THIRD_ACCENT_PROPERTY, tertiary);
      else document.documentElement.style.removeProperty(HOME_THIRD_ACCENT_PROPERTY);
      if (fourth) document.documentElement.style.setProperty(HOME_FOURTH_ACCENT_PROPERTY, fourth);
      else document.documentElement.style.removeProperty(HOME_FOURTH_ACCENT_PROPERTY);
    });
    return () => { active = false; };
  }, [currentWallpaperAccentSource, currentWallpaperAccentFallback, wallpaperActive]);

  useEffect(() => () => {
    document.documentElement.style.removeProperty(HOME_CAT_ACCENT_PROPERTY);
    document.documentElement.style.removeProperty(HOME_PLATFORM_ACCENT_PROPERTY);
    document.documentElement.style.removeProperty(HOME_THIRD_ACCENT_PROPERTY);
    document.documentElement.style.removeProperty(HOME_FOURTH_ACCENT_PROPERTY);
  }, []);

  if (!wallpaperActive) {
    return (
      <div
        className="pc-wallpaper-viewport -z-10 bg-pc-bg"
        aria-hidden="true"
      />
    );
  }

  if (customWallpapers.length === 1) {
    return (
      <div
        className="pc-wallpaper-dimmed pc-wallpaper-image pc-wallpaper-viewport -z-10 bg-pc-bg"
        aria-hidden="true"
        style={{
          backgroundImage: `url(${JSON.stringify(customWallpapers[0].source)})`,
        }}
      />
    );
  }

  return (
    <div className="pc-wallpaper-dimmed pc-wallpaper-viewport -z-10 overflow-hidden" aria-hidden="true" style={{ backgroundColor: "var(--pc-bg)" }}>
      <AnimatePresence initial={false} mode="sync">
        <motion.div
          key={currentWallpaperKey}
          initial={reduceMotion ? undefined : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={reduceMotion ? undefined : { duration: WALLPAPER_TRANSITION_MS / 1000, ease: [0.4, 0, 0.2, 1] }}
          className="pc-wallpaper-image"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundImage: currentWallpaperImage,
            backfaceVisibility: "hidden",
            transform: "translateZ(0)",
            willChange: "opacity",
          }}
        />
      </AnimatePresence>
    </div>
  );
}
