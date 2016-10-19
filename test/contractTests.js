'use strict';

const tape = require('tape');
const tapes = require('tapes');
const tapSpec = require('tap-spec');
const Ethereum = require('../libs/ethereum/ethereum.js');
const IPFS = require('./../libs/ipfs/ipfs.js');

const DeStoreAddress = require('./../models/DeStoreAddress.js');

const config = require('./../libs/config/config.js');

tape.createStream()
  .pipe(tapSpec())
  .pipe(process.stdout);

const test = tapes(tape);

const lol = console.log.bind(console);

const web3 = Ethereum.init();
IPFS.init();

const helper = {
  fromBytes: (byteArray) => {
    const hashes = [];
    const web3 = Ethereum.init();
    for (var i = 0; i < byteArray.length; i += 2) {
      let hashAddress = (web3.toAscii(byteArray[i]) + web3.toAscii(byteArray[i + 1]));
      hashAddress = hashAddress.split('').filter(char => {
        return char.match(/[A-Za-z0-9]/);
      }).join('');
      hashes.push(hashAddress);
    }
    return hashes;
  },
  split: (inputHash) => {
    const half1 = inputHash.substring(0, 23);
    const half2 = inputHash.substring(23, 46);
    return [half1, half2];
  },
  hashesIntoSplitArr: (hashArr) => {
    if (typeof hashArr === 'string') {
      hashArr = [hashArr];
    }
    const splitArr = [];
    for (let i = 0; i < hashArr.length; i++) {
      const half1 = hashArr[i].substring(0, 23);
      const half2 = hashArr[i].substring(23, 46);
      splitArr.push([half1, half2]);
    }
    return splitArr;
  },
  getAllHashes: (nestedByteArray) => {
    function splitHexHashToAscii(hexArray) {
      let hashAddress;
      for (var i = 0; i < hexArray.length; i += 2) {
        hashAddress = (web3.toAscii(hexArray[i]) + web3.toAscii(hexArray[i + 1]));
        hashAddress = hashAddress.split('').filter(char => {
          return char.match(/[A-Za-z0-9]/);
        }).join('');
      }
      return hashAddress;
    }

    const asciiHashes = [];
    for (let i = 0; i < nestedByteArray.length; i++) {
      const asciiHash = splitHexHashToAscii(nestedByteArray[i]);
      asciiHashes.push(asciiHash);
    }
    return asciiHashes;
  },
  asciiHash: (byteArray) => {
    let hashAddress;
    for (var i = 0; i < byteArray.length; i += 2) {
      hashAddress = (web3.toAscii(byteArray[i]) + web3.toAscii(byteArray[i + 1]));
      hashAddress = hashAddress.split('').filter(char => {
        return char.match(/[A-Za-z0-9]/);
      }).join('');
    }
    return hashAddress;
  }
};

const hashObjs = {
  hash1: 'QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn',
  hash2: 'QmcSwTAwqbtGTt1MBobEjKb8rPwJJzfCLorLMs5m97axDW',
  hash3: 'QmRtDCqYUyJGWhGRhk1Bbk4PvE9mbCS1HKkDAo6xUAqN4H',
  hash4: 'QmbFMke1KXqnYyBBWxB74N4c5SBnJMVAiMNRcGu6x1AwQH',
  hash5: 'QmezZrSDBQhCiYwVn3AvAbiryxjWWmAiQEdjjNSuQvAB9Z'
};

test('web3 isConnected test true/false', t => {
  const status = Ethereum.check();
  t.equal(status, true, 'successful connection should return true');
  t.end();
});

test('web3.eth.accounts should return an array', t => {
  t.plan(1);

  const acctArr = Ethereum.accounts;
  const typeOfAcctArr = Array.isArray(acctArr);

  t.equal(typeOfAcctArr, true, 'Ethereum.accounts should return an array');
});


