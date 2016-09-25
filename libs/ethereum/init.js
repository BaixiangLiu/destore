'use strict';

const Web3 = require('web3');
const rpcConfig = require('./../config/rpc.js');

let web3;

module.exports = function(rpcHost, rpcPort) {
  const host = rpcConfig.host;
  const port = rpcConfig.port;
  if (typeof web3 !== 'undefined') {
    web3 = new Web3(web3.currentProvider);
  } else if (rpcPort && rpcHost) {
    const rpcProvider = new Web3.providers.HttpProvider('http://' + rpcHost + ':' + rpcPort);
    web3 = new Web3(rpcProvider);
  } else if (rpcHost) {
    const rpcProvider = new Web3.providers.HttpProvider('http://' + rpcHost + ':' + rpcConfig.port);
    web3 = new Web3(rpcProvider);
  } else {
    web3 = new Web3(rpcConfig.provider);
  }
  return web3;
};
