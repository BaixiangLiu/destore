'use strict';

const program = require('commander');
const Ethereum = require('./libs/ethereum/ethereum.js');
const IPFS = require('./libs/ipfs/ipfs.js');
const saveContracts = require('./libs/saveContracts.js');

const Upload = require('./models/Upload.js');
const Host = require('./models/Host.js');
const DeStoreAddress = require('./models/DeStoreAddress.js');

const config = require('./libs/config/config.js');

const lol = console.log.bind(console);

program
  .version('0.0.1')
  .option('init')
  .option('destore', 'Deploy DeStore Contract ')
  .option('receivers')
  .option('reset-db')
  .option('reset-host')
  .option('reset-upload')
  .option('create-account')
  .option('unlock')
  .option('testrpc', 'Set up testrpc env')
  .option('receiverInfo');
program
  .command('save <file>')
  .action(function (file) {
    console.log('save');
    saveContracts(file);
  });

program.parse(process.argv);
Ethereum.init();

if (program.init) {
  Ethereum.init();
  Upload.reset();
  Host.reset();
  Ethereum.changeAccount(0);
  const deployOptions = {
    from: Ethereum.account,
    gas: 3000000,
    gasValue: 20000000000
  };
  // const promises = [];
  // for (let i = 0; i < Ethereum.accounts.length; i++) {
  //   promises.push(Ethereum.unlockAccount(Ethereum.accounts[i], 'hello'));
  // }
  // Promise.all(promises)
  //   .then(bools => {
  //     console.log(bools);

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

if (program.destore) {
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

if (program.receivers) {
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
if (program.resetDb) {
  Upload.reset();
  Host.reset();
}

if (program.resetHost) {
  Host.reset();
}

if (program.resetUpload) {
  Upload.reset();
}

if (program.createAccount) {
  Ethereum.createAccount('hello')
    .then(res => {
      console.log('created new account');
      console.log(res);
      process.exit();
    })
    .catch(err => {
      console.error(err);
      process.exit();
    });
}

if (program.unlock) {
  // for (let i = 1; i < Ethereum.accounts.length; i++) {
  //   const web3 = Ethereum.init();
  //   web3.eth.sendTransaction({from: Ethereum.accounts[0], to: Ethereum.accounts[i], value: Ethereum.toWei(50)});
  //   console.log(Ethereum.getBalanceEther(i));
  // }
  Ethereum.init();
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
    });
}

if (program.testrpc) {
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
      return Ethereum.deStore().receiverAdd(1000000, {from: Ethereum.account});
    })
    .then(tx => {
      Ethereum.changeAccount(2);
      console.log(Ethereum.account);

      return Ethereum.deStore().receiverAdd(1000000, {from: Ethereum.account});
    })
    .then(tx => {
      Ethereum.changeAccount(3);
      console.log(Ethereum.account);

      return Ethereum.deStore().receiverAdd(1000000, {from: Ethereum.account});
    })
    .then(tx => {
      Ethereum.changeAccount(4);
      console.log(Ethereum.account);

      return Ethereum.deStore().receiverAdd(1000000, {from: Ethereum.account});
    })
    .then(arr => {
      console.log('Receiver Accounts');
      console.log(arr);
    })
    .catch(err => {
      console.error(err);
    });
}

if (program.receiverInfo) {
  Ethereum.init();
  config.contracts.deStore = DeStoreAddress.get();

  Ethereum.deStore().getReceiverIndex()
    .then(index => {
      console.log('Reciever Index', index);
      return Ethereum.deStore().getReceiverList();
    })
    .then(list => {
      console.log('list', list);
    })
    .catch(err => {
      console.error(err);
    });
}
