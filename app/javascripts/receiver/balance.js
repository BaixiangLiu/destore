'use strict';
const Ethereum = require('./../../../libs/ethereum/ethereum.js');
const Host = require('./../../../models/Host.js');
const promisfy = require('es6-promisify');

/**
* Gets the current balance and the total gained balance
* @return {Array} - balance in Ether of receiver balance and total balance
**/
module.exports = promisfy((callback) => {
  let withdrawAmount;
  const options = Ethereum.defaults;

  Promise.all([
    Ethereum.deStore().receiverGetBalance(options),
    Ethereum.deStore().receiverGetTotalGained(options)
  ])
    .then(amounts => {
      amounts = amounts.map(amount => {
        return Ethereum.toEther(amount);
      });
      callback(null, amounts);
    })
    .catch(err => {
      callback(err, null);
    });
});
