'use strict';
const program = require('commander');
const Ethereum = require('./libs/ethereum/ethereum.js');
// const IPFS = require('./libs/ipfs/ipfs.js');

const Upload = require('./models/Upload.js');
const Host = require('./models/Host.js');
const Cli = require('./models/Cli.js');

const DeStoreAddress = require('./models/DeStoreAddress.js');
const config = require('./libs/config/config.js');

program
  .version('0.0.1');

/**
  * Build a Solidity contract from contract directory specificied in Ethereum.config.contracts
  */
program
  .command('build <file>')
  .action((file) => {
    Ethereum.buildContracts(file);
  });

/**
 * Set options for transactions called with CLI.
 */
program
  .command('options <fromIndex> <value> <gas> [extra...]')
  .action((fromIndex, value, gas, extra) => {
    Ethereum.init();
    const fromAccount = Ethereum.accounts[fromIndex];
    let gasValue = null;
    if (extra[0]) gasValue = extra[0];

    Cli.setOptions(fromAccount, value, gas, gasValue)
      .then(status => {
        console.log(status);
        return Cli.getOptions();
      })
      .then(options => {
        console.log(options);
      })
      .catch(err => {
        console.error(err);
      });
  });

/**
 * Deploy a built contract located in path provided by Ethereum.config.built.
 */
program
  .command('deploy <contractName> [args...]')
  .action((contractName, args) => {
    Ethereum.init();
    Cli.getOptions()
      .then(options => {
        Ethereum.defaults = options;
        return Ethereum.deploy(contractName, args);
      })
      .then(instance => {
        console.log(instance.address);
        return Cli.setContract(contractName, instance.address);
      })
      .then(status => {
        console.log(status);
      })
      .catch(err => {
        console.error(err);
      });
  });

/**
 * Set the address of a particular contract when called with exec
 */
program
  .command('set <contractName> <contractAddress>')
  .action((contractName, contractAddress) => {
    console.log('bind');
    Cli.setContract(contractName, contractAddress)
      .then(status => {
        console.log(status);
        return Cli.getContract(contractName);
      })
      .then(contractInfo => {
        console.log(contractInfo);
      })
      .catch(err => {
        console.error(err);
      });
  });

/**
 * Executes a deployed contract with specified method and provided arguments
 */
program
  .command('exec <contractName> <method> [args...]')
  .action((contractName, method, args) => {
    Ethereum.init();
    Cli.getOptions()
      .then(options => {
        Ethereum.default = options;
        return Cli.getContract(contractName);
      })
      .then(info => {
        const contract = Ethereum.execAt(info.contractName, info.contractAddress);
        args.push(Ethereum.defaults);
        return contract[method].apply(this, args);
      })
      .then(txRes => {
        console.log(txRes);
      })
      .catch(err => {
        console.error(err);
      });
  });

program
  .command('logs <contractName> <event>')
  .action((contractName, event) => {
    Ethereum.init();
    Cli.getContract(contractName)
      .then(info => {
        return Ethereum.getEventLogs(info.contractName, info.contractAddress, event);
      })
      .then(logs => {
        console.log(logs);
      })
      .catch(err => {
        console.error(err);
      });
  });

/**
 * Get the balance of a particular Ethereum account based on account index.
 */
program
  .command('balance <index>')
  .action((index) => {
    Ethereum.init();
    const balance = Ethereum.getBalanceEther(index);
    console.log(balance);
  });

/**
 * Create a new Ethereum account
 */
program
  .command('create <password>')
  .action(password => {
    Ethereum.init();
    Ethereum.createAccount(password)
      .then(res => {
        console.log(res);
        process.exit();
      })
      .catch(err => {
        console.error(err);
        process.exit();
      });
  });

/**
  * Unlocks an Ethereum account.
  */
program
  .command('unlock <index> <password> <time>')
  .action((index, password, time) => {
    Ethereum.init();
    Ethereum.unlockAccount(Ethereum.accounts[index], password, time)
      .then(bool => {
        process.exit();
      })
      .catch(err => {
        console.error(err);
        process.exit();
      });
  });

program.parse(process.argv);
