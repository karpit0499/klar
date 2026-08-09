# Desktop signing graduation

Klar v2.6 produces internal developer-preview artifacts. Application signing
does not replace the independent Ed25519 signature on every model package.

## Zero-budget internal path

- Build the macOS ARM64 ZIP and Windows x64 portable EXE only for
  owner-controlled testing.
- Label both **unsigned internal developer preview**. macOS uses only an ad-hoc
  signature; Windows has no trusted publisher identity.
- Expect Gatekeeper, SmartScreen, reputation, or publisher warnings.
- Publish an SHA-256 sidecar with the exact artifact, but understand that a hash
  proves file identity, not publisher identity.
- Never tell users to disable operating-system security globally.

This costs `0`, but it is not a trusted public distribution channel.

## macOS production graduation

For an ordinary individual, trusted direct distribution requires the Apple
Developer Program, currently **USD 99 per membership year** (local currency may
vary). A free Apple account cannot issue a Developer ID certificate. Apple fee
waivers are limited to eligible nonprofit legal entities, accredited
educational institutions, and government entities; individuals and sole
proprietors are not eligible.

When the fee becomes affordable or an eligible organization receives a waiver:

1. Enroll and complete identity verification.
2. In Keychain Access, create a Certificate Signing Request.
3. In Apple Developer Certificates, create **Developer ID Application**,
   download it, and install it in the login keychain.
4. In Keychain Access → My Certificates, expand the certificate and confirm it
   has an attached private key. Select both entries and export them as a
   password-protected `.p12` outside the repository, or use a protected signing
   keychain. Never commit or email either one.
5. Set protected CI secrets `CSC_LINK` and `CSC_KEY_PASSWORD`. Set `CSC_NAME`
   to the exact installed identity printed by:

   ```sh
   security find-identity -v -p codesigning
   ```

6. Sign in to App Store Connect as the Account Holder or an Admin. Open
   **Users and Access → Integrations → App Store Connect API**. Generate a team
   key with the least role Apple currently permits for notarization, record the
   Key ID and Issuer ID, and download the `AuthKey_….p8` private file. Apple
   offers that download only once. Store it outside the repository with mode
   `600`. If the API tab is unavailable, the current account role cannot create
   the key.
7. Place the trusted model-signing **public** key where packaging expects it.
   The file is deliberately untracked, so a fresh checkout never has it, and a
   build without it produces an application that opens no window. The private
   half stays outside the repository and is never packaged.

   ```sh
   KLAR_MODEL_PROD_KEY_DIR="$HOME/.klar-signing/model"
   mkdir -p "$KLAR_MODEL_PROD_KEY_DIR"
   chmod 700 "$KLAR_MODEL_PROD_KEY_DIR"
   if test ! -e "$KLAR_MODEL_PROD_KEY_DIR/klar-model-production-private.pem"; then
     openssl genpkey -algorithm ED25519 \
       -out "$KLAR_MODEL_PROD_KEY_DIR/klar-model-production-private.pem"
     openssl pkey \
       -in "$KLAR_MODEL_PROD_KEY_DIR/klar-model-production-private.pem" \
       -pubout \
       -out "$KLAR_MODEL_PROD_KEY_DIR/klar-model-production-public.pem"
   fi
   chmod 600 "$KLAR_MODEL_PROD_KEY_DIR/klar-model-production-private.pem"
   cp "$KLAR_MODEL_PROD_KEY_DIR/klar-model-production-public.pem" \
     desktop/resources/trust/model-signing-public.pem
   test -s desktop/resources/trust/model-signing-public.pem
   ```

   Packaging now stops with a named error if this key is absent.

8. Install the separately checksum-pinned Intel runtime because the production
   configuration builds both macOS architectures. Supply every protected value
   expected by the pinned builder and run the non-publishing validation build:

   ```sh
   node desktop/tools/install-runtime.mjs darwin-x64
   test -x "$PWD/desktop/vendor/darwin-arm64/llama-server"
   test -x "$PWD/desktop/vendor/darwin-x64/llama-server"

   export CSC_LINK="/absolute/private/path/klar-developer-id.p12"
   export CSC_NAME="Developer ID Application: YOUR LEGAL NAME (YOURTEAMID)"
   export APPLE_API_KEY="/absolute/private/path/AuthKey_YOURKEYID.p8"
   export APPLE_API_KEY_ID="YOURKEYID"
   export APPLE_API_ISSUER="YOUR-ISSUER-UUID"
   printf 'Certificate export password: '
   IFS= read -r -s CSC_KEY_PASSWORD
   export CSC_KEY_PASSWORD
   printf '\n'

   npm run desktop:dist:production
   ```

   Replace every uppercase placeholder with the values shown by Apple. The
   password prompt keeps the value out of shell history. If the builder says
   signing or notarization was skipped, stop; the artifact has not graduated.

