// Importing the crypto and fs modules
const crypto = require('crypto');
const fs = require('fs');

// --- Main Configuration ---
const useRandomSeed = true;
const debugMode = false;
const debugDelay = 1; // ms
const logDataToCSV = true; // Master toggle for CSV logging
const logFilePath = 'R:\\Temp\\roulette_log.csv'; // The name of the output CSV file

// --- Simulation Parameters ---
const startTime = Date.now();
let balance = 20_000_000,
    playBalance = 10,
    numberOfBots = 1,
    startBalance = balance,
    baseBet = 0.0016, // Starting bet
    previousBet = baseBet,
    vault = 0,
    nextBet = baseBet,
    largestBetPlaced = baseBet,
    coreBet = (playBalance / 6250),
    lowestBalance = balance,
    recoveryPotUsed = 0,
    totalBets = 100_000_000,
    increaseOnLoss = 2.0, // Multiplier on loss
    profit = 0,
    wager = 0,
    betCount = 0,
    winCount = 0,
    startNonce = 0;

// Define the properties of each pocket on the roulette wheel
const ROULETTE_WHEEL = [
    { number: 0, color: 'green', parity: 'none' }, { number: 1, color: 'red', parity: 'odd' },
    { number: 2, color: 'black', parity: 'even' }, { number: 3, color: 'red', parity: 'odd' },
    { number: 4, color: 'black', parity: 'even' }, { number: 5, color: 'red', parity: 'odd' },
    { number: 6, color: 'black', parity: 'even' }, { number: 7, color: 'red', parity: 'odd' },
    { number: 8, color: 'black', parity: 'even' }, { number: 9, color: 'red', parity: 'odd' },
    { number: 10, color: 'black', parity: 'even' }, { number: 11, color: 'black', parity: 'odd' },
    { number: 12, color: 'red', parity: 'even' }, { number: 13, color: 'black', parity: 'odd' },
    { number: 14, color: 'red', parity: 'even' }, { number: 15, color: 'black', parity: 'odd' },
    { number: 16, color: 'red', parity: 'even' }, { number: 17, color: 'black', parity: 'odd' },
    { number: 18, color: 'red', parity: 'even' }, { number: 19, color: 'red', parity: 'odd' },
    { number: 20, color: 'black', parity: 'even' }, { number: 21, color: 'red', parity: 'odd' },
    { number: 22, color: 'black', parity: 'even' }, { number: 23, color: 'red', parity: 'odd' },
    { number: 24, color: 'black', parity: 'even' }, { number: 25, color: 'red', parity: 'odd' },
    { number: 26, color: 'black', parity: 'even' }, { number: 27, color: 'red', parity: 'odd' },
    { number: 28, color: 'black', parity: 'even' }, { number: 29, color: 'black', parity: 'odd' },
    { number: 30, color: 'red', parity: 'even' }, { number: 31, color: 'black', parity: 'odd' },
    { number: 32, color: 'red', parity: 'even' }, { number: 33, color: 'black', parity: 'odd' },
    { number: 34, color: 'red', parity: 'even' }, { number: 35, color: 'black', parity: 'odd' },
    { number: 36, color: 'red', parity: 'even' }
];

// Generate initial seeds
const randomServerSeed = useRandomSeed ? crypto.randomBytes(32).toString('hex') : 'd83729554eeed8965116385e0486dab8a1f6634ae1a9e8139e849ab75f17341d';
const randomClientSeed = useRandomSeed ? crypto.randomBytes(5).toString('hex') : 'wcvqnIM521';
if (useRandomSeed) {
    startNonce = Math.floor(Math.random() * 1000000) + 1;
}

// Byte generator for cryptographic randomness
function* byteGenerator(serverSeed, clientSeed, nonce, cursor) {
    let currentRound = Math.floor(cursor / 32);
    let currentRoundCursor = cursor % 32;

    while (true) {
        const hmac = crypto.createHmac('sha256', serverSeed);
        hmac.update(`${clientSeed}:${nonce}:${currentRound}`);
        const buffer = hmac.digest();
        while (currentRoundCursor < 32) {
            yield buffer[currentRoundCursor];
            currentRoundCursor++;
        }
        currentRoundCursor = 0;
        currentRound++;
    }
}

function getRouletteSpin(serverSeed, clientSeed, nonce, cursor) {
    const rng = byteGenerator(serverSeed, clientSeed, nonce, cursor);
    const bytes = [rng.next().value, rng.next().value, rng.next().value, rng.next().value];
    const floatResult = bytes.reduce((acc, value, i) => acc + value / Math.pow(256, i + 1), 0);
    const pocketIndex = Math.floor(floatResult * 37);
    return ROULETTE_WHEEL[pocketIndex];
}

