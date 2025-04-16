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


const DATA_FILE='./data.json'

async function checkForEvent() {
    try {
        const raw = await fs.promises.readFile(DATA_FILE, 'utf-8');
        const data = JSON.parse(raw);

        const latestBlock = await client.getBlockNumber()
        const logs = await client.getLogs({
            event: parseAbiItem('event commitmentJoined(bytes32 root)'),
            fromBlock: BigInt(data.lastProcessedBlock),
            toBlock: latestBlock,
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
                    console.log(`Dispute running on ${tournament.address}`)
                }
            }
        } else {
            console.log('No new events found.')
        }
        data.lastProcessedBlock = latestBlock.toString()
        await fs.promises.writeFile(DATA_FILE, JSON.stringify(data, null, 4))
    } catch (error) {
        console.error('Error querying blockchain:', error)
    }
}

checkForEvent()
