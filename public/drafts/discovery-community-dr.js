// Generated from lib/diminishing-returns.ts; source SHA256 48c28aac9587cea59d81bbf22e6898b533e5a252addda723dce0f6063c96c244
const NUMBER = "(-?(?:\\d+(?:\\.\\d*)?|\\.\\d+))";
const THRESHOLD = 30;
const EPSILON = 1e-9;
function numericMatch(text, patterns) {
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            const value = Number(match[1]);
            if (Number.isFinite(value))
                return value;
        }
    }
    return null;
}
/**
 * Return an empty string for absent text; otherwise clamp the rounded level to 1-5, remove leading tags, evaluate scale placeholders as base + increase * (level - 1), unwrap numeric placeholders, and collapse whitespace.
 * refs: none
 * I/O types: `description: string | null | undefined; level: number -> string`.
 */
export function resolveScaledDescription(description, level) {
    if (!description)
        return "";
    const safeLevel = Math.max(1, Math.min(5, Math.round(level || 1)));
    return description
        .replace(/^\s*(?:\[[^\]]+\]\s*)+/, "")
        .replace(/\{\s*(?:scale\s*=\s*)?(-?(?:\d+(?:\.\d*)?|\.\d+))\s*\|\s*(-?(?:\d+(?:\.\d*)?|\.\d+))\s*\}/gi, (_match, base, increase) => {
        const value = Number(base) + Number(increase) * (safeLevel - 1);
        return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
    })
        .replace(/\{\s*(-?(?:\d+(?:\.\d*)?|\.\d+))\s*\}/g, "$1")
        .replace(/\s+/g, " ")
        .trim();
}
function effect(key, value, source, options) {
    return value == null || value === 0 ? [] : [{
            ...source,
            key,
            value: Math.abs(value),
            direction: options?.direction ?? "increase",
            target: options?.target ?? "self",
        }];
}
const ALL_WEAPON_DAMAGE_SCENARIOS = ["players", "deployables", "shields"];
/**
 * Conditional talents frequently describe the same outgoing weapon stat with
 * incompatible grammar. Keep their scope keyed to stable game IDs so a broad
 * text match cannot turn ability damage, maximum-Health damage, or flat damage
 * procs into a misleading weapon percentage.
 * refs: none
 */
