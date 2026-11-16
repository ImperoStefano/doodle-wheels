const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
class Target {
  constructor() { this.listeners = {}; this.classes = new Set(); this.classList = {add: c => this.classes.add(c), remove: c => this.classes.delete(c)}; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  setPointerCapture() {}
  fire(type, data = {}) {
    const e = {button: 0, pointerId: 1, detail: 1, preventDefault() {this.prevented = true;}, stopPropagation() {}, ...data};
    for (const fn of this.listeners[type] || []) fn(e);
    return e;
  }
}
const window = new Target(), document = new Target();
document.body = {dataset: {screen: 'race'}};
const els = {btnJump: new Target(), btnSprint: new Target(), raceCanvas: new Target()};
let jumps = 0, sprints = 0;
const source = fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8');
vm.runInNewContext(source.slice(source.indexOf('  // V48 race controls:'), source.indexOf('  // Messaggi host-only')), {
  window, document, els, tryJump() {jumps++;}, trySprint() {sprints++;}
});
window.fire('keydown', {code: 'Space'}); assert.equal(jumps, 1);
window.fire('keydown', {code: 'Space', repeat: true});
window.fire('keydown', {code: 'KeyW', ctrlKey: true});
window.fire('keydown', {code: 'KeyW', target: {tagName: 'INPUT'}});
window.fire('keydown', {code: 'ArrowUp', target: {tagName: 'SELECT'}});
assert.equal(jumps, 1);
// Space on the focused sprint button must not also jump.
window.fire('keydown', {code: 'Space', target: {closest() {return els.btnSprint;}}});
els.btnSprint.fire('click', {detail: 0});
assert.equal(jumps, 1); assert.equal(sprints, 1);
els.btnJump.fire('pointerdown', {button: 2}); assert.equal(jumps, 1);
els.btnJump.fire('pointerdown'); assert.equal(jumps, 2); assert(els.btnJump.classes.has('press'));
els.btnJump.fire('click'); assert.equal(jumps, 2); // no duplicate pointer click
els.btnJump.fire('pointerdown', {pointerId: 2}); assert.equal(jumps, 2);
els.btnJump.fire('pointerup', {pointerId: 2}); assert(els.btnJump.classes.has('press'));
els.btnJump.fire('pointercancel'); assert(!els.btnJump.classes.has('press'));
// Independent fingers can jump and sprint together.
els.btnJump.fire('pointerdown', {pointerId: 3});
els.btnSprint.fire('pointerdown', {pointerId: 4});
assert.equal(jumps, 3); assert.equal(sprints, 2);
window.fire('blur'); assert(!els.btnJump.classes.has('press')); assert(!els.btnSprint.classes.has('press'));
els.btnJump.fire('pointerdown'); document.hidden = true; document.fire('visibilitychange');
assert(!els.btnJump.classes.has('press'));
els.btnSprint.fire('lostpointercapture', {pointerId: 4});
els.btnSprint.fire('pointerdown'); assert.equal(sprints, 3);
els.raceCanvas.fire('pointerdown', {isPrimary: false}); assert.equal(jumps, 4);
els.raceCanvas.fire('pointerdown'); assert.equal(jumps, 5);
document.body.dataset.screen = 'menu'; window.fire('keydown', {code: 'KeyW'}); assert.equal(jumps, 5);
console.log('V48 keyboard, pointer, multi-touch and accessible activation checks passed.');
