// Written by `npm run food:import` from the Food Library's Exclusions and
// Substitutions tabs. Do not edit by hand: change the sheet and import it.
import type { FoodRows } from './exclusions.js';

export const BUILT_IN_FOOD_ROWS: FoodRows = {
  "exclusions": [
    {
      "id": "meat_fish_egg",
      "item": "Meat, fish, egg",
      "status": "excluded",
      "notes": "Charaka includes meat soups (mamsa rasa); filter those chunks.",
      "notWhen": [
        "fish pose",
        "your liver",
        "the liver"
      ]
    },
    {
      "id": "honey",
      "item": "Honey",
      "status": "excluded",
      "notes": "Swap: maple syrup, blackstrap molasses or date sugar. 'madhu' in classical texts means honey; don't confuse with madhuka (mahua) or yashtimadhu (licorice).",
      "notWhen": []
    },
    {
      "id": "onion",
      "item": "Onion",
      "status": "excluded",
      "notes": null,
      "notWhen": []
    },
    {
      "id": "garlic",
      "item": "Garlic",
      "status": "excluded",
      "notes": null,
      "notWhen": []
    },
    {
      "id": "potato",
      "item": "Potato",
      "status": "excluded",
      "notes": null,
      "notWhen": []
    },
    {
      "id": "alcohol",
      "item": "Alcohol",
      "status": "excluded",
      "notes": "Classical asava and arishta are self-fermented and contain alcohol.",
      "notWhen": [
        "lift your spirits",
        "high spirits",
        "in good spirits",
        "low spirits"
      ]
    },
    {
      "id": "root_vegetables_and_tubers_anantkaya",
      "item": "Root vegetables and tubers (anantkaya)",
      "status": "excluded",
      "notes": "Exception: ginger is allowed. Dry turmeric is used as a spice.",
      "notWhen": []
    },
    {
      "id": "butter",
      "item": "Butter",
      "status": "excluded",
      "notes": "Ghee is allowed.",
      "notWhen": [
        "peanut butter",
        "almond butter",
        "nut butter",
        "cocoa butter",
        "shea butter"
      ]
    },
    {
      "id": "figs_udumbara_family",
      "item": "Figs (udumbara family)",
      "status": "excluded",
      "notes": "All parts of Ficus trees are excluded.",
      "notWhen": []
    },
    {
      "id": "brinjal_and_wild_relatives",
      "item": "Brinjal and wild relatives",
      "status": "excluded",
      "notes": null,
      "notWhen": []
    },
    {
      "id": "sprouts_and_shoots",
      "item": "Sprouts and shoots",
      "status": "excluded",
      "notes": null,
      "notWhen": [
        "brussels sprouts"
      ]
    },
    {
      "id": "animal_products_non_dairy",
      "item": "Animal products (non-dairy)",
      "status": "excluded",
      "notes": null,
      "notWhen": []
    },
    {
      "id": "toxic_or_practitioner_only_plants",
      "item": "Toxic or practitioner-only plants",
      "status": "unsafe",
      "notes": "Never shown in the app.",
      "notWhen": []
    },
    {
      "id": "many_seeded_fruits",
      "item": "Many-seeded fruits",
      "status": "allowed_by_exception",
      "notes": "Niral's exception, 2026-10-18.",
      "notWhen": []
    },
    {
      "id": "pulse_unboiled_dairy_dvidal",
      "item": "Pulse + unboiled dairy (dvidal)",
      "status": "combination_rule",
      "notes": "pulses (gram, mung, toor, beans) and their preparations (dal, khaman, papad, bhajia, vada, farsan) with unboiled milk, curd, buttermilk or shrikhand. Fine if the milk, curd or buttermilk is boiled well and cooled first. Recipes flagged in jain_dvidal_flag with a preparation_note.",
      "notWhen": []
    },
    {
      "id": "milk_or_curd_sour_fruit",
      "item": "Milk or curd + sour fruit",
      "status": "combination_rule",
      "notes": "milk or curd with lemon, citron, tamarind, amla, orange, wood apple, kokum or other sour fruit or vegetable. Recipes marked Check.",
      "notWhen": []
    },
    {
      "id": "fermented_foods",
      "item": "Fermented foods",
      "status": "excluded",
      "notes": "Anything soured or fermented over time. Fermented batters (idli, jalebi) are allowed when adapted: fresh batter with baking soda, fruit salt or lemon juice, cooked right away.",
      "notWhen": []
    },
    {
      "id": "mushrooms",
      "item": "Mushrooms",
      "status": "excluded",
      "notes": null,
      "notWhen": []
    },
    {
      "id": "alcohol_based_extracts",
      "item": "Alcohol-based extracts",
      "status": "excluded",
      "notes": null,
      "notWhen": []
    },
    {
      "id": "edible_camphor",
      "item": "Edible camphor",
      "status": "allowed_in_small_amounts",
      "notes": "Small amounts only.",
      "notWhen": []
    }
  ],
  "terms": [
    {
      "exclusionId": "meat_fish_egg",
      "term": "meat"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "chicken"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "beef"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "pork"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "lamb"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "mutton"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "goat"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "fish"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "seafood"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "shrimp"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "prawn"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "egg"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "eggs"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "gelatin"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "bone broth"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "meat stock"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "animal fat"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "liver"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "bone marrow"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "mamsa"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "mansa"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "gosht"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "murgh"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "machli"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "anda"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "kukkuta"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "matsya"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "meda"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "majja"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "yakrit"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "quail"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "duck"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "turkey"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "bacon"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "ham"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "sausage"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "tuna"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "salmon"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "crab"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "lobster"
    },
    {
      "exclusionId": "meat_fish_egg",
      "term": "turkey bacon"
    },
    {
      "exclusionId": "honey",
      "term": "honey"
    },
    {
      "exclusionId": "honey",
      "term": "madhu"
    },
    {
      "exclusionId": "honey",
      "term": "shahad"
    },
    {
      "exclusionId": "honey",
      "term": "shahd"
    },
    {
      "exclusionId": "honey",
      "term": "kshaudra"
    },
    {
      "exclusionId": "honey",
      "term": "makshika"
    },
    {
      "exclusionId": "onion",
      "term": "onion"
    },
    {
      "exclusionId": "onion",
      "term": "shallot"
    },
    {
      "exclusionId": "onion",
      "term": "scallion"
    },
    {
      "exclusionId": "onion",
      "term": "spring onion"
    },
    {
      "exclusionId": "onion",
      "term": "green onion"
    },
    {
      "exclusionId": "onion",
      "term": "leek"
    },
    {
      "exclusionId": "onion",
      "term": "chives"
    },
    {
      "exclusionId": "onion",
      "term": "palandu"
    },
    {
      "exclusionId": "onion",
      "term": "pyaz"
    },
    {
      "exclusionId": "onion",
      "term": "pyaaz"
    },
    {
      "exclusionId": "onion",
      "term": "kanda (onion)"
    },
    {
      "exclusionId": "garlic",
      "term": "garlic"
    },
    {
      "exclusionId": "garlic",
      "term": "garlic powder"
    },
    {
      "exclusionId": "garlic",
      "term": "lasuna"
    },
    {
      "exclusionId": "garlic",
      "term": "lashuna"
    },
    {
      "exclusionId": "garlic",
      "term": "rasona"
    },
    {
      "exclusionId": "garlic",
      "term": "lahsun"
    },
    {
      "exclusionId": "garlic",
      "term": "lehsun"
    },
    {
      "exclusionId": "potato",
      "term": "potato"
    },
    {
      "exclusionId": "potato",
      "term": "potatoes"
    },
    {
      "exclusionId": "potato",
      "term": "aloo"
    },
    {
      "exclusionId": "potato",
      "term": "alu"
    },
    {
      "exclusionId": "potato",
      "term": "batata"
    },
    {
      "exclusionId": "potato",
      "term": "aluka"
    },
    {
      "exclusionId": "alcohol",
      "term": "alcohol"
    },
    {
      "exclusionId": "alcohol",
      "term": "wine"
    },
    {
      "exclusionId": "alcohol",
      "term": "beer"
    },
    {
      "exclusionId": "alcohol",
      "term": "spirits"
    },
    {
      "exclusionId": "alcohol",
      "term": "liquor"
    },
    {
      "exclusionId": "alcohol",
      "term": "rum"
    },
    {
      "exclusionId": "alcohol",
      "term": "vodka"
    },
    {
      "exclusionId": "alcohol",
      "term": "whisky"
    },
    {
      "exclusionId": "alcohol",
      "term": "brandy"
    },
    {
      "exclusionId": "alcohol",
      "term": "madya"
    },
    {
      "exclusionId": "alcohol",
      "term": "sura"
    },
    {
      "exclusionId": "alcohol",
      "term": "asava"
    },
    {
      "exclusionId": "alcohol",
      "term": "arishta"
    },
    {
      "exclusionId": "root_vegetables_and_tubers_anantkaya",
      "term": "radish"
    },
    {
      "exclusionId": "root_vegetables_and_tubers_anantkaya",
      "term": "carrot"
    },
    {
      "exclusionId": "root_vegetables_and_tubers_anantkaya",
      "term": "beetroot"
    },
    {
      "exclusionId": "root_vegetables_and_tubers_anantkaya",
      "term": "turnip"
    },
    {
      "exclusionId": "root_vegetables_and_tubers_anantkaya",
      "term": "sweet potato"
    },
    {
      "exclusionId": "root_vegetables_and_tubers_anantkaya",
      "term": "elephant foot yam (suran)"
    },
    {
      "exclusionId": "root_vegetables_and_tubers_anantkaya",
      "term": "taro"
    },
    {
      "exclusionId": "root_vegetables_and_tubers_anantkaya",
      "term": "lotus root (shaluka)"
    },
    {
      "exclusionId": "root_vegetables_and_tubers_anantkaya",
      "term": "any kanda (tuber)"
    },
    {
      "exclusionId": "butter",
      "term": "butter"
    },
    {
      "exclusionId": "butter",
      "term": "navaneet"
    },
    {
      "exclusionId": "butter",
      "term": "navnit"
    },
    {
      "exclusionId": "figs_udumbara_family",
      "term": "fig"
    },
    {
      "exclusionId": "figs_udumbara_family",
      "term": "anjeer"
    },
    {
      "exclusionId": "figs_udumbara_family",
      "term": "udumbara"
    },
    {
      "exclusionId": "figs_udumbara_family",
      "term": "ashwattha (peepal)"
    },
    {
      "exclusionId": "figs_udumbara_family",
      "term": "nyagrodha (banyan)"
    },
    {
      "exclusionId": "figs_udumbara_family",
      "term": "plaksha"
    },
    {
      "exclusionId": "brinjal_and_wild_relatives",
      "term": "brinjal"
    },
    {
      "exclusionId": "brinjal_and_wild_relatives",
      "term": "eggplant"
    },
    {
      "exclusionId": "brinjal_and_wild_relatives",
      "term": "aubergine"
    },
    {
      "exclusionId": "brinjal_and_wild_relatives",
      "term": "baingan"
    },
    {
      "exclusionId": "brinjal_and_wild_relatives",
      "term": "vrintaka"
    },
    {
      "exclusionId": "brinjal_and_wild_relatives",
      "term": "vartaka"
    },
    {
      "exclusionId": "brinjal_and_wild_relatives",
      "term": "brihati"
    },
    {
      "exclusionId": "brinjal_and_wild_relatives",
      "term": "kantakari"
    },
    {
      "exclusionId": "sprouts_and_shoots",
      "term": "sprouts"
    },
    {
      "exclusionId": "sprouts_and_shoots",
      "term": "sprouted grains"
    },
    {
      "exclusionId": "sprouts_and_shoots",
      "term": "ankura"
    },
    {
      "exclusionId": "sprouts_and_shoots",
      "term": "bamboo shoots (vanshankura)"
    },
    {
      "exclusionId": "animal_products_non_dairy",
      "term": "musk (kasturi)"
    },
    {
      "exclusionId": "animal_products_non_dairy",
      "term": "cow urine (gomutra)"
    },
    {
      "exclusionId": "toxic_or_practitioner_only_plants",
      "term": "datura"
    },
    {
      "exclusionId": "toxic_or_practitioner_only_plants",
      "term": "calotropis (arka)"
    },
    {
      "exclusionId": "toxic_or_practitioner_only_plants",
      "term": "rosary pea (gunja)"
    },
    {
      "exclusionId": "toxic_or_practitioner_only_plants",
      "term": "castor (eranda)"
    },
    {
      "exclusionId": "toxic_or_practitioner_only_plants",
      "term": "danti"
    },
    {
      "exclusionId": "toxic_or_practitioner_only_plants",
      "term": "oleander (karvira)"
    },
    {
      "exclusionId": "toxic_or_practitioner_only_plants",
      "term": "aconite (ativisha)"
    },
    {
      "exclusionId": "toxic_or_practitioner_only_plants",
      "term": "euphorbia (snuhi)"
    },
    {
      "exclusionId": "many_seeded_fruits",
      "term": "berries"
    },
    {
      "exclusionId": "many_seeded_fruits",
      "term": "custard apple"
    },
    {
      "exclusionId": "many_seeded_fruits",
      "term": "pomegranate"
    },
    {
      "exclusionId": "fermented_foods",
      "term": "kanji"
    },
    {
      "exclusionId": "fermented_foods",
      "term": "dhanyamla"
    },
    {
      "exclusionId": "fermented_foods",
      "term": "shukta"
    },
    {
      "exclusionId": "fermented_foods",
      "term": "chukra"
    },
    {
      "exclusionId": "mushrooms",
      "term": "mushroom"
    },
    {
      "exclusionId": "mushrooms",
      "term": "khumb"
    },
    {
      "exclusionId": "mushrooms",
      "term": "chhatrak"
    },
    {
      "exclusionId": "alcohol_based_extracts",
      "term": "vanilla extract"
    },
    {
      "exclusionId": "alcohol_based_extracts",
      "term": "tinctures"
    },
    {
      "exclusionId": "edible_camphor",
      "term": "karpura (edible grade only)"
    }
  ],
  "substitutions": [
    {
      "replaces": "Honey",
      "swap": "Maple syrup"
    },
    {
      "replaces": "Honey",
      "swap": "Blackstrap molasses"
    },
    {
      "replaces": "Honey",
      "swap": "Date sugar or date syrup"
    },
    {
      "replaces": "Honey",
      "swap": "Jaggery (guda)"
    },
    {
      "replaces": "Honey",
      "swap": "Rock sugar (mishri)"
    },
    {
      "replaces": "Overnight-fermented batter (idli)",
      "swap": "Fresh batter + baking soda or fruit salt"
    },
    {
      "replaces": "Sun-soured batter (jalebi)",
      "swap": "Lemon juice or citric acid + baking soda"
    }
  ]
};
