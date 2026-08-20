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
  ['assets/finders-book-cover-800.webp', '9f120cce283474f969dc3706f6e288bed640969e70c38fe4ba3b5e00bced6d61'],
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
  ['assets/og-finders-book.jpg', '513164119a1146923ae0b1622e71213871387179514a94ccc471ef91f26eb3f1'],
  ['assets/security-doctrine.webp', 'dcf0c94a6781f78737f919ceb0c67d90cdb3fa8005c3479ad31128396f88fe75'],
  ['assets/trusted-people.webp', '755ae75071208180861982019d3b0278a20a8cf1295a8bd778959014631a2d30'],
  ['assets/will-locator.webp', '1db3daed1775798848f4496319570086b043e0a61d6d69a119eba0ae42f53cc3'],
  ['assets/bonus-1-emergency-fridge-card-400.webp', 'b99eabf970b997d584d2fcd3ed0c0cbf736a4308de8893da48bfb95f136f4bf0'],
  ['assets/bonus-2-15-minute-secure-vault-setup-guide-400.webp', '29d29268dc4093a528d99d331b81be6e71af65d76f94ad70df26ab12ec8900d1'],
  ['assets/bonus-3-continuity-check-in-plan-400.webp', '2046c1e91ebd1179f76609a3c594551c5115c338424e53d0002ddb7454e9d745'],
  ['assets/bonus-4-trusted-person-handoff-scripts-400.webp', '11dc2efae9f8a6a97ecc85869e181527bfca08e20beaa8cd8da8ddf3ee338f72'],
  ['assets/bonus-5-digital-legacy-link-and-qr-guide-400.webp', 'ed286313b506dfd1d7fec01e6cd9de65d2dd40b40d931f9d57055ecc378a203d'],
  ['assets/continuity-snapshot-400.webp', '13a62cf0daba1e569a492d5730683f26da6b9a69c51fbafe4a0a03496a051217'],
  ['assets/finders-book-cover-400.webp', '25bcb771ca8281b56b98534a1d5159f949b9cc215a0b29051fb4668cb5c9792b'],
  ['assets/credit-cards-400.webp', 'd2df6d6c6ba5c438a825842f52e8914e6f5e25da0c49221d8f3f827200cfba68'],
  ['assets/documents-locator-400.webp', 'ffc1e5c81196d0e63a96d35c5cd0d1ee38e88412cd13684301457bbedf658a73'],
  ['assets/email-accounts-400.webp', '2de88da7616ec781ba66dec72257a969e9b5a94d16d25800a48a2aecadec6bad'],
  ['assets/essentials-product-400.webp', '641a84d7f21630d309c1f0d872db84668aa0e1dc58838bea459e6304c969bfe3'],
  ['assets/family-bundle-product-400.webp', '953b4b3d46c2bbe7e298517bbea987e2a5f36d51ecc00cbdbd583c675dddefca'],
  ['assets/how-to-use-400.webp', 'f56f32bf9d7faa0c162192723450d871f65c85a4ee85bd4b1db03ecbf316990d'],
  ['assets/important-people-400.webp', 'ab3256f113c578ef8fc464a7e277b300152d7d0f57f1a6296aee441877b51886'],
  ['assets/letter-to-finder-400.webp', 'd13d52cf6ab8acf341b2b4e94422e8ceb9d28187eecf8a8bc315ea01787c7d74'],
  ['assets/letter-to-loved-one-400.webp', '93f0063d4dbb3f4094703548dc11986f7853b37da8f50d222653500a00a5392a'],
  ['assets/levels-of-access-400.webp', '44f34e36a4adabae9cb7c39381507583cd81ff61eb179744568f9ebb363eddac'],
  ['assets/security-doctrine-400.webp', '0e40dc3efd171602772fccf0c87189956c2edb8f49baa2039c4ed7d228cd68c5'],
  ['assets/trusted-people-400.webp', '68a207a529345044cbcd6e24e6a3986563ff03a9ff235ed212175f7b78d0ab68'],
  ['assets/ultimate-product-400.webp', '5783a65bda6e64b91ca93f957a06947e895a8695fccdf667ae85e6c964446fd2'],
  ['assets/will-locator-400.webp', 'da71e1f1a43f19ab0941058199125173dfbf6c97dd6c003cdcfec9d5dc8b6f9a'],
  ['assets/essentials-product-800.webp', '19473cf966e76a4977fe7ac6837a51da6a04ed5b99c4b23ecbd039baa53a6c4b'],
  ['assets/ultimate-product-800.webp', '74897c34f07dd9391294822d92842fe0771f53776824da6d8228c103a5ec6c0b'],
  ['assets/family-bundle-product-800.webp', '35676c43b52c05e4c7eeef787f77087cee2e2a54da873b0cf36fa3ae0750ab47']
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
