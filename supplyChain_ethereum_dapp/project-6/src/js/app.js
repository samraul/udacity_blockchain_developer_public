App = {
    web3Provider: null,
    contracts: {},
    emptyAddress: "0x0000000000000000000000000000000000000000",
    //sku: 0,
    upc: 0,
    metamaskAccountID: "0x0000000000000000000000000000000000000000",
    // ownerID: "0x0000000000000000000000000000000000000000",
    // originFarmerID: "0x0000000000000000000000000000000000000000",
    originFarmName: null,
    originFarmInformation: null,
    originFarmLatitude: null,
    originFarmLongitude: null,
    productNotes: null,
    productPrice: 0,
    // distributorID: "0x0000000000000000000000000000000000000000",
    // retailerID: "0x0000000000000000000000000000000000000000",
    // consumerID: "0x0000000000000000000000000000000000000000",

    upcToFetch: 0, // vs upc to use in transactions

    init: async function () {
        // App.readForm(); // no need to read this now. It will be done on each operation
        /// Setup access to blockchain
        return await App.initWeb3();
    },

    readForm: function () {

        //App.sku = $("#sku").val();
        App.upc = $("#op-input-upc").val();
        // App.ownerID = App.metamaskAccountID; // $("#ownerID").val();        
        // App.originFarmerID = App.metamaskAccountID; // $("#originFarmerID").val();
        App.originFarmName = $("#farm-input-originFarmName").val();
        App.originFarmInformation = $("#farm-input-originFarmInformation").val();
        App.originFarmLatitude = $("#farm-input-originFarmLatitude").val();
        App.originFarmLongitude = $("#farm-input-originFarmLongitude").val();
        App.productNotes = $("#prod-input-prodNotes").val();
        App.productPrice = $("#prod-input-prodPrice").val();
        // App.distributorID = $("#distributorID").val();
        // App.retailerID = $("#retailerID").val();
        // App.consumerID = $("#consumerID").val();

        App.upcToFetch = $("#fetch-input-upc").val();

        console.log("APP VARIABLES = ",
            //App.sku,
            App.upc,
            // App.ownerID, 
            // App.originFarmerID, 
            App.originFarmName, 
            App.originFarmInformation, 
            App.originFarmLatitude, 
            App.originFarmLongitude, 
            App.productNotes, 
            App.productPrice, 
            // App.distributorID, 
            // App.retailerID, 
            // App.consumerID
        );
    },

    initWeb3: async function () {
        /// Find or Inject Web3 Provider
        /// Modern dapp browsers...
        if (window.ethereum) {
            App.web3Provider = window.ethereum;
            try {
                // Request account access
                await window.ethereum.enable();
            } catch (error) {
                // User denied account access...
                console.error("User denied account access")
            }
        }
        // Legacy dapp browsers...
        else if (window.web3) {
            App.web3Provider = window.web3.currentProvider;
        }
        // If no injected web3 instance is detected, fall back to Ganache
        else {
            App.web3Provider = new Web3.providers.HttpProvider('http://localhost:7545');
        }

        App.getMetaskAccountID();        

        let supplyChain = await App.initSupplyChain();

        return supplyChain;
    },

    getMetaskAccountID: function () {        

        web3 = new Web3(App.web3Provider);

        // Retrieving accounts
        App.metamaskAccountID = web3.eth.accounts[0];
        web3.eth.defaultAccount = web3.eth.accounts[0]; // update the default account that does operations too!
        // web3.eth.getAccounts(function(err, res) {
        //     if (err) {
        //         console.log('Error:',err);
        //         return;
        //     }
        //     console.log('getMetaskID:',res);
        //     // App.metamaskAccountID = res[0];
        //     // web3.eth.defaultAccount = web3.eth.accounts[0]; // update the default account that does operations too!
        // })
    },

    initSupplyChain: async function () {
        /// Source the truffle compiled smart contracts
        var jsonSupplyChain='./build/contracts/SupplyChain.json';
        
        /// JSONfy the smart contracts
        await $.getJSON(jsonSupplyChain, function(data) {
            console.log('data',data);
            var SupplyChainArtifact = data;
            App.contracts.SupplyChain = TruffleContract(SupplyChainArtifact);
            App.contracts.SupplyChain.setProvider(App.web3Provider);
            
            App.readForm();
            App.fetchItemBufferOne();
            App.fetchItemBufferTwo();
            App.fetchEvents();

        });

        return App.bindEvents();
    },

    bindEvents: function() {
        $(document).on('click', App.handleButtonClick);
    },

    handleButtonClick: async function(event) {
        event.preventDefault();

        var processId = parseInt($(event.target).data('id'));

        // refresh the data so that operations are performed with the right inputs
        if ( processId >= 1 && processId <= 10) {
            // grab the active account that is going to execute the operation
            App.getMetaskAccountID();
            // console.log('processId',processId);
            // grab the data
            App.readForm();
        }

        switch(processId) {
            case 1:
                return await App.harvestItem(event);
                break;
            case 2:
                return await App.processItem(event);
                break;
            case 3:
                return await App.packItem(event);
                break;
            case 4:
                return await App.sellItem(event);
                break;
            case 5:
                return await App.buyItem(event);
                break;
            case 6:
                return await App.shipItem(event);
                break;
            case 7:
                return await App.receiveItem(event);
                break;
            case 8:
                return await App.purchaseItem(event);
                break;
            case 9:
                return await App.fetchItemBufferOne(event);
                break;
            case 10:
                return await App.fetchItemBufferTwo(event);
                break;
            case 11:
                return await App.checkRolesForMetamaskAccount(event);
                break;
            case 12:
                return await App.fetchEvents(event);
                break;
            }
    },

    harvestItem: function(event) {
        event.preventDefault();
        var processId = parseInt($(event.target).data('id'));

        console.log(App.metamaskAccountID + " harvesting ", App.upc);

        App.contracts.SupplyChain.deployed().then(function(instance) {
            return instance.harvestItem(
                App.upc, 
                App.metamaskAccountID, 
                App.originFarmName, 
                App.originFarmInformation, 
                App.originFarmLatitude, 
                App.originFarmLongitude, 
                App.productNotes
            );
        }).then(function(result) {
            $("#ftc-item").text(result);
            console.log('harvestItem',result);
        }).catch(function(err) {
            console.log(err.message);
        });
    },

    processItem: function (event) {
        event.preventDefault();
        var processId = parseInt($(event.target).data('id'));

        App.contracts.SupplyChain.deployed().then(function(instance) {
            return instance.processItem(App.upc, {from: App.metamaskAccountID});
        }).then(function(result) {
            $("#ftc-item").text(result);
            console.log('processItem',result);
        }).catch(function(err) {
            console.log(err.message);
        });
    },
    
    packItem: function (event) {
        event.preventDefault();
        var processId = parseInt($(event.target).data('id'));

        App.contracts.SupplyChain.deployed().then(function(instance) {
            return instance.packItem(App.upc, {from: App.metamaskAccountID});
        }).then(function(result) {
            $("#ftc-item").text(result);
            console.log('packItem',result);
        }).catch(function(err) {
            console.log(err.message);
        });
    },

    sellItem: function (event) {
        event.preventDefault();
        var processId = parseInt($(event.target).data('id'));

        App.contracts.SupplyChain.deployed().then(function(instance) {
            const productPrice = web3.toWei(App.productPrice, "ether");
            console.log('productPrice',productPrice);
            return instance.sellItem(App.upc, productPrice, {from: App.metamaskAccountID});
        }).then(function(result) {
            $("#ftc-item").text(result);
            console.log('sellItem',result);
        }).catch(function(err) {
            console.log(err.message);
        });
    },

    buyItem: function (event) {
        event.preventDefault();
        var processId = parseInt($(event.target).data('id'));
        App.contracts.SupplyChain.deployed().then(function(instance) {
            // TODO We should retrieve max available balance for the account here as well, in case it's smaller then the fixed number
            const balanceToSend = 0.0123;  
            const walletValue = web3.toWei(balanceToSend, "ether");
            return instance.buyItem(App.upc, {from: App.metamaskAccountID, value: walletValue});
        }).then(function(result) {
            $("#ftc-item").text(result);
            console.log('buyItem',result);
        }).catch(function(err) {
            console.log(err.message);
        });
    },

    shipItem: function (event) {
        event.preventDefault();
        var processId = parseInt($(event.target).data('id'));

        App.contracts.SupplyChain.deployed().then(function(instance) {
            return instance.shipItem(App.upc, {from: App.metamaskAccountID});
        }).then(function(result) {
            $("#ftc-item").text(result);
            console.log('shipItem',result);
        }).catch(function(err) {
            console.log(err.message);
        });
    },

    receiveItem: function (event) {
        event.preventDefault();
        var processId = parseInt($(event.target).data('id'));

        App.contracts.SupplyChain.deployed().then(function(instance) {
            return instance.receiveItem(App.upc, {from: App.metamaskAccountID});
        }).then(function(result) {
            $("#ftc-item").text(result);
            console.log('receiveItem',result);
        }).catch(function(err) {
            console.log(err.message);
        });
    },

    purchaseItem: function (event) {
        event.preventDefault();
        var processId = parseInt($(event.target).data('id'));

        App.contracts.SupplyChain.deployed().then(function(instance) {
            return instance.purchaseItem(App.upc, {from: App.metamaskAccountID});
        }).then(function(result) {
            $("#ftc-item").text(result);
            console.log('purchaseItem',result);
        }).catch(function(err) {
            console.log(err.message);
        });
    },

    updateFetchFieldsOne: function(buffer) {
        $("#fetch-sku").val(buffer[0]);
        $("#fetch-upc").val(buffer[1]);
        $("#fetch-ownerID").val(buffer[2]);
        $("#fetch-originFarmerID").val(buffer[3]);
        $("#fetch-originFarmName").val(buffer[4]);
        $("#fetch-originFarmInformation").val(buffer[5]);
        $("#fetch-originFarmLatitude").val(buffer[6]);
        $("#fetch-originFarmLongitude").val(buffer[7]);
    },

    updateFetchFieldsTwo: function(buffer) {
        $("#fetch-sku-2").val(buffer[0]);
        $("#fetch-upc-2").val(buffer[1]);
        $("#fetch-productID").val(buffer[2]);
        $("#fetch-productNotes").val(buffer[3]);
        $("#fetch-productPrice").val(buffer[4]);
        $("#fetch-itemState").val(buffer[5]);
        $("#fetch-distributorID").val(buffer[6]);
        $("#fetch-retailerID").val(buffer[7]);
        $("#fetch-consumerID").val(buffer[8]);
    },

    fetchItemBufferOne: function () {
    ///   event.preventDefault();
    ///    var processId = parseInt($(event.target).data('id'));

        // App.upc = $('#upc').val();
        // console.log('upc',App.upc);

        console.log('upcToFetch', App.upcToFetch);

        App.contracts.SupplyChain.deployed().then(function(instance) {
          return instance.fetchItemBufferOne(App.upcToFetch);
        }).then(function(result) {
          $("#ftc-item").text(result);
          console.log('fetchItemBufferOne', result);
          App.updateFetchFieldsOne(result);
        }).catch(function(err) {
          console.log(err.message);

          // fill UI with error keys
          var arr = Array(8).fill("Error");
          App.updateFetchFieldsOne(arr);
        });
    },

    fetchItemBufferTwo: function () {
    ///    event.preventDefault();
    ///    var processId = parseInt($(event.target).data('id'));
                        
        App.contracts.SupplyChain.deployed().then(function(instance) {
          return instance.fetchItemBufferTwo.call(App.upcToFetch);
        }).then(function(result) {
          $("#ftc-item").text(result);
          console.log('fetchItemBufferTwo', result);
          App.updateFetchFieldsTwo(result);
        }).catch(function(err) {
          console.log(err.message);
          // fill UI with error keys
          var arr = Array(9).fill("Error");
          App.updateFetchFieldsTwo(arr);
        });
    },

    fetchEvents: function () {
        if (typeof App.contracts.SupplyChain.currentProvider.sendAsync !== "function") {
            App.contracts.SupplyChain.currentProvider.sendAsync = function () {
                return App.contracts.SupplyChain.currentProvider.send.apply(
                App.contracts.SupplyChain.currentProvider,
                    arguments
              );
            };
        }

        App.contracts.SupplyChain.deployed().then(function(instance) {
            $("#ftc-events").empty()
            var events = instance.allEvents({ fromBlock:0, toBlock:'latest'}, function(err, log){        
            if (!err) {
                $("#ftc-events").append('<li>' + log.event + ' - ' + log.transactionHash + '</li>');
            }            
            });
        }).catch(function(err) {
          console.log(err.message);
        });
        
    },

    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
    // Roles
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 

    /**
     * Check whether the given address has the given role type.
     */
    checkRole: async function (address, roleType) {

        let roleValue = undefined;
        await App.contracts.SupplyChain.deployed().then(function(instance) {
            let roleTypeLC = roleType.toLowerCase();
            if (roleTypeLC == 'owner') {
                return instance.isOwner();
            } else if (roleTypeLC == 'farmer') {
                return instance.isFarmer(address);
            } else if (roleTypeLC == 'distributor') {
                return instance.isDistributor(address);
            } else if (roleTypeLC == 'retailer') {
                return instance.isRetailer(address);
            } else if (roleTypeLC == 'consumer') {
                return instance.isConsumer(address);
            } else {
                throw new Error("Role not defined: " + roleType);
            }
        }).then(function(result) {     
            roleValue = result;
        }).catch(function(err) {
            console.log(err.message);
        });

        return roleValue;
    },

    checkRolesForMetamaskAccount: async function() {

        // assume metamask account ID has already been refreshed
        App.getMetaskAccountID();

        let isOwner = await App.checkRole(App.metamaskAccountID, "owner");
        let isFarmer = await App.checkRole(App.metamaskAccountID, "farmer");
        let isDist = await App.checkRole(App.metamaskAccountID, "distributor");
        let isRetailer = await App.checkRole(App.metamaskAccountID, "retailer");
        let isConsumer = await App.checkRole(App.metamaskAccountID, "consumer");

        // Debug role responses:
        // console.log("Roles " + 
        //     "\nOwner:" + isOwner + 
        //     ",\nFarmer: " + isFarmer + 
        //     ",\nDistributor: " + isDist +
        //     ",\nRetailer: " + isRetailer +
        //     ",\nFarmer: " + isConsumer);

        // update UI with the data
        $("#check-account").val(App.metamaskAccountID);
        $("#check-role-owner").prop("checked", isOwner);
        $("#check-role-farmer").prop("checked", isFarmer);
        $("#check-role-dist").prop("checked", isDist);
        $("#check-role-retailer").prop("checked", isRetailer);
        $("#check-role-consumer").prop("checked", isConsumer);
    }

};

$(function () {
    $(window).load(function () {
        App.init();
    });
});
