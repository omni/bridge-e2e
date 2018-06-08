const { exec } = require('child_process')
const path = require('path')
const shell = require('shelljs')
const Web3 = require('web3')
const assert = require('assert')
const chalk = require('chalk')
const kill = require('tree-kill')

const envsDir = path.join(__dirname, 'envs')
const deployContractsDir = path.join(__dirname, 'submodules/poa-bridge-contracts/deploy')
const abisDir = path.join(__dirname, 'submodules/poa-bridge-contracts/build/contracts')
const bridgeDir = path.join(__dirname, 'submodules/bridge-nodejs')

const privateKeyUser = '0x63e48a8ba0b99e0377c6b483af4a072cbca5ffbcfdac77be72e69f4960125800'

const homeWeb3 = new Web3(new Web3.providers.HttpProvider('http://parity1:8545'))
const foreignWeb3 = new Web3(new Web3.providers.HttpProvider('http://parity2:8545'))

const { toBN } = foreignWeb3.utils

homeWeb3.eth.accounts.wallet.add(privateKeyUser)

const tokenAbi = require(path.join(abisDir, 'POA20.json')).abi
const token = new foreignWeb3.eth.Contract(tokenAbi, '0xdbeE25CbE97e4A5CC6c499875774dc7067E9426B')

const sleep = timeout => new Promise(res => setTimeout(res, timeout))

function waitUntil(fn, timeoutMs) {
  function tryIt(fn, cb) {
    Promise.resolve(fn())
      .then(result => {
        if (result) {
          cb(true)
        } else {
          setTimeout(() => {
            tryIt(fn, cb)
          }, 50)
        }
      })
  }

  return new Promise(resolve => {
    const timeout = setTimeout(() => resolve(false), timeoutMs)

    tryIt(fn, (result) => {
      resolve(result)
      clearTimeout(timeout)
    })
  })
}

function waitForOutput(proc, str) {
  return new Promise((resolve, reject) => {
    proc.stdout.on('data', (data) => {
      if (data.includes(str)) {
        resolve()
      }
    })

    proc.stderr.on('data', (data) => {
      if (data.includes(str)) {
        resolve()
      }
    })

    proc.on('error', reject)
  })
}

async function main() {
  shell.rm('-rf', './data')

  // start parity nodes
  console.log(chalk.blue('start parity nodes'))
  await sleep(1000)

  // deploy bridge contracts
  shell.cp(path.join(envsDir, 'contracts-deploy.env'), path.join(deployContractsDir, '.env'))
  console.log(chalk.blue('deploy contracts'))
  shell.cd(deployContractsDir)
  shell.exec('node deploy.js')

  // start bridge
  shell.cp(path.join(envsDir, 'bridge.env'), path.join(bridgeDir, '.env'))
  console.log(chalk.blue('start bridge'))
  shell.cd(bridgeDir)
  shell.exec('git checkout db')
  const bridge = shell.exec('node src/start.js', { async: true })

  // check that account has zero tokens in the foreign chain
  console.log(chalk.blue('check balance before tx'))
  let balance = await token.methods.balanceOf('0xbb140FbA6242a1c3887A7823F7750a73101383e3').call()
  assert(toBN(balance).isZero(), 'Account should not have tokens yet')

  // send transaction to home chain
  console.log(chalk.blue('send transaction'))
  await homeWeb3.eth.sendTransaction({
    from: '0xbb140FbA6242a1c3887A7823F7750a73101383e3',
    to: '0x32198D570fffC7033641F8A9094FFDCaAEF42624',
    gasPrice: '1',
    gasLimit: 50000,
    value: '1000000000000000000'
  })

  // check that account has tokens in the foreign chain
  console.log(chalk.blue('check balance after transaction'))
  const satisfied = await waitUntil(async () => {
    const balance = await token.methods.balanceOf('0xbb140FbA6242a1c3887A7823F7750a73101383e3').call()
    return toBN(balance).gt(toBN(0))
  }, 30000)
  assert(satisfied, 'Account should have tokens')

  console.log(chalk.blue('kill child processes'))
  kill(bridge.pid)
}

try {
  main()
} catch (e) {
  console.error(e)
}
