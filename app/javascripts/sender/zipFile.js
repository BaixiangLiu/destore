const fs = require('fs-extra');
const config = require('./../../../libs/config/config.js');
const path = require('path');
const promisify = require('es6-promisify');

function copyFile(source, target, callback) {
  var cbCalled = false;

  var start = fs.createReadStream(source);
  start.on("error", function(err) {
    done(err);
  });
  var end = fs.createWriteStream(config.files.upload + path.basename(source));
  end.on("error", function(err) {
    done(err);
  });
  end.on("close", function(ex) {
    done();
  });
  start.pipe(end);

  function done(err) {
    if (!cbCalled) {
      callback(err, true);
      cbCalled = true;
    }
  }
}

module.exports = promisify(copyFile);
