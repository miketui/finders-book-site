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

const HOME_FRIDGE = 'Fridge card and the other implementation tools ship with Ultimate and Family Bundle — not Essentials.';
const START_FRIDGE = 'Fridge card is included with Ultimate and Family Bundle. Essentials buyers: use page 2 as your posted snapshot until you upgrade.';

console.log('\n=== Post-purchase /start ===\n');

check('homepage comparison table uses the exact fridge sentence', () => {
  assert.ok(index.includes(HOME_FRIDGE));
});

check('start page walks five named Marketing steps', () => {
  assert.match(html, /<h1 class="h-xl fx-up">Start tonight<\/h1>/);
  assert.match(html, /You have the files\. These five steps turn them into something your people can find/);
  assert.match(html, /data-start-step="1"/);
  assert.match(html, /data-start-step="5"/);
  assert.match(html, /Continuity Snapshot/);
  assert.match(html, /15 minutes|Fifteen minutes/);
  assert.match(html, /fridge card/i);
  assert.match(html, /Name two people/);
  assert.match(html, /Point to where passwords live/);
  assert.match(html, /Tell those two people/);
});

check('fridge tools are not claimed for Essentials', () => {
  assert.ok(html.includes(START_FRIDGE));
  assert.match(html, /Essentials buyers: use page 2/);
});

check('step 4 is pointer-not-vault, not a credential store', () => {
  assert.match(html, /pointer, not a vault/);
  assert.match(html, /does not hold credentials/);
  assert.match(html, /Never the master password/);
});

check('handoff script can be copied', () => {
  assert.match(html, /id="handoffScript"/);
  assert.match(html, /data-copy="#handoffScript"/);
  assert.match(html, />Copy message</);
  assert.match(js, /Copied/);
  assert.match(js, /navigator\.clipboard/);
  assert.match(js, /execCommand\("copy"\)/);
});

check('support and byline stay honest', () => {
  assert.match(html, /Questions about the files\?/);
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
