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
  hash5: 'QmezZrSDBQhCiYwVn3AvAbiryxjWWmAiQEdjjNSuQvAB9Z',
  splitArr1: ['QmUNLLsPACCz1vLxQVkXqqL', 'X5R1X345qqfHbsf67hvA3Nn']
};

function reDeploy() {
  test('Deploying new DeStore contract', t => {
    Ethereum.changeAccount(0);
    const deployOptions = {
      from: Ethereum.account,
      value: 10
    };
    Ethereum.deStore().deploy('DeStore', [], deployOptions)
      .then(instance => {
        DeStoreAddress.save(instance.address);
        t.equal(instance.address.length, 42, 'Contract address should have a length of 42');
        t.end();
      })
      .catch(err => {
        t.fail();
      });
  });
}

let DeStore;
function reDeployWithReceivers() {
  test('Deploying new DeStore contract with receivers', t => {
    Ethereum.changeAccount(0);
    const deployOptions = {
      from: Ethereum.account,
      gas: 4500000,
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
        return Ethereum.deStore().receiverAdd(storage, 0, {from: Ethereum.account});
      })
      .then(tx => {
        Ethereum.changeAccount(2);
        console.log('Receiver account: ', Ethereum.account);
        return Ethereum.deStore().receiverAdd(storage, 0, {from: Ethereum.account});
      })
      .then(tx => {
        Ethereum.changeAccount(3);
        console.log('Receiver account: ', Ethereum.account);
        return Ethereum.deStore().receiverAdd(storage, 0, {from: Ethereum.account});
      })
      .then(tx => {
        Ethereum.changeAccount(4);
        console.log('Receiver account: ', Ethereum.account);
        return Ethereum.deStore().receiverAdd(storage, 0, {from: Ethereum.account});
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

/*******************************************
DEPLOYING NEW DESTORE CONTRACT
********************************************/
reDeployWithReceivers();

test('Check functionality of senderSendMoney, receiverGetBalance, and receiverWithdraw', t => {
  const inputHash = 'QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvXXXX';
  const splitArray = helper.hashesIntoSplitArr(inputHash);
  const sizeArray = [100];
  console.log(splitArray);
  Ethereum.changeAccount(0);
  Ethereum.deStore().senderAddFile(splitArray, 'test', 50, sizeArray)
    .then(tx => {
      return Ethereum.deStore().senderGetFileHost('test');
    })
    .then(tx => {
      return Ethereum.deStore().senderSendMoney(Ethereum.accounts[1], splitArray[0][0], splitArray[0][1], 'test', {from: Ethereum.account, value: web3.toWei(5, 'ether'), gas: 3000000});
    })
    .then(tx => {
      return Ethereum.deStore().receiverGetBalance({from: Ethereum.accounts[1]});
    })
    .then(tx => {
      console.log(tx);
      return Ethereum.deStore().receiverGetTimesPaid({from: Ethereum.accounts[1]});
    })
    .then(timesPaidArr => {
      console.log('times paid array');
      console.log(timesPaidArr);
      t.end();
    })
    .catch(err => {
      console.error(err);
      t.fix();
    });

  /*******************************************
  DEPLOYING NEW DESTORE CONTRACT
  ********************************************/
  reDeployWithReceivers();
  t.test('Testing receiverAdd value to see if it prevents files from being hosted', t => {
    Ethereum.changeAccount(5);
    const storage = 5 * 1024 * 1024 * 1024;
    const value = 50;
    Ethereum.deStore().receiverAdd(storage, value, {from: Ethereum.account})
      .then(tx => {
        return Ethereum.deStore().receiverGetValue({from: Ethereum.account});
      })
      .then(returnedValue => {
        t.equal(Number(returnedValue.toString()), value, 'Expect receiverGetValue to return input value');
        Ethereum.changeAccount(0);
        return Ethereum.deStore().senderAddHash(hashObjs.splitArr1, 40, 100, {from: Ethereum.account});
      })
      .then(tx => {
        const promises = [];
        promises.push(
          Ethereum.deStore().senderGetHashHost(hashObjs.splitArr1, {from: Ethereum.account}),
          Ethereum.deStore().senderGetHashHost(hashObjs.splitArr1, {from: Ethereum.account}),
          Ethereum.deStore().senderGetHashHost(hashObjs.splitArr1, {from: Ethereum.account}),
          Ethereum.deStore().senderGetHashHost(hashObjs.splitArr1, {from: Ethereum.account}),
          Ethereum.deStore().senderGetHashHost(hashObjs.splitArr1, {from: Ethereum.account})
        );
        return Promise.all(promises);
      })
      .then(tx => {
        Ethereum.changeAccount(5);
        return Ethereum.deStore().receiverGetHashes({from: Ethereum.account});
      })
      .then(nestedByteArray => {
        t.equal(nestedByteArray.length, 0, 'Expect length of returned array to be 0');
        t.end();
      })
      .catch(err => {
        console.error(err);
      });
  });

});
