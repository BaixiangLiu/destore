'use strict';

// file config options

const user = __dirname + './../user/'; // path to application user directory

// download - where files are downloaded from IPFS to
// watch - where files to be watched and backup are put
// files - files to be uploaded to IPFS
// storage - files backup
// host - where the files are downloaded for the host

const filesConfig = {
  download: user + 'download',
  files: user + 'files',
  storage: user + 'storage',
  watch: user + 'watch',
  host: __dirname + '/../../fileStorage/'
};

module.exports = filesConfig;
