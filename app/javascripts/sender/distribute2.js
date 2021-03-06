'use strict';
const Ethereum = require('./../../../libs/ethereum/ethereum.js');
const UploadDB = require('./../../../models/Upload.js');
const promisify = require('es6-promisify');

/**
* Distribute 2 gets receiver addresses per hash instead of just file. Gives the file hashes associated with a particular file on the smart contract to receivers
* @fileName {String}
* @amount {Number}
* @return Promise - array of receivers addresses the file was designated to
**/
module.exports = promisify((fileName, amount, callback) => {
  const Upload = new UploadDB(Ethereum.account);
  const options = Ethereum.defaults;

  /** Recursive calls to senderGetFileHost so they process in seperate transactions */
  function recursive(amount) {
    if (amount === 0) {
      return finish();
    }
    Ethereum.deStore().senderGetFileHost(fileName, options)
      .then(tx => {
        recursive(--amount);
      })
      .catch(err => {
        callback(err, null);
      });
  }

  /** Called after recursive calls are done  to update db */
  function finish() {
    Ethereum.deStore().senderGetFileHashes(fileName, options)
      .then(hexHashes => {
        const promises = [];
        for (let i = 0; i < hexHashes.length; i++) {
          const promise = Ethereum.deStore().senderGetFileHashReceivers(fileName, i);
          promises.push(promise);
        }
        return Promise.all(promises);
      })
      .then(nestedAddresses => {
        Upload.db.update({account: Ethereum.account, fileName: fileName}, {$set: {receivers: nestedAddresses, isUploaded: true}}, (err, num) => {
          if (err) callback(err, null);
          else {
            callback(null, nestedAddresses);
          }
        });
      })
      .catch(err => {
        callback(err, null);
      });
  }
  recursive(amount);
});
