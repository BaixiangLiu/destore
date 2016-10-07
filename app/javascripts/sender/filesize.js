const fs = require('fs');

module.exports = (filename) => {
  var stats = fs.statSync(filename);
  var fileSizeInBytes = stats['size'];
  return fileSizeInBytes;
};