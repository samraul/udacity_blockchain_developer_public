import FlightSuretyData from '../../build/contracts/FlightSuretyData.json';
import FlightSuretyApp from '../../build/contracts/FlightSuretyApp.json';
import Config from './config.json';
import Web3 from 'web3';

export default class Contract {
    constructor(network, callback) {

        let config = Config[network];
        this.web3_local = new Web3(new Web3.providers.HttpProvider(config.url));
        this.flightSuretyData = new this.web3_local.eth.Contract(FlightSuretyData.abi, config.dataAddress);
        this.flightSuretyApp = new this.web3_local.eth.Contract(FlightSuretyApp.abi, config.appAddress);
        this.owner = null;
        this.airlines = [];        
        this.passengers = [];

        // Increase low gas limit since some operations would otherwise fail
        this.flightSuretyData.options.gas = 200000;
        this.flightSuretyApp.options.gas = 200000;

        this.initialize(callback);
    }

    initialize(callback) {
        this.web3_local.eth.getAccounts((error, accts) => {
           
            this.owner = accts[0];

            let counter = 1;

            const minAccounts = 11;
            if (accts.length < minAccounts) {
                throw new Error("Need at least " + minAccounts + " accounts. Found " + accts.length + ".");
            }
            
            while(this.airlines.length < 5) {
                this.airlines.push(accts[counter++]);                
            }

            while(this.passengers.length < 5) {
                this.passengers.push(accts[counter++]);
            }

            // authorize logic contract to call app contract, and then return
            this.flightSuretyData.methods
                .authorizeCaller(this.flightSuretyApp.options.address)
                .send({from: this.owner})
                .then(callback)                
        });        
    }

    isOperational(callback) {
        let self = this;
        self.flightSuretyApp.methods
            .isOperational()
            .call({ from: self.owner}, callback);
    }

    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // Airline related
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    isParticipatingAirline(airline, callback) {
        let self = this;
        return self.flightSuretyData.methods
            .isParticipatingAirline(airline)
            .call({ from: self.owner}, callback);
    }

    isRegisteredAirline(airline, callback) {
        let self = this;
        return self.flightSuretyData.methods
            .isRegisteredAirline(airline)
            .call({ from: self.owner}, callback);
    }

    isCandidateAirline(airline, callback) {
        let self = this;
        return self.flightSuretyData.methods
            .isCandidateAirline(airline)
            .call({ from: self.owner}, callback);
    }

    getCandidateAirlineVotes(airline, callback) {
        let self = this;
        return self.flightSuretyData.methods
            .getCandidateAirlineVotes(airline)
            .call({ from: self.owner}, callback);
    }

    getRegisteredAirlineName(airline) {
        let self = this;
        return self.flightSuretyData.methods
            .getRegisteredAirlineName(airline)
            .call({ from: self.owner});
    }

    registerAirline(airline, airlineName, fromAcc, callback) {
        let self = this;
        self.flightSuretyApp.methods
            .registerAirline(airline, airlineName)
            .send({from: fromAcc}, callback)
            .catch((x) => {console.log(x)})
    }

    async payAirlineFee(fromAcc, callback) {
        let self = this;
        // automatically ask for the participation fee to the contract
        const fee = await self.flightSuretyApp.methods.AIRLINE_PARTICIPATION_FEE().call({from: self.owner});
        self.flightSuretyApp.methods
            .payAirlineFee()
            .send({from: fromAcc, value: fee}, callback)        
    }

    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // Flight
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    purchaseInsurance(flightAirline, flightNumber, flightTimestamp, fromPassenger, insuranceAmountWei, callback) {
        let self = this;
        self.flightSuretyApp.methods
            .purchaseInsurance(flightAirline, flightNumber, flightTimestamp)
            .send({from:fromPassenger, value: insuranceAmountWei}, (error, result) => {
                callback(error, result);
            });
    }

    async getAllInsuredFlights() {

        const flightStatusCodes = new Map();

        // leverage events to provide this information
        const events = await this.flightSuretyApp.getPastEvents('FlightInsurancePurchased', {fromBlock: 0, toBlock: 'latest'});
        const allTuples = new Array();
        for(let i=0; i<events.length; ++i) {
            const event = events[i];
            const rv = event.returnValues;

            const key = rv.airline + "" + rv.flight + "" + rv.timestamp;
            if (!flightStatusCodes.has(key)) {
                flightStatusCodes[key] = await this.flightSuretyData.methods
                .getFlightStatus(rv.airline, rv.flight, rv.timestamp)
                .call();
            }

            allTuples.push({airline: rv.airline, flight: rv.flight, timestamp: rv.timestamp, passenger: rv.passenger, amountWei: rv.amountWei, code: flightStatusCodes[key]});
        }
        return allTuples;
    }

    fetchFlightStatus(airline, flightNumber, flightTS, callback) {
        // send request to contract
        // Note: we are sending always from self.owner, instead of the passenger requesting it. That's
        // an easy change, but it doesn't change much for our purposes, since block hash changes quickly,
        // providing already a different index in oracles.
        let self = this; 
        self.flightSuretyApp.methods
            .fetchFlightStatus(airline, flightNumber, flightTS)
            .send({ from: self.owner}, (error, result) => {
                callback(error, result);
            });
    }

    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // Oracles
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    async getAllOracleRequests() {
        // leverage events to provide this information
        const events = await this.flightSuretyApp.getPastEvents('OracleRequest', {fromBlock: 0, toBlock: 'latest'});
        const allTuples = new Array();
        for(let i=0; i<events.length; ++i) {
            const event = events[i];
            const rv = event.returnValues;            
            const isOpen = await this.flightSuretyApp.methods
            .isOracleRequestOpenForIndex(rv.airline, rv.flight, rv.timestamp, rv.index)
            .call();

            const statusCode = await this.flightSuretyData.methods
            .getFlightStatus(rv.airline, rv.flight, rv.timestamp)
            .call();

            allTuples.push({airline: rv.airline, flight: rv.flight, timestamp: rv.timestamp, isOpen: isOpen, statusCode: statusCode});
        }
        return allTuples;
    }

    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // Passengers
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    async queryPassengerCredit(passenger, callback) {
        let self = this;
        self.flightSuretyData.methods
            .queryPassengerCredit()
            .call({from: passenger}, callback);        

        this.web3_local.eth.getBalance(this.flightSuretyData.options.address, (e, x) =>{
            console.log(`Data Balance = ${Web3.utils.fromWei(x.toString(), "ether")} eth`);
        })
        this.web3_local.eth.getBalance(this.flightSuretyApp.options.address, (e, x) =>{
            console.log(`App Balance = ${Web3.utils.fromWei(x.toString(), "ether")} eth`);
        })    
    }

    async withdrawPassengerCredit(passenger, callback) {
        let self = this;        
        self.flightSuretyApp.methods
            .withdrawCredit()
            .send({from: passenger}, callback);        
    }
}
