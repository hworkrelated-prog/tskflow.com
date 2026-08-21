"""Screen recording: camera follows the selected display; save keeps preview."""
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ROOT = REPO / "frontend" / "src"


def _read(*parts: str) -> str:
    return (ROOT.joinpath(*parts)).read_text(encoding="utf-8")


def test_match_screen_algorithm():
    result = subprocess.run(
        ["node", str(REPO / "tests" / "test_recording_display.mjs")],
        cwd=REPO,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_camera_overlay_is_placed_on_matched_screen():
    overlay = _read("lib", "recordingCameraOverlay.js")
    hud = _read("lib", "recordingHudOverlay.js")
    display = _read("lib", "recordingDisplay.js")
    rec = _read("components", "ScreenRecorder.js")
    picker = _read("components", "AttachmentPicker.js")
    assert "matchScreenToCapture" in display
    assert "other-display" in display
    assert "openRecordingHudOverlay" in overlay or "openRecordingCameraOverlay" in overlay
    assert "openRecordingHudOverlay" in hud
    assert "prepareRecordingHudOverlay" in hud
    assert "prepareRecordingHudOverlay" in rec
    assert "prepareRecordingHudOverlay" in picker
    assert "openRecordingHudOverlay" in rec
    assert "openRecordingHudOverlay" in picker
    assert "placedOnOtherDisplay" in rec
    assert rec.index("prepareRecordingHudOverlay") < rec.index("setCountdown(n)")


def test_one_click_record_from_plus_menu():
    quick = _read("components", "AIQuickCreate.js")
    picker = _read("components", "AttachmentPicker.js")
    assert "recordPickerRef" in quick
    assert "startComposerRecording" in quick
    assert "startRecording?.()" in quick or "startRecording()" in quick
    # Both Record entry points share the same one-click starter (no empty options bar).
    assert quick.count("onClick={startComposerRecording}") >= 2
    assert 'showRecordPicker' not in quick
    assert "rounded-xl border border-slate-200 bg-white p-3" not in quick.split('ai-inline-recorder')[0][-200:] + quick.split('ai-inline-recorder')[1][:400]
    assert "useImperativeHandle" in picker
    assert "compact" in picker
    assert 'showCommandChips = false' in quick


def test_composer_record_button_starts_capture():
    quick = _read("components", "AIQuickCreate.js")
    toolbar = quick[quick.index("relative z-[1] flex items-center justify-between") : quick.index("ai-inline-recorder")]
    # Slice each button from its onClick through its test id.
    record_btn = toolbar[toolbar.rfind("onClick=", 0, toolbar.index('data-testid="ai-record-btn"')) : toolbar.index('data-testid="ai-record-btn"') + 40]
    assert "startComposerRecording" in record_btn
    assert "setShowRecordPicker" not in record_btn
    menu_btn = toolbar[toolbar.rfind("onClick=", 0, toolbar.index('data-testid="ai-screen-record-btn"')) : toolbar.index('data-testid="ai-screen-record-btn"') + 40]
    assert "startComposerRecording" in menu_btn


def test_save_recording_auto_closes_preview():
    picker = _read("components", "AttachmentPicker.js")
    assert "return ref;" in picker
    assert "return null;" in picker
    save_fn = picker.split("const handleSaveRecording")[1].split("const handleDiscardRecording")[0]
    # After a successful save the preview closes — no Record Again / Done detour.
    assert "setShowPreview(false)" in save_fn
    assert "setPreviewBlob(null)" in save_fn
    assert "if (!ref) return;" in save_fn
    assert "Recording saved to this task" in save_fn
    assert "recording-preview-done" not in picker
    assert "recording-preview-frame" in picker
    assert "object-contain" in picker
    assert "replayAttachment" in picker
    assert "recording-preview-video" in picker


def test_single_recording_control_surface():
    rec = _read("components", "ScreenRecorder.js")
    picker = _read("components", "AttachmentPicker.js")
    assert "hudOverlayOpen" in rec
    assert "recording && !hudOverlayOpen" in rec
    assert "recording && !hudOverlayOpen" in picker
    assert "recording-pip-hint" in rec
    assert "Drag the recording controls onto the screen" in picker or "Drag the recording controls" in rec


def test_controls_are_a_toolbar_not_a_chrome_popup():
    overlay = _read("lib", "recordingControlsOverlay.js")
    hud = _read("lib", "recordingHudOverlay.js")
    popup = _read("pages", "RecordingControlsPopup.js")
    rec = _read("components", "ScreenRecorder.js")
    camera = _read("lib", "recordingCameraOverlay.js")
    floating = _read("components", "RecordingFloatingHud.js")
    assert "disallowReturnToOpener" in hud
    assert "recording-controls-toolbar" in hud
    assert "window.open(" not in overlay
    assert "window.open(" not in hud
    assert "window.open('/recording/controls'" not in overlay
    assert "shortened Chrome tab" in overlay or "shortened tab" in overlay or "shortened tab" in hud
    assert "recordingOverlayNeeded" in overlay or "recordingOverlayNeeded" in hud
    assert "recordingOverlayNeeded" in rec
    assert "recording-controls-toolbar" in popup
    assert "rounded-full bg-slate-950/60" not in popup
    assert "placedOnOtherDisplay" in camera
    assert "tiny Chrome tab" in camera or "same-display popup" in camera
    assert "recording-floating-bar" in floating
    assert "recording-camera-bubble" in floating
    assert "RecordingFloatingHud" in rec


def test_editor_keeps_preview_after_save():
    editor = _read("pages", "RecordingEditorPage.js")
    save_fn = editor.split("const saveAndShare")[1].split("const copyLink")[0]
    assert "clearRecordingBlob" not in save_fn
    assert "fileUrl" in editor


def test_options_hide_when_permissions_granted():
    picker = _read("components", "AttachmentPicker.js")
    assert "show-recording-options" in picker
    assert "permissions.query" in picker
    assert "Already allowed" in picker or "already allowed" in picker


def test_player_progress_bar_has_contrast():
    player = _read("components", "LoomPlayer.js")
    assert "progress-fill" in player
    assert "progress-thumb" in player
    assert "bg-rose-400" in player or "bg-rose-500" in player
    assert "h-2" in player
    assert "chromeVisible = true" in player
