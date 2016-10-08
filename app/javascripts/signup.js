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

  accountSelection();

  /* ##### EVENT HANDLERS ##### */

  // Show/Hide Tabs
  // show user page initially
  $('#tab-user').fadeIn(0);
  $('.tab-links__user').parent('li').addClass('active');
  $('.tabs .tab-links a').on('click', function(e) {
    var currentAttrValue = $(this).attr('href');
    $('.tabs ' + currentAttrValue).fadeIn(0).siblings().hide();
    // Change/remove current tab to active
    $(this).parent('li').addClass('active').siblings().removeClass('active');
    e.preventDefault();
  });

  //Route to Host/User on Submit
  $('.form-signup').submit(function(e) {
    e.preventDefault();
    var userPass = $(this).find('.password').val();
    var userPassConfirm = $(this).find('.password-confirm').val();
    $(this).find('.submit').attr('disabled', true);
    console.log(userPass);
    console.log(userPassConfirm);
    if (userPass === userPassConfirm) {
      Ethereum.createAccount(userPass)
        .then(account => {
          $(this).find('.submit').attr('disabled', false);
          $(this).find('.password-no-match').text('');
          Ethereum.accounts.push(account);
          accountSelection();
          signUpPopUp();
          $('.userID').text(account);
        })
        .catch(err => {
          console.error(err);
        });
    } else {
      $(this).find('.password-no-match').text('Passwords did not match');
    }
  });


  $('.form-signin').submit(function(e) {
    e.preventDefault();
    var userID = $(this).find('.login-address').val();
    var userPass = $(this).find('.login-password').val();
    var storage;
    var userType = $(this).data('tab');

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
      $(this).find('.submit').attr('disabled', true);
      let accountIndex;
      for (let i = 0; i < Ethereum.accounts.length; i++) {
        if (Ethereum.accounts[i] === userID) {
          accountIndex = i;
          break;
        }
      }
      Ethereum.unlockAccount(userID, userPass, 24*60*60*30)
        .then(status => {
          $(this).find('.submit').attr('disabled', false);
          if (status === true) {
            console.log('Correct password');
            config.set('user', {
              path: userType,
              accountIndex: accountIndex
            });
            Ethereum.changeAccount(accountIndex);
            let currentBalance = Ethereum.getBalanceEther().toFixed(3);
            $('.popup-current-balance').text(currentBalance);
            // window.location = `../html/${userType}.html`;
            if (userType === 'user') {
              senderCheckInit(false);
            } else {
              receiverCheckInit(false);
            }
          }
        })
        .catch(err => {
          $(this).find('.submit').attr('disabled', false);
          $(this).find('.wrong-password').text('Wrong password');
        });
    } else {
      console.error('not connected to ethereum');
    }
  });

  // display signin information
  $('.popup-receiver__signinQ').on({
    mouseenter: function() {
      $('#popup-receiver__signinHelp').css('display', 'inline-block');
    },
    mouseleave: function() {
      $('#popup-receiver__signinHelp').css('display', 'none');
    }
  });

  $('.popup-sender__signinQ').on({
    mouseenter: function() {
      $('#popup-sender__signinHelp').css('display', 'inline-block');
    },
    mouseleave: function() {
      $('#popup-sender__signinHelp').css('display', 'none');
    }
  });

  $('.popup-signUp__button').on('click', function(e) {
    e.preventDefault();
    $('.form-signup .password').val('');
    $('.form-signup .password-confirm').val('');
    toggleSignUp();
    $('#popup-signUp').dialog('close');
  });

  $('.popup-sender__auth').on('click', function(e) {
    e.preventDefault();
    $(this).attr('disabled', true);
    if (Ethereum.getBalanceEther() > 1) {
      senderAdd();
    } else {
      $(this).attr('disabled', false);
      $('#popup-sender .no-funds').text('Not enough Ether');
    }
  });

  $('#receiver-amount').on('submit', function(e) {
    e.preventDefault();
    let amount = $(this).find('#receiver-amount__input').val();
    amount = 1024 * 1024 * 1024 * amount;
    $(this).find('.popup-receiver__auth').attr('disabled', true);
    if (Ethereum.getBalanceEther() > 1) {
      receiverAdd(amount);
    } else {
      $(this).find('.popup-receiver__auth').attr('disabled', false);
      $('#popup-receiver .no-funds').text('Not enough Ether');
    }
  });

  $('.signup-new').on('click', function() {
    toggleSignUp();
  });

  /* ##### FUNCTIONS ##### */

  function toggleSignUp() {
    let signupDisplayStatus = $('#signup-user').css('display');
    console.log(signupDisplayStatus);
    if (signupDisplayStatus === 'none') {
      $('#signup-user').css({display: 'block'});
      $('#signup-host').css({display: 'block'});
      $('#signin-user').css({display: 'none'});
      $('#signin-host').css({display: 'none'});
      $('.tab-links a').css({display: 'none'});
      $('.tab-links__blank').css({display: 'block'});
      $('.signup-new').html('Sign in to Ethereum Account');
    } else {
      $('#signup-user').css({display: 'none'});
      $('#signup-host').css({display: 'none'});
      $('#signin-user').css({display: 'block'});
      $('#signin-host').css({display: 'block'});
      $('.tab-links a').css({display: 'block'});
      $('.tab-links__blank').css({display: 'none'});
      $('.signup-new').html('Create An Ethereum Account');
    }
  }

  function accountSelection() {
    $('.login-address').text('');
    $('.login-address').append('<option>Select an Account</option>');
    if (Ethereum.accounts.length !== 0) {
      // $('#tab-accounts').fadeIn(400).siblings().hide();
      for (let i = 0; i < Ethereum.accounts.length; i++) {
        const accountOption = $('<option>').text(Ethereum.accounts[i]);
        $('.login-address').append(accountOption);
      }
    }
  }

  function signUpPopUp() {
    $('.userID').text(Ethereum.accounts[config.get('user.accountIndex')]);
    $('#popup-signUp').dialog({
      dialogClass: 'no-close',
      draggable: false,
      resizable: false,
      modal: true,
      width: 600,
      height: 400
    });
  }

  function receiverPopUp() {
    $('.userID').text(Ethereum.accounts[config.get('user.accountIndex')]);
    $('#popup-receiver').dialog({
      draggable: false,
      resizable: false,
      modal: true,
      width: 600,
      height: 450
    });
  }

  function senderPopUp() {
    $('.userID').text(Ethereum.accounts[config.get('user.accountIndex')]);
    $('#popup-sender').dialog({
      draggable: false,
      resizable: false,
      modal: true,
      width: 600,
      height: 400
    });
  }

  function senderAdd() {
    Ethereum.deStore().senderAdd({
      from: Ethereum.account,
      gas: 1000000
    })
    .then(tx => {
      $('.popup-sender__auth').attr('disabled', false);
      window.location = '../html/user.html';
    })
    .catch(err => {
      $('.popup-sender__auth').attr('disabled', false);
      console.error(err);
    });
  }

  function receiverAdd(amount) {
    Ethereum.deStore().receiverAdd(amount, {
      from: Ethereum.account,
      gas: 1000000
    })
    .then(tx => {
      $('.popup-receiver__auth').attr('disabled', false);
      window.location = '../html/host.html';
    })
    .catch(err => {
      $('.popup-receiver__auth').attr('disabled', false);
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
});
