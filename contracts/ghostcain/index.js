'use strict';

const { name, version } = require('./package.json');

/**
 * @ghostchain/contracts — GhostChain-native Solidity contract library.
 *
 * Import Solidity contracts directly:
 *   import "@ghostchain/contracts/token/GRC20/GRC20.sol";
 *   import "@ghostchain/contracts/access/Ownable.sol";
 *   import "@ghostchain/contracts/governance/Governor.sol";
 *
 * Access compiled artifacts (after `npm run compile`):
 *   const { abi } = require("@ghostchain/contracts/artifacts/contracts/token/GRC20/GRC20.sol/GRC20.json");
 */
module.exports = {
  name,
  version,

  /** Canonical token standard names for use in scripts / tooling. */
  standards: {
    GRC20:   'GRC20',
    GRC721:  'GRC721',
    GRC1155: 'GRC1155',
    GRC4626: 'GRC4626',
    GRC6909: 'GRC6909',
    GRC1363: 'GRC1363',
    GRC2981: 'GRC2981',
    GST165:  'GST165',  // introspection
  },

  /** Solidity import path root for use as a constant in build scripts. */
  importRoot: '@ghostchain/contracts',
};
