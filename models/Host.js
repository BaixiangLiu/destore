'use strict';
const DataStore = require('nedb');
const path = require('path');
const fs = require('fs-extra');

const Schema = {
  account: null,
  fileSize: null,
  hashAddress: null,
  senderAddress: null,
  timePaid: null, // time file was most recently paid for
  amountPaid: null,
  value: null,
  infoTime: null,
  isHosted: null,
  filePath: null,
  hostTime: null
};

const dbCache = {};

function HostDB(address) {
  const dbFolder = path.join(__dirname, '/../data/', address);
  const dbPath = path.join(__dirname, '/../data/', address, 'host.db');
  fs.ensureDirSync(dbFolder);
  if (!dbCache[address]) {
    const Host = new DataStore({
      filename: dbPath,
      autoload: true
    });
    Host.ensureIndex({ fieldName: 'hashAddress', unique: true, sparse: true }, err => {
      if (err) console.error(err);
    });
    dbCache[address] = Host;
    this.db = Host;
  } else {
    this.db = dbCache[address];
  }

  this.reset = () => {
    this.db.remove({}, { multi: true }, (err, numRemoved) => {
      if (err) throw err;
    });
  };
}

module.exports = HostDB;
