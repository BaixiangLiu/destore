'use strict';
const Ethereum = require('./../../../libs/ethereum/ethereum.js');
const IPFS = require('./../../../libs/ipfs/ipfs.js');
const UploadDB = require('./../../../models/Upload.js');
const promisify = require('es6-promisify');
const fs = require('fs');
const path = require('path');

/**
 * Mounts a single file
 * @filePath {String} or {Array} - path to file
 * @value {Number} cost of the file in Ether
 * @returns Promise - res is an Object of the doc added to nedb
 **/
module.exports = promisify((filePath, value, callback) => {
  const Upload = new UploadDB(Ethereum.account);
  value = Number(value);
  const fileName = path.basename(filePath);
  let fileSize;
  promisify(fs.stat)(filePath)
    .then(stats => {
      if (!stats.isFile()) callback(new Error('Not a file'), null);
      fileSize = stats.size;
      return IPFS.addFiles(filePath);
    })
    .then(hashArr => {
      const upload = {
        account: Ethereum.account,
        fileName: fileName,
        filePath: filePath,
        fileSize: fileSize,
        hashAddress: hashArr[0].hash, // the main hash
        value: value, // amount to send hosts
        blocks: [], // hashes to the blocks
        blockSizes: [],
        receivers: [],
        uploadTime: new Date(),
        isMounted: true,
        isUploaded: false,
      };
      Upload.db.insert(upload, (err, res) => {
        callback(null, res);
      });
    })
    .catch(err => {
      callback(err, null);
    });
});
