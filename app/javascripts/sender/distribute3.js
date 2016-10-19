'use strict';
const Ethereum = require('./../../../libs/ethereum/ethereum.js');
const UploadDB = require('./../../../models/Upload.js');
const promisify = require('es6-promisify');

/**
* Distribute 2 gets receiver addresses per hash instead of just file. Gives the file hashes associated with a particular file on the smart contract to receivers
* @fileName {String}
* @amount {Number}
* @return Promise - array of receivers addresses the file was designated to
**/
module.exports = promisify((fileName, amount, callback) => {
  console.log('amount', amount);

  const Upload = new UploadDB(Ethereum.account);
  const options = Ethereum.defaults;

  /** Recursive calls to senderGetFileHost so they process in seperate transactions */

  Upload.db.findOne({fileName: fileName}, (err, doc) => {
    if (err || doc === null) {
      callback(new Error('File name not found'), null);
      return;
    }

    const hashArr = doc.blocks;
    const splitArr = [];
    const splitArrCopy = [];
    for (let i = 0; i < hashArr.length; i++) {
      const half1 = hashArr[i].substring(0, 23);
      const half2 = hashArr[i].substring(23, 46);
      splitArr.push([half1, half2]);
      splitArrCopy.push([half1, half2]);
    }

    console.log('distribute3 doc.block hashes');
    console.log(hashArr);
    recursiveForAmount(amount, splitArr);
  });

  function recursiveForAmount(amount, splitArr) {
    console.log('amount', amount);
    if (amount <= 0) {
      return finish(splitArr);
    }
    console.log('distribute3 recursiveForAmount');
    const splitArrCopy = splitArr.slice(0);
    recursiveForGetHashHost(splitArr, splitArrCopy, amount);
  }

  function recursiveForGetHashHost(splitArr, splitArrCopy, amount) {
    if (splitArr.length === 0) {
      return recursiveForAmount(--amount, splitArrCopy);
    }

    Ethereum.deStore().senderGetHashHost(splitArr[0], options)
      .then(tx => {
        splitArr.shift();
        console.log('distribute3 recursiveForGetHashHost');
        recursiveForGetHashHost(splitArr, splitArrCopy, amount);
      })
      .catch(err => {
        callback(err, null);
      });
  }

  /** Called after recursive calls are done  to update db */
  function finish(splitArr) {
    console.log('distribute3 finish');
    const promises = [];
    for (let i = 0; i < splitArr.length; i++) {
      promises.push(Ethereum.deStore().senderGetHashReceivers(splitArr[i], options));
    }
    Promise.all(promises)
      .then(nestedAddresses => {
        console.log('distribute3 nestedAddresses');
        Upload.db.update({fileName: fileName}, {$set: {receivers: nestedAddresses, isUploaded: true}}, (err, num) => {
          if (err) callback(err, null);
          else {
            callback(null, nestedAddresses);
          }
        });
      })
      .catch(err => {
        callback(err, null);
      });
  }

});
