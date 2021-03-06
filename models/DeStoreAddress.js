'use strict';
const pathway = __dirname + '/../app/contracts/DeStoreAddress';
const fs = require('fs');

module.exports = {
  save: (address) => {
    fs.writeFileSync(pathway, address);
  },
  get: () => {
    const address = fs.readFileSync(pathway, 'utf8');
    return address.trim();
  }
};
