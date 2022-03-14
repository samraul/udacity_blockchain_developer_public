// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../node_modules/openzeppelin-solidity/contracts/utils/math/SafeMath.sol";

contract FlightSuretyData {
    using SafeMath for uint256;

    /********************************************************************************************/
    /*                                       DATA VARIABLES                                     */
    /********************************************************************************************/

    address private contractOwner;                                  // Account used to deploy contract
    bool private operational = true;                                // Blocks all state changes throughout the contract if false

    mapping(address => bool) private authorizedContracts;           // Logic contracts that are authorized to operate on this data

    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // Airline data
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    // Airlines that are fully registered (not candidates anymore)
    struct Airline {
        bool isKnown;               // Always true (to check existance)
        bool paidParticipationFee;  // True if the airline has paid the participation fee, false otherwise
        string name;                // Human-readable airline name
    }

    // Airlines that are candidates to be registered (not registered yet)
    struct CandidateAirline {
        Airline info;                       // Airline information (see Airline)
        uint256 votes;                      // Current number of votes this airline has to be registered
    }

    uint256 private registeredAirlineCount = 0;                     // Number of registered airlines in the mapping
    mapping(address => Airline) private registeredAirlines;         // Registered airlines indexed by their own address    
    mapping(address => CandidateAirline) private candidateAirlines; // Airlines not yet fully registered (pending votes)
    mapping(address => mapping(address => bool)) candidateVoters;   // Voters for each candidate

    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // Insurance data
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    struct InsuredData {
        uint256 originalAmountWei;  // How much the passenger paid
        uint256 payoutAmountWei;    // How much they would get if the flight was delayed due to the airline (could also be not recorded)
        bool wasCredited;           // Set to true when the amount is credited for the passenger on a given insurance premium
    }
mapping(bytes32 => address[]) private insuredPassengers;                                // flightKey -> passenger (for payment iteration)
    mapping(bytes32 => mapping(address => InsuredData)) private insuredPassengersData;  // flightKey -> passenger -> data (for individual search search)
    mapping(bytes32 => uint8) private flightStatus;                                     // flightKey -> flightStatus

    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // Credit data
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    mapping(address => uint256) private passengerCredit;    // passenger -> current credit

    /********************************************************************************************/
    /*                                       EVENT DEFINITIONS                                  */
    /********************************************************************************************/

    /**
    * @dev Constructor
    *      The deploying account becomes contractOwner
    */
    constructor(address firstAirline, string memory firstAirlineName)
    {
        contractOwner = msg.sender;
        registeredAirlines[firstAirline] = Airline(true, false, firstAirlineName);
        registeredAirlineCount = 1;
    }

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
        require(operational, "Contract is currently not operational");
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

    modifier requireIsCallerAuthorized()
    {
        require(authorizedContracts[msg.sender], "Caller is not authorized.");
        _;
    }

    /********************************************************************************************/
    /*                                       UTILITY FUNCTIONS                                  */
    /********************************************************************************************/

    /**
    * @dev Get operating status of contract
    *
    * @return A bool that is the current operating status
    */      
    function isOperational() 
                            public 
                            view 
                            returns(bool) 
    {
        return operational;
    }


    /**
    * @dev Sets contract operations on/off
    *
    * When operational mode is disabled, all write transactions except for this one will fail
    */    
    function setOperatingStatus
                            (
                                bool mode
                            ) 
                            external
                            requireContractOwner 
    {
        operational = mode;
    }

    /** 
    * @notice Adds an authorized logic contract that can call state changing functions.
    */
    function authorizeCaller(address contractAddress) external 
        requireContractOwner
    {
        authorizedContracts[contractAddress] = true;
    }

    /** 
    * @notice Removes a contract from being authorized to perform state changing functions.
    * @dev The last contract can remove itself, locking the data contract as immutable forever.
    */
    function deauthorizeCaller(address contractAddress) external 
        requireContractOwner
    {
        delete authorizedContracts[contractAddress];
    }

    function isCallerAuthorized(address contractAddress) external view returns (bool)
    {
        return authorizedContracts[contractAddress];
    }

    /********************************************************************************************/
    /*                                     SMART CONTRACT FUNCTIONS                             */
    /********************************************************************************************/

   /**
    * @notice Add an airline to the registration queue.
    */   
    function registerAirline(address airline, string memory airlineName) external
                            requireIsCallerAuthorized
                            requireIsOperational
    {
        require(airline != address(0), "Can't register null address.");
        require(!registeredAirlines[airline].isKnown, "Airline is already registered.");

        // add to mapping
        registeredAirlines[airline] = Airline(true, false, airlineName);
        ++registeredAirlineCount;
    }

    function addCandidateAirline(address airline, string memory airlineName, address fromVoter) external
                                requireIsCallerAuthorized
                                requireIsOperational
    {
        require(airline != address(0), "Can't add null address.");
        require(airline != fromVoter, "Can't vote same address.");
        require(!isCandidateAirline(airline), "Can't add a vote to a non-candidate address.");

        // add to mapping with one vote
        candidateAirlines[airline] = CandidateAirline(Airline(true, false, airlineName), 1);
        candidateVoters[airline][fromVoter] = true;
    }

    function addCandidateAirlineVote(address airline, address fromVoter) external
                                requireIsCallerAuthorized
                                requireIsOperational
                                returns (uint256)
    {
        require(airline != address(0), "Can't vote null address.");
        require(airline != fromVoter, "Can't vote same address.");
        require(isCandidateAirline(airline), "Can't add a vote to a non-candidate address.");
        require(!isVoterOf(airline, fromVoter), "The caller has already voted to register the candidate.");

        // add one vote to the candidate
        candidateVoters[airline][fromVoter] = true;
        return ++candidateAirlines[airline].votes;        
    }

    function getRegisteredAirlineName(address airline) external view 
                                    requireIsOperational
                                    returns(string memory) 
    {
        require(isRegisteredAirline(airline), "Airline not registered.");
        return registeredAirlines[airline].name;
    }

    function removeCandidateAirline(address airline) external
                                    requireIsOperational
                                    requireIsCallerAuthorized
    {
        delete candidateAirlines[airline];
    }

    function isRegisteredAirline(address airline) public view
                                requireIsOperational
                                returns (bool)
    {
        return registeredAirlines[airline].isKnown;
    }

    function isParticipatingAirline(address airline) public view
                                requireIsOperational
                                returns (bool)
    {
        return registeredAirlines[airline].isKnown && registeredAirlines[airline].paidParticipationFee;
    }

    function isCandidateAirline(address airline) public view
                                requireIsOperational
                                returns (bool)
    {
        return candidateAirlines[airline].info.isKnown;
    }

    function getCandidateAirlineVotes(address airline) public view
                                requireIsOperational
                                returns (uint256)
    {
        return candidateAirlines[airline].votes;
    }

    function isVoterOf(address airline, address fromVoter) public view
                                requireIsOperational
                                returns (bool)
    {
        return candidateVoters[airline][fromVoter];
    }

    function recordAirlineParticipationFee(address airline) external
                                            requireIsOperational
                                            requireIsCallerAuthorized                                            
    {
        require(isRegisteredAirline(airline), "Unknown airline trying to pay the fee.");
        require(!isParticipatingAirline(airline), "Airline trying to pay the fee is already participating.");
        registeredAirlines[airline].paidParticipationFee = true;
    }

    function getRegisteredAirlineCount() external view 
                                    requireIsOperational
                                    returns (uint256)
    {
        return registeredAirlineCount;
    }

    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // Flight status
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    function getFlightStatus(address airline, uint256 flight, uint256 timestamp) public view 
                            requireIsOperational
                            returns(uint8) 
    {
        bytes32 flightKey = getFlightKey(airline, flight, timestamp);
        return flightStatus[flightKey];
    }

    function recordFlightStatus(address airline, uint256 flight, uint256 timestamp, uint8 statusCode) external
                            requireIsOperational
                            requireIsCallerAuthorized
    {
        bytes32 flightKey = getFlightKey(airline, flight, timestamp);
        flightStatus[flightKey] = statusCode;
    }    

    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // Insurance
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

   /**
    * @dev Buy insurance for a flight
    */   
    function buy(address passenger, address airline, uint256 flight, uint256 timestamp, uint256 payoutAmountWei)
                external
                payable
                requireIsOperational
                requireIsCallerAuthorized
    {
        bytes32 flightKey = getFlightKey(airline, flight, timestamp);
        require(!isInsured(passenger, airline, flight, timestamp), "Passenger is already insured for the given flight.");

        insuredPassengers[flightKey].push(passenger);
        insuredPassengersData[flightKey][passenger] = InsuredData({
                                                                    originalAmountWei: msg.value,
                                                                    payoutAmountWei: payoutAmountWei,
                                                                    wasCredited: false
                                                                });
    }

    function isInsured(address passenger, address airline, uint256 flight, uint256 timestamp) public view 
                    requireIsOperational
                    returns(bool) 
    {
        bytes32 flightKey = getFlightKey(airline, flight, timestamp);
        return insuredPassengersData[flightKey][passenger].originalAmountWei > 0;
    }


    /**
     *  @dev Credit insurees for the amount in their insurance
    */
    function creditInsurees(address airline, uint256 flight, uint256 timestamp) external
                            requireIsOperational
                            requireIsCallerAuthorized
    {
        // This could also be in the logic contract. If one operation fails in the loop, all insurees will
        // fail to get paid.
        bytes32 flightKey = getFlightKey(airline, flight, timestamp);
        address[] memory insurees = insuredPassengers[flightKey];
        for(uint i; i < insurees.length; i++) {
            // check if we still have to credit this passenger
            address insuree = insurees[i];
            InsuredData memory insuredData = insuredPassengersData[flightKey][insuree];
            if (insuredData.payoutAmountWei > 0 && !insuredData.wasCredited) {
                // we should credit this passenger
                insuredData.wasCredited = true; // flag as credited
                passengerCredit[insuree] = passengerCredit[insuree].add(insuredData.payoutAmountWei); // add credit
            }
        }
    }

    function queryPassengerCredit() external view
            requireIsOperational
            returns(uint256)
    {
        return passengerCredit[msg.sender];
    }

    
    /**
     *  @dev Transfers eligible payout funds to insuree
     *
    */
    function pay(address payable passenger) external 
            requireIsOperational
            requireIsCallerAuthorized
    {
        require(passenger != address(0), "Invalid passenger.");
        require(passengerCredit[passenger] > 0, "Passenger does not have any current credits.");

        // reset the credit for the passnder
        uint256 credit = passengerCredit[passenger];
        passengerCredit[passenger] = 0;
        payable(passenger).transfer(credit);
    }

   /**
    * @dev Initial funding for the insurance. Unless there are too many delayed flights
    *      resulting in insurance payouts, the contract should be self-sustaining
    *
    */   
    function fund() public payable { }

    function getFlightKey(address airline, uint256 flight, uint256 timestamp ) pure internal
                        returns(bytes32) 
    {
        return keccak256(abi.encodePacked(airline, flight, timestamp));
    }

    /**
    * @dev Fallback function for funding smart contract.
    *
    */
    fallback() external payable                             
    {
        fund();
    }

}
