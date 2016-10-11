'use strict';
const Ethereum = require('./../../../libs/ethereum/ethereum.js');
const UploadDB = require('./../../../models/Upload.js');
const promisify = require('es6-promisify');

/**
* Pay all receivers associated with a file. Payfile2 takes into account the nested nature of the receivers array.
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
        const hash = doc.blocks[index];
        const half1 = hash.substring(0, 23);
        const half2 = hash.substring(23, 46);
        promises.push(Ethereum.deStore().senderSendMoney(address, half1, half2, fileName, options));
      });
    });
    Promise.all(promises)
      .then(tx => {
        return Ethereum.deStore().senderGetFileTimePaid(fileName);
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
});
