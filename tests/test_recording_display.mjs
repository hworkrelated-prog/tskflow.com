import assert from 'node:assert/strict';
import { matchScreenToCapture, popupBoxOnScreen, screenSizeScore } from '../frontend/src/lib/recordingDisplay.js';

const laptop = {
    left: 0, top: 0, width: 1512, height: 982,
    availLeft: 0, availTop: 0, availWidth: 1512, availHeight: 950,
    devicePixelRatio: 2, isCurrent: true, isPrimary: true, label: 'Laptop',
};
const studio = {
    left: 1512, top: -200, width: 2560, height: 1440,
    availLeft: 1512, availTop: -200, availWidth: 2560, availHeight: 1400,
    devicePixelRatio: 1, isCurrent: false, isPrimary: false, label: 'Studio',
};

const dual = [laptop, studio];

const other = matchScreenToCapture(
    { displaySurface: 'monitor', width: 2560, height: 1440 },
    dual,
);
assert.equal(other.screen.label, 'Studio', 'full-screen capture follows the selected monitor');

const sameResOther = matchScreenToCapture(
    { displaySurface: 'monitor', width: 1512, height: 982 },
    [
        laptop,
        { ...studio, width: 1512, height: 982, availWidth: 1512, availHeight: 950 },
    ],
);
assert.equal(sameResOther.reason, 'other-display', 'ambiguous dual monitors prefer the other display');

const windowCap = matchScreenToCapture(
    { displaySurface: 'window', width: 800, height: 600 },
    dual,
);
assert.equal(windowCap.screen.label, 'Laptop', 'window capture stays with the TskFlow display');

const box = popupBoxOnScreen(studio, { width: 176, height: 176, corner: 'bottom-left', margin: 28 });
assert.equal(box.left, 1512 + 28);
assert.ok(box.features.includes(`left=${box.left}`));
assert.ok(screenSizeScore(studio, 2560, 1440) < 20);

console.log('test_recording_display.mjs: ok');
