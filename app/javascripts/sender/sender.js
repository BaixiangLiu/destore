const filesize = require('./filesize.js');
const chunkFile = require('./chunkFile');
const mountFile = require('./mountFile');
const uploadDeStore = require('./uploadDeStore');
const distribute = require('./distribute');
const payFile = require('./payFile');
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
  payFile: payFile,
  retrieveFile: retrieveFile,
  listUploadDb: listUploadDb,
  encrypt: encrypt,
  decrypt: decrypt,
  zipFile: zipFile,
  copyFile: copyFile,
  mkdir: mkdir,
};
