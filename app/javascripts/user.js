const nodeRequire = require;
const Ethereum = nodeRequire('../../libs/ethereum/ethereum.js');
const web3 = Ethereum.init();
const IPFS = nodeRequire('../../libs/ipfs/ipfs.js');
const Sender = nodeRequire('../../libs/sender/sender.js');
const path = nodeRequire('path');
const configs = nodeRequire('../../libs/config/config.js');
const Config = nodeRequire('electron-config');
const config = new Config();
const fs = nodeRequire('fs');
const DeStoreAddress = nodeRequire('../../models/DeStoreAddress');

const bytesMag = nodeRequire('./utils/bytesMag');

//Initializes daemon when on page
IPFS.init();
IPFS.daemon();
Ethereum.init();

//TESTING
configs.contracts.deStore = DeStoreAddress.get();
Ethereum.changeAccount(config.get('user.accountIndex'));
$('#accountID').html(Ethereum.account);

updateTotalCost();

Sender.listUploadDb()
  .then((docs) => {
    docs.map((item) => {
      if (item.isUploaded) {
        $('#fileTable').append(`
        <div data-filepath="${item.filePath}" data-filesize="${item.fileSize}" class="file">
          <div class="basename">${path.basename(item.filePath)}</div>
          <div class="filesize">${bytesMag(item.fileSize)}</div>
          <div class="cost">
            <span class="cost-value">${(item.value * item.fileSize).toFixed(3)}</span>
          </div>
          <button class="btn-up retrieve">Retrieve</button>
        </div>`);
      } else if (item.isMounted) {
        $('#fileTable').append(`
          <div data-filepath="${item.filePath}" data-filesize="${item.fileSize}" class="file">
            <div class="basename">${path.basename(item.filePath)}</div>
            <div class="filesize">${bytesMag(item.fileSize)}</div>
            <div class="cost">
              <span class="cost-value">${(item.value * item.fileSize).toFixed(3)}</span>
            </div>
            <input class="recNum" type="number" placeholder="# of hosts"/>
            <button class="btn-up distribute">Distribute</button>
          </div>`);
      }
    });
    updateTotalCost();
  });

$('.dragdropQ').on({
  mouseenter: function() {
    $('#dragdropHelp').css('display', 'inline-block');
  },
  mouseleave: function() {
    $('#dragdropHelp').css('display', 'none');
  }
});

$('.uploadQ').on({
  mouseenter: function() {
    $('#uploadHelp').css('display', 'inline-block');
  },
  mouseleave: function() {
    $('#uploadHelp').css('display', 'none');
  }
});


// DROPZONE FUNCTIONALITY
document.ondragover = document.ondrop = (ev) => {
  ev.preventDefault();
};

$('.upload-drop-zone').on('dragover', (ev) => {
  $('.upload-drop-zone').css('background-color', '#f9f2fc');
  $('.logoCenter').css('opacity', 1);
});

$('.upload-drop-zone').on('dragleave', (ev) => {
  $('.upload-drop-zone').css('background-color', 'white');
  $('.logoCenter').css('opacity', 0.3);
});

//ON FILE DROP
$('.upload-drop-zone').on('drop', (ev) => {
  ev.preventDefault();
  $('.upload-drop-zone').css('background-color', 'white');
  $('.logoCenter').css('opacity', 0.3);
  var filePath = ev.originalEvent.dataTransfer.files[0].path;
  var fileSize = Sender.filesize(filePath);

  Sender.encrypt(filePath, 'hello')
    .then((encrpytedFilePath) => {
      console.log(encrpytedFilePath);
      const newFileName = path.basename(encrpytedFilePath);
      $('#fileTable').append(`
        <div data-filepath="${encrpytedFilePath}" data-filesize=${fileSize} class="file">
          <div class="basename">${newFileName}</div>
          <div class="filesize">${bytesMag(fileSize)}</div>
          <div class="cost">
            <span class="cost-value"></span>
            <span class="cost-demo"><span>
          </div>
          <input class="recNum" type="number" placeholder="file ether value"></input>
          <button class="btn-up mount">Mount</button>
        </div>`);
    })
    .catch((err) => {
      console.log('Error', err);
    });
});

