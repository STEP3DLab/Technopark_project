# Minimal communication UI — v0.16

## Purpose
Replace the dense dashboard with three clearly labelled modes: message, gesture input, and gesture vocabulary. Keep the production v0.15 communication controller and 3D avatar. No recognition model, motion assets, source video, or avatar geometry changes are included.

## Changes
- One message editor and three main actions: show, copy, share.
- Three quick text phrases; the full searchable phrasebook opens in a dialog.
- Reply, history, display preferences, saved-draft consent, and demonstration tools are disclosed on demand.
- One camera stage. The result card appears only after an actual attempt; explicit confirmation precedes insertion. Rejected results do not enter the message.
- One vocabulary word picker and one 3D scene. Playback and orbit controls are in expandable settings; the original 3D controller is retained.
- No routine typing notifications visually competing with the editor. They remain available to assistive technology. Failure messages remain visible.
- Main navigation, footer, typography, spacing, touch controls, focus treatment and dialogs share a restrained visual language.
- History deletion requires a second explicit click in the history sheet.
- Existing element nodes are reparented rather than cloned. Original event listeners, data provenance, opt-in draft storage and media lifecycle remain in place.
- The new stylesheet and entry module are part of the versioned offline asset manifest (54 curated resources). The unchanged v0.15 module dependencies are explicitly allowed by the v0.16 cache canonicalizer.

## Verification
190 Node tests passed. Syntax checks passed. The six source video hashes and motion provenance checks passed.

62 isolated Chromium UI checks passed. Coverage includes the three modes at widths 320, 360, 390, 768, 1280 and 1440 pixels; text insertion and undo; showing a message; two-way replies; copy/share payloads and failure/cancellation; storage consent; readability preferences; camera-denial recovery; source replay, explicit confirmation and demo provenance; all six 3D motion loads, playback and enlarged stage.

The initial message screen has 62 rendered whitespace-separated words in this test. This is not a readability or user-comprehension score.

### Test boundaries
The browser used an isolated DOM containing the actual local HTML/CSS and JavaScript transpiled into an async CommonJS test harness. Video and coordinate fixtures were supplied from the repository. No live-site navigation was used. Clipboard/share and camera-denial APIs were stubbed. The existing software 3D renderer was exercised; hardware WebGL, live-camera recognition quality and real messenger delivery were not assessed. User testing with sign-language users has not been performed.

### Concurrent changes
The redesign was reconciled onto commit c46ba88768d68c8b36bc53272ce11354a5c31f6a (v0.15), not the earlier v0.13 snapshot. The newly introduced skinned 3D avatar, phrasebook, personal profiles and communication controller are preserved.
