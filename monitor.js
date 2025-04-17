import fs from 'fs'
import { parseAbiItem } from 'viem'
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
const BATCH_BLOCK = 999n

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
    }
}

async function checkForEvent() {
    try {
        const raw = await fs.promises.readFile(DATA_FILE, 'utf-8');
        const data = JSON.parse(raw);
        const lastProcessedBlock = BigInt(data.lastProcessedBlock)
        let toBlock = await client.getBlockNumber()
        if (toBlock > lastProcessedBlock + BATCH_BLOCK) {
            toBlock = lastProcessedBlock + BATCH_BLOCK
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
            for (const log of logs) {
                const tournament = data.tournaments[log.address] || {
                    claims: {},
                    address: log.address,
                }
                toVerify.push(tournament)
                tournament.claims[log.args.root] = log.transactionHash
                data.tournaments[log.address] = tournament
            }
            for (const tournament of toVerify) {
                const nClaims = Object.getOwnPropertyNames(tournament.claims).length
                if (nClaims > 1) {
                    const msg = `⚠️ Dispute detected on tournament \`${tournament.address}\` with ${nClaims} claims.`
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
