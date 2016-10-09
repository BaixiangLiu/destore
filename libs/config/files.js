'use strict';

// file config options

const user = __dirname + './../user/'; // path to application user directory

// download - where files are downloaded from IPFS to
// watch - where files to be watched and backup are put
// files - files to be uploaded to IPFS
// storage - files backup
// host - where the files are downloaded for the host

/**
 * Download, upload, host, and decrypt are referenced from the files location. To refactor later have them all point to the exact path
 */
const filesConfig = {
  files: __dirname + '/../../files/',
  download: '/download/encrypted/',
  // files: user + 'files',
  // watch: user + 'watch',
  upload: '/upload/',
  host: '/storage/',
  decrypt: '/download/'
};

module.exports = filesConfig;
