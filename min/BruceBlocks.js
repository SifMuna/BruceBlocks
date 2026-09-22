var display = require('display');
var keyboardApi = require('keyboard');
var fillScreen = display.fill;
var drawFillRect = display.drawFillRect;
var drawRect = display.drawRect;
var drawString = display.drawString;
var setTextColor = display.setTextColor;
var setTextSize = display.setTextSize;
var getKeysPressed = keyboardApi.getKeysPressed;
var getEscPress = keyboardApi.getEscPress;
var WIDTH = 240;
var HEIGHT = 135;
var BLACK = 0x0000;
var WHITE = 0xFFFF;
var GRAY = 0x8410;
var DIMGRAY = 0x4208;
var YELLOW = 0xFFE0;
var CYAN = 0x07FF;
var GHOSTCOL = DIMGRAY;
var GHOST = 1;
var SHAPES = [
[[0,1,1,1,2,1,3,1],[2,0,2,1,2,2,2,3],[0,2,1,2,2,2,3,2],[1,0,1,1,1,2,1,3]], // I
[[1,0,2,0,1,1,2,1],[1,0,2,0,1,1,2,1],[1,0,2,0,1,1,2,1],[1,0,2,0,1,1,2,1]], // O
[[1,0,0,1,1,1,2,1],[1,0,1,1,2,1,1,2],[0,1,1,1,2,1,1,2],[1,0,0,1,1,1,1,2]], // T
[[1,0,2,0,0,1,1,1],[1,0,1,1,2,1,2,2],[1,1,2,1,0,2,1,2],[0,0,0,1,1,1,1,2]], // S
[[0,0,1,0,1,1,2,1],[2,0,1,1,2,1,1,2],[0,1,1,1,1,2,2,2],[1,0,0,1,1,1,0,2]], // Z
[[0,0,0,1,1,1,2,1],[1,0,2,0,1,1,1,2],[0,1,1,1,2,1,2,2],[1,0,1,1,0,2,1,2]], // J
[[2,0,0,1,1,1,2,1],[1,0,1,1,1,2,2,2],[0,1,1,1,2,1,0,2],[0,0,1,0,1,1,1,2]]  // L
];
var COLORS = [0x07FF, 0xFFE0, 0xA81F, 0x07E0, 0xF800, 0x2ADF, 0xFD20];
var PVX = [0, 0, 3, 3, 3, 3, 3]; // preview centering offset per piece, in px (NOT cells)
var PVY = [3, 6, 6, 6, 6, 6, 6]; // I is 1 row tall; everything else is 2
var CELL = 6, COLS = 10, ROWS = 20, NCELLS = 200;
var WELL_X = 90, WELL_Y = 8, WELL_W = 60, WELL_H = 120;
var LX = 20;                 // left panel text x
var RX = 182;                // right panel text x
var PV_X = 184, PV_Y = 24;   // preview interior origin
var FALL_MS = [800,720,630,550,470,380,300,220,130,100,80,80,80,70,70,70,50,50,50,30];
var LINE_SCORE = [0, 100, 300, 500, 800]; // indexed by rows cleared, scaled by level
var LINES_PER_LEVEL = 10;
var LOCK_MS = 300;
var CLEAR_MS = 140;
var KEY_LEFT = ',', KEY_RIGHT = '/', KEY_ROT = ';', KEY_DOWN = '.';
var KEY_ALT = 'Alt';
var DAS_DELAY = 170, DAS_RATE = 55, SOFT_RATE = 45;
var STATE_MENU = 0, STATE_PLAY = 1, STATE_PAUSED = 2, STATE_OVER = 3;
var state = STATE_MENU;
var board = [], frame = [], shadow = [];
var pieceType = 0, pieceRot = 0, pieceX = 3, pieceY = 0, nextType = 0, ghostY = 0;
var bag = [];
var score = 0, hiScore = 0, lines = 0, level = 1;
var fallDue = 0, lockDue = 0, clearTimer = 0, clearRows = [];
var wellDirty = true;
var staticDrawn = false, lastStaticState = -1;
var pauseDrawn = false, pauseSel = 0;
var lastScore = -1, lastLines = -1, lastLevel = -1, lastHi = -1, lastNext = -1;
var dasDir = 0, dasTimer = 0, softTimer = 0;
var heldRot = false, heldDrop = false, heldEnter = false;
var navUpHeld = false, navDownHeld = false;
function fallDelay() {
var i = level - 1;
if (i >= FALL_MS.length) i = FALL_MS.length - 1;
return FALL_MS[i];
}
function keyDown(keys, k) {
var i;
for (i = 0; i < keys.length; i++) {
if (keys[i] === k) return true;
}
return false;
}
function collides(px, py, rot) {
var s = SHAPES[pieceType][rot];
var i, c, r;
for (i = 0; i < 8; i += 2) {
c = px + s[i];
r = py + s[i + 1];
if (c < 0 || c >= COLS || r >= ROWS) return true;
if (r >= 0 && board[r * COLS + c] !== 0) return true;
}
return false;
}
function computeGhost() {
ghostY = pieceY;
while (!collides(pieceX, ghostY + 1, pieceRot)) ghostY++;
}
function pullBag() {
var i, j, t;
if (bag.length === 0) {
bag = [0, 1, 2, 3, 4, 5, 6];
for (i = 6; i > 0; i--) {
j = Math.floor(Math.random() * (i + 1));
t = bag[i]; bag[i] = bag[j]; bag[j] = t;
}
}
return bag.pop();
}
function spawnPiece() {
pieceType = nextType;
nextType = pullBag();
pieceRot = 0;
pieceX = 3;
pieceY = 0;
wellDirty = true;
if (collides(pieceX, pieceY, pieceRot)) gameOver();
}
function startGame() {
var i;
board = []; frame = []; shadow = [];
for (i = 0; i < NCELLS; i++) {
board[i] = 0;
frame[i] = 0;
shadow[i] = -1;
}
score = 0; lines = 0; level = 1;
bag = [];
nextType = pullBag();
spawnPiece();
fallDue = now() + fallDelay();
lockDue = 0;
clearTimer = 0;
clearRows = [];
dasDir = 0; dasTimer = 0; softTimer = 0;
heldRot = false; heldDrop = false;
state = STATE_PLAY;
staticDrawn = false;
}
function tryMove(dx) {
if (collides(pieceX + dx, pieceY, pieceRot)) return false;
pieceX += dx;
wellDirty = true;
return true;
}
function tryRotate() {
var nr = (pieceRot + 1) % 4;
if (collides(pieceX, pieceY, nr)) return; // blocked rotation simply fails, no kicks
pieceRot = nr;
wellDirty = true;
}
function hardDrop() {
var d = 0;
while (!collides(pieceX, pieceY + 1, pieceRot)) { pieceY++; d++; }
score += d * 2;
lockPiece();
}
function lockPiece() {
var s = SHAPES[pieceType][pieceRot];
var i, r, c, full;
for (i = 0; i < 8; i += 2) {
board[(pieceY + s[i + 1]) * COLS + pieceX + s[i]] = COLORS[pieceType];
}
lockDue = 0;
clearRows = [];
for (r = 0; r < ROWS; r++) {
full = true;
for (c = 0; c < COLS; c++) {
if (board[r * COLS + c] === 0) { full = false; break; }
}
if (full) {
clearRows.push(r);
drawFillRect(WELL_X, WELL_Y + r * CELL, WELL_W, CELL, WHITE);
}
}
if (clearRows.length > 0) clearTimer = now() + CLEAR_MS;
else spawnPiece();
}
function finishClear() {
var k, r, c, base;
for (k = 0; k < clearRows.length; k++) {
base = clearRows[k] * COLS;
for (c = 0; c < COLS; c++) shadow[base + c] = -1;
for (r = clearRows[k]; r > 0; r--) {
for (c = 0; c < COLS; c++) board[r * COLS + c] = board[(r - 1) * COLS + c];
}
for (c = 0; c < COLS; c++) board[c] = 0;
}
score += LINE_SCORE[clearRows.length] * level;
lines += clearRows.length;
level = 1 + Math.floor(lines / LINES_PER_LEVEL);
if (score > hiScore) hiScore = score;
clearRows = [];
clearTimer = 0;
spawnPiece();
}
function gameOver() {
state = STATE_OVER;
if (score > hiScore) hiScore = score;
pauseSel = 0;
staticDrawn = false;
}
function invalidateWell() {
var i;
for (i = 0; i < NCELLS; i++) shadow[i] = -1;
wellDirty = true;
}
function renderWell() {
var i, r, c, x, y, s;
for (i = 0; i < NCELLS; i++) frame[i] = board[i];      // 1. locked blocks
computeGhost();
s = SHAPES[pieceType][pieceRot];
if (ghostY !== pieceY) {                               // 2. ghost (skip if resting)
for (i = 0; i < 8; i += 2) frame[(ghostY + s[i + 1]) * COLS + pieceX + s[i]] = GHOST;
}
for (i = 0; i < 8; i += 2)                              // 3. active piece wins overlaps
frame[(pieceY + s[i + 1]) * COLS + pieceX + s[i]] = COLORS[pieceType];
i = 0;                                                  // 4. flush only what changed
for (r = 0; r < ROWS; r++) {
y = WELL_Y + r * CELL;
for (c = 0; c < COLS; c++) {
if (frame[i] !== shadow[i]) {
x = WELL_X + c * CELL;
if (frame[i] === GHOST) {
drawFillRect(x, y, CELL, CELL, BLACK);
drawRect(x, y, CELL, CELL, GHOSTCOL);
} else {
drawFillRect(x, y, CELL, CELL, frame[i]);
}
shadow[i] = frame[i];
}
i++;
}
}
wellDirty = false;
}
function drawHud() {
if (score !== lastScore) {
drawFillRect(LX, 21, 48, 8, BLACK);
setTextSize(1); setTextColor(WHITE);
drawString(String(score), LX, 21);
lastScore = score;
}
if (lines !== lastLines) {
drawFillRect(LX, 52, 48, 8, BLACK);
setTextSize(1); setTextColor(WHITE);
drawString(String(lines), LX, 52);
lastLines = lines;
}
if (level !== lastLevel) {
drawFillRect(LX, 83, 48, 8, BLACK);
setTextSize(1); setTextColor(WHITE);
drawString(String(level), LX, 83);
lastLevel = level;
}
if (hiScore !== lastHi) {
drawFillRect(LX, 114, 48, 8, BLACK);
setTextSize(1); setTextColor(WHITE);
drawString(String(hiScore), LX, 114);
lastHi = hiScore;
}
}
function drawNext() {
var s, i, x, y;
if (nextType === lastNext) return;
drawFillRect(PV_X, PV_Y, 24, 24, BLACK);
s = SHAPES[nextType][0];
for (i = 0; i < 8; i += 2) {
x = PV_X + PVX[nextType] + s[i] * CELL;
y = PV_Y + PVY[nextType] + s[i + 1] * CELL;
drawFillRect(x, y, CELL, CELL, COLORS[nextType]);
}
lastNext = nextType;
}
function drawPlayStatic() {
fillScreen(BLACK);
drawRect(WELL_X - 2, WELL_Y - 2, WELL_W + 4, WELL_H + 4, GRAY);
setTextSize(1);
setTextColor(DIMGRAY);
drawString("SCORE", LX, 10);
drawString("LINES", LX, 41);
drawString("LEVEL", LX, 72);
drawString("HI", LX, 103);
drawString("NEXT", RX, 10);
drawRect(RX, 22, 28, 28, DIMGRAY);
invalidateWell();
lastScore = -1; lastLines = -1; lastLevel = -1; lastHi = -1; lastNext = -1;
staticDrawn = true;
lastStaticState = state;
}
function drawPlay() {
if (!staticDrawn || state !== lastStaticState) drawPlayStatic();
drawHud();
drawNext();
if (wellDirty && clearTimer === 0) renderWell();
}
function drawMenu() {
if (!staticDrawn || state !== lastStaticState) {
fillScreen(BLACK);
setTextSize(3);
setTextColor(CYAN);
drawString("BRUCE", 75, 6);
drawString("BLOCKS", 66, 30);
setTextSize(1);
setTextColor(WHITE);
drawString(", . / MOVE  ; ROTATE", 60, 62);
drawString("SPACE ALT DROP  ENTER PAUSE", 39, 74);
drawString("ESC QUIT", 96, 86);
setTextColor(YELLOW);
drawString("PRESS ENTER", 87, 108);
staticDrawn = true;
lastStaticState = state;
}
}
function drawPause() {
var options, i;
if (!pauseDrawn) {
fillScreen(BLACK);
setTextSize(2);
setTextColor(WHITE);
drawString("PAUSED", 80, 40);
options = ["CONTINUE", "QUIT"];
setTextSize(1);
for (i = 0; i < options.length; i++) {
if (i === pauseSel) {
setTextColor(YELLOW);
drawFillRect(70, 65 + i * 15, 100, 12, GRAY);
drawString("> " + options[i], 75, 68 + i * 15);
} else {
setTextColor(WHITE);
drawString(" " + options[i], 75, 68 + i * 15);
}
}
pauseDrawn = true;
}
}
function drawGameOver() {
var options, i;
if (!staticDrawn || state !== lastStaticState) {
fillScreen(BLACK);
setTextSize(2);
setTextColor(YELLOW);
drawString("GAME OVER", 66, 20);
setTextColor(WHITE);
setTextSize(1);
drawString("SCORE " + score, 85, 47);
options = ["RESTART", "QUIT"];
for (i = 0; i < options.length; i++) {
if (i === pauseSel) {
setTextColor(YELLOW);
drawFillRect(70, 65 + i * 15, 100, 12, GRAY);
drawString("> " + options[i], 75, 68 + i * 15);
} else {
setTextColor(WHITE);
drawString(" " + options[i], 75, 68 + i * 15);
}
}
staticDrawn = true;
lastStaticState = state;
}
}
function playKeys(keys) {
var t = now();
var kL = keyDown(keys, KEY_LEFT);
var kR = keyDown(keys, KEY_RIGHT);
var dir = kL ? -1 : (kR ? 1 : 0);
if (dir !== dasDir) {                     // press, release, or direction change
dasDir = dir;
if (dir !== 0) { tryMove(dir); dasTimer = t + DAS_DELAY; }
} else if (dir !== 0 && t >= dasTimer) {
tryMove(dir);
dasTimer = t + DAS_RATE;
}
var kU = keyDown(keys, KEY_ROT);
if (kU && !heldRot) tryRotate();
heldRot = kU;
var kSp = keyDown(keys, ' ') || keyDown(keys, 'Space') || keyDown(keys, KEY_ALT);
if (kSp && !heldDrop) hardDrop();
heldDrop = kSp;
if (keyDown(keys, KEY_DOWN)) {            // soft drop: free-running, no initial delay
if (t >= softTimer) {
if (!collides(pieceX, pieceY + 1, pieceRot)) {
pieceY++;
score++;
wellDirty = true;
fallDue = t + fallDelay();     // must push gravity or it double-steps
lockDue = 0;
}
softTimer = t + SOFT_RATE;
}
} else {
softTimer = 0;
}
}
function handleInput() {
if (getEscPress()) return true;           // edge-safe AND consuming - call once/frame
var keys = getKeysPressed();
var kEnt = keyDown(keys, 'Enter');
var entJust = kEnt && !heldEnter;
heldEnter = kEnt;
var navUp, navDown, navUpJust, navDownJust;
switch (state) {
case STATE_MENU:
if (entJust) startGame();
break;
case STATE_PLAY:
if (clearTimer === 0) playKeys(keys); // no piece input during the flash
if (entJust) {
state = STATE_PAUSED;
pauseSel = 0;
pauseDrawn = false;
dasDir = 0;
}
break;
case STATE_PAUSED:
navUp = keyDown(keys, KEY_ROT) || keyDown(keys, KEY_LEFT);
navDown = keyDown(keys, KEY_DOWN) || keyDown(keys, KEY_RIGHT);
navUpJust = navUp && !navUpHeld;
navDownJust = navDown && !navDownHeld;
navUpHeld = navUp;
navDownHeld = navDown;
if (navUpJust || navDownJust) { pauseSel = 1 - pauseSel; pauseDrawn = false; }
if (entJust) {
if (pauseSel === 0) {
state = STATE_PLAY;
staticDrawn = false;
dasDir = 0;
} else {
return true;
}
}
break;
case STATE_OVER:
navUp = keyDown(keys, KEY_ROT) || keyDown(keys, KEY_LEFT);
navDown = keyDown(keys, KEY_DOWN) || keyDown(keys, KEY_RIGHT);
navUpJust = navUp && !navUpHeld;
navDownJust = navDown && !navDownHeld;
navUpHeld = navUp;
navDownHeld = navDown;
if (navUpJust || navDownJust) { pauseSel = 1 - pauseSel; staticDrawn = false; }
if (entJust) {
if (pauseSel === 0) {
startGame();
} else {
return true;
}
}
break;
}
return false;
}
function updatePlay() {
var t = now();
if (clearTimer !== 0) {
if (t >= clearTimer) finishClear();
return;
}
if (t >= fallDue) {
if (!collides(pieceX, pieceY + 1, pieceRot)) {
pieceY++;
wellDirty = true;
lockDue = 0;
} else if (lockDue === 0) {
lockDue = t + LOCK_MS;
}
fallDue = t + fallDelay();
}
if (lockDue !== 0 && t >= lockDue) {
if (collides(pieceX, pieceY + 1, pieceRot)) {
lockPiece();
} else {
lockDue = 0; // slid out from under the overhang
}
}
}
function main() {
state = STATE_MENU;
staticDrawn = false;
while (true) {
if (handleInput()) break;
switch (state) {
case STATE_MENU:
drawMenu();
break;
case STATE_PLAY:
updatePlay();
if (state === STATE_PLAY) drawPlay();
break;
case STATE_PAUSED:
drawPause();
break;
case STATE_OVER:
drawGameOver();
break;
}
delay(5);
}
}
main();
