'use strict';
const Web3 = require('web3');

const init = require('./init.js');
const compile = require('./compile.js');

const rpcConfig = require('./../config/config.js').rpc;
const contractsConfig = require('./../config/config.js').contracts;

const Datastore = require('nedb');
const db = new Datastore({
  filename: './../../data/data.db',
  autoload: true
});

function Ethereum() {
  this._web3 = init();
  this._accounts = null;

  // initializes the RPC connection with the local Ethereum node
  // call before every method
  this._init = () => {
    console.log('this._init');
    this._web3 = init();
    if (this.check() === false) {
      throw ('Not connected to RPC');
    } else {
      this._accounts = this._web3.eth.accounts;
    }
  };

  // checks connection to RPC
  this.check = () => {
    if (!this._web3) {
      return false;
    } else {
      return this._web3.isConnected();
    }
  };

  // checks what accounts node controls
  // returns an array of accounts
  this.getAccounts = () => {
    this._init();
    console.log(this._web3.eth.accounts);
    return this._web3.eth.accounts;
  };

  this.addAccount = () => {
    // allows user to login to new account
  };

  // returns a Promise
  this.deploy = (contractName, options) => {
    this._init();
    let puddingContract;
    try {
      puddingContract = require(contractsConfig.built + contractName + '.sol.js');
    }
    catch(e) {
      console.log('Invalid contract in deploy');
      return;
    }
    // need to add more default options
    if (!options) {
      options = {
        from: this._accounts[0]
      };
    }
    puddingContract.defaults(options);
    puddingContract.setProvider(rpcConfig.provider);
    const contract = puddingContract.new();
    return contract;
  };

  // returns Promise
  this.exec = (contractName) => {
    this._init();
    let puddingContract;
    try {
      puddingContract = require(contractsConfig.built + contractName + '.sol.js');
    }
    catch(e) {
      throw('Invalid contract in deploy');
    }
    puddingContract.setProvider(rpcConfig.provider);
    const contract = puddingContract.deployed();
    return contract;
  };

  // exec contract at a specific contract address
  // returns Promise
  this.execAt = (contractName, contractAddress) => {
    this._init();
    let puddingContract;
    try {
      puddingContract = require(contractsConfig.built + contractName + '.sol.js');
    }
    catch(e) {
      throw('Invalid contract in deploy');
    }
    puddingContract.setProvider(rpcConfig.provider);

    const contract = puddingContract.at(contractAddress);
    return contract;
  };
}

module.exports = new Ethereum();
