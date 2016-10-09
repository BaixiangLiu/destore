'use strict';
const Ethereum = require('./../../../libs/ethereum/ethereum.js');
const UploadDB = require('./../../../models/Upload.js');
const promisify = require('es6-promisify');
const IPFS = require('./../../../libs/ipfs/ipfs.js');

/**
* Breaks up an ipfs hash link into its DAG links. Then saves the hashes into the db
* @fileName {String}
* @returns {Promise} - the DAGLink objects returned from ipfs. {name: String, size: Number, hash: base58 Buffer, hashAddress: String}
**/
module.exports = promisify((fileName, callback) => {
  const Upload = new UploadDB(Ethereum.account);
  Upload.db.findOne({account: Ethereum.account, fileName: fileName}, (err, doc) => {
    if (err || doc === null) {
      callback(err, doc);
      return;
    }
    IPFS.links(doc.hashAddress)
      .then(links => {
        const blocks = [];
        const blockSizes = [];
        links.forEach(link => {
          blocks.push(link.hashAddress);
          blockSizes.push(link.size);
        });
        Upload.db.update({account: Ethereum.account, fileName: fileName}, { $set: { blocks: blocks, blockSizes: blockSizes}}, (err, num) => {
          if (err) callback(err, null);
          else {
            callback(null, links);
          }
        });
      })
      .catch(err => {
        callback(err);
      });
  });
});
