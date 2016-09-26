'use strict';
const promisify = require('es6-promisify');
const path = require('path');
const fs = require('fs');

const init = require('./init.js');
const initIPC = require('./initIPC.js');
const config = require('./../config/config.js');

const createAccount = require('./createAccount');
const unlockAccount = require('./unlockAccount');

const buildContracts = require('./buildContracts');

const rpcConfig = config.rpc;
const contractsConfig = config.contracts;

class Ethereum {
  /**
   * Create an Ethereum object. Will need to use Ethereum.init() to connect to the Web3 RPC provider and use the Ethereun object methods
   */
  constructor() {
    this._web3 = init();
    this._web3IPC = null;
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
    */
    this.defaults = {
      from: this.account,
      value: 0,
      gas: 3000000
    };
  }

  /**
   * @param {string} contractName Name of contract in the directory path provided in Ethereum.contract.build
   * @returns {Contract} The built contract
   */
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
   * @param {array} contractFiles Array of contract file names in the directory path provided in Ethereum.config.contracts
   * @param {string} directoryPath Optional. Directory path where contract files are located. If none is given the directory path will be retrieved from Ethereum.config.contracts
   */
  buildContracts(contractFiles, directoryPath) {
    return buildContracts(contractFiles, directoryPath);
  }

  /**
   * Initializes a RPC connection with a local Ethereum node. The RPC provider is set in Ethereum.config.rpc.port. Need to call before using the Ethereum object. If RPC connection is already initalized and valid the RPC connection will be set to the current provider.
   * @param {string} rpcHost The host URL path to the RPC connection. Optional. If not given the rpcHost path will be taken from Ethereum.config.rpc.host.
   * @param {number} rpcPort The port number to the RPC connection. Optional. If not given the rpcPort path will be taken from Ethereum.config.rpc.port.
   * @returns {Web3} The Web3 object Ethereum uses set up to the RPC provider
   */
  init(rpcHost, rpcPort) {
    if (this._init === false) {
      this._web3 = init(rpcHost, rpcPort);
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
   * Initializes an IPC connection with a local Ethereum node. The IPC provider is set in Ethereum.config.ipc.host. Need to call before using the Ethereum object IPC methods.
   * @param {string} ipcPath Path to the IPC provider. Example for Unix: process.env.HOME + '/Library/Ethereum/geth.ipc'
   * @returns {Web3} The Web3 object Ethereum uses for its IPC connection.
   */
  initIPC(ipcPath) {
    this._web3IPC = initIPC(ipcPath);
    return this._web3IPC;
  }

  /**
   * Checks the connection to the RPC provider
   * @return {bool} The true or false status of the RPC connection
   */
  check() {
    if (!this._web3) {
      return false;
    } else {
      return this._web3.isConnected();
    }
  }

  /**
   * Change the account address being used by the Ethereum object.
   * @param {number} index Index of the account address returned from web3.eth.accounts to change to.
   * @return {string} The account address now being used.
   */
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
   * Creates a new Ethereum account. The account will be located in your geth Ethereum directory in a JSON file encrpyted with the password provided. process.exit() needs to be called in Promise or the method will run indefinately. Don't use process.exit() if using method in Electron.
   * @param {string} password - The password to create the new account with.
   * @return {Promise} Promise return is a string with the newly created account's address.
   */
  createAccount(password) {
    this.initIPC();
    return createAccount(password, this._web3IPC);
  }

  /**
   * Unlocks an Ethereum account. process.exit() needs to be called in Promise or the method will run indefinately. Don't use process.exit() if using method in Electron.
   * @param {string} address - The address of the account.
   * @param {string} password - Password of account.
   * @param {number} timeLength - Time in seconds to have account remain unlocked for.
   * @return {boolean} Status if account was sucessfully unlocked.
   */
  unlockAccount(address, password, timeLength) {
    this.initIPC();
    return unlockAccount(address, password, timeLength, this._web3IPC);
  }

  /**
   * Get the Ether balance of an account in Ether denomination.
   * @param {number} index - Index of the account to check the balance of in Ether.
   * @return {number} The amount of Ether contained in the account.
   */
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
   * Get the Ether balance of an account in Wei denomination. 1 Ether = 1,000,000,000,000,000,000 wei
   * @param {number} index - Index of the account to check the balance of inWei.
   * @return {number} The amount of Ether in Wei contained in the account.
   */
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
   * Convert an Ether amount to Wei
   * @param {number} amount - Amount to convert. Can also be a BigNumber object.
   * @return {number} Converted Wei amount.
   */
  toWei(amount) {
    this.init();
    return Number(this._web3.toWei(amount, 'ether').toString());
  }

  /**
   * Convert a Wei amount to Ether.
   * @param {number} amount - Amount to convert. Can also be a BigNumber object.
   * @return {number} Converted Ether amount.
   */
  toEther(amount) {
    this.init();
    return Number(this._web3.fromWei(amount, 'ether').toString());
  }

  /**
   * Deploy a built contract.
   * @param {string} contractName - Name of built contract located in the directory provided in Ethereum.config.build.
   * @param {Array} args - Arguments to be passed into the deployed contract as initial parameters.
   * @param {Object} options - Transaction options. Options are: {from: contract address, value: number, gas: number, gasValue: number}.
   * @return {Promise} The response is a Contract object of the deployed instance.
   */
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
   * Binds contract at a specific address so it can be called with Ethereum.exec().
   */
  bindContract(contractName, contractAddress) {
    this.init();
    const contract = this._getBuiltContract(contractName);
    contract.setProvider(rpcConfig.provider);
    this._execBind = contract.at(contractAddress);
  }

  /**
   * Calls a deployed contract. Contract must have been deployed earlier in the process. If Ethereum.bindContract was used, method returns the bound contract.
   * @param {string} contractName - Name of built contract located in the directory provided in Ethereum.config.build.
   * @return {Contract} Contract object that you can call methods with.
   */
  exec(contractName) {
    this.init();
    if (this._execBind && !contractName) return this._execBind;
    const contract = this._getBuiltContract(contractName);
    contract.setProvider(rpcConfig.provider);
    const contractInstance = contract.deployed();
    return contractInstance;
  }

  /**
   * Calls a deployed contract at a specific address.
   * @param {string} contractName - Name of built contract located in the directory provided in Ethereum.config.build.
   * @param {string} contractAddress - Address of the contract.
   * @return {Contract} Contract object that you can call methods with.
   */
  execAt(contractName, contractAddress) {
    this.init();
    const contract = this._getBuiltContract(contractName);
    contract.defaults(this.defaults);
    contract.setProvider(rpcConfig.provider);
    const contractInstance = contract.at(contractAddress);
    return contractInstance;
  }

  /**
   *
   * @return {Object} instance you can call watch(), get(), stopWatching()
   */
  // watchAt(contractName, contractAddress, method, filter) {
  //   this.init();
  //   const contractInstance = this.execAt(contractName, contractAddress);
  //   let event = contractInstance[method];
  //   event = event({}, filter);
  //   return event;
  // }

  /**
   * @param {string} contractName - Name of built contract located in the directory provided in Ethereum.config.build.
   * @param {string} contractAddress - Address of the contract.
   * @param {string} method - The name of the event method.
   * @param {Object} filter - Options to filter the events. Default: { address: contractAddress }.
   * @return {Promise} The response contains an array event logs.
  */
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
   * Calls the DeStore contract. Address taken from Ethereum.config.contracts.deStore.
   * return {Contract}
   */
  deStore() {
    this.init();
    const contract = this._getBuiltContract('DeStore');
    contract.setProvider(rpcConfig.provider);
    const contractInstance = contract.at(config.contracts.deStore);
    return contractInstance;
  }

}

module.exports = new Ethereum();
