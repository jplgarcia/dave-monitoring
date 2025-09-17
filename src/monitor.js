import { readFile, writeFile } from 'node:fs/promises'
import { parseAbiItem, formatEther, createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { notifyDiscord } from './discord.js'

const DATA_FILE = './data/data.json';
const BATCH_BLOCK = BigInt(process.env.BATCH_BLOCK ?? 500);

const client = createPublicClient({
    chain: sepolia,
    transport: http(process.env.RPC_URL),
})

function bigintReplacer(_, value) {
    return typeof value === 'bigint' ? value.toString() : value;
}

function bigintMin(a, b) {
    return a < b ? a : b;
}

function getBlockRanges(fromBlock, toBlock, maxRange) {
    const ranges = []

    let start = fromBlock
    while (start < toBlock) {
        const end = bigintMin(start + maxRange - BigInt(1), toBlock)
        ranges.push({ fromBlock: start, toBlock: end })
        start = end + BigInt(1)
    }

    return ranges
}

async function checkForEvent() {
    try {
        const raw = await readFile(DATA_FILE, 'utf-8');
        const data = JSON.parse(raw);
        const lastProcessedBlock = BigInt(data.lastProcessedBlock)
        const currentBlock = await client.getBlockNumber()
        console.log(`lastProcessedBlock = ${lastProcessedBlock}; currentBlock = ${currentBlock}`)
        let blockRanges = getBlockRanges(lastProcessedBlock, currentBlock, BATCH_BLOCK);
        const arrayOfLogs = await Promise.all(
          blockRanges.map(({ fromBlock, toBlock }) =>
            client.getLogs({
              event: parseAbiItem('event commitmentJoined(bytes32 root)'),
              fromBlock,
              toBlock,
            })
          )
        )
        const logs = arrayOfLogs.flat();

        let lastTimestamp = BigInt(data.lastTimestamp || 0)

        if (logs.length > 0) {
            console.log(`Found ${logs.length} occurrences of 'commitmentJoined' event!`)
            console.log(JSON.stringify(logs, bigintReplacer, 4))
            const toVerify = []
            const blockCache = new Map()
            for (const log of logs) {
                let block = blockCache.get(log.blockNumber)
                if (!block) {
                    block = await client.getBlock(log.blockNumber)
                    blockCache.set(log.blockNumber, block)
                }
                const blockTimestamp = BigInt(block.timestamp);
                if (blockTimestamp > lastTimestamp) {
                    lastTimestamp = blockTimestamp;
                }
                const tournament = data.tournaments[log.address] || {
                    claims: {},
                    address: log.address,
                }
                toVerify.push(tournament)
                tournament.claims[log.args.root] = {
                    tx: log.transactionHash,
                    blockNumber: log.blockNumber.toString(),
                    timestamp: blockTimestamp.toString(),
                }
                data.tournaments[log.address] = tournament
            }

            for (const tournament of toVerify) {
                const claims = Object.getOwnPropertyNames(tournament.claims)
                if (claims.length > 1) {
                    let msg = `⚠️ Dispute detected on tournament \`${tournament.address}\` with ${claims.length} claims:\n`
                    for (const claim of claims) {
                        msg += `\n**Claim: ${claim}**\n`
                        msg += `- tx: ${tournament.claims[claim].tx}\n`
                        msg += `- blockNumber: ${tournament.claims[claim].blockNumber}\n`
                    }
                    console.log(msg)
                    await notifyDiscord(msg)
                }
            }
        } else {
            console.log('No new events found.')
        }
        data.lastTimestamp = lastTimestamp.toString()
        data.lastProcessedBlock = currentBlock.toString()
        await writeFile(DATA_FILE, JSON.stringify(data, null, 4))
    } catch (error) {
        console.error('Error querying blockchain:', error)
        process.exit(1)
    }
}

checkForEvent()

// check balance
const NODE_ADDRESS = process.env.NODE_ADDRESS ?? '0xB3aB9C1cCcb17115d1c9955cE3f7B1F4614486C6'
const MIN_BALANCE = BigInt(process.env.MIN_BALANCE ?? '100000000000000000') // 0.1 ETH

async function checkBalance() {
    try {
        const balance = await client.getBalance({ address: NODE_ADDRESS })
        console.log(`Balance of ${NODE_ADDRESS}: ${balance} wei`)
        console.log(`Equivalent in ETH: ${formatEther(balance)} ETH (alarm threshold: ${formatEther(MIN_BALANCE)} ETH)`)

        if (balance <= MIN_BALANCE) {
            const msg = `⚠️ Balance of ${NODE_ADDRESS} is critically low: ${formatEther(balance)} ETH.`
            notifyDiscord(msg)
        }
    } catch (error) {
        console.error('Error checking balance:', error)
    }
}

checkBalance();
