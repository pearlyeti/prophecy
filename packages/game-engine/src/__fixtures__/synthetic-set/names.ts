// Public-domain Greek + Norse mythology name pools used by the
// synthetic-set generator. All names are widely-attested in classical
// sources (well over a thousand years old in every case); no modern
// adaptation, depiction, or franchise is referenced.
//
// Each pool is sized comfortably above the per-type count so the
// generator can hand out unique titles without collisions.

export const CHARACTER_NAMES: readonly string[] = [
  // Olympian gods
  'Zeus', 'Hera', 'Poseidon', 'Demeter', 'Athena', 'Apollo', 'Artemis',
  'Ares', 'Aphrodite', 'Hephaestus', 'Hermes', 'Dionysus', 'Hestia', 'Hades',
  // Greek heroes & demigods
  'Heracles', 'Perseus', 'Theseus', 'Achilles', 'Odysseus', 'Jason', 'Atalanta',
  'Cassandra', 'Bellerophon',
  // Aesir / Vanir / Norse
  'Odin', 'Frigg', 'Thor', 'Loki', 'Tyr', 'Baldr', 'Heimdallr', 'Bragi',
  'Idunn', 'Forseti', 'Vidar', 'Vali', 'Freya', 'Freyr', 'Njord', 'Skadi',
  // Titans
  'Cronus', 'Rhea', 'Hyperion', 'Themis', 'Mnemosyne', 'Oceanus', 'Tethys',
  'Iapetus', 'Coeus', 'Phoebe',
  // Giants & primordials
  'Ymir', 'Surt', 'Thrym', 'Hrungnir', 'Mimir', 'Aegir', 'Ran',
  // Underworld / fate
  'Persephone', 'Hecate', 'Charon', 'Hel', 'Nott', 'Sol', 'Mani', 'Urd',
];

export const UPGRADE_NAMES: readonly string[] = [
  // Greek artifacts & arms
  'Aegis', 'Caduceus', 'Trident of Poseidon', 'Bow of Apollo',
  'Helm of Darkness', 'Sandals of Hermes', 'Shield of Achilles',
  'Sword of Peleus', 'Spear of Athena', 'Olive Crown', 'Golden Fleece',
  "Ariadne's Thread", "Pandora's Jar", 'Lyre of Apollo',
  'Bow of Heracles', 'Lion Pelt', 'Helm of Perseus',
  'Mirror Shield', 'Adamantine Sickle',
  // Norse artifacts & arms
  'Mjolnir', 'Gungnir', 'Megingjord', 'Gleipnir', 'Andvaranaut',
  'Brisingamen', 'Skofnung', 'Tyrfing', 'Naglfar', 'Skidbladnir',
  'Gjallarhorn', 'Draupnir', 'Hofund', "Surt's Sword", "Loki's Net",
  // Mounts & companions (treated as upgrades on a character)
  'Sleipnir', 'Pegasus', 'Cerberus', 'Geri', 'Freki', 'Huginn', 'Muninn',
  'Tanngrisnir', 'Tanngnjostr', 'Argos', 'Golden Hind',
];

export const SUPPORT_NAMES: readonly string[] = [
  // Greek
  'Oracle at Delphi', 'Sibyl of Cumae', 'Pythia', 'Chorus of Muses',
  'Argo', 'Hesperides Grove',
  // Norse
  'Well of Mimir', 'Well of Urd', 'Norns', 'Einherjar', 'Valkyrie',
  'Yggdrasil Sapling', 'Ratatoskr', 'Heidrun',
  // General
  'Sacred Hearth', 'Sacrificial Pyre', 'Festival of Lights',
  'Auspices of the Crow', 'Burnt Offering', 'Hekatomb',
];

export const EVENT_NAMES: readonly string[] = [
  // Greek
  'Birth of Athena', 'Theft of Fire', 'Judgment of Paris',
  'Fall of Troy', 'Twelve Labors', "Pandora's Curse",
  'Apple of Discord', 'Trojan Horse', 'Sirens’ Song',
  'Wrath of Achilles', "Odysseus' Return", 'Daedalus’ Wings',
  'Theft of the Cattle of Apollo', 'Calydonian Hunt',
  'Argonauts’ Voyage', 'Promethean Bargain', 'Olympic Truce',
  'Dance of the Maenads', 'Erinyes Pursue',
  'Underworld Bargain', 'Charon’s Toll', 'Lethe’s Draught',
  'Crossing of Acheron', 'Lyre of Orpheus',
  // Norse
  'Ragnarok Foretold', 'Binding of Fenrir', 'Death of Baldr',
  'Theft of Mjolnir', 'Mead of Poetry', "Odin's Sacrifice",
  'Hammer Recovered', 'Loki Bound', 'Sif’s Shorn Hair',
  'Andvari’s Curse', 'Forging of Brisingamen', 'Walk Among Mortals',
  'Galar and Fjalar', 'Skirnir’s Errand', 'Geirrod’s Trap',
  'Fall of Asgard', 'Heimdallr’s Watch', 'Crossing of Bifrost',
  // Cross-pantheon / fate
  'Threads of the Norns', 'Decree of the Moirai', 'Oracle’s Warning',
  'Apotheosis', 'Hubris', 'Catabasis', 'Theogony', 'Cosmogony',
  'Eclipse of the Wolves',
];

export const PLOT_NAMES: readonly string[] = [
  'Wisdom of Odin', 'Cunning of Loki', 'Strength of Heracles',
  'Beauty of Aphrodite', 'Foresight of Mimir', 'Wrath of Hera',
  'Patience of Penelope',
];

export const BATTLEFIELD_NAMES: readonly string[] = [
  'Olympus', 'Asgard', 'Tartarus', 'Midgard', 'Helheim',
  'Valhalla', 'Niflheim', 'Jotunheim', 'Bifrost', 'Yggdrasil',
  'Plain of Vigrid', 'Garden of the Hesperides', 'Labyrinth of Crete',
  'Oracle of Delphi', 'Mount Ida', 'Field of Asphodel',
];

export type NamePool = readonly string[];

/** Verify at module load that every pool has enough entries for its
 * target count. The generator pulls without replacement so a too-small
 * pool would throw mid-run; this turns that into a clear startup error. */
export function assertPoolSize(pool: NamePool, needed: number, label: string): void {
  if (pool.length < needed) {
    throw new Error(
      `name pool "${label}" has ${pool.length} entries, generator needs ${needed}`,
    );
  }
}
