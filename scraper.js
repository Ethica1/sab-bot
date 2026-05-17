// scraper.js — Pulls real exist count + variant data from sabexistcount.com
const axios = require("axios");
const cheerio = require("cheerio");

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Connection": "keep-alive",
};

// Full brainrot list sourced from sabexistcount.com/exist-count-gallery
// slug = URL path on sabexistcount.com/products/[slug]
const BRAINROT_SLUGS = [
  // OG
  { slug: "strawberry-elephant",            name: "Strawberry Elephant",            rarity: "OG" },
  { slug: "headless-horseman",              name: "Headless Horseman",              rarity: "OG" },
  { slug: "meowl",                          name: "Meowl",                          rarity: "OG" },
  // Brainrot God
  { slug: "pineaplino",                     name: "Pineaplino",                     rarity: "Brainrot God" },
  { slug: "pretzo-robo",                    name: "Pretzo Robo",                    rarity: "Brainrot God" },
  { slug: "tralalero-tralala",              name: "Tralalero Tralala",              rarity: "Brainrot God" },
  { slug: "unclito-samito",                 name: "Unclito Samito",                 rarity: "Brainrot God" },
  { slug: "lazy-ducky",                     name: "Lazy Ducky",                     rarity: "Brainrot God" },
  // Mythic
  { slug: "brutto-gialutto",                name: "Brutto Gialutto",                rarity: "Mythic" },
  { slug: "tob-tobi-tobi",                  name: "Tob Tobi Tobi",                  rarity: "Mythic" },
  { slug: "rhino-helicopterino",            name: "Rhino Helicopterino",            rarity: "Mythic" },
  { slug: "centrucci-nuclucci",             name: "Centrucci Nuclucci",             rarity: "Mythic" },
  { slug: "ganganzelli-trulala",            name: "Ganganzelli Trulala",            rarity: "Mythic" },
  { slug: "avocadorilla",                   name: "Avocadorilla",                   rarity: "Mythic" },
  // Legendary
  { slug: "caramello-filtrello",            name: "Caramello Filtrello",            rarity: "Legendary" },
  { slug: "puffaball",                      name: "Puffaball",                      rarity: "Legendary" },
  // Epic
  { slug: "malame-amarele",                 name: "Malame Amarele",                 rarity: "Epic" },
  // Rare
  { slug: "trippi-troppi",                  name: "Trippi Troppi",                  rarity: "Rare" },
  // Common
  { slug: "raccooni-jandelini",             name: "Raccooni Jandelini",             rarity: "Common" },
  { slug: "pipi-corni",                     name: "Pipi Corni",                     rarity: "Common" },
  { slug: "los-tortus",                     name: "Los Tortus",                     rarity: "Secret" },
  // Secret
  { slug: "bisonte-giuppitere",             name: "Bisonte Giuppitere",             rarity: "Secret" },
  { slug: "la-vacca-saturno-saturnita",     name: "La Vacca Saturno Saturnita",     rarity: "Secret" },
  { slug: "agarrini-la-palini",             name: "Agarrini La Palini",             rarity: "Secret" },
  { slug: "karker-sahur",                   name: "Karker Sahur",                   rarity: "Secret" },
  { slug: "1x1x1x1",                        name: "1x1x1x1",                        rarity: "Secret" },
  { slug: "cuadramat-and-pakrahmatmamat",   name: "Cuadramat and Pakrahmatmamat",   rarity: "Secret" },
  { slug: "tung-tung-tung-sahur",           name: "Tung Tung Tung Sahur",           rarity: "Secret" },
  { slug: "arcadopus",                      name: "Arcadopus",                      rarity: "Secret" },
  { slug: "guest-666",                      name: "Guest 666",                      rarity: "Secret" },
  { slug: "los-hotspotsitos",               name: "Los Hotspotsitos",               rarity: "Secret" },
  { slug: "churrito-bunnito-egg",           name: "Churrito Bunnito (Egg)",         rarity: "Secret" },
  { slug: "globa-steppa",                   name: "Globa Steppa",                   rarity: "Secret" },
  { slug: "tralaledon",                     name: "Tralaledon",                     rarity: "Secret" },
  { slug: "esok-sekolah",                   name: "Esok Sekolah",                   rarity: "Secret" },
  { slug: "los-mariachis",                  name: "Los Mariachis",                  rarity: "Secret" },
  { slug: "los-puggies",                    name: "Los Puggies",                    rarity: "Secret" },
  { slug: "los-primos",                     name: "Los Primos",                     rarity: "Secret" },
  { slug: "los-tacoritas",                  name: "Los Tacoritas",                  rarity: "Secret" },
  { slug: "lovin-rose",                     name: "Lovin Rose",                     rarity: "Secret" },
  { slug: "dug-dug-dug",                    name: "Dug Dug Dug",                    rarity: "Secret" },
  { slug: "rico-dinero",                    name: "Rico Dinero",                    rarity: "Secret" },
  { slug: "la-romantic-grande",             name: "La Romantic Grande",             rarity: "Secret" },
  { slug: "gym-bros",                       name: "Gym Bros",                       rarity: "Secret" },
  { slug: "tirilikalika-tirilikalako",      name: "Tirilikalika Tirilikalako",      rarity: "Secret" },
  { slug: "jolly-jolly-sahur",              name: "Jolly Jolly Sahur",              rarity: "Secret" },
  { slug: "fishino-clownino",               name: "Fishino Clownino",               rarity: "Secret" },
  { slug: "antonio",                        name: "Antonio",                        rarity: "Secret" },
  { slug: "hopilikalika-hopilikalako-egg",  name: "Hopilikalika Hopilikalako (Egg)",rarity: "Secret" },
  { slug: "la-easter-grande",               name: "La Easter Grande",               rarity: "Secret" },
  { slug: "cloverat-clapat",                name: "Cloverat Clapat",                rarity: "Secret" },
  { slug: "quackini-snackini",              name: "Quackini Snackini",              rarity: "Secret" },
  { slug: "quackini-snackini-egg",          name: "Quackini Snackini (Egg)",        rarity: "Secret" },
  { slug: "los-spaghettis",                 name: "Los Spaghettis",                 rarity: "Secret" },
  { slug: "los-chillis",                    name: "Los Chillis",                    rarity: "Secret" },
  { slug: "boppin-bunny",                   name: "Boppin Bunny",                   rarity: "Secret" },
  { slug: "elefanto-frigo",                 name: "Elefanto Frigo",                 rarity: "Secret" },
  { slug: "los-hackers",                    name: "Los Hackers",                    rarity: "Secret" },
  { slug: "fragrama-and-chocrama",          name: "Fragrama and Chocrama",          rarity: "Secret" },
  { slug: "la-casa-boo",                    name: "La Casa Boo",                    rarity: "Secret" },
  { slug: "signore-carapace",               name: "Signore Carapace",               rarity: "Secret" },
  { slug: "kalika-bros",                    name: "Kalika Bros",                    rarity: "Secret" },
  { slug: "pancake-and-syrup",              name: "Pancake and Syrup",              rarity: "Secret" },
  { slug: "ketupat-bros",                   name: "Ketupat Bros",                   rarity: "Secret" },
  { slug: "arcadragon",                     name: "Arcadragon",                     rarity: "Secret" },
  { slug: "burguro-and-fryuro",             name: "Burguro and Fryuro",             rarity: "Secret" },
  { slug: "cooki-and-milki",                name: "Cooki and Milki",                rarity: "Secret" },
  { slug: "cerberus",                       name: "Cerberus",                       rarity: "Secret" },
  { slug: "hydra-bunny",                    name: "Hydra Bunny",                    rarity: "Secret" },
  { slug: "la-supreme-combinasion",         name: "La Supreme Combinasion",         rarity: "Secret" },
  { slug: "love-love-bear",                 name: "Love Love Bear",                 rarity: "Secret" },
  { slug: "dragon-gingerini",               name: "Dragon Gingerini",               rarity: "Secret" },
  { slug: "griffin",                        name: "Griffin",                        rarity: "Secret" },
  { slug: "ventoliero-pavonero",            name: "Ventoliero Pavonero",            rarity: "Secret" },
  { slug: "bananito-bandito",               name: "Bananito Bandito",               rarity: "Secret" },
  { slug: "chimnino",                       name: "Chimnino",                       rarity: "Secret" },
  { slug: "los-noobinis",                   name: "Los Noobinis",                   rarity: "Secret" },
];

