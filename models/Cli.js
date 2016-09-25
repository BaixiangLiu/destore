'use strict';
const DataStore = require('nedb');
const promisify = require('es6-promisify');

const Cli = new DataStore({
  filename: __dirname + '/../data/cli.db',
  autoload: true
});

module.exports = {
  db: Cli,
  setBind: promisify((contractName, contractAddress, callback) => {
    Cli.db.update({ type: 'bind' }, { contractName: contractName, contractAddress: contractAddress }, { upsert: true }, (err, numReplaced, upsert) => {
      if (err) callback(err, null);
      else callback(null, upsert);
    });
  }),
  getBind: promisify((callback) => {
    Cli.db.findOne({ type: 'bind' }, (err, doc) => {
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
