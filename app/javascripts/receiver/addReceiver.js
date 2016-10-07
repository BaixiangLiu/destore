'use strict';
const Ethereum = require('./../../../libs/ethereum/ethereum.js');
const promisify = require('es6-promisify');

/** NOT BEING USED
* Adds a receiver strut to Destore contract
* @storage {Number} - storage capacity of receiver
* @returns {Bool} - receiver status of whehter or not ti
**/
module.exports = promisify((storage, callback) => {
  const options = Ethereum.defaults;
  Ethereum.deStore().receiverAdd(storage, options)
    .then(tx => {
      console.log(tx);
      return Ethereum.deStore().receiverGetStatus(options);
    })
    .then(status => {
      console.log(status);
      callback(null, status);
    })
    .catch(err => {
      callback(err, null);
    });
});