// Utility function to introduce a delay
function betDelay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Main function to run the simulation
async function doBet(serverSeed, clientSeed, startNonce, totalBets) {
    let currentStreak = 0;
    let maxStreak = 0;
    let maxStreakNonce = 0;
    let nonce = startNonce;

    // --- CSV Logging Setup ---
    let logStream;
    if (logDataToCSV) {
        logStream = fs.createWriteStream(logFilePath, { flags: 'w' });
        const header = 'betCount,nonce,roll,color,parity,outcome,payout,betAmount,roundProfit,cumulativeProfit,balance,currentStreak\n';
        logStream.write(header);
    }

    // NEW: Helper function for memory-safe writing
    const writeToLog = (data) => {
        if (!logDataToCSV) return;
        // If write returns false, the buffer is full. We must wait for the 'drain' event.
        if (!logStream.write(data)) {
            return new Promise(resolve => logStream.once('drain', resolve));
        }
        // If write returns true, we can continue immediately.
        return Promise.resolve();
    };


    while (betCount < totalBets) {
        betCount++;
        nonce++;
        wager += nextBet;
        const rollResult = getRouletteSpin(serverSeed, clientSeed, nonce, 0);

        let payout = 0;
        // Betting on Red and Even
        if (rollResult.color === 'red' && rollResult.parity === 'odd') payout = 2; // Win
        else if (rollResult.color === 'red' && rollResult.parity === 'even') payout = 1; // Push
        else if (rollResult.color === 'black' && rollResult.parity === 'odd') payout = 1; // Push
        else payout = 0; // Loss (Black & Even, or Green)

        let outcome;
        let roundProfit;

        if (payout > 1) { // Win
            outcome = 'win';
            roundProfit = (nextBet * payout) - nextBet;
            profit += roundProfit;
            winCount++;
            currentStreak = currentStreak >= 0 ? currentStreak + 1 : 1;
            nextBet = baseBet; // Reset on win
        } else if (payout === 1) { // Push
            outcome = 'push';
            roundProfit = 0;
            // Bet amount remains the same on a push
        } else { // Loss
            outcome = 'lose';
            roundProfit = -nextBet;
            profit += roundProfit;
            currentStreak = currentStreak <= 0 ? currentStreak - 1 : -1;
            if (currentStreak < maxStreak) {
                maxStreak = currentStreak;
                maxStreakNonce = nonce;
            }
            nextBet *= increaseOnLoss; // Increase on loss
        }
        
        balance = startBalance + profit;

        if (nextBet > balance) {
            console.log("Busted!");
            break; // Exit the loop if busted
        }

        if (nextBet > largestBetPlaced) {
            largestBetPlaced = nextBet;
        }
        if (balance < lowestBalance) {
            lowestBalance = balance;
        }

        // Log data to CSV with backpressure handling
        if (logDataToCSV) {
            const logEntry = `${betCount},${nonce},${rollResult.number},${rollResult.color},${rollResult.parity},${outcome},${payout},${nextBet.toFixed(8)},${roundProfit.toFixed(8)},${profit.toFixed(8)},${balance.toFixed(8)},${currentStreak}\n`;
            await writeToLog(logEntry);
        }

        // Console progress logging
        if (betCount % 250000 === 0) {
            const progress = (betCount / totalBets) * 100;
            console.log(`Progress: ${progress.toFixed(2)}% | Bet Count: ${betCount} | Balance: ${balance.toFixed(4)} | Worst Loss Streak: ${maxStreak}`);
        }
    }

    // --- Cleanup ---
    if (logDataToCSV) {
        logStream.end(); // Close the file stream
    }

    return {
        betCount,
        maxLossStreak: maxStreak,
    };
}

// Run the simulation and display final results
doBet(randomServerSeed, randomClientSeed, startNonce, totalBets).then(result => {
    const endTime = Date.now();
    const runTimeSeconds = (endTime - startTime) / 1000;
    const betsPerSecond = (result.betCount / runTimeSeconds).toFixed(2);

    console.log('\n--- Simulation Complete ---');
    console.log(`Run Time: ${runTimeSeconds.toFixed(2)} seconds`);
    console.log(`Bets Per Second: ${betsPerSecond}`);
    console.log(`Total Bets: ${result.betCount}`);
    console.log(`Final Balance: ${balance.toFixed(4)}`);
    console.log(`Total Profit: ${profit.toFixed(4)}`);
    console.log(`Highest Losing Streak: ${result.maxLossStreak}`);
    console.log(`---------------------------\n`);
}).catch(err => {
    console.error("An error occurred during the simulation:", err);
});