const TALENT_WEAPON_DAMAGE_RULES = {
    16370: { patterns: [new RegExp(`damage you deal with your weapon shots[^.]*?by\\s+${NUMBER}%`, "i")], scenarios: ALL_WEAPON_DAMAGE_SCENARIOS }, // Over the Moon
    16384: { patterns: [new RegExp(`weapon shot's damage[^.]*?by\\s+${NUMBER}%`, "i")], scenarios: ALL_WEAPON_DAMAGE_SCENARIOS }, // Exaction
    16406: { patterns: [new RegExp(`damage of each of your daggers[^.]*?by\\s+${NUMBER}%`, "i")], scenarios: ALL_WEAPON_DAMAGE_SCENARIOS }, // Cat Burglar
    16383: { patterns: [new RegExp(`damage dealt[^.]*?Rocket Launcher or Salvo[^.]*?by\\s+${NUMBER}%`, "i")], scenarios: ALL_WEAPON_DAMAGE_SCENARIOS }, // Fusillade
    16456: { patterns: [new RegExp(`fully-charged shot[^.]*?additional\\s+${NUMBER}%\\s+damage`, "i")], scenarios: ALL_WEAPON_DAMAGE_SCENARIOS }, // Steady Aim
    16433: { patterns: [new RegExp(`weapon shot[^.]*?deals\\s+${NUMBER}%\\s+increased damage`, "i")], scenarios: ["players"] }, // Pluck
    18814: { patterns: [new RegExp(`Heirloom Rifle damage[^.]*?by\\s+${NUMBER}%`, "i")], scenarios: ["players"], stackPattern: /stacking up to\s+(\d+)\s+times/i }, // Precision
    33708: { patterns: [new RegExp(`Carbine Rifle[^.]*?deals\\s+${NUMBER}%\\s+bonus damage`, "i")], scenarios: ["players"] }, // High Voltage
    26957: { patterns: [new RegExp(`gain\\s+${NUMBER}%\\s+increased weapon damage`, "i")], scenarios: ALL_WEAPON_DAMAGE_SCENARIOS }, // Paratrooper
    20315: { patterns: [new RegExp(`gain\\s+${NUMBER}%\\s+increased damage`, "i")], scenarios: ALL_WEAPON_DAMAGE_SCENARIOS }, // Opportunity in Chaos
    19223: { patterns: [new RegExp(`deal\\s+${NUMBER}%\\s+increased weapon damage`, "i")], scenarios: ALL_WEAPON_DAMAGE_SCENARIOS, target: "ally" }, // Luminary
    31891: { patterns: [new RegExp(`take\\s+${NUMBER}%\\s+additional weapon damage`, "i")], scenarios: ["players"], target: "enemy" }, // Abyssal Breach
    16391: { patterns: [new RegExp(`take\\s+${NUMBER}%\\s+increased damage from your weapon shots`, "i")], scenarios: ["players"], target: "enemy" }, // Catalyst
    16914: { patterns: [new RegExp(`damage you deal to your Retribution target[^.]*?by\\s+${NUMBER}%`, "i")], scenarios: ["players"] }, // Discovery
    16386: { patterns: [new RegExp(`damage you deal to targets Slowed by Net Shot[^.]*?by\\s+${NUMBER}%`, "i")], scenarios: ["players"] }, // Ensnare
    27509: { patterns: [new RegExp(`enemies take\\s+${NUMBER}%\\s+more (?:damage|DMG)`, "i")], scenarios: ["players"], target: "enemy" }, // Window of Opportunity
    16451: { patterns: [new RegExp(`damage done by allies[^.]*?by\\s+${NUMBER}%`, "i")], scenarios: ALL_WEAPON_DAMAGE_SCENARIOS, target: "ally" }, // Field Study
    22890: { patterns: [new RegExp(`reduce your damage-per-shot by\\s+${NUMBER}%`, "i")], scenarios: ALL_WEAPON_DAMAGE_SCENARIOS, direction: "decrease" }, // Storm of Bullets
    // Soul Collector has 15 charges; Resuscitate changes the per-charge value.
    33709: { patterns: [new RegExp(`weapon (?:damage|DMG) bonus[^.]*?to\\s+${NUMBER}%\\s+per charge`, "i")], scenarios: ALL_WEAPON_DAMAGE_SCENARIOS, fixedStacks: 15 }, // Resuscitate
    16389: { patterns: [new RegExp(`maximum damage scaling over distance[^.]*?by\\s+${NUMBER}%`, "i")], scenarios: ALL_WEAPON_DAMAGE_SCENARIOS }, // Ferocity
    31059: { patterns: [new RegExp(`War's attacks[^.]*?additional\\s+${NUMBER}%\\s+damage`, "i")], scenarios: ["players"] }, // It's Got Some Heft
};
function weaponDamageEffects(value, source, options = {}) {
    const keyByScenario = {
        players: "weapon-damage",
        deployables: "weapon-damage-deployables",
        shields: "weapon-damage-shields",
    };
    return (options.scenarios ?? ALL_WEAPON_DAMAGE_SCENARIOS).flatMap((scenario) => effect(keyByScenario[scenario], value, source, { direction: options.direction, target: options.target }));
}
function detectTalentWeaponDamage(input, description, source) {
    if (input.type !== "talent")
        return null;
    const rule = TALENT_WEAPON_DAMAGE_RULES[input.id];
    if (!rule)
        return null;
    const perStack = numericMatch(description, rule.patterns);
    if (perStack == null)
        return [];
    const describedStacks = rule.stackPattern ? numericMatch(description, [rule.stackPattern]) : null;
    const stacks = rule.fixedStacks ?? describedStacks ?? 1;
    return weaponDamageEffects(perStack * stacks, source, rule);
}
/**
 * Extract only explicit, calculator-safe stat changes. The full source text is
 * retained because many Paladins bonuses are conditional and should be read as
 * a simultaneous best-case estimate, not as permanent uptime.
 * refs: none
 * I/O types: `input: { id: number; name: string; type: EffectSourceType; description?: string | null; level?: number; } -> DetectedEffect[]`.
 */
