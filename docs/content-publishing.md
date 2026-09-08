# Content publishing

Posts live in `src/content/blog/en/*.md` and publish at `/notes/<filename>`.
Category names are metadata, never URL segments. Speaking entries live in
`src/content/speaking/en/*.md` and publish at `/speaking/<filename>`.
Set `draft: true` to exclude an entry from production pages, Markdown, and RSS.

The one-time migration is reproducible with:

```sh
bun scripts/import-64notes.ts /path/to/64notes.com
```

It imports dated posts from `_posts`, `design/_posts`, and `podcast/_posts`,
and talks from this repository's `app/speaking/_posts`. Underscore-prefixed
drafts and the talk template stay excluded. It rejects slug collisions and
will not overwrite independently authored Markdown. The source manifest is
`src/data/legacy-import.json`. Local archive images are copied to
`static/media/64notes`. Historical external media URLs remain external;
their continued availability is not guaranteed by the import.

Agent entry points: `/llms.txt`, `/notes/<slug>.md`, `/speaking/<slug>.md`,
`/guides/<slug>.md`, `/sitemap.xml`, and `/rss.xml`.
The existing sitemap integration generates `/sitemap-index.xml` and its page
shards. `/sitemap.xml` lists the same generated shards.

## Proposed R2 + CDN deployment

Keep Markdown in Git. Generate HTML, Markdown endpoints, sitemap and RSS in
Astro's build. Use R2 for images/video, served through a bucket custom domain
such as `media.kingsidharth.com`. R2's `r2.dev` endpoint is for development;
a custom domain enables Cloudflare caching:
https://developers.cloudflare.com/r2/buckets/public-buckets/

Suggested CI order:

1. Install locked dependencies, validate content, build.
2. Upload media under content-hashed object keys to R2 via its S3 API.
3. Verify uploaded objects through the CDN domain.
4. Deploy the generated site referencing those object keys.
5. Check notes, speaking, Markdown, sitemap and RSS on the live hostname.

The media manifest must be generated before the page build so URLs are known.
Uploads may happen after the build, but must finish before deployment. Give
hashed objects `Cache-Control: public, max-age=31536000, immutable`. Retain
old objects for rollback. Do not upload or delete objects from an ordinary
local build. Keep bucket credentials in CI secrets.

Current implementation serves the imported 24 MB image directory locally.
No R2 bucket, CDN domain, deployment provider, or upload credentials are
configured by this migration. The GitHub workflow validates and packages the
site; deployment remains a separate step once those destinations are chosen.
