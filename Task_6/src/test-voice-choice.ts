/** Voice choice tests: the assistant defaults to a natural female Indian voice in the reply's language. */

import { chooseVoice, voiceGender, voicesFor } from "./lib/voice/voice-choice";

let total = 0;
let failed = 0;

function assert(condition: boolean, name: string, details?: string) {
  total++;
  if (condition) console.log(`  ✅ PASS: ${name}`);
  else {
    console.error(`  ❌ FAIL: ${name}${details ? ` (${details})` : ""}`);
    failed++;
  }
}

const v = (name: string, lang: string) => ({ name, lang });

console.log("\n--- Voice choice ---");

const windows = [
  v("Microsoft David - English (United States)", "en-US"),
  v("Microsoft Ravi - English (India)", "en-IN"),
  v("Microsoft Heera - English (India)", "en-IN"),
  v("Microsoft Neerja Online (Natural) - English (India)", "en-IN"),
  v("Microsoft Zira - English (United States)", "en-US"),
  v("Microsoft Kalpana - Hindi (India)", "hi-IN"),
  v("Microsoft Madhur - Hindi (India)", "hi-IN"),
  v("Microsoft Swara Online (Natural) - Hindi (India)", "hi-IN"),
  v("Microsoft Aarohi Online (Natural) - Marathi (India)", "mr-IN"),
];

assert(chooseVoice(windows, "en-IN")?.name.includes("Neerja") === true, "English defaults to the natural female Indian voice", chooseVoice(windows, "en-IN")?.name);
assert(chooseVoice(windows, "hi-IN")?.name.includes("Swara") === true, "Hindi defaults to the natural female Hindi voice", chooseVoice(windows, "hi-IN")?.name);
assert(chooseVoice(windows, "mr-IN")?.name.includes("Aarohi") === true, "Marathi uses a Marathi voice when one is installed", chooseVoice(windows, "mr-IN")?.name);

const noNeural = [v("Microsoft David - English (United States)", "en-US"), v("Microsoft Ravi - English (India)", "en-IN"), v("Microsoft Heera - English (India)", "en-IN")];
assert(chooseVoice(noNeural, "en-IN")?.name.includes("Heera") === true, "a female Indian voice beats a male Indian voice and a US voice");
assert(chooseVoice([v("Microsoft David - English (United States)", "en-US"), v("Microsoft Zira - English (United States)", "en-US")], "en-IN")?.lang === "en-US", "with no Indian voice, another English voice is used");

const noMarathi = [v("Microsoft Kalpana - Hindi (India)", "hi-IN"), v("Microsoft Heera - English (India)", "en-IN")];
assert(chooseVoice(noMarathi, "mr-IN")?.name.includes("Kalpana") === true, "Marathi falls back to a Hindi voice, never to an English one");

assert(chooseVoice(windows, "en-IN", "Microsoft Ravi - English (India)")?.name.includes("Ravi") === true, "a voice the user picked is respected");
assert(chooseVoice(windows, "en-IN", "A voice that was uninstalled")?.name.includes("Neerja") === true, "a saved voice that no longer exists falls back to the default");
assert(chooseVoice(windows, "hi-IN", "Microsoft Ravi - English (India)")?.lang === "hi-IN", "a saved English voice is not used for a Hindi reply");
assert(chooseVoice([], "en-IN") === undefined, "no installed voices gives undefined so the browser default is used");

assert(voiceGender(v("Google UK English Female", "en-GB")) === "female" && voiceGender(v("Google UK English Male", "en-GB")) === "male", "Female and Male in a name are understood");
assert(voiceGender(v("Google हिन्दी", "hi-IN")) === "female", "the Google Hindi voice is treated as female");
assert(voicesFor(windows, "en-IN").every((x) => x.lang.startsWith("en")) && voicesFor(windows, "hi-IN").every((x) => x.lang.startsWith("hi")), "each language list only offers voices that can read it");
assert(voicesFor(windows, "mr-IN")[0].lang === "mr-IN" && voicesFor(windows, "mr-IN").some((x) => x.lang === "hi-IN"), "the Marathi list puts Marathi first and offers Hindi as a fallback");

console.log(`\nVoice choice tests: ${total - failed} passed, ${failed} failed (of ${total})`);
if (failed > 0) process.exit(1);
