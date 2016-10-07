'use strict';

// configuration for contract files
// ex. Solidity or Serprent? default contract location

// @ path - path to the default contracts directory from root
// @ type - default contract type
// @ built - path where contracts are built
/**
*
* @deStore - contract address for deStore
**/
const contractsConfig = {
  path: __dirname + '/../../contracts/',
  type: 'Solidity',
  built: __dirname + '/../../app/contracts/',
  abiPath: __dirname + '/../../contracts-abi/',
  abiFormat: '.json',
  deStore: '0x65230dbaa5c0ecd096c12e2686598d00aadaf920'
};

module.exports = contractsConfig;
