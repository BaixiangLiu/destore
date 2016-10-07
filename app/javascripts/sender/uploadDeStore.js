'use strict';
const Ethereum = require('./../../../libs/ethereum/ethereum.js');
const Upload = require('./../../../models/Upload.js');
const promisify = require('es6-promisify');
const nestedHexToAscii = require('./../../../libs/ethereum/nestedHexToAscii.js');

/**
* Gets hashAdddress of a file based on either filepath from db and uploads to DeStore
* @fileName {String} - name of file that has been mounted ex 'kb.png'
* @value {Number} - the value of the file
* @returns {Array} - the hashes added to the contract
**/
module.exports = promisify((fileName, callback) => {
  const options = Ethereum.defaults;
  Upload.db.findOne({account: Ethereum.account, fileName: fileName}, (err, doc) => {
    if (err || doc === null) {
      callback(new Error('No Upload document was found of name ' + fileName), null);
      return;
    }
    let hashArr;
    let sizeArr;
    const value = Ethereum.toWei(doc.value);
    // for doc blocs to have existed would have needed to used method to break them up
    if (doc.blocks.length >= 1) {
      hashArr = doc.blocks;
      sizeArr = doc.blockSizes;
    } else {
      hashArr = [doc.hashAddress];
      sizeArr = [doc.fileSize];
    }

    const splitArr = [];
    for (let i = 0; i < hashArr.length; i++) {
      const half1 = hashArr[i].substring(0, 23);
      const half2 = hashArr[i].substring(23, 46);
      splitArr.push([half1, half2]);
    }
    Ethereum.deStore().senderAddFile(splitArr, fileName, value, sizeArr, options)
      .then(tx => {
        return Ethereum.deStore().senderGetFileHashes(fileName, options);
      })
      .then(hexHashes => {
        const asciiHashes = nestedHexToAscii(hexHashes);
        callback(null, asciiHashes);
      })
      .catch(err => {
        callback(err, null);
      });
  });
});
