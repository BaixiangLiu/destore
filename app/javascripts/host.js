const nodeRequire = require;
const Ethereum = nodeRequire('../../libs/ethereum/ethereum.js');
const IPFS = nodeRequire('../../libs/ipfs/ipfs.js');
const Receiver = nodeRequire('./receiver/receiver.js');

const DeStoreAddress = nodeRequire('../../models/DeStoreAddress');
const configuration = nodeRequire('../../libs/config/config.js');

const bytesMag = nodeRequire('./utils/bytesMag');

const Config = nodeRequire('electron-config');
const config = new Config();
const get_elapsed_time_string = nodeRequire('./utils/timeString.js');

IPFS.init();

//TESTING
configuration.contracts.deStore = DeStoreAddress.get();

Ethereum.changeAccount(config.get('user.accountIndex'));
//Makes encrypt/download folder (hidden) if not made

const fileIpfsArray = config.get('fileList.address');

$(document).ready(function() {
  $('#accountID').html(Ethereum.account);
  getStorageLimit();

  getReceiverStatus();
  /** Checks Contract and Account Balance (every minute) */
  checkBalance();
  contractBalance();
  setInterval(function() {
    checkBalance();
    contractBalance();
  }, 1000 * 60);

  /** Downloads all files available in contract (every minute) */
  hostAll();
  setInterval(function() {
    hostAll();
  }, 1000 * 60);

  //1 second Interval for Timer
  var elapsed_seconds = 0;
  setInterval(function() {
    elapsed_seconds = elapsed_seconds + 1;
    $('#dash__time__timer ').text(get_elapsed_time_string(elapsed_seconds));
  }, 1000);


  /** ##### EVENT HANDLERS ##### */

  $(document).on('click', '.signOut', () => {
    config.clear('startup');
    window.location = '../html/signup.html';
  });

  /** display signin information */
  $('.question').on({
    mouseenter: function() {
      console.log($(this).data('help'));
      $($(this).data('help')).css('visibility', 'visible');
    },
    mouseleave: function() {
      $($(this).data('help')).css('visibility', 'hidden');
    }
  });

  /** withdraws all the money in the smart contract */
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
      newStorageInput = $('<input placeholder="Storage in GB">');
      $('.dash__total__storage__value').text('');
      $('.dash__total__storage__title').html(newStorageInput);
      $('.dash__total__storage__title').append('GB');
    } else {
      isChangePending = true;
      var storageValue = newStorageInput.val();
      storageValue = storageValue * 1024 * 1024 * 1024;
      console.log(storageValue);
      $(this).attr('disabled', true);
      Ethereum.deStore().receiverAddStorage(storageValue)
        .then(tx => {
          console.log('tx for change storage went thru');
          return Ethereum.deStore().receiverGetStorage();
        })
        .then(amount => {
          $(this).attr('disabled', false);
          $('.dash__total__storage__value').text(bytesMag(amount));
          $('.dash__total__storage__title').html('Storage Limit:');
          isChangePending = false;
          isChangingStorage = false;
        })
        .catch(err => {
          $(this).attr('disabled', false);
          console.error(err);
          isChangePending = false;
        });
    }
  });

  $('body').on('click', '.hostAll', function() {
    hostAll();
  });

  $('.receiver-status').on('click', function(e) {
    $('.receiver-status').attr('disabled', true);
    Ethereum.deStore().receiverGetStatus(Ethereum.account, {from: Ethereum.account})
      .then(status => {
        console.log(status);
        if (status === true) {
          Ethereum.deStore().receiverChangeStatus(false, {from: Ethereum.account })
            .then(tx => {
              $('.receiver-status').attr('disabled', false);
              $('.receiver-status').text('Enable Account');
              $('.receiver-status-display').text('OFF')
            })
            .catch(err => {
              $('.receiver-status').attr('disabled', false);
            });
        } else {
          Ethereum.deStore().receiverChangeStatus(true, {from: Ethereum.account })
            .then(tx => {
              $('.receiver-status').attr('disabled', false);
              $('.receiver-status').text('Disable Account');
              $('.receiver-status-display').text('ON')
            })
            .catch(err => {
              $('.receiver-status').attr('disabled', false);
            });
        }
      })
      .catch(err => {
        $('.receiver-status').attr('disabled', false);
        console.error(err);
      });
  });
  /** ##### FUNCTIONS ##### */

  function checkBalance () {
    const balance = Ethereum.getBalanceEther().toFixed(3) || 0;
    $('#dash__balance__value').text(balance);
  }

  /**
  * Calls Host db, gets the storage used by all the files, then adds it to storage size
  **/
  function updateHostInfos() {
    Receiver.listHostDb()
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
        console.log(storageSize);
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
    $('.withdraw').attr('disabled', true);
    Receiver.withdrawAll()
      .then(amount => {
        $('.withdraw').attr('disabled', false);
        console.log(amount);
        checkBalance();
        contractBalance();
      })
      .catch(err => {
        $('.withdraw').attr('disabled', false);
        console.error(err);
      });
  }

  function hostAll() {
    Receiver.hostInfo()
      .then(docs => {
        return Receiver.hostAll();
      })
      .then(docs => {
        updateHostInfos();
      })
      .catch(err => {
        console.error(err);
      });
  }

  function getStorageLimit() {
    Ethereum.deStore().receiverGetStorage({from: Ethereum.account})
      .then(amount => {
        amount = bytesMag(amount);
        $('.dash__total__storage__value').text(amount);
      })
      .catch(err => {
        console.error(err);
      });
  }

  function getReceiverStatus() {
    Ethereum.deStore().receiverGetStatus(Ethereum.account, {from: Ethereum.account})
      .then(status => {
        console.log(status);
        if (status === true) {
          $('.receiver-status').text('Disable Account');
          $('.receiver-status-display').text('ON')
        } else {
          $('.receiver-status').text('Enable Account');
          $('.receiver-status-display').text('OFF')
        }
      })
      .catch(err => {
        console.error(err);
      });
  }
});
