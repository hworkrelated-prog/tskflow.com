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
    display = _read("lib", "recordingDisplay.js")
    rec = _read("components", "ScreenRecorder.js")
    picker = _read("components", "AttachmentPicker.js")
    assert "matchScreenToCapture" in display
    assert "other-display" in display
    assert "openRecordingCameraOverlay" in overlay
    assert "openRecordingCameraOverlay" in rec
    assert "openRecordingCameraOverlay" in picker
    assert "placedOnOtherDisplay" in rec
    assert rec.index("openRecordingCameraOverlay") < rec.index("setCountdown(n)")


def test_save_recording_keeps_preview_on_success_and_failure():
    picker = _read("components", "AttachmentPicker.js")
    assert "return ref;" in picker
    assert "return null;" in picker
    assert "setPreviewBlob(null)" in picker
    save_fn = picker.split("const handleSaveRecording")[1].split("const handleDiscardRecording")[0]
    assert "setShowPreview(false)" not in save_fn
    assert "setPreviewBlob(null)" not in save_fn
    assert "if (!ref) return;" in save_fn
    assert "replayAttachment" in picker
    assert "recording-preview-video" in picker


def test_controls_are_a_toolbar_not_a_chrome_popup():
    overlay = _read("lib", "recordingControlsOverlay.js")
    popup = _read("pages", "RecordingControlsPopup.js")
    rec = _read("components", "ScreenRecorder.js")
    camera = _read("lib", "recordingCameraOverlay.js")
    assert "disallowReturnToOpener" in overlay
    assert "recording-controls-toolbar" in overlay
    assert "window.open(" not in overlay
    assert "window.open('/recording/controls'" not in overlay
    assert "shortened Chrome tab" in overlay or "shortened tab" in overlay
    assert "recordingOverlayNeeded" in overlay
    assert "recordingOverlayNeeded" in rec
    assert "recording-controls-toolbar" in popup
    assert "rounded-full bg-slate-950/60" not in popup
    assert "placedOnOtherDisplay" in camera
    assert "tiny Chrome tab" in camera or "same-display popup" in camera


def test_editor_keeps_preview_after_save():
    editor = _read("pages", "RecordingEditorPage.js")
    save_fn = editor.split("const saveAndShare")[1].split("const copyLink")[0]
    assert "clearRecordingBlob" not in save_fn
    assert "fileUrl" in editor