export function detectDescriptionEffects(input) {
    const description = resolveScaledDescription(input.description, input.level ?? 1);
    if (!description)
        return [];
    const source = {
        sourceId: input.id,
        sourceName: input.name,
        sourceType: input.type,
        description,
    };
    const results = [];
    if (/at level 3/i.test(description) && (input.level ?? 1) < 3)
        return [];
    const movement = numericMatch(description, [
        new RegExp(`(?:gain|increase)(?: your)?\\s+${NUMBER}%\\s+(?:bonus )?movement speed`, "i"),
        new RegExp(`(?:increase|gain)[^.]*?movement speed(?: bonus)?[^.]*?by\\s+${NUMBER}%`, "i"),
    ]);
    results.push(...effect("movement-speed", movement, source));
    const movementPenalty = numericMatch(description, [
        new RegExp(`reduce your movement speed(?: bonus)?[^.]*?by\\s+${NUMBER}%`, "i"),
        new RegExp(`slow yourself[^.]*?by\\s+${NUMBER}%`, "i"),
    ]);
    results.push(...effect("movement-speed", movementPenalty, source, { direction: "decrease", target: "self" }));
    if (!/duration and effectiveness of crowd control/i.test(description)) {
        const slow = numericMatch(description, [
            new RegExp(`\\b(?:slow|slows)\\b[^.]*?by\\s+${NUMBER}%`, "i"),
            new RegExp(`reduce (?:an enemy's|the enemy's|the target's|their) movement speed[^.]*?by\\s+${NUMBER}%`, "i"),
        ]);
        results.push(...effect("movement-speed", slow, source, { direction: "decrease", target: "enemy" }));
    }
    const mountSpeed = numericMatch(description, [
        new RegExp(`increase your mount speed[^.]*?by\\s+${NUMBER}%`, "i"),
        new RegExp(`gain\\s+${NUMBER}%\\s+mount speed`, "i"),
    ]);
    results.push(...effect("mount-speed", mountSpeed, source));
    const damageReduction = numericMatch(description, [
        new RegExp(`reduce (?:the )?damage (?:you take|taken|received)[^.]*?by\\s+${NUMBER}%`, "i"),
        new RegExp(`reduce your damage taken[^.]*?by\\s+${NUMBER}%`, "i"),
        new RegExp(`gain\\s+${NUMBER}%\\s+damage reduction`, "i"),
    ]);
    if (damageReduction != null) {
        const directOnly = /direct attacks?/i.test(description);
        const areaOnly = /area of effect|area damage|blast damage/i.test(description);
        if (!areaOnly)
            results.push(...effect("damage-reduction-direct", damageReduction, source));
        if (!directOnly)
            results.push(...effect("damage-reduction-area", damageReduction, source));
    }
    const selfDamageTaken = numericMatch(description, [
        new RegExp(`(?:you|your champion) take\\s+${NUMBER}%\\s+(?:additional|increased|more)\\s+damage`, "i"),
        new RegExp(`increase your damage taken[^.]*?by\\s+${NUMBER}%`, "i"),
    ]);
    if (selfDamageTaken != null) {
        const directOnly = /direct attacks?|direct damage/i.test(description);
        const areaOnly = /area of effect|area damage|blast damage/i.test(description);
        if (!areaOnly)
            results.push(...effect("damage-reduction-direct", selfDamageTaken, source, { direction: "decrease", target: "self" }));
        if (!directOnly)
            results.push(...effect("damage-reduction-area", selfDamageTaken, source, { direction: "decrease", target: "self" }));
    }
    const damageTaken = numericMatch(description, [
        new RegExp(`(?:enemies|targets?|players?)[^.]*?take\\s+${NUMBER}%\\s+(?:additional|increased|more)\\s+damage`, "i"),
        new RegExp(`increase (?:the )?damage (?:an enemy|enemies|the target|targets?) (?:takes?|receives?)[^.]*?by\\s+${NUMBER}%`, "i"),
    ]);
    const weaponSpecificDamageTaken = /weapon (?:shots?|damage)\b/i.test(description);
    if (damageTaken != null && !weaponSpecificDamageTaken) {
        const directOnly = /direct attacks?|direct damage/i.test(description);
        const areaOnly = /area of effect|area damage|blast damage/i.test(description);
        if (!areaOnly)
            results.push(...effect("damage-reduction-direct", damageTaken, source, { direction: "decrease", target: "enemy" }));
        if (!directOnly)
            results.push(...effect("damage-reduction-area", damageTaken, source, { direction: "decrease", target: "enemy" }));
    }
    const lifeSteal = numericMatch(description, [
        new RegExp(`${NUMBER}%\\s+life\\s*steal`, "i"),
        new RegExp(`life\\s*steal[^.]*?by\\s+${NUMBER}%`, "i"),
    ]);
    results.push(...effect("life-steal", lifeSteal, source));
    const healingReceived = numericMatch(description, [
        new RegExp(`receive\\s+${NUMBER}%\\s+more healing`, "i"),
        new RegExp(`increase (?:your )?(?:healing received|healing from other players)[^.]*?by\\s+${NUMBER}%`, "i"),
    ]);
    results.push(...effect("healing-received", healingReceived, source));
    const healingReduction = numericMatch(description, [
        new RegExp(`reduce (?:the )?(?:healing received|healing (?:an enemy|enemies|the target|targets?) receives?)[^.]*?by\\s+${NUMBER}%`, "i"),
        new RegExp(`(?:enemy|enemies|target|targets?) receive(?:s)?\\s+${NUMBER}%\\s+less healing`, "i"),
        new RegExp(`receive\\s+${NUMBER}%\\s+less healing`, "i"),
    ]);
    if (healingReduction != null) {
        const target = /(?:enemy|enemies|target|targets?)/i.test(description) ? "enemy" : "self";
        results.push(...effect("healing-received", healingReduction, source, { direction: "decrease", target }));
    }
    const crowdControlReduction = numericMatch(description, [
        new RegExp(`reduce (?:the )?duration and effectiveness of crowd control and slows[^.]*?by\\s+${NUMBER}%`, "i"),
        new RegExp(`reduce (?:the )?duration of crowd control[^.]*?by\\s+${NUMBER}%`, "i"),
    ]);
    results.push(...effect("crowd-control-reduction", crowdControlReduction, source));
    const cooldownReduction = numericMatch(description, [
        new RegExp(`reduce (?:the )?cooldown of all (?:your )?abilities[^.]*?by\\s+${NUMBER}%`, "i"),
        new RegExp(`reduce your active cooldowns[^.]*?by\\s+${NUMBER}%`, "i"),
    ]);
    results.push(...effect("cooldown-reduction", cooldownReduction, source));
    const reloadSpeed = numericMatch(description, [
        new RegExp(`increase your reload speed[^.]*?by\\s+${NUMBER}%`, "i"),
        new RegExp(`gain\\s+${NUMBER}%\\s+reload speed`, "i"),
    ]);
    results.push(...effect("reload-speed", reloadSpeed, source));
    const ultimateCharge = numericMatch(description, [
        new RegExp(`increase your ultimate charge rate[^.]*?by\\s+${NUMBER}%`, "i"),
        new RegExp(`gain\\s+${NUMBER}%\\s+ultimate charge rate`, "i"),
    ]);
    results.push(...effect("ultimate-charge", ultimateCharge, source));
    const maximumHealth = numericMatch(description, [
        new RegExp(`increase your maximum health[^.%]*?by\\s+${NUMBER}(?![\\d.]|\\s*%)`, "i"),
        new RegExp(`gain\\s+${NUMBER}\\s+maximum health`, "i"),
    ]);
    results.push(...effect("maximum-health", maximumHealth, source));
    const maximumAmmo = numericMatch(description, [
        new RegExp(`increase your maximum ammo[^.%]*?by\\s+${NUMBER}(?![\\d.]|\\s*%)`, "i"),
    ]);
    results.push(...effect("maximum-ammo", maximumAmmo, source));
    const shieldHealth = numericMatch(description, [
        new RegExp(`gain (?:a )?${NUMBER}(?:-health)? shield`, "i"),
        new RegExp(`increase [^.]*?shield(?:'s)? maximum health[^.%]*?by\\s+${NUMBER}(?![\\d.]|\\s*%)`, "i"),
        new RegExp(`increase (?:the )?health of [^.]*?shield[^.%]*?by\\s+${NUMBER}(?![\\d.]|\\s*%)`, "i"),
    ]);
    results.push(...effect("shield-health", shieldHealth, source));
    const shieldEffectiveness = numericMatch(description, [
        new RegExp(`increase (?:the )?effectiveness of shields you create[^.]*?by\\s+${NUMBER}%`, "i"),
    ]);
    results.push(...effect("shield-effectiveness", shieldEffectiveness, source));
    const talentWeaponDamage = detectTalentWeaponDamage(input, description, source);
    if (talentWeaponDamage != null)
        results.push(...talentWeaponDamage);
    const deployableDamage = numericMatch(description, [
        new RegExp(`weapon (?:shots|attacks)[^.]*?deal\\s+${NUMBER}%\\s+increased damage to deployables`, "i"),
    ]);
    const shieldDamage = numericMatch(description, [
        new RegExp(`weapon (?:shots|attacks)[^.]*?deal\\s+${NUMBER}%\\s+increased damage to shields`, "i"),
    ]);
    const weaponDamage = numericMatch(description, [
        new RegExp(`weapon (?:shots?|attacks?)[^.]*?deals?\\s+${NUMBER}%\\s+increased damage`, "i"),
        new RegExp(`increase (?:your )?weapon damage[^.]*?by\\s+${NUMBER}%`, "i"),
        new RegExp(`increase (?:your )?in-hand weapon damage dealt[^.]*?by\\s+${NUMBER}%`, "i"),
        new RegExp(`increase (?:the )?damage you deal with (?:your )?weapon shots[^.]*?by\\s+${NUMBER}%`, "i"),
        new RegExp(`weapon shot's damage[^.]*?increased by\\s+${NUMBER}%`, "i"),
        new RegExp(`weapon shots?[^.]*?deal(?:s)? an additional\\s+${NUMBER}%\\s+damage`, "i"),
    ]);
    if (talentWeaponDamage != null) {
        // Talent rules above preserve player-only, ally, enemy, and stack scope.
    }
    else if (deployableDamage != null) {
        results.push(...effect("weapon-damage-deployables", deployableDamage, source));
    }
    else if (shieldDamage != null) {
        results.push(...effect("weapon-damage-shields", shieldDamage, source));
    }
    else if (weaponDamage != null) {
        // General weapon bonuses affect players and carry into target-specific scenarios.
        results.push(...weaponDamageEffects(weaponDamage, source));
    }
    const levelThreeBundle = numericMatch(description, [
        new RegExp(`gain\\s+${NUMBER}%\\s+movement, mount, cooldown, and ultimate charge speed`, "i"),
    ]);
    if (levelThreeBundle != null) {
        results.push(...effect("movement-speed", levelThreeBundle, source));
        results.push(...effect("mount-speed", levelThreeBundle, source));
        results.push(...effect("cooldown-reduction", levelThreeBundle, source));
        results.push(...effect("ultimate-charge", levelThreeBundle, source));
    }
    return results;
}
function emptyDirectionalValue() {
    return {
        additive: 0,
        guaranteedBase: 0,
        beforeCap: 0,
        final: 0,
        diminishedAmount: 0,
        thresholdApplied: false,
        capApplied: false,
    };
}
/**
 * Discard non-finite and non-positive bonuses. Apply the diminishing curve above the shared threshold when multiple bonuses contribute, preserve the highest/threshold base, and cap movement at 150% or other effects at 95%; return additive, diminished, capped, and threshold diagnostics.
 * refs: none
 * I/O types: `values: number[]; movement: boolean -> DirectionalDiminishedValue`.
 */
