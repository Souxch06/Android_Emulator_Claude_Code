---
name: android-visual-test
description: Visual verification and visual regression of Android screens on the remote cloud device - screenshot baselines, compare before/after, check layout, text truncation, overlaps, dark mode. Use for UI checks or "does it look right".
---

# Android visual testing

## Baselines
- Capture each key screen with `android_screenshot {name:"<screen>"}`; PNGs are saved under `android-cloud-artifacts/`. Copy chosen ones to `visual-baselines/<screen>.png` in the project as the reference.

## Comparing
- Re-capture the same screen in the same state (same data: `clear_data` first, same navigation steps).
- Pixel diff locally when ImageMagick or Python+Pillow exist:
  `magick compare -metric AE baseline.png current.png diff.png` (or a 5-line Pillow `ImageChops.difference` script). Report the changed-pixel count and the diff image.
- Otherwise compare by looking at both images yourself and say it was a visual (not pixel) comparison.
- Ignore volatile regions (status bar clock, cursors): crop the top ~80px before diffing.

## Checks per screen
Text truncated/overlapping, elements off-screen, wrong colors/contrast, missing icons, empty states, keyboard covering inputs, layout after `android_press back` and re-open. Combine with `android_inspect` bounds to prove overlap (intersecting bounds) rather than guessing.

Dark mode: toggle it through the Settings app UI (Display → Dark theme) with `android_launch_app {package:"com.android.settings"}` + tap/inspect, then re-capture each screen.
