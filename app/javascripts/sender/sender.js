const filesize = require('./filesize.js');
const chunkFile = require('./chunkFile');
const mountFile = require('./mountFile');
const uploadDeStore = require('./uploadDeStore');
const distribute = require('./distribute');
const distribute2 = require('./distribute2');
const payFile = require('./payFile');
const payFile2 = require('./payFile2');
const retrieveFile = require('./retrieveFile');
const listUploadDb = require('./listUploadDb');

const encrypt = require('./encrypt');
const decrypt = require('./decrypt');
const zipFile = require('./zipFile');
const copyFile = require('./copyFile');
const mkdir = require('./mkdir');

module.exports = {
  filesize: filesize,
  chunkFile: chunkFile,
  mountFile: mountFile,
  uploadDeStore: uploadDeStore,
  distribute: distribute,
  distribute2: distribute2,
  payFile: payFile,
  payFile2: payFile2,
  retrieveFile: retrieveFile,
  listUploadDb: listUploadDb,
  encrypt: encrypt,
  decrypt: decrypt,
  zipFile: zipFile,
  copyFile: copyFile,
  mkdir: mkdir,
};
