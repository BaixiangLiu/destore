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
    Cli.update({ contractName: contractName }, { $set: { contractName: contractName, contractAddress: contractAddress, type: 'contract'}}, { upsert: true }, (err, numReplaced, upsert) => {
      if (err) callback(err, null);
      else {
        if (numReplaced >= 1) callback(null , true);
        else callback(null, false);
      }
    });
  }),
  getContract: promisify((contractName, callback) => {
    Cli.findOne({ contractName: contractName }, (err, doc) => {
      if (err) callback(err, null);
      else callback(null, doc);
    });
  }),
  getOptions: promisify(callback => {
    Cli.findOne({ type: 'options' }, (err, doc) => {
      if (err) callback(err, null);
      else callback(null, doc);
    });
  }),
  setOptions: promisify((fromAccount, value, gas, gasValue, callback) => {
    Cli.update( { type: 'options' }, { $set: { type: 'options', from: fromAccount, gas: gas, value: value, gasValue: gasValue }}, { upsert: true }, (err, numReplaced) => {
      if (err) callback(err, null);
      else {
        if (numReplaced >= 1) callback(null , true);
        else callback(null, false);
      }
    });
  }),
  reset: () => {
    Cli.remove({}, { multi: true }, (err, numRemoved) => {
      if (err) throw err;
    });
  }
};
