
import FlightSuretyApp from '../../build/contracts/FlightSuretyApp.json';
import Config from './config.json';
import Web3 from 'web3';
import express from 'express';


let config = Config['localhost'];
let web3 = new Web3(new Web3.providers.WebsocketProvider(config.url.replace('http', 'ws')));
//web3.eth.defaultAccount = web3.eth.accounts[0];
let flightSuretyApp = new web3.eth.Contract(FlightSuretyApp.abi, config.appAddress);
flightSuretyApp.options.gas = 200000; // necessary for operations (probably due to using solc ^0.8.0)

const firstOracleIndex = 15; // in the accounts array. The rest are reserved for passengers and airlines
const oraclesToRegister = 30;

// this map will handle index to oracle conversion. Initialize now
const indexToOracleMap = new Map();
for (let i = 0; i < 10; ++i) {
  indexToOracleMap[i] = new Array();
}
let indexedOracleCount = 0; // how many oracles have reported their indexes


function fail(msg) {
  throw new Error(msg); // callstacks are horrible to read in this server, so instead log the message and exit the app
}

/**
 * Verify that all indexes have at least MIN_ORACLES oracles. This only guarantees that the contract will get consensus
 * if MIN_ORACLES >= (RESPONSE_CODES * (MIN_RESPONSES - 1) +  1). That number is too big for this test, so I
 * am leaving MIN_ORACLES as a small number, and will guarantee consensus when the responses are sent.
 */
function verifyAllIndexesHaveEnoughOracles() {
  const MIN_ORACLES = 3;
  let indexesWithoutOracle = new Array();
  for (let i = 0; i < 10; ++i) {
    if (indexToOracleMap[i].length < MIN_ORACLES) {
      indexesWithoutOracle.push(`\n${i} : ${indexToOracleMap[i].length}/${MIN_ORACLES}`);
    }
  }

  if (indexesWithoutOracle.length > 0) {
    const msg = (`****************************************************************************
        There are indexes without enough oracles (req: ${MIN_ORACLES}). 
        Please register more oracles or reset the contracts (truffle migrate --reset) and run the server again, until all indexes are covered.
        Indexes without enough oracles: ${indexesWithoutOracle}        
        ****************************************************************************\n\n`);
    fail(msg);
  }

  console.log(`All indexes have at least ${MIN_ORACLES} oracles. Server is ready for oracle requests!`)
  onOraclesReady();
}

/**
 * Requests the indexes for the given oracle and stores them in the common mapping when received.
 */
function requestOracleIndexes(oracleAcc) {
  flightSuretyApp.methods.getMyIndexes().call({ from: oracleAcc }, (e, r) => {
    if (e) {
      console.error(e);
    } else {
      console.log(` + ${oracleAcc.substring(0, 4)}..${oracleAcc.substring(oracleAcc.length - 4, oracleAcc.length)}'s indexes = ${r}`);
      r.forEach((index) => {
        indexToOracleMap[index].push(oracleAcc);
      })
      ++indexedOracleCount;
      if (indexedOracleCount >= oraclesToRegister) {
        // console.log(indexToOracleMap);
        verifyAllIndexesHaveEnoughOracles();
      }
    }
  });
}

/**
 * Get the accounts from the provider, register oracles and get their indexes.
 */
web3.eth.getAccounts((e, accs) => {

  web3.eth.defaultAccount = accs[0];

  // -- Make sure there are enough accounts for the oracles
  if (accs.length < (firstOracleIndex + oraclesToRegister)) {
    fail(`Not enough accounts for oracles!!
        First oracle starts at ${firstOracleIndex}, and need ${oraclesToRegister} accounts after that.
        Your provider should at least have ${firstOracleIndex + oraclesToRegister} accounts.`)
  }

  // -- Register oracles and grab their indexes
  for (let oracleIdx = firstOracleIndex; oracleIdx < (firstOracleIndex + oraclesToRegister); ++oracleIdx) {
    const oracleAcc = accs[oracleIdx];
    const fee = Web3.utils.toWei("1", "ether");

    // first check if we are already registered, so that we don't attempt to register again
    flightSuretyApp.methods.isOracleRegistered().call({ from: oracleAcc }, (e, isRegistered) => {
      if (e) { console.error(e); }
      else {
        if (!isRegistered) {
          console.log(`${oracleAcc} is not registered. Registering..`);
          flightSuretyApp.methods.registerOracle().send({ from: oracleAcc, value: fee }, (e, r) => {
            if (e) console.error(e);
            else requestOracleIndexes(oracleAcc);
          });
        } else {
          // console.log(`${oracleAcc} is already a registered oracle.`);
          requestOracleIndexes(oracleAcc);
        }
      }
    });
  }

})

/**
 * Called when the oracles are registered and ready. Starts processing oracle requests.
 */
function onOraclesReady() {
  flightSuretyApp.events.OracleRequest({
    fromBlock: 0
  }, function (error, event) {
    if (error) console.log(error)
    const args = event.returnValues;
    processOracleRequest(args.index, args.airline, args.flight, args.timestamp);
  });  
}