9. Find the generated `.app` and verify every required property before any
   upload. The production override deliberately uses the public product name
   `Klar`; it must never inherit the preview name:

   ```sh
   codesign --verify --deep --strict --verbose=4 "release/desktop/mac-arm64/Klar.app"
   codesign -dv --verbose=4 "release/desktop/mac-arm64/Klar.app" 2>&1
   spctl --assess --type execute --verbose=4 "release/desktop/mac-arm64/Klar.app"
   xcrun stapler validate "release/desktop/mac-arm64/Klar.app"
   shasum -a 256 "release/desktop/Klar-2.6.0-mac-arm64.dmg" "release/desktop/Klar-2.6.0-mac-arm64.zip"
   ```

   The x64 unpacked app is `release/desktop/mac/Klar.app`; run the same four
   checks against it. Its public artifacts are
   `release/desktop/Klar-2.6.0-mac-x64.dmg` and
   `release/desktop/Klar-2.6.0-mac-x64.zip`.

10. In the `codesign -dv` output, require the expected `Authority=Developer ID
   Application: ...` and `TeamIdentifier=...`. Require `spctl` acceptance and a
   valid stapled notarization ticket. Missing credentials can make automation
   skip notarization, so a successful build command alone is never evidence.
10. Download the final artifact onto a clean Mac, verify its SHA-256, launch it,
    and rerun the packaged smoke test. Publish only after that evidence passes.

## Windows production graduation at zero budget

The current v2.6 preview output is a portable EXE; the held production
configuration targets NSIS. A self-signed certificate costs nothing but is
trusted only after every test machine explicitly installs it, so it remains an
internal-testing option.

Two possible public zero-cost routes require separate work:

1. **SignPath Foundation** offers free signing to accepted qualifying
   open-source projects. Klar's current `LICENSE` is source-available and All
   Rights Reserved, not OSI-approved, so Klar is **not currently eligible**.
   Changing the project license would be a separate owner/legal decision and is
   not assumed here. Even after such a change, acceptance would remain
   discretionary and also requires an existing release, maintained
   documentation, MFA, review/signing roles, a signing policy, reproducible
   automated builds, and manual release approval.
2. **Microsoft Store MSIX** onboarding currently has no registration fee and
   the Store signs submitted MSIX packages. Klar does not yet build or validate
   MSIX, so this is a future packaging workstream—not a checkbox for the current
   portable EXE. Store-submitted unpackaged EXE/MSI files still need the
   publisher's Authenticode signature.

If neither free route is approved, keep Windows internal. Azure Artifact
Signing Basic currently costs **USD 9.99/month** for 5,000 signatures, then
USD 0.005 per additional signature, and requires a paid Azure subscription.
Do not incur that cost while the project budget is zero.

For any future signed EXE, require both checks on a clean Windows machine:

```powershell
$artifact = ".\release\desktop\Klar-2.6.0-win-x64.exe"
$signature = Get-AuthenticodeSignature $artifact
$signature | Format-List Status, StatusMessage, SignerCertificate
if ($signature.Status -ne "Valid") { throw "Authenticode signature is not valid." }
signtool verify /pa /all /v $artifact
```

Then test installation/launch, update, rollback, and uninstall behavior and
verify the published SHA-256. Do not publish merely because a signing command
returned exit code zero.

## Official references

- https://developer.apple.com/help/account/membership/program-enrollment
- https://developer.apple.com/help/account/membership/fee-waivers
- https://developer.apple.com/help/account/certificates/create-developer-id-certificates/
- https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution
- https://www.electron.build/code-signing.html
- https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options
- https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/open-a-developer-account
- https://signpath.org/
- https://learn.microsoft.com/en-us/azure/artifact-signing/how-to-change-sku
