'use strict';

const tape = require('tape');
const tapes = require('tapes');
const tapSpec = require('tap-spec');
const Ethereum = require('../libs/ethereum/ethereum.js');
const IPFS = require('./../libs/ipfs/ipfs.js');
const path = require('path');

const DeStoreAddress = require('./../models/DeStoreAddress.js');

const config = require('./../libs/config/config.js');

tape.createStream()
  .pipe(tapSpec())
  .pipe(process.stdout);

const test = tapes(tape);

const lol = console.log.bind(console);

// const Upload = require('./../models/Upload.js');
// const Host = require('./../models/Host.js');

const Sender = require('./../app/javascripts/sender/sender.js');
const Receiver = require('./../app/javascripts/receiver/receiver.js');

const web3 = Ethereum.init();

IPFS.init();
// Upload.reset();
// Host.reset();

test('Deploying new DeStore contract and adding a sender and receiver', t => {
  Ethereum.changeAccount(0);
  const deployOptions = {
    from: Ethereum.account,
  };
  Ethereum.deploy('DeStore', [], deployOptions)
    .then(instance => {
      config.contracts.deStore = instance.address;
      t.equal(instance.address.length, 42, 'Contract address should have a length of 42');
      return Ethereum.deStore().senderAdd();
    })
    .then(tx => {
      return Ethereum.deStore().receiverAdd(10000000000, {from: Ethereum.accounts[1]});
    })
    .then(tx => {
      t.end();
    })
    .catch(err => {
      console.error(err);
      t.fail();
    });
});

test('Testing mountFile', t => {
  const fileValue = 1;
  const fileValueMB = fileValue / 1024 / 1024;
  Sender.mountFile(__dirname + '/lemon.gif', fileValueMB)
    .then(res => {
      t.equal(res.hashAddress, 'QmcSwTAwqbtGTt1MBobEjKb8rPwJJzfCLorLMs5m97axDW', 'Expect hash uploaded to equal');
      t.end();
    })
    .catch(err => {
      console.error(err);
      t.fail(err);
    });
});

test('Testing chunkFile', t => {
  Sender.chunkFile('lemon.gif')
    .then(links => {
      t.end();
    })
    .catch(err => {
      console.error(err);
      t.fail();
    });
});


test('Testing uploadDeStore success', t => {
  Sender.uploadDeStore('lemon.gif')
    .then(res => {
      t.equal(res[0], 'QmT6aQLRNWbDf38qHGmaUUw8Q4E3fCnn7wKec2haVrQoSS', 'Expect has uploaded to equal first link address of sender file');
      t.end();
    })
    .catch(err => {
      console.error(err);
      t.fail();
    });
});

test('Testing uploadDeStore fail with invalid file name', t => {
  Sender.uploadDeStore('does not exist')
    .then(res => {
      t.fail();
    })
    .catch(err => {
      t.ok('There was an error');
      t.end();
    });
});

test('Testing distribute' , t => {
  Sender.distribute('lemon.gif', 1)
    .then(addresses => {
      t.equal(addresses[0], Ethereum.accounts[1], 'Expect address returned to equal to Ethereum.accounts[1]');
      t.end();
    })
    .catch(err => {
      console.error(err);
      t.fail();
    });
});

test('Testing hostInfo', t => {
  Ethereum.changeAccount(1);
  Receiver.hostInfo()
    .then(infos => {
      console.log(infos[0]);
      t.equal(infos[0].hashAddress, 'QmT6aQLRNWbDf38qHGmaUUw8Q4E3fCnn7wKec2haVrQoSS', 'Expect hashAddress of 1st link to equal 1st link of added file');
      t.equal(infos[0].senderAddress, Ethereum.accounts[0], 'Expect Ethereum account to equal account used to send file');
      t.end();
    })
    .catch(err => {
      console.error(err);
      t.fail();
    });
});

test('Testing hostInfo for duplicates', t => {
  Ethereum.changeAccount(0);
  let mountedHash;
  const fileValue = 1;
  const fileValueMB = fileValue / 1024 / 1024;
  Sender.mountFile(__dirname + '/kb.png', fileValueMB)
    .then(doc => {
      mountedHash = doc.hashAddress;
      return Sender.uploadDeStore('kb.png');
    })
    .then(hashes => {
      return Sender.distribute('kb.png', 1);
    })
    .then(receivers => {
      Ethereum.changeAccount(1);
      return Receiver.hostInfo();
    })
    .then(docs => {
      t.equal(docs.length, 1, 'Except length of docs returned to equal 1');
      t.equal(docs[0].hashAddress, mountedHash, 'Expect hashAddress returned to equal to mounted hash');
      t.end();
    })
    .catch(err => {
      console.error(err);
      t.fail();
    });
});

test('Testing hostAll to see if it hosts all files', t => {
  Ethereum.changeAccount(1);
  Receiver.hostAll()
    .then(docs => {
      t.equal(docs.length, 6, 'Except length of docs returned to equal 6');
      t.end();
    })
    .catch(err => {
      console.error(err);
      t.fail();
    });
});

test('Testing payFile', t => {
  Ethereum.changeAccount(0);
  const originalBalance = Ethereum.getBalanceEther();
  Sender.payFile('lemon.gif')
    .then(balance => {
      t.equal(Math.round(balance), 73, 'Expect balance to equal 73');
      Ethereum.changeAccount(1);
      return Ethereum.deStore().receiverGetBalance({from: Ethereum.account});
    })
    .then(amount => {
      const added = Ethereum.toEther(amount);
      t.equal(Math.round(added), 27, 'Except added to equal 27');
      t.end();
    })
    .catch(err => {
      console.error(err);
      t.fail();
    });
});

test('Testing withdrawAll', t => {
  Ethereum.changeAccount(1);
  Receiver.withdrawAll()
    .then(amount => {
      t.equal(Math.round(Ethereum.toEther(amount)), 27, 'Except withdraw amount to equal 27');
      t.end();
    })
    .catch(err => {
      console.error(err);
      t.fail();
    });
});

test('Testing removeHash and listHostDb', t => {
  Ethereum.changeAccount(1);
  Receiver.removeHash('QmT6aQLRNWbDf38qHGmaUUw8Q4E3fCnn7wKec2haVrQoSS')
    .then(returnPath => {
      t.equal(returnPath, path.join(config.files.files, Ethereum.account, config.files.host, 'QmT6aQLRNWbDf38qHGmaUUw8Q4E3fCnn7wKec2haVrQoSS'), 'Expect path of file removed to equal the location of the file');
      return Receiver.listHostDb();
    })
    .then(docs => {
      t.equal(docs.length, 6, 'Expect length of docs retrieved to db to equal 6');
      t.end();
    })
    .catch(err => {
      console.error(err);
      t.fail();
    });
});

test('Testing retrieveFile', t => {
  Ethereum.changeAccount(0);
  Sender.retrieveFile('lemon.gif')
    .then(returnedPath => {
      t.equal(returnedPath, path.join(config.files.files, Ethereum.account, config.files.download, 'lemon.gif'), 'Expect retrieved path to equal config files download location and file name');
      lol(returnedPath);
      t.end();
    })
    .catch(err => {
      console.error(err);
      t.fail();
    });
});

test('Testing hostInfo for files paid info', t => {
  Ethereum.changeAccount(1);
  Receiver.hostInfo()
    .then(infos => {
      console.log(infos[0]);
      // t.equal(infos[0].hashAddress, 'QmT6aQLRNWbDf38qHGmaUUw8Q4E3fCnn7wKec2haVrQoSS', 'Expect hashAddress of 1st link to equal 1st link of added file');
      // t.equal(infos[0].senderAddress, Ethereum.accounts[0], 'Expect Ethereum account to equal account used to send file');
      t.end();
    })
    .catch(err => {
      console.error(err);
      t.fail();
    });
});

// test('Deploying new DeStore contract', t => {
//   Ethereum.changeAccount(0);
//   const deployOptions = {
//     from: Ethereum.account
//   };
//   Ethereum.deploy('DeStore', [], deployOptions)
//     .then(instance => {
//       config.contracts.deStore = instance.address;
//       t.ok('ok');
//       t.end();
//     })
//     .catch(err => {
//       console.error(err);
//       t.fail();
//     });
// });

// test('Test creating new Ethereum account', t => {
//   const numAccounts = Ethereum.accounts.length;
//   Ethereum.createAccount('password');
//   Ethereum.unlock('password');
//
// });
