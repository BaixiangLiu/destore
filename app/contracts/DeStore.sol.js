var Web3 = require("web3");

(function() {
  // Planned for future features, logging, etc.
  function Provider(provider) {
    this.provider = provider;
  }

  Provider.prototype.send = function() {
    this.provider.send.apply(this.provider, arguments);
  };

  Provider.prototype.sendAsync = function() {
    this.provider.sendAsync.apply(this.provider, arguments);
  };

  var BigNumber = (new Web3()).toBigNumber(0).constructor;

  var Utils = {
    is_object: function(val) {
      return typeof val == "object" && !Array.isArray(val);
    },
    is_big_number: function(val) {
      if (typeof val != "object") return false;

      // Instanceof won't work because we have multiple versions of Web3.
      try {
        new BigNumber(val);
        return true;
      } catch (e) {
        return false;
      }
    },
    merge: function() {
      var merged = {};
      var args = Array.prototype.slice.call(arguments);

      for (var i = 0; i < args.length; i++) {
        var object = args[i];
        var keys = Object.keys(object);
        for (var j = 0; j < keys.length; j++) {
          var key = keys[j];
          var value = object[key];
          merged[key] = value;
        }
      }

      return merged;
    },
    promisifyFunction: function(fn, C) {
      var self = this;
      return function() {
        var instance = this;

        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {
          var callback = function(error, result) {
            if (error != null) {
              reject(error);
            } else {
              accept(result);
            }
          };
          args.push(tx_params, callback);
          fn.apply(instance.contract, args);
        });
      };
    },
    synchronizeFunction: function(fn, C) {
      var self = this;
      return function() {
        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {

          var callback = function(error, tx) {
            if (error != null) {
              reject(error);
              return;
            }

            var timeout = C.synchronization_timeout || 240000;
            var start = new Date().getTime();

            var make_attempt = function() {
              C.web3.eth.getTransactionReceipt(tx, function(err, receipt) {
                if (err) return reject(err);

                if (receipt != null) {
                  return accept(tx, receipt);
                }

                if (timeout > 0 && new Date().getTime() - start > timeout) {
                  return reject(new Error("Transaction " + tx + " wasn't processed in " + (timeout / 1000) + " seconds!"));
                }

                setTimeout(make_attempt, 1000);
              });
            };

            make_attempt();
          };

          args.push(tx_params, callback);
          fn.apply(self, args);
        });
      };
    }
  };

  function instantiate(instance, contract) {
    instance.contract = contract;
    var constructor = instance.constructor;

    // Provision our functions.
    for (var i = 0; i < instance.abi.length; i++) {
      var item = instance.abi[i];
      if (item.type == "function") {
        if (item.constant == true) {
          instance[item.name] = Utils.promisifyFunction(contract[item.name], constructor);
        } else {
          instance[item.name] = Utils.synchronizeFunction(contract[item.name], constructor);
        }

        instance[item.name].call = Utils.promisifyFunction(contract[item.name].call, constructor);
        instance[item.name].sendTransaction = Utils.promisifyFunction(contract[item.name].sendTransaction, constructor);
        instance[item.name].request = contract[item.name].request;
        instance[item.name].estimateGas = Utils.promisifyFunction(contract[item.name].estimateGas, constructor);
      }

      if (item.type == "event") {
        instance[item.name] = contract[item.name];
      }
    }

    instance.allEvents = contract.allEvents;
    instance.address = contract.address;
    instance.transactionHash = contract.transactionHash;
  };

  // Use inheritance to create a clone of this contract,
  // and copy over contract's static functions.
  function mutate(fn) {
    var temp = function Clone() { return fn.apply(this, arguments); };

    Object.keys(fn).forEach(function(key) {
      temp[key] = fn[key];
    });

    temp.prototype = Object.create(fn.prototype);
    bootstrap(temp);
    return temp;
  };

  function bootstrap(fn) {
    fn.web3 = new Web3();
    fn.class_defaults  = fn.prototype.defaults || {};

    // Set the network iniitally to make default data available and re-use code.
    // Then remove the saved network id so the network will be auto-detected on first use.
    fn.setNetwork("default");
    fn.network_id = null;
    return fn;
  };

  // Accepts a contract object created with web3.eth.contract.
  // Optionally, if called without `new`, accepts a network_id and will
  // create a new version of the contract abstraction with that network_id set.
  function Contract() {
    if (this instanceof Contract) {
      instantiate(this, arguments[0]);
    } else {
      var C = mutate(Contract);
      var network_id = arguments.length > 0 ? arguments[0] : "default";
      C.setNetwork(network_id);
      return C;
    }
  };

  Contract.currentProvider = null;

  Contract.setProvider = function(provider) {
    var wrapped = new Provider(provider);
    this.web3.setProvider(wrapped);
    this.currentProvider = provider;
  };

  Contract.new = function() {
    if (this.currentProvider == null) {
      throw new Error("DeStore error: Please call setProvider() first before calling new().");
    }

    var args = Array.prototype.slice.call(arguments);

    if (!this.unlinked_binary) {
      throw new Error("DeStore error: contract binary not set. Can't deploy new instance.");
    }

    var regex = /__[^_]+_+/g;
    var unlinked_libraries = this.binary.match(regex);

    if (unlinked_libraries != null) {
      unlinked_libraries = unlinked_libraries.map(function(name) {
        // Remove underscores
        return name.replace(/_/g, "");
      }).sort().filter(function(name, index, arr) {
        // Remove duplicates
        if (index + 1 >= arr.length) {
          return true;
        }

        return name != arr[index + 1];
      }).join(", ");

      throw new Error("DeStore contains unresolved libraries. You must deploy and link the following libraries before you can deploy a new version of DeStore: " + unlinked_libraries);
    }

    var self = this;

    return new Promise(function(accept, reject) {
      var contract_class = self.web3.eth.contract(self.abi);
      var tx_params = {};
      var last_arg = args[args.length - 1];

      // It's only tx_params if it's an object and not a BigNumber.
      if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
        tx_params = args.pop();
      }

      tx_params = Utils.merge(self.class_defaults, tx_params);

      if (tx_params.data == null) {
        tx_params.data = self.binary;
      }

      // web3 0.9.0 and above calls new twice this callback twice.
      // Why, I have no idea...
      var intermediary = function(err, web3_instance) {
        if (err != null) {
          reject(err);
          return;
        }

        if (err == null && web3_instance != null && web3_instance.address != null) {
          accept(new self(web3_instance));
        }
      };

      args.push(tx_params, intermediary);
      contract_class.new.apply(contract_class, args);
    });
  };

  Contract.at = function(address) {
    if (address == null || typeof address != "string" || address.length != 42) {
      throw new Error("Invalid address passed to DeStore.at(): " + address);
    }

    var contract_class = this.web3.eth.contract(this.abi);
    var contract = contract_class.at(address);

    return new this(contract);
  };

  Contract.deployed = function() {
    if (!this.address) {
      throw new Error("Cannot find deployed address: DeStore not deployed or address not set.");
    }

    return this.at(this.address);
  };

  Contract.defaults = function(class_defaults) {
    if (this.class_defaults == null) {
      this.class_defaults = {};
    }

    if (class_defaults == null) {
      class_defaults = {};
    }

    var self = this;
    Object.keys(class_defaults).forEach(function(key) {
      var value = class_defaults[key];
      self.class_defaults[key] = value;
    });

    return this.class_defaults;
  };

  Contract.extend = function() {
    var args = Array.prototype.slice.call(arguments);

    for (var i = 0; i < arguments.length; i++) {
      var object = arguments[i];
      var keys = Object.keys(object);
      for (var j = 0; j < keys.length; j++) {
        var key = keys[j];
        var value = object[key];
        this.prototype[key] = value;
      }
    }
  };

  Contract.all_networks = {
  "default": {
    "abi": [
      {
        "constant": true,
        "inputs": [],
        "name": "senderCheckInit",
        "outputs": [
          {
            "name": "",
            "type": "bool"
          }
        ],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "senderAdd",
        "outputs": [
          {
            "name": "",
            "type": "bool"
          }
        ],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "getReceiverIndex",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "receiverCheckInit",
        "outputs": [
          {
            "name": "",
            "type": "bool"
          }
        ],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "receiverGetSizes",
        "outputs": [
          {
            "name": "",
            "type": "uint256[]"
          }
        ],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "withdrawAmount",
            "type": "uint256"
          }
        ],
        "name": "receiverWithdraw",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "_senderAddress",
            "type": "address"
          },
          {
            "name": "_fileName",
            "type": "bytes"
          }
        ],
        "name": "getSenderFileHashes",
        "outputs": [
          {
            "name": "",
            "type": "bytes23[2][]"
          }
        ],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "_fileName",
            "type": "bytes"
          }
        ],
        "name": "senderGetFileReceivers",
        "outputs": [
          {
            "name": "",
            "type": "address[]"
          }
        ],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "receiverGetHashes",
        "outputs": [
          {
            "name": "",
            "type": "bytes23[2][]"
          }
        ],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "receiverGetStorage",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "getReceiverList",
        "outputs": [
          {
            "name": "",
            "type": "address[]"
          }
        ],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "receiverGetValues",
        "outputs": [
          {
            "name": "",
            "type": "uint256[]"
          }
        ],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "receiverGetBalance",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_receiver",
            "type": "address"
          },
          {
            "name": "_fileName",
            "type": "bytes"
          }
        ],
        "name": "senderSendMoney",
        "outputs": [],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "kilobytes",
            "type": "uint256"
          }
        ],
        "name": "receiverAddStorage",
        "outputs": [],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "receiverGetTotalGained",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "kilobytes",
            "type": "uint256"
          }
        ],
        "name": "receiverChangeStorage",
        "outputs": [],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "_receiverAddress",
            "type": "address"
          }
        ],
        "name": "receiverGetStatus",
        "outputs": [
          {
            "name": "",
            "type": "bool"
          }
        ],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "receiverGetSenders",
        "outputs": [
          {
            "name": "",
            "type": "address[]"
          }
        ],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_hash1",
            "type": "bytes23"
          },
          {
            "name": "_hash2",
            "type": "bytes23"
          }
        ],
        "name": "addHashes",
        "outputs": [
          {
            "name": "",
            "type": "bytes"
          }
        ],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_bytes",
            "type": "uint256"
          }
        ],
        "name": "receiverAdd",
        "outputs": [
          {
            "name": "",
            "type": "bool"
          }
        ],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_fileName",
            "type": "bytes"
          }
        ],
        "name": "senderGetFileHost",
        "outputs": [],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "_receiverAddress",
            "type": "address"
          },
          {
            "name": "_hash1",
            "type": "bytes23"
          },
          {
            "name": "_hash2",
            "type": "bytes23"
          }
        ],
        "name": "receiverGetFileIndex",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_hashes",
            "type": "bytes23[2][]"
          },
          {
            "name": "_fileName",
            "type": "bytes"
          },
          {
            "name": "_value",
            "type": "uint256"
          },
          {
            "name": "_sizes",
            "type": "uint256[]"
          }
        ],
        "name": "senderAddFile",
        "outputs": [
          {
            "name": "",
            "type": "bool"
          }
        ],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "_fileName",
            "type": "bytes"
          }
        ],
        "name": "senderGetFileHashes",
        "outputs": [
          {
            "name": "",
            "type": "bytes23[2][]"
          }
        ],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "newStatus",
            "type": "bool"
          }
        ],
        "name": "receiverChangeStatus",
        "outputs": [],
        "type": "function"
      },
      {
        "inputs": [],
        "type": "constructor"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "_receiver",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "status",
            "type": "bool"
          },
          {
            "indexed": false,
            "name": "index",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "availStorage",
            "type": "uint256"
          }
        ],
        "name": "AddReceiver",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "_sender",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "_name",
            "type": "bytes"
          },
          {
            "indexed": false,
            "name": "_value",
            "type": "uint256"
          }
        ],
        "name": "AddFile",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "_sender",
            "type": "address"
          }
        ],
        "name": "AddSender",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "_receiver",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "_sender",
            "type": "address"
          }
        ],
        "name": "FileWasHosted",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "_receiver",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "_sender",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "_amount",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "_fileName",
            "type": "bytes"
          }
        ],
        "name": "PayReceiver",
        "type": "event"
      }
    ],
    "unlinked_binary": "0x606060405260018054600160a060020a031916331790556000600255612296806100296000396000f3606060405236156101325760e060020a600035046314a32cd381146101345780631a13397e1461015c5780634377fe751461018a57806346efe67d14610195578063519bcd96146101b95780635228671d1461025857806361649d1c14610322578063880d2161146104f55780638a289912146106b45780638b22b923146107715780638ba45f15146107b05780638c14d1e61461081d5780638e7e83be146108bb57806395852da1146108f557806399587b1814610b725780639ac4be9314610bb9578063a8914ab614610bf3578063b695ff2f14610c32578063ba29e94214610c5e578063bc4de63814610d05578063bd90de2114610dee578063e7978ba214610e1f578063ea10043514611062578063eb5e5fa6146110ac578063f8d8a343146112ec578063feb5d02c146114c0575b005b611521600160a060020a033316600090815260046020526040902054610100900460ff165b90565b611521600160a060020a03331660009081526004602052604081205460ff1615156001141561165a57610159565b611535600254610159565b611521600160a060020a03331660009081526003602052604090205460ff16610159565b6040805160208181018352600080835233600160a060020a0381168252600390925292909220546115479290610100900460ff1615156001141561168f576040805160008290206008018054602081810284018101909452808352919290919083018282801561024b57602002820191906000526020600020905b816000505481526020019060010190808311610234575b5050505050915050610159565b33600160a060020a03811660009081526003602052604081205461153592600435929160ff161515600114156116935760408220600201548390106102ff5760408083206002018054859003905551600160a060020a038216908390859082818181858883f1935050505015156102ff57826003600050600033600160a060020a031681526020019081526020016000206000506002016000828282505401925050819055505b5050600160a060020a033316600090815260036020526040902060020154611695565b60408051602060248035600481810135601f810185900485028601850190965285855261159195813595919460449492939092019181908401838280828437505060408051602081810183526000808352600160a060020a038c168152999052972054949695508794610100900460ff16151560011415935061169d925050505760408051600091822085518493879360029390930192849290918291602085810192829185918391869190600490601f850104600302600f01f150905001915050908152602001604051809103902060005060060160009054906101000a900460ff16151560011515141561169a576004600050600087600160a060020a0316815260200190815260200160002060005060020160005085604051808280519060200190808383829060006004602084601f0104600302600f01f1509050019150509081526020016040518091039020600050600301600050805480602002602001604051908101604052809291908181526020016000905b828210156116a55760008481526020902060408051808201918290529160028086029091019182845b8154604860020a028152600191909101906020018083116104c5575b50505050508152602001906001019061049c565b6040805160206004803580820135601f810184900484028501840190955284845261154794919360249390929184019190819084018382808284375094965050505050505060408051602081810183526000808352600160a060020a0333908116825260049092529290922054909190610100900460ff161515600114156116935760408051600091822085518493879360029390930192849290918291602085810192829185918391869190600490601f850104600302600f01f150905001915050908152602001604051809103902060005060060160009054906101000a900460ff1615156001151514156116b3576004600050600033600160a060020a0316815260200190815260200160002060005060020160005085604051808280519060200190808383829060006004602084601f0104600302600f01f15090500191505090815260200160405180910390206000506004016000508054806020026020016040519081016040528092919081815260200182805480156106a557602002820191906000526020600020905b8154600160a060020a0316815260019190910190602001808311610686575b50505050509350505050611695565b6040805160208181018352600080835233600160a060020a0381168252600390925292909220546115919290610100900460ff1615156001141561168f57604080516000828120600701805460208181028501810190955280845292939092919084015b828210156116bb5760008481526020902060408051808201918290529160028086029091019182845b8154604860020a02815260019190910190602001808311610741575b505050505081526020019060010190610718565b33600160a060020a0381166000908152600360205260408120546115359290610100900460ff1615156001141561168f57506040902060050154610159565b60408051602081810183526000808352835181548084028201840190955284815261154794909283018282801561081157602002820191906000526020600020905b8154600160a060020a03168152600191909101906020018083116107f2575b50505050509050610159565b6040805160208181018352600080835233600160a060020a0381168252600390925292909220546115479290610100900460ff1615156001141561168f576040805160008290206009018054602081810284018101909452808352919290919083018282801561024b5760200282019190600052602060002090816000505481526020019060010190808311610234575b5050505050915050610159565b33600160a060020a038116600090815260036020526040812054611535929060ff1615156001141561168f57506040902060020154610159565b60408051602060248035600481810135601f81018590048502860185019096528585526101329581359591946044949293909201918190840183828082843750949650505050505050600160a060020a033390811660009081526004602052604081205490919060ff16151560011415610b6c57604080832090518451839286926002919091019183919081906020848101919081908490829085908e90600490601f850104600302600f01f150905001915050908152602001604051809103902060005060060160009054906101000a900460ff161515600115151415610b6957600160a060020a038616845260036020526040842054869060ff16151560011415610b6757349450346003600050600089600160a060020a0316815260200190815260200160002060005060020160005054016003600050600089600160a060020a0316815260200190815260200160002060005060020160005081905550846003600050600089600160a060020a0316815260200190815260200160002060005060030160005054016003600050600089600160a060020a03168152602001908152602001600020600050600301600050819055507f1f3de94dd175a95d613898f0421ed461878262f74a578c3b08f1b340c7d62d2d338834896040518085600160a060020a0316815260200184600160a060020a03168152602001838152602001806020018281038252838181518152602001915080519060200190808383829060006004602084601f0104600302600f01f150905090810190601f168015610b565780820380516001836020036101000a031916815260200191505b509550505050505060405180910390a15b505b50505b50505050565b610132600435600160a060020a0333908116600090815260036020526040902054610100900460ff16151560011415610bb45760406000206005018054830190555b505b50565b33600160a060020a038116600090815260036020526040812054611535929060ff1615156001141561168f57506040902060030154610159565b610132600435600160a060020a0333908116600090815260036020526040902054610100900460ff16151560011415610bb45750604060002060050155565b611521600435600160a060020a038116600090815260036020526040902054610100900460ff16611695565b6040805160208181018352600080835233600160a060020a0381168252600390925292909220546115479290610100900460ff1615156001141561168f576040805160008290206006018054602081810284018101909452808352919290919083018282801561024b57602002820191906000526020600020905b8154600160a060020a0316815260019190910190602001808311610cd9575b5050505050915050610159565b6115ec6004356024355b604080516020818101835260008083528351918201845280825292519192909181908190602e90805910610d405750595b908082528060200260200182016040528015610d57575b5093506000925060179150600090505b60178110156116c75786816017811015610002571a60f860020a028484806001019550815181101561000257906020010190600160f860020a031916908160001a90535085816017811015610002571a60f860020a028483806001019450815181101561000257906020010190600160f860020a031916908160001a905350600101610d67565b611521600435600160a060020a03331660009081526003602052604081205460ff161515600114156116d257611695565b6040805160206004803580820135601f81018490048402850184019095528484526101329491936024939092918401919081908401838280828437509496505050505050506040805160e081018252600080825282516020818101855282825283810191909152835180820185528281528385015283518082018552828152606084015283518082018552828152608084015260a0830182905260c08301829052600160a060020a0333908116835260049091529281205491929091829190610100900460ff1615156001141561180357604080519083208651839288926002019183919081906020848101919081908490829085908e90600490601f850104600302600f01f150905001915050908152602001604051809103902060005060060160009054906101000a900460ff161515600115151415610b67576004600050600033600160a060020a0316815260200190815260200160002060005060020160005087604051808280519060200190808383829060006004602084601f0104600302600f01f150905001915050908152602001604051809103902060005060e060405190810160405290816000820160009054906101000a9004600160a060020a0316600160a060020a03168152602001600182016000508054600181600116156101000203166002900480601f0160208091040260200160405190810160405280929190818152602001828054600181600116156101000203166002900480156118355780601f1061180a57610100808354040283529160200191611835565b611535600435602435604435600160a060020a0383166000908152600360205260408120548490610100900460ff1615156001141561206b5760408220600c016120748585610d0f565b611521602460048035828101929082013591813580830192908201359160443591606435908101910135600160a060020a0333908116600090815260046020526040812054909190610100900460ff16151560011415612128573387878080601f0160208091040260200160405190810160405280939291908181526020018383808284378201915050505050506004600050600083600160a060020a0316815260200190815260200160002060005060020160005081604051808280519060200190808383829060006004602084601f0104600302600f01f150905001915050908152602001604051809103902060005060060160009054906101000a900460ff16151560001515141561212557898514156121255760016004600050600033600160a060020a031681526020019081526020016000206000506002016000508a8a60405180838380828437820191505092505050908152602001604051809103902060005060060160006101000a81548160ff021916908302179055508a8a6004600050600033600160a060020a031681526020019081526020016000206000506002016000508b8b6040518083838082843782019150509250505090815260200160405180910390206000506003016000509190828054828255906000526020600020906002028101928215611c6f579160400282015b82811115611c6f5781600281018482604082015b82811115612134578154600160b860020a031916604860020a84350417825560209290920191600191909101906112ba565b6040805160206004803580820135601f810184900484028501840190955284845261159194919360249390929184019190819084018382808284375094965050505050505060408051602081810183526000808352600160a060020a0333908116825260049092529290922054909190610100900460ff161515600114156116935760408051600091822085518493879360029390930192849290918291602085810192829185918391869190600490601f850104600302600f01f150905001915050908152602001604051809103902060005060060160009054906101000a900460ff1615156001151514156116b3576004600050600033600160a060020a0316815260200190815260200160002060005060020160005085604051808280519060200190808383829060006004602084601f0104600302600f01f1509050019150509081526020016040518091039020600050600301600050805480602002602001604051908101604052809291908181526020016000905b8282101561223a5760008481526020902060408051808201918290529160028086029091019182845b8154604860020a02815260019190910190602001808311611490575b505050505081526020019060010190611467565b610132600435600160a060020a033390811660009081526003602052604090205460ff16151560011415610bb45760406000908120600160a060020a033316909152600360205254610100900460ff16151582151514156122485750610bb6565b604080519115158252519081900360200190f35b60408051918252519081900360200190f35b60405180806020018281038252838181518152602001915080519060200190602002808383829060006004602084601f0104600302600f01f1509050019250505060405180910390f35b60405180806020018281038252838181518152602001915080516000925b818410156115db57602084810284010151604080838184600060046015f15090500192600101926115af565b925050509250505060405180910390f35b60405180806020018281038252838181518152602001915080519060200190808383829060006004602084601f0104600302600f01f150905090810190601f16801561164c5780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b50600160a060020a0333166000908152600460205260409020805460ff1916600190811761ff00191661010017909155610159565b5090565b505b919050565b50505b505b92915050565b50505050935050505061169f565b505050919050565b50505050915050610159565b509195945050505050565b600160a060020a0333166000908152600360205260408120805460ff1916600190811761ff00191661010017825582548282015560059091018490558154908101808355828183801582901161173b5781836000526020600020918201910161173b91906117e3565b50505060009283525060208083209091018054600160a060020a03191633908117909155600160a060020a03168083526003825260408051938190208054600582015460019290920154938652610100900460ff16151593850193909352838101919091526060830191909152517f4ad6212e5ea2a69c78caeb4108c3f8d7c222a77e077914c2c273bc75b9547ecd9181900360800190a1506001611695565b506120b89291505b8082111561168f57600081556001016117e3565b60028054600101905550505b5050505050565b820191906000526020600020905b81548152906001019060200180831161181857829003601f168201915b505050505081526020016002820160005080548060200260200160405190810160405280929190818152602001828054801561189357602002820191906000526020600020905b81600050548152602001906001019080831161187c575b5050505050815260200160038201600050805480602002602001604051908101604052809291908181526020016000905b8282101561191d5760008481526020902060408051808201918290529160028086029091019182845b8154604860020a028152600191909101906020018083116118ed575b5050505050815260200190600101906118c4565b5050505081526020016004820160005080548060200260200160405190810160405280929190818152602001828054801561198257602002820191906000526020600020905b8154600160a060020a0316815260019190910190602001808311611963575b50505091835250506005820154602082015260069091015460ff161515604091909101526002549096509450600093505b856040015151841015611add57600360005060006000600050878154811015610002576000918252602080832090910154600160a060020a0316835282019290925260409081019091206005015490870151805186908110156100025790602001906020020151108015611a64575060008054869081101561000257906000526020600020900160009054906101000a9004600160a060020a0316600160a060020a031633600160a060020a031614155b15611b4957600360005060006000600050878154811015610002576000918252602080832090910154600160a060020a0316835282019290925260400190206006018054600181018083558281838015829011611b6a57600083815260209020611b6a9181019083016117e3565b600254851415611b5e575b6002546000546000190190106117f7576000600255610b67565b50505091909060005260206000209001600060008054899081101561000257505080526000805160206122768339815191528701548154600160a060020a031916600160a060020a0391909116179055505b600054600195909501948510611ad257600094505b600193909301926119b3565b50505060009283525060208220018054600160a060020a0319163317905580546003919081908890811015610002579060005260206000209001600090546101009190910a9004600160a060020a0316815260208101919091526040016000206007018054600181018083558281838015829011611c0157600202816002028360005260206000209182019101611c019190611c77565b5050509190906000526020600020906002020160008860600151878151811015610002576020908102909101015160028301915082604082015b82811115611c915782518254600160b860020a031916604860020a9091041782556020929092019160019190910190611c3b565b506121519291505b8082111561168f5760008082556001820155600201611c77565b50611cb79291505b8082111561168f578054600160b860020a0319168155600101611c99565b5050600080546003925081908890811015610002575050600080516020612276833981519152870154600160a060020a03168152602091909152604090206008018054600181018083558281838015829011611d2657818360005260206000209182019101611d2691906117e3565b50505091909060005260206000209001600088604001518781518110156100025750602088810291909101015190915580546003925081908890811015610002575050600080516020612276833981519152870154600160a060020a03168152602091909152604090206009018054600181018083558281838015829011611dc157818360005260206000209182019101611dc191906117e3565b5050506000928352506020822060a089015191015580546003919081908890811015610002575050600080516020612276833981519152870154600160a060020a0316815260209190915260409020600b018054600181018083558281838015829011611e4157818360005260206000209182019101611e4191906117e3565b5050506000928352506020822001819055805460019160039181908990811015610002578154600080516020612276833981519152820154600160a060020a031683526020859052604083206007015460001901955081101561000257906000526020600020900160009054906101000a9004600160a060020a0316600160a060020a03168152602001908152602001600020600050600c01600050611f1a8860600151878151811015610002575080516020898102830101515191908990811015610002575060208981029091018101510151610d0f565b604051808280519060200190808383829060006004602084601f0104600302600f01f1509050019150509081526020016040518091039020600050819055508560400151848151811015610002579060200190602002015160036000506000600060005088815481101561000257906000526020600020900160009054906101000a9004600160a060020a0316600160a060020a031681526020019081526020016000206000506005016000828282505403925050819055506004600050600033600160a060020a0316815260200190815260200160002060005060020160005087604051808280519060200190808383829060006004602084601f0104600302600f01f15090500191505090815260200160405180910390206000506004016000508054806001018281815481835581811511611af757818360005260206000209182019101611af791906117e3565b505b9392505050565b604051808280519060200190808383829060006004602084601f0104600302600f01f15090500191505090815260200160405180910390206000505491505061206d565b50507fcff57d64cf213ba01190b9500909d8d5cfe400fa0d1156c7c9a91f370f2c147f338a8a8a6040518085600160a060020a0316815260200180602001838152602001828103825285858281815260200192508082843782019150509550505050505060405180910390a15b50505b50979650505050505050565b50612140929150611c99565b5050916040019190600201906112a6565b5050600160a060020a0333166000908152600460205260409081902090518891600201908b908b908083838082843782019150509250505090815260200160405180910390206000506005016000508190555085856004600050600033600160a060020a031681526020019081526020016000206000506002016000508b8b60405180838380828437820191505092505050908152602001604051809103902060005060020160005091908280548282559060005260206000209081019282156117db579160200282015b828111156117db57823582600050559160200191906001019061221c565b505050509350505050611695565b600160a060020a03331660009081526003602052604090208054610100840261ff001991909116179055505056290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563",
    "updated_at": 1476070525567
  }
};

  Contract.checkNetwork = function(callback) {
    var self = this;

    if (this.network_id != null) {
      return callback();
    }

    this.web3.version.network(function(err, result) {
      if (err) return callback(err);

      var network_id = result.toString();

      // If we have the main network,
      if (network_id == "1") {
        var possible_ids = ["1", "live", "default"];

        for (var i = 0; i < possible_ids.length; i++) {
          var id = possible_ids[i];
          if (Contract.all_networks[id] != null) {
            network_id = id;
            break;
          }
        }
      }

      if (self.all_networks[network_id] == null) {
        return callback(new Error(self.name + " error: Can't find artifacts for network id '" + network_id + "'"));
      }

      self.setNetwork(network_id);
      callback();
    })
  };

  Contract.setNetwork = function(network_id) {
    var network = this.all_networks[network_id] || {};

    this.abi             = this.prototype.abi             = network.abi;
    this.unlinked_binary = this.prototype.unlinked_binary = network.unlinked_binary;
    this.address         = this.prototype.address         = network.address;
    this.updated_at      = this.prototype.updated_at      = network.updated_at;
    this.links           = this.prototype.links           = network.links || {};

    this.network_id = network_id;
  };

  Contract.networks = function() {
    return Object.keys(this.all_networks);
  };

  Contract.link = function(name, address) {
    if (typeof name == "object") {
      Object.keys(name).forEach(function(n) {
        var a = name[n];
        Contract.link(n, a);
      });
      return;
    }

    Contract.links[name] = address;
  };

  Contract.contract_name   = Contract.prototype.contract_name   = "DeStore";
  Contract.generated_with  = Contract.prototype.generated_with  = "3.1.2";

  var properties = {
    binary: function() {
      var binary = Contract.unlinked_binary;

      Object.keys(Contract.links).forEach(function(library_name) {
        var library_address = Contract.links[library_name];
        var regex = new RegExp("__" + library_name + "_*", "g");

        binary = binary.replace(regex, library_address.replace("0x", ""));
      });

      return binary;
    }
  };

  Object.keys(properties).forEach(function(key) {
    var getter = properties[key];

    var definition = {};
    definition.enumerable = true;
    definition.configurable = false;
    definition.get = getter;

    Object.defineProperty(Contract, key, definition);
    Object.defineProperty(Contract.prototype, key, definition);
  });

  bootstrap(Contract);

  if (typeof module != "undefined" && typeof module.exports != "undefined") {
    module.exports = Contract;
  } else {
    // There will only be one version of this contract in the browser,
    // and we can use that.
    window.DeStore = Contract;
  }
})();
