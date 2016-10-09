'use strict';
const path = require('path');
const zlib = require('zlib');
const fs = require('fs-extra');
const crypto = require('crypto');
const promisify = require('es6-promisify');
const Ethereum = require('./../../../libs/ethereum/ethereum.js');
const config = require('./../../../libs/config/config.js');

module.exports = promisify((filePath, password, callback) => {
  fs.ensureDirSync(path.join(config.files.files, Ethereum.account));
  fs.ensureDirSync(path.join(config.files.files, Ethereum.account, config.files.decrypt));

  const writePath = path.join(config.files.files, Ethereum.account, config.files.decrypt, path.basename(filePath));
  var start = fs.createReadStream(filePath);
  var decrypt = crypto.createDecipher('aes192', password);
  var unzip = zlib.createGunzip();
  var end = fs.createWriteStream(writePath);
  start.on('error', function(err) {
    callback(err);
  });
  end.on('error', function(err) {
    callback(err);
  });
  end.on('close', function(err) {
    callback(err, writePath);
  });
  start.pipe(unzip).pipe(decrypt).pipe(end);
});
