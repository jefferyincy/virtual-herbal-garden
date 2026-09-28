/**
 * Plant seed records for the Virtual Herbal Garden encyclopedia.
 *
 * Pure data module: no imports, no side effects. Every record is a real species under its current
 * accepted botanical name and family; every source is a real, resolvable PubMed/NCBI record.
 *
 * Data-honesty policy applied here:
 * - No dosage figure is recorded because none of the cited reviews states a dose that can be
 *   quoted as a general recommendation, so `dosage` is null on every record and each record is
 *   therefore flagged `unverified` (a record with a null dosage or contraindications can never be
 *   `verified`).
 * - `contraindications` carries text only where a cited source documents the hazard; otherwise it
 *   is null rather than invented.
 * - `publishedAt` is the record's own seed timestamp (not a medical claim); the seed runner reads
 *   it, so it is part of the record shape.
 */

export type PlantPartKey =
  | 'leaf'
  | 'root'
  | 'stem'
  | 'bark'
  | 'flower'
  | 'fruit'
  | 'seed'
  | 'rhizome'
  | 'whole_plant'
  | 'resin'
  | 'latex';

export type PreparationKey =
  | 'decoction'
  | 'infusion'
  | 'powder'
  | 'paste'
  | 'oil'
  | 'juice'
  | 'fomentation'
  | 'decoction_oil'
  | 'fresh';

export type PlantToxicity = 'none' | 'low' | 'high';
export type PlantSystem = 'ayurveda' | 'siddha' | 'unani' | 'western';

export type PlantLookAlike = { slug: string; note: string };
export type PlantSource = { label: string; url: string };
export type PlantImage = { url: string; alt: string; credit: string };

export type PlantSeedRecord = {
  slug: string;
  commonName: string;
  botanicalName: string;
  family: string;
  partsUsed: PlantPartKey[];
  preparations: PreparationKey[];
  ailments: string[];
  activeCompounds: string[];
  description: string;
  medicinalUses: string;
  dosage: string | null;
  contraindications: string | null;
  toxicity: PlantToxicity;
  lookAlikes: PlantLookAlike[];
  region: string[];
  systemsMentioned: PlantSystem[];
  images: PlantImage[];
  modelUrl: null;
  modelScale: number;
  tags: string[];
  sources: PlantSource[];
  verified: boolean;
  unverified: boolean;
  publishedAt: string | null;
};

const IMAGE_CREDIT = 'Studio botanical reference, project asset';

