import io
from pathlib import Path
import sys
import subprocess
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from full_history_credential_boundary import credential_in_blob, path_gate, scan


class HistoryChecks(unittest.TestCase):
    def test_credentials_split_across_chunks_are_detected_without_output(self):
        value = b"prefix " + b"github_pat_" + b"a" * 25 + b" suffix"
        self.assertTrue(credential_in_blob(io.BytesIO(value), len(value), 7))
        plain = b"documentation and ordinary Git metadata"
        self.assertFalse(credential_in_blob(io.BytesIO(plain), len(plain), 7))

    def test_truncated_object_never_passes(self):
        with self.assertRaises(ValueError): credential_in_blob(io.BytesIO(b"truncated"), 100)

    def test_historical_templates_and_nested_secret_boundary(self):
        for path in (".env.example", "docs/secrets/README.md"):
            path_gate(path)
        for path in ("local/runtime/account", "a/env/backend.conf", "a/private.key", "a/.env.prod", "a/.env.production.example"):
            with self.assertRaises(ValueError): path_gate(path)

    def history_with_rename(self, root, original):
        def git(*args):
            subprocess.run(["git", "-C", str(root), "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", *args],
                           check=True, capture_output=True, timeout=10)
        git("init")
        source = root / original
        source.parent.mkdir(parents=True, exist_ok=True)
        source.write_text("Ordinary fixture text\n", encoding="utf-8")
        git("add", ".")
        git("commit", "-m", "fixture: original path")
        git("mv", original, "renamed.txt")
        git("commit", "-m", "fixture: rename")

    def test_renamed_safe_history_passes_the_complete_scan(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.history_with_rename(root, "original.txt")
            self.assertEqual(scan(root)["status"], "FULL_HISTORY_CREDENTIAL_BOUNDARY=PASS")

    def test_renamed_historical_secret_path_still_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.history_with_rename(root, ".env.prod")
            with self.assertRaisesRegex(ValueError, r"credential-bearing historical path: \.env\.prod"):
                scan(root)


if __name__ == "__main__": unittest.main()