// ─── Parse a single product page ─────────────────────────────────────────────
async function fetchBrainrot(slug, name, rarity) {
  const url = `https://sabexistcount.com/products/${slug}`;
  const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
  const $ = cheerio.load(res.data);

  // Base exist count — sits in the first table cell after header row
  let baseCount = null;
  let rarestMutation = null;
  let rarestTrait = null;
  const mutations = [];
  const traits = [];

  // The page has multiple tables: first is summary, second is mutations, third is traits
  const tables = $("table");

  // Summary table — has Exist Count, Rarest Mutation, Rarest Trait
  $(tables[0]).find("td").each((_, td) => {
    const text = $(td).text().trim();
    // Exist count is a number (with commas)
    const numMatch = text.match(/^[\d,]+$/);
    if (numMatch && !baseCount) {
      baseCount = parseInt(text.replace(/,/g, ""), 10);
    }
  });

  // Also try grabbing count from the strong/heading near "Exist Count" label
  $("*").each((_, el) => {
    const text = $(el).text().trim();
    if (/^\d[\d,]*$/.test(text) && !baseCount) {
      const n = parseInt(text.replace(/,/g, ""), 10);
      if (n > 0 && n < 100000000) baseCount = n;
    }
  });

  // Rarest mutation & trait from summary table cells
  $(tables[0]).find("td a, td").each((i, td) => {
    const text = $(td).text().trim();
    if (i === 1 && text && text.length < 40 && !text.match(/^\d/)) rarestMutation = text;
    if (i === 2 && text && text.length < 40 && !text.match(/^\d/)) rarestTrait = text;
  });

  // Mutations table (second table on page)
  if (tables[1]) {
    $(tables[1]).find("tr").each((i, row) => {
      if (i === 0) return; // skip header
      const cells = $(row).find("td");
      if (cells.length < 2) return;
      const variantName = $(cells[0]).text().trim();
      const rawCount    = $(cells[1]).text().replace(/,/g, "").replace(/\(.*?\)/g, "").trim();
      const count       = parseInt(rawCount, 10);
      if (variantName && !isNaN(count) && count > 0 && !variantName.includes("+")) {
        mutations.push({ name: variantName, count });
      }
    });
  }

  // Traits table (third table on page)
  if (tables[2]) {
    $(tables[2]).find("tr").each((i, row) => {
      if (i === 0) return;
      const cells = $(row).find("td");
      if (cells.length < 2) return;
      const traitName = $(cells[0]).text().trim();
      const rawCount  = $(cells[1]).text().replace(/,/g, "").trim();
      const count     = parseInt(rawCount, 10);
      if (traitName && !isNaN(count) && count > 0) {
        traits.push({ name: traitName, count });
      }
    });
  }

  return {
    name,
    slug,
    rarity,
    count: baseCount,
    rarestMutation: rarestMutation || (mutations.length ? mutations.reduce((a, b) => a.count < b.count ? a : b).name : null),
    rarestTrait:    rarestTrait    || (traits.length    ? traits.reduce((a, b)    => a.count < b.count ? a : b).name : null),
    mutations: mutations.sort((a, b) => a.count - b.count),
    traits:    traits.sort((a, b) => a.count - b.count),
    source: "sabexistcount.com",
    updatedAt: Date.now(),
  };
}

