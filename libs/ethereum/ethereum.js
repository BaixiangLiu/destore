'use strict';
const init = require('./init.js');
const config = require('./../config/config.js');
const promisify = require('es6-promisify');
const path = require('path');
const fs = require('fs');
const promisifiy = require('es6-promisify');

const createAccount = require('./createAccount');
const unlockAccount = require('./unlockAccount');

const buildContracts = require('./buildContracts');

const rpcConfig = config.rpc;
const contractsConfig = config.contracts;

class Ethereum {
  constructor() {
    this._web3 = init();
    this._init = false;
    this._execBind = null;

    this.account = null;
    this.accounts = [];

    // default options for destore methods
    /**
    const options = {
      from: {String}, // The address for the sending account. Uses the web3.eth.defaultAccount property, if not specified.
      to: {String}, // (optional) The destination address of the message, left undefined for a contract-creation transaction.
      value: {Number|String|BigNumber}, // (optional) The value transferred for the transaction in Wei, also the endowment if it's a contract-creation transaction
      gas: {Number|String|BigNumber}, // optional, default: To-Be-Determined) The amount of gas to use for the transaction (unused gas is refunded).

      gasPrice: {Number|String|BigNumber}, // (optional, default: To-Be-Determined) The price of gas for this transaction in wei, defaults to the mean network gas price.
      data: {String}, // (optional) Either a byte string containing the associated data of the message, or in the case of a contract-creation transaction, the initialisation code.
      nonce: {Number} //  (optional) Integer of a nonce. This allows to overwrite your own pending transactions that use the same nonce.
    }
    **/
    this.defaults = {
      from: this.account,
      gas: 2000000,
      value: 0,
    };
  }

  /**
   * @contractName {String} name of contract in contractConfig.build
   * @returns {Object} built contract
   **/
  _getBuiltContract(contractName) {
    this.init();
    let contract;
    try {
      contract = require(contractsConfig.built + contractName + '.sol.js');
    } catch (e) {
      throw ('Invalid contract in deploy');
    }
    return contract;
  }

  /**
  * Builds Solidity contracts.
  * @ contractFiles - array - an array of contract.sol
  * @ directoryPath - string - path where contract files are located. Optional. Will be taken from config
  **/
  buildContracts(contractFiles, directoryPath) {
    return buildContracts(contractFiles, directoryPath);
  }

  /**
   * initializes the RPC connection with the local Ethereum node
   * call before every Ethereum method
   * @returns connected web3 object
   **/
  init() {
    if (this._init === false) {
      this._web3 = init();
      this._init = true;
      if (this.check() === false) {
        throw ('Not connected to RPC');
      } else {
        this.accounts = this._web3.eth.accounts;
        // rebinding this doesn't work
        this._web3.eth.defaultAccount = this._web3.eth.accounts[0];
        this.account = this.accounts[0];
      }
    }
    return this._web3;
  }

  /**
   * checks connection to RPC
   * @returns connection status
   **/
  check() {
    if (!this._web3) {
      return false;
    } else {
      return this._web3.isConnected();
    }
  }

  /**
   * @index {Number} index of the account in web3.eth.accounts to change to
   * @returns account
   **/
  changeAccount(index) {
    this.init();
    if (index < 0 || index >= this.accounts.length) {
      return this.account;
    } else {
      this.account = this.accounts[index];
      this._web3.eth.defaultAccount = this.account;
      return this.account;
    }
  }

  /**
   * NEED TO CALL PROCESS.EXIT() IN CALLBACK!
   * @password {String}
   * @returns {String} - id of created account
   **/
  createAccount(password) {
    this.init();
    return createAccount(password);
  }

  /**
   * @address {String}
   * @password {String}
   * @timeLength {Number}
   * @returns {Boolean} - indication if the account was unlocked
   **/
  unlockAccount(address, password, timeLength) {
    this.init();
    return unlockAccount(address, password, timeLength);
  }

  /**
   * @index {Number} index of the account to check the balance of in Ether
   **/
  getBalanceEther(index) {
    this.init();
    let amount;
    if (!index) {
      amount = this._web3.eth.getBalance(this.account);
    } else if (index < 0 || index >= this.accounts.length) {
      amount = this._web3.eth.getBalance(this.account);
    } else {
      amount = this._web3.eth.getBalance(this.accounts[index]);
    }
    return Number(this._web3.fromWei(amount, 'ether').toString());
  }

  /**
   * 1 Ether = 1,000,000,000,000,000,000 wei
   * @index {Number} index of the account to check the balance of in wei
   **/
  getBalanceWei(index) {
    this.init();
    let amount;
    if (!index) {
      amount = this._web3.eth.getBalance(this.account);
    } else if (index < 0 || index >= this.accounts.length) {
      amount = this._web3.eth.getBalance(this.account);
    } else {
      amount = this._web3.eth.getBalance(this.accounts[index]);
    }
    return Number(amount.toString());
  }

