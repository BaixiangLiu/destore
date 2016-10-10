'use strict';
const Ethereum = require('./../../../libs/ethereum/ethereum.js');
const UploadDB = require('./../../../models/Upload.js');
const promisify = require('es6-promisify');

/**
* Pay all receivers associated with a file
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
    doc.receivers.forEach(address => {
      promises.push(Ethereum.deStore().senderSendMoney(address, fileName, options));
    });
    Promise.all(promises)
      .then(tx => {
        callback(null, Ethereum.getBalanceEther());
      })
      .catch(err => {
        callback(err, null);
      });
  });
});
