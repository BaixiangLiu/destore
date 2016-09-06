'use strict';
const IPFS = require('./../ipfs/ipfs.js');
const Host = require('./../../models/Host.js');
const promisify = require('es6-promisify');
const config = require('./../config/config.js');
const path = require('path');

/**
* User goes thru Host db and looks for docs that have an isHosted of false and starts downloading them, after download pins files to ipfs node
* @returns {Promise} - an array of docs updated in Host.db
**/
module.exports = promisify((callback) => {
  Host.db.find({isHosted: false}, (err, docs) => {
    if (err || docs.length === 0) {
      callback(new Error('Could not find a doc with isHosted of false'), null);
      return;
    }
    const hosted = []; // the hashes of the hosted files
    const filePaths = []; // write paths of the hosted files
    let promises = []; // promise array used for IPFS.download promises and Host.db,update promises
    const returnDocs = []; // docs to be returned
    for (let i = 0; i < docs.length; i++) {
      const hashAddress = docs[i].hashAddress;
      const writePath = path.join(config.files.host, hashAddress);
      hosted.push(hashAddress);
      filePaths.push(writePath);
      promises.push(IPFS.download(hashAddress, writePath));
    }
    Promise.all(promises)
      .then(resArr => {
        promises = [];
        for (let i = 0; i < resArr.length; i++) {
          const promise = new Promise((resolve, reject) => {
            Host.db.update(
              {hashAddress: hosted[i]},
              {$set: {isHosted: true, hostTime: new Date(), filePath: filePaths[i]}},
              {returnUpdatedDocs: true},
              (err, num, updatedDoc) => {
                if (!err && updatedDoc !== null) {
                  returnDocs.push(updatedDoc);
                  IPFS.pin(updatedDoc.hashAddress).then().catch();
                }
                resolve();
              });
          });
          promises.push(promise);
        }
        return Promise.all(promises);
      })
      .then(res => {
        callback(null, returnDocs);
      })
      .catch(err => {
        callback(err, null);
      });
  });
});

// TODO - use the size of the file to make a progres download bar
