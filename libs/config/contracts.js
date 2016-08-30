'use strict';

// configuration for contract files
// ex. Solidity or Serprent? default contract location

// @ path - path to the default contracts directory from root
// @ type - default contract type
// @ built - path where contracts are built
const contractsConfig = {
  path: __dirname + '/../../contracts/',
  testPath: __dirname + '/../../contracts-test/',
  type: 'Solidity',
  built: __dirname + '/../contracts/',
  abi: __dirname + '/../../contracts-abi/'
};

module.exports = contractsConfig;
