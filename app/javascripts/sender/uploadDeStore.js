'use strict';
const Ethereum = require('./../../../libs/ethereum/ethereum.js');
const UploadDB = require('./../../../models/Upload.js');
const promisify = require('es6-promisify');
const nestedHexToAscii = require('./../../../libs/ethereum/nestedHexToAscii.js');

/**
* Gets hashAdddress of a file based on either filepath from db and uploads to DeStore by calling its senderAddFile method.
* @fileName {String} - name of file that has been mounted ex 'kb.png'
* @value {Number} - the value of the file
* @returns {Array} - the hashes added to the contract
**/
module.exports = promisify((fileName, callback) => {
  const Upload = new UploadDB(Ethereum.account);
  const options = Ethereum.defaults;
  Upload.db.findOne({fileName: fileName}, (err, doc) => {
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

    const returnedSplitArr = [];
    const splitArr = [];
    for (let i = 0; i < hashArr.length; i++) {
      const half1 = hashArr[i].substring(0, 23);
      const half2 = hashArr[i].substring(23, 46);
      splitArr.push([half1, half2]);
    }

    // console.log('uploadedDeStore sizeArr length', sizeArr.length);
    // console.log('uploadedDeStore hashArr length', hashArr.length);
    function recursive(splitArr, sizeArr) {
      if (splitArr.length === 0) {
        return finish();
      }

      Ethereum.deStore().senderAddHash(splitArr[0], value, sizeArr[0], options)
        .then(tx => {
          console.log('uploadDeStore recursive senderAddFile');
          splitArr.shift();
          sizeArr.shift();
          recursive(splitArr, sizeArr);
        })
        .catch(err => {
          callback(err, null);
        });
    }

    function finish() {
      Ethereum.deStore().senderGetHashes(options)
        .then(nestedHexArr => {
          const hashes = nestedHexToAscii(nestedHexArr);
          console.log('uploadDeStore finish hashes');
          console.log(hashes);
          callback(null, hashes);
        })
        .catch(err => {
          console.error(err);
          callback(err, null);
        })
    }

    recursive(splitArr, sizeArr);

  });
});
