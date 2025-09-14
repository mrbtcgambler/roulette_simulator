const crypto = require('crypto');

// Index of 0 to 36
    const POCKETS = [ 
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 
    10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 
    20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 
    30, 31, 32, 33, 34, 35, 36
    ];

function* byteGenerator(serverSeed, clientSeed, nonce, cursor) {
    let currentRound = Math.floor(cursor / 32);
    let currentRoundCursor = cursor % 32;

    while (true) {
        const hmac = crypto.createHmac('sha256', serverSeed);
        hmac.update(`${clientSeed}:${nonce}:${currentRound}`);
        const buffer = hmac.digest();

        while (currentRoundCursor < 32) {
            yield buffer[currentRoundCursor];
            currentRoundCursor += 1;
        }

        currentRoundCursor = 0;
        currentRound += 1;
    }
}

function getRouletteSpin(serverSeed, clientSeed, nonce, cursor) {
    const rng = byteGenerator(serverSeed, clientSeed, nonce, cursor);
    const bytes = [];

    for (let i = 0; i < 4; i++) {
        bytes.push(rng.next().value);
    }

    // Convert bytes to a float in range [0, 1)
    const floatResult = bytes.reduce((acc, value, i) => acc + value / Math.pow(256, i + 1), 0);

    // Adjusting the calculation to align with the casino's method
    const pocket = POCKETS[Math.floor(floatResult * 37)];
    return pocket;
}


const serverSeed = '097d89ba33cd428e2a1b0a7e27c7d4e51b8ff5ab9a2f4b2c6b5c4c0e0d4f1f3b';
const clientSeed = 'xSF4HYcEOm';
const nonce = 3; // example nonce
const cursor = 0; // example cursor

const spin = getRouletteSpin(serverSeed, clientSeed, nonce, cursor);
console.log(`Roulette Result: ${spin}`);