  /**
   * Convert Ether amount to wei
   * @amount {Number} or {BigNumber} - amount to convert
   * @return {Number} - wei amount
   **/
  toWei(amount) {
    this.init();
    return Number(this._web3.toWei(amount, 'ether').toString());
  }

  /**
   * Convert wei amount to Ether
   * @amount {Number} or {BigNumber} - amount to convert
   * @return {Number} - Ether amount
   **/
  toEther(amount) {
    this.init();
    return Number(this._web3.fromWei(amount, 'ether').toString());
  }

  /**
   * @contractName {String} name of contract in contractConfig.build
   * @args {Array} passed into new contract as initial parameters
   * @options {Object} {from: address, value: {Number}, gas: {Number}, gasValue: {Number}}
   * @returns {Object} Promise with the res as the contract instance
   **/
  deploy(contractName, args, options) {
    this.init();
    const contract = this._getBuiltContract(contractName);
    // need to add more default options
    if (!options) {
      options = this.defaults;
    }
    contract.defaults(options);
    contract.setProvider(rpcConfig.provider);
    const contractInstance = contract.new.apply(contract, args);
    // const address = '0x200cd7a869642959b39cc7844cc6787d598ffc63';
    //
    // this.execAt2('DeStore', address, 'receiverAdd');
    return contractInstance;
  }

  /**
   * Binds contract with its address so it can be called easily with Ethereum.exec
   * HAVEN'T TESTED YET
   **/
  bindContract(contractName, contractAddress) {
    this.init();
    const contract = this._getBuiltContract(contractName);
    contract.setProvider(rpcConfig.provider);
    this._execBind = contract.at(contractAddress);
    return true;
  }

  /**
   * Pudding Contract needs to have been deployed first
   * If bind contract was called then it
   * @contractName {String} name of contract in contractConfig.build
   * @returns {Object} contract instance. Calling methods on it will return a Promise
   **/
  // executes contract with it's deployed address
  // returns Promise of the transaction or call
  exec(contractName) {
    this.init();
    if (this._execBind && !contractName) return this._execBind;

    const contract = this._getBuiltContract(contractName);
    contract.setProvider(rpcConfig.provider);
    const contractInstance = contract.deployed();
    return contractInstance;
  }

  /**
   * @contractName {String} name of contract in contractConfig.build
   * @contractAddress {String} '0x3d...' length of 42
   * @returns {Object} contract instance. Calling methods on it will return a Promise
   **/
  execAt(contractName, contractAddress) {
    this.init();
    const contract = this._getBuiltContract(contractName);
    contract.setProvider(rpcConfig.provider);
    const contractInstance = contract.at(contractsConfig.deStore);
    return contractInstance;
  }

  /**
   *
   * @return {Object} instance you can call watch(), get(), stopWatching()
   **/
  watchAt(contractName, contractAddress, method, filter) {
    this.init();
    const contractInstance = this.execAt(contractName, contractAddress);
    let event = contractInstance[method];
    event = event({}, filter);
    return event;
  }

  /**
  * @contractName {String} name of contract in contractConfig.build
  * @contractAddress {String} '0x3d...' length of 42
  * @method {String}
  # @filter {Object}
  * @returns Promise with response as filtered logs
  **/
  getEventLogs(contractName, contractAddress, method, filter) {
    this.init();
    if (!filter) {
      filter = {
        address: contractAddress
      };
    }
    const contractInstance = this.execAt(contractName, contractAddress);
    let methodEvent = contractInstance[method];
    methodEvent = methodEvent({}, {
      fromBlock: 0
    });
    // MAJOR BUG. If it doesnt return any events it freezes
    return promisify((event, callback) => {
      event.get((err, logs) => {
        if (err) callback(err, null);
        else {
          const filteredLunlocogs = {};
          logs = logs.filter((element) => {
            for (let key in filter) {
              if (filter[key] !== element[key] && element[key] !== undefined) {
                return false;
              }
            }
            return true;
          });
          logs = logs.map(element => {
            return element.args;
          });
          callback(null, logs);
        }
      });
    })(methodEvent);
  }

  /**
   * Calls the DeStore contract. Address taken from config.contracts.deStore
   **/
  deStore() {
    this.init();
    const contract = this._getBuiltContract('DeStore');
    contract.setProvider(rpcConfig.provider);
    const contractInstance = contract.at(config.contracts.deStore);
    return contractInstance;
  }

}

module.exports = new Ethereum();