// ─── Scrape all brainrots with rate limiting ──────────────────────────────────
async function scrapeAllSources() {
  const data = {};
  const log  = [];
  let success = 0;
  let failed  = 0;

  console.log(`[scraper] Scraping ${BRAINROT_SLUGS.length} brainrots from sabexistcount.com...`);

  for (const { slug, name, rarity } of BRAINROT_SLUGS) {
    try {
      const result = await fetchBrainrot(slug, name, rarity);
      if (result.count) {
        data[name.toLowerCase()] = result;
        success++;
        console.log(`[scraper] ✅ ${name}: ${result.count?.toLocaleString() ?? "?"}`);
      } else {
        // Count not found on page but still save with rarity info
        data[name.toLowerCase()] = { ...result, count: null };
        console.log(`[scraper] ⚠️  ${name}: count not found`);
      }
    } catch (err) {
      failed++;
      console.log(`[scraper] ❌ ${name}: ${err.message}`);
      log.push({ name, error: err.message });
    }

    // Be polite — wait 800ms between requests so we don't get IP banned
    await new Promise(r => setTimeout(r, 800));
  }

  console.log(`[scraper] Done. ${success} success, ${failed} failed.`);
  return { data, log, total: success };
}

function guessRarity(count) {
  if (!count) return "Unknown";
  if (count < 500)     return "OG";
  if (count < 5000)    return "Brainrot God";
  if (count < 20000)   return "Mythic";
  if (count < 100000)  return "Legendary";
  if (count < 500000)  return "Epic";
  if (count < 2000000) return "Rare";
  return "Common";
}

module.exports = { scrapeAllSources, guessRarity, BRAINROT_SLUGS };
