var ERC721MintableComplete = artifacts.require('RSRealStateToken');

contract('TestERC721Mintable', accounts => {

    const account_one = accounts[0];
    const account_two = accounts[1];

    describe('match erc721 spec', function () {
        beforeEach(async function () { 
            this.contract = await ERC721MintableComplete.new({from: account_one});

            // DONE: mint multiple tokens
            await this.contract.mint(account_one, 1);
            await this.contract.mint(account_two, 22);
            await this.contract.mint(account_two, 333);
        })

        it('should return total supply', async function () { 
            const totalSupply = await this.contract.totalSupply();
            assert.equal(totalSupply, 3, "Unexpected total supply.");
        })

        it('should get token balance', async function () { 
            const balOne = await this.contract.balanceOf(account_one);
            const balTwo = await this.contract.balanceOf(account_two);

            assert.equal(balOne, 1, "Incorrect balance of minted tokens.");
            assert.equal(balTwo, 2, "Incorrect balance of minted tokens.");
        })

        // token uri should be complete i.e: https://s3-us-west-2.amazonaws.com/udacity-blockchain/capstone/1
        it('should return token uri', async function () { 
            const uri22 = await this.contract.tokenURI(22);
            assert.equal(uri22, "https://s3-us-west-2.amazonaws.com/udacity-blockchain/capstone/22", "Unexpected URI");            
        })

        it('should transfer token from one owner to another', async function () { 

            // transfer 22 from account_two to account_one and back
            assert.equal(await this.contract.ownerOf(22), account_two);
            await this.contract.transferFrom(account_two, account_one, 22, {from: account_two});
            assert.equal(await this.contract.ownerOf(22), account_one);

            assert.equal(await this.contract.ownerOf(22), account_one);
            await this.contract.transferFrom(account_one, account_two, 22, {from: account_one});
            assert.equal(await this.contract.ownerOf(22), account_two);

        })
    });

    describe('have ownership properties', function () {
        beforeEach(async function () { 
            this.contract = await ERC721MintableComplete.new({from: account_one});
        })

        it('should fail when minting when address is not contract owner', async function () { 
            
            assert.equal(await this.contract.totalSupply(), 0, "Unexpected total supply.");

            let firedException = false;
            try {
                await this.contract.mint(account_two, 4444, {from: account_two});
            } catch(e) {
                assert.equal(e.reason, "Caller is not the contract owner.");
                firedException = true;
            }
            assert.isTrue(firedException, "Expected exception.");

            // supply should not have changed
            assert.equal(await this.contract.totalSupply(), 0, "Unexpected total supply.");
        })

        it('should return contract owner', async function () { 
            const ownerInContract = await this.contract.getOwner();
            assert.equal(ownerInContract, account_one, "Unexpected owner");
        })

    });
})