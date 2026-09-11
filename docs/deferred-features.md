# Deferred features

The complete implementations of features intentionally excluded from the launch application are preserved on the `deferred-features` branch at commit `fe4da4f`.

That branch contains:

- the affiliate dashboard, referral attribution, commission ledger, and billing integration routes;
- the working AI clipping studio, downloader, transcription, selection, rendering pipeline, and ZIP downloads;
- multi-workspace creation, selection, editing, and onboarding controls;
- the standalone media library interface and bulk-download flow; and
- bulk composer controls for creating and editing several posts in one batch.

The active application branch keeps the Clipping studio coming-soon page, the single automatically created default workspace, direct media attachment in the composer, and the active publishing features. Restore a deferred feature by bringing its implementation forward from `deferred-features` when it is ready for product and operational review.
