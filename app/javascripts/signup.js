const nodeRequire = require;
const Ethereum = nodeRequire('../../libs/ethereum/ethereum.js');

const DeStoreAddress = nodeRequire('../../models/DeStoreAddress');
const Config = nodeRequire('electron-config');
const config = new Config();
const configuration = nodeRequire('../../libs/config/config.js');

//TESTING
configuration.contracts.deStore = DeStoreAddress.get();
$(document).ready(function() {
  Ethereum.init();
  $('body').css('overflow', 'hidden');

  if (Ethereum.accounts.length !== 0) {
    // $('#tab-accounts').fadeIn(400).siblings().hide();
    for (let i = 0; i < Ethereum.accounts.length; i++) {
      const accountOption = $('<option>').text(Ethereum.accounts[i]);
      $('.login-address').append(accountOption);
    }
  }

  // Show/Hide Tabs
  $('.tabs .tab-links a').on('click', function(e) {
    var currentAttrValue = $(this).attr('href');
    $('.tabs ' + currentAttrValue).fadeIn(400).siblings().hide();
    // Change/remove current tab to active
    $(this).parent('li').addClass('active').siblings().removeClass('active');
    e.preventDefault();
  });

  //Route to Host/User on Submit
  $('.form-signup').submit(function(e) {
    e.preventDefault();

    //set path based on form
    var currentTab = $(this).data('tab');
    //get password
    var userPass = $(this).find('.password').val();
    //get host storage
    var storage;
    if (currentTab === 'host') {
      storage = $(this).find('.storage').val();
    }

    //call function for password -> account
    var userID;
    if (Ethereum.check()) {
      Ethereum.createAccount(userPass)
        .then(account => {
          config.set('user', {
            path: currentTab,
            accountIndex: (Ethereum.accounts.length - 1)
          });
          Ethereum.changeAccount(Ethereum.accounts.length - 1);
          //display account in popup (with Authenticate button)
          authenticatePopUp();
          $('.userID').text(account);
        })
        .catch(err => {
          console.error(err);
        });
    } else {
      failurePopUp();
    }
  });

  $('.form-signin').submit(function(e) {
    console.log('signin submit');

    e.preventDefault();
    var userID = $(this).find('.login-address').val();
    var userPass = $(this).find('.login-password').val();
    var storage;
    var userType = $(this).data('tab');
    // if (currentTab === 'host') {
    //   storage = $(this).find('.storage').val();
    // }

    /**
    * For Testing
    **/
    if (configuration.testing === true) {
      let accountIndex;
      for (let i = 0; i < Ethereum.accounts.length; i++) {
        if (Ethereum.accounts[i] === userID) {
          accountIndex = i;
          break;
        }
      }
      config.set('user', {
        path: userType,
        accountIndex: accountIndex
      });
      window.location = `../html/${userType}.html`;
    }

    if (Ethereum.check()) {
      console.log('ethereum check');
      let accountIndex;
      for (let i = 0; i < Ethereum.accounts.length; i++) {
        if (Ethereum.accounts[i] === userID) {
          accountIndex = i;
          break;
        }
      }
      Ethereum.unlockAccount(userID, userPass, 24*60*60*30)
        .then(status => {
          if (status === true) {
            console.log('status is true');
            config.set('user', {
              path: userType,
              accountIndex: accountIndex
            });
            Ethereum.changeAccount(accountIndex);
            // window.location = `../html/${userType}.html`;
            if (userType === 'user') {
              senderCheckInit(false);
            } else {
              receiverCheckInit(false);
            }
          } else {
            console.log('status is false');
            $('.userID').text(userID); // zhiwen - dont know what this does
          }
        })
        .catch(err => {
          console.error(err);
        });
    } else {
      console.error('not connected to ethereum');
    }
  });

  $('body').on('click', '#authenticate', function() {
    //check if coin balance > 0.01
    var userType = config.get('user.path');
    console.log(Ethereum.account);
    if (userType === 'host') {
      // check to see if receiver status is true
      receiverCheckInit(true);
    } else {
      senderCheckInit(true);
    }
  });

  //display signin information
  $('.signinQ').on({
    mouseenter: function() {
      $('#signinHelp').css('display', 'inline-block');
    },
    mouseleave: function() {
      $('#signinHelp').css('display', 'none');
    }
  });
});