export function calculateDirectionalDiminishedValue(values, movement = false) {
    const bonuses = values.filter((value) => Number.isFinite(value) && value > 0);
    if (!bonuses.length)
        return emptyDirectionalValue();
    const cap = movement ? 150 : 95;
    const additive = bonuses.reduce((sum, value) => sum + value, 0);
    const highest = Math.max(...bonuses);
    const thresholdApplied = bonuses.length > 1 && additive > THRESHOLD + EPSILON;
    const guaranteedBase = thresholdApplied ? Math.max(highest, THRESHOLD) : additive;
    let beforeCap = additive;
    if (thresholdApplied) {
        const totalFraction = additive / 100;
        const baseFraction = guaranteedBase / 100;
        const diminishedFraction = movement
            ? baseFraction + (1.5 - baseFraction) * ((totalFraction - baseFraction) / (totalFraction + 1.06))
            : baseFraction + (0.95 - baseFraction) * ((totalFraction - baseFraction) / (totalFraction + 0.5));
        // The curve must never manufacture value or undercut the guaranteed base.
        beforeCap = Math.min(additive, Math.max(guaranteedBase, diminishedFraction * 100));
    }
    const capApplied = beforeCap > cap + EPSILON;
    const final = Math.max(0, Math.min(beforeCap, cap));
    return {
        additive,
        guaranteedBase,
        beforeCap,
        final,
        diminishedAmount: Math.max(0, additive - beforeCap),
        thresholdApplied,
        capApplied,
    };
}
/**
 * Ignore non-finite values. For reload effects, clamp their additive total to -60..60%; otherwise diminish positive and negative magnitudes separately and subtract them. Return the final value, lost magnitude, and both directional diagnostics.
 * refs: none
 * I/O types: `values: number[]; options?: { movement?: boolean; reload?: boolean } -> DiminishedValue`.
 */
