const nodeRequire = require;
const path = nodeRequire('path');

const Ethereum = nodeRequire('../../libs/ethereum/ethereum.js');
const IPFS = nodeRequire('../../libs/ipfs/ipfs.js');
const bytesMag = nodeRequire('./utils/bytesMag');
const DeStoreAddress = nodeRequire('../../models/DeStoreAddress');
const configuration = nodeRequire('../../libs/config/config.js');
const Config = nodeRequire('electron-config');
const config = new Config();

const Sender = nodeRequire('./sender/sender.js');

const get_elapsed_time_string = nodeRequire('./utils/timeString.js');
//Initializes daemon when on page
IPFS.init();

//TESTING
configuration.contracts.deStore = DeStoreAddress.get();
Ethereum.changeAccount(config.get('user.accountIndex'));
console.log(Ethereum.account);

$('#accountID').html(Ethereum.account);

updateTotalCost();
// checks if to auto pay file every day
autoPayFile();
setInterval(function() {
  autoPayFile();
}, 1000 * 60 * 60 * 24);

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




/* ##### DROPZONE ##### */

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

  Sender.encrypt(filePath, config.get('user.password'))
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
          <input class="recNum" type="number" placeholder="Ether/MB"></input>
          <button class="btn-up mount">Mount</button>
        </div>`);
    })
    .catch((err) => {
      console.log('Error', err);
    });
});

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

/* ##### EVENT HANDLERS ##### */

$('body').on('click', '.mount', function() {
  console.log('clicking on mount');
  $(this).attr('disabled', true);
  var filePath = $(this).closest('.file').data('filepath');
  var fileName = path.basename(filePath);
  var fileValue = $(this).closest('.file').find('.recNum').val();
  fileValue = fileValue / 1024 / 1024;
  var fileSize;
  console.log(filePath);
  Sender.mountFile(filePath, fileValue)
    .then(doc => {
      fileSize = doc.fileSize;
      return Sender.uploadDeStore(fileName);
    })
    .then((hashes) => {
      console.log(hashes);
      return hashes;
    })
    .then(balance => {
      $(this).closest('.file').find('.recNum').remove();
      // $(this).closest('.file').find('.cost-value').text((fileSize * fileValue).toFixed(3));

      $(this).replaceWith(`
        <input class="recNum" type="number" placeholder="# of hosts""></input>
        <button class="btn-up distribute">Distribute</button>`);
      updateTotalCost();
    })
    .catch(err => {
      console.error(err);
    });
});

$('body').on('click', '.distribute', function() {
  $(this).attr('disabled', true);
  var fileName = path.basename($(this).closest('.file').data('filepath'));
  var userNum = $(this).closest('.file').find('.recNum').val() || 3;
  console.log(userNum);
  Sender.distribute2(fileName, userNum)
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
      return Sender.payFile2(fileName);
    })
    .then(balance => {
      $('#balance').text(balance.toFixed(3));
    })
    .catch((err) => {
      console.log(err);
    });
});

$('body').on('click', '.retrieve', function() {
  $(this).attr('disabled', true);
  const fileName = path.basename($(this).closest('.file').data('filepath'));
  Sender.retrieveFile(fileName)
    .then((writePath) => {
      console.log(fileName, 'written to ', writePath);
      return Sender.decrypt(writePath, config.get('user.password'));
    })
    .then(writePath => {
      $(this).attr('disabled', false);
      // console.log(writePath);
    })
    .catch(err => {
      console.error(err);
    });
});




// not being used anymore but could be used later 09/14/2016
$('body').on('click', '.pay', function() {
  const fileName = path.basename($(this).closest('.file').data('filepath'));
  Sender.payFile2(fileName)
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

$(document).on('click', '.signOut', () => {
  config.clear('startup');
  window.location = '../html/signup.html';
});


/* ##### FUNCTIONS ##### */

function checkBalance() {
  console.log(Ethereum.getBalanceEther());
  const balance = Ethereum.getBalanceEther().toFixed(3) || 0;
  $('#balance').text(balance);
}

function updateTotalCost() {
  Sender.listUploadDb()
    .then(docs => {
      let totalCost = 0;
      docs.forEach(doc => {
        totalCost += doc.fileSize * doc.value;
      });
      $('#cost').text(totalCost.toFixed(3));
    })
    .catch(err => {
      console.error(err);
    });
}

function autoPayFile() {
  Sender.listUploadDb()
    .then(docs => {
      // doc.timePaid is time stamp in seconds when the file was last paid for
      docs.forEach(doc => {
        // auto pays each month
        if (Math.floor(Date.now() / 1000) > doc.timePaid + 1 * 60 * 24 * 30 && doc.timePaid !== null) {
          payFile(doc.fileName);
        }
      });
    })
    .catch(err => {
      console.log(err);
    });
}

function payFile(fileName) {
  Sender.payFile2(fileName)
    .then(balance => {
      $('#balance').text(balance.toFixed(3));
    })
    .catch(err => {
      console.error(err);
    });
}
