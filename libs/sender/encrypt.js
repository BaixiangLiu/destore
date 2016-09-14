var path = require('path');
var zlib = require('zlib');
var fs = require('fs');
const crypto = require('crypto');
const promisify = require('es6-promisify');
const config = require('./../config/config.js');

// start pipe
// r.pipe(zip).pipe(encrypt).pipe(decrypt).pipe(unzip).pipe(w);
module.exports = promisify((filePath, password, callback) => {
  var start = fs.createReadStream(filePath);
  // zip content
  var zip = zlib.createGzip();
  // encrypt content
  var encrypt = crypto.createCipher('aes192', password);
  // write file
  var end = fs.createWriteStream(config.files.upload + path.basename(filePath));
  //execute by piping
  start.on('error', function(err) {
    callback(err);
  });
  end.on('error', function(err) {
    callback(err);
  });
  end.on('close', function(err) {
    callback(err, true);
  });

  start.pipe(encrypt).pipe(zip).pipe(end);
});
