'use strict';
const Ethereum = require('./../../../libs/ethereum/ethereum.js');
const UploadDB = require('./../../../models/Upload.js');
const promisify = require('es6-promisify');
const IPFS = require('./../../../libs/ipfs/ipfs.js');
const path = require('path');
const config = require('./../../../libs/config/config.js');
const fs = require('fs-extra');

/**
* Retrieves hash based on its file name and downloads it into a folder
* @fileName {String}
* @returns {Promise} - location of where file was saved
**/
module.exports = promisify((fileName, callback) => {
  const Upload = new UploadDB(Ethereum.account);
  Upload.db.findOne({account: Ethereum.account, fileName: fileName}, (err, doc) => {
    if (err || doc === null) {
      callback(new Error('File was not found'), null);
      return;
    }
    fs.ensureDirSync(path.join(config.files.files, Ethereum.account));
    fs.ensureDirSync(path.join(config.files.files, Ethereum.account, config.files.download));
    const writePath = path.join(config.files.files, Ethereum.account, config.files.download, fileName);
    IPFS.download(doc.hashAddress, writePath)
      .then(buffer => {
        callback(null, writePath);
      })
      .catch(err => {
        callback(err, null);
      });
  });

});
