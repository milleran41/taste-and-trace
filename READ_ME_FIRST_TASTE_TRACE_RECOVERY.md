# READ ME FIRST - Taste & Trace Recovery Notes

Date: 2026-07-14

This file is a handoff note for the next Codex session. Read this first before changing anything in Taste & Trace.

## Repositories

- Private/source repository: `milleran41/taste-and-trace`
- Public/download repository: `milleran41/taste-and-trace-download`

The source repository should remain private. The download repository should remain public and contain only public description/download files and release assets.

## Current Safe Public Download

The only recommended public build right now is:

```text
Taste.Trace-Portable-0.0.0-x64.exe
```

Release:

```text
https://github.com/milleran41/taste-and-trace-download/releases/tag/v0.0.0
```

Direct download:

```text
https://github.com/milleran41/taste-and-trace-download/releases/download/v0.0.0/Taste.Trace-Portable-0.0.0-x64.exe
```

Known size:

```text
167,849,181 bytes
```

Do not recommend `0.0.1` or installer builds `0.1.0` - `0.1.3`.

## What Happened

Several attempts were made to create a normal installer and then a new portable build. These attempts caused packaging/runtime problems:

- installer builds opened as a blank window;
- one build opened a `404` page because routing was wrong for Electron/file URLs;
- the portable `0.0.1` build created by GitHub Actions had a different icon and opened as a blank window;
- the old portable `0.0.0` later showed CSS/code in the app window on the user's laptop, likely because Electron/Chromium Service Worker cache was polluted by broken test builds.

The public README was restored to recommend only portable `0.0.0`.

## Important Commits

Private/source repository:

- `457caff6af4475f42ea8fadab66f48c8bb4c847c`
  Restored source tree to the working state before installer changes.

- `49803328f11fb3c037ad933558c73ed37e241b0d`
  Made the start page lighter: recipes/favorites load only after user request.

- `bc7e014472cb829645b99c0604efb9f08b78d13b`
  Fixed stale recipe detail after editing by refreshing the recipe query cache.

- `dbd22d05b669c928fc8d46f8a96aba7e8fe1af08`
  Added a back button on the favorites page.

- `8749a5f11615e53e34738da27b1ff8b1ddcd0000`
  Moved the favorites back arrow next to the "Favorite recipes" heading.

- `27f8a370372a8a6c31cb01458935c90312127e7b`
  Added a GitHub Actions workflow for portable builds. This produced a bad `0.0.1` portable build and should not be trusted until reviewed.

Public/download repository:

- `7faaedfa86706c2af0039de96f97a1289b4f0432`
  Restored README recommendation to portable `0.0.0` and marked `0.0.1` as under review.

## User-Visible Problems Still To Solve

1. New source changes are not visible in the public working app.
   The private source has useful fixes, but the public working portable build is still old `0.0.0`.

2. Need a correct build process for the original working portable app.
   The old working portable was about 168 MB. The GitHub Actions portable build was about 66 MB and behaved differently, so it was likely not the same packaging method/configuration.

3. Editing an existing recipe in `0.0.0` appears to save only after fully restarting the app.
   This is already fixed in source commit `bc7e014...`, but users cannot see it until a correct new portable build is created.

4. Favorites page needs a visible back arrow.
   This is already fixed in source commit `8749a5...`, but users cannot see it until a correct new portable build is created.

5. Startup is slow.
   The source now has a lighter start page in commit `498033...`, but users cannot see it until a correct new portable build is created.

6. Electron/Chromium cache can become polluted after bad builds.
   If the app window shows CSS/code instead of the UI, clear app cache folders under:

```text
%APPDATA%\taste-and-trace
%APPDATA%\taste-and-trace-desktop
```

Only clear cache-like folders such as:

```text
Cache
Code Cache
GPUCache
Service Worker
Network
Session Storage
```

Do not delete recipe data or source files.

## Do Not Do This Again

- Do not create or publish another installer until the desktop packaging is understood and tested locally.
- Do not rely on the `build-windows-portable.yml` workflow until it is reviewed against the original working build process.
- Do not change recipe/category logic casually. The user explicitly said those flows worked:
  - preset categories existed;
  - categories could be renamed;
  - recipes could be dragged inside a category;
  - recipes could be moved to another category through editing.
- Do not publish new public `.exe` files without testing that the actual downloaded file opens correctly.

## Recommended Next Session Plan

When the user returns from the main computer:

1. Locate the original project/build environment that produced:

```text
Taste.Trace-Portable-0.0.0-x64.exe
```

2. Find the exact build command/tool/configuration used for that working 168 MB portable build.

3. Compare that build configuration with the current repository:

```text
electron/package.json
electron/main.js
vite.config.ts
package.json
```

4. Build locally on the main computer using the original known-good method.

5. Test the new portable build manually before publishing:

- app opens normal UI, not blank;
- no CSS/code visible in the window;
- favorites page has a back arrow;
- editing an existing recipe shows changes without full app restart;
- start page opens faster and does not load all recipes immediately;
- categories and drag/move behavior still work.

6. Only after successful manual testing, publish a new public release, preferably:

```text
v0.0.2
Taste.Trace-Portable-0.0.2-x64.exe
```

7. Update the public README only after the new build is verified.

## Current Recommendation

Until the build process is recovered and verified, keep public downloads pointed to:

```text
Portable 0.0.0
```

and keep all newer portable/installer builds marked as under review or not recommended.

## 2026-08-08 Recovery Update

Original local source/build environment was found at:

```text
C:\Users\Hyrican\Desktop\Готовые приложения\Кулинарная книга\taste-and-trace-main
```

That source contains the original root-level build path documented in `Текстовый документ.txt`:

```text
npm run build
npm run electron:build:x64
```

Recovered source-side build configuration from that folder:

- root `package.json` now has `main: electron/main.cjs`;
- root `package.json` now has `start`, `electron:build`, and `electron:build:x64` scripts;
- root `package.json` now has the old `electron-builder` portable config that outputs to `release`;
- `vite.config.ts` now has `base: './'` for Electron/file URL loading;
- `electron/main.cjs` was restored from the original source and includes the context menu behavior;
- `public/icons/icon.ico` and `public/icons/icon.icns` were restored;
- `build-windows-portable.yml` was changed to use the root build path instead of the previously suspicious `pnpm --dir electron` path.

Verification performed:

```text
npm install
npm run build
npm run electron:build:x64 -- --publish never
```

Result:

```text
release\Taste & Trace-Portable-0.0.0-x64.exe
78,643,745 bytes
```

This build completed successfully, but it is smaller than the old trusted public build size in these notes. The size difference is likely because the old local `dist` folder contained stale assets from earlier builds, while the new test build generated a clean `dist`.

Do not publish this new `.exe` publicly until it has been manually launched and tested on Windows:

- app opens normal UI, not blank;
- no CSS/code visible in the window;
- favorites page has a back arrow;
- editing an existing recipe shows changes without full app restart;
- start page opens faster and does not load all recipes immediately;
- categories and drag/move behavior still work.
