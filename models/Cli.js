'use strict';
const DataStore = require('nedb');
const promisify = require('es6-promisify');

const Cli = new DataStore({
  filename: __dirname + '/../data/cli.db',
  autoload: true
});

module.exports = {
  db: Cli,
  setContract: promisify((contractName, contractAddress, callback) => {
    Cli.update({ contractName: contractName }, { $set: { contractName: contractName, contractAddress: contractAddress }}, { upsert: true }, (err, numReplaced, upsert) => {
      if (err) callback(err, null);
      else callback(null, numReplaced);
    });
  }),
  getContract: promisify((callback) => {
    Cli.find({ }, (err, doc) => {
      console.log(doc);
      if (err) callback(err, null);
      else callback(null, doc);
    });
  }),
  reset: () => {
    Cli.remove({}, { multi: true }, (err, numRemoved) => {
      if (err) throw err;
    });
  }
};