let signupBool = true;
$('.signup-new').on('click', function() {
  if (signupBool === true) {
    $('#signup-user').css({display: 'block'});
    $('#signup-host').css({display: 'block'});
    $('#signin-user').css({display: 'none'});
    $('#signin-host').css({display: 'none'});
    $(this).html('Sign in to Ethereum Account');
    signupBool = false;
  } else {
    $('#signup-user').css({display: 'none'});
    $('#signup-host').css({display: 'none'});
    $('#signin-user').css({display: 'block'});
    $('#signin-host').css({display: 'block'});
    $(this).html('Create An Ethereum Account');
    signupBool = true;
  }
});

function authenticatePopUp() {
  $('.userID').text(Ethereum.accounts[config.get('user.accountIndex')]);
  $('#popup').dialog({
    dialogClass: 'no-close',
    draggable: false,
    resizable: false,
    modal: true,
    width: 600,
    height: 300
  });
}

function receiverPopUp() {
  $('.userID').text(Ethereum.accounts[config.get('user.accountIndex')]);
  $('#popup-receiver').dialog({
    dialogClass: 'no-close',
    draggable: false,
    resizable: false,
    modal: true,
    width: 600,
    height: 300
  });
}

function senderPopUp() {
  $('.userID').text(Ethereum.accounts[config.get('user.accountIndex')]);
  $('#popup-sender').dialog({
    dialogClass: 'no-close',
    draggable: false,
    resizable: false,
    modal: true,
    width: 600,
    height: 300
  });
}

function failurePopUp() {
  $('#popup2').dialog({
    dialogClass: 'no-close',
    draggable: false,
    resizable: false,
    modal: true,
    width: 600,
    height: 300
  });
}

function senderAdd() {
  Ethereum.deStore().senderAdd({
    from: Ethereum.account,
    gas: 1000000
  })
  .then(tx => {
    console.log('Sender Added');
    window.location = '../html/user.html';
  })
  .catch(err => {
    console.error(err);
  });
}

function receiverAdd(amount) {
  Ethereum.deStore().receiverAdd(amount, {
    from: Ethereum.account,
    gas: 1000000
  })
  .then(tx => {
    console.log('Receiver Added');
    window.location = '../html/host.html';
  })
  .catch(err => {
    console.error(err);
  });
}

function senderCheckInit(isSignUp) {
  Ethereum.deStore().senderCheckInit({
    from: Ethereum.account
  })
  .then(status => {
    if (status === true) {
      window.location = '../html/user.html';
    } else if (isSignUp === false) {
      senderPopUp();
    } else if (isSignUp === true && Ethereum.getBalanceEther() > 1) {
      console.log('making sender');
      senderAdd();
    } else {
      $('#authFail').css('display', 'block');
    }
  })
  .catch(err => {
    console.error(err);
  });
}

function receiverCheckInit(isSignUp) {
  Ethereum.deStore().receiverCheckInit({
    from: Ethereum.account
  })
  .then(status => {
    console.log('host', status);
    if (status === true) {
      window.location = '../html/host.html';
    } else if (isSignUp === false) {
      receiverPopUp();
    } else if (isSignUp === true && Ethereum.getBalanceEther() > 1) {
      // probably don't need this else if anymore
      console.log('making reeiver');
      receiverAdd();
    } else {
      $('#authFail').css('display', 'block');
    }
  })
  .catch(err => {
    console.error(err);
  });
}

$('#receiver-amount').on('submit', function(e) {
  e.preventDefault();
  let amount = $(this).find('#receiver-amount__input').val();
  amount = 1024 * 1024 * 1024 * amount;
  if (Ethereum.getBalanceEther() > 1) {
    receiverAdd(amount);
  } else {
    console.error('not more than 1 ether');
  }
});
