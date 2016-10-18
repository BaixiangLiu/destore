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
        "name": "combineHashes",
        "outputs": [
          {
            "name": "",
            "type": "bytes"
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
    "unlinked_binary": "0x606060405260018054600160a060020a031916331790556000600255612958806100296000396000f36060604052361561015e5760e060020a600035046314a32cd381146101605780631a13397e1461018857806320fd9584146101b6578063223badd81461025557806325ce4190146102f35780634377fe751461067757806346efe67d14610682578063519bcd96146106a65780635228671d1461074457806361649d1c1461080e57806380776079146109e157806384e01cb414610bb6578063880d216114610c9e5780638a28991214610e5d5780638af0012b14610f1a5780638b22b9231461106d5780638ba45f15146110ac5780638c14d1e6146111195780638e7e83be146111b757806399587b18146111f15780639ac4be9314611238578063a8914ab614611272578063b695ff2f146112b1578063ba29e942146112dd578063bd90de2114611384578063e7978ba2146113b5578063ea10043514611601578063eb5e5fa61461166b578063f8d8a343146118ab578063feb5d02c14611a7f575b005b611ae0600160a060020a033316600090815260046020526040902054610100900460ff165b90565b611ae0600160a060020a03331660009081526004602052604081205460ff16151560011415611c1957610185565b6040805160208181018352600080835233600160a060020a038116825260039092529290922054611af49290610100900460ff16151560011415611c4e57604080516000829020600b018054602081810284018101909452808352919290919083018282801561024857602002820191906000526020600020905b816000505481526020019060010190808311610231575b5050505050915050610185565b6040805160208181018352600080835233600160a060020a038116825260039092529290922054611af49290610100900460ff16151560011415611c4e57604080516000829020600c01805460208181028401810190945280835291929091908301828280156102485760200282019190600052602060002090816000505481526020019060010190808311610231575b5050505050915050610185565b604080516020606435600481810135601f810184900484028501840190955284845261015e94813594602480359560443595608494920191908190840183828082843750949650505050505050600160a060020a03339081166000908152600460205260408120549091829160ff1615156001141561066e57604080832090518551839287926002919091019183919081906020848101919081908490829085908e90600490601f850104600302600f01f150905001915050908152602001604051809103902060005060070160009054906101000a900460ff16151560011515141561066b57600160a060020a038916845260036020526040842054899060ff1615156001141561066957426004600050600033600160a060020a0316815260200190815260200160002060005060020160005088604051808280519060200190808383829060006004602084601f0104600302600f01f15090500191505090815260200160405180910390206000506008016000508190555034955034600360005060008c600160a060020a031681526020019081526020016000206000506002016000505401600360005060008c600160a060020a031681526020019081526020016000206000506002016000508190555085600360005060008c600160a060020a031681526020019081526020016000206000506003016000505401600360005060008c600160a060020a0316815260200190815260200160002060005060030160005081905550600360005060008b600160a060020a03168152602001908152602001600020600050600d0160005060008a68ffffffffffffffffff1916815260200190815260200160002060005060008968ffffffffffffffffff1916815260200190815260200160002060005054945042600360005060008c600160a060020a03168152602001908152602001600020600050600c0160005086815481101561000257906000526020600020900160005055600160a060020a038a166000908152600360205260409020600b01805487919087908110156100025790600052602060002090016000505560408051600160a060020a038c811682523316602082015280820188905268ffffffffffffffffff19808c1660608301528a16608082015290517fa252d942976baedb7ae6bd1236f6ba594c1c322814225b482cf41c2ad18b30049181900360a00190a15b505b50505b50505050505050565b611b3e600254610185565b611ae0600160a060020a03331660009081526003602052604090205460ff16610185565b6040805160208181018352600080835233600160a060020a038116825260039092529290922054611af49290610100900460ff16151560011415611c4e57604080516000829020600801805460208181028401810190945280835291929091908301828280156102485760200282019190600052602060002090816000505481526020019060010190808311610231575b5050505050915050610185565b33600160a060020a038116600090815260036020526040812054611b3e92600435929160ff16151560011415611c525760408220600201548390106107eb5760408083206002018054859003905551600160a060020a038216908390859082818181858883f1935050505015156107eb57826003600050600033600160a060020a031681526020019081526020016000206000506002016000828282505401925050819055505b5050600160a060020a033316600090815260036020526040902060020154611c54565b60408051602060248035600481810135601f8101859004850286018501909652858552611b5095813595919460449492939092019181908401838280828437505060408051602081810183526000808352600160a060020a038c168152999052972054949695508794610100900460ff161515600114159350611c5c925050505760408051600091822085518493879360029390930192849290918291602085810192829185918391869190600490601f850104600302600f01f150905001915050908152602001604051809103902060005060070160009054906101000a900460ff161515600115151415611c59576004600050600087600160a060020a0316815260200190815260200160002060005060020160005085604051808280519060200190808383829060006004602084601f0104600302600f01f1509050019150509081526020016040518091039020600050600301600050805480602002602001604051908101604052809291908181526020016000905b82821015611c645760008481526020902060408051808201918290529160028086029091019182845b8154604860020a028152600191909101906020018083116109b1575b505050505081526020019060010190610988565b6040805160206004803580820135601f8101849004840285018401909552848452611af4949193602493909291840191908190840183828082843750949650509335935050505060408051602081810183526000808352600160a060020a0333908116825260049092529290922054909190610100900460ff16151560011415611c5c5760408051600091822086518493889360029390930192849290918291602085810192829185918391869190600490601f850104600302600f01f150905001915050908152602001604051809103902060005060070160009054906101000a900460ff161515600115151415611c59576004600050600033600160a060020a0316815260200190815260200160002060005060020160005086604051808280519060200190808383829060006004602084601f0104600302600f01f15090500191505090815260200160405180910390206000506005016000506000868152602001908152602001600020600050805480602002602001604051908101604052809291908181526020018280548015610ba757602002820191906000526020600020905b8154600160a060020a0316815260019190910190602001808311610b88575b50505050509350505050611c5e565b611bab600435602435604080516020818101835260008083528351918201845280825292519192909181908190602e90805910610bf05750595b908082528060200260200182016040528015610c07575b5093506000925060179150600090505b6017811015611c725786816017811015610002571a60f860020a028484806001019550815181101561000257906020010190600160f860020a031916908160001a90535085816017811015610002571a60f860020a028483806001019450815181101561000257906020010190600160f860020a031916908160001a905350600101610c17565b6040805160206004803580820135601f8101849004840285018401909552848452611af494919360249390929184019190819084018382808284375094965050505050505060408051602081810183526000808352600160a060020a0333908116825260049092529290922054909190610100900460ff16151560011415611c525760408051600091822085518493879360029390930192849290918291602085810192829185918391869190600490601f850104600302600f01f150905001915050908152602001604051809103902060005060070160009054906101000a900460ff161515600115151415611c7d576004600050600033600160a060020a0316815260200190815260200160002060005060020160005085604051808280519060200190808383829060006004602084601f0104600302600f01f1509050019150509081526020016040518091039020600050600401600050805480602002602001604051908101604052809291908181526020018280548015610e4e57602002820191906000526020600020905b8154600160a060020a0316815260019190910190602001808311610e2f575b50505050509350505050611c54565b6040805160208181018352600080835233600160a060020a038116825260039092529290922054611b509290610100900460ff16151560011415611c4e57604080516000828120600701805460208181028501810190955280845292939092919084015b82821015611c855760008481526020902060408051808201918290529160028086029091019182845b8154604860020a02815260019190910190602001808311610eea575b505050505081526020019060010190610ec1565b6040805160206004803580820135601f8101849004840285018401909552848452611b3e949193602493909291840191908190840183828082843750949650505050505050600160a060020a033390811660009081526004602052604081205490919060ff16151560011415611c5257604080832090518451839286926002919091019183919081906020848101919081908490829085908e90600490601f850104600302600f01f150905001915050908152602001604051809103902060005060070160009054906101000a900460ff161515600115151415611c7d576004600050600033600160a060020a0316815260200190815260200160002060005060020160005085604051808280519060200190808383829060006004602084601f0104600302600f01f1509050019150509081526020016040518091039020600050600801600050549350505050611c54565b33600160a060020a038116600090815260036020526040812054611b3e9290610100900460ff16151560011415611c4e57506040902060050154610185565b604080516020818101835260008083528351815480840282018401909552848152611af494909283018282801561110d57602002820191906000526020600020905b8154600160a060020a03168152600191909101906020018083116110ee575b50505050509050610185565b6040805160208181018352600080835233600160a060020a038116825260039092529290922054611af49290610100900460ff16151560011415611c4e57604080516000829020600901805460208181028401810190945280835291929091908301828280156102485760200282019190600052602060002090816000505481526020019060010190808311610231575b5050505050915050610185565b33600160a060020a038116600090815260036020526040812054611b3e929060ff16151560011415611c4e57506040902060020154610185565b61015e600435600160a060020a0333908116600090815260036020526040902054610100900460ff161515600114156112335760406000206005018054830190555b505b50565b33600160a060020a038116600090815260036020526040812054611b3e929060ff16151560011415611c4e57506040902060030154610185565b61015e600435600160a060020a0333908116600090815260036020526040902054610100900460ff161515600114156112335750604060002060050155565b611ae0600435600160a060020a038116600090815260036020526040902054610100900460ff16611c54565b6040805160208181018352600080835233600160a060020a038116825260039092529290922054611af49290610100900460ff16151560011415611c4e576040805160008290206006018054602081810284018101909452808352919290919083018282801561024857602002820191906000526020600020905b8154600160a060020a0316815260019190910190602001808311611358575b5050505050915050610185565b611ae0600435600160a060020a03331660009081526003602052604081205460ff16151560011415611c9157611c54565b6040805160206004803580820135601f810184900484028501840190955284845261015e949193602493909291840191908190840183828082843750949650505050505050604080516101008181018352600080835283516020818101865282825284810191909152845180820186528281528486015284518082018652828152606085015284518082018652828152608085015260a0840182905260c0840182905260e08401829052600160a060020a03339081168352600490915293812054929390928392900460ff16151560011415611dc257604080832090518651839288926002919091019183919081906020848101919081908490829085908e90600490601f850104600302600f01f150905001915050908152602001604051809103902060005060070160009054906101000a900460ff16151560011515141561066e576004600050600033600160a060020a0316815260200190815260200160002060005060020160005087604051808280519060200190808383829060006004602084601f0104600302600f01f150905001915050908152602001604051809103902060005061010060405190810160405290816000820160009054906101000a9004600160a060020a0316600160a060020a03168152602001600182016000508054600181600116156101000203166002900480601f016020809104026020016040519081016040528092919081815260200182805460018160011615610100020316600290048015611df45780601f10611dc957610100808354040283529160200191611df4565b611b3e600435602435604435600160a060020a0383166000908152600360205260408120548490610100900460ff161515600114156127715750604080822068ffffffffffffffffff198086168452600d9091016020908152828420918516845252902054612773565b611ae0602460048035828101929082013591813580830192908201359160443591606435908101910135600160a060020a0333908116600090815260046020526040812054909190610100900460ff161515600114156127ea573387878080601f0160208091040260200160405190810160405280939291908181526020018383808284378201915050505050506004600050600083600160a060020a0316815260200190815260200160002060005060020160005081604051808280519060200190808383829060006004602084601f0104600302600f01f150905001915050908152602001604051809103902060005060070160009054906101000a900460ff1615156000151514156127e757898514156127e75760016004600050600033600160a060020a031681526020019081526020016000206000506002016000508a8a60405180838380828437820191505092505050908152602001604051809103902060005060070160006101000a81548160ff021916908302179055508a8a6004600050600033600160a060020a031681526020019081526020016000206000506002016000508b8b6040518083838082843782019150509250505090815260200160405180910390206000506003016000509190828054828255906000526020600020906002028101928215612238579160400282015b828111156122385781600281018482604082015b828111156127f6578154600160b860020a031916604860020a8435041782556020929092019160019190910190611879565b6040805160206004803580820135601f8101849004840285018401909552848452611b5094919360249390929184019190819084018382808284375094965050505050505060408051602081810183526000808352600160a060020a0333908116825260049092529290922054909190610100900460ff16151560011415611c525760408051600091822085518493879360029390930192849290918291602085810192829185918391869190600490601f850104600302600f01f150905001915050908152602001604051809103902060005060070160009054906101000a900460ff161515600115151415611c7d576004600050600033600160a060020a0316815260200190815260200160002060005060020160005085604051808280519060200190808383829060006004602084601f0104600302600f01f1509050019150509081526020016040518091039020600050600301600050805480602002602001604051908101604052809291908181526020016000905b828210156128fc5760008481526020902060408051808201918290529160028086029091019182845b8154604860020a02815260019190910190602001808311611a4f575b505050505081526020019060010190611a26565b61015e600435600160a060020a033390811660009081526003602052604090205460ff161515600114156112335760406000908120600160a060020a033316909152600360205254610100900460ff161515821515141561290a5750611235565b604080519115158252519081900360200190f35b60405180806020018281038252838181518152602001915080519060200190602002808383829060006004602084601f0104600302600f01f1509050019250505060405180910390f35b60408051918252519081900360200190f35b60405180806020018281038252838181518152602001915080516000925b81841015611b9a57602084810284010151604080838184600060046015f1509050019260010192611b6e565b925050509250505060405180910390f35b60405180806020018281038252838181518152602001915080519060200190808383829060006004602084601f0104600302600f01f150905090810190601f168015611c0b5780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b50600160a060020a0333166000908152600460205260409020805460ff1916600190811761ff00191661010017909155610185565b5090565b505b919050565b50505b505b92915050565b505050509350505050611c5e565b509195945050505050565b505050919050565b50505050915050610185565b600160a060020a0333166000908152600360205260408120805460ff1916600190811761ff001916610100178255825482820155600590910184905581549081018083558281838015829011611cfa57818360005260206000209182019101611cfa9190611da2565b50505060009283525060208083209091018054600160a060020a03191633908117909155600160a060020a03168083526003825260408051938190208054600582015460019290920154938652610100900460ff16151593850193909352838101919091526060830191909152517f4ad6212e5ea2a69c78caeb4108c3f8d7c222a77e077914c2c273bc75b9547ecd9181900360800190a1506001611c54565b5061277a9291505b80821115611c4e5760008155600101611da2565b60028054600101905550505b5050505050565b820191906000526020600020905b815481529060010190602001808311611dd757829003601f168201915b5050505050815260200160028201600050805480602002602001604051908101604052809291908181526020018280548015611e5257602002820191906000526020600020905b816000505481526020019060010190808311611e3b575b5050505050815260200160038201600050805480602002602001604051908101604052809291908181526020016000905b82821015611edc5760008481526020902060408051808201918290529160028086029091019182845b8154604860020a02815260019190910190602001808311611eac575b505050505081526020019060010190611e83565b50505050815260200160048201600050805480602002602001604051908101604052809291908181526020018280548015611f4157602002820191906000526020600020905b8154600160a060020a0316815260019190910190602001808311611f22575b505050918352505060068201546020820152600782015460ff1615156040820152600890910154606091909101526002549096509450600093505b8560400151518410156120a657600360005060006000600050878154811015610002576000918252602080832090910154600160a060020a031683528201929092526040908101909120600501549087015180518690811015610002579060200190602002015110801561202d575060008054869081101561000257906000526020600020900160009054906101000a9004600160a060020a0316600160a060020a031633600160a060020a031614155b1561211257600360005060006000600050878154811015610002576000918252602080832090910154600160a060020a031683528201929092526040019020600601805460018101808355828183801582901161213357600083815260209020612133918101908301611da2565b600254851415612127575b600254600054600019019010611db657600060025561066e565b50505091909060005260206000209001600060008054899081101561000257505080526000805160206129388339815191528701548154600160a060020a031916600160a060020a0391909116179055505b60005460019590950194851061209b57600094505b60019390930192611f7c565b50505060009283525060208220018054600160a060020a0319163317905580546003919081908890811015610002579060005260206000209001600090546101009190910a9004600160a060020a03168152602081019190915260400160002060070180546001810180835582818380158290116121ca576002028160020283600052602060002091820191016121ca9190612240565b5050509190906000526020600020906002020160008860600151878151811015610002576020908102909101015160028301915082604082015b8281111561225a5782518254600160b860020a031916604860020a9091041782556020929092019160019190910190612204565b506128139291505b80821115611c4e5760008082556001820155600201612240565b506122809291505b80821115611c4e578054600160b860020a0319168155600101612262565b5050600080546003925081908890811015610002575050600080516020612938833981519152870154600160a060020a031681526020919091526040902060080180546001810180835582818380158290116122ef578183600052602060002091820191016122ef9190611da2565b50505091909060005260206000209001600088604001518781518110156100025750602088810291909101015190915580546003925081908890811015610002575050600080516020612938833981519152870154600160a060020a0316815260209190915260409020600901805460018101808355828183801582901161238a5781836000526020600020918201910161238a9190611da2565b5050506000928352506020822060a089015191015580546003919081908890811015610002575050600080516020612938833981519152870154600160a060020a0316815260209190915260409020600c01805460018101808355828183801582901161240a5781836000526020600020918201910161240a9190611da2565b505050600092835250602082200181905580546003919081908890811015610002575050600080516020612938833981519152870154600160a060020a0316815260209190915260409020600b018054600181018083558281838015829011612486578183600052602060002091820191016124869190611da2565b5050506000928352506020822001819055805460019160039181908990811015610002578154600080516020612938833981519152820154600160a060020a031683526020859052604083206007015460001901955081101561000257906000526020600020900160009054906101000a9004600160a060020a0316600160a060020a03168152602001908152602001600020600050600d01600050600088606001518781518110156100025760208181029092018201515168ffffffffffffffffff191683529290526040812060608a01518051919350908890811015610002575060208881029190910181015181015168ffffffffffffffffff191682529190915260409081902091909155860151805185908110156100025790602001906020020151600360005060006000600050888154811015610002575050600080516020612938833981519152880154600160a060020a03908116825260208381526040808420600501805496909603909555339091168252600480825284832094518c51600296909601958d95919485948781019492938493879385938893919291601f86019190910402600f01f15090500191505090815260200160405180910390206000506004016000508054806001018281815481835581811511612682578183600052602060002091820191016126829190611da2565b5050509190906000526020600020900160006000805489908110156100025750506000805160206129388339815191528801548254600160a060020a031916600160a060020a039182161790925533909116815260046020818152604080842090518c51600290920195508c9490938493868101939283928692849287929091600f601f86019190910460030201f1509050019150509081526020016040518091039020600050600501600050600085815260200190815260200160002060005080548060010182818154818355818115116120c0578183600052602060002091820191016120c09190611da2565b505b9392505050565b50507fcff57d64cf213ba01190b9500909d8d5cfe400fa0d1156c7c9a91f370f2c147f338a8a8a6040518085600160a060020a0316815260200180602001838152602001828103825285858281815260200192508082843782019150509550505050505060405180910390a15b50505b50979650505050505050565b50612802929150612262565b505091604001919060020190611865565b5050600160a060020a0333166000908152600460205260409081902090518891600201908b908b908083838082843782019150509250505090815260200160405180910390206000506006016000508190555085856004600050600033600160a060020a031681526020019081526020016000206000506002016000508b8b6040518083838082843782019150509250505090815260200160405180910390206000506002016000509190828054828255906000526020600020908101928215611d9a579160200282015b82811115611d9a5782358260005055916020019190600101906128de565b505050509350505050611c54565b600160a060020a03331660009081526003602052604090208054610100840261ff001991909116179055505056290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563",
    "updated_at": 1476834237466
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
