import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("missing official title shows an inline AI translation action before opening confirmation", () => {
  const source = readFileSync(join(process.cwd(), "app", "components", "bangumi-lens-app.tsx"), "utf8");

  assert.match(source, /className="hero-title-translation-action"/);
  assert.match(source, /onOpenAiConfirmation=\{openAiTitleTranslationConfirmation\}/);
  assert.match(source, /onOpenAiConfirmation=\{openAiSubjectTitleTranslationConfirmation\}/);

  const subjectNeedsAiBlock = source.slice(
    source.indexOf("if (payload.needsAiConfirmation)", source.indexOf("requestSubjectTitleTranslation")),
    source.indexOf("} catch (caught)", source.indexOf("requestSubjectTitleTranslation"))
  );
  const episodeNeedsAiBlock = source.slice(
    source.indexOf("if (payload.needsAiConfirmation)", source.indexOf("requestEpisodeTitleTranslation")),
    source.indexOf("} catch (caught)", source.indexOf("requestEpisodeTitleTranslation"))
  );

  assert.match(subjectNeedsAiBlock, /status: "needs-ai"/);
  assert.match(episodeNeedsAiBlock, /status: "needs-ai"/);
  assert.doesNotMatch(subjectNeedsAiBlock, /setPendingAiSubjectTitleTranslation/);
  assert.doesNotMatch(episodeNeedsAiBlock, /setPendingAiTitleTranslation/);
});

test("AI title translations are cached after explicit confirmation", () => {
  const episodeRoute = readFileSync(join(process.cwd(), "app", "api", "episode-translation", "route.ts"), "utf8");
  const subjectRoute = readFileSync(join(process.cwd(), "app", "api", "subject-translation", "route.ts"), "utf8");

  for (const source of [episodeRoute, subjectRoute]) {
    assert.match(source, /readServerCache<CachedTranslation>/);
    assert.match(source, /writeServerCache<CachedTranslation>/);
    assert.match(source, /AI_TRANSLATION_CACHE_MAX_AGE_MS = 30 \* 24 \* 60 \* 60 \* 1000/);
    assert.match(
      source,
      /const cached = await readServerCache<CachedTranslation>[\s\S]*?if \(!allowAi\)[\s\S]*?return NextResponse\.json\(\{ needsAiConfirmation: true \}\);/
    );
  }
});
