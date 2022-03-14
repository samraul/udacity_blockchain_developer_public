/* ************************************************* */
/*                     HELPERS                       */
/* ************************************************* */

/**
 * Pays the fee for an airline that is already registered but has not paid it yet, asserting the 
 * correctness of the transaction.
 * @param {*} from_account: The account that will pay the fee, required to be a registered airline.
 */
async function payAirlineFeeHelper(from_account, config) {
    // cache values for assertion
    const airlineBalanceBefore = web3.utils.toBN(await web3.eth.getBalance(from_account));
    const isFirstParticipatingBefore = await config.flightSuretyData.isParticipatingAirline.call(from_account); 

    // pay the airline fee with some padding
    const participationFee = await config.flightSuretyApp.AIRLINE_PARTICIPATION_FEE.call();
    const padding = web3.utils.toBN(web3.utils.toWei("0.234", "ether"));
    const weiToSend = participationFee.add(padding); // we add padding to make sure it is returned
    const txInfo = await config.flightSuretyApp.payAirlineFee({from: from_account, value: weiToSend});

    // calculate the gas fee to make sure that we have returned the excess value to the distributor
    const tx = await web3.eth.getTransaction(txInfo.tx);
    const gasPrice = web3.utils.toBN(tx.gasPrice);
    const gasUsed = web3.utils.toBN(txInfo.receipt.gasUsed);
    const txGasCost = gasPrice.mul(gasUsed);

    // compute expected balance
    const airlineBalanceAfter = web3.utils.toBN(await web3.eth.getBalance(from_account));
    const isFirstParticipatingAfter = await config.flightSuretyData.isParticipatingAirline.call(from_account); 
    const expectedBalance = airlineBalanceBefore.sub(participationFee).sub(txGasCost);

    // ASSERT
    assert.equal(isFirstParticipatingBefore, false, "Airline should not be participating before paying fee.");
    assert.equal(isFirstParticipatingAfter, true, "Airline should be participating after paying fee.");
    assert.equal(expectedBalance.toString(), airlineBalanceAfter.toString(), "Airline does not end with the expected balance.");    
}

module.exports = {
    payAirlineFeeHelper: payAirlineFeeHelper
};
