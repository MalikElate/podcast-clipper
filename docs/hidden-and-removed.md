# Hidden and removed product surfaces

Last updated: 2026-09-11

This file records product surfaces intentionally hidden or removed from the current Meadow interface. It distinguishes UI changes from backend capabilities that still exist.

## Hidden

### Affiliate program

- The **Affiliate program** item is hidden from Configuration.
- Direct navigation to the affiliate dashboard is disabled.
- Enrollment, attribution, commission data, and backend routes remain intact.
- Restore the interface with `SHOW_AFFILIATE_PROGRAM` in `frontend/src/bridge/BridgeApp.jsx`.

### Workspace controls

- The workspace selector is hidden from the sidebar.
- The **New workspace** action is hidden.
- The sidebar shortcut for workspace settings is hidden.
- The create/edit workspace modal and empty-account workspace onboarding are hidden.
- Meadow automatically creates and selects one default workspace for a first-time user. Project ownership, isolation, storage, and API routes remain intact for the later workspace interface.
- Restore the controls with `SHOW_WORKSPACE_CONTROLS` in `frontend/src/bridge/BridgeApp.jsx`.

### Clipping studio implementation

- The working Clipping studio interface is hidden behind a coming-soon page.
- The **Clipping studio** navigation item remains visible and opens that page.
- `ClippingStudio.jsx`, clipping jobs, backend routes, media generation, and download behavior remain unchanged.
- Restore the working interface with `SHOW_CLIPPING_STUDIO` in `frontend/src/bridge/BridgeApp.jsx`.

### Media library navigation

- The standalone **Media library** item and route are hidden from the main navigation.
- Media persistence and backend media endpoints remain in use for post attachments and generated clips.

## Removed

### Create-post media library picker

- The saved-media chooser modal was removed from Create post and queued-post editing.
- **Add media** now opens the device file picker and attaches selected files to the current post.

### Bulk upload shortcut

- The **Upload files as posts** footer button was removed.
- Selecting multiple files through **Add media** now adds them to the current post instead of creating one post per file.

### Inline publishing-time controls

- The **Publishing time** panel was removed from each post editor.
- The related **Publishing time** batch-copy action was removed.
- The posting-allowance explanation beneath that panel was removed.
- Immediate publishing now starts with **Review & publish** in the composer footer.
- Scheduling now starts with **Schedule**, which opens a focused date, time, and timezone dialog.

### Posts status tabs

- The old Queue, Published, Needs attention, and All posts tabs were removed from the post list.
- Their navigation was replaced by the **Posts** sidebar group: Calendar, All, Scheduled, Posted, Drafts, Failed, and Analytics.

## Renamed or redesigned

- **Social accounts** was renamed to **Connections** and changed from a platform grid into a horizontally scrolling column board.
- The previous single **Review schedule** composer action was replaced by **Review & publish** and **Schedule**.
