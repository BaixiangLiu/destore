const nodeRequire = require;
const Ethereum = nodeRequire('../../libs/ethereum/ethereum.js');
const IPFS = nodeRequire('../../libs/ipfs/ipfs.js');
const Receiver = nodeRequire('../../libs/receiver/receiver.js');


const DeStoreAddress = nodeRequire('../../models/DeStoreAddress');
const configuration = nodeRequire('../../libs/config/config.js');

const bytesMag = nodeRequire('./utils/bytesMag');

const Config = nodeRequire('electron-config');
const config = new Config();

//Initializes daemon when on page
IPFS.init();
IPFS.daemon();

//TESTING
configuration.contracts.deStore = DeStoreAddress.get();

Ethereum.changeAccount(config.get('user.accountIndex'));

//Makes encrypt/download folder (hidden) if not made

const fileIpfsArray = config.get('fileList.address');

$('#accountID').html(Ethereum.account);

$(document).on('click', '.signOut', () => {
  config.clear('startup');
  window.location = '../html/signup.html';
});

//display signin information
$('.question').on({
  mouseenter: function() {
    console.log($(this).data('help'));
    $($(this).data('help')).css('visibility', 'visible');
  },
  mouseleave: function() {
    $($(this).data('help')).css('visibility', 'hidden');
  }
});

//withdraws all the money in the smart contract
$('body').on('click', '.withdraw', function() {
  withdrawAll();
});


var isChangingStorage = false;
var isChangePending = false;
var newStorageInput;
$('.dash__change__storage__button').on('click', function(e) {
  if (isChangePending === true) {
    return;
  }
  if (isChangingStorage === false) {
    isChangingStorage = true;
    newStorageInput = $('<input>');
    $('.dash__total__storage__value').text('');
    $('.dash__total__storage__title').html(newStorageInput);
    $('.dash__total__storage__title').append('GB');
  } else {
    isChangePending = true;
    var storageValue = newStorageInput.val();
    storageValue = storageValue * 1024 * 1024 * 1024;
    console.log(storageValue);
    Ethereum.deStore().receiverChangeStorage(storageValue)
      .then(tx => {
        console.log('tx for change storage went thru');
        return Ethereum.deStore().receiverGetStorage();
      })
      .then(amount => {
        $('.dash__total__storage__value').text(bytesMag(amount));
        $('.dash__total__storage__title').html('Storage Limit:');
        isChangePending = false;
        isChangingStorage = false;
      })
      .catch(err => {
        console.error(err);
        isChangePending = false;
      });
  }
  // insert input box into total storage value
  // another click on change storage button will change the input
  // needs to be greater than amount hosted
  // sends the limit to the contract
});

//1 second Interval for Timer
var elapsed_seconds = 0;
setInterval(function() {
  elapsed_seconds = elapsed_seconds + 1;
  $('#dash__time__timer ').text(get_elapsed_time_string(elapsed_seconds));
}, 1000);

//Checks Contract and Account Balance (every minute)
checkBalance();
contractBalance();
setInterval(function() {
  checkBalance();
  contractBalance();
}, 1000);

//Downloads all files available in contract (every minute)
updateHostInfos();
hostAll();
updateSize();
setInterval(function() {
  updateHostInfos();
  hostAll();
  updateSize();
}, 1000);

$('body').on('click', '.hostAll', function() {
  hostAll();
});

function checkBalance () {
  const balance = Ethereum.getBalanceEther().toFixed(3) || 0;
  $('#dash__balance__value').text(balance);
}

/**
* Calls Host db, gets the storage used by all the files, then adds it to storage size
**/
function updateHostInfos() {
  Receiver.hostInfo()
    .then(docs => {
      return Receiver.listHostDb();
    })
    .then(docs => {

      console.log(docs);
      let storageSize = 0;
      $('.dash__storage__hashes').text('');

      for (let i = 0; i < docs.length; i++) {
        if (docs[i].isHosted === true) {
          storageSize += docs[i].fileSize;
        }
        const hashAddress = docs[i].hashAddress;
        // const hashDiv = $('<div></div>');
        // hashDiv.text(hashAddress);
        $('.dash__storage__hashes').append(hashAddress + '<br>');
      }
      storageSize = bytesMag(storageSize);
      $('.dash__storage__size__num').text(storageSize);
    })
    .catch(err => {
      console.error(err);
    });
}

function updateSize() {
  Receiver.listHostDb()
    .then(docs => {
      let storageSize = 0;
      for (let i = 0; i < docs.length; i++) {
        if (docs[i].isHosted === true) {
          storageSize += docs[i].fileSize;
        }
      }
      storageSize = bytesMag(storageSize);
      $('.dash__storage__size__num').text(storageSize);
    })
    .catch(err => {
      console.error(err);
    });
}

/**
* Gets the account's balance from the DeStore contract
**/
function contractBalance() {
  Receiver.balance()
    .then(amounts => {
      console.log(amounts);
      // $('#dash__balance__value').text(amounts[0]);
      $('#dash__balance__contract__value').text(amounts[0].toFixed(3));
    })
    .catch(err => {
      console.error(err);
    });
}

/**
* Calls receiver withdrawAll and then updates the dash
**/
function withdrawAll() {
  Receiver.withdrawAll()
    .then(amount => {
      console.log(amount);
      checkBalance();
      contractBalance();
    })
    .catch(err => {
      console.error(err);
    });
}

function hostAll() {
  Receiver.hostAll()
    .then(docs => {

    })
    .catch(err => {
      console.error(err);
    });
}

function get_elapsed_time_string(total_seconds) {
  function pretty_time_string(num) {
    return ( num < 10 ? '0' : '' ) + num;
  }

  var hours = Math.floor(total_seconds / 3600);
  total_seconds = total_seconds % 3600;

  var minutes = Math.floor(total_seconds / 60);
  total_seconds = total_seconds % 60;

  var seconds = Math.floor(total_seconds);

  // Pad the minutes and seconds with leading zeros, if required
  hours = pretty_time_string(hours);
  minutes = pretty_time_string(minutes);
  seconds = pretty_time_string(seconds);

  // Compose the string for display
  var currentTimeString = hours + ':' + minutes + ':' + seconds;

  return currentTimeString;
}

// Run on page initialization
Ethereum.deStore().receiverGetStorage({from: Ethereum.account})
  .then(amount => {
    amount = bytesMag(amount);
    $('.dash__total__storage__value').text(amount);
  })
  .catch(err => {
    console.error(err);
  });


updateHostInfos();
