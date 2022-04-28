import { tokens, ether, ETHER_ADDRESS, EVM_REVERT, wait } from './helpers'

const Token = artifacts.require('./Token')
const DecentralizedBank = artifacts.require('./dBank')

require('chai')
  .use(require('chai-as-promised'))
  .should()

contract('dBank', ([deployer, user]) => {
  let dbank, token
  const interestPerSecond = 31668017

  beforeEach(async () => {
    token = await Token.new()
    dbank = await DecentralizedBank.new(token.address)
    await token.passMinterRole(dbank.address, {from: deployer})
  })

  describe('testing token contract...', () => {
    describe('success', () => {
      it('checking token name', async () => {
        expect(await token.name()).to.be.eq('Decentralized Bank Currency')
      })

      it('checking token symbol', async () => {
        expect(await token.symbol()).to.be.eq('DBC')
      })

      it('checking token initial total supply', async () => {
        expect(Number(await token.totalSupply())).to.eq(0)
      })

      it('dBank should have Token minter role', async () => {
        expect(await token.minter()).to.eq(dbank.address)
      })
    })

    describe('failure', () => {
      it('passing minter role should be rejected', async () => {
        await token.passMinterRole(user, {from: deployer}).should.be.rejectedWith(EVM_REVERT)
      })

      it('tokens minting should be rejected', async () => {
        await token.mint(user, '1', {from: deployer}).should.be.rejectedWith(EVM_REVERT)
      })
    })
  })

  describe('testing deposit...', () => {
    let balance

    describe('success', () => {
      beforeEach(async () => {
        await dbank.deposit({value: 10**16, from: user})
      })

      it('balance should increase', async () => {
        expect(Number(await dbank.etherBalanceOf(user))).to.eq(10**16)
      })

      it('deposit time should > 0', async () => {
        expect(Number(await dbank.depositStart(user))).to.be.above(0)
      })

      it('deposit status should eq true', async () => {
        expect(await dbank.isDeposited(user)).to.eq(true)
      })
    })

    describe('failure', () => {
      it('depositing should be rejected', async () => {
        await dbank.deposit({value: 10**15, from: user}).should.be.rejectedWith(EVM_REVERT)
      })
    })
  })

  describe('testing withdraw...', () => {
    let balance

    describe('success', () => {

      beforeEach(async () => {
        await dbank.deposit({value: 10**16, from: user})

        await wait(2)

        balance = await web3.eth.getBalance(user)
        await dbank.withdraw({from: user})
      })

      it('balances should decrease', async () => {
        expect(Number(await web3.eth.getBalance(dbank.address))).to.eq(0)
        expect(Number(await dbank.etherBalanceOf(user))).to.eq(0)
      })

      it('user should receive ether back', async () => {
        expect(Number(await web3.eth.getBalance(user))).to.be.above(Number(balance))
      })

      it('user should receive proper amount of interest', async () => {
        balance = Number(await token.balanceOf(user))
        expect(balance).to.be.above(0)
        expect(balance%interestPerSecond).to.eq(0)
        expect(balance).to.be.below(interestPerSecond*4)
      })

      it('depositer data should be reseted', async () => {
        expect(Number(await dbank.depositStart(user))).to.eq(0)
        expect(Number(await dbank.etherBalanceOf(user))).to.eq(0)
        expect(await dbank.isDeposited(user)).to.eq(false)
      })
    })

    describe('failure', () => {
      it('withdrawing should be rejected', async () =>{
        await dbank.deposit({value: 10**16, from: user})
        await wait(2)
        await dbank.withdraw({from: deployer}).should.be.rejectedWith(EVM_REVERT)
      })
    })
  })

  describe('testing borrow...', () => {

    describe('success', () => {
      beforeEach(async () => {
        await dbank.borrow({value: 10**16, from: user})
      })

      it('token total supply should increase', async () => {
        expect(Number(await token.totalSupply())).to.eq(5*(10**15))
      })

      it('balance of user should increase', async () => {
        expect(Number(await token.balanceOf(user))).to.eq(5*(10**15))
      })

      it('collateralEther should increase', async () => {
        expect(Number(await dbank.collateralEther(user))).to.eq(10**16)
      })

      it('user isBorrowed status should eq true', async () => {
        expect(await dbank.isBorrowed(user)).to.eq(true)
      })
    })

    describe('failure', () => {
      it('borrowing should be rejected', async () => {
        await dbank.borrow({value: 10**15, from: user}).should.be.rejectedWith(EVM_REVERT)
      })
    })
  })

  describe('testing payOff...', () => {

    describe('success', () => {
      beforeEach(async () => {
        await dbank.borrow({value: 10**16, from: user})
        await token.approve(dbank.address, (5*(10**15)).toString(), {from: user})
        await dbank.payOff({from: user})
      })

      it('user token balance should eq 0', async () => {
        expect(Number(await token.balanceOf(user))).to.eq(0)
      })

      it('dBank eth balance should get fee', async () => {
        expect(Number(await web3.eth.getBalance(dbank.address))).to.eq(10**15)
      })

      it('borrower data should be reseted', async () => {
        expect(Number(await dbank.collateralEther(user))).to.eq(0)
        expect(await dbank.isBorrowed(user)).to.eq(false)
      })
    })

    describe('failure', () => {
      it('paying off should be rejected', async () =>{
        await dbank.borrow({value: 10**16, from: user})
        await token.approve(dbank.address, (5*(10**15)).toString(), {from: user})
        await dbank.payOff({from: deployer}).should.be.rejectedWith(EVM_REVERT)
      })
    })
  })
})