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
    "unlinked_binary": "0x606060405260018054600160a060020a0319163317905560006002556127dd806100296000396000f36060604052361561015e5760e060020a600035046314a32cd381146101605780631a13397e1461018857806320fd9584146101b6578063223badd81461025557806325ce4190146102f35780634377fe75146105d357806346efe67d146105de578063519bcd96146106025780635228671d146106a057806361649d1c1461076a578063807760791461093d57806384e01cb414610b12578063880d216114610bfa5780638a28991214610db95780638af0012b14610e765780638b22b92314610fc95780638ba45f15146110085780638c14d1e6146110755780638e7e83be1461111357806399587b181461114d5780639ac4be9314611194578063a8914ab6146111ce578063b695ff2f1461120d578063ba29e94214611239578063bd90de21146112e0578063e7978ba214611311578063ea100435146115c0578063eb5e5fa61461162a578063f8d8a3431461186a578063feb5d02c14611a3e575b005b611a9f600160a060020a033316600090815260046020526040902054610100900460ff165b90565b611a9f600160a060020a03331660009081526004602052604081205460ff16151560011415611bd857610185565b6040805160208181018352600080835233600160a060020a038116825260039092529290922054611ab39290610100900460ff16151560011415611c0d576040805160008290206009018054602081810284018101909452808352919290919083018282801561024857602002820191906000526020600020905b816000505481526020019060010190808311610231575b5050505050915050610185565b6040805160208181018352600080835233600160a060020a038116825260039092529290922054611ab39290610100900460ff16151560011415611c0d57604080516000829020600a01805460208181028401810190945280835291929091908301828280156102485760200282019190600052602060002090816000505481526020019060010190808311610231575b5050505050915050610185565b604080516020606435600481810135601f810184900484028501840190955284845261015e94813594602480359560443595608494920191908190840183828082843750949650505050505050600160a060020a03339081166000908152600460205260408120549091829160ff161515600114156105ca57604080832090518551839287926002919091019183919081906020848101919081908490829085908e90600490601f850104600302600f01f150905001915050908152602001604051809103902060005060000160009054906101000a900460ff1615156001151514156105c757600160a060020a038916845260036020526040842054899060ff161515600114156105c557349550600360005060008b600160a060020a03168152602001908152602001600020600050600b0160005060008a68ffffffffffffffffff1916815260200190815260200160002060005060008968ffffffffffffffffff19168152602001908152602001600020600050549450426004600050600033600160a060020a0316815260200190815260200160002060005060020160005088604051808280519060200190808383829060006004602084601f0104600302600f01f15090500191505090815260200160405180910390206000506002016000508190555042600360005060008c600160a060020a03168152602001908152602001600020600050600a0160005086815481101561000257906000526020600020900160005055600160a060020a038a16600090815260036020526040902060028101805434019055600901805487919087908110156100025790600052602060002090016000505560408051600160a060020a038c811682523316602082015280820188905268ffffffffffffffffff19808c1660608301528a16608082015290517fa252d942976baedb7ae6bd1236f6ba594c1c322814225b482cf41c2ad18b30049181900360a00190a15b505b50505b50505050505050565b611afd600254610185565b611a9f600160a060020a03331660009081526003602052604090205460ff16610185565b6040805160208181018352600080835233600160a060020a038116825260039092529290922054611ab39290610100900460ff16151560011415611c0d57604080516000829020600701805460208181028401810190945280835291929091908301828280156102485760200282019190600052602060002090816000505481526020019060010190808311610231575b5050505050915050610185565b33600160a060020a038116600090815260036020526040812054611afd92600435929160ff16151560011415611c115760408220600201548390106107475760408083206002018054859003905551600160a060020a038216908390859082818181858883f19350505050151561074757826003600050600033600160a060020a031681526020019081526020016000206000506002016000828282505401925050819055505b5050600160a060020a033316600090815260036020526040902060020154611c13565b60408051602060248035600481810135601f8101859004850286018501909652858552611b0f95813595919460449492939092019181908401838280828437505060408051602081810183526000808352600160a060020a038c168152999052972054949695508794610100900460ff161515600114159350611c1b925050505760408051600091822085518493879360029390930192849290918291602085810192829185918391869190600490601f850104600302600f01f150905001915050908152602001604051809103902060005060000160009054906101000a900460ff161515600115151415611c18576004600050600087600160a060020a0316815260200190815260200160002060005060020160005085604051808280519060200190808383829060006004602084601f0104600302600f01f1509050019150509081526020016040518091039020600050600401600050805480602002602001604051908101604052809291908181526020016000905b82821015611c235760008481526020902060408051808201918290529160028086029091019182845b8154604860020a0281526001919091019060200180831161090d575b5050505050815260200190600101906108e4565b6040805160206004803580820135601f8101849004840285018401909552848452611ab3949193602493909291840191908190840183828082843750949650509335935050505060408051602081810183526000808352600160a060020a0333908116825260049092529290922054909190610100900460ff16151560011415611c1b5760408051600091822086518493889360029390930192849290918291602085810192829185918391869190600490601f850104600302600f01f150905001915050908152602001604051809103902060005060000160009054906101000a900460ff161515600115151415611c18576004600050600033600160a060020a0316815260200190815260200160002060005060020160005086604051808280519060200190808383829060006004602084601f0104600302600f01f15090500191505090815260200160405180910390206000506006016000506000868152602001908152602001600020600050805480602002602001604051908101604052809291908181526020018280548015610b0357602002820191906000526020600020905b8154600160a060020a0316815260019190910190602001808311610ae4575b50505050509350505050611c1d565b611b6a600435602435604080516020818101835260008083528351918201845280825292519192909181908190602e90805910610b4c5750595b908082528060200260200182016040528015610b63575b5093506000925060179150600090505b6017811015611c315786816017811015610002571a60f860020a028484806001019550815181101561000257906020010190600160f860020a031916908160001a90535085816017811015610002571a60f860020a028483806001019450815181101561000257906020010190600160f860020a031916908160001a905350600101610b73565b6040805160206004803580820135601f8101849004840285018401909552848452611ab394919360249390929184019190819084018382808284375094965050505050505060408051602081810183526000808352600160a060020a0333908116825260049092529290922054909190610100900460ff16151560011415611c115760408051600091822085518493879360029390930192849290918291602085810192829185918391869190600490601f850104600302600f01f150905001915050908152602001604051809103902060005060000160009054906101000a900460ff161515600115151415611c3c576004600050600033600160a060020a0316815260200190815260200160002060005060020160005085604051808280519060200190808383829060006004602084601f0104600302600f01f1509050019150509081526020016040518091039020600050600501600050805480602002602001604051908101604052809291908181526020018280548015610daa57602002820191906000526020600020905b8154600160a060020a0316815260019190910190602001808311610d8b575b50505050509350505050611c13565b6040805160208181018352600080835233600160a060020a038116825260039092529290922054611b0f9290610100900460ff16151560011415611c0d57604080516000828120600601805460208181028501810190955280845292939092919084015b82821015611c445760008481526020902060408051808201918290529160028086029091019182845b8154604860020a02815260019190910190602001808311610e46575b505050505081526020019060010190610e1d565b6040805160206004803580820135601f8101849004840285018401909552848452611afd949193602493909291840191908190840183828082843750949650505050505050600160a060020a033390811660009081526004602052604081205490919060ff16151560011415611c1157604080832090518451839286926002919091019183919081906020848101919081908490829085908e90600490601f850104600302600f01f150905001915050908152602001604051809103902060005060000160009054906101000a900460ff161515600115151415611c3c576004600050600033600160a060020a0316815260200190815260200160002060005060020160005085604051808280519060200190808383829060006004602084601f0104600302600f01f1509050019150509081526020016040518091039020600050600201600050549350505050611c13565b33600160a060020a038116600090815260036020526040812054611afd9290610100900460ff16151560011415611c0d57506040902060040154610185565b604080516020818101835260008083528351815480840282018401909552848152611ab394909283018282801561106957602002820191906000526020600020905b8154600160a060020a031681526001919091019060200180831161104a575b50505050509050610185565b6040805160208181018352600080835233600160a060020a038116825260039092529290922054611ab39290610100900460ff16151560011415611c0d57604080516000829020600801805460208181028401810190945280835291929091908301828280156102485760200282019190600052602060002090816000505481526020019060010190808311610231575b5050505050915050610185565b33600160a060020a038116600090815260036020526040812054611afd929060ff16151560011415611c0d57506040902060020154610185565b61015e600435600160a060020a0333908116600090815260036020526040902054610100900460ff1615156001141561118f5760406000206004018054830190555b505b50565b33600160a060020a038116600090815260036020526040812054611afd929060ff16151560011415611c0d57506040902060030154610185565b61015e600435600160a060020a0333908116600090815260036020526040902054610100900460ff1615156001141561118f5750604060002060040155565b611a9f600435600160a060020a038116600090815260036020526040902054610100900460ff16611c13565b6040805160208181018352600080835233600160a060020a038116825260039092529290922054611ab39290610100900460ff16151560011415611c0d576040805160008290206005018054602081810284018101909452808352919290919083018282801561024857602002820191906000526020600020905b8154600160a060020a03168152600191909101906020018083116112b4575b5050505050915050610185565b611a9f600435600160a060020a03331660009081526003602052604081205460ff16151560011415611c5057611c13565b6040805160206004803580820135601f810184900484028501840190955284845261015e9491936024939092918401919081908401838280828437509496505050505050506040805160c081018252600080825260208281018290528284018290528351808201855282815260608401528351808201855282815260808401528351808201855282815260a0840152600160a060020a0333908116835260049091529281205491929091829190610100900460ff16151560011415611d8257604080832090518651839288926002919091019183919081906020848101919081908490829085908e90600490601f850104600302600f01f150905001915050908152602001604051809103902060005060000160009054906101000a900460ff1615156001151514156105ca576004600050600033600160a060020a0316815260200190815260200160002060005060020160005087604051808280519060200190808383829060006004602084601f0104600302600f01f150905001915050908152602001604051809103902060005060c060405190810160405290816000820160009054906101000a900460ff161515815260200160018201600050548152602001600282016000505481526020016003820160005080548060200260200160405190810160405280929190818152602001828054801561153657602002820191906000526020600020905b81600050548152602001906001019080831161151f575b5050505050815260200160048201600050805480602002602001604051908101604052809291908181526020016000905b82821015611d895760008481526020902060408051808201918290529160028086029091019182845b8154604860020a02815260019190910190602001808311611590575b505050505081526020019060010190611567565b611afd600435602435604435600160a060020a0383166000908152600360205260408120548490610100900460ff161515600114156125f65750604080822068ffffffffffffffffff198086168452600b90910160209081528284209185168452529020546125f8565b611a9f602460048035828101929082013591813580830192908201359160443591606435908101910135600160a060020a0333908116600090815260046020526040812054909190610100900460ff1615156001141561266f573387878080601f0160208091040260200160405190810160405280939291908181526020018383808284378201915050505050506004600050600083600160a060020a0316815260200190815260200160002060005060020160005081604051808280519060200190808383829060006004602084601f0104600302600f01f150905001915050908152602001604051809103902060005060000160009054906101000a900460ff16151560001515141561266c578985141561266c5760016004600050600033600160a060020a031681526020019081526020016000206000506002016000508a8a60405180838380828437820191505092505050908152602001604051809103902060005060000160006101000a81548160ff021916908302179055508a8a6004600050600033600160a060020a031681526020019081526020016000206000506002016000508b8b60405180838380828437820191505092505050908152602001604051809103902060005060040160005091908280548282559060005260206000209060020281019282156120c0579160400282015b828111156120c05781600281018482604082015b8281111561267b578154600160b860020a031916604860020a8435041782556020929092019160019190910190611838565b6040805160206004803580820135601f8101849004840285018401909552848452611b0f94919360249390929184019190819084018382808284375094965050505050505060408051602081810183526000808352600160a060020a0333908116825260049092529290922054909190610100900460ff16151560011415611c115760408051600091822085518493879360029390930192849290918291602085810192829185918391869190600490601f850104600302600f01f150905001915050908152602001604051809103902060005060000160009054906101000a900460ff161515600115151415611c3c576004600050600033600160a060020a0316815260200190815260200160002060005060020160005085604051808280519060200190808383829060006004602084601f0104600302600f01f1509050019150509081526020016040518091039020600050600401600050805480602002602001604051908101604052809291908181526020016000905b828210156127815760008481526020902060408051808201918290529160028086029091019182845b8154604860020a02815260019190910190602001808311611a0e575b5050505050815260200190600101906119e5565b61015e600435600160a060020a033390811660009081526003602052604090205460ff1615156001141561118f5760406000908120600160a060020a033316909152600360205254610100900460ff161515821515141561278f5750611191565b604080519115158252519081900360200190f35b60405180806020018281038252838181518152602001915080519060200190602002808383829060006004602084601f0104600302600f01f1509050019250505060405180910390f35b60408051918252519081900360200190f35b60405180806020018281038252838181518152602001915080516000925b81841015611b5957602084810284010151604080838184600060046015f1509050019260010192611b2d565b925050509250505060405180910390f35b60405180806020018281038252838181518152602001915080519060200190808383829060006004602084601f0104600302600f01f150905090810190601f168015611bca5780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b50600160a060020a0333166000908152600460205260409020805460ff1916600190811761ff00191661010017909155610185565b5090565b505b919050565b50505b505b92915050565b505050509350505050611c1d565b509195945050505050565b505050919050565b50505050915050610185565b600160a060020a0333166000908152600360205260408120805460ff1916600190811761ff00191661010017825582548282015560049190910184905581549081018083558281838015829011611cba57818360005260206000209182019101611cba9190611d62565b50505060009283525060208083209091018054600160a060020a03191633908117909155600160a060020a03168083526003825260408051938190208054600482015460019290920154938652610100900460ff16151593850193909352838101919091526060830191909152517f4ad6212e5ea2a69c78caeb4108c3f8d7c222a77e077914c2c273bc75b9547ecd9181900360800190a1506001611c13565b506125ff9291505b80821115611c0d5760008155600101611d62565b60028054600101905550505b5050505050565b50505050815260200160058201600050805480602002602001604051908101604052809291908181526020018280548015611dee57602002820191906000526020600020905b8154600160a060020a0316815260019190910190602001808311611dcf575b50505091909252505060025491975090955060009450505b856060015151841015611f2e57600360005060006000600050878154811015610002576000918252602080832090910154600160a060020a031683528201929092526040019020600401546060870151805186908110156100025790602001906020020151108015611eb5575060008054869081101561000257906000526020600020900160009054906101000a9004600160a060020a0316600160a060020a031633600160a060020a031614155b15611f9a57600360005060006000600050878154811015610002576000918252602080832090910154600160a060020a0316835282019290925260400190206005018054600181018083558281838015829011611fbb57600083815260209020611fbb918101908301611d62565b600254851415611faf575b600254600054600019019010611d765760006002556105ca565b50505091909060005260206000209001600060008054899081101561000257505080526000805160206127bd8339815191528701548154600160a060020a031916600160a060020a0391909116179055505b600054600195909501948510611f2357600094505b60019390930192611e06565b50505060009283525060208220018054600160a060020a0319163317905580546003919081908890811015610002579060005260206000209001600090546101009190910a9004600160a060020a03168152602081019190915260400160002060060180546001810180835582818380158290116120525760020281600202836000526020600020918201910161205291906120c8565b5050509190906000526020600020906002020160008860800151878151811015610002576020908102909101015160028301915082604082015b828111156120e25782518254600160b860020a031916604860020a909104178255602092909201916001919091019061208c565b506126989291505b80821115611c0d57600080825560018201556002016120c8565b506121089291505b80821115611c0d578054600160b860020a03191681556001016120ea565b50506000805460039250819088908110156100025750506000805160206127bd833981519152870154600160a060020a03168152602091909152604090206007018054600181018083558281838015829011612177578183600052602060002091820191016121779190611d62565b505050919090600052602060002090016000886060015187815181101561000257506020888102919091010151909155805460039250819088908110156100025750506000805160206127bd833981519152870154600160a060020a03168152602091909152604090206008018054600181018083558281838015829011612212578183600052602060002091820191016122129190611d62565b505050600092835250602080832090890151910155805460039190819088908110156100025750506000805160206127bd833981519152870154600160a060020a0316815260209190915260409020600a018054600181018083558281838015829011612292578183600052602060002091820191016122929190611d62565b5050506000928352506020822001819055805460039190819088908110156100025750506000805160206127bd833981519152870154600160a060020a0316815260209190915260409020600901805460018101808355828183801582901161230e5781836000526020600020918201910161230e9190611d62565b50505060009283525060208220018190558054600191600391819089908110156100025781546000805160206127bd833981519152820154600160a060020a031683526020859052604083206006015460001901955081101561000257906000526020600020900160009054906101000a9004600160a060020a0316600160a060020a03168152602001908152602001600020600050600b01600050600088608001518781518110156100025760208181029092018201515168ffffffffffffffffff191683529290526040812060808a01518051919350908890811015610002575060208881029190910181015181015168ffffffffffffffffff1916825291909152604090205560608601518051859081101561000257906020019060200201516003600050600060006000508881548110156100025750506000805160206127bd833981519152880154600160a060020a03908116825260208381526040808420600490810180549790970390965533909216835284815281832091518c51600293909301958d95919485948785019490938493879385938893919291601f86019190910402600f01f15090500191505090815260200160405180910390206000506005016000508054806001018281815481835581811511612507578183600052602060002091820191016125079190611d62565b5050509190906000526020600020900160006000805489908110156100025750506000805160206127bd8339815191528801548254600160a060020a031916600160a060020a039182161790925533909116815260046020818152604080842090518c51600290920195508c9490938493868101939283928692849287929091600f601f86019190910460030201f150905001915050908152602001604051809103902060005060060160005060008581526020019081526020016000206000508054806001018281815481835581811511611f4857818360005260206000209182019101611f489190611d62565b505b9392505050565b50507fcff57d64cf213ba01190b9500909d8d5cfe400fa0d1156c7c9a91f370f2c147f338a8a8a6040518085600160a060020a0316815260200180602001838152602001828103825285858281815260200192508082843782019150509550505050505060405180910390a15b50505b50979650505050505050565b506126879291506120ea565b505091604001919060020190611824565b5050600160a060020a0333166000908152600460205260409081902090518891600201908b908b908083838082843782019150509250505090815260200160405180910390206000506001016000508190555085856004600050600033600160a060020a031681526020019081526020016000206000506002016000508b8b6040518083838082843782019150509250505090815260200160405180910390206000506003016000509190828054828255906000526020600020908101928215611d5a579160200282015b82811115611d5a578235826000505591602001919060010190612763565b505050509350505050611c13565b600160a060020a03331660009081526003602052604090208054610100840261ff001991909116179055505056290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563",
    "updated_at": 1476303461563
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
