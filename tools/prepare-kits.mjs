// Copies the kit models the game uses out of the unzipped Quaternius kits into
// public/models/, and shrinks their textures so they load fast on a phone.
//
//   node tools/prepare-kits.mjs <village glTF dir> <props glTF dir> <nature glTF dir> [KayKit Adventurers dir]
//
// Needs ImageMagick (`convert`). The kits are CC0 (public domain). The KayKit
// characters (also CC0) stand in until Quaternius characters arrive.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const [villageDir, propsDir, natureDir, kaykitDir] = process.argv.slice(2);
if (!natureDir) {
  console.error("usage: node tools/prepare-kits.mjs <village glTF dir> <props glTF dir> <nature glTF dir>");
  process.exit(1);
}

const KITS = {
  village: {
    dir: villageDir,
    models: [
      "Wall_Plaster_Straight", "Wall_Plaster_Window_Wide_Round", "Wall_Plaster_Door_Round",
      "Floor_WoodDark", "Door_1_Round", "Window_Wide_Round1", "Corner_Exterior_Wood",
      "Roof_RoundTiles_8x8", "Prop_Chimney", "WindowShutters_Wide_Round_Open",
    ],
  },
  props: {
    dir: propsDir,
    models: [
      "Table_Large", "Chair_1", "Bookcase_2", "Barrel", "Shelf_Simple", "Bag", "CandleStick_Triple",
      "Mug", "Book_5", "Book_Stack_1", "Stool", "FarmCrate_Apple", "Pot_1", "SmallBottles_1",
      "Bucket_Wooden_1",
    ],
    // textures used on their own, for the armchair built in kits.ts
    extraImages: ["T_Trim_Cloth_BaseColor.png"],
  },
  nature: {
    dir: natureDir,
    models: [
      "CommonTree_1", "CommonTree_2", "CommonTree_3", "CommonTree_4", "Pine_1", "Pine_2", "Pine_3",
      "Bush_Common", "Bush_Common_Flowers", "Grass_Common_Tall", "Grass_Wispy_Tall",
      "Flower_3_Group", "Flower_4_Group", "Rock_Medium_1", "Rock_Medium_2", "Rock_Medium_3",
      "RockPath_Round_Wide",
    ],
  },
};

const OUT = path.resolve("public/models");
let bytes = 0;
for (const [kit, { dir, models, extraImages = [] }] of Object.entries(KITS)) {
  const out = path.join(OUT, kit);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const images = new Set(extraImages);
  for (const name of models) {
    const gltf = JSON.parse(fs.readFileSync(path.join(dir, `${name}.gltf`), "utf8"));
    for (const b of gltf.buffers ?? []) fs.copyFileSync(path.join(dir, b.uri), path.join(out, b.uri));
    for (const img of gltf.images ?? []) {
      // The nature kit's common bush ships with red autumn leaves; use the green ones.
      if (name === "Bush_Common" && img.uri === "Leaves_TwistedTree_C.png") img.uri = "Leaves_NormalTree_C.png";
      images.add(img.uri);
    }
    fs.writeFileSync(path.join(out, `${name}.gltf`), JSON.stringify(gltf));
  }
  for (const img of images) {
    // Color maps at 512px, detail maps (normal / roughness / ORM) at 256px.
    const detail = /normal|roughness|orm/i.test(img);
    const size = detail ? 256 : 512;
    execFileSync("convert", [path.join(dir, img), "-resize", `${size}x${size}>`, "-strip", path.join(out, img)]);
  }
  for (const f of fs.readdirSync(out)) bytes += fs.statSync(path.join(out, f)).size;
  console.log(`${kit}: ${models.length} models, ${images.size} textures`);
}
// KayKit Adventurers: three characters plus the shared animations. Their
// textures are tiny and already inside the .glb files.
if (kaykitDir) {
  const out = path.join(OUT, "kaykit");
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  for (const f of ["Characters/gltf/Ranger.glb", "Characters/gltf/Rogue.glb", "Characters/gltf/Rogue_Hooded.glb", "Characters/gltf/Mage.glb",
    "Animations/gltf/Rig_Medium/Rig_Medium_General.glb", "Animations/gltf/Rig_Medium/Rig_Medium_MovementBasic.glb"]) {
    fs.copyFileSync(path.join(kaykitDir, f), path.join(out, path.basename(f)));
    bytes += fs.statSync(path.join(out, path.basename(f))).size;
  }
  console.log("kaykit: 4 characters, 2 animation sets");
}
console.log(`total ${(bytes / 1e6).toFixed(1)} MB in ${OUT}`);
