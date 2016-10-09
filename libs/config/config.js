const contractsConfig = require('./contracts.js');
const rpcConfig = require('./rpc.js');
const ipfsNetwork = require('./ipfsNetwork.js');
const filesConfig = require('./files.js');
const ipcConfig = require('./ipc.js');

module.exports = {
  contracts: contractsConfig,
  rpc: rpcConfig,
  ipfsNetwork: ipfsNetwork,
  files: filesConfig,
  ipc: ipcConfig,
  testing: true
};
