# reference-set fixtures

Mechanical-only reference data for engine validation. **Test paths only — never imported by application code, never bundled into production.**

What is allowed here:

- Dice face profiles (symbol, value, cost, modifier flag).
- Point values, health, faction, color, keyword set.
- Ability *type tags* in the AST shape used by `card_abilities`.
- Generic identifiers (`CHAR_001`, `UPG_BLADE_A`, `EVT_REROLL_C`).

What is **not** allowed:

- Card titles, ability prose, flavor text, artwork, audio, or any third-party-recognizable strings.

See [Reference data & test fixtures](../../../../../README.md#reference-data--test-fixtures) and [Working agreement #5](../../../../../README.md#working-agreements).
