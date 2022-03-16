// migrating the appropriate contracts
var SquareVerifier = artifacts.require("Verifier");
var SolnSquareVerifier = artifacts.require("SolnSquareVerifier");

module.exports = function(deployer) {
  deployer.deploy(SquareVerifier).then((x=>{
    deployer.deploy(SolnSquareVerifier, SquareVerifier.address); 
  }));
  
};
