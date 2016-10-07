const fs = require('fs-extra');

module.exports = (name) => {
    // console.log('Current Working Directory: ', process.cwd());
  fs.mkdirs(name, (err) => {
    if (err) return console.error(err);
    console.log('DeStore folder created successfully');
  });
}