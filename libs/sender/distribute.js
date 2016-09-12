'use strict';
const Ethereum = require('./../ethereum/ethereum.js');
const Upload = require('./../../models/Upload.js');
const promisify = require('es6-promisify');

/**
* Gives the file hashes associated with a particular file on the smart contract to receivers
* @fileName {String}
* @amount {Number}
* @return Promise - array of receivers addresses the file was designated to
**/
module.exports = promisify((fileName, amount, callback) => {
  const options = Ethereum.defaults;
  Ethereum.deStore().senderGetFileHost(fileName, amount, options)
    .then(tx => {
      return Ethereum.deStore().senderGetFileReceivers(fileName, options);
    })
    .then(addresses => {
      Upload.db.update({account: Ethereum.account, fileName: fileName}, {$set: {receivers: addresses, isUploaded: true}}, (err, num) => {
        if (err) callback(err, null);
        else {
          callback(null, addresses);
        }
      });
    })
    .catch(err => {
      callback(err);
    });
});
