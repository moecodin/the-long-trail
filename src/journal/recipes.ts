// Recipes and trail cards.
//
// Every recipe is a real one you can cook at home, with numbers per serving so
// "Log it" fills in the meal for you. The six starter recipes are in the
// journal from day 1; more are found along the trail (Della's skillet bread is
// the first, in Leg 1). Each recipe is also a trail card in the album.
//
// Nutrition is worked out from standard food tables and rounded, so treat it
// as a good estimate, the same as any meal you log yourself.

import type { Nutrients } from "./data";

export interface Recipe extends Nutrients {
  id: string;
  name: string;
  /** One line in the trail's voice, shown on the card. */
  line: string;
  meal: "Breakfast" | "Lunch or supper" | "Supper";
  serves: number;
  minutes: string;
  ingredients: string[];
  steps: string[];
  /** In the journal from the start (the rest are found on the trail). */
  starter: boolean;
}

export const RECIPES: Recipe[] = [
  {
    id: "oats",
    name: "Overnight trail oats",
    line: "Made the night before, waiting in the satchel at dawn.",
    meal: "Breakfast",
    serves: 1,
    minutes: "5 min, then overnight",
    kcal: 360, protein: 17, carbs: 53, fat: 10, fiber: 10,
    ingredients: [
      "½ cup rolled oats",
      "½ cup milk (or any milk you like)",
      "¼ cup plain Greek yogurt",
      "1 tbsp chia seeds",
      "½ apple, grated",
      "A pinch of cinnamon",
    ],
    steps: [
      "Stir everything together in a jar or bowl.",
      "Cover and leave it in the fridge overnight (at least 4 hours).",
      "In the morning, stir, add a splash of milk if it's thick, and eat it cold or warmed.",
    ],
    starter: true,
  },
  {
    id: "soup",
    name: "Campfire lentil soup",
    line: "One pot, a slow simmer, and enough for tomorrow too.",
    meal: "Lunch or supper",
    serves: 4,
    minutes: "45 min",
    kcal: 270, protein: 14, carbs: 42, fat: 4, fiber: 8,
    ingredients: [
      "1 cup dry brown or green lentils, rinsed",
      "1 tbsp olive oil",
      "1 onion, 2 carrots and 2 celery sticks, chopped",
      "2 cloves garlic, chopped",
      "1 can (14 oz / 400 g) diced tomatoes",
      "6 cups low-salt vegetable broth",
      "1 tsp cumin, salt and pepper",
      "2 handfuls of spinach",
    ],
    steps: [
      "Warm the oil in a big pot. Cook the onion, carrots and celery for 6 to 8 minutes until soft.",
      "Add the garlic and cumin and stir for a minute.",
      "Add the lentils, tomatoes and broth. Simmer, partly covered, for about 30 minutes until the lentils are tender.",
      "Stir in the spinach until it wilts. Season with salt and pepper.",
    ],
    starter: true,
  },
  {
    id: "scramble",
    name: "Spinach scramble on toast",
    line: "Quick enough for a cold morning before the walk.",
    meal: "Breakfast",
    serves: 1,
    minutes: "10 min",
    kcal: 290, protein: 17, carbs: 20, fat: 16, fiber: 4,
    ingredients: [
      "2 eggs",
      "1 tsp butter or oil",
      "A big handful of spinach",
      "A few cherry tomatoes, halved",
      "1 slice wholegrain bread",
      "Salt and pepper",
    ],
    steps: [
      "Toast the bread.",
      "Warm the butter in a small pan, add the spinach and let it wilt.",
      "Beat the eggs with a pinch of salt and pepper, pour them in and stir gently over low heat until just set.",
      "Pile it onto the toast with the tomatoes on the side.",
    ],
    starter: true,
  },
  {
    id: "skillet",
    name: "One-pan chicken and rice",
    line: "Everything in one skillet, so there's only one thing to wash.",
    meal: "Supper",
    serves: 4,
    minutes: "50 min",
    kcal: 400, protein: 33, carbs: 49, fat: 8, fiber: 6,
    ingredients: [
      "1 lb (450 g) chicken breast, in bite-size pieces",
      "1 cup brown rice, rinsed",
      "1 tbsp olive oil",
      "1 onion and 1 bell pepper, chopped",
      "2½ cups low-salt chicken broth",
      "2 cups broccoli florets",
      "1 cup frozen peas",
      "1 tsp paprika, salt and pepper",
    ],
    steps: [
      "Warm the oil in a deep skillet with a lid. Brown the chicken with the paprika, salt and pepper, then lift it out.",
      "Cook the onion and pepper for 5 minutes. Stir in the rice for a minute.",
      "Pour in the broth, bring it to a simmer, cover and cook on low for 30 minutes.",
      "Put the chicken back, add the broccoli and peas on top, cover and cook 10 more minutes until the rice is tender.",
    ],
    starter: true,
  },
  {
    id: "yogurt",
    name: "Berry yogurt bowl",
    line: "Berries from the hedgerow, a little honey from the hives.",
    meal: "Breakfast",
    serves: 1,
    minutes: "3 min",
    kcal: 280, protein: 20, carbs: 24, fat: 13, fiber: 3,
    ingredients: [
      "¾ cup plain Greek yogurt",
      "½ cup berries (fresh or frozen)",
      "2 tbsp chopped walnuts",
      "1 tsp honey",
    ],
    steps: [
      "Spoon the yogurt into a bowl.",
      "Top with the berries and walnuts, then drizzle the honey over.",
    ],
    starter: true,
  },
  {
    id: "chili",
    name: "Three-bean camp chili",
    line: "Thick, warm and better the second night.",
    meal: "Supper",
    serves: 6,
    minutes: "40 min",
    kcal: 250, protein: 13, carbs: 43, fat: 4, fiber: 12,
    ingredients: [
      "1 tbsp olive oil",
      "1 onion, 1 bell pepper and 1 carrot, chopped",
      "2 cloves garlic, chopped",
      "3 cans beans (kidney, black and pinto), drained and rinsed",
      "1 large can (28 oz / 800 g) crushed tomatoes",
      "1 cup frozen corn",
      "2 tsp chili powder, 1 tsp cumin, salt",
    ],
    steps: [
      "Warm the oil in a big pot and cook the onion, pepper and carrot for 8 minutes.",
      "Add the garlic and spices and stir for a minute.",
      "Add the beans, tomatoes and corn with ½ cup water. Simmer for 25 minutes, stirring now and then.",
      "Taste, add salt, and serve as it is or with a spoon of yogurt on top.",
    ],
    starter: true,
  },
];

export const recipe = (id: string) => RECIPES.find((r) => r.id === id) ?? null;

/** Recipes you have so far: the starters now, found ones once the trail opens. */
export const knownRecipes = () => RECIPES.filter((r) => r.starter);

// ---------- the card album ----------

export type CardKind = "recipe" | "place" | "critter";

/** Cards still out on the trail: shown face down in the album with a hint. */
export const WAITING: { kind: CardKind; hint: string }[] = [
  { kind: "recipe", hint: "Something warm from Della's kitchen" },
  { kind: "place", hint: "A place you know by heart" },
  { kind: "critter", hint: "A friend with a bushy tail" },
];

export const KIND_LABEL: Record<CardKind, string> = { recipe: "Recipe", place: "Place", critter: "Critter" };
