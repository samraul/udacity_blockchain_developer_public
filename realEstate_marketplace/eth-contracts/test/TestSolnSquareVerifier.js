// requirement: Test if a new solution can be added for contract - SolnSquareVerifier
//   | - note: my funcion is internal so this will be tested by attempted to reuse a proof
// requirement: Test if an ERC721 token can be minted for contract - SolnSquareVerifier

var SquareVerifier = artifacts.require('Verifier');
var SolnSquareVerifier = artifacts.require('SolnSquareVerifier');
fs = require('fs');

contract('SolnSquareVerifier', accounts => {

    const account_one = accounts[0];
    const account_two = accounts[1];

    describe("test SolnSquareVerifier", function () {
        beforeEach(async function () { 
            this.verifier = await SquareVerifier.new({from: account_one});
            this.contract = await SolnSquareVerifier.new(this.verifier.address, {from: account_one});
        })

        it("test can't mint with invalid solution", async function () { 

            assert.equal(await this.contract.ownerOf(100), 0);

            const proofData = JSON.parse(fs.readFileSync("./test/proof.json").toString());
            proofData.inputs[0] = proofData.inputs[1]; // mess up the inputs

            let exceptionFired = false;
            try{
                const ret = await this.contract.mintVerified(account_one, 100, proofData.proof.a, proofData.proof.b, proofData.proof.c, proofData.inputs);
            } catch(e) {
                assert.equal(e.reason, "Proof verification failed.");
                exceptionFired = true;
            }
            
            assert.isTrue(exceptionFired, "Expected exception.");

            assert.equal(await this.contract.ownerOf(100), 0);
        })

        it("test can mint with valid solution, solution is added, solution can't be reused", async function () { 

            // token has no owner yet
            assert.equal(await this.contract.ownerOf(100), 0);

            // an account can provide proof to mint
            const proofData = JSON.parse(fs.readFileSync("./test/proof.json").toString());

            // Only the owner can still mint since we inherit the onlyOwner modifier for mint(), and we do not provide an internal function to bypass it
            //const ret1 = await this.contract.mintVerified(account_two, 100, proofData.proof.a, proofData.proof.b, proofData.proof.c, proofData.inputs, {from: account_two});
            const ret1 = await this.contract.mintVerified(account_two, 100, proofData.proof.a, proofData.proof.b, proofData.proof.c, proofData.inputs);
            assert.equal(await this.contract.ownerOf(100), account_two);
            
            // these are the events that we expect, including the Verified events that is fired by the internal transaction to the Verifier
            const shaVerified = web3.utils.soliditySha3('Verified(string)');
            const shaTransfer = web3.utils.soliditySha3('Transfer(address,address,uint256)');
            const shaSolutionAdded = web3.utils.soliditySha3('SolutionAdded(bytes32)');
            const tx = await web3.eth.getTransactionReceipt(ret1.tx);
            assert.equal(tx.logs.length, 3);
            assert.equal(tx.logs[0].topics[0], shaVerified);
            assert.equal(tx.logs[1].topics[0], shaTransfer);
            assert.equal(tx.logs[2].topics[0], shaSolutionAdded);

            // expected events are fired (the verified events are not part of this log because they are internal transactions)
            assert.equal(ret1.logs.length, 2);
            assert.equal(ret1.logs[0].event, "Transfer");
            assert.equal(ret1.logs[1].event, "SolutionAdded");

            // same proof can't be reused to mint another token
            let exceptionFired = false;
            try{
                const ret2 = await this.contract.mintVerified(account_one, 101, proofData.proof.a, proofData.proof.b, proofData.proof.c, proofData.inputs);
            } catch(e) {
                assert.equal(e.reason, "Solution already used.");
                exceptionFired = true;
            }            
            assert.isTrue(exceptionFired, "Expected exception.");
        })

    });
    
})
