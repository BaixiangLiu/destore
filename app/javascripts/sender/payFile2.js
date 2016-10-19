'use strict';
const Ethereum = require('./../../../libs/ethereum/ethereum.js');
const UploadDB = require('./../../../models/Upload.js');
const promisify = require('es6-promisify');

/**
* Pay all receivers associated with a file. Calls DeStore contract's senderSendMoneyHash to allow receiver association hash paid.
* @fileName {String}
* @return {Number} - remaining ether balance
**/
module.exports = promisify((fileName, callback) => {
  const Upload = new UploadDB(Ethereum.account);
  const options = Ethereum.defaults;
  Upload.db.findOne({account: Ethereum.account, fileName: fileName}, (err, doc) => {
    if (err || doc === null) {
      callback(new Error('File name not found'), null);
      return;
    }
    const hashes = doc.blocks;
    const receiverCount = doc.receivers.length;
    const value = doc.value * doc.fileSize;
    const totalValue = value * receiverCount;
    if (Ethereum.getBalanceEther() < totalValue) {
      callback(new Error('Not enough funds'), null);
      return;
    }
    options.value = Ethereum.toWei(value);
    const promises = [];

    doc.receivers.forEach((nestedAddresses, index) => {
      nestedAddresses.forEach(address => {
        const hash = hashes[index];
        const splitArr = splitHash(hash);
        promises.push(Ethereum.deStore().senderSendMoneyHash(address, splitArr, options));
      });
    });
    Promise.all(promises)
      .then(tx => {
        const splitArr = splitHash(hashes[0]); // get the time paid for for the first hash paid
        return Ethereum.deStore().senderGetHashTimePaid(splitArr);
      })
      .then(timePaid => {
        Upload.db.update({account: Ethereum.account, fileName: fileName}, {$set: {timePaid: Number(timePaid.toString(10))}}, (err, num) => {
          if (err) callback(err, null);
          else {
            callback(null, Ethereum.getBalanceEther());
          }
        });
      })
      .catch(err => {
        callback(err, null);
      });
  });

  function splitHash(hash) {
    const half1 = hash.substring(0, 23);
    const half2 = hash.substring(23, 46);
    return [half1, half2];
  }
});
