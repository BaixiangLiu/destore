'use strict';
const program = require('commander');
const Ethereum = require('./libs/ethereum/ethereum.js');
const UploadDB = require('./models/Upload.js');
const HostDB = require('./models/Host.js');
const DeStoreAddress = require('./models/DeStoreAddress.js');
const config = require('./libs/config/config.js');

/**
  * DeStore specific commands
  */
program
  .option('test', 'Sets up testing environment for DeStore')
  .option('testrpc', 'Sets up testrpc testing environment for DeStore')
  .option('deploy', 'Deploy a single DeStore contract')
  .option('receivers','Creates receivers for DeStore')
  .option('reset', 'Resets the databases for DeStore');

program
  .command('build <file>')
  .action((file) => {
    Ethereum.buildContracts(file);
  });

program.parse(process.argv);

if (program.test) {
  Ethereum.init();
  let Upload;
  let Host;
  for (let i = 0; i < 7; i++) {
    Upload = new UploadDB(Ethereum.accounts[i]);
    Upload.reset();
    Host = new HostDB(Ethereum.accounts[i]);
    Host.reset();
  }
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
      return Ethereum.unlockAccount(Ethereum.accounts[5], 'hello', 10000000);
    })
    .then(bool => {
      return Ethereum.unlockAccount(Ethereum.accounts[6], 'hello', 10000000);
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

if (program.testrpc) {
  Ethereum.init();
  let Upload;
  let Host;
  for (let i = 0; i < 5; i++) {
    Upload = new UploadDB(Ethereum.accounts[i]);
    Upload.reset();
    Host = new HostDB(Ethereum.accounts[i]);
    Host.reset();
  }
  Ethereum.changeAccount(0);
  const deployOptions = {
    from: Ethereum.account,
    gas: 3000000,
    gasValue: 20000000000
  };
  const storage = 5 * 1024 * 1024 * 1024;
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
      console.log('Receiver account: ', Ethereum.account);
      return Ethereum.deStore().receiverAdd(storage, {from: Ethereum.account});
    })
    .then(tx => {
      Ethereum.changeAccount(3);
      console.log('Receiver account: ', Ethereum.account);
      return Ethereum.deStore().receiverAdd(storage, {from: Ethereum.account});
    })
    .then(tx => {
      Ethereum.changeAccount(4);
      console.log('Receiver account: ', Ethereum.account);
      return Ethereum.deStore().receiverAdd(storage, {from: Ethereum.account});
    })
    .then(tx => {
      Ethereum.changeAccount(5);
      console.log('Receiver account: ', Ethereum.account);
      return Ethereum.deStore().receiverAdd(storage, {from: Ethereum.account});
    })
    .then(tx => {
      Ethereum.changeAccount(6);
      console.log('Receiver account: ', Ethereum.account);
      return Ethereum.deStore().receiverAdd(storage, {from: Ethereum.account});
    })
    .then(tx => {
      Ethereum.changeAccount(7);
      console.log('Receiver account: ', Ethereum.account);
      return Ethereum.deStore().receiverAdd(storage, {from: Ethereum.account});
    })
    .then(tx => {
      Ethereum.changeAccount(8);
      console.log('Receiver account: ', Ethereum.account);
      return Ethereum.deStore().receiverAdd(storage, {from: Ethereum.account});
    })
    .then(tx => {
      Ethereum.changeAccount(9);
      console.log('Receiver account: ', Ethereum.account);
      return Ethereum.deStore().receiverAdd(storage, {from: Ethereum.account});
    })
    .then(tx => {

    })
    .catch(err => {
      console.error(err);
    });
}

if (program.deploy) {
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

if (program.reset) {
  Ethereum.init();
  let Upload;
  let Host;
  for (let i = 0; i < Ethereum.accounts.length; i++) {
    Upload = new UploadDB(Ethereum.accounts[i]);
    Upload.reset();
    Host = new HostDB(Ethereum.accounts[i]);
    Host.reset();
  }
}
