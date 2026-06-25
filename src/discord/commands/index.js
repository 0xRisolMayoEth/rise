'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Load every command module in this directory (except this index file).
 * Each module must export { data, execute }.
 * @returns {Map<string, {data: object, execute: Function}>}
 */
function loadCommands() {
  const commands = new Map();
  const dir = __dirname;

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.js') && f !== 'index.js');

  for (const file of files) {
    const mod = require(path.join(dir, file));
    if (mod && mod.data && typeof mod.execute === 'function') {
      commands.set(mod.data.name, mod);
    } else {
      console.warn(`[commands] Skipping ${file}: missing { data, execute }.`);
    }
  }

  return commands;
}

module.exports = { loadCommands };
