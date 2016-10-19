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
        "name": "receiverGetValue",
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
          },
          {
            "name": "_value",
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
            "name": "_value",
            "type": "uint256"
          }
        ],
        "name": "receiverChangeValue",
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
    "unlinked_binary": "0x606060405260018054600160a060020a031916331790556000600255613c45806100296000396000f3606060405236156101ab5760e060020a600035046314a32cd381146101ad5780631a13397e146101d557806320fd95841461020357806321b42a0d146102a2578063223badd8146102e157806325ce41901461037f5780632effadd7146106fb5780634377fe75146107b857806346efe67d146107c3578063519bcd96146107e75780635228671d146108855780635879951b1461094f57806361649d1c14610c7f5780638077607914610e51578063880d2161146110255780638a289912146111e35780638af0012b146112a05780638b22b923146113ed5780638ba45f151461142c5780638c14d1e6146114995780638e7e83be14611537578063908bd9831461157157806395cda4171461193d57806399587b1814611b055780639ac4be9314611b4c578063a679f2e014611b86578063a8914ab614611bba578063b695ff2f14611bf9578063ba29e94214611c25578063dd04aa1214611ccc578063e57e262f14611d0b578063e7978ba214611f12578063ea10043514612158578063eb5e5fa6146121c0578063f8d8a343146123fe578063fc20d925146125d1578063feb5d02c14612737575b005b612798600160a060020a033316600090815260046020526040902054610100900460ff165b90565b6101ab600160a060020a03331660009081526004602052604090205460ff16151560011415612863576128c5565b6040805160208181018352600080835233600160a060020a0381168252600390925292909220546127ac9290610100900460ff161515600114156128c757604080516000829020600b018054602081810284018101909452808352919290919083018282801561029557602002820191906000526020600020905b81600050548152602001906001019080831161027e575b50505050509150506101d2565b33600160a060020a0381166000908152600360205260408120546127f69290610100900460ff161515600114156128c7575060409020600601546101d2565b6040805160208181018352600080835233600160a060020a0381168252600390925292909220546127ac9290610100900460ff161515600114156128c757604080516000829020600c0180546020818102840181019094528083529192909190830182828015610295576020028201919060005260206000209081600050548152602001906001019080831161027e575b50505050509150506101d2565b604080516020606435600481810135601f81018490048402850184019095528484526101ab94813594602480359560443595608494920191908190840183828082843750949650505050505050600160a060020a03339081166000908152600460205260408120549091829160ff161515600114156106f257604080832090518551839287926004918201928492829160208581019282918591839186918f91601f850104600302600f01f150905001915050908152602001604051809103902060005060070160009054906101000a900460ff1615156001151514156106ef57600160a060020a038916845260036020526040842054899060ff161515600114156106ed57426004600050600033600160a060020a0316815260200190815260200160002060005060040160005088604051808280519060200190808383829060006004602084601f0104600302600f01f15090500191505090815260200160405180910390206000506008016000508190555034955034600360005060008c600160a060020a031681526020019081526020016000206000506002016000505401600360005060008c600160a060020a031681526020019081526020016000206000506002016000508190555085600360005060008c600160a060020a031681526020019081526020016000206000506003016000505401600360005060008c600160a060020a0316815260200190815260200160002060005060030160005081905550600360005060008b600160a060020a03168152602001908152602001600020600050600d0160005060008a68ffffffffffffffffff1916815260200190815260200160002060005060008968ffffffffffffffffff1916815260200190815260200160002060005054945042600360005060008c600160a060020a03168152602001908152602001600020600050600c0160005086815481101561000257906000526020600020900160005055600160a060020a038a166000908152600360205260409020600b01805487919087908110156100025790600052602060002090016000505560408051600160a060020a038c81168252331660208201528082018890526001604860020a0319808c1660608301528a16608082015290517fa252d942976baedb7ae6bd1236f6ba594c1c322814225b482cf41c2ad18b30049181900360a00190a15b505b50505b50505050505050565b6040805160208181018352600080835233600160a060020a0381168252600490925292909220546128089290610100900460ff161515600114156128c757604080516000828120600201805460208181028501810190955280845292939092919084015b828210156128cb5760008481526020902060408051808201918290529160028086029091019182845b8154604860020a02815260019190910190602001808311610788575b50505050508152602001906001019061075f565b6127f66002546101d2565b612798600160a060020a03331660009081526003602052604090205460ff166101d2565b6040805160208181018352600080835233600160a060020a0381168252600390925292909220546127ac9290610100900460ff161515600114156128c75760408051600082902060090180546020818102840181019094528083529192909190830182828015610295576020028201919060005260206000209081600050548152602001906001019080831161027e575b50505050509150506101d2565b33600160a060020a0381166000908152600360205260408120546127f692600435929160ff161515600114156128d757604082206002015483901061092c5760408083206002018054859003905551600160a060020a038216908390859082818181858883f19350505050151561092c57826003600050600033600160a060020a031681526020019081526020016000206000506002016000828282505401925050819055505b5050600160a060020a0333166000908152600360205260409020600201546128d9565b6040805180820182526101ab9160049160449183906002908390839080828437805160a081018252600080825260208281018290528284018290526060830182905283518082018552828152608084015233600160a060020a038116835294905291822054939850965094508493509150610100900460ff161515600114156128ea5760408220819086906003018482815080516001604860020a0319168252602092909252604081209160016020918201516001604860020a03191690925291909152604085205460ff16151514156106f2576004600050600033600160a060020a0316815260200190815260200160002060005060030160005060008860006002811015610002575080516001604860020a0319168252602092909252604081209160016020918201516001604860020a0319169092529182526040808720815160a081018352815460ff16151581529281015483850152600281015483830152600381015460608401528151600482018054808702830187019094528382529394919360808601939192909190830182828015610b1957602002820191906000526020600020905b8154600160a060020a0316815260019190910190602001808311610afa575b50505091909252505060025491975090955060009450505b8315156000141561290d57600360005060006000600050878154811015610002575050600080516020613c25833981519152870154600160a060020a031681526020919091526040908190206005015490870151108015610bdf5750600360005060006000600050878154811015610002579060005260206000209001600090546101009190910a9004600160a060020a031681526020818101929092526040016000206006015490870151115b8015610c11575060008054869081101561000257600091825260209091200154600160a060020a039081163390911614155b156128f157600360005060006000600050878154811015610002576000918252602080832090910154600160a060020a0316835282019290925260400190206007018054600181018083558281838015829011612927576000838152602090206129279181019083016129c6565b60408051602060248035600481810135601f810185900485028601850190965285855261280895813595919460449492939092019181908401838280828437505060408051602081810183526000808352600160a060020a038c168152999052972054949695508794610100900460ff161515600114159350612f219250505057604080516000918220855184938793600493840193859391928392602086810193919283928692849287929091601f850104600302600f01f150905001915050908152602001604051809103902060005060070160009054906101000a900460ff161515600115151415612f1e576004600050600087600160a060020a0316815260200190815260200160002060005060040160005085604051808280519060200190808383829060006004602084601f0104600302600f01f1509050019150509081526020016040518091039020600050600301600050805480602002602001604051908101604052809291908181526020016000905b82821015612f295760008481526020902060408051808201918290529160028086029091019182845b8154604860020a02815260019190910190602001808311610e21575b505050505081526020019060010190610df8565b6040805160206004803580820135601f81018490048402850184019095528484526127ac949193602493909291840191908190840183828082843750949650509335935050505060408051602081810183526000808352600160a060020a0333908116825260049092529290922054909190610100900460ff16151560011415612f2157604080516000918220865184938893600493840193859391928392602086810193919283928692849287929091601f850104600302600f01f150905001915050908152602001604051809103902060005060070160009054906101000a900460ff161515600115151415612f1e576004600050600033600160a060020a0316815260200190815260200160002060005060040160005086604051808280519060200190808383829060006004602084601f0104600302600f01f1509050019150509081526020016040518091039020600050600501600050600086815260200190815260200160002060005080548060200260200160405190810160405280929190818152602001828054801561101657602002820191906000526020600020905b8154600160a060020a0316815260019190910190602001808311610ff7575b50505050509350505050612f23565b6040805160206004803580820135601f81018490048402850184019095528484526127ac94919360249390929184019190819084018382808284375094965050505050505060408051602081810183526000808352600160a060020a0333908116825260049092529290922054909190610100900460ff161515600114156128d757604080516000918220855184938793600493840193859391928392602086810193919283928692849287929091601f850104600302600f01f150905001915050908152602001604051809103902060005060070160009054906101000a900460ff161515600115151415612f37576004600050600033600160a060020a0316815260200190815260200160002060005060040160005085604051808280519060200190808383829060006004602084601f0104600302600f01f15090500191505090815260200160405180910390206000506004016000508054806020026020016040519081016040528092919081815260200182805480156111d457602002820191906000526020600020905b8154600160a060020a03168152600191909101906020018083116111b5575b505050505093505050506128d9565b6040805160208181018352600080835233600160a060020a0381168252600390925292909220546128089290610100900460ff161515600114156128c757604080516000828120600801805460208181028501810190955280845292939092919084015b828210156128cb5760008481526020902060408051808201918290529160028086029091019182845b8154604860020a02815260019190910190602001808311611270575b505050505081526020019060010190611247565b6040805160206004803580820135601f81018490048402850184019095528484526127f6949193602493909291840191908190840183828082843750949650505050505050600160a060020a033390811660009081526004602052604081205490919060ff161515600114156128d757604080832090518451839286926004918201928492829160208581019282918591839186918f91601f850104600302600f01f150905001915050908152602001604051809103902060005060070160009054906101000a900460ff161515600115151415612f37576004600050600033600160a060020a0316815260200190815260200160002060005060040160005085604051808280519060200190808383829060006004602084601f0104600302600f01f15090500191505090815260200160405180910390206000506008016000505493505050506128d9565b33600160a060020a0381166000908152600360205260408120546127f69290610100900460ff161515600114156128c7575060409020600501546101d2565b6040805160208181018352600080835283518154808402820184019095528481526127ac94909283018282801561148d57602002820191906000526020600020905b8154600160a060020a031681526001919091019060200180831161146e575b505050505090506101d2565b6040805160208181018352600080835233600160a060020a0381168252600390925292909220546127ac9290610100900460ff161515600114156128c757604080516000829020600a0180546020818102840181019094528083529192909190830182828015610295576020028201919060005260206000209081600050548152602001906001019080831161027e575b50505050509150506101d2565b33600160a060020a0381166000908152600360205260408120546127f6929060ff161515600114156128c7575060409020600201546101d2565b6101ab6004356024600160a060020a03339081166000908152600460205260408120549091829160ff161515600114156128ea5760408051808201825282918690600290839083908082843782019150505050506004600050600083600160a060020a0316815260200190815260200160002060005060030160005060008260006002811015610002579090602002015168ffffffffffffffffff1916815260200190815260200160002060005060008260016002811015610002579090602002015168ffffffffffffffffff1916815260200190815260200160002060005060000160009054906101000a900460ff1615156001151514156106f257600160a060020a038716845260036020526040842054879060ff1615156001141561193357426004600050600033600160a060020a0316815260200190815260200160002060005060030160005060008960006002811015610002575080356001604860020a0319168252602092909252604081209160019090602002013568ffffffffffffffffff191681526020019081526020016000206000506003016000508190555034955034600360005060008a600160a060020a031681526020019081526020016000206000506002016000505401600360005060008a600160a060020a031681526020019081526020016000206000506002016000508190555085600360005060008a600160a060020a031681526020019081526020016000206000506003016000505401600360005060008a600160a060020a03168152602001908152602001600020600050600301600050819055506003600050600089600160a060020a03168152602001908152602001600020600050600d0160005060008860006002811015610002575080356001604860020a0319168252602092909252604081209160019090602002013568ffffffffffffffffff1916815260200190815260200160002060005054945042600360005060008a600160a060020a03168152602001908152602001600020600050600c0160005086815481101561000257906000526020600020900160005055600160a060020a0388166000908152600360205260409020600b0180548791908790811015610002579060005260206000209001600050557fa252d942976baedb7ae6bd1236f6ba594c1c322814225b482cf41c2ad18b30048833888a600050508a358b6001505060408051600160a060020a03958616815294909316602085810191909152848401929092526001604860020a03199081166060850152908b0135166080830152519081900360a00190a15b5050505050505050565b6127ac600460408051602081810183526000808352600160a060020a0333908116825260049092529290922054909190610100900460ff161515600114156128d75760408051808201825282918590600290839083908082843782019150505050506004600050600083600160a060020a0316815260200190815260200160002060005060030160005060008260006002811015610002579090602002015168ffffffffffffffffff1916815260200190815260200160002060005060008260016002811015610002579090602002015168ffffffffffffffffff1916815260200190815260200160002060005060000160009054906101000a900460ff161515600115151415612f37576004600050600033600160a060020a03168152602001908152602001600020600050600301600050600086600060028110156100025750506001604860020a0319873581168252602092835260408083206024359092168352908352805191819020880180548085028401850190925281835291928301828280156111d457602002820191906000526020600020908154600160a060020a03168152600191909101906020018083116111b5575b505050505093505050506128d9565b6101ab600435600160a060020a0333908116600090815260036020526040902054610100900460ff16151560011415611b475760406000206005018054830190555b505b50565b33600160a060020a0381166000908152600360205260408120546127f6929060ff161515600114156128c7575060409020600301546101d2565b6101ab600435602435600160a060020a03331660009081526003602052604090205460ff16151560011415612f3f57611b47565b6101ab600435600160a060020a0333908116600090815260036020526040902054610100900460ff16151560011415611b475750604060002060050155565b612798600435600160a060020a038116600090815260036020526040902054610100900460ff166128d9565b6040805160208181018352600080835233600160a060020a0381168252600390925292909220546127ac9290610100900460ff161515600114156128c7576040805160008290206007018054602081810284018101909452808352919290919083018282801561029557602002820191906000526020600020905b8154600160a060020a0316815260019190910190602001808311611ca0575b50505050509150506101d2565b6101ab600435600160a060020a0333908116600090815260036020526040902054610100900460ff16151560011415611b475750604060002060060155565b6127986004604435606435600160a060020a0333908116600090815260046020526040812054909190610100900460ff161515600114156130b35760408051808201825282918790600290839083908082843782019150505050506004600050600083600160a060020a0316815260200190815260200160002060005060030160005060008260006002811015610002579090602002015168ffffffffffffffffff1916815260200190815260200160002060005060008260016002811015610002579090602002015168ffffffffffffffffff1916815260200190815260200160002060005060000160009054906101000a900460ff161515600115151415156130b05760016004600050600033600160a060020a031681526020019081526020016000206000506003016000506000896000600281101561000257506001604860020a0319813581168084526020858152604080862060243590941686528382528520805460ff19168817815587018d90559084529390935288939090602002013568ffffffffffffffffff19168152602001908152602001600020600050600201600050819055506004600050600033600160a060020a0316815260200190815260200160002060005060020160005080548060010182818154818355818115116130bc576002028160020283600052602060002091820191016130bc9190612a3b565b6040805160206004803580820135601f81018490048402850184019095528484526101ab949193602493909291840191908190840183828082843750949650505050505050604080516101008181018352600080835283516020818101865282825284810191909152845180820186528281528486015284518082018652828152606085015284518082018652828152608085015260a0840182905260c0840182905260e08401829052600160a060020a03339081168352600490915293812054929390928392900460ff161515600114156128ea57604080832090518651839288926004918201928492829160208581019282918591839186918f91601f850104600302600f01f150905001915050908152602001604051809103902060005060070160009054906101000a900460ff1615156001151514156106f2576004600050600033600160a060020a0316815260200190815260200160002060005060040160005087604051808280519060200190808383829060006004602084601f0104600302600f01f150905001915050908152602001604051809103902060005061010060405190810160405290816000820160009054906101000a9004600160a060020a0316600160a060020a03168152602001600182016000508054600181600116156101000203166002900480601f0160208091040260200160405190810160405280929190818152602001828054600181600116156101000203166002900480156131425780601f1061311757610100808354040283529160200191613142565b6127f6600435602435604435600160a060020a0383166000908152600360205260408120548490610100900460ff161515600114156130b3575060408082206001604860020a03198086168452600d90910160209081528284209185168452529020546130b5565b6101ab602460048035828101929082013591813580830192908201359160443591606435908101910135600160a060020a0333908116600090815260046020526040902054610100900460ff16151560011415611933573386868080601f0160208091040260200160405190810160405280939291908181526020018383808284378201915050505050506004600050600083600160a060020a0316815260200190815260200160002060005060040160005081604051808280519060200190808383829060006004602084601f0104600302600f01f150905001915050908152602001604051809103902060005060070160009054906101000a900460ff161515600115151415156106ed57888414156106ed5760016004600050600033600160a060020a03168152602001908152602001600020600050600401600050898960405180838380828437820191505092505050908152602001604051809103902060005060070160006101000a81548160ff0219169083021790555089896004600050600033600160a060020a031681526020019081526020016000206000506004016000508a8a6040518083838082843782019150509250505090815260200160405180910390206000506003016000509190828054828255906000526020600020906002028101928215612a33579160400282015b82811115612a335781600281018482604082015b82811115613a63578154600160b860020a031916604860020a84350417825560209290920191600191909101906123cc565b6040805160206004803580820135601f810184900484028501840190955284845261280894919360249390929184019190819084018382808284375094965050505050505060408051602081810183526000808352600160a060020a0333908116825260049092529290922054909190610100900460ff161515600114156128d757604080516000918220855184938793600493840193859391928392602086810193919283928692849287929091601f850104600302600f01f150905001915050908152602001604051809103902060005060070160009054906101000a900460ff161515600115151415612f37576004600050600033600160a060020a0316815260200190815260200160002060005060040160005085604051808280519060200190808383829060006004602084601f0104600302600f01f1509050019150509081526020016040518091039020600050600301600050805480602002602001604051908101604052809291908181526020016000905b82821015613be95760008481526020902060408051808201918290529160028086029091019182845b8154604860020a028152600191909101906020018083116125a1575b505050505081526020019060010190612578565b6127f66004600160a060020a033390811660009081526004602052604081205490919060ff161515600114156128d75760408051808201825282918590600290839083908082843782019150505050506004600050600083600160a060020a0316815260200190815260200160002060005060030160005060008260006002811015610002579090602002015168ffffffffffffffffff1916815260200190815260200160002060005060008260016002811015610002579090602002015168ffffffffffffffffff1916815260200190815260200160002060005060000160009054906101000a900460ff161515600115151415612f37576004600050600033600160a060020a0316815260200190815260200160002060005060030160005060008660006002811015610002575050506001604860020a031986358116865260209182526040808720602435909216875291529093206003015492506128d9915050565b6101ab600435600160a060020a033390811660009081526003602052604090205460ff16151560011415611b475760406000908120600160a060020a033316909152600360205254610100900460ff1615158215151415613bf75750611b49565b604080519115158252519081900360200190f35b60405180806020018281038252838181518152602001915080519060200190602002808383829060006004602084601f0104600302600f01f1509050019250505060405180910390f35b60408051918252519081900360200190f35b60405180806020018281038252838181518152602001915080516000925b8184101561285257602084810284010151604080838184600060046015f1509050019260010192612826565b925050509250505060405180910390f35b600160a060020a033316600081815260046020908152604091829020805460ff191660011761ff001916610100179055815192835290517f586f0cb1785c450e25317677f006144dd3ae1ecc68ac0998e944dfe7a8f6a6289281900390910190a15b565b5090565b505050509150506101d2565b505b919050565b60028054600101905550505b5050505050565b600054600019018510612efd5760025460009550851415612f0c575b6002546000546000190190106128de5760006002556106f2565b50505060009283525060208220018054600160a060020a0319163317905580546003919081908890811015610002579060005260206000209001600090546101009190910a9004600160a060020a03168152602081019190915260400160002060080180546001810180835582818380158290116129da576002028160020283600052602060002091820191016129da9190612a3b565b50613b719291505b808211156128c757600081556001016129c6565b50505091909060005260206000209060020201600050600280820190828b9160200282015b82811115612a555782518254600160b860020a031916604860020a90910417825560209290920191600191909101906129ff565b50613a809291505b808211156128c75760008082556001820155600201612a3b565b50612a7b9291505b808211156128c7578054600160b860020a0319168155600101612a5d565b5050600080546003925081908890811015610002575050600080516020613c25833981519152870154600160a060020a03168152602091909152604090206009018054600181018083558281838015829011612aea57818360005260206000209182019101612aea91906129c6565b50505060009283525060208220604089015191015580546003919081908890811015610002575050600080516020613c25833981519152870154600160a060020a0316815260209190915260409020600a018054600181018083558281838015829011612b6a57818360005260206000209182019101612b6a91906129c6565b50505060009283525060208083209089015191015580546003919081908890811015610002575050600080516020613c25833981519152870154600160a060020a0316815260209190915260409020600c018054600181018083558281838015829011612bea57818360005260206000209182019101612bea91906129c6565b505050600092835250602082200181905580546003919081908890811015610002575050600080516020613c25833981519152870154600160a060020a0316815260209190915260409020600b018054600181018083558281838015829011612c6657818360005260206000209182019101612c6691906129c6565b5050506000928352506020822001819055805460019160039181908990811015610002578154600080516020613c25833981519152820154600160a060020a0316835260208590526040832060080154600019019550811015610002579060005260206000209001600090546101009190910a9004600160a060020a0316815260208101919091526040016000908120600d019089815080516001604860020a031916825260209290925260408120916001505060208a8101516001604860020a031916825291909152604080822092909255908701518154909160039181908990811015610002575050600080516020613c25833981519152880154600160a060020a0390811682526020838152604080842060050180549690960390955533909116825260048082528483208c516001604860020a03199081168552940182528483208c830151909416835292905291909120018054600181018083558281838015829011612dea57818360005260206000209182019101612dea91906129c6565b505050919090600052602060002090016000600080548990811015610002575050600080516020613c258339815191528801548254600160a060020a031916600160a060020a0391821617909255339091168082526004602081815260408085208d516001604860020a031990811687526003919091018084528287208f8501519092168752908352908520830154938552919052600019919091019250908981505089516001604860020a03199081168252602092835260408083208c850151909216835292529081208154600591909101919081908990811015610002575050600080516020613c25833981519152880154600160a060020a03168152602091909152604090205560019350612f19565b600254851415612f115761290d565b612f19565b600194909401935b610b31565b50505b505b92915050565b505050509350505050612f23565b505050919050565b600160a060020a0333166000908152600360205260408120805460ff1916600190811761ff00191661010017825582548282015560058201859055600690910183905581549081018083558281838015829011612faf57818360005260206000209182019101612faf91906129c6565b50505060009283525060208083209091018054600160a060020a03191633908117909155600160a060020a03168083526003825260408051938190208054600582015460019290920154938652610100900460ff16151593850193909352838101919091526060830191909152517f4ad6212e5ea2a69c78caeb4108c3f8d7c222a77e077914c2c273bc75b9547ecd9181900360800190a15050565b5050507f99ea32d811e87cdaea82dde6b92f190194fc2dfe7ee7acdcd96dca50df4b961b338888886040518085600160a060020a0316815260200184600260200280828437820191505083815260200182815260200194505050505060405180910390a15b50505b505b9392505050565b505050600092835260209092206002918202019081018982604082015b8281111561310b578154600160b860020a031916604860020a84350417825560209290920191600191909101906130d9565b5061304b929150612a5d565b820191906000526020600020905b81548152906001019060200180831161312557829003601f168201915b50505050508152602001600282016000508054806020026020016040519081016040528092919081815260200182805480156131a057602002820191906000526020600020905b816000505481526020019060010190808311613189575b5050505050815260200160038201600050805480602002602001604051908101604052809291908181526020016000905b8282101561322a5760008481526020902060408051808201918290529160028086029091019182845b8154604860020a028152600191909101906020018083116131fa575b5050505050815260200190600101906131d1565b5050505081526020016004820160005080548060200260200160405190810160405280929190818152602001828054801561328f57602002820191906000526020600020905b8154600160a060020a0316815260019190910190602001808311613270575b505050918352505060068201546020820152600782015460ff1615156040820152600890910154606091909101526002549096509450600093505b85604001515184101561290d57600360005060006000600050878154811015610002576000918252602080832090910154600160a060020a031683528201929092526040908101909120600501549087015180518690811015610002579060200190602002015110801561337b575060008054869081101561000257906000526020600020900160009054906101000a9004600160a060020a0316600160a060020a031633600160a060020a031614155b1561343b57600360005060006000600050878154811015610002576000918252602080832090910154600160a060020a031683528201929092526040019020600701805460018101808355828183801582901161345c5760008381526020902061345c9181019083016129c6565b5050509190906000526020600020900160006000805489908110156100025750508052600080516020613c258339815191528701548154600160a060020a031916600160a060020a0391909116179055505b600054600195909501948510613a5457600094505b600193909301926132ca565b50505060009283525060208220018054600160a060020a0319163317905580546003919081908890811015610002579060005260206000209001600090546101009190910a9004600160a060020a03168152602081019190915260400160002060080180546001810180835582818380158290116134f3576002028160020283600052602060002091820191016134f39190612a3b565b5050509190906000526020600020906002020160008860600151878151811015610002576020908102909101015160028301915082604082015b828111156135615782518254600160b860020a031916604860020a909104178255602092909201916001919091019061352d565b5061356d929150612a5d565b5050600080546003925081908890811015610002575050600080516020613c25833981519152870154600160a060020a031681526020919091526040902060090180546001810180835582818380158290116135dc578183600052602060002091820191016135dc91906129c6565b50505091909060005260206000209001600088604001518781518110156100025750602088810291909101015190915580546003925081908890811015610002575050600080516020613c25833981519152870154600160a060020a0316815260209190915260409020600a0180546001810180835582818380158290116136775781836000526020600020918201910161367791906129c6565b5050506000928352506020822060a089015191015580546003919081908890811015610002575050600080516020613c25833981519152870154600160a060020a0316815260209190915260409020600c0180546001810180835582818380158290116136f7578183600052602060002091820191016136f791906129c6565b505050600092835250602082200181905580546003919081908890811015610002575050600080516020613c25833981519152870154600160a060020a0316815260209190915260409020600b0180546001810180835582818380158290116137735781836000526020600020918201910161377391906129c6565b5050506000928352506020822001819055805460019160039181908990811015610002578154600080516020613c25833981519152820154600160a060020a031683526020859052604083206008015460001901955081101561000257906000526020600020900160009054906101000a9004600160a060020a0316600160a060020a03168152602001908152602001600020600050600d0160005060008860600151878151811015610002576020818102909201820151516001604860020a03191683529290526040812060608a0151805191935090889081101561000257506020888102919091018101518101516001604860020a03191682529190915260409081902091909155860151805185908110156100025790602001906020020151600360005060006000600050888154811015610002575050600080516020613c25833981519152880154600160a060020a03908116825260208381526040808420600501805496909603909555339091168252600480825284832094518c51958201958d95919485948781019492938493879385938893919291601f86019190910402600f01f150905001915050908152602001604051809103902060005060040160005080548060010182818154818355818115116139685781836000526020600020918201910161396891906129c6565b505050919090600052602060002090016000600080548990811015610002575050600080516020613c258339815191528801548254600160a060020a03918216600160a060020a0319919091161790925533909116815260046020818152604080519084208c5190840195508c94919384938681019383928692849287929091601f850104600302600f01f1509050019150509081526020016040518091039020600050600501600050600085815260200190815260200160002060005080548060010182818154818355818115116133e9578183600052602060002091820191016133e991906129c6565b6002548514156134505761290d565b50613a6f929150612a5d565b5050916040019190600201906123b8565b5050856004600050600033600160a060020a0316815260200190815260200160002060005060040160005089896040518083838082843782019150509250505090815260200160405180910390206000506006016000508190555084846004600050600033600160a060020a031681526020019081526020016000206000506004016000508a8a60405180838380828437820191505092505050908152602001604051809103902060005060020160005091908280548282559060005260206000209081019282156129be579160200282015b828111156129be578235826000505591602001919060010190613b53565b50507fcff57d64cf213ba01190b9500909d8d5cfe400fa0d1156c7c9a91f370f2c147f338989896040518085600160a060020a0316815260200180602001838152602001828103825285858281815260200192508082843782019150509550505050505060405180910390a150505050505050505050565b5050505093505050506128d9565b600160a060020a03331660009081526003602052604090208054610100840261ff001991909116179055505056290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563",
    "updated_at": 1476871920702
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
