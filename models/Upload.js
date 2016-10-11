'use strict';
const DataStore = require('nedb');
const path = require('path');
const fs = require('fs-extra');
// const Upload = new DataStore({
//   filename: __dirname + '/../data/upload.db',
//   autoload: true
// });

const Schema = {
  account: null,
  fileName: null,
  filePath: null,
  fileSize: null,
  hashAddress: null,
  value: null,
  blocks: [],
  blockSizes: [],
  receivers: [],
  uploadTime: null,
  isMounted: null,
  isUploaded: null,
  timePaid: null
};

const dbCache = {};

function UploadDB(address) {
  const dbFolder = path.join(__dirname, '/../data/', address);
  const dbPath = path.join(__dirname, '/../data/', address, 'upload.db');
  fs.ensureDirSync(dbFolder);
  if (!dbCache[address]) {
    const Upload = new DataStore({
      filename: dbPath,
      autoload: true
    });
    Upload.ensureIndex({
      fieldName: 'hashAddress',
      unique: true,
      sparse: true
    }, err => {
      if (err) console.error(err);
    });
    Upload.ensureIndex({
      fieldName: 'fileName',
      unique: true,
      sparse: true
    }, err => {
      if (err) console.error(err);
    });
    dbCache[address] = Upload;
    this.db = Upload;
  } else {
    this.db = dbCache[address];
  }

  this.reset = () => {
    this.db.remove({}, {
      multi: true
    }, (err, numRemoved) => {
      if (err) throw err;
    });
  };
}

module.exports = UploadDB;