// Fisher-Yates (aka Knuth) Shuffle.
// From: https://bost.ocks.org/mike/shuffle/
function shuffle(array) {
  var m = array.length, t, i;

  // While there remain elements to shuffle…
  while (m) {

    // Pick a remaining element…
    i = Math.floor(Math.random() * m--);

    // And swap it with the current element.
    t = array[m];
    array[m] = array[i];
    array[i] = t;
  }

  return array;
}

/**
 * Simulate the responses from the oracles.
 */
function processOracleRequest(index, airline, flight, timestamp) {
  // console.log("====> Oracle Request", index, airline, flight, timestamp);

  // first make sure it is still open, otherwise no need to send more responses
  flightSuretyApp.methods.isOracleRequestOpenForIndex(airline, flight, timestamp, index).call((e, isOpen) => {
    if (e) { 
      console.error("Failed to retrieve status for request: ", e); 
    }
    if (isOpen) {      
      console.log("==> Oracle Request is OPEN", airline, flight, timestamp, index);
      const oraclesForThisRequest = [...indexToOracleMap[index]];

      // get one of the 5 expected status codes: 0, 10, 20, 30, 40, 50
      const getRandomStatusCodeNormal = () => { return Math.floor(Math.random() * 6) * 10; };
      const getRandomStatusCodeFavorPayouts = () => {
        // Higher chance of returning code 20, which generates payouts
        const chanceOf20 = Math.random();
        if (chanceOf20 > 0.4)
          return 20;
        else 
          return getRandomStatusCodeNormal();  // note there's also a chance here for code 20
      };
      // we favor code 20 so that the project reviewer can also debug payouts more easily
      const getRandomStatusCode = getRandomStatusCodeFavorPayouts
      const getRandomStatusCodeNo0 = () => { // do not allow 0 to be the consensus code
        let retCode = 0;
        while(retCode == 0) {
          retCode = getRandomStatusCodeFavorPayouts();
        }
        return retCode;
      }

      // Guarantee that at least one code will reach consensus. That code will get at least MIN_RESPONSE oracles.
      // Note that due to randomness and random shuffles another code may actually end up being the winner. This
      // just guarantees that there is at least one winning code.
      const MIN_RESPONSE = 3; // we could query this from the contract once, but no need for this project
      const oracleResponses = new Array(indexToOracleMap[index].length);
      const consensusStatusCode = getRandomStatusCodeNo0();
      // the first MIN_RESPONSE get the guaranteed consensus code
      for (let responseIdx=0; responseIdx<MIN_RESPONSE; ++responseIdx) {
        oracleResponses[responseIdx] = consensusStatusCode;
      }
      // the rest get a random code
      for (let responseIdx=MIN_RESPONSE; responseIdx<oracleResponses.length; ++responseIdx) {
        oracleResponses[responseIdx] = getRandomStatusCode();
      }

      // now shuffle both the order in which oracles report codes and the codes that are reported
      shuffle(oraclesForThisRequest);
      shuffle(oracleResponses);

      // code for debugging status code generation:
      const DEBUG_RESPONSES = false;
      if (DEBUG_RESPONSES) {
        // count how many times each code is reported, and also grab which one reaches consensus first, since it will be 
        // the actual winning one.
        const statusCodeCount = [0,0,0,0,0,0];
        let winningCode = -1;
        for (let responseIdx=0; responseIdx<oracleResponses.length; ++responseIdx) {
          const idx = oracleResponses[responseIdx]/10;
          ++statusCodeCount[idx];
          if (statusCodeCount[idx] > MIN_RESPONSE && winningCode < 0) {
            winningCode = oracleResponses[responseIdx];
          }
        }
        console.log(`Code ${winningCode} will be the first to reach consensus.`);
        for (let i=0; i<statusCodeCount.length; ++i) {
          console.log(`| - Code ${i * 10} has ${statusCodeCount[i]} votes.`);
        }
      }

      // report from each oracle
      for(let oracleIdx=0; oracleIdx<oracleResponses.length; ++oracleIdx) {
        const oracle = oraclesForThisRequest[oracleIdx];
        const response = oracleResponses[oracleIdx];
        if (DEBUG_RESPONSES) {
          console.log(`${oracle} will reply with code ${response}.`);
        }
        flightSuretyApp.methods.submitOracleResponse(index, airline, flight, timestamp, response).
        send({from: oracle}, (e, r) => {
          const oracleShort = oracle.substring(0, 6) + ".." + oracle.substring(-2);
          if (e) {
            console.error(` | - ${oracleShort} response REJECTED: ${e.message}`);
          } else {
            console.log(` | - ${oracleShort} response ACCEPTED for status code ${response}.`);
          }
          if (DEBUG_RESPONSES) {
            console.log(r);
          }
        });
      }
    } else {
      console.log("==> Oracle Request is CLOSED:", airline, flight, timestamp, index);
    }

  });

}

const app = express();
app.get('/api', (req, res) => {
  res.send({
    message: 'An API for use with your Dapp!'
  })
})

export default app;
