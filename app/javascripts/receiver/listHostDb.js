'use strict';
const Ethereum = require('./../../../libs/ethereum/ethereum.js');
const Host = require('./../../../models/Host.js');
const promisify = require('es6-promisify');

/**
* Lists all the hashes
* @returns {Promise} - contains an array of all Hosted docs
**/

module.exports = promisify((callback) => {
  Host.db.find({account: Ethereum.account}, (err, docs) => {
    if (err) {
      callback(err, null);
      return;
    }
    callback(null, docs);
  });
});