$('body').on('click', '.mount', function() {
  var filePath = $(this).closest('.file').data('filepath');
  var fileName = path.basename(filePath);
  var fileValue = $(this).closest('.file').find('.recNum').val();
  fileValue = fileValue / 1024 / 1024;
  var fileSize;
  console.log(filePath);
  Sender.mountFile(filePath, fileValue)
    .then((doc) => {
      console.log(doc);
      fileSize = doc.fileSize;
      return Sender.uploadDeStore(doc.fileName);
    })
    .then((hashes) => {
      console.log(hashes);
      return hashes;
    })
    .then(balance => {
      $(this).closest('.file').find('.recNum').remove();
      $(this).closest('.file').find('.cost-value')
        .text((fileSize * fileValue).toFixed(3));

      $(this).replaceWith(`
        <input class="recNum" type="number" placeholder="# of hosts"></input>
        <button class="btn-up distribute">Distribute</button>`);
      updateTotalCost();
    })
    .catch(err => {
      console.error(err);
    });
});

$('body').on('click', '.distribute', function() {
  var fileName = path.basename($(this).closest('.file').data('filepath'));
  var userNum = $(this).closest('.file').find('.recNum').val() || 3;
  console.log(userNum);
  Sender.distribute(fileName, userNum)
    .then((res) => {
      console.log(res);
      $(this).closest('.file').find('.recNum').remove();

      var currentValue = $(this).closest('.file').find('.cost-value').text();
      currentValue = Number(currentValue) * userNum;
      currentValue = currentValue.toFixed(3);
      $(this).closest('.file').find('.cost-value').text(currentValue);
      $(this).replaceWith(`
        <button class="btn-up retrieve">Retrieve</button>
      `);
      updateTotalCost();
      console.log(fileName);
      return Sender.payFile(fileName);
    })
    .then(balance => {
      $('#balance').text(balance.toFixed(3));
    })
    .catch((err) => {
      console.log(err);
    });
});

$('body').on('click', '.retrieve', function() {
  const fileName = path.basename($(this).closest('.file').data('filepath'));
  Sender.retrieveFile(fileName)
    .then((writePath) => {
      console.log(fileName, 'written to ', writePath);
      return Sender.decrypt(writePath, 'hello');
    })
    .then(writePath => {
      console.log(writePath);
    });
});

// not being used anymore but could be used later 09/14/2016
$('body').on('click', '.pay', function() {
  const fileName = path.basename($(this).closest('.file').data('filepath'));
  Sender.payFile(fileName)
    .then(balance => {
      $('#balance').text(balance.toFixed(3));
    })
    .catch(err => {
      console.error(err);
    });
});

document.body.ondrop = (ev) => {
  ev.preventDefault();
};

window.onbeforeunload = (ev) => {
  ev.preventDefault();
  config.set('check', {
    sup: 'sup'
  });
};

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

//1 second Interval for Timer
var elapsed_seconds = 0;
setInterval(function() {
  elapsed_seconds = elapsed_seconds + 1;
  $('#timer').text(get_elapsed_time_string(elapsed_seconds));
}, 1000);

//1 minute Balance Checker
checkBalance();
setInterval(function() {
  checkBalance();
}, 60000);

function checkBalance() {
  console.log(Ethereum.getBalanceEther());
  const balance = Ethereum.getBalanceEther().toFixed(3) || 0;
  $('#balance').text(balance);
}
$(document).on('click', '.signOut', () => {
  config.clear('startup');
  window.location = '../html/signup.html';
});

function updateTotalCost() {
  const $totalCost = $('#cost');
  const $fileCosts = $('.cost-value');
  let totalCost = 0;
  for (let i = 0; i < $fileCosts.length; i++) {
    totalCost += Number($fileCosts.eq(i).text());
  }
  console.log(totalCost);
  $totalCost.text(totalCost.toFixed(3));
}
