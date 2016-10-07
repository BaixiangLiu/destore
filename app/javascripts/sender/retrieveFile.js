'use strict';
const Ethereum = require('./../../../libs/ethereum/ethereum.js');
const Upload = require('./../../../models/Upload.js');
const promisify = require('es6-promisify');
const IPFS = require('./../../../libs/ipfs/ipfs.js');
const path = require('path');
const config = require('./../../../libs/config/config.js');

/**
* Retrieves hash based on its file name and downloads it into a folder
* @fileName {String}
* @returns {Promise} - location of where file was saved
**/
module.exports = promisify((fileName, callback) => {
  Upload.db.findOne({account: Ethereum.account, fileName: fileName}, (err, doc) => {
    if (err || doc === null) {
      callback(new Error('File was not found'), null);
      return;
    }
    const writePath = path.join(config.files.download, fileName);
    IPFS.download(doc.hashAddress, writePath)
      .then(buffer => {
        callback(null, writePath);
      })
      .catch(err => {
        callback(err, null);
      });
  });

});