export function calculateDiminishedValue(values, options) {
    const finiteValues = values.filter(Number.isFinite);
    const additive = finiteValues.reduce((sum, value) => sum + value, 0);
    if (options?.reload) {
        const final = Math.max(-60, Math.min(60, additive));
        const capApplied = Math.abs(additive) > 60 + EPSILON;
        const positiveAdditive = finiteValues.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
        const negativeAdditive = finiteValues.filter((value) => value < 0).reduce((sum, value) => sum + Math.abs(value), 0);
        const positive = { ...emptyDirectionalValue(), additive: positiveAdditive, guaranteedBase: positiveAdditive, beforeCap: positiveAdditive, final: Math.min(positiveAdditive, 60), capApplied: positiveAdditive > 60 + EPSILON };
        const negative = { ...emptyDirectionalValue(), additive: negativeAdditive, guaranteedBase: negativeAdditive, beforeCap: negativeAdditive, final: Math.min(negativeAdditive, 60), capApplied: negativeAdditive > 60 + EPSILON };
        return { additive, final, lost: Math.max(0, Math.abs(additive) - Math.abs(final)), capped: capApplied, thresholdApplied: false, positive, negative };
    }
    const positive = calculateDirectionalDiminishedValue(finiteValues.filter((value) => value > 0), Boolean(options?.movement));
    const negative = calculateDirectionalDiminishedValue(finiteValues.filter((value) => value < 0).map(Math.abs), Boolean(options?.movement));
    const final = positive.final - negative.final;
    return {
        additive,
        final,
        lost: Math.max(0, Math.abs(additive) - Math.abs(final)),
        capped: positive.capApplied || negative.capApplied,
        thresholdApplied: positive.thresholdApplied || negative.thresholdApplied,
        positive,
        negative,
    };
}
/**
 * Sum finite signed effect values without diminishing returns or caps, retaining separate positive and negative totals and reporting zero loss.
 * refs: none
 * I/O types: `values: number[] -> DiminishedValue`.
 */
