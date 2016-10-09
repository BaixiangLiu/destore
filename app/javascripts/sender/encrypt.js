const Ethereum = require('./../../../libs/ethereum/ethereum.js');
const path = require('path');
const zlib = require('zlib');
const fs = require('fs-extra');
const crypto = require('crypto');
const promisify = require('es6-promisify');
const config = require('./../../../libs/config/config.js');

// start pipe
// r.pipe(zip).pipe(encrypt).pipe(decrypt).pipe(unzip).pipe(w);
module.exports = promisify((filePath, password, callback) => {
  console.log(filePath);
  const start = fs.createReadStream(filePath);
  // zip content
  const zip = zlib.createGzip();
  // encrypt content
  const encrypt = crypto.createCipher('aes192', password);
  // write file
  fs.ensureDirSync(path.join(config.files.files, Ethereum.account));
  fs.ensureDirSync(path.join(config.files.files, Ethereum.account, config.files.upload));
  const fileName = path.basename(filePath);
  let encrpytedFilePath = path.join(config.files.files, Ethereum.account, config.files.upload,  fileName);
  console.log(encrpytedFilePath);
  const end = fs.createWriteStream(encrpytedFilePath);
  encrpytedFilePath = path.normalize(encrpytedFilePath);
  //execute by piping
  start.on('error', function(err) {
    callback(err);
  });
  end.on('error', function(err) {
    callback(err);
  });
  end.on('close', function(err) {
    callback(err, encrpytedFilePath);
  });

  start.pipe(encrypt).pipe(zip).pipe(end);
});
