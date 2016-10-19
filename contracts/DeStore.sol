contract DeStore {

  /********************************************************
  * CONSTRUCTOR
  ********************************************************/

  function DeStore() {
    owner = msg.sender;
    receiverIndex = 0;
  }

  /********************************************************
  * GLOBAL STORAGE VARIABLES
  *********************************************************/
  address[] availReceivers;
  address owner;
  uint receiverIndex; // increment each time a receiver is found
  mapping (address => Receiver) private receivers;
  mapping (address => Sender) private senders;

  /********************************************************
  * STRUCTS
  *********************************************************/

  struct Receiver {
    bool init; // whether this receiver has ever had their address added to availReceivers
    bool status; // whether this receiver is on or off
    uint index; // position in availReceivers[]
    uint balance;
    uint totalGained;
    uint filesCount;
    uint availStorage; // in bytes
    uint value; // value amount per byte willing to host

    // hashes table
    address[] senders;
    bytes23[2][] hashes;
    uint[] sizes;
    uint[] values;
    uint[] amountsPaid;
    uint[] timesPaid;
    mapping(bytes23 => mapping(bytes23 => uint)) fileIndexes; // so the sender knows what hash to add file balances ++ to and where to check the status
    bytes ipfsAddress;
  }

  struct Sender {
    bool init;
    bool status;
    uint balance;
    bytes23[2][] hashArr;
    mapping (bytes23 => mapping(bytes23 => Hash)) hashes;

    // not used by app anymore
    mapping (bytes => File) files; // maps by file name
  }

  struct Hash {
    bool exists;
    uint value;
    uint size;
    uint timePaid;

    address[] receivers;
    mapping(address => uint) receiverIndexes;
  }

  // not used by app anymore
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
  * MODIFIERS
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
    if (senders[_senderAddress].files[_fileName].exists != true) _
  }

  modifier senderHashExists(address _senderAddress, bytes23[2] _hash) {
    if (senders[_senderAddress].hashes[_hash[0]][_hash[1]].exists == true) _
  }

  modifier senderHashNotExists(address _senderAddress, bytes23[2] _hash) {
    if (senders[_senderAddress].hashes[_hash[0]][_hash[1]].exists != true) _
  }

  /********************************************************
  * USED BY RECEIVERS
  ********************************************************/
  function receiverCheckInit() public constant returns (bool) {
    return receivers[msg.sender].init;
  }

  function receiverAdd(uint _bytes, uint _value) external {
    if (receivers[msg.sender].init == true) return;
    receivers[msg.sender].init = true;
    receivers[msg.sender].status = true;
    receivers[msg.sender].index = availReceivers.length;
    receivers[msg.sender].availStorage = _bytes;
    receivers[msg.sender].value = _value;

    availReceivers.push(msg.sender);

    AddReceiver (
      msg.sender,
      receivers[msg.sender].status,
      receivers[msg.sender].index,
      receivers[msg.sender].availStorage
    );
  }

  function receiverChangeStatus(bool newStatus) public receiverInit(msg.sender) {
    if (receivers[msg.sender].status == newStatus) return;
    else {
      receivers[msg.sender].status = newStatus;
    }
  }

  function receiverGetStatus(address _receiverAddress)
    public
    constant
    returns (bool)
  {
    return receivers[_receiverAddress].status;
  }

  function receiverChangeValue(uint _value)
    receiverStatus(msg.sender)
    external
  {
    receivers[msg.sender].value = _value;
  }

  function receiverGetValue()
    receiverStatus(msg.sender)
    external
    constant
    returns (uint)
  {
    return receivers[msg.sender].value;
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

  /*************
   * RECEIVER GET INFO METHODS
   *************/
  function receiverGetSenders()
    external
    receiverStatus(msg.sender)
    constant
    returns (address[])
  {
    return receivers[msg.sender].senders;
  }

  function receiverGetHashes()
    receiverStatus(msg.sender)
    external
    constant
    returns (bytes23[2][])
  {
    return receivers[msg.sender].hashes;
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


  /********************************************************
  * USED BY SENDER
  ********************************************************/

  function senderCheckInit() public constant returns (bool) {
    return senders[msg.sender].status;
  }

  function senderAdd() external {
    if (senders[msg.sender].init == true) return; // catches if sender is already initialized
    senders[msg.sender].init = true;
    senders[msg.sender].status = true;
    AddSender(msg.sender);
  }

  function senderAddHash(bytes23[2] _hash, uint _value, uint _size)
    senderStatus(msg.sender)
    senderHashNotExists(msg.sender, _hash)
    external
    returns (bool)
  {
    senders[msg.sender].hashes[_hash[0]][_hash[1]].exists = true;
    senders[msg.sender].hashes[_hash[0]][_hash[1]].value = _value;
    senders[msg.sender].hashes[_hash[0]][_hash[1]].size = _size;
    senders[msg.sender].hashArr.push(_hash);

    AddHash(msg.sender, _hash, _value, _size);
  }

  function senderGetHashes()
    senderStatus(msg.sender)
    external
    constant
    returns(bytes23[2][])
  {
    return senders[msg.sender].hashArr;
  }

  /**
   * Finds receivers for a specific hash. Goes thru the list of avaliable receivers until the index reaches the initial
   */
  function senderGetHashHost(bytes23[2] _hash)
    senderStatus(msg.sender)
    senderHashExists(msg.sender, _hash)
    public
  {
    Hash memory hash = senders[msg.sender].hashes[_hash[0]][_hash[1]];
    uint j = receiverIndex;
    bool isHosted = false;
    // 0
    while (isHosted == false) {
      if (hash.size < receivers[availReceivers[j]].availStorage &&
          hash.value > receivers[availReceivers[j]].value &&
          msg.sender != availReceivers[j]) {
        receivers[availReceivers[j]].senders.push(msg.sender);
        receivers[availReceivers[j]].hashes.push(_hash);
        receivers[availReceivers[j]].sizes.push(hash.size);
        receivers[availReceivers[j]].values.push(hash.value);

        receivers[availReceivers[j]].timesPaid.push(0); // timesPaid for files is initially at 0
        receivers[availReceivers[j]].amountsPaid.push(0);
        receivers[availReceivers[j]].fileIndexes[_hash[0]][_hash[1]] = receivers[availReceivers[j]].hashes.length - 1;
        receivers[availReceivers[j]].availStorage -= hash.size;

        // need to verifiy this reciever list
        senders[msg.sender].hashes[_hash[0]][_hash[1]].receivers.push(availReceivers[j]);
        senders[msg.sender].hashes[_hash[0]][_hash[1]].receiverIndexes[availReceivers[j]] = senders[msg.sender].hashes[_hash[0]][_hash[1]].receivers.length - 1;
        isHosted = true;
      } else if (j >= availReceivers.length - 1) {
        j = 0;
        if (j == receiverIndex) break;
      } else if (j == receiverIndex) {
        break;
      } else {
        j++;
      }
    }

    if (receiverIndex >= availReceivers.length - 1) {
      receiverIndex = 0;
    } else {
      receiverIndex++;
    }
  }

  function senderGetHashReceivers(bytes23[2] _hash)
    senderStatus(msg.sender)
    senderHashExists(msg.sender, _hash)
    external
    constant
    returns(address[])
  {
    return senders[msg.sender].hashes[_hash[0]][_hash[1]].receivers;
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

    uint _fileIndex = receivers[_receiver].fileIndexes[_hash1][_hash2];
    receivers[_receiver].timesPaid[_fileIndex] = now;
    receivers[_receiver].amountsPaid[_fileIndex] = tempValue;
    PayReceiver(_receiver, msg.sender, tempValue, _hash1, _hash2);
  }

  function senderSendMoneyHash(address _receiver, bytes23[2] _hash)
    senderInit(msg.sender)
    senderHashExists(msg.sender, _hash)
    receiverInit(_receiver)
    external
  {
    senders[msg.sender].hashes[_hash[0]][_hash[1]].timePaid = now;

    uint tempValue = msg.value;
    receivers[_receiver].balance = receivers[_receiver].balance + msg.value;
    receivers[_receiver].totalGained = receivers[_receiver].totalGained + tempValue;

    uint _fileIndex = receivers[_receiver].fileIndexes[_hash[0]][_hash[1]];
    receivers[_receiver].timesPaid[_fileIndex] = now;
    receivers[_receiver].amountsPaid[_fileIndex] = tempValue;
    PayReceiver(_receiver, msg.sender, tempValue, _hash[0], _hash[1]);
  }

  function senderGetFileTimePaid(bytes _fileName)
    senderInit(msg.sender)
    senderFileExists(msg.sender, _fileName)
    constant
    returns (uint)
  {
    return senders[msg.sender].files[_fileName].timePaid;
  }

  function senderGetHashTimePaid(bytes23[2] _hash)
    senderInit(msg.sender)
    senderHashExists(msg.sender, _hash)
    external
    constant
    returns(uint)
  {
    return senders[msg.sender].hashes[_hash[0]][_hash[1]].timePaid;
  }

  /********************************************************
  * FOR TESTING
  ********************************************************/

  function getReceiverIndex() constant returns (uint) {
    return receiverIndex;
  }

  function getReceiverList() constant returns (address[]) {
    return availReceivers;
  }

  function receiverGetFileIndex(address _receiverAddress, bytes23 _hash1, bytes23 _hash2)
    receiverStatus(_receiverAddress)
    public
    constant
    returns (uint)
  {
    return receivers[_receiverAddress].fileIndexes[_hash1][_hash2];
  }

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
  * EVENTS
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

  event AddHash (
    address _sender,
    bytes23[2] _hash,
    uint _value,
    uint _size
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
  * NOT USED IN APP ANYMORE
  ********************************************************/

  /****************
   * Sender Files Methods
   ****************/
  function senderAddFile(bytes23[2][] _hashes, bytes _fileName, uint _value, uint[] _sizes)
    senderStatus(msg.sender)
    senderFileNotExists(msg.sender, _fileName)
    external
  {
    if (_hashes.length == _sizes.length) {
      senders[msg.sender].files[_fileName].exists = true;
      senders[msg.sender].files[_fileName].hashes = _hashes;
      senders[msg.sender].files[_fileName].value = _value;
      senders[msg.sender].files[_fileName].sizes = _sizes;
      AddFile(msg.sender, _fileName, _value);
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
        receivers[availReceivers[j]].fileIndexes[file.hashes[g][0]][file.hashes[g][1]] = receivers[availReceivers[j]].hashes.length - 1;
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

  /**
   * Gets all receivers of a specific file
   */
  function senderGetFileReceivers(bytes _fileName)
    senderStatus(msg.sender)
    senderFileExists(msg.sender, _fileName)
    constant
    returns (address[])
  {
    return senders[msg.sender].files[_fileName].receivers;
  }

  /**
   * Gets the receivers of a specific hash in a file
   */
  function senderGetFileHashReceivers(bytes _fileName, uint _index)
    senderStatus(msg.sender)
    senderFileExists(msg.sender, _fileName)
    constant
    returns (address[])
  {
    return senders[msg.sender].files[_fileName].hashReceivers[_index];
  }
}
