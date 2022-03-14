const truffleAssert = require('truffle-assertions');

var Test = require('../config/testConfig.js');
var Helpers = require('./_helpers.js');

contract('Flight Surety Tests', async (accounts) => {

  var config;
  before('setup contract', async () => {
    config = await Test.Config(accounts);
    await config.flightSuretyData.authorizeCaller(config.flightSuretyApp.address);

    // set up airline accounts. This should give us at least one particpating airline that we can purchase insurance from
    await Helpers.payAirlineFeeHelper(config.firstAirline, config);
  });

  it('(passenger) Can buy insurance from participating airline, once and only once for a single flight.', async () => {
    
    const passenger = accounts[config.firstPassengerIndex];
    const insuranceAmountWei = web3.utils.toBN(web3.utils.toWei("0.5", "ether"));
    const airline = config.firstAirline;
    const flightNum1 = "123";
    const flightNum2 = "234";
    const timestamp = Math.floor(Date.now() / 1000);
    await config.flightSuretyApp.purchaseInsurance(airline, flightNum1, timestamp, {from: passenger, value: insuranceAmountWei});
    await config.flightSuretyApp.purchaseInsurance(airline, flightNum2, timestamp, {from: passenger, value: insuranceAmountWei});

    assert.isTrue(await config.flightSuretyData.isInsured(passenger, airline, flightNum1, timestamp), "Passenger should be insured on flight 1.");
    assert.isTrue(await config.flightSuretyData.isInsured(passenger, airline, flightNum2, timestamp), "Passenger should be insured on flight 2");

    // test that the same passenger can't buy insurance for the same flight
    // truffleAssert.reverts doesn't seem to work
    let exceptionFired = false;
    try {
      await config.flightSuretyApp.purchaseInsurance(airline, flightNum1, timestamp, {from: passenger, value: insuranceAmountWei});
    } 
    catch (e) {
      exceptionFired = true;
      assert.equal(e.reason, "Passenger is already insured for the given flight.", "Failed expected error message.");
    }
    assert.isTrue(exceptionFired, "Expected double purchase to fail.");    
  });

  

});
