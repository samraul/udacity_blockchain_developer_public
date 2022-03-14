

const truffleAssert = require('truffle-assertions');
var Test = require('../config/testConfig.js');
var Helpers = require('./_helpers.js');

/* ************************************************* */
/*                       TEST                        */
/* ************************************************* */
contract('Airline Tests', async (accounts) => {

  var config;
  before('setup contract', async () => {
    config = await Test.Config(accounts);
    await config.flightSuretyData.authorizeCaller(config.flightSuretyApp.address);
  });
  
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  //
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  it('(airline) cannot register an Airline if caller is not participating.', async () => {
    
    // ARRANGE
    const newAirline = accounts[2];
    const newAirlineName = config.airlineNames[2];

    // ACT
    try {
        await config.flightSuretyApp.registerAirline(newAirline, newAirlineName, {from: config.firstAirline});
    }
    catch(e) {
    }
    const result = await config.flightSuretyData.isRegisteredAirline.call(newAirline); 

    // ASSERT
    assert.equal(result, false, "Airline should not be able to register another airline if it hasn't provided funding");

  });

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  //
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  it('(airline) airline can pay the fee and become a participant.', async () => {
    // this entire functionality is in a helper so that it can be reused for other airline fees
    await Helpers.payAirlineFeeHelper(config.firstAirline, config);
  });

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  //
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  it('(airline) airline can register a second airline, after having paid the fee, and event is fired.', async () => {

    const newAirline = accounts[2];
    const newAirlineName = config.airlineNames[2];

    // first airline is participating
    const isAirlineParticipating = await config.flightSuretyData.isParticipatingAirline.call(config.firstAirline);
    assert.isTrue(isAirlineParticipating, "First airline should be participating (from previous test).")

    // second airline is not participating
    let isSecondAirlineRegBefore = await config.flightSuretyData.isRegisteredAirline.call(newAirline);
    assert.isFalse(isSecondAirlineRegBefore, "Second airline should not be registered yet.")

    // ACT
    const txInfo = await config.flightSuretyApp.registerAirline(newAirline, newAirlineName, {from: config.firstAirline});

    // second airline is participating after tx
    let isSecondAirlineRegAfter = await config.flightSuretyData.isRegisteredAirline.call(newAirline);
    assert.isTrue(isSecondAirlineRegAfter, "Second airline should be registered after transaction.")

    // assert that the event was fired
    truffleAssert.eventEmitted(txInfo, 'AirlineRegistered', (ev) => {
      return ev.airline === newAirline && ev.name === newAirlineName;
    });

  });

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  //
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  it('(airline) first airline can register immediately up to the pre-consensus number.', async () => {
    let nextAirlineIdx = 3;

    let registeredCount = await config.flightSuretyData.getRegisteredAirlineCount.call();
    const preConsensusCount = await config.flightSuretyApp.AIRLINES_PRE_CONSENSUS.call();
    while(registeredCount < preConsensusCount) {
      const nextAirline     = accounts[nextAirlineIdx];
      const nextAirlineName = config.airlineNames[nextAirlineIdx];

      await config.flightSuretyApp.registerAirline(nextAirline, nextAirlineName, {from: config.firstAirline});
      ++registeredCount; // artificial count. Will need to request later
      ++nextAirlineIdx;
    }
    
    const finalRegisteredCount = await config.flightSuretyData.getRegisteredAirlineCount.call();
    assert.equal(finalRegisteredCount.toString(), preConsensusCount.toString(), "Final registered airline count does not match expected count (pre-consensus).");
  });  

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  //
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  it('(airline) consensus works to register next airline.', async () => {

    const airlineIdxOffset = 1; // +1 because address 0 is not an airline (this may need to be a variable in config)

    // we should have exactly the number of airlines that do not require consensus
    const preConsensusCount = await config.flightSuretyApp.AIRLINES_PRE_CONSENSUS.call();
    const currentRegisteredCount = await config.flightSuretyData.getRegisteredAirlineCount.call();
    assert.equal(currentRegisteredCount.toString(), preConsensusCount.toString(), "Expected registered airline count to match pre-consensus count.");

    // first airline attempts to register a new one
    const newAirlineIdx = parseInt(currentRegisteredCount.toString()) + airlineIdxOffset;
    const newAirline = accounts[newAirlineIdx];
    const newAirlineName = config.airlineNames[newAirlineIdx];
    await config.flightSuretyApp.registerAirline(newAirline, newAirlineName, {from: config.firstAirline});

    // the new airline is not yet registered
    const isRegisteredBefore = await config.flightSuretyData.isRegisteredAirline.call(newAirline); 
    assert.isFalse(isRegisteredBefore, "New airline should not be registered yet.")

    // the new airline is a candidate
    const isCandidateBefore = await config.flightSuretyData.isCandidateAirline.call(newAirline); 
    assert.isTrue(isCandidateBefore, "New airline should be a candidate.")

    // the voting airline is a voter of the candidate
    const isVoterOf = await config.flightSuretyData.isVoterOf.call(newAirline, config.firstAirline);
    assert.isTrue(isVoterOf, "Voting airline should be a voter of the candidate.");

    // test that the same address can't vote twice
    // truffleAssert.reverts doesn't seem to work
    let exceptionFired = false;
    try {
      await config.flightSuretyApp.registerAirline(newAirline, newAirlineName, {from: config.firstAirline});
    } 
    catch (e) {
      exceptionFired = true;
      assert.equal(e.reason, "The caller has already voted to register the candidate.", "Failed expected error message.");
    }
    assert.isTrue(exceptionFired, "Expected double vote to fail.");

    // calculate required number of votes
    const requiredVotePercentage = await config.flightSuretyApp.AIRLINE_CONSENSUS_PERCENT.call();
    const requiredVotes = preConsensusCount.mul(requiredVotePercentage).divn(100); // not this rounds
    
    // cast votes until the required number
    let castedVotes = 1; // first airline already casted a vote
    while(castedVotes < requiredVotes) {
      const nextVotingAirlineIdx = castedVotes + airlineIdxOffset;
      const nextVotingAirline = accounts[nextVotingAirlineIdx];

      // this airline did not pay the fee yet, pay it now
      await Helpers.payAirlineFeeHelper(nextVotingAirline, config);

      // now vote to add the new airline
      let tx = await config.flightSuretyApp.registerAirline(newAirline, newAirlineName, {from: nextVotingAirline});

      ++castedVotes;
    }

    // the new airline is now registered
    const isRegisteredAfter = await config.flightSuretyData.isRegisteredAirline.call(newAirline); 
    assert.isTrue(isRegisteredAfter, "New airline should now be registered.")

    // the new airline is no longer a candidate
    const isCandidateAfter = await config.flightSuretyData.isCandidateAirline.call(newAirline); 
    assert.isFalse(isCandidateAfter, "New airline should no longer be a candidate.")

    // there is one airline over the pre-consensus count
    const finalRegisteredCount = await config.flightSuretyData.getRegisteredAirlineCount.call();
    assert.equal(finalRegisteredCount.toString(), preConsensusCount.add(web3.utils.toBN(1)).toString(), "Expected registered airline count to match post-consensus count.");

  });

  /* TODO (optional, non-required tests):
    + Test can't register airline that is already registered.
    + Test can't pay participation fee more than once.
    + Create contracts with different values of AIRLINE_CONSENSUS_PERCENT to test consensus math. (Currently tested manually)
  */


});
