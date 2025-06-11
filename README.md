# Cartesi Dave Monitoring

This project provides automated monitoring for Cartesi blockchain events and contract states, with notifications sent to Discord. The monitoring is designed to run both locally and automatically via GitHub Actions.

## Features

- **Event Monitoring:** Watches for `commitmentJoined` events on the blockchain and detects disputes in tournaments.
- **Balance Monitoring:** Checks if a specified node address has a critically low balance.
- **Settlement Monitoring:** Monitors the `canSettle` and `getCurrentSealedEpoch` contract functions to detect when epochs can be settled or if there are issues with claims.
- **Discord Notifications:** Sends alerts to a Discord channel via webhook when important events or issues are detected.
- **Automated via GitHub Actions:** Runs every 5 minutes and can also be triggered manually.

## How It Works

### 1. Blockchain Event Monitoring

- The `monitor.js` script connects to the Sepolia network and listens for `commitmentJoined` events.
- It tracks claims for each tournament and notifies Discord if multiple claims (disputes) are detected.
- It also checks the balance of a specified node address and sends an alert if the balance is below a threshold.

### 2. Settlement Monitoring

- The `canSettleMonitor.js` script checks the state of the DAVE contract to determine if an epoch can be settled.
- It alerts if an epoch has been open for settlement for over an hour or if there are no claims for a new epoch after an hour.

### 3. Discord Integration

- Both scripts use a Discord webhook (provided via environment variable) to send notifications.

## Running with GitHub Actions

Monitoring is automated using a GitHub Actions workflow defined in `.github/workflows/monitor.yml`.

### Workflow Details

- **Schedule:** Runs every 5 minutes via cron.
- **Manual Trigger:** Can be started manually via the GitHub Actions UI.
- **Steps:**
  1. Checks out the repository.
  2. Sets up Node.js (version 22).
  3. Installs dependencies with `npm ci`.
  4. Runs `monitor.js` and `canSettleMonitor.js` with required environment variables.
  5. Commits and pushes any updated data files back to the repository.

### Required Secrets (via GitHub Actions)

Set the following secrets in your GitHub repository:

- `DISCORD_WEBHOOK`: Discord webhook URL for notifications.
- `RPC_URL`: Ethereum node RPC URL (e.g., for Sepolia).
- `GITHUB_TOKEN`: (Automatically provided by GitHub Actions).
- `DAVE_CONTRACT_ADDRESS`: Used by consensus.


## Running Locally

1. Install dependencies:
   ```bash
   npm ci
   ```
2. Set the required environment variables:
   - `DISCORD_WEBHOOK`
   - `RPC_URL`
   - (Optional) `DAVE_CONTRACT_ADDRESS`, `BATCH_BLOCK`, `NODE_ADDRESS`, `MIN_BALANCE`
3. Run the scripts:
   ```bash
   node src/monitor.js
   node src/canSettleMonitor.js
   ```

## Dependencies

- [Node.js](https://nodejs.org/) (v22)
