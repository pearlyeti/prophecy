import { CARD_TYPES, COLORS, DIE_SYMBOLS, FACTIONS, RARITIES } from '@prophecy/protocol';
import { describe, expect, it } from 'vitest';

import {
  cardTypeEnum,
  colorEnum,
  dieSymbolEnum,
  factionEnum,
  rarityEnum,
} from '../enums';

// drizzle-kit's loader can't follow cross-package imports, so the
// enum value arrays are duplicated in db. This test catches drift if
// one side gets updated and the other doesn't.

describe('enum drift between @prophecy/db and @prophecy/protocol', () => {
  it('factions match', () => {
    expect([...factionEnum.enumValues]).toEqual([...FACTIONS]);
  });
  it('colors match', () => {
    expect([...colorEnum.enumValues]).toEqual([...COLORS]);
  });
  it('card types match', () => {
    expect([...cardTypeEnum.enumValues]).toEqual([...CARD_TYPES]);
  });
  it('die symbols match', () => {
    expect([...dieSymbolEnum.enumValues]).toEqual([...DIE_SYMBOLS]);
  });
  it('rarities match', () => {
    expect([...rarityEnum.enumValues]).toEqual([...RARITIES]);
  });
});