test('DeStore ===', t => {

  function reDeploy() {
    t.test('Deploying new DeStore contract', t => {
      Ethereum.changeAccount(0);
      const deployOptions = {
        from: Ethereum.account,
        value: 10
      };
      Ethereum.deploy('DeStore', [], deployOptions)
        .then(instance => {
          DeStore = instance;
          DeStoreAddress.save(DeStore.address);
          t.equal(DeStore.address.length, 42, 'Contract address should have a length of 42');
          t.end();
        })
        .catch(err => {
          t.fail();
        });
    });
  }

  function reDeployWithReceivers() {
    t.test('Deploying new DeStore contract with receivers', t => {
      Ethereum.changeAccount(0);
      const deployOptions = {
        from: Ethereum.account,
        gas: 4000000,
        gasValue: 20000000000
      };
      const storage = 5 * 1024 * 1024 * 1024;
      Ethereum.deploy('DeStore', [], deployOptions)
        .then(instance => {
          DeStore = instance;
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
          t.end();
        })
        .catch(err => {
          t.fail();
          console.error(err);
        });
    });
  }

  Ethereum.init();
  let DeStore;

  /*******************************************
  DEPLOYING NEW DESTORE CONTRACT
  ********************************************/
  t.test('Receiver Tests === Check functionality of deployment', t => {
    const deployOptions = {
      from: Ethereum.account,
      value: 10
    };
    Ethereum.deploy('DeStore', [], deployOptions)
      .then(instance => {
        DeStore = instance;
        DeStoreAddress.save(DeStore.address);
        t.equal(DeStore.address.length, 42, 'Contract address should have a length of 42');
        t.end();
      })
      .catch(err => {
        t.fail(err);
      });
  });

  t.test('Add receiver to DeStore with storage of 500', t => {
    DeStore.receiverAdd(500)
      .then(tx => {
        return DeStore.receiverGetStorage();
      })
      .then(tx => {
        t.equal(tx.c[0], 500, 'receiverGetStorage should return 500, the available storage parameter passed to receiverAdd');
        t.end();
      })
      .catch(err => {
        t.fail(err);
      });
  });

  t.test('Check AddReceiver Event', t => {
    Ethereum.getEventLogs('DeStore', DeStore.address, 'AddReceiver')
      .then(logs => {
        const log = logs[logs.length - 1];
        // t.equal(log.init, true, 'Expect AddReceiver init to equal true');
        t.equal(log.status, true, 'Expect AddReceiver status to equal true');
        t.equal(log.index.c[0], 0, 'Expect AddReceiver index to equal 0');
        t.equal(log.availStorage.c[0], 500, 'Expect AddReceiver availStorage to equal storage parameter passed to receiverAdd which was 500');
        t.end();
      })
      .catch(err => {
        t.fail(err);
      });
  });

  t.test('Check functionality of receiverGetStatus', t => {
    DeStore.receiverGetStatus(Ethereum.account)
      .then(acctStatus => {
        t.equal(acctStatus, true, 'receiverGetStatus should equal false if the receiver is unavailable');
        t.end();
      })
      .catch(err => {
        t.fail(err);
      });
  });

  t.test('Use receiverChangeStatus to change status to false', t => {
    DeStore.receiverChangeStatus(false)
      .then(tx => {
        t.ok(tx, 'receiverChangeStatus transaction was performed');
        t.end();
      })
      .catch(err => {
        t.fail(err);
      });
  });

  t.test('Check that status was changed with receiverGetStatus', t => {
    DeStore.receiverGetStatus(Ethereum.account)
      .then(acctStatus => {
        t.equal(acctStatus, false, 'receiverGetStatus should equal false now');
        t.end();
      })
      .catch(err => {
        t.fail(err);
      });
  });

  t.test('Change receiver status back to true with receiverChangeStatus', t => {
    DeStore.receiverChangeStatus(true)
      .then(tx => {
        t.ok(tx, 'receiverChangeStatus transaction was performed');
        t.end();
      })
      .catch(err => {
        t.fail(err);
      });
  });

  t.test('Check functionality of receiverAddStorage. Adding 1000', t => {
    DeStore.receiverAddStorage(1000)
      .then(tx => {
        t.ok(tx, 'receiverAddStorage transaction of 1000 was performed');
        return DeStore.receiverGetStorage();
      })
      .then(amount => {
        t.equal(amount.c[0], 1500, 'receiverGetStorage should equal 1500');
        t.end();
      })
      .catch(err => {
        t.fail(err);
      });
  });

  t.test('Check that the receiver index increases when adding receivers and that adding in other intital storage works', t => {
    Ethereum.changeAccount(1);
    DeStore.receiverAdd(1100, {from: Ethereum.account})
      .then(tx => {
        t.ok(tx, '1st receiverAdd transaction was sucessfully performed');
        return Ethereum.getEventLogs('DeStore', DeStore.address, 'AddReceiver');
      })
      .then(logs => {
        const log = logs[logs.length - 1];
        t.equal(log.index.c[0], 1, 'Expect AddReceiver index to equal 1 after adding 2nd receiver');
        t.equal(log.availStorage.c[0], 1100, 'Expect AddReceiver availStorage to equal 1100');
        Ethereum.changeAccount(2);
        return DeStore.receiverAdd(1500, {from: Ethereum.account});
      })
      .then(tx => {
        t.ok(tx, '2st receiverAdd transaction was sucessfully performed');
        return Ethereum.getEventLogs('DeStore', DeStore.address, 'AddReceiver');
      })
      .then(logs => {
        const log = logs[logs.length - 1];
        t.equal(log.index.c[0], 2, 'Expect AddReceiver index to equal 2 after adding 3rd receiver');
        t.equal(log.availStorage.c[0], 1500, 'Expect AddReceiver availStorage to equal 1500');
        t.end();
      })
      .catch(err => {
        t.fail(err);
      });
  });

  t.test('Check functionality of receiverGetBalance', t => {
    DeStore.receiverGetBalance()
      .then(balance => {
        t.equal(balance.c[0], 0, 'Expect balance to equal 0');
        t.end();
      })
      .catch(err => {
        t.fail(err);
      });
  });

  /*******************************************
  DEPLOYING NEW DESTORE CONTRACT
  ********************************************/
  t.test('Deploying new DeStore contract for Sender tests', t => {
    Ethereum.changeAccount(0);
    const deployOptions = {
      from: Ethereum.account,
      value: 10
    };
    Ethereum.deploy('DeStore', [helper.split(hashObjs.hash1), 10], deployOptions)
      .then(instance => {
        DeStore = instance;
        DeStoreAddress.save(DeStore.address);
        t.equal(DeStore.address.length, 42, 'Contract address should have a length of 42');
        t.end();
      })
      .catch(err => {
        t.end(err);
      });
  });

  t.test('Check functionality of senderAdd by checking AddSender event', t => {
    DeStore.senderAdd()
      .then(tx => {
        t.ok(tx, 'addSender transaction was sucessfully performed');
        return Ethereum.getEventLogs('DeStore', DeStore.address, 'AddSender');
      })
      .then(logs => {
        const log = logs[logs.length - 1];
        t.equal(log._sender, Ethereum.account, 'Expect _sender in event to equal to the message sender Ethereum.account');
        t.end();
      })
      .catch(err => {
        t.end(err);
      });
  });

  t.test('Check functionality of senderAddFile by using getSenderFileHashes of the sender and IPFS addFile', t => {
    let addedHash;
    IPFS.addFiles(__dirname + '/test')
      .then(arr => {
        const hash = arr[0].hash;
        addedHash = hash;
        t.equal(hash.length, 46, 'Expect returned hash to be a string of length 46');
        t.equal(helper.hashesIntoSplitArr(hash)[0].length, 2, 'Expect helper.hashesIntoSplitArr(hash)[0] to return an array with the length of 2');
        t.equal(helper.hashesIntoSplitArr(hash)[0][0].length, 23, 'Expect each string of helper.hashesIntoSplitArr(hash)[0]to return a length of 23');
        return DeStore.senderAddFile(helper.hashesIntoSplitArr(hash), 'test', 5, [100]);
      })
      .then(tx => {
        t.ok(tx, 'senderAddFile transaction was sucessfully performed');
        return Ethereum.getEventLogs('DeStore', DeStore.address, 'AddFile');
      })
      .then(logs => {
        const log = logs[logs.length - 1];
        t.equal(log._sender, Ethereum.account, 'Expect _sender of AddFile event to equal to the currently used Ethereum account');
        t.equal(log._value.c[0], 5, 'Expect _value of AddFile event to equal to 5');
        return DeStore.getSenderFileHashes(Ethereum.account, 'test');
      })
      .then(byteArr => {
        t.equal(byteArr[0].length, 2, 'Expect length of each nested array in return getSenderFileHashes to be 2');
        const asciiHashArr = helper.getAllHashes(byteArr);
        t.equal(asciiHashArr[0], addedHash, 'Expect getSenderFileHashes to return the hash that was return from IPFS addFiles');
        t.end();
      })
      .catch(err => {
        t.fail(err);
      });
  });

  /*******************************************
  DEPLOYING NEW DESTORE CONTRACT
  ********************************************/
  t.test('Deploying new DeStore contract', t => {
    Ethereum.changeAccount(0);
    const deployOptions = {
      from: Ethereum.account,
      value: 10
    };
    Ethereum.deploy('DeStore', [], deployOptions)
      .then(instance => {
        DeStore = instance;
        DeStoreAddress.save(DeStore.address);
        t.equal(DeStore.address.length, 42, 'Contract address should have a length of 42');
        t.end();
      })
      .catch(err => {
        t.fail();
      });
  });

  t.test('Check that designating hashes of a file with 1 hash gives them out to 5 recievers', t => {
    const inputHash = 'QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvXXXX';

    DeStore.senderAdd()
      .then(tx => {
        return Promise.all([
          DeStore.receiverAdd(5000, {from: Ethereum.accounts[1]}),
          DeStore.receiverAdd(5000, {from: Ethereum.accounts[2]}),
          DeStore.receiverAdd(5000, {from: Ethereum.accounts[3]}),
          DeStore.receiverAdd(5000, {from: Ethereum.accounts[4]}),
          DeStore.receiverAdd(5000, {from: Ethereum.accounts[5]})
        ]);
      })
      .then(txArr => {
        return Ethereum.getEventLogs('DeStore', DeStore.address, 'AddReceiver');
      })
      .then(logs => {
        t.equal(logs.length, 5, 'Expect 5 AddEvent logs');
        t.equal(logs[0].index.c[0], 0, 'Expect 1st reciever index to equal 0');
        t.equal(logs[1].index.c[0], 1, 'Expect 2nd reciever index to equal 1');
        t.equal(logs[2].index.c[0], 2, 'Expect 3rd reciever index to equal 2');
        t.equal(logs[3].index.c[0], 3, 'Expect 4th reciever index to equal 3');
        t.equal(logs[4].index.c[0], 4, 'Expect 5th reciever index to equal 4');
        const splitArray = helper.hashesIntoSplitArr(inputHash);
        const sizeArray = [100];
        return DeStore.senderAddFile(splitArray, 'test', 50, sizeArray);
      })
      .then(tx => {
        return DeStore.getSenderFileHashes(Ethereum.account, 'test');
      })
      .then(hexArr => {
        const hashes = helper.getAllHashes(hexArr);
        t.deepEqual(hashes[0], inputHash, 'Expect the hashes gotten from getSenderFileHashes to equal to the inputHash');
        return DeStore.senderGetFileHost('test');
      })
      .then(tx => {
        return DeStore.senderGetFileHost('test');
      })
      .then(tx => {
        return DeStore.senderGetFileHost('test');
      })
      .then(tx => {
        return DeStore.senderGetFileHost('test');
      })
      .then(tx => {
        return DeStore.senderGetFileHost('test');
      })
      .then(tx => {
        return Promise.all([
          DeStore.receiverGetHashes({from: Ethereum.accounts[1]}),
          DeStore.receiverGetHashes({from: Ethereum.accounts[2]}),
          DeStore.receiverGetHashes({from: Ethereum.accounts[3]}),
          DeStore.receiverGetHashes({from: Ethereum.accounts[4]}),
          DeStore.receiverGetHashes({from: Ethereum.accounts[5]})
        ]);
      })
      .then(hexArrArr => {
        const hashes1 = helper.getAllHashes(hexArrArr[0]);
        const hashes2 = helper.getAllHashes(hexArrArr[1]);
        const hashes3 = helper.getAllHashes(hexArrArr[2]);
        const hashes4 = helper.getAllHashes(hexArrArr[3]);
        const hashes5 = helper.getAllHashes(hexArrArr[4]);

        t.deepEqual(hashes1[0], inputHash, 'Expect hash retrieved from account 1 receiverGetHashes to equal inputHash');
        t.deepEqual(hashes2[0], inputHash, 'Expect hash retrieved from account 2 receiverGetHashes to equal inputHash');
        t.deepEqual(hashes3[0], inputHash, 'Expect hash retrieved from account 3 receiverGetHashes to equal inputHash');
        t.deepEqual(hashes4[0], inputHash, 'Expect hash retrieved from account 4 receiverGetHashes to equal inputHash');
        t.deepEqual(hashes5[0], inputHash, 'Expect hash retrieved from account 5 receiverGetHashes to equal inputHash');
        t.end();
      })
      .catch(err => {
        console.error(err);
        t.fail();
      });
  });

  t.test('Check that sending a file with 5 hashes to 5 receivers gives 5 hashes to those receivers plus the one hash that was added earlier, then check to see if senderGetFileReceivers works', t => {
    const inputHashArr = [hashObjs.hash1, hashObjs.hash2, hashObjs.hash3, hashObjs.hash4, hashObjs.hash5];
    const resultHashArr = ['QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvXXXX', hashObjs.hash1, hashObjs.hash2, hashObjs.hash3, hashObjs.hash4, hashObjs.hash5];
    const sizeArr = [500, 500, 500, 500, 500];
    const splitArray = helper.hashesIntoSplitArr(inputHashArr);
    DeStore.senderAddFile(splitArray, 'fileCoffeeBeans.txt', 100, sizeArr)
      .then(tx => {
        t.ok(tx, 'senderAddFile transaction was performed');
        return DeStore.senderGetFileHost('fileCoffeeBeans.txt');
      })
      .then(tx => {
        return DeStore.senderGetFileHost('fileCoffeeBeans.txt');
      })
      .then(tx => {
        return DeStore.senderGetFileHost('fileCoffeeBeans.txt');
      })
      .then(tx => {
        return DeStore.senderGetFileHost('fileCoffeeBeans.txt');
      })
      .then(tx => {
        return DeStore.senderGetFileHost('fileCoffeeBeans.txt');
      })
      .then(tx => {
        t.ok(tx, 'senderGetFileHost transaction was performed');
        return Promise.all([
          DeStore.receiverGetHashes({from: Ethereum.accounts[1]}),
          DeStore.receiverGetHashes({from: Ethereum.accounts[2]}),
          DeStore.receiverGetHashes({from: Ethereum.accounts[3]}),
          DeStore.receiverGetHashes({from: Ethereum.accounts[4]}),
          DeStore.receiverGetHashes({from: Ethereum.accounts[5]})
        ]);
      })
      .then(hexArrArr => {
        const hashes1 = helper.getAllHashes(hexArrArr[0]);
        const hashes2 = helper.getAllHashes(hexArrArr[1]);
        const hashes3 = helper.getAllHashes(hexArrArr[2]);
        const hashes4 = helper.getAllHashes(hexArrArr[3]);
        const hashes5 = helper.getAllHashes(hexArrArr[4]);
        // t.deepEqual(hashes1, resultHashArr, 'Expect hash retrieved from account 1 receiverGetHashes to equal inputHash plus hash added earlier');
        // t.deepEqual(hashes2, resultHashArr, 'Expect hash retrieved from account 2 receiverGetHashes to equal inputHash plus hash added earlier');
        // t.deepEqual(hashes3, resultHashArr, 'Expect hash retrieved from account 3 receiverGetHashes to equal inputHash plus hash added earlier');
        // t.deepEqual(hashes4, resultHashArr, 'Expect hash retrieved from account 4 receiverGetHashes to equal inputHash plus hash added earlier');
        // t.deepEqual(hashes5, resultHashArr, 'Expect hash retrieved from account 5 receiverGetHashes to equal inputHash plus hash added earlier');
        return DeStore.senderGetFileReceivers('fileCoffeeBeans.txt');
      })
      .then(fileReceivers => {
        // console.log(fileReceivers);
        // const expectedFileReceivers = [];
        // for (let i = 0; i < 5; i++) {
        //   for (let j = 2; j < 6; j++) {
        //     expectedFileReceivers.push(Ethereum.accounts[j]);
        //   }
        //   expectedFileReceivers.push(Ethereum.accounts[1]);
        // }
        t.equal(fileReceivers.length, 25, 'Expect senderGetFileReceivers to get an array of 25 length');
        return DeStore.receiverGetSizes({from: Ethereum.accounts[1]});
      })
      .then(sizes => {
        t.equal(sizes[0].c[0], 100, 'Expect first size returend from recieverGetSizes to be correct');
        return DeStore.receiverGetSenders({from: Ethereum.accounts[1]});
      })
      .then(senders => {
        t.equal(senders[0], Ethereum.account, 'Expect senders from receiverGetSenders to be correct');

        return DeStore.receiverGetHashes({from: Ethereum.accounts[1]});
      })
      .then(hexHashes => {
        const hashes = helper.getAllHashes(hexHashes);
        // console.log(hashes);
        const splitArr = helper.hashesIntoSplitArr(hashes[4]);
        return DeStore.receiverGetFileIndex(Ethereum.accounts[1], splitArr[0][0], splitArr[0][1]);
      })
      .then(index => {
        t.equal(index.c[0], 4, 'Expect receiver file index to equal 4');
        t.end();
      })
      .catch(err => {
        console.err(err);
        t.fail();
      });
  });

  /*******************************************
  DEPLOYING NEW DESTORE CONTRACT
  ********************************************/
  t.test('Deploying new DeStore contract', t => {
    Ethereum.changeAccount(0);
    const deployOptions = {
      from: Ethereum.account,
      value: 10
    };
    Ethereum.deploy('DeStore', [], deployOptions)
      .then(instance => {
        DeStore = instance;
        DeStoreAddress.save(DeStore.address);
        t.equal(DeStore.address.length, 42, 'Contract address should have a length of 42');
        t.end();
      })
      .catch(err => {
        t.fail();
      });
  });

  t.test('Check to see that the recieverIndex works' , t => {
    const inputHash = 'QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67RINDEX';
    DeStore.senderAdd()
      .then(tx => {
        return Promise.all([
          DeStore.receiverAdd(5000, {from: Ethereum.accounts[1]}),
          DeStore.receiverAdd(5000, {from: Ethereum.accounts[2]}),
          DeStore.receiverAdd(5000, {from: Ethereum.accounts[3]}),
          DeStore.receiverAdd(5000, {from: Ethereum.accounts[4]}),
          DeStore.receiverAdd(5000, {from: Ethereum.accounts[5]})
        ]);
      })
      .then(tx => {
        const splitArray = helper.hashesIntoSplitArr(inputHash);
        const sizeArr = [1];
        return DeStore.senderAddFile(splitArray, 'test5', 100, sizeArr);
      })
      .then(tx => {
        return DeStore.senderGetFileHost('test5', 1);
      })
      .then(tx => {
        return DeStore.getReceiverIndex();
      })
      .then(index => {
        t.equal(index.c[0], 1, 'Expect receiverIndex to equal 1');
        return DeStore.senderGetFileHost('test5', 1);
      })
      .then(tx => {
        return DeStore.getReceiverIndex();
      })
      .then(index => {
        t.equal(index.c[0], 2, 'Expect receiverIndex to equal 2');
        return DeStore.senderGetFileHost('test5', 1);
      })
      .then(tx => {
        return DeStore.getReceiverIndex();
      })
      .then(index => {
        t.equal(index.c[0], 3, 'Expect receiverIndex to equal 3');
        return DeStore.senderGetFileHost('test5', 1);
      })
      .then(tx => {
        return DeStore.getReceiverIndex();
      })
      .then(index => {
        t.equal(index.c[0], 4, 'Expect receiverIndex to equal 4');
        return DeStore.senderGetFileHost('test5', 1);
      })
      .then(tx => {
        return DeStore.getReceiverIndex();
      })

      .then(index => {
        t.equal(index.c[0], 0, 'Expect receiverIndex to equal 0');
        return DeStore.senderGetFileHost('test5', 1);
      })
      .then(tx => {
        return DeStore.getReceiverIndex();
      })
      .then(index => {
        t.equal(index.c[0], 1, 'Expect receiverIndex to equal 1');
        return DeStore.senderGetFileHost('test5', 1);
      })
      .then(tx => {
        return Promise.all([
          DeStore.receiverGetHashes({from: Ethereum.accounts[1]}),
          DeStore.receiverGetHashes({from: Ethereum.accounts[2]}),
          DeStore.receiverGetHashes({from: Ethereum.accounts[3]}),
          DeStore.receiverGetHashes({from: Ethereum.accounts[4]}),
          DeStore.receiverGetHashes({from: Ethereum.accounts[5]})
        ]);
      })
      .then(hexArrArr => {
        const hashes1 = helper.getAllHashes(hexArrArr[0]);
        const hashes2 = helper.getAllHashes(hexArrArr[1]);
        const hashes3 = helper.getAllHashes(hexArrArr[2]);
        const hashes4 = helper.getAllHashes(hexArrArr[3]);
        const hashes5 = helper.getAllHashes(hexArrArr[4]);
        t.equal(hashes1.length, 2, 'Expect receiver 1 to return a hash array of length 2');
        t.equal(hashes2.length, 2, 'Expect receiver 2 to return a hash array of length 2');
        t.equal(hashes3.length, 1, 'Expect receiver 3 to return a hash array of length 1');
        t.equal(hashes1[0], inputHash, 'Expect receiver 1 to return the input hash');
        t.end();
      })

      .catch(err => {
        console.error(err);
        t.fail();
      });
  });

  /*******************************************
  DEPLOYING NEW DESTORE CONTRACT
  ********************************************/
  reDeploy();

  t.test('Check functionality of senderSendMoney, receiverGetBalance, and receiverWithdraw', t => {
    let splitArray;
    DeStore.senderAdd()
      .then(tx => {
        return DeStore.receiverAdd(5000, {from: Ethereum.accounts[1]});
      })
      .then(tx => {
        return DeStore.receiverGetBalance({from: Ethereum.accounts[1]});
      })
      .then(amount => {
        const inputHash = 'QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvXXXX';
        splitArray = helper.hashesIntoSplitArr(inputHash);
        const sizeArray = [100];
        t.equal(web3.fromWei(amount, 'ether').c[0], 0, 'Expect receiverGetBalance to return 0 initially');
        return DeStore.senderAddFile(splitArray, 'test', 50, sizeArray);
      })
      .then(tx => {
        t.ok(tx, 'senderAddFile tx went thru');
        return DeStore.senderGetFileHost('test');
      })
      .then(tx => {
        t.ok(tx, 'senderGetFileHost tx went thru');
        return DeStore.senderSendMoney(Ethereum.accounts[1], splitArray[0][0], splitArray[0][1], 'test', {from: Ethereum.account, value: web3.toWei(5, 'ether'), gas: 1000000});
      })
      .then(tx => {
        t.ok(tx, 'senderSendMoney transaction went thru');
        return DeStore.receiverGetBalance({from: Ethereum.accounts[1]});
      })
      .then(amount => {
        t.equal(web3.fromWei(amount, 'ether').c[0], 5, 'Expect receiver balance to be 5');
        return DeStore.senderSendMoney(Ethereum.accounts[1], splitArray[0][0], splitArray[0][1], 'test', {from: Ethereum.account, value: web3.toWei(10, 'ether'), gas: 1000000});
      })
      .then(tx => {
        return DeStore.receiverGetBalance({from: Ethereum.accounts[1]});
      })
      .then(amount => {
        t.equal(web3.fromWei(amount, 'ether').c[0], 15, 'Expect receiver balance to be 15 now');
        return DeStore.senderSendMoney(Ethereum.accounts[1], splitArray[0][0], splitArray[0][1], 'test', {from: Ethereum.accounts[5], value: web3.toWei(10, 'ether'), gas: 1000000});
      })
      .then(tx => {
        return DeStore.receiverGetBalance({from: Ethereum.accounts[1]});
      })
      .then(amount => {
        t.equal(web3.fromWei(amount, 'ether').c[0], 15, 'Expect amount to still be 15 when sending money from an account that hasnt been initialized');
        return DeStore.receiverWithdraw(web3.toWei(3, 'ether'), {from: Ethereum.accounts[1]});
      })
      .then(tx => {
        return DeStore.receiverGetBalance({from: Ethereum.accounts[1]});
      })
      .then(amount => {
        t.equal(web3.fromWei(amount, 'ether').c[0], 12, 'Expect receiver balance to be 12 after withdrawing 3');
        return DeStore.receiverWithdraw(web3.toWei(13, 'ether'), {from: Ethereum.accounts[1]});
      })
      .then(tx => {
        return DeStore.receiverGetBalance({from: Ethereum.accounts[1]});
      })
      .then(amount => {
        t.equal(web3.fromWei(amount, 'ether').c[0], 12, 'Expect receiver balance to still be 2 after withdrawing over the amount avaliable, 13');
        t.end();
      })
      .catch(err => {
        console.error(err);
        t.fix();
      });
  });

  /*******************************************
  DEPLOYING NEW DESTORE CONTRACT
  ********************************************/

  reDeployWithReceivers();

  t.test('Test senderAddHash', t => {
    const splitArr1 = helper.split(hashObjs.hash1);
    const splitArr2 = helper.split(hashObjs.hash2);
    const splitArr3 = helper.split(hashObjs.hash3);
    const splitArr4 = helper.split(hashObjs.hash4);

    const value = 5;
    const size = 5;
    Ethereum.changeAccount(0);
    DeStore.senderAddHash(splitArr1, value, size)
      .then(tx => {
        t.ok(tx, 'senderAddHash tx');
        return DeStore.senderAddHash(splitArr2, value, size);
      })
      .then(tx => {
        return DeStore.senderAddHash(splitArr3, value, size);
      })
      .then(tx => {
        return DeStore.senderAddHash(splitArr4, value, size);
      })
      .then(tx => {
        return DeStore.senderGetHashes();
      })
      .then(nestedByteArray => {
        const hashes = helper.getAllHashes(nestedByteArray);
        t.equal(hashes[0], hashObjs.hash1, 'Expect hash1 to equal input');
        t.equal(hashes[1], hashObjs.hash2, 'Expect hash2 to equal input');
        t.equal(hashes[2], hashObjs.hash3, 'Expect hash3 to equal input');
        t.equal(hashes[3], hashObjs.hash4, 'Expect hash4 to equal input');
        t.end();
      })
      .catch(err => {
        console.error(err);
        t.fail();
      });
  });

  t.end();
});
