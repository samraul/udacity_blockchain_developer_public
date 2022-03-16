pragma solidity >=0.4.21 <0.6.0;

// TODO define a contract call to the zokrates generated solidity contract <Verifier> or <renamedVerifier>
import "./ERC721Mintable.sol";
import "./SquareVerifier.sol";

// DONE define another contract named SolnSquareVerifier that inherits from your ERC721Mintable class
contract SolnSquareVerifier is RSRealStateToken {
    Verifier private _verifierContract;

    constructor(address verifierAddress) public {
        _verifierContract = Verifier(verifierAddress);
    }

    // The struct an array have no use for the requirements :/    
    // // DONE define a solutions struct that can hold an index & an address
    // struct Solution {
    //     uint256 index;
    //     address add;
    // }
    // // DONE define an array of the above struct
    // Solution[] private solutionsArray;

    // DONE define a mapping to store unique solutions submitted
    mapping(bytes32 => bool) solutionsByKey;

    // DONE Create an event to emit when a solution is added
    event SolutionAdded(bytes32 key);

    modifier verifiedSolution(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[2] memory input
    ) {
        // check that the solution is unique
        bytes32 solKey = keccak256(abi.encodePacked(a, b, c, input));
        require(!solutionsByKey[solKey], "Solution already used.");

        // verify the solution
        bool verified = _verifierContract.verifyTx(a, b, c, input);
        require(verified, "Proof verification failed.");

        _; // body
    }

    // DONE Create a function to add the solutions to the array and emit the event
    function _addSolution(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[2] memory input
    ) internal {
        // add the solution to the mapping
        bytes32 solKey = keccak256(abi.encodePacked(a, b, c, input));
        solutionsByKey[solKey] = true;
        emit SolutionAdded(solKey);
    }

    // DONE Create a function to mint new NFT only after the solution has been verified
    //  - make sure the solution is unique (has not been used before)
    //  - make sure you handle metadata as well as tokenSuplly
    function mintVerified(
        address to,
        uint256 tokenId,
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[2] memory input
    ) public verifiedSolution(a, b, c, input) returns (bool) {
        if(super.mint(to, tokenId)) {
            _addSolution(a, b, c, input);
            return true;
        }
        return false;
    }

    function mintVerifiedWithURI(
        address to,
        uint256 tokenId,
        string memory tokenURI,
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[2] memory input
    ) public verifiedSolution(a, b, c, input) returns (bool) {        
        if(super.mintWithURI(to, tokenId, tokenURI)) {
            _addSolution(a, b, c, input);
            return true;
        }
        return false;        
    }
}