export const plantSeed: PlantSeedRecord[] = [
  {
    slug: 'ocimum-tenuiflorum',
    commonName: 'Tulsi (Holy basil)',
    botanicalName: 'Ocimum tenuiflorum',
    family: 'Lamiaceae',
    partsUsed: ['leaf', 'whole_plant'],
    preparations: ['infusion', 'decoction', 'powder', 'fresh'],
    ailments: ['cough', 'fever', 'weak-immunity', 'anxiety'],
    activeCompounds: ['eugenol', 'ursolic acid', 'rosmarinic acid', 'beta-caryophyllene', 'linalool'],
    description:
      'An aromatic Lamiaceae shrub native to the Indian subcontinent and long cultivated as a household and temple plant. Two chemotypes are widely grown: a green-leaved form and a purple-tinged form with a sharper clove-like aroma.',
    medicinalUses:
      'Traditionally used across Ayurveda, Siddha and Unani practice as a daily tea for coughs, feverish episodes and general resilience, and more recently studied in vitro and in animal models for antioxidant, antimicrobial and adaptogenic activity. Human trial evidence remains limited and heterogeneous.',
    dosage: null,
    contraindications: null,
    toxicity: 'none',
    lookAlikes: [
      {
        slug: 'ocimum-basilicum',
        note: 'Sweet basil is a related Ocimum and leaf-only material is easily confused; tulsi leaves are usually narrower, more strongly serrated and often purple-tinged, with a clove-like rather than sweet aroma.',
      },
    ],
    region: ['India', 'South Asia', 'Southeast Asia'],
    systemsMentioned: ['ayurveda', 'siddha', 'unani'],
    images: [
      {
        url: '/reference/studio_botanical_photography_of_tulsi_holy_basil_ocimum_tenuiflorum_sprig_with.png',
        alt: 'Tulsi (Ocimum tenuiflorum) sprig',
        credit: IMAGE_CREDIT,
      },
      {
        url: '/reference/dark_moody_botanical_macro_photography_of_fresh_holy_basil_ocimum_tenuiflorum.png',
        alt: 'Tulsi (Ocimum tenuiflorum) fresh leaves',
        credit: IMAGE_CREDIT,
      },
    ],
    modelUrl: null,
    modelScale: 1,
    tags: ['adaptogen', 'culinary herb', 'aromatic'],
    sources: [
      {
        label: 'Tulsi - Ocimum sanctum: A herb for all reasons (Journal of Ayurveda and Integrative Medicine, 2014)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/25624701/',
      },
      {
        label:
          'Harnessing the Antibacterial, Anti-Diabetic and Anti-Carcinogenic Properties of Ocimum sanctum (Plants, 2024)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/39771214/',
      },
    ],
    verified: false,
    unverified: true,
    publishedAt: '2026-01-05',
  },
  {
    slug: 'ocimum-basilicum',
    commonName: 'Sweet basil',
    botanicalName: 'Ocimum basilicum',
    family: 'Lamiaceae',
    partsUsed: ['leaf', 'whole_plant'],
    preparations: ['infusion', 'fresh', 'oil', 'powder'],
    ailments: ['indigestion', 'inflammation', 'anxiety'],
    activeCompounds: ['linalool', 'estragole', 'eugenol', '1,8-cineole'],
    description:
      'An annual aromatic herb of the Lamiaceae, grown worldwide as a culinary seasoning. Numerous chemotypes exist, with essential-oil composition varying between linalool-rich, estragole-rich and eugenol-rich forms.',
    medicinalUses:
      'Traditionally taken as a tea for digestive complaints and mild tension, and applied in folk practice to minor skin irritation. Laboratory work reports antioxidant and antimicrobial activity from its essential oil, but clinical evidence in humans is sparse.',
    dosage: null,
    contraindications: null,
    toxicity: 'none',
    lookAlikes: [
      {
        slug: 'ocimum-tenuiflorum',
        note: 'Holy basil shares the genus and general leaf shape; sweet basil leaves are typically broader and smoother with a sweet, anise-like scent rather than a clove-like one.',
      },
      {
        slug: 'mentha-spicata',
        note: 'Spearmint leaves can resemble sweet basil in a mixed bundle; crushing a leaf distinguishes them, since spearmint is strongly mint-scented and basil is not.',
      },
    ],
    region: ['South Asia', 'West Asia', 'Mediterranean'],
    systemsMentioned: ['ayurveda', 'unani', 'western'],
    images: [
      {
        url: '/reference/studio_botanical_photography_of_sweet_basil_or_african_blue_basil_sprig_with.png',
        alt: 'Sweet basil (Ocimum basilicum) sprig',
        credit: IMAGE_CREDIT,
      },
    ],
    modelUrl: null,
    modelScale: 1,
    tags: ['culinary herb', 'aromatic', 'essential oil'],
    sources: [
      {
        label:
          'Sweet Basil between the Soul and the Table-Transformation of Traditional Knowledge on Ocimum basilicum (Plants, 2023)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/37570924/',
      },
      {
        label: 'Bio-active compounds and major biomedical properties of basil (Ocimum basilicum) (Natural Product Research, 2025)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/38813679/',
      },
    ],
    verified: false,
    unverified: true,
    publishedAt: '2026-01-05',
  },
  {
    slug: 'salvia-officinalis',
    commonName: 'Sage',
    botanicalName: 'Salvia officinalis',
    family: 'Lamiaceae',
    partsUsed: ['leaf'],
    preparations: ['infusion', 'powder', 'fresh'],
    ailments: ['inflammation', 'cough', 'poor-memory'],
    activeCompounds: ['thujone', '1,8-cineole', 'camphor', 'rosmarinic acid'],
    description:
      'A perennial subshrub of the Mediterranean basin and the Lamiaceae, with grey-green, slightly fuzzy leaves. It is both a culinary herb and a long-standing European and West Asian medicine.',
    medicinalUses:
      'Traditionally used as a gargle and tea for sore throats and coughs, and as a memory and nerve tonic in European herbal practice. Randomised trials of standardised leaf extracts have reported short-term cognitive effects, though studies are small.',
    // The leaf infusion and powder are the recorded preparations. The thujone hazard belongs to
    // concentrated sage essential oil, which is not one of the preparations listed here.
    dosage: null,
    contraindications: null,
    toxicity: 'none',
    lookAlikes: [],
    region: ['Mediterranean', 'West Asia'],
    systemsMentioned: ['western', 'unani'],
    images: [
      {
        url: '/reference/dark_moody_botanical_photography_of_fresh_sage_leaves_salvia_officinalis_macro.png',
        alt: 'Sage (Salvia officinalis) fresh leaves',
        credit: IMAGE_CREDIT,
      },
    ],
    modelUrl: null,
    modelScale: 1,
    tags: ['culinary herb', 'aromatic', 'memory'],
    sources: [
      {
        label:
          'The Acute and Chronic Cognitive Effects of a Sage Extract: A Randomized, Placebo Controlled Study (Nutrients, 2021)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/33466627/',
      },
      {
        label:
          'Echinacea/sage or chlorhexidine/lidocaine for treating acute sore throats: a randomized double-blind trial (European Journal of Medical Research, 2009)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/19748859/',
      },
    ],
    verified: false,
    unverified: true,
    publishedAt: '2026-01-05',
  },
  {
    slug: 'mentha-spicata',
    commonName: 'Spearmint',
    botanicalName: 'Mentha spicata',
    family: 'Lamiaceae',
    partsUsed: ['leaf', 'whole_plant'],
    preparations: ['infusion', 'oil', 'fresh'],
    ailments: ['indigestion', 'nausea', 'inflammation'],
    activeCompounds: ['carvone', 'limonene', 'rosmarinic acid'],
    description:
      'A rhizomatous perennial mint of the Lamiaceae, distinguished from peppermint by its carvone-dominated, sweeter and less pungent essential oil and by its lack of a strong menthol character.',
    medicinalUses:
      'Traditionally taken as a tea after meals for indigestion and mild nausea across European, West Asian and South Asian practice. Animal and in vitro work on carvone-rich oil reports antioxidant, anti-inflammatory and, in one chronic-dosing study, cognitive effects; human evidence is limited.',
    dosage: null,
    contraindications: null,
    toxicity: 'none',
    lookAlikes: [
      {
        slug: 'ocimum-basilicum',
        note: 'In a mixed bundle spearmint and sweet basil leaves can look alike; spearmint is immediately distinguishable by its strong mint aroma when a leaf is crushed.',
      },
    ],
    region: ['Mediterranean', 'West Asia', 'South Asia'],
    systemsMentioned: ['western', 'unani', 'ayurveda'],
    images: [],
    modelUrl: null,
    modelScale: 1,
    tags: ['carminative', 'culinary herb', 'essential oil'],
    sources: [
      {
        label: 'Molecular Targets and Biological Activities of Carvone: An Evidence-Graded Review (Molecules, 2026)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/42738766/',
      },
      {
        label:
          'Chronic Administration of Carvone-Rich Mentha spicata Essential Oil Attenuates Cognitive Dysfunction (Plants, 2026)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/42796795/',
      },
    ],
    verified: false,
    unverified: true,
    publishedAt: '2026-01-05',
  },
  {
    slug: 'glycyrrhiza-glabra',
    commonName: 'Liquorice',
    botanicalName: 'Glycyrrhiza glabra',
    family: 'Fabaceae',
    partsUsed: ['root'],
    preparations: ['decoction', 'powder', 'infusion'],
    ailments: ['cough', 'bronchitis', 'asthma', 'indigestion'],
    activeCompounds: ['glycyrrhizin', 'glabridin', 'liquiritin', 'isoliquiritigenin'],
    description:
      'A perennial legume of the Fabaceae whose sweet, fibrous roots have been traded from West and Central Asia for millennia. The sweetness comes from glycyrrhizin, a triterpenoid saponin glycoside.',
    medicinalUses:
      'Traditionally used as a demulcent and expectorant in coughs and bronchial complaints and to settle the stomach, and it remains a common flavouring in cough preparations. Contemporary reviews focus mainly on the cardiovascular and metabolic consequences of excess glycyrrhizin intake rather than on efficacy.',
    dosage: null,
    // Glycyrrhizin inhibits 11beta-hydroxysteroid dehydrogenase type 2; sustained excess causes
    // pseudo-aldosteronism with sodium retention, hypertension and hypokalaemia.
    contraindications:
      'Regular or high intake is not appropriate in hypertension, heart failure, kidney disease, hypokalaemia or pregnancy, because glycyrrhizin can produce pseudo-aldosteronism with raised blood pressure, fluid retention and low potassium.',
    toxicity: 'high',
    lookAlikes: [],
    region: ['West Asia', 'Central Asia', 'Mediterranean', 'South Asia'],
    systemsMentioned: ['ayurveda', 'unani', 'siddha', 'western'],
    images: [
      {
        url: '/reference/dark_moody_botanical_photography_of_licorice_root_pieces_and_dried_glycyrrhiza.png',
        alt: 'Liquorice (Glycyrrhiza glabra) dried root pieces',
        credit: IMAGE_CREDIT,
      },
    ],
    modelUrl: null,
    modelScale: 1,
    tags: ['demulcent', 'expectorant', 'flavouring'],
    sources: [
      {
        label: 'Liquorice Toxicity: A Comprehensive Narrative Review (Nutrients, 2023)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/37764649/',
      },
      {
        label:
          'Clinical risk factors of licorice-induced pseudohyperaldosteronism: a 2026-updated narrative review (Frontiers in Pharmacology, 2026)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/42292819/',
      },
    ],
    verified: false,
    unverified: true,
    publishedAt: '2026-01-05',
  },
  {
    slug: 'althaea-officinalis',
    commonName: 'Marshmallow',
    botanicalName: 'Althaea officinalis',
    family: 'Malvaceae',
    partsUsed: ['root', 'leaf', 'flower'],
    preparations: ['infusion', 'decoction', 'fresh'],
    ailments: ['cough', 'wounds', 'inflammation'],
    activeCompounds: ['mucilage polysaccharides', 'pectin', 'quercetin', 'kaempferol'],
    description:
      'A hardy Malvaceae perennial of damp ground in Europe and West Asia, with pale pink flowers and soft, velvety leaves. The root is rich in mucilage, a gel-forming polysaccharide mixture.',
    medicinalUses:
      'Traditionally prepared as a cold infusion of root or leaf as a demulcent for irritated throat and dry cough, and used in poultices for minor wounds and inflamed skin. Animal and laboratory studies report wound-healing and anti-inflammatory effects; controlled human data are scarce.',
    dosage: null,
    contraindications: null,
    toxicity: 'none',
    lookAlikes: [],
    region: ['Mediterranean', 'West Asia', 'North Africa'],
    systemsMentioned: ['western', 'unani'],
    images: [
      {
        url: '/reference/dark_moody_botanical_photography_of_dried_marshmallow_root_slices_and_leaves.png',
        alt: 'Marshmallow (Althaea officinalis) dried root slices and leaves',
        credit: IMAGE_CREDIT,
      },
    ],
    modelUrl: null,
    modelScale: 1,
    tags: ['demulcent', 'mucilage', 'wound care'],
    sources: [
      {
        label: 'Marsh Mallow (Althaea officinalis L.) and Its Potency in the Treatment of Cough (Complementary Medicine Research, 2020)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/31770755/',
      },
      {
        label: 'Althaea officinalis improves wound healing in rats: a stereological study (Drug Discoveries & Therapeutics, 2020)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/33116035/',
      },
    ],
    verified: false,
    unverified: true,
    publishedAt: '2026-01-05',
  },
  {
    slug: 'curcuma-longa',
    commonName: 'Turmeric',
    botanicalName: 'Curcuma longa',
    family: 'Zingiberaceae',
    partsUsed: ['rhizome'],
    preparations: ['powder', 'decoction', 'paste', 'fresh'],
    ailments: ['wounds', 'inflammation', 'acne', 'indigestion'],
    activeCompounds: ['curcumin', 'demethoxycurcumin', 'bisdemethoxycurcumin', 'ar-turmerone'],
    description:
      'A tropical Zingiberaceae perennial with a bright yellow-orange rhizome, cultivated across South and Southeast Asia. The yellow pigments are the curcuminoid group, of which curcumin is the best studied.',
    medicinalUses:
      'Traditionally applied as a paste to wounds and inflamed skin and taken with food for digestive complaints; today it is widely sold as a supplement for inflammatory conditions. Trials are numerous but heterogeneous, and oral curcumin has poor and variable bioavailability.',
    dosage: null,
    // Rare but documented dietary-supplement-associated liver injury prompted the contraindication text.
    contraindications:
      'Rare cases of liver injury have been reported with turmeric and curcuminoid dietary supplements, so people with existing liver disease or unexplained liver-test changes should not take high-dose supplements without medical advice.',
    toxicity: 'low',
    lookAlikes: [],
    region: ['India', 'South Asia', 'Southeast Asia'],
    systemsMentioned: ['ayurveda', 'siddha', 'unani', 'western'],
    images: [],
    modelUrl: null,
    modelScale: 1,
    tags: ['anti-inflammatory', 'culinary spice', 'natural dye'],
    sources: [
      {
        label:
          'Beyond the Rhizome: Phytochemistry, Biological Activities, and Sustainable Utilization of Curcuma longa (Pharmaceuticals, 2026)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/42797524/',
      },
      {
        label:
          'Rarely reported cases of hepatotoxicity associated with turmeric- and curcuminoid-containing dietary supplements (Pharmaceutical Biology, 2026)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/42364655/',
      },
    ],
    verified: false,
    unverified: true,
    publishedAt: '2026-01-05',
  },
  {
    slug: 'zingiber-officinale',
    commonName: 'Ginger',
    botanicalName: 'Zingiber officinale',
    family: 'Zingiberaceae',
    partsUsed: ['rhizome'],
    preparations: ['decoction', 'powder', 'fresh', 'infusion'],
    ailments: ['nausea', 'indigestion', 'inflammation', 'cough'],
    activeCompounds: ['6-gingerol', '6-shogaol', 'zingerone'],
    description:
      'A reed-like Zingiberaceae perennial grown for its pungent rhizome, known in South and Southeast Asian cooking and medicine for over two millennia. Drying converts gingerols to the more pungent shogaols.',
    medicinalUses:
      'Traditionally taken as a warm tea or chewed to settle nausea and indigestion and to ease cold-and-cough symptoms. It has the strongest modern evidence base of the spices here: umbrella reviews support its use for nausea and vomiting, including in pregnancy, when used within studied limits.',
    dosage: null,
    contraindications: null,
    toxicity: 'none',
    lookAlikes: [
      {
        slug: 'alpinia-galanga',
        note: 'Greater galangal rhizomes are closely related and can be sold interchangeably; galangal is hard, reddish-brown and piney-peppery, while ginger is paler, softer and sharper in a citrus-like way.',
      },
    ],
    region: ['South Asia', 'Southeast Asia', 'East Africa'],
    systemsMentioned: ['ayurveda', 'siddha', 'unani', 'western'],
    images: [],
    modelUrl: null,
    modelScale: 1,
    tags: ['antiemetic', 'culinary spice', 'carminative'],
    sources: [
      {
        label:
          'Treatment of Nausea and Vomiting With Zingiber officinale in Pregnancy: An Umbrella Review of Systematic Reviews (Phytotherapy Research, 2026)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/42322087/',
      },
      {
        label:
          'Efficacy and safety of steamed ginger extract for gastric health: a randomized, double-blind, placebo-controlled trial (Food & Function, 2025)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/40878144/',
      },
    ],
    verified: false,
    unverified: true,
    publishedAt: '2026-01-05',
  },
  {
    slug: 'elettaria-cardamomum',
    commonName: 'Cardamom',
    botanicalName: 'Elettaria cardamomum',
    family: 'Zingiberaceae',
    partsUsed: ['seed', 'fruit'],
    preparations: ['powder', 'decoction', 'infusion'],
    ailments: ['indigestion', 'nausea', 'bronchitis'],
    activeCompounds: ['1,8-cineole', 'alpha-terpinyl acetate', 'terpinen-4-ol'],
    description:
      'A large Zingiberaceae perennial of the Western Ghats whose dried green capsules, often called pods, contain the aromatic seeds used as a spice. Its essential oil is dominated by 1,8-cineole and alpha-terpinyl acetate.',
    medicinalUses:
      'Traditionally chewed or brewed as a tea to freshen the breath and to settle indigestion and nausea, and used in South Asian and Unani mixtures for bronchial complaints. Small trials and a narrative review report metabolic and anti-inflammatory effects, but the evidence remains preliminary.',
    dosage: null,
    contraindications: null,
    toxicity: 'none',
    lookAlikes: [],
    region: ['India', 'South Asia'],
    systemsMentioned: ['ayurveda', 'unani'],
    images: [],
    modelUrl: null,
    modelScale: 1,
    tags: ['culinary spice', 'carminative', 'aromatic'],
    sources: [
      {
        label: 'The effect of Elettaria cardamomum (cardamom) on the metabolic syndrome: Narrative review (Iranian Journal of Basic Medical Science, 2021)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/35317114/',
      },
      {
        label:
          'The effect of green cardamom on blood pressure and inflammatory markers among patients with metabolic syndrome (Phytotherapy Research, 2023)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/36181264/',
      },
      {
        label:
          'Botany, traditional uses, phytochemistry and biological activities of cardamom [Elettaria cardamomum] (Journal of Ethnopharmacology, 2020)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/31541721/',
      },
    ],
    verified: false,
    unverified: true,
    publishedAt: '2026-01-05',
  },
  {
    slug: 'alpinia-galanga',
    commonName: 'Greater galangal',
    botanicalName: 'Alpinia galanga',
    family: 'Zingiberaceae',
    partsUsed: ['rhizome'],
    preparations: ['decoction', 'powder', 'fresh'],
    ailments: ['indigestion', 'cough', 'diarrhoea', 'asthma'],
    activeCompounds: ['1,8-cineole', 'galangin', 'kaempferide'],
    description:
      'A robust Zingiberaceae rhizome plant of Southeast Asia with reddish-brown, ringed rhizomes and a sharp pine-citrus aroma. It is a staple of Thai and Indonesian cooking and of regional folk medicine.',
    medicinalUses:
      'Traditionally taken as a warming decoction for indigestion and diarrhoea and for coughs and wheezing. Reviews of the genus and of its flavonoid galangin report anti-inflammatory and anticancer activity in laboratory models; clinical trials in humans are lacking.',
    dosage: null,
    contraindications: null,
    toxicity: 'none',
    lookAlikes: [
      {
        slug: 'zingiber-officinale',
        note: 'Galangal and ginger rhizomes are frequently confused at market, and both are Zingiberaceae; galangal is denser, more reddish and piney, while ginger is paler with a sharper, more citrus-forward bite.',
      },
    ],
    region: ['Southeast Asia', 'South Asia'],
    systemsMentioned: ['ayurveda', 'siddha', 'unani'],
    images: [],
    modelUrl: null,
    modelScale: 1,
    tags: ['culinary spice', 'aromatic', 'carminative'],
    sources: [
      {
        label:
          'Journey of Alpinia galanga from kitchen spice to nutraceutical to folk medicine to nanomedicine (Journal of Ethnopharmacology, 2022)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/35227783/',
      },
      {
        label: 'Insights into the anticancer effects of galangal and galangin: A comprehensive review (Phytomedicine, 2024)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/39353308/',
      },
    ],
    verified: false,
    unverified: true,
    publishedAt: '2026-01-05',
  },
  {
    slug: 'withania-somnifera',
    commonName: 'Ashwagandha',
    botanicalName: 'Withania somnifera',
    family: 'Solanaceae',
    partsUsed: ['root', 'leaf'],
    preparations: ['powder', 'decoction', 'infusion'],
    ailments: ['anxiety', 'weak-immunity', 'poor-memory'],
    activeCompounds: ['withaferin A', 'withanolide D', 'sitoindosides'],
    description:
      'A drought-tolerant Solanaceae shrub of the Indian subcontinent and adjoining dry regions, with grey-green leaves and small red berries. Its root is one of the most heavily marketed Ayurvedic adaptogens.',
    medicinalUses:
      'Traditionally used as a tonic for debility, poor sleep and nervous exhaustion, and often combined with other herbs for the same purpose. Randomised trials have consistently shown cortisol reduction, though a systematic review found no clear effect on perceived stress; liver-injury reports have also appeared.',
    dosage: null,
    // Herb-induced liver injury has been reported with ashwagandha supplements, so the
    // contraindication text states the documented risk rather than a generic caution.
    contraindications:
      'Cases of liver injury have been reported with ashwagandha supplements; anyone with liver disease, or who develops fatigue, dark urine or jaundice while taking it, should stop and seek medical advice. Autoimmune and thyroid conditions also warrant medical guidance before use.',
    toxicity: 'low',
    lookAlikes: [],
    region: ['India', 'South Asia', 'North Africa', 'West Asia'],
    systemsMentioned: ['ayurveda', 'unani', 'siddha'],
    images: [],
    modelUrl: null,
    modelScale: 1,
    tags: ['adaptogen', 'tonic', 'root'],
    sources: [
      {
        label: 'Ashwagandha (Withania somnifera)-Associated Liver Injury: A Scoping Review of Clinical Characteristics (Cureus, 2026)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/42367407/',
      },
      {
        label:
          'Dual impact of Ashwagandha: Significant cortisol reduction but no effects on perceived stress - A systematic review (Nutrition and Health, 2025)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/40746175/',
      },
      {
        label:
          'A proprietary herbal extract of ashwagandha root for stress and anxiety in healthy adults: a randomized trial (Journal of Medicine and Life, 2026)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/41815853/',
      },
    ],
    verified: false,
    unverified: true,
    publishedAt: '2026-01-05',
  },
  {
    slug: 'azadirachta-indica',
    commonName: 'Neem',
    botanicalName: 'Azadirachta indica',
    family: 'Meliaceae',
    partsUsed: ['leaf', 'seed', 'bark', 'root'],
    preparations: ['powder', 'paste', 'decoction', 'oil'],
    ailments: ['acne', 'wounds', 'fever', 'inflammation'],
    activeCompounds: ['azadirachtin', 'nimbin', 'nimbolide', 'gedunin'],
    description:
      'A fast-growing Meliaceae tree native to the Indian subcontinent, widely planted across the tropics. Its leaves, bark and seeds contain a large family of bitter limonoid triterpenoids, including azadirachtin.',
    medicinalUses:
      'Traditionally applied as a paste for acne and minor wounds, used as a bitter decoction for feverish complaints, and exploited as a natural insecticide. Reviews describe a broad in vitro antimicrobial and anti-inflammatory profile; human trial evidence remains limited.',
    dosage: null,
    // Neem oil ingestion is a documented cause of severe poisoning, particularly in young children,
    // so the contraindication text names it directly.
    contraindications:
      'Neem oil must not be swallowed; ingestion has caused severe poisoning, including toxic encephalopathy and metabolic acidosis, especially in children. Leaves and bark are used differently from the oil and are not interchangeable, and medicinal doses are not established for pregnancy.',
    toxicity: 'high',
    lookAlikes: [],
    region: ['India', 'South Asia', 'Southeast Asia', 'East Africa'],
    systemsMentioned: ['ayurveda', 'siddha', 'unani'],
    images: [],
    modelUrl: null,
    modelScale: 1,
    tags: ['antimicrobial', 'bitter tonic', 'insecticide'],
    sources: [
      {
        label:
          'Ethnopharmacological landscape of Azadirachta indica (Neem): Phytochemical diversity bridging traditional medicine (Journal of Ethnopharmacology, 2026)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/42320775/',
      },
      {
        label: 'Neem oil poisoning (Indian Pediatrics, 2008)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/18250509/',
      },
    ],
    verified: false,
    unverified: true,
    publishedAt: '2026-01-05',
  },
  {
    slug: 'aloe-vera',
    commonName: 'Aloe',
    botanicalName: 'Aloe vera',
    family: 'Asphodelaceae',
    partsUsed: ['leaf', 'latex'],
    preparations: ['juice', 'paste', 'fresh', 'powder'],
    ailments: ['wounds', 'constipation', 'acne', 'inflammation'],
    activeCompounds: ['aloin', 'aloe-emodin', 'acemannan', 'aloesin'],
    description:
      'A succulent Asphodelaceae of arid North Africa and the Arabian Peninsula, cultivated worldwide. The clear inner leaf gel and the bitter yellow latex just beneath the rind have very different chemistry and traditional uses.',
    medicinalUses:
      'The gel is traditionally applied to burns, wounds and inflamed skin, and a gel or juice is used for acne and internal inflammation; the anthraquinone latex acts as a stimulant laxative and is used for constipation. Reviews support wound-healing and laxative effects but also describe the distinct hazard of the latex.',
    dosage: null,
    // The anthraquinone latex, not the gel, is the documented hazard; the contraindication text
    // says so explicitly so the two are not conflated.
    contraindications:
      'Aloe latex, the anthraquinone-rich yellow sap, is a stimulant laxative and is not appropriate for prolonged use or for use in pregnancy, in children or in inflammatory bowel disease; the inner-leaf gel is a different preparation with a different risk profile.',
    toxicity: 'low',
    lookAlikes: [],
    region: ['North Africa', 'West Asia', 'South Asia', 'Mediterranean'],
    systemsMentioned: ['ayurveda', 'siddha', 'unani', 'western'],
    images: [],
    modelUrl: null,
    modelScale: 1,
    tags: ['skin', 'succulent', 'laxative'],
    sources: [
      {
        label: 'Review on the phytochemistry and toxicological profiles of Aloe vera and Aloe ferox (Future Journal of Pharmaceutical Sciences, 2021)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/34307697/',
      },
      {
        label:
          'The green healer: an updated review on the phytochemical profile and therapeutic potential of Aloe vera (Frontiers in Nutrition, 2025)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/41098793/',
      },
    ],
    verified: false,
    unverified: true,
    publishedAt: '2026-01-05',
  },
  {
    slug: 'piper-nigrum',
    commonName: 'Black pepper',
    botanicalName: 'Piper nigrum',
    family: 'Piperaceae',
    partsUsed: ['fruit', 'seed'],
    preparations: ['powder', 'decoction', 'fresh'],
    ailments: ['cough', 'indigestion', 'fever'],
    activeCompounds: ['piperine', 'piperyline', 'beta-caryophyllene'],
    description:
      'A climbing Piperaceae vine of the Indian subcontinent and Southeast Asia, grown for its pungent fruit spikes, which are dried green to give black pepper. Piperine is the alkaloid chiefly responsible for the heat.',
    medicinalUses:
      'Traditionally used as a warming carminative for indigestion, in cough mixtures, and to break feverish episodes. Modern interest centres on piperine as a bioenhancer that increases the absorption of other compounds, an effect demonstrated in pharmacokinetic studies.',
    dosage: null,
    contraindications: null,
    toxicity: 'none',
    lookAlikes: [],
    region: ['India', 'South Asia', 'Southeast Asia'],
    systemsMentioned: ['ayurveda', 'siddha', 'unani', 'western'],
    images: [],
    modelUrl: null,
    modelScale: 1,
    tags: ['culinary spice', 'bioenhancer', 'pungent'],
    sources: [
      {
        label:
          'Unveiling the Multifaceted Potential of Piper nigrum: A Comprehensive Review of Its Chemical Composition (Journal of Agricultural and Food Chemistry, 2026)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/41564422/',
      },
      {
        label:
          "Metabolic Insights into Drug Absorption: Unveiling Piperine's Transformative Bioenhancing Potential (Pharmaceutical Research, 2025)",
        url: 'https://pubmed.ncbi.nlm.nih.gov/41053306/',
      },
    ],
    verified: false,
    unverified: true,
    publishedAt: '2026-01-05',
  },
  {
    slug: 'cinnamomum-verum',
    commonName: 'Ceylon cinnamon',
    botanicalName: 'Cinnamomum verum',
    family: 'Lauraceae',
    partsUsed: ['bark', 'leaf'],
    preparations: ['powder', 'decoction', 'infusion', 'oil'],
    ailments: ['diarrhoea', 'indigestion'],
    activeCompounds: ['cinnamaldehyde', 'eugenol', 'linalool', 'cinnamyl acetate'],
    description:
      'An evergreen Lauraceae tree of Sri Lanka and southern India whose thin inner bark is rolled into the fragile quills sold as true or Ceylon cinnamon. It is chemically distinct from the cassia cinnamons, which are far richer in coumarin.',
    medicinalUses:
      'Traditionally used as a warming tea for diarrhoea and indigestion and as a flavouring. Clinical trials of cinnamon for glycaemic control in type 2 diabetes are numerous but inconsistent, and reviews call for species-specific, better-controlled work.',
    dosage: null,
    contraindications: null,
    toxicity: 'none',
    lookAlikes: [],
    region: ['South Asia', 'India', 'Southeast Asia'],
    systemsMentioned: ['ayurveda', 'unani', 'western'],
    images: [],
    modelUrl: null,
    modelScale: 1,
    tags: ['culinary spice', 'warming', 'aromatic'],
    sources: [
      {
        label:
          'The glycaemic outcomes of Cinnamon, a review of the experimental evidence and clinical trials (Nutrition Journal, 2015)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/26475130/',
      },
      {
        label:
          'A critical appraisal of anti-hyperglycemic mechanisms, matrix-dependent bioavailability, and species differences of cinnamon (Food Research International, 2026)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/42169286/',
      },
    ],
    verified: false,
    unverified: true,
    publishedAt: '2026-01-05',
  },
  {
    slug: 'syzygium-aromaticum',
    commonName: 'Clove',
    botanicalName: 'Syzygium aromaticum',
    family: 'Myrtaceae',
    partsUsed: ['flower', 'leaf'],
    preparations: ['powder', 'decoction', 'oil', 'infusion'],
    ailments: ['indigestion', 'inflammation'],
    activeCompounds: ['eugenol', 'eugenyl acetate', 'beta-caryophyllene'],
    description:
      'A Myrtaceae tree of the Moluccas whose dried flower buds, the cloves, are among the most traded spices. Eugenol makes up the great majority of the bud essential oil and gives the characteristic numbing heat.',
    medicinalUses:
      'Traditionally applied for toothache and used as a warming carminative for indigestion and to ease inflamed tissue. Essential-oil research reports strong antimicrobial and antioxidant activity in vitro, and neuroprotective effects have been explored in laboratory models.',
    dosage: null,
    contraindications: null,
    toxicity: 'none',
    lookAlikes: [],
    region: ['Southeast Asia', 'South Asia', 'East Africa'],
    systemsMentioned: ['ayurveda', 'siddha', 'unani', 'western'],
    images: [],
    modelUrl: null,
    modelScale: 1,
    tags: ['culinary spice', 'eugenol', 'antimicrobial'],
    sources: [
      {
        label:
          'Culinary Spices in Food and Medicine: An Overview of Syzygium aromaticum (Frontiers in Pharmacology, 2021)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/35111060/',
      },
      {
        label:
          'Antimicrobial Activity of Syzygium aromaticum Essential Oil in Human Health Treatment (Molecules, 2024)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/38474510/',
      },
    ],
    verified: false,
    unverified: true,
    publishedAt: '2026-01-05',
  },
  {
    slug: 'trachyspermum-ammi',
    commonName: 'Ajwain',
    botanicalName: 'Trachyspermum ammi',
    family: 'Apiaceae',
    partsUsed: ['seed', 'fruit'],
    preparations: ['powder', 'decoction', 'infusion', 'fomentation'],
    ailments: ['indigestion', 'bronchitis', 'cough', 'diarrhoea'],
    activeCompounds: ['thymol', 'gamma-terpinene', 'p-cymene', 'carvacrol'],
    description:
      'An annual Apiaceae of the Indian subcontinent grown for its small, ridged, strongly aromatic fruits, sold as ajwain seed. The essential oil is dominated by thymol, giving a thyme-like pungency.',
    medicinalUses:
      'Traditionally taken as a tea or with salt for indigestion, colic and diarrhoea, and used in steam and fomentation for bronchial congestion. Laboratory studies describe antimicrobial and antioxidant activity; human clinical evidence is very limited.',
    dosage: null,
    // Thymol-rich ajwain oil is a documented hazard in concentrated form, whereas culinary seed
    // use is the ordinary food context, so the text distinguishes the two.
    contraindications:
      'Concentrated ajwain essential oil is thymol-rich and must not be taken internally in undiluted form; the cited toxicity reports concern such high-dose or concentrated preparations rather than culinary use of the seed.',
    toxicity: 'low',
    lookAlikes: [
      {
        slug: 'foeniculum-vulgare',
        note: 'Ajwain and fennel are both small Apiaceae fruits and are mixed up in bulk; ajwain is smaller, browner and smells of thyme, while fennel fruits are greener, sweeter and smell of anise.',
      },
    ],
    region: ['India', 'South Asia', 'West Asia', 'Central Asia'],
    systemsMentioned: ['ayurveda', 'unani', 'siddha'],
    images: [],
    modelUrl: null,
    modelScale: 1,
    tags: ['carminative', 'culinary spice', 'thymol'],
    sources: [
      {
        label:
          'Biomedical and industrial applications of Trachyspermum ammi-derived nanoparticles: a comprehensive review (Discover Nano, 2026)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/41547697/',
      },
      {
        label:
          'Efficacy of Six Plants of Apiaceae Family for Body Weight Management: A Review from the Perspective of Modern Medicine (Current Drug Discovery Technologies, 2021)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/33023434/',
      },
    ],
    verified: false,
    unverified: true,
    publishedAt: '2026-01-05',
  },
  {
    slug: 'foeniculum-vulgare',
    commonName: 'Fennel',
    botanicalName: 'Foeniculum vulgare',
    family: 'Apiaceae',
    partsUsed: ['seed', 'fruit', 'root', 'leaf'],
    preparations: ['infusion', 'powder', 'decoction', 'fresh'],
    ailments: ['indigestion', 'nausea', 'cough'],
    activeCompounds: ['trans-anethole', 'fenchone', 'estragole', 'limonene'],
    description:
      'A tall, feathery Apiaceae perennial of the Mediterranean and West Asia, grown for its sweet anise-scented fruits, its bulb-forming cultivars and its edible shoots and leaves.',
    medicinalUses:
      'Traditionally brewed as an after-meal infusion for bloating, indigestion and mild nausea, and as a soothing expectorant tea for coughs. Reviews and a meta-analysis of Apiaceae herbs report some benefit in dysmenorrhoea; gastrointestinal and respiratory claims rest mainly on tradition and small studies.',
    dosage: null,
    contraindications: null,
    toxicity: 'none',
    lookAlikes: [
      {
        slug: 'trachyspermum-ammi',
        note: 'Fennel fruits and ajwain fruits are both small ridged Apiaceae seeds and are confused in spice blends; fennel is sweeter, larger and anise-scented, ajwain smaller and thyme-scented.',
      },
    ],
    region: ['Mediterranean', 'West Asia', 'South Asia', 'Central Asia'],
    systemsMentioned: ['ayurveda', 'unani', 'western'],
    images: [],
    modelUrl: null,
    modelScale: 1,
    tags: ['carminative', 'culinary spice', 'anise-scented'],
    sources: [
      {
        label:
          'Cardiovascular Effects, Phytochemistry, Drug Interactions, and Safety Profile of Foeniculum vulgare (Pharmaceuticals, 2025)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/41305003/',
      },
      {
        label:
          'Efficacy of herbaceous Apiaceae plants in primary dysmenorrhea: A systematic review and meta-analysis (Annales Pharmaceutiques Francaises, 2026)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/41653970/',
      },
    ],
    verified: false,
    unverified: true,
    publishedAt: '2026-01-05',
  },
  {
    slug: 'tinospora-cordifolia',
    commonName: 'Giloy',
    botanicalName: 'Tinospora cordifolia',
    family: 'Menispermaceae',
    partsUsed: ['stem', 'leaf', 'root'],
    preparations: ['decoction', 'powder', 'juice', 'infusion'],
    ailments: ['fever', 'weak-immunity', 'inflammation'],
    activeCompounds: ['tinosporaside', 'tinocordiside', 'cordifolioside A', 'berberine'],
    description:
      'A succulent, climbing Menispermaceae of tropical South Asia, whose corky stem is the part usually harvested. It is a flagship immunomodulatory herb in Ayurveda, known in classical literature as guduchi.',
    medicinalUses:
      'Traditionally used as a bitter tonic and antipyretic decoction for recurrent fever and for convalescence, and widely promoted as an immune support during respiratory illness. Reviews list immunomodulatory and anti-inflammatory activities, but controlled human evidence is limited and herb-induced liver injury has been reported.',
    dosage: null,
    // Both hepatoprotective claims and documented herb-induced liver-injury cases exist in the
    // literature; the contraindication text records the injury signal without resolving the debate.
    contraindications:
      'Herb-induced liver injury has been documented with Tinospora cordifolia products, so it should be stopped and medical advice sought if jaundice, dark urine or abdominal pain develops, and it should not be combined with other potentially hepatotoxic products without supervision.',
    toxicity: 'low',
    lookAlikes: [],
    region: ['India', 'South Asia', 'Southeast Asia'],
    systemsMentioned: ['ayurveda', 'siddha', 'unani'],
    images: [],
    modelUrl: null,
    modelScale: 1,
    tags: ['immunomodulator', 'bitter tonic', 'antipyretic'],
    sources: [
      {
        label:
          'A comprehensive review on the hepatotoxicity of herbs used in the Indian (Ayush) systems of alternative medicine (Medicine, 2024)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/38640296/',
      },
      {
        label:
          'Traditional uses, hepatoprotective potential, and phytopharmacology of Tinospora cordifolia: a narrative review (Journal of Pharmacy and Pharmacology, 2024)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/38280221/',
      },
      {
        label:
          'Immunomodulatory properties of Giloy (Tinospora cordifolia) leaves and its applications in value-added products (Heliyon, 2025)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/39758376/',
      },
    ],
    verified: false,
    unverified: true,
    publishedAt: '2026-01-05',
  },
  {
    slug: 'bacopa-monnieri',
    commonName: 'Brahmi',
    botanicalName: 'Bacopa monnieri',
    family: 'Plantaginaceae',
    partsUsed: ['whole_plant', 'leaf'],
    preparations: ['powder', 'decoction', 'infusion', 'juice'],
    ailments: ['poor-memory', 'anxiety', 'inflammation'],
    activeCompounds: ['bacoside A', 'bacoside B', 'betulinic acid'],
    description:
      'A creeping, succulent marsh herb of the Plantaginaceae, native to the Indian subcontinent and wetlands across the tropics. Its bitterness comes from the bacoside saponin complex, the best-studied constituent.',
    medicinalUses:
      'Traditionally used as a brain tonic for memory and concentration and as a calming agent for nervous agitation. A meta-analysis of randomised trials found that Bacopa monnieri improves some measures of attention and memory, though trials are short and formulations are not standardised.',
    dosage: null,
    contraindications: null,
    toxicity: 'none',
    lookAlikes: [],
    region: ['India', 'South Asia', 'Southeast Asia'],
    systemsMentioned: ['ayurveda', 'siddha', 'unani'],
    images: [],
    modelUrl: null,
    modelScale: 1,
    tags: ['nootropic', 'marsh plant', 'adaptogen'],
    sources: [
      {
        label:
          'Meta-analysis of randomized controlled trials on cognitive effects of Bacopa monnieri extract (Journal of Ethnopharmacology, 2014)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/24252493/',
      },
      {
        label:
          'Bacopa monnieri: Preclinical and Clinical Evidence of Neuroactive Effects, Safety of Use and the Sea of Uncertainties (Nutrients, 2025)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/40507208/',
      },
    ],
    verified: false,
    unverified: true,
    publishedAt: '2026-01-05',
  },
];

export const PLANT_SEED_COUNT: number = plantSeed.length;
