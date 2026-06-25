'use strict';

const config = require('../../config');

/**
 * Resolve the configured price source to a `{ fetchPrice }` object.
 * @param {string} [name=config.tracker.source]
 */
function getSource(name = config.tracker.source) {
  switch ((name || '').toLowerCase()) {
    case 'idx':
      return require('./idx');
    case 'mock':
    default:
      return require('./mock');
  }
}

module.exports = { getSource };
