/** /start orientation page contract. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('start.html', 'utf8');
const js = readFileSync('start.js', 'utf8');
const index = readFileSync('index.html', 'utf8');
let pass = 0;

function check(name, fn) {
  try {
    fn();
    pass++;
    console.log(`PASS  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}\n        ${error.message}`);
    process.exitCode = 1;
  }
}

const FRIDGE = 'Fridge card and the other implementation tools ship with Ultimate and Family Bundle — not Essentials.';

console.log('\n=== Post-purchase /start ===\n');

check('homepage comparison table uses the exact fridge sentence', () => {
  assert.ok(index.includes(FRIDGE));
});

check('start page walks five named steps', () => {
  assert.match(html, /data-start-step="1"/);
  assert.match(html, /data-start-step="5"/);
  assert.match(html, /Continuity Snapshot/);
  assert.match(html, /15 minutes/);
  assert.match(html, /fridge card/i);
  assert.match(html, /Name two people/);
  assert.match(html, /Point to where passwords live/);
  assert.match(html, /Tell those two people/);
});

check('fridge tools are not claimed for Essentials', () => {
  assert.ok(html.includes(FRIDGE));
  assert.match(html, /If you have Essentials, skip this step/);
});

check('step 4 is pointer-not-vault, not a credential store', () => {
  assert.match(html, /pointer, not a vault/);
  assert.match(html, /does not hold credentials/);
  assert.match(html, /Never the master password/);
});

check('handoff script can be copied', () => {
  assert.match(html, /id="handoffScript"/);
  assert.match(html, /data-copy="#handoffScript"/);
  assert.match(js, /navigator\.clipboard/);
  assert.match(js, /execCommand\("copy"\)/);
});

check('support and byline stay honest', () => {
  assert.match(html, /info@familyfindersbook\.com/);
  assert.match(html, /A person answers within 3 business days/);
  assert.match(html, /The Finder&rsquo;s Book is by Michael David/);
  assert.doesNotMatch(html, /Get Ultimate and begin|Upgrade to Ultimate now|limited-time/i);
});

check('wizard is one step at a time when JS runs', () => {
  assert.match(js, /step\.hidden = !on/);
  assert.match(js, /Step " \+ current \+ " of "/);
});

console.log(`\n${'='.repeat(46)}\n  ${pass} passed\n${'='.repeat(46)}\n`);
