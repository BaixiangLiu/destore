contract DeStore {

  /********************************************************
  * Events
  *********************************************************/

  event AddReceiver (
    address _receiver,
    bool status,
    uint index,
    uint availStorage
  );

  // bytes[2][]
  event AddFile (
    address _sender,
    bytes _name, // name of file
    uint _value
  );

  event AddSender (
    address _sender
  );

  event FileWasHosted (
    address _receiver,
    address _sender
  );

  event PayReceiver (
    address _receiver, // receiver getting paid
    address _sender, // sender whos paying
    uint _amount, // hash sender is paying for
    bytes23 _hash1,  // 1st half of hash
    bytes23 _hash2
  );

  /********************************************************
  * Structs
  *********************************************************/

  // really consider not having an avaliable file size.
  struct Receiver {
    bool init; // whether this receiver has ever had their address added to availReceivers
    bool status; // whether this receiver is on or off
    uint index; // position in availReceivers[]
    uint balance;
    uint totalGained;
    uint filesCount;

    uint availStorage; // bytes

    address[] senders; // the sender that stored the particular file hash
    bytes23[2][] hashes; // each nested array contains half of entire hash
    /*bytes[] fullHashes; // full hash for reference, will not be returned*/
    uint[] sizes; // sizes of each hash
    uint[] values; // amount the file sender will send the hosts every day
    uint[] fileBalances; // the balance that particular hash has obtained
    uint[] amountsPaid; // the amount paid with most recent transaction
    uint[] timesPaid; // the time a file was paid. it currently just gets updated by in future could make a list of payment times. initial is 0
    mapping(bytes => uint) fileIndexes; // so the sender knows what hash to add file balances ++ to and where to check the status
    bytes ipfsAddress;
    /*mapping(bytes => HostFile) files; // index of a certain file in files[]*/
    /*bytes23[] fileNames; // receiver will get an array of names to know whats avaliable inside files mapping*/
  }

  struct HostFile {
    address sender;
    bytes _name;
    bytes23[2] hash;
    uint balance;
    // get a date last paid
    // whether or not this is enabled
    // to delete the file requires sending notification to the sender
  }

  struct Sender {
    bool init;
    bool status;
    uint balance;
    mapping (bytes => File) files; // maps by file name
    // maybe add in an array of all file names
  }

  struct File {
    address sender;
    bytes _name;
    uint[] sizes; // size of each file piece
    bytes23[2][] hashes; // each element contains half of entire hash [ [hashPart1, hashPart2], [], [] ]
    /*bytes[] fullHashes;*/
    address[] receivers;
    mapping (uint => address[]) hashReceivers;
    uint value; // amount this file is worth per byte
    bool exists;
    uint timePaid;
  }

  /********************************************************
  * Global Storage Variables
  *********************************************************/
  address[] availReceivers;
  address owner;
  uint receiverIndex; // increment each time a receiver is found
  mapping (address => Receiver) private receivers;
  mapping (address => Sender) private senders;

  /********************************************************
  * Modifers
  *********************************************************/
  modifier receiverStatus(address _receiverAddress) {
    if (receivers[_receiverAddress].status == true) _
  }

  modifier receiverInit(address _receiverAddress) {
    if (receivers[_receiverAddress].init == true) _
  }

  modifier senderStatus(address _senderAddress) {
    if (senders[_senderAddress].status == true) _
  }

  modifier senderInit(address _senderAddress) {
    if (senders[_senderAddress].init == true) _
  }

  modifier senderFileExists(address _senderAddress, bytes _fileName) {
    if (senders[_senderAddress].files[_fileName].exists == true) _
  }

  modifier senderFileNotExists(address _senderAddress, bytes _fileName) {
    if (senders[_senderAddress].files[_fileName].exists == false) _
  }

  /********************************************************
  * Constructor
  ********************************************************/

  function DeStore() {
    owner = msg.sender;
    receiverIndex = 0;
  }

  /********************************************************
  * Used by Receiver
  ********************************************************/

  function receiverAdd(uint _bytes) returns (bool) {
    if (receivers[msg.sender].init == true) return false;

    receivers[msg.sender].init = true;
    receivers[msg.sender].status = true;
    receivers[msg.sender].index = availReceivers.length;
    receivers[msg.sender].availStorage = _bytes;
    availReceivers.push(msg.sender);

    AddReceiver (
      msg.sender,
      receivers[msg.sender].status,
      receivers[msg.sender].index,
      receivers[msg.sender].availStorage
    );
    return true;
  }

  function receiverGetHashes()
    external
    receiverStatus(msg.sender)
    constant
    returns (bytes23[2][])
  {
    return receivers[msg.sender].hashes;
  }

  function receiverGetSenders()
    external
    receiverStatus(msg.sender)
    constant
    returns (address[])
  {
    return receivers[msg.sender].senders;
  }

  function receiverGetSizes()
    external
    receiverStatus(msg.sender)
    constant
    returns (uint[])
  {
    return receivers[msg.sender].sizes;
  }

  function receiverGetValues()
    external
    receiverStatus(msg.sender)
    constant
    returns (uint[])
  {
    return receivers[msg.sender].values;
  }

  function receiverGetTimesPaid()
    external
    receiverStatus(msg.sender)
    constant
    returns (uint[])
  {
    return receivers[msg.sender].timesPaid;
  }

  function receiverGetAmountsPaid()
    external
    receiverStatus(msg.sender)
    constant
    returns (uint[])
  {
    return receivers[msg.sender].amountsPaid;
  }

  function receiverAddStorage(uint _bytes)
    external
    receiverStatus(msg.sender)
  {
    receivers[msg.sender].availStorage += _bytes;
  }

  function receiverChangeStorage(uint _bytes)
    external
    receiverStatus(msg.sender)
  {
    receivers[msg.sender].availStorage = _bytes;
  }

  function receiverGetStorage()
    external
    receiverStatus(msg.sender)
    constant
    returns (uint)
  {
    return receivers[msg.sender].availStorage;
  }

  function receiverChangeStatus(bool newStatus) public receiverInit(msg.sender) {
    if (receivers[msg.sender].status == newStatus) return;
    else {
      receivers[msg.sender].status = newStatus;
    }
  }

  function receiverGetStatus(address _receiverAddress) public constant returns (bool) {
    return receivers[_receiverAddress].status;
  }

  function receiverGetBalance()
    receiverInit(msg.sender)
    constant
    returns (uint)
  {
    return receivers[msg.sender].balance;
  }

  function receiverGetTotalGained()
    receiverInit(msg.sender)
    constant
    returns (uint)
  {
    return receivers[msg.sender].totalGained;
  }

  // double check the security of this later
  function receiverWithdraw(uint withdrawAmount) public receiverInit(msg.sender) returns (uint) {
    if (receivers[msg.sender].balance >= withdrawAmount) {
      receivers[msg.sender].balance -= withdrawAmount;
      if (!msg.sender.send(withdrawAmount)) {
          receivers[msg.sender].balance += withdrawAmount;
      }
    }
    return receivers[msg.sender].balance;
  }

  function receiverCheckInit() public constant returns (bool) {
    return receivers[msg.sender].init;
  }

  /********************************************************
  * Used by Sender
  ********************************************************/

  function senderAdd() external returns (bool) {
    if (senders[msg.sender].init == true) return false; // catches if sender is already initialized
    senders[msg.sender].init = true;
    senders[msg.sender].status = true;
    /*AddSender(msg.sender);*/
    return true;
  }

  function senderAddFile(bytes23[2][] _hashes, bytes _fileName, uint _value, uint[] _sizes)
    senderStatus(msg.sender)
    senderFileNotExists(msg.sender, _fileName)
    external
    returns (bool)
  {
    if (_hashes.length == _sizes.length) {
      /*bytes[] memory _fullHashes;
      uint k = 0;
      for (uint i = 0; i < _hashes.length; i++) {
        _fullHashes[k++] = combineHashes(_hashes[i][0], _hashes[i][1]);
      }*/
      senders[msg.sender].files[_fileName].exists = true;
      senders[msg.sender].files[_fileName].hashes = _hashes;
      /*senders[msg.sender].files[_fileName].fullHashes = _fullHashes;*/
      senders[msg.sender].files[_fileName].value = _value;
      senders[msg.sender].files[_fileName].sizes = _sizes;
      AddFile(msg.sender, _fileName, _value);
    }
  }

  /**
  * Gets hosts for every hash in the file
  *
  **/

  function senderGetFileHost(bytes _fileName)
    senderStatus(msg.sender)
    senderFileExists(msg.sender, _fileName)
    public
  {
    File memory file = senders[msg.sender].files[_fileName];
    uint j = receiverIndex;
    for (uint g = 0; g < file.sizes.length; g++) {
      if (file.sizes[g] < receivers[availReceivers[j]].availStorage && msg.sender != availReceivers[j]) {
        receivers[availReceivers[j]].senders.push(msg.sender);
        receivers[availReceivers[j]].hashes.push(file.hashes[g]);
        receivers[availReceivers[j]].sizes.push(file.sizes[g]);
        receivers[availReceivers[j]].values.push(file.value);
        /*receivers[availReceivers[j]].fullHashes.push(file.fullHashes[g]);*/
        receivers[availReceivers[j]].timesPaid.push(0); // timesPaid for files is initially at 0
        receivers[availReceivers[j]].amountsPaid.push(0);
        receivers[availReceivers[j]].fileIndexes[combineHashes(file.hashes[g][0], file.hashes[g][1])] = receivers[availReceivers[j]].hashes.length - 1;
        receivers[availReceivers[j]].availStorage -= file.sizes[g];
        /*senders[msg.sender].files[_fileName].receivers[g].push(availReceivers[j]); init// was not able to use memory file*/
        // need to verifiy this reciever list
        senders[msg.sender].files[_fileName].receivers.push(availReceivers[j]);
        senders[msg.sender].files[_fileName].hashReceivers[g].push(availReceivers[j]);
      }
      j++;
      if (j >= availReceivers.length) {
        j = 0;
      } else if (j == receiverIndex) {
        break;
      }
    }

    if (receiverIndex >= availReceivers.length - 1) {
      receiverIndex = 0;
    } else {
      receiverIndex++;
    }
  }

  function senderGetFileHashes(bytes _fileName)
    senderStatus(msg.sender)
    senderFileExists(msg.sender, _fileName)
    public
    constant
    returns (bytes23[2][])
  {
    return senders[msg.sender].files[_fileName].hashes;
  }

  function senderGetFileReceivers(bytes _fileName)
    senderStatus(msg.sender)
    senderFileExists(msg.sender, _fileName)
    constant
    returns (address[])
  {
    return senders[msg.sender].files[_fileName].receivers;
  }

  function senderGetFileHashReceivers(bytes _fileName, uint _index)
    senderStatus(msg.sender)
    senderFileExists(msg.sender, _fileName)
    constant
    returns (address[])
  {
    return senders[msg.sender].files[_fileName].hashReceivers[_index];
  }

  function senderSendMoney(address _receiver, bytes23 _hash1, bytes23 _hash2, bytes _fileName)
    senderInit(msg.sender)
    senderFileExists(msg.sender, _fileName)
    receiverInit(_receiver)
  {
    senders[msg.sender].files[_fileName].timePaid = now;
    uint tempValue = msg.value;
    receivers[_receiver].balance = receivers[_receiver].balance + msg.value;
    receivers[_receiver].totalGained = receivers[_receiver].totalGained + tempValue;
    uint _fileIndex = receivers[_receiver].fileIndexes[combineHashes(_hash1, _hash2)];
    receivers[_receiver].timesPaid[_fileIndex] = now;
    receivers[_receiver].amountsPaid[_fileIndex] = tempValue;
    PayReceiver(_receiver, msg.sender, tempValue, _hash1, _hash2);
  }

  function senderCheckInit() public constant returns (bool) {
    return senders[msg.sender].status;
  }

  function senderGetFileTimePaid(bytes _fileName)
    senderInit(msg.sender)
    senderFileExists(msg.sender, _fileName)
    constant
    returns (uint)
  {
    return senders[msg.sender].files[_fileName].timePaid;
  }
  /********************************************************
  * Used by Sender or Receiver
  ********************************************************/

  function getSenderFileHashes(address _senderAddress, bytes _fileName)
    senderStatus(_senderAddress)
    senderFileExists(_senderAddress, _fileName)
    public
    constant
    returns (bytes23[2][])
  {
    return senders[_senderAddress].files[_fileName].hashes;
  }

  /********************************************************
  * For Testing
  ********************************************************/

  function getReceiverIndex() constant returns (uint) {
    return receiverIndex;
  }

  function getReceiverList() constant returns (address[]) {
    return availReceivers;
  }

  /********************************************************
  * New
  ********************************************************/

  /**
   * Combines two hashes and returns the byte representation
   */
  function combineHashes(bytes23 _hash1, bytes23 _hash2) returns (bytes) {
    /*string memory resString = new string(_hash1.length + _hash2.length);*/
    bytes memory res = new bytes(46);
    uint k = 0;
    uint m = 23;
    for (uint i = 0; i < _hash1.length; i++) {
      res[k++] = _hash1[i];
      res[m++]= _hash2[i];
    }
    return res;
  }

  function receiverGetFileIndex(address _receiverAddress, bytes23 _hash1, bytes23 _hash2)
    receiverStatus(_receiverAddress)
    constant
    returns (uint)
  {
    return receivers[_receiverAddress].fileIndexes[combineHashes(_hash1, _hash2)];
  }
}
