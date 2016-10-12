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
        "name": "receiverRemoveHash",
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
    "unlinked_binary": "0x60606040526000600255612066806100176000396000f36060604052361561015e5760e060020a600035046314a32cd381146101605780631a13397e1461018857806320fd9584146101b6578063223badd81461023457806325ce4190146102b15780633ea7b13f1461048d5780634377fe751461051157806346efe67d1461051c578063519bcd96146105405780635228671d146105bd57806361649d1c1461067057806380776079146107a157806384e01cb4146108d1578063880d2161146109b95780638a28991214610ad35780638af0012b14610b6f5780638b22b92314610c2e5780638ba45f1514610c535780638c14d1e614610cc05780638e7e83be14610d3d57806399587b1814610d615780639ac4be9314610d8d578063a8914ab614610d97578063b695ff2f14610dbd578063ba29e94214610de9578063bd90de2114610e6e578063e7978ba214610e9f578063eb5e5fa6146110ab578063f8d8a343146111fc578063feb5d02c1461132b575b005b611364600160a060020a033316600090815260046020526040902054610100900460ff165b90565b611364600160a060020a03331660009081526004602052604081205460ff1615156001141561149d57610185565b61137860408051602081810183526000808352600160a060020a033316815260038252835190849020600801805480840283018401909552848252929390929183018282801561022857602002820191906000526020600020905b816000505481526020019060010190808311610211575b50505050509050610185565b61137860408051602081810183526000808352600160a060020a03331681526003825283519084902060090180548084028301840190955284825292939092918301828280156102285760200282019190600052602060002090816000505481526020019060010190808311610211575b50505050509050610185565b604080516020606435600481810135601f810184900484028501840190955284845261015e94813594602480359560443595608494920191908190840183828082843750949650505050505050600160a060020a03848116600090815260036020818152604080842068ffffffffffffffffff19808a168652600a909101835281852090881685528252808420543395909516845260048083528185209151875134979642966002909501958a95939485948783019493849387938593889392601f86010402600f01f150905001915050908152602001604051809103902060005060020160005081905550426003600050600088600160a060020a0316815260200190815260200160002060005060090160005082815481101561000257906000526020600020900160005055600160a060020a038616600090815260036020526040902060028101805434019055600801805483919083908110156100025790600052602060002090016000505560408051600160a060020a0388811682523316602082015280820184905268ffffffffffffffffff1980881660608301528616608082015290517fa252d942976baedb7ae6bd1236f6ba594c1c322814225b482cf41c2ad18b30049181900360a00190a1505050505050565b61015e600435602435600160a060020a033316600081815260036020818152604080842068ffffffffffffffffff198089168652600a8201845282862090881686528352908420549484529190526004018054839081101561000257906000526020600020900160009054906101000a9004600160a060020a031690505b50505050565b6113c2600254610185565b611364600160a060020a03331660009081526003602052604090205460ff16610185565b61137860408051602081810183526000808352600160a060020a03331681526003825283519084902060060180548084028301840190955284825292939092918301828280156102285760200282019190600052602060002090816000505481526020019060010190808311610211575b50505050509050610185565b6113c2600435600160a060020a03331660009081526003602052604081206002015482901061064e5760408082206002018054849003905551600160a060020a033316908290849082818181858883f19350505050151561064e57816003600050600033600160a060020a031681526020019081526020016000206000506002016000828282505401925050819055505b50600160a060020a033316600090815260036020526040902060020154610c29565b60408051602060248035600481810135601f81018590048502860185019096528585526113d4958135959194604494929390920191819084018382808284375094965050505050505060408051602081810183526000808352600160a060020a03861681526004808352845194822086519495600291909101948794919384938684019383928692849287929190601f850104600302600f01f1509050019150509081526020016040518091039020600050600401600050805480602002602001604051908101604052809291908181526020016000905b828210156114d25760008481526020902060408051808201918290529160028581029091019182845b8154604860020a02815260019190910190602001808311610771575b505050505081526020019060010190610748565b6113786004808035906020019082018035906020019191908080601f01602080910402602001604051908101604052809392919081815260200183838082843750949650509335935050505060408051602081810183526000808352600160a060020a03331681526004808352845194822087519495600291909101948894919384938684019383928692849287929190601f850104600302600f01f150905001915050908152602001604051809103902060005060060160005060008381526020019081526020016000206000508054806020026020016040519081016040528092919081815260200182805480156108c557602002820191906000526020600020905b8154600160a060020a03168152600191909101906020018083116108a6575b505050505090506114d9565b61142f600435602435604080516020818101835260008083528351918201845280825292519192909181908190602e9080591061090b5750595b908082528060200260200182016040528015610922575b5093506000925060179150600090505b60178110156114df5786816017811015610002571a60f860020a028484806001019550815181101561000257906020010190600160f860020a031916908160001a90535085816017811015610002571a60f860020a028483806001019450815181101561000257906020010190600160f860020a031916908160001a905350600101610932565b6113786004808035906020019082018035906020019191908080601f0160208091040260200160405190810160405280939291908181526020018383808284375094965050505050505060408051602081810183526000808352600160a060020a03331681526004808352845194822086519495600291909101948794919384938684019383928692849287929190601f850104600302600f01f1509050019150509081526020016040518091039020600050600501600050805480602002602001604051908101604052809291908181526020018280548015610ac757602002820191906000526020600020905b8154600160a060020a0316815260019190910190602001808311610aa8575b50505050509050610c29565b6040805160208181018352600080835233600160a060020a031681526003825283518482206005018054808502830185019096528582526113d495919390929084015b828210156114ea5760008481526020902060408051808201918290529160028581029091019182845b8154604860020a02815260019190910190602001808311610b3f575b505050505081526020019060010190610b16565b6113c26004808035906020019082018035906020019191908080601f0160208091040260200160405190810160405280939291908181526020018383808284375094965050505050505060006004600050600033600160a060020a0316815260200190815260200160002060005060020160005082604051808280519060200190808383829060006004602084601f0104600302600f01f15090500191505090815260200160405180910390206000506002016000505490505b919050565b6113c2600160a060020a03331660009081526003602081905260409091200154610185565b60408051602081810183526000808352835181548084028201840190955284815261137894909283018282801561022857602002820191906000526020600020905b8154600160a060020a0316815260019190910190602001808311610c95575b50505050509050610185565b61137860408051602081810183526000808352600160a060020a03331681526003825283519084902060070180548084028301840190955284825292939092918301828280156102285760200282019190600052602060002090816000505481526020019060010190808311610211575b50505050509050610185565b6113c2600160a060020a033316600090815260036020526040902060020154610185565b61015e600435600160a060020a0333166000908152600360208190526040909120018054820190555b50565b6113c26000610185565b33600160a060020a0316600090815260036020819052604090912060043591015561015e565b611364600435600160a060020a038116600090815260036020526040902054610100900460ff16610c29565b61137860408051602081810183526000808352600160a060020a033316815260038252835190849020600401805480840283018401909552848252929390929183018282801561022857602002820191906000526020600020908154600160a060020a0316815260019190910190602001808311610c95575b50505050509050610185565b611364600435600160a060020a03331660009081526003602052604081205460ff161515600114156114f557610c29565b61015e6004808035906020019082018035906020019191908080601f016020809104026020016040519081016040528093929190818152602001838380828437509496505050505050506040805160c081018252600080825260208281018290528284018290528351808201855282815260608401528351808201855282815260808401528351808201855282815260a0840152600160a060020a0333168252600480825284832094518651949593948594600201938893839285830192909182918591839186918c91601f850104600302600f01f150905001915050908152602001604051809103902060005060c060405190810160405290816000820160009054906101000a900460ff161515815260200160018201600050548152602001600282016000505481526020016003820160005080548060200260200160405190810160405280929190818152602001828054801561102157602002820191906000526020600020905b81600050548152602001906001019080831161100a575b5050505050815260200160048201600050805480602002602001604051908101604052809291908181526020016000905b8282101561161b5760008481526020902060408051808201918290529160028581029091019182845b8154604860020a0281526001919091019060200180831161107b575b505050505081526020019060010190611052565b611364602460048035828101929082013591813580830192908201359160443591606435908101910135600086821415611efd57600160a060020a0333168152600460205260408082209051600191600201908890889080838380828437820191505092505050908152602001604051809103902060005060000160006101000a81548160ff0219169083021790555087876004600050600033600160a060020a031681526020019081526020016000206000506002016000508888604051808383808284378201915050925050509081526020016040518091039020600050600401600050919082805482825590600052602060002090600202810192821561194e579160400282015b8281111561194e5781600281018482604082015b82811115611f08578154600160b860020a031916604860020a84350417825560209290920191600191909101906111ca565b6113d46004808035906020019082018035906020019191908080601f0160208091040260200160405190810160405280939291908181526020018383808284375094965050505050505060408051602081810183526000808352600160a060020a03331681526004808352848220945186519495600201948794919384938684019383928692849287929190601f850104600302600f01f1509050019150509081526020016040518091039020600050600401600050805480602002602001604051908101604052809291908181526020016000905b8282101561200e5760008481526020902060408051808201918290529160028581029091019182845b8154604860020a028152600191909101906020018083116112fb575b5050505050815260200190600101906112d2565b33600160a060020a031660009081526003602052604090205461015e9060043590610100900460ff161515811515141561201957610d8a565b604080519115158252519081900360200190f35b60405180806020018281038252838181518152602001915080519060200190602002808383829060006004602084601f0104600302600f01f1509050019250505060405180910390f35b60408051918252519081900360200190f35b60405180806020018281038252838181518152602001915080516000925b8184101561141e57602084810284010151604080838184600060046015f15090500192600101926113f2565b925050509250505060405180910390f35b60405180806020018281038252838181518152602001915080519060200190808383829060006004602084601f0104600302600f01f150905090810190601f16801561148f5780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b50600160a060020a0333166000908152600460205260409020805460ff1916600190811761ff00191661010017909155610185565b5050505090505b92915050565b509195945050505050565b505050509050610185565b600160a060020a03331660009081526003602081905260408220805460ff1916600190811761ff00191661010017825583548282015591018490558154908101808355828183801582901161155d5781836000526020600020918201910161155d9190611603565b50505060009283525060208083209091018054600160a060020a03191633908117909155600160a060020a0316808352600380835260408051948190208054928101546001919091015493865261010090920460ff16151593850193909352838301919091526060830152517f4ad6212e5ea2a69c78caeb4108c3f8d7c222a77e077914c2c273bc75b9547ecd9181900360800190a1506001610c29565b50611e909291505b808211156116175760008155600101611603565b5090565b5050505081526020016005820160005080548060200260200160405190810160405280929190818152602001828054801561168057602002820191906000526020600020905b8154600160a060020a0316815260019190910190602001808311611661575b50505091909252505060025491945090925060009150505b8260600151518110156117c057600360005060006000600050848154811015610002576000918252602080832090910154600160a060020a031683528201929092526040019020600301546060840151805183908110156100025790602001906020020151108015611747575060008054839081101561000257906000526020600020900160009054906101000a9004600160a060020a0316600160a060020a031633600160a060020a031614155b1561182c57600360005060006000600050848154811015610002576000918252602080832090910154600160a060020a031683528201929092526040019020600401805460018101808355828183801582901161184957600083815260209020611849918101908301611603565b600254821415611841575b600254600054600019019010611e8157600060025561050b565b50505091909060005260206000209001600060008054869081101561000257505080526000805160206120468339815191528401548154600160a060020a031916600160a060020a0391909116179055505b6000546001929092019182106117b557600091505b600101611698565b50505060009283525060208220018054600160a060020a0319163317905580546003919081908590811015610002579060005260206000209001600090546101009190910a9004600160a060020a03168152602081019190915260400160002060050180546001810180835582818380158290116118e0576002028160020283600052602060002091820191016118e09190611956565b5050509190906000526020600020906002020160008560800151848151811015610002576020908102909101015160028301915082604082015b828111156119705782518254600160b860020a031916604860020a909104178255602092909201916001919091019061191a565b50611f259291505b808211156116175760008082556001820155600201611956565b506119969291505b80821115611617578054600160b860020a0319168155600101611978565b5050600080546003925081908590811015610002575050600080516020612046833981519152840154600160a060020a03168152602091909152604090206006018054600181018083558281838015829011611a0557818360005260206000209182019101611a059190611603565b50505091909060005260206000209001600085606001518481518110156100025750602085810291909101015190915580546003925081908590811015610002575050600080516020612046833981519152840154600160a060020a03168152602091909152604090206007018054600181018083558281838015829011611aa057818360005260206000209182019101611aa09190611603565b50505060009283525060208083209086015191015580546003919081908590811015610002575050600080516020612046833981519152840154600160a060020a03168152602091909152604090206009018054600181018083558281838015829011611b2057818360005260206000209182019101611b209190611603565b505050600092835250602082200181905580546003919081908590811015610002575050600080516020612046833981519152840154600160a060020a03168152602091909152604090206008018054600181018083558281838015829011611b9c57818360005260206000209182019101611b9c9190611603565b5050506000928352506020822001819055805460019160039181908690811015610002578154600080516020612046833981519152820154600160a060020a031683526020859052604083206005015460001901955081101561000257906000526020600020900160009054906101000a9004600160a060020a0316600160a060020a03168152602001908152602001600020600050600a01600050600085608001518481518110156100025760208181029092018201515168ffffffffffffffffff191683529290526040812060808701518051919350908590811015610002575060208581029190910181015181015168ffffffffffffffffff191682529190915260409020556060830151805182908110156100025790602001906020020151600360005060006000600050858154811015610002575050600080516020612046833981519152850154600160a060020a039081168252602083815260408084208501805496909603909555339091168252600480825284832094518951600296909601958a95919485948781019492938493879385938893919291601f86019190910402600f01f15090500191505090815260200160405180910390206000506005016000508054806001018281815481835581811511611d9457818360005260206000209182019101611d949190611603565b5050509190906000526020600020900160006000805486908110156100025750506000805160206120468339815191528501548254600160a060020a031916600160a060020a0391821617909255339091168152600460208181526040808420905189516002929092019550899490938493868101939283928692849287929091601f850104600302600f01f1509050019150509081526020016040518091039020600050600601600050600082815260200190815260200160002060005080548060010182818154818355818115116117da578183600052602060002091820191016117da9190611603565b60028054600101905550505050565b50507fcff57d64cf213ba01190b9500909d8d5cfe400fa0d1156c7c9a91f370f2c147f338787876040518085600160a060020a0316815260200180602001838152602001828103825285858281815260200192508082843782019150509550505050505060405180910390a15b979650505050505050565b50611f14929150611978565b5050916040019190600201906111b6565b5050600160a060020a033316600090815260046020526040908190209051859160020190889088908083838082843782019150509250505090815260200160405180910390206000506001016000508190555082826004600050600033600160a060020a03168152602001908152602001600020600050600201600050888860405180838380828437820191505092505050908152602001604051809103902060005060030160005091908280548282559060005260206000209081019282156115fb579160200282015b828111156115fb578235826000505591602001919060010190611ff0565b505050509050610c29565b600160a060020a03331660009081526003602052604090208054610100830261ff0019919091161790555056290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563",
    "updated_at": 1476266283558
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
