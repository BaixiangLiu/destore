'use strict';
const Web3 = require('web3');

// configuration for RPC
// ex: localhost? port?
// maybe ipfs configurations as well

//Zhiwen's ip: 192.168.1.41 (Use only while testing - replace host)

const rpcConfig = {
  host: 'localhost',
  port: 5000,
};

rpcConfig.provider = new Web3.providers.HttpProvider('http://' + rpcConfig.host + ':' + rpcConfig.port);

// if (rpcConfig.host !== 'localhost') {
//   const host = rpcConfig.host;
//   const port = rpcConfig.port;
//   rpcConfig.provider = new Web3.providers.HttpProvider('http://' + host + ':' + port);
// }

module.exports = rpcConfig;
