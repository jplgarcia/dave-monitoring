import fs from 'fs'
import { parseAbiItem, formatEther } from 'viem'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'

const client = createPublicClient({
    chain: sepolia,
    transport: http(process.env.RPC_URL),
})

function bigintReplacer(_, value) {
    return typeof value === 'bigint' ? value.toString() : value;
}


const DATA_FILE = './data.json'
const BATCH_BLOCK = process.env.BATCH_BLOCK || 500n

async function notifyDiscord(message) {
    const webhookUrl = process.env.DISCORD_WEBHOOK;
    if (!webhookUrl) {
        console.warn('No DISCORD_WEBHOOK set in environment variables.');
        return;
    }

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: message }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Discord webhook error: ${errorText}`);
        }

        console.log('Notification sent to Discord.');
    } catch (err) {
        console.error('Failed to send Discord notification:', err);
        process.exit(1)
    }
}

async function checkForEvent() {
    try {
        const raw = await fs.promises.readFile(DATA_FILE, 'utf-8');
        const data = JSON.parse(raw);
        const lastProcessedBlock = BigInt(data.lastProcessedBlock)
        const currentBLock = await client.getBlockNumber()
        console.log(`lastProcessedBlock = ${lastProcessedBlock}; currentBLock = ${currentBLock}`)
        let toBlock = currentBLock
        if (toBlock > lastProcessedBlock + BATCH_BLOCK) {
            toBlock = lastProcessedBlock + BATCH_BLOCK
            console.log(`Avoid block limit: toBlock = ${toBlock}; currentBLock = ${currentBLock}`)
        }
        const logs = await client.getLogs({
            event: parseAbiItem('event commitmentJoined(bytes32 root)'),
            fromBlock: lastProcessedBlock,
            toBlock,
        })

        if (logs.length > 0) {
            console.log(`Found ${logs.length} occurrences of 'commitmentJoined' event!`)
            console.log(JSON.stringify(logs, bigintReplacer, 4))
            const toVerify = []
            const blockCache = new Map()
            const lastTimestamp = BigInt(data.lastTimestamp || 0)
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
            const maxTimeWithoutClaims = BigInt(process.env.MAX_TIME_WITHOUT_CLAIMS || 3600);
            const currentTimestamp = BigInt(Math.floor(Date.now() / 1000)); // current time in seconds as BigInt

            const isClaimTimedOut = currentTimestamp - lastTimestamp > maxTimeWithoutClaims;
            if (isClaimTimedOut) {
                const lastDate = new Date(Number(lastTimestamp) * 1000);
                const formattedDate = lastDate.toISOString();
                const msg = `⚠️ The last claim was submitted at \`${formattedDate}\`, which is more than ${maxTimeWithoutClaims} seconds ago.`;
                await notifyDiscord(msg);
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
        data.lastProcessedBlock = toBlock.toString()
        await fs.promises.writeFile(DATA_FILE, JSON.stringify(data, null, 4))
    } catch (error) {
        console.error('Error querying blockchain:', error)
        process.exit(1)
    }
}

checkForEvent()

// check balance
const NODE_ADDRESS = process.env.NODE_ADDRESS || '0x79Ec6ba3352216E496FCfEd1d2e86Ee15eed3861'
const MIN_BALANCE = BigInt(process.env.MIN_BALANCE || '100000000000000000') // 0.1 ETH

async function checkBalance() {
    const balance = await client.getBalance({ address: NODE_ADDRESS })
    console.log(`Balance of ${NODE_ADDRESS}: ${balance} wei`)
    console.log(`Equivalent in ETH: ${formatEther(balance)} ETH (alarm threshold: ${formatEther(MIN_BALANCE)} ETH)`)

    if (balance <= MIN_BALANCE) {
        const msg = `⚠️ Balance of ${NODE_ADDRESS} is critically low: ${formatEther(balance)} ETH.`
        notifyDiscord(msg)
    }
}

checkBalance()

