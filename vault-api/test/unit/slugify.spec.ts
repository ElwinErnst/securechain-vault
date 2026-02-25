import { slugify } from '../../src/common/utils/slugify.util';

describe('slugify', () => {
  it('slugifies basic strings', () => {
    expect(slugify('Personal Vault')).toBe('personal-vault');
  });

  it('removes accents', () => {
    expect(slugify('Bóveda Ñandú')).toBe('boveda-nandu');
  });

  it('collapses multiple separators', () => {
    expect(slugify('A---B   C')).toBe('a-b-c');
  });

  it('trims', () => {
    expect(slugify('  Hello  ')).toBe('hello');
  });
});
