const fs = require('fs-extra');
const path = require('path');
const config = require('./../../../libs/config/config.js');
const promisify = require('es6-promisify');


module.exports = promisify((source, callback) => {
  var cbCalled = false;

  var start = fs.createReadStream(source);
  start.on("error", function(err) {
    done(err);
  });
  var end = fs.createWriteStream(config.files.upload+path.basename(source));
  end.on("error", function(err) {
    done(err);
  });
  start.pipe(end);

  function done(err) {
    if (!cbCalled) {
      callback(err);
      cbCalled = true;
    }
  }
  callback(null, config.files.upload+path.basename(source));
});
