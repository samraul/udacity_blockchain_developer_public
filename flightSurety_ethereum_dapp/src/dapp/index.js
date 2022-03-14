
import DOM from './dom';
import Contract from './contract';
import './flightsurety.css';
import Web3 from 'web3';

(async() => {

    let result = null;

    let contract = new Contract('localhost', async () => {

        // Read transaction
        contract.isOperational((error, result) => {
            let displayDiv = DOM.elid("display-wrapper");
            displayDiv.innerHTML = `Operational Status ${result}`;            
        });

        // automatically refresh lists on startup
        refreshPassengerList(contract, true);
        refreshAirlineLists(contract, true);
        refreshInsuredFlightsList(contract);
        refreshOracleRequestList(contract);

        // BUTTON
        // passengers
        DOM.elid('btn-getAvailableFlights').addEventListener('click', () => {
            generateFutureFlights(contract);
        });
        DOM.elid('btn-getInsuredFlights').addEventListener('click', () => {
            refreshInsuredFlightsList(contract);
        });
        DOM.elid('btn-purchaseInsurance').addEventListener('click', () => {
            purchaseInsurance(contract);
        });        
        DOM.elid('btn-queryPassengerCredit').addEventListener('click', () => {
            queryPassengerCredit(contract);
        });
        DOM.elid('btn-withdrawCredit').addEventListener('click', () => {
            withdrawPassengerCredit(contract);
        });
        DOM.elid('btn-fetchFlightStatus').addEventListener('click', () => {
            fetchFlightStatus(contract);
        });
        // oracles
        DOM.elid('btn-getOracleRequests').addEventListener('click', () => {
            refreshOracleRequestList(contract);
        });

        // airlines
        DOM.elid('btn-getAirlines').addEventListener('click', () => {
            refreshAirlineLists(contract);
        });
        DOM.elid('btn-registerAirline').addEventListener('click', () => {
            registerAirline(contract);
        });
        DOM.elid('btn-payAirlineFee').addEventListener('click', () => {
            payAirlineFee(contract);
        });

        // LISTS
        DOM.elid('knownPassengersList').addEventListener('dblclick', () => {
            copyToClipboard(DOM.elid('knownPassengersList'));
        });

        // // User-submitted transaction
        // DOM.elid('submit-oracle').addEventListener('click', () => {
        //     let flight = DOM.elid('flight-number').value;
        //     // Write transaction
        //     contract.fetchFlightStatus(flight, (error, noresult) => {
        //         display('Oracles', 'Trigger oracles', [ { label: 'Fetch Flight Status', error: error, value: result.flight + ' ' + result.timestamp} ]);
        //     });
        // })
    
    });

})();

function notifyUser(msg) {
    alert(msg);
}

function tempAlert(msg, duration)
{
 var el = document.createElement("div");
 el.setAttribute("class","sticky");
 el.innerHTML = msg;
 setTimeout(function(){
  el.parentNode.removeChild(el);
 },duration);
 document.body.appendChild(el);
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// Helpers
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

function copyToClipboard(element) {    
    navigator.clipboard.writeText(element.value);    
    tempAlert(`"${element.value}" copied to clipboard`, 2000);
}

function getSelectedItemFrom(fromList) {
    const DEBUG_AUTO_SELECTION = false;
    if (!DEBUG_AUTO_SELECTION)
    {
        if (fromList.selectedIndex < 0) {
            notifyUser(`No item selected in "${fromList.name}". Please select item and then click again.`);
            return;
        }    
    } else{
        // Automatically select index 0 if it exists (faster debugging)
        if (fromList.options.length == 0) {
            notifyUser("Empty sel: " + fromList.name);
            return;
        }
        if (fromList.selectedIndex < 0)
            fromList.selectedIndex = 0;
    }


    let addr = fromList.options[fromList.selectedIndex].text;
    return addr;
}

function clearSelectOptions(fromList) {
    while(fromList.options.length > 0 ) {
        fromList.options.remove(0);
    }    
}

const airlineNameToAddress = new Map();
const airlineAddressToName = new Map();

async function refreshMaps(contract) {
    airlineNameToAddress.clear();
    airlineAddressToName.clear();

    for(let i=0; i<contract.airlines.length; ++i) {
        const airline = contract.airlines[i];
        const reg = await contract.isRegisteredAirline(airline);
        if (reg) {
            const name = await contract.getRegisteredAirlineName(airline);
            airlineNameToAddress.set(name, airline);
            airlineAddressToName.set(airline, name);
        }
    }    
}

async function safeGetAirlineNameFromAddress(airline, contract) {
    if (!airlineAddressToName.has(airline)) {
        await refreshMaps(contract);
    }
    if (!airlineAddressToName.has(airline)) {
        notifyUser(`Could not find name for ${airline}.`)
        return null;
    }
    return airlineAddressToName.get(airline);
}

async function safeGetAirlineAddressFromName(name, contract) {
    if (!airlineNameToAddress.has(name)) {
        await refreshMaps(contract);
    }
    if (!airlineNameToAddress.has(name)) {
        notifyUser(`Could not find airline for ${name}.`)
        return null;
    }
    return airlineNameToAddress.get(name);    
}


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// Passenger
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
const knownPL = DOM.elid("knownPassengersList");
function refreshPassengerList(contract, refreshKnown)
{
    // Clear lists
    if (refreshKnown) {
        clearSelectOptions(knownPL);
    }        

    // Populate lists with appropriate info
    contract.passengers.forEach((passenger) => {
        if (refreshKnown) {
            knownPL.append(new Option(passenger));
        }
    })
    // TODO we could await the end of all the promises here
}

const availableFL = DOM.elid("availableFlightsList");
async function generateFutureFlights(contract) 
{
    // we are going to generate up to this number of flights
    const NUM_FLIGHTS = 8;

    // find which airlines are participating
    let participatingAirlines = [];
    for( let i=0; i<contract.airlines.length; ++i) {
        const airline = contract.airlines[i];
        const ret = await contract.isParticipatingAirline(airline);
        if (ret) {
            const name = await safeGetAirlineNameFromAddress(airline, contract);
            participatingAirlines.push(name);
        }
    }

    // we need at least one participating airline
    if (participatingAirlines.length == 0) {
        notifyUser("Can't find flights, since there are no participating airlines yet.");
        return;
    }

    const nowTS = Date.now();
    const offsetTSms = 5400000; // 1.5h in milliseconds is 5400000

    // iterate airlines until we have the desired number
    let nextAirlineIdx = 0;
    let flights = [];
    while(flights.length < NUM_FLIGHTS) {

        const flightAirline = participatingAirlines[nextAirlineIdx];
        const flightNumber = Math.floor(Math.random() * 998) + 1;
        const flightTS = nowTS + (offsetTSms * (flights.length + 1));
        const flightTime = new Date(flightTS).toLocaleString("en-US");
        flights.push(`${flightAirline} # ${flightNumber} # ${flightTime}`);

        nextAirlineIdx = (nextAirlineIdx + 1) % participatingAirlines.length;
    }

    clearSelectOptions(availableFL);
    flights.forEach((flight) => {
        availableFL.append(new Option(flight));
    })
}

const perPassengerIFL = DOM.elid("insuredFlightsPerPassengerList");
const aggregatedIFL = DOM.elid("insuredFlightsAggregatedList");
async function refreshInsuredFlightsList(contract)
{
    clearSelectOptions(perPassengerIFL);
    clearSelectOptions(aggregatedIFL);

    const flightAgg = new Map();

    const allInsuredFlights = await contract.getAllInsuredFlights();
    for (let i=0; i < allInsuredFlights.length; ++i) {
        const info = allInsuredFlights[i];
        const airlineName = await safeGetAirlineNameFromAddress(info.airline, contract);
        const flightTime = new Date(parseInt(info.timestamp)).toLocaleString("en-US");
        const passengerShort = info.passenger.substring(0, 6);
        const insuranceAmountEth = Web3.utils.fromWei(info.amountWei.toString(), "ether");
        const lineStr = `${airlineName} # ${info.flight} # ${flightTime} # ${passengerShort} # ${insuranceAmountEth} eth # Status: ${info.code}`;
        perPassengerIFL.append(new Option(lineStr));

        const aggKey = `${airlineName} # ${info.flight} # ${flightTime} # Status: ${info.code}`;
        const curVal = flightAgg.get(aggKey);
        const newVal = curVal != undefined ? curVal + 1 : 1;
        flightAgg.set(aggKey, newVal);
    }

    flightAgg.forEach( (v, k) => {
        const lineStr = `${k} # ${v} passengers`
        aggregatedIFL.append(new Option(lineStr));
    })
    
}

async function purchaseInsurance(contract) {
    // Grab flight information and client that wants insurance
    const flight = getSelectedItemFrom(availableFL);
    if (!flight) return;
    const fromPassenger = getSelectedItemFrom(knownPL);
    if (!fromPassenger) return;

    const insuranceAmountEth = parseFloat(DOM.elid("field-insuranceAmount").value);
    if (insuranceAmountEth <= 0 || insuranceAmountEth > 1.0 ) {
        notifyUser(`Selected amount (${insuranceAmountEth} eth) is not valid. It must be between 0.000000000000000001 and 1.0.`);
        return;
    }

    // parse flight
    const flightInfo = flight.split("#");
    const flightAirlineName = flightInfo[0].trim();
    const flightAirline = await safeGetAirlineAddressFromName(flightAirlineName, contract);
    const flightNumber = parseInt(flightInfo[1].trim());
    const flightTS = (new Date(flightInfo[2].trim())).getTime();

    // request contract to purchase the insurance
    const insuranceAmountWei = Web3.utils.toBN(Web3.utils.toWei(insuranceAmountEth.toString(), "ether"));
    contract.purchaseInsurance(flightAirline, flightNumber, flightTS, fromPassenger, insuranceAmountWei, 
        (e, r) => {
            if (e) {
                notifyUser(e);
            } else {
                // TODO to avoid async issues, all these refresh calls should be a requestToRefresh
                refreshInsuredFlightsList(contract);
            }
    });
}

const passengerCreditLbl = DOM.elid("lbl-passengerCredit");
async function queryPassengerCredit(contract) {
    const passenger = getSelectedItemFrom(knownPL);
    if (!passenger) return;

    refreshPassengerCredit(passenger, contract);
}

async function withdrawPassengerCredit(contract) {
    const passenger = getSelectedItemFrom(knownPL);
    if (!passenger) return;

    contract.withdrawPassengerCredit(passenger, (e, r) =>{
        if (e) {
            notifyUser(e);            
        } 
        refreshPassengerCredit(passenger, contract);        
    });
}

async function refreshPassengerCredit(passenger, contract) {
    contract.queryPassengerCredit(passenger, (e, r) => {
        if (e) {
            notifyUser(e);
            passengerCreditLbl.innerHTML = `Error querying credit.`;
        } else {
            const passengerShort = passenger.substring(0, 6) + "..";;
            const creditEth = Web3.utils.fromWei(r.toString(), "ether");
            passengerCreditLbl.innerHTML = `Passenger ${passengerShort} has a current credit of ${creditEth} ETH.`;
        }
    });    
}

async function fetchFlightStatus(contract) {
    const flight = getSelectedItemFrom(aggregatedIFL);
    if (!flight) return;

    const flightInfo = flight.split("#");
    const flightAirlineName = flightInfo[0].trim();
    const flightAirline = await safeGetAirlineAddressFromName(flightAirlineName);
    const flightNumber = parseInt(flightInfo[1].trim());
    const flightTS = (new Date(flightInfo[2].trim())).getTime();
    
    contract.fetchFlightStatus(flightAirline, flightNumber, flightTS, (e, ret) =>{
        if (e) {
            notifyUser(e);
        } else {            
            refreshOracleRequestList(contract);
        }
    })
    
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// Oracles
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
const oracleRequestL = DOM.elid("oracleRequestList");
async function refreshOracleRequestList(contract) {
    clearSelectOptions(oracleRequestL);

    const allOracleRequests = await contract.getAllOracleRequests();
    for (let i=0; i < allOracleRequests.length; ++i) {
        const info = allOracleRequests[i];

        const airlineName = await safeGetAirlineNameFromAddress(info.airline, contract);
        const flightTime = new Date(parseInt(info.timestamp)).toLocaleString("en-US");
        const status = info.isOpen ? "OPEN" : "CLOSED";        
        const lineStr = `${airlineName} # ${info.flight} # ${flightTime} # ${status} # ${info.statusCode}`;
        oracleRequestL.append(new Option(lineStr));
    }
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// Airline 
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
const knownAL = DOM.elid("knownAirlinesList");
const partAL = DOM.elid("participatingAirlinesList");
const regAL = DOM.elid("registeredAirlinesList");
const canAL = DOM.elid("candidateAirlinesList");

function refreshAirlineLists(contract, refreshKnown) {
    
    // Clear lists
    if (refreshKnown) {
        clearSelectOptions(knownAL);
    }        
    clearSelectOptions(partAL);
    clearSelectOptions(regAL);
    clearSelectOptions(canAL);

    // Populate lists with appropriate info
    contract.airlines.forEach((airline) => {
        if (refreshKnown) {
            knownAL.append(new Option(airline));
        }
        contract.isParticipatingAirline(airline, (e, ret) => {
            if (ret) {
                partAL.append(new Option(airline));
            } else {
                contract.isRegisteredAirline(airline, (e, ret) => {
                    if (ret) {
                        regAL.append(new Option(airline));
                    }
                })        
            }
        })
        contract.getCandidateAirlineVotes(airline, (e, ret) => {
            if (ret > 0) {
                canAL.append(new Option(airline + " | (" + ret +")"));
            }
        })
    })
    // TODO we could await the end of all the promises here
}

function registerAirline(contract) {

    // Grab airline account that performs the action
    const fromAcc = getSelectedItemFrom(partAL);
    if (!fromAcc) return;
    const regAcc = getSelectedItemFrom(knownAL);
    if (!regAcc) return;

    let name = "Air_" + regAcc.substring(0, 6); // TODO Better naming system (eg: UI field)
    contract.registerAirline(regAcc, name, fromAcc, (e, ret) => {
        if (e) {
            notifyUser(e);
        }

        // refresh status after the operation
        refreshAirlineLists(contract);
    })

}

function payAirlineFee(contract) {
    
    // Grac airline account that performs the action
    const fromAcc = getSelectedItemFrom(regAL);
    if (!fromAcc) return;

    // call the contract
    contract.payAirlineFee(fromAcc, (e, ret) => {
        if (e) {
            notifyUser(e);
        }

        // refresh status after the operation
        refreshAirlineLists(contract);
    })

}
 

// function display(title, description, results) {
//     let displayDiv = DOM.elid("display-wrapper");
//     let section = DOM.section();
//     section.appendChild(DOM.h2(title));
//     section.appendChild(DOM.h5(description));
//     results.map((result) => {
//         let row = section.appendChild(DOM.div({className:'row'}));
//         row.appendChild(DOM.div({className: 'col-sm-4 field'}, result.label));
//         row.appendChild(DOM.div({className: 'col-sm-8 field-value'}, result.error ? String(result.error) : String(result.value)));
//         section.appendChild(row);
//     })
//     displayDiv.append(section);

// }
