import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const sourceBase = (process.env.FINDERS_ASSET_SOURCE || 'https://finders-book-v34.vercel.app').replace(/\/$/, '');

const files = [
  ['Family-Readiness-Gap-Check.pdf', '2a77b501b2303c3edae9e6f3fcc225cd23137d860db20dfec473f6654fdd6a0f'],
  ['assets/bonus-1-emergency-fridge-card.webp', 'e65f8a126bd5517fc7d0aad7c523db28730416fce6d97a60c5530a659b29c64f'],
  ['assets/bonus-2-15-minute-secure-vault-setup-guide.webp', '8c2ca147c38e2d05215ef3724ed898ed0cf038971002192aa3790578b738e417'],
  ['assets/bonus-3-continuity-check-in-plan.webp', '23e11c1b71d3e58340fa8133c80fd31c68be10c95156f9636d349a6795a72dee'],
  ['assets/bonus-4-trusted-person-handoff-scripts.webp', '15f238c9a36bc068fbf12c9705f52db099680294fb6c0ad3627f6ae2e0fae31f'],
  ['assets/bonus-5-digital-legacy-link-and-qr-guide.webp', 'ded60f8422f87d937969d7b3485e9ea2040287fb7a7abf710fb693b7ad5d4109'],
  ['assets/continuity-snapshot.webp', '00d6a0e639654a70eb91ed8f8ad2ef512d3949ae4bb9cef45df2d18368c8cc31'],
  ['assets/cover.jpg', 'edfd4db9c457c5109948faf6c58d833df79a020a3f29f4d928a5c80ce69ccf7d'],
  ['assets/credit-cards.webp', '7a7dff0fe159fc74ce0dfb169479cb035686f59288eb8de895defccd54b7c632'],
  ['assets/documents-locator.webp', '23dbc3007745fcc1ee3adf2138f53416dfbbf8cd4a04227454479e6a8770c668'],
  ['assets/email-accounts.webp', '60bbf108a6afc55df5fe2612942d7e5ae0360026b22d26c51062bf6751f606fb'],
  ['assets/fonts/archivo-latin-variable-normal.woff2', '8f704806dbedeaaeca334b11ec348bc3ac3a439d6431544b3afb54f534ee4967'],
  ['assets/fonts/newsreader-latin-variable-italic.woff2', '48bc8861b9b2ca9300747cad4fd6a3b4ac3028d364df00bd1b72097baa75e509'],
  ['assets/fonts/newsreader-latin-variable-normal.woff2', '62981321d9a3cc7a61a73792729043703fd6112da86e8ec848bb57f088578757'],
  ['assets/how-to-use.webp', '1d9ee83e796dde38169334a14cbbf9a0da23750d3f580c3d4f23012790465062'],
  ['assets/important-people.webp', '6c79c3fb7b1df787c40ba0f219f32b1df8562306b92ae84030bf4caaecb238a1'],
  ['assets/letter-to-finder.webp', '3561c38a6f8c726f472ba8bd6b7781489c01f1fa1dffd5d827873b795962d0ca'],
  ['assets/letter-to-loved-one.webp', '969b93099d2b2199414be0b89cb1b817fd63c85c7b6bf72e79b61a7defb1f4e0'],
  ['assets/levels-of-access.webp', '55230b8ea9a44f32af436bff0cb5412e470dec1020e979264ab854c43572fe56'],
  ['assets/og-finders-book.jpg', '2ee45c2234cb72cd01bc31da3a8b2c8266db58e77da275b715f63de5f078fc4e'],
  ['assets/security-doctrine.webp', 'dcf0c94a6781f78737f919ceb0c67d90cdb3fa8005c3479ad31128396f88fe75'],
  ['assets/trusted-people.webp', '755ae75071208180861982019d3b0278a20a8cf1295a8bd778959014631a2d30'],
  ['assets/will-locator.webp', '1db3daed1775798848f4496319570086b043e0a61d6d69a119eba0ae42f53cc3']
];

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function existingHash(path) {
  try {
    return sha256(await readFile(path));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

let downloaded = 0;
let verified = 0;

for (const [path, expected] of files) {
  const current = await existingHash(path);
  if (current === expected) {
    verified += 1;
    continue;
  }
  if (current && current !== expected) {
    throw new Error(`${path} exists but its SHA-256 does not match the repository manifest. Refusing to overwrite it.`);
  }

  const url = `${sourceBase}/${path.split('/').map(encodeURIComponent).join('/')}`;
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const actual = sha256(buffer);
  if (actual !== expected) {
    throw new Error(`${path} downloaded from ${url} but failed SHA-256 verification. Expected ${expected}; received ${actual}.`);
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buffer);
  downloaded += 1;
}

console.log(`Public asset hydration complete: ${downloaded} downloaded, ${verified} already verified.`);
