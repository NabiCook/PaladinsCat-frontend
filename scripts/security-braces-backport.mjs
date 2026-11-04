import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { constants, openSync, fstatSync, lstatSync, readSync, closeSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const expectedManifest = "b6661778f94e5de5006e97bb7667f520c704c007ddfb5556cf819e95c85445e3";
const purl = "pkg:npm/braces@3.0.3";
const advisory = "CVE-2026-93687";
const hash = (bytes, algorithm = "sha256", encoding = "hex") => createHash(algorithm).update(bytes).digest(encoding);

/** Read the checked descriptor, bounded even if its file grows during the read. */
export function readBoundedFile(filename, maximum) {
  const fd = openSync(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const opened = fstatSync(fd);
    const named = lstatSync(filename);
    assert.ok(opened.isFile() && named.isFile() && !named.isSymbolicLink()
      && opened.dev === named.dev && opened.ino === named.ino && opened.size <= maximum,
    "Invalid backport input or scan report");
    const bytes = Buffer.alloc(maximum + 1);
    let size = 0;
    while (size < bytes.length) {
      const count = readSync(fd, bytes, size, bytes.length - size, null);
      if (count === 0) break;
      size += count;
    }
    assert.ok(size <= maximum, "Oversized backport input or scan report");
    return bytes.subarray(0, size);
  } finally { closeSync(fd); }
}

function boundedRead(relative, maximum = 1024 * 1024) {
  return readBoundedFile(path.join(root, relative), maximum);
}

export function verifyBackport(read = boundedRead) {
  const bytes = read("vendor/braces-backport.json");
  assert.equal(hash(bytes), expectedManifest, "Unreviewed backport manifest");
  const manifest = JSON.parse(bytes);
  for (const [filename, sha256] of Object.entries(manifest.files)) {
    assert.equal(hash(read(`vendor/braces/${filename}`)), sha256, `Altered backport source: ${filename}`);
  }
  const archive = read(manifest.archive);
  assert.equal(hash(archive), manifest.archiveSha256, "Altered backport archive");
  assert.equal(`sha512-${hash(archive, "sha512", "base64")}`, manifest.archiveIntegrity);
  const pkg = JSON.parse(read("package.json"));
  const lock = JSON.parse(read("package-lock.json", 4 * 1024 * 1024));
  assert.equal(pkg.devDependencies.braces, `file:${manifest.archive}`);
  assert.equal(pkg.overrides.braces, "$braces");
  assert.equal(pkg.dependencies.braces, undefined);
  assert.equal(lock.packages[""].devDependencies.braces, pkg.devDependencies.braces);
  const instances = Object.entries(lock.packages).filter(([name, value]) =>
    name.endsWith("node_modules/braces") || value.name === "braces");
  assert.equal(instances.length, 1, "Expected one locked braces instance");
  const [location, installed] = instances[0];
  assert.equal(location, "node_modules/braces");
  assert.equal(installed.version, "3.0.3");
  assert.equal(installed.dev, true);
  assert.equal(installed.link, undefined);
  assert.equal(installed.resolved, `file:${manifest.archive}`);
  assert.equal(installed.integrity, manifest.archiveIntegrity);
  return manifest;
}

export function fixedVex(manifest) {
  return {
    "@context": "https://openvex.dev/ns/v0.2.0",
    "@id": `https://github.com/NabiCook/paladinscat-frontend/security/braces-backport/${manifest.archiveSha256}`,
    author: "PaladinsCat maintainers",
    timestamp: "2026-10-16T12:00:00Z",
    version: 1,
    statements: [{
      vulnerability: { name: advisory },
      products: [{ "@id": purl }],
      status: "fixed",
      status_notes: `Fixed by reviewed depth-guard backport from micromatch/braces tree ${manifest.upstreamTree}; archive SHA256 ${manifest.archiveSha256}. Valid only after the source/lock/integrity guard succeeds. This is not an upstream fixed release.`,
    }],
  };
}

function inventory(report) {
  const npm = report.Results?.filter((result) => result.Type === "npm") ?? [];
  const packages = npm.flatMap((result) => result.Packages ?? []);
  assert.ok(packages.length > 0, "SCAN UNAVAILABLE: npm inventory is empty");
  const braces = packages.filter((pkg) => pkg.Name === "braces");
  assert.equal(braces.length, 1, "SCAN UNAVAILABLE: braces inventory missing or duplicated");
  assert.equal(braces[0].Version, "3.0.3");
  assert.equal(braces[0].Identifier?.PURL, purl);
  return npm.flatMap((result) => (result.Packages ?? []).map((pkg) =>
    JSON.stringify([result.Target, pkg.Name, pkg.Version, pkg.Identifier?.PURL]))).sort();
}

function findings(report) {
  return (report.Results ?? []).flatMap((result) => (result.Vulnerabilities ?? []).map((vuln) => ({
    target: result.Target, type: result.Type, vuln,
  })));
}

export function reviewReports(raw, adjudicated) {
  assert.deepEqual(inventory(adjudicated), inventory(raw), "SCAN UNAVAILABLE: package coverage changed");
  const key = (entry) => JSON.stringify(entry);
  const target = (entry) => entry.type === "npm" && entry.vuln.PkgName === "braces"
    && entry.vuln.InstalledVersion === "3.0.3" && entry.vuln.VulnerabilityID === advisory
    && entry.vuln.PkgIdentifier?.PURL === purl;
  const before = findings(raw);
  const after = findings(adjudicated);
  assert.deepEqual(after.map(key).sort(), before.filter((entry) => !target(entry)).map(key).sort(),
    "VEX must change only the exact reviewed braces advisory");
  const serious = after.filter((entry) => ["HIGH", "CRITICAL"].includes(entry.vuln.Severity));
  assert.equal(serious.length, 0, "HIGH/CRITICAL findings remain after the exact backport decision");
  return { packageCount: inventory(raw).length, fixedByBackport: before.filter(target).length,
    remainingFindings: after.length, highCritical: serious.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, destination, second] = process.argv.slice(2);
  if (command === "prepare" && destination && !second) {
    const manifest = verifyBackport();
    mkdirSync(destination, { recursive: true });
    writeFileSync(path.join(destination, "braces.fixed.openvex.json"), JSON.stringify(fixedVex(manifest), null, 2) + "\n");
    writeFileSync(path.join(destination, "backport-verification.json"), JSON.stringify({
      manifestSha256: expectedManifest, archiveSha256: manifest.archiveSha256,
      integrity: manifest.archiveIntegrity, purl, advisory,
    }, null, 2) + "\n");
    console.log("Exact reviewed braces backport verified.");
  } else if (command === "review" && destination && second && process.argv.length === 5) {
    verifyBackport();
    const readReport = (filename) => JSON.parse(readBoundedFile(filename, 32 * 1024 * 1024));
    console.log(JSON.stringify(reviewReports(readReport(destination), readReport(second))));
  } else {
    throw new Error("Expected prepare REPORT_DIRECTORY or review RAW_JSON ADJUDICATED_JSON");
  }
}
