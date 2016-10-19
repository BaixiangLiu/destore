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
        "outputs": [],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "receiverGetAmountsPaid",
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
        "name": "receiverGetTimesPaid",
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
            "name": "_receiver",
            "type": "address"
          },
          {
            "name": "_hash1",
            "type": "bytes23"
          },
          {
            "name": "_hash2",
            "type": "bytes23"
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
        "constant": true,
        "inputs": [],
        "name": "senderGetHashes",
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
        "constant": false,
        "inputs": [
          {
            "name": "_hash",
            "type": "bytes23[2]"
          }
        ],
        "name": "senderGetHashHost",
        "outputs": [],
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
          },
          {
            "name": "_index",
            "type": "uint256"
          }
        ],
        "name": "senderGetFileHashReceivers",
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
        "inputs": [
          {
            "name": "_fileName",
            "type": "bytes"
          }
        ],
        "name": "senderGetFileTimePaid",
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
            "name": "_hash",
            "type": "bytes23[2]"
          }
        ],
        "name": "senderSendMoneyHash",
        "outputs": [],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "_hash",
            "type": "bytes23[2]"
          }
        ],
        "name": "senderGetHashReceivers",
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
            "name": "_bytes",
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
            "name": "_bytes",
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
            "name": "_bytes",
            "type": "uint256"
          }
        ],
        "name": "receiverAdd",
        "outputs": [],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_hash",
            "type": "bytes23[2]"
          },
          {
            "name": "_value",
            "type": "uint256"
          },
          {
            "name": "_size",
            "type": "uint256"
          }
        ],
        "name": "senderAddHash",
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
        "outputs": [],
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
        "constant": true,
        "inputs": [
          {
            "name": "_hash",
            "type": "bytes23[2]"
          }
        ],
        "name": "senderGetHashTimePaid",
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
          },
          {
            "indexed": false,
            "name": "_hash",
            "type": "bytes23[2]"
          },
          {
            "indexed": false,
            "name": "_value",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "_size",
            "type": "uint256"
          }
        ],
        "name": "AddHash",
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
            "name": "_hash1",
            "type": "bytes23"
          },
          {
            "indexed": false,
            "name": "_hash2",
            "type": "bytes23"
          }
        ],
        "name": "PayReceiver",
        "type": "event"
      }
    ],
    "unlinked_binary": "0x606060405260018054600160a060020a031916331790556000600255613b64806100296000396000f3606060405236156101955760e060020a600035046314a32cd381146101975780631a13397e146101bf57806320fd9584146101ed578063223badd81461028c57806325ce41901461032a5780632effadd7146106a65780634377fe751461076357806346efe67d1461076e578063519bcd96146107925780635228671d146108305780635879951b146108fa57806361649d1c14610be85780638077607914610dba578063880d216114610f8e5780638a2899121461114c5780638af0012b146112095780638b22b923146113565780638ba45f15146113955780638c14d1e6146114025780638e7e83be146114a0578063908bd983146114da57806395cda417146118a657806399587b1814611a6e5780639ac4be9314611ab5578063a8914ab614611aef578063b695ff2f14611b2e578063ba29e94214611b5a578063bd90de2114611c01578063e57e262f14611c32578063e7978ba214611e39578063ea1004351461207f578063eb5e5fa6146120e7578063f8d8a34314612325578063fc20d925146124f8578063feb5d02c1461265e575b005b6126bf600160a060020a033316600090815260046020526040902054610100900460ff165b90565b610195600160a060020a03331660009081526004602052604090205460ff1615156001141561278a576127ec565b6040805160208181018352600080835233600160a060020a0381168252600390925292909220546126d39290610100900460ff161515600114156127ee57604080516000829020600a018054602081810284018101909452808352919290919083018282801561027f57602002820191906000526020600020905b816000505481526020019060010190808311610268575b50505050509150506101bc565b6040805160208181018352600080835233600160a060020a0381168252600390925292909220546126d39290610100900460ff161515600114156127ee57604080516000829020600b018054602081810284018101909452808352919290919083018282801561027f5760200282019190600052602060002090816000505481526020019060010190808311610268575b50505050509150506101bc565b604080516020606435600481810135601f810184900484028501840190955284845261019594813594602480359560443595608494920191908190840183828082843750949650505050505050600160a060020a03339081166000908152600460205260408120549091829160ff1615156001141561069d57604080832090518551839287926004918201928492829160208581019282918591839186918f91601f850104600302600f01f150905001915050908152602001604051809103902060005060070160009054906101000a900460ff16151560011515141561069a57600160a060020a038916845260036020526040842054899060ff1615156001141561069857426004600050600033600160a060020a0316815260200190815260200160002060005060040160005088604051808280519060200190808383829060006004602084601f0104600302600f01f15090500191505090815260200160405180910390206000506008016000508190555034955034600360005060008c600160a060020a031681526020019081526020016000206000506002016000505401600360005060008c600160a060020a031681526020019081526020016000206000506002016000508190555085600360005060008c600160a060020a031681526020019081526020016000206000506003016000505401600360005060008c600160a060020a0316815260200190815260200160002060005060030160005081905550600360005060008b600160a060020a03168152602001908152602001600020600050600c0160005060008a68ffffffffffffffffff1916815260200190815260200160002060005060008968ffffffffffffffffff1916815260200190815260200160002060005054945042600360005060008c600160a060020a03168152602001908152602001600020600050600b0160005086815481101561000257906000526020600020900160005055600160a060020a038a166000908152600360205260409020600a01805487919087908110156100025790600052602060002090016000505560408051600160a060020a038c81168252331660208201528082018890526001604860020a0319808c1660608301528a16608082015290517fa252d942976baedb7ae6bd1236f6ba594c1c322814225b482cf41c2ad18b30049181900360a00190a15b505b50505b50505050505050565b6040805160208181018352600080835233600160a060020a03811682526004909252929092205461271d9290610100900460ff161515600114156127ee57604080516000828120600201805460208181028501810190955280845292939092919084015b828210156127f25760008481526020902060408051808201918290529160028086029091019182845b8154604860020a02815260019190910190602001808311610733575b50505050508152602001906001019061070a565b6127786002546101bc565b6126bf600160a060020a03331660009081526003602052604090205460ff166101bc565b6040805160208181018352600080835233600160a060020a0381168252600390925292909220546126d39290610100900460ff161515600114156127ee576040805160008290206008018054602081810284018101909452808352919290919083018282801561027f5760200282019190600052602060002090816000505481526020019060010190808311610268575b50505050509150506101bc565b33600160a060020a03811660009081526003602052604081205461277892600435929160ff161515600114156127fe5760408220600201548390106108d75760408083206002018054859003905551600160a060020a038216908390859082818181858883f1935050505015156108d757826003600050600033600160a060020a031681526020019081526020016000206000506002016000828282505401925050819055505b5050600160a060020a033316600090815260036020526040902060020154612800565b6040805180820182526101959160049160449183906002908390839080828437805160a081018252600080825260208281018290528284018290526060830182905283518082018552828152608084015233600160a060020a038116835294905291822054939850965094508493509150610100900460ff161515600114156128115760408220819086906003018482815080516001604860020a0319168252602092909252604081209160016020918201516001604860020a03191690925291909152604085205460ff161515141561069d576004600050600033600160a060020a0316815260200190815260200160002060005060030160005060008860006002811015610002575080516001604860020a0319168252602092909252604081209160016020918201516001604860020a0319169092529182526040808720815160a081018352815460ff16151581529281015483850152600281015483830152600381015460608401528151600482018054808702830187019094528382529394919360808601939192909190830182828015610ac457602002820191906000526020600020905b8154600160a060020a0316815260019190910190602001808311610aa5575b50505091909252505060025491975090955060009450505b8315156000141561283457600360005060006000600050878154811015610002575050600080516020613b44833981519152870154600160a060020a031681526020919091526040908190206005015490870151108015610b7a575060008054869081101561000257906000526020600020900160009054906101000a9004600160a060020a0316600160a060020a031633600160a060020a031614155b1561281857600360005060006000600050878154811015610002576000918252602080832090910154600160a060020a031683528201929092526040019020600601805460018101808355828183801582901161284e5760008381526020902061284e9181019083016128ed565b60408051602060248035600481810135601f810185900485028601850190965285855261271d95813595919460449492939092019181908401838280828437505060408051602081810183526000808352600160a060020a038c168152999052972054949695508794610100900460ff161515600114159350612e489250505057604080516000918220855184938793600493840193859391928392602086810193919283928692849287929091601f850104600302600f01f150905001915050908152602001604051809103902060005060070160009054906101000a900460ff161515600115151415612e45576004600050600087600160a060020a0316815260200190815260200160002060005060040160005085604051808280519060200190808383829060006004602084601f0104600302600f01f1509050019150509081526020016040518091039020600050600301600050805480602002602001604051908101604052809291908181526020016000905b82821015612e505760008481526020902060408051808201918290529160028086029091019182845b8154604860020a02815260019190910190602001808311610d8a575b505050505081526020019060010190610d61565b6040805160206004803580820135601f81018490048402850184019095528484526126d3949193602493909291840191908190840183828082843750949650509335935050505060408051602081810183526000808352600160a060020a0333908116825260049092529290922054909190610100900460ff16151560011415612e4857604080516000918220865184938893600493840193859391928392602086810193919283928692849287929091601f850104600302600f01f150905001915050908152602001604051809103902060005060070160009054906101000a900460ff161515600115151415612e45576004600050600033600160a060020a0316815260200190815260200160002060005060040160005086604051808280519060200190808383829060006004602084601f0104600302600f01f15090500191505090815260200160405180910390206000506005016000506000868152602001908152602001600020600050805480602002602001604051908101604052809291908181526020018280548015610f7f57602002820191906000526020600020905b8154600160a060020a0316815260019190910190602001808311610f60575b50505050509350505050612e4a565b6040805160206004803580820135601f81018490048402850184019095528484526126d394919360249390929184019190819084018382808284375094965050505050505060408051602081810183526000808352600160a060020a0333908116825260049092529290922054909190610100900460ff161515600114156127fe57604080516000918220855184938793600493840193859391928392602086810193919283928692849287929091601f850104600302600f01f150905001915050908152602001604051809103902060005060070160009054906101000a900460ff161515600115151415612e5e576004600050600033600160a060020a0316815260200190815260200160002060005060040160005085604051808280519060200190808383829060006004602084601f0104600302600f01f150905001915050908152602001604051809103902060005060040160005080548060200260200160405190810160405280929190818152602001828054801561113d57602002820191906000526020600020905b8154600160a060020a031681526001919091019060200180831161111e575b50505050509350505050612800565b6040805160208181018352600080835233600160a060020a03811682526003909252929092205461271d9290610100900460ff161515600114156127ee57604080516000828120600701805460208181028501810190955280845292939092919084015b828210156127f25760008481526020902060408051808201918290529160028086029091019182845b8154604860020a028152600191909101906020018083116111d9575b5050505050815260200190600101906111b0565b6040805160206004803580820135601f8101849004840285018401909552848452612778949193602493909291840191908190840183828082843750949650505050505050600160a060020a033390811660009081526004602052604081205490919060ff161515600114156127fe57604080832090518451839286926004918201928492829160208581019282918591839186918f91601f850104600302600f01f150905001915050908152602001604051809103902060005060070160009054906101000a900460ff161515600115151415612e5e576004600050600033600160a060020a0316815260200190815260200160002060005060040160005085604051808280519060200190808383829060006004602084601f0104600302600f01f1509050019150509081526020016040518091039020600050600801600050549350505050612800565b33600160a060020a0381166000908152600360205260408120546127789290610100900460ff161515600114156127ee575060409020600501546101bc565b6040805160208181018352600080835283518154808402820184019095528481526126d39490928301828280156113f657602002820191906000526020600020905b8154600160a060020a03168152600191909101906020018083116113d7575b505050505090506101bc565b6040805160208181018352600080835233600160a060020a0381168252600390925292909220546126d39290610100900460ff161515600114156127ee576040805160008290206009018054602081810284018101909452808352919290919083018282801561027f5760200282019190600052602060002090816000505481526020019060010190808311610268575b50505050509150506101bc565b33600160a060020a038116600090815260036020526040812054612778929060ff161515600114156127ee575060409020600201546101bc565b6101956004356024600160a060020a03339081166000908152600460205260408120549091829160ff161515600114156128115760408051808201825282918690600290839083908082843782019150505050506004600050600083600160a060020a0316815260200190815260200160002060005060030160005060008260006002811015610002579090602002015168ffffffffffffffffff1916815260200190815260200160002060005060008260016002811015610002579090602002015168ffffffffffffffffff1916815260200190815260200160002060005060000160009054906101000a900460ff16151560011515141561069d57600160a060020a038716845260036020526040842054879060ff1615156001141561189c57426004600050600033600160a060020a0316815260200190815260200160002060005060030160005060008960006002811015610002575080356001604860020a0319168252602092909252604081209160019090602002013568ffffffffffffffffff191681526020019081526020016000206000506003016000508190555034955034600360005060008a600160a060020a031681526020019081526020016000206000506002016000505401600360005060008a600160a060020a031681526020019081526020016000206000506002016000508190555085600360005060008a600160a060020a031681526020019081526020016000206000506003016000505401600360005060008a600160a060020a03168152602001908152602001600020600050600301600050819055506003600050600089600160a060020a03168152602001908152602001600020600050600c0160005060008860006002811015610002575080356001604860020a0319168252602092909252604081209160019090602002013568ffffffffffffffffff1916815260200190815260200160002060005054945042600360005060008a600160a060020a03168152602001908152602001600020600050600b0160005086815481101561000257906000526020600020900160005055600160a060020a0388166000908152600360205260409020600a0180548791908790811015610002579060005260206000209001600050557fa252d942976baedb7ae6bd1236f6ba594c1c322814225b482cf41c2ad18b30048833888a600050508a358b6001505060408051600160a060020a03958616815294909316602085810191909152848401929092526001604860020a03199081166060850152908b0135166080830152519081900360a00190a15b5050505050505050565b6126d3600460408051602081810183526000808352600160a060020a0333908116825260049092529290922054909190610100900460ff161515600114156127fe5760408051808201825282918590600290839083908082843782019150505050506004600050600083600160a060020a0316815260200190815260200160002060005060030160005060008260006002811015610002579090602002015168ffffffffffffffffff1916815260200190815260200160002060005060008260016002811015610002579090602002015168ffffffffffffffffff1916815260200190815260200160002060005060000160009054906101000a900460ff161515600115151415612e5e576004600050600033600160a060020a03168152602001908152602001600020600050600301600050600086600060028110156100025750506001604860020a03198735811682526020928352604080832060243590921683529083528051918190208801805480850284018501909252818352919283018282801561113d57602002820191906000526020600020908154600160a060020a031681526001919091019060200180831161111e575b50505050509350505050612800565b610195600435600160a060020a0333908116600090815260036020526040902054610100900460ff16151560011415611ab05760406000206005018054830190555b505b50565b33600160a060020a038116600090815260036020526040812054612778929060ff161515600114156127ee575060409020600301546101bc565b610195600435600160a060020a0333908116600090815260036020526040902054610100900460ff16151560011415611ab05750604060002060050155565b6126bf600435600160a060020a038116600090815260036020526040902054610100900460ff16612800565b6040805160208181018352600080835233600160a060020a0381168252600390925292909220546126d39290610100900460ff161515600114156127ee576040805160008290206006018054602081810284018101909452808352919290919083018282801561027f57602002820191906000526020600020905b8154600160a060020a0316815260019190910190602001808311611bd5575b50505050509150506101bc565b610195600435600160a060020a03331660009081526003602052604090205460ff16151560011415612e6657611ab2565b6126bf6004604435606435600160a060020a0333908116600090815260046020526040812054909190610100900460ff16151560011415612fd25760408051808201825282918790600290839083908082843782019150505050506004600050600083600160a060020a0316815260200190815260200160002060005060030160005060008260006002811015610002579090602002015168ffffffffffffffffff1916815260200190815260200160002060005060008260016002811015610002579090602002015168ffffffffffffffffff1916815260200190815260200160002060005060000160009054906101000a900460ff16151560011515141515612fcf5760016004600050600033600160a060020a031681526020019081526020016000206000506003016000506000896000600281101561000257506001604860020a0319813581168084526020858152604080862060243590941686528382528520805460ff19168817815587018d90559084529390935288939090602002013568ffffffffffffffffff19168152602001908152602001600020600050600201600050819055506004600050600033600160a060020a031681526020019081526020016000206000506002016000508054806001018281815481835581811511612fdb57600202816002028360005260206000209182019101612fdb9190612962565b6040805160206004803580820135601f8101849004840285018401909552848452610195949193602493909291840191908190840183828082843750949650505050505050604080516101008181018352600080835283516020818101865282825284810191909152845180820186528281528486015284518082018652828152606085015284518082018652828152608085015260a0840182905260c0840182905260e08401829052600160a060020a03339081168352600490915293812054929390928392900460ff1615156001141561281157604080832090518651839288926004918201928492829160208581019282918591839186918f91601f850104600302600f01f150905001915050908152602001604051809103902060005060070160009054906101000a900460ff16151560011515141561069d576004600050600033600160a060020a0316815260200190815260200160002060005060040160005087604051808280519060200190808383829060006004602084601f0104600302600f01f150905001915050908152602001604051809103902060005061010060405190810160405290816000820160009054906101000a9004600160a060020a0316600160a060020a03168152602001600182016000508054600181600116156101000203166002900480601f0160208091040260200160405190810160405280929190818152602001828054600181600116156101000203166002900480156130615780601f1061303657610100808354040283529160200191613061565b612778600435602435604435600160a060020a0383166000908152600360205260408120548490610100900460ff16151560011415612fd2575060408082206001604860020a03198086168452600c9091016020908152828420918516845252902054612fd4565b610195602460048035828101929082013591813580830192908201359160443591606435908101910135600160a060020a0333908116600090815260046020526040902054610100900460ff1615156001141561189c573386868080601f0160208091040260200160405190810160405280939291908181526020018383808284378201915050505050506004600050600083600160a060020a0316815260200190815260200160002060005060040160005081604051808280519060200190808383829060006004602084601f0104600302600f01f150905001915050908152602001604051809103902060005060070160009054906101000a900460ff1615156001151514151561069857888414156106985760016004600050600033600160a060020a03168152602001908152602001600020600050600401600050898960405180838380828437820191505092505050908152602001604051809103902060005060070160006101000a81548160ff0219169083021790555089896004600050600033600160a060020a031681526020019081526020016000206000506004016000508a8a604051808383808284378201915050925050509081526020016040518091039020600050600301600050919082805482825590600052602060002090600202810192821561295a579160400282015b8281111561295a5781600281018482604082015b82811115613982578154600160b860020a031916604860020a84350417825560209290920191600191909101906122f3565b6040805160206004803580820135601f810184900484028501840190955284845261271d94919360249390929184019190819084018382808284375094965050505050505060408051602081810183526000808352600160a060020a0333908116825260049092529290922054909190610100900460ff161515600114156127fe57604080516000918220855184938793600493840193859391928392602086810193919283928692849287929091601f850104600302600f01f150905001915050908152602001604051809103902060005060070160009054906101000a900460ff161515600115151415612e5e576004600050600033600160a060020a0316815260200190815260200160002060005060040160005085604051808280519060200190808383829060006004602084601f0104600302600f01f1509050019150509081526020016040518091039020600050600301600050805480602002602001604051908101604052809291908181526020016000905b82821015613b085760008481526020902060408051808201918290529160028086029091019182845b8154604860020a028152600191909101906020018083116124c8575b50505050508152602001906001019061249f565b6127786004600160a060020a033390811660009081526004602052604081205490919060ff161515600114156127fe5760408051808201825282918590600290839083908082843782019150505050506004600050600083600160a060020a0316815260200190815260200160002060005060030160005060008260006002811015610002579090602002015168ffffffffffffffffff1916815260200190815260200160002060005060008260016002811015610002579090602002015168ffffffffffffffffff1916815260200190815260200160002060005060000160009054906101000a900460ff161515600115151415612e5e576004600050600033600160a060020a0316815260200190815260200160002060005060030160005060008660006002811015610002575050506001604860020a03198635811686526020918252604080872060243590921687529152909320600301549250612800915050565b610195600435600160a060020a033390811660009081526003602052604090205460ff16151560011415611ab05760406000908120600160a060020a033316909152600360205254610100900460ff1615158215151415613b165750611ab2565b604080519115158252519081900360200190f35b60405180806020018281038252838181518152602001915080519060200190602002808383829060006004602084601f0104600302600f01f1509050019250505060405180910390f35b60405180806020018281038252838181518152602001915080516000925b8184101561276757602084810284010151604080838184600060046015f150905001926001019261273b565b925050509250505060405180910390f35b60408051918252519081900360200190f35b600160a060020a033316600081815260046020908152604091829020805460ff191660011761ff001916610100179055815192835290517f586f0cb1785c450e25317677f006144dd3ae1ecc68ac0998e944dfe7a8f6a6289281900390910190a15b565b5090565b505050509150506101bc565b505b919050565b60028054600101905550505b5050505050565b600054600019018510612e245760025460009550851415612e33575b60025460005460001901901061280557600060025561069d565b50505060009283525060208220018054600160a060020a0319163317905580546003919081908890811015610002579060005260206000209001600090546101009190910a9004600160a060020a0316815260208101919091526040016000206007018054600181018083558281838015829011612901576002028160020283600052602060002091820191016129019190612962565b50613a909291505b808211156127ee57600081556001016128ed565b50505091909060005260206000209060020201600050600280820190828b9160200282015b8281111561297c5782518254600160b860020a031916604860020a9091041782556020929092019160019190910190612926565b5061399f9291505b808211156127ee5760008082556001820155600201612962565b506129a29291505b808211156127ee578054600160b860020a0319168155600101612984565b5050600080546003925081908890811015610002575050600080516020613b44833981519152870154600160a060020a03168152602091909152604090206008018054600181018083558281838015829011612a1157818360005260206000209182019101612a1191906128ed565b50505060009283525060208220604089015191015580546003919081908890811015610002575050600080516020613b44833981519152870154600160a060020a03168152602091909152604090206009018054600181018083558281838015829011612a9157818360005260206000209182019101612a9191906128ed565b50505060009283525060208083209089015191015580546003919081908890811015610002575050600080516020613b44833981519152870154600160a060020a0316815260209190915260409020600b018054600181018083558281838015829011612b1157818360005260206000209182019101612b1191906128ed565b505050600092835250602082200181905580546003919081908890811015610002575050600080516020613b44833981519152870154600160a060020a0316815260209190915260409020600a018054600181018083558281838015829011612b8d57818360005260206000209182019101612b8d91906128ed565b5050506000928352506020822001819055805460019160039181908990811015610002578154600080516020613b44833981519152820154600160a060020a0316835260208590526040832060070154600019019550811015610002579060005260206000209001600090546101009190910a9004600160a060020a0316815260208101919091526040016000908120600c019089815080516001604860020a031916825260209290925260408120916001505060208a8101516001604860020a031916825291909152604080822092909255908701518154909160039181908990811015610002575050600080516020613b44833981519152880154600160a060020a0390811682526020838152604080842060050180549690960390955533909116825260048082528483208c516001604860020a03199081168552940182528483208c830151909416835292905291909120018054600181018083558281838015829011612d1157818360005260206000209182019101612d1191906128ed565b505050919090600052602060002090016000600080548990811015610002575050600080516020613b448339815191528801548254600160a060020a031916600160a060020a0391821617909255339091168082526004602081815260408085208d516001604860020a031990811687526003919091018084528287208f8501519092168752908352908520830154938552919052600019919091019250908981505089516001604860020a03199081168252602092835260408083208c850151909216835292529081208154600591909101919081908990811015610002575050600080516020613b44833981519152880154600160a060020a03168152602091909152604090205560019350612e40565b600254851415612e3857612834565b612e40565b600194909401935b610adc565b50505b505b92915050565b505050509350505050612e4a565b505050919050565b600160a060020a0333166000908152600360205260408120805460ff1916600190811761ff001916610100178255825482820155600590910183905581549081018083558281838015829011612ecf57818360005260206000209182019101612ecf91906128ed565b50505060009283525060208083209091018054600160a060020a03191633908117909155600160a060020a03168083526003825260408051938190208054600582015460019290920154938652610100900460ff16151593850193909352838101919091526060830191909152517f4ad6212e5ea2a69c78caeb4108c3f8d7c222a77e077914c2c273bc75b9547ecd9181900360800190a150565b5050507f99ea32d811e87cdaea82dde6b92f190194fc2dfe7ee7acdcd96dca50df4b961b338888886040518085600160a060020a0316815260200184600260200280828437820191505083815260200182815260200194505050505060405180910390a15b50505b505b9392505050565b505050600092835260209092206002918202019081018982604082015b8281111561302a578154600160b860020a031916604860020a8435041782556020929092019160019190910190612ff8565b50612f6a929150612984565b820191906000526020600020905b81548152906001019060200180831161304457829003601f168201915b50505050508152602001600282016000508054806020026020016040519081016040528092919081815260200182805480156130bf57602002820191906000526020600020905b8160005054815260200190600101908083116130a8575b5050505050815260200160038201600050805480602002602001604051908101604052809291908181526020016000905b828210156131495760008481526020902060408051808201918290529160028086029091019182845b8154604860020a02815260019190910190602001808311613119575b5050505050815260200190600101906130f0565b505050508152602001600482016000508054806020026020016040519081016040528092919081815260200182805480156131ae57602002820191906000526020600020905b8154600160a060020a031681526001919091019060200180831161318f575b505050918352505060068201546020820152600782015460ff1615156040820152600890910154606091909101526002549096509450600093505b85604001515184101561283457600360005060006000600050878154811015610002576000918252602080832090910154600160a060020a031683528201929092526040908101909120600501549087015180518690811015610002579060200190602002015110801561329a575060008054869081101561000257906000526020600020900160009054906101000a9004600160a060020a0316600160a060020a031633600160a060020a031614155b1561335a57600360005060006000600050878154811015610002576000918252602080832090910154600160a060020a031683528201929092526040019020600601805460018101808355828183801582901161337b5760008381526020902061337b9181019083016128ed565b5050509190906000526020600020900160006000805489908110156100025750508052600080516020613b448339815191528701548154600160a060020a031916600160a060020a0391909116179055505b60005460019590950194851061397357600094505b600193909301926131e9565b50505060009283525060208220018054600160a060020a0319163317905580546003919081908890811015610002579060005260206000209001600090546101009190910a9004600160a060020a0316815260208101919091526040016000206007018054600181018083558281838015829011613412576002028160020283600052602060002091820191016134129190612962565b5050509190906000526020600020906002020160008860600151878151811015610002576020908102909101015160028301915082604082015b828111156134805782518254600160b860020a031916604860020a909104178255602092909201916001919091019061344c565b5061348c929150612984565b5050600080546003925081908890811015610002575050600080516020613b44833981519152870154600160a060020a031681526020919091526040902060080180546001810180835582818380158290116134fb578183600052602060002091820191016134fb91906128ed565b50505091909060005260206000209001600088604001518781518110156100025750602088810291909101015190915580546003925081908890811015610002575050600080516020613b44833981519152870154600160a060020a031681526020919091526040902060090180546001810180835582818380158290116135965781836000526020600020918201910161359691906128ed565b5050506000928352506020822060a089015191015580546003919081908890811015610002575050600080516020613b44833981519152870154600160a060020a0316815260209190915260409020600b0180546001810180835582818380158290116136165781836000526020600020918201910161361691906128ed565b505050600092835250602082200181905580546003919081908890811015610002575050600080516020613b44833981519152870154600160a060020a0316815260209190915260409020600a0180546001810180835582818380158290116136925781836000526020600020918201910161369291906128ed565b5050506000928352506020822001819055805460019160039181908990811015610002578154600080516020613b44833981519152820154600160a060020a031683526020859052604083206007015460001901955081101561000257906000526020600020900160009054906101000a9004600160a060020a0316600160a060020a03168152602001908152602001600020600050600c0160005060008860600151878151811015610002576020818102909201820151516001604860020a03191683529290526040812060608a0151805191935090889081101561000257506020888102919091018101518101516001604860020a03191682529190915260409081902091909155860151805185908110156100025790602001906020020151600360005060006000600050888154811015610002575050600080516020613b44833981519152880154600160a060020a03908116825260208381526040808420600501805496909603909555339091168252600480825284832094518c51958201958d95919485948781019492938493879385938893919291601f86019190910402600f01f150905001915050908152602001604051809103902060005060040160005080548060010182818154818355818115116138875781836000526020600020918201910161388791906128ed565b505050919090600052602060002090016000600080548990811015610002575050600080516020613b448339815191528801548254600160a060020a03918216600160a060020a0319919091161790925533909116815260046020818152604080519084208c5190840195508c94919384938681019383928692849287929091601f850104600302600f01f1509050019150509081526020016040518091039020600050600501600050600085815260200190815260200160002060005080548060010182818154818355818115116133085781836000526020600020918201910161330891906128ed565b60025485141561336f57612834565b5061398e929150612984565b5050916040019190600201906122df565b5050856004600050600033600160a060020a0316815260200190815260200160002060005060040160005089896040518083838082843782019150509250505090815260200160405180910390206000506006016000508190555084846004600050600033600160a060020a031681526020019081526020016000206000506004016000508a8a60405180838380828437820191505092505050908152602001604051809103902060005060020160005091908280548282559060005260206000209081019282156128e5579160200282015b828111156128e5578235826000505591602001919060010190613a72565b50507fcff57d64cf213ba01190b9500909d8d5cfe400fa0d1156c7c9a91f370f2c147f338989896040518085600160a060020a0316815260200180602001838152602001828103825285858281815260200192508082843782019150509550505050505060405180910390a150505050505050505050565b505050509350505050612800565b600160a060020a03331660009081526003602052604090208054610100840261ff001991909116179055505056290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563",
    "updated_at": 1476859981429
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
