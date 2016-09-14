'use strict';
const path = require('path');
const zlib = require('zlib');
const fs = require('fs');
const crypto = require('crypto');
const promisify = require('es6-promisify');
const config = require('./../config/config.js');

module.exports = promisify((filePath, password, callback) => {
  const writePath = config.files.decrypt + path.basename(filePath);
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
  start.pipe(decrypt).pipe(unzip).pipe(end);
});