export function calculateAdditiveValue(values) {
    const finiteValues = values.filter(Number.isFinite);
    const additive = finiteValues.reduce((sum, value) => sum + value, 0);
    const positiveAdditive = finiteValues.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
    const negativeAdditive = finiteValues.filter((value) => value < 0).reduce((sum, value) => sum + Math.abs(value), 0);
    const positive = { ...emptyDirectionalValue(), additive: positiveAdditive, guaranteedBase: positiveAdditive, beforeCap: positiveAdditive, final: positiveAdditive };
    const negative = { ...emptyDirectionalValue(), additive: negativeAdditive, guaranteedBase: negativeAdditive, beforeCap: negativeAdditive, final: negativeAdditive };
    return {
        additive,
        final: additive,
        lost: 0,
        capped: false,
        thresholdApplied: false,
        positive,
        negative,
    };
}
/**
 * Resolve the level-one description and extract a positive weapon-damage override from supported weapon phrases or a Weapon-tagged description. Return null when no positive supported damage value is found.
 * refs: none
 * I/O types: `description: string | null | undefined -> number | null`.
 */
export function extractWeaponDamageOverride(description) {
    const weaponTagged = /^\s*\[Weapon\]/i.test(description ?? "");
    const text = resolveScaledDescription(description, 1);
    const value = numericMatch(text, [
        new RegExp(`your weapon[^.]*?dealing\\s+${NUMBER}\\s+(?:direct )?damage`, "i"),
        new RegExp(`weapon (?:shots|attacks)[^.]*?deal\\s+${NUMBER}\\s+(?:direct )?damage`, "i"),
        ...(weaponTagged ? [
            new RegExp(`(?:deals?|dealing)\\s+${NUMBER}\\s+(?:direct )?damage`, "i"),
            new RegExp(`firing[^.]*?${NUMBER}-damage shots`, "i"),
        ] : []),
    ]);
    return value != null && value > 0 ? value : null;
}
