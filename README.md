# MintNFT — Ethereum NFT Minting Website (with Immutable Metadata Freeze)

This repo contains a production-ready NFT minting dApp (Next.js + Tailwind + wagmi + ethers) and a Solidity ERC721A contract with phase scheduling, allowlists, transfer lock support, and irreversible metadata freeze support.

**Features:**
- Phase-based public mint (payable)
- Max supply + max mint per wallet (per phase)
- Mint price in ETH (per phase)
- Pause / unpause
- Owner withdraw
- Optional reveal flow
- Freeze collection (transfer lock)
- Irreversible metadata freeze
- Allowlist per phase (manual wallets + Merkle root)

---

## File Structure

```
.
├── contracts
│   ├── contracts
│   │   └── MintNFT.sol
│   ├── scripts
│   │   ├── deploy.ts
│   │   └── verify.ts
│   ├── .env.example
│   ├── hardhat.config.ts
│   ├── package.json
│   └── tsconfig.json
├── frontend
│   ├── lib
│   │   ├── contract.ts
│   │   └── wagmi.ts
│   ├── pages
│   │   ├── _app.tsx
│   │   ├── admin.tsx
│   │   └── index.tsx
│   ├── public
│   ├── styles
│   │   └── globals.css
│   ├── .env.example
│   ├── next.config.js
│   ├── next-env.d.ts
│   ├── package.json
│   ├── postcss.config.js
│   └── tailwind.config.ts
└── README.md
```

---

## Contract Overview (MintNFT)

- **Standard**: ERC721A
- **Security**: Ownable, Pausable, ReentrancyGuard
- **Mint**: `publicMint(quantity, proof)` payable
- **Max supply**: `maxSupply` (immutable)
- **Max per wallet**: enforced per phase
- **Phase schedule**: on-chain phases with start/end time, price, and max per wallet
- **Allowlist**:
  - Manual wallet allowlist (on-chain mapping)
  - Merkle allowlist (recommended for large lists)
- **Metadata**:
  - `baseURI` (token metadata path)
  - `notRevealedURI` (optional hidden placeholder)
  - `contractURI` (OpenSea contract-level metadata)
- **Freeze collection**:
  - `transfersLocked` is `true` by default
  - Owner can toggle with `setTransfersLocked(bool)`
  - While locked, transfers between wallets revert (minting still works)
- **Metadata freeze (irreversible)**:
  - `metadataFrozen` starts as `false`
  - Owner can call `freezeMetadata()` exactly once
  - After freeze, `setBaseURI`, `setContractURI`, `setNotRevealedURI`, and `setRevealed` all revert
  - This makes `tokenURI` behavior immutable on-chain after freezing

### How Transfer Lock Is Enforced On-Chain
- Transfers are blocked in `_beforeTokenTransfers` when `from` and `to` are both non-zero addresses.
- Minting from `address(0)` is still allowed.
- Owner can unlock transfers using `setTransfersLocked(false)` when ready for secondary sales.

### How Metadata Freeze Is Enforced On-Chain
- `freezeMetadata()` sets `metadataFrozen = true` and emits `MetadataFrozen()`.
- There is no unfreeze function.
- Metadata-mutating functions check `require(!metadataFrozen, "Metadata frozen")`.
- Any attempt to modify metadata after freeze reverts on-chain.

---

## Metadata Format (ERC721)

Example JSON (host on IPFS):

```json
{
  "name": "NFT #1",
  "description": "Collection description",
  "image": "ipfs://CID/1.png",
  "attributes": []
}
```

---

## Deploy Guide (Hardhat)

### 1) Install deps
```bash
cd contracts
npm install
```

### 2) Configure env
```bash
cp .env.example .env
```
Fill in:
- `MAINNET_RPC_URL`, `SEPOLIA_RPC_URL`, `GOERLI_RPC_URL`
- `PRIVATE_KEY`
- `ETHERSCAN_API_KEY`
- `NAME`, `SYMBOL`, `MAX_SUPPLY`, `MINT_PRICE_ETH`, `MAX_MINT_PER_WALLET`
- `BASE_URI` (e.g. `ipfs://CID/`)
- `NOT_REVEALED_URI` (optional placeholder)
- `CONTRACT_URI` (OpenSea contract metadata)
- `DEFAULT_PHASE_*` values (auto-created on deploy)

### 3) Compile
```bash
npm run compile
```

### 4) Deploy (example: Sepolia)
```bash
npm run deploy:sepolia
```
Copy the deployed contract address.

### 5) Verify (optional)
Set `CONTRACT_ADDRESS` in `.env`, then:
```bash
npm run verify:sepolia
```

---

## Frontend Setup (Next.js)

### 1) Install deps
```bash
cd frontend
npm install
```

### 2) Configure env
```bash
cp .env.example .env.local
```
Set:
- `NEXT_PUBLIC_CONTRACT_ADDRESS`
- `NEXT_PUBLIC_RPC_URL` (read-only RPC endpoint)
- `NEXT_PUBLIC_CHAIN_ID` (e.g. `11155111` for Sepolia)
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`

### 3) Run
```bash
npm run dev
```

Open:
- `/` for mint page
- `/admin` for owner-only controls

---

## Allowlist (Merkle) Setup

For large allowlists, generate a Merkle root + proofs and store them in the frontend.

1) Create a text file with one wallet per line:
```
contracts/allowlists/phase-0.txt
```

2) Generate the Merkle file:
```bash
cd contracts
npm install
node scripts/generate-allowlist.js --phase 0 --input allowlists/phase-0.txt --output ../frontend/public/allowlists/phase-0.json
```

3) Copy the printed Merkle root and paste it in the Admin panel:
```
Admin → Phase Allowlist → Set Merkle Root
```

4) Enable allowlist for that phase.

The frontend will automatically load the proof file to allow eligible wallets to mint.

---

## Testing Metadata Freeze

1. Deploy the contract and mint at least one token.
2. Reveal metadata (`setRevealed(true)`) and set final `baseURI`/`contractURI`.
3. Call `freezeMetadata()`.
4. Try calling `setBaseURI`, `setContractURI`, `setNotRevealedURI`, or `setRevealed` again.
5. Confirm each transaction reverts with `Metadata frozen`.

## Testing Transfer Lock

1. Deploy the contract and mint a token.
2. While `transfersLocked = true`, try transferring the NFT or listing it on a marketplace.
3. Confirm the transfer reverts with `Transfers locked`.
4. From the admin panel, call `setTransfersLocked(false)`.
5. Transfers and listings should now work normally.

---

## Notes

- Metadata must be hosted on IPFS (Pinata / NFT.Storage). The contract should point directly to the IPFS CID.
- The admin panel enforces owner-only access, but **the contract is the final authority** for ownership and freeze enforcement.
- No upgradeability or hidden backdoors are included.
