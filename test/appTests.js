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

const Upload = require('./../models/Upload.js');
const Host = require('./../models/Host.js');

const web3 = Ethereum.init();
IPFS.init();

Upload.reset();
Host.reset();

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

const mountFile = require('./../libs/sender/mountFile.js');

test('Testing mountFile', t => {
  mountFile(__dirname + '/lemon.gif', 0.002)
    .then(res => {
      t.equal(res.hashAddress, 'QmcSwTAwqbtGTt1MBobEjKb8rPwJJzfCLorLMs5m97axDW', 'Expect hash uploaded to equal');
      t.end();
    })
    .catch(err => {
      console.error(err);
      t.fail(err);
    });
});

const chunkFile = require('./../libs/sender/chunkFile.js');
test('Testing chunkFile', t => {
  chunkFile('lemon.gif')
    .then(links => {
      t.end();
    })
    .catch(err => {
      console.error(err);
      t.fail();
    });
});

const uploadDeStore = require('./../libs/sender/uploadDeStore.js');

test('Testing uploadDeStore success', t => {
  uploadDeStore('lemon.gif')
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
  uploadDeStore('does not exist')
    .then(res => {
      t.fail();
    })
    .catch(err => {
      t.ok('There was an error');
      t.end();
    });
});

const distribute = require('./../libs/sender/distribute');

test('Testing distribute' , t => {
  distribute('lemon.gif', 1)
    .then(addresses => {
      t.equal(addresses[0], Ethereum.accounts[1], 'Expect address returned to equal to Ethereum.accounts[1]');
      t.end();
    })
    .catch(err => {
      console.error(err);
      t.fail();
    });
});

const hostInfo = require('./../libs/receiver/hostInfo.js');

test('Testing hostInfo', t => {
  Ethereum.changeAccount(1);
  hostInfo()
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
  mountFile(__dirname + '/kb.png', 1)
    .then(doc => {
      mountedHash = doc.hashAddress;
      return uploadDeStore('kb.png');
    })
    .then(hashes => {
      return distribute('kb.png', 1);
    })
    .then(receivers => {

      Ethereum.changeAccount(1);
      return hostInfo();
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

const hostAll = require('./../libs/receiver/hostAll');
test('Testing hostAll to see if it hosts all files', t => {
  Ethereum.changeAccount(1);
  hostAll()
    .then(docs => {
      t.equal(docs.length, 6, 'Except length of docs returned to equal 6');
      t.end();
    })
    .catch(err => {
      console.error(err);
      t.fail();
    });
});

/* This test doesn't need to work anymore
test('Testing hostAll to see if it skips files already hosted', t => {
  Ethereum.changeAccount(1);
  hostAll()
    .then(docs => {
      // t.fail();
      t.end();
    })
    .catch(err => {
      t.ok('ok', 'Expected to catch an error');
      t.end();
    });
});
*/

const payFile = require('./../libs/sender/payFile');
test('Testing payFile', t => {
  Ethereum.changeAccount(0);
  const originalBalance = Ethereum.getBalanceEther();
  payFile('lemon.gif')
    .then(balance => {
      t.equal(balance, originalBalance - 5, 'Expect balance to equal original minus 5');
      Ethereum.changeAccount(1);
      return Ethereum.deStore().receiverGetBalance({from: Ethereum.account});
    })
    .then(amount => {
      const added = Ethereum.toEther(amount);
      t.equal(added, 5, 'Except added to equal 5');
      t.end();
    })
    .catch(err => {
      console.error(err);
      t.fail();
    });
});

const withdrawAll = require('./../libs/receiver/withdrawAll');
test('Testing withdrawAll', t => {
  Ethereum.changeAccount(1);
  withdrawAll()
    .then(amount => {
      t.equal(Ethereum.toEther(amount), 5, 'Except withdraw amount to equal 5');
      t.end();
    })
    .catch(err => {
      console.error(err);
      t.fail();
    });

});

const removeHash = require('./../libs/receiver/removeHash');
const listHashes = require('./../libs/receiver/listHostDb');
test('Testing removeHash and listHostDb', t => {
  Ethereum.changeAccount(1);
  removeHash('QmT6aQLRNWbDf38qHGmaUUw8Q4E3fCnn7wKec2haVrQoSS')
    .then(returnPath => {
      t.equal(returnPath, path.join(config.files.host, 'QmT6aQLRNWbDf38qHGmaUUw8Q4E3fCnn7wKec2haVrQoSS'), 'Expect path of file removed to equal the location of the file');
      return listHashes();
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

const retrieveFile = require('./../libs/sender/retrieveFile');
test('Testing retrieveFile', t => {
  Ethereum.changeAccount(0);
  retrieveFile('lemon.gif')
    .then(returnedPath => {
      t.equal(returnedPath, path.join(config.files.download, 'lemon.gif'), 'Expect retrieved path to equal config files download location and file name');
      lol(returnedPath);
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
