# Lapinoz Metadata Generator

This folder contains cleaned layer assets and a generator to produce final images + metadata.

## Structure

```
nft-assets/
├── layers/
│   ├── Background/
│   ├── Body/
│   ├── Clothes/
│   ├── Eyes/
│   ├── Head/
│   └── Mouth/
├── output/
│   ├── images/
│   └── metadata/
├── scripts/
│   └── generate.js
├── config.json
└── package.json
```

## Configure
Edit `config.json` to change:
- `supply`
- `collectionName`
- `description`
- `imageBaseUri` (replace `ipfs://CID_GAMBAR/` after upload)
- `rarityDistribution`

## Generate
```bash
cd nft-assets
npm install
npm run generate
```

## Upload to IPFS
1. Upload `output/images/` to Pinata.
2. Replace `imageBaseUri` in `config.json` with your image CID and regenerate metadata.
3. Upload `output/metadata/` to Pinata and use its CID as `BASE_URI` in the contract.
