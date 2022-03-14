// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

// It's important to avoid vulnerabilities due to numeric overflow bugs
// OpenZeppelin's SafeMath library, when used correctly, protects agains such bugs
// More info: https://www.nccgroup.trust/us/about-us/newsroom-and-events/blog/2018/november/smart-contract-insecurity-bad-arithmetic/

import "../node_modules/openzeppelin-solidity/contracts/utils/math/SafeMath.sol";
import "./FlightSuretyData.sol";

/************************************************** */
/* FlightSurety Smart Contract                      */
/************************************************** */
contract FlightSuretyApp {
    using SafeMath for uint256; // Allow SafeMath functions to be called for all uint256 types (similar to "prototype" in Javascript)

    /********************************************************************************************/
    /*                                       DATA VARIABLES                                     */
    /********************************************************************************************/

    // Flight status codees
    uint8 private constant STATUS_CODE_UNKNOWN = 0;
    uint8 private constant STATUS_CODE_ON_TIME = 10;
    uint8 private constant STATUS_CODE_LATE_AIRLINE = 20;
    uint8 private constant STATUS_CODE_LATE_WEATHER = 30;
    uint8 private constant STATUS_CODE_LATE_TECHNICAL = 40;
    uint8 private constant STATUS_CODE_LATE_OTHER = 50;

    address private contractOwner;          // Account used to deploy contract

    struct Flight {
        bool isRegistered;
        uint8 statusCode;
        uint256 updatedTimestamp;        
        address airline;
    }
    mapping(bytes32 => Flight) private flights;

    uint256 public constant AIRLINES_PRE_CONSENSUS = 4;             // Number of airlines that can be registered before voting system
    uint256 public constant AIRLINE_CONSENSUS_PERCENT = 50;         // % of registered airline votes required to register a new one
    uint256 public constant AIRLINE_PARTICIPATION_FEE = 10 ether;   // Fee airlines must pay after registration to become participants

    FlightSuretyData private dataContract;

    uint256 public constant INSURANCE_AMOUNT_MIN_WEI = 1;
    uint256 public constant INSURANCE_AMOUNT_MAX_WEI = 1000000000000000000; // 1eth

    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // Events
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    event AirlineRegistered(address airline, string name);   // An airline has passed the register threshold
    event AirlineVoted(address airline, address fromVoter, uint votes);  // An airline has received a vote to register

    event FlightInsurancePurchased(address airline, uint256 flight, uint256 timestamp, address passenger, uint256 amountWei);

    /********************************************************************************************/
    /*                                       FUNCTION MODIFIERS                                 */
    /********************************************************************************************/

    // Modifiers help avoid duplication of code. They are typically used to validate something
    // before a function is allowed to be executed.

    /**
    * @dev Modifier that requires the "operational" boolean variable to be "true"
    *      This is used on all state changing functions to pause the contract in 
    *      the event there is an issue that needs to be fixed
    */
    modifier requireIsOperational() 
    {
        require(isOperational(), "Contract is currently not operational");  
        _;  // All modifiers require an "_" which indicates where the function body will be added
    }

    /**
    * @dev Modifier that requires the "ContractOwner" account to be the function caller
    */
    modifier requireContractOwner()
    {
        require(msg.sender == contractOwner, "Caller is not contract owner");
        _;
    }

    /********************************************************************************************/
    /*                                       CONSTRUCTOR                                        */
    /********************************************************************************************/

    /**
    * @dev Contract constructor
    *
    */
    constructor
                                (       
                                    address dataContractAddress
                                )
    {
        contractOwner = msg.sender;
        dataContract = FlightSuretyData(payable(dataContractAddress));
    }

    /********************************************************************************************/
    /*                                       FUNCTION MODIFIERS                                 */
    /********************************************************************************************/

    modifier sendRemainderBackToAirline() {
        _;
        uint amountToReturn = msg.value - AIRLINE_PARTICIPATION_FEE;
        payable(msg.sender).transfer(amountToReturn);
    }

    modifier sendRemainderBackToOracle() {
        _;
        uint amountToReturn = msg.value - REGISTRATION_FEE;
        payable(msg.sender).transfer(amountToReturn);
    }

    /********************************************************************************************/
    /*                                       UTILITY FUNCTIONS                                  */
    /********************************************************************************************/

    function isOperational() 
                            public 
                            view
                            returns(bool) 
    {
        return dataContract.isOperational();
    }

    /********************************************************************************************/
    /*                                     SMART CONTRACT FUNCTIONS                             */
    /********************************************************************************************/

    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // Airline related
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    /**
    * @dev Add an airline to the registration queue.
    *
    */   
    function registerAirline(address airline, string memory airlineName)
                            external                            
                            requireIsOperational
    {
        // calling airline should be registered and participating
        require(dataContract.isParticipatingAirline(msg.sender), "Calling airline is not registered or has not paid participation fee.");
        // new airline should not be already registered
        require(!dataContract.isRegisteredAirline(airline), "Airline is already registered.");

        uint256 registeredAirlineCount = dataContract.getRegisteredAirlineCount();
        uint256 currentCandidateVotes = 1;

        // depending on pre/post voting system        
        if ( registeredAirlineCount < AIRLINES_PRE_CONSENSUS )
        {
            // we are pre-voting system, add the airline bypassing vote system
            dataContract.registerAirline(airline, airlineName);
            emit AirlineRegistered(airline, airlineName);
        } 
        else
        {

            // we are post-voting system, add a vote and see if it passes the threshold            
            if ( dataContract.isCandidateAirline(airline) ) {
                // add a vote to existing and retrieve how many total votes it has
                currentCandidateVotes = dataContract.addCandidateAirlineVote(airline, msg.sender);
                emit AirlineVoted(airline, msg.sender, currentCandidateVotes);
            } else {
                // first vote to non-existing
                dataContract.addCandidateAirline(airline, airlineName, msg.sender);
                emit AirlineVoted(airline, msg.sender, currentCandidateVotes);
            }

            // compare percent to required percent (note this may round computation)            
            uint requiredVotes = registeredAirlineCount.mul(AIRLINE_CONSENSUS_PERCENT).div(100);
            if (currentCandidateVotes >= requiredVotes) {
                // airline ready to be registered, promote from candidate to registered
                dataContract.removeCandidateAirline(airline);
                dataContract.registerAirline(airline, airlineName);
                emit AirlineRegistered(airline, airlineName);
            }
        }
    }

    function payAirlineFee() external payable 
                            sendRemainderBackToAirline
                            requireIsOperational
    {
        require(dataContract.isRegisteredAirline(msg.sender), "Airline must be registered before paying the fee.");
        require(!dataContract.isParticipatingAirline(msg.sender), "Airline has already paid the participation fee.");
        require(msg.value >= AIRLINE_PARTICIPATION_FEE, "Not enought funds to pay participation fee.");

        dataContract.recordAirlineParticipationFee(msg.sender);        
        dataContract.fund{ value: AIRLINE_PARTICIPATION_FEE }();
    }

    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // Insurance
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

   /**
    *
    */  
    function purchaseInsurance(address airline, uint256 flight, uint256 timestamp)
                                external                                
                                payable
                                requireIsOperational
    {        
        require(msg.value >= INSURANCE_AMOUNT_MIN_WEI && msg.value <= INSURANCE_AMOUNT_MAX_WEI, "Invalid insurance amount.");
        require(!dataContract.isInsured(msg.sender, airline, flight, timestamp), "Passenger is already insured for the given flight.");
        require(!isFlightResolved(airline, flight, timestamp), "Flight is already closed; can't purchase insurance.");

        // TODO require timestamp to be more than 30 mins from last
        // TODO we could ask oracles as well for the current timestamp instead of trusting block.timestamp

        // if all is good, go ahead with the purchase, passing in the ethereum value to the data contract
        uint256 payoutAmount = msg.value.mul(15).div(10);
        dataContract.buy{ value: msg.value }(payable(msg.sender), airline, flight, timestamp, payoutAmount);

        emit FlightInsurancePurchased(airline, flight, timestamp, msg.sender, msg.value);
    }
    
    function withdrawCredit() external {
        // for now delegate on the data contract
        dataContract.pay(payable(msg.sender));
    }

    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // Flight
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    function isFlightResolved(address airline, uint256 flight, uint256 timestamp) internal view                             
                            returns(bool) 
    {
        return dataContract.getFlightStatus(airline, flight, timestamp) != STATUS_CODE_UNKNOWN;
    }

   /**
    * @dev Called after oracle has updated flight status
    *
    */  
    function processFlightStatus(address airline, uint256 flight, uint256 timestamp, uint8 statusCode) internal                                
    {
        // process responses from oracles
        require(!isFlightResolved(airline, flight, timestamp), "The given flight already has a status.");

        bytes32 key = getFlightKey(airline, flight, timestamp);

        // flag the request as close, so we do not process more oracle responses
        oracleRequests[key].isOpen = false;

        // record the flight status in the data
        dataContract.recordFlightStatus(airline, flight, timestamp, statusCode);

        // if the statusCode reflects airline delay, we need to credit the insured passengers.
        if (statusCode == STATUS_CODE_LATE_AIRLINE) {
            dataContract.creditInsurees(airline, flight, timestamp);
        }

    }

    // Generate a request for oracles to fetch flight information
    function fetchFlightStatus(address airline, uint256 flight, uint256 timestamp)
                                external
                                requireIsOperational
    {
        require(msg.sender != address(0), "Invalid requester.");
        require(!isFlightResolved(airline, flight, timestamp), "The given flight already has a status.");

        bytes32 key = getFlightKey(airline, flight, timestamp);

        // check whether we already have a request for this airline/flight/timestamp
        require(oracleRequests[key].requester == address(0), "Request already in progress.");

        // ok, this is a new request. We will ask new oracles about it

        // choose which oracles will reply to this request
        uint8 index = getRandomIndex(msg.sender);

        // Generate a unique key for storing the request
        oracleRequests[key] = RequestInfo({
                                                requester: msg.sender,
                                                isOpen: true,
                                                index: index
                                            });

        emit OracleRequest(index, airline, flight, timestamp);
    } 


// region ORACLE MANAGEMENT

    // Incremented to add pseudo-randomness at various points
    uint8 private nonce = 0;    

    // Fee to be paid when registering oracle
    uint256 public constant REGISTRATION_FEE = 1 ether;

    // Number of oracles that must respond for valid status
    uint256 private constant MIN_RESPONSES = 3;

    struct Oracle {
        bool isRegistered;
        uint8[3] indexes;        
    }

    // Track all registered oracles
    mapping(address => Oracle) private oracles;

    // Model for responses from oracles
    struct RequestInfo {
        address requester;                              // Account that requested status
        bool isOpen;                                    // If open, oracle responses are accepted
        uint8 index;                                    // Index generated for this request to select oracles
        // solidity 0.8.0 does not allow mapping in structs, so I have to do another mapping for this
        // mapping(uint8 => address[]) responses;          // Mapping key is the status code reported
        //                                                 // This lets us group responses and identify
        //                                                 // the response that majority of the oracles
    }

    // Track all oracle responses
    // Key = hash(airline, flight, timestamp)
    mapping(bytes32 => RequestInfo) private oracleRequests;
    mapping(bytes32 => mapping(uint8 => address[])) private oracleResponsesByCode;

    // Event fired each time an oracle submits a response
    event OracleReport(address airline, uint256 flight, uint256 timestamp, uint8 status);
    // Event fired when consensus is reached
    event FlightStatusInfo(address airline, uint256 flight, uint256 timestamp, uint8 status);

    // Event fired when flight status request is submitted
    // Oracles track this and if they have a matching index
    // they fetch data and submit a response
    event OracleRequest(uint8 index, address airline, uint256 flight, uint256 timestamp);

    // Register an oracle with the contract
    function registerOracle() external payable
                            requireIsOperational
                            sendRemainderBackToOracle
    {
        // Require registration fee
        require(msg.value >= REGISTRATION_FEE, "Registration fee is required");

        uint8[3] memory indexes = generateIndexes(msg.sender);

        oracles[msg.sender] = Oracle({
                                        isRegistered: true,
                                        indexes: indexes
                                    });

        // pass on the ethereum value to the dataContract
        dataContract.fund{ value: REGISTRATION_FEE }();
    }

    function isOracleRegistered() public view 
                            requireIsOperational
                            returns(bool) 
    {
        return oracles[msg.sender].isRegistered;
    }

    function isOracleRequestOpenForIndex(address airline, uint256 flight, uint256 timestamp, uint8 index) external view 
                                        requireIsOperational
                                        returns(bool) 
    {
        bytes32 key = getFlightKey(airline, flight, timestamp);
        return oracleRequests[key].isOpen && oracleRequests[key].index == index;
    }

    function getMyIndexes() view external 
                        requireIsOperational    
                        returns(uint8[3] memory)
    {
        require(isOracleRegistered(), "Not registered as an oracle");
        return oracles[msg.sender].indexes;
    }

    // Called by oracle when a response is available to an outstanding request
    // For the response to be accepted, there must be a pending request that is open
    // and matches one of the three Indexes randomly assigned to the oracle at the
    // time of registration (i.e. uninvited oracles are not welcome)
    function submitOracleResponse(uint8 index, address airline, uint256 flight, uint256 timestamp, uint8 statusCode) 
                                external
                                requireIsOperational
    {
        bytes32 key = getFlightKey(airline, flight, timestamp); 
        require(oracleRequests[key].isOpen, "This oracle request is not open.");
        require(oracleRequests[key].index == index, "The given index does not match the request's index.");
        require(oracles[msg.sender].isRegistered, "The caller is not a registered oracle.");
        require((oracles[msg.sender].indexes[0] == index) || (oracles[msg.sender].indexes[1] == index) || (oracles[msg.sender].indexes[2] == index), "Index does not match oracle indexes.");

        // TODO We should check here that the same oracle doesn't reply more than once. However we can assume for this
        // exercise that the response is the same when it comes from the same oracle. A way of checking this requirement
        // is recording which addresses have already vote for which request keys

        // if the oracle doesn't know the status, we do not do anything yet with it
        if (statusCode == STATUS_CODE_UNKNOWN) {
            return;
        }

        // record status code
        oracleResponsesByCode[key][statusCode].push(msg.sender);

        // Information isn't considered verified until at least MIN_RESPONSES
        emit OracleReport(airline, flight, timestamp, statusCode);
        if (oracleResponsesByCode[key][statusCode].length >= MIN_RESPONSES) {

            emit FlightStatusInfo(airline, flight, timestamp, statusCode);

            // Handle flight status as appropriate
            processFlightStatus(airline, flight, timestamp, statusCode);
        }
    }

    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // Helpers
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    function getFlightKey(address airline, uint256 flight, uint256 timestamp) pure internal 
                            returns(bytes32) 
    {
        return keccak256(abi.encodePacked(airline, flight, timestamp));
    }

    // Returns array of three non-duplicating integers from 0-9
    function generateIndexes
                            (                       
                                address account         
                            )
                            internal
                            returns(uint8[3] memory)
    {
        uint8[3] memory indexes;
        indexes[0] = getRandomIndex(account);
        
        indexes[1] = indexes[0];
        while(indexes[1] == indexes[0]) {
            indexes[1] = getRandomIndex(account);
        }

        indexes[2] = indexes[1];
        while((indexes[2] == indexes[0]) || (indexes[2] == indexes[1])) {
            indexes[2] = getRandomIndex(account);
        }

        return indexes;
    }

    // Returns array of three non-duplicating integers from 0-9
    function getRandomIndex
                            (
                                address account
                            )
                            internal
                            returns (uint8)
    {
        uint8 maxValue = 10;

        // Pseudo random number...the incrementing nonce adds variation
        uint8 random = uint8(uint256(keccak256(abi.encodePacked(blockhash(block.number - nonce++), account))) % maxValue);

        if (nonce > 250) {
            nonce = 0;  // Can only fetch blockhashes for last 256 blocks so we adapt
        }

        return random;
    }

// endregion

}   
