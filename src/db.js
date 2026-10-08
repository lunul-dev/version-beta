const Database = require('better-sqlite3');
const db = new Database('nullnet_state.sqlite');

db.exec(`
    -- NullNet Accounts tracking LUN native currency
    CREATE TABLE IF NOT EXISTS accounts (
        address TEXT PRIMARY KEY,
        lun_balance TEXT NOT NULL, -- Native currency for fees
        nonce INTEGER NOT NULL
    );

    -- LPL Token Mints (Solana SPL style)
    CREATE TABLE IF NOT EXISTS lpl_mints (
        mint_address TEXT PRIMARY KEY,
        authority TEXT NOT NULL,
        decimals INTEGER NOT NULL,
        supply TEXT NOT NULL
    );

    -- LPL Token Accounts per user
    CREATE TABLE IF NOT EXISTS lpl_accounts (
        owner TEXT NOT NULL,
        mint_address TEXT NOT NULL,
        balance TEXT NOT NULL,
        PRIMARY KEY (owner, mint_address)
    );

    -- NullNet Blocks with Encrypted Payloads for Privacy
    CREATE TABLE IF NOT EXISTS blocks (
        slot INTEGER PRIMARY KEY,
        block_hash TEXT NOT NULL,
        prev_hash TEXT NOT NULL,
        encrypted_payload TEXT NOT NULL,
        validator TEXT NOT NULL
    );
`);

console.log("NullNet Database initialized by Lunul Labs.");
module.exports = db;