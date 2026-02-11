const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const rootDir = path.resolve(__dirname, "..");
const layersDir = path.join(rootDir, "layers");
const outputDir = path.join(rootDir, "output");
const imagesDir = path.join(outputDir, "images");
const metadataDir = path.join(outputDir, "metadata");
const configPath = path.join(rootDir, "config.json");

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const OUTPUT_SIZE = Number(config.outputSize) > 0 ? Number(config.outputSize) : 512;
const PNG_OPTIONS = {
  compressionLevel: 9,
  adaptiveFiltering: true,
  palette: true,
  effort: 10,
};

function listPngs(dir) {
  return fs
    .readdirSync(dir)
    .filter((file) => file.toLowerCase().endsWith(".png"))
    .map((file) => path.join(dir, file));
}

function cleanOutput() {
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(imagesDir, { recursive: true });
  fs.mkdirSync(metadataDir, { recursive: true });
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildRarityList(distribution, supply) {
  const entries = Object.entries(distribution);
  const values = entries.map(([, value]) => Number(value));
  const sum = values.reduce((a, b) => a + b, 0);

  const counts = {};

  if (sum === supply) {
    entries.forEach(([key, value]) => {
      counts[key] = Number(value);
    });
  } else {
    // Treat values as weights or percentages
    let totalAssigned = 0;
    entries.forEach(([key, value]) => {
      const raw = (Number(value) / sum) * supply;
      counts[key] = Math.floor(raw);
      totalAssigned += counts[key];
    });

    // Distribute remaining by largest fractional parts
    const remainder = supply - totalAssigned;
    const fractions = entries
      .map(([key, value]) => {
        const raw = (Number(value) / sum) * supply;
        return { key, frac: raw - Math.floor(raw) };
      })
      .sort((a, b) => b.frac - a.frac);

    for (let i = 0; i < remainder; i += 1) {
      counts[fractions[i % fractions.length].key] += 1;
    }
  }

  const list = [];
  Object.entries(counts).forEach(([key, count]) => {
    for (let i = 0; i < count; i += 1) {
      list.push(key);
    }
  });

  if (list.length !== supply) {
    throw new Error("Rarity distribution does not match supply");
  }

  return shuffle(list);
}

function traitValueFromPath(filePath) {
  return path.basename(filePath, path.extname(filePath));
}

async function main() {
  const {
    collectionName,
    description,
    supply,
    imageBaseUri,
    layersOrder,
    rarityDistribution,
  } = config;

  const layers = layersOrder.map((layerName) => {
    const dir = path.join(layersDir, layerName);
    if (!fs.existsSync(dir)) {
      throw new Error(`Layer folder not found: ${dir}`);
    }
    const files = listPngs(dir);
    if (files.length === 0) {
      throw new Error(`Layer has no PNG files: ${dir}`);
    }
    return { name: layerName, files };
  });

  const totalCombinations = layers.reduce((acc, layer) => acc * layer.files.length, 1);
  if (supply > totalCombinations) {
    throw new Error(`Supply ${supply} exceeds total unique combinations ${totalCombinations}`);
  }

  const rarities = buildRarityList(rarityDistribution, supply);

  cleanOutput();

  const used = new Set();

  for (let i = 1; i <= supply; i += 1) {
    let attempt = 0;
    let selection;

    while (attempt < 10000) {
      selection = layers.map((layer) => {
        const idx = Math.floor(Math.random() * layer.files.length);
        return layer.files[idx];
      });

      const key = selection.map(traitValueFromPath).join("|");
      if (!used.has(key)) {
        used.add(key);
        break;
      }
      attempt += 1;
    }

    if (!selection) {
      throw new Error("Failed to generate unique combinations");
    }

    const normalizedLayers = await Promise.all(
      selection.map((file) =>
        sharp(file)
          .resize(OUTPUT_SIZE, OUTPUT_SIZE, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .png(PNG_OPTIONS)
          .toBuffer()
      )
    );
    const composites = normalizedLayers.map((input) => ({ input }));

    const outImagePath = path.join(imagesDir, `${i}.png`);
    await sharp({
      create: {
        width: OUTPUT_SIZE,
        height: OUTPUT_SIZE,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(composites)
      .png(PNG_OPTIONS)
      .toFile(outImagePath);

    const attributes = layers.map((layer, idx) => ({
      trait_type: layer.name,
      value: traitValueFromPath(selection[idx]),
    }));

    attributes.push({ trait_type: "Rarity", value: rarities[i - 1] });

    const metadata = {
      name: `${collectionName} #${i}`,
      description,
      image: `${imageBaseUri}${i}.png`,
      attributes,
    };

    const outMetadataPath = path.join(metadataDir, `${i}.json`);
    fs.writeFileSync(outMetadataPath, JSON.stringify(metadata));

    if (i % 10 === 0 || i === supply) {
      console.log(`Generated ${i}/${supply}`);
    }
  }

  console.log("Done. Images and metadata created in nft-assets/output/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
