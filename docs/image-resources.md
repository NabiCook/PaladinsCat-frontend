# Image resource composition

Artwork, fonts, draft image files, design screenshots and source attribution belong to the private `NabiCook/paladinscat-frontend-images` repository. This code repository pins its `frontend` variant in `frontend-images.lock.json`.

Clone the private repository beside the frontend, check out the lock's exact commit, then run `npm ci` and `npm run dev` or `npm run build`. `PALADINSCAT_FRONTEND_IMAGES_ROOT` can name another authorized checkout or immutable export. The preparation hook validates the manifest digest, commit when Git metadata is present, every file hash, path confinement and byte size. It materializes ignored build inputs at their original paths. Local artwork edits require preservation before updating a managed output.

```sh
npm run prepare-images
npm run check:code-only
npm run test:resource-inputs
docker build --build-context frontend-images=../paladinscat-frontend-images -t paladinscat-frontend .
```

Docker's `resources` target validates and assembles the same input. The builder compiles with those resources; the final runtime copies the assembled `public/` into the same application container. Authentication stays in checkout/operator tooling and never enters Dockerfile arguments or runtime layers.

CI uses the read-only `FRONTEND_IMAGES_DEPLOY_KEY` Actions secret to check out the lock's exact commit. The code-boundary and integrity tests run for fork pull requests without private-resource access. Full resource builds run for owner-controlled refs; maintainers perform those checks before merging a contributor change.

Update resources in their private repository first. Commit the reviewed resource manifest, update this frontend's commit/digest lock, then verify both variants through their own build paths. Preserve AVIF/original fallbacks, animated WebP/PNG loading-frame behavior and native vectors. Served URLs, user uploads and provider media keep their existing runtime contracts. Repository privacy controls source access; deployed artwork remains browser-accessible.

Existing public Git history is preserved by owner decision. The code-only guard applies to current/future source trees, including artwork added outside `public/`.
