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
  // .option('build <file>', 'Builds a contract from contract directory specificed in config')
  // .option('create <password>', 'Creates an Ethereum account with specified password')
  // .option('unlock <index> <password> <time>', 'Unlocks an Ethereum account with Ethereum.accounts index, password, and time')
  // .option('bind <contractName> <contractAddress>', 'Binds a contract so it can be executed with the exec command')
  // .option('exec <method> [args...]', 'Calls a specific method on a built contract');

/**
  * DeStore specific commands
  */
program
  .option('destore-test', 'Sets up testing environment for DeStore')
  .option('destore-testrpc', 'Sets up testrpc testing environment for DeStore')
  .option('destore-deploy', 'Deploy a single DeStore contract')
  .option('destore-receivers','Creates receivers for DeStore')
  .option('destore-reset', 'Resets the databases for DeStore');

/**
  * Builds a contract from contract directory specificed in config
  */
program
  .command('build <file>')
  .action((file) => {
    Ethereum.buildContracts(file);
  });

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

program
  .command('exec <contractName> <method> [args...]')
  .action((contractName, method, args) => {
    Ethereum.init();
    Cli.getOptions()
      .then(options => {
        Ethereum.default = options;
        return Cli.getContract(contractName);
      })
      .then(doc => {
        const contract = Ethereum.execAt(doc.contractName, doc.contractAddress);
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
  * Unlocks an Ethereum account with Ethereum.accounts index, password, and time
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

program
  .command('balance <index>')
  .action((index) => {
    Ethereum.init();
    const balance = Ethereum.getBalanceEther(index);
    console.log(balance);
  });

// program
//   .command('logs <contractName> <event>')
//   .action((contractName, event) => {
//     Ethereum.init();
//     return Ethereum.getEventLogs
//   })

program
  .option('testrpc', 'Starts up a testrpc server at port 8545');

program.parse(process.argv);

if (program.testrpc) {
  var TestRPC = require('ethereumjs-testrpc');
  var server = TestRPC.server();
  server.listen(8545, function(err, blockchain) {
    if (err) {
      console.log(err);
    } else {
      console.log('testrpc-server started');
    }
  });
}

if (program.destoreTest) {
  Ethereum.init();
  Upload.reset();
  Host.reset();
  Ethereum.changeAccount(0);
  const deployOptions = {
    from: Ethereum.account,
    gas: 3000000,
    gasValue: 20000000000
  };
  Ethereum.unlockAccount(Ethereum.accounts[0], 'hello', 10000000)
    .then(bool => {
      return Ethereum.unlockAccount(Ethereum.accounts[1], 'hello', 10000000);
    })
    .then(bool => {
      return Ethereum.unlockAccount(Ethereum.accounts[2], 'hello', 10000000);
    })
    .then(bool => {
      return Ethereum.unlockAccount(Ethereum.accounts[3], 'hello', 10000000);
    })
    .then(bool => {
      return Ethereum.unlockAccount(Ethereum.accounts[4], 'hello', 10000000);
    })
    .then(bool => {
      return Ethereum.deploy('DeStore', [], deployOptions);
    })
    .then(instance => {
      config.contracts.deStore = instance.address;
      console.log('Deloyed DeStore', instance.address);
      DeStoreAddress.save(instance.address);
      const storage = 5 * 1024 * 1024 * 1024;
      return Promise.all([
        Ethereum.deStore().receiverAdd(storage, {from: Ethereum.accounts[1], gas: 300000, gasValue: 20000000000}),
        Ethereum.deStore().receiverAdd(storage, {from: Ethereum.accounts[2], gas: 300000, gasValue: 20000000000}),
        Ethereum.deStore().receiverAdd(storage, {from: Ethereum.accounts[3], gas: 300000, gasValue: 20000000000}),
        Ethereum.deStore().receiverAdd(storage, {from: Ethereum.accounts[4], gas: 300000, gasValue: 20000000000}),
      ]);
    })
    .then(arr => {
      console.log('Receiver Accounts');
      console.log(arr);
      process.exit();
    })
    .catch(err => {
      console.error(err);
      process.exit();

    });
}
if (program.destoreTestrpc) {
  Ethereum.init();
  Upload.reset();
  Host.reset();
  Ethereum.changeAccount(0);
  const deployOptions = {
    from: Ethereum.account,
    gas: 3000000,
    gasValue: 20000000000
  };
  const storage = 5 * 1024 * 1024 * 1024;

  console.log(Ethereum.accounts);
  Ethereum.deploy('DeStore', [], deployOptions)
    .then(instance => {
      config.contracts.deStore = instance.address;
      console.log('Deloyed DeStore', instance.address);
      DeStoreAddress.save(instance.address);
      Ethereum.changeAccount(0);
      return Ethereum.deStore().senderAdd({from: Ethereum.account});
    })
    .then(tx => {
      Ethereum.changeAccount(1);
      console.log(Ethereum.account);
      return Ethereum.deStore().receiverAdd(storage, {from: Ethereum.account});
    })
    .then(tx => {
      Ethereum.changeAccount(2);
      console.log(Ethereum.account);

      return Ethereum.deStore().receiverAdd(storage, {from: Ethereum.account});
    })
    .then(tx => {
      Ethereum.changeAccount(3);
      console.log(Ethereum.account);

      return Ethereum.deStore().receiverAdd(storage, {from: Ethereum.account});
    })
    .then(tx => {
      Ethereum.changeAccount(4);
      console.log(Ethereum.account);

      return Ethereum.deStore().receiverAdd(storage, {from: Ethereum.account});
    })
    .then(arr => {
      console.log('Receiver Accounts');
      console.log(arr);
    })
    .catch(err => {
      console.error(err);
    });
}
if (program.destoreDeploy) {
  Ethereum.init();
  Ethereum.changeAccount(0);
  console.log(Ethereum.account);
  console.log(Ethereum.getBalanceEther());
  const deployOptions = {
    from: Ethereum.account,
    gas: 3000000
  };
  Ethereum.deploy('DeStore', [], deployOptions)
    .then(instance => {
      config.contracts.deStore = instance.address;
      console.log(instance.address);
      DeStoreAddress.save(instance.address);
    })
    .then(arr => {
      console.log(arr);
    })
    .catch(err => {
      console.error(err);
    });
}
if (program.destoreReceivers) {
  Ethereum.init();
  config.contracts.deStore = DeStoreAddress.get();

  Promise.all([
    Ethereum.deStore().receiverAdd(1000000000, {from: Ethereum.accounts[1]}),
    Ethereum.deStore().receiverAdd(1000000000, {from: Ethereum.accounts[2]}),
    Ethereum.deStore().receiverAdd(1000000000, {from: Ethereum.accounts[3]}),
    Ethereum.deStore().receiverAdd(1000000000, {from: Ethereum.accounts[4]}),
  ])
    .then(arr => {
      console.log(arr);
    })
    .catch(err => {
      console.error(err);
    });
}
if (program.destoreReset) {
  Upload.reset();
  Host.reset();
}
