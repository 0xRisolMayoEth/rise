'use strict';

/**
 * Signal type handling.
 *
 * Analysts type the short form in Discord (`HAKA`), but the database
 * stores the canonical value from the schema CHECK constraint
 * (`HAKA PREOPEN`). These helpers keep the two in sync.
 */

// Short label (input / display) -> canonical DB value.
const TYPE_MAP = {
  HAKA: 'HAKA PREOPEN',
  'HAKA PREOPEN': 'HAKA PREOPEN',
  SNIPER: 'SNIPER',
  BSJP: 'BSJP',
  SWING: 'SWING',
};

// Choices offered by the Discord slash command (label shown / value sent).
const TYPE_CHOICES = [
  { name: 'HAKA PREOPEN', value: 'HAKA' },
  { name: 'SNIPER', value: 'SNIPER' },
  { name: 'BSJP', value: 'BSJP' },
  { name: 'SWING', value: 'SWING' },
];

/**
 * Resolve any accepted input into the canonical DB type, or null if invalid.
 * @param {string} input
 * @returns {string|null}
 */
function resolveType(input) {
  if (!input) return null;
  return TYPE_MAP[String(input).trim().toUpperCase()] || null;
}

module.exports = { TYPE_MAP, TYPE_CHOICES, resolveType };
