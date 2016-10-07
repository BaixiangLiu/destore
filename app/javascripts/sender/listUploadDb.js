'use strict';
const Ethereum = require('./../../../libs/ethereum/ethereum.js');
const Upload = require('./../../../models/Upload.js');
const promisify = require('es6-promisify');

/**
* Lists all the files
* @returns {Promise} - contains an array of all Uploaded docs
**/
module.exports = promisify((callback) => {
  Upload.db.find({account: Ethereum.account}, (err, docs) => {
    if (err) {
      callback(err, null);
      return;
    }
    callback(null, docs);
  });
});
