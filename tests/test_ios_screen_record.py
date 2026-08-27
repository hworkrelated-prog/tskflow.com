"""iPhone screen recording: Control Center attach flow when getDisplayMedia is missing."""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / "frontend" / "src"


def _read(*parts: str) -> str:
    return FRONT.joinpath(*parts).read_text(encoding="utf-8")


def test_ios_guide_is_wired_into_record_buttons():
    picker = _read("components", "AttachmentPicker.js")
    rec = _read("components", "ScreenRecorder.js")
    guide = _read("components", "IosScreenRecordGuide.js")
    caps = _read("lib", "recordingCapabilities.js")
    assert "canCaptureDisplay" in caps
    assert "needsIosScreenRecordFlow" in caps
    assert "pickRecorderMime" in caps
    assert "IosScreenRecordGuide" in picker
    assert "IosScreenRecordGuide" in rec
    assert "setShowIosGuide(true)" in picker
    assert "setShowIosGuide(true)" in rec
    assert "Try Chrome" not in picker
    assert "Attach screen recording" in guide
    assert "Control Center" in guide
    assert "ios-screen-record-guide" in guide
    assert "ios-attach-recording-btn" in guide
    assert "startCameraWalkthrough" in picker
    assert "startCameraWalkthrough" in rec
    start = picker.split("const startRecording = async () => {")[1].split("const hudPrep")[0]
    assert "canCaptureDisplay()" in start
    assert "getDisplayMedia" in picker


def test_uploads_sniff_iphone_video_types():
    server = (ROOT / "backend" / "server.py").read_text(encoding="utf-8")
    assert 'endswith(".mp4")' in server
    assert 'endswith(".mov")' in server
    assert "video/quicktime" in server


def test_capabilities_helpers_via_node():
    script = r"""
import {
  recordingFilename,
  canCaptureDisplay,
  needsIosScreenRecordFlow,
} from './frontend/src/lib/recordingCapabilities.js';
if (!recordingFilename('video/mp4').endsWith('.mp4')) {
  console.error('mp4 name', recordingFilename('video/mp4'));
  process.exit(1);
}
if (!recordingFilename('video/quicktime').endsWith('.mov')) {
  console.error('mov name');
  process.exit(1);
}
if (canCaptureDisplay() !== false) {
  console.error('node has no getDisplayMedia; expected false');
  process.exit(1);
}
if (needsIosScreenRecordFlow() !== true) {
  console.error('node should need fallback flow');
  process.exit(1);
}
console.log('ok');
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr or result.stdout
    assert "ok" in result.stdout
